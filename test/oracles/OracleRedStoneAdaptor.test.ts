import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
    ZERO_ADDRESS,
    VERSION_1_0_0,
    ERRORS,
    EVENTS,
    DECIMALS_18,
    DECIMALS_8,
    ONE_USD,
    DEFAULT_STALENESS_THRESHOLD,
} from "../helpers/constants";
import {
    deployProTokenSettings,
    deployMintableERC20,
    getTestAccounts,
} from "../helpers/deploy";
import { getRandomAddress, stringToBytes32 } from "../helpers/mocks";

describe("OracleRedStoneAdaptor", function () {
    // Helper to deploy OracleRedStoneAdaptor
    async function deployOracleRedStoneAdaptor(proTokenSettingsAddress: string) {
        const OracleRedStoneAdaptorFactory = await ethers.getContractFactory("OracleRedStoneAdaptor");
        const oracleRedStoneAdaptor = await upgrades.deployProxy(
            OracleRedStoneAdaptorFactory,
            [proTokenSettingsAddress],
            { kind: "uups" }
        );
        await oracleRedStoneAdaptor.waitForDeployment();
        return oracleRedStoneAdaptor;
    }

    // Fixture for OracleRedStoneAdaptor tests
    async function oracleRedStoneAdaptorFixture() {
        const accounts = await getTestAccounts();
        const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator);
        const proTokenSettingsAddress = await proTokenSettings.getAddress();

        const oracleRedStoneAdaptor = await deployOracleRedStoneAdaptor(proTokenSettingsAddress);
        const oracleRedStoneAdaptorAddress = await oracleRedStoneAdaptor.getAddress();

        // Deploy mock token
        const testToken = await deployMintableERC20("Test Token", "TEST", DECIMALS_18);
        const testTokenAddress = await testToken.getAddress();

        return {
            oracleRedStoneAdaptor,
            oracleRedStoneAdaptorAddress,
            proTokenSettings,
            proTokenSettingsAddress,
            testToken,
            testTokenAddress,
            accounts,
        };
    }

    // ============================================
    // Deployment & Initialization Tests
    // ============================================
    describe("Deployment & Initialization", function () {
        it("should deploy with correct initial state", async function () {
            const { oracleRedStoneAdaptor } = await loadFixture(oracleRedStoneAdaptorFixture);

            expect(await oracleRedStoneAdaptor.VERSION()).to.equal(VERSION_1_0_0);
            // Note: stalenessThreshold is internal, no getter available
        });

        it("should have correct VERSION constant", async function () {
            const { oracleRedStoneAdaptor } = await loadFixture(oracleRedStoneAdaptorFixture);
            expect(await oracleRedStoneAdaptor.VERSION()).to.equal(VERSION_1_0_0);
        });

        it("should revert initialization with zero proTokenSettings", async function () {
            const OracleRedStoneAdaptorFactory = await ethers.getContractFactory("OracleRedStoneAdaptor");

            await expect(
                upgrades.deployProxy(
                    OracleRedStoneAdaptorFactory,
                    [ZERO_ADDRESS],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(OracleRedStoneAdaptorFactory, ERRORS.InvalidAddr);
        });

        it("should not allow re-initialization", async function () {
            const { oracleRedStoneAdaptor, proTokenSettingsAddress } =
                await loadFixture(oracleRedStoneAdaptorFixture);

            await expect(
                oracleRedStoneAdaptor.initialize(proTokenSettingsAddress)
            ).to.be.revertedWithCustomError(oracleRedStoneAdaptor, "InvalidInitialization");
        });
    });

    // ============================================
    // setAssetToOracleIdMappings Tests
    // ============================================
    describe("setAssetToOracleIdMappings()", function () {
        it("should set single asset mapping successfully", async function () {
            const { oracleRedStoneAdaptor, testTokenAddress, accounts } =
                await loadFixture(oracleRedStoneAdaptorFixture);

            await expect(
                oracleRedStoneAdaptor.connect(accounts.admin).setAssetToOracleIdMappings(
                    [testTokenAddress],
                    ["TEST"],
                    [8]
                )
            ).to.emit(oracleRedStoneAdaptor, EVENTS.AssetToOracleIdMappingUpdated);

            const oracleId = await oracleRedStoneAdaptor.getOracleIdForAsset(testTokenAddress);
            expect(oracleId).to.equal("TEST");
        });

        it("should set multiple asset mappings successfully", async function () {
            const { oracleRedStoneAdaptor, testTokenAddress, accounts } =
                await loadFixture(oracleRedStoneAdaptorFixture);

            const token2 = await deployMintableERC20("Token2", "TK2", DECIMALS_18);
            const token2Address = await token2.getAddress();

            await oracleRedStoneAdaptor.connect(accounts.admin).setAssetToOracleIdMappings(
                [testTokenAddress, token2Address],
                ["TEST", "TK2"],
                [8, 8]
            );

            expect(await oracleRedStoneAdaptor.getOracleIdForAsset(testTokenAddress)).to.equal("TEST");
            expect(await oracleRedStoneAdaptor.getOracleIdForAsset(token2Address)).to.equal("TK2");
        });

        it("should revert with empty arrays", async function () {
            const { oracleRedStoneAdaptor, accounts } = await loadFixture(oracleRedStoneAdaptorFixture);

            await expect(
                oracleRedStoneAdaptor.connect(accounts.admin).setAssetToOracleIdMappings(
                    [],
                    [],
                    []
                )
            ).to.be.revertedWithCustomError(oracleRedStoneAdaptor, ERRORS.InvalidInputs);
        });

        it("should revert with mismatched array lengths", async function () {
            const { oracleRedStoneAdaptor, testTokenAddress, accounts } =
                await loadFixture(oracleRedStoneAdaptorFixture);

            await expect(
                oracleRedStoneAdaptor.connect(accounts.admin).setAssetToOracleIdMappings(
                    [testTokenAddress],
                    ["TEST", "EXTRA"], // Mismatched
                    [8]
                )
            ).to.be.revertedWithCustomError(oracleRedStoneAdaptor, ERRORS.InvalidInputs);
        });

        it("should revert with empty oracle ID", async function () {
            const { oracleRedStoneAdaptor, testTokenAddress, accounts } =
                await loadFixture(oracleRedStoneAdaptorFixture);

            await expect(
                oracleRedStoneAdaptor.connect(accounts.admin).setAssetToOracleIdMappings(
                    [testTokenAddress],
                    [""], // Empty
                    [8]
                )
            ).to.be.revertedWithCustomError(oracleRedStoneAdaptor, ERRORS.OracleIdTooLong);
        });

        it("should revert with oracle ID > 32 bytes", async function () {
            const { oracleRedStoneAdaptor, testTokenAddress, accounts } =
                await loadFixture(oracleRedStoneAdaptorFixture);

            const longOracleId = "A".repeat(33); // 33 characters

            await expect(
                oracleRedStoneAdaptor.connect(accounts.admin).setAssetToOracleIdMappings(
                    [testTokenAddress],
                    [longOracleId],
                    [8]
                )
            ).to.be.revertedWithCustomError(oracleRedStoneAdaptor, ERRORS.OracleIdTooLong);
        });

        it("should revert with decimals > 18", async function () {
            const { oracleRedStoneAdaptor, testTokenAddress, accounts } =
                await loadFixture(oracleRedStoneAdaptorFixture);

            await expect(
                oracleRedStoneAdaptor.connect(accounts.admin).setAssetToOracleIdMappings(
                    [testTokenAddress],
                    ["TEST"],
                    [19] // Invalid
                )
            ).to.be.revertedWithCustomError(oracleRedStoneAdaptor, ERRORS.InvalidInputs);
        });

        it("should revert when called by non-admin", async function () {
            const { oracleRedStoneAdaptor, testTokenAddress, accounts } =
                await loadFixture(oracleRedStoneAdaptorFixture);

            await expect(
                oracleRedStoneAdaptor.connect(accounts.user1).setAssetToOracleIdMappings(
                    [testTokenAddress],
                    ["TEST"],
                    [8]
                )
            ).to.be.revertedWithCustomError(oracleRedStoneAdaptor, ERRORS.Unauthorized);
        });

        it("should overwrite existing mapping", async function () {
            const { oracleRedStoneAdaptor, testTokenAddress, accounts } =
                await loadFixture(oracleRedStoneAdaptorFixture);

            // Set initial mapping
            await oracleRedStoneAdaptor.connect(accounts.admin).setAssetToOracleIdMappings(
                [testTokenAddress],
                ["TEST"],
                [8]
            );

            // Overwrite
            await oracleRedStoneAdaptor.connect(accounts.admin).setAssetToOracleIdMappings(
                [testTokenAddress],
                ["NEWTEST"],
                [18]
            );

            expect(await oracleRedStoneAdaptor.getOracleIdForAsset(testTokenAddress)).to.equal("NEWTEST");
        });
    });

    // ============================================
    // setStalenessThreshold Tests
    // ============================================
    describe("setStalenessThreshold()", function () {
        it("should set staleness threshold successfully", async function () {
            const { oracleRedStoneAdaptor, accounts } = await loadFixture(oracleRedStoneAdaptorFixture);

            const newThreshold = 300; // 5 minutes

            await expect(
                oracleRedStoneAdaptor.connect(accounts.admin).setStalenessThreshold(newThreshold)
            ).to.emit(oracleRedStoneAdaptor, EVENTS.StalenessThresholdUpdated);

            // Note: stalenessThreshold is internal, verified via event emission
        });

        it("should allow setting threshold to zero", async function () {
            const { oracleRedStoneAdaptor, accounts } = await loadFixture(oracleRedStoneAdaptorFixture);

            await expect(
                oracleRedStoneAdaptor.connect(accounts.admin).setStalenessThreshold(0)
            ).to.emit(oracleRedStoneAdaptor, EVENTS.StalenessThresholdUpdated);
        });

        it("should revert when called by non-admin", async function () {
            const { oracleRedStoneAdaptor, accounts } = await loadFixture(oracleRedStoneAdaptorFixture);

            await expect(
                oracleRedStoneAdaptor.connect(accounts.user1).setStalenessThreshold(300)
            ).to.be.revertedWithCustomError(oracleRedStoneAdaptor, ERRORS.Unauthorized);
        });
    });

    // ============================================
    // getOraclePriceForAsset Tests
    // ============================================
    describe("getOraclePriceForAsset()", function () {
        it("should revert with zero asset address", async function () {
            const { oracleRedStoneAdaptor } = await loadFixture(oracleRedStoneAdaptorFixture);

            await expect(
                oracleRedStoneAdaptor.getOraclePriceForAsset(ZERO_ADDRESS, "0x")
            ).to.be.revertedWithCustomError(oracleRedStoneAdaptor, ERRORS.InvalidAddr);
        });

        it("should revert when asset mapping not found", async function () {
            const { oracleRedStoneAdaptor, testTokenAddress } =
                await loadFixture(oracleRedStoneAdaptorFixture);

            await expect(
                oracleRedStoneAdaptor.getOraclePriceForAsset(testTokenAddress, "0x")
            ).to.be.revertedWithCustomError(oracleRedStoneAdaptor, ERRORS.AssetOracleMappingNotFound);
        });

        // Note: Testing actual price retrieval requires RedStone calldata which is complex to mock
        // The contract uses PrimaryProdDataServiceConsumerBase which expects specific calldata format
    });

    // ============================================
    // getOracleIdForAsset Tests
    // ============================================
    describe("getOracleIdForAsset()", function () {
        it("should return correct oracle ID for configured asset", async function () {
            const { oracleRedStoneAdaptor, testTokenAddress, accounts } =
                await loadFixture(oracleRedStoneAdaptorFixture);

            await oracleRedStoneAdaptor.connect(accounts.admin).setAssetToOracleIdMappings(
                [testTokenAddress],
                ["ETH"],
                [8]
            );

            expect(await oracleRedStoneAdaptor.getOracleIdForAsset(testTokenAddress)).to.equal("ETH");
        });

        it("should revert with zero address", async function () {
            const { oracleRedStoneAdaptor } = await loadFixture(oracleRedStoneAdaptorFixture);

            await expect(
                oracleRedStoneAdaptor.getOracleIdForAsset(ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(oracleRedStoneAdaptor, ERRORS.InvalidAddr);
        });

        it("should revert for unconfigured asset", async function () {
            const { oracleRedStoneAdaptor, testTokenAddress } =
                await loadFixture(oracleRedStoneAdaptorFixture);

            await expect(
                oracleRedStoneAdaptor.getOracleIdForAsset(testTokenAddress)
            ).to.be.revertedWithCustomError(oracleRedStoneAdaptor, ERRORS.AssetOracleMappingNotFound);
        });
    });

    // ============================================
    // View Functions Tests
    // ============================================
    describe("View Functions", function () {
        // Note: stalenessThreshold is internal, no public getter available
        // The value is verified through event emission in setStalenessThreshold tests
        it("proTokenSettings should return correct address", async function () {
            const { oracleRedStoneAdaptor, proTokenSettingsAddress } = await loadFixture(oracleRedStoneAdaptorFixture);
            expect(await oracleRedStoneAdaptor.proTokenSettings()).to.equal(proTokenSettingsAddress);
        });
    });

    // ============================================
    // Upgrade Authorization Tests
    // ============================================
    describe("Upgrade Authorization", function () {
        it("should only allow admin to upgrade", async function () {
            const { oracleRedStoneAdaptor, accounts } = await loadFixture(oracleRedStoneAdaptorFixture);

            const OracleRedStoneAdaptorV2Factory = await ethers.getContractFactory("OracleRedStoneAdaptor");

            await expect(
                upgrades.upgradeProxy(
                    await oracleRedStoneAdaptor.getAddress(),
                    OracleRedStoneAdaptorV2Factory.connect(accounts.user1)
                )
            ).to.be.revertedWithCustomError(oracleRedStoneAdaptor, ERRORS.Unauthorized);

            await expect(
                upgrades.upgradeProxy(
                    await oracleRedStoneAdaptor.getAddress(),
                    OracleRedStoneAdaptorV2Factory.connect(accounts.operator)
                )
            ).to.be.revertedWithCustomError(oracleRedStoneAdaptor, ERRORS.Unauthorized);
        });
    });
});
