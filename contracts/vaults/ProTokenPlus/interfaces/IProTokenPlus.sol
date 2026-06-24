// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;
pragma abicoder v2;

import "../types/ProTokenPlusTypes.sol";

/// @title IProTokenPlus
/// @author Promis Team
/// @notice Interface for the ProTokenPlus vault contract
/// @dev ProTokenPlus is a vault system for locking ProUSD tokens to earn additional yield.
///      Users lock ProUSD into tiers (Quarterly, Semi-Annual, Annual) and earn rewards based on
///      lock duration.
interface IProTokenPlus {
    // ================================================
    // =========== Open External Functions ============
    // ================================================

    /// @notice Request a Lock of ProUSD into a tier to earn rewards
    /// @dev Creates a new lock request. Transfers ProUSD from caller to vault.
    /// @param tierID Tier to lock into (must be depositable and active)
    /// @param amount Amount of ProUSD to lock (must be >= tier's minDeposit)
    /// @param unlockedPositionsToMerge Optional array of unlocked position IDs to merge (can be empty)
    function createDepositRequest(
        uint8 tierID,
        uint256 amount,
        uint256[] calldata unlockedPositionsToMerge
    ) external;

    /// @notice Request unbonding process to withdraw from unlocked balances on specified positions
    /// @dev When finalized, moves funds from unlocked balance positions to unbonding. No rewards during unbonding.
    ///      After unbonding period, call completeWithdraw() to claim funds.
    ///      Optionally merges unlocked positions before the main action.
    /// @param positionIDs Array of position IDs to withdraw from (must be owned by caller and unlocked)
    /// @param unlockedPositionsToMerge Optional array of unlocked position IDs to merge (can be empty)
    function createWithdrawRequest(
        uint256[] calldata positionIDs,
        uint256[] calldata unlockedPositionsToMerge
    ) external;

    /// @notice Complete unbonding and receive ProUSD
    /// @dev Transfers ProUSD to caller after unbonding period has elapsed.
    ///      Emits Withdrawn event for each completed unbonding request.
    ///      Optionally merges unlocked positions before the main action.
    /// @param unbondingIndices Array of unbonding request indices to complete
    /// @param unlockedPositionsToMerge Optional array of unlocked position IDs to merge (can be empty)
    function completeWithdraw(
        uint256[] calldata unbondingIndices,
        uint256[] calldata unlockedPositionsToMerge
    ) external;

    /// @notice Relocate unlocked positions to a different tier with a new lock
    /// @dev Creates a new locked position from multiple unlocked positions.
    ///      All source positions are marked as RELOCATED.
    ///      Emits PositionRelocated event.
    ///      Optionally merges unlocked positions before the main action.
    /// @param positionIds Array of position IDs to relocate (must be owned by caller and unlocked)
    /// @param amount Amount to relock (must be > 0 and <= total unlocked balance of provided positions)
    /// @param toTierId Tier to lock into (must be depositable and active)
    /// @param unlockedPositionsToMerge Optional array of unlocked position IDs to merge (can be empty)
    /// @return newPositionId The ID of the newly created position
    function relock(
        uint256[] calldata positionIds,
        uint256 amount,
        uint8 toTierId,
        uint256[] calldata unlockedPositionsToMerge
    ) external returns (uint256 newPositionId);

    /// @notice Consolidate multiple unlocked positions on the same tier into a single position
    /// @dev All source positions are marked as UNLOCKED_MERGED.
    ///      Creates a new ACTIVE position with combined amount.
    ///      Emits UnlockedMerged event.
    /// @param positionIds Array of position IDs to merge (must be owned by caller, unlocked, same tier)
    /// @return newPositionId The ID of the newly created position
    function unlockedMerge(
        uint256[] calldata positionIds
    ) external returns (uint256 newPositionId);

    // ================================================
    // =========== Owner External Functions ===========
    // ================================================

    /**
     * @notice Pauses the contract, disabling certain functions
     * @dev Only callable by admin. Uses OpenZeppelin's PausableUpgradeable
     */
    function pause() external;

