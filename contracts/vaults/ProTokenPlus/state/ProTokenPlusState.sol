// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "../types/ProTokenPlusTypes.sol";

/**
 * @title ProTokenPlusState
 * @author Promis Team
 * @notice Storage layout for the ProTokenPlus vault, separated from logic.
 * @dev Append new variables before __gap and shrink __gap to preserve layout.
 */
abstract contract ProTokenPlusState {
    /// @notice Floor tier ID (non-depositable).
    uint8 internal constant FLOOR_TIER_ID = 0;

    /// @notice ProTokenSettings contract, source of admin access control.
    address public proTokenSettings;

    /// @notice proUSD token contract used for deposits and withdrawals.
    address public proUSD;

    /// @notice Operations satellite implementation, called via delegatecall (not a proxy).
    address public operationsHandler;

    /// @notice Unbonding period in seconds (admin-configurable; default 2 weeks).
    uint256 public unbondingPeriod;

    /// @notice Counter for unique position IDs; starts at 1.
    uint256 public nextPositionId;

    /// @notice All configured tier IDs (includes inactive), for iteration.
    uint8[] internal tierIds;

    /// @notice Tier configuration by tier ID.
    mapping(uint8 => ProTokenPlusTypes.TierConfig) internal tiers;

    /// @notice Position data by position ID.
    mapping(uint256 => ProTokenPlusTypes.Position) internal positions;

    /// @notice Active position IDs per user: user => index => positionId.
    mapping(address => mapping(uint256 => uint256)) internal activePositionIds;

    /// @notice Count of active positions per user.
    mapping(address => uint256) internal activePositionCount;

    /// @notice Inactive (historical) position IDs per user: user => index => positionId.
    mapping(address => mapping(uint256 => uint256)) internal inactivePositionIds;

    /// @notice Count of inactive positions per user.
    mapping(address => uint256) internal inactivePositionCount;

    /// @notice Position ID to its index in activePositionIds (for O(1) swap-and-pop removal).
    mapping(uint256 => uint256) internal positionIdToActiveIndex;

    /// @notice Position ID to its index in inactivePositionIds (for O(1) lookup).
    mapping(uint256 => uint256) internal positionIdToInactiveIndex;

    /// @notice Unbonding requests per user: user => index => request (index never reused).
    mapping(address => mapping(uint256 => ProTokenPlusTypes.UnbondingRequest))
        internal unbondingRequests;

    /// @notice Count of unbonding requests per user (for pagination and new indices).
    mapping(address => uint256) internal userUnbondingCount;

    /// @notice Active unbonding indices per user; entries removed on completion.
    mapping(address => uint256[]) internal activeUnbondingIndices;

    /// @notice Total amount currently in unbonding across all users (base/USD).
    uint256 public totalUnbonding;

    /// @notice Auto-incrementing ID for the next deposit request.
    uint256 internal depositRequestID;

    /// @notice Deposit requests by ID.
    mapping(uint256 => ProTokenPlusTypes.DepositRequest) public depositRequests;

    /// @notice Auto-incrementing ID for the next withdraw request.
    uint256 internal withdrawRequestID;

    /// @notice Withdraw requests by ID.
    mapping(uint256 => ProTokenPlusTypes.WithdrawRequest) public withdrawRequests;

    /// @notice Total proUSD in pending (unfinalized) deposit requests.
    uint256 public totalPendingDeposits;

    /// @notice Total proUSD as TVL in base denomination
    uint256 public totalDepositsBase;

    /// @notice Total allowed user deposits in base denomination
    uint256 public depositCap;

    /// @notice Reserved storage for future upgrades.
    uint256[25] private __gap;
}