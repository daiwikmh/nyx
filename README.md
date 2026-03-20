# Shadow Warden CLOB

**Polkadot Hackathon — Track 2: Unlock the Speed and Power of PVM**

An autonomous, risk-managed Central Limit Order Book (CLOB) on Polkadot Asset Hub. Heavy computation lives in a native Rust/PVM matching engine; user settlement and yield routing live in a Solidity manager. Both contracts run on PolkaVM (RISC-V 64-bit) — no EVM.

---

## What It Does

Users place limit orders (buy/sell) against a live DOT/USDC order book. Each order:

1. Escrows user funds (DOT native or USDC via Asset Hub precompile)
2. Calls the **Rust PVM engine** to run matching logic and a volatility guard
3. Settles filled amounts on-chain immediately
4. Stakes any idle DOT into a Nomination Pool for passive yield

The system demonstrates all three PVM track categories:
- **PVM-experiments** — Solidity calling a Rust binary as a cross-contract call
- **Native Assets** — PAS/DOT as collateral, USDC via Asset Hub Asset ID 1337
- **Precompiles** — USDC ERC-20 precompile (`0x...0539`) and Staking precompile (`0x...0804`)

---

## Architecture

```
User / Nyx Frontend
        │
        ▼
WardenCLOB.sol  (Solidity → PVM via resolc)     contract/contracts/WardenCLOB.sol
  │  Escrow, settlement, yield, order state
  │
  └──► IEngine.matchOrder(...)  ─────────────►  Rust PVM Engine  (engine/src/lib.rs)
                                                  Volatility guard + price-priority match
                                                  Returns (filledAmount, remainingAmount)
  │
  └──► USDC Precompile  0x0000...0539            Asset Hub Asset ID 1337 as ERC-20
  └──► Staking Precompile  0x0000...0804         Nomination Pool join for idle DOT yield
```

---

## Deployed Contracts — Paseo Asset Hub Testnet

