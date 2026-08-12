// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "../types/YAssetOperationsHandlerTypes.sol";

/**
 * @title YAssetOperationsHandlerState
 * @notice Storage layout for YAssetOperationsHandler, separated from logic.
 * @dev One handler instance per yAsset. Append new variables before __gap and
 *      shrink __gap to preserve layout.
 */
abstract contract YAssetOperationsHandlerState {
    /// @notice ProTokenSettings contract, source of roles.
    address internal proTokenSettings;

    /// @notice The yAsset this handler manages.
    address internal yAsset;

    /// @notice Configured yield protocol handlers and their allocation percentages.
    YAssetOperationsHandlerTypes.YieldProtocolHandler[] internal protocolHandlers;

    /// @notice Whether an address is a registered protocol handler.
    mapping(address => bool) internal isProtocolHandler;

    /// @notice The amount of unmint fee accrued per yAsset.
    mapping(address => uint256) public accruedProtocolFees;

    /// @notice Reserved storage for future upgrades.
    uint256[45] internal __gap;
}