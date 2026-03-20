//! Nyx CLOB — PVM Matching & Risk Engine
//!
//! Target  : riscv64emac-unknown-none-polkavm
//! Crate   : bin  (exports `call` + `deploy` C entry points)
//!
//! ── ABI ──────────────────────────────────────────────────────────────────────
//!
//!   Function : matchOrder(uint8,uint256,uint256,uint256,uint256)
//!              (side, price, quantity, bestOppositePrice, availableLiquidity)
//!
//!   Calldata layout  (164 bytes total):
//!     [0..4]    – 4-byte Keccak selector
//!     [4..36]   – side               (uint8,   ABI-padded to 32 bytes, big-endian)
//!     [36..68]  – price              (uint256, 6-decimal fixed-point, big-endian)
//!     [68..100] – quantity           (uint256, asset base units,      big-endian)
//!     [100..132]– bestOppositePrice  (uint256, 6-decimal fixed-point, big-endian)
//!     [132..164]– availableLiquidity (uint256, asset base units,      big-endian)
//!
//!   Return data (64 bytes):
//!     [0..32]  – filledAmount    (uint256)
//!     [32..64] – remainingAmount (uint256)
//!
//! ── Volatility Guard ─────────────────────────────────────────────────────────
//!
//!   All prices use 6-decimal fixed point (e.g. $8.00 DOT → 8_000_000).
//!   If |orderPrice – ORACLE_BASELINE| / ORACLE_BASELINE > 10 %  → revert.
//!   This prevents flash-loan attacks that manipulate the fill price.
//!
//! ── Matching Logic ───────────────────────────────────────────────────────────
//!
//!   Buy  (side = 0): fills if orderPrice >= bestOppositePrice (best ask).
//!   Sell (side = 1): fills if orderPrice <= bestOppositePrice (best bid).
//!   fillAmount      = min(quantity, availableLiquidity)   when conditions met.
//!   remainingAmount = quantity – fillAmount.

// In test mode cargo compiles for the host (x86_64) with std, so we drop the
// no_std / no_main constraints to allow the test harness to run.
#![cfg_attr(not(test), no_std)]
#![cfg_attr(not(test), no_main)]

extern crate alloc;

use alloy_sol_types::{sol, SolCall};

// pallet-revive-uapi 0.10.x: HostFnImpl is implemented on riscv64 (the
// production PVM target arch).  Import the types here; the code that calls
// host functions is gated with #[cfg(not(test))] so it never compiles on x86_64.
#[cfg(not(test))]
use pallet_revive_uapi::{HostFn, HostFnImpl, ReturnFlags};

// ── Bump allocator (no_std PVM only) ────────────────────────────────────────

#[cfg(not(test))]
mod allocator {
    use core::alloc::{GlobalAlloc, Layout};

    struct BumpAllocator;

    #[global_allocator]
    static ALLOCATOR: BumpAllocator = BumpAllocator;

    static mut HEAP: [u8; 65536] = [0u8; 65536];
    static mut OFFSET: usize = 0;

    unsafe impl GlobalAlloc for BumpAllocator {
        unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
            let align = layout.align();
            let size = layout.size();
            let start = (OFFSET + align - 1) & !(align - 1);
            let end = start + size;
            if end > HEAP.len() {
                core::ptr::null_mut()
            } else {
                OFFSET = end;
                HEAP.as_mut_ptr().add(start)
            }
        }

        unsafe fn dealloc(&self, _ptr: *mut u8, _layout: Layout) {
            // Bump allocators don't free — fine for short-lived PVM calls.
        }
    }
}

// ── ABI definition (selector auto-generated at compile time) ─────────────────

sol! {
    /// Signature must exactly match IEngine.sol.
    function matchOrder(
        uint8   side,
        uint256 price,
        uint256 quantity,
        uint256 bestOppositePrice,
        uint256 availableLiquidity
    ) external returns (uint256 filledAmount, uint256 remainingAmount);
}

// ── Constants ─────────────────────────────────────────────────────────────────

/// Oracle baseline for DOT — 6-decimal USD fixed point ($8.00).
/// Update before deployment if the current DOT price is materially different.
const ORACLE_BASELINE: u128 = 8_000_000;

/// Maximum allowed deviation before an order is rejected (10 %).
const MAX_DEVIATION_PCT: u128 = 10;

