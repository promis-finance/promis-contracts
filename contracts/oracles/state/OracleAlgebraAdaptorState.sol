// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "../types/OracleAlgebraAdaptorTypes.sol";

/// @title OracleAlgebraAdaptorState abstract contract
/// @notice Contains state variables for Algebra TWAP oracle functionality
/// @dev Decoupling into a separate abstract contract improves readability
abstract contract OracleAlgebraAdaptorState {
    /// @notice Address of the ProTokenSettings contract for admin access
    address public proTokenSettings;

    // Asset => Route configuration
    mapping(address => OracleAlgebraAdaptorTypes.PoolConfig[]) internal routes;

    // Asset => decimals
    mapping(address => uint8) internal decimals;

    // TWAP periods
    uint32 public twapPeriod;
    uint32 public twapPeriodMiddle;
    uint32 public twapPeriodLongest;

    // Reserve slots for future variables
    uint256[50] internal __gap;
}
