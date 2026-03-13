# Shadow Warden CLOB — Architecture & Build Guide

## Overview

Shadow Warden CLOB is a **decentralized Central Limit Order Book** built for **Polkadot Hub (Asset Hub)** using the **PolkaVM (PVM)** runtime. It combines a Solidity settlement manager with a Rust-based matching engine, both running as PVM smart contracts on-chain.

The system is designed for the **Polkadot Track 2 Hackathon** and targets the **Paseo Asset Hub Testnet**.

---

## Architecture Diagram

```
                         +---------------------+
                         |       User/dApp     |
                         +----------+----------+
                                    |
                     placeLimitOrder(side, price, qty)
                                    |
                                    v
                 +------------------+------------------+
                 |         WardenCLOB.sol (PVM)        |
                 |         Settlement Manager          |
                 |  0x84e5...1710 (Paseo Testnet)      |
                 |                                     |
                 |  1. Escrow user funds (DOT/USDC)    |
                 |  2. Call engine for matching -----+  |
                 |  4. Settle filled portions        |  |
                 |  5. Stake idle DOT for yield      |  |
                 +-----------------+----------------+  |
                                   |                   |
                                   v                   |
                 +-----------------+-----------------+  |
                 |   Rust PVM Engine (engine.polkavm)|  |
                 |   0x7CB0...F73C (Paseo Testnet)  |<-+
                 |                                   |
                 |  matchOrder(side, price, qty,     |
                 |             bestOpposite,         |
                 |             availableLiquidity)    |
                 |                                   |
                 |  - Volatility guard (10% band)    |
                 |  - Price-priority matching         |
                 |  - Returns (filled, remaining)     |
                 +-----------------------------------+

                            Precompiles
                 +-----------------------------------+
                 | USDC (Asset ID 1337)              |
                 | 0x0000...0539                     |
                 +-----------------------------------+
                 | Staking (Nomination Pools)        |
                 | 0x0000...0804                     |
                 +-----------------------------------+
```

---

## Deployed Addresses (Paseo Asset Hub Testnet)

| Contract | Address | Deployer |
|---|---|---|
| **WardenCLOB** (Solidity) | `0x84e57567758B1143BD285eED2cbD574187a1D710` | `0x445bf5fe58f2Fe5009eD79cFB1005703D68cbF85` |
| **Rust PVM Engine** | `0x7CB0F309f7501C8458a0C98804699706cE33F73C` | `0x445bf5fe58f2Fe5009eD79cFB1005703D68cbF85` |
| USDC Precompile (Asset 1337) | `0x0000000000000000000000000000000000000539` | System |
| Staking Precompile (Nom. Pools) | `0x0000000000000000000000000000000000000804` | System |

**Network:** Paseo Asset Hub Testnet
**RPC (Ethereum JSON-RPC):** `https://eth-rpc-testnet.polkadot.io/`

---

## Project Structure

```
polka/
├── ARCHITECTURE.md              ← This file
├── build.sh                     ← Full build script (tests + compile + link)
│
├── engine/                      ← Rust PVM Matching Engine
│   ├── src/
│   │   └── lib.rs               ← Core matching logic, volatility guard, PVM entry points
│   ├── Cargo.toml               ← Dependencies: alloy-sol-types, pallet-revive-uapi, polkavm-derive
│   ├── rust-toolchain.toml      ← Pins Rust nightly
│   ├── .cargo/config.toml       ← RUST_TARGET_PATH + riscv64 rustflags
│   ├── riscv64emac-unknown-none-polkavm.json  ← Custom target spec (from polkatool 0.29.0)
│   └── engine.polkavm           ← Compiled blob (2937 bytes, blob version 0x00)
│
├── contract/                    ← Hardhat project (Solidity → PVM via resolc)
│   ├── contracts/
│   │   ├── IEngine.sol          ← Interface for the Rust engine
│   │   ├── WardenCLOB.sol       ← Settlement manager (main contract)
│   │   └── MyToken.sol          ← ERC20 (unused for CLOB)
│   ├── scripts/
│   │   ├── deploy.ts            ← Deploys WardenCLOB via ethers.js
│   │   └── deploy-engine.ts     ← Deploys engine blob + calls setEngine()
│   ├── ignition/modules/
│   │   └── WardenCLOB.ts        ← Hardhat Ignition module (alternative deploy)
│   ├── hardhat.config.ts        ← resolc 0.3.0, PVM target, network configs
│   └── package.json             ← @parity/hardhat-polkadot, resolc
```