// ── PVM entry points (not compiled during host-side unit tests) ───────────────

#[cfg(not(test))]
#[polkavm_derive::polkavm_export]
pub extern "C" fn deploy() {}

#[cfg(not(test))]
#[polkavm_derive::polkavm_export]
pub extern "C" fn call() {
    // ── 1. Read calldata ──────────────────────────────────────────────────────
    let len = HostFnImpl::call_data_size() as usize;
    if len < 4 {
        do_revert();
    }

    // ── 2. Read full calldata into buffer ──────────────────────────────────────
    let mut buf = [0u8; 164];
    let copy_len = if len > 164 { 164 } else { len };
    HostFnImpl::call_data_copy(&mut buf[..copy_len], 0);

    // ── 3. Selector check ───────────────────────────────────────────────────
    let selector: [u8; 4] = [buf[0], buf[1], buf[2], buf[3]];
    if selector != matchOrderCall::SELECTOR {
        do_revert();
    }

    if len < 164 {
        do_revert();
    }

    // ── 4. Decode arguments ─────────────────────────────────────────────────
    // Each ABI uint argument is 32 bytes, big-endian, value in the low bytes.
    let side            = read_u8_from_u256(&buf[4..36]);
    let price           = read_u128(&buf[36..68]);
    let quantity        = read_u128(&buf[68..100]);
    let best_opposite   = read_u128(&buf[100..132]);
    let avail_liquidity = read_u128(&buf[132..164]);

    // ── 4. Basic validation ───────────────────────────────────────────────────
    if price == 0 || quantity == 0 {
        do_revert();
    }

    // ── 5. Volatility guard ───────────────────────────────────────────────────
    if is_outside_band(price) {
        do_revert();
    }

    // ── 6. Matching logic ─────────────────────────────────────────────────────
    let (filled, remaining) = match_order(side, price, quantity, best_opposite, avail_liquidity);

    // ── 7. ABI-encode (uint256, uint256) and return ───────────────────────────
    let mut output = [0u8; 64];
    write_u128_as_u256(filled,    &mut output[0..32]);
    write_u128_as_u256(remaining, &mut output[32..64]);

    HostFnImpl::return_value(ReturnFlags::empty(), &output);
}

// ── Revert helper (PVM only) ──────────────────────────────────────────────────

#[cfg(not(test))]
#[cold]
fn do_revert() -> ! {
    HostFnImpl::return_value(ReturnFlags::REVERT, &[]);
}

// ── Panic handler (no_std PVM only) ──────────────────────────────────────────

#[cfg(not(test))]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    HostFnImpl::return_value(ReturnFlags::REVERT, &[]);
}

// ── Volatility guard (pure — testable on host) ────────────────────────────────

/// Returns `true` if `price` deviates more than MAX_DEVIATION_PCT from the
/// hard-coded oracle baseline (flash-loan protection).
fn is_outside_band(price: u128) -> bool {
    let abs_diff = if price > ORACLE_BASELINE {
        price - ORACLE_BASELINE
    } else {
        ORACLE_BASELINE - price
    };
    abs_diff.saturating_mul(100) / ORACLE_BASELINE >= MAX_DEVIATION_PCT
}

// ── Order matching (pure — testable on host) ──────────────────────────────────

/// Returns `(filledAmount, remainingAmount)`.
///
/// Buy  (side=0): fills if bid price ≥ best ask.
/// Sell (side=1): fills if ask price ≤ best bid.
fn match_order(
    side: u8,
    price: u128,
    quantity: u128,
    best_opposite: u128,
    avail_liquidity: u128,
) -> (u128, u128) {
    let can_fill = match side {
        0 => best_opposite > 0 && price >= best_opposite,
        1 => best_opposite > 0 && price <= best_opposite,
        _ => false,
    };

    if !can_fill {
        return (0, quantity);
    }

    let filled    = quantity.min(avail_liquidity);
    let remaining = quantity - filled;
    (filled, remaining)
}

// ── ABI helpers ───────────────────────────────────────────────────────────────

/// Read a uint8 that was ABI-padded into a 32-byte slot (value in the last byte).
#[cfg(not(test))]
fn read_u8_from_u256(bytes: &[u8]) -> u8 {
    if bytes.len() < 32 { return 0; }
    bytes[31]
}

