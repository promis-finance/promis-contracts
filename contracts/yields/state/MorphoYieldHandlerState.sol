// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

/**
 * @title MorphoYieldHandlerState
 * @notice Contains state variables for the MorphoYieldHandler contract
 * @dev Separated into abstract contract for better organization and upgradeability
 */
import "../interfaces/IYieldProtocolHandler.sol";
import "@morpho-org/morpho-blue/src/interfaces/IMorpho.sol";

abstract contract MorphoYieldHandlerState {
    /// @notice Address of the proTokenSettings contract
    address internal proTokenSettings;

    /// @notice Authorized operations contract
    address internal operationsContract;

    /// @notice morpho market parameters for the yield asset
    MarketParams internal morphoMarketParams;

    /// @notice Address of the Morpho contract
    address internal morphoCoreContract;

    /// @notice Storage gap for future upgrades
    uint256[50] internal __gap;
}
