// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title  IEngine
/// @notice Interface for the Nyx CLOB Rust/PVM Matching Engine.
/// @dev    The implementing contract is a RISC-V PolkaVM binary uploaded
///         separately via the two-step PVM deployment model (code upload →
///         instantiation).  Set the address in WardenCLOB via setEngine().
interface IEngine {
    /// @notice Match an incoming limit order against the current book state.
    ///
    /// @dev    The engine runs a 10 % volatility guard on `price` against a
    ///         hard-coded oracle baseline.  Reverts if the price is outside
    ///         the allowed band (flash-loan protection).
    ///
    /// @param side               0 = Buy, 1 = Sell.
    /// @param price              Order price in 6-decimal USD (e.g. $8.00 → 8_000_000).
    /// @param quantity           Order size in asset base units.
    /// @param bestOppositePrice  Best price on the opposite side of the book
    ///                           (best ask for a buy order; best bid for a sell).
    ///                           Pass 0 if the book is empty on that side.
    /// @param availableLiquidity Volume available at `bestOppositePrice`.
    ///
    /// @return filledAmount      Amount immediately filled by this call.
    /// @return remainingAmount   Unfilled portion to be rested on the book.
    function matchOrder(
        uint8   side,
        uint256 price,
        uint256 quantity,
        uint256 bestOppositePrice,
        uint256 availableLiquidity
    ) external returns (uint256 filledAmount, uint256 remainingAmount);
}
