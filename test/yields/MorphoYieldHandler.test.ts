import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
    ZERO_ADDRESS,
    VERSION_1_0_0,
    ERRORS,
    EVENTS,
    DECIMALS_18,
    HUNDRED_TOKENS,
    THOUSAND_TOKENS,
} from "../helpers/constants";
import {
    deployProTokenSettings,
    deployMintableERC20,
    getTestAccounts,
} from "../helpers/deploy";
import { deployMockMorpho, getRandomAddress } from "../helpers/mocks";

describe("MorphoYieldHandler", function () {
    // Helper to create default market params
    function createDefaultMarketParams(loanToken: string) {
        return {
            loanToken: loanToken,
            collateralToken: ZERO_ADDRESS,
            oracle: ZERO_ADDRESS,
            irm: ZERO_ADDRESS,
            lltv: 0n,
        };
    }

    // Helper to deploy MorphoYieldHandler
    async function deployMorphoYieldHandler(
        proTokenSettingsAddress: string,
        operationsContract: string,
        morphoCoreContract: string,
        marketParams: any
    ) {
        const MorphoYieldHandlerFactory = await ethers.getContractFactory("MorphoYieldHandler");
        const morphoYieldHandler = await upgrades.deployProxy(
            MorphoYieldHandlerFactory,
            [proTokenSettingsAddress, operationsContract, morphoCoreContract, marketParams],
            { kind: "uups" }
        );
        await morphoYieldHandler.waitForDeployment();
        return morphoYieldHandler;
    }

    // Fixture for MorphoYieldHandler tests
    async function morphoYieldHandlerFixture() {
        const accounts = await getTestAccounts();
        const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator);
        const proTokenSettingsAddress = await proTokenSettings.getAddress();

        // Deploy mock Morpho
        const mockMorpho = await deployMockMorpho();
        const mockMorphoAddress = await mockMorpho.getAddress();

        // Deploy yield asset
        const yieldAsset = await deployMintableERC20("Yield Asset", "YLD", DECIMALS_18);
        const yieldAssetAddress = await yieldAsset.getAddress();

        // Create market params
        const marketParams = createDefaultMarketParams(yieldAssetAddress);

        // Deploy handler with operator as operations contract for testing
        const morphoYieldHandler = await deployMorphoYieldHandler(
            proTokenSettingsAddress,
            accounts.operator.address, // Using operator as operations contract for testing
            mockMorphoAddress,
            marketParams
        );
        const morphoYieldHandlerAddress = await morphoYieldHandler.getAddress();

        return {
            morphoYieldHandler,
            morphoYieldHandlerAddress,
            proTokenSettings,
            proTokenSettingsAddress,
            mockMorpho,
            mockMorphoAddress,
            yieldAsset,
            yieldAssetAddress,
            marketParams,
            accounts,
        };
    }

    // ============================================
    // Deployment & Initialization Tests
    // ============================================
    describe("Deployment & Initialization", function () {
        it("should deploy with correct initial state", async function () {
            const {
                morphoYieldHandler,
                yieldAssetAddress,
            } = await loadFixture(morphoYieldHandlerFixture);

            expect(await morphoYieldHandler.VERSION()).to.equal(VERSION_1_0_0);
            expect(await morphoYieldHandler.getYieldAsset()).to.equal(yieldAssetAddress);
            // Note: proTokenSettings, operationsContract, morphoCoreContract are internal
            // They are verified through behavior tests
        });

        it("should have correct VERSION constant", async function () {
            const { morphoYieldHandler } = await loadFixture(morphoYieldHandlerFixture);
            expect(await morphoYieldHandler.VERSION()).to.equal(VERSION_1_0_0);
        });

        it("should revert initialization with zero proTokenSettings", async function () {
            const accounts = await getTestAccounts();
            const mockMorpho = await deployMockMorpho();
            const yieldAsset = await deployMintableERC20("YLD", "YLD", DECIMALS_18);
            const marketParams = createDefaultMarketParams(await yieldAsset.getAddress());

            const MorphoYieldHandlerFactory = await ethers.getContractFactory("MorphoYieldHandler");

            await expect(
                upgrades.deployProxy(
                    MorphoYieldHandlerFactory,
                    [ZERO_ADDRESS, accounts.operator.address, await mockMorpho.getAddress(), marketParams],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(MorphoYieldHandlerFactory, ERRORS.InvalidAddr);
        });

        it("should revert initialization with zero operationsContract", async function () {
            const accounts = await getTestAccounts();
            const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator);
            const mockMorpho = await deployMockMorpho();
            const yieldAsset = await deployMintableERC20("YLD", "YLD", DECIMALS_18);
            const marketParams = createDefaultMarketParams(await yieldAsset.getAddress());

            const MorphoYieldHandlerFactory = await ethers.getContractFactory("MorphoYieldHandler");

            await expect(
                upgrades.deployProxy(
                    MorphoYieldHandlerFactory,
                    [await proTokenSettings.getAddress(), ZERO_ADDRESS, await mockMorpho.getAddress(), marketParams],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(MorphoYieldHandlerFactory, ERRORS.InvalidAddr);
        });

        it("should revert initialization with zero morphoCoreContract", async function () {
            const accounts = await getTestAccounts();
            const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator);
            const yieldAsset = await deployMintableERC20("YLD", "YLD", DECIMALS_18);
            const marketParams = createDefaultMarketParams(await yieldAsset.getAddress());

            const MorphoYieldHandlerFactory = await ethers.getContractFactory("MorphoYieldHandler");

            await expect(
                upgrades.deployProxy(
                    MorphoYieldHandlerFactory,
                    [await proTokenSettings.getAddress(), accounts.operator.address, ZERO_ADDRESS, marketParams],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(MorphoYieldHandlerFactory, ERRORS.InvalidAddr);
        });

        it("should not allow re-initialization", async function () {
            const {
                morphoYieldHandler,
                proTokenSettingsAddress,
                mockMorphoAddress,
                marketParams,
                accounts,
            } = await loadFixture(morphoYieldHandlerFixture);

            await expect(
                morphoYieldHandler.initialize(
                    proTokenSettingsAddress,
                    accounts.operator.address,
                    mockMorphoAddress,
                    marketParams
                )
            ).to.be.revertedWithCustomError(morphoYieldHandler, "InvalidInitialization");
        });
    });

    // ============================================
    // depositYieldAsset Tests
    // ============================================
    describe("depositYieldAsset()", function () {
        it("should revert with zero amount", async function () {
            const { morphoYieldHandler, accounts } = await loadFixture(morphoYieldHandlerFixture);

            await expect(
                morphoYieldHandler.connect(accounts.operator).depositYieldAsset(0)
            ).to.be.revertedWithCustomError(morphoYieldHandler, ERRORS.InvalidAmount);
        });

        it("should revert when called by non-operations contract", async function () {
            const { morphoYieldHandler, accounts } = await loadFixture(morphoYieldHandlerFixture);

            await expect(
                morphoYieldHandler.connect(accounts.user1).depositYieldAsset(HUNDRED_TOKENS)
            ).to.be.revertedWithCustomError(morphoYieldHandler, ERRORS.Unauthorized);
        });

        it("should revert when called by admin (not operations)", async function () {
            const { morphoYieldHandler, accounts } = await loadFixture(morphoYieldHandlerFixture);

            await expect(
                morphoYieldHandler.connect(accounts.admin).depositYieldAsset(HUNDRED_TOKENS)
            ).to.be.revertedWithCustomError(morphoYieldHandler, ERRORS.Unauthorized);
        });
    });

    // ============================================
    // withdrawYieldAsset Tests
    // ============================================
    describe("withdrawYieldAsset()", function () {
        it("should revert when called by non-operations contract", async function () {
            const { morphoYieldHandler, accounts } = await loadFixture(morphoYieldHandlerFixture);

            await expect(
                morphoYieldHandler.connect(accounts.user1).withdrawYieldAsset(HUNDRED_TOKENS)
            ).to.be.revertedWithCustomError(morphoYieldHandler, ERRORS.Unauthorized);
        });

        it("should revert when called by admin (not operations)", async function () {
            const { morphoYieldHandler, accounts } = await loadFixture(morphoYieldHandlerFixture);

            await expect(
                morphoYieldHandler.connect(accounts.admin).withdrawYieldAsset(HUNDRED_TOKENS)
            ).to.be.revertedWithCustomError(morphoYieldHandler, ERRORS.Unauthorized);
        });
    });

    // ============================================
    // setMorphoMarketParams Tests
    // ============================================
    describe("setMorphoMarketParams()", function () {
        it("should set market params when balance is zero", async function () {
            const { morphoYieldHandler, yieldAssetAddress, accounts } =
                await loadFixture(morphoYieldHandlerFixture);

            const newMarketParams = {
                loanToken: yieldAssetAddress,
                collateralToken: getRandomAddress(),
                oracle: getRandomAddress(),
                irm: getRandomAddress(),
                lltv: 800000000000000000n, // 80%
            };

            await expect(
                morphoYieldHandler.connect(accounts.admin).setMorphoMarketParams(newMarketParams)
            ).to.emit(morphoYieldHandler, EVENTS.MorphoMarketParamsUpdated);

            const updatedParams = await morphoYieldHandler.getMorphoMarketParams();
            expect(updatedParams.collateralToken).to.equal(newMarketParams.collateralToken);
        });

        it("should revert when called by non-admin", async function () {
            const { morphoYieldHandler, yieldAssetAddress, accounts } =
                await loadFixture(morphoYieldHandlerFixture);

            const newMarketParams = createDefaultMarketParams(yieldAssetAddress);

            await expect(
                morphoYieldHandler.connect(accounts.user1).setMorphoMarketParams(newMarketParams)
            ).to.be.revertedWithCustomError(morphoYieldHandler, ERRORS.Unauthorized);
        });

        it("should revert when called by operator", async function () {
            const { morphoYieldHandler, yieldAssetAddress, accounts } =
                await loadFixture(morphoYieldHandlerFixture);

            const newMarketParams = createDefaultMarketParams(yieldAssetAddress);

            await expect(
                morphoYieldHandler.connect(accounts.operator).setMorphoMarketParams(newMarketParams)
            ).to.be.revertedWithCustomError(morphoYieldHandler, ERRORS.Unauthorized);
        });
    });

    // ============================================
    // setOperationsContract Tests
    // ============================================
    describe("setOperationsContract()", function () {
        it("should set operations contract successfully", async function () {
            const { morphoYieldHandler, accounts } = await loadFixture(morphoYieldHandlerFixture);

            const newOperationsContract = getRandomAddress();

            await expect(
                morphoYieldHandler.connect(accounts.admin).setOperationsContract(newOperationsContract)
            ).to.emit(morphoYieldHandler, EVENTS.OperationsContractUpdated);

            // Note: operationsContract is internal, verified via event emission
        });

        it("should revert with zero address", async function () {
            const { morphoYieldHandler, accounts } = await loadFixture(morphoYieldHandlerFixture);

            await expect(
                morphoYieldHandler.connect(accounts.admin).setOperationsContract(ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(morphoYieldHandler, ERRORS.InvalidAddr);
        });

        it("should revert when called by non-admin", async function () {
            const { morphoYieldHandler, accounts } = await loadFixture(morphoYieldHandlerFixture);

            await expect(
                morphoYieldHandler.connect(accounts.user1).setOperationsContract(getRandomAddress())
            ).to.be.revertedWithCustomError(morphoYieldHandler, ERRORS.Unauthorized);
        });
    });

    // ============================================
    // setMorphoCoreContract Tests
    // ============================================
    describe("setMorphoCoreContract()", function () {
        it("should set morpho core contract when balance is zero", async function () {
            const { morphoYieldHandler, accounts } = await loadFixture(morphoYieldHandlerFixture);

            const newMorphoCore = getRandomAddress();

            await expect(
                morphoYieldHandler.connect(accounts.admin).setMorphoCoreContract(newMorphoCore)
            ).to.emit(morphoYieldHandler, EVENTS.SetMorphoCoreContract);

            // Note: morphoCoreContract is internal, verified via event emission
        });

        it("should revert with zero address", async function () {
            const { morphoYieldHandler, accounts } = await loadFixture(morphoYieldHandlerFixture);

            await expect(
                morphoYieldHandler.connect(accounts.admin).setMorphoCoreContract(ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(morphoYieldHandler, ERRORS.InvalidAddr);
        });

        it("should revert when called by non-admin", async function () {
            const { morphoYieldHandler, accounts } = await loadFixture(morphoYieldHandlerFixture);

            await expect(
                morphoYieldHandler.connect(accounts.user1).setMorphoCoreContract(getRandomAddress())
            ).to.be.revertedWithCustomError(morphoYieldHandler, ERRORS.Unauthorized);
        });
    });

    // ============================================
    // Emergency Withdraw Tests
    // ============================================
    describe("emergencyWithdraw()", function () {
        it("should withdraw ERC20 tokens in emergency", async function () {
            const { morphoYieldHandler, morphoYieldHandlerAddress, accounts } =
                await loadFixture(morphoYieldHandlerFixture);

            // Deploy a random token and send to handler
            const randomToken = await deployMintableERC20("Random", "RND", DECIMALS_18);
            const randomTokenAddress = await randomToken.getAddress();
            await randomToken.mint(morphoYieldHandlerAddress, HUNDRED_TOKENS);

            // Emergency withdraw
            const adminBalanceBefore = await randomToken.balanceOf(accounts.admin.address);
            await morphoYieldHandler.connect(accounts.admin).emergencyWithdraw(
                randomTokenAddress,
                accounts.admin.address,
                HUNDRED_TOKENS
            );
            const adminBalanceAfter = await randomToken.balanceOf(accounts.admin.address);

            expect(adminBalanceAfter - adminBalanceBefore).to.equal(HUNDRED_TOKENS);
        });

        it("should emit EmergencyWithdraw event", async function () {
            const { morphoYieldHandler, morphoYieldHandlerAddress, accounts } =
                await loadFixture(morphoYieldHandlerFixture);

            const randomToken = await deployMintableERC20("Random", "RND", DECIMALS_18);
            const randomTokenAddress = await randomToken.getAddress();
            await randomToken.mint(morphoYieldHandlerAddress, HUNDRED_TOKENS);

            await expect(
                morphoYieldHandler.connect(accounts.admin).emergencyWithdraw(
                    randomTokenAddress,
                    accounts.admin.address,
                    HUNDRED_TOKENS
                )
            ).to.emit(morphoYieldHandler, EVENTS.EmergencyWithdraw);
        });

        it("should revert when called by non-admin", async function () {
            const { morphoYieldHandler, yieldAssetAddress, accounts } =
                await loadFixture(morphoYieldHandlerFixture);

            await expect(
                morphoYieldHandler.connect(accounts.user1).emergencyWithdraw(
                    yieldAssetAddress,
                    accounts.user1.address,
                    HUNDRED_TOKENS
                )
            ).to.be.revertedWithCustomError(morphoYieldHandler, ERRORS.Unauthorized);
        });

        it("should revert when recipient is zero address", async function () {
            const { morphoYieldHandler, yieldAssetAddress, accounts } =
                await loadFixture(morphoYieldHandlerFixture);

            await expect(
                morphoYieldHandler.connect(accounts.admin).emergencyWithdraw(
                    yieldAssetAddress,
                    ZERO_ADDRESS,
                    HUNDRED_TOKENS
                )
            ).to.be.revertedWithCustomError(morphoYieldHandler, ERRORS.InvalidAddr);
        });

        it("should revert with zero amount", async function () {
            const { morphoYieldHandler, yieldAssetAddress, accounts } =
                await loadFixture(morphoYieldHandlerFixture);

            await expect(
                morphoYieldHandler.connect(accounts.admin).emergencyWithdraw(
                    yieldAssetAddress,
                    accounts.admin.address,
                    0
                )
            ).to.be.revertedWithCustomError(morphoYieldHandler, ERRORS.InvalidAmount);
        });
    });

    // ============================================
    // View Functions Tests
    // ============================================
    describe("View Functions", function () {
        it("getYieldAsset() should return correct asset", async function () {
            const { morphoYieldHandler, yieldAssetAddress } = await loadFixture(morphoYieldHandlerFixture);
            expect(await morphoYieldHandler.getYieldAsset()).to.equal(yieldAssetAddress);
        });

        it("getMorphoMarketParams() should return correct params", async function () {
            const { morphoYieldHandler, yieldAssetAddress } = await loadFixture(morphoYieldHandlerFixture);

            const params = await morphoYieldHandler.getMorphoMarketParams();
            expect(params.loanToken).to.equal(yieldAssetAddress);
        });

        // Note: proTokenSettings, operationsContract, morphoCoreContract are internal
        // Their correctness is verified through behavior tests (access control, etc.)
    });

    // ============================================
    // Upgrade Authorization Tests
    // ============================================
    describe("Upgrade Authorization", function () {
        it("should only allow admin to upgrade", async function () {
            const { morphoYieldHandler, accounts } = await loadFixture(morphoYieldHandlerFixture);

            const MorphoYieldHandlerV2Factory = await ethers.getContractFactory("MorphoYieldHandler");

            await expect(
                upgrades.upgradeProxy(
                    await morphoYieldHandler.getAddress(),
                    MorphoYieldHandlerV2Factory.connect(accounts.user1)
                )
            ).to.be.revertedWithCustomError(morphoYieldHandler, ERRORS.Unauthorized);

            await expect(
                upgrades.upgradeProxy(
                    await morphoYieldHandler.getAddress(),
                    MorphoYieldHandlerV2Factory.connect(accounts.operator)
                )
            ).to.be.revertedWithCustomError(morphoYieldHandler, ERRORS.Unauthorized);
        });
    });
});
