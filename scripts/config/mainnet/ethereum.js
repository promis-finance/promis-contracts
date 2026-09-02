/**
 * ============================================================================
 *  Promis deploy config — ETHEREUM
 * ============================================================================
 * 
 *  The file IS the topology. yAssets[] each get their own operations handler;
 *  each venues.aave[]/venues.morpho[] entry becomes one deployed handler. Empty
 *  venues → deposits sit idle (fully backed) until a handler is added later.
 * 
 * ============================================================================
 */
const { parseUnits } = require("ethers");

module.exports = {
  network: "ethereum",
  expectedChainId: 1,   // preflight aborts if the connected RPC isn't same
  useMocks: false,

  roles: {
    admin: "0xe7955723Bd93eA60723bECdC9c2cA0F49C568778",             // Final admin (multisig). Receives proposeAdmin at the end.
    operator: "0xD8995294d7893f7F59277ffd66410a41dD519Cad",
    priceOperator: "0xD8995294d7893f7F59277ffd66410a41dD519Cad",
    authority: "0xc57ee578C3cfb57173804CD26F37ECE38f5cd0b5",         // Backend proof signer
    strategist: "0x8E820C2789114D7a4328d7D6508f66a950c98D56",
    bridgeAdmin: "0xe7955723Bd93eA60723bECdC9c2cA0F49C568778",       // CCIP admin
    externalBusiness: "0xe7955723Bd93eA60723bECdC9c2cA0F49C568778",  // null → skipped
  },

  oracleAggregationMaxDeviationBps: 200,

  yAssets: [
    {
      symbol: "USDC",                       // unique — used for state keys + logs
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      name: "USD Coin",
      decimals: 6,
      unmintFeePer: parseUnits("0.00007", 18), // 0.00007 = 0.007%
      unmintEligible: true,
      price: {
        staticPriceSource: 0n,               // 0 ⇒ oracle path (KEEP 0 on mainnet)
        usdCap: parseUnits("1", 18),         // arms the min/max clamp at $1
        chainlinkFeed: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
        feedDecimals: 8,
        stalenessThreshold: 86400,           // optional; mapping default is 86400
        extraOracleAdaptors: [],             // optional extra IOracleAdaptor addresses (median)
      },
      venues: {
        aave: [
          {
            label: "aave-v3-core",
            poolAddress: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
            aTokenAddress: "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c",
            allocationBps: 7000,
            impairmentToleranceBps: 100,     // MUST be nonzero on live reserves
          },
        ],
        morpho: [
          {
            label: "morpho-wbtc-usdc",    // USDC backed by WBTC
            coreAddress: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb", 
            marketId: "0x3a85e619751152991742810df6ec69ce473daef99e28a64ab2340d7b7ccfee49",
            allocationBps: 3000,
          },
        ],
      },
    },
    {
      symbol: "USDT",
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      name: "Tether USD",
      decimals: 6,
      unmintFeePer: parseUnits("0.00007", 18), // 0.00007 = 0.007%
      unmintEligible: true,
      price: {
        staticPriceSource: 0n,               // 0 ⇒ oracle path (KEEP 0 on mainnet)
        usdCap: parseUnits("1", 18),         // arms the min/max clamp at $1
        chainlinkFeed: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
        feedDecimals: 8,
        stalenessThreshold: 86400,
        extraOracleAdaptors: [],
      },
      venues: {
        aave: [
          {
            label: "aave-v3-core",
            poolAddress: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
            aTokenAddress: "0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a",
            allocationBps: 10000,             // single venue → 100%
            impairmentToleranceBps: 100,
          },
        ],
      },
    },
  ],

  proToken: {
    name: "ProUSD",
    symbol: "ProUSD",
    stepSize: 0n,                    // 0 = step cap disabled
    priceUpdateCooldown: 8 * 3600,
    launchPrice: undefined,          // initialize() already seeds $1; set only to override
  },

  unmint: {
    batchDuration: 3600,
  },

  proTokenPlus: {
    tierIds: [1, 2],
    tiers: [
      { apr: parseUnits("0.135", 18), duration: 15552000, minDeposit: parseUnits("500", 18), isDepositable: true, isActive: true, name: "Semi-Annual" }, // 180d at 13.5%
      { apr: parseUnits("0.15", 18), duration: 31536000, minDeposit: parseUnits("100", 18), isDepositable: true, isActive: true, name: "Annual" },      // 365d at 15%
    ],
  },
};