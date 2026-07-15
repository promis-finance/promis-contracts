// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;
pragma abicoder v2;

/// @title The interface of the proToken Settings
interface IOracleAdaptor {
    // ================================================
    // =========== Open External Functions ============
    // ================================================

    // ================================================
    // ======== Restricted External Functions =========
    // ================================================

    // ================================================
    // =========== Owner External Functions ===========
    // ================================================

    // ================================================
    // ================ View functions ================
    // ================================================

    /// @notice Gets the price for a given asset using oracle
    /// @dev This function returns the price of the asset in 18 decimal format
    /// @param asset The address of the asset for which the price is requested
    /// @return The price of the asset in 18 decimal format
    function getOraclePriceForAsset(
        address asset
    ) external view returns (uint256);

    // ================================================
    // ==================== Events ====================
    // ================================================

    // ================================================
    // ==================== Errors ====================
    // ================================================
}
