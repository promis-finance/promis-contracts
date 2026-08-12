// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../core/interfaces/IVersioned.sol";
import "../../core/interfaces/IProTokenSettings.sol";
import "./state/ProTokenPlusState.sol";
import "./types/ProTokenPlusTypes.sol";
import "./interfaces/IProTokenPlus.sol";
import "./interfaces/IProTokenPlusOperations.sol";

/**
 * @title ProTokenPlus
 * @author Promis Team
 * @notice Vault for locking proUSD into tiers to earn additional variable yield.
 * @dev UUPS proxy with a satellite pattern for bytecode size reduction.
 *
 *      Users lock proUSD into tiers (e.g. Quarterly, Semi-Annual, Annual) to earn rewards
 *      based on lock duration.
 *
 *      ARCHITECTURE:
 *      - This contract is the entry point: modifiers, admin functions, and view functions.
 *      - User operations are delegatecalled into ProTokenPlusOperations.
 *      - The satellite is a pure logic module (no proxy, no initializer).
 */
contract ProTokenPlus is
    ProTokenPlusState,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    EIP712Upgradeable,
    UUPSUpgradeable,
    IProTokenPlus,
    IVersioned
{
    using SafeERC20 for IERC20;

    /// @notice Implementation version (v1.0.0)
    uint256 public constant VERSION = 1_00_00;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize the contract
    /// @dev Sets up initial state and default tier configuration.
    ///      Called once during proxy deployment.
    /// @param _proTokenSettings Address of ProTokenSettings for admin access
    /// @param _proUSD Address of ProUSD token
    /// @param _tierIds All tier ids to introduce
    /// @param _tierConfigs Corresponding configuration for tier Ids
    function initialize(
        address _proTokenSettings,
        address _proUSD,
        uint8[] calldata _tierIds,
        ProTokenPlusTypes.TierConfig[] calldata _tierConfigs
    ) external initializer {
        __Pausable_init();
        __ReentrancyGuard_init();
        __EIP712_init("ProTokenPlus", "1");
        __UUPSUpgradeable_init();

        if (_proTokenSettings == address(0)) revert ZeroAddress();
        if (_proUSD == address(0)) revert ZeroAddress();

        proTokenSettings = _proTokenSettings;
        proUSD = _proUSD;
        unbondingPeriod = 14 days; // default 2 weeks
        nextPositionId = 1;

        // Validate tier inputs
        if (
            _tierIds.length != _tierConfigs.length
        ) {
            revert TierConfigLengthMismatch();
        }

        // Add tiers
        for (uint8 i = 0; i < _tierIds.length; i++) {
            uint8 tierId = _tierIds[i];
            if (tierId != FLOOR_TIER_ID && _tierConfigs[i].duration == 0) revert InvalidDuration();
            tierIds.push(tierId);
            tiers[tierId] = _tierConfigs[i];
            emit TierAdded(
                tierId,
                _tierConfigs[i].name,
                _tierConfigs[i].apr,
                _tierConfigs[i].duration,
                _tierConfigs[i].minDeposit,
                _tierConfigs[i].isDepositable
            );
        }

        emit ProUSDSet(address(0), _proUSD);
        emit UnbondingPeriodSet(0, unbondingPeriod);
        
    }

    // ================================================
    // =================== Modifiers ==================
    // ================================================

    /// @notice Restricts function to admin only
    /// @dev Admin is retrieved from ProTokenSettings contract
    modifier onlyAdmin() {
        IProTokenSettings ownerSource = IProTokenSettings(proTokenSettings);
        if (msg.sender != ownerSource.getAdmin()) revert NotAdmin();
        _;
    }

    // ================================================
    // ============ Delegatecall Helper ===============
    // ================================================

    /// @notice Internal helper for delegatecall to operations handler
    /// @dev Bubbles up revert reasons from the satellite contract
    /// @param data Encoded function call data
    /// @return result The return data from the delegatecall
    /// @custom:oz-upgrades-unsafe-allow delegatecall
    function _delegateToOperations(
        bytes memory data
    ) internal returns (bytes memory result) {
        if (operationsHandler == address(0)) revert ZeroAddress();

        bool success;
        (success, result) = operationsHandler.delegatecall(data);
        if (!success) {
            // Bubble up the revert reason
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    // ================================================
    // =========== Open External Functions ============
    // ================================================

    /// @inheritdoc IProTokenPlus
    function createDepositRequest(
        uint8 _tierID,
        uint256 _amount
    ) 
        external
        override
        nonReentrant 
        whenNotPaused 
    {
        _delegateToOperations(
            abi.encodeCall(
                IProTokenPlusOperations.executeCreateDepositRequest,
                (msg.sender, _tierID, _amount)
            )
        );
    }

    function finalizeDepositRequest(
        uint256 _requestID, 
        ProTokenPlusTypes.ProofKind _proofKind,
        uint256 _deadline, 
        bytes calldata _proof
    ) 
        external 
        nonReentrant
        whenNotPaused 
        returns (uint256 positionID)
    {
        bytes memory result = _delegateToOperations(
            abi.encodeCall(
                IProTokenPlusOperations.executeFinalizeDepositRequest,
                (msg.sender, _requestID, _proofKind, _deadline, _proof)
            )
        );
        return abi.decode(result, (uint256));
    }

    /// @inheritdoc IProTokenPlus
    function createWithdrawRequest(
        uint256[] calldata _positionIDs
    ) 
        external 
        override
        nonReentrant 
        whenNotPaused 
    {
        _delegateToOperations(
            abi.encodeCall(
                IProTokenPlusOperations.executeCreateWithdrawRequest,
                (msg.sender, _positionIDs)
            )
        );
    }

    function finalizeWithdrawRequest(
        uint256 _requestID, 
        ProTokenPlusTypes.ProofKind _proofKind, 
        uint256 _deadline, 
        bytes calldata _proof
    ) 
        external 
        nonReentrant 
        whenNotPaused
        returns (uint256 unbondingIndex)
    {
        bytes memory result = _delegateToOperations(
            abi.encodeCall(
                IProTokenPlusOperations.executeFinalizeWithdrawRequest,
                (msg.sender, _requestID, _proofKind, _deadline, _proof)
            )
        );
        return abi.decode(result, (uint256));
    }

    /// @inheritdoc IProTokenPlus
    function completeWithdraw(
        uint256[] calldata unbondingIndices
    ) external override nonReentrant whenNotPaused {
        _delegateToOperations(
            abi.encodeCall(
                IProTokenPlusOperations.executeCompleteWithdraw,
                (msg.sender, unbondingIndices)
            )
        );
    }

    /// @inheritdoc IProTokenPlus
    function relock(
        uint256[] calldata positionIds,
        uint256 amount,
        uint8 toTierId
    )
        external
        override
        nonReentrant
        whenNotPaused
        returns (uint256 newPositionId)
    {
        bytes memory result = _delegateToOperations(
            abi.encodeCall(
                IProTokenPlusOperations.executeRelock,
                (
                    msg.sender,
                    positionIds,
                    amount,
                    toTierId
                )
            )
        );
        return abi.decode(result, (uint256));
    }

    /// @inheritdoc IProTokenPlus
    function unlockedMerge(
        uint256[] calldata positionIds
    )
        external
        override
        nonReentrant
        whenNotPaused
        returns (uint256 newPositionId)
    {
        bytes memory result = _delegateToOperations(
            abi.encodeCall(
                IProTokenPlusOperations.executeUnlockedMerge,
                (msg.sender, positionIds)
            )
        );
        return abi.decode(result, (uint256));
    }

    // ================================================
    // =========== Owner External Functions ===========
    // ================================================

    /// @inheritdoc IProTokenPlus
    function pause() external onlyAdmin {
        _pause();
    }

    /// @inheritdoc IProTokenPlus
    function unpause() external onlyAdmin {
        _unpause();
    }

    /// @inheritdoc IProTokenPlus
    function addTier(
        uint8 tierId,
        ProTokenPlusTypes.TierConfig calldata config
    ) external override onlyAdmin {
        // Check tier doesn't already exist
        if (tiers[tierId].isActive || bytes(tiers[tierId].name).length > 0) {
            revert TierError(tierId);
        }

        if (tierId != FLOOR_TIER_ID && config.duration == 0) revert InvalidDuration();

        tierIds.push(tierId);
        tiers[tierId] = config;

        emit TierAdded(
            tierId,
            config.name,
            config.apr,
            config.duration,
            config.minDeposit,
            config.isDepositable
        );
    }

    /// @inheritdoc IProTokenPlus
    function updateTierConfig(
        uint8 tierId,
        string calldata name,
        uint256 apr,
        uint256 duration,
        uint256 minDeposit,
        bool isDepositable,
        bool isActive
    ) external override onlyAdmin {
        ProTokenPlusTypes.TierConfig storage tier = tiers[tierId];

        // Tier must exist
        if (bytes(tier.name).length == 0) revert TierError(tierId);

        // Non-floor tiers must have duration > 0
        if (tierId != FLOOR_TIER_ID && duration == 0) revert InvalidDuration();

        tier.name = name;
        tier.apr = apr;
        tier.duration = duration;
        tier.minDeposit = minDeposit;
        tier.isDepositable = isDepositable;
        tier.isActive = isActive;

        emit TierConfigUpdated(
            tierId,
            name,
            apr,
            duration,
            minDeposit,
            isDepositable,
            isActive
        );
    }

    /// @inheritdoc IProTokenPlus
    function setUnbondingPeriod(uint256 period) external override onlyAdmin {
        uint256 oldPeriod = unbondingPeriod;
        unbondingPeriod = period;

        emit UnbondingPeriodSet(oldPeriod, period);
    }

    /// @inheritdoc IProTokenPlus
    function setProUSD(address _proUSD) external override onlyAdmin {
        if (_proUSD == address(0)) revert ZeroAddress();

        address oldProUSD = proUSD;
        proUSD = _proUSD;

        emit ProUSDSet(oldProUSD, _proUSD);
    }

    /// @inheritdoc IProTokenPlus
    function setOperationsHandler(
        address _operationsHandler
    ) external override onlyAdmin {
        if (_operationsHandler == address(0)) revert ZeroAddress();

        // Enforce version compatibility
        uint256 opVersion = IVersioned(_operationsHandler).VERSION();
        if (opVersion != VERSION) revert VersionMismatch(VERSION, opVersion);

        address oldHandler = operationsHandler;
        operationsHandler = _operationsHandler;
        emit OperationsHandlerSet(oldHandler, _operationsHandler);
    }

    /// @inheritdoc IProTokenPlus
    function setDepositCap(uint256 _depositCap) external override onlyAdmin {
        uint256 oldCap = depositCap;
        depositCap = _depositCap;
        emit DepositCapSet(oldCap, _depositCap);
    }

    // ================================================
    // ================ View functions ================
    // ================================================

    /// @inheritdoc IProTokenPlus
    function isPaused() external view override returns (bool) {
        return paused();
    }

    /// @inheritdoc IProTokenPlus
    function getTiers(
        uint8[] calldata tierIdsToQuery
    )
        external
        view
        override
        returns (ProTokenPlusTypes.TierConfigResponse[] memory responses)
    {
        // If empty array, return all tiers
        if (tierIdsToQuery.length == 0) {
            uint256 length = tierIds.length;
            responses = new ProTokenPlusTypes.TierConfigResponse[](length);

            for (uint256 i = 0; i < length; ++i) {
                uint8 tierId = tierIds[i];
                responses[i] = ProTokenPlusTypes.TierConfigResponse({
                    tierId: tierId,
                    config: tiers[tierId]
                });
            }
        } else {
            // Return only requested tiers
            responses = new ProTokenPlusTypes.TierConfigResponse[](
                tierIdsToQuery.length
            );

            for (uint256 i = 0; i < tierIdsToQuery.length; ++i) {
                uint8 tierId = tierIdsToQuery[i];
                responses[i] = ProTokenPlusTypes.TierConfigResponse({
                    tierId: tierId,
                    config: tiers[tierId]
                });
            }
        }
    }

    /// @inheritdoc IProTokenPlus
    function getUserPositionIds(
        address user,
        uint256 startIndex,
        uint256 count,
        bool activeOnly
    )
        external
        view
        override
        returns (uint256[] memory positionIdsResult, uint256 totalCount)
    {
        if (activeOnly) {
            totalCount = activePositionCount[user];
        } else {
            totalCount = inactivePositionCount[user];
        }

        uint256 actualCount = count;
        if (startIndex >= totalCount) {
            actualCount = 0;
        } else if (startIndex + count > totalCount) {
            actualCount = totalCount - startIndex;
        }

        positionIdsResult = new uint256[](actualCount);

        for (uint256 i = 0; i < actualCount; ++i) {
            if (activeOnly) {
                positionIdsResult[i] = activePositionIds[user][startIndex + i];
            } else {
                positionIdsResult[i] = inactivePositionIds[user][
                    startIndex + i
                ];
            }
        }
    }

    /// @inheritdoc IProTokenPlus
    function getUserPositions(
        uint256[] calldata positionIdsToQuery
    )
        external
        view
        override
        returns (ProTokenPlusTypes.PositionView[] memory responses)
    {
        responses = new ProTokenPlusTypes.PositionView[](
            positionIdsToQuery.length
        );

        for (uint256 i = 0; i < positionIdsToQuery.length; ++i) {
            uint256 positionId = positionIdsToQuery[i];
            ProTokenPlusTypes.Position storage pos = positions[positionId];

            // Return positionId=0 for non-existent positions instead of reverting
            // This allows batch queries to succeed even if some IDs are invalid,
            // improving UX for range queries and reducing round-trips
            if (pos.owner == address(0)) {
                responses[i] = ProTokenPlusTypes.PositionView({
                    positionId: 0,
                    owner: address(0),
                    amount: 0,
                    lockedRewards: 0,
                    lockedTierId: 0,
                    lockExpiry: 0,
                    state: ProTokenPlusTypes.PositionState.LOCKED,
                    activeFromTimestamp: 0,
                    activeToTimestamp: 0,
                    status: ProTokenPlusTypes.PositionStatus.ACTIVE
                });
            } else {
                responses[i] = _getPositionView(positionId);
            }
        }
    }

    /// @inheritdoc IProTokenPlus
    function getUnbondingRequests(
        address user,
        uint256 startIndex,
        uint256 count
    )
        external
        view
        override
        returns (ProTokenPlusTypes.UnbondingRequest[] memory requests)
    {
        uint256 totalCount = userUnbondingCount[user];

        uint256 actualCount = count;
        if (startIndex >= totalCount) {
            actualCount = 0;
        } else if (startIndex + count > totalCount) {
            actualCount = totalCount - startIndex;
        }

        requests = new ProTokenPlusTypes.UnbondingRequest[](actualCount);

        for (uint256 i = 0; i < actualCount; ++i) {
            requests[i] = unbondingRequests[user][startIndex + i];
        }
    }

    /// @inheritdoc IProTokenPlus
    function getUnbondingRequestCount(
        address user
    ) external view override returns (uint256 count) {
        return userUnbondingCount[user];
    }

    /// @inheritdoc IProTokenPlus
    function getActiveUnbondingIndices(
        address user
    ) external view override returns (uint256[] memory indices) {
        return activeUnbondingIndices[user];
    }

    /// @inheritdoc IProTokenPlus
    function getUserBalanceSummary(
        address user
    )
        external
        view
        override
        returns (ProTokenPlusTypes.UserBalanceSummary memory summary)
    {
        uint256 posCount = activePositionCount[user];

        // Distinct tiers seen, plus parallel locked/unlocked accumulators.
        uint8[] memory seenTiers = new uint8[](tierIds.length);
        uint256[] memory lockedByTier = new uint256[](tierIds.length);
        uint256[] memory unlockedByTier = new uint256[](tierIds.length);
        uint256 seenCount = 0;

        for (uint256 i = 0; i < posCount; ) {
            ProTokenPlusTypes.Position storage pos = positions[activePositionIds[user][i]];
            uint8 tier = pos.lockedTierId;
            uint256 amount = pos.amount;

            // Find or register the tier's slot.
            uint256 slot = seenCount;
            for (uint256 j = 0; j < seenCount; ) {
                if (seenTiers[j] == tier) { slot = j; break; }
                unchecked { ++j; }
            }
            if (slot == seenCount) {
                seenTiers[seenCount] = tier;
                unchecked { ++seenCount; }
            }

            if (_isEffectivelyUnlocked(pos)) {
                unlockedByTier[slot] += amount;
                summary.totalUnlocked += amount;
            } else {
                lockedByTier[slot] += amount;
                summary.totalLocked += amount;
            }
            unchecked { ++i; }
        }

        // Active unbonding total.
        uint256[] storage unbondingIndices = activeUnbondingIndices[user];
        uint256 ubLen = unbondingIndices.length;
        for (uint256 i = 0; i < ubLen; ) {
            ProTokenPlusTypes.UnbondingRequest storage req =
                unbondingRequests[user][unbondingIndices[i]];
            if (req.isActive) summary.totalUnbonding += req.amount;
            unchecked { ++i; }
        }

        // Build the result, sized to the distinct tiers actually used.
        summary.tierBalances = new ProTokenPlusTypes.TierBalance[](seenCount);
        for (uint256 i = 0; i < seenCount; ) {
            summary.tierBalances[i] = ProTokenPlusTypes.TierBalance({
                tierId: seenTiers[i],
                lockedAmount: lockedByTier[i],
                unlockedAmount: unlockedByTier[i]
            });
            unchecked { ++i; }
        }

        summary.activePositionCount = posCount;
    }

    // ================================================
    // ============== Internal functions ==============
    // ================================================

    /// @notice Check if a position is effectively unlocked (expired)
    /// @param position The position to check
    /// @return True if position has expired
    function _isEffectivelyUnlocked(
        ProTokenPlusTypes.Position storage position
    ) internal view returns (bool) {
        return block.timestamp >= position.lockExpiry;
    }

    /// @notice Get effective state for a position
    /// @dev Computes state based on expiry time
    /// @param position The position to evaluate
    /// @return state The effective state
    function _getEffectiveState(
        ProTokenPlusTypes.Position storage position
    ) internal view returns (ProTokenPlusTypes.PositionState state) {
        if (_isEffectivelyUnlocked(position)) {
            return ProTokenPlusTypes.PositionState.UNLOCKED;
        }
        return ProTokenPlusTypes.PositionState.LOCKED;
    }

    /// @notice Build a position view with computed effective state
    /// @param positionId ID of the position
    /// @return view Position data with effective state
    function _getPositionView(
        uint256 positionId
    ) internal view returns (ProTokenPlusTypes.PositionView memory) {
        ProTokenPlusTypes.Position storage position = positions[positionId];

        return
            ProTokenPlusTypes.PositionView({
                positionId: positionId,
                owner: position.owner,
                amount: position.amount,
                lockedRewards: position.lockedRewards,
                lockedTierId: position.lockedTierId,
                lockExpiry: position.lockExpiry,
                state: _getEffectiveState(position),
                activeFromTimestamp: position.activeFromTimestamp,
                activeToTimestamp: position.activeToTimestamp,
                status: position.status
            });
    }

    /// @notice Authorize upgrade to new implementation
    /// @dev Only admin can upgrade. New version must be higher than current.
    /// @param newImplementation Address of new implementation
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyAdmin {
        uint256 newVersion = IVersioned(newImplementation).VERSION();
        if (newVersion <= VERSION) {
            revert VersionNotIncremented(VERSION, newVersion);
        }
    }
}