    /**
     * @notice Unpauses the contract, re-enabling paused functions
     * @dev Only callable by admin. Uses OpenZeppelin's PausableUpgradeable
     */
    function unpause() external;

    /// @notice Add a new tier configuration
    /// @dev Creates a new tier. All tier fields are mutable via updateTierConfig().
    ///      Tier 0 is reserved as the floor tier (non-depositable).
    ///      Emits TierAdded event.
    /// @param tierId Tier identifier (must not already exist)
    /// @param config Full tier configuration
    function addTier(
        uint8 tierId,
        ProTokenPlusTypes.TierConfig calldata config
    ) external;

    /// @notice Update tier configuration
    /// @dev All tier fields can be modified after creation.
    ///      NOTE: Emits TierConfigUpdated event.
    /// @param tierId Tier to update (must exist)
    /// @param name New tier name
    /// @param apr New rewards apr in e18
    /// @param duration New lock duration in seconds
    /// @param minDeposit New minimum deposit amount
    /// @param isDepositable Whether tier accepts deposits
    /// @param isActive New active status
    function updateTierConfig(
        uint8 tierId,
        string calldata name,
        uint256 apr,
        uint256 duration,
        uint256 minDeposit,
        bool isDepositable,
        bool isActive
    ) external;

    /// @notice Update the unbonding period
    /// @dev Affects all future unbonding requests. Existing requests keep their original end time.
    ///      Emits UnbondingPeriodSet event.
    /// @param period New unbonding period in seconds
    function setUnbondingPeriod(uint256 period) external;

    /// @notice Set the ProUSD token address
    /// @dev Can only be set once or changed by admin. Used for deposits and withdrawals.
    ///      Emits ProUSDSet event.
    /// @param _proUSD Address of the ProUSD token contract
    function setProUSD(address _proUSD) external;

    /// @notice Set the operations handler implementation address
    /// @dev Only admin can set. Enforces version compatibility.
    ///      The operations handler is a satellite contract called via delegatecall
    ///      for all user operations. NOT a proxy - plain implementation.
    ///      Emits OperationsHandlerSet event.
    /// @param _operationsHandler Address of ProTokenPlusOperations implementation
    function setOperationsHandler(address _operationsHandler) external;

    /// @notice Set a deposit cap for all users
    /// @dev Only admin can set. Enforces a total deposit cap for the protocol.
    /// @param _depositCap Deposit cap to set
    function setDepositCap(uint256 _depositCap) external;

    // ================================================
    // ================ View functions ================
    // ================================================

    /**
     * @notice Checks if the contract is currently paused
     * @dev Inherits from OpenZeppelin's PausableUpgradeable. When paused, certain operations
     *      may be restricted depending on implementation in the main contract.
     * @return paused True if contract is paused, false otherwise
     */
    function isPaused() external view returns (bool paused);

    /// @notice Get configurations for specified tiers
    /// @dev If tierIds is empty, returns all tiers.
    /// @param tierIds Array of tier identifiers (empty array returns all tiers)
    /// @return responses Array of tier configurations with their IDs
    function getTiers(
        uint8[] calldata tierIds
    )
        external
        view
        returns (ProTokenPlusTypes.TierConfigResponse[] memory responses);

    /// @notice Get paginated position IDs for a user
    /// @dev Use for pagination to get position IDs, then call getUserPositions() with those IDs
    /// @param user Address of the user
    /// @param startIndex Starting index for pagination
    /// @param count Number of position IDs to return
    /// @param activeOnly If true, returns only active positions; if false, returns only inactive positions
    /// @return positionIds Array of position IDs
    /// @return totalCount Total number of positions (active or inactive based on activeOnly)
    function getUserPositionIds(
        address user,
        uint256 startIndex,
        uint256 count,
        bool activeOnly
    ) external view returns (uint256[] memory positionIds, uint256 totalCount);

