const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

// Proof validity window; wide enough for these sequential tests.
const PROOF_TTL = 3n * 365n * 86400n; // 3 years
async function futureDeadline(ttl = PROOF_TTL) {
    const block = await ethers.provider.getBlock("latest");
    return BigInt(block.timestamp) + ttl;
}

describe("Deployment", function () {
    let deployer;
    let yAsset1;
    let proTokenSettings, proTokenOperations, proToken;
    let yAssetOperationsHandler, proTokenUnmintHandler;
    let proTokenPlusOperations, proTokenPlus;
    let strategyVault;
    let mockAaveV3Pool, aToken;
    let aaveV3YieldHandler;
    let yAsset1Aggregator, oracleAdaptor;

    it("deploys and wires the full protocol", async function () {
        // Signer
        [deployer] = await ethers.getSigners();

        // Mock Tokens
        console.log("----- Mock Tokens");
        const YAsset1 = await ethers.getContractFactory("MintableERC20", deployer);
        yAsset1 = await YAsset1.deploy("USDT", "USDT", 6);
        await yAsset1.waitForDeployment();
        console.log(`YAsset1: ${await yAsset1.getAddress()}`);

        // Contracts proUSD
        console.log("----- proUSD");
        const ProTokenSettings = await ethers.getContractFactory("ProTokenSettings", deployer);
        proTokenSettings = await upgrades.deployProxy(ProTokenSettings, [deployer.address, deployer.address, deployer.address], { kind: "uups" });
        await proTokenSettings.waitForDeployment();
        console.log(`ProTokenSettings: ${await proTokenSettings.getAddress()}`);

        const ProTokenOperations = await ethers.getContractFactory("ProTokenOperations", deployer);
        proTokenOperations = await upgrades.deployProxy(ProTokenOperations, [await proTokenSettings.getAddress()], { kind: "uups" });
        await proTokenOperations.waitForDeployment();
        console.log(`ProTokenOperations: ${await proTokenOperations.getAddress()}`);

        const ProToken = await ethers.getContractFactory("ProToken", deployer);
        proToken = await upgrades.deployProxy(ProToken, ["ProUSD", "PUSD", await proTokenSettings.getAddress(), await proTokenOperations.getAddress()], { kind: "uups" });
        await proToken.waitForDeployment();
        console.log(`ProToken: ${await proToken.getAddress()}`);

        const YAssetOperationsHandler = await ethers.getContractFactory("YAssetOperationsHandler", deployer);
        yAssetOperationsHandler = await upgrades.deployProxy(YAssetOperationsHandler, [await proTokenSettings.getAddress(), await yAsset1.getAddress()], { kind: "uups" });
        await yAssetOperationsHandler.waitForDeployment();
        console.log(`YAssetOperationsHandler: ${await yAssetOperationsHandler.getAddress()}`);

        const ProTokenUnmintHandler = await ethers.getContractFactory("ProTokenUnmintHandler", deployer);
        proTokenUnmintHandler = await upgrades.deployProxy(ProTokenUnmintHandler, [await proTokenSettings.getAddress(), 3600], { kind: "uups" });
        await proTokenUnmintHandler.waitForDeployment();
        console.log(`ProTokenUnmintHandler: ${await proTokenUnmintHandler.getAddress()}`);

        // Contracts proUSD+
        console.log("----- proUSD+");
        const tierIds = [1, 2];
        const tierConfigs = [
            [
                "100000000000000000",           // apr (10% in 1e18)
                15768000,                       // duration (~6 months)
                ethers.parseUnits("500", 18),   // minDeposit (base/USD)
                true,                           // isDepositable
                true,                           // isActive
                "Semi-Annual"                   // name
            ],
            [
                "120000000000000000",           // apr (12% in 1e18)
                31536000,                       // duration (1 year)
                ethers.parseUnits("100", 18),   // minDeposit (base/USD)
                true,                           // isDepositable
                true,                           // isActive
                "Annual"                        // name
            ]
        ];

        const ProTokenPlusOperations = await ethers.getContractFactory("ProTokenPlusOperations", deployer);
        proTokenPlusOperations = await ProTokenPlusOperations.deploy();
        await proTokenPlusOperations.waitForDeployment();
        console.log(`ProTokenPlusOperations: ${await proTokenPlusOperations.getAddress()}`);

        const ProTokenPlus = await ethers.getContractFactory("ProTokenPlus", deployer);
        proTokenPlus = await upgrades.deployProxy(ProTokenPlus, [await proTokenSettings.getAddress(), await proToken.getAddress(), tierIds, tierConfigs], { kind: "uups" });
        await proTokenPlus.waitForDeployment();
        console.log(`ProTokenPlus: ${await proTokenPlus.getAddress()}`);

        // Mock AaveV3
        console.log("----- Mock AaveV3");
        const MockAaveV3Pool = await ethers.getContractFactory("MockAaveV3", deployer);
        mockAaveV3Pool = await MockAaveV3Pool.deploy();
        await mockAaveV3Pool.waitForDeployment();
        console.log(`MockAaveV3Pool: ${await mockAaveV3Pool.getAddress()}`);

        const AToken = await ethers.getContractFactory("MockATokenV3", deployer);
        aToken = await AToken.deploy("USDT", "USDT", 6);
        await aToken.waitForDeployment();
        console.log(`aToken: ${await aToken.getAddress()}`);

        // AaveV3YieldHandler
        console.log("----- AaveV3YieldHandler");
        const AaveV3YieldHandler = await ethers.getContractFactory("AaveV3YieldHandler", deployer);
        aaveV3YieldHandler = await upgrades.deployProxy(AaveV3YieldHandler, [await proTokenSettings.getAddress(), await yAssetOperationsHandler.getAddress(), await mockAaveV3Pool.getAddress(), await yAsset1.getAddress(), await aToken.getAddress()], { kind: "uups" });
        await aaveV3YieldHandler.waitForDeployment();
        console.log(`AaveV3YieldHandler: ${await aaveV3YieldHandler.getAddress()}`);

        // Mock Aggregators
        console.log("----- Mock Aggregators");
        const YAsset1Aggregator = await ethers.getContractFactory("MockChainlinkPushOracle", deployer);
        yAsset1Aggregator = await YAsset1Aggregator.deploy(100000000);
        console.log(`YAsset1Aggregator: ${await yAsset1Aggregator.getAddress()}`);

        // Contracts oracles
        console.log("----- Oracles");
        const OracleAdaptor = await ethers.getContractFactory("OracleChainlinkPushAdaptor", deployer);
        oracleAdaptor = await upgrades.deployProxy(OracleAdaptor, [await proTokenSettings.getAddress()], { kind: "uups" });
        await oracleAdaptor.waitForDeployment();
        console.log(`OracleAdaptor: ${await oracleAdaptor.getAddress()}`);

        // -----------------------------------------------------------------
        // Wire core protocol addresses into Settings FIRST.
        // StrategyVault.initialize() snapshots proToken/proTokenOperations via
        // getProTokenInfo(), so these MUST be set before the vault is deployed.
        // -----------------------------------------------------------------
        await (await proTokenSettings.setProToken(await proToken.getAddress())).wait();
        await (await proTokenSettings.setProTokenOperations(await proTokenOperations.getAddress())).wait();
        await (await proTokenSettings.setProTokenUnmintHandler(await proTokenUnmintHandler.getAddress())).wait();

        // StrategyVault — deploy AFTER proToken/proTokenOperations are known to Settings.
        console.log("----- StrategyVault");
        const StrategyVault = await ethers.getContractFactory("StrategyVault", deployer);
        strategyVault = await upgrades.deployProxy(
            StrategyVault,
            [await proTokenSettings.getAddress(), await proTokenPlus.getAddress()],
            { kind: "uups" }
        );
        await strategyVault.waitForDeployment();
        console.log(`StrategyVault: ${await strategyVault.getAddress()}`);
        await (await proTokenSettings.setStrategyVault(await strategyVault.getAddress())).wait();

        // yAsset config — NOTE field order matches the packed YAssetSettings /
        // YAssetPriceSettings structs exactly (ethers encodes tuples positionally).
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
        await (await yAssetOperationsHandler.setYProtocolHandlers([await aaveV3YieldHandler.getAddress()], [10000], false)).wait(); // 100%
        await (await oracleAdaptor.setAssetToPushOracleMappings([await yAsset1.getAddress()], [await yAsset1Aggregator.getAddress()], [8])).wait();

        // Aave mock plumbing + yield pre-fund.
        await (await aToken.setPool(await mockAaveV3Pool.getAddress())).wait();
        await (await mockAaveV3Pool.setAToken(await yAsset1.getAddress(), await aToken.getAddress())).wait();
        await (await mockAaveV3Pool.setYieldRate(await yAsset1.getAddress(), 500)).wait(); // 5%
        const preFundAmount = ethers.parseUnits("10000000", 6);
        await (await yAsset1.mint(deployer.address, preFundAmount)).wait();
        await (await yAsset1.approve(await mockAaveV3Pool.getAddress(), preFundAmount)).wait();
        await (await mockAaveV3Pool.fundPoolForYield(await yAsset1.getAddress(), preFundAmount)).wait();

        // Sanity: vault snapshotted the right core addresses at init.
        expect(await strategyVault.proToken()).to.equal(await proToken.getAddress());
        expect(await strategyVault.proTokenOperations()).to.equal(await proTokenOperations.getAddress());
        expect(await strategyVault.proTokenPlus()).to.equal(await proTokenPlus.getAddress());
    });

    it("mints proUSD via ProTokenOperations (createMintRequest -> sign -> finalize)", async function () {
        const [, alice] = await ethers.getSigners();

        // -----------------------------------------------------------------
        // Fund alice with USDT so she can deposit it as the yAsset.
        // -----------------------------------------------------------------
        const mintUSDT = ethers.parseUnits("1000", 6); // 1,000 USDT
        await (await yAsset1.mint(alice.address, mintUSDT)).wait();
        await (await yAsset1.connect(alice).approve(await proTokenOperations.getAddress(), mintUSDT)).wait();

        // -----------------------------------------------------------------
        // Step 1: alice creates a mint request.
        //         minAmountOut is the minimum proUSD she's willing to receive.
        //         1000 USDT >> minDepositBase (100), so the floor passes.
        // -----------------------------------------------------------------
        console.log("----- proUSD: createMintRequest");
        const minMintOut = ethers.parseUnits("990", 18); // tolerate small slippage
        let tx = await proTokenOperations.connect(alice).createMintRequest(
            await yAsset1.getAddress(),
            mintUSDT,
            minMintOut,
            alice.address,
        );
        let receipt = await tx.wait();

        // Extract mint request ID from MintRequestCreated event
        const mintReqEvent = receipt.logs
            .map((log) => { try { return proTokenOperations.interface.parseLog(log); } catch { return null; } })
            .find((p) => p && p.name === "MintRequestCreated");
        expect(mintReqEvent, "MintRequestCreated not emitted").to.not.be.null;
        const mintRequestId = mintReqEvent.args.requestID ?? mintReqEvent.args[0];
        console.log(`  mintRequestId: ${mintRequestId}`);

        // -----------------------------------------------------------------
        // Step 2: authority (deployer) signs PROOF_OF_APPROVE via EIP-712.
        //         Typehash must match ProTokenOperations.MINT_PROOF_TYPEHASH:
        //         MintProof(uint256 requestId,address user,address receiver,
        //                   address yAsset,uint256 amount,uint256 minAmountOut,
        //                   uint256 deadline,uint8 proofKind)
        // -----------------------------------------------------------------
        console.log("----- proUSD: sign PROOF_OF_APPROVE");
        const mintDomain = {
            name: "ProTokenOperations",
            version: "1",
            chainId: (await ethers.provider.getNetwork()).chainId,
            verifyingContract: await proTokenOperations.getAddress(),
        };
        const mintTypes = {
            MintProof: [
                { name: "requestId",    type: "uint256" },
                { name: "user",         type: "address" },
                { name: "receiver",     type: "address" },
                { name: "yAsset",       type: "address" },
                { name: "amount",       type: "uint256" },
                { name: "minAmountOut", type: "uint256" },
                { name: "deadline",     type: "uint256" },
                { name: "proofKind",    type: "uint8" },
            ],
        };
        const mintDeadline = await futureDeadline();
        const mintValue = {
            requestId:    mintRequestId,
            user:         alice.address,
            receiver:     alice.address,
            yAsset:       await yAsset1.getAddress(),
            amount:       mintUSDT,
            minAmountOut: minMintOut,
            deadline:     mintDeadline,
            proofKind:    0, // PROOF_OF_APPROVE
        };
        const mintProof = await deployer.signTypedData(mintDomain, mintTypes, mintValue);

        // -----------------------------------------------------------------
        // Step 3: alice finalizes the mint with the signed proof.
        // -----------------------------------------------------------------
        console.log("----- proUSD: finalizeMintRequest");
        await (await proTokenOperations.connect(alice).finalizeMintRequest(
            mintRequestId,
            0, // PROOF_OF_APPROVE
            mintDeadline,
            mintProof,
        )).wait();

        // alice now holds proUSD
        const aliceProUSD = await proToken.balanceOf(alice.address);
        console.log(`  alice proUSD balance: ${ethers.formatUnits(aliceProUSD, 18)}`);
        expect(aliceProUSD).to.be.gt(0);

        // USDT was forwarded through YAssetOperationsHandler into Aave (via AaveV3YieldHandler)
        const aTokenBalance = await aToken.balanceOf(await aaveV3YieldHandler.getAddress());
        console.log(`  AaveV3YieldHandler aToken balance: ${ethers.formatUnits(aTokenBalance, 6)} aUSDT`);
        expect(aTokenBalance).to.be.gte(mintUSDT);
    });

    it("deposits proUSD into ProTokenPlus (createDepositRequest -> sign -> finalize) and forwards to StrategyVault", async function () {
        const [, alice] = await ethers.getSigners();

        // alice should already hold proUSD from the previous test
        const aliceProUSD = await proToken.balanceOf(alice.address);
        expect(aliceProUSD).to.be.gt(0);

        // -----------------------------------------------------------------
        // Step 1: alice approves and creates a deposit request.
        //         Tier 2 (Annual) has minDeposit 100 proUSD; we deposit 500.
        // -----------------------------------------------------------------
        console.log("----- proUSD+: createDepositRequest");
        const tierID = 2;                                    // Annual
        const depositAmount = ethers.parseUnits("500", 18);  // 500 proUSD
        await (await proToken.connect(alice).approve(await proTokenPlus.getAddress(), depositAmount)).wait();

        let tx = await proTokenPlus.connect(alice).createDepositRequest(
            tierID,
            depositAmount,
        );
        let receipt = await tx.wait();

        const depositReqEvent = receipt.logs
            .map((log) => { try { return proTokenPlus.interface.parseLog(log); } catch { return null; } })
            .find((p) => p && p.name === "DepositRequestCreated");
        expect(depositReqEvent, "DepositRequestCreated not emitted").to.not.be.null;
        const depositRequestId = depositReqEvent.args.requestID ?? depositReqEvent.args[0];
        console.log(`  depositRequestId: ${depositRequestId}`);

        // proUSD is now escrowed in ProTokenPlus and totalPendingDeposits is updated.
        const escrowed = await proToken.balanceOf(await proTokenPlus.getAddress());
        const pending = await proTokenPlus.totalPendingDeposits();
        expect(escrowed).to.be.gte(depositAmount);
        expect(pending).to.equal(depositAmount);

        // -----------------------------------------------------------------
        // Step 2: authority signs PROOF_OF_APPROVE via EIP-712.
        //         Typehash must match ProTokenPlusOperations.DEPOSIT_PROOF_TYPEHASH:
        //         DepositProof(uint256 requestId,uint8 tierID,uint256 amount,
        //                      address user,uint256 deadline,uint8 proofKind)
        // -----------------------------------------------------------------
        console.log("----- proUSD+: sign PROOF_OF_APPROVE");
        const depositDomain = {
            name: "ProTokenPlus",
            version: "1",
            chainId: (await ethers.provider.getNetwork()).chainId,
            verifyingContract: await proTokenPlus.getAddress(),
        };
        const depositTypes = {
            DepositProof: [
                { name: "requestId",  type: "uint256" },
                { name: "tierID",     type: "uint8" },
                { name: "amount",     type: "uint256" },
                { name: "user",       type: "address" },
                { name: "deadline",   type: "uint256" },
                { name: "proofKind",  type: "uint8" },
            ],
        };
        const depositDeadline = await futureDeadline();
        const depositValue = {
            requestId:  depositRequestId,
            tierID:     tierID,
            amount:     depositAmount,
            user:       alice.address,
            deadline:   depositDeadline,
            proofKind:  0, // PROOF_OF_APPROVE
        };
        const depositProof = await deployer.signTypedData(depositDomain, depositTypes, depositValue);

        // -----------------------------------------------------------------
        // Step 3: alice finalizes the deposit with the signed proof.
        //         On finalize, ProTokenPlus forwards proUSD to StrategyVault
        //         and calls give(amount, worthBase).
        // -----------------------------------------------------------------
        console.log("----- proUSD+: finalizeDepositRequest");
        const vaultBefore = await proToken.balanceOf(await strategyVault.getAddress());
        await (await proTokenPlus.connect(alice).finalizeDepositRequest(
            depositRequestId,
            0, // PROOF_OF_APPROVE
            depositDeadline,
            depositProof,
        )).wait();

        // alice should have one active position now
        const [positionIds, totalCount] = await proTokenPlus.getUserPositionIds(alice.address, 0, 10, true);
        console.log(`  alice active positions: ${totalCount}`);
        expect(totalCount).to.equal(1n);
        const positionId = positionIds[0];
        const [posView] = await proTokenPlus.getUserPositions([positionId]);
        console.log(`  positionId: ${positionId}, lockedTierId: ${posView.lockedTierId}, lockExpiry: ${posView.lockExpiry}`);
        expect(posView.owner).to.equal(alice.address);
        expect(posView.lockedTierId).to.equal(tierID);
        expect(posView.amount).to.be.gt(0);

        // Pending deposits decremented after finalization
        const pendingAfter = await proTokenPlus.totalPendingDeposits();
        expect(pendingAfter).to.equal(0n);

        // -----------------------------------------------------------------
        // StrategyVault received the proUSD and booked the deposit.
        // worthBase = amount * price / 1e18; with price = 1e18 it equals amount.
        // -----------------------------------------------------------------
        const vaultAfter = await proToken.balanceOf(await strategyVault.getAddress());
        console.log(`  StrategyVault proUSD: ${ethers.formatUnits(vaultAfter, 18)}`);
        expect(vaultAfter - vaultBefore).to.equal(depositAmount);

        const depositProUSD = await strategyVault.depositProUSD();
        const depositBase = await strategyVault.depositBase();
        console.log(`  vault depositProUSD: ${ethers.formatUnits(depositProUSD, 18)}, depositBase: ${ethers.formatUnits(depositBase, 18)}`);
        expect(depositProUSD).to.be.gte(depositAmount);
        expect(depositBase).to.be.gt(0);
    });
});