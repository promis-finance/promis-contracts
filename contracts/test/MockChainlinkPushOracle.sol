// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

/**
 * @title MockChainlinkPushOracle
 * @notice Mock Chainlink Push oracle for testing purposes
 * @dev Simulates the Chainlink Push oracle interface with configurable prices and timestamps
 */
contract MockChainlinkPushOracle {
    uint80 public roundId;
    int256 public answer;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public answeredInRound;

    bool public shouldRevert;
    bool public alwaysLatest;

    constructor(int256 _defaultPrice) {
        roundId = 1;
        answer = _defaultPrice;
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
        answeredInRound = 1;
        alwaysLatest = false;
    }

    /**
     * @notice Set the price and timestamp
     * @param _price The price value (as int256, matching Chainlink's interface)
     * @param _updatedAt The timestamp in seconds
     */
    function setPrice(int256 _price, uint256 _updatedAt) external {
        answer = _price;
        updatedAt = _updatedAt;
        startedAt = _updatedAt;
        roundId++;
        answeredInRound = roundId;
    }

    /**
     * @notice Set only the price, keeping current timestamp
     * @param _price The price value
     */
    function setPriceOnly(int256 _price) external {
        answer = _price;
        roundId++;
        answeredInRound = roundId;
    }

    /**
     * @notice Set only the timestamp, keeping current price
     * @param _updatedAt The timestamp in seconds
     */
    function setTimestamp(uint256 _updatedAt) external {
        updatedAt = _updatedAt;
        startedAt = _updatedAt;
    }

    /**
     * @notice Update the timestamp to current block time
     */
    function updateTimestampToNow() external {
        updatedAt = block.timestamp;
        startedAt = block.timestamp;
    }

    /**
     * @notice Configure the oracle to revert on queries
     * @param _shouldRevert Whether to revert
     */
    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    function setAlwaysLatest(bool _alwaysLatest) external {
        alwaysLatest = _alwaysLatest;
    }

    /**
     * @notice Get the latest round data (Chainlink interface)
     * @return _roundId The round ID
     * @return _answer The price answer
     * @return _startedAt When the round started
     * @return _updatedAt When the round was updated
     * @return _answeredInRound The round in which the answer was computed
     */
    function latestRoundData()
        external
        view
        returns (
            uint80 _roundId,
            int256 _answer,
            uint256 _startedAt,
            uint256 _updatedAt,
            uint80 _answeredInRound
        )
    {
        require(!shouldRevert, "MockChainlinkPushOracle: reverted");
        uint256 _time = alwaysLatest ? block.timestamp : updatedAt;
        return (roundId, answer, startedAt, _time, answeredInRound);
    }
}