---

## Component Details

### 1. Rust PVM Engine (`engine/src/lib.rs`)

The matching engine is a **no_std Rust program** compiled to RISC-V 64-bit and linked into a `.polkavm` blob. It runs natively on the PolkaVM runtime — not inside an EVM interpreter.

#### Entry Points

Two functions are exported via `#[polkavm_derive::polkavm_export]`:

| Function | Purpose |
|---|---|
| `deploy()` | Called once during contract instantiation. No-op (no constructor state). |
| `call()` | Called on every transaction. Reads calldata, decodes ABI, runs matching logic, returns result. |

#### Call Flow (`call()`)

```
1. HostFnImpl::call_data_size()       → get calldata length
2. HostFnImpl::call_data_copy()       → read calldata into buffer
3. Check 4-byte selector              → must match matchOrder(uint8,uint256,uint256,uint256,uint256)
4. Decode 5 ABI arguments             → side, price, quantity, bestOppositePrice, availableLiquidity
5. Validate                           → price > 0, quantity > 0
6. is_outside_band(price)             → volatility guard: reject if |price - $8.00| >= 10%
7. match_order(...)                   → price-priority matching logic
8. ABI-encode (filled, remaining)     → write 64-byte return data
9. HostFnImpl::return_value()         → return to caller (or REVERT on failure)
```

#### Volatility Guard

Protects against flash-loan price manipulation:

- **Baseline:** DOT = $8.00 = `8_000_000` (6-decimal fixed point)
- **Band:** +/- 10% → valid range: `7_200_001` to `8_799_999`
- **Formula:** `abs_diff * 100 / baseline >= 10` → revert
- Orders at exactly 10% deviation are **rejected** (uses `>=`)

#### Matching Logic

```
Buy  (side=0): fills if orderPrice >= bestAsk (best opposite price)
Sell (side=1): fills if orderPrice <= bestBid (best opposite price)

filledAmount    = min(quantity, availableLiquidity)
remainingAmount = quantity - filledAmount
```

If conditions aren't met (e.g., bid below ask, empty book), returns `(0, quantity)`.

#### ABI

Selector: `matchOrder(uint8,uint256,uint256,uint256,uint256)` — 4-byte Keccak prefix, auto-generated by `alloy-sol-types`.

| Offset | Field | Type | Size |
|---|---|---|---|
| 0-3 | selector | bytes4 | 4 bytes |
| 4-35 | side | uint256 (padded uint8) | 32 bytes |
| 36-67 | price | uint256 | 32 bytes |
| 68-99 | quantity | uint256 | 32 bytes |
| 100-131 | bestOppositePrice | uint256 | 32 bytes |
| 132-163 | availableLiquidity | uint256 | 32 bytes |

**Total calldata:** 164 bytes

**Return data:** 64 bytes → `(uint256 filledAmount, uint256 remainingAmount)`

#### Key Dependencies

| Crate | Version | Purpose |
|---|---|---|
| `alloy-sol-types` | 0.7, no_std | ABI selector generation at compile time |
| `pallet-revive-uapi` | 0.10.1, no_std | PVM host function bindings (riscv64) |
| `polkavm-derive` | 0.29.0 | `#[polkavm_export]` macro for entry points |

#### Memory

A **bump allocator** provides a 64KB heap for `alloy-primitives` (which requires `alloc`). It never frees — acceptable for short-lived PVM calls.

---

### 2. WardenCLOB (`contract/contracts/WardenCLOB.sol`)

The Solidity settlement manager handles user-facing operations. Compiled to PVM bytecode via `resolc` (not standard EVM).

#### Roles

| Role | Purpose |
|---|---|
| `DEFAULT_ADMIN_ROLE` | Set engine address, configure staking pool |
| `KEEPER_ROLE` | Update book state (best bid/ask, liquidity) |

