// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../core/interfaces/IVersioned.sol";
import "../../core/interfaces/IProToken.sol";
import "../../core/interfaces/IProTokenSettings.sol";
import "./state/ProTokenPlusState.sol";
import "./types/ProTokenPlusTypes.sol";
import "./interfaces/IProTokenPlusOperations.sol";
import "./interfaces/IProTokenPlus.sol";
import "./interfaces/IStrategyVault.sol";

/**
 * @title ProTokenPlusOperations
 * @author Promis Team
 * @notice Satellite logic module for ProTokenPlus user operations.
 * @dev Pure logic, called via delegatecall from ProTokenPlus — no proxy, no initializer,
 *      not independently upgradeable. Direct calls are blocked by onlyDelegatecall, every
 *      function verifies msg.sender matches the passed caller, and the storage layout MUST
 *      match ProTokenPlusState exactly.
 */
contract ProTokenPlusOperations is
    ProTokenPlusState,
    EIP712Upgradeable,
    IProTokenPlusOperations,
    IVersioned
{
    using SafeERC20 for IERC20;

    // ================================================
    // ================= Immutables ===================
    // ================================================

    /// @notice Self-reference for delegatecall detection
    /// @dev Set in constructor, used by onlyDelegatecall modifier
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address private immutable SELF;

    // ================================================
    // ================= Constants ====================
    // ================================================

    /// @notice Implementation version (must match ProTokenPlus.VERSION)
    uint256 public constant VERSION = 1_00_00;
    uint256 constant SECONDS_PER_YEAR = 365 days;
    bytes32 constant DEPOSIT_PROOF_TYPEHASH = keccak256(
        "DepositProof(uint256 requestId,uint8 tierID,uint256 amount,address user,uint256[] unlockedPositionsToMerge,uint256 deadline,uint8 proofKind)"
    );
    bytes32 constant WITHDRAW_PROOF_TYPEHASH = keccak256(
        "WithdrawProof(uint256 requestId,uint256[] positionIDs,address user,uint256[] unlockedPositionsToMerge,uint256 deadline,uint8 proofKind)"
    );

    // ================================================
    // ================= Constructor ==================
    // ================================================

    /// @notice Constructor sets immutable self-reference
    /// @dev No initializer - this is a pure logic module
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
        SELF = address(this);
    }

    // ================================================
    // ================== Modifiers ===================
    // ================================================

    /// @notice Ensures function is only called via delegatecall
    /// @dev Compares address(this) with SELF - they differ during delegatecall
    modifier onlyDelegatecall() {
        if (address(this) == SELF) revert DirectCallForbidden();
        _;
    }

    // ================================================
    // ============= Execute Functions ================
    // ================================================

    /// @inheritdoc IProTokenPlusOperations
    function executeCreateDepositRequest(
        address _caller, 
        uint8 _tierID, 
        uint256 _amount, 
        uint256[] calldata _unlockedPositionsToMerge
    ) external override onlyDelegatecall {
        if (_caller != msg.sender) revert CallerMismatch();
        if (_amount == 0) revert IProTokenPlus.ZeroAmount();

        IERC20(proUSD).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );

        ProTokenPlusTypes.TierConfig storage tier = tiers[_tierID];
        uint256 _min = _convertToBase(_amount);
        if (tier.minDeposit > 0 && _min < tier.minDeposit) revert IProTokenPlus.BelowMinDeposit(_min, tier.minDeposit);
        
        totalPendingDeposits += _amount;

        uint256 requestID = depositRequestID++;
        depositRequests[requestID] = ProTokenPlusTypes.DepositRequest({
            tierID: _tierID,
            amount: _amount,
            user: _caller,
            unlockedPositionsToMerge: _unlockedPositionsToMerge,

            status: ProTokenPlusTypes.Status.PENDING
        });

        emit IProTokenPlus.DepositRequestCreated(requestID, _caller, _tierID, _amount, _unlockedPositionsToMerge);
    }

    /// @inheritdoc IProTokenPlusOperations
    function executeFinalizeDepositRequest(
        address _caller,
        uint256 _requestID, 
        ProTokenPlusTypes.ProofKind _proofKind, 
        uint256 _deadline,
        bytes calldata _proof
    ) external onlyDelegatecall returns (uint256 positionID) {
        if (_caller != msg.sender) revert CallerMismatch();
        
        ProTokenPlusTypes.DepositRequest storage request = depositRequests[_requestID];
        if (request.status != ProTokenPlusTypes.Status.PENDING) revert IProTokenPlus.RequestNotPending();
        if (_caller != request.user) revert IProTokenPlus.Unauthorized();

        bytes32 structHash = keccak256(
            abi.encode(
                DEPOSIT_PROOF_TYPEHASH,
                _requestID,
                request.tierID,
                request.amount,
                request.user,
                keccak256(abi.encodePacked(request.unlockedPositionsToMerge)),
                _deadline,
                uint8(_proofKind)
            )
        );

        _verifyProof(structHash, _proof);
        if (block.timestamp > _deadline) revert ProofExpired();

        request.status = ProTokenPlusTypes.Status.EXECUTED;
        totalPendingDeposits -= request.amount;

        

        if (_proofKind == ProTokenPlusTypes.ProofKind.PROOF_OF_APPROVE) {
            // Merge unlocked positions if provided (aggregates before main action)
            _mergeUnlockedIfProvided(request.user, request.unlockedPositionsToMerge);
            
            positionID = _executeDeposit(
                request.user, request.tierID, request.amount
            );
        } else if (_proofKind == ProTokenPlusTypes.ProofKind.PROOF_OF_RETURN) {            
            IERC20(proUSD).safeTransfer(
                request.user,
                request.amount
            );
        } else revert IProTokenPlus.InvalidProofKind();

        emit IProTokenPlus.DepositRequestFinalized(_requestID, request.user, positionID, request.tierID, request.amount, request.unlockedPositionsToMerge, uint8(_proofKind));
    }

    function _executeDeposit(
        address caller,
        uint8 tierId,
        uint256 amount
    ) internal returns (uint256 positionId) {
        ProTokenPlusTypes.TierConfig storage tier = tiers[tierId];
        if (!tier.isActive) revert IProTokenPlus.TierError(tierId);
        if (!tier.isDepositable) revert IProTokenPlus.TierError(tierId);

        // Create position with both tier IDs
        uint256 worthBase = _convertToBase(amount);
        if (depositCap != 0 && totalDepositsBase + worthBase > depositCap) revert IProTokenPlus.DepositCapReached(totalDepositsBase + worthBase, depositCap);

        positionId = _createPosition(
            caller,
            tierId,
            worthBase,
            _calculateRewards(tierId, worthBase, tier.duration)
        );

        totalDepositsBase += worthBase;

        // Send to StrategyVault
        address strategyVault = IProTokenSettings(proTokenSettings).getStrategyVault();
        IERC20(proUSD).safeIncreaseAllowance(strategyVault, amount);
        IStrategyVault(strategyVault).give(amount, worthBase);

        // emit Deposited event of how much new tokens were deposited to the vault by the user
        emit IProTokenPlus.Deposited(caller, positionId, amount);
    }

    /// @inheritdoc IProTokenPlusOperations
    function executeCreateWithdrawRequest(
        address _caller,
        uint256[] calldata _positionIDs,
        uint256[] calldata _unlockedPositionsToMerge
    ) external override onlyDelegatecall {
        if (_caller != msg.sender) revert CallerMismatch();
        if (_positionIDs.length == 0) revert IProTokenPlus.EmptyPositionArray();
        _detectDuplicatedPositionIds(_positionIDs);

        // Validate every position
        for (uint256 i = 0; i < _positionIDs.length; i++) {
            uint256 posId = _positionIDs[i];
            ProTokenPlusTypes.Position storage position = positions[posId];

            if (position.owner == address(0))
                revert IProTokenPlus.PositionNotFound(posId);
            if (position.owner != _caller)
                revert IProTokenPlus.PositionNotOwned(posId);
            if (position.status != ProTokenPlusTypes.PositionStatus.ACTIVE) {
                revert IProTokenPlus.PositionNotActive(posId);
            }
            if (!_isEffectivelyUnlocked(position)) {
                revert IProTokenPlus.PositionNotUnlocked(posId);
            }
        }

        uint256 requestID = withdrawRequestID++;
        withdrawRequests[requestID] = ProTokenPlusTypes.WithdrawRequest({
            positionIDs: _positionIDs,
            user: _caller,
            unlockedPositionsToMerge: _unlockedPositionsToMerge,
            status: ProTokenPlusTypes.Status.PENDING
        });

        emit IProTokenPlus.WithdrawRequestCreated(requestID, _caller, _positionIDs, _unlockedPositionsToMerge);
    }

    /// @inheritdoc IProTokenPlusOperations
    function executeFinalizeWithdrawRequest(
        address _caller,
        uint256 _requestID, 
        ProTokenPlusTypes.ProofKind _proofKind, 
        uint256 _deadline,
        bytes calldata _proof
    ) external onlyDelegatecall returns (uint256 unbondingIndex) {
        if (_caller != msg.sender) revert CallerMismatch();

        ProTokenPlusTypes.WithdrawRequest storage request = withdrawRequests[_requestID];
        if (request.status != ProTokenPlusTypes.Status.PENDING) revert IProTokenPlus.RequestNotPending();
        if (_caller != request.user) revert IProTokenPlus.Unauthorized();

        if (_proofKind != ProTokenPlusTypes.ProofKind.PROOF_OF_APPROVE) revert IProTokenPlus.IrrelevantProofKind();

        bytes32 structHash = keccak256(
            abi.encode(
                WITHDRAW_PROOF_TYPEHASH,
                _requestID,
                keccak256(abi.encodePacked(request.positionIDs)),
                request.user,
                keccak256(abi.encodePacked(request.unlockedPositionsToMerge)),
                _deadline,
                uint8(_proofKind)
            )
        );

        _verifyProof(structHash, _proof);
        if (block.timestamp > _deadline) revert ProofExpired();

        request.status = ProTokenPlusTypes.Status.EXECUTED;

        unbondingIndex = _executeInitiateWithdraw(request.user, request.positionIDs, request.unlockedPositionsToMerge);

        emit IProTokenPlus.WithdrawRequestFinalized(_requestID, request.user, request.positionIDs, request.unlockedPositionsToMerge, uint8(_proofKind));
    }

    function _executeInitiateWithdraw(
        address caller,
        uint256[] memory positionIds,
        uint256[] memory unlockedPositionsToMerge
    ) internal returns (uint256 unbondingIndex) {
        // Merge unlocked positions if provided (aggregates before main action)
        _mergeUnlockedIfProvided(caller, unlockedPositionsToMerge);

        // Calculate total available and validate all positions
        uint256 totalAvailable;

        for (uint256 i = 0; i < positionIds.length; i++) {
            uint256 posId = positionIds[i];
            ProTokenPlusTypes.Position storage position = positions[posId];

            if (position.owner == address(0))
                revert IProTokenPlus.PositionNotFound(posId);
            if (position.owner != caller)
                revert IProTokenPlus.PositionNotOwned(posId);
            if (position.status != ProTokenPlusTypes.PositionStatus.ACTIVE) {
                revert IProTokenPlus.PositionNotActive(posId);
            }
            if (!_isEffectivelyUnlocked(position)) {
                revert IProTokenPlus.PositionNotUnlocked(posId);
            }

            totalAvailable += position.amount + position.lockedRewards;
            totalDepositsBase -= position.amount;
        }

        // Create unbonding request — amount stored in base until completeWithdraw
        unbondingIndex = userUnbondingCount[caller];
        ProTokenPlusTypes.UnbondingRequest storage request = unbondingRequests[
            caller
        ][unbondingIndex];

        request.amount = totalAvailable;
        request.unbondingEnd = uint64(block.timestamp + unbondingPeriod);
        request.isActive = true;

        // Process positions and track which ones were used
        _processWithdrawPositions(positionIds, request);

        // Update global accounting
        userUnbondingCount[caller]++;
        totalUnbonding += totalAvailable;

        address strategyVault = IProTokenSettings(proTokenSettings).getStrategyVault();
        IStrategyVault(strategyVault).earmark(request.amount);

        // Track active unbonding index for efficient UI queries
        activeUnbondingIndices[caller].push(unbondingIndex);

        // Copy positionsUsed to memory for event
        ProTokenPlusTypes.WithdrawRequestPosition[]
            memory positionsUsedMemory = new ProTokenPlusTypes.WithdrawRequestPosition[](
                request.positionsUsed.length
            );
        for (uint256 i = 0; i < request.positionsUsed.length; i++) {
            positionsUsedMemory[i] = request.positionsUsed[i];
        }

        emit IProTokenPlus.UnbondingStarted(
            caller,
            unbondingIndex,
            totalAvailable,
            request.unbondingEnd,
            positionsUsedMemory
        );
    }

    /// @inheritdoc IProTokenPlusOperations
    function executeCompleteWithdraw(
        address caller,
        uint256[] calldata unbondingIndices,
        uint256[] calldata unlockedPositionsToMerge
    ) external onlyDelegatecall {
        if (caller != msg.sender) revert CallerMismatch();

        // Merge unlocked positions if provided (aggregates before main action)
        _mergeUnlockedIfProvided(caller, unlockedPositionsToMerge);

        if (unbondingIndices.length == 0)
            revert IProTokenPlus.EmptyPositionArray();

        uint256 totalAmount = 0;
        uint256 totalAmountBase = 0;
        for (uint256 i = 0; i < unbondingIndices.length; i++) {
            uint256 unbondingIndex = unbondingIndices[i];
            ProTokenPlusTypes.UnbondingRequest
                storage request = unbondingRequests[caller][unbondingIndex];

            if (!request.isActive)
                revert IProTokenPlus.UnbondingNotFound(unbondingIndex);
            if (block.timestamp < request.unbondingEnd) {
                revert IProTokenPlus.UnbondingNotComplete(request.unbondingEnd);
            }

            uint256 amountBase = request.amount;
            uint256 payoutAmount = _convertFromBase(amountBase);

            // Mark as completed
            request.isActive = false;
            totalUnbonding -= amountBase;
            totalAmount += payoutAmount;
            totalAmountBase += amountBase;

            // Remove from active unbonding indices
            _removeFromActiveUnbondingIndices(caller, unbondingIndex);

            emit IProTokenPlus.Withdrawn(caller, unbondingIndex, payoutAmount);
        }

        // Pull the required proUSD back from the StrategyVault, then pay the user.
        // The strategist refills the vault during the unbonding period so this balance
        // is available by the time completeWithdraw is callable.
        address strategyVault = IProTokenSettings(proTokenSettings).getStrategyVault();
        IStrategyVault(strategyVault).take(totalAmount, totalAmountBase);
        IERC20(proUSD).safeTransfer(caller, totalAmount);
    }

    /// @inheritdoc IProTokenPlusOperations
    function executeRelock(
        address caller,
        uint256[] calldata positionIds,
        uint256 amount,
        uint8 toTierId,
        uint256[] calldata unlockedPositionsToMerge
    ) external onlyDelegatecall returns (uint256 newPositionId) {
        if (caller != msg.sender) revert CallerMismatch();

        // Merge unlocked positions if provided (aggregates before main action)
        _mergeUnlockedIfProvided(caller, unlockedPositionsToMerge);

        if (amount == 0) revert IProTokenPlus.ZeroAmount();
        if (positionIds.length == 0) revert IProTokenPlus.EmptyPositionArray();

        // Check for duplicate position IDs
        _detectDuplicatedPositionIds(positionIds);

        // Validate destination tier
        ProTokenPlusTypes.TierConfig storage toTier = tiers[toTierId];
        if (!toTier.isActive || !toTier.isDepositable)
            revert IProTokenPlus.TierError(toTierId);

        // Check minimum deposit for destination tier
        if (toTier.minDeposit > 0 && amount < toTier.minDeposit) {
            revert IProTokenPlus.BelowMinDeposit(amount, toTier.minDeposit);
        }

        // Validate positions and check total balance
        uint8 fromTierId = _validateRelockPositions(
            caller,
            positionIds,
            amount
        );

        // Process positions (deactivate and split if necessary)
        uint256[] memory usedPositionIds = _processRelockPositions(
            caller,
            positionIds,
            amount
        );

        // Create new position
        newPositionId = _createPosition(
            caller,
            toTierId,
            amount,
            _calculateRewards(toTierId, amount, toTier.duration)
        );

        totalDepositsBase += amount;

        address strategyVault = IProTokenSettings(proTokenSettings).getStrategyVault();
        IStrategyVault(strategyVault).regive(amount);

        _emitRelockEvent(
            caller,
            newPositionId,
            usedPositionIds,
            fromTierId,
            toTierId,
            amount
        );
    }

    /// @inheritdoc IProTokenPlusOperations
    function executeUnlockedMerge(
        address caller,
        uint256[] calldata positionIds
    ) external onlyDelegatecall returns (uint256 newPositionId) {
        if (caller != msg.sender) revert CallerMismatch();

        newPositionId = _executeUnlockedMerge(caller, positionIds);
    }

    // ================================================
    // ============= Internal Functions ===============
    // ================================================

    function _verifyProof(
        bytes32 _structHash,
        bytes calldata _proof
    ) internal view {
        bytes32 digest = _hashTypedDataV4(_structHash);
        address signer = ECDSA.recover(digest, _proof);

        bool auth = IProTokenSettings(proTokenSettings).isAuthority(signer);
        if (!auth) revert IProTokenPlus.InvalidAuthority();
    }

    /// @notice Internal helper to merge unlocked positions if provided
    /// @dev Called at the start of action functions to aggregate unlocked positions.
    ///      Skips if fewer than 2 positions provided (nothing to merge).
    /// @param caller The caller address
    /// @param positionIds Array of unlocked position IDs to merge (can be empty or single)
    /// @return newPositionId The ID of the newly created merged position, or 0 if no merge occurred
    function _mergeUnlockedIfProvided(
        address caller,
        uint256[] memory positionIds
    ) internal returns (uint256 newPositionId) {
        if (positionIds.length < 2) return 0; // Need at least 2 to merge
        return _executeUnlockedMerge(caller, positionIds);
    }

    /// @notice Execute the unlocked merge logic
    /// @dev Shared implementation used by both executeUnlockedMerge() and _mergeUnlockedIfProvided()
    /// @param caller The caller address
    /// @param positionIds Array of unlocked position IDs to merge
    /// @return newPositionId The ID of the newly created merged position
    function _executeUnlockedMerge(
        address caller,
        uint256[] memory positionIds
    ) internal returns (uint256 newPositionId) {
        if (positionIds.length == 0) revert IProTokenPlus.EmptyPositionArray();

        // Check for duplicate position IDs
        _detectDuplicatedPositionIds(positionIds);

        // Calculate total amount and validate all positions
        uint256 totalAmount;
        uint256 totalRewards;
        uint8 tierId;

        for (uint256 i = 0; i < positionIds.length; i++) {
            uint256 posId = positionIds[i];
            ProTokenPlusTypes.Position storage position = positions[posId];

            if (position.owner == address(0))
                revert IProTokenPlus.PositionNotFound(posId);
            if (position.owner != caller)
                revert IProTokenPlus.PositionNotOwned(posId);
            if (position.status != ProTokenPlusTypes.PositionStatus.ACTIVE) {
                revert IProTokenPlus.PositionNotActive(posId);
            }
            if (!_isEffectivelyUnlocked(position)) {
                revert IProTokenPlus.PositionNotUnlocked(posId);
            }

            // All positions must be on the same tier
            uint8 effectiveTier = position.lockedTierId;
            if (i == 0) {
                tierId = effectiveTier;
            } else if (effectiveTier != tierId) {
                revert IProTokenPlus.PositionTierMismatch(
                    posId,
                    tierId,
                    effectiveTier
                );
            }

            totalAmount += position.amount;
            totalRewards += position.lockedRewards;
        }

        // Deactivate all source positions
        for (uint256 i = 0; i < positionIds.length; i++) {
            totalDepositsBase -= positions[positionIds[i]].amount;
            _deactivatePosition(
                positionIds[i],
                ProTokenPlusTypes.PositionStatus.UNLOCKED_MERGED
            );
        }

        // Create new unlocked position
        newPositionId = nextPositionId++;

        positions[newPositionId] = ProTokenPlusTypes.Position({
            owner: caller,
            amount: totalAmount,
            lockedTierId: tierId,
            lockExpiry: uint64(block.timestamp), // Already expired = unlocked
            activeFromTimestamp: uint64(block.timestamp),
            activeToTimestamp: 0,
            status: ProTokenPlusTypes.PositionStatus.ACTIVE,
            lockedRewards: totalRewards
        });

        totalDepositsBase += totalAmount;

        // Add to active positions list
        _addToActivePositions(caller, newPositionId);

        // Convert positionIds to memory array for event
        uint256[] memory mergedIds = new uint256[](positionIds.length);
        for (uint256 i = 0; i < positionIds.length; i++) {
            mergedIds[i] = positionIds[i];
        }

        emit IProTokenPlus.UnlockedMerged(
            caller,
            newPositionId,
            mergedIds,
            totalAmount,
            tierId
        );

        emit IProTokenPlus.PositionCreated(
            caller,
            newPositionId,
            totalAmount,
            tierId,
            uint64(block.timestamp)
        );
    }

    /// @notice Validate positions for relock
    /// @param caller The caller address
    /// @param positionIds Array of position IDs to check
    /// @param amount Amount to relock
    /// @return fromTierId The effective tier of the positions
    function _validateRelockPositions(
        address caller,
        uint256[] calldata positionIds,
        uint256 amount
    ) internal view returns (uint8 fromTierId) {
        uint256 totalAvailable;

        for (uint256 i = 0; i < positionIds.length; i++) {
            uint256 posId = positionIds[i];
            ProTokenPlusTypes.Position storage position = positions[posId];

            if (position.owner == address(0))
                revert IProTokenPlus.PositionNotFound(posId);
            if (position.owner != caller)
                revert IProTokenPlus.PositionNotOwned(posId);
            if (position.status != ProTokenPlusTypes.PositionStatus.ACTIVE) {
                revert IProTokenPlus.PositionNotActive(posId);
            }
            if (!_isEffectivelyUnlocked(position)) {
                revert IProTokenPlus.PositionNotUnlocked(posId);
            }

            // All positions must be on the same tier (their effective/unlocked tier)
            uint8 effectiveTier = position.lockedTierId;
            if (i == 0) {
                fromTierId = effectiveTier;
            } else if (effectiveTier != fromTierId) {
                revert IProTokenPlus.PositionTierMismatch(
                    posId,
                    fromTierId,
                    effectiveTier
                );
            }

            totalAvailable += position.amount + position.lockedRewards;
        }

        if (amount > totalAvailable) {
            revert IProTokenPlus.InsufficientBalance(amount, totalAvailable);
        }
    }

    /// @notice Emit PositionRelocated event
    /// @dev Extracted to avoid stack too deep
    function _emitRelockEvent(
        address caller,
        uint256 newPositionId,
        uint256[] memory usedPositionIds,
        uint8 fromTierId,
        uint8 toTierId,
        uint256 amount
    ) internal {
        ProTokenPlusTypes.Position storage newPosition = positions[
            newPositionId
        ];
        emit IProTokenPlus.PositionRelocated(
            caller,
            newPositionId,
            usedPositionIds,
            fromTierId,
            toTierId,
            amount,
            newPosition.lockExpiry
        );
    }

    /// @notice Process positions for relock (deactivate and split)
    /// @param caller The caller address
    /// @param positionIds Array of position IDs to process
    /// @param amount Amount to relock
    /// @return usedPositionIds Array of position IDs that were used
    function _processRelockPositions(
        address caller,
        uint256[] calldata positionIds,
        uint256 amount
    ) internal returns (uint256[] memory usedPositionIds) {
        uint256 remainingAmount = amount;
        uint256 usedCount = 0;

        // First count how many we will use to allocate memory
        uint256 tempRemaining = amount;
        for (uint256 i = 0; i < positionIds.length && tempRemaining > 0; i++) {
            ProTokenPlusTypes.Position storage position = positions[positionIds[i]];
            uint256 positionAmount = position.amount + position.lockedRewards;
            tempRemaining = positionAmount <= tempRemaining ? tempRemaining - positionAmount : 0;
            usedCount++;
        }

        usedPositionIds = new uint256[](usedCount);

        for (uint256 i = 0; i < usedCount; i++) {
            uint256 posId = positionIds[i];
            usedPositionIds[i] = posId;
            ProTokenPlusTypes.Position storage position = positions[posId];

            uint256 p = position.amount;
            uint256 r = position.lockedRewards;
            uint256 positionAmount = p + r;

            totalDepositsBase -= p;
            _deactivatePosition(posId, ProTokenPlusTypes.PositionStatus.RELOCATED);

            if (positionAmount <= remainingAmount) {
                // Use full position amount
                remainingAmount -= positionAmount;
            } else {
                // Partial use - slice principle first
                uint256 s = remainingAmount;

                _createRemainderPosition(
                    caller,
                    s >= p ? 0 : p - s,
                    s >= p ? (positionAmount - s) : r,
                    position.lockedTierId,
                    position.lockExpiry
                );

                remainingAmount = 0;
            }
        }
    }

    /// @notice Create a new locked position
    /// @dev Internal function used by deposit() and relock()
    /// @param owner Address of position owner
    /// @param lockedTierId Tier to lock into
    /// @param amount Amount to lock
    /// @param rewards Pre-calculated rewards to lock
    /// @return positionId ID of created position
    function _createPosition(
        address owner,
        uint8 lockedTierId,
        uint256 amount,
        uint256 rewards
    ) internal returns (uint256 positionId) {
        positionId = nextPositionId++;

        ProTokenPlusTypes.TierConfig storage tier = tiers[lockedTierId];
        uint64 lockExpiry = uint64(block.timestamp + tier.duration);

        positions[positionId] = ProTokenPlusTypes.Position({
            owner: owner,
            amount: amount,
            lockedTierId: lockedTierId,
            lockExpiry: lockExpiry,
            activeFromTimestamp: uint64(block.timestamp),
            activeToTimestamp: 0,
            status: ProTokenPlusTypes.PositionStatus.ACTIVE,
            lockedRewards: rewards
        });

        // Add to active positions list
        _addToActivePositions(owner, positionId);

        emit IProTokenPlus.PositionCreated(
            owner,
            positionId,
            amount,
            lockedTierId,
            lockExpiry
        );
    }

    /// @notice Convert proUSD amount to base denomination
    /// @dev If the base denomination was other than USD such as USDT,
    ///      simply use proUSD/USDT price source 
    /// @param amount Amount of proUSD to convert
    function _convertToBase(uint256 amount) internal view returns (uint256) {
        return (amount * IProToken(proUSD).getUSDPrice()) / 1e18;
    }

    /// @notice Convert base denominated amount to proUSD
    /// @dev If the base denomination was other than USD such as USDT,
    ///      simply use proUSD/USDT price source
    /// @param amount Amount of base denomated value to convert
    function _convertFromBase(uint256 amount) internal view returns (uint256) {
        return (amount * 1e18) / IProToken(proUSD).getUSDPrice();
    }

    /// @notice Calculates rewards based on base denominated amount
    /// @dev Uses APR not APY
    /// @param principal Amount to apply APR on
    /// @param duration Duration to calculate APR for
    function _calculateRewards(
        uint8 tierId,
        uint256 principal, 
        uint256 duration
    ) internal view returns (uint256) {
        
        uint256 apr = tiers[tierId].apr;
        if (apr == 0 || duration == 0) return 0;

        return (principal * apr * duration) / (SECONDS_PER_YEAR * 1e18);
    }

    /// @notice Process positions for withdrawal and populate the unbonding request
    /// @dev Extracted to avoid stack too deep in executeInitiateWithdraw
    /// @param positionIds Array of position IDs to process
    /// @param request The unbonding request to populate
    function _processWithdrawPositions(
        uint256[] memory positionIds,
        ProTokenPlusTypes.UnbondingRequest storage request
    ) internal {
        for (uint256 i = 0; i < positionIds.length; i++) {
            uint256 posId = positionIds[i];
            ProTokenPlusTypes.Position storage position = positions[posId];

            ProTokenPlusTypes.WithdrawRequestPosition memory wrp;
            wrp.positionId = posId;
            wrp.amountUsed = position.amount + position.lockedRewards;
            wrp.remainderPositionId = 0;

            _deactivatePosition(
                posId,
                ProTokenPlusTypes.PositionStatus.WITHDRAWN
            );

            request.positionsUsed.push(wrp);
        }
    }

    /// @notice Creates a remainder position for a partial relock.
    /// @dev Used only by _processRelockPositions when a position is partially consumed.
    ///      (The full-position withdrawal path does not create remainders.)
    /// @param owner Address of position owner
    /// @param remainderPrincipleBase Remainder amount in base denomination as principle
    /// @param remainderRewardsBase Remainder amount in base denomination as lockedRewards
    /// @param lockedTierId Original locked tier ID
    /// @param lockExpiry Original lock expiry (already expired)
    /// @return remainderPositionId ID of created remainder position
    function _createRemainderPosition(
        address owner,
        uint256 remainderPrincipleBase,
        uint256 remainderRewardsBase,
        uint8 lockedTierId,
        uint64 lockExpiry
    ) internal returns (uint256 remainderPositionId) {
        // Prevent creating zero-amount positions
        if (remainderPrincipleBase + remainderRewardsBase == 0) revert IProTokenPlus.ZeroAmountPosition();

        // NOTE: We do not enforce minDeposit for remainder positions.
        // While this allows creating dust positions, malicious users would primarily
        // DoS themselves by bloating their own position count. Normal users using
        // the UI will naturally merge unlocked positions, keeping the count manageable.
        remainderPositionId = nextPositionId++;

        positions[remainderPositionId] = ProTokenPlusTypes.Position({
            owner: owner,
            amount: remainderPrincipleBase,
            lockedTierId: lockedTierId,
            lockExpiry: lockExpiry, // Keep same expiry (already expired)
            activeFromTimestamp: uint64(block.timestamp),
            activeToTimestamp: 0,
            status: ProTokenPlusTypes.PositionStatus.ACTIVE,
            lockedRewards: remainderRewardsBase
        });

        totalDepositsBase += remainderPrincipleBase;

        // Add to active positions list
        _addToActivePositions(owner, remainderPositionId);

        emit IProTokenPlus.PositionCreated(
            owner,
            remainderPositionId,
            remainderPrincipleBase,
            lockedTierId,
            lockExpiry
        );
    }

    /// @notice Check if a position is effectively unlocked (expired)
    /// @param position The position to check
    /// @return True if position has expired
    function _isEffectivelyUnlocked(
        ProTokenPlusTypes.Position storage position
    ) internal view returns (bool) {
        return block.timestamp >= position.lockExpiry;
    }

    /// @notice Add a position to the active positions list
    /// @param owner Owner of the position
    /// @param positionId ID of position to add
    function _addToActivePositions(address owner, uint256 positionId) internal {
        uint256 index = activePositionCount[owner];
        activePositionIds[owner][index] = positionId;
        positionIdToActiveIndex[positionId] = index;
        activePositionCount[owner]++;
    }

    /// @notice Remove a position from the active positions list using swap-and-pop
    /// @param owner Owner of the position
    /// @param positionId ID of position to remove
    function _removeFromActivePositions(
        address owner,
        uint256 positionId
    ) internal {
        uint256 indexToRemove = positionIdToActiveIndex[positionId];
        uint256 count = activePositionCount[owner];
        if (count == 0) revert IProTokenPlus.ImpossibleState();
        uint256 lastIndex = count - 1;

        if (indexToRemove != lastIndex) {
            // Swap with last element
            uint256 lastPositionId = activePositionIds[owner][lastIndex];
            activePositionIds[owner][indexToRemove] = lastPositionId;
            positionIdToActiveIndex[lastPositionId] = indexToRemove;
        }

        // Remove last element
        delete activePositionIds[owner][lastIndex];
        delete positionIdToActiveIndex[positionId];
        activePositionCount[owner]--;
    }

    /// @notice Add a position to the inactive positions list
    /// @param owner Owner of the position
    /// @param positionId ID of position to add
    function _addToInactivePositions(
        address owner,
        uint256 positionId
    ) internal {
        uint256 index = inactivePositionCount[owner];
        inactivePositionIds[owner][index] = positionId;
        positionIdToInactiveIndex[positionId] = index;
        inactivePositionCount[owner]++;
    }

    /// @notice Deactivate a position and move it to inactive list
    /// @param positionId ID of position to deactivate
    /// @param newStatus New status to set for the position
    function _deactivatePosition(
        uint256 positionId,
        ProTokenPlusTypes.PositionStatus newStatus
    ) internal {
        ProTokenPlusTypes.Position storage position = positions[positionId];
        address owner = position.owner;

        // Capture position data before updating (for enhanced event)
        uint256 amount = position.amount;
        uint8 lockedTierId = position.lockedTierId;
        uint64 lockExpiry = position.lockExpiry;
        uint64 activeFromTimestamp = position.activeFromTimestamp;

        // Update position status and timestamp
        position.status = newStatus;
        position.activeToTimestamp = uint64(block.timestamp);

        // Move from active to inactive list
        _removeFromActivePositions(owner, positionId);
        _addToInactivePositions(owner, positionId);

        emit IProTokenPlus.PositionDeactivated(
            owner,
            positionId,
            newStatus,
            amount,
            lockedTierId,
            lockExpiry,
            activeFromTimestamp,
            uint64(block.timestamp)
        );
    }

    /// @notice Remove an unbonding index from the active unbonding indices array
    /// @dev Uses swap-and-pop pattern for O(1) removal. Since users typically have
    ///      few active unbonding requests, linear search for the index is acceptable.
    /// @param user Owner of the unbonding request
    /// @param unbondingIndex Index of the unbonding request to remove
    function _removeFromActiveUnbondingIndices(
        address user,
        uint256 unbondingIndex
    ) internal {
        uint256[] storage indices = activeUnbondingIndices[user];
        uint256 length = indices.length;

        for (uint256 i = 0; i < length; i++) {
            if (indices[i] == unbondingIndex) {
                // Swap with last element and pop
                indices[i] = indices[length - 1];
                indices.pop();
                return;
            }
        }
    }

    // This is OK, because the arrays that we as trying to check duplicates are expected to be small in practice.
    function _detectDuplicatedPositionIds(
        uint256[] memory positionIds
    ) internal pure {
        for (uint256 i = 0; i < positionIds.length; i++) {
            for (uint256 j = i + 1; j < positionIds.length; j++) {
                if (positionIds[i] == positionIds[j]) {
                    revert IProTokenPlus.DuplicatePositionId(positionIds[i]);
                }
            }
        }
    }
}
