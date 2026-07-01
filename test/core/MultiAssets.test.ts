import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import {
    ZERO_ADDRESS,
    ONE_USD,
    ONE_TOKEN,
    HUNDRED_TOKENS,
    DECIMALS_18,
    ERRORS,
    EVENTS,
} from "../helpers/constants";
import { fullProtocolFixture, FullProtocolFixture } from "../helpers/fixtures";
import {
    deployMintableERC20,
    deployYAssetOperationsHandler,
    createDefaultYAssetSettings,
} from "../helpers/deploy";
import {
    signMintProof,
    signUnmintProof,
    ProofKind,
    ProofData,
} from "../helpers/proofs";

// ---------------------------------------------------------------------------
// Multi-yAsset scenarios — broader-scope tests for different asset shapes.
//
// Two buckets:
//   1. 6-decimal stable (USDC-like): decimal expansion/contraction in mint/unmint
//      and min-deposit / min-withdraw floor enforcement (100 base each).
//   2. Mixed-asset operations: two yAssets registered together, accounting
//      stays independent.
//
// Math reference (18-dec proToken at $1, 6-dec USDC at $1):
//   - 1 USDC (1e6 atomic) → 1 proToken (1e18 atomic). Decimal expansion by 1e12.
//   - 1 proToken → 1 USDC. Decimal contraction by 1e12.
//   - Min deposit / withdraw are enforced in base (USD) terms: 100e18 each,
//     i.e. at least 100 USDC to mint and at least 100 proToken to redeem.
//
// BRANCHING NOTE (instant vs queued unmint):
// After the unmint refactor, ProTokenOperations._executeUnmint and strategicUnmint
// branch on YAssetOperationsHandler.previewPayOut(amount). With the default
// fixture (and addYAsset() below) no yield protocol handlers are configured, so
// yAsset transferred into a YAssetOperationsHandler stays unallocated.
// previewPayOut therefore returns true for amounts up to that pool and unmints
// route to the INSTANT branch by default. Tests in this file that exercise the
// full mint → unmint → batch → claim flow rely on the QUEUED branch, so
// createUnmintFor() drains the relevant handler's unallocated balance first via
// drainYAssetOps() to force queued routing.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Reusable helpers (local — same shape as the per-contract test files)
// ---------------------------------------------------------------------------

/**
 * Drain all unallocated yAsset from the YAssetOperationsHandler for `yAssetAddr`.
 * Resolves the handler via Settings so this works for any registered yAsset
 * (default 18-dec, USDC, or anything added via addYAsset()).
 *
 * Forces the queued unmint branch by emptying the source previewPayOut reads
 * from. No-op when there's nothing to drain.
 */
async function drainYAssetOps(ctx: FullProtocolFixture, yAssetAddr: string) {
    const info = await ctx.proTokenSettings.getYAssets([yAssetAddr]);
    const handlerAddr = info.yAssets[0].settings.yOperationsHandler;

    const token = await ethers.getContractAt("MintableERC20", yAssetAddr);
    const balance = await token.balanceOf(handlerAddr);
    if (balance === 0n) return;

    const handler = await ethers.getContractAt(
        "YAssetOperationsHandler",
        handlerAddr,
    );
    await handler
        .connect(ctx.accounts.admin)
        .withdrawalYieldAssets(ZERO_ADDRESS, balance);
}

/**
 * Sign-and-finalize mint flow. Returns the resulting proToken balance.
 */
async function mintProTokensFor(
    ctx: FullProtocolFixture,
    user: HardhatEthersSigner,
    yAssetAddr: string,
    yAssetToken: { mint: (to: string, amount: bigint) => Promise<unknown>; getAddress(): Promise<string> },
    amount: bigint,
): Promise<bigint> {
    await yAssetToken.mint(user.address, amount);
    const yAssetContract = await ethers.getContractAt(
        "MintableERC20",
        await yAssetToken.getAddress(),
    );
    await yAssetContract
        .connect(user)
        .approve(ctx.proTokenOperationsAddress, amount);

    const tx = await ctx.proTokenOperations
        .connect(user)
        .createMintRequest(yAssetAddr, amount, 0n, ZERO_ADDRESS);
    const receipt = await tx.wait();
    const event = receipt!.logs
        .map((l) => {
            try {
                return ctx.proTokenOperations.interface.parseLog(l as never);
            } catch {
                return null;
            }
        })
        .find((e) => e?.name === EVENTS.MintRequestCreated);
    const requestId = event!.args.requestID as bigint;

    const proofData: ProofData = {
        requestId,
        user: user.address,
        receiver: ZERO_ADDRESS,
        yAsset: yAssetAddr,
        amount,
        minAmountOut: 0n,
        proofKind: ProofKind.PROOF_OF_APPROVE,
    };
    const proof = await signMintProof(
        ctx.accounts.authority,
        ctx.proTokenOperationsAddress,
        proofData,
    );
    await ctx.proTokenOperations
        .connect(user)
        .finalizeMintRequest(requestId, ProofKind.PROOF_OF_APPROVE, proof);

    return ctx.proToken.balanceOf(user.address);
}

