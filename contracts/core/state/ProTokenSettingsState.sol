// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "../types/ProTokenSettingsTypes.sol";
import "../types/ProTokenOperationsTypes.sol";

/**
 * @title ProTokenSettingsState
 * @notice Storage layout for ProTokenSettings, separated from logic.
 * @dev Append new variables before __gap and shrink __gap to preserve layout.
 */
abstract contract ProTokenSettingsState {
    /// @notice Privileged admin role (manual multisig).
    address internal admin;

    /// @notice Proposed admin awaiting acceptance in the two-step transfer.
    address internal pendingAdmin;

    /// @notice Operator role (automated multisig) for routine operations.
    address internal operator;

    /// @notice External business role authorized to request funds from the reserve.
    address internal externalBusiness;

    /// @notice Strategist role authorized to borrow from / repay the StrategyVault.
    address internal strategist;

    /// @notice CCIP admin resolution hook target.
    address internal bridgeAdmin;

    /// @notice proUSD token contract.
    address internal proToken;

    /// @notice ProTokenOperations contract (mint/unmint authority).
    address internal proTokenOperations;

    /// @notice ProTokenUnmintHandler contract (batched unmint payouts).
    address internal proTokenUnmintHandler;

    /// @notice StrategyVault contract (proUSD+ custody and strategist drawdown).
    address internal strategyVault;

    /// @notice Set of registered yAsset addresses.
    EnumerableSet.AddressSet internal yAssets;

    /// @notice Per-yAsset configuration (enabled, paused, decimals, price, fee, handler).
    mapping(address => ProTokenSettingsTypes.YAssetSettings) internal yAssetSettings;

    /// @notice yAssets eligible for unmint payouts.
    address[] internal unmintYAssets;

    /// @notice Multi-oracle aggregation parameters (max price deviation).
    ProTokenOperationsTypes.OracleAggregationSettings internal oracleAggregationSettings;

    /// @notice Addresses authorized to sign EIP-712 proofs.
    mapping(address => bool) internal authority;

    /// @notice PriceOperator role (automated multisig) for routine price update operations.
    address internal priceOperator;

    /// @notice Reserved storage for future upgrades.
    uint256[33] internal __gap;
}