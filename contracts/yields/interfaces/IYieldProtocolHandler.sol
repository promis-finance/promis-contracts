// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

/**
 * @title IYieldProtocolHandler
 * @notice Defines the canonical interface every protocol-specific yield handler must implement.
 * @dev Yield handlers act as adapters that move assets between Promis vaults and external
 *      protocols (e.g., Aave). Each handler manages a single yield-bearing asset and is orchestrated
 *      by the {YAssetOperationsHandler}.
 */
interface IYieldProtocolHandler {
    // ================================================
    // ==================== Events ====================
    // ================================================

    /**
     * @notice Emitted after yield-bearing assets are successfully deposited into the external protocol.
     * @param amount Amount of yield asset deposited into the protocol (asset decimals).
     * @param timestamp Block timestamp when the deposit occurred.
     */
    event YieldAssetDeposited(uint256 amount, uint256 timestamp);

    /**
     * @notice Emitted after a withdrawal request is processed.
     * @param amount Requested amount to withdraw (asset decimals). A value of 0 indicates
     *        the caller requested the full balance.
     * @param actualAmount Total amount returned by the protocol.
     * @param timestamp Block timestamp when the withdrawal occurred.
     */
    event YieldAssetWithdrawn(
        uint256 amount,
        uint256 actualAmount,
        uint256 timestamp
    );

    // ================================================
    // ==================== Errors ====================
    // ================================================

    /// @notice Thrown when the caller lacks the permissions required for the operation.
    error Unauthorized();

    /// @notice Thrown when the supplied amount is zero or otherwise invalid.
    error InvalidAmount();

    /// @notice Thrown when a required address parameter is the zero address.
    error InvalidAddr();

    /// @notice Thrown when withdrawals or configuration changes would leave insufficient funds.
    error InsufficientBalance();

    /// @notice Thrown when the underlying protocol withdraw fails or returns malformed values.
    error WithdrawFailed();

    // ================================================
    // =========== Open External Functions ============
    // ================================================

    /**
     * @notice Returns the total balance of the yield asset managed by the handler, including accrued yield.
     * @return balance Current balance of the handler in the external protocol.
     */
    function getBalance() external view returns (uint256 balance);

    /**
     * @notice Returns the yield asset managed by this handler.
     * @return yieldAsset Address of the ERC20 yield asset.
     */
    function getYieldAsset() external view returns (address yieldAsset);

    // ================================================
    // ======== Restricted External Functions =========
    // ================================================

    /**
     * @notice Deposits additional yield assets into the external protocol.
     * @dev Implementations must pull tokens from the caller using {IERC20-transferFrom}.
     * @param amount Amount of yield asset to deposit.
     */
    function depositYieldAsset(uint256 amount) external;

    /**
     * @notice Withdraws yield assets from the external protocol.
     * @dev Implementations must always transfer funds directly to the caller.
     * @param amount Requested amount to withdraw (asset decimals). Supply 0 to request the full balance.
     * @return actualAmount Total amount withdrawn from the protocol.
     */
    function withdrawYieldAsset(
        uint256 amount
    ) external returns (uint256 actualAmount);
}
