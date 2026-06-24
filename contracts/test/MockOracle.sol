// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import "../oracles/interfaces/IOracleAdaptor.sol";

/**
 * @title MockOracle
 * @notice Mock oracle for testing purposes
 * @dev Implements IOracleAdaptor interface with configurable prices
 */
contract MockOracle is IOracleAdaptor {
    mapping(address => uint256) public prices;
    uint256 public defaultPrice;
    bool public shouldRevert;
    string public revertMessage;

    constructor(uint256 _defaultPrice) {
        defaultPrice = _defaultPrice;
    }

    /**
     * @notice Set the price for a specific asset
     * @param asset The asset address
     * @param price The price in 18 decimals
     */
    function setPrice(address asset, uint256 price) external {
        prices[asset] = price;
    }

    /**
     * @notice Set the default price for all assets
     * @param price The default price in 18 decimals
     */
    function setDefaultPrice(uint256 price) external {
        defaultPrice = price;
    }

    /**
     * @notice Configure the oracle to revert on price queries
     * @param _shouldRevert Whether to revert
     * @param _message The revert message
     */
    function setShouldRevert(
        bool _shouldRevert,
        string memory _message
    ) external {
        shouldRevert = _shouldRevert;
        revertMessage = _message;
    }

    /**
     * @inheritdoc IOracleAdaptor
     */
    function getOraclePriceForAsset(
        address asset,
        bytes calldata /* payload */
    ) external view override returns (uint256) {
        if (shouldRevert) {
            revert(revertMessage);
        }

        uint256 price = prices[asset];
        if (price == 0) {
            return defaultPrice;
        }
        return price;
    }
}