    /// @notice Get multiple positions by ID in a single call
    /// @dev For efficient indexer bootstrapping and batch queries
    /// @param positionIds Array of position IDs to query
    /// @return responses Array of position data (includes exists flag for non-existent positions)
    function getUserPositions(
        uint256[] calldata positionIds
    ) external view returns (ProTokenPlusTypes.PositionView[] memory responses);

    /// @notice Get paginated unbonding requests for a user
    /// @param user Address of the user
    /// @param startIndex Starting index for pagination
    /// @param count Number of requests to return
    /// @return requests Array of unbonding requests
    function getUnbondingRequests(
        address user,
        uint256 startIndex,
        uint256 count
    )
        external
        view
        returns (ProTokenPlusTypes.UnbondingRequest[] memory requests);

    /// @notice Get total unbonding request count for a user
    /// @param user Address of the user
    /// @return count Total number of unbonding requests
    function getUnbondingRequestCount(
        address user
    ) external view returns (uint256 count);

    /// @notice Get all active unbonding indices for a user
    /// @dev Returns only indices of unbonding requests that are still active (not yet completed).
    ///      Use these indices with getUnbondingRequests() to fetch the actual request data.
    ///      This is more efficient for UI than iterating through all historical requests.
    /// @param user Address of the user
    /// @return indices Array of active unbonding request indices
    function getActiveUnbondingIndices(
        address user
    ) external view returns (uint256[] memory indices);

    /// @notice Get aggregated balance summary for a user in a single call
    /// @dev Iterates all active positions on-chain to compute real-time balances.
    ///      Ideal for overview/dashboard pages to avoid multiple RPC calls.
    /// @param user Address of the user
    /// @return summary Aggregated balance data including per-tier breakdown
    function getUserBalanceSummary(
        address user
    )
        external
        view
        returns (ProTokenPlusTypes.UserBalanceSummary memory summary);

    // ================================================
    // ==================== Events ====================
    // ================================================

    /// @notice Emitted when user adds tokens to the vault
    /// @param user Address of the position owner
    /// @param positionId Unique position identifier that received the new tokens
    /// @param amount Amount of new ProUSD deposited
    event Deposited(
        address indexed user,
        uint256 indexed positionId,
        uint256 amount
    );

    /// @notice Emitted when a new position is created
    /// @param user Address of the position owner
    /// @param positionId Unique position identifier
    /// @param amount Amount of ProUSD locked
    /// @param lockedTierId Tier the position was created in
    /// @param expiry Timestamp when lock expires
    event PositionCreated(
        address indexed user,
        uint256 indexed positionId,
        uint256 amount,
        uint8 lockedTierId,
        uint64 expiry
    );

    /// @notice Emitted when funds are merged into an existing position (locked merge)
    /// @param user Address of the position owner
    /// @param newPositionId New position created with combined amount
    /// @param oldPositionId Original position that was merged (now LOCKED_MERGED)
    /// @param oldPositionAmount Amount that was in the old position
    /// @param addedAmount Amount added to the position
    /// @param totalAmount Total amount in the new position
    /// @param lockedTierId Tier the position is locked in
    /// @param oldPositionLockExpiry Lock expiry of the old position (for tier time calculation)
    /// @param newExpiry New lock expiry (reset to full duration)
    event PositionMerged(
        address indexed user,
        uint256 indexed newPositionId,
        uint256 oldPositionId,
        uint256 oldPositionAmount,
        uint256 addedAmount,
        uint256 totalAmount,
        uint8 lockedTierId,
        uint64 oldPositionLockExpiry,
        uint64 newExpiry
    );

    /// @notice Emitted when unbonding is initiated
    /// @param user Address initiating unbonding
    /// @param unbondingIndex Index of the unbonding request
    /// @param amount Amount being unbonded
    /// @param unbondingEnd Timestamp when unbonding completes
    /// @param positionsUsed Array tracking which positions were used for this withdrawal
    event UnbondingStarted(
        address indexed user,
        uint256 indexed unbondingIndex,
        uint256 amount,
        uint64 unbondingEnd,
        ProTokenPlusTypes.WithdrawRequestPosition[] positionsUsed
    );

