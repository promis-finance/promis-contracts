import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import {
    ZERO_ADDRESS,
    HUNDRED_TOKENS,
    VERSION_1_0_0,
    ONE_DAY,
    ONE_HOUR,
    ERRORS,
    EVENTS,
    DECIMALS_18,
} from "../helpers/constants";
import { fullProtocolFixture, FullProtocolFixture } from "../helpers/fixtures";
import {
    deployProTokenSettings,
    deployMintableERC20,
    getTestAccounts,
} from "../helpers/deploy";
import {
    signMintProof,
    signUnmintProof,
    ProofKind,
    ProofData,
} from "../helpers/proofs";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// ---------------------------------------------------------------------------
// ProTokenUnmintHandler — unit tests
//
// Requests reach this handler via TWO entry points in ProTokenOperations, both
// of which branch on yOps.previewPayOut(yAssetAmount):
//   • USER path:       finalizeUnmintRequest(APPROVE) → _executeUnmint
//                      (proof-verified; minWithdrawBase floor applies)
//   • STRATEGIST path: strategicUnmint
//                      (no proof; no floor; only StrategyVault may invoke)
// When previewPayOut returns false (insufficient liquidity for an instant
// payout), the branch creates a request here via createUnmintRequest(); when
// it returns true the path pays out directly through YAssetOperationsHandler
// and never touches this contract. Tests in this file cover the USER path only;
// strategist-side branching lives next to the StrategyVault tests.
//
// BRANCHING NOTE (fixture):
// With the default fixture there are no yield protocol handlers configured, so
// all yAsset transferred in via distributeYAsset stays unallocated on
// YAssetOperationsHandler. previewPayOut therefore returns true and every
// unmint would route to the INSTANT path — bypassing this handler entirely.
// To exercise the handler, tests below first DRAIN the unallocated balance
// from YAssetOperationsHandler so the queued path runs.
//
// Flow for one user redeeming yAsset (queued path, which this contract handles):
//   1. mint proTokens (createMintRequest + finalize APPROVE) — yAsset lands on yOps
//   2. drain yOps so the next unmint cannot be paid instantly
//   3. create unmint request (createUnmintRequest + finalize APPROVE) — queues here
//   4. fast-forward past unmintBatchDuration
//   5. processNextUnmintBatch (admin/operator/externalBusiness pulls yAsset in)
//   6. claimUnmintRequests (user receives their share)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers used across multiple describe blocks
// ---------------------------------------------------------------------------

/**
 * Mint proTokens to a user via the async flow. Returns the resulting proToken balance.
 * Requires accounts.authority to already be set as an authorized signer.
 */
