// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

/**
 * @title ProTokenSettingsTypes
 * @notice Shared structs for protocol and yAsset configuration.
 */
library ProTokenSettingsTypes {
    /**
     * @notice Price configuration for a yAsset.
     * @param staticPriceSource Fixed USD price (18 dec); zero means use oracles.
     * @param usdCap Optional USD cap (18 dec); zero uses the 1:1 cap logic.
     * @param oraclePriceSources Oracle adaptors (median-aggregated when more than one).
     */
    struct YAssetPriceSettings {
        uint256 staticPriceSource;
        uint256 usdCap;
        address[] oraclePriceSources;
    }

    /**
     * @notice Configuration for a yield-bearing asset.
     * @param yOperationsHandler Yield operations handler for this yAsset.
     * @param decimals yAsset decimals, configured to avoid an on-chain decimals() call.
     * @param isEnabled Whether mint/unmint is allowed for this yAsset.
     * @param isPaused Whether the yAsset is temporarily paused.
     * @param unmintFeePer Unmint fee in wad (1e18 = 100%); deducted from the user's payout.
     * @param priceSettings Price configuration.
     */
    struct YAssetSettings {
        // ---- slot 0: handler (20) + decimals (1) + 2 bools (2) packed ----
        address yOperationsHandler;
        uint8 decimals;
        bool isEnabled;
        bool isPaused;
        // ---- slot 1 ----
        uint256 unmintFeePer;
        // ---- slots 2+: nested struct (2 value slots + dynamic array) ----
        YAssetPriceSettings priceSettings;
    }

    /**
     * @notice yAsset address paired with its settings (view response).
     * @param yAsset The yAsset address.
     * @param settings The yAsset's settings.
     */
    struct GetYAssetResponse {
        address yAsset;
        YAssetSettings settings;
    }

    /**
     * @notice Batch of yAsset settings (view response).
     * @param yAssets The per-yAsset responses.
     */
    struct GetYAssetsResponse {
        GetYAssetResponse[] yAssets;
    }

    /**
     * @notice Core protocol contract addresses plus proUSD price config (view response).
     * @param proToken proUSD token contract.
     * @param proTokenOperations ProTokenOperations contract.
     * @param proTokenUnmintHandler ProTokenUnmintHandler contract.
     */
    struct GetProTokenInfoResponse {
        address proToken;
        address proTokenOperations;
        address proTokenUnmintHandler;
    }
}