    /// @notice Emitted when unbonding is completed and funds withdrawn
    /// @param user Address receiving funds
    /// @param unbondingIndex Index of the completed unbonding request
    /// @param amount Amount withdrawn
    event Withdrawn(
        address indexed user,
        uint256 indexed unbondingIndex,
        uint256 amount
    );

    /// @notice Emitted when a position is deactivated (merged, relocated, or withdrawn)
    /// @dev Contains all data needed to calculate weight contribution without lookups
    /// @param user Address of the position owner
    /// @param positionId Position that was deactivated
    /// @param newStatus New status of the position
    /// @param amount Amount of ProUSD in the position
    /// @param lockedTierId Tier the position was locked in
    /// @param lockExpiry When the position's lock expired/expires
    /// @param activeFromTimestamp When position became active (creation timestamp)
    /// @param activeToTimestamp Timestamp when position became inactive
    event PositionDeactivated(
        address indexed user,
        uint256 indexed positionId,
        ProTokenPlusTypes.PositionStatus newStatus,
        uint256 amount,
        uint8 lockedTierId,
        uint64 lockExpiry,
        uint64 activeFromTimestamp,
        uint64 activeToTimestamp
    );

    /// @notice Emitted when unlocked positions are merged into a single position
    /// @param user Address of the user
    /// @param newPositionId ID of the newly created position
    /// @param mergedPositionIds Array of position IDs that were merged
    /// @param totalAmount Total amount in the new position
    /// @param tierId Tier of the merged positions
    event UnlockedMerged(
        address indexed user,
        uint256 indexed newPositionId,
        uint256[] mergedPositionIds,
        uint256 totalAmount,
        uint8 tierId
    );

    /// @notice Emitted when positions are relocated to a different tier
    /// @param user Address of the user
    /// @param newPositionId ID of the newly created position
    /// @param relocatedPositionIds Array of position IDs that were relocated
    /// @param fromTierId Original tier of the positions
    /// @param toTierId Target tier for the new position
    /// @param totalAmount Total amount in the new position
    /// @param newExpiry Lock expiry for new position
    event PositionRelocated(
        address indexed user,
        uint256 indexed newPositionId,
        uint256[] relocatedPositionIds,
        uint8 fromTierId,
        uint8 toTierId,
        uint256 totalAmount,
        uint64 newExpiry
    );

    /// @notice Emitted when a new tier is added
    /// @param tierId Tier identifier
    /// @param name Tier name
    /// @param apr Rewards apr in e18
    /// @param duration Lock duration in seconds
    /// @param minDeposit Minimum deposit amount
    /// @param isDepositable Whether tier accepts deposits
    event TierAdded(
        uint8 indexed tierId,
        string name,
        uint256 apr,
        uint256 duration,
        uint256 minDeposit,
        bool isDepositable
    );

    /// @notice Emitted when tier configuration is updated
    /// @param tierId Tier identifier
    /// @param name New tier name
    /// @param apr New rewards apr in e18
    /// @param duration New lock duration in seconds
    /// @param minDeposit New minimum deposit amount
    /// @param isDepositable Whether tier accepts deposits
    /// @param isActive New active status
    event TierConfigUpdated(
        uint8 indexed tierId,
        string name,
        uint256 apr,
        uint256 duration,
        uint256 minDeposit,
        bool isDepositable,
        bool isActive
    );

    /// @notice Emitted when unbonding period is changed
    /// @param oldPeriod Previous unbonding period
    /// @param newPeriod New unbonding period
    event UnbondingPeriodSet(uint256 oldPeriod, uint256 newPeriod);

    /// @notice Emitted when ProUSD address is set
    /// @param oldProUSD Previous ProUSD address
    /// @param newProUSD New ProUSD address
    event ProUSDSet(address indexed oldProUSD, address indexed newProUSD);

    /// @notice Emitted when operations handler is set
    /// @param oldHandler Previous operations handler address
    /// @param newHandler New operations handler address
    event OperationsHandlerSet(
        address indexed oldHandler,
        address indexed newHandler
    );

