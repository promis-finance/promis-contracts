// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;
pragma abicoder v2;

interface IOracleRedStoneAdaptor {
    // ================================================
    // =========== Open External Functions ============
    // ================================================

    // ================================================
    // ======== Restricted External Functions =========
    // ================================================

    // ================================================
    // =========== Owner External Functions ===========
    // ================================================

    /// @notice Updates assets mappings to oracle ID and price decimals
    /// @dev This function is restricted to the admin of the contract
    /// @dev The length of assets, oracleIds, and oraclePriceDecimals must be the same
    /// @param assets An array of asset addresses to be mapped
    /// @param oracleIds An array of oracle IDs corresponding to the assets
    /// @param oraclePriceDecimals An array of price decimals corresponding to the assets
    function setAssetToOracleIdMappings(
        address[] memory assets,
        string[] memory oracleIds,
        uint8[] memory oraclePriceDecimals
    ) external;

    /// @notice Sets the staleness threshold for oracle data
    /// @dev This function is restricted to the admin of the contract
    /// @param _stalenessThreshold The new staleness threshold in seconds
    function setStalenessThreshold(uint256 _stalenessThreshold) external;

    // ================================================
    // ================ View functions ================
    // ================================================

    /// @notice Gets the oracle ID for a given asset
    /// @dev This function returns the oracle ID associated with the asset
    /// @param asset The address of the asset for which the oracle ID is requested
    /// @return The oracle ID associated with the asset
    function getOracleIdForAsset(
        address asset
    ) external view returns (string memory);

    // ================================================
    // ==================== Events ====================
    // ================================================

    /// @notice Emitted when asset to oracle ID mapping is updated
    /// @param asset The address of the asset that was updated
    /// @param oracleId The new oracle ID associated with the asset
    /// @param oraclePriceDecimals The new price decimals for the asset
    event AssetToOracleIdMappingUpdated(
        address indexed asset,
        string oracleId,
        uint8 oraclePriceDecimals
    );

    /// @notice Emitted when staleness threshold is updated
    /// @param newThreshold The new staleness threshold in seconds
    event StalenessThresholdUpdated(uint256 newThreshold);

    // ================================================
    // ==================== Errors ====================
    // ================================================

    error Unauthorized();
    error InvalidAddr();
    error InvalidInputs();
    error AssetOracleMappingNotFound();
    error InvalidOraclePrice();
    error StaleOracleData();
    /// @notice Thrown when oracle ID string exceeds 32 bytes (bytes32 limit)
    error OracleIdTooLong();
    /// @notice Thrown when oracle timestamp is in the future (clock skew / buggy oracle)
    error FutureOracleTimestamp();
}