async function mintProTokensFor(
    ctx: FullProtocolFixture,
    user: HardhatEthersSigner,
    yAssetAmount: bigint,
): Promise<bigint> {
    await ctx.yAsset.mint(user.address, yAssetAmount);
    await ctx.yAsset
        .connect(user)
        .approve(ctx.proTokenOperationsAddress, yAssetAmount);

    const tx = await ctx.proTokenOperations
        .connect(user)
        .createMintRequest(ctx.yAssetAddress, yAssetAmount, 0n, ZERO_ADDRESS);
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
    const id = event!.args.requestID as bigint;

    const proofData: ProofData = {
        requestId: id,
        user: user.address,
        receiver: ZERO_ADDRESS,
        yAsset: ctx.yAssetAddress,
        amount: yAssetAmount,
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
        .finalizeMintRequest(id, ProofKind.PROOF_OF_APPROVE, proof);

    return ctx.proToken.balanceOf(user.address);
}

/**
 * Force the queued unmint path by draining all unallocated yAsset from
 * YAssetOperationsHandler. With no yield protocol handlers configured (default
 * fixture), this empties the source of liquidity previewPayOut() reads from,
 * so the next unmint cannot be paid instantly and falls through to this handler.
 *
 * No-op when there's nothing to drain.
 */
async function drainYAssetOps(ctx: FullProtocolFixture) {
    const balance = await ctx.yAsset.balanceOf(ctx.yAssetOperationsHandlerAddress);
    if (balance === 0n) return;
    await ctx.yAssetOperationsHandler
        .connect(ctx.accounts.admin)
        .withdrawalYieldAssets(ZERO_ADDRESS, balance);
}

/**
 * Take a proToken-holding user through the async unmint flow up to (and including)
 * the handler's createUnmintRequest call. Returns the request id assigned by the
 * handler for that receiver in the current batch.
 *
 * Drains yOps liquidity first to guarantee the queued path runs — this helper
 * exists for tests that operate on handler-side state and need the request to
 * actually land here. For instant-path coverage see the "Branch routing" block.
 */
async function createUnmintFor(
    ctx: FullProtocolFixture,
    user: HardhatEthersSigner,
    proTokenAmount: bigint,
): Promise<bigint> {
    await drainYAssetOps(ctx);

    await ctx.proToken
        .connect(user)
        .approve(ctx.proTokenOperationsAddress, proTokenAmount);

    const tx = await ctx.proTokenOperations
        .connect(user)
        .createUnmintRequest(ctx.yAssetAddress, proTokenAmount, 0n, ZERO_ADDRESS);
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
        yAsset: ctx.yAssetAddress,
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

    // Resolve the handler-side request id from the receiver+batch mapping.
    const currentBatchId = await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(
        ctx.yAssetAddress,
    );
    return ctx.proTokenUnmintHandler.getUnmintRequestIdForReceiverInBatch(
        ctx.yAssetAddress,
        currentBatchId,
        user.address,
    );
}

/**
 * Have a privileged caller process the next pending batch for `yAsset`.
 * Mints the required yAsset balance to the caller, approves the handler, then processes.
 */
async function processNextBatchAs(
    ctx: FullProtocolFixture,
    caller: HardhatEthersSigner,
) {
    const nextBatchId =
        (await ctx.proTokenUnmintHandler.getLastProcessedBatchId(ctx.yAssetAddress)) + 1n;
    const batch = await ctx.proTokenUnmintHandler.getUnmintBatch(
        ctx.yAssetAddress,
        nextBatchId,
    );

    await ctx.yAsset.mint(caller.address, batch.totalAmount);
    await ctx.yAsset
        .connect(caller)
        .approve(ctx.proTokenUnmintHandlerAddress, batch.totalAmount);

    await ctx.proTokenUnmintHandler
        .connect(caller)
        .processNextUnmintBatch(ctx.yAssetAddress);
}

/**
 * Wire authorization for the backend signer. Fixture doesn't do this.
 */
async function authorizeBackend(ctx: FullProtocolFixture) {
    await ctx.proTokenSettings
        .connect(ctx.accounts.admin)
        .setAuthority(ctx.accounts.authority.address, true);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProTokenUnmintHandler", function () {
    // =======================================================================
    // Constants
    // =======================================================================
    describe("Constants", function () {
        it("VERSION = 1_00_00", async function () {
            const { proTokenUnmintHandler } = await loadFixture(fullProtocolFixture);
            expect(await proTokenUnmintHandler.VERSION()).to.equal(VERSION_1_0_0);
        });

        it("MAX_BATCH_SIZE = 10", async function () {
            const { proTokenUnmintHandler } = await loadFixture(fullProtocolFixture);
            expect(await proTokenUnmintHandler.MAX_BATCH_SIZE()).to.equal(10n);
        });
    });

    // =======================================================================
    // initialize
    // =======================================================================
    describe("initialize()", function () {
        it("sets proTokenSettings and unmintBatchDuration", async function () {
            const { proTokenUnmintHandler, proTokenSettingsAddress } =
                await loadFixture(fullProtocolFixture);

            expect(await proTokenUnmintHandler.getProTokenSettings()).to.equal(
                proTokenSettingsAddress,
            );
            expect(await proTokenUnmintHandler.getUnmintBatchDuration()).to.be.gt(0n);
        });

        it("reverts on zero proTokenSettings address", async function () {
            const Factory = await ethers.getContractFactory("ProTokenUnmintHandler");
            await expect(
                upgrades.deployProxy(Factory, [ZERO_ADDRESS, ONE_DAY], { kind: "uups" })
            ).to.be.revertedWithCustomError(Factory, ERRORS.ZeroAddress);
        });

        it("reverts on zero unmintBatchDuration", async function () {
            const accounts = await getTestAccounts();
            const settings = await deployProTokenSettings(accounts.admin, accounts.operator);
            const Factory = await ethers.getContractFactory("ProTokenUnmintHandler");

            await expect(
                upgrades.deployProxy(
                    Factory,
                    [await settings.getAddress(), 0n],
                    { kind: "uups" },
                ),
            ).to.be.revertedWithCustomError(Factory, ERRORS.InvalidDuration);
        });

        it("reverts on re-initialization", async function () {
            const { proTokenUnmintHandler, proTokenSettingsAddress } =
                await loadFixture(fullProtocolFixture);
            await expect(
                proTokenUnmintHandler.initialize(proTokenSettingsAddress, ONE_DAY),
            ).to.be.revertedWithCustomError(
                proTokenUnmintHandler,
                ERRORS.InvalidInitialization,
            );
        });

        it("implementation contract has initializers disabled", async function () {
            const { proTokenUnmintHandler } = await loadFixture(fullProtocolFixture);
            const implAddress = await upgrades.erc1967.getImplementationAddress(
                await proTokenUnmintHandler.getAddress(),
            );
            const impl = await ethers.getContractAt("ProTokenUnmintHandler", implAddress);
            await expect(
                impl.initialize(ZERO_ADDRESS, ONE_DAY),
            ).to.be.revertedWithCustomError(impl, ERRORS.InvalidInitialization);
        });
    });

    // =======================================================================
    // Branch routing (instant vs queued) — exercises ProTokenOperations'
    // path selection. Included here because the queued path is what creates
    // requests in this handler, so verifying the branching is part of the
    // handler's surface contract.
    // =======================================================================
    describe("Branch routing (instant vs queued)", function () {
        it("instant path: emits ProTokenUnmintInstant and does NOT create a batch", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await authorizeBackend(ctx);

            await mintProTokensFor(ctx, ctx.accounts.user1, HUNDRED_TOKENS);
            const bal = await ctx.proToken.balanceOf(ctx.accounts.user1.address);

            // NO drain — yOps holds the minted yAsset as unallocated, so
            // previewPayOut returns true and the unmint goes instant.

            await ctx.proToken
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, bal);

            const createTx = await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createUnmintRequest(ctx.yAssetAddress, bal, 0n, ZERO_ADDRESS);
            const createReceipt = await createTx.wait();
            const opsRequestId = (createReceipt!.logs
                .map((l) => {
                    try {
                        return ctx.proTokenOperations.interface.parseLog(l as never);
                    } catch {
                        return null;
                    }
                })
                .find((e) => e?.name === EVENTS.UnmintRequestCreated)!.args
                .requestID) as bigint;

            const proofData: ProofData = {
                requestId: opsRequestId,
                user: ctx.accounts.user1.address,
                receiver: ZERO_ADDRESS,
                yAsset: ctx.yAssetAddress,
                amount: bal,
                minAmountOut: 0n,
                proofKind: ProofKind.PROOF_OF_APPROVE,
            };
            const proof = await signUnmintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                proofData,
            );

            // Expect the instant event on ProTokenOperations
            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .finalizeUnmintRequest(opsRequestId, ProofKind.PROOF_OF_APPROVE, proof),
            ).to.emit(ctx.proTokenOperations, EVENTS.ProTokenUnmintInstant);

            // No batch should have been created on the handler.
            expect(
                await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(ctx.yAssetAddress),
            ).to.equal(0n);
            expect(
                await ctx.proTokenUnmintHandler.getNextUnmintRequestId(ctx.yAssetAddress),
            ).to.equal(0n);

            // User received the yAsset directly.
            expect(
                await ctx.yAsset.balanceOf(ctx.accounts.user1.address),
            ).to.be.gt(0n);
        });

        it("queued path: emits ProTokenUnmintQueued and creates batch 1 on the handler", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await authorizeBackend(ctx);

            await mintProTokensFor(ctx, ctx.accounts.user1, HUNDRED_TOKENS);
            const bal = await ctx.proToken.balanceOf(ctx.accounts.user1.address);

            // Drain to force the queued path.
            await drainYAssetOps(ctx);

            await ctx.proToken
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, bal);

            const createTx = await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createUnmintRequest(ctx.yAssetAddress, bal, 0n, ZERO_ADDRESS);
            const createReceipt = await createTx.wait();
            const opsRequestId = (createReceipt!.logs
                .map((l) => {
                    try {
                        return ctx.proTokenOperations.interface.parseLog(l as never);
                    } catch {
                        return null;
                    }
                })
                .find((e) => e?.name === EVENTS.UnmintRequestCreated)!.args
                .requestID) as bigint;

            const proofData: ProofData = {
                requestId: opsRequestId,
                user: ctx.accounts.user1.address,
                receiver: ZERO_ADDRESS,
                yAsset: ctx.yAssetAddress,
                amount: bal,
                minAmountOut: 0n,
                proofKind: ProofKind.PROOF_OF_APPROVE,
            };
            const proof = await signUnmintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                proofData,
            );

            // Expect the queued event on ProTokenOperations, plus the handler's
            // UnmintRequestCreated event (which fires inside the same tx).
            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .finalizeUnmintRequest(opsRequestId, ProofKind.PROOF_OF_APPROVE, proof),
            )
                .to.emit(ctx.proTokenOperations, EVENTS.ProTokenUnmintQueued)
                .and.to.emit(ctx.proTokenUnmintHandler, EVENTS.UnmintRequestCreated);

            // A batch must now exist.
            expect(
                await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(ctx.yAssetAddress),
            ).to.equal(1n);

            const batch = await ctx.proTokenUnmintHandler.getUnmintBatch(
                ctx.yAssetAddress,
                1n,
            );
            expect(batch.totalAmount).to.be.gt(0n);
            expect(batch.processed).to.equal(false);

            // User did NOT receive yAsset yet — it's queued.
            expect(
                await ctx.yAsset.balanceOf(ctx.accounts.user1.address),
            ).to.equal(0n);
        });

        it("mixed: instant first, then queued only after drain", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await authorizeBackend(ctx);

            // user1 mints and unmints — instant (no drain yet).
            await mintProTokensFor(ctx, ctx.accounts.user1, HUNDRED_TOKENS);
            const bal1 = await ctx.proToken.balanceOf(ctx.accounts.user1.address);

            await ctx.proToken
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, bal1);
            const createTx1 = await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createUnmintRequest(ctx.yAssetAddress, bal1, 0n, ZERO_ADDRESS);
            const opsRequestId1 = ((await createTx1.wait())!.logs
                .map((l) => {
                    try {
                        return ctx.proTokenOperations.interface.parseLog(l as never);
                    } catch {
                        return null;
                    }
                })
                .find((e) => e?.name === EVENTS.UnmintRequestCreated)!.args
                .requestID) as bigint;
            const proof1 = await signUnmintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                {
                    requestId: opsRequestId1,
                    user: ctx.accounts.user1.address,
                    receiver: ZERO_ADDRESS,
                    yAsset: ctx.yAssetAddress,
                    amount: bal1,
                    minAmountOut: 0n,
                    proofKind: ProofKind.PROOF_OF_APPROVE,
                },
            );
            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .finalizeUnmintRequest(opsRequestId1, ProofKind.PROOF_OF_APPROVE, proof1);

            // No batch yet — user1 went instant.
            expect(
                await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(ctx.yAssetAddress),
            ).to.equal(0n);

            // user2 mints, but BEFORE the unmint we drain — forces queued.
            await mintProTokensFor(ctx, ctx.accounts.user2, HUNDRED_TOKENS);
            await drainYAssetOps(ctx);
            const bal2 = await ctx.proToken.balanceOf(ctx.accounts.user2.address);

            await ctx.proToken
                .connect(ctx.accounts.user2)
                .approve(ctx.proTokenOperationsAddress, bal2);
            const createTx2 = await ctx.proTokenOperations
                .connect(ctx.accounts.user2)
                .createUnmintRequest(ctx.yAssetAddress, bal2, 0n, ZERO_ADDRESS);
            const opsRequestId2 = ((await createTx2.wait())!.logs
                .map((l) => {
                    try {
                        return ctx.proTokenOperations.interface.parseLog(l as never);
                    } catch {
                        return null;
                    }
                })
                .find((e) => e?.name === EVENTS.UnmintRequestCreated)!.args
                .requestID) as bigint;
            const proof2 = await signUnmintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                {
                    requestId: opsRequestId2,
                    user: ctx.accounts.user2.address,
                    receiver: ZERO_ADDRESS,
                    yAsset: ctx.yAssetAddress,
                    amount: bal2,
                    minAmountOut: 0n,
                    proofKind: ProofKind.PROOF_OF_APPROVE,
                },
            );
            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user2)
                    .finalizeUnmintRequest(opsRequestId2, ProofKind.PROOF_OF_APPROVE, proof2),
            ).to.emit(ctx.proTokenOperations, EVENTS.ProTokenUnmintQueued);

            // First batch created only after user2's queued unmint.
            expect(
                await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(ctx.yAssetAddress),
            ).to.equal(1n);
        });

        it("queued event's handlerRequestId matches getUnmintRequestIdForReceiverInBatch", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await authorizeBackend(ctx);

            await mintProTokensFor(ctx, ctx.accounts.user1, HUNDRED_TOKENS);
            const bal = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            await drainYAssetOps(ctx);

            await ctx.proToken
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, bal);
            const createTx = await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createUnmintRequest(ctx.yAssetAddress, bal, 0n, ZERO_ADDRESS);
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
                    amount: bal,
                    minAmountOut: 0n,
                    proofKind: ProofKind.PROOF_OF_APPROVE,
                },
            );

            const finalizeTx = await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .finalizeUnmintRequest(opsRequestId, ProofKind.PROOF_OF_APPROVE, proof);
            const finalizeReceipt = await finalizeTx.wait();

            const queuedEvent = finalizeReceipt!.logs
                .map((l) => {
                    try {
                        return ctx.proTokenOperations.interface.parseLog(l as never);
                    } catch {
                        return null;
                    }
                })
                .find((e) => e?.name === EVENTS.ProTokenUnmintQueued);
            expect(queuedEvent).to.not.be.undefined;

            const emittedHandlerRequestId =
                queuedEvent!.args.handlerRequestId as bigint;

            const viewHandlerRequestId =
                await ctx.proTokenUnmintHandler.getUnmintRequestIdForReceiverInBatch(
                    ctx.yAssetAddress,
                    1n,
                    ctx.accounts.user1.address,
                );

            expect(emittedHandlerRequestId).to.equal(viewHandlerRequestId);
        });
    });

    // =======================================================================
    // createUnmintRequest (called via ProTokenOperations) — queued path only
    // (the only path that reaches this handler).
    // =======================================================================
    describe("createUnmintRequest()", function () {
        it("creates a new batch on the first request", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await authorizeBackend(ctx);

            await mintProTokensFor(ctx, ctx.accounts.user1, HUNDRED_TOKENS);
            const proBal = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            await createUnmintFor(ctx, ctx.accounts.user1, proBal);

            const batchId = await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(
                ctx.yAssetAddress,
            );
            expect(batchId).to.equal(1n);

            const batch = await ctx.proTokenUnmintHandler.getUnmintBatch(
                ctx.yAssetAddress,
                batchId,
            );
            expect(batch.batchId).to.equal(1n);
            expect(batch.yAsset).to.equal(ctx.yAssetAddress);
            expect(batch.totalAmount).to.be.gt(0n);
            expect(batch.processed).to.equal(false);
        });

        it("aggregates a second request from the same receiver into the same batch", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await authorizeBackend(ctx);

            // Mint enough to make two separate unmints
            await mintProTokensFor(ctx, ctx.accounts.user1, HUNDRED_TOKENS * 2n);
            const total = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            const half = total / 2n;

            const id1 = await createUnmintFor(ctx, ctx.accounts.user1, half);
            const id2 = await createUnmintFor(ctx, ctx.accounts.user1, half);

            // Same request id (aggregation), not a new request.
            expect(id1).to.equal(id2);

            const req = await ctx.proTokenUnmintHandler.getUnmintRequest(
                ctx.yAssetAddress,
                id1,
            );
            expect(req.amounts.length).to.equal(2);
            // totalAmount should sum the two underlying yAsset legs.
            expect(req.totalAmount).to.be.gt(0n);
        });

        it("assigns distinct request ids to different receivers in the same batch", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await authorizeBackend(ctx);

            await mintProTokensFor(ctx, ctx.accounts.user1, HUNDRED_TOKENS);
            await mintProTokensFor(ctx, ctx.accounts.user2, HUNDRED_TOKENS);

            const bal1 = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            const bal2 = await ctx.proToken.balanceOf(ctx.accounts.user2.address);

            const id1 = await createUnmintFor(ctx, ctx.accounts.user1, bal1);
            const id2 = await createUnmintFor(ctx, ctx.accounts.user2, bal2);

            expect(id1).to.not.equal(id2);

            // Both should be in batch 1.
            const batchId = await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(
                ctx.yAssetAddress,
            );
            expect(batchId).to.equal(1n);
        });

        it("creates a new batch after the previous batch's duration elapses", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await authorizeBackend(ctx);

            await mintProTokensFor(ctx, ctx.accounts.user1, HUNDRED_TOKENS * 2n);
            const total = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            const half = total / 2n;

            await createUnmintFor(ctx, ctx.accounts.user1, half);
            expect(
                await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(ctx.yAssetAddress),
            ).to.equal(1n);

            // Advance past batch duration
            const duration = await ctx.proTokenUnmintHandler.getUnmintBatchDuration();
            await time.increase(Number(duration) + 1);

            await createUnmintFor(ctx, ctx.accounts.user1, half);

            // New batch should have been created
            expect(
                await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(ctx.yAssetAddress),
            ).to.equal(2n);
        });

        it("emits UnmintRequestCreated on the handler for the first request", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await authorizeBackend(ctx);

            await mintProTokensFor(ctx, ctx.accounts.user1, HUNDRED_TOKENS);
            const bal = await ctx.proToken.balanceOf(ctx.accounts.user1.address);

            // Force queued path so the handler emits.
            await drainYAssetOps(ctx);

            await ctx.proToken
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, bal);

            // Create the Operations-side request first
            const createTx = await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createUnmintRequest(ctx.yAssetAddress, bal, 0n, ZERO_ADDRESS);
            const createReceipt = await createTx.wait();
            const createEvent = createReceipt!.logs
                .map((l) => {
                    try {
                        return ctx.proTokenOperations.interface.parseLog(l as never);
                    } catch {
                        return null;
                    }
                })
                .find((e) => e?.name === EVENTS.UnmintRequestCreated);
            const opsRequestId = createEvent!.args.requestID as bigint;

            // Now finalize APPROVE — this is what calls handler.createUnmintRequest
            const proofData: ProofData = {
                requestId: opsRequestId,
                user: ctx.accounts.user1.address,
                receiver: ZERO_ADDRESS,
                yAsset: ctx.yAssetAddress,
                amount: bal,
                minAmountOut: 0n,
                proofKind: ProofKind.PROOF_OF_APPROVE,
            };
            const proof = await signUnmintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                proofData,
            );

            // The handler's UnmintRequestCreated event fires inside this transaction.
            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .finalizeUnmintRequest(opsRequestId, ProofKind.PROOF_OF_APPROVE, proof),
            ).to.emit(ctx.proTokenUnmintHandler, EVENTS.UnmintRequestCreated);
        });

        it("emits UnmintRequestAggregated when same receiver redeems again in same batch", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await authorizeBackend(ctx);

            await mintProTokensFor(ctx, ctx.accounts.user1, HUNDRED_TOKENS * 2n);
            const total = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            const half = total / 2n;

            // First request — creates the batch and the first handler request.
            // createUnmintFor drains for us.
            await createUnmintFor(ctx, ctx.accounts.user1, half);

            // Second request — aggregated into the same handler request.
            // Drain again because the first finalize might have emptied yOps;
            // any new minted yAsset between calls would re-enable the instant path.
            await drainYAssetOps(ctx);

            await ctx.proToken
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, half);
            const tx = await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createUnmintRequest(ctx.yAssetAddress, half, 0n, ZERO_ADDRESS);
            const receipt = await tx.wait();
            const createEvent = receipt!.logs
                .map((l) => {
                    try {
                        return ctx.proTokenOperations.interface.parseLog(l as never);
                    } catch {
                        return null;
                    }
                })
                .find((e) => e?.name === EVENTS.UnmintRequestCreated);
            const opsRequestId = createEvent!.args.requestID as bigint;

            const proofData: ProofData = {
                requestId: opsRequestId,
                user: ctx.accounts.user1.address,
                receiver: ZERO_ADDRESS,
                yAsset: ctx.yAssetAddress,
                amount: half,
                minAmountOut: 0n,
                proofKind: ProofKind.PROOF_OF_APPROVE,
            };
            const proof = await signUnmintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                proofData,
            );

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .finalizeUnmintRequest(opsRequestId, ProofKind.PROOF_OF_APPROVE, proof),
            ).to.emit(ctx.proTokenUnmintHandler, EVENTS.UnmintRequestAggregated);
        });

        it("reverts when called directly by a non-Operations caller", async function () {
            const { proTokenUnmintHandler, yAssetAddress, accounts } =
                await loadFixture(fullProtocolFixture);
            await expect(
                proTokenUnmintHandler
                    .connect(accounts.user1)
                    .createUnmintRequest(accounts.user1.address, yAssetAddress, HUNDRED_TOKENS),
            ).to.be.revertedWithCustomError(proTokenUnmintHandler, ERRORS.NotOperations);
        });
    });

    // =======================================================================
    // processNextUnmintBatch
    // =======================================================================
    describe("processNextUnmintBatch()", function () {
        async function setupPendingBatch() {
            const ctx = await fullProtocolFixture();
            await authorizeBackend(ctx);
            await mintProTokensFor(ctx, ctx.accounts.user1, HUNDRED_TOKENS);
            const bal = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            await createUnmintFor(ctx, ctx.accounts.user1, bal);
            return ctx;
        }

        it("admin can process a batch once duration has elapsed", async function () {
            const ctx = await loadFixture(setupPendingBatch);
            const duration = await ctx.proTokenUnmintHandler.getUnmintBatchDuration();
            await time.increase(Number(duration) + 1);

            const batchBefore = await ctx.proTokenUnmintHandler.getUnmintBatch(
                ctx.yAssetAddress,
                1n,
            );
            const handlerBalBefore = await ctx.yAsset.balanceOf(
                ctx.proTokenUnmintHandlerAddress,
            );

            await ctx.yAsset.mint(ctx.accounts.admin.address, batchBefore.totalAmount);
            await ctx.yAsset
                .connect(ctx.accounts.admin)
                .approve(ctx.proTokenUnmintHandlerAddress, batchBefore.totalAmount);

            await expect(
                ctx.proTokenUnmintHandler
                    .connect(ctx.accounts.admin)
                    .processNextUnmintBatch(ctx.yAssetAddress),
            ).to.emit(ctx.proTokenUnmintHandler, EVENTS.UnmintBatchProcessed);

            const batchAfter = await ctx.proTokenUnmintHandler.getUnmintBatch(
                ctx.yAssetAddress,
                1n,
            );
            expect(batchAfter.processed).to.equal(true);
            expect(batchAfter.processTimestamp).to.be.gt(0n);

            // yAsset moved into the handler
            const handlerBalAfter = await ctx.yAsset.balanceOf(
                ctx.proTokenUnmintHandlerAddress,
            );
            expect(handlerBalAfter - handlerBalBefore).to.equal(batchBefore.totalAmount);

            // lastUnmintBatchIdProcessed incremented
            expect(
                await ctx.proTokenUnmintHandler.getLastProcessedBatchId(ctx.yAssetAddress),
            ).to.equal(1n);
        });

        it("operator can process a batch", async function () {
            const ctx = await loadFixture(setupPendingBatch);
            const duration = await ctx.proTokenUnmintHandler.getUnmintBatchDuration();
            await time.increase(Number(duration) + 1);

            const batch = await ctx.proTokenUnmintHandler.getUnmintBatch(ctx.yAssetAddress, 1n);
            await ctx.yAsset.mint(ctx.accounts.operator.address, batch.totalAmount);
            await ctx.yAsset
                .connect(ctx.accounts.operator)
                .approve(ctx.proTokenUnmintHandlerAddress, batch.totalAmount);

            await expect(
                ctx.proTokenUnmintHandler
                    .connect(ctx.accounts.operator)
                    .processNextUnmintBatch(ctx.yAssetAddress),
            ).to.not.be.reverted;
        });

        it("externalBusiness can process a batch (after being set)", async function () {
            const ctx = await loadFixture(setupPendingBatch);

            // Set the externalBusiness role on Settings
            await ctx.proTokenSettings
                .connect(ctx.accounts.admin)
                .setExternalBusiness(ctx.accounts.externalBusiness.address);

            const duration = await ctx.proTokenUnmintHandler.getUnmintBatchDuration();
            await time.increase(Number(duration) + 1);

            const batch = await ctx.proTokenUnmintHandler.getUnmintBatch(ctx.yAssetAddress, 1n);
            await ctx.yAsset.mint(
                ctx.accounts.externalBusiness.address,
                batch.totalAmount,
            );
            await ctx.yAsset
                .connect(ctx.accounts.externalBusiness)
                .approve(ctx.proTokenUnmintHandlerAddress, batch.totalAmount);

            await expect(
                ctx.proTokenUnmintHandler
                    .connect(ctx.accounts.externalBusiness)
                    .processNextUnmintBatch(ctx.yAssetAddress),
            ).to.not.be.reverted;
        });

        it("reverts Unauthorized when called by a random account", async function () {
            const ctx = await loadFixture(setupPendingBatch);
            await expect(
                ctx.proTokenUnmintHandler
                    .connect(ctx.accounts.attacker)
                    .processNextUnmintBatch(ctx.yAssetAddress),
            ).to.be.revertedWithCustomError(
                ctx.proTokenUnmintHandler,
                ERRORS.Unauthorized,
            );
        });

        it("reverts ZeroAddress on zero yAsset", async function () {
            const { proTokenUnmintHandler, accounts } =
                await loadFixture(fullProtocolFixture);
            await expect(
                proTokenUnmintHandler
                    .connect(accounts.admin)
                    .processNextUnmintBatch(ZERO_ADDRESS),
            ).to.be.revertedWithCustomError(
                proTokenUnmintHandler,
                ERRORS.ZeroAddress,
            );
        });

        it("reverts InvalidInput when no batch exists yet", async function () {
            const { proTokenUnmintHandler, yAssetAddress, accounts } =
                await loadFixture(fullProtocolFixture);
            await expect(
                proTokenUnmintHandler
                    .connect(accounts.admin)
                    .processNextUnmintBatch(yAssetAddress),
            ).to.be.revertedWithCustomError(
                proTokenUnmintHandler,
                ERRORS.InvalidInput,
            );
        });

        it("reverts BatchStillProcessing before duration elapses", async function () {
            const ctx = await loadFixture(setupPendingBatch);
            await expect(
                ctx.proTokenUnmintHandler
                    .connect(ctx.accounts.admin)
                    .processNextUnmintBatch(ctx.yAssetAddress),
            ).to.be.revertedWithCustomError(
                ctx.proTokenUnmintHandler,
                ERRORS.BatchStillProcessing,
            );
        });

        it("reverts when protocol is globally paused", async function () {
            const ctx = await loadFixture(setupPendingBatch);
            const duration = await ctx.proTokenUnmintHandler.getUnmintBatchDuration();
            await time.increase(Number(duration) + 1);

            await ctx.proTokenSettings.connect(ctx.accounts.admin).pause();

            await expect(
                ctx.proTokenUnmintHandler
                    .connect(ctx.accounts.admin)
                    .processNextUnmintBatch(ctx.yAssetAddress),
            ).to.be.revertedWithCustomError(ctx.proTokenUnmintHandler, ERRORS.Paused);
        });
    });

    // =======================================================================
    // claimUnmintRequests
    // =======================================================================
    describe("claimUnmintRequests()", function () {
        async function setupClaimableRequest() {
            const ctx = await fullProtocolFixture();
            await authorizeBackend(ctx);

            await mintProTokensFor(ctx, ctx.accounts.user1, HUNDRED_TOKENS);
            const bal = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            const requestId = await createUnmintFor(ctx, ctx.accounts.user1, bal);

            const duration = await ctx.proTokenUnmintHandler.getUnmintBatchDuration();
            await time.increase(Number(duration) + 1);

            await processNextBatchAs(ctx, ctx.accounts.admin);

            return { ...ctx, requestId };
        }

        it("transfers yAsset to the receiver", async function () {
            const ctx = await loadFixture(setupClaimableRequest);

            const before = await ctx.yAsset.balanceOf(ctx.accounts.user1.address);
            await ctx.proTokenUnmintHandler
                .connect(ctx.accounts.user1)
                .claimUnmintRequests(ctx.yAssetAddress, [ctx.requestId]);
            const after = await ctx.yAsset.balanceOf(ctx.accounts.user1.address);

            expect(after).to.be.gt(before);
        });

        it("emits UnmintRequestClaimed", async function () {
            const ctx = await loadFixture(setupClaimableRequest);
            await expect(
                ctx.proTokenUnmintHandler
                    .connect(ctx.accounts.user1)
                    .claimUnmintRequests(ctx.yAssetAddress, [ctx.requestId]),
            ).to.emit(ctx.proTokenUnmintHandler, EVENTS.UnmintRequestClaimed);
        });

        it("marks the request as claimed and removes from receiver's unclaimed list", async function () {
            const ctx = await loadFixture(setupClaimableRequest);

            const beforeIsClaimed = await ctx.proTokenUnmintHandler.isUnmintRequestClaimed(
                ctx.yAssetAddress,
                ctx.requestId,
            );
            expect(beforeIsClaimed).to.equal(false);

            await ctx.proTokenUnmintHandler
                .connect(ctx.accounts.user1)
                .claimUnmintRequests(ctx.yAssetAddress, [ctx.requestId]);

            expect(
                await ctx.proTokenUnmintHandler.isUnmintRequestClaimed(
                    ctx.yAssetAddress,
                    ctx.requestId,
                ),
            ).to.equal(true);

            const unclaimedBatches =
                await ctx.proTokenUnmintHandler.getUnclaimedBatchesForReceiver(
                    ctx.accounts.user1.address,
                    ctx.yAssetAddress,
                );
            expect(unclaimedBatches).to.deep.equal([]);
        });

        it("reverts AlreadyClaimed on a second claim of the same request", async function () {
            const ctx = await loadFixture(setupClaimableRequest);
            await ctx.proTokenUnmintHandler
                .connect(ctx.accounts.user1)
                .claimUnmintRequests(ctx.yAssetAddress, [ctx.requestId]);

            await expect(
                ctx.proTokenUnmintHandler
                    .connect(ctx.accounts.user1)
                    .claimUnmintRequests(ctx.yAssetAddress, [ctx.requestId]),
            ).to.be.revertedWithCustomError(
                ctx.proTokenUnmintHandler,
                ERRORS.AlreadyClaimed,
            );
        });

        it("reverts Unauthorized when claimed by a non-receiver", async function () {
            const ctx = await loadFixture(setupClaimableRequest);
            await expect(
                ctx.proTokenUnmintHandler
                    .connect(ctx.accounts.user2)
                    .claimUnmintRequests(ctx.yAssetAddress, [ctx.requestId]),
            ).to.be.revertedWithCustomError(
                ctx.proTokenUnmintHandler,
                ERRORS.Unauthorized,
            );
        });

        it("reverts BatchStillProcessing when the batch is not yet processed", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await authorizeBackend(ctx);

            await mintProTokensFor(ctx, ctx.accounts.user1, HUNDRED_TOKENS);
            const bal = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            const requestId = await createUnmintFor(ctx, ctx.accounts.user1, bal);

            // Do NOT advance time / do NOT process — claim while batch still pending.
            await expect(
                ctx.proTokenUnmintHandler
                    .connect(ctx.accounts.user1)
                    .claimUnmintRequests(ctx.yAssetAddress, [requestId]),
            ).to.be.revertedWithCustomError(
                ctx.proTokenUnmintHandler,
                ERRORS.BatchStillProcessing,
            );
        });

        it("reverts InvalidInput on zero yAsset", async function () {
            const { proTokenUnmintHandler, accounts } =
                await loadFixture(fullProtocolFixture);
            await expect(
                proTokenUnmintHandler
                    .connect(accounts.user1)
                    .claimUnmintRequests(ZERO_ADDRESS, [0n]),
            ).to.be.revertedWithCustomError(
                proTokenUnmintHandler,
                ERRORS.InvalidInput,
            );
        });

        it("reverts InvalidInput on empty request array", async function () {
            const { proTokenUnmintHandler, yAssetAddress, accounts } =
                await loadFixture(fullProtocolFixture);
            await expect(
                proTokenUnmintHandler
                    .connect(accounts.user1)
                    .claimUnmintRequests(yAssetAddress, []),
            ).to.be.revertedWithCustomError(
                proTokenUnmintHandler,
                ERRORS.InvalidInput,
            );
        });

        it("reverts InvalidInput when array exceeds MAX_BATCH_SIZE", async function () {
            const { proTokenUnmintHandler, yAssetAddress, accounts } =
                await loadFixture(fullProtocolFixture);
            const tooMany = Array.from({ length: 11 }, (_, i) => BigInt(i));
            await expect(
                proTokenUnmintHandler
                    .connect(accounts.user1)
                    .claimUnmintRequests(yAssetAddress, tooMany),
            ).to.be.revertedWithCustomError(
                proTokenUnmintHandler,
                ERRORS.InvalidInput,
            );
        });

        it("reverts when protocol is globally paused", async function () {
            const ctx = await loadFixture(setupClaimableRequest);
            await ctx.proTokenSettings.connect(ctx.accounts.admin).pause();
            await expect(
                ctx.proTokenUnmintHandler
                    .connect(ctx.accounts.user1)
                    .claimUnmintRequests(ctx.yAssetAddress, [ctx.requestId]),
            ).to.be.revertedWithCustomError(ctx.proTokenUnmintHandler, ERRORS.Paused);
        });

        it("claims multiple requests in a single call", async function () {
            // Two users create unmints in the same batch, then user1 claims theirs and user2 theirs.
            // Then test that user1 could batch two of their own requests across different batches.
            const ctx = await fullProtocolFixture();
            await authorizeBackend(ctx);

            await mintProTokensFor(ctx, ctx.accounts.user1, HUNDRED_TOKENS * 2n);
            const total = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            const half = total / 2n;

            // Request 1 in batch 1
            const id1 = await createUnmintFor(ctx, ctx.accounts.user1, half);

            // Advance past duration, process batch 1
            const duration = await ctx.proTokenUnmintHandler.getUnmintBatchDuration();
            await time.increase(Number(duration) + 1);
            await processNextBatchAs(ctx, ctx.accounts.admin);

            // Request 2 in batch 2
            const id2 = await createUnmintFor(ctx, ctx.accounts.user1, half);
            await time.increase(Number(duration) + 1);
            await processNextBatchAs(ctx, ctx.accounts.admin);

            // Claim both in one call
            const before = await ctx.yAsset.balanceOf(ctx.accounts.user1.address);
            await ctx.proTokenUnmintHandler
                .connect(ctx.accounts.user1)
                .claimUnmintRequests(ctx.yAssetAddress, [id1, id2]);
            const after = await ctx.yAsset.balanceOf(ctx.accounts.user1.address);

            expect(after).to.be.gt(before);
            expect(
                await ctx.proTokenUnmintHandler.isUnmintRequestClaimed(
                    ctx.yAssetAddress,
                    id1,
                ),
            ).to.equal(true);
            expect(
                await ctx.proTokenUnmintHandler.isUnmintRequestClaimed(
                    ctx.yAssetAddress,
                    id2,
                ),
            ).to.equal(true);
        });
    });

    // =======================================================================
    // setUnmintBatchDuration
    // =======================================================================
    describe("setUnmintBatchDuration()", function () {
        it("admin can set a new duration and event reflects prev/new", async function () {
            const { proTokenUnmintHandler, accounts } =
                await loadFixture(fullProtocolFixture);

            const before = await proTokenUnmintHandler.getUnmintBatchDuration();
            const next = ONE_HOUR;

            await expect(
                proTokenUnmintHandler.connect(accounts.admin).setUnmintBatchDuration(next),
            )
                .to.emit(proTokenUnmintHandler, EVENTS.UnmintBatchDurationUpdated)
                .withArgs(before, next);

            expect(await proTokenUnmintHandler.getUnmintBatchDuration()).to.equal(next);
        });

        it("reverts InvalidDuration on zero", async function () {
            const { proTokenUnmintHandler, accounts } =
                await loadFixture(fullProtocolFixture);
            await expect(
                proTokenUnmintHandler.connect(accounts.admin).setUnmintBatchDuration(0n),
            ).to.be.revertedWithCustomError(
                proTokenUnmintHandler,
                ERRORS.InvalidDuration,
            );
        });

        it("reverts NotAdmin when called by operator", async function () {
            const { proTokenUnmintHandler, accounts } =
                await loadFixture(fullProtocolFixture);
            await expect(
                proTokenUnmintHandler
                    .connect(accounts.operator)
                    .setUnmintBatchDuration(ONE_HOUR),
            ).to.be.revertedWithCustomError(proTokenUnmintHandler, ERRORS.NotAdmin);
        });

        it("reverts NotAdmin when called by random attacker", async function () {
            const { proTokenUnmintHandler, accounts } =
                await loadFixture(fullProtocolFixture);
            await expect(
                proTokenUnmintHandler
                    .connect(accounts.attacker)
                    .setUnmintBatchDuration(ONE_HOUR),
            ).to.be.revertedWithCustomError(proTokenUnmintHandler, ERRORS.NotAdmin);
        });
    });

    // =======================================================================
    // emergencyWithdraw
    // =======================================================================
    describe("emergencyWithdraw()", function () {
        it("admin can withdraw an ERC20 token to a recipient", async function () {
            const ctx = await loadFixture(fullProtocolFixture);

            const stray = await deployMintableERC20("Stray", "STY", DECIMALS_18);
            const strayAddr = await stray.getAddress();
            await stray.mint(ctx.proTokenUnmintHandlerAddress, HUNDRED_TOKENS);

            const before = await stray.balanceOf(ctx.accounts.admin.address);
            await ctx.proTokenUnmintHandler
                .connect(ctx.accounts.admin)
                .emergencyWithdraw(strayAddr, ctx.accounts.admin.address, HUNDRED_TOKENS);
            const after = await stray.balanceOf(ctx.accounts.admin.address);

            expect(after - before).to.equal(HUNDRED_TOKENS);
        });

        it("emits EmergencyWithdraw event", async function () {
            const ctx = await loadFixture(fullProtocolFixture);

            const stray = await deployMintableERC20("Stray", "STY", DECIMALS_18);
            const strayAddr = await stray.getAddress();
            await stray.mint(ctx.proTokenUnmintHandlerAddress, HUNDRED_TOKENS);

            await expect(
                ctx.proTokenUnmintHandler
                    .connect(ctx.accounts.admin)
                    .emergencyWithdraw(strayAddr, ctx.accounts.admin.address, HUNDRED_TOKENS),
            )
                .to.emit(ctx.proTokenUnmintHandler, EVENTS.EmergencyWithdraw)
                .withArgs(strayAddr, ctx.accounts.admin.address, HUNDRED_TOKENS);
        });

        it("reverts NotAdmin when called by non-admin", async function () {
            const { proTokenUnmintHandler, yAssetAddress, accounts } =
                await loadFixture(fullProtocolFixture);
            await expect(
                proTokenUnmintHandler
                    .connect(accounts.user1)
                    .emergencyWithdraw(yAssetAddress, accounts.user1.address, HUNDRED_TOKENS),
            ).to.be.revertedWithCustomError(proTokenUnmintHandler, ERRORS.NotAdmin);
        });

        it("reverts ZeroAddress on zero recipient", async function () {
            const { proTokenUnmintHandler, yAssetAddress, accounts } =
                await loadFixture(fullProtocolFixture);
            await expect(
                proTokenUnmintHandler
                    .connect(accounts.admin)
                    .emergencyWithdraw(yAssetAddress, ZERO_ADDRESS, HUNDRED_TOKENS),
            ).to.be.revertedWithCustomError(
                proTokenUnmintHandler,
                ERRORS.ZeroAddress,
            );
        });

        it("reverts ZeroAmount on zero amount", async function () {
            const { proTokenUnmintHandler, yAssetAddress, accounts } =
                await loadFixture(fullProtocolFixture);
            await expect(
                proTokenUnmintHandler
                    .connect(accounts.admin)
                    .emergencyWithdraw(yAssetAddress, accounts.admin.address, 0n),
            ).to.be.revertedWithCustomError(
                proTokenUnmintHandler,
                ERRORS.ZeroAmount,
            );
        });
    });

    // =======================================================================
    // View functions
    // =======================================================================
    describe("View functions", function () {
        it("getUnmintBatchDuration returns the configured duration", async function () {
            const { proTokenUnmintHandler } = await loadFixture(fullProtocolFixture);
            expect(await proTokenUnmintHandler.getUnmintBatchDuration()).to.be.gt(0n);
        });

        it("getCurrentUnmintBatchId is 0 with no requests", async function () {
            const { proTokenUnmintHandler, yAssetAddress } =
                await loadFixture(fullProtocolFixture);
            expect(
                await proTokenUnmintHandler.getCurrentUnmintBatchId(yAssetAddress),
            ).to.equal(0n);
        });

        it("getLastProcessedBatchId is 0 with no requests", async function () {
            const { proTokenUnmintHandler, yAssetAddress } =
                await loadFixture(fullProtocolFixture);
            expect(
                await proTokenUnmintHandler.getLastProcessedBatchId(yAssetAddress),
            ).to.equal(0n);
        });

        it("getNextUnmintRequestId starts at 0", async function () {
            const { proTokenUnmintHandler, yAssetAddress } =
                await loadFixture(fullProtocolFixture);
            expect(
                await proTokenUnmintHandler.getNextUnmintRequestId(yAssetAddress),
            ).to.equal(0n);
        });

        it("isUnmintRequestClaimed returns false for non-existent request", async function () {
            const { proTokenUnmintHandler, yAssetAddress } =
                await loadFixture(fullProtocolFixture);
            expect(
                await proTokenUnmintHandler.isUnmintRequestClaimed(yAssetAddress, 0n),
            ).to.equal(false);
        });

        it("isUnmintBatchProcessed returns false for non-existent batch", async function () {
            const { proTokenUnmintHandler, yAssetAddress } =
                await loadFixture(fullProtocolFixture);
            expect(
                await proTokenUnmintHandler.isUnmintBatchProcessed(yAssetAddress, 0n),
            ).to.equal(false);
        });

        it("canBatchBeProcessed: false for non-existent batch", async function () {
            const { proTokenUnmintHandler, yAssetAddress } =
                await loadFixture(fullProtocolFixture);
            expect(
                await proTokenUnmintHandler.canBatchBeProcessed(yAssetAddress, 1n),
            ).to.equal(false);
        });

        it("canBatchBeProcessed: false when duration has not elapsed", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await authorizeBackend(ctx);
            await mintProTokensFor(ctx, ctx.accounts.user1, HUNDRED_TOKENS);
            const bal = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            await createUnmintFor(ctx, ctx.accounts.user1, bal);

            expect(
                await ctx.proTokenUnmintHandler.canBatchBeProcessed(ctx.yAssetAddress, 1n),
            ).to.equal(false);
        });

        it("canBatchBeProcessed: true once duration has elapsed", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await authorizeBackend(ctx);
            await mintProTokensFor(ctx, ctx.accounts.user1, HUNDRED_TOKENS);
            const bal = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            await createUnmintFor(ctx, ctx.accounts.user1, bal);

            const duration = await ctx.proTokenUnmintHandler.getUnmintBatchDuration();
            await time.increase(Number(duration) + 1);

            expect(
                await ctx.proTokenUnmintHandler.canBatchBeProcessed(ctx.yAssetAddress, 1n),
            ).to.equal(true);
        });

        it("canBatchBeProcessed: false after the batch is processed", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await authorizeBackend(ctx);
            await mintProTokensFor(ctx, ctx.accounts.user1, HUNDRED_TOKENS);
            const bal = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            await createUnmintFor(ctx, ctx.accounts.user1, bal);

            const duration = await ctx.proTokenUnmintHandler.getUnmintBatchDuration();
            await time.increase(Number(duration) + 1);
            await processNextBatchAs(ctx, ctx.accounts.admin);

            expect(
                await ctx.proTokenUnmintHandler.canBatchBeProcessed(ctx.yAssetAddress, 1n),
            ).to.equal(false);
        });

        it("getUnclaimedBatchesForReceiver returns the pending batches", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await authorizeBackend(ctx);
            await mintProTokensFor(ctx, ctx.accounts.user1, HUNDRED_TOKENS);
            const bal = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            await createUnmintFor(ctx, ctx.accounts.user1, bal);

            const batches =
                await ctx.proTokenUnmintHandler.getUnclaimedBatchesForReceiver(
                    ctx.accounts.user1.address,
                    ctx.yAssetAddress,
                );
            expect(batches).to.deep.equal([1n]);
        });

        it("getUnclaimedRequestsForReceiver returns the requests and last processed id", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await authorizeBackend(ctx);
            await mintProTokensFor(ctx, ctx.accounts.user1, HUNDRED_TOKENS);
            const bal = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            await createUnmintFor(ctx, ctx.accounts.user1, bal);

            const result =
                await ctx.proTokenUnmintHandler.getUnclaimedRequestsForReceiver(
                    ctx.accounts.user1.address,
                    ctx.yAssetAddress,
                );
            expect(result.requests.length).to.equal(1);
            expect(result.requests[0].receiver).to.equal(ctx.accounts.user1.address);
            expect(result.lastUnmintBatchIdProcessed).to.equal(0n);
        });

        it("getUnmintRequestIdForReceiverInBatch returns 0 for an absent receiver", async function () {
            const { proTokenUnmintHandler, yAssetAddress, accounts } =
                await loadFixture(fullProtocolFixture);
            expect(
                await proTokenUnmintHandler.getUnmintRequestIdForReceiverInBatch(
                    yAssetAddress,
                    1n,
                    accounts.user1.address,
                ),
            ).to.equal(0n);
        });

        it("getProTokenSettings returns the configured Settings address", async function () {
            const { proTokenUnmintHandler, proTokenSettingsAddress } =
                await loadFixture(fullProtocolFixture);
            expect(await proTokenUnmintHandler.getProTokenSettings()).to.equal(
                proTokenSettingsAddress,
            );
        });
    });

    // =======================================================================
    // _authorizeUpgrade (UUPS)
    // =======================================================================
    describe("_authorizeUpgrade (UUPS)", function () {
        it("admin can upgrade to higher VERSION", async function () {
            const { proTokenUnmintHandler, accounts } =
                await loadFixture(fullProtocolFixture);

            const V2 = await ethers.getContractFactory("MockUpgradeTargetHigherVersion");
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();

            await expect(
                proTokenUnmintHandler
                    .connect(accounts.admin)
                    .upgradeToAndCall(await v2Impl.getAddress(), "0x"),
            ).to.not.be.reverted;
        });

        it("reverts VersionNotIncremented when new VERSION equals current", async function () {
            const { proTokenUnmintHandler, accounts } =
                await loadFixture(fullProtocolFixture);

            const Same = await ethers.getContractFactory("MockUpgradeTargetSameVersion");
            const sameImpl = await Same.deploy();
            await sameImpl.waitForDeployment();

            await expect(
                proTokenUnmintHandler
                    .connect(accounts.admin)
                    .upgradeToAndCall(await sameImpl.getAddress(), "0x"),
            )
                .to.be.revertedWithCustomError(
                    proTokenUnmintHandler,
                    ERRORS.VersionNotIncremented,
                )
                .withArgs(VERSION_1_0_0, VERSION_1_0_0);
        });

        it("reverts VersionNotIncremented when new VERSION is lower", async function () {
            const { proTokenUnmintHandler, accounts } =
                await loadFixture(fullProtocolFixture);

            const Lower = await ethers.getContractFactory("MockUpgradeTargetLowerVersion");
            const lowerImpl = await Lower.deploy();
            await lowerImpl.waitForDeployment();

            await expect(
                proTokenUnmintHandler
                    .connect(accounts.admin)
                    .upgradeToAndCall(await lowerImpl.getAddress(), "0x"),
            )
                .to.be.revertedWithCustomError(
                    proTokenUnmintHandler,
                    ERRORS.VersionNotIncremented,
                )
                .withArgs(VERSION_1_0_0, 1n);
        });

        it("reverts NotAdmin when called by operator", async function () {
            const { proTokenUnmintHandler, accounts } =
                await loadFixture(fullProtocolFixture);

            const V2 = await ethers.getContractFactory("MockUpgradeTargetHigherVersion");
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();

            await expect(
                proTokenUnmintHandler
                    .connect(accounts.operator)
                    .upgradeToAndCall(await v2Impl.getAddress(), "0x"),
            ).to.be.revertedWithCustomError(proTokenUnmintHandler, ERRORS.NotAdmin);
        });

        it("reverts NotAdmin when called by random attacker", async function () {
            const { proTokenUnmintHandler, accounts } =
                await loadFixture(fullProtocolFixture);

            const V2 = await ethers.getContractFactory("MockUpgradeTargetHigherVersion");
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();

            await expect(
                proTokenUnmintHandler
                    .connect(accounts.attacker)
                    .upgradeToAndCall(await v2Impl.getAddress(), "0x"),
            ).to.be.revertedWithCustomError(proTokenUnmintHandler, ERRORS.NotAdmin);
        });
    });
});