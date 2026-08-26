// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

/**
 * @title AaveV3YieldHandlerState
 * @notice Contains state variables for the AaveV3YieldHandler contract
 * @dev Separated into abstract contract for better organization and upgradeability
 */
import "../interfaces/IYieldProtocolHandler.sol";

abstract contract AaveV3YieldHandlerState {
    /// @notice Address of the proTokenSettings contract
    address internal proTokenSettings;

    /// @notice Address of the yield asset managed by this handler
    address internal yieldAsset;

    /// @notice Optional override for the AAVE aToken tied to the yield asset
    address internal aToken;

    /// @notice Address of the AAVE v3 Pool contract
    address internal aavePool;

    /// @notice Authorized operations contract
    address internal operationsContract;

    /// @notice AAVE rewards controller for incentive collection
    address internal incentivesController;

    /// @notice Impairment tolerance (deficit/supply). 0 = refuse any nonzero deficit.
    uint256 public impairmentToleranceBps;

    /// @notice Storage gap for future upgrades
    uint256[43] internal __gap;
}
