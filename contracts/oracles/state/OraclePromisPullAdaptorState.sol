// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

/// @title OraclePromisPullAdaptorState abstract contract
/// @notice Contains state variables for Promis Pull oracle adaptor
/// @dev Decoupling into a separate abstract contract improves readability
abstract contract OraclePromisPullAdaptorState {
    /// @notice Address of the ProTokenSettings contract for admin access
    address public proTokenSettings;

    // Oracle data staleness threshold in seconds (default: 3 minutes = 180 seconds)
    uint256 internal stalenessThreshold;

    // List of authorized signers
    address[] public signers;

    // Reserve slots for future variables
    uint256[50] internal __gap;
}
