// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

/**
 * @title ProTokenPlusTypes
 * @author Promis Team
 * @notice Enums and structs for the ProTokenPlus vault system.
 */
library ProTokenPlusTypes {
    /**
     * @notice Position lock state, computed from lockExpiry vs current time.
     */
    enum PositionState {
        LOCKED,
        UNLOCKED
    }

    /**
     * @notice Position lifecycle status.
     * @dev ACTIVE: live. WITHDRAWN: fully withdrawn. LOCKED_MERGED / UNLOCKED_MERGED:
     *      merged while locked / unlocked. RELOCATED: moved to a different tier.
     */
    enum PositionStatus {
        ACTIVE,
        WITHDRAWN,
        UNLOCKED_MERGED,
        RELOCATED
    }

    /**
     * @notice Configuration for a lockup tier (tier 0 is the floor; all fields mutable).
     * @param apr Rewards APR in 1e18.
     * @param duration Lock duration in seconds (0 for floor tier).
     * @param minDeposit Minimum deposit in base/USD; 0 = no minimum.
     * @param isDepositable Whether users can deposit directly into this tier.
     * @param isActive Whether the tier is currently active.
     * @param name Human-readable tier name.
     */
    struct TierConfig {
        // ---- slot 0: 3 uint256 ----
        uint256 apr;
        uint256 duration;
        uint256 minDeposit;
        // ---- slot 3: 2 bools packed ----
        bool isDepositable;
        bool isActive;
        // ---- dynamic: string (one slot at position) ----
        string name;
    }

    /**
     * @notice An individual locked position. State is computed lazily from lockExpiry.
     * @param owner Position owner.
     * @param lockedTierId Tier ID at creation.
     * @param lockExpiry Timestamp when the lock expires.
     * @param activeFromTimestamp When the position became active.
     * @param activeToTimestamp When it became inactive (0 = still active).
     * @param status Current lifecycle status.
     * @param amount Principal in base/USD.
     * @param lockedRewards Rewards in base/USD (APR applied to amount).
     */
    struct Position {
        // ---- slot 0: address (20) + uint8 (1) + 3×uint64 (24)... overflow → see below ----
        address owner;
        uint8 lockedTierId;
        PositionStatus status;
        uint64 lockExpiry;
        uint64 activeFromTimestamp;
        uint64 activeToTimestamp;
        // ---- slots 1-2 ----
        uint256 amount;
        uint256 lockedRewards;
    }

    /**
     * @notice Audit record of a position consumed by a withdrawal.
     * @param positionId Original position ID.
     * @param amountUsed Amount taken from this position (base/USD).
     * @param remainderPositionId Remainder position ID, 0 if fully consumed (always 0 for full-position withdrawals).
     */
    struct WithdrawRequestPosition {
        uint256 positionId;
        uint256 amountUsed;
        uint256 remainderPositionId;
    }

    /**
     * @notice An unbonding request created at withdrawal finalize, claimable after unbondingEnd.
     * @param amount Amount unbonding in base/USD (converted to proUSD on claim).
     * @param unbondingEnd Timestamp when funds become claimable.
     * @param isActive Whether the request is still active.
     * @param positionsUsed Positions consumed for this withdrawal.
     */
    struct UnbondingRequest {
        // ---- slot 0: uint64 (8) + bool (1) packed; amount needs full slot so order so the small fields share ----
        uint64 unbondingEnd;
        bool isActive;
        // ---- slot 1 ----
        uint256 amount;
        // ---- dynamic array (one slot at position) ----
        WithdrawRequestPosition[] positionsUsed;
    }

    /**
     * @notice Async request lifecycle state.
     */
    enum Status {
        VOID,
        PENDING,
        EXECUTED
    }

    /**
     * @notice Backend authorization outcome: APPROVE finalizes, RETURN refunds.
     */
    enum ProofKind {
        PROOF_OF_APPROVE,
        PROOF_OF_RETURN
    }

    /**
     * @notice A pending deposit request.
     * @param user The depositor.
     * @param tierID Target tier.
     * @param status Lifecycle state, internally enforced.
     * @param amount proUSD deposited.
     */
    struct DepositRequest {
        // ---- slot 0: address (20) + uint8 (1) + enum (1) packed ----
        address user;
        uint8 tierID;
        Status status;
        // ---- slot 1 ----
        uint256 amount;
    }

    /**
     * @notice A pending withdraw request (full-position; no amount).
     * @param user The withdrawer.
     * @param status Lifecycle state, internally enforced.
     * @param positionIDs Positions to withdraw in full.
     */
    struct WithdrawRequest {
        // ---- slot 0: address (20) + enum (1) packed ----
        address user;
        Status status;
        // ---- dynamic arrays ----
        uint256[] positionIDs;
    }

    /**
     * @notice View response for a position with computed effective state.
     * @param positionId Position ID.
     * @param owner Owner.
     * @param amount Principal in base/USD.
     * @param lockedRewards Rewards in base/USD.
     * @param lockedTierId Tier at creation.
     * @param lockExpiry Lock expiry timestamp.
     * @param state Computed LOCKED/UNLOCKED.
     * @param activeFromTimestamp When active.
     * @param activeToTimestamp When inactive (0 = active).
     * @param status Lifecycle status.
     */
    struct PositionView {
        uint256 positionId;
        address owner;
        uint256 amount;
        uint256 lockedRewards;
        uint8 lockedTierId;
        uint64 lockExpiry;
        PositionState state;
        uint64 activeFromTimestamp;
        uint64 activeToTimestamp;
        PositionStatus status;
    }

    /**
     * @notice Locked/unlocked balance breakdown for a tier (view).
     * @param tierId Tier identifier.
     * @param lockedAmount Amount locked at this tier.
     * @param unlockedAmount Amount unlocked at this tier.
     */
    struct TierBalance {
        uint8 tierId;
        uint256 lockedAmount;
        uint256 unlockedAmount;
    }

    /**
     * @notice Aggregated user balance summary (view).
     * @param totalLocked Total locked across tiers.
     * @param totalUnlocked Total unlocked across tiers.
     * @param totalUnbonding Total in active unbonding requests.
     * @param activePositionCount Number of active positions.
     * @param tierBalances Per-tier balances.
     */
    struct UserBalanceSummary {
        uint256 totalLocked;
        uint256 totalUnlocked;
        uint256 totalUnbonding;
        uint256 activePositionCount;
        TierBalance[] tierBalances;
    }

    /**
     * @notice Tier configuration query response (view).
     * @param tierId Tier identifier.
     * @param config Full tier configuration.
     */
    struct TierConfigResponse {
        uint8 tierId;
        TierConfig config;
    }
}