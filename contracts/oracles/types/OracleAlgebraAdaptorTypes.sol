// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

/// @title OracleAlgebraAdaptorTypes
/// @notice Contains type definitions for OracleAlgebraAdaptor
library OracleAlgebraAdaptorTypes {
    /// @notice Pool configuration for a single hop in the route
    struct PoolConfig {
        address pool; // The Algebra pool address
        address plugin; // The volatility oracle plugin address
        address token0; // The token0 address of the pool
        address token1; // The token1 address of the pool
        bool zeroToOne; // true if asset is token0, false if token1
    }

    /// @notice Parameters for configuring a multi-hop route
    struct RouteParams {
        address[] pools; // Array of pool addresses
        address[] plugins; // Array of plugin addresses
        address[] tokens0; // Array of token0 addresses
        address[] tokens1; // Array of token1 addresses
        uint8[] decimals0; // Array of token0 decimals
        uint8[] decimals1; // Array of token1 decimals
        bool[] directions; // Array of trade directions (zeroToOne)
    }
}
