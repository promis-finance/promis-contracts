// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./state/OracleChainlinkPushAdaptorState.sol";
import "./interfaces/IOracleAdaptor.sol";
import "./interfaces/IOracleChainlinkPushAdaptor.sol";
import "../core/interfaces/IProTokenSettings.sol";
import "../core/interfaces/IVersioned.sol";

/**
 * @title OracleChainlinkPushAdaptor
 * @notice Interface for external Chainlink Push oracle contracts that store price data on-chain
 * @dev This represents the external oracle contract deployed by Chainlink that we'll interact with
 */
interface IChainlinkPushOracle {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/**
 * @title OracleChainlinkPushAdaptor
 * @notice Oracle adaptor for Chainlink Push oracles with on-chain price data
 * @dev Implements IOracleAdaptor interface using Chainlink's push model
 */
contract OracleChainlinkPushAdaptor is
    IOracleAdaptor,
    IOracleChainlinkPushAdaptor,
    OracleChainlinkPushAdaptorState,
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
    }

    /// @inheritdoc IOracleAdaptor
    function getOraclePriceForAsset(
        address asset
    ) external view override returns (uint256) {
        // Get push oracle configuration for asset
        address pushOracle = assetToPushOracleContract[asset];
        uint8 priceDecimals = assetToPriceDecimals[asset];

        if (pushOracle == address(0)) revert AssetOracleMappingNotFound();

        // Get price from push oracle
        IChainlinkPushOracle oracle = IChainlinkPushOracle(pushOracle);
        (, int256 answer, , uint256 updatedAt, ) = oracle.latestRoundData();

        uint256 price = uint256(answer);

        if (price == 0) revert InvalidOraclePrice();

        // Guard against future timestamps (clock skew / buggy oracle)
        if (updatedAt > block.timestamp) {
            revert FutureOracleTimestamp();
        }

        // Check staleness
        if (block.timestamp - updatedAt > stalenessThreshold[asset]) {
            revert StaleOracleData();
        }

        // Normalize price to 18 decimals
        if (priceDecimals < 18) {
            price = price * 10 ** (18 - priceDecimals);
        }

        return price;
    }

    /// @inheritdoc IOracleChainlinkPushAdaptor
    function setAssetToPushOracleMappings(
        address[] calldata assets,
        address[] calldata pushOracleContracts,
        uint8[] calldata priceDecimals
    ) external override onlyAdmin {
        uint256 length = assets.length;
        if (
            length != pushOracleContracts.length ||
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
            if (priceDecimals[i] > 18) {
                revert InvalidInputs();
            }

            assetToPushOracleContract[assets[i]] = pushOracleContracts[i];
            assetToPriceDecimals[assets[i]] = priceDecimals[i];
            stalenessThreshold[assets[i]] = 86400;

            emit AssetToPushOracleMappingUpdated(
                assets[i],
                pushOracleContracts[i],
                priceDecimals[i]
            );
        }
    }

    /// @inheritdoc IOracleChainlinkPushAdaptor
    function setStalenessThreshold(
        address asset,
        uint256 threshold
    ) external override onlyAdmin {
        if (threshold == 0) revert InvalidInputs();
        stalenessThreshold[asset] = threshold;
        emit StalenessThresholdUpdated(asset, threshold);
    }

    /// @inheritdoc IOracleChainlinkPushAdaptor
    function getPushOracleForAsset(
        address asset
    ) external view override returns (address pushOracle) {
        pushOracle = assetToPushOracleContract[asset];
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