| Contract | Address |
|---|---|
| **WardenCLOB** (Solidity) | [`0x504B962fC472ab5ea0C9CF58885f6f6ad6268BF3`](https://blockscout-paseo.polkadot.io/address/0x504B962fC472ab5ea0C9CF58885f6f6ad6268BF3) |
| **Rust PVM Engine** | [`0xCa1F96Ef99F21777C4DCe2Bc6C5BE88803625923`](https://blockscout-paseo.polkadot.io/address/0xCa1F96Ef99F21777C4DCe2Bc6C5BE88803625923) |
| **MockUSDC** (ERC20) | [`0x2369B00a916132cBD3639bB29353d062f5fF325a`](https://blockscout-paseo.polkadot.io/address/0x2369B00a916132cBD3639bB29353d062f5fF325a) |
| Staking Precompile (Nom. Pools) | `0x0000000000000000000000000000000000000804` |

**Network:** Paseo Asset Hub Testnet
**RPC:** `https://eth-rpc-testnet.polkadot.io/`
**Deployer:** `0x445bf5fe58f2Fe5009eD79cFB1005703D68cbF85`
**Engine wired to WardenCLOB** via `setEngine()` ✅

---

## Project Structure

```
polka/
├── engine/                     Rust PVM Matching Engine
│   ├── src/lib.rs              Matching logic, volatility guard, ABI decode/encode
│   ├── Cargo.toml              no_std cdylib — polkavm-derive 0.29.0, pallet-revive-uapi 0.10.1
│   └── engine.polkavm          Compiled blob (2.9 KB, blob version 0x00) ✅
│
├── contract/                   Hardhat project — Solidity compiled to PVM via resolc
│   ├── contracts/
│   │   ├── WardenCLOB.sol      Settlement manager, escrow, yield, order book state
│   │   └── IEngine.sol         Interface used by Solidity to call the Rust engine
│   ├── scripts/deploy.ts       Deploy WardenCLOB
│   └── scripts/deploy-engine.ts  Upload engine.polkavm blob + call setEngine()
│
├── nyx/                        Next.js 16 trading frontend (bun, Tailwind v4)
│   ├── src/app/dashboard/      Full trading dashboard (trade + portfolio modes)
│   ├── src/lib/clob.ts         Contract addresses, ABI, trading pairs config
│   └── src/lib/wagmi.ts        Paseo Asset Hub chain config (chainId 420420421)
│
├── build.sh                    Full build: cargo test → resolc → RISC-V cross-compile → polkatool link
└── ARCHITECTURE.md             Deep-dive architecture and build documentation
```

---

## The PVM Stack

### 1. Rust Engine (`engine/src/lib.rs`)

A `no_std` Rust program compiled to RISC-V 64-bit (`riscv64emac-unknown-none-polkavm`) and linked into a `.polkavm` blob by `polkatool`. It runs **natively on PolkaVM** — not inside an EVM interpreter.

**Entry points** exported via `#[polkavm_derive::polkavm_export]`:
- `deploy()` — no-op constructor
- `call()` — reads 164-byte ABI calldata, runs matching, returns 64-byte result

**Matching logic:**
- Decodes `matchOrder(uint8 side, uint256 price, uint256 qty, uint256 bestOppositePrice, uint256 availableLiquidity)`
- Runs a **volatility guard**: rejects orders outside a ±10% band around a $8.00 DOT baseline
- Price-priority match: `filled = min(qty, availableLiquidity)` when price crosses the spread
- Returns `(filledAmount, remainingAmount)` ABI-encoded

**Testing:** 14 unit tests run on host (`cargo test`) — all PVM-specific code is `#[cfg(not(test))]` gated so the pure matching logic is testable without a PVM runtime.

### 2. Solidity → Rust Cross-Contract Call (`contract/contracts/WardenCLOB.sol`)

Compiled to PVM bytecode via `resolc 0.3.0` (not `solc`). At order placement time, the Solidity contract makes a **standard external call** to the Rust engine's address:

```solidity
// contract/contracts/IEngine.sol
(uint256 filled, uint256 remaining) = IEngine(engineAddress).matchOrder(
    side, price, quantity, bestOppositePrice, availableLiquidity
);
```

The PVM runtime routes this to `0x7CB0...F73C`. The Rust engine reads calldata via `HostFnImpl::call_data_copy()` and returns via `HostFnImpl::return_value()`. No special bridging code — PVM's ABI is compatible with Solidity's external call encoding.

### 3. Native Asset Precompiles

**USDC (`0x0000...0539`)** — Asset Hub's Asset ID 1337 exposed as a standard ERC-20. WardenCLOB calls `transferFrom` to escrow buy collateral and `transfer` to pay out sellers.

**Staking (`0x0000...0804`)** — Nomination Pool precompile. After every order, idle DOT (balance minus locked sell collateral) is staked via `join(amount, poolId)` to earn passive yield.

---

## Build

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Rust nightly | latest | `rustup install nightly` |
| polkatool | **0.29.0** | 0.30+ produces blob v2 → rejected by testnet |
| resolc | 0.3.0 | Solidity → PVM compiler |
| Node.js | 18+ | for Hardhat |
| bun | latest | for nyx frontend |

> **Critical:** `polkatool` and `polkavm-derive` must be `0.29.0`. Newer versions produce blob version `0x02` which the Paseo testnet rejects with `CodeRejected`.

### Build Everything

```bash
./build.sh
```

This runs: `cargo test` (14 tests) → `npx hardhat compile` (Solidity → PVM) → RISC-V cross-compile → `polkatool link` → `engine.polkavm`

### Deploy

```bash
# 1. Deploy WardenCLOB
cd contract && npx ts-node scripts/deploy.ts

# 2. Upload engine blob and wire it
npx ts-node scripts/deploy-engine.ts
```

### Frontend

```bash
cd nyx && bun install && bun run dev
```

---

## Frontend — Nyx

Next.js 16 trading dashboard wired to the live contracts on Paseo testnet.

- **Trade mode:** PairSelector → OrderEntry (wagmi `writeContract`) → SVG DepthChart → PriceChart → ActivityLog → OpenOrdersTable
- **Portfolio mode:** BalanceCards → YieldDashboard (IdleDOTStaked events) → PriceChart → FillHistory
- Chain config: `chainId 420420421`, native PAS (8 decimals), MetaMask connector
- All charts are pure SVG — no charting library dependencies

---

## Key Technical Notes

- **PAS = 8 decimals** — `100_000_000 = 1 PAS` (`parseUnits(x, 8)`, display `/1e8`)
- **Gas estimates ~3x inflated** — normal for PVM; gas is capped at `500_000` in write calls
- **Integer arithmetic only** — all prices are 6-decimal fixed-point (`$8.00 = 8_000_000`)
- **Stateless engine** — no storage in Rust; Solidity is the single source of truth for book state
- **Bump allocator** — 64KB heap for `alloy-primitives`; never freed (PVM calls are ephemeral)
- **`-Z build-std` on CLI only** — not in `.cargo/config.toml`; breaks `cargo test` otherwise

For full architecture details, build troubleshooting, and test coverage: see [ARCHITECTURE.md](./ARCHITECTURE.md).
