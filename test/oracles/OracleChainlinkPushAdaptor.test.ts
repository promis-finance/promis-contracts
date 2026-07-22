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
import { deployMockChainlinkPushOracle, getRandomAddress } from "../helpers/mocks";

// Default staleness threshold (24 hours = 86400 seconds)
const DEFAULT_STALENESS = 86400;

describe("OracleChainlinkPushAdaptor", function () {
    // Fixture for OracleChainlinkPushAdaptor
    async function oracleChainlinkPushAdaptorFixture() {
        const accounts = await getTestAccounts();
        const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator);
        const proTokenSettingsAddress = await proTokenSettings.getAddress();

        // Deploy mock push oracle
        const mockPushOracle = await deployMockChainlinkPushOracle(ONE_USD);
        const mockPushOracleAddress = await mockPushOracle.getAddress();

        // Deploy test token
        const testToken = await deployMintableERC20("Test Token", "TEST", DECIMALS_18);
        const testTokenAddress = await testToken.getAddress();

        // Deploy OracleChainlinkPushAdaptor
        const OracleChainlinkPushAdaptorFactory = await ethers.getContractFactory("OracleChainlinkPushAdaptor");
        const oracleAdaptor = await upgrades.deployProxy(
            OracleChainlinkPushAdaptorFactory,
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
            const { oracleAdaptor, proTokenSettings} =
                await loadFixture(oracleChainlinkPushAdaptorFixture);

            // Default staleness threshold is 86400 seconds (24 hours)
            expect(await oracleAdaptor.proTokenSettings()).to.equal(await proTokenSettings.getAddress());
        });

        it("should have correct VERSION constant", async function () {
            const { oracleAdaptor } = await loadFixture(oracleChainlinkPushAdaptorFixture);
            expect(await oracleAdaptor.VERSION()).to.equal(VERSION_1_0_0);
        });

        it("should revert initialization with zero proTokenSettings", async function () {
            const OracleChainlinkPushAdaptorFactory = await ethers.getContractFactory("OracleChainlinkPushAdaptor");

            await expect(
                upgrades.deployProxy(
                    OracleChainlinkPushAdaptorFactory,
                    [ZERO_ADDRESS],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(OracleChainlinkPushAdaptorFactory, ERRORS.InvalidAddr);
        });

        it("should not allow re-initialization", async function () {
            const { oracleAdaptor, proTokenSettingsAddress } =
                await loadFixture(oracleChainlinkPushAdaptorFixture);

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
            } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            const priceDecimals = 8;

            await expect(
                oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                    [testTokenAddress],
                    [mockPushOracleAddress],
                    [priceDecimals]
                )
            ).to.emit(oracleAdaptor, EVENTS.AssetToPushOracleMappingUpdated);
        });

        it("should set multiple mappings at once", async function () {
            const {
                oracleAdaptor,
                mockPushOracleAddress,
                accounts,
            } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            const token1 = await deployMintableERC20("Token1", "TK1", DECIMALS_18);
            const token2 = await deployMintableERC20("Token2", "TK2", DECIMALS_18);

            // Deploy second mock oracle
            const mockPushOracle2 = await deployMockChainlinkPushOracle(ONE_USD);
            const mockPushOracle2Address = await mockPushOracle2.getAddress();

            await oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                [await token1.getAddress(), await token2.getAddress()],
                [mockPushOracleAddress, mockPushOracle2Address],
                [8, 8]
            );

            // Verify mappings
            expect(await oracleAdaptor.getPushOracleForAsset(await token1.getAddress())).to.equal(mockPushOracleAddress);
            expect(await oracleAdaptor.getPushOracleForAsset(await token2.getAddress())).to.equal(mockPushOracle2Address);
        });

        it("should revert with mismatched array lengths (assets vs oracles)", async function () {
            const {
                oracleAdaptor,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            await expect(
                oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                    [testTokenAddress],
                    [mockPushOracleAddress, mockPushOracleAddress],
                    [8]
                )
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.InvalidInputs);
        });

        it("should revert with mismatched array lengths (assets vs decimals)", async function () {
            const {
                oracleAdaptor,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            await expect(
                oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                    [testTokenAddress],
                    [mockPushOracleAddress],
                    [8, 8]
                )
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.InvalidInputs);
        });

        it("should revert with zero asset address", async function () {
            const {
                oracleAdaptor,
                mockPushOracleAddress,
                accounts,
            } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            await expect(
                oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                    [ZERO_ADDRESS],
                    [mockPushOracleAddress],
                    [8]
                )
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.InvalidAddr);
        });

        it("should revert with zero oracle address", async function () {
            const {
                oracleAdaptor,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            await expect(
                oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                    [testTokenAddress],
                    [ZERO_ADDRESS],
                    [8]
                )
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.InvalidAddr);
        });

        it("should revert with price decimals > 18", async function () {
            const {
                oracleAdaptor,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            await expect(
                oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                    [testTokenAddress],
                    [mockPushOracleAddress],
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
            } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            await expect(
                oracleAdaptor.connect(accounts.operator).setAssetToPushOracleMappings(
                    [testTokenAddress],
                    [mockPushOracleAddress],
                    [8]
                )
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.Unauthorized);
        });

        it("should allow updating existing mapping", async function () {
            const {
                oracleAdaptor,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            // Set initial mapping
            await oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                [testTokenAddress],
                [mockPushOracleAddress],
                [8]
            );

            // Deploy new oracle
            const newMockOracle = await deployMockChainlinkPushOracle(ONE_USD);
            const newMockOracleAddress = await newMockOracle.getAddress();

            // Update mapping
            await oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                [testTokenAddress],
                [newMockOracleAddress],
                [6]
            );

            expect(await oracleAdaptor.getPushOracleForAsset(testTokenAddress)).to.equal(newMockOracleAddress);
        });
    });

    // ============================================
    // setStalenessThreshold Tests
    // ============================================
    describe("setStalenessThreshold()", function () {
        it("should set staleness threshold successfully", async function () {
            const { oracleAdaptor, accounts } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            const newThreshold = 7200; // 2 hours

            await expect(
                oracleAdaptor.connect(accounts.admin).setStalenessThreshold(accounts.admin.address, newThreshold)
            ).to.emit(oracleAdaptor, EVENTS.StalenessThresholdUpdated);

            expect(await oracleAdaptor.stalenessThreshold(accounts.admin.address)).to.equal(newThreshold);
        });

        it("should revert with zero threshold", async function () {
            const { oracleAdaptor, accounts } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            await expect(
                oracleAdaptor.connect(accounts.admin).setStalenessThreshold(accounts.admin.address, 0)
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.InvalidInputs);
        });

        it("should revert when called by non-admin", async function () {
            const { oracleAdaptor, accounts } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            await expect(
                oracleAdaptor.connect(accounts.operator).setStalenessThreshold(accounts.admin.address, 7200)
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
            } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            const priceDecimals = 8;
            const rawPrice = ethers.parseUnits("2", priceDecimals); // $2.00 with 8 decimals
            const expectedPrice = ethers.parseUnits("2", 18); // Normalized to 18 decimals

            // Configure mapping
            await oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                [testTokenAddress],
                [mockPushOracleAddress],
                [priceDecimals]
            );

            // Set price in mock oracle (timestamp in seconds)
            const currentTimestamp = await time.latest();
            await mockPushOracle.setPrice(rawPrice, currentTimestamp);

            // Get price
            const price = await oracleAdaptor.getOraclePriceForAsset(testTokenAddress);
            expect(price).to.equal(expectedPrice);
        });

        it("should normalize price with different decimals", async function () {
            const {
                oracleAdaptor,
                mockPushOracle,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            const priceDecimals = 6; // 6 decimals
            const rawPrice = ethers.parseUnits("1.5", priceDecimals); // $1.50 with 6 decimals
            const expectedPrice = ethers.parseUnits("1.5", 18); // Normalized to 18 decimals

            // Configure mapping
            await oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                [testTokenAddress],
                [mockPushOracleAddress],
                [priceDecimals]
            );

            // Set price in mock oracle
            const currentTimestamp = await time.latest();
            await mockPushOracle.setPrice(rawPrice, currentTimestamp);

            // Get price
            const price = await oracleAdaptor.getOraclePriceForAsset(testTokenAddress);
            expect(price).to.equal(expectedPrice);
        });

        it("should revert for unconfigured asset", async function () {
            const { oracleAdaptor } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            await expect(
                oracleAdaptor.getOraclePriceForAsset(getRandomAddress())
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.AssetOracleMappingNotFound);
        });

        it("should revert when price is stale", async function () {
            const {
                oracleAdaptor,
                mockPushOracle,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            const priceDecimals = 8;
            const price = ethers.parseUnits("2", priceDecimals);

            // Configure mapping
            await oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                [testTokenAddress],
                [mockPushOracleAddress],
                [priceDecimals]
            );

            // Set stale price (old timestamp - more than 24 hours ago)
            const staleTimestamp = (await time.latest()) - DEFAULT_STALENESS - 100;
            await mockPushOracle.setPrice(price, staleTimestamp);

            await expect(
                oracleAdaptor.getOraclePriceForAsset(testTokenAddress)
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.StaleOracleData);
        });

        it("should revert when price timestamp is in the future", async function () {
            const {
                oracleAdaptor,
                mockPushOracle,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            const priceDecimals = 8;
            const price = ethers.parseUnits("2", priceDecimals);

            // Configure mapping
            await oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                [testTokenAddress],
                [mockPushOracleAddress],
                [priceDecimals]
            );

            // Set future timestamp
            const futureTimestamp = (await time.latest()) + 3600; // 1 hour in future
            await mockPushOracle.setPrice(price, futureTimestamp);

            await expect(
                oracleAdaptor.getOraclePriceForAsset(testTokenAddress)
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.FutureOracleTimestamp);
        });

        it("should revert when price is zero", async function () {
            const {
                oracleAdaptor,
                mockPushOracle,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            const priceDecimals = 8;

            // Configure mapping
            await oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                [testTokenAddress],
                [mockPushOracleAddress],
                [priceDecimals]
            );

            // Set zero price
            const currentTimestamp = await time.latest();
            await mockPushOracle.setPrice(0, currentTimestamp);

            await expect(
                oracleAdaptor.getOraclePriceForAsset(testTokenAddress)
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.InvalidOraclePrice);
        });

        it("should work with custom staleness threshold", async function () {
            const {
                oracleAdaptor,
                mockPushOracle,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            const priceDecimals = 8;
            const price = ethers.parseUnits("2", priceDecimals);
            const customThreshold = 300; // 5 minutes

            // Configure mapping
            await oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                [testTokenAddress],
                [mockPushOracleAddress],
                [priceDecimals]
            );

            // Set custom staleness threshold
            await oracleAdaptor.connect(accounts.admin).setStalenessThreshold(testTokenAddress, customThreshold);

            // Set price that would be valid with default threshold but stale with custom
            const staleTimestamp = (await time.latest()) - customThreshold - 100;
            await mockPushOracle.setPrice(price, staleTimestamp);

            await expect(
                oracleAdaptor.getOraclePriceForAsset(testTokenAddress)
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.StaleOracleData);
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
            } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            const priceDecimals = 8;

            await oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                [testTokenAddress],
                [mockPushOracleAddress],
                [priceDecimals]
            );

            const oracle = await oracleAdaptor.getPushOracleForAsset(testTokenAddress);
            expect(oracle).to.equal(mockPushOracleAddress);
        });

        it("should return zero address for unconfigured asset", async function () {
            const { oracleAdaptor } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            const oracle = await oracleAdaptor.getPushOracleForAsset(getRandomAddress());
            expect(oracle).to.equal(ZERO_ADDRESS);
        });
    });

    // ============================================
    // View Functions Tests
    // ============================================
    describe("View Functions", function () {
        it("stalenessThreshold should return correct threshold", async function () {
            const { 
                oracleAdaptor, 
                accounts, 
                mockPushOracleAddress,
                testTokenAddress
            } = await loadFixture(oracleChainlinkPushAdaptorFixture);
            
            const priceDecimals = 8;

            await oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                [testTokenAddress],
                [mockPushOracleAddress],
                [priceDecimals]
            );
            expect(await oracleAdaptor.stalenessThreshold(testTokenAddress)).to.equal(DEFAULT_STALENESS);
        });

        it("assetToPushOracleContract should return correct mapping", async function () {
            const {
                oracleAdaptor,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            await oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                [testTokenAddress],
                [mockPushOracleAddress],
                [8]
            );

            expect(await oracleAdaptor.assetToPushOracleContract(testTokenAddress)).to.equal(mockPushOracleAddress);
        });

        it("assetToPriceDecimals should return correct decimals", async function () {
            const {
                oracleAdaptor,
                mockPushOracleAddress,
                testTokenAddress,
                accounts,
            } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            const priceDecimals = 8;

            await oracleAdaptor.connect(accounts.admin).setAssetToPushOracleMappings(
                [testTokenAddress],
                [mockPushOracleAddress],
                [priceDecimals]
            );

            expect(await oracleAdaptor.assetToPriceDecimals(testTokenAddress)).to.equal(priceDecimals);
        });
    });

    // ============================================
    // Upgrade Authorization Tests
    // ============================================
    describe("Upgrade Authorization", function () {
        it("should only allow admin to upgrade", async function () {
            const { oracleAdaptor, accounts } = await loadFixture(oracleChainlinkPushAdaptorFixture);

            const OracleChainlinkPushAdaptorV2Factory = await ethers.getContractFactory("OracleChainlinkPushAdaptor");

            await expect(
                upgrades.upgradeProxy(
                    await oracleAdaptor.getAddress(),
                    OracleChainlinkPushAdaptorV2Factory.connect(accounts.user1)
                )
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.Unauthorized);

            await expect(
                upgrades.upgradeProxy(
                    await oracleAdaptor.getAddress(),
                    OracleChainlinkPushAdaptorV2Factory.connect(accounts.operator)
                )
            ).to.be.revertedWithCustomError(oracleAdaptor, ERRORS.Unauthorized);
        });
    });
});
