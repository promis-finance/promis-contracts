import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
    ZERO_ADDRESS,
    ONE_TOKEN,
    TEN_TOKENS,
    HUNDRED_TOKENS,
    THOUSAND_TOKENS,
    VERSION_1_0_0,
    ERRORS,
    EVENTS,
    DECIMALS_18,
} from "../helpers/constants";
import { aaveV3YieldHandlerFixture } from "../helpers/fixtures";
import {
    deployProTokenSettings,
    deployMintableERC20,
    deployMockAaveV3,
    deployMockAToken,
    deployYAssetOperationsHandler,
    deployAaveV3YieldHandler,
    getTestAccounts,
} from "../helpers/deploy";
import { mintAndApprove, getRandomAddress } from "../helpers/mocks";

describe("AaveV3YieldHandler", function () {
    // ============================================
    // Deployment & Initialization Tests
    // ============================================
    describe("Deployment & Initialization", function () {
        it("should deploy with correct initial state", async function () {
            const {
                aaveV3YieldHandler,
                yAssetAddress,
                mockAavePoolAddress,
                mockATokenAddress,
                yAssetOperationsHandlerAddress,
            } = await loadFixture(aaveV3YieldHandlerFixture);

            expect(await aaveV3YieldHandler.getYieldAsset()).to.equal(yAssetAddress);
            expect(await aaveV3YieldHandler.getBalance()).to.equal(0);
        });

        it("should have correct VERSION constant", async function () {
            const { aaveV3YieldHandler } = await loadFixture(aaveV3YieldHandlerFixture);
            expect(await aaveV3YieldHandler.VERSION()).to.equal(VERSION_1_0_0);
        });

        it("should revert initialization with zero proTokenSettings", async function () {
            const accounts = await getTestAccounts();
            const yAsset = await deployMintableERC20("Test", "TEST", DECIMALS_18);
            const mockAavePool = await deployMockAaveV3();
            const mockAToken = await deployMockAToken("aTest", "aTEST", DECIMALS_18);

            const AaveV3YieldHandlerFactory = await ethers.getContractFactory("AaveV3YieldHandler");

            await expect(
                upgrades.deployProxy(
                    AaveV3YieldHandlerFactory,
                    [
                        ZERO_ADDRESS,
                        accounts.operator.address,
                        await mockAavePool.getAddress(),
                        await yAsset.getAddress(),
                        await mockAToken.getAddress(),
                    ],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(AaveV3YieldHandlerFactory, ERRORS.InvalidAddr);
        });

        it("should revert initialization with zero operations contract", async function () {
            const accounts = await getTestAccounts();
            const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator);
            const yAsset = await deployMintableERC20("Test", "TEST", DECIMALS_18);
            const mockAavePool = await deployMockAaveV3();
            const mockAToken = await deployMockAToken("aTest", "aTEST", DECIMALS_18);

            const AaveV3YieldHandlerFactory = await ethers.getContractFactory("AaveV3YieldHandler");

            await expect(
                upgrades.deployProxy(
                    AaveV3YieldHandlerFactory,
                    [
                        await proTokenSettings.getAddress(),
                        ZERO_ADDRESS,
                        await mockAavePool.getAddress(),
                        await yAsset.getAddress(),
                        await mockAToken.getAddress(),
                    ],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(AaveV3YieldHandlerFactory, ERRORS.InvalidAddr);
        });

        it("should not allow re-initialization", async function () {
            const {
                aaveV3YieldHandler,
                proTokenSettingsAddress,
                yAssetOperationsHandlerAddress,
                mockAavePoolAddress,
                yAssetAddress,
                mockATokenAddress,
            } = await loadFixture(aaveV3YieldHandlerFixture);

            await expect(
                aaveV3YieldHandler.initialize(
                    proTokenSettingsAddress,
                    yAssetOperationsHandlerAddress,
                    mockAavePoolAddress,
                    yAssetAddress,
                    mockATokenAddress
                )
            ).to.be.revertedWithCustomError(aaveV3YieldHandler, "InvalidInitialization");
        });
    });

    // ============================================
    // depositYieldAsset Tests
    // ============================================
    describe("depositYieldAsset()", function () {
        it("should deposit yield assets successfully", async function () {
            const {
                aaveV3YieldHandler,
                aaveV3YieldHandlerAddress,
                yAsset,
                yAssetOperationsHandler,
                accounts,
            } = await loadFixture(aaveV3YieldHandlerFixture);

            // Mint tokens to operations handler and approve
            await yAsset.mint(await yAssetOperationsHandler.getAddress(), HUNDRED_TOKENS);
            await yAssetOperationsHandler.connect(accounts.admin).distributeUnallocatedYAsset();

            // Check balance increased
            expect(await aaveV3YieldHandler.getBalance()).to.equal(HUNDRED_TOKENS);
        });

        it("should emit YieldAssetDeposited event", async function () {
            const {
                aaveV3YieldHandler,
                aaveV3YieldHandlerAddress,
                yAsset,
                yAssetAddress,
                yAssetOperationsHandler,
                accounts,
            } = await loadFixture(aaveV3YieldHandlerFixture);

            // Mint tokens to operations handler
            await yAsset.mint(await yAssetOperationsHandler.getAddress(), HUNDRED_TOKENS);

            await expect(
                yAssetOperationsHandler.connect(accounts.admin).distributeUnallocatedYAsset()
            ).to.emit(aaveV3YieldHandler, EVENTS.YieldAssetDeposited);
        });

        it("should revert when depositing zero amount", async function () {
            const {
                aaveV3YieldHandler,
                yAssetOperationsHandlerAddress,
                accounts,
            } = await loadFixture(aaveV3YieldHandlerFixture);

            // Try to deposit zero directly (simulating unauthorized call)
            await expect(
                aaveV3YieldHandler.connect(accounts.user1).depositYieldAsset(0)
            ).to.be.revertedWithCustomError(aaveV3YieldHandler, ERRORS.InvalidAmount);
        });

        it("should revert when called by unauthorized address", async function () {
            const {
                aaveV3YieldHandler,
                accounts,
            } = await loadFixture(aaveV3YieldHandlerFixture);

            await expect(
                aaveV3YieldHandler.connect(accounts.user1).depositYieldAsset(HUNDRED_TOKENS)
            ).to.be.revertedWithCustomError(aaveV3YieldHandler, ERRORS.Unauthorized);
        });
    });

    // ============================================
    // withdrawYieldAsset Tests
    // ============================================
    describe("withdrawYieldAsset()", function () {
        it("should withdraw partial yield assets successfully", async function () {
            const {
                aaveV3YieldHandler,
                aaveV3YieldHandlerAddress,
                yAsset,
                yAssetOperationsHandler,
                yAssetOperationsHandlerAddress,
                accounts,
            } = await loadFixture(aaveV3YieldHandlerFixture);

            // First deposit
            await yAsset.mint(yAssetOperationsHandlerAddress, HUNDRED_TOKENS);
            await yAssetOperationsHandler.connect(accounts.admin).distributeUnallocatedYAsset();

            const balanceBefore = await aaveV3YieldHandler.getBalance();
            expect(balanceBefore).to.equal(HUNDRED_TOKENS);

            // Withdraw partial
            await yAssetOperationsHandler.connect(accounts.admin).withdrawalYieldAssets(
                aaveV3YieldHandlerAddress,
                TEN_TOKENS
            );

            // Check balance decreased
            const balanceAfter = await aaveV3YieldHandler.getBalance();
            expect(balanceAfter).to.equal(HUNDRED_TOKENS - TEN_TOKENS);
        });

        // Note: Withdraw all with amount=0 is not supported by YAssetOperationsHandler
        // The handler reverts with InvalidAmount when amount is 0

        it("should emit YieldAssetWithdrawn event", async function () {
            const {
                aaveV3YieldHandler,
                aaveV3YieldHandlerAddress,
                yAsset,
                yAssetOperationsHandler,
                yAssetOperationsHandlerAddress,
                accounts,
            } = await loadFixture(aaveV3YieldHandlerFixture);

            // First deposit
            await yAsset.mint(yAssetOperationsHandlerAddress, HUNDRED_TOKENS);
            await yAssetOperationsHandler.connect(accounts.admin).distributeUnallocatedYAsset();

            // Withdraw and check event
            await expect(
                yAssetOperationsHandler.connect(accounts.admin).withdrawalYieldAssets(
                    aaveV3YieldHandlerAddress,
                    TEN_TOKENS
                )
            ).to.emit(aaveV3YieldHandler, EVENTS.YieldAssetWithdrawn);
        });

        it("should revert when called by unauthorized address", async function () {
            const {
                aaveV3YieldHandler,
                accounts,
            } = await loadFixture(aaveV3YieldHandlerFixture);

            await expect(
                aaveV3YieldHandler.connect(accounts.user1).withdrawYieldAsset(TEN_TOKENS)
            ).to.be.revertedWithCustomError(aaveV3YieldHandler, ERRORS.Unauthorized);
        });

        it("should revert when withdrawing more than balance", async function () {
            const {
                aaveV3YieldHandler,
                aaveV3YieldHandlerAddress,
                yAsset,
                yAssetOperationsHandler,
                yAssetOperationsHandlerAddress,
                accounts,
            } = await loadFixture(aaveV3YieldHandlerFixture);

            // First deposit small amount
            await yAsset.mint(yAssetOperationsHandlerAddress, TEN_TOKENS);
            await yAssetOperationsHandler.connect(accounts.admin).distributeUnallocatedYAsset();

            // Try to withdraw more than balance
            await expect(
                yAssetOperationsHandler.connect(accounts.admin).withdrawalYieldAssets(
                    aaveV3YieldHandlerAddress,
                    HUNDRED_TOKENS
                )
            ).to.be.reverted;
        });
    });

    // ============================================
    // Admin Functions Tests
    // ============================================
    describe("Admin Functions", function () {
        describe("setYieldAsset()", function () {
            it("should set yield asset successfully", async function () {
                const {
                    aaveV3YieldHandler,
                    accounts,
                } = await loadFixture(aaveV3YieldHandlerFixture);

                const newYieldAsset = await deployMintableERC20("New Asset", "NEW", DECIMALS_18);
                const newYieldAssetAddress = await newYieldAsset.getAddress();

                await aaveV3YieldHandler.connect(accounts.admin).setYieldAsset(newYieldAssetAddress);
                expect(await aaveV3YieldHandler.getYieldAsset()).to.equal(newYieldAssetAddress);
            });

            it("should revert when setting zero address", async function () {
                const {
                    aaveV3YieldHandler,
                    accounts,
                } = await loadFixture(aaveV3YieldHandlerFixture);

                await expect(
                    aaveV3YieldHandler.connect(accounts.admin).setYieldAsset(ZERO_ADDRESS)
                ).to.be.revertedWithCustomError(aaveV3YieldHandler, ERRORS.InvalidAddr);
            });

            it("should revert when called by non-admin", async function () {
                const {
                    aaveV3YieldHandler,
                    accounts,
                } = await loadFixture(aaveV3YieldHandlerFixture);

                await expect(
                    aaveV3YieldHandler.connect(accounts.operator).setYieldAsset(getRandomAddress())
                ).to.be.revertedWithCustomError(aaveV3YieldHandler, ERRORS.Unauthorized);
            });
        });

        describe("setAavePool()", function () {
            it("should set Aave pool successfully", async function () {
                const {
                    aaveV3YieldHandler,
                    accounts,
                } = await loadFixture(aaveV3YieldHandlerFixture);

                const newPool = await deployMockAaveV3();
                const newPoolAddress = await newPool.getAddress();

                await aaveV3YieldHandler.connect(accounts.admin).setAavePool(newPoolAddress);
            });

            it("should revert when setting zero address", async function () {
                const {
                    aaveV3YieldHandler,
                    accounts,
                } = await loadFixture(aaveV3YieldHandlerFixture);

                await expect(
                    aaveV3YieldHandler.connect(accounts.admin).setAavePool(ZERO_ADDRESS)
                ).to.be.revertedWithCustomError(aaveV3YieldHandler, ERRORS.InvalidAddr);
            });

            it("should revert when called by non-admin", async function () {
                const {
                    aaveV3YieldHandler,
                    accounts,
                } = await loadFixture(aaveV3YieldHandlerFixture);

                await expect(
                    aaveV3YieldHandler.connect(accounts.user1).setAavePool(getRandomAddress())
                ).to.be.revertedWithCustomError(aaveV3YieldHandler, ERRORS.Unauthorized);
            });
        });

        describe("setAToken()", function () {
            it("should set aToken successfully", async function () {
                const {
                    aaveV3YieldHandler,
                    accounts,
                } = await loadFixture(aaveV3YieldHandlerFixture);

                const newAToken = await deployMockAToken("New aToken", "aNEW", DECIMALS_18);
                const newATokenAddress = await newAToken.getAddress();

                await expect(
                    aaveV3YieldHandler.connect(accounts.admin).setAToken(newATokenAddress)
                ).to.emit(aaveV3YieldHandler, EVENTS.ATokenUpdated);
            });

            // Note: setAToken allows zero address (to reset/disable aToken)
            it("should allow setting zero address", async function () {
                const {
                    aaveV3YieldHandler,
                    accounts,
                } = await loadFixture(aaveV3YieldHandlerFixture);

                await expect(
                    aaveV3YieldHandler.connect(accounts.admin).setAToken(ZERO_ADDRESS)
                ).to.emit(aaveV3YieldHandler, EVENTS.ATokenUpdated);
            });
        });

        describe("setOperationsContract()", function () {
            it("should set operations contract successfully", async function () {
                const {
                    aaveV3YieldHandler,
                    accounts,
                    proTokenSettingsAddress,
                    yAssetAddress,
                } = await loadFixture(aaveV3YieldHandlerFixture);

                const newOpsHandler = await deployYAssetOperationsHandler(
                    proTokenSettingsAddress,
                    yAssetAddress
                );
                const newOpsHandlerAddress = await newOpsHandler.getAddress();

                await expect(
                    aaveV3YieldHandler.connect(accounts.admin).setOperationsContract(newOpsHandlerAddress)
                ).to.emit(aaveV3YieldHandler, EVENTS.OperationsContractUpdated);
            });

            it("should revert when setting zero address", async function () {
                const {
                    aaveV3YieldHandler,
                    accounts,
                } = await loadFixture(aaveV3YieldHandlerFixture);

                await expect(
                    aaveV3YieldHandler.connect(accounts.admin).setOperationsContract(ZERO_ADDRESS)
                ).to.be.revertedWithCustomError(aaveV3YieldHandler, ERRORS.InvalidAddr);
            });
        });
    });

    // ============================================
    // Emergency Withdraw Tests
    // ============================================
    describe("emergencyWithdraw()", function () {
        it("should withdraw ERC20 tokens in emergency", async function () {
            const {
                aaveV3YieldHandler,
                aaveV3YieldHandlerAddress,
                accounts,
            } = await loadFixture(aaveV3YieldHandlerFixture);

            // Deploy a random token and send to handler
            const randomToken = await deployMintableERC20("Random", "RND", DECIMALS_18);
            const randomTokenAddress = await randomToken.getAddress();
            await randomToken.mint(aaveV3YieldHandlerAddress, HUNDRED_TOKENS);

            // Emergency withdraw
            const adminBalanceBefore = await randomToken.balanceOf(accounts.admin.address);
            await aaveV3YieldHandler.connect(accounts.admin).emergencyWithdraw(
                randomTokenAddress,
                accounts.admin.address,
                HUNDRED_TOKENS
            );
            const adminBalanceAfter = await randomToken.balanceOf(accounts.admin.address);

            expect(adminBalanceAfter - adminBalanceBefore).to.equal(HUNDRED_TOKENS);
        });

        // Note: ETH withdrawal test skipped - contract doesn't have receive() function
        // The emergencyWithdraw function supports ETH but the contract can't receive ETH directly

        it("should emit EmergencyWithdraw event", async function () {
            const {
                aaveV3YieldHandler,
                aaveV3YieldHandlerAddress,
                accounts,
            } = await loadFixture(aaveV3YieldHandlerFixture);

            const randomToken = await deployMintableERC20("Random", "RND", DECIMALS_18);
            const randomTokenAddress = await randomToken.getAddress();
            await randomToken.mint(aaveV3YieldHandlerAddress, HUNDRED_TOKENS);

            await expect(
                aaveV3YieldHandler.connect(accounts.admin).emergencyWithdraw(
                    randomTokenAddress,
                    accounts.admin.address,
                    HUNDRED_TOKENS
                )
            ).to.emit(aaveV3YieldHandler, EVENTS.EmergencyWithdraw);
        });

        it("should revert when called by non-admin", async function () {
            const {
                aaveV3YieldHandler,
                yAssetAddress,
                accounts,
            } = await loadFixture(aaveV3YieldHandlerFixture);

            await expect(
                aaveV3YieldHandler.connect(accounts.user1).emergencyWithdraw(
                    yAssetAddress,
                    accounts.user1.address,
                    HUNDRED_TOKENS
                )
            ).to.be.revertedWithCustomError(aaveV3YieldHandler, ERRORS.Unauthorized);
        });

        it("should revert when recipient is zero address", async function () {
            const {
                aaveV3YieldHandler,
                yAssetAddress,
                accounts,
            } = await loadFixture(aaveV3YieldHandlerFixture);

            await expect(
                aaveV3YieldHandler.connect(accounts.admin).emergencyWithdraw(
                    yAssetAddress,
                    ZERO_ADDRESS,
                    HUNDRED_TOKENS
                )
            ).to.be.revertedWithCustomError(aaveV3YieldHandler, ERRORS.InvalidAddr);
        });
    });

    // ============================================
    // View Functions Tests
    // ============================================
    describe("View Functions", function () {
        it("getBalance() should return correct balance", async function () {
            const {
                aaveV3YieldHandler,
                yAsset,
                yAssetOperationsHandler,
                yAssetOperationsHandlerAddress,
                accounts,
            } = await loadFixture(aaveV3YieldHandlerFixture);

            expect(await aaveV3YieldHandler.getBalance()).to.equal(0);

            // Deposit
            await yAsset.mint(yAssetOperationsHandlerAddress, HUNDRED_TOKENS);
            await yAssetOperationsHandler.connect(accounts.admin).distributeUnallocatedYAsset();

            expect(await aaveV3YieldHandler.getBalance()).to.equal(HUNDRED_TOKENS);
        });

        it("getYieldAsset() should return correct asset", async function () {
            const {
                aaveV3YieldHandler,
                yAssetAddress,
            } = await loadFixture(aaveV3YieldHandlerFixture);

            expect(await aaveV3YieldHandler.getYieldAsset()).to.equal(yAssetAddress);
        });
    });

    // ============================================
    // Upgrade Authorization Tests
    // ============================================
    describe("Upgrade Authorization", function () {
        it("should only allow admin to upgrade", async function () {
            const { aaveV3YieldHandler, accounts } = await loadFixture(aaveV3YieldHandlerFixture);

            const AaveV3YieldHandlerV2Factory = await ethers.getContractFactory("AaveV3YieldHandler");

            await expect(
                upgrades.upgradeProxy(
                    await aaveV3YieldHandler.getAddress(),
                    AaveV3YieldHandlerV2Factory.connect(accounts.user1)
                )
            ).to.be.revertedWithCustomError(aaveV3YieldHandler, ERRORS.Unauthorized);

            await expect(
                upgrades.upgradeProxy(
                    await aaveV3YieldHandler.getAddress(),
                    AaveV3YieldHandlerV2Factory.connect(accounts.operator)
                )
            ).to.be.revertedWithCustomError(aaveV3YieldHandler, ERRORS.Unauthorized);
        });
    });
});
