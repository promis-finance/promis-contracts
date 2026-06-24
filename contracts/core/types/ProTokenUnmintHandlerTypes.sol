// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

/**
 * @title ProTokenUnmintHandlerTypes
 * @notice Structs for batched unmint requests and their settlement batches.
 */
library ProTokenUnmintHandlerTypes {
    /**
     * @notice A receiver's aggregated unmint request within a batch.
     * @param receiver Recipient of the yAsset on claim.
     * @param claimed Whether the request has been claimed.
     * @param yAsset The yAsset to receive.
     * @param requestId This request's ID.
     * @param batchId The batch this request belongs to.
     * @param totalAmount Total yAsset owed (sum of amounts).
     * @param claimTimestamp When claimed (0 if unclaimed).
     * @param amounts Individual amounts aggregated into this request.
     * @param createTimestamps Creation time of each aggregated amount.
     */
    struct UnmintRequest {
        // ---- slot 0: address (20) + bool (1) ----
        address receiver;
        bool claimed;
        // ---- slot 1 ----
        address yAsset;
        // ---- slots 2-5 ----
        uint256 requestId;
        uint256 batchId;
        uint256 totalAmount;
        uint256 claimTimestamp;
        // ---- dynamic arrays (one slot each at position) ----
        uint256[] amounts;
        uint256[] createTimestamps;
    }

    /**
     * @notice A settlement batch grouping unmint requests over a time window.
     * @param yAsset The yAsset for this batch.
     * @param processed Whether the batch has been funded/processed.
     * @param batchId This batch's ID.
     * @param totalAmount Total yAsset across all requests in the batch.
     * @param createTimestamp Batch creation time.
     * @param processTimestamp When processed (0 if not).
     * @param totalAlreadyClaimed Cumulative claimed from this batch.
     */
    struct UnmintBatch {
        // ---- slot 0: address (20) + bool (1) ----
        address yAsset;
        bool processed;
        // ---- slots 1-5 ----
        uint256 batchId;
        uint256 totalAmount;
        uint256 createTimestamp;
        uint256 processTimestamp;
        uint256 totalAlreadyClaimed;
    }
}