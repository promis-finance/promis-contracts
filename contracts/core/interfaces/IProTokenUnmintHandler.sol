// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;
pragma abicoder v2;

import "../types/ProTokenUnmintHandlerTypes.sol";

/// @title The interface of the ProTokenUnmintHandler contract
/// @notice Defines the functionality for handling unmint requests of ProTokens
interface IProTokenUnmintHandler {
    // ================================================
    // =========== Open External Functions ============
    // ================================================

    /// @notice Claims multiple unmint requests for a specific yAsset
    /// @param yAsset The address of the yield-bearing asset
    /// @param requestIds An array of unmint request IDs to claim
    function claimUnmintRequests(
        address yAsset,
        uint256[] memory requestIds
    ) external;

    // ================================================
    // ======== Restricted External Functions =========
    // ================================================

    /// @notice Creates a new unmint request for a receiver
    /// @dev Only callable by the ProTokenOperations contract
    /// @param receiver The address that will receive the yAsset tokens
    /// @param yAsset The address of the yield-bearing asset to unmint to
    /// @param amount The amount of yAsset the receiver should receive
    /// @return requestId The unique identifier (for this yAssset) of the created unmint request
    function createUnmintRequest(
        address receiver,
        address yAsset,
        uint256 amount
    ) external returns (uint256 requestId);

    /// @notice Processes the next pending unmint batch for a specific yAsset
    /// @dev Only callable by the operator, admin or externalBusiness. The sender must provide the required yAsset tokens
    ///      to fulfill the batch. The batch must exist, not be already processed, and the batch
    ///      duration must have passed.
    /// @param yAsset The address of the yield-bearing asset
    function processNextUnmintBatch(address yAsset) external;

    // ================================================
    // =========== Owner External Functions ===========
    // ================================================

    /// @notice Sets the duration for unmint batches
    /// @dev Only callable by admin. Duration must be greater than 0.
    /// @param _duration The new batch duration in seconds
    function setUnmintBatchDuration(uint256 _duration) external;

    // ================================================
    // ================ View functions ================
    // ================================================

    /// @notice Retrieves the details of a specific unmint request
    /// @param yAsset The address of the yield-bearing asset
    /// @param requestId The unique identifier of the unmint request
    /// @return The UnmintRequest struct containing all request details
    function getUnmintRequest(
        address yAsset,
        uint256 requestId
    ) external view returns (ProTokenUnmintHandlerTypes.UnmintRequest memory);

    /// @notice Retrieves the details of a specific unmint batch
    /// @param yAsset The address of the yield-bearing asset
    /// @param batchId The unique identifier of the unmint batch
    /// @return The UnmintBatch struct containing all batch details
    function getUnmintBatch(
        address yAsset,
        uint256 batchId
    ) external view returns (ProTokenUnmintHandlerTypes.UnmintBatch memory);

    /// @notice Gets the current active unmint batch ID for a specific yAsset
    /// @dev This is the batch ID where new unmint requests are being added
    /// @param yAsset The address of the yield-bearing asset
    /// @return The current batch ID
    function getCurrentUnmintBatchId(
        address yAsset
    ) external view returns (uint256);

    /// @notice Gets the ID of the last processed unmint batch for a specific yAsset
    /// @param yAsset The address of the yield-bearing asset
    /// @return The last processed batch ID
    function getLastProcessedBatchId(
        address yAsset
    ) external view returns (uint256);

    /// @notice Gets the next unmint request ID that will be assigned for a specific yAsset
    /// @param yAsset The address of the yield-bearing asset
    /// @return The next request ID
    function getNextUnmintRequestId(
        address yAsset
    ) external view returns (uint256);

    /// @notice Gets the configured duration for unmint batches
    /// @dev Duration is in seconds (e.g., 3600 for 1 hour batches)
    /// @return The batch duration in seconds
    function getUnmintBatchDuration() external view returns (uint256);

    /// @notice Gets all unclaimed batch IDs for a specific receiver and yAsset
    /// @dev Returns an array of batch IDs that have unmint requests for the receiver that haven't been claimed yet
    /// @param receiver The address of the receiver
    /// @param yAsset The address of the yield-bearing asset
    /// @return Array of unclaimed batch IDs
    function getUnclaimedBatchesForReceiver(
        address receiver,
        address yAsset
    ) external view returns (uint256[] memory);

    /// @notice Gets the unmint request ID for a specific receiver in a specific batch
    /// @dev Returns 0 if the receiver has no request in the specified batch
    /// @param yAsset The address of the yield-bearing asset
    /// @param batchId The batch ID to query
    /// @param receiver The address of the receiver
    /// @return The request ID, or 0 if no request exists
    function getUnmintRequestIdForReceiverInBatch(
        address yAsset,
        uint256 batchId,
        address receiver
    ) external view returns (uint256);

