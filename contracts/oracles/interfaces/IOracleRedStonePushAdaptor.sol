// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

/**
 * @title IOracleRedStonePushAdaptor
 * @notice Interface for RedStone Push oracle adaptor with admin functions and events
 * @dev Defines configuration functions and oracle-specific operations
 */
interface IOracleRedStonePushAdaptor {
    // Events
    event AssetToPushOracleMappingUpdated(
        address indexed asset,
        address indexed pushOracle,
        string dataFeedId,
        uint8 priceDecimals
    );
    event StalenessThresholdUpdated(uint256 threshold);

    // Errors
    error Unauthorized();
    error InvalidAddr();
    error InvalidInputs();
    error AssetOracleMappingNotFound();
    error InvalidOraclePrice();
    error StaleOracleData();
    /// @notice Thrown when data feed ID string exceeds 32 bytes (bytes32 limit)
    error DataFeedIdTooLong();
    /// @notice Thrown when oracle timestamp is in the future (clock skew / buggy oracle)
    error FutureOracleTimestamp();

    /**
     * @notice Sets the mappings between assets and their push oracle configurations
     * @param assets Array of asset addresses
     * @param pushOracleContracts Array of push oracle contract addresses
     * @param dataFeedIds Array of data feed identifiers as strings
     * @param priceDecimals Array of decimal places for each oracle price
     */
    function setAssetToPushOracleMappings(
        address[] calldata assets,
        address[] calldata pushOracleContracts,
        string[] calldata dataFeedIds,
        uint8[] calldata priceDecimals
    ) external;

    /**
     * @notice Sets the maximum allowed staleness for oracle data
     * @param threshold Maximum staleness in seconds
     */
    function setStalenessThreshold(uint256 threshold) external;

    /**
     * @notice Retrieves the push oracle configuration for a specific asset
     * @param asset The asset address
     * @return pushOracle The push oracle contract address
     * @return dataFeedId The data feed identifier
     */
    function getPushOracleForAsset(
        address asset
    ) external view returns (address pushOracle, string memory dataFeedId);
}
