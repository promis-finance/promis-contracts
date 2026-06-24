import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import {
    ZERO_ADDRESS,
    ONE_TOKEN,
    HUNDRED_TOKENS,
    THOUSAND_TOKENS,
    ALLOCATION_PRECISION_BPS,
    FIFTY_PERCENT_BPS,
    ERRORS,
    EVENTS,
} from "../helpers/constants";
import { fullProtocolFixture, FullProtocolFixture } from "../helpers/fixtures";
import {
    signMintProof,
    signUnmintProof,
    ProofKind,
    ProofData,
} from "../helpers/proofs";
import { deployMockYieldProtocolHandler } from "../helpers/mocks";

// ---------------------------------------------------------------------------
// Integration tests for the ProToken protocol.
//
// These exercise multi-contract flows end-to-end:
//   ProToken + ProTokenSettings + ProTokenOperations + ProTokenUnmintHandler
//   + YAssetOperationsHandler + MockYieldProtocolHandler
//
// Each test tells a complete user story, including the operator's manual
// steps for funding unmint batches:
//   1. Operator pulls yAsset from YAssetOperationsHandler to their wallet
//   2. Operator approves UnmintHandler and calls processNextUnmintBatch
// Both steps are written out explicitly in each test rather than hidden in
// a helper, so readers can see exactly what the operator does.
//
// Key invariants tracked:
//   - proToken total supply == sum of holder balances + Operations balance
//   - yAsset conservation across mint → unmint → claim flow
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Minimal helpers (only for proof-signing flows that are mechanical and
// distracting if inlined; nothing related to operator state changes is hidden)
// ---------------------------------------------------------------------------

async function authorizeBackend(ctx: FullProtocolFixture) {
    await ctx.proTokenSettings
        .connect(ctx.accounts.admin)
        .setAuthority(ctx.accounts.authority.address, true);
}

async function mintProTokensFor(
    ctx: FullProtocolFixture,
    user: HardhatEthersSigner,
    amount: bigint,
): Promise<bigint> {
    await ctx.yAsset.mint(user.address, amount);
    await ctx.yAsset
        .connect(user)
        .approve(ctx.proTokenOperationsAddress, amount);

    const tx = await ctx.proTokenOperations
        .connect(user)
        .createMintRequest(ctx.yAssetAddress, amount, 0n, ZERO_ADDRESS);
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
        yAsset: ctx.yAssetAddress,
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

async function createAndApproveUnmint(
    ctx: FullProtocolFixture,
    user: HardhatEthersSigner,
    proTokenAmount: bigint,
): Promise<{ opsRequestId: bigint; handlerRequestId: bigint }> {
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

    const currentBatchId = await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(
        ctx.yAssetAddress,
    );
    const handlerRequestId =
        await ctx.proTokenUnmintHandler.getUnmintRequestIdForReceiverInBatch(
            ctx.yAssetAddress,
            currentBatchId,
            user.address,
        );
    return { opsRequestId, handlerRequestId };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Integration: ProToken protocol end-to-end", function () {
    // =======================================================================
    // Single user — full mint and unmint cycle
    // =======================================================================
    describe("Single-user lifecycle", function () {
        async function setup() {
            const ctx = await fullProtocolFixture();
            await authorizeBackend(ctx);
            return ctx;
        }

        it("mints proTokens, unmints them, claims yAsset — round trip restores balance", async function () {
            const ctx = await loadFixture(setup);
            const alice = ctx.accounts.user1;

            // ---- Step 1: Alice mints 100 yAsset → 100 proToken ----
            const aliceYBalBefore = await ctx.yAsset.balanceOf(alice.address);
            await mintProTokensFor(ctx, alice, HUNDRED_TOKENS);

            const aliceProBal = await ctx.proToken.balanceOf(alice.address);
            expect(aliceProBal).to.equal(HUNDRED_TOKENS);
            expect(await ctx.proToken.totalSupply()).to.equal(HUNDRED_TOKENS);

            // Alice's wallet balance unchanged: helper minted HUNDRED_TOKENS to her,
            // then deposited HUNDRED_TOKENS for the mint. Net zero.
            expect(await ctx.yAsset.balanceOf(alice.address)).to.equal(aliceYBalBefore);

            // yAsset landed in YAssetOpsHandler (no yield handlers configured)
            expect(
                await ctx.yAssetOperationsHandler.getUnallocatedBalance(),
            ).to.equal(HUNDRED_TOKENS);

            // ---- Step 2: Alice unmints all 100 proToken ----
            const { handlerRequestId } = await createAndApproveUnmint(
                ctx,
                alice,
                aliceProBal,
            );

            // proToken burned
            expect(await ctx.proToken.balanceOf(alice.address)).to.equal(0n);
            expect(await ctx.proToken.totalSupply()).to.equal(0n);

            // Batch created in unmint handler
            const batchId = await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(
                ctx.yAssetAddress,
            );
            expect(batchId).to.equal(1n);

            const batch = await ctx.proTokenUnmintHandler.getUnmintBatch(
                ctx.yAssetAddress,
                batchId,
            );
            expect(batch.totalAmount).to.equal(HUNDRED_TOKENS);
            expect(batch.processed).to.equal(false);

            // ---- Step 3: Time passes, batch becomes processable ----
            const duration = await ctx.proTokenUnmintHandler.getUnmintBatchDuration();
            await time.increase(Number(duration) + 1);

            // ---- Step 4a: Operator pulls yAsset from YAssetOpsHandler ----
            // The operator sources the redemption funds from the protocol's unallocated
            // pool (passing ZERO_ADDRESS as the handler arg means "pull from unallocated
            // balance" rather than from a specific yield protocol handler).
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .withdrawalYieldAssets(ZERO_ADDRESS, batch.totalAmount);

            // OpsHandler drained, operator now holds the funds
            expect(
                await ctx.yAssetOperationsHandler.getUnallocatedBalance(),
            ).to.equal(0n);
            expect(
                await ctx.yAsset.balanceOf(ctx.accounts.admin.address),
            ).to.equal(batch.totalAmount);

            // ---- Step 4b: Operator funds the unmint batch ----
            await ctx.yAsset
                .connect(ctx.accounts.admin)
                .approve(ctx.proTokenUnmintHandlerAddress, batch.totalAmount);
            await ctx.proTokenUnmintHandler
                .connect(ctx.accounts.admin)
                .processNextUnmintBatch(ctx.yAssetAddress);

            // Batch marked processed; UnmintHandler now holds the redemption pool
            const processedBatch = await ctx.proTokenUnmintHandler.getUnmintBatch(
                ctx.yAssetAddress,
                batchId,
            );
            expect(processedBatch.processed).to.equal(true);
            expect(
                await ctx.yAsset.balanceOf(ctx.proTokenUnmintHandlerAddress),
            ).to.equal(HUNDRED_TOKENS);

            // ---- Step 5: Alice claims her yAsset ----
            await ctx.proTokenUnmintHandler
                .connect(alice)
                .claimUnmintRequests(ctx.yAssetAddress, [handlerRequestId]);

            // Alice receives her 100 yAsset back
            expect(await ctx.yAsset.balanceOf(alice.address)).to.equal(
                aliceYBalBefore + HUNDRED_TOKENS,
            );
            // UnmintHandler emptied
            expect(
                await ctx.yAsset.balanceOf(ctx.proTokenUnmintHandlerAddress),
            ).to.equal(0n);
            // Request marked claimed
            expect(
                await ctx.proTokenUnmintHandler.isUnmintRequestClaimed(
                    ctx.yAssetAddress,
                    handlerRequestId,
                ),
            ).to.equal(true);
        });

        it("PROOF_OF_RETURN on mint refunds yAsset without minting proToken", async function () {
            const ctx = await loadFixture(setup);
            const alice = ctx.accounts.user1;

            const aliceYBalBefore = await ctx.yAsset.balanceOf(alice.address);

            // Alice creates mint request
            await ctx.yAsset.mint(alice.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(alice)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS);
            await ctx.proTokenOperations
                .connect(alice)
                .createMintRequest(ctx.yAssetAddress, HUNDRED_TOKENS, 0n, ZERO_ADDRESS);

            // Backend signs RETURN instead of APPROVE
            const proofData: ProofData = {
                requestId: 0n,
                user: alice.address,
                receiver: ZERO_ADDRESS,
                yAsset: ctx.yAssetAddress,
                amount: HUNDRED_TOKENS,
                minAmountOut: 0n,
                proofKind: ProofKind.PROOF_OF_RETURN,
            };
            const proof = await signMintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                proofData,
            );

            await ctx.proTokenOperations
                .connect(alice)
                .finalizeMintRequest(0n, ProofKind.PROOF_OF_RETURN, proof);

            // No proToken minted
            expect(await ctx.proToken.balanceOf(alice.address)).to.equal(0n);
            expect(await ctx.proToken.totalSupply()).to.equal(0n);

            // yAsset returned to Alice
            expect(await ctx.yAsset.balanceOf(alice.address)).to.equal(
                aliceYBalBefore + HUNDRED_TOKENS,
            );
            // Operations holds nothing
            expect(
                await ctx.yAsset.balanceOf(ctx.proTokenOperationsAddress),
            ).to.equal(0n);
        });

        it("PROOF_OF_RETURN on unmint refunds proToken without queuing for unmint", async function () {
            const ctx = await loadFixture(setup);
            const alice = ctx.accounts.user1;

            // Alice mints first
            await mintProTokensFor(ctx, alice, HUNDRED_TOKENS);
            expect(await ctx.proToken.balanceOf(alice.address)).to.equal(HUNDRED_TOKENS);

            // Alice creates unmint request
            await ctx.proToken
                .connect(alice)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS);
            await ctx.proTokenOperations
                .connect(alice)
                .createUnmintRequest(
                    ctx.yAssetAddress,
                    HUNDRED_TOKENS,
                    0n,
                    ZERO_ADDRESS,
                );

            // proToken now held by Operations
            expect(await ctx.proToken.balanceOf(alice.address)).to.equal(0n);

            // Backend signs RETURN
            const proofData: ProofData = {
                requestId: 0n,
                user: alice.address,
                receiver: ZERO_ADDRESS,
                yAsset: ctx.yAssetAddress,
                amount: HUNDRED_TOKENS,
                minAmountOut: 0n,
                proofKind: ProofKind.PROOF_OF_RETURN,
            };
            const proof = await signUnmintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                proofData,
            );

            await ctx.proTokenOperations
                .connect(alice)
                .finalizeUnmintRequest(0n, ProofKind.PROOF_OF_RETURN, proof);

            // proToken returned to Alice, supply unchanged
            expect(await ctx.proToken.balanceOf(alice.address)).to.equal(HUNDRED_TOKENS);
            expect(await ctx.proToken.totalSupply()).to.equal(HUNDRED_TOKENS);

            // No batch created in unmint handler
            expect(
                await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(ctx.yAssetAddress),
            ).to.equal(0n);
        });
    });

    // =======================================================================
    // Multi-user — batched unmint
    // =======================================================================
    describe("Multi-user batched unmint", function () {
        async function setup() {
            const ctx = await fullProtocolFixture();
            await authorizeBackend(ctx);
            return ctx;
        }

        it("three users mint, two unmint in the same batch, both claim correctly", async function () {
            const ctx = await loadFixture(setup);
            const alice = ctx.accounts.user1;
            const bob = ctx.accounts.user2;
            const carol = ctx.accounts.externalBusiness;

            // All three mint
            await mintProTokensFor(ctx, alice, HUNDRED_TOKENS);
            await mintProTokensFor(ctx, bob, HUNDRED_TOKENS * 2n);
            await mintProTokensFor(ctx, carol, HUNDRED_TOKENS * 3n);

            expect(await ctx.proToken.totalSupply()).to.equal(HUNDRED_TOKENS * 6n);

            // Alice and Bob unmint in the same batch
            const { handlerRequestId: aliceReqId } = await createAndApproveUnmint(
                ctx,
                alice,
                HUNDRED_TOKENS,
            );
            const { handlerRequestId: bobReqId } = await createAndApproveUnmint(
                ctx,
                bob,
                HUNDRED_TOKENS * 2n,
            );

            // Both share batch 1
            expect(
                await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(ctx.yAssetAddress),
            ).to.equal(1n);

            const batch = await ctx.proTokenUnmintHandler.getUnmintBatch(
                ctx.yAssetAddress,
                1n,
            );
            expect(batch.totalAmount).to.equal(HUNDRED_TOKENS * 3n); // 100 + 200

            // Distinct request ids
            expect(aliceReqId).to.not.equal(bobReqId);

            // Total supply dropped by burned amount
            expect(await ctx.proToken.totalSupply()).to.equal(HUNDRED_TOKENS * 3n);

            // Carol's balance untouched
            expect(await ctx.proToken.balanceOf(carol.address)).to.equal(
                HUNDRED_TOKENS * 3n,
            );

            // Time passes, batch becomes processable
            const duration = await ctx.proTokenUnmintHandler.getUnmintBatchDuration();
            await time.increase(Number(duration) + 1);

            // Operator pulls batch funds from YAssetOpsHandler (manual step 1)
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .withdrawalYieldAssets(ZERO_ADDRESS, batch.totalAmount);

            // Operator funds the unmint batch (manual step 2)
            await ctx.yAsset
                .connect(ctx.accounts.admin)
                .approve(ctx.proTokenUnmintHandlerAddress, batch.totalAmount);
            await ctx.proTokenUnmintHandler
                .connect(ctx.accounts.admin)
                .processNextUnmintBatch(ctx.yAssetAddress);

            // Both users claim
            const aliceYBalBefore = await ctx.yAsset.balanceOf(alice.address);
            const bobYBalBefore = await ctx.yAsset.balanceOf(bob.address);

            await ctx.proTokenUnmintHandler
                .connect(alice)
                .claimUnmintRequests(ctx.yAssetAddress, [aliceReqId]);
            await ctx.proTokenUnmintHandler
                .connect(bob)
                .claimUnmintRequests(ctx.yAssetAddress, [bobReqId]);

            // Each user gets their proportional yAsset
            expect(await ctx.yAsset.balanceOf(alice.address)).to.equal(
                aliceYBalBefore + HUNDRED_TOKENS,
            );
            expect(await ctx.yAsset.balanceOf(bob.address)).to.equal(
                bobYBalBefore + HUNDRED_TOKENS * 2n,
            );

            // UnmintHandler emptied
            expect(
                await ctx.yAsset.balanceOf(ctx.proTokenUnmintHandlerAddress),
            ).to.equal(0n);

            // Carol still holds her proToken; her deposit still in OpsHandler
            expect(await ctx.proToken.balanceOf(carol.address)).to.equal(
                HUNDRED_TOKENS * 3n,
            );
            expect(
                await ctx.yAssetOperationsHandler.getUnallocatedBalance(),
            ).to.equal(HUNDRED_TOKENS * 3n);
        });

        it("same user unmints twice in one batch — gets aggregated into one request", async function () {
            const ctx = await loadFixture(setup);
            const alice = ctx.accounts.user1;

            await mintProTokensFor(ctx, alice, HUNDRED_TOKENS * 2n);

            const { handlerRequestId: id1 } = await createAndApproveUnmint(
                ctx,
                alice,
                HUNDRED_TOKENS,
            );
            const { handlerRequestId: id2 } = await createAndApproveUnmint(
                ctx,
                alice,
                HUNDRED_TOKENS,
            );

            // Same handler request id (aggregated)
            expect(id1).to.equal(id2);

            // Batch total reflects both
            const batch = await ctx.proTokenUnmintHandler.getUnmintBatch(
                ctx.yAssetAddress,
                1n,
            );
            expect(batch.totalAmount).to.equal(HUNDRED_TOKENS * 2n);

            // Time passes
            const duration = await ctx.proTokenUnmintHandler.getUnmintBatchDuration();
            await time.increase(Number(duration) + 1);

            // Operator pulls and processes
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .withdrawalYieldAssets(ZERO_ADDRESS, batch.totalAmount);
            await ctx.yAsset
                .connect(ctx.accounts.admin)
                .approve(ctx.proTokenUnmintHandlerAddress, batch.totalAmount);
            await ctx.proTokenUnmintHandler
                .connect(ctx.accounts.admin)
                .processNextUnmintBatch(ctx.yAssetAddress);

            // Single claim returns the aggregated total
            const aliceYBalBefore = await ctx.yAsset.balanceOf(alice.address);
            await ctx.proTokenUnmintHandler
                .connect(alice)
                .claimUnmintRequests(ctx.yAssetAddress, [id1]);
            expect(await ctx.yAsset.balanceOf(alice.address)).to.equal(
                aliceYBalBefore + HUNDRED_TOKENS * 2n,
            );
        });
    });

    // =======================================================================
    // Multi-batch processing in order
    // =======================================================================
    describe("Sequential batch processing", function () {
        async function setup() {
            const ctx = await fullProtocolFixture();
            await authorizeBackend(ctx);
            return ctx;
        }

        async function processBatch(ctx: FullProtocolFixture, amount: bigint) {
            // Inline two-step operator flow:
            // 1. Pull from YAssetOpsHandler unallocated pool
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .withdrawalYieldAssets(ZERO_ADDRESS, amount);
            // 2. Approve and process the batch
            await ctx.yAsset
                .connect(ctx.accounts.admin)
                .approve(ctx.proTokenUnmintHandlerAddress, amount);
            await ctx.proTokenUnmintHandler
                .connect(ctx.accounts.admin)
                .processNextUnmintBatch(ctx.yAssetAddress);
        }

        it("two batches process in order, users claim independently from each", async function () {
            const ctx = await loadFixture(setup);
            const alice = ctx.accounts.user1;
            const bob = ctx.accounts.user2;

            await mintProTokensFor(ctx, alice, HUNDRED_TOKENS);
            await mintProTokensFor(ctx, bob, HUNDRED_TOKENS);

            // Batch 1: Alice unmints
            const { handlerRequestId: aliceReqId } = await createAndApproveUnmint(
                ctx,
                alice,
                HUNDRED_TOKENS,
            );
            expect(
                await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(ctx.yAssetAddress),
            ).to.equal(1n);

            // Advance and process batch 1
            const duration = await ctx.proTokenUnmintHandler.getUnmintBatchDuration();
            await time.increase(Number(duration) + 1);
            await processBatch(ctx, HUNDRED_TOKENS);

            expect(
                await ctx.proTokenUnmintHandler.getLastProcessedBatchId(ctx.yAssetAddress),
            ).to.equal(1n);

            // Batch 2: Bob unmints
            const { handlerRequestId: bobReqId } = await createAndApproveUnmint(
                ctx,
                bob,
                HUNDRED_TOKENS,
            );

            // New batch was created
            expect(
                await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(ctx.yAssetAddress),
            ).to.equal(2n);

            await time.increase(Number(duration) + 1);
            await processBatch(ctx, HUNDRED_TOKENS);

            expect(
                await ctx.proTokenUnmintHandler.getLastProcessedBatchId(ctx.yAssetAddress),
            ).to.equal(2n);

            // Both claim
            const aliceYBalBefore = await ctx.yAsset.balanceOf(alice.address);
            const bobYBalBefore = await ctx.yAsset.balanceOf(bob.address);

            await ctx.proTokenUnmintHandler
                .connect(alice)
                .claimUnmintRequests(ctx.yAssetAddress, [aliceReqId]);
            await ctx.proTokenUnmintHandler
                .connect(bob)
                .claimUnmintRequests(ctx.yAssetAddress, [bobReqId]);

            expect(await ctx.yAsset.balanceOf(alice.address)).to.equal(
                aliceYBalBefore + HUNDRED_TOKENS,
            );
            expect(await ctx.yAsset.balanceOf(bob.address)).to.equal(
                bobYBalBefore + HUNDRED_TOKENS,
            );

            // OpsHandler emptied: both Alice and Bob's deposits used to fund their own unmints
            expect(
                await ctx.yAssetOperationsHandler.getUnallocatedBalance(),
            ).to.equal(0n);
        });

        it("user can batch-claim across multiple processed batches", async function () {
            const ctx = await loadFixture(setup);
            const alice = ctx.accounts.user1;

            await mintProTokensFor(ctx, alice, HUNDRED_TOKENS * 2n);

            const duration = await ctx.proTokenUnmintHandler.getUnmintBatchDuration();

            // Batch 1
            const { handlerRequestId: req1 } = await createAndApproveUnmint(
                ctx,
                alice,
                HUNDRED_TOKENS,
            );
            await time.increase(Number(duration) + 1);
            await processBatch(ctx, HUNDRED_TOKENS);

            // Batch 2
            const { handlerRequestId: req2 } = await createAndApproveUnmint(
                ctx,
                alice,
                HUNDRED_TOKENS,
            );
            await time.increase(Number(duration) + 1);
            await processBatch(ctx, HUNDRED_TOKENS);

            // Single claim covers both
            const aliceYBalBefore = await ctx.yAsset.balanceOf(alice.address);
            await ctx.proTokenUnmintHandler
                .connect(alice)
                .claimUnmintRequests(ctx.yAssetAddress, [req1, req2]);

            expect(await ctx.yAsset.balanceOf(alice.address)).to.equal(
                aliceYBalBefore + HUNDRED_TOKENS * 2n,
            );
        });
    });

    // =======================================================================
    // Yield-handler integration
    // =======================================================================
    describe("Yield handler integration", function () {
        async function setupWithYieldHandler() {
            const ctx = await fullProtocolFixture();
            await authorizeBackend(ctx);

            // Configure a single yield protocol handler with 100% allocation
            const handler = await deployMockYieldProtocolHandler(ctx.yAssetAddress);
            const handlerAddr = await handler.getAddress();
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .setYProtocolHandlers([handlerAddr], [ALLOCATION_PRECISION_BPS]);

            return { ...ctx, yieldHandler: handler, yieldHandlerAddr: handlerAddr };
        }

        it("minted yAsset routes through YAssetOpsHandler to the yield handler", async function () {
            const ctx = await loadFixture(setupWithYieldHandler);
            const alice = ctx.accounts.user1;

            await mintProTokensFor(ctx, alice, HUNDRED_TOKENS);

            // YAssetOpsHandler should have 0 unallocated (all routed to yield handler)
            expect(
                await ctx.yAssetOperationsHandler.getUnallocatedBalance(),
            ).to.equal(0n);

            // Yield handler holds the funds
            expect(await ctx.yieldHandler.getBalance()).to.equal(HUNDRED_TOKENS);

            // getYAssetInfo reports total = yield handler balance
            const [, total] = await ctx.yAssetOperationsHandler.getYAssetInfo();
            expect(total).to.equal(HUNDRED_TOKENS);
        });

        it("operator withdraws from yield handler to fund an unmint batch", async function () {
            const ctx = await loadFixture(setupWithYieldHandler);
            const alice = ctx.accounts.user1;

            // Alice mints — funds flow to yield handler
            await mintProTokensFor(ctx, alice, HUNDRED_TOKENS);
            expect(await ctx.yieldHandler.getBalance()).to.equal(HUNDRED_TOKENS);

            // Alice creates unmint
            const { handlerRequestId } = await createAndApproveUnmint(
                ctx,
                alice,
                HUNDRED_TOKENS,
            );

            // Advance past batch duration
            const duration = await ctx.proTokenUnmintHandler.getUnmintBatchDuration();
            await time.increase(Number(duration) + 1);

            // Operator pulls funds from the specific yield handler (not the unallocated pool,
            // because all funds are currently allocated to the yield handler)
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.operator)
                .withdrawalYieldAssets(ctx.yieldHandlerAddr, HUNDRED_TOKENS);

            // Yield handler emptied; operator holds the funds
            expect(await ctx.yieldHandler.getBalance()).to.equal(0n);
            expect(await ctx.yAsset.balanceOf(ctx.accounts.operator.address)).to.equal(
                HUNDRED_TOKENS,
            );

            // Operator funds the unmint batch
            await ctx.yAsset
                .connect(ctx.accounts.operator)
                .approve(ctx.proTokenUnmintHandlerAddress, HUNDRED_TOKENS);
            await ctx.proTokenUnmintHandler
                .connect(ctx.accounts.operator)
                .processNextUnmintBatch(ctx.yAssetAddress);

            // Alice claims
            const aliceYBalBefore = await ctx.yAsset.balanceOf(alice.address);
            await ctx.proTokenUnmintHandler
                .connect(alice)
                .claimUnmintRequests(ctx.yAssetAddress, [handlerRequestId]);
            expect(await ctx.yAsset.balanceOf(alice.address)).to.equal(
                aliceYBalBefore + HUNDRED_TOKENS,
            );
        });

        it("multiple yield handlers split the allocation correctly", async function () {
            const ctx = await fullProtocolFixture();
            await authorizeBackend(ctx);

            // Two yield handlers, 50/50 split
            const h1 = await deployMockYieldProtocolHandler(ctx.yAssetAddress);
            const h2 = await deployMockYieldProtocolHandler(ctx.yAssetAddress);
            const h1Addr = await h1.getAddress();
            const h2Addr = await h2.getAddress();

            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .setYProtocolHandlers(
                    [h1Addr, h2Addr],
                    [FIFTY_PERCENT_BPS, FIFTY_PERCENT_BPS],
                );

            const alice = ctx.accounts.user1;
            await mintProTokensFor(ctx, alice, HUNDRED_TOKENS);

            // Each handler gets half
            expect(await h1.getBalance()).to.equal(HUNDRED_TOKENS / 2n);
            expect(await h2.getBalance()).to.equal(HUNDRED_TOKENS / 2n);

            // Aggregate view sums both
            const [, total] = await ctx.yAssetOperationsHandler.getYAssetInfo();
            expect(total).to.equal(HUNDRED_TOKENS);
        });
    });

    // =======================================================================
    // Pause behavior across the full flow
    // =======================================================================
    describe("Pause behavior", function () {
        async function setup() {
            const ctx = await fullProtocolFixture();
            await authorizeBackend(ctx);
            return ctx;
        }

        it("pause blocks new mint requests and finalization but admin can still unpause", async function () {
            const ctx = await loadFixture(setup);
            const alice = ctx.accounts.user1;

            // Alice creates mint request before pause
            await ctx.yAsset.mint(alice.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(alice)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS);
            await ctx.proTokenOperations
                .connect(alice)
                .createMintRequest(ctx.yAssetAddress, HUNDRED_TOKENS, 0n, ZERO_ADDRESS);

            // Pause
            await ctx.proTokenSettings.connect(ctx.accounts.admin).pause();

            // New mint requests blocked
            await ctx.yAsset.mint(alice.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(alice)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS);
            await expect(
                ctx.proTokenOperations
                    .connect(alice)
                    .createMintRequest(ctx.yAssetAddress, HUNDRED_TOKENS, 0n, ZERO_ADDRESS),
            ).to.be.revertedWithCustomError(ctx.proTokenOperations, ERRORS.Paused);

            // Finalization also blocked
            const proofData: ProofData = {
                requestId: 0n,
                user: alice.address,
                receiver: ZERO_ADDRESS,
                yAsset: ctx.yAssetAddress,
                amount: HUNDRED_TOKENS,
                minAmountOut: 0n,
                proofKind: ProofKind.PROOF_OF_APPROVE,
            };
            const proof = await signMintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                proofData,
            );
            await expect(
                ctx.proTokenOperations
                    .connect(alice)
                    .finalizeMintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof),
            ).to.be.revertedWithCustomError(ctx.proTokenOperations, ERRORS.Paused);

            // Unpause
            await ctx.proTokenSettings.connect(ctx.accounts.admin).unpause();

            // Now finalize succeeds
            await ctx.proTokenOperations
                .connect(alice)
                .finalizeMintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof);

            expect(await ctx.proToken.balanceOf(alice.address)).to.equal(HUNDRED_TOKENS);
        });
    });

    // =======================================================================
    // Protocol invariants — total supply consistency
    // =======================================================================
    describe("Protocol invariants", function () {
        async function setup() {
            const ctx = await fullProtocolFixture();
            await authorizeBackend(ctx);
            return ctx;
        }

        it("proToken total supply == sum of holder balances across mint/unmint cycle", async function () {
            const ctx = await loadFixture(setup);
            const alice = ctx.accounts.user1;
            const bob = ctx.accounts.user2;
            const carol = ctx.accounts.externalBusiness;

            // Stage 1: three mints
            await mintProTokensFor(ctx, alice, HUNDRED_TOKENS);
            await mintProTokensFor(ctx, bob, HUNDRED_TOKENS * 2n);
            await mintProTokensFor(ctx, carol, HUNDRED_TOKENS * 3n);

            const aliceBal = await ctx.proToken.balanceOf(alice.address);
            const bobBal = await ctx.proToken.balanceOf(bob.address);
            const carolBal = await ctx.proToken.balanceOf(carol.address);
            const opsBal = await ctx.proToken.balanceOf(ctx.proTokenOperationsAddress);
            const totalSupply = await ctx.proToken.totalSupply();

            expect(aliceBal + bobBal + carolBal + opsBal).to.equal(totalSupply);

            // Stage 2: Alice creates unmint (proToken moves to Operations, then burns)
            await createAndApproveUnmint(ctx, alice, aliceBal);

            const newTotal = await ctx.proToken.totalSupply();
            const newAlice = await ctx.proToken.balanceOf(alice.address);
            const newBob = await ctx.proToken.balanceOf(bob.address);
            const newCarol = await ctx.proToken.balanceOf(carol.address);
            const newOps = await ctx.proToken.balanceOf(ctx.proTokenOperationsAddress);

            expect(newAlice + newBob + newCarol + newOps).to.equal(newTotal);
            // Supply decreased by Alice's burn
            expect(newTotal).to.equal(totalSupply - aliceBal);
        });

        it("yAsset conservation: Alice's deposit funds Alice's unmint, Bob's deposit stays", async function () {
            const ctx = await loadFixture(setup);
            const alice = ctx.accounts.user1;
            const bob = ctx.accounts.user2;

            const aliceDeposit = HUNDRED_TOKENS;
            const bobDeposit = HUNDRED_TOKENS * 2n;
            const totalDeposited = aliceDeposit + bobDeposit;

            await mintProTokensFor(ctx, alice, aliceDeposit);
            await mintProTokensFor(ctx, bob, bobDeposit);

            // After mint: total deposits sit in YAssetOpsHandler unallocated pool
            expect(await ctx.yAssetOperationsHandler.getUnallocatedBalance()).to.equal(
                totalDeposited,
            );

            // Alice creates unmint request
            const { handlerRequestId: aliceReqId } = await createAndApproveUnmint(
                ctx,
                alice,
                aliceDeposit,
            );

            // OpsHandler balance unchanged at this point — unmint just burned proToken,
            // yAsset hasn't moved yet
            expect(await ctx.yAssetOperationsHandler.getUnallocatedBalance()).to.equal(
                totalDeposited,
            );

            // Advance time
            const duration = await ctx.proTokenUnmintHandler.getUnmintBatchDuration();
            await time.increase(Number(duration) + 1);

            // Operator manual step 1: pull batch amount from OpsHandler
            await ctx.yAssetOperationsHandler
                .connect(ctx.accounts.admin)
                .withdrawalYieldAssets(ZERO_ADDRESS, aliceDeposit);

            // OpsHandler drained by Alice's amount
            expect(await ctx.yAssetOperationsHandler.getUnallocatedBalance()).to.equal(
                bobDeposit,
            );
            // Operator now holds Alice's amount
            expect(await ctx.yAsset.balanceOf(ctx.accounts.admin.address)).to.equal(
                aliceDeposit,
            );

            // Operator manual step 2: fund the batch
            await ctx.yAsset
                .connect(ctx.accounts.admin)
                .approve(ctx.proTokenUnmintHandlerAddress, aliceDeposit);
            await ctx.proTokenUnmintHandler
                .connect(ctx.accounts.admin)
                .processNextUnmintBatch(ctx.yAssetAddress);

            // Operator wallet empty again
            expect(await ctx.yAsset.balanceOf(ctx.accounts.admin.address)).to.equal(0n);

            // Alice claims
            const aliceBefore = await ctx.yAsset.balanceOf(alice.address);
            await ctx.proTokenUnmintHandler
                .connect(alice)
                .claimUnmintRequests(ctx.yAssetAddress, [aliceReqId]);
            const aliceAfter = await ctx.yAsset.balanceOf(alice.address);

            // Alice got her deposit back
            expect(aliceAfter - aliceBefore).to.equal(aliceDeposit);

            // Bob's deposit still sits in YAssetOpsHandler (he hasn't unminted)
            expect(await ctx.yAssetOperationsHandler.getUnallocatedBalance()).to.equal(
                bobDeposit,
            );

            // UnmintHandler emptied by Alice's claim
            expect(
                await ctx.yAsset.balanceOf(ctx.proTokenUnmintHandlerAddress),
            ).to.equal(0n);

            // Bob still holds his proToken
            expect(await ctx.proToken.balanceOf(bob.address)).to.equal(bobDeposit);
        });
    });

    // =======================================================================
    // Receiver-aware mint
    // =======================================================================
    describe("Mint to alternate receiver", function () {
        async function setup() {
            const ctx = await fullProtocolFixture();
            await authorizeBackend(ctx);
            return ctx;
        }

        it("Alice deposits yAsset but Bob receives the proToken", async function () {
            const ctx = await loadFixture(setup);
            const alice = ctx.accounts.user1;
            const bob = ctx.accounts.user2;

            await ctx.yAsset.mint(alice.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(alice)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS);

            // Create mint request with bob as receiver
            await ctx.proTokenOperations
                .connect(alice)
                .createMintRequest(
                    ctx.yAssetAddress,
                    HUNDRED_TOKENS,
                    0n,
                    bob.address,
                );

            const proofData: ProofData = {
                requestId: 0n,
                user: alice.address,
                receiver: bob.address,
                yAsset: ctx.yAssetAddress,
                amount: HUNDRED_TOKENS,
                minAmountOut: 0n,
                proofKind: ProofKind.PROOF_OF_APPROVE,
            };
            const proof = await signMintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                proofData,
            );

            await ctx.proTokenOperations
                .connect(alice)
                .finalizeMintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof);

            // Bob receives proToken, Alice does not
            expect(await ctx.proToken.balanceOf(bob.address)).to.equal(HUNDRED_TOKENS);
            expect(await ctx.proToken.balanceOf(alice.address)).to.equal(0n);
            expect(await ctx.proToken.totalSupply()).to.equal(HUNDRED_TOKENS);
        });
    });
});
