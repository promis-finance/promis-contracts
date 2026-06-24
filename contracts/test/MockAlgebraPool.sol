// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

/**
 * @title MockAlgebraPool
 * @notice Mock Algebra pool for testing TWAP oracle functionality
 * @dev Simulates the Algebra pool and plugin interfaces for TWAP calculations
 */
contract MockAlgebraPool {
    address public token0;
    address public token1;
    address public plugin;

    int56[] public tickCumulatives;
    uint88[] public volatilityCumulatives;
    bool public shouldRevert;
    bool public returnStaleData;

    constructor() {
        // Initialize with default values
        tickCumulatives = new int56[](2);
        volatilityCumulatives = new uint88[](2);
    }

    /**
     * @notice Set the pool tokens
     * @param _token0 Token 0 address
     * @param _token1 Token 1 address
     */
    function setTokens(address _token0, address _token1) external {
        token0 = _token0;
        token1 = _token1;
    }

    /**
     * @notice Set the plugin address
     * @param _plugin Plugin address
     */
    function setPlugin(address _plugin) external {
        plugin = _plugin;
    }

    /**
     * @notice Set tick cumulative values for TWAP calculation
     * @param tick The average tick value
     * @param period The time period in seconds
     */
    function setTickCumulative(int24 tick, uint32 period) external {
        // Calculate tick cumulatives such that (tickCumulatives[1] - tickCumulatives[0]) / period = tick
        tickCumulatives[0] = 0;
        tickCumulatives[1] = int56(tick) * int56(uint56(period));
    }

    /**
     * @notice Set raw tick cumulative values
     * @param tickCumulative0 First tick cumulative
     * @param tickCumulative1 Second tick cumulative
     */
    function setRawTickCumulatives(
        int56 tickCumulative0,
        int56 tickCumulative1
    ) external {
        tickCumulatives[0] = tickCumulative0;
        tickCumulatives[1] = tickCumulative1;
    }

    /**
     * @notice Configure to return stale data (same tick cumulatives)
     * @param _returnStale Whether to return stale data
     */
    function setReturnStaleData(bool _returnStale) external {
        returnStaleData = _returnStale;
        if (_returnStale) {
            tickCumulatives[0] = 0;
            tickCumulatives[1] = 0;
        }
    }

    /**
     * @notice Configure the pool to revert on queries
     * @param _shouldRevert Whether to revert
     */
    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    /**
     * @notice Get timepoints (Algebra Volatility Oracle interface)
     * @param secondsAgos Array of seconds ago values
     * @return tickCumulatives_ Array of tick cumulative values
     * @return volatilityCumulatives_ Array of volatility cumulative values
     */
    function getTimepoints(
        uint32[] calldata secondsAgos
    )
        external
        view
        returns (
            int56[] memory tickCumulatives_,
            uint88[] memory volatilityCumulatives_
        )
    {
        require(!shouldRevert, "MockAlgebraPool: reverted");
        require(secondsAgos.length == 2, "MockAlgebraPool: invalid input");

        tickCumulatives_ = new int56[](2);
        volatilityCumulatives_ = new uint88[](2);

        tickCumulatives_[0] = tickCumulatives[0];
        tickCumulatives_[1] = tickCumulatives[1];
        volatilityCumulatives_[0] = volatilityCumulatives[0];
        volatilityCumulatives_[1] = volatilityCumulatives[1];

        return (tickCumulatives_, volatilityCumulatives_);
    }
}

/**
 * @title MockAlgebraPlugin
 * @notice Mock Algebra plugin for testing TWAP oracle functionality
 * @dev Simulates the IVolatilityOracle interface
 */
contract MockAlgebraPlugin {
    MockAlgebraPool public pool;
    bool public shouldRevert;

    constructor(address _pool) {
        pool = MockAlgebraPool(_pool);
    }

    /**
     * @notice Configure the plugin to revert on queries
     * @param _shouldRevert Whether to revert
     */
    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    /**
     * @notice Get timepoints (delegates to pool)
     * @param secondsAgos Array of seconds ago values
     * @return tickCumulatives_ Array of tick cumulative values
     * @return volatilityCumulatives_ Array of volatility cumulative values
     */
    function getTimepoints(
        uint32[] calldata secondsAgos
    )
        external
        view
        returns (
            int56[] memory tickCumulatives_,
            uint88[] memory volatilityCumulatives_
        )
    {
        require(!shouldRevert, "MockAlgebraPlugin: reverted");
        return pool.getTimepoints(secondsAgos);
    }
}