    /// @notice Emitted when a protocol wide deposit cap is set
    /// @param oldCap Old deposit cap
    /// @param newCap new deposit cap
    event DepositCapSet(uint256 indexed oldCap, uint256 indexed newCap);

    event DepositRequestCreated(uint256 requestID, address user, uint8 tierID, uint256 amount, uint256[] unlockedPositionsToMerge);
    event DepositRequestFinalized(uint256 requestID, address user, uint256 positionID, uint8 tierID, uint256 amount, uint256[] unlockedPositionsToMerge, uint8 proofKind);
    event WithdrawRequestCreated(uint256 requestID, address user, uint256[] positionIDs, uint256[] unlockedPositionsToMerge);
    event WithdrawRequestFinalized(uint256 requestID, address user, uint256[] positionIDs, uint256[] unlockedPositionsToMerge, uint8 proofKind);
    // ================================================
    // ==================== Errors ====================
    // ================================================

    /// @notice Thrown when zero address is provided
    error ZeroAddress();

    /// @notice Thrown when tier ID is has a problem
    /// @param tierId The invalid tier ID
    error TierError(uint8 tierId);

    /// @notice Thrown when position doesn't exist
    /// @param positionId The non-existent position ID
    error PositionNotFound(uint256 positionId);

    /// @notice Thrown when caller doesn't own the position
    /// @param positionId The position not owned by caller
    error PositionNotOwned(uint256 positionId);

    /// @notice Thrown when requested amount exceeds available balance
    /// @param requested Amount requested
    /// @param available Amount available
    error InsufficientBalance(uint256 requested, uint256 available);

    /// @notice Thrown when unbonding period hasn't completed
    /// @param unbondingEnd When unbonding completes
    error UnbondingNotComplete(uint64 unbondingEnd);

    /// @notice Thrown when unbonding request doesn't exist or is inactive
    /// @param unbondingIndex The invalid unbonding index
    error UnbondingNotFound(uint256 unbondingIndex);

    /// @notice Thrown when amount is zero or invalid
    error ZeroAmount();

    /// @notice Thrown when deposit amount is below tier's minimum
    /// @param amount Amount attempted to deposit
    /// @param minDeposit Minimum required deposit
    error BelowMinDeposit(uint256 amount, uint256 minDeposit);

    /// @notice Thrown when provided tier config arrays have mismatched lengths
    error TierConfigLengthMismatch();

    /// @notice Thrown when position is not active
    /// @param positionId The position that is not active
    error PositionNotActive(uint256 positionId);

    /// @notice Thrown when position is not unlocked (still locked)
    /// @param positionId The position that is not unlocked
    error PositionNotUnlocked(uint256 positionId);

    /// @notice Thrown when positions have mismatched tiers
    /// @param positionId The position with wrong tier
    /// @param expectedTier Expected tier ID
    /// @param actualTier Actual tier ID
    error PositionTierMismatch(
        uint256 positionId,
        uint8 expectedTier,
        uint8 actualTier
    );

    /// @notice Thrown when an empty position array is provided
    error EmptyPositionArray();

    /// @notice Thrown when version doesn't match between main and satellite
    /// @param mainVersion Version of the main contract
    /// @param satelliteVersion Version of the satellite contract
    error VersionMismatch(uint256 mainVersion, uint256 satelliteVersion);

    /// @notice Thrown when tier duration is zero for non-floor tiers
    error InvalidDuration();
    
    /// @notice Thrown when duplicate position IDs are provided in an array
    /// @param positionId The duplicate position ID
    error DuplicatePositionId(uint256 positionId);

    /// @notice Thrown when attempting to create a zero-amount position
    error ZeroAmountPosition();
    error Unauthorized();
    error RequestNotPending();
    error InvalidProofKind();
    error IrrelevantProofKind();
    error ImpossibleState();
    error NotAdmin();
    error InvalidAuthority();
    error DepositCapReached(uint256 current, uint256 maxAllowed);
}
