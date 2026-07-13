import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
    ZERO_ADDRESS,
    ONE_USD,
    VERSION_1_0_0,
    ERRORS,
    EVENTS,
    DECIMALS_18,
    DECIMALS_8,
} from "../helpers/constants";
import {
    deployProTokenSettings,
    deployMintableERC20,
    getTestAccounts,
} from "../helpers/deploy";
import { deployMockRedStonePushOracle, getRandomAddress } from "../helpers/mocks";

const DEFAULT_STALENESS = 86400;

describe("OracleRedStonePushAdaptor", function () {
    // Fixture for OracleRedStonePushAdaptor
    async function oracleRedStonePushAdaptorFixture() {
        const accounts = await getTestAccounts();
        const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator);
        const proTokenSettingsAddress = await proTokenSettings.getAddress();

        // Deploy mock push oracle
        const mockPushOracle = await deployMockRedStonePushOracle(ONE_USD);
        const mockPushOracleAddress = await mockPushOracle.getAddress();

        // Deploy test token
        const testToken = await deployMintableERC20("Test Token", "TEST", DECIMALS_18);
        const testTokenAddress = await testToken.getAddress();

        // Deploy OracleRedStonePushAdaptor
        const OracleRedStonePushAdaptorFactory = await ethers.getContractFactory("OracleRedStonePushAdaptor");
        const oracleAdaptor = await upgrades.deployProxy(
            OracleRedStonePushAdaptorFactory,
            [proTokenSettingsAddress],
            { kind: "uups" }
        );
        await oracleAdaptor.waitForDeployment();
        const oracleAdaptorAddress = await oracleAdaptor.getAddress();

        return {
            oracleAdaptor,
            oracleAdaptorAddress,
            proTokenSettings,
            proTokenSettingsAddress,
            mockPushOracle,
            mockPushOracleAddress,
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
            const { oracleAdaptor, proTokenSettingsAddress } =
                await loadFixture(oracleRedStonePushAdaptorFixture);

            // Default staleness threshold is 300 seconds (5 minutes)
            expect(await oracleAdaptor.stalenessThreshold()).to.equal(DEFAULT_STALENESS);
        });

        it("should have correct VERSION constant", async function () {
            const { oracleAdaptor } = await loadFixture(oracleRedStonePushAdaptorFixture);
            expect(await oracleAdaptor.VERSION()).to.equal(VERSION_1_0_0);
        });

        it("should revert initialization with zero proTokenSettings", async function () {
            const OracleRedStonePushAdaptorFactory = await ethers.getContractFactory("OracleRedStonePushAdaptor");

            await expect(
                upgrades.deployProxy(
                    OracleRedStonePushAdaptorFactory,
                    [ZERO_ADDRESS],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(OracleRedStonePushAdaptorFactory, ERRORS.InvalidAddr);
        });

        it("should not allow re-initialization", async function () {
            const { oracleAdaptor, proTokenSettingsAddress } =
                await loadFixture(oracleRedStonePushAdaptorFixture);

            await expect(
                oracleAdaptor.initialize(proTokenSettingsAddress)
            ).to.be.revertedWithCustomError(oracleAdaptor, "InvalidInitialization");
        });
    });

    // ============================================
    // setAssetToPushOracleMappings Tests
    // ============================================
    describe("setAssetToPushOracleMappings()", function () {
        it("should set asset to push oracle mappings successfully", async function () {
            const {
                oracleAdaptor,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleRedStonePushAdaptorFixture);

            const dataFeedId = "TEST";
            const priceDecimals = 8;

            await expect(
                oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                    [testTokenAddress],
                    [mockPushOracleAddress],
                    [dataFeedId],
                    [priceDecimals]
                )
            ).to.emit(oracleAdaptor, EVENTS.AssetToPushOracleMappingUpdated);
        });

        it("should set multiple mappings at once", async function () {
            const {
                oracleAdaptor,
                mockPushOracleAddress,
                accounts,
            } = await loadFixture(oracleRedStonePushAdaptorFixture);

            const token1 = await deployMintableERC20("Token1", "TK1", DECIMALS_18);
            const token2 = await deployMintableERC20("Token2", "TK2", DECIMALS_18);

            await oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                [await token1.getAddress(), await token2.getAddress()],
                [mockPushOracleAddress, mockPushOracleAddress],
                ["TK1", "TK2"],
                [8, 8]
            );
        });

        it("should revert with mismatched array lengths", async function () {
            const {
                oracleAdaptor,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleRedStonePushAdaptorFixture);

            await expect(
                oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                    [testTokenAddress],
                    [mockPushOracleAddress, mockPushOracleAddress],
                    ["TEST"],
                    [8]
                )
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.InvalidInputs);
        });

        it("should revert with zero asset address", async function () {
            const {
                oracleAdaptor,
                mockPushOracleAddress,
                accounts,
            } = await loadFixture(oracleRedStonePushAdaptorFixture);

            await expect(
                oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                    [ZERO_ADDRESS],
                    [mockPushOracleAddress],
                    ["TEST"],
                    [8]
                )
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.InvalidAddr);
        });

        it("should revert with zero oracle address", async function () {
            const {
                oracleAdaptor,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleRedStonePushAdaptorFixture);

            await expect(
                oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                    [testTokenAddress],
                    [ZERO_ADDRESS],
                    ["TEST"],
                    [8]
                )
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.InvalidAddr);
        });

        it("should revert with empty data feed ID", async function () {
            const {
                oracleAdaptor,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleRedStonePushAdaptorFixture);

            await expect(
                oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                    [testTokenAddress],
                    [mockPushOracleAddress],
                    [""],
                    [8]
                )
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.DataFeedIdTooLong);
        });

        it("should revert with data feed ID too long", async function () {
            const {
                oracleAdaptor,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleRedStonePushAdaptorFixture);

            const longDataFeedId = "A".repeat(33); // 33 characters, exceeds 32 bytes

            await expect(
                oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                    [testTokenAddress],
                    [mockPushOracleAddress],
                    [longDataFeedId],
                    [8]
                )
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.DataFeedIdTooLong);
        });

        it("should revert with price decimals > 18", async function () {
            const {
                oracleAdaptor,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleRedStonePushAdaptorFixture);

            await expect(
                oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                    [testTokenAddress],
                    [mockPushOracleAddress],
                    ["TEST"],
                    [19] // Invalid: > 18
                )
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.InvalidInputs);
        });

        it("should revert when called by non-admin", async function () {
            const {
                oracleAdaptor,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleRedStonePushAdaptorFixture);

            await expect(
                oracleAdaptor.connect(accounts.operator).setAssetToPushOracleMappings(
                    [testTokenAddress],
                    [mockPushOracleAddress],
                    ["TEST"],
                    [8]
                )
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.Unauthorized);
        });
    });

    // ============================================
    // setStalenessThreshold Tests
    // ============================================
    describe("setStalenessThreshold()", function () {
        it("should set staleness threshold successfully", async function () {
            const { oracleAdaptor, accounts } = await loadFixture(oracleRedStonePushAdaptorFixture);

            const newThreshold = 7200; // 2 hours

            await expect(
                oracleAdaptor.connect(accounts.admin).setStalenessThreshold(newThreshold)
            ).to.emit(oracleAdaptor, EVENTS.StalenessThresholdUpdated);

            expect(await oracleAdaptor.stalenessThreshold()).to.equal(newThreshold);
        });

        it("should revert with zero threshold", async function () {
            const { oracleAdaptor, accounts } = await loadFixture(oracleRedStonePushAdaptorFixture);

            await expect(
                oracleAdaptor.connect(accounts.admin).setStalenessThreshold(0)
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.InvalidInputs);
        });

        it("should revert when called by non-admin", async function () {
            const { oracleAdaptor, accounts } = await loadFixture(oracleRedStonePushAdaptorFixture);

            await expect(
                oracleAdaptor.connect(accounts.operator).setStalenessThreshold(7200)
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.Unauthorized);
        });
    });

    // ============================================
    // getOraclePriceForAsset Tests
    // ============================================
    describe("getOraclePriceForAsset()", function () {
        it("should return correct price for configured asset", async function () {
            const {
                oracleAdaptor,
                mockPushOracle,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleRedStonePushAdaptorFixture);

            const dataFeedId = "TEST";
            const priceDecimals = 8;
            const rawPrice = ethers.parseUnits("2", priceDecimals); // $2.00 with 8 decimals
            const expectedPrice = ethers.parseUnits("2", 18); // Normalized to 18 decimals

            // Configure mapping
            await oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                [testTokenAddress],
                [mockPushOracleAddress],
                [dataFeedId],
                [priceDecimals]
            );

            // Set price in mock oracle (using bytes32 version)
            const currentTimestamp = await time.latest();
            const dataFeedIdBytes32 = ethers.encodeBytes32String(dataFeedId);
            await mockPushOracle.setPriceBytes32(
                dataFeedIdBytes32,
                rawPrice,
                BigInt(currentTimestamp) * 1000n // Convert to milliseconds
            );

            // Get price
            const price = await oracleAdaptor.getOraclePriceForAsset(testTokenAddress, "0x");
            expect(price).to.equal(expectedPrice);
        });

        it("should revert for unconfigured asset", async function () {
            const { oracleAdaptor } = await loadFixture(oracleRedStonePushAdaptorFixture);

            await expect(
                oracleAdaptor.getOraclePriceForAsset(getRandomAddress(), "0x")
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.AssetOracleMappingNotFound);
        });

        it("should revert when price is stale", async function () {
            const {
                oracleAdaptor,
                mockPushOracle,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleRedStonePushAdaptorFixture);

            const dataFeedId = "TEST";
            const priceDecimals = 8;
            const price = ethers.parseUnits("2", priceDecimals);

            // Configure mapping
            await oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                [testTokenAddress],
                [mockPushOracleAddress],
                [dataFeedId],
                [priceDecimals]
            );

            // Set stale price (old timestamp)
            const staleTimestamp = (await time.latest()) - DEFAULT_STALENESS - 100;
            const dataFeedIdBytes32 = ethers.encodeBytes32String(dataFeedId);
            await mockPushOracle.setPriceBytes32(
                dataFeedIdBytes32,
                price,
                BigInt(staleTimestamp) * 1000n
            );

            await expect(
                oracleAdaptor.getOraclePriceForAsset(testTokenAddress, "0x")
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.StaleOracleData);
        });

        it("should revert when price timestamp is in the future", async function () {
            const {
                oracleAdaptor,
                mockPushOracle,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleRedStonePushAdaptorFixture);

            const dataFeedId = "TEST";
            const priceDecimals = 8;
            const price = ethers.parseUnits("2", priceDecimals);

            // Configure mapping
            await oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                [testTokenAddress],
                [mockPushOracleAddress],
                [dataFeedId],
                [priceDecimals]
            );

            // Set future timestamp
            const futureTimestamp = (await time.latest()) + 3600; // 1 hour in future
            const dataFeedIdBytes32 = ethers.encodeBytes32String(dataFeedId);
            await mockPushOracle.setPriceBytes32(
                dataFeedIdBytes32,
                price,
                BigInt(futureTimestamp) * 1000n
            );

            await expect(
                oracleAdaptor.getOraclePriceForAsset(testTokenAddress, "0x")
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.FutureOracleTimestamp);
        });

        it("should revert when price is zero", async function () {
            const {
                oracleAdaptor,
                mockPushOracle,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleRedStonePushAdaptorFixture);

            const dataFeedId = "TEST";
            const priceDecimals = 8;

            // Configure mapping
            await oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                [testTokenAddress],
                [mockPushOracleAddress],
                [dataFeedId],
                [priceDecimals]
            );

            // Set zero price
            const currentTimestamp = await time.latest();
            const dataFeedIdBytes32 = ethers.encodeBytes32String(dataFeedId);
            await mockPushOracle.setPriceBytes32(
                dataFeedIdBytes32,
                0,
                BigInt(currentTimestamp) * 1000n
            );

            await expect(
                oracleAdaptor.getOraclePriceForAsset(testTokenAddress, "0x")
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.InvalidOraclePrice);
        });
    });

    // ============================================
    // getPushOracleForAsset Tests
    // ============================================
    describe("getPushOracleForAsset()", function () {
        it("should return correct push oracle for configured asset", async function () {
            const {
                oracleAdaptor,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleRedStonePushAdaptorFixture);

            const dataFeedId = "TEST";
            const priceDecimals = 8;

            await oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                [testTokenAddress],
                [mockPushOracleAddress],
                [dataFeedId],
                [priceDecimals]
            );

            const [oracle, feedId] = await oracleAdaptor.getPushOracleForAsset(testTokenAddress);
            expect(oracle).to.equal(mockPushOracleAddress);
            expect(feedId).to.equal(dataFeedId);
        });

        it("should return zero address for unconfigured asset", async function () {
            const { oracleAdaptor } = await loadFixture(oracleRedStonePushAdaptorFixture);

            const [oracle, feedId] = await oracleAdaptor.getPushOracleForAsset(getRandomAddress());
            expect(oracle).to.equal(ZERO_ADDRESS);
            expect(feedId).to.equal("");
        });
    });

    // ============================================
    // View Functions Tests
    // ============================================
    describe("View Functions", function () {
        it("stalenessThreshold should return correct threshold", async function () {
            const { oracleAdaptor } = await loadFixture(oracleRedStonePushAdaptorFixture);
            expect(await oracleAdaptor.stalenessThreshold()).to.equal(DEFAULT_STALENESS);
        });
    });

    // ============================================
    // Upgrade Authorization Tests
    // ============================================
    describe("Upgrade Authorization", function () {
        it("should only allow admin to upgrade", async function () {
            const { oracleAdaptor, accounts } = await loadFixture(oracleRedStonePushAdaptorFixture);

            const OracleRedStonePushAdaptorV2Factory = await ethers.getContractFactory("OracleRedStonePushAdaptor");

            await expect(
                upgrades.upgradeProxy(
                    await oracleAdaptor.getAddress(),
                    OracleRedStonePushAdaptorV2Factory.connect(accounts.user1)
                )
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.Unauthorized);

            await expect(
                upgrades.upgradeProxy(
                    await oracleAdaptor.getAddress(),
                    OracleRedStonePushAdaptorV2Factory.connect(accounts.operator)
                )
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.Unauthorized);
        });
    });
});
