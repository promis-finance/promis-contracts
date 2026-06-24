// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./state/OracleRedStonePushAdaptorState.sol";
import "./interfaces/IOracleAdaptor.sol";
import "./interfaces/IOracleRedStonePushAdaptor.sol";
import "../core/interfaces/IProTokenSettings.sol";
import "../core/interfaces/IVersioned.sol";

/**
 * @title IRedStonePushOracle
 * @notice Interface for external RedStone Push oracle contracts that store price data on-chain
 * @dev This represents the external oracle contract deployed by RedStone that we'll interact with
 */
interface IRedStonePushOracle {
    /**
     * @notice Retrieves the latest value for a specific data feed
     * @param dataFeedId The identifier of the data feed
     * @return The latest price value for the data feed
     */
    function getValueForDataFeed(
        bytes32 dataFeedId
    ) external view returns (uint256);

    /**
     * @notice Retrieves the timestamp of the latest update for a specific data feed
     * @param dataFeedId The identifier of the data feed
     * @return The timestamp (in seconds) of the latest update
     */
    function getDataTimestampFromLatestUpdate(
        bytes32 dataFeedId
    ) external view returns (uint256);
}

/**
 * @title OracleRedStonePushAdaptor
 * @notice Oracle adaptor for RedStone Push oracles with on-chain price data
 * @dev Implements IOracleAdaptor interface using RedStone's push model
 */
contract OracleRedStonePushAdaptor is
    IOracleAdaptor,
    IOracleRedStonePushAdaptor,
    OracleRedStonePushAdaptorState,
    Initializable,
    UUPSUpgradeable,
    IVersioned
{
    /// @notice Implementation version (v1.0.0)
    uint256 public constant VERSION = 1_00_00;

    modifier onlyAdmin() {
        if (msg.sender != IProTokenSettings(proTokenSettings).getAdmin())
            revert Unauthorized();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the oracle adaptor
     * @param _proTokenSettings The ProTokenSettings contract address for admin access
     */
    function initialize(address _proTokenSettings) public initializer {
        __UUPSUpgradeable_init();
        if (_proTokenSettings == address(0)) revert InvalidAddr();
        proTokenSettings = _proTokenSettings;
        stalenessThreshold = 86400; // Default 24h = 86400 seconds as push models update less frequent stable coins
    }

    /// @inheritdoc IOracleAdaptor
    function getOraclePriceForAsset(
        address asset,
        bytes calldata
    ) external view override returns (uint256) {
        // Get push oracle configuration for asset
        address pushOracle = assetToPushOracleContract[asset];
        string storage dataFeedIdString = assetToDataFeedId[asset];
        uint8 priceDecimals = assetToPriceDecimals[asset];

        if (pushOracle == address(0)) revert AssetOracleMappingNotFound();

        // Convert string to bytes32 for oracle call
        bytes32 dataFeedId = bytes32(bytes(dataFeedIdString));

        // Get price from push oracle
        IRedStonePushOracle oracle = IRedStonePushOracle(pushOracle);
        uint256 price = oracle.getValueForDataFeed(dataFeedId);

        if (price == 0) revert InvalidOraclePrice();

        // Check staleness
        // RedStone Push Oracle returns timestamp in milliseconds, convert to seconds
        uint256 timestampMs = oracle.getDataTimestampFromLatestUpdate(
            dataFeedId
        );
        uint256 timestampSeconds = timestampMs / 1000;

        // Guard against future timestamps (clock skew / buggy oracle)
        if (timestampSeconds > block.timestamp) {
            revert FutureOracleTimestamp();
        }

        if (block.timestamp - timestampSeconds > stalenessThreshold) {
            revert StaleOracleData();
        }

        // Normalize price to 18 decimals
        if (priceDecimals < 18) {
            price = price * 10 ** (18 - priceDecimals);
        }

        return price;
    }

    /// @inheritdoc IOracleRedStonePushAdaptor
    function setAssetToPushOracleMappings(
        address[] calldata assets,
        address[] calldata pushOracleContracts,
        string[] calldata dataFeedIds,
        uint8[] calldata priceDecimals
    ) external override onlyAdmin {
        uint256 length = assets.length;
        if (
            length != pushOracleContracts.length ||
            length != dataFeedIds.length ||
            length != priceDecimals.length
        ) {
            revert InvalidInputs();
        }

        for (uint256 i = 0; i < length; i++) {
            if (
                assets[i] == address(0) || pushOracleContracts[i] == address(0)
            ) {
                revert InvalidAddr();
            }
            // Validate data feed ID length to prevent silent truncation when converting to bytes32
            if (
                bytes(dataFeedIds[i]).length == 0 ||
                bytes(dataFeedIds[i]).length > 32
            ) {
                revert DataFeedIdTooLong();
            }
            if (priceDecimals[i] > 18) {
                revert InvalidInputs();
            }

            assetToPushOracleContract[assets[i]] = pushOracleContracts[i];
            assetToDataFeedId[assets[i]] = dataFeedIds[i];
            assetToPriceDecimals[assets[i]] = priceDecimals[i];

            emit AssetToPushOracleMappingUpdated(
                assets[i],
                pushOracleContracts[i],
                dataFeedIds[i],
                priceDecimals[i]
            );
        }
    }

    /// @inheritdoc IOracleRedStonePushAdaptor
    function setStalenessThreshold(
        uint256 threshold
    ) external override onlyAdmin {
        if (threshold == 0) revert InvalidInputs();
        stalenessThreshold = threshold;
        emit StalenessThresholdUpdated(threshold);
    }

    /// @inheritdoc IOracleRedStonePushAdaptor
    function getPushOracleForAsset(
        address asset
    )
        external
        view
        override
        returns (address pushOracle, string memory dataFeedId)
    {
        pushOracle = assetToPushOracleContract[asset];
        dataFeedId = assetToDataFeedId[asset];
    }

    /**
     * @notice Authorizes contract upgrades
     * @param newImplementation The new implementation address
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyAdmin {
        uint256 newVersion = IVersioned(newImplementation).VERSION();
        if (newVersion <= VERSION) {
            revert VersionNotIncremented(VERSION, newVersion);
        }
    }
}
