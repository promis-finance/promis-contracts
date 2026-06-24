let hre = require("hardhat");
let {ethers, upgrades} = require("hardhat");

async function main() {

    // Signer
    const [deployer] = await ethers.getSigners();

    // Mock Tokens
    console.log("----- Mock Tokens");

    const YAsset1 = await ethers.getContractFactory("MintableERC20", deployer);
    const yAsset1 = await YAsset1.deploy("USDT", "USDT", 6);
    await yAsset1.waitForDeployment();
    console.log(`YAsset1: ${await yAsset1.getAddress()}`);

    // Contracts proUSD
    console.log("----- proUSD");

    const ProTokenSettings = await ethers.getContractFactory("ProTokenSettings", deployer);
    const proTokenSettings = await upgrades.deployProxy(ProTokenSettings, [deployer.address, deployer.address], { kind: "uups" });
    await proTokenSettings.waitForDeployment();
    console.log(`ProTokenSettings: ${await proTokenSettings.getAddress()}`);

    const ProTokenOperations = await ethers.getContractFactory("ProTokenOperations", deployer);
    const proTokenOperations = await upgrades.deployProxy(ProTokenOperations, [await proTokenSettings.getAddress()], { kind: "uups" });
    await proTokenOperations.waitForDeployment();
    console.log(`ProTokenOperations: ${await proTokenOperations.getAddress()}`);

    const ProToken = await ethers.getContractFactory("ProToken", deployer);
    const proToken = await upgrades.deployProxy(ProToken, ["ProUSD", "PUSD", await proTokenSettings.getAddress(), await proTokenOperations.getAddress()], { kind: "uups" });
    await proToken.waitForDeployment();
    console.log(`ProToken: ${await proToken.getAddress()}`);

    const YAssetOperationsHandler = await ethers.getContractFactory("YAssetOperationsHandler", deployer);
    const yAssetOperationsHandler = await upgrades.deployProxy(YAssetOperationsHandler, [await proTokenSettings.getAddress(), await yAsset1.getAddress()], { kind: "uups" });
    await yAssetOperationsHandler.waitForDeployment();
    console.log(`YAssetOperationsHandler: ${await yAssetOperationsHandler.getAddress()}`);

    const ProTokenUnmintHandler = await ethers.getContractFactory("ProTokenUnmintHandler", deployer);
    const proTokenUnmintHandler = await upgrades.deployProxy(ProTokenUnmintHandler, [await proTokenSettings.getAddress(), 3600], { kind: "uups" });
    await proTokenUnmintHandler.waitForDeployment();
    console.log(`ProTokenUnmintHandler: ${await proTokenUnmintHandler.getAddress()}`);

    // Contracts proUSD+
    console.log("----- proUSD+");

    // TierConfig struct order: apr, duration, minDeposit, isDepositable, isActive, name
    const tierIds = [1, 2];
    const tierConfigs = [
        {
            apr: "100000000000000000",                 // 10% in 1e18
            duration: 1800,
            minDeposit: ethers.parseUnits("500", 18),  // base/USD
            isDepositable: true,
            isActive: true,
            name: "Semi-Annual",
        },
        {
            apr: "120000000000000000",                 // 12% in 1e18
            duration: 3600,
            minDeposit: ethers.parseUnits("100", 18),  // base/USD
            isDepositable: true,
            isActive: true,
            name: "Annual",
        },
    ];

    const ProTokenPlusOperations = await ethers.getContractFactory("ProTokenPlusOperations", deployer);
    const proTokenPlusOperations = await ProTokenPlusOperations.deploy();
    await proTokenPlusOperations.waitForDeployment();
    console.log(`ProTokenPlusOperations: ${await proTokenPlusOperations.getAddress()}`);

    const ProTokenPlus = await ethers.getContractFactory("ProTokenPlus", deployer);
    const proTokenPlus = await upgrades.deployProxy(ProTokenPlus, [await proTokenSettings.getAddress(), await proToken.getAddress(), tierIds, tierConfigs], { kind: "uups" });
    await proTokenPlus.waitForDeployment();
    console.log(`ProTokenPlus: ${await proTokenPlus.getAddress()}`);

    // Mock AaveV3
    console.log("----- Mock AaveV3");

    const MockAaveV3Pool = await ethers.getContractFactory("MockAaveV3", deployer);
    const mockAaveV3Pool = await MockAaveV3Pool.deploy();
    await mockAaveV3Pool.waitForDeployment();
    console.log(`MockAaveV3Pool: ${await mockAaveV3Pool.getAddress()}`);

    const AToken = await ethers.getContractFactory("MockATokenV3", deployer);
    const aToken = await AToken.deploy("USDT", "USDT", 6);
    await aToken.waitForDeployment();
    console.log(`aToken: ${await aToken.getAddress()}`);

    // AaveV3YieldHandler
    console.log("----- AaveV3YieldHandler");
    const AaveV3YieldHandler = await ethers.getContractFactory("AaveV3YieldHandler", deployer);
    const aaveV3YieldHandler = await upgrades.deployProxy(AaveV3YieldHandler, [await proTokenSettings.getAddress(), await yAssetOperationsHandler.getAddress(), await mockAaveV3Pool.getAddress(), await yAsset1.getAddress(), await aToken.getAddress()], { kind: "uups" });
    await aaveV3YieldHandler.waitForDeployment();
    console.log(`AaveV3YieldHandler: ${await aaveV3YieldHandler.getAddress()}`);

    // Mock Aggregators
    console.log("----- Mock Aggregators");
    const YAsset1Aggregator = await ethers.getContractFactory("MockChainlinkPushOracle", deployer);
    const yAsset1Aggregator = await YAsset1Aggregator.deploy(100000000);
    console.log(`YAsset1Aggregator: ${await yAsset1Aggregator.getAddress()}`);

    // Contracts oracles
    console.log("----- Oracles");
    const OracleAdaptor = await ethers.getContractFactory("OracleChainlinkPushAdaptor", deployer);
    const oracleAdaptor = await upgrades.deployProxy(OracleAdaptor, [await proTokenSettings.getAddress()], { kind: "uups" });
    await oracleAdaptor.waitForDeployment();
    console.log(`OracleAdaptor: ${await oracleAdaptor.getAddress()}`);

    // -----------------------------------------------------------------
    // Wire core protocol addresses into Settings FIRST.
    // StrategyVault.initialize() snapshots proToken / proTokenOperations via
    // getProTokenInfo(), so these MUST be set before the vault is deployed.
    // -----------------------------------------------------------------
    await (await proTokenSettings.setProToken(await proToken.getAddress())).wait();
    await (await proTokenSettings.setProTokenOperations(await proTokenOperations.getAddress())).wait();
    await (await proTokenSettings.setProTokenUnmintHandler(await proTokenUnmintHandler.getAddress())).wait();

    // StrategyVault — deploy AFTER proToken / proTokenOperations are known to Settings.
    console.log("----- StrategyVault");
    const StrategyVault = await ethers.getContractFactory("StrategyVault", deployer);
    const strategyVault = await upgrades.deployProxy(
        StrategyVault,
        [await proTokenSettings.getAddress(), await proTokenPlus.getAddress()],
        { kind: "uups" }
    );
    await strategyVault.waitForDeployment();
    console.log(`StrategyVault: ${await strategyVault.getAddress()}`);

    await (await proTokenSettings.setStrategyVault(await strategyVault.getAddress())).wait();

    // yAsset config.
    // YAssetPriceSettings struct order: staticPriceSource, usdCap, oraclePriceSources
    // YAssetSettings struct order: yOperationsHandler, decimals, isEnabled, isPaused, unmintFeePer, priceSettings
    const yAsset1PriceSettings = {
        staticPriceSource: 0,
        usdCap: ethers.parseUnits("1", 18),
        oraclePriceSources: [await oracleAdaptor.getAddress()],
    };
    const yAsset1Settings = {
        yOperationsHandler: await yAssetOperationsHandler.getAddress(),
        decimals: 6,
        isEnabled: true,
        isPaused: false,
        unmintFeePer: ethers.parseUnits("0.001", 18), // 0.1%
        priceSettings: yAsset1PriceSettings,
    };

    await (await proTokenSettings.setYAsset(await yAsset1.getAddress(), yAsset1Settings)).wait();
    await (await proTokenSettings.setUnmintYAssets([await yAsset1.getAddress()])).wait();
    await (await proTokenSettings.setOracleAggregationSettings(1000)).wait();

    // Authority (proof signer) is registered ONCE in Settings; both
    // ProTokenOperations and ProTokenPlusOperations read it from there.
    await (await proTokenSettings.setAuthority(deployer.address, true)).wait();

    // ProTokenPlus satellite wiring.
    await (await proTokenPlus.setOperationsHandler(await proTokenPlusOperations.getAddress())).wait();

    // Yield routing + oracle mappings.
    await (await yAssetOperationsHandler.setYProtocolHandlers([await aaveV3YieldHandler.getAddress()], [10000])).wait(); // 100%
    await (await oracleAdaptor.setAssetToPushOracleMappings([await yAsset1.getAddress()], [await yAsset1Aggregator.getAddress()], [8])).wait();

    // Aave mock plumbing + yield pre-fund.
    await (await aToken.setPool(await mockAaveV3Pool.getAddress())).wait();
    await (await mockAaveV3Pool.setAToken(await yAsset1.getAddress(), await aToken.getAddress())).wait();
    await (await mockAaveV3Pool.setYieldRate(await yAsset1.getAddress(), 500)).wait(); // 5%

    const preFundAmount = ethers.parseUnits("10000000", 6);
    await (await yAsset1.mint(deployer.address, preFundAmount)).wait();
    await (await yAsset1.approve(await mockAaveV3Pool.getAddress(), preFundAmount)).wait();
    await (await mockAaveV3Pool.fundPoolForYield(await yAsset1.getAddress(), preFundAmount)).wait();

    console.log("----- Done");
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
});