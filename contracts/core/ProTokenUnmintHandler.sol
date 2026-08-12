// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "./state/ProTokenUnmintHandlerState.sol";
import "./interfaces/IProTokenUnmintHandler.sol";
import "./interfaces/IProTokenSettings.sol";
import "./interfaces/IVersioned.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ProTokenUnmintHandler
 * @notice Batches and settles unmint requests, paying out yAssets to receivers on claim.
 * @dev UUPS proxy logic with reentrancy protection. Pause state is read from
 *      ProTokenSettings (this contract does not inherit PausableUpgradeable).
 */
contract ProTokenUnmintHandler is
    ProTokenUnmintHandlerState,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable,
    IProTokenUnmintHandler,
    IVersioned
{
    using EnumerableSet for EnumerableSet.UintSet;
    using SafeERC20 for IERC20;

    /// @notice Implementation version (v1.0.0)
    uint256 public constant VERSION = 1_00_00;

    /// @notice Maximum number of requests allowed in batch claim operations
    uint256 public constant MAX_BATCH_SIZE = 10;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _proTokenSettings,
        uint256 _unmintBatchDuration
    ) public initializer {
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        if (_proTokenSettings == address(0)) revert ZeroAddress();
        if (_unmintBatchDuration == 0) revert InvalidDuration();

        proTokenSettings = _proTokenSettings;
        unmintBatchDuration = _unmintBatchDuration;

        emit UnmintBatchDurationUpdated(0, _unmintBatchDuration);
    }

    modifier onlyAdmin() {
        if (msg.sender != IProTokenSettings(proTokenSettings).getAdmin())
            revert NotAdmin();
        _;
    }

    modifier onlyOperationsContract() {
        if (
            msg.sender !=
            IProTokenSettings(proTokenSettings)
                .getProTokenInfo()
                .proTokenOperations
        ) revert NotOperations();
        _;
    }

    modifier whenNotPaused() {
        IProTokenSettings pauseSource = IProTokenSettings(proTokenSettings);
        if (pauseSource.isPaused()) revert Paused();
        _;
    }

    // ================================================
    // =========== Open External Functions ============
    // ================================================

    /**
     * @notice Claims multiple unmint requests for a specific yAsset
     * @dev Validates ownership and batch processing status before transferring tokens.
     *      All state changes are completed before token transfers to prevent reentrancy issues.
     * @param yAsset The address of the yield asset to claim
     * @param requestIds Array of request IDs to claim
     */
    function claimUnmintRequests(
        address yAsset,
        uint256[] memory requestIds
    ) external nonReentrant whenNotPaused {
        if (yAsset == address(0) || requestIds.length == 0)
            revert InvalidInput();
        if (requestIds.length > MAX_BATCH_SIZE) revert InvalidInput();

        uint256 currentTimestamp = block.timestamp;
        uint256 length = requestIds.length;

        for (uint256 i = 0; i < length; ) {
            uint256 requestId = requestIds[i];
            ProTokenUnmintHandlerTypes.UnmintRequest
                storage unmintRequest = unmintRequestsPerYAsset[yAsset][
                    requestId
                ];

            // Cache frequently accessed values
            address receiver = unmintRequest.receiver;
            uint256 batchId = unmintRequest.batchId;
            uint256 totalAmount = unmintRequest.totalAmount;

            if (receiver == address(0)) revert InvalidInput();
            if (!unmintBatchesPerYAsset[yAsset][batchId].processed)
                revert BatchStillProcessing();
            if (unmintRequest.claimed) revert AlreadyClaimed();

            // Update all state before any transfers
            unmintRequest.claimed = true;
            unmintRequest.claimTimestamp = currentTimestamp;
            // Update already claimed amount in batch
            unmintBatchesPerYAsset[yAsset][batchId]
                .totalAlreadyClaimed += totalAmount;
            // Remove from unclaimed list
            unclaimedUnmintBatchesPerReceiver[receiver][yAsset].remove(batchId);

            emit UnmintRequestClaimed(
                receiver,
                yAsset,
                requestId,
                batchId,
                totalAmount,
                currentTimestamp
            );

            // Pay this request's own stored receiver. Anyone may trigger the claim;
            // funds only ever go to the receiver chosen at request time.
            if (totalAmount > 0) {
                IERC20(yAsset).safeTransfer(receiver, totalAmount);
            }

            unchecked { ++i; }
        }
    }

    // ================================================
    // ======== Restricted External Functions =========
    // ================================================

    /**
     * @notice Creates a new unmint request or aggregates with existing request in current batch
     * @dev Only callable by the ProTokenOperations contract. Creates new batches when needed.
     * @param receiver The address that will receive the yAsset when claimed
     * @param yAsset The address of the yield asset to unmint
     * @param amount The amount of yAsset to unmint
     * @return requestId The ID of the created or updated unmint request
     */
    function createUnmintRequest(
        address receiver,
        address yAsset,
        uint256 amount
    ) external onlyOperationsContract returns (uint256 requestId) {
        if (receiver == address(0) || yAsset == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 curBatchId = curUnmintBatchIdPerYAsset[yAsset];
        ProTokenUnmintHandlerTypes.UnmintBatch storage curBatch =
            unmintBatchesPerYAsset[yAsset][curBatchId];

        // Open a new batch if the current one is processed, expired, or none exists yet.
        if (
            curBatch.processed ||
            curBatch.createTimestamp + unmintBatchDuration <= block.timestamp ||
            curBatchId == 0
        ) {
            unchecked { curBatchId = ++curUnmintBatchIdPerYAsset[yAsset]; }
            curBatch = unmintBatchesPerYAsset[yAsset][curBatchId];
            curBatch.yAsset = yAsset;
            curBatch.batchId = curBatchId;
            curBatch.createTimestamp = block.timestamp;
            // processed/processTimestamp default to false/0 on a fresh slot — no need to set.
        }

        curBatch.totalAmount += amount;
        unpaidQueuedLiability[yAsset] += amount;

        if (unclaimedUnmintBatchesPerReceiver[receiver][yAsset].contains(curBatchId)) {
            uint256 existingRequestId =
                unmintRequestIdForReceiverInBatch[yAsset][curBatchId][receiver];
            ProTokenUnmintHandlerTypes.UnmintRequest storage existingRequest =
                unmintRequestsPerYAsset[yAsset][existingRequestId];
            existingRequest.totalAmount += amount;
            existingRequest.amounts.push(amount);
            existingRequest.createTimestamps.push(block.timestamp);
            requestId = existingRequestId;

            emit UnmintRequestAggregated(
                receiver, yAsset, existingRequestId, curBatchId,
                amount, existingRequest.totalAmount, block.timestamp
            );
        } else {
            uint256 newRequestId = nextUnmintRequestIdPerYAsset[yAsset];
            ProTokenUnmintHandlerTypes.UnmintRequest storage newRequest =
                unmintRequestsPerYAsset[yAsset][newRequestId];
            newRequest.yAsset = yAsset;
            newRequest.requestId = newRequestId;
            newRequest.batchId = curBatchId;
            newRequest.receiver = receiver;
            newRequest.totalAmount = amount;
            newRequest.amounts.push(amount);
            newRequest.createTimestamps.push(block.timestamp);
            // claimed/claimTimestamp default false/0 — no need to set.

            unclaimedUnmintBatchesPerReceiver[receiver][yAsset].add(curBatchId);
            unchecked { ++nextUnmintRequestIdPerYAsset[yAsset]; }
            unmintRequestIdForReceiverInBatch[yAsset][curBatchId][receiver] = newRequestId;
            requestId = newRequestId;

            emit UnmintRequestCreated(
                receiver, yAsset, newRequestId, curBatchId, amount, block.timestamp
            );
        }
    }

    /**
     * @notice Processes the next unmint batch for a specific yAsset
     * @dev Only callable by operator, external business, or admin.
     *      Transfers the total batch amount from caller to this contract.
     * @param yAsset The address of the yield asset batch to process
     */
    function processNextUnmintBatch(address yAsset) external whenNotPaused {
        if (
            IProTokenSettings(proTokenSettings).getOperator() != msg.sender &&
            IProTokenSettings(proTokenSettings).getExternalBusiness() !=
            msg.sender &&
            IProTokenSettings(proTokenSettings).getAdmin() != msg.sender
        ) revert Unauthorized();
        if (yAsset == address(0)) revert ZeroAddress();
        // processing a batch involves just transfering from the sender the total amount to be unminted in that batch to this contract
        ProTokenUnmintHandlerTypes.UnmintBatch
            storage unmintBatch = unmintBatchesPerYAsset[yAsset][
                lastUnmintBatchIdProcessedPerYAsset[yAsset] + 1
            ];

        // check this batch exists
        if (unmintBatch.batchId == 0) revert InvalidInput();
        if (unmintBatch.processed) revert BatchAlreadyProcessed();

        // mark as processed
        unmintBatch.processed = true;
        unmintBatch.processTimestamp = block.timestamp;
        uint256 t = unmintBatch.totalAmount;
        unpaidQueuedLiability[yAsset] = t >= unpaidQueuedLiability[yAsset]
            ? 0 : unpaidQueuedLiability[yAsset] - t;

        // transfer the total amount from msg.sender to this contract
        IERC20(yAsset).safeTransferFrom(
            msg.sender,
            address(this),
            unmintBatch.totalAmount
        );

        // update last processed batch id
        ++lastUnmintBatchIdProcessedPerYAsset[yAsset];

        emit UnmintBatchProcessed(
            yAsset,
            unmintBatch.batchId,
            unmintBatch.totalAmount,
            msg.sender,
            block.timestamp
        );
    }

    // ================================================
    // =========== Owner External Functions ===========
    // ================================================

    /// @notice Sets the duration for unmint batches
    /// @dev Only callable by admin. Duration must be greater than 0.
    /// @param _duration The new batch duration in seconds
    function setUnmintBatchDuration(uint256 _duration) external onlyAdmin {
        if (_duration == 0) revert InvalidDuration();

        uint256 previousDuration = unmintBatchDuration;
        unmintBatchDuration = _duration;

        emit UnmintBatchDurationUpdated(previousDuration, _duration);
    }

    /// @notice Emergency withdrawal of any ERC20 tokens stuck in the contract
    /// @dev Only callable by admin. Use with caution - this is for emergency recovery only.
    ///      SECURITY NOTE: The onlyAdmin modifier provides sufficient access control for this
    ///      emergency function. The low-level call pattern for ETH transfers is acceptable
    ///      here since the admin is a trusted role and controls the recipient address.
    /// @param _token Address of the token to withdraw (use address(0) for native ETH)
    /// @param _to Address to send the tokens to
    /// @param _amount Amount to withdraw
    function emergencyWithdraw(
        address _token,
        address _to,
        uint256 _amount
    ) external onlyAdmin {
        if (_to == address(0)) revert ZeroAddress();
        if (_amount == 0) revert ZeroAmount();

        if (_token == address(0)) {
            // Withdraw native ETH
            (bool success, ) = _to.call{value: _amount}("");
            if (!success) revert WithdrawFailed();
        } else {
            // Withdraw ERC20 tokens
            IERC20(_token).safeTransfer(_to, _amount);
        }

        emit EmergencyWithdraw(_token, _to, _amount);
    }

    // ================================================
    // ================ View functions ================
    // ================================================

    /// @inheritdoc IProTokenUnmintHandler
    function getUnmintRequest(
        address yAsset,
        uint256 requestId
    ) external view returns (ProTokenUnmintHandlerTypes.UnmintRequest memory) {
        return unmintRequestsPerYAsset[yAsset][requestId];
    }

    /// @inheritdoc IProTokenUnmintHandler
    function getUnmintBatch(
        address yAsset,
        uint256 batchId
    ) external view returns (ProTokenUnmintHandlerTypes.UnmintBatch memory) {
        return unmintBatchesPerYAsset[yAsset][batchId];
    }

    /// @inheritdoc IProTokenUnmintHandler
    function getCurrentUnmintBatchId(
        address yAsset
    ) external view returns (uint256) {
        return curUnmintBatchIdPerYAsset[yAsset];
    }

    /// @inheritdoc IProTokenUnmintHandler
    function getLastProcessedBatchId(
        address yAsset
    ) external view returns (uint256) {
        return lastUnmintBatchIdProcessedPerYAsset[yAsset];
    }

    /// @inheritdoc IProTokenUnmintHandler
    function getNextUnmintRequestId(
        address yAsset
    ) external view returns (uint256) {
        return nextUnmintRequestIdPerYAsset[yAsset];
    }

    /// @inheritdoc IProTokenUnmintHandler
    function getUnmintBatchDuration() external view returns (uint256) {
        return unmintBatchDuration;
    }

    /// @inheritdoc IProTokenUnmintHandler
    function getUnclaimedBatchesForReceiver(
        address receiver,
        address yAsset
    ) external view returns (uint256[] memory) {
        return unclaimedUnmintBatchesPerReceiver[receiver][yAsset].values();
    }

    /// @inheritdoc IProTokenUnmintHandler
    function getUnmintRequestIdForReceiverInBatch(
        address yAsset,
        uint256 batchId,
        address receiver
    ) external view returns (uint256) {
        return unmintRequestIdForReceiverInBatch[yAsset][batchId][receiver];
    }

    /// @inheritdoc IProTokenUnmintHandler
    function getUnpaidQueuedLiability(address yAsset) external view returns (uint256) {
        return unpaidQueuedLiability[yAsset];
    }

    /// @inheritdoc IProTokenUnmintHandler
    function isUnmintRequestClaimed(
        address yAsset,
        uint256 requestId
    ) external view returns (bool) {
        return unmintRequestsPerYAsset[yAsset][requestId].claimed;
    }

    /// @inheritdoc IProTokenUnmintHandler
    function isUnmintBatchProcessed(
        address yAsset,
        uint256 batchId
    ) external view returns (bool) {
        return unmintBatchesPerYAsset[yAsset][batchId].processed;
    }

    /// @inheritdoc IProTokenUnmintHandler
    function canBatchBeProcessed(
        address yAsset,
        uint256 batchId
    ) external view returns (bool) {
        ProTokenUnmintHandlerTypes.UnmintBatch
            storage unmintBatch = unmintBatchesPerYAsset[yAsset][batchId];

        // Batch doesn't exist
        if (unmintBatch.batchId == 0) return false;

        // Already processed
        if (unmintBatch.processed) return false;

        return true;
    }

    /// @inheritdoc IProTokenUnmintHandler
    function getProTokenSettings() external view returns (address) {
        return proTokenSettings;
    }

    /// @inheritdoc IProTokenUnmintHandler
    function getUnclaimedRequestsForReceiver(
        address receiver,
        address yAsset
    )
        external
        view
        returns (
            ProTokenUnmintHandlerTypes.UnmintRequest[] memory requests,
            uint256 lastUnmintBatchIdProcessed
        )
    {
        uint256[] memory batchIds = unclaimedUnmintBatchesPerReceiver[receiver][
            yAsset
        ].values();
        requests = new ProTokenUnmintHandlerTypes.UnmintRequest[](
            batchIds.length
        );

        for (uint256 i = 0; i < batchIds.length; ++i) {
            uint256 requestId = unmintRequestIdForReceiverInBatch[yAsset][
                batchIds[i]
            ][receiver];
            requests[i] = unmintRequestsPerYAsset[yAsset][requestId];
        }

        lastUnmintBatchIdProcessed = lastUnmintBatchIdProcessedPerYAsset[
            yAsset
        ];
    }

    // ================================================
    // ============== Internal functions ==============
    // ================================================

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyAdmin {
        uint256 newVersion = IVersioned(newImplementation).VERSION();
        if (newVersion <= VERSION) {
            revert VersionNotIncremented(VERSION, newVersion);
        }
    }
}
