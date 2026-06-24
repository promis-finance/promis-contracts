// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

/**
 * @title OracleRedStonePushAdaptorState
 * @notice State variables for the OracleRedStonePushAdaptor contract
 * @dev Separated state for cleaner architecture and upgradeability
 */
abstract contract OracleRedStonePushAdaptorState {
    /// @notice Address of the ProTokenSettings contract for admin access
    address public proTokenSettings;

    /// @notice Mapping from asset address to push oracle contract address
    mapping(address => address) public assetToPushOracleContract;

    /// @notice Mapping from asset address to data feed ID
    mapping(address => string) public assetToDataFeedId;

    /// @notice Mapping from asset address to price decimals
    mapping(address => uint8) public assetToPriceDecimals;

    /// @notice Maximum allowed staleness for oracle data in seconds
    uint256 public stalenessThreshold;

    /**
     * @dev Reserved storage space for future upgrades
     * This gap ensures that the storage layout remains compatible
     * when adding new state variables in future versions
     */
    uint256[50] internal __gap;
}