/**
 * Sign-and-finalize unmint flow. Returns the operations-side request id and
 * the corresponding unmint handler request id.
 *
 * Drains the relevant yAsset's yOps liquidity first to guarantee the QUEUED
 * branch runs — tests using this helper rely on the request landing in the
 * unmint handler. For instant-path coverage at this level see the per-contract
 * test files (ProTokenOperations.test.ts, ProTokenUnmintHandler.test.ts).
 */
async function createUnmintFor(
    ctx: FullProtocolFixture,
    user: HardhatEthersSigner,
    yAssetAddr: string,
    proTokenAmount: bigint,
): Promise<{ opsRequestId: bigint; handlerRequestId: bigint }> {
    await drainYAssetOps(ctx, yAssetAddr);

    await ctx.proToken
        .connect(user)
        .approve(ctx.proTokenOperationsAddress, proTokenAmount);

    const tx = await ctx.proTokenOperations
        .connect(user)
        .createUnmintRequest(yAssetAddr, proTokenAmount, 0n, ZERO_ADDRESS);
    const receipt = await tx.wait();
    const event = receipt!.logs
        .map((l) => {
            try {
                return ctx.proTokenOperations.interface.parseLog(l as never);
            } catch {
                return null;
            }
        })
        .find((e) => e?.name === EVENTS.UnmintRequestCreated);
    const opsRequestId = event!.args.requestID as bigint;

    const proofData: ProofData = {
        requestId: opsRequestId,
        user: user.address,
        receiver: ZERO_ADDRESS,
        yAsset: yAssetAddr,
        amount: proTokenAmount,
        minAmountOut: 0n,
        proofKind: ProofKind.PROOF_OF_APPROVE,
    };
    const proof = await signUnmintProof(
        ctx.accounts.authority,
        ctx.proTokenOperationsAddress,
        proofData,
    );
    await ctx.proTokenOperations
        .connect(user)
        .finalizeUnmintRequest(opsRequestId, ProofKind.PROOF_OF_APPROVE, proof);

    const currentBatchId = await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(
        yAssetAddr,
    );
    const handlerRequestId =
        await ctx.proTokenUnmintHandler.getUnmintRequestIdForReceiverInBatch(
            yAssetAddr,
            currentBatchId,
            user.address,
        );

    return { opsRequestId, handlerRequestId };
}

/**
 * Adds a second yAsset with arbitrary decimals/settings to the protocol.
 * Returns the deployed token, its operations handler, and the address.
 */
