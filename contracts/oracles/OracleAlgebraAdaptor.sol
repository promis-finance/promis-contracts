// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@cryptoalgebra/integral-core/contracts/libraries/TickMath.sol";
import "@cryptoalgebra/integral-core/contracts/libraries/FullMath.sol";
import "@cryptoalgebra/integral-base-plugin/contracts/interfaces/plugins/IVolatilityOracle.sol";
import "./state/OracleAlgebraAdaptorState.sol";
import "./interfaces/IOracleAdaptor.sol";
import "./interfaces/IOracleAlgebraAdaptor.sol";
import "./types/OracleAlgebraAdaptorTypes.sol";
import "../core/interfaces/IProTokenSettings.sol";
import "../core/interfaces/IVersioned.sol";

/// @title OracleAlgebraAdaptor
/// @notice TWAP oracle adaptor for Algebra DEX pools
/// @dev Implementation logic for UUPS proxy providing TWAP oracle functionality for Algebra DEX.
///      Supports multi-hop routes and configurable TWAP periods with fallback mechanisms.
contract OracleAlgebraAdaptor is
    IOracleAdaptor,
    IOracleAlgebraAdaptor,
    OracleAlgebraAdaptorState,
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
        twapPeriod = 900; // Default: 15 minutes
        twapPeriodMiddle = 7200; // Default: 2 hours
        twapPeriodLongest = 86400; // Default: 24 hours
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

    /// @inheritdoc IOracleAlgebraAdaptor
    function configureRoute(
        address asset,
        OracleAlgebraAdaptorTypes.RouteParams calldata params
    ) external onlyAdmin {
        uint256 length = params.pools.length;
        if (
            length == 0 ||
            length != params.plugins.length ||
            length != params.tokens0.length ||
            length != params.tokens1.length ||
            length != params.decimals0.length ||
            length != params.decimals1.length ||
            length != params.directions.length
        ) {
            revert InvalidInputs();
        }

        // Clear existing route
        delete routes[asset];

        // Configure new route
        for (uint256 i = 0; i < length; i++) {
            routes[asset].push(
                OracleAlgebraAdaptorTypes.PoolConfig({
                    pool: params.pools[i],
                    plugin: params.plugins[i],
                    token0: params.tokens0[i],
                    token1: params.tokens1[i],
                    zeroToOne: params.directions[i]
                })
            );

            // Store decimals for all tokens in the route
            if (params.decimals0[i] > 18 || params.decimals1[i] > 18) {
                revert InvalidInputs();
            }
            decimals[params.tokens0[i]] = params.decimals0[i];
            decimals[params.tokens1[i]] = params.decimals1[i];
        }

        emit RouteConfigured(asset, length);
    }

    /// @inheritdoc IOracleAlgebraAdaptor
    function setTwapPeriods(
        uint32 _twapPeriod,
        uint32 _twapPeriodMiddle,
        uint32 _twapPeriodLongest
    ) external onlyAdmin {
        if (
            _twapPeriod == 0 ||
            _twapPeriodMiddle == 0 ||
            _twapPeriodLongest == 0
        ) {
            revert InvalidInputs();
        }
        if (
            _twapPeriod >= _twapPeriodMiddle ||
            _twapPeriodMiddle >= _twapPeriodLongest
        ) {
            revert InvalidInputs();
        }
        twapPeriod = _twapPeriod;
        twapPeriodMiddle = _twapPeriodMiddle;
        twapPeriodLongest = _twapPeriodLongest;
        emit TwapPeriodsUpdated(
            _twapPeriod,
            _twapPeriodMiddle,
            _twapPeriodLongest
        );
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

        OracleAlgebraAdaptorTypes.PoolConfig[] storage route = routes[asset];
        if (route.length == 0) revert RouteNotConfigured();

        price = 1e18; // Start with 1.0

        // Process each hop in the route
        for (uint256 i = 0; i < route.length; i++) {
            OracleAlgebraAdaptorTypes.PoolConfig memory config = route[i];

            // Get TWAP for this hop
            uint256 hopPrice = _getPoolTWAP(config);

            // Multiply prices (with precision handling)
            price = FullMath.mulDiv(price, hopPrice, 1e18);
        }

        // Zero price protection
        if (price == 0) revert InvalidOraclePrice();

        return price;
    }

    /// @inheritdoc IOracleAlgebraAdaptor
    function getRouteForAsset(
        address asset
    )
        external
        view
        override
        returns (OracleAlgebraAdaptorTypes.PoolConfig[] memory)
    {
        return routes[asset];
    }

    // ================================================
    // ============== Internal functions ==============
    // ================================================

    /// @dev Get TWAP from a single pool normalized to 18 decimals
    function _getPoolTWAP(
        OracleAlgebraAdaptorTypes.PoolConfig memory config
    ) internal view returns (uint256) {
        // Try primary TWAP first (e.g., 15 minutes)
        (bool success, int24 tick) = _tryGetTWAP(config.plugin, twapPeriod);

        // If stale, try middle TWAP (e.g., 2 hours)
        if (!success) {
            (success, tick) = _tryGetTWAP(config.plugin, twapPeriodMiddle);

            // If still stale, try longest TWAP (e.g., 24 hours)
            if (!success) {
                (success, tick) = _tryGetTWAP(config.plugin, twapPeriodLongest);

                // If still no success, revert (no fallback to spot price for security)
                if (!success) {
                    revert StaleOracleData();
                }
            }
        }

        // Convert tick to price
        uint160 sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tick);

        // Get decimals from stored values
        uint8 decimals0 = decimals[config.token0];
        uint8 decimals1 = decimals[config.token1];

        // Calculate price based on direction
        uint256 price = _calculatePrice(
            sqrtPriceX96,
            config.zeroToOne,
            decimals0,
            decimals1
        );

        return price;
    }

    /// @dev Try to get TWAP for specific period
    function _tryGetTWAP(
        address plugin,
        uint32 period
    ) internal view returns (bool success, int24 tick) {
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = period;
        secondsAgos[1] = 0;

        try IVolatilityOracle(plugin).getTimepoints(secondsAgos) returns (
            int56[] memory tickCumulatives,
            uint88[] memory
        ) {
            // Check if we have different values (indicating trades occurred)
            if (tickCumulatives[0] != tickCumulatives[1]) {
                tick = int24(
                    (tickCumulatives[1] - tickCumulatives[0]) /
                        int56(uint56(period))
                );
                success = true;
            }
        } catch {
            // If the call fails, return false
            success = false;
        }
    }

    /// @dev Calculate price from sqrtPriceX96 with decimal adjustment
    function _calculatePrice(
        uint160 sqrtPriceX96,
        bool zeroToOne,
        uint8 decimals0,
        uint8 decimals1
    ) internal pure returns (uint256) {
        uint256 Q192 = 2 ** 192;

        // price = (sqrtPrice / 2^96)^2
        uint256 priceX192 = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);

        uint256 price;
        if (zeroToOne) {
            // token0/token1 price
            price = FullMath.mulDiv(priceX192, 1e18, Q192);

            // Adjust for token decimals
            if (decimals0 > decimals1) {
                price = price * (10 ** (decimals0 - decimals1));
            } else if (decimals1 > decimals0) {
                price = price / (10 ** (decimals1 - decimals0));
            }
        } else {
            // token1/token0 price (inverted)
            price = FullMath.mulDiv(1e18, Q192, priceX192);

            // Adjust for token decimals
            if (decimals1 > decimals0) {
                price = price * (10 ** (decimals1 - decimals0));
            } else if (decimals0 > decimals1) {
                price = price / (10 ** (decimals0 - decimals1));
            }
        }

        return price;
    }
}
