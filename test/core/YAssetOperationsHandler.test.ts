import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import {
    ZERO_ADDRESS,
    TEN_TOKENS,
    HUNDRED_TOKENS,
    VERSION_1_0_0,
    DECIMALS_18,
    ALLOCATION_PRECISION_BPS,
    FIFTY_PERCENT_BPS,
    TEN_PERCENT_BPS,
    ERRORS,
    EVENTS,
} from "../helpers/constants";
import { fullProtocolFixture } from "../helpers/fixtures";
import {
    deployProTokenSettings,
    deployMintableERC20,
    getTestAccounts,
} from "../helpers/deploy";
import {
    deployMockYieldProtocolHandler,
    getRandomAddress,
} from "../helpers/mocks";

// ---------------------------------------------------------------------------
// YAssetOperationsHandler — unit tests
//
// The contract distributes a single yAsset across multiple yield protocol
// handlers. Allocations are in basis points and must sum to 10000.
//
// We use MockYieldProtocolHandler as the protocol handler since the real
// ones (AaveV3YieldHandler, MorphoYieldHandler) require external pool mocks.
// The mock just tracks an internal balance and pulls/pushes the yAsset.
// ---------------------------------------------------------------------------

describe("YAssetOperationsHandler", function () {
    // =======================================================================
    // Constants
    // =======================================================================
    describe("Constants", function () {
        it("VERSION = 1_00_00", async function () {
            const { yAssetOperationsHandler } = await loadFixture(fullProtocolFixture);
            expect(await yAssetOperationsHandler.VERSION()).to.equal(VERSION_1_0_0);
        });

        it("ALLOCATION_PRECISION = 10000", async function () {
            const { yAssetOperationsHandler } = await loadFixture(fullProtocolFixture);
            expect(await yAssetOperationsHandler.ALLOCATION_PRECISION()).to.equal(
                ALLOCATION_PRECISION_BPS,
            );
        });
    });

    // =======================================================================
    // initialize
    // =======================================================================
    describe("initialize()", function () {
        it("sets the yAsset and Settings addresses", async function () {
            const { yAssetOperationsHandler, yAssetAddress } =
                await loadFixture(fullProtocolFixture);
            expect(await yAssetOperationsHandler.getYAsset()).to.equal(yAssetAddress);
        });

        it("reverts on zero proTokenSettings", async function () {
            const yAsset = await deployMintableERC20("Test", "TEST", DECIMALS_18);
            const Factory = await ethers.getContractFactory("YAssetOperationsHandler");

            await expect(
                upgrades.deployProxy(
                    Factory,
                    [ZERO_ADDRESS, await yAsset.getAddress()],
                    { kind: "uups" },
                ),
            ).to.be.revertedWithCustomError(Factory, ERRORS.ZeroAddress);
        });

        it("reverts on zero yAsset", async function () {
            const accounts = await getTestAccounts();
            const settings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator);
            const Factory = await ethers.getContractFactory("YAssetOperationsHandler");

            await expect(
                upgrades.deployProxy(
                    Factory,
                    [await settings.getAddress(), ZERO_ADDRESS],
                    { kind: "uups" },
                ),
            ).to.be.revertedWithCustomError(Factory, ERRORS.ZeroAddress);
        });

        it("reverts on re-initialization", async function () {
            const { yAssetOperationsHandler, proTokenSettingsAddress, yAssetAddress } =
                await loadFixture(fullProtocolFixture);
            await expect(
                yAssetOperationsHandler.initialize(proTokenSettingsAddress, yAssetAddress),
            ).to.be.revertedWithCustomError(
                yAssetOperationsHandler,
                ERRORS.InvalidInitialization,
            );
        });

        it("implementation contract has initializers disabled", async function () {
            const { yAssetOperationsHandler } = await loadFixture(fullProtocolFixture);
            const implAddress = await upgrades.erc1967.getImplementationAddress(
                await yAssetOperationsHandler.getAddress(),
            );
            const impl = await ethers.getContractAt(
                "YAssetOperationsHandler",
                implAddress,
            );
            await expect(
                impl.initialize(ZERO_ADDRESS, ZERO_ADDRESS),
            ).to.be.revertedWithCustomError(impl, ERRORS.InvalidInitialization);
        });
    });

    // =======================================================================
    // setYProtocolHandlers
    // =======================================================================
    describe("setYProtocolHandlers()", function () {
        async function setupWithMockHandlers() {
            const ctx = await fullProtocolFixture();
            const h1 = await deployMockYieldProtocolHandler(ctx.yAssetAddress);
            const h2 = await deployMockYieldProtocolHandler(ctx.yAssetAddress);
            return {
                ...ctx,
                h1,
                h2,
                h1Addr: await h1.getAddress(),
                h2Addr: await h2.getAddress(),
            };
        }

        it("admin can set a single handler with 100% allocation", async function () {
            const ctx = await loadFixture(setupWithMockHandlers);

            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .setYProtocolHandlers([ctx.h1Addr], [ALLOCATION_PRECISION_BPS], false);

            const handlers = await ctx.yAssetOperationsHandler.getYProtocolHandlers();
            expect(handlers.length).to.equal(1);
            expect(handlers[0].handlerContract).to.equal(ctx.h1Addr);
            expect(handlers[0].allocationPercentage).to.equal(ALLOCATION_PRECISION_BPS);
        });

        it("admin can set multiple handlers whose allocations sum to 100%", async function () {
            const ctx = await loadFixture(setupWithMockHandlers);

            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .setYProtocolHandlers(
                    [ctx.h1Addr, ctx.h2Addr],
                    [FIFTY_PERCENT_BPS, FIFTY_PERCENT_BPS],
                    false
                );

            const handlers = await ctx.yAssetOperationsHandler.getYProtocolHandlers();
            expect(handlers.length).to.equal(2);
        });

        it("emits YProtocolHandlersSet", async function () {
            const ctx = await loadFixture(setupWithMockHandlers);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .setYProtocolHandlers(
                        [ctx.h1Addr, ctx.h2Addr],
                        [FIFTY_PERCENT_BPS, FIFTY_PERCENT_BPS],
                        false
                    ),
            ).to.emit(ctx.yAssetOperationsHandler, EVENTS.YProtocolHandlersSet);
        });

        it("replaces the existing handler set on a second call", async function () {
            const ctx = await loadFixture(setupWithMockHandlers);

            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .setYProtocolHandlers([ctx.h1Addr], [ALLOCATION_PRECISION_BPS], false);

            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .setYProtocolHandlers([ctx.h2Addr], [ALLOCATION_PRECISION_BPS], false);

            const handlers = await ctx.yAssetOperationsHandler.getYProtocolHandlers();
            expect(handlers.length).to.equal(1);
            expect(handlers[0].handlerContract).to.equal(ctx.h2Addr);
        });

        it("reverts ArrayLengthMismatch when arrays differ", async function () {
            const ctx = await loadFixture(setupWithMockHandlers);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .setYProtocolHandlers([ctx.h1Addr], [FIFTY_PERCENT_BPS, FIFTY_PERCENT_BPS], false),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.ArrayLengthMismatch,
            );
        });

        it("reverts NoHandlers when arrays are empty", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .setYProtocolHandlers([], [], false),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.NoHandlers,
            );
        });

        it("reverts ZeroAddress when any handler is zero", async function () {
            const ctx = await loadFixture(setupWithMockHandlers);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .setYProtocolHandlers(
                        [ZERO_ADDRESS, ctx.h2Addr],
                        [FIFTY_PERCENT_BPS, FIFTY_PERCENT_BPS],
                        false
                    ),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.ZeroAddress,
            );
        });

        it("reverts InvalidAllocation when allocations sum below 100%", async function () {
            const ctx = await loadFixture(setupWithMockHandlers);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .setYProtocolHandlers(
                        [ctx.h1Addr, ctx.h2Addr],
                        [FIFTY_PERCENT_BPS, TEN_PERCENT_BPS], // 60%
                        false
                    ),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.InvalidAllocation,
            );
        });

        it("reverts InvalidAllocation when allocations sum above 100%", async function () {
            const ctx = await loadFixture(setupWithMockHandlers);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .setYProtocolHandlers(
                        [ctx.h1Addr, ctx.h2Addr],
                        [ALLOCATION_PRECISION_BPS, FIFTY_PERCENT_BPS], // 150%
                        false
                    ),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.InvalidAllocation,
            );
        });

        it("reverts NotAdmin when called by operator", async function () {
            const ctx = await loadFixture(setupWithMockHandlers);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.operator)
                    .setYProtocolHandlers([ctx.h1Addr], [ALLOCATION_PRECISION_BPS], false),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.NotAdmin,
            );
        });

        it("reverts NotAdmin when called by random attacker", async function () {
            const ctx = await loadFixture(setupWithMockHandlers);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.attacker)
                    .setYProtocolHandlers([ctx.h1Addr], [ALLOCATION_PRECISION_BPS], false),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.NotAdmin,
            );
        });
    });

    // =======================================================================
    // distributeYAsset
    // =======================================================================
    describe("distributeYAsset()", function () {
        // Fixture: full protocol + one mock handler at 100% allocation
        async function setupOneHandler() {
            const ctx = await fullProtocolFixture();
            const handler = await deployMockYieldProtocolHandler(ctx.yAssetAddress);
            const handlerAddr = await handler.getAddress();

            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .setYProtocolHandlers([handlerAddr], [ALLOCATION_PRECISION_BPS], false);

            return { ...ctx, handler, handlerAddr };
        }

        it("admin can distribute: transfers in and routes to handler", async function () {
            const ctx = await loadFixture(setupOneHandler);

            await ctx.yAsset.mint(ctx.accounts.admin.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(ctx.accounts.admin)
                .approve(ctx.yAssetOperationsHandlerAddress, HUNDRED_TOKENS);

            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .distributeYAsset(HUNDRED_TOKENS);

            expect(await ctx.handler.getBalance()).to.equal(HUNDRED_TOKENS);
        });

        it("operator can distribute", async function () {
            const ctx = await loadFixture(setupOneHandler);
            await ctx.yAsset.mint(ctx.accounts.operator.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(ctx.accounts.operator)
                .approve(ctx.yAssetOperationsHandlerAddress, HUNDRED_TOKENS);

            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.operator)
                    .distributeYAsset(HUNDRED_TOKENS),
            ).to.not.be.reverted;
        });

        it("externalBusiness can distribute (after being set)", async function () {
            const ctx = await loadFixture(setupOneHandler);
            await ctx.proTokenSettings
                .connect(ctx.accounts.admin)
                .setExternalBusiness(ctx.accounts.externalBusiness.address);

            await ctx.yAsset.mint(ctx.accounts.externalBusiness.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(ctx.accounts.externalBusiness)
                .approve(ctx.yAssetOperationsHandlerAddress, HUNDRED_TOKENS);

            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.externalBusiness)
                    .distributeYAsset(HUNDRED_TOKENS),
            ).to.not.be.reverted;
        });

        it("ProTokenOperations can distribute without transferring (tokens already held)", async function () {
            // When Operations calls distributeYAsset, the contract assumes tokens
            // are already in its balance. We simulate this by minting directly
            // to the handler and impersonating the Operations contract.
            const ctx = await loadFixture(setupOneHandler);

            await ctx.yAsset.mint(ctx.yAssetOperationsHandlerAddress, HUNDRED_TOKENS);

            // Impersonate ProTokenOperations
            await ethers.provider.send("hardhat_impersonateAccount", [
                ctx.proTokenOperationsAddress,
            ]);
            await ethers.provider.send("hardhat_setBalance", [
                ctx.proTokenOperationsAddress,
                "0xDE0B6B3A7640000", // 1 ether
            ]);
            const opsSigner = await ethers.getSigner(ctx.proTokenOperationsAddress);

            await ctx.yAssetOperationsHandler
                .connect(opsSigner)
                .distributeYAsset(HUNDRED_TOKENS);

            expect(await ctx.handler.getBalance()).to.equal(HUNDRED_TOKENS);
        });

        it("emits YAssetsAllocated and YAssetsDistributed", async function () {
            const ctx = await loadFixture(setupOneHandler);
            await ctx.yAsset.mint(ctx.accounts.admin.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(ctx.accounts.admin)
                .approve(ctx.yAssetOperationsHandlerAddress, HUNDRED_TOKENS);

            const tx = ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .distributeYAsset(HUNDRED_TOKENS);
            await expect(tx).to.emit(ctx.yAssetOperationsHandler, EVENTS.YAssetsAllocated);
            await expect(tx).to.emit(ctx.yAssetOperationsHandler, EVENTS.YAssetsDistributed);
        });

        it("reverts ZeroAmount when amount is 0", async function () {
            const ctx = await loadFixture(setupOneHandler);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .distributeYAsset(0n),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.ZeroAmount,
            );
        });

        it("reverts Unauthorized when called by random account", async function () {
            const ctx = await loadFixture(setupOneHandler);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.attacker)
                    .distributeYAsset(HUNDRED_TOKENS),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.Unauthorized,
            );
        });

        it("reverts Paused when protocol is paused", async function () {
            const ctx = await loadFixture(setupOneHandler);
            await ctx.proTokenSettings.connect(ctx.accounts.admin).pause();
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .distributeYAsset(HUNDRED_TOKENS),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.Paused,
            );
        });
    });

    // =======================================================================
    // distributeUnallocatedYAsset
    // =======================================================================
    describe("distributeUnallocatedYAsset()", function () {
        async function setupOneHandler() {
            const ctx = await fullProtocolFixture();
            const handler = await deployMockYieldProtocolHandler(ctx.yAssetAddress);
            const handlerAddr = await handler.getAddress();
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .setYProtocolHandlers([handlerAddr], [ALLOCATION_PRECISION_BPS], false);
            return { ...ctx, handler, handlerAddr };
        }

        it("distributes the contract's full unallocated balance", async function () {
            const ctx = await loadFixture(setupOneHandler);
            await ctx.yAsset.mint(ctx.yAssetOperationsHandlerAddress, HUNDRED_TOKENS);

            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .distributeUnallocatedYAsset();

            expect(await ctx.handler.getBalance()).to.equal(HUNDRED_TOKENS);
            expect(
                await ctx.yAsset.balanceOf(ctx.yAssetOperationsHandlerAddress),
            ).to.equal(0n);
        });

        it("is permissionless — any caller can trigger", async function () {
            const ctx = await loadFixture(setupOneHandler);
            await ctx.yAsset.mint(ctx.yAssetOperationsHandlerAddress, HUNDRED_TOKENS);

            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.attacker)
                .distributeUnallocatedYAsset();

            expect(await ctx.handler.getBalance()).to.equal(HUNDRED_TOKENS);
        });

        it("is a no-op when contract has zero balance", async function () {
            const ctx = await loadFixture(setupOneHandler);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.user1)
                    .distributeUnallocatedYAsset(),
            ).to.not.be.reverted;
            expect(await ctx.handler.getBalance()).to.equal(0n);
        });

        it("reverts Paused when protocol is paused", async function () {
            const ctx = await loadFixture(setupOneHandler);
            await ctx.proTokenSettings.connect(ctx.accounts.admin).pause();
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .distributeUnallocatedYAsset(),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.Paused,
            );
        });
    });

    // =======================================================================
    // withdrawalYieldAssets
    // =======================================================================
    describe("withdrawalYieldAssets()", function () {
        async function setupFundedHandler() {
            const ctx = await fullProtocolFixture();
            const handler = await deployMockYieldProtocolHandler(ctx.yAssetAddress);
            const handlerAddr = await handler.getAddress();
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .setYProtocolHandlers([handlerAddr], [ALLOCATION_PRECISION_BPS], false);
            // Fund and distribute
            await ctx.yAsset.mint(ctx.yAssetOperationsHandlerAddress, HUNDRED_TOKENS);
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .distributeUnallocatedYAsset();
            return { ...ctx, handler, handlerAddr };
        }

        it("admin can withdraw from a specific handler", async function () {
            const ctx = await loadFixture(setupFundedHandler);
            const before = await ctx.yAsset.balanceOf(ctx.accounts.admin.address);

            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .withdrawalYieldAssets(ctx.handlerAddr, TEN_TOKENS);

            expect(await ctx.handler.getBalance()).to.equal(HUNDRED_TOKENS - TEN_TOKENS);
            expect(await ctx.yAsset.balanceOf(ctx.accounts.admin.address)).to.equal(
                before + TEN_TOKENS,
            );
        });

        it("operator can withdraw", async function () {
            const ctx = await loadFixture(setupFundedHandler);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.operator)
                    .withdrawalYieldAssets(ctx.handlerAddr, TEN_TOKENS),
            ).to.not.be.reverted;
        });

        it("externalBusiness can withdraw (after being set)", async function () {
            const ctx = await loadFixture(setupFundedHandler);
            await ctx.proTokenSettings
                .connect(ctx.accounts.admin)
                .setExternalBusiness(ctx.accounts.externalBusiness.address);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.externalBusiness)
                    .withdrawalYieldAssets(ctx.handlerAddr, TEN_TOKENS),
            ).to.not.be.reverted;
        });

        it("withdraws from unallocated balance when handler is address(0)", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await ctx.yAsset.mint(ctx.yAssetOperationsHandlerAddress, HUNDRED_TOKENS);

            const before = await ctx.yAsset.balanceOf(ctx.accounts.admin.address);
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .withdrawalYieldAssets(ZERO_ADDRESS, TEN_TOKENS);

            expect(await ctx.yAsset.balanceOf(ctx.accounts.admin.address)).to.equal(
                before + TEN_TOKENS,
            );
            expect(await ctx.yAssetOperationsHandler.getUnallocatedBalance()).to.equal(
                HUNDRED_TOKENS - TEN_TOKENS,
            );
        });

        it("emits YAssetsWithdrawn with the handler address", async function () {
            const ctx = await loadFixture(setupFundedHandler);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .withdrawalYieldAssets(ctx.handlerAddr, TEN_TOKENS),
            )
                .to.emit(ctx.yAssetOperationsHandler, EVENTS.YAssetsWithdrawn)
                .withArgs(ctx.handlerAddr, ctx.accounts.admin.address, TEN_TOKENS);
        });

        it("emits YAssetsWithdrawn with address(0) for unallocated withdrawals", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await ctx.yAsset.mint(ctx.yAssetOperationsHandlerAddress, TEN_TOKENS);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .withdrawalYieldAssets(ZERO_ADDRESS, TEN_TOKENS),
            )
                .to.emit(ctx.yAssetOperationsHandler, EVENTS.YAssetsWithdrawn)
                .withArgs(ZERO_ADDRESS, ctx.accounts.admin.address, TEN_TOKENS);
        });

        it("reverts Unauthorized when called by random caller", async function () {
            const ctx = await loadFixture(setupFundedHandler);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.attacker)
                    .withdrawalYieldAssets(ctx.handlerAddr, TEN_TOKENS),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.Unauthorized,
            );
        });

        it("reverts ProtocolHandlerNotFound for unregistered handler", async function () {
            const ctx = await loadFixture(setupFundedHandler);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .withdrawalYieldAssets(getRandomAddress(), TEN_TOKENS),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.ProtocolHandlerNotFound,
            );
        });

        it("reverts InsufficientBalance when unallocated balance is too low", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await ctx.yAsset.mint(ctx.yAssetOperationsHandlerAddress, TEN_TOKENS);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .withdrawalYieldAssets(ZERO_ADDRESS, HUNDRED_TOKENS),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.InsufficientBalance,
            );
        });

        it("reverts Paused when protocol is paused", async function () {
            const ctx = await loadFixture(setupFundedHandler);
            await ctx.proTokenSettings.connect(ctx.accounts.admin).pause();
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .withdrawalYieldAssets(ctx.handlerAddr, TEN_TOKENS),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.Paused,
            );
        });
    });

    // =======================================================================
    // withdrawalYieldAssetsMultiple
    // =======================================================================
    describe("withdrawalYieldAssetsMultiple()", function () {
        async function setupTwoFundedHandlers() {
            const ctx = await fullProtocolFixture();
            const h1 = await deployMockYieldProtocolHandler(ctx.yAssetAddress);
            const h2 = await deployMockYieldProtocolHandler(ctx.yAssetAddress);
            const h1Addr = await h1.getAddress();
            const h2Addr = await h2.getAddress();
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .setYProtocolHandlers(
                    [h1Addr, h2Addr],
                    [FIFTY_PERCENT_BPS, FIFTY_PERCENT_BPS],
                    false
                );
            await ctx.yAsset.mint(ctx.yAssetOperationsHandlerAddress, HUNDRED_TOKENS);
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .distributeUnallocatedYAsset();
            return { ...ctx, h1, h2, h1Addr, h2Addr };
        }

        it("withdraws from multiple handlers in one call", async function () {
            const ctx = await loadFixture(setupTwoFundedHandlers);

            const before = await ctx.yAsset.balanceOf(ctx.accounts.admin.address);
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .withdrawalYieldAssetsMultiple(
                    [ctx.h1Addr, ctx.h2Addr],
                    [TEN_TOKENS, TEN_TOKENS],
                );

            expect(await ctx.h1.getBalance()).to.equal(HUNDRED_TOKENS / 2n - TEN_TOKENS);
            expect(await ctx.h2.getBalance()).to.equal(HUNDRED_TOKENS / 2n - TEN_TOKENS);
            expect(await ctx.yAsset.balanceOf(ctx.accounts.admin.address)).to.equal(
                before + TEN_TOKENS * 2n,
            );
        });

        it("withdraws from a mix of unallocated and handlers", async function () {
            const ctx = await loadFixture(setupTwoFundedHandlers);
            // Add unallocated balance on top of already-distributed handlers
            await ctx.yAsset.mint(ctx.yAssetOperationsHandlerAddress, TEN_TOKENS);

            const before = await ctx.yAsset.balanceOf(ctx.accounts.admin.address);
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .withdrawalYieldAssetsMultiple(
                    [ZERO_ADDRESS, ctx.h1Addr],
                    [TEN_TOKENS, TEN_TOKENS],
                );

            expect(await ctx.yAssetOperationsHandler.getUnallocatedBalance()).to.equal(0n);
            expect(await ctx.h1.getBalance()).to.equal(HUNDRED_TOKENS / 2n - TEN_TOKENS);
            expect(await ctx.yAsset.balanceOf(ctx.accounts.admin.address)).to.equal(
                before + TEN_TOKENS * 2n,
            );
        });

        it("emits YAssetsWithdrawn for each entry", async function () {
            const ctx = await loadFixture(setupTwoFundedHandlers);
            const tx = ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .withdrawalYieldAssetsMultiple(
                    [ctx.h1Addr, ctx.h2Addr],
                    [TEN_TOKENS, TEN_TOKENS],
                );
            await expect(tx)
                .to.emit(ctx.yAssetOperationsHandler, EVENTS.YAssetsWithdrawn)
                .withArgs(ctx.h1Addr, ctx.accounts.admin.address, TEN_TOKENS);
            await expect(tx)
                .to.emit(ctx.yAssetOperationsHandler, EVENTS.YAssetsWithdrawn)
                .withArgs(ctx.h2Addr, ctx.accounts.admin.address, TEN_TOKENS);
        });

        it("reverts ArrayLengthMismatch when arrays differ", async function () {
            const ctx = await loadFixture(setupTwoFundedHandlers);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .withdrawalYieldAssetsMultiple([ctx.h1Addr], [TEN_TOKENS, TEN_TOKENS]),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.ArrayLengthMismatch,
            );
        });

        it("reverts NoHandlers on empty arrays", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .withdrawalYieldAssetsMultiple([], []),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.NoHandlers,
            );
        });

        it("reverts Unauthorized when called by random caller", async function () {
            const ctx = await loadFixture(setupTwoFundedHandlers);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.attacker)
                    .withdrawalYieldAssetsMultiple([ctx.h1Addr], [TEN_TOKENS]),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.Unauthorized,
            );
        });

        it("reverts ProtocolHandlerNotFound for an unknown handler in array", async function () {
            const ctx = await loadFixture(setupTwoFundedHandlers);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .withdrawalYieldAssetsMultiple([getRandomAddress()], [TEN_TOKENS]),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.ProtocolHandlerNotFound,
            );
        });

        it("reverts InsufficientBalance when unallocated balance is too low", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await ctx.yAsset.mint(ctx.yAssetOperationsHandlerAddress, TEN_TOKENS);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .withdrawalYieldAssetsMultiple([ZERO_ADDRESS], [HUNDRED_TOKENS]),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.InsufficientBalance,
            );
        });

        it("reverts Paused when protocol is paused", async function () {
            const ctx = await loadFixture(setupTwoFundedHandlers);
            await ctx.proTokenSettings.connect(ctx.accounts.admin).pause();
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .withdrawalYieldAssetsMultiple([ctx.h1Addr], [TEN_TOKENS]),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.Paused,
            );
        });
    });

    // =======================================================================
    // payOut
    // =======================================================================
    describe("payOut()", function () {
        async function setupFundedForPayout() {
            const ctx = await fullProtocolFixture();
            const handler = await deployMockYieldProtocolHandler(ctx.yAssetAddress);
            const handlerAddr = await handler.getAddress();
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .setYProtocolHandlers([handlerAddr], [ALLOCATION_PRECISION_BPS], false);
            await ctx.yAsset.mint(ctx.yAssetOperationsHandlerAddress, HUNDRED_TOKENS);
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .distributeUnallocatedYAsset();

            // payOut is gated to Operations OR externalBusiness/operator/admin.
            // Impersonate ProTokenOperations as the privileged caller.
            await ethers.provider.send("hardhat_impersonateAccount", [
                ctx.proTokenOperationsAddress,
            ]);
            await ethers.provider.send("hardhat_setBalance", [
                ctx.proTokenOperationsAddress,
                "0xDE0B6B3A7640000",
            ]);
            const opsSigner = await ethers.getSigner(ctx.proTokenOperationsAddress);

            return { ...ctx, handler, handlerAddr, opsSigner };
        }

        it("operations can pay out from the unallocated reserve", async function () {
            const ctx = await loadFixture(setupFundedForPayout);
            // Top up unallocated so it covers the payout without touching handlers.
            await ctx.yAsset.mint(ctx.yAssetOperationsHandlerAddress, TEN_TOKENS);
            const dest = ctx.accounts.user1.address;
            const before = await ctx.yAsset.balanceOf(dest);

            await ctx.yAssetOperationsHandler
                .connect(ctx.opsSigner)
                .payOut(dest, TEN_TOKENS);

            expect(await ctx.yAsset.balanceOf(dest)).to.equal(before + TEN_TOKENS);
            // Handler balance untouched (reserve covered it).
            expect(await ctx.handler.getBalance()).to.equal(HUNDRED_TOKENS);
        });

        it("admin / operator / externalBusiness are also authorized", async function () {
            const ctx = await loadFixture(setupFundedForPayout);
            await ctx.yAsset.mint(ctx.yAssetOperationsHandlerAddress, TEN_TOKENS * 3n);

            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .payOut(ctx.accounts.user1.address, TEN_TOKENS),
            ).to.not.be.reverted;

            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.operator)
                    .payOut(ctx.accounts.user1.address, TEN_TOKENS),
            ).to.not.be.reverted;

            await ctx.proTokenSettings
                .connect(ctx.accounts.admin)
                .setExternalBusiness(ctx.accounts.externalBusiness.address);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.externalBusiness)
                    .payOut(ctx.accounts.user1.address, TEN_TOKENS),
            ).to.not.be.reverted;
        });

        it("pulls the shortfall from yield handlers when reserve is insufficient", async function () {
            const ctx = await loadFixture(setupFundedForPayout);
            const dest = ctx.accounts.user1.address;
            const before = await ctx.yAsset.balanceOf(dest);

            // Reserve is 0 (all distributed); the full amount comes from the handler.
            await ctx.yAssetOperationsHandler
                .connect(ctx.opsSigner)
                .payOut(dest, HUNDRED_TOKENS);

            expect(await ctx.yAsset.balanceOf(dest)).to.equal(before + HUNDRED_TOKENS);
            expect(await ctx.handler.getBalance()).to.equal(0n);
        });

        it("emits YAssetsPaidOut", async function () {
            const ctx = await loadFixture(setupFundedForPayout);
            await ctx.yAsset.mint(ctx.yAssetOperationsHandlerAddress, TEN_TOKENS);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.opsSigner)
                    .payOut(ctx.accounts.user1.address, TEN_TOKENS),
            )
                .to.emit(ctx.yAssetOperationsHandler, EVENTS.YAssetsPaidOut)
                .withArgs(ctx.accounts.user1.address, TEN_TOKENS);
        });

        it("reverts ZeroAddress on zero destination", async function () {
            const ctx = await loadFixture(setupFundedForPayout);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.opsSigner)
                    .payOut(ZERO_ADDRESS, TEN_TOKENS),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.ZeroAddress,
            );
        });

        it("reverts ZeroAmount on zero amount", async function () {
            const ctx = await loadFixture(setupFundedForPayout);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.opsSigner)
                    .payOut(ctx.accounts.user1.address, 0n),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.ZeroAmount,
            );
        });

        it("reverts Unauthorized when called by a random account", async function () {
            const ctx = await loadFixture(setupFundedForPayout);
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.attacker)
                    .payOut(ctx.accounts.user1.address, TEN_TOKENS),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.Unauthorized,
            );
        });

        it("reverts InsufficientBalance when reserve + all handlers fall short", async function () {
            const ctx = await loadFixture(setupFundedForPayout);
            // Total available is 100 (in handler); request more.
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.opsSigner)
                    .payOut(ctx.accounts.user1.address, HUNDRED_TOKENS + TEN_TOKENS),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.InsufficientBalance,
            );
        });

        it("reverts Paused when protocol is paused", async function () {
            const ctx = await loadFixture(setupFundedForPayout);
            await ctx.proTokenSettings.connect(ctx.accounts.admin).pause();
            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.opsSigner)
                    .payOut(ctx.accounts.user1.address, TEN_TOKENS),
            ).to.be.revertedWithCustomError(
                ctx.yAssetOperationsHandler,
                ERRORS.Paused,
            );
        });
    });

    // =======================================================================
    // emergencyWithdraw
    // =======================================================================
    describe("emergencyWithdraw()", function () {
        it("admin can withdraw an ERC20 to a recipient", async function () {
            const ctx = await loadFixture(fullProtocolFixture);

            const stray = await deployMintableERC20("Stray", "STY", DECIMALS_18);
            const strayAddr = await stray.getAddress();
            await stray.mint(ctx.yAssetOperationsHandlerAddress, HUNDRED_TOKENS);

            const before = await stray.balanceOf(ctx.accounts.admin.address);
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .emergencyWithdraw(strayAddr, ctx.accounts.admin.address, HUNDRED_TOKENS);
            const after = await stray.balanceOf(ctx.accounts.admin.address);

            expect(after - before).to.equal(HUNDRED_TOKENS);
        });

        it("emits EmergencyWithdraw", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            const stray = await deployMintableERC20("Stray", "STY", DECIMALS_18);
            const strayAddr = await stray.getAddress();
            await stray.mint(ctx.yAssetOperationsHandlerAddress, HUNDRED_TOKENS);

            await expect(
                ctx.yAssetOperationsHandler
                    .connect(ctx.accounts.admin)
                    .emergencyWithdraw(strayAddr, ctx.accounts.admin.address, HUNDRED_TOKENS),
            )
                .to.emit(ctx.yAssetOperationsHandler, EVENTS.EmergencyWithdraw)
                .withArgs(strayAddr, ctx.accounts.admin.address, HUNDRED_TOKENS);
        });

        it("reverts NotAdmin when called by non-admin", async function () {
            const { yAssetOperationsHandler, yAssetAddress, accounts } =
                await loadFixture(fullProtocolFixture);
            await expect(
                yAssetOperationsHandler
                    .connect(accounts.user1)
                    .emergencyWithdraw(
                        yAssetAddress,
                        accounts.user1.address,
                        HUNDRED_TOKENS,
                    ),
            ).to.be.revertedWithCustomError(
                yAssetOperationsHandler,
                ERRORS.NotAdmin,
            );
        });

        it("reverts ZeroAddress on zero recipient", async function () {
            const { yAssetOperationsHandler, yAssetAddress, accounts } =
                await loadFixture(fullProtocolFixture);
            await expect(
                yAssetOperationsHandler
                    .connect(accounts.admin)
                    .emergencyWithdraw(yAssetAddress, ZERO_ADDRESS, HUNDRED_TOKENS),
            ).to.be.revertedWithCustomError(
                yAssetOperationsHandler,
                ERRORS.ZeroAddress,
            );
        });

        it("reverts ZeroAmount on zero amount", async function () {
            const { yAssetOperationsHandler, yAssetAddress, accounts } =
                await loadFixture(fullProtocolFixture);
            await expect(
                yAssetOperationsHandler
                    .connect(accounts.admin)
                    .emergencyWithdraw(yAssetAddress, accounts.admin.address, 0n),
            ).to.be.revertedWithCustomError(
                yAssetOperationsHandler,
                ERRORS.ZeroAmount,
            );
        });
    });

    // =======================================================================
    // View functions
    // =======================================================================
    describe("View functions", function () {
        it("getYAsset returns the configured yAsset", async function () {
            const { yAssetOperationsHandler, yAssetAddress } =
                await loadFixture(fullProtocolFixture);
            expect(await yAssetOperationsHandler.getYAsset()).to.equal(yAssetAddress);
        });

        it("getYProtocolHandlers returns the configured handlers", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            const handler = await deployMockYieldProtocolHandler(ctx.yAssetAddress);
            const handlerAddr = await handler.getAddress();
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .setYProtocolHandlers([handlerAddr], [ALLOCATION_PRECISION_BPS], false);

            const handlers = await ctx.yAssetOperationsHandler.getYProtocolHandlers();
            expect(handlers.length).to.equal(1);
            expect(handlers[0].handlerContract).to.equal(handlerAddr);
            expect(handlers[0].allocationPercentage).to.equal(ALLOCATION_PRECISION_BPS);
        });

        it("getYAssetInfo returns the yAsset and combined balance", async function () {
            const ctx = await loadFixture(fullProtocolFixture);

            const [asset0, total0] = await ctx.yAssetOperationsHandler.getYAssetInfo();
            expect(asset0).to.equal(ctx.yAssetAddress);
            expect(total0).to.equal(0n);

            // Set handler, fund, distribute
            const handler = await deployMockYieldProtocolHandler(ctx.yAssetAddress);
            const handlerAddr = await handler.getAddress();
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .setYProtocolHandlers([handlerAddr], [ALLOCATION_PRECISION_BPS], false);
            await ctx.yAsset.mint(ctx.yAssetOperationsHandlerAddress, HUNDRED_TOKENS);
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .distributeUnallocatedYAsset();

            const [, total1] = await ctx.yAssetOperationsHandler.getYAssetInfo();
            expect(total1).to.equal(HUNDRED_TOKENS);
        });

        it("getYAssetInfo sums handler balance and unallocated balance", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            const handler = await deployMockYieldProtocolHandler(ctx.yAssetAddress);
            const handlerAddr = await handler.getAddress();
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .setYProtocolHandlers([handlerAddr], [ALLOCATION_PRECISION_BPS], false);

            // Distribute 100 to handler
            await ctx.yAsset.mint(ctx.yAssetOperationsHandlerAddress, HUNDRED_TOKENS);
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .distributeUnallocatedYAsset();
            // Add 10 as unallocated (not distributed)
            await ctx.yAsset.mint(ctx.yAssetOperationsHandlerAddress, TEN_TOKENS);

            const [, total] = await ctx.yAssetOperationsHandler.getYAssetInfo();
            expect(total).to.equal(HUNDRED_TOKENS + TEN_TOKENS);
        });

        it("getProtocolBalance returns handler-side balance", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            const handler = await deployMockYieldProtocolHandler(ctx.yAssetAddress);
            const handlerAddr = await handler.getAddress();
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .setYProtocolHandlers([handlerAddr], [ALLOCATION_PRECISION_BPS], false);

            expect(
                await ctx.yAssetOperationsHandler.getProtocolBalance(handlerAddr),
            ).to.equal(0n);

            await ctx.yAsset.mint(ctx.yAssetOperationsHandlerAddress, HUNDRED_TOKENS);
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .distributeUnallocatedYAsset();

            expect(
                await ctx.yAssetOperationsHandler.getProtocolBalance(handlerAddr),
            ).to.equal(HUNDRED_TOKENS);
        });

        it("getUnallocatedBalance tracks the contract's idle yAsset balance", async function () {
            const ctx = await loadFixture(fullProtocolFixture);

            expect(
                await ctx.yAssetOperationsHandler.getUnallocatedBalance(),
            ).to.equal(0n);

            await ctx.yAsset.mint(ctx.yAssetOperationsHandlerAddress, HUNDRED_TOKENS);
            expect(
                await ctx.yAssetOperationsHandler.getUnallocatedBalance(),
            ).to.equal(HUNDRED_TOKENS);
        });
    });

    // =======================================================================
    // _authorizeUpgrade (UUPS)
    // =======================================================================
    describe("_authorizeUpgrade (UUPS)", function () {
        it("admin can upgrade to higher VERSION", async function () {
            const { yAssetOperationsHandler, accounts } =
                await loadFixture(fullProtocolFixture);

            const V2 = await ethers.getContractFactory("MockUpgradeTargetHigherVersion");
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();

            await expect(
                yAssetOperationsHandler
                    .connect(accounts.admin)
                    .upgradeToAndCall(await v2Impl.getAddress(), "0x"),
            ).to.not.be.reverted;
        });

        it("reverts VersionNotIncremented when new VERSION equals current", async function () {
            const { yAssetOperationsHandler, accounts } =
                await loadFixture(fullProtocolFixture);

            const Same = await ethers.getContractFactory("MockUpgradeTargetSameVersion");
            const sameImpl = await Same.deploy();
            await sameImpl.waitForDeployment();

            await expect(
                yAssetOperationsHandler
                    .connect(accounts.admin)
                    .upgradeToAndCall(await sameImpl.getAddress(), "0x"),
            )
                .to.be.revertedWithCustomError(
                    yAssetOperationsHandler,
                    ERRORS.VersionNotIncremented,
                )
                .withArgs(VERSION_1_0_0, VERSION_1_0_0);
        });

        it("reverts VersionNotIncremented when new VERSION is lower", async function () {
            const { yAssetOperationsHandler, accounts } =
                await loadFixture(fullProtocolFixture);

            const Lower = await ethers.getContractFactory("MockUpgradeTargetLowerVersion");
            const lowerImpl = await Lower.deploy();
            await lowerImpl.waitForDeployment();

            await expect(
                yAssetOperationsHandler
                    .connect(accounts.admin)
                    .upgradeToAndCall(await lowerImpl.getAddress(), "0x"),
            )
                .to.be.revertedWithCustomError(
                    yAssetOperationsHandler,
                    ERRORS.VersionNotIncremented,
                )
                .withArgs(VERSION_1_0_0, 1n);
        });

        it("reverts NotAdmin when called by operator", async function () {
            const { yAssetOperationsHandler, accounts } =
                await loadFixture(fullProtocolFixture);

            const V2 = await ethers.getContractFactory("MockUpgradeTargetHigherVersion");
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();

            await expect(
                yAssetOperationsHandler
                    .connect(accounts.operator)
                    .upgradeToAndCall(await v2Impl.getAddress(), "0x"),
            ).to.be.revertedWithCustomError(yAssetOperationsHandler, ERRORS.NotAdmin);
        });

        it("reverts NotAdmin when called by random attacker", async function () {
            const { yAssetOperationsHandler, accounts } =
                await loadFixture(fullProtocolFixture);

            const V2 = await ethers.getContractFactory("MockUpgradeTargetHigherVersion");
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();

            await expect(
                yAssetOperationsHandler
                    .connect(accounts.attacker)
                    .upgradeToAndCall(await v2Impl.getAddress(), "0x"),
            ).to.be.revertedWithCustomError(yAssetOperationsHandler, ERRORS.NotAdmin);
        });
    });
});