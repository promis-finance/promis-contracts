// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

/**
 * @title ProTokenOperationsTypes
 * @notice Shared enums and structs for ProTokenOperations.
 */
library ProTokenOperationsTypes {
    /**
     * @notice Lifecycle state of a mint/unmint request.
     */
    enum Status {
        VOID,
        PENDING,
        EXECUTED
    }

    /**
     * @notice Backend authorization outcome: APPROVE finalizes, RETURN refunds the input.
     */
    enum ProofKind {
        PROOF_OF_APPROVE,
        PROOF_OF_RETURN
    }

    /**
    * @notice Multi-oracle aggregation parameters.
    * @param maxPriceDeviation Max allowed spread between the highest and lowest
    *        oracle price, in basis points relative to the lowest price
    *        (maxPrice/minPrice <= 1 + maxPriceDeviation/10000). Each source is
    *        additionally checked against the median with the same threshold.
    *        Zero disables the check.
    */
    struct OracleAggregationSettings {
        uint256 maxPriceDeviation;
    }

    /**
     * @notice A mint or unmint request.
     * @dev mint:   amount = yAsset in,  minAmountOut = proUSD out.
     *      unmint: amount = proUSD in,  minAmountOut = yAsset out.
     * @param user The requester.
     * @param status Lifecycle state, internally enforced.
     * @param receiver Output recipient; defaults to user when zero.
     * @param yAsset The yAsset involved.
     * @param amount Input amount (type-specific meaning above).
     * @param minAmountOut Minimum acceptable output (slippage floor).
     */
    struct Request {
        // ---- slot 0: address (20) + enum (1) packed ----
        address user;
        Status status;
        // ---- slot 1 ----
        address receiver;
        // ---- slot 2 ----
        address yAsset;
        // ---- slots 3-4 ----
        uint256 amount;
        uint256 minAmountOut;
    }
}