async function addYAsset(
    ctx: FullProtocolFixture,
    name: string,
    symbol: string,
    decimals: number,
    settingsOverride?: {
        staticPriceSource?: bigint;
        usdCap?: bigint;
        oraclePriceSources?: string[];
        unmintFeePer?: bigint;
    },
) {
    const token = await deployMintableERC20(name, symbol, decimals);
    const tokenAddr = await token.getAddress();

    const handler = await deployYAssetOperationsHandler(
        ctx.proTokenSettingsAddress,
        tokenAddr,
    );
    const handlerAddr = await handler.getAddress();

    const settings = createDefaultYAssetSettings(handlerAddr, decimals);
    if (settingsOverride) {
        const { unmintFeePer, ...priceOverride } = settingsOverride;
        settings.priceSettings = { ...settings.priceSettings, ...priceOverride };
        if (unmintFeePer !== undefined) {
            settings.unmintFeePer = unmintFeePer;
        }
    }

    await ctx.proTokenSettings.connect(ctx.accounts.admin).setYAsset(tokenAddr, settings);

    return { token, tokenAddr, handler, handlerAddr };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Multi-yAsset Scenarios", function () {
    // =======================================================================
    // 6-decimal stable (USDC-like)
    // =======================================================================
    describe("6-decimal yAsset (USDC-like)", function () {
        async function setup6Dec() {
            const ctx = await fullProtocolFixture();
            const usdc = await addYAsset(ctx, "USD Coin", "USDC", 6);

            // Register USDC as an unmintable asset alongside the default 18-dec yAsset
            await ctx.proTokenSettings
                .connect(ctx.accounts.admin)
                .setUnmintYAssets([ctx.yAssetAddress, usdc.tokenAddr]);

            return { ...ctx, usdc };
        }

        it("mint expands 6-dec yAsset into 18-dec proToken (100 USDC → 100 proToken)", async function () {
            const ctx = await loadFixture(setup6Dec);

            const hundredUSDC = 100n * 10n ** 6n; // clears the 100-base deposit floor
            const expectedProToken = 100n * 10n ** 18n;

            const finalBal = await mintProTokensFor(
                ctx,
                ctx.accounts.user1,
                ctx.usdc.tokenAddr,
                ctx.usdc.token,
                hundredUSDC,
            );

            expect(finalBal).to.equal(expectedProToken);
        });

        it("mint scales linearly for 1000 USDC → 1000 proToken", async function () {
            const ctx = await loadFixture(setup6Dec);

            const thousandUSDC = 1000n * 10n ** 6n;
            const expectedProToken = 1000n * 10n ** 18n;

            const finalBal = await mintProTokensFor(
                ctx,
                ctx.accounts.user1,
                ctx.usdc.tokenAddr,
                ctx.usdc.token,
                thousandUSDC,
            );

            expect(finalBal).to.equal(expectedProToken);
        });

        it("queued unmint contracts 18-dec proToken back to 6-dec USDC (100 proToken → 100 USDC)", async function () {
            const ctx = await loadFixture(setup6Dec);

            const hundredUSDC = 100n * 10n ** 6n;
            const hundredProToken = 100n * 10n ** 18n;

            // Mint 100 USDC worth
            await mintProTokensFor(
                ctx,
                ctx.accounts.user1,
                ctx.usdc.tokenAddr,
                ctx.usdc.token,
                hundredUSDC,
            );

            // Unmint the resulting proToken (createUnmintFor drains → queued path)
            const { handlerRequestId } = await createUnmintFor(
                ctx,
                ctx.accounts.user1,
                ctx.usdc.tokenAddr,
                hundredProToken,
            );

            // Process the batch and claim
            const duration = await ctx.proTokenUnmintHandler.getUnmintBatchDuration();
            await time.increase(Number(duration) + 1);

            const batch = await ctx.proTokenUnmintHandler.getUnmintBatch(
                ctx.usdc.tokenAddr,
                1n,
            );
            await ctx.usdc.token.mint(ctx.accounts.admin.address, batch.totalAmount);
            await ctx.usdc.token
                .connect(ctx.accounts.admin)
                .approve(ctx.proTokenUnmintHandlerAddress, batch.totalAmount);
            await ctx.proTokenUnmintHandler
                .connect(ctx.accounts.admin)
                .processNextUnmintBatch(ctx.usdc.tokenAddr);

            const usdcBefore = await ctx.usdc.token.balanceOf(ctx.accounts.user1.address);
            await ctx.proTokenUnmintHandler
                .connect(ctx.accounts.user1)
                .claimUnmintRequests(ctx.usdc.tokenAddr, [handlerRequestId]);
            const usdcAfter = await ctx.usdc.token.balanceOf(ctx.accounts.user1.address);

            expect(usdcAfter - usdcBefore).to.equal(hundredUSDC);
        });

        it("instant unmint contracts 18-dec proToken back to 6-dec USDC in one tx (100 proToken → 100 USDC)", async function () {
            const ctx = await loadFixture(setup6Dec);

            const hundredUSDC = 100n * 10n ** 6n;
            const hundredProToken = 100n * 10n ** 18n;

            // Mint 100 USDC worth — the USDC stays unallocated on its yOps.
            await mintProTokensFor(
                ctx,
                ctx.accounts.user1,
                ctx.usdc.tokenAddr,
                ctx.usdc.token,
                hundredUSDC,
            );

            // Inline the unmint without draining — yOps has the USDC, instant path runs.
            await ctx.proToken
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, hundredProToken);
            const createTx = await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createUnmintRequest(ctx.usdc.tokenAddr, hundredProToken, 0n, ZERO_ADDRESS);
            const opsRequestId = ((await createTx.wait())!.logs
                .map((l) => {
                    try {
                        return ctx.proTokenOperations.interface.parseLog(l as never);
                    } catch {
                        return null;
                    }
                })
                .find((e) => e?.name === EVENTS.UnmintRequestCreated)!.args
                .requestID) as bigint;

            const proof = await signUnmintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                {
                    requestId: opsRequestId,
                    user: ctx.accounts.user1.address,
                    receiver: ZERO_ADDRESS,
                    yAsset: ctx.usdc.tokenAddr,
                    amount: hundredProToken,
                    minAmountOut: 0n,
                    proofKind: ProofKind.PROOF_OF_APPROVE,
                },
            );

            const before = await ctx.usdc.token.balanceOf(ctx.accounts.user1.address);
            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .finalizeUnmintRequest(opsRequestId, ProofKind.PROOF_OF_APPROVE, proof),
            ).to.emit(ctx.proTokenOperations, EVENTS.ProTokenUnmintInstant);
            const after = await ctx.usdc.token.balanceOf(ctx.accounts.user1.address);

            // Recipient got USDC directly in the finalize tx (decimal contraction preserved).
            expect(after - before).to.equal(hundredUSDC);

            // No batch created on the handler.
            expect(
                await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(ctx.usdc.tokenAddr),
            ).to.equal(0n);
        });

        it("mint below the 100-base deposit floor reverts BelowMinDeposit", async function () {
            const ctx = await loadFixture(setup6Dec);

            // 1 USDC → 1 proUSD, far below the 100-base deposit floor.
            const oneUSDC = 10n ** 6n;
            await ctx.usdc.token.mint(ctx.accounts.user1.address, oneUSDC);
            await ctx.usdc.token
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, oneUSDC);

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .createMintRequest(ctx.usdc.tokenAddr, oneUSDC, 0n, ZERO_ADDRESS),
            ).to.be.revertedWithCustomError(
                ctx.proTokenOperations,
                ERRORS.BelowMinDeposit,
            );
        });

        it("unmint below the 100-base withdraw floor reverts BelowMinWithdraw", async function () {
            const ctx = await loadFixture(setup6Dec);

            // Mint 100 USDC worth so the user holds proToken to attempt a redeem.
            await mintProTokensFor(
                ctx,
                ctx.accounts.user1,
                ctx.usdc.tokenAddr,
                ctx.usdc.token,
                100n * 10n ** 6n,
            );

            // 1 proToken is well below the 100-base withdraw floor.
            const belowFloor = 10n ** 18n;
            await ctx.proToken
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, belowFloor);

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .createUnmintRequest(
                        ctx.usdc.tokenAddr,
                        belowFloor,
                        0n,
                        ZERO_ADDRESS,
                    ),
            ).to.be.revertedWithCustomError(
                ctx.proTokenOperations,
                ERRORS.BelowMinWithdraw,
            );
        });

        it("unmint at the 100-base withdraw floor succeeds", async function () {
            const ctx = await loadFixture(setup6Dec);

            // Mint 100 USDC worth so the user holds exactly 100 proToken.
            await mintProTokensFor(
                ctx,
                ctx.accounts.user1,
                ctx.usdc.tokenAddr,
                ctx.usdc.token,
                100n * 10n ** 6n,
            );

            const atFloor = 100n * 10n ** 18n; // exactly the 100-base withdraw floor
            await ctx.proToken
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, atFloor);

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .createUnmintRequest(
                        ctx.usdc.tokenAddr,
                        atFloor,
                        0n,
                        ZERO_ADDRESS,
                    ),
            ).to.not.be.reverted;
        });

        it("round-trips a 6-dec asset at the configured price (queued path)", async function () {
            const ctx = await loadFixture(setup6Dec);
            const tenThousandUSDC = 10_000n * 10n ** 6n;
            await mintProTokensFor(
                ctx,
                ctx.accounts.user1,
                ctx.usdc.tokenAddr,
                ctx.usdc.token,
                tenThousandUSDC,
            );

            const proBal = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            const { handlerRequestId } = await createUnmintFor(
                ctx,
                ctx.accounts.user1,
                ctx.usdc.tokenAddr,
                proBal,
            );

            const duration = await ctx.proTokenUnmintHandler.getUnmintBatchDuration();
            await time.increase(Number(duration) + 1);

            const batch = await ctx.proTokenUnmintHandler.getUnmintBatch(
                ctx.usdc.tokenAddr,
                1n,
            );
            expect(batch.totalAmount).to.equal(tenThousandUSDC);

            await ctx.usdc.token.mint(ctx.accounts.admin.address, batch.totalAmount);
            await ctx.usdc.token
                .connect(ctx.accounts.admin)
                .approve(ctx.proTokenUnmintHandlerAddress, batch.totalAmount);
            await ctx.proTokenUnmintHandler
                .connect(ctx.accounts.admin)
                .processNextUnmintBatch(ctx.usdc.tokenAddr);

            const before = await ctx.usdc.token.balanceOf(ctx.accounts.user1.address);
            await ctx.proTokenUnmintHandler
                .connect(ctx.accounts.user1)
                .claimUnmintRequests(ctx.usdc.tokenAddr, [handlerRequestId]);
            const after = await ctx.usdc.token.balanceOf(ctx.accounts.user1.address);

            expect(after - before).to.equal(tenThousandUSDC);
        });
    });

    // =======================================================================
    // Multiple yAssets registered together
    // =======================================================================
    describe("Multiple yAssets registered together", function () {
        async function setupTwoAssets() {
            const ctx = await fullProtocolFixture();
            const usdc = await addYAsset(ctx, "USD Coin", "USDC", 6);
            await ctx.proTokenSettings
                .connect(ctx.accounts.admin)
                .setUnmintYAssets([ctx.yAssetAddress, usdc.tokenAddr]);
            return { ...ctx, usdc };
        }

        it("both yAssets are enabled and listed for unmint", async function () {
            const ctx = await loadFixture(setupTwoAssets);

            const unmintList = await ctx.proTokenSettings.getUnmintYAssets();
            expect(unmintList).to.include(ctx.yAssetAddress);
            expect(unmintList).to.include(ctx.usdc.tokenAddr);

            const both = await ctx.proTokenSettings.getYAssets([
                ctx.yAssetAddress,
                ctx.usdc.tokenAddr,
            ]);
            expect(both.yAssets[0].settings.isEnabled).to.equal(true);
            expect(both.yAssets[1].settings.isEnabled).to.equal(true);
        });

        it("minting one yAsset does not affect the other's per-asset accounting", async function () {
            const ctx = await loadFixture(setupTwoAssets);

            // user1 mints with the default 18-dec yAsset
            await mintProTokensFor(
                ctx,
                ctx.accounts.user1,
                ctx.yAssetAddress,
                ctx.yAsset,
                HUNDRED_TOKENS,
            );

            // user2 mints with USDC (6-dec)
            const hundredUSDC = 100n * 10n ** 6n;
            await mintProTokensFor(
                ctx,
                ctx.accounts.user2,
                ctx.usdc.tokenAddr,
                ctx.usdc.token,
                hundredUSDC,
            );

            // Both should have ~100 proToken
            expect(await ctx.proToken.balanceOf(ctx.accounts.user1.address)).to.equal(
                HUNDRED_TOKENS,
            );
            expect(await ctx.proToken.balanceOf(ctx.accounts.user2.address)).to.equal(
                HUNDRED_TOKENS,
            );

            // Total supply = sum of both
            expect(await ctx.proToken.totalSupply()).to.equal(HUNDRED_TOKENS * 2n);
        });

        it("queued unmint batches are independent per yAsset", async function () {
            const ctx = await loadFixture(setupTwoAssets);

            // user1 mints + unmints via 18-dec yAsset (createUnmintFor drains that yOps)
            await mintProTokensFor(
                ctx,
                ctx.accounts.user1,
                ctx.yAssetAddress,
                ctx.yAsset,
                HUNDRED_TOKENS,
            );
            const user1Bal = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            await createUnmintFor(
                ctx,
                ctx.accounts.user1,
                ctx.yAssetAddress,
                user1Bal,
            );

            // user2 mints + unmints via USDC (createUnmintFor drains the USDC yOps)
            await mintProTokensFor(
                ctx,
                ctx.accounts.user2,
                ctx.usdc.tokenAddr,
                ctx.usdc.token,
                100n * 10n ** 6n,
            );
            const user2Bal = await ctx.proToken.balanceOf(ctx.accounts.user2.address);
            await createUnmintFor(
                ctx,
                ctx.accounts.user2,
                ctx.usdc.tokenAddr,
                user2Bal,
            );

            // Each yAsset has its own batch 1
            expect(
                await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(ctx.yAssetAddress),
            ).to.equal(1n);
            expect(
                await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(ctx.usdc.tokenAddr),
            ).to.equal(1n);

            // And totals reflect the respective decimal scale.
            const yBatch = await ctx.proTokenUnmintHandler.getUnmintBatch(
                ctx.yAssetAddress,
                1n,
            );
            const usdcBatch = await ctx.proTokenUnmintHandler.getUnmintBatch(
                ctx.usdc.tokenAddr,
                1n,
            );
            expect(yBatch.totalAmount).to.equal(HUNDRED_TOKENS);
            expect(usdcBatch.totalAmount).to.equal(100n * 10n ** 6n);
        });

        it("processing one yAsset's queued batch does not impact the other", async function () {
            const ctx = await loadFixture(setupTwoAssets);

            // Mint and unmint with both (each createUnmintFor drains its yAsset's yOps)
            await mintProTokensFor(
                ctx,
                ctx.accounts.user1,
                ctx.yAssetAddress,
                ctx.yAsset,
                HUNDRED_TOKENS,
            );
            await createUnmintFor(
                ctx,
                ctx.accounts.user1,
                ctx.yAssetAddress,
                await ctx.proToken.balanceOf(ctx.accounts.user1.address),
            );

            await mintProTokensFor(
                ctx,
                ctx.accounts.user2,
                ctx.usdc.tokenAddr,
                ctx.usdc.token,
                100n * 10n ** 6n,
            );
            await createUnmintFor(
                ctx,
                ctx.accounts.user2,
                ctx.usdc.tokenAddr,
                await ctx.proToken.balanceOf(ctx.accounts.user2.address),
            );

            const duration = await ctx.proTokenUnmintHandler.getUnmintBatchDuration();
            await time.increase(Number(duration) + 1);

            // Process only the 18-dec yAsset batch
            const yBatch = await ctx.proTokenUnmintHandler.getUnmintBatch(
                ctx.yAssetAddress,
                1n,
            );
            await ctx.yAsset.mint(ctx.accounts.admin.address, yBatch.totalAmount);
            await ctx.yAsset
                .connect(ctx.accounts.admin)
                .approve(ctx.proTokenUnmintHandlerAddress, yBatch.totalAmount);
            await ctx.proTokenUnmintHandler
                .connect(ctx.accounts.admin)
                .processNextUnmintBatch(ctx.yAssetAddress);

            // 18-dec batch is processed
            expect(
                await ctx.proTokenUnmintHandler.getLastProcessedBatchId(ctx.yAssetAddress),
            ).to.equal(1n);
            // USDC batch is NOT processed
            expect(
                await ctx.proTokenUnmintHandler.getLastProcessedBatchId(ctx.usdc.tokenAddr),
            ).to.equal(0n);
        });

        it("instant unmint on one yAsset does not create a batch on the other", async function () {
            const ctx = await loadFixture(setupTwoAssets);

            // user1 mints via 18-dec yAsset → its yOps holds the yAsset.
            await mintProTokensFor(
                ctx,
                ctx.accounts.user1,
                ctx.yAssetAddress,
                ctx.yAsset,
                HUNDRED_TOKENS,
            );

            // user1 unmints via 18-dec yAsset inline (no drain → instant).
            const user1Bal = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            await ctx.proToken
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, user1Bal);
            const createTx = await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createUnmintRequest(ctx.yAssetAddress, user1Bal, 0n, ZERO_ADDRESS);
            const opsRequestId = ((await createTx.wait())!.logs
                .map((l) => {
                    try {
                        return ctx.proTokenOperations.interface.parseLog(l as never);
                    } catch {
                        return null;
                    }
                })
                .find((e) => e?.name === EVENTS.UnmintRequestCreated)!.args
                .requestID) as bigint;
            const proof = await signUnmintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                {
                    requestId: opsRequestId,
                    user: ctx.accounts.user1.address,
                    receiver: ZERO_ADDRESS,
                    yAsset: ctx.yAssetAddress,
                    amount: user1Bal,
                    minAmountOut: 0n,
                    proofKind: ProofKind.PROOF_OF_APPROVE,
                },
            );
            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .finalizeUnmintRequest(opsRequestId, ProofKind.PROOF_OF_APPROVE, proof);

            // Neither yAsset has a batch — 18-dec went instant; USDC saw no activity.
            expect(
                await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(ctx.yAssetAddress),
            ).to.equal(0n);
            expect(
                await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(ctx.usdc.tokenAddr),
            ).to.equal(0n);
        });
    });
});