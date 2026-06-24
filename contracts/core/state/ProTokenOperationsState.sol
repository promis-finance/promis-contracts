// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "../types/ProTokenOperationsTypes.sol";

/**
 * @title ProTokenOperationsState
 * @notice Storage layout for ProTokenOperations, separated from logic.
 * @dev Append new variables before __gap and shrink __gap to preserve layout.
 */
abstract contract ProTokenOperationsState {
    /// @notice ProTokenSettings contract, source of roles and yAsset/price config.
    address internal proTokenSettings;

    /// @notice Auto-incrementing ID for the next mint request.
    uint256 internal mintRequestID;

    /// @notice Mint requests by ID.
    mapping(uint256 => ProTokenOperationsTypes.Request) public mintRequests;

    /// @notice Auto-incrementing ID for the next unmint request.
    uint256 internal unmintRequestID;

    /// @notice Unmint requests by ID.
    mapping(uint256 => ProTokenOperationsTypes.Request) public unmintRequests;

    /// @notice Minimum deposit, base/USD (18 dec). Enforced at mint-request creation.
    uint256 public minDepositBase;

    /// @notice Minimum withdrawal, base/USD (18 dec). Enforced at unmint-request creation.
    uint256 public minWithdrawBase;

    /// @notice Reserved storage for future upgrades.
    uint256[43] internal __gap;
}