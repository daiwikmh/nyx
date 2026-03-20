// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IEngine.sol";

// ── Precompile interfaces ─────────────────────────────────────────────────────

interface IStaking {
    /// @dev Nomination Pool join — bonds `amount` (planck) into `poolId`.
    function join(uint256 amount, uint256 poolId) external;
}

// ── WardenCLOB ────────────────────────────────────────────────────────────────

/// @title  WardenCLOB
/// @notice Nyx CLOB Settlement Manager.
///
///         Off-chain order-book computation lives in the Rust/PVM engine.
///         This contract handles:
///           • Deposit and escrow of user funds.
///           • Forwarding new orders to the engine for matching.
///           • Immediate settlement of filled portions.
///           • Automatic yield on idle DOT via the Nomination Pool precompile.
///
/// @dev    PVM deployment — two-step model:
///           1. Compile with resolc, upload bytecode, note code hash.
///           2. Instantiate from the code hash.
///
/// ADDRESSES (Polkadot Asset Hub):
///   USDC (MockERC20)      : constructor param
///   Staking (Nom. Pools)  : 0x0000000000000000000000000000000000000804
contract WardenCLOB is AccessControl {

    // ── Roles ─────────────────────────────────────────────────────────────────

    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    // ── Addresses ─────────────────────────────────────────────────────────────

    address public immutable USDC;
    address public constant STAKING = 0x0000000000000000000000000000000000000804;

    /// @notice Rust/PVM CLOB engine.
    /// @dev    TODO: call setEngine() after uploading the .polkavm binary.
    address public engineAddress;

    /// @notice Nomination pool used by the yield logic.
    uint256 public stakingPoolId = 1;

    // ── Order book state ──────────────────────────────────────────────────────

    struct Order {
        address user;
        uint8   side;          // 0 = Buy, 1 = Sell
        uint256 price;         // 6-decimal USD fixed point
        uint256 quantity;      // total order size
        uint256 filled;        // amount filled so far
        bool    active;
    }

    mapping(uint256 => Order) public orders;
    uint256 public nextOrderId;

    /// @dev Best bid (highest active buy price) tracked for engine calls.
    uint256 public bestBid;
    /// @dev Best ask (lowest active sell price) tracked for engine calls.
    uint256 public bestAsk;
    /// @dev Volume available at bestAsk (used when routing buy orders).
    uint256 public liquidityAtAsk;
    /// @dev Volume available at bestBid (used when routing sell orders).
    uint256 public liquidityAtBid;

    // ── Capital tracking ──────────────────────────────────────────────────────

    /// @dev Total DOT (planck) locked in active sell orders.
    ///      idleDOT = address(this).balance - totalDOTLocked
    uint256 public totalDOTLocked;

    /// @dev Total USDC locked in active buy orders.
    uint256 public totalUSDCLocked;

    // ── Events ────────────────────────────────────────────────────────────────

    event OrderPlaced(
        uint256 indexed orderId,
        address indexed user,
        uint8   side,
        uint256 price,
        uint256 quantity
    );
    event OrderFilled(
        uint256 indexed orderId,
        uint256 filledAmount,
        uint256 remainingAmount
    );
    event OrderSettled(
        uint256 indexed orderId,
        address indexed user,
        uint256 filledAmount
    );
    event IdleDOTStaked(uint256 amount, uint256 poolId);
    event EngineUpdated(address indexed engine);
    event StakingPoolUpdated(uint256 poolId);
    event BookUpdated(uint256 bestBid, uint256 bestAsk);

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address admin, address usdc) {
        require(usdc != address(0), "WardenCLOB: zero USDC");
        USDC = usdc;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(KEEPER_ROLE, admin);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /// @notice Set the Rust/PVM engine address after uploading the .polkavm blob.
    function setEngine(address engine) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(engine != address(0), "WardenCLOB: zero address");
        engineAddress = engine;
        emit EngineUpdated(engine);
    }

    function setStakingPoolId(uint256 poolId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        stakingPoolId = poolId;
        emit StakingPoolUpdated(poolId);
    }

    /// @notice Keeper updates the book's best prices and available liquidity.
    /// @dev    Called by the off-chain keeper after each state change so that
    ///         the next engine call always reflects the live book.
    function updateBookState(
        uint256 newBestBid,
        uint256 newBestAsk,
        uint256 newLiquidityAtBid,
        uint256 newLiquidityAtAsk
    ) external onlyRole(KEEPER_ROLE) {
        bestBid         = newBestBid;
        bestAsk         = newBestAsk;
        liquidityAtBid  = newLiquidityAtBid;
        liquidityAtAsk  = newLiquidityAtAsk;
        emit BookUpdated(newBestBid, newBestAsk);
    }

    // ── Core: place limit order ───────────────────────────────────────────────

    /// @notice Place a limit order.
    ///
    ///         Buy  order: caller deposits USDC (price × quantity) into escrow.
    ///         Sell order: caller deposits DOT  (quantity, via msg.value).
    ///
    ///         The engine is called immediately to attempt a fill against the
    ///         current best price.  Any filled portion is settled on-chain.
    ///         The unfilled remainder is rested as an active order.
    ///
    ///         After settlement, all idle DOT (not locked in sell orders) is
    ///         automatically staked into the configured nomination pool for yield.
    ///
    /// @param side     0 = Buy, 1 = Sell.
    /// @param price    Order price in 6-decimal USD (e.g. 8_000_000 = $8.00).
    /// @param quantity Order size in asset base units.
    function placeLimitOrder(
        uint8   side,
        uint256 price,
        uint256 quantity
    ) external payable {
        require(engineAddress != address(0), "WardenCLOB: engine not set");
        require(price > 0 && quantity > 0, "WardenCLOB: invalid params");
        require(side == 0 || side == 1,    "WardenCLOB: invalid side");

        // ── Escrow user funds ─────────────────────────────────────────────────
        if (side == 0) {
            // Buy: escrow USDC (caller must approve this contract first).
            uint256 cost = _mulSafe(price, quantity) / 1e6; // price is 6-decimal
            require(cost > 0, "WardenCLOB: cost rounds to zero");
            bool ok = IERC20(USDC).transferFrom(msg.sender, address(this), cost);
            require(ok, "WardenCLOB: USDC transfer failed");
            totalUSDCLocked += cost;
        } else {
            // Sell: escrow DOT sent as msg.value.
            require(msg.value == quantity, "WardenCLOB: DOT quantity mismatch");
            totalDOTLocked += quantity;
        }

        // ── Register order ────────────────────────────────────────────────────
        uint256 orderId = nextOrderId++;
        orders[orderId] = Order({
            user:     msg.sender,
            side:     side,
            price:    price,
            quantity: quantity,
            filled:   0,
            active:   true
        });
        emit OrderPlaced(orderId, msg.sender, side, price, quantity);

        // ── Call PVM engine ───────────────────────────────────────────────────
        // For a buy order the relevant opposite price is the best ask (and vice versa).
        (uint256 bestOpposite, uint256 liquidity) = side == 0
            ? (bestAsk, liquidityAtAsk)
            : (bestBid, liquidityAtBid);

        (uint256 filledAmount, uint256 remainingAmount) =
            IEngine(engineAddress).matchOrder(
                side,
                price,
                quantity,
                bestOpposite,
                liquidity
            );

        emit OrderFilled(orderId, filledAmount, remainingAmount);

        // ── Settle filled portion ─────────────────────────────────────────────
        if (filledAmount > 0) {
            _settle(orderId, filledAmount);
        }

        // ── Update order state ────────────────────────────────────────────────
        orders[orderId].filled = filledAmount;
        if (remainingAmount == 0) {
            orders[orderId].active = false;
        }

        // ── Stake idle DOT for yield ──────────────────────────────────────────
        _stakeIdle();
    }

    // ── Settlement ────────────────────────────────────────────────────────────

    /// @dev Transfer the filled portion to the counterparty.
    ///
    ///      Buy  fill: buyer receives DOT  (from the vault's balance).
    ///      Sell fill: seller receives USDC (from the vault's balance).
    ///
    ///      NOTE: For a production system each fill should be matched with a
    ///      specific counterparty order.  Here the vault acts as the settlement
    ///      layer and counterparty funds are managed at the pool level — the
    ///      off-chain keeper ensures the vault holds sufficient liquidity.
    function _settle(uint256 orderId, uint256 filledAmount) internal {
        Order storage o = orders[orderId];

        if (o.side == 0) {
            // Buy order filled: release DOT to the buyer.
            uint256 dotOut = filledAmount;
            require(address(this).balance >= dotOut, "WardenCLOB: insufficient DOT");
            // Reduce the USDC locked (cost already transferred in).
            uint256 costReleased = _mulSafe(o.price, filledAmount) / 1e6;
            if (costReleased > totalUSDCLocked) costReleased = totalUSDCLocked;
            totalUSDCLocked -= costReleased;
            (bool sent, ) = o.user.call{value: dotOut}("");
            require(sent, "WardenCLOB: DOT transfer failed");
        } else {
            // Sell order filled: release USDC to the seller.
            uint256 usdcOut = _mulSafe(o.price, filledAmount) / 1e6;
            require(
                IERC20(USDC).balanceOf(address(this)) >= usdcOut,
                "WardenCLOB: insufficient USDC"
            );
            // Reduce locked DOT (the sold DOT leaves the vault).
            if (filledAmount > totalDOTLocked) {
                totalDOTLocked = 0;
            } else {
                totalDOTLocked -= filledAmount;
            }
            bool ok = IERC20(USDC).transfer(o.user, usdcOut);
            require(ok, "WardenCLOB: USDC payout failed");
        }

        emit OrderSettled(orderId, o.user, filledAmount);
    }

    // ── Yield: stake idle DOT ─────────────────────────────────────────────────

    /// @dev Stakes any DOT held by the vault that is not locked in a sell order.
    ///      Called automatically after every placeLimitOrder.
    function _stakeIdle() internal {
        uint256 balance = address(this).balance;
        if (balance <= totalDOTLocked) return;

        uint256 idle = balance - totalDOTLocked;
        if (idle == 0) return;

        IStaking(STAKING).join(idle, stakingPoolId);
        emit IdleDOTStaked(idle, stakingPoolId);
    }

    /// @notice Manual yield trigger for the keeper (e.g. after a large deposit).
    function stakeIdle() external onlyRole(KEEPER_ROLE) {
        _stakeIdle();
    }

    // ── Order cancellation ────────────────────────────────────────────────────

    /// @notice Cancel a resting order and refund the escrowed funds.
    function cancelOrder(uint256 orderId) external {
        Order storage o = orders[orderId];
        require(o.user == msg.sender,  "WardenCLOB: not your order");
        require(o.active,              "WardenCLOB: order not active");

        o.active = false;
        uint256 unfilled = o.quantity - o.filled;

        if (o.side == 1) {
            // Sell: refund escrowed DOT.
            if (unfilled > totalDOTLocked) {
                totalDOTLocked = 0;
            } else {
                totalDOTLocked -= unfilled;
            }
            (bool sent, ) = o.user.call{value: unfilled}("");
            require(sent, "WardenCLOB: DOT refund failed");
        } else {
            // Buy: refund escrowed USDC.
            uint256 refundUSDC = _mulSafe(o.price, unfilled) / 1e6;
            if (refundUSDC > totalUSDCLocked) refundUSDC = totalUSDCLocked;
            totalUSDCLocked -= refundUSDC;
            bool ok = IERC20(USDC).transfer(o.user, refundUSDC);
            require(ok, "WardenCLOB: USDC refund failed");
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// @dev Overflow-safe multiplication for uint256.
    function _mulSafe(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == 0 || b == 0) return 0;
        uint256 result = a * b;
        require(result / a == b, "WardenCLOB: overflow");
        return result;
    }

    receive() external payable {}
}