    /// @notice Gets the unclaimed unmint requests data for a specific receiver
    /// @param yAsset The address of the yield-bearing asset
    /// @param receiver The address of the receiver´
    /// @return requests An array of UnmintRequest structs that are unclaimed for the receiver
    /// @return lastUnmintBatchIdProcessed The last unmint batch ID that has been processed for the yAsset
    function getUnclaimedRequestsForReceiver(
        address receiver,
        address yAsset
    )
        external
        view
        returns (
            ProTokenUnmintHandlerTypes.UnmintRequest[] memory requests,
            uint256 lastUnmintBatchIdProcessed
        );

    /// @notice Checks if a specific unmint request has been claimed
    /// @param yAsset The address of the yield-bearing asset
    /// @param requestId The unique identifier of the unmint request
    /// @return True if the request has been claimed, false otherwise
    function isUnmintRequestClaimed(
        address yAsset,
        uint256 requestId
    ) external view returns (bool);

    /// @notice Checks if a specific unmint batch has been processed
    /// @param yAsset The address of the yield-bearing asset
    /// @param batchId The unique identifier of the unmint batch
    /// @return True if the batch has been processed, false otherwise
    function isUnmintBatchProcessed(
        address yAsset,
        uint256 batchId
    ) external view returns (bool);

    /// @notice Checks if a specific unmint batch can be processed
    /// @dev A batch can be processed if it exists, hasn't been processed yet, and the batch duration has passed
    /// @param yAsset The address of the yield-bearing asset
    /// @param batchId The unique identifier of the unmint batch
    /// @return True if the batch can be processed, false otherwise
    function canBatchBeProcessed(
        address yAsset,
        uint256 batchId
    ) external view returns (bool);

    /// @notice Gets the address of the ProTokenSettings contract
    /// @return The ProTokenSettings contract address
    function getProTokenSettings() external view returns (address);

    // ================================================
    // ==================== Events ====================
    // ================================================

    /// @notice Emitted when a new unmint request is created
    /// @param receiver The address that will receive the yAsset tokens
    /// @param yAsset The address of the yield-bearing asset
    /// @param requestId The unique identifier of the created unmint request
    /// @param batchId The batch ID this request belongs to
    /// @param amount The amount of yAsset the receiver will receive
    /// @param timestamp The timestamp when the request was created
    event UnmintRequestCreated(
        address indexed receiver,
        address indexed yAsset,
        uint256 indexed requestId,
        uint256 batchId,
        uint256 amount,
        uint256 timestamp
    );

    /// @notice Emitted when an existing unmint request is aggregated with additional amount
    /// @param receiver The address that will receive the yAsset tokens
    /// @param yAsset The address of the yield-bearing asset
    /// @param requestId The unique identifier of the unmint request
    /// @param batchId The batch ID this request belongs to
    /// @param additionalAmount The additional amount added to the request
    /// @param newTotalAmount The new total amount after aggregation
    /// @param timestamp The timestamp when the request was aggregated
    event UnmintRequestAggregated(
        address indexed receiver,
        address indexed yAsset,
        uint256 indexed requestId,
        uint256 batchId,
        uint256 additionalAmount,
        uint256 newTotalAmount,
        uint256 timestamp
    );

    /// @notice Emitted when an unmint request is claimed by the receiver
    /// @param receiver The address that claimed the request
    /// @param yAsset The address of the yield-bearing asset
    /// @param requestId The unique identifier of the claimed unmint request
    /// @param batchId The batch ID this request belongs to
    /// @param amount The amount of yAsset transferred to the receiver
    /// @param timestamp The timestamp when the request was claimed
    event UnmintRequestClaimed(
        address indexed receiver,
        address indexed yAsset,
        uint256 indexed requestId,
        uint256 batchId,
        uint256 amount,
        uint256 timestamp
    );

    /// @notice Emitted when an unmint batch is processed
    /// @param yAsset The address of the yield-bearing asset
    /// @param batchId The unique identifier of the processed batch
    /// @param totalAmount The total amount of yAsset in the batch
    /// @param processor The address that processed the batch
    /// @param timestamp The timestamp when the batch was processed
    event UnmintBatchProcessed(
        address indexed yAsset,
        uint256 indexed batchId,
        uint256 totalAmount,
        address indexed processor,
        uint256 timestamp
    );

    /// @notice Emitted when an emergency withdrawal is performed
    /// @param token The address of the token withdrawn
    /// @param to The address that received the tokens
    /// @param amount The amount withdrawn
    event EmergencyWithdraw(
        address indexed token,
        address indexed to,
        uint256 amount
    );

    /// @notice Emitted when the unmint batch duration is updated
    /// @param previousDuration The previous batch duration in seconds
    /// @param newDuration The new batch duration in seconds
    event UnmintBatchDurationUpdated(
        uint256 previousDuration,
        uint256 newDuration
    );

    // ================================================
    // ==================== Errors ====================
    // ================================================
    error ZeroAddress();
    error NotAdmin();
    error NotOperations();
    error ZeroAmount();

    error Unauthorized();
    error InvalidInput();
    error AlreadyClaimed();
    error BatchStillProcessing();
    error BatchAlreadyProcessed();
    error InvalidDuration();
    error Paused();
    error WithdrawFailed();
}
