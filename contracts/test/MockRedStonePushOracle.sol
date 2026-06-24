// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

/**
 * @title MockRedStonePushOracle
 * @notice Mock RedStone Push oracle for testing purposes
 * @dev Simulates the RedStone Push oracle interface with configurable prices and timestamps
 */
contract MockRedStonePushOracle {
    struct PriceData {
        uint256 value;
        uint256 timestamp; // in milliseconds
    }

    mapping(bytes32 => PriceData) public priceData;
    uint256 public defaultPrice;
    uint256 public defaultTimestamp;
    bool public shouldRevert;

    constructor(uint256 _defaultPrice) {
        defaultPrice = _defaultPrice;
        defaultTimestamp = block.timestamp * 1000; // Convert to milliseconds
    }

    /**
     * @notice Set the price for a specific data feed
     * @param dataFeedId The data feed identifier (as string, will be converted to bytes32)
     * @param price The price value
     * @param timestampMs The timestamp in milliseconds
     */
    function setPrice(
        string memory dataFeedId,
        uint256 price,
        uint256 timestampMs
    ) external {
        bytes32 feedId = bytes32(bytes(dataFeedId));
        priceData[feedId] = PriceData({value: price, timestamp: timestampMs});
    }

    /**
     * @notice Set the price using bytes32 data feed ID
     * @param dataFeedId The data feed identifier
     * @param price The price value
     * @param timestampMs The timestamp in milliseconds
     */
    function setPriceBytes32(
        bytes32 dataFeedId,
        uint256 price,
        uint256 timestampMs
    ) external {
        priceData[dataFeedId] = PriceData({
            value: price,
            timestamp: timestampMs
        });
    }

    /**
     * @notice Set the default price for all data feeds
     * @param price The default price
     */
    function setDefaultPrice(uint256 price) external {
        defaultPrice = price;
    }

    /**
     * @notice Set the default timestamp for all data feeds
     * @param timestampMs The default timestamp in milliseconds
     */
    function setDefaultTimestamp(uint256 timestampMs) external {
        defaultTimestamp = timestampMs;
    }

    /**
     * @notice Update the default timestamp to current block time
     */
    function updateDefaultTimestampToNow() external {
        defaultTimestamp = block.timestamp * 1000;
    }

    /**
     * @notice Configure the oracle to revert on queries
     * @param _shouldRevert Whether to revert
     */
    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    /**
     * @notice Get the value for a data feed (RedStone Push interface)
     * @param dataFeedId The data feed identifier
     * @return The price value
     */
    function getValueForDataFeed(
        bytes32 dataFeedId
    ) external view returns (uint256) {
        require(!shouldRevert, "MockRedStonePushOracle: reverted");

        PriceData memory data = priceData[dataFeedId];
        if (data.value == 0 && data.timestamp == 0) {
            return defaultPrice;
        }
        return data.value;
    }

    /**
     * @notice Get the timestamp of the latest update for a data feed (RedStone Push interface)
     * @param dataFeedId The data feed identifier
     * @return The timestamp in milliseconds
     */
    function getDataTimestampFromLatestUpdate(
        bytes32 dataFeedId
    ) external view returns (uint256) {
        require(!shouldRevert, "MockRedStonePushOracle: reverted");

        PriceData memory data = priceData[dataFeedId];
        if (data.value == 0 && data.timestamp == 0) {
            return defaultTimestamp;
        }
        return data.timestamp;
    }
}