#### Core Flow: `placeLimitOrder(side, price, quantity)`

```
1. Validate inputs (engine set, price > 0, valid side)
2. Escrow funds:
   - Buy:  transferFrom USDC from user → contract
   - Sell: require msg.value == quantity (DOT)
3. Register order in on-chain mapping
4. Call IEngine(engineAddress).matchOrder(...)   ← CROSS-CONTRACT CALL TO RUST ENGINE
5. If filled > 0: settle (transfer DOT/USDC to counterparty)
6. Update order state (filled amount, active flag)
7. Stake idle DOT into Nomination Pool for yield
```

#### Cross-Contract Call (Solidity → Rust)

```solidity
// WardenCLOB.sol line 203-210
(uint256 filledAmount, uint256 remainingAmount) =
    IEngine(engineAddress).matchOrder(
        side,
        price,
        quantity,
        bestOpposite,
        liquidity
    );
```

This is a standard Solidity external call. The PVM runtime routes it to the Rust engine at `0x7CB0...F73C`. The engine reads calldata via `HostFnImpl::call_data_copy()`, processes it, and returns ABI-encoded results via `HostFnImpl::return_value()`.

#### Settlement

| Order Type | On Fill | Mechanism |
|---|---|---|
| Buy fill | Buyer receives DOT | `address.call{value: amount}("")` |
| Sell fill | Seller receives USDC | `IERC20(USDC).transfer(seller, amount)` |

#### Yield on Idle DOT

After every order placement, `_stakeIdle()` calculates:

```
idle = address(this).balance - totalDOTLocked
```

If `idle > 0`, it calls the **Staking Precompile** (`0x0804`) to join a Nomination Pool:

```solidity
IStaking(STAKING).join(idle, stakingPoolId);
```

#### Other Functions

| Function | Access | Purpose |
|---|---|---|
| `setEngine(address)` | Admin | Wire Rust engine after deployment |
| `setStakingPoolId(uint256)` | Admin | Configure nomination pool |
| `updateBookState(...)` | Keeper | Update best bid/ask + liquidity |
| `cancelOrder(uint256)` | Order owner | Cancel and refund escrowed funds |
| `stakeIdle()` | Keeper | Manual yield trigger |

---

### 3. IEngine Interface (`contract/contracts/IEngine.sol`)

Defines the ABI boundary between Solidity and Rust:

```solidity
interface IEngine {
    function matchOrder(
        uint8   side,
        uint256 price,
        uint256 quantity,
        uint256 bestOppositePrice,
        uint256 availableLiquidity
    ) external returns (uint256 filledAmount, uint256 remainingAmount);
}
```

Both the Solidity contract and the Rust engine implement this exact function signature. The `sol!` macro in Rust generates the matching selector at compile time.

---

## Build Process

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Rust (nightly) | latest | `rustup install nightly` |
| rust-src | - | `rustup component add rust-src --toolchain nightly` |
| polkatool | **0.29.0** | `cargo install polkatool --version 0.29.0` |
| Node.js | 18+ | - |
| Hardhat + resolc | 0.3.0 | `npm install` in `contract/` |

### Version Alignment (Critical)

The PolkaVM blob format has a **version byte** at offset 4 of the binary. The Paseo testnet runtime accepts **blob version `0x00`** only.

| Component | Required Version | Blob Version |
|---|---|---|
| `polkavm-derive` (Rust crate) | 0.29.0 | - |
| `polkatool` (linker CLI) | 0.29.0 | **0x00** |
| `resolc` (Solidity compiler) | 0.3.0 | **0x00** |
| `polkatool` 0.30.0+ | DO NOT USE | 0x02 (rejected) |

### Full Build (`./build.sh`)

```bash
./build.sh              # Build everything
./build.sh --sol-only   # Solidity only
./build.sh --rust-only  # Rust engine only
```

#### Step 1: Rust Unit Tests

```bash
cd engine/
cargo test    # Runs 14 tests on host (x86_64 with std)
```

