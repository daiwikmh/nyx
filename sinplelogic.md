 How PVM Is Used                                                                                                             
                                                                                                                              
  Normally on Ethereum, Solidity compiles to EVM bytecode. Here, everything runs on PVM (PolkaVM — a RISC-V 64-bit VM built   
  into Polkadot's pallet-revive):                                                                                             
                                
  Ethereum stack:  Solidity → solc → EVM bytecode → EVM
  This project:    Solidity → resolc → PVM bytecode → PVM
                   Rust     → cargo → RISC-V ELF → polkatool → .polkavm blob → PVM

  Both the Solidity contract and the Rust binary are separate smart contracts on-chain, both running inside PVM. The
  difference is:
  - Solidity is compiled to PVM by resolc (Parity's fork of solc)
  - The Rust engine is compiled to RISC-V natively, then linked into a .polkavm blob by polkatool

  ---
  What the Rust Engine Does

  The engine is a pure computation contract — no state, no storage. Its only job is math:

  Input  → (side, price, quantity, bestOppositePrice, availableLiquidity)
  Output → (filledAmount, remainingAmount)

  It does two things:

  1. Volatility guard (lib.rs:186-193) — rejects orders where price deviates >10% from the $8.00 baseline. Flash-loan
  protection.
  fn is_outside_band(price: u128) -> bool {
      let abs_diff = if price > ORACLE_BASELINE { price - ORACLE_BASELINE } else { ORACLE_BASELINE - price };
      abs_diff.saturating_mul(100) / ORACLE_BASELINE >= MAX_DEVIATION_PCT
  }

  2. Price-priority matching (lib.rs:201-221) — checks if the order crosses the spread and returns how much fills:
  fn match_order(side, price, quantity, best_opposite, avail_liquidity) {
      let can_fill = match side {
          0 => price >= best_opposite,  // Buy fills if bid >= ask
          1 => price <= best_opposite,  // Sell fills if ask <= bid
      };
      let filled = quantity.min(avail_liquidity);
      (filled, quantity - filled)
  }

  This logic runs in native RISC-V inside PVM — not interpreted EVM opcodes. That's why it's in Rust.

  ---
  How It's Called From Solidity

  This is the bridge. Three pieces work together:

  1. IEngine.sol — the ABI contract

  // IEngine.sol
  interface IEngine {
      function matchOrder(
          uint8 side, uint256 price, uint256 quantity,
          uint256 bestOppositePrice, uint256 availableLiquidity
      ) external returns (uint256 filledAmount, uint256 remainingAmount);
  }

  This is just a Solidity interface — it defines the function signature so Solidity knows how to ABI-encode the call.

  2. WardenCLOB.sol — the caller

  // WardenCLOB.sol:203-210
  (uint256 filledAmount, uint256 remainingAmount) =
      IEngine(engineAddress).matchOrder(
          side, price, quantity, bestOpposite, liquidity
      );

  This is a standard Solidity external call, except engineAddress points to the Rust contract (0x7CB0...F73C) instead of
  another Solidity contract. PVM doesn't care — it just sees an address and ABI-encoded calldata.

  3. lib.rs — the Rust receiver

  The Rust engine's call() entry point manually decodes the raw calldata bytes:

  // lib.rs:115-163
  pub extern "C" fn call() {
      // 1. Read raw calldata bytes from PVM host
      HostFnImpl::call_data_copy(&mut buf[..copy_len], 0);

      // 2. Check the 4-byte selector matches matchOrder(uint8,uint256,uint256,uint256,uint256)
      if selector != matchOrderCall::SELECTOR { do_revert(); }

      // 3. Decode 5 arguments from 160 bytes of ABI-encoded data
      let side     = read_u8_from_u256(&buf[4..36]);
      let price    = read_u128(&buf[36..68]);
      // ...

      // 4. Run logic
      if is_outside_band(price) { do_revert(); }
      let (filled, remaining) = match_order(...);

      // 5. ABI-encode result and return to caller
      HostFnImpl::return_value(ReturnFlags::empty(), &output);
  }

  The matchOrderCall::SELECTOR is generated at compile time by alloy-sol-types:
  sol! {
      function matchOrder(uint8, uint256, uint256, uint256, uint256)
          external returns (uint256, uint256);
  }
  // This macro generates `matchOrderCall::SELECTOR` = first 4 bytes of keccak256 of the signature

  This selector must match what Solidity generates for IEngine.matchOrder(...) — they both use the same Ethereum ABI encoding
  rules, so they naturally agree.

  ---
  Full Call Chain

  User tx
    └─► WardenCLOB.placeLimitOrder(side, price, qty)   [Solidity/PVM contract]
          │
          │  ABI-encode calldata: selector + 5×uint256 = 164 bytes
          │
          └─► IEngine(0x7CB0...).matchOrder(...)        [cross-contract call via PVM]
                │
                │  PVM routes to Rust engine's call() entry point
                │
                └─► call() in lib.rs                    [Rust/PVM contract]
                      ├── call_data_copy() ← reads the 164 bytes Solidity sent
                      ├── selector check
                      ├── is_outside_band() — volatility guard
                      ├── match_order() — price matching
                      └── return_value() → sends 64 bytes back
                │
          ◄─── (filledAmount, remainingAmount)          [decoded by Solidity]
          │
          └─► _settle(), update order state, _stakeIdle()

  The key insight: the ABI is the contract. Solidity and Rust agree on the same function signature, so the 164-byte calldata
  Solidity packs is exactly what the Rust manually unpacks byte-by-byte.