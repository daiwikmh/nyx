# Shadow Warden CLOB

**Polkadot Hackathon — Track 2: PVM**

An autonomous, risk-managed Central Limit Order Book (CLOB) that moves heavy computation into a Rust/PVM engine while using Solidity for user settlement and native Polkadot precompiles for yield.

---

## Table of Contents

- [Why This Architecture](#why-this-architecture)
- [High-Level Diagram](#high-level-diagram)
- [Components](#components)
  - [1. PVM Risk & Matching Engine (Rust)](#1-pvm-risk--matching-engine-rust)
  - [2. Settlement Manager (Solidity)](#2-settlement-manager-solidity)
  - [3. Native Precompiles](#3-native-precompiles)
- [Order Lifecycle](#order-lifecycle)
- [Volatility Guard](#volatility-guard)
- [Yield Logic](#yield-logic)
- [ABI Reference](#abi-reference)
- [Addresses (Paseo Testnet)](#addresses-paseo-testnet)
- [Project Structure](#project-structure)
- [Build & Deploy](#build--deploy)
- [PVM Deployment Model](#pvm-deployment-model)
- [Design Decisions & Trade-offs](#design-decisions--trade-offs)

---

## Why This Architecture

Traditional on-chain CLOBs are bottlenecked by the EVM's gas model and sequential execution. By splitting the system into two layers we get the best of both worlds:

| Layer | Runtime | Responsibility |
|---|---|---|
| **Engine** | Rust / PVM (RISC-V) | High-performance matching logic, volatility guard, pure math |
| **Manager** | Solidity / PVM | User-facing deposits, settlement, escrow, yield |

The Rust engine runs as a native RISC-V binary inside PolkaVM. It has no persistent storage and does no I/O — it receives calldata, runs deterministic math, and returns a result. This keeps it fast, auditable, and testable off-chain with plain `cargo test`.

---

## High-Level Diagram

```
  Off-Chain Keeper App
       |
       | placeLimitOrder(side, price, qty)
       |  + updateBookState(bestBid, bestAsk, liquidity)
       v
 ┌─────────────────────────────────────────────────────┐
 │              WardenCLOB.sol  (Solidity/PVM)         │
 │                                                     │
 │  1. Escrow user funds (DOT or USDC)                 │
 │  2. Call IEngine.matchOrder(...)        ──────────► │──► Rust PVM Engine
 │  3. Settle filled portion                           │◄── (filledAmt, remainingAmt)
 │  4. Rest unfilled portion on book                   │
 │  5. Stake idle DOT for yield            ──────────► │──► Staking Precompile
 └─────────────────────────────────────────────────────┘
          ▲                         ▲
          │ USDC transferFrom       │ DOT (msg.value)
     0x...0539                  native
   (Asset ID 1337)
```

---

## Components

### 1. PVM Risk & Matching Engine (Rust)

**File:** `engine/src/lib.rs`
**Target:** `riscv64emac-unknown-none-polkavm`
**Crate type:** `cdylib` (exports `call` and `deploy` C symbols)

The engine is a stateless `no_std` Rust binary compiled to PolkaVM bytecode. Every invocation is a fresh execution — no storage, no side effects.

#### Entry Point

```
PolkaVM calls:  extern "C" fn call()
```

The `call()` function:

1. Reads the 164-byte ABI calldata via `HostFnImpl::input()`
2. Verifies the 4-byte selector matches `matchOrder(uint8,uint256,uint256,uint256,uint256)`
3. Decodes 5 arguments from ABI-encoded big-endian uint256 slots
4. Runs the **volatility guard**
5. Runs the **matching logic**
6. ABI-encodes `(uint256 filledAmount, uint256 remainingAmount)` into 64 bytes
7. Returns via `HostFnImpl::return_value(ReturnFlags::empty(), &output)`

#### Calldata Layout

```
Offset  Size   Field
------  ----   -----
0       4      Function selector  (keccak256 of matchOrder signature, first 4 bytes)
4       32     side               (uint8, ABI-padded: 0 = Buy, 1 = Sell)
36      32     price              (uint256, 6-decimal USD fixed-point)
68      32     quantity           (uint256, asset base units)
100     32     bestOppositePrice  (uint256, 6-decimal USD fixed-point)
132     32     availableLiquidity (uint256, asset base units)
                                  Total: 164 bytes
```

#### Return Data Layout

```
Offset  Size   Field
------  ----   -----
0       32     filledAmount    (uint256)
32      32     remainingAmount (uint256)
                               Total: 64 bytes
```

#### Host Functions Used

| Function | Purpose |
|---|---|
| `HostFnImpl::input(&mut &mut [u8])` | Reads calldata into a buffer; shrinks the slice to the actual length |
| `HostFnImpl::return_value(ReturnFlags, &[u8]) -> !` | Terminates execution and returns data to the caller |

`ReturnFlags::empty()` = success. `ReturnFlags::REVERT` = revert (rolls back state).

---

### 2. Settlement Manager (Solidity)

**File:** `contract/contracts/WardenCLOB.sol`

The Solidity contract is the user-facing layer. It holds escrow, maintains the minimal on-chain book state needed for engine calls, triggers settlement, and routes idle capital to yield.

#### Roles

| Role | Holder | Permissions |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | Deployer | `setEngine`, `setStakingPoolId` |
| `KEEPER_ROLE` | Keeper app | `updateBookState`, `stakeIdle` |
| *(any address)* | Users | `placeLimitOrder`, `cancelOrder` |

#### State

```
engineAddress       address   — Rust PVM engine instance (set after upload)
stakingPoolId       uint256   — Nomination pool for yield (default: 1)

bestBid             uint256   — Highest active buy price (6-decimal USD)
bestAsk             uint256   — Lowest active sell price (6-decimal USD)
liquidityAtBid      uint256   — Volume available at bestBid
liquidityAtAsk      uint256   — Volume available at bestAsk

orders              mapping(uint256 => Order)
nextOrderId         uint256
totalDOTLocked      uint256   — DOT committed to active sell orders
totalUSDCLocked     uint256   — USDC committed to active buy orders
```

#### Key Functions

```solidity
// User: place a limit order
function placeLimitOrder(uint8 side, uint256 price, uint256 quantity) external payable

// User: cancel a resting order and reclaim funds
function cancelOrder(uint256 orderId) external

// Keeper: update the book's best prices before placing orders
function updateBookState(
    uint256 newBestBid,
    uint256 newBestAsk,
    uint256 newLiquidityAtBid,
    uint256 newLiquidityAtAsk
) external onlyRole(KEEPER_ROLE)

// Admin: wire the uploaded Rust engine
function setEngine(address engine) external onlyRole(DEFAULT_ADMIN_ROLE)
```

---

### 3. Native Precompiles

Both precompiles are called directly from Solidity as standard contract addresses.

#### USDC Precompile — `0x0000000000000000000000000000000000000539`

Asset ID 1337 (Native USDC on Asset Hub) is exposed as an ERC-20 interface.

```solidity
// User approves WardenCLOB, then:
IERC20(USDC).transferFrom(msg.sender, address(this), cost);  // deposit
IERC20(USDC).transfer(user, usdcOut);                        // settlement payout
```

#### Staking Precompile — `0x0000000000000000000000000000000000000804`

Nomination Pool join — bonds idle DOT into a yield-bearing pool.

```solidity
interface IStaking {
    function join(uint256 amount, uint256 poolId) external;
}
IStaking(STAKING).join(idleDOT, stakingPoolId);
```

---

## Order Lifecycle

```
User calls placeLimitOrder(side=0 [Buy], price=8_000_000, quantity=100)
│
├── 1. Escrow
│       cost = price × quantity / 1e6  (USDC)
│       IERC20(USDC).transferFrom(user, vault, cost)
│       totalUSDCLocked += cost
│
├── 2. Register order  (orders[id] = Order{...})
│
├── 3. Call PVM engine
│       IEngine(engine).matchOrder(
│           side=0, price=8_000_000, qty=100,
│           bestOppositePrice=bestAsk, availableLiquidity=liquidityAtAsk
│       )
│       → engine returns (filledAmount=80, remainingAmount=20)
│
├── 4. Settle filled portion
│       Send 80 DOT to buyer
│       Release proportional USDC from locked balance
│
├── 5. Rest unfilled portion
│       orders[id].filled = 80
│       orders[id].active = true   (20 units still resting)
│
└── 6. Stake idle DOT
        idle = address(this).balance - totalDOTLocked
        IStaking(STAKING).join(idle, poolId)
```

---

## Volatility Guard

The engine rejects any order whose price is **≥ 10% away** from a hard-coded oracle baseline. This prevents flash-loan attacks from placing fills at manipulated prices.

```
ORACLE_BASELINE = 8_000_000   ($8.00 per DOT, 6-decimal)
MAX_DEVIATION   = 10%

deviation = |orderPrice - baseline| × 100 / baseline

if deviation >= 10  →  REVERT
```

**Integer-division boundary:** The check uses `>=` (not `>`). Because integer division truncates, a price of `$8.79` gives `deviation = 9` (passes) while `$8.80` gives `deviation = 10` (rejected). This makes the boundary crisp and predictable.

| Price | Deviation | Result |
|---|---|---|
| $8.00 | 0% | Pass |
| $8.79 | 9% (truncated) | Pass |
| $8.80 | 10% | **Reject** |
| $7.20 | 10% | **Reject** |
| $7.21 | 9% (truncated) | Pass |

**To update the baseline:** change `ORACLE_BASELINE` in `engine/src/lib.rs` and redeploy the engine binary.

---

## Yield Logic

Any DOT held by the vault that is not committed to an active sell order is **idle capital**. After every `placeLimitOrder` call, idle DOT is automatically staked:

```
idleDOT = address(this).balance - totalDOTLocked
if idleDOT > 0:
    IStaking(STAKING).join(idleDOT, stakingPoolId)
```

This ensures the vault is always earning nomination pool rewards on capital that is not actively being used for settlement.

---

## ABI Reference

### IEngine

```solidity
function matchOrder(
    uint8   side,               // 0 = Buy, 1 = Sell
    uint256 price,              // 6-decimal USD (e.g. 8_000_000 = $8.00)
    uint256 quantity,           // asset base units
    uint256 bestOppositePrice,  // best ask (for buy) or best bid (for sell), 0 if empty
    uint256 availableLiquidity  // volume at bestOppositePrice
) external returns (
    uint256 filledAmount,       // immediately matched quantity
    uint256 remainingAmount     // unfilled, to be rested
);
```

### WardenCLOB (main functions)

```solidity
function placeLimitOrder(uint8 side, uint256 price, uint256 quantity) external payable
function cancelOrder(uint256 orderId) external
function updateBookState(uint256 bestBid, uint256 bestAsk, uint256 liqAtBid, uint256 liqAtAsk) external
function setEngine(address engine) external
function stakeIdle() external
```

---

## Addresses (Paseo Testnet)

| Contract | Address |
|---|---|
| Native USDC (Asset ID 1337) | `0x0000000000000000000000000000000000000539` |
| Staking Precompile | `0x0000000000000000000000000000000000000804` |
| PVM Engine | **TBD** — set via `WardenCLOB.setEngine()` after upload |

---

## Project Structure

```
polka/
├── build.sh                        — Full build: test → compile Solidity → link PVM blob
│
├── contract/                       — Hardhat project (Solidity / PVM)
│   ├── hardhat.config.ts           — @parity/hardhat-polkadot, resolc, network config
│   ├── contracts/
│   │   ├── IEngine.sol             — matchOrder interface (implemented by Rust engine)
│   │   └── WardenCLOB.sol          — Settlement manager, yield logic, order book state
│   ├── ignition/                   — Hardhat Ignition deployment modules
│   └── test/
│
└── engine/                         — Rust PVM engine
    ├── Cargo.toml                  — cdylib, alloy-sol-types, pallet-revive-uapi
    └── src/
        └── lib.rs                  — Matching engine, volatility guard, 14 unit tests
```

---

## Build & Deploy

### Prerequisites

```bash
# Rust toolchain with PolkaVM target
rustup target add riscv64emac-unknown-none-polkavm

# polkavm-linker (ELF → .polkavm blob)
cargo install polkavm-linker

# resolc (Solidity → PVM)
npm i -g @parity/resolc

# Node dependencies
cd contract && npm install
```

### Build everything

```bash
./build.sh
```

This runs:
1. `cargo test` — 14 unit tests on the host
2. `npx hardhat compile` — Solidity → PVM artifacts
3. `cargo build --release --target riscv64emac-unknown-none-polkavm`
4. `polkavm-linker ... -o engine/engine.polkavm`

### Partial builds

```bash
./build.sh --sol-only    # only Solidity
./build.sh --rust-only   # only Rust engine (including tests)
```

### Deploy

**Step 1 — Upload the PVM engine binary**

```bash
# Using polkadot.js or a Hardhat task:
# Upload engine/engine.polkavm to the chain.
# Note the instantiation address.
```

**Step 2 — Deploy WardenCLOB**

```bash
cd contract
npx hardhat run scripts/deploy.ts --network polkadotHubTestnet
```

**Step 3 — Wire the engine**

```solidity
WardenCLOB.setEngine(<engine instantiation address>)
```

**Step 4 — Keeper setup**

The keeper app calls `updateBookState()` before each `placeLimitOrder` to keep the on-chain best-bid/ask current.

---

## PVM Deployment Model

PVM uses a **two-step deployment** model, unlike the EVM's single-transaction approach:

```
Step 1 — Code Upload
    Upload compiled bytecode to the chain.
    Chain stores it under its code hash.

Step 2 — Instantiation
    Create a contract instance referencing the stored code hash.
    Constructor runs. Contract gets an address.
```

Both the Rust engine and the Solidity manager follow this model. The `resolc` compiler handles it automatically for Solidity. For the Rust engine, `polkavm-linker` produces the `.polkavm` blob that is uploaded in step 1.

---

## Design Decisions & Trade-offs

### Keeper-submitted prices (no oracle)

Rather than depend on an oracle precompile whose ABI may change between runtime upgrades, the keeper app submits prices directly. This makes the system:
- **Simpler to audit** — the price path is explicit and on-chain visible
- **Easier to test** — no oracle mock needed
- **Upgradeable** — swap in an oracle later by changing only `executeSafetyCheck`

The trade-off is that the keeper is a trusted role. For production, a decentralised oracle or multi-sig keeper committee would reduce this trust assumption.

### Stateless Rust engine

The engine holds no state between calls. The Solidity contract is the single source of truth for the order book. This means:
- The engine is a pure function: easy to test, audit, and upgrade independently
- The on-chain book state (bestBid, bestAsk, liquidity) must be kept current by the keeper
- Full order-book depth is managed off-chain; only the best level is submitted per call

For a production system, storage host functions (`HostFnImpl::set_storage` / `get_storage`) could be used to persist order-book state inside the engine itself.

### Integer arithmetic throughout

No floating-point operations. All prices use 6-decimal fixed-point integers:

```
$8.00  →  8_000_000
$1.00  →  1_000_000
```

This is deterministic across all architectures, avoids RISC-V soft-float overhead, and matches the denomination of Native USDC (6 decimals).
