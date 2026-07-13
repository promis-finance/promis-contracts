import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
    ZERO_ADDRESS,
    VERSION_1_0_0,
    ERRORS,
    EVENTS,
    DECIMALS_18,
    DECIMALS_6,
    ONE_USD,
} from "../helpers/constants";
import {
    deployProTokenSettings,
    deployMintableERC20,
    getTestAccounts,
} from "../helpers/deploy";
import { deployMockAlgebraPool, getRandomAddress } from "../helpers/mocks";

describe("OracleAlgebraAdaptor", function () {
    // Helper to deploy OracleAlgebraAdaptor
    async function deployOracleAlgebraAdaptor(proTokenSettingsAddress: string) {
        const OracleAlgebraAdaptorFactory = await ethers.getContractFactory("OracleAlgebraAdaptor");
        const oracleAlgebraAdaptor = await upgrades.deployProxy(
            OracleAlgebraAdaptorFactory,
            [proTokenSettingsAddress],
            { kind: "uups" }
        );
        await oracleAlgebraAdaptor.waitForDeployment();
        return oracleAlgebraAdaptor;
    }

    // Fixture for OracleAlgebraAdaptor tests
    async function oracleAlgebraAdaptorFixture() {
        const accounts = await getTestAccounts();
        const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator);
        const proTokenSettingsAddress = await proTokenSettings.getAddress();

        const oracleAlgebraAdaptor = await deployOracleAlgebraAdaptor(proTokenSettingsAddress);
        const oracleAlgebraAdaptorAddress = await oracleAlgebraAdaptor.getAddress();

        // Deploy mock tokens
        const token0 = await deployMintableERC20("Token0", "TK0", DECIMALS_18);
        const token1 = await deployMintableERC20("Token1", "TK1", DECIMALS_18);
        const token0Address = await token0.getAddress();
        const token1Address = await token1.getAddress();

        // Deploy mock Algebra pool and configure tokens
        const mockPool = await deployMockAlgebraPool();
        await mockPool.setTokens(token0Address, token1Address);
        const mockPoolAddress = await mockPool.getAddress();

        return {
            oracleAlgebraAdaptor,
            oracleAlgebraAdaptorAddress,
            proTokenSettings,
            proTokenSettingsAddress,
            token0,
            token0Address,
            token1,
            token1Address,
            mockPool,
            mockPoolAddress,
            accounts,
        };
    }

    // ============================================
    // Deployment & Initialization Tests
    // ============================================
    describe("Deployment & Initialization", function () {
        it("should deploy with correct initial state", async function () {
            const { oracleAlgebraAdaptor } = await loadFixture(oracleAlgebraAdaptorFixture);

            expect(await oracleAlgebraAdaptor.VERSION()).to.equal(VERSION_1_0_0);
            // Default TWAP periods
            expect(await oracleAlgebraAdaptor.twapPeriod()).to.equal(900); // 15 minutes
            expect(await oracleAlgebraAdaptor.twapPeriodMiddle()).to.equal(7200); // 2 hours
            expect(await oracleAlgebraAdaptor.twapPeriodLongest()).to.equal(86400); // 24 hours
        });

        it("should have correct VERSION constant", async function () {
            const { oracleAlgebraAdaptor } = await loadFixture(oracleAlgebraAdaptorFixture);
            expect(await oracleAlgebraAdaptor.VERSION()).to.equal(VERSION_1_0_0);
        });

        it("should revert initialization with zero proTokenSettings", async function () {
            const OracleAlgebraAdaptorFactory = await ethers.getContractFactory("OracleAlgebraAdaptor");

            await expect(
                upgrades.deployProxy(
                    OracleAlgebraAdaptorFactory,
                    [ZERO_ADDRESS],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(OracleAlgebraAdaptorFactory, ERRORS.InvalidAddr);
        });

        it("should not allow re-initialization", async function () {
            const { oracleAlgebraAdaptor, proTokenSettingsAddress } =
                await loadFixture(oracleAlgebraAdaptorFixture);

            await expect(
                oracleAlgebraAdaptor.initialize(proTokenSettingsAddress)
            ).to.be.revertedWithCustomError(oracleAlgebraAdaptor, "InvalidInitialization");
        });
    });

    // ============================================
    // configureRoute Tests
    // ============================================
    describe("configureRoute()", function () {
        it("should configure single-hop route successfully", async function () {
            const {
                oracleAlgebraAdaptor,
                token0Address,
                token1Address,
                mockPoolAddress,
                accounts,
            } = await loadFixture(oracleAlgebraAdaptorFixture);

            const routeParams = {
                pools: [mockPoolAddress],
                plugins: [mockPoolAddress], // Using pool as plugin for mock
                tokens0: [token0Address],
                tokens1: [token1Address],
                decimals0: [18],
                decimals1: [18],
                directions: [true], // zeroToOne
            };

            await expect(
                oracleAlgebraAdaptor.connect(accounts.admin).configureRoute(token0Address, routeParams)
            ).to.emit(oracleAlgebraAdaptor, EVENTS.RouteConfigured);

            const route = await oracleAlgebraAdaptor.getRouteForAsset(token0Address);
            expect(route.length).to.equal(1);
            expect(route[0].pool).to.equal(mockPoolAddress);
        });

        it("should configure multi-hop route successfully", async function () {
            const {
                oracleAlgebraAdaptor,
                token0Address,
                token1Address,
                mockPoolAddress,
                accounts,
            } = await loadFixture(oracleAlgebraAdaptorFixture);

            // Deploy another token for multi-hop
            const token2 = await deployMintableERC20("Token2", "TK2", DECIMALS_18);
            const token2Address = await token2.getAddress();

            const mockPool2 = await deployMockAlgebraPool();
            await mockPool2.setTokens(token1Address, token2Address);
            const mockPool2Address = await mockPool2.getAddress();

            const routeParams = {
                pools: [mockPoolAddress, mockPool2Address],
                plugins: [mockPoolAddress, mockPool2Address],
                tokens0: [token0Address, token1Address],
                tokens1: [token1Address, token2Address],
                decimals0: [18, 18],
                decimals1: [18, 18],
                directions: [true, true],
            };

            await oracleAlgebraAdaptor.connect(accounts.admin).configureRoute(token0Address, routeParams);

            const route = await oracleAlgebraAdaptor.getRouteForAsset(token0Address);
            expect(route.length).to.equal(2);
        });

        it("should revert with empty pools array", async function () {
            const { oracleAlgebraAdaptor, token0Address, accounts } =
                await loadFixture(oracleAlgebraAdaptorFixture);

            const routeParams = {
                pools: [],
                plugins: [],
                tokens0: [],
                tokens1: [],
                decimals0: [],
                decimals1: [],
                directions: [],
            };

            await expect(
                oracleAlgebraAdaptor.connect(accounts.admin).configureRoute(token0Address, routeParams)
            ).to.be.revertedWithCustomError(oracleAlgebraAdaptor, ERRORS.InvalidInputs);
        });

        it("should revert with mismatched array lengths", async function () {
            const {
                oracleAlgebraAdaptor,
                token0Address,
                token1Address,
                mockPoolAddress,
                accounts,
            } = await loadFixture(oracleAlgebraAdaptorFixture);

            const routeParams = {
                pools: [mockPoolAddress],
                plugins: [mockPoolAddress, mockPoolAddress], // Mismatched
                tokens0: [token0Address],
                tokens1: [token1Address],
                decimals0: [18],
                decimals1: [18],
                directions: [true],
            };

            await expect(
                oracleAlgebraAdaptor.connect(accounts.admin).configureRoute(token0Address, routeParams)
            ).to.be.revertedWithCustomError(oracleAlgebraAdaptor, ERRORS.InvalidInputs);
        });

        it("should revert with decimals > 18", async function () {
            const {
                oracleAlgebraAdaptor,
                token0Address,
                token1Address,
                mockPoolAddress,
                accounts,
            } = await loadFixture(oracleAlgebraAdaptorFixture);

            const routeParams = {
                pools: [mockPoolAddress],
                plugins: [mockPoolAddress],
                tokens0: [token0Address],
                tokens1: [token1Address],
                decimals0: [19], // Invalid
                decimals1: [18],
                directions: [true],
            };

            await expect(
                oracleAlgebraAdaptor.connect(accounts.admin).configureRoute(token0Address, routeParams)
            ).to.be.revertedWithCustomError(oracleAlgebraAdaptor, ERRORS.InvalidInputs);
        });

        it("should revert when called by non-admin", async function () {
            const {
                oracleAlgebraAdaptor,
                token0Address,
                token1Address,
                mockPoolAddress,
                accounts,
            } = await loadFixture(oracleAlgebraAdaptorFixture);

            const routeParams = {
                pools: [mockPoolAddress],
                plugins: [mockPoolAddress],
                tokens0: [token0Address],
                tokens1: [token1Address],
                decimals0: [18],
                decimals1: [18],
                directions: [true],
            };

            await expect(
                oracleAlgebraAdaptor.connect(accounts.user1).configureRoute(token0Address, routeParams)
            ).to.be.revertedWithCustomError(oracleAlgebraAdaptor, ERRORS.Unauthorized);
        });

        it("should overwrite existing route", async function () {
            const {
                oracleAlgebraAdaptor,
                token0Address,
                token1Address,
                mockPoolAddress,
                accounts,
            } = await loadFixture(oracleAlgebraAdaptorFixture);

            // Configure first route
            const routeParams1 = {
                pools: [mockPoolAddress],
                plugins: [mockPoolAddress],
                tokens0: [token0Address],
                tokens1: [token1Address],
                decimals0: [18],
                decimals1: [18],
                directions: [true],
            };

            await oracleAlgebraAdaptor.connect(accounts.admin).configureRoute(token0Address, routeParams1);

            // Deploy new pool
            const newPool = await deployMockAlgebraPool();
            await newPool.setTokens(token0Address, token1Address);
            const newPoolAddress = await newPool.getAddress();

            // Configure new route (should overwrite)
            const routeParams2 = {
                pools: [newPoolAddress],
                plugins: [newPoolAddress],
                tokens0: [token0Address],
                tokens1: [token1Address],
                decimals0: [18],
                decimals1: [18],
                directions: [false],
            };

            await oracleAlgebraAdaptor.connect(accounts.admin).configureRoute(token0Address, routeParams2);

            const route = await oracleAlgebraAdaptor.getRouteForAsset(token0Address);
            expect(route.length).to.equal(1);
            expect(route[0].pool).to.equal(newPoolAddress);
            expect(route[0].zeroToOne).to.be.false;
        });
    });

    // ============================================
    // setTwapPeriods Tests
    // ============================================
    describe("setTwapPeriods()", function () {
        it("should set TWAP periods successfully", async function () {
            const { oracleAlgebraAdaptor, accounts } = await loadFixture(oracleAlgebraAdaptorFixture);

            const newPeriod = 600; // 10 minutes
            const newMiddle = 3600; // 1 hour
            const newLongest = 43200; // 12 hours

            await expect(
                oracleAlgebraAdaptor.connect(accounts.admin).setTwapPeriods(newPeriod, newMiddle, newLongest)
            ).to.emit(oracleAlgebraAdaptor, EVENTS.TwapPeriodsUpdated);

            expect(await oracleAlgebraAdaptor.twapPeriod()).to.equal(newPeriod);
            expect(await oracleAlgebraAdaptor.twapPeriodMiddle()).to.equal(newMiddle);
            expect(await oracleAlgebraAdaptor.twapPeriodLongest()).to.equal(newLongest);
        });

        it("should revert with zero period", async function () {
            const { oracleAlgebraAdaptor, accounts } = await loadFixture(oracleAlgebraAdaptorFixture);

            await expect(
                oracleAlgebraAdaptor.connect(accounts.admin).setTwapPeriods(0, 3600, 43200)
            ).to.be.revertedWithCustomError(oracleAlgebraAdaptor, ERRORS.InvalidInputs);
        });

        it("should revert with zero middle period", async function () {
            const { oracleAlgebraAdaptor, accounts } = await loadFixture(oracleAlgebraAdaptorFixture);

            await expect(
                oracleAlgebraAdaptor.connect(accounts.admin).setTwapPeriods(600, 0, 43200)
            ).to.be.revertedWithCustomError(oracleAlgebraAdaptor, ERRORS.InvalidInputs);
        });

        it("should revert with zero longest period", async function () {
            const { oracleAlgebraAdaptor, accounts } = await loadFixture(oracleAlgebraAdaptorFixture);

            await expect(
                oracleAlgebraAdaptor.connect(accounts.admin).setTwapPeriods(600, 3600, 0)
            ).to.be.revertedWithCustomError(oracleAlgebraAdaptor, ERRORS.InvalidInputs);
        });

        it("should revert when period >= middle", async function () {
            const { oracleAlgebraAdaptor, accounts } = await loadFixture(oracleAlgebraAdaptorFixture);

            await expect(
                oracleAlgebraAdaptor.connect(accounts.admin).setTwapPeriods(3600, 3600, 43200)
            ).to.be.revertedWithCustomError(oracleAlgebraAdaptor, ERRORS.InvalidInputs);
        });

        it("should revert when middle >= longest", async function () {
            const { oracleAlgebraAdaptor, accounts } = await loadFixture(oracleAlgebraAdaptorFixture);

            await expect(
                oracleAlgebraAdaptor.connect(accounts.admin).setTwapPeriods(600, 43200, 43200)
            ).to.be.revertedWithCustomError(oracleAlgebraAdaptor, ERRORS.InvalidInputs);
        });

        it("should revert when called by non-admin", async function () {
            const { oracleAlgebraAdaptor, accounts } = await loadFixture(oracleAlgebraAdaptorFixture);

            await expect(
                oracleAlgebraAdaptor.connect(accounts.user1).setTwapPeriods(600, 3600, 43200)
            ).to.be.revertedWithCustomError(oracleAlgebraAdaptor, ERRORS.Unauthorized);
        });
    });

    // ============================================
    // getOraclePriceForAsset Tests
    // ============================================
    describe("getOraclePriceForAsset()", function () {
        it("should revert with zero asset address", async function () {
            const { oracleAlgebraAdaptor } = await loadFixture(oracleAlgebraAdaptorFixture);

            await expect(
                oracleAlgebraAdaptor.getOraclePriceForAsset(ZERO_ADDRESS, "0x")
            ).to.be.revertedWithCustomError(oracleAlgebraAdaptor, ERRORS.InvalidAddr);
        });

        it("should revert when route not configured", async function () {
            const { oracleAlgebraAdaptor, token0Address } = await loadFixture(oracleAlgebraAdaptorFixture);

            await expect(
                oracleAlgebraAdaptor.getOraclePriceForAsset(token0Address, "0x")
            ).to.be.revertedWithCustomError(oracleAlgebraAdaptor, ERRORS.RouteNotConfigured);
        });

        it("should revert with stale oracle data when TWAP fails", async function () {
            const {
                oracleAlgebraAdaptor,
                token0Address,
                token1Address,
                mockPoolAddress,
                accounts,
            } = await loadFixture(oracleAlgebraAdaptorFixture);

            // Configure route
            const routeParams = {
                pools: [mockPoolAddress],
                plugins: [mockPoolAddress],
                tokens0: [token0Address],
                tokens1: [token1Address],
                decimals0: [18],
                decimals1: [18],
                directions: [true],
            };

            await oracleAlgebraAdaptor.connect(accounts.admin).configureRoute(token0Address, routeParams);

            // Mock pool returns stale data (same tick cumulatives)
            // This should cause StaleOracleData error
            await expect(
                oracleAlgebraAdaptor.getOraclePriceForAsset(token0Address, "0x")
            ).to.be.revertedWithCustomError(oracleAlgebraAdaptor, ERRORS.StaleOracleData);
        });
    });

    // ============================================
    // View Functions Tests
    // ============================================
    describe("View Functions", function () {
        it("getRouteForAsset() should return empty array for unconfigured asset", async function () {
            const { oracleAlgebraAdaptor, token0Address } = await loadFixture(oracleAlgebraAdaptorFixture);

            const route = await oracleAlgebraAdaptor.getRouteForAsset(token0Address);
            expect(route.length).to.equal(0);
        });

        it("getRouteForAsset() should return configured route", async function () {
            const {
                oracleAlgebraAdaptor,
                token0Address,
                token1Address,
                mockPoolAddress,
                accounts,
            } = await loadFixture(oracleAlgebraAdaptorFixture);

            const routeParams = {
                pools: [mockPoolAddress],
                plugins: [mockPoolAddress],
                tokens0: [token0Address],
                tokens1: [token1Address],
                decimals0: [18],
                decimals1: [18],
                directions: [true],
            };

            await oracleAlgebraAdaptor.connect(accounts.admin).configureRoute(token0Address, routeParams);

            const route = await oracleAlgebraAdaptor.getRouteForAsset(token0Address);
            expect(route.length).to.equal(1);
            expect(route[0].pool).to.equal(mockPoolAddress);
            expect(route[0].token0).to.equal(token0Address);
            expect(route[0].token1).to.equal(token1Address);
            expect(route[0].zeroToOne).to.be.true;
        });

        it("twapPeriod should return default value", async function () {
            const { oracleAlgebraAdaptor } = await loadFixture(oracleAlgebraAdaptorFixture);
            expect(await oracleAlgebraAdaptor.twapPeriod()).to.equal(900);
        });

        it("twapPeriodMiddle should return default value", async function () {
            const { oracleAlgebraAdaptor } = await loadFixture(oracleAlgebraAdaptorFixture);
            expect(await oracleAlgebraAdaptor.twapPeriodMiddle()).to.equal(7200);
        });

        it("twapPeriodLongest should return default value", async function () {
            const { oracleAlgebraAdaptor } = await loadFixture(oracleAlgebraAdaptorFixture);
            expect(await oracleAlgebraAdaptor.twapPeriodLongest()).to.equal(86400);
        });
    });

    // ============================================
    // Upgrade Authorization Tests
    // ============================================
    describe("Upgrade Authorization", function () {
        it("should only allow admin to upgrade", async function () {
            const { oracleAlgebraAdaptor, accounts } = await loadFixture(oracleAlgebraAdaptorFixture);

            const OracleAlgebraAdaptorV2Factory = await ethers.getContractFactory("OracleAlgebraAdaptor");

            await expect(
                upgrades.upgradeProxy(
                    await oracleAlgebraAdaptor.getAddress(),
                    OracleAlgebraAdaptorV2Factory.connect(accounts.user1)
                )
            ).to.be.revertedWithCustomError(oracleAlgebraAdaptor, ERRORS.Unauthorized);

            await expect(
                upgrades.upgradeProxy(
                    await oracleAlgebraAdaptor.getAddress(),
                    OracleAlgebraAdaptorV2Factory.connect(accounts.operator)
                )
            ).to.be.revertedWithCustomError(oracleAlgebraAdaptor, ERRORS.Unauthorized);
        });
    });
});
