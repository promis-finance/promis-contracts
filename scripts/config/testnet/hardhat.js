const { parseUnits } = require("ethers");

module.exports = {
  network: "ethereumTestnet",
  useMocks: true,

  roles: {
    admin: null,
    operator: null,
    priceOperator: null,
    authority: null,
    strategist: null,
    bridgeAdmin: null,
    externalBusiness: null,
  },

  yAsset: {
    address: null, 
    name: "USDT",
    symbol: "USDT",
    decimals: 6,
    unmintFeePer: parseUnits("0.001", 18), 
    staticPriceSource: 0n,
    usdCap: parseUnits("1", 18),
  },

  oracle: {
    mockAggregatorAnswer: 100000000n, 
    feedAddress: null, 
    feedDecimals: 8,
    aggregationMaxDeviationBps: 1000,
  },

  aave: {
    poolAddress: null,
    aTokenAddress: null,
    aTokenName: "aToken",
    aTokenSymbol: "aToken",
    aTokenDecimals: 6,
    impairmentToleranceBps: 50,
    allocationBps: 10000,
    mockYieldRateBps: 500,
    mockPreFund: parseUnits("10000000", 6),
  },

  proToken: {
    name: "ProUSD",
    symbol: "PUSD",
    stepSize: 0n,
    priceUpdateCooldown: 23 * 3600,
    launchPrice: undefined,
  },

  unmint: {
    batchDuration: 3600,
  },

  proTokenPlus: {
    tierIds: [1, 2],
    tiers: [
      { apr: parseUnits("0.10", 18), duration: 1800, minDeposit: parseUnits("500", 18), isDepositable: true, isActive: true, name: "Semi-Annual" },
      { apr: parseUnits("0.12", 18), duration: 3600, minDeposit: parseUnits("100", 18), isDepositable: true, isActive: true, name: "Annual" },
    ],
  },
};