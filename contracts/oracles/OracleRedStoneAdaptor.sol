// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@redstone-finance/evm-connector/contracts/data-services/PrimaryProdDataServiceConsumerBase.sol";
import "./state/OracleRedStoneAdaptorState.sol";
import "./interfaces/IOracleAdaptor.sol";
import "./interfaces/IOracleRedStoneAdaptor.sol";
import "../core/interfaces/IProTokenSettings.sol";
import "../core/interfaces/IVersioned.sol";

/// @title OracleRedStoneAdaptor
/// @notice Oracle adaptor for RedStone pull-based price feeds
/// @dev Implementation logic for UUPS proxy. Uses RedStone's pull model where price data
///      is passed in the transaction calldata and verified on-chain.
contract OracleRedStoneAdaptor is
    IOracleAdaptor,
    IOracleRedStoneAdaptor,
    OracleRedStoneAdaptorState,
    PrimaryProdDataServiceConsumerBase,
    Initializable,
    UUPSUpgradeable,
    IVersioned
{
    /// @notice Implementation version (v1.0.0)
    uint256 public constant VERSION = 1_00_00;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _proTokenSettings) public initializer {
        __UUPSUpgradeable_init();
        if (_proTokenSettings == address(0)) revert InvalidAddr();
        proTokenSettings = _proTokenSettings;
        stalenessThreshold = 180; // Default: 3 minutes
    }

    modifier onlyAdmin() {
        if (msg.sender != IProTokenSettings(proTokenSettings).getAdmin())
            revert Unauthorized();
        _;
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyAdmin {
        uint256 newVersion = IVersioned(newImplementation).VERSION();
        if (newVersion <= VERSION) {
            revert VersionNotIncremented(VERSION, newVersion);
        }
    }

    // ================================================
    // =========== Open External Functions ============
    // ================================================

    // ================================================
    // ======== Restricted External Functions =========
    // ================================================

    // ================================================
    // =========== Owner External Functions ===========
    // ================================================

    /// @inheritdoc IOracleRedStoneAdaptor
    function setAssetToOracleIdMappings(
        address[] memory assets,
        string[] memory oracleIds,
        uint8[] memory oraclePriceDecimals
    ) external onlyAdmin {
        if (
            assets.length == 0 ||
            assets.length != oracleIds.length ||
            assets.length != oraclePriceDecimals.length
        ) {
            revert InvalidInputs();
        }

        for (uint256 i = 0; i < assets.length; i++) {
            // Validate oracle ID length to prevent silent truncation
            bytes memory oracleIdBytes = bytes(oracleIds[i]);
            if (oracleIdBytes.length == 0 || oracleIdBytes.length > 32)
                revert OracleIdTooLong();
            // Convert string to bytes32 for gas-efficient storage
            bytes32 oracleIdBytes32 = bytes32(oracleIdBytes);
            assetToOracleId[assets[i]] = oracleIdBytes32;
            if (oraclePriceDecimals[i] > 18) revert InvalidInputs();
            assetToOraclePriceDecimals[assets[i]] = oraclePriceDecimals[i];

            emit AssetToOracleIdMappingUpdated(
                assets[i],
                oracleIds[i],
                oraclePriceDecimals[i]
            );
        }
    }

    /// @inheritdoc IOracleRedStoneAdaptor
    function setStalenessThreshold(
        uint256 _stalenessThreshold
    ) external onlyAdmin {
        stalenessThreshold = _stalenessThreshold;
        emit StalenessThresholdUpdated(_stalenessThreshold);
    }

    // ================================================
    // ================ View functions ================
    // ================================================

    /// @inheritdoc IOracleAdaptor
    function getOraclePriceForAsset(
        address asset,
        bytes calldata
    ) public view override returns (uint256 price) {
        if (asset == address(0)) revert InvalidAddr();

        bytes32 dataFeedId = assetToOracleId[asset];
        if (dataFeedId == bytes32(0)) revert AssetOracleMappingNotFound();

        bytes32[] memory dataFeedIds = new bytes32[](1);
        dataFeedIds[0] = dataFeedId;

        (
            uint256[] memory prices,
            uint256 dataTimestamp
        ) = getOracleNumericValuesAndTimestampFromTxMsg(dataFeedIds);
        price = prices[0];

        // Zero price protection
        if (price == 0) revert InvalidOraclePrice();

        // Convert oracle timestamp from milliseconds to seconds
        uint256 dataTimestampSeconds = dataTimestamp / 1000;

        // Guard against future timestamps (clock skew / buggy oracle)
        if (dataTimestampSeconds > block.timestamp)
            revert FutureOracleTimestamp();

        // Staleness check using configurable threshold
        if (block.timestamp - dataTimestampSeconds > stalenessThreshold)
            revert StaleOracleData();

        // normalize price received from oracle to 18 decimals
        uint8 decimals = assetToOraclePriceDecimals[asset];

        // Scale up if oracle provides fewer than 18 decimals
        // 18 decimals = no scaling needed, >18 decimals rejected in setAssetToOracleIdMappings
        if (decimals < 18) {
            price = price * (10 ** (18 - decimals));
        }
    }

    /// @inheritdoc IOracleRedStoneAdaptor
    function getOracleIdForAsset(
        address asset
    ) external view override returns (string memory) {
        if (asset == address(0)) revert InvalidAddr();

        bytes32 oracleIdBytes32 = assetToOracleId[asset];
        if (oracleIdBytes32 == bytes32(0)) revert AssetOracleMappingNotFound();

        // Convert bytes32 back to string for external compatibility
        // Find the actual length (stop at first null byte)
        uint256 length = 0;
        for (uint256 i = 0; i < 32; i++) {
            if (oracleIdBytes32[i] == 0) break;
            length++;
        }

        // Create properly sized bytes array
        bytes memory oracleIdBytes = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            oracleIdBytes[i] = oracleIdBytes32[i];
        }

        return string(oracleIdBytes);
    }

    // ================================================
    // ============== Internal functions ==============
    // ================================================
}
