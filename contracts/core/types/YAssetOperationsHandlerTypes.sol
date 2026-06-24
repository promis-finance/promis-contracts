// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

/**
 * @title YAssetOperationsHandlerTypes
 * @notice Structs for yield protocol handler allocation.
 */
library YAssetOperationsHandlerTypes {
    /**
     * @notice A yield protocol handler and its share of distributed yAsset.
     * @param handlerContract The yield handler contract.
     * @param allocationPercentage Allocation in basis points (sum across handlers = 10000).
     */
    struct YieldProtocolHandler {
        address handlerContract;
        uint256 allocationPercentage;
    }
}