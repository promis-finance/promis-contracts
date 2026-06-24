// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;
pragma abicoder v2;

import "../types/OracleAlgebraAdaptorTypes.sol";

interface IOracleAlgebraAdaptor {
    // ================================================
    // =========== Open External Functions ============
    // ================================================

    // ================================================
    // ======== Restricted External Functions =========
    // ================================================

    // ================================================
    // =========== Owner External Functions ===========
    // ================================================

    /// @notice Configures the price route for an asset through one or more Algebra pools
    /// @dev This function is restricted to the admin of the contract
    /// @dev All array parameters must have the same length and be non-empty
    /// @param asset The asset to configure the route for
    /// @param params RouteParams struct containing all route configuration data
    function configureRoute(
        address asset,
        OracleAlgebraAdaptorTypes.RouteParams calldata params
    ) external;

    /// @notice Sets the TWAP periods for price calculation
    /// @dev This function is restricted to the admin of the contract
    /// @param _twapPeriod The primary TWAP period in seconds (e.g., 15 minutes)
    /// @param _twapPeriodMiddle The middle fallback TWAP period in seconds (e.g., 2 hours)
    /// @param _twapPeriodLongest The longest fallback TWAP period in seconds (e.g., 24 hours)
    function setTwapPeriods(
        uint32 _twapPeriod,
        uint32 _twapPeriodMiddle,
        uint32 _twapPeriodLongest
    ) external;

    // ================================================
    // ================ View functions ================
    // ================================================

    /// @notice Gets the configured route for a given asset
    /// @dev Returns an empty array if no route is configured
    /// @param asset The address of the asset to get the route for
    /// @return The array of PoolConfig structs representing the route
    function getRouteForAsset(
        address asset
    ) external view returns (OracleAlgebraAdaptorTypes.PoolConfig[] memory);

    // ================================================
    // ==================== Events ====================
    // ================================================

    /// @notice Emitted when a route is configured for an asset
    /// @param asset The address of the asset that was configured
    /// @param hopCount The number of hops in the configured route
    event RouteConfigured(address indexed asset, uint256 hopCount);

    /// @notice Emitted when TWAP periods are updated
    /// @param twapPeriod The new primary TWAP period
    /// @param twapPeriodMiddle The new middle TWAP period
    /// @param twapPeriodLongest The new longest TWAP period
    event TwapPeriodsUpdated(
        uint32 twapPeriod,
        uint32 twapPeriodMiddle,
        uint32 twapPeriodLongest
    );

    /// @notice Emitted when admin is updated
    /// @param newAdmin The new admin address
    event AdminUpdated(address indexed newAdmin);

    // ================================================
    // ==================== Errors ====================
    // ================================================

    error Unauthorized();
    error InvalidAddr();
    error InvalidInputs();
    error RouteNotConfigured();
    error InvalidOraclePrice();
    error StaleOracleData();
}
