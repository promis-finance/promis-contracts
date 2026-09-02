const { parseUnits } = require("ethers");

module.exports = {
  network: "ethereumTestnet",
  useMocks: true, // deploy mocks; set false to use real addresses below

  // Roles. deployer (null → deployer).
  roles: {
    admin: null,
    operator: null,
    priceOperator: null,
    authority: null, // proof signer
    strategist: null,
    bridgeAdmin: null,
    externalBusiness: null, // null → skipped
  },

  // yAsset (deposit token). null address → deploy a mock; else use the real one.
  yAsset: {
    address: null, // null → deploy MintableERC20
    name: "USDT",
    symbol: "USDT",
    decimals: 6,
    unmintFeePer: parseUnits("0.001", 18), // 0.1%
    staticPriceSource: 0n, // 0 → oracle path
    usdCap: parseUnits("1", 18),
  },

  oracle: {
    mockAggregatorAnswer: 100000000n, // $1 @ 8 decimals (mock only)
    feedAddress: null, // null → deploy mock
    feedDecimals: 8,
    aggregationMaxDeviationBps: 1000,
  },

  aave: {
    poolAddress: null,   // null → deploy MockAaveV3
    aTokenAddress: null, // null → deploy MockATokenV3
    aTokenName: "aToken",
    aTokenSymbol: "aToken",
    aTokenDecimals: 6,
    impairmentToleranceBps: 50, // 0.5%
    allocationBps: 10000,       // 100% to Aave
    mockYieldRateBps: 500,      // 5% (mock only)
    mockPreFund: parseUnits("10000000", 6), 
  },

  proToken: {
    name: "ProUSD",
    symbol: "PUSD",
    stepSize: 0n,                   // 0 = per-update step cap disabled
    priceUpdateCooldown: 23 * 3600, // 23h
    launchPrice: undefined,         // undefined → keep 1e18 init default
  },

  unmint: {
    batchDuration: 3600, // 1h
  },

  // proUSD+ tiers. Short testnet durations so locks are exercisable quickly.
  proTokenPlus: {
    tierIds: [1, 2],
    tiers: [
      { apr: parseUnits("0.10", 18), duration: 1800, minDeposit: parseUnits("500", 18), isDepositable: true, isActive: true, name: "Semi-Annual" },
      { apr: parseUnits("0.12", 18), duration: 3600, minDeposit: parseUnits("100", 18), isDepositable: true, isActive: true, name: "Annual" },
    ],
  },
};