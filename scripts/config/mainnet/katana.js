/**
 * ============================================================================
 *  Promis deploy config — KATANA
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
  network: "katana",
  expectedChainId: 747474, // preflight aborts if the connected RPC isn't same
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
      symbol: "vbUSDC",                      // unique — used for state keys + logs
      address: "0x203A662b0BD271A6ed5a60EdFbd04bFce608FD36",
      name: "Vault Bridge USDC",
      decimals: 6,
      unmintFeePer: parseUnits("0.00007", 18), // 0.00007 = 0.007%
      unmintEligible: true,
      price: {
        staticPriceSource: 0n,               // 0 ⇒ oracle path (KEEP 0 on mainnet)
        usdCap: parseUnits("1", 18),         // arms the min/max clamp at $1
        chainlinkFeed: "0xbe5CE90e16B9d9d988D64b0E1f6ed46EbAfb9606",
        feedDecimals: 8,
        stalenessThreshold: 86400,           // optional; mapping default is 86400
        extraOracleAdaptors: [],             // optional extra IOracleAdaptor addresses (median)
      },
      venues: {
        morpho: [
          {
            label: "morpho-vbusdc-vbeth",   // vbUSDC backed by vbETH
            coreAddress: "0xD50F2DffFd62f94Ee4AEd9ca05C61d0753268aBc",
            marketId: "0x2fb14719030835b8e0a39a1461b384ad6a9c8392550197a7c857cf9fcbd6c534",
            allocationBps: 4000,
          },
          {
            label: "morpho-vbusdc-vbwbtc",  // vbUSDC backed by vbWBTC
            coreAddress: "0xD50F2DffFd62f94Ee4AEd9ca05C61d0753268aBc",
            marketId: "0xcd2dc555dced7422a3144a4126286675449019366f83e9717be7c2deb3daae3e",
            allocationBps: 6000,
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