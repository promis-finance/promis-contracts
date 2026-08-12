// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "../types/YAssetOperationsHandlerTypes.sol";

/**
 * @title IYAssetOperationsHandler
 * @notice Interface for contracts that orchestrate distribution of a single y asset across multiple
 *         protocol handlers.
 */
interface IYAssetOperationsHandler {
    // ================================================
    // =========== Open External Functions ============
    // ================================================

    // ================================================
    // ======== Restricted External Functions =========
    // ================================================

    /**
     * @notice Pulls asset from admin, operator or externalBusiness, or receives asset from proOperations and distributes them across all configured handlers.
     * @dev Caller must be the proOperations, admin, operator or externalBusiness
     * @param _amount Amount of y asset (asset decimals) to allocate.
     */
    function distributeYAsset(uint256 _amount) external;

    /**
     * @notice Check its own balance of y asset and distributes any unallocated amount across all configured handlers.
     * @dev Caller must be the admin, operator or externalBusiness
     */
    function distributeUnallocatedYAsset() external;

    /**
     * @notice Requests a specific handler to unwind part of its allocation and return funds to the reserve.
     * @param _handler Address of the handler to unwind.
     * @param _amount Amount to withdraw (asset decimals).
     */
    function withdrawalYieldAssets(address _handler, uint256 _amount) external;

    /**
     * @notice Batched variant of {returnYieldAssets} for operational efficiency.
     * @param _handlers Array of handler addresses to unwind.
     * @param _amounts Array of amount to withdraw (asset decimals).
     */
    function withdrawalYieldAssetsMultiple(
        address[] memory _handlers,
        uint256[] memory _amounts
    ) external;

    /**
     * @notice Sends `amount` of the managed yAsset to `to`, drawing from the
     *         unallocated reserve first and withdrawing from yield handlers
     *         (Aave/Morpho) for any shortfall, in handler order.
     * @dev Callable by ProTokenOperations (for strategistRedeem) plus the existing
     *      privileged roles. Keeps the divide-before-multiply / withdraw logic that
     *      already exists for withdrawals in one place.
     * @param to Recipient of the yAsset
     * @param amount Total yAsset to send
     */
    function payOut(
        address to, 
        uint256 amount
    ) external returns (uint256 sent);

    /**
     * @notice Records protocol owned fee during unminting.
     * @dev Callable by ProTokenOperations.
     * @param yAsset Address of yAsset
     * @param amount Amount of yAsset as fee
     */
    function recordProtocolFee(
        address yAsset, 
        uint256 amount
    ) external;
    // ================================================
    // =========== Admin External Functions ===========
    // ================================================

    /**
     * @notice Configures the set of protocol handlers that receive allocations.
     * @param _handlers Handler contract addresses
     * @param _allocations Allocation basis points applied to `_amount` in {allocateYAssets}.
     */
    function setYProtocolHandlers(
        address[] memory _handlers,
        uint256[] memory _allocations
    ) external;

    // ================================================
    // ================ View functions ================
    // ================================================
    
    /** 
     * @notice Returns whether payOut(amount) would succeed at current state.
     * @param amount Required amount to be withdrawn from handler
     * @dev Sums unallocated + handler balances with early-exit. View-only; does not
     *      account for slippage on actual withdrawYieldAsset() — handlers whose
     *      withdraw returns less than getBalance() can still cause payOut to revert.
     */
    function previewPayOut(
        uint256 amount
    ) external view returns (bool sufficient);

    /**
     * @notice Returns the managed y asset and the total current amount.
     * @return asset Address of the y asset.
     * @return totalAmount Sum of current amount from all handler allocations + unallocated (principal + rewards + unallocated).
     */
    function getYAssetInfo()
        external
        view
        returns (address asset, uint256 totalAmount);

    /**
     * @notice Returns the full handler configuration for the y asset.
     * @return handlers Array of handler metadata structs.
     */
    function getYProtocolHandlers()
        external
        view
        returns (
            YAssetOperationsHandlerTypes.YieldProtocolHandler[] memory handlers
        );

    /**
     * @notice Returns the current balance on a specific protocol handler.
     * @param _handler Handler contract or deposit handler address.
     * @return balance Current balance (principal + rewards) held by the specified handler.
     */
    function getProtocolBalance(
        address _handler
    ) external view returns (uint256 balance);

    /**
     * @notice Returns the current unallocated balance held by this contract.
     * @return balance Current unallocated balance held by this contract.
     */
    function getUnallocatedBalance() external view returns (uint256 balance);

    /**
     * @notice Returns the address of the y asset managed by this contract instance.
     */
    function getYAsset() external view returns (address);

    // ================================================
    // ==================== Events ====================
    // ================================================
    /**
     * @notice Emitted after a handler with balance is replaced
     */
    event ProtocolHandlerRemovedWithBalance(address old, uint256 residual, bool verified);

    /**
     * @notice Emitted after the handler configuration is updated.
     */
    event YProtocolHandlersSet(address[] handlers, uint256[] allocations);

    /**
     * @notice Emitted when a handler is removed from the configuration.
     */
    event YProtocolHandlerRemoved(address indexed handler);

    /**
     * @notice Emitted when y assets are allocated.
     */
    event YAssetsAllocated(uint256 amount);

    /**
     * @notice Emitted when allocated assets are sent to an individual handler.
     */
    event YAssetsDistributed(address indexed handler, uint256 amount);

    /**
     * @notice Emitted when a handler withdraw operation completes.
     */
    event YAssetsWithdrawn(
        address indexed handler,
        address indexed destination,
        uint256 amount
    );

    event YAssetsPaidOut(address indexed to, uint256 amount);

    /**
     * @notice Emitted when an emergency withdrawal is performed.
     */
    event EmergencyWithdraw(
        address indexed token,
        address indexed to,
        uint256 amount
    );

    /**
     * @notice Emitted to track unmint fee accrual.
     */
    event UnmintFeeAccrued(
        address indexed yAsset, 
        uint256 indexed feeAmount
    );

    /**
     * @notice Emitted when protocol unmint fees are collected. 
     */
    event ProtocolFeesCollected(
        address yAsset, 
        address to, 
        uint256 amount
    );

    // ================================================
    // ==================== Errors ====================
    // ================================================

    error NotAdmin();
    error ZeroAddress();
    error ZeroAmount();
    error NoHandlers();
    error AssetNotReceived();
    error Unauthorized();
    error InvalidAllocation();
    error ProtocolHandlerNotFound();
    error InsufficientBalance();
    error ArrayLengthMismatch();
    error WithdrawFailed();
    error Paused();
    error HandlerAssetMismatch(address handler);
    error DuplicateHandler();
    error CollectExceedsAccrued(uint256 amount, uint256 owed);
}