/// Read the lower 16 bytes of a 32-byte big-endian uint256 as u128.
/// Upper 16 bytes must be zero; any non-zero byte saturates to u128::MAX
/// (treated as extreme price, failing the volatility guard).
fn read_u128(bytes: &[u8]) -> u128 {
    if bytes.len() < 32 { return 0; }
    for &b in &bytes[0..16] {
        if b != 0 { return u128::MAX; }
    }
    let mut buf = [0u8; 16];
    buf.copy_from_slice(&bytes[16..32]);
    u128::from_be_bytes(buf)
}

/// Write a u128 value into the lower 16 bytes of a 32-byte big-endian uint256 slot.
fn write_u128_as_u256(val: u128, slot: &mut [u8]) {
    debug_assert_eq!(slot.len(), 32);
    slot[..16].fill(0);
    slot[16..32].copy_from_slice(&val.to_be_bytes());
}

// ── Unit tests (compiled for host with std) ───────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Selector sanity (alloy-sol-types compile-time check) ──────────────────

    #[test]
    fn selector_is_four_bytes() {
        assert_eq!(matchOrderCall::SELECTOR.len(), 4);
    }

    // ── Volatility guard ──────────────────────────────────────────────────────

    #[test]
    fn baseline_price_passes_guard() {
        assert!(!is_outside_band(8_000_000));
    }

    #[test]
    fn within_10pct_passes_guard() {
        // abs_diff * 100 / 8_000_000 = 9  →  9 >= 10 is false → passes
        assert!(!is_outside_band(8_799_999)); // +9.99 %
        assert!(!is_outside_band(7_200_001)); // -9.99 %
    }

    #[test]
    fn at_exactly_10pct_fails_guard() {
        // abs_diff = 800_000 → 800_000 * 100 / 8_000_000 = 10 → 10 >= 10 → rejects
        assert!(is_outside_band(8_800_000)); // exactly +10 %
        assert!(is_outside_band(7_200_000)); // exactly -10 %
    }

    #[test]
    fn above_10pct_fails_guard() {
        assert!(is_outside_band(8_880_000)); // +11 %
    }

    #[test]
    fn below_10pct_fails_guard() {
        assert!(is_outside_band(7_120_000)); // -11 %
    }

    // ── Matching ──────────────────────────────────────────────────────────────

    #[test]
    fn buy_fills_when_bid_above_ask() {
        let (filled, remaining) = match_order(0, 8_000_000, 100, 7_900_000, 80);
        assert_eq!(filled, 80);
        assert_eq!(remaining, 20);
    }

    #[test]
    fn buy_no_fill_when_bid_below_ask() {
        let (filled, remaining) = match_order(0, 7_500_000, 100, 8_000_000, 80);
        assert_eq!(filled, 0);
        assert_eq!(remaining, 100);
    }

    #[test]
    fn sell_fills_when_ask_below_bid() {
        let (filled, remaining) = match_order(1, 7_900_000, 100, 8_000_000, 200);
        assert_eq!(filled, 100);
        assert_eq!(remaining, 0);
    }

    #[test]
    fn sell_no_fill_when_ask_above_bid() {
        let (filled, remaining) = match_order(1, 8_500_000, 100, 8_000_000, 200);
        assert_eq!(filled, 0);
        assert_eq!(remaining, 100);
    }

    #[test]
    fn fill_capped_by_available_liquidity() {
        let (filled, remaining) = match_order(0, 8_000_000, 500, 7_900_000, 300);
        assert_eq!(filled, 300);
        assert_eq!(remaining, 200);
    }

    #[test]
    fn empty_book_returns_no_fill() {
        let (filled, remaining) = match_order(0, 8_000_000, 100, 0, 0);
        assert_eq!(filled, 0);
        assert_eq!(remaining, 100);
    }

    #[test]
    fn unknown_side_returns_no_fill() {
        let (filled, remaining) = match_order(9, 8_000_000, 100, 7_900_000, 100);
        assert_eq!(filled, 0);
        assert_eq!(remaining, 100);
    }

    // ── u256 encoding round-trip ──────────────────────────────────────────────

    #[test]
    fn round_trip_u128_encoding() {
        let val: u128 = 1_234_567_890_u128;
        let mut buf = [0u8; 32];
        write_u128_as_u256(val, &mut buf);
        assert_eq!(read_u128(&buf), val);
    }
}