Tests are gated with `#[cfg(test)]` — PVM-specific code (`no_std`, `no_main`, host functions) is excluded during testing.

#### Step 2: Solidity Compilation (resolc → PVM)

```bash
cd contract/
npx hardhat compile
```

The `@parity/hardhat-polkadot-resolc` plugin invokes `resolc 0.3.0` to compile `.sol` files to PVM bytecode. Artifacts are written to `contract/artifacts/`.

#### Step 3: Rust Engine → .polkavm Blob

```bash
cd engine/

# Cross-compile to RISC-V 64-bit for PolkaVM
RUST_TARGET_PATH="$PWD" cargo +nightly build --release \
  --target riscv64emac-unknown-none-polkavm \
  -Z build-std=core,alloc \
  -Z build-std-features=compiler-builtins-mem

# Link ELF → .polkavm blob
polkatool link target/riscv64emac-unknown-none-polkavm/release/shadow_warden_engine.elf \
  -o engine.polkavm
```

#### Verify Blob Version

```bash
hexdump -C engine.polkavm | head -n 1
# Expected: 50 56 4d 00 00 ...
#                       ^^ must be 00
```

---

## Deployment Process

### Step 1: Deploy WardenCLOB (Solidity)

```bash
cd contract/
npx ts-node scripts/deploy.ts
```

**What happens:**
1. Loads compiled PVM bytecode from `artifacts/contracts/WardenCLOB.sol/WardenCLOB.json`
2. Creates a `ContractFactory` with ethers.js
3. Sends deployment transaction via ETH JSON-RPC adapter (`https://eth-rpc-testnet.polkadot.io/`)
4. The adapter translates it to `pallet_revive::instantiate_with_code`
5. Returns deployed contract address

### Step 2: Deploy Engine + Wire (`deploy-engine.ts`)

```bash
cd contract/
npx ts-node scripts/deploy-engine.ts
```

**What happens:**
1. Reads `engine.polkavm` blob (2937 bytes)
2. Sends raw blob as transaction data (no `to` address → deployment)
3. The ETH-RPC adapter calls `pallet_revive::instantiate_with_code` with the PVM blob
4. Reads the WardenCLOB ABI artifact
5. Calls `WardenCLOB.setEngine(engineAddress)` to wire the two contracts together

---

## How Calls Flow End-to-End

### Example: User places a Buy order for 100 DOT at $8.00

```
User → tx: WardenCLOB.placeLimitOrder(0, 8_000_000, 100)
       with USDC approval for 800 USDC (8.00 * 100)

1. [WardenCLOB] Validates side=0, price=8000000, qty=100
2. [WardenCLOB] transferFrom(user, contract, 800 USDC) → escrow
3. [WardenCLOB] Registers order #N in mapping
4. [WardenCLOB] Reads bestAsk=7_900_000, liquidityAtAsk=80
5. [WardenCLOB] → IEngine(0x7CB0...).matchOrder(0, 8000000, 100, 7900000, 80)
   │
   ├── [PVM Engine] call_data_copy() reads 164-byte calldata
   ├── [PVM Engine] Selector check → matches matchOrder
   ├── [PVM Engine] is_outside_band(8000000) → false (within 10% of $8.00)
   ├── [PVM Engine] match_order(0, 8000000, 100, 7900000, 80)
   │   └── Buy: 8000000 >= 7900000 → fills. min(100, 80) = 80 filled, 20 remaining
   └── [PVM Engine] return_value([80, 20] as ABI-encoded uint256 pair)
   │
6. [WardenCLOB] filledAmount=80, remainingAmount=20
7. [WardenCLOB] _settle(orderId, 80) → sends 80 DOT to user
8. [WardenCLOB] orders[N].filled = 80, active = true (20 unfilled)
9. [WardenCLOB] _stakeIdle() → stakes any idle DOT into Nomination Pool
```

---

## PVM-Specific Design Decisions

### Why Two Contracts?

PVM doesn't support runtime code generation or `EXTCODECOPY`. The matching engine needs complex logic (volatility guard, price comparison, ABI encoding) that benefits from Rust's type system and performance. Solidity handles the settlement layer with familiar ERC20/access-control patterns.

### `#[polkavm_derive::polkavm_export]` vs `#[no_mangle]`

Standard `#[no_mangle]` symbols get stripped by the linker. `polkavm_export` emits a `.polkavm_exports` section that `polkatool` reads to preserve entry points in the final blob.

### `#[cfg(not(test))]` Gating

All PVM-specific code (host functions, panic handler, allocator, entry points) is gated so that `cargo test` runs on the host machine with `std`. The matching logic and volatility guard are **pure functions** — testable without a PVM runtime.

### Bump Allocator

`alloy-primitives` (used by `alloy-sol-types`) requires the `alloc` crate. Since PVM has no OS heap, a 64KB bump allocator provides memory. It never frees — each PVM call starts fresh.

### Blob Version Compatibility

The `.polkavm` binary format includes a version byte at offset 4:

```
Offset: 00 01 02 03 04 05 ...
Data:   P  V  M  \0 VV ...
                     ^^ blob version
```

The Paseo testnet runtime (2.0.5+) only accepts **version `0x00`**. This requires `polkatool <= 0.29.x`. Version 0.30.0+ produces `0x02` which is rejected with `CodeRejected`.

---

## Toolchain Summary

| Layer | Tool | Version | Output |
|---|---|---|---|
| Solidity → PVM | `resolc` | 0.3.0 | PVM bytecode (blob v0) |
| Solidity framework | Hardhat + `@parity/hardhat-polkadot` | 0.2.7 | Artifacts JSON |
| Rust → RISC-V ELF | `cargo +nightly` | nightly | `.elf` |
| ELF → .polkavm | `polkatool` | **0.29.0** | `.polkavm` blob (v0) |
| Rust target | `riscv64emac-unknown-none-polkavm` | from polkatool | Custom JSON spec |
| Deployment | `ethers.js` v6 | - | Tx via ETH-RPC adapter |

---

## Test Coverage

### Rust Engine (14 tests)

| Category | Test | What It Verifies |
|---|---|---|
| ABI | `selector_is_four_bytes` | alloy-sol-types generates a 4-byte selector |
| Volatility | `baseline_price_passes_guard` | $8.00 is within band |
| Volatility | `within_10pct_passes_guard` | +9.99% and -9.99% pass |
| Volatility | `at_exactly_10pct_fails_guard` | Exactly +/-10% is rejected |
| Volatility | `above_10pct_fails_guard` | +11% is rejected |
| Volatility | `below_10pct_fails_guard` | -11% is rejected |
| Matching | `buy_fills_when_bid_above_ask` | Buy fills, partial liquidity |
| Matching | `buy_no_fill_when_bid_below_ask` | No fill when bid < ask |
| Matching | `sell_fills_when_ask_below_bid` | Sell fills completely |
| Matching | `sell_no_fill_when_ask_above_bid` | No fill when ask > bid |
| Matching | `fill_capped_by_available_liquidity` | Fill limited by available qty |
| Matching | `empty_book_returns_no_fill` | No fill on empty book |
| Matching | `unknown_side_returns_no_fill` | Invalid side → no fill |
| Encoding | `round_trip_u128_encoding` | u128 → u256 → u128 round-trip |

Run with: `cd engine && cargo test`

---

## Key Gotchas & Lessons Learned

1. **Blob version mismatch** — `polkatool >= 0.30.0` produces blob version `0x02`, rejected by the testnet. Use `0.29.0`.
2. **`target-pointer-width`** — Newer nightly Rust requires this as an integer (`64`), not a string (`"64"`), in the target JSON.
3. **`pallet-revive-uapi` versions** — v0.1.x only implements host functions for `riscv32`. Use v0.10.1 for `riscv64`.
4. **`polkavm_export` required** — `#[no_mangle]` symbols are stripped. Must use `#[polkavm_derive::polkavm_export]`.
5. **`-Z build-std` not in config** — Putting `build-std` in `.cargo/config.toml` breaks `cargo test` (tries to build std for host with no_std flags). Pass it only on the CLI for PVM builds.
6. **Gas estimates ~3x higher than actual** — Normal for PVM. Don't panic at high gas estimates.
