// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "../types/ProTokenUnmintHandlerTypes.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/**
 * @title ProTokenUnmintHandlerState
 * @notice Storage layout for ProTokenUnmintHandler, separated from logic.
 * @dev All per-yAsset state is keyed by yAsset address first. Append new variables
 *      before __gap and shrink __gap to preserve layout.
 */
abstract contract ProTokenUnmintHandlerState {
    /// @notice ProTokenSettings contract, source of roles.
    address internal proTokenSettings;

    /// @notice Duration of an unmint batch window, in seconds.
    uint256 internal unmintBatchDuration;

    /// @notice Current (open) batch ID per yAsset.
    mapping(address => uint256) internal curUnmintBatchIdPerYAsset;

    /// @notice Last processed batch ID per yAsset.
    mapping(address => uint256) internal lastUnmintBatchIdProcessedPerYAsset;

    /// @notice Next request ID to assign per yAsset.
    mapping(address => uint256) internal nextUnmintRequestIdPerYAsset;

    /// @notice Batch data: yAsset => batchId => batch.
    mapping(address => mapping(uint256 => ProTokenUnmintHandlerTypes.UnmintBatch))
        internal unmintBatchesPerYAsset;

    /// @notice Request data: yAsset => requestId => request.
    mapping(address => mapping(uint256 => ProTokenUnmintHandlerTypes.UnmintRequest))
        internal unmintRequestsPerYAsset;

    /// @notice Unclaimed batch IDs per receiver: receiver => yAsset => set of batchIds.
    mapping(address => mapping(address => EnumerableSet.UintSet))
        internal unclaimedUnmintBatchesPerReceiver;

    /// @notice Receiver's request ID within a batch: yAsset => batchId => receiver => requestId.
    mapping(address => mapping(uint256 => mapping(address => uint256)))
        internal unmintRequestIdForReceiverInBatch;

    /// @notice Reserved storage for future upgrades.
    uint256[41] internal __gap;
}