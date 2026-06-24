// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

/// @title OracleRedStoneAdaptorState abstract contract
/// @notice Contains state variables for RedStone oracle adaptor
/// @dev Decoupling into a separate abstract contract improves readability
abstract contract OracleRedStoneAdaptorState {
    /// @notice Address of the ProTokenSettings contract for admin access
    address public proTokenSettings;

    // Mapping from asset address to oracle ID (stored as bytes32 for gas efficiency)
    mapping(address => bytes32) internal assetToOracleId;
    // Mapping from asset address to oracle price decimals
    mapping(address => uint8) internal assetToOraclePriceDecimals;

    // Oracle data staleness threshold in seconds (default: 5 minutes = 300 seconds)
    uint256 internal stalenessThreshold;

    // Reserve slots for future variables
    uint256[50] internal __gap;
}
