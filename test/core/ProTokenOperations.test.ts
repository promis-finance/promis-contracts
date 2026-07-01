import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import {
    ZERO_ADDRESS,
    ONE_TOKEN,
    HUNDRED_TOKENS,
    THOUSAND_TOKENS,
    VERSION_1_0_0,
    DECIMALS_18,
    DECIMALS_6,
    ONE_USD,
    ONE_PERCENT_WAD,
    ERRORS,
    EVENTS,
} from "../helpers/constants";
import { fullProtocolFixture, FullProtocolFixture } from "../helpers/fixtures";
import {
    deployMintableERC20,
    deployYAssetOperationsHandler,
    createDefaultYAssetSettings,
    getTestAccounts,
} from "../helpers/deploy";
import {
    signMintProof,
    signUnmintProof,
    ProofKind,
    ProofData,
} from "../helpers/proofs";

// ---------------------------------------------------------------------------
// ProTokenOperations — unit tests
//
// Reflects the rewritten contract:
//   - LST price-deviation-threshold functions REMOVED (deviation is global via
//     Settings.setOracleAggregationSettings).
//   - Authority (EIP-712 signer) lives in ProTokenSettings, not Operations.
//   - Min deposit/withdraw floors (minDepositBase / minWithdrawBase) seeded to
//     100e18 in initialize; enforced at request creation. minimumUnmintAmount
//     (InsufficientUnmintAmount) is gone, replaced by BelowMinWithdraw.
//   - New strategist paths: strategicMint / strategicUnmint (onlyStrategyVault).
//   - INSTANT/QUEUED UNMINT BRANCHING: both finalizeUnmintRequest (user) and
//     strategicUnmint branch on YAssetOperationsHandler.previewPayOut(amount).
//     If sufficient liquidity exists, the payout happens in-tx and the
//     ProTokenUnmintInstant / StrategicUnmintInstant event fires. Otherwise the
//     request is queued in ProTokenUnmintHandler (ProTokenUnmintQueued /
//     StrategicUnmintQueued event).
//
// NOTE on amounts: HUNDRED_TOKENS == 100e18 sits exactly at the 100e18 base
// floor, so a 1:1-priced 18-dec yAsset deposit of HUNDRED_TOKENS passes
// (>= 100). Sub-floor amounts revert BelowMinDeposit / BelowMinWithdraw.
//
// NOTE on default fixture: no yield protocol handlers are configured, so yAsset
// transferred into YAssetOperationsHandler stays unallocated. previewPayOut
// therefore returns true for amounts up to that pool and unmints route to the
// INSTANT branch by default. Tests that want the QUEUED branch first drain the
// unallocated balance via drainYAssetOps().
// ---------------------------------------------------------------------------

/**
 * Drain all unallocated yAsset from YAssetOperationsHandler. With no yield
 * protocol handlers in the default fixture, this empties the pool previewPayOut
 * reads from, so the next unmint cannot be paid instantly and falls through to
 * the QUEUED branch (which creates a request in ProTokenUnmintHandler).
 */
async function drainYAssetOps(ctx: FullProtocolFixture) {
    const balance = await ctx.yAsset.balanceOf(ctx.yAssetOperationsHandlerAddress);
    if (balance === 0n) return;
    await ctx.yAssetOperationsHandler
        .connect(ctx.accounts.admin)
        .withdrawalYieldAssets(ZERO_ADDRESS, balance);
}

describe("ProTokenOperations", function () {
    // =======================================================================
    // Constants
    // =======================================================================
    describe("Constants", function () {
        it("VERSION = 1_00_00", async function () {
            const { proTokenOperations } = await loadFixture(fullProtocolFixture);
            expect(await proTokenOperations.VERSION()).to.equal(VERSION_1_0_0);
        });
    });

    // =======================================================================
    // initialize
    // =======================================================================
    describe("initialize()", function () {
        it("wires proTokenSettings (admin-only path works) and seeds min floors", async function () {
            const { proTokenOperations, accounts } =
                await loadFixture(fullProtocolFixture);

            // Floors seeded to 100e18 at init.
            expect(await proTokenOperations.minDepositBase()).to.equal(HUNDRED_TOKENS);
            expect(await proTokenOperations.minWithdrawBase()).to.equal(HUNDRED_TOKENS);

            // onlyAdmin path proves proTokenSettings is wired (it reads getAdmin()).
            await expect(
                proTokenOperations
                    .connect(accounts.admin)
                    .setMinBases(HUNDRED_TOKENS, HUNDRED_TOKENS)
            ).to.not.be.reverted;
        });

        it("reverts on zero proTokenSettings address", async function () {
            const Factory = await ethers.getContractFactory("ProTokenOperations");
            await expect(
                upgrades.deployProxy(Factory, [ZERO_ADDRESS], { kind: "uups" })
            ).to.be.revertedWithCustomError(Factory, ERRORS.ZeroAddress);
        });

        it("reverts on re-initialization", async function () {
            const { proTokenOperations, proTokenSettingsAddress } =
                await loadFixture(fullProtocolFixture);
            await expect(
                proTokenOperations.initialize(proTokenSettingsAddress)
            ).to.be.revertedWithCustomError(
                proTokenOperations,
                ERRORS.InvalidInitialization
            );
        });

        it("implementation contract has initializers disabled", async function () {
            const { proTokenOperations } = await loadFixture(fullProtocolFixture);
            const implAddress = await upgrades.erc1967.getImplementationAddress(
                await proTokenOperations.getAddress()
            );
            const impl = await ethers.getContractAt("ProTokenOperations", implAddress);
            await expect(
                impl.initialize(ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(impl, ERRORS.InvalidInitialization);
        });
    });

    // =======================================================================
    // setMinBases
    // =======================================================================
    describe("setMinBases()", function () {
        it("admin can update both floors and emits events", async function () {
            const { proTokenOperations, accounts } = await loadFixture(fullProtocolFixture);
            const newDeposit = HUNDRED_TOKENS * 2n;
            const newWithdraw = HUNDRED_TOKENS * 3n;

            const tx = proTokenOperations
                .connect(accounts.admin)
                .setMinBases(newDeposit, newWithdraw);

            await expect(tx)
                .to.emit(proTokenOperations, EVENTS.MinDepositBaseSet)
                .withArgs(HUNDRED_TOKENS, newDeposit);
            await expect(tx)
                .to.emit(proTokenOperations, EVENTS.MinWithdrawBaseSet)
                .withArgs(HUNDRED_TOKENS, newWithdraw);

            expect(await proTokenOperations.minDepositBase()).to.equal(newDeposit);
            expect(await proTokenOperations.minWithdrawBase()).to.equal(newWithdraw);
        });

        it("reverts if either floor is zero (InvalidMinBases)", async function () {
            const { proTokenOperations, accounts } = await loadFixture(fullProtocolFixture);
            await expect(
                proTokenOperations.connect(accounts.admin).setMinBases(0n, HUNDRED_TOKENS)
            ).to.be.revertedWithCustomError(proTokenOperations, ERRORS.InvalidMinBases);
            await expect(
                proTokenOperations.connect(accounts.admin).setMinBases(HUNDRED_TOKENS, 0n)
            ).to.be.revertedWithCustomError(proTokenOperations, ERRORS.InvalidMinBases);
        });

        it("reverts when called by non-admin", async function () {
            const { proTokenOperations, accounts } = await loadFixture(fullProtocolFixture);
            await expect(
                proTokenOperations
                    .connect(accounts.operator)
                    .setMinBases(HUNDRED_TOKENS, HUNDRED_TOKENS)
            ).to.be.revertedWithCustomError(proTokenOperations, ERRORS.NotAdmin);
        });
    });

    // =======================================================================
    // createMintRequest
    // =======================================================================
    describe("createMintRequest()", function () {
        async function setupApprovedYAsset() {
            const ctx = await fullProtocolFixture();
            await ctx.yAsset.mint(ctx.accounts.user1.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS);
            return ctx;
        }

        it("happy path: transfers yAsset in and stores request", async function () {
            const ctx = await loadFixture(setupApprovedYAsset);

            const beforeOps = await ctx.yAsset.balanceOf(ctx.proTokenOperationsAddress);
            const beforeUser = await ctx.yAsset.balanceOf(ctx.accounts.user1.address);

            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createMintRequest(ctx.yAssetAddress, HUNDRED_TOKENS, 0n, ZERO_ADDRESS);

            const afterOps = await ctx.yAsset.balanceOf(ctx.proTokenOperationsAddress);
            const afterUser = await ctx.yAsset.balanceOf(ctx.accounts.user1.address);

            expect(afterOps - beforeOps).to.equal(HUNDRED_TOKENS);
            expect(beforeUser - afterUser).to.equal(HUNDRED_TOKENS);

            const req = await ctx.proTokenOperations.mintRequests(0);
            expect(req.yAsset).to.equal(ctx.yAssetAddress);
            expect(req.amount).to.equal(HUNDRED_TOKENS);
            expect(req.user).to.equal(ctx.accounts.user1.address);
            expect(req.status).to.equal(1n); // PENDING
        });

        it("emits MintRequestCreated event", async function () {
            const ctx = await loadFixture(setupApprovedYAsset);
            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .createMintRequest(
                        ctx.yAssetAddress,
                        HUNDRED_TOKENS,
                        ONE_TOKEN,
                        ctx.accounts.user2.address
                    )
            )
                .to.emit(ctx.proTokenOperations, EVENTS.MintRequestCreated)
                .withArgs(
                    0n,
                    ctx.accounts.user1.address,
                    ctx.yAssetAddress,
                    HUNDRED_TOKENS,
                    ONE_TOKEN,
                    ctx.accounts.user2.address
                );
        });

        it("increments requestID across requests", async function () {
            const ctx = await loadFixture(setupApprovedYAsset);

            await ctx.yAsset.mint(ctx.accounts.user1.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS * 2n);

            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createMintRequest(ctx.yAssetAddress, HUNDRED_TOKENS, 0n, ZERO_ADDRESS);
            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createMintRequest(ctx.yAssetAddress, HUNDRED_TOKENS, 0n, ZERO_ADDRESS);

            const req0 = await ctx.proTokenOperations.mintRequests(0);
            const req1 = await ctx.proTokenOperations.mintRequests(1);
            expect(req0.status).to.equal(1n);
            expect(req1.status).to.equal(1n);
        });

        it("reverts on zero yAsset", async function () {
            const { proTokenOperations, accounts } = await loadFixture(fullProtocolFixture);
            await expect(
                proTokenOperations
                    .connect(accounts.user1)
                    .createMintRequest(ZERO_ADDRESS, HUNDRED_TOKENS, 0n, ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(proTokenOperations, ERRORS.ZeroAddress);
        });

        it("reverts on zero amount", async function () {
            const { proTokenOperations, yAssetAddress, accounts } =
                await loadFixture(fullProtocolFixture);
            await expect(
                proTokenOperations
                    .connect(accounts.user1)
                    .createMintRequest(yAssetAddress, 0n, 0n, ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(proTokenOperations, ERRORS.ZeroAmount);
        });

        it("reverts on deposit below the min floor (BelowMinDeposit)", async function () {
            const ctx = await loadFixture(setupApprovedYAsset);
            // 1 wei of an 18-dec, $1 yAsset is far below the 100e18 floor.
            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .createMintRequest(ctx.yAssetAddress, 1n, 0n, ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(
                ctx.proTokenOperations,
                ERRORS.BelowMinDeposit
            );
        });

        it("reverts when yAsset is not registered in Settings", async function () {
            const { proTokenOperations, accounts } = await loadFixture(fullProtocolFixture);
            const unknownAsset = await deployMintableERC20("Unknown", "UNK", DECIMALS_18);
            await expect(
                proTokenOperations
                    .connect(accounts.user1)
                    .createMintRequest(
                        await unknownAsset.getAddress(),
                        HUNDRED_TOKENS,
                        0n,
                        ZERO_ADDRESS
                    )
            ).to.be.reverted;
        });

        it("reverts when yAsset is disabled", async function () {
            const ctx = await loadFixture(fullProtocolFixture);

            const settings = createDefaultYAssetSettings(ctx.yAssetOperationsHandlerAddress);
            const disabledSettings = { ...settings, isEnabled: false };

            await ctx.proTokenSettings.connect(ctx.accounts.admin).setUnmintYAssets([]);
            await ctx.proTokenSettings
                .connect(ctx.accounts.admin)
                .setYAsset(ctx.yAssetAddress, disabledSettings);

            await ctx.yAsset.mint(ctx.accounts.user1.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS);

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .createMintRequest(ctx.yAssetAddress, HUNDRED_TOKENS, 0n, ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(
                ctx.proTokenOperations,
                ERRORS.YAssetNotEnabled
            );
        });

        it("reverts when yAsset is paused at the settings level", async function () {
            const ctx = await loadFixture(fullProtocolFixture);

            await ctx.proTokenSettings.connect(ctx.accounts.admin).setUnmintYAssets([]);

            const settings = createDefaultYAssetSettings(ctx.yAssetOperationsHandlerAddress);
            const pausedSettings = { ...settings, isPaused: true };
            await ctx.proTokenSettings
                .connect(ctx.accounts.admin)
                .setYAsset(ctx.yAssetAddress, pausedSettings);

            await ctx.yAsset.mint(ctx.accounts.user1.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS);

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .createMintRequest(ctx.yAssetAddress, HUNDRED_TOKENS, 0n, ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(
                ctx.proTokenOperations,
                ERRORS.YAssetPaused
            );
        });

        it("reverts when protocol is globally paused", async function () {
            const { proTokenOperations, proTokenSettings, yAssetAddress, accounts } =
                await loadFixture(fullProtocolFixture);
            await proTokenSettings.connect(accounts.admin).pause();

            await expect(
                proTokenOperations
                    .connect(accounts.user1)
                    .createMintRequest(yAssetAddress, HUNDRED_TOKENS, 0n, ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(proTokenOperations, ERRORS.Paused);
        });
    });

    // =======================================================================
    // finalizeMintRequest
    // =======================================================================
    describe("finalizeMintRequest()", function () {
        async function setupPendingMintRequest() {
            const ctx = await fullProtocolFixture();

            // Authority lives in Settings now.
            await ctx.proTokenSettings
                .connect(ctx.accounts.admin)
                .setAuthority(ctx.accounts.authority.address, true);

            await ctx.yAsset.mint(ctx.accounts.user1.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS);
            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createMintRequest(ctx.yAssetAddress, HUNDRED_TOKENS, 0n, ZERO_ADDRESS);

            const proofData: ProofData = {
                requestId: 0n,
                user: ctx.accounts.user1.address,
                receiver: ZERO_ADDRESS,
                yAsset: ctx.yAssetAddress,
                amount: HUNDRED_TOKENS,
                minAmountOut: 0n,
                proofKind: ProofKind.PROOF_OF_APPROVE,
            };

            return { ...ctx, proofData };
        }

        it("APPROVE: mints proTokens and routes yAsset to handler", async function () {
            const ctx = await loadFixture(setupPendingMintRequest);

            const proof = await signMintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                ctx.proofData
            );

            const proTokenBefore = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            const handlerBefore = await ctx.yAsset.balanceOf(ctx.yAssetOperationsHandlerAddress);

            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .finalizeMintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof);

            const proTokenAfter = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            const handlerAfter = await ctx.yAsset.balanceOf(ctx.yAssetOperationsHandlerAddress);

            expect(proTokenAfter).to.be.gt(proTokenBefore);
            expect(handlerAfter - handlerBefore).to.equal(HUNDRED_TOKENS);

            const req = await ctx.proTokenOperations.mintRequests(0);
            expect(req.status).to.equal(2n); // EXECUTED
        });

        it("APPROVE: mints to receiver when receiver is set", async function () {
            const ctx = await fullProtocolFixture();
            await ctx.proTokenSettings
                .connect(ctx.accounts.admin)
                .setAuthority(ctx.accounts.authority.address, true);

            await ctx.yAsset.mint(ctx.accounts.user1.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS);
            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createMintRequest(
                    ctx.yAssetAddress,
                    HUNDRED_TOKENS,
                    0n,
                    ctx.accounts.user2.address
                );

            const proofData: ProofData = {
                requestId: 0n,
                user: ctx.accounts.user1.address,
                receiver: ctx.accounts.user2.address,
                yAsset: ctx.yAssetAddress,
                amount: HUNDRED_TOKENS,
                minAmountOut: 0n,
                proofKind: ProofKind.PROOF_OF_APPROVE,
            };

            const proof = await signMintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                proofData
            );

            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .finalizeMintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof);

            expect(await ctx.proToken.balanceOf(ctx.accounts.user2.address)).to.be.gt(0);
            expect(await ctx.proToken.balanceOf(ctx.accounts.user1.address)).to.equal(0);
        });

        it("APPROVE: emits MintRequestFinalized and ProTokenMint events", async function () {
            const ctx = await loadFixture(setupPendingMintRequest);
            const proof = await signMintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                ctx.proofData
            );

            const tx = ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .finalizeMintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof);

            await expect(tx).to.emit(ctx.proTokenOperations, EVENTS.MintRequestFinalized);
            await expect(tx).to.emit(ctx.proTokenOperations, EVENTS.ProTokenMint);
        });

        it("RETURN: refunds yAsset to user", async function () {
            const ctx = await loadFixture(setupPendingMintRequest);

            const returnData = { ...ctx.proofData, proofKind: ProofKind.PROOF_OF_RETURN };
            const proof = await signMintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                returnData
            );

            const userBefore = await ctx.yAsset.balanceOf(ctx.accounts.user1.address);

            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .finalizeMintRequest(0n, ProofKind.PROOF_OF_RETURN, proof);

            const userAfter = await ctx.yAsset.balanceOf(ctx.accounts.user1.address);
            expect(userAfter - userBefore).to.equal(HUNDRED_TOKENS);
            expect(await ctx.proToken.balanceOf(ctx.accounts.user1.address)).to.equal(0);
        });

        it("reverts when called twice (RequestNotPending)", async function () {
            const ctx = await loadFixture(setupPendingMintRequest);
            const proof = await signMintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                ctx.proofData
            );

            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .finalizeMintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof);

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .finalizeMintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof)
            ).to.be.revertedWithCustomError(
                ctx.proTokenOperations,
                ERRORS.RequestNotPending
            );
        });

        it("reverts when finalizing a non-existent request (VOID status)", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await ctx.proTokenSettings
                .connect(ctx.accounts.admin)
                .setAuthority(ctx.accounts.authority.address, true);

            const proofData: ProofData = {
                requestId: 0n,
                user: ctx.accounts.user1.address,
                receiver: ZERO_ADDRESS,
                yAsset: ctx.yAssetAddress,
                amount: HUNDRED_TOKENS,
                minAmountOut: 0n,
                proofKind: ProofKind.PROOF_OF_APPROVE,
            };
            const proof = await signMintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                proofData
            );

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .finalizeMintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof)
            ).to.be.revertedWithCustomError(
                ctx.proTokenOperations,
                ERRORS.RequestNotPending
            );
        });

        it("reverts when called by non-owner of the request", async function () {
            const ctx = await loadFixture(setupPendingMintRequest);
            const proof = await signMintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                ctx.proofData
            );

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user2)
                    .finalizeMintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof)
            ).to.be.revertedWithCustomError(
                ctx.proTokenOperations,
                ERRORS.Unauthorized
            );
        });

        it("reverts when proof is signed by an unauthorized address", async function () {
            const ctx = await loadFixture(setupPendingMintRequest);
            const proof = await signMintProof(
                ctx.accounts.attacker,
                ctx.proTokenOperationsAddress,
                ctx.proofData
            );

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .finalizeMintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof)
            ).to.be.revertedWithCustomError(
                ctx.proTokenOperations,
                ERRORS.InvalidAuthority
            );
        });

        it("reverts when proof data does not match request", async function () {
            const ctx = await loadFixture(setupPendingMintRequest);
            const tampered = { ...ctx.proofData, amount: HUNDRED_TOKENS + 1n };
            const proof = await signMintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                tampered
            );

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .finalizeMintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof)
            ).to.be.revertedWithCustomError(
                ctx.proTokenOperations,
                ERRORS.InvalidAuthority
            );
        });

        it("reverts on slippage (InsufficientAmountOut)", async function () {
            const ctx = await fullProtocolFixture();
            await ctx.proTokenSettings
                .connect(ctx.accounts.admin)
                .setAuthority(ctx.accounts.authority.address, true);

            await ctx.yAsset.mint(ctx.accounts.user1.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS);
            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createMintRequest(
                    ctx.yAssetAddress,
                    HUNDRED_TOKENS,
                    THOUSAND_TOKENS,
                    ZERO_ADDRESS
                );

            const proofData: ProofData = {
                requestId: 0n,
                user: ctx.accounts.user1.address,
                receiver: ZERO_ADDRESS,
                yAsset: ctx.yAssetAddress,
                amount: HUNDRED_TOKENS,
                minAmountOut: THOUSAND_TOKENS,
                proofKind: ProofKind.PROOF_OF_APPROVE,
            };
            const proof = await signMintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                proofData
            );

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .finalizeMintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof)
            ).to.be.revertedWithCustomError(
                ctx.proTokenOperations,
                ERRORS.InsufficientAmountOut
            );
        });

        it("reverts when protocol is globally paused", async function () {
            const ctx = await loadFixture(setupPendingMintRequest);
            await ctx.proTokenSettings.connect(ctx.accounts.admin).pause();

            const proof = await signMintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                ctx.proofData
            );

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .finalizeMintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof)
            ).to.be.revertedWithCustomError(ctx.proTokenOperations, ERRORS.Paused);
        });
    });

    // =======================================================================
    // simulateMintProToken
    // =======================================================================
    describe("simulateMintProToken()", function () {
        it("returns a positive mint amount for a valid yAsset", async function () {
            const { proTokenOperations, yAssetAddress, accounts } =
                await loadFixture(fullProtocolFixture);

            const mintAmount = await proTokenOperations
                .connect(accounts.user1)
                .simulateMintProToken.staticCall(yAssetAddress, HUNDRED_TOKENS);

            expect(mintAmount).to.be.gt(0n);
        });

        it("reverts when yAsset is not registered", async function () {
            const { proTokenOperations, accounts } = await loadFixture(fullProtocolFixture);
            const unknown = await deployMintableERC20("Unknown", "UNK", DECIMALS_18);
            await expect(
                proTokenOperations
                    .connect(accounts.user1)
                    .simulateMintProToken(await unknown.getAddress(), HUNDRED_TOKENS)
            ).to.be.reverted;
        });

        it("reverts when protocol is paused", async function () {
            const { proTokenOperations, proTokenSettings, yAssetAddress, accounts } =
                await loadFixture(fullProtocolFixture);
            await proTokenSettings.connect(accounts.admin).pause();
            await expect(
                proTokenOperations
                    .connect(accounts.user1)
                    .simulateMintProToken(yAssetAddress, HUNDRED_TOKENS)
            ).to.be.revertedWithCustomError(proTokenOperations, ERRORS.Paused);
        });
    });

    // =======================================================================
    // createUnmintRequest
    // =======================================================================
    describe("createUnmintRequest()", function () {
        async function setupUserWithProTokens() {
            const ctx = await fullProtocolFixture();

            await ctx.proTokenSettings
                .connect(ctx.accounts.admin)
                .setAuthority(ctx.accounts.authority.address, true);

            await ctx.yAsset.mint(ctx.accounts.user1.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS);

            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createMintRequest(ctx.yAssetAddress, HUNDRED_TOKENS, 0n, ZERO_ADDRESS);

            const proofData: ProofData = {
                requestId: 0n,
                user: ctx.accounts.user1.address,
                receiver: ZERO_ADDRESS,
                yAsset: ctx.yAssetAddress,
                amount: HUNDRED_TOKENS,
                minAmountOut: 0n,
                proofKind: ProofKind.PROOF_OF_APPROVE,
            };
            const proof = await signMintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                proofData
            );

            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .finalizeMintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof);

            const proTokenBalance = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            return { ...ctx, proTokenBalance };
        }

        it("happy path: transfers proTokens in and stores request", async function () {
            const ctx = await loadFixture(setupUserWithProTokens);

            const balanceBefore = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            const amount = balanceBefore; // full balance, well above the 100e18 floor

            await ctx.proToken
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, amount);

            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createUnmintRequest(ctx.yAssetAddress, amount, 0n, ZERO_ADDRESS);

            expect(await ctx.proToken.balanceOf(ctx.accounts.user1.address)).to.equal(
                balanceBefore - amount
            );

            const req = await ctx.proTokenOperations.unmintRequests(0);
            expect(req.yAsset).to.equal(ctx.yAssetAddress);
            expect(req.amount).to.equal(amount);
            expect(req.user).to.equal(ctx.accounts.user1.address);
            expect(req.status).to.equal(1n); // PENDING
        });

        it("emits UnmintRequestCreated event", async function () {
            const ctx = await loadFixture(setupUserWithProTokens);
            const amount = ctx.proTokenBalance;
            await ctx.proToken
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, amount);

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .createUnmintRequest(ctx.yAssetAddress, amount, 0n, ZERO_ADDRESS)
            )
                .to.emit(ctx.proTokenOperations, EVENTS.UnmintRequestCreated)
                .withArgs(
                    0n,
                    ctx.accounts.user1.address,
                    ctx.yAssetAddress,
                    amount,
                    0n,
                    ZERO_ADDRESS
                );
        });

        it("reverts on zero amount", async function () {
            const { proTokenOperations, yAssetAddress, accounts } =
                await loadFixture(fullProtocolFixture);
            await expect(
                proTokenOperations
                    .connect(accounts.user1)
                    .createUnmintRequest(yAssetAddress, 0n, 0n, ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(proTokenOperations, ERRORS.ZeroAmount);
        });

        it("reverts when yAsset is not in unmint list", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await ctx.proTokenSettings.connect(ctx.accounts.admin).setUnmintYAssets([]);

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .createUnmintRequest(ctx.yAssetAddress, HUNDRED_TOKENS, 0n, ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(
                ctx.proTokenOperations,
                ERRORS.InvalidUnmintAsset
            );
        });

        it("reverts on withdrawal below the min floor (BelowMinWithdraw)", async function () {
            const ctx = await loadFixture(setupUserWithProTokens);
            // 1 wei of proUSD is far below the 100e18 withdraw floor.
            await ctx.proToken
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, 1n);

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .createUnmintRequest(ctx.yAssetAddress, 1n, 0n, ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(
                ctx.proTokenOperations,
                ERRORS.BelowMinWithdraw
            );
        });

        it("reverts when protocol is globally paused", async function () {
            const { proTokenOperations, proTokenSettings, yAssetAddress, accounts } =
                await loadFixture(fullProtocolFixture);
            await proTokenSettings.connect(accounts.admin).pause();

            await expect(
                proTokenOperations
                    .connect(accounts.user1)
                    .createUnmintRequest(yAssetAddress, HUNDRED_TOKENS, 0n, ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(proTokenOperations, ERRORS.Paused);
        });
    });

    // =======================================================================
    // finalizeUnmintRequest
    //
    // The branching (instant vs queued) lives inside _executeUnmint after the
    // proUSD burn. The default fixture has no yield protocol handlers, so yAsset
    // sits unallocated on yOps and previewPayOut returns true → INSTANT path.
    // Queued-path tests below first drain yOps via drainYAssetOps().
    // =======================================================================
    describe("finalizeUnmintRequest()", function () {
        async function setupPendingUnmintRequest() {
            const ctx = await fullProtocolFixture();

            await ctx.proTokenSettings
                .connect(ctx.accounts.admin)
                .setAuthority(ctx.accounts.authority.address, true);

            await ctx.yAsset.mint(ctx.accounts.user1.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS);

            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createMintRequest(ctx.yAssetAddress, HUNDRED_TOKENS, 0n, ZERO_ADDRESS);

            const mintProofData: ProofData = {
                requestId: 0n,
                user: ctx.accounts.user1.address,
                receiver: ZERO_ADDRESS,
                yAsset: ctx.yAssetAddress,
                amount: HUNDRED_TOKENS,
                minAmountOut: 0n,
                proofKind: ProofKind.PROOF_OF_APPROVE,
            };
            const mintProof = await signMintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                mintProofData
            );
            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .finalizeMintRequest(0n, ProofKind.PROOF_OF_APPROVE, mintProof);

            const proTokenAmount = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            await ctx.proToken
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, proTokenAmount);

            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createUnmintRequest(ctx.yAssetAddress, proTokenAmount, 0n, ZERO_ADDRESS);

            const unmintProofData: ProofData = {
                requestId: 0n,
                user: ctx.accounts.user1.address,
                receiver: ZERO_ADDRESS,
                yAsset: ctx.yAssetAddress,
                amount: proTokenAmount,
                minAmountOut: 0n,
                proofKind: ProofKind.PROOF_OF_APPROVE,
            };

            return { ...ctx, proTokenAmount, unmintProofData };
        }

        it("APPROVE: burns proTokens and marks request EXECUTED", async function () {
            const ctx = await loadFixture(setupPendingUnmintRequest);
            const proof = await signUnmintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                ctx.unmintProofData
            );

            const supplyBefore = await ctx.proToken.totalSupply();
            const opsBalanceBefore = await ctx.proToken.balanceOf(
                ctx.proTokenOperationsAddress
            );

            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .finalizeUnmintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof);

            // proUSD burn happens on BOTH branches (instant + queued).
            expect(await ctx.proToken.totalSupply()).to.equal(
                supplyBefore - ctx.proTokenAmount
            );
            expect(await ctx.proToken.balanceOf(ctx.proTokenOperationsAddress)).to.equal(
                opsBalanceBefore - ctx.proTokenAmount
            );

            const req = await ctx.proTokenOperations.unmintRequests(0);
            expect(req.status).to.equal(2n); // EXECUTED
        });

        it("APPROVE (instant): pays yAsset directly to recipient, emits ProTokenUnmintInstant", async function () {
            const ctx = await loadFixture(setupPendingUnmintRequest);
            const proof = await signUnmintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                ctx.unmintProofData
            );

            // No drain → yOps has the minted yAsset → instant path.
            const recipientBefore = await ctx.yAsset.balanceOf(ctx.accounts.user1.address);

            const tx = ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .finalizeUnmintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof);

            await expect(tx).to.emit(
                ctx.proTokenOperations,
                EVENTS.UnmintRequestFinalized
            );
            await expect(tx).to.emit(
                ctx.proTokenOperations,
                EVENTS.ProTokenUnmintInstant
            );

            // Recipient received yAsset directly.
            expect(
                await ctx.yAsset.balanceOf(ctx.accounts.user1.address),
            ).to.be.gt(recipientBefore);

            // No batch created on the unmint handler.
            expect(
                await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(ctx.yAssetAddress),
            ).to.equal(0n);
        });

        it("APPROVE (queued): queues request in unmint handler, emits ProTokenUnmintQueued", async function () {
            const ctx = await loadFixture(setupPendingUnmintRequest);
            const proof = await signUnmintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                ctx.unmintProofData
            );

            // Drain → previewPayOut returns false → queued path.
            await drainYAssetOps(ctx);

            const recipientBefore = await ctx.yAsset.balanceOf(ctx.accounts.user1.address);

            const tx = ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .finalizeUnmintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof);

            await expect(tx).to.emit(
                ctx.proTokenOperations,
                EVENTS.UnmintRequestFinalized
            );
            await expect(tx).to.emit(
                ctx.proTokenOperations,
                EVENTS.ProTokenUnmintQueued
            );
            // The handler emits its own UnmintRequestCreated event inside the same tx.
            await expect(tx).to.emit(
                ctx.proTokenUnmintHandler,
                EVENTS.UnmintRequestCreated
            );

            // Recipient did NOT receive yAsset yet — it's queued.
            expect(
                await ctx.yAsset.balanceOf(ctx.accounts.user1.address),
            ).to.equal(recipientBefore);

            // Handler now has a pending batch.
            expect(
                await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(ctx.yAssetAddress),
            ).to.equal(1n);

            const batch = await ctx.proTokenUnmintHandler.getUnmintBatch(
                ctx.yAssetAddress,
                1n,
            );
            expect(batch.totalAmount).to.be.gt(0n);
            expect(batch.processed).to.equal(false);
        });

        it("APPROVE (queued): emitted handlerRequestId matches the handler's view", async function () {
            const ctx = await loadFixture(setupPendingUnmintRequest);
            const proof = await signUnmintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                ctx.unmintProofData
            );

            await drainYAssetOps(ctx);

            const tx = await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .finalizeUnmintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof);
            const receipt = await tx.wait();

            const queuedEvent = receipt!.logs
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

        it("RETURN: transfers proTokens back to user", async function () {
            const ctx = await loadFixture(setupPendingUnmintRequest);
            const returnData = {
                ...ctx.unmintProofData,
                proofKind: ProofKind.PROOF_OF_RETURN,
            };
            const proof = await signUnmintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                returnData
            );

            const userBefore = await ctx.proToken.balanceOf(ctx.accounts.user1.address);

            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .finalizeUnmintRequest(0n, ProofKind.PROOF_OF_RETURN, proof);

            const userAfter = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            expect(userAfter - userBefore).to.equal(ctx.proTokenAmount);
        });

        it("reverts when called twice", async function () {
            const ctx = await loadFixture(setupPendingUnmintRequest);
            const proof = await signUnmintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                ctx.unmintProofData
            );

            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .finalizeUnmintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof);

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .finalizeUnmintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof)
            ).to.be.revertedWithCustomError(
                ctx.proTokenOperations,
                ERRORS.RequestNotPending
            );
        });

        it("reverts when called by non-owner", async function () {
            const ctx = await loadFixture(setupPendingUnmintRequest);
            const proof = await signUnmintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                ctx.unmintProofData
            );

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user2)
                    .finalizeUnmintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof)
            ).to.be.revertedWithCustomError(
                ctx.proTokenOperations,
                ERRORS.Unauthorized
            );
        });

        it("reverts on signature by unauthorized signer", async function () {
            const ctx = await loadFixture(setupPendingUnmintRequest);
            const proof = await signUnmintProof(
                ctx.accounts.attacker,
                ctx.proTokenOperationsAddress,
                ctx.unmintProofData
            );

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .finalizeUnmintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof)
            ).to.be.revertedWithCustomError(
                ctx.proTokenOperations,
                ERRORS.InvalidAuthority
            );
        });

        it("reverts on slippage", async function () {
            const ctx = await fullProtocolFixture();
            await ctx.proTokenSettings
                .connect(ctx.accounts.admin)
                .setAuthority(ctx.accounts.authority.address, true);

            await ctx.yAsset.mint(ctx.accounts.user1.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS);
            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createMintRequest(ctx.yAssetAddress, HUNDRED_TOKENS, 0n, ZERO_ADDRESS);

            const mintProofData: ProofData = {
                requestId: 0n,
                user: ctx.accounts.user1.address,
                receiver: ZERO_ADDRESS,
                yAsset: ctx.yAssetAddress,
                amount: HUNDRED_TOKENS,
                minAmountOut: 0n,
                proofKind: ProofKind.PROOF_OF_APPROVE,
            };
            const mintProof = await signMintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                mintProofData
            );
            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .finalizeMintRequest(0n, ProofKind.PROOF_OF_APPROVE, mintProof);

            const proTokenAmount = await ctx.proToken.balanceOf(ctx.accounts.user1.address);
            await ctx.proToken
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, proTokenAmount);

            const tooHigh = THOUSAND_TOKENS * 1000n;
            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createUnmintRequest(ctx.yAssetAddress, proTokenAmount, tooHigh, ZERO_ADDRESS);

            const proofData: ProofData = {
                requestId: 0n,
                user: ctx.accounts.user1.address,
                receiver: ZERO_ADDRESS,
                yAsset: ctx.yAssetAddress,
                amount: proTokenAmount,
                minAmountOut: tooHigh,
                proofKind: ProofKind.PROOF_OF_APPROVE,
            };
            const proof = await signUnmintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                proofData
            );

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .finalizeUnmintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof)
            ).to.be.revertedWithCustomError(
                ctx.proTokenOperations,
                ERRORS.InsufficientAmountOut
            );
        });

        it("APPROVE reverts when yAsset has been removed from unmint list", async function () {
            const ctx = await loadFixture(setupPendingUnmintRequest);

            await ctx.proTokenSettings
                .connect(ctx.accounts.admin)
                .setUnmintYAssets([]);

            const proof = await signUnmintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                ctx.unmintProofData
            );

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .finalizeUnmintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof)
            ).to.be.revertedWithCustomError(
                ctx.proTokenOperations,
                ERRORS.InvalidUnmintAsset
            );
        });

        it("RETURN succeeds even when yAsset has been removed from unmint list", async function () {
            const ctx = await loadFixture(setupPendingUnmintRequest);

            await ctx.proTokenSettings
                .connect(ctx.accounts.admin)
                .setUnmintYAssets([]);

            const returnData = {
                ...ctx.unmintProofData,
                proofKind: ProofKind.PROOF_OF_RETURN,
            };
            const proof = await signUnmintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                returnData
            );

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .finalizeUnmintRequest(0n, ProofKind.PROOF_OF_RETURN, proof)
            ).to.not.be.reverted;
        });

        it("reverts when protocol is globally paused", async function () {
            const ctx = await loadFixture(setupPendingUnmintRequest);
            await ctx.proTokenSettings.connect(ctx.accounts.admin).pause();

            const proof = await signUnmintProof(
                ctx.accounts.authority,
                ctx.proTokenOperationsAddress,
                ctx.unmintProofData
            );

            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.user1)
                    .finalizeUnmintRequest(0n, ProofKind.PROOF_OF_APPROVE, proof)
            ).to.be.revertedWithCustomError(ctx.proTokenOperations, ERRORS.Paused);
        });
    });

    // =======================================================================
    // strategicMint / strategicUnmint (onlyStrategyVault)
    //
    // These are privileged paths callable only by the configured StrategyVault.
    // strategicUnmint also branches instant/queued via previewPayOut, mirroring
    // the user finalizeUnmintRequest path but without proof verification or the
    // minWithdrawBase floor.
    // =======================================================================
    describe("strategicMint() / strategicUnmint()", function () {
        it("strategicMint reverts for a non-vault caller", async function () {
            const { proTokenOperations, yAssetAddress, accounts } =
                await loadFixture(fullProtocolFixture);
            await expect(
                proTokenOperations
                    .connect(accounts.attacker)
                    .strategicMint(HUNDRED_TOKENS, yAssetAddress)
            ).to.be.revertedWithCustomError(
                proTokenOperations,
                ERRORS.NotStrategyVault
            );
        });

        it("strategicUnmint reverts for a non-vault caller", async function () {
            const { proTokenOperations, yAssetAddress, accounts } =
                await loadFixture(fullProtocolFixture);
            await expect(
                proTokenOperations
                    .connect(accounts.attacker)
                    .strategicUnmint(yAssetAddress, HUNDRED_TOKENS, accounts.user1.address)
            ).to.be.revertedWithCustomError(
                proTokenOperations,
                ERRORS.NotStrategyVault
            );
        });

        it("strategicMint reverts on zero amount (from the vault)", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            // strategyVault is the registered vault signer in the fixture.
            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.strategyVault)
                    .strategicMint(0n, ctx.yAssetAddress)
            ).to.be.revertedWithCustomError(ctx.proTokenOperations, ERRORS.ZeroAmount);
        });

        it("strategicMint reverts on zero yAsset (from the vault)", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.strategyVault)
                    .strategicMint(HUNDRED_TOKENS, ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(ctx.proTokenOperations, ERRORS.ZeroAddress);
        });

        it("strategicMint: pulls yAsset from the vault, routes it, and mints proUSD to the vault", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            const vault = ctx.accounts.strategyVault;

            // Fund the vault with yAsset and approve Operations to pull it.
            await ctx.yAsset.mint(vault.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(vault)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS);

            const handlerBefore = await ctx.yAsset.balanceOf(ctx.yAssetOperationsHandlerAddress);
            const vaultProBefore = await ctx.proToken.balanceOf(vault.address);

            const minted = await ctx.proTokenOperations
                .connect(vault)
                .strategicMint.staticCall(HUNDRED_TOKENS, ctx.yAssetAddress);

            await expect(
                ctx.proTokenOperations
                    .connect(vault)
                    .strategicMint(HUNDRED_TOKENS, ctx.yAssetAddress)
            ).to.emit(ctx.proTokenOperations, EVENTS.StrategicMint);

            // yAsset routed to the handler; proUSD minted to the vault (recipient = msg.sender).
            expect(
                (await ctx.yAsset.balanceOf(ctx.yAssetOperationsHandlerAddress)) - handlerBefore
            ).to.equal(HUNDRED_TOKENS);
            expect(
                (await ctx.proToken.balanceOf(vault.address)) - vaultProBefore
            ).to.equal(minted);
            expect(minted).to.be.gt(0n);
        });

        it("strategicUnmint (instant): burns vault's proUSD and pays yAsset to destination, emits StrategicUnmintInstant", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            const vault = ctx.accounts.strategyVault;

            // strategicMint so the vault holds proUSD and the handler holds yAsset (instant available).
            await ctx.yAsset.mint(vault.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(vault)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS);
            await ctx.proTokenOperations
                .connect(vault)
                .strategicMint(HUNDRED_TOKENS, ctx.yAssetAddress);

            const vaultPro = await ctx.proToken.balanceOf(vault.address);
            const dest = ctx.accounts.user1.address;
            const destBefore = await ctx.yAsset.balanceOf(dest);
            const supplyBefore = await ctx.proToken.totalSupply();

            await expect(
                ctx.proTokenOperations
                    .connect(vault)
                    .strategicUnmint(ctx.yAssetAddress, vaultPro, dest)
            ).to.emit(ctx.proTokenOperations, EVENTS.StrategicUnmintInstant);

            // proUSD burned from the vault; yAsset delivered to destination.
            expect(await ctx.proToken.totalSupply()).to.equal(supplyBefore - vaultPro);
            expect(await ctx.yAsset.balanceOf(dest)).to.be.gt(destBefore);

            // No handler batch created — instant path.
            expect(
                await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(ctx.yAssetAddress),
            ).to.equal(0n);
        });

        it("strategicUnmint (queued): burns vault's proUSD and queues request, emits StrategicUnmintQueued", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            const vault = ctx.accounts.strategyVault;

            // strategicMint to seed vault with proUSD.
            await ctx.yAsset.mint(vault.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(vault)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS);
            await ctx.proTokenOperations
                .connect(vault)
                .strategicMint(HUNDRED_TOKENS, ctx.yAssetAddress);

            // Drain yOps so previewPayOut returns false → queued.
            await drainYAssetOps(ctx);

            const vaultPro = await ctx.proToken.balanceOf(vault.address);
            const dest = ctx.accounts.user1.address;
            const destBefore = await ctx.yAsset.balanceOf(dest);
            const supplyBefore = await ctx.proToken.totalSupply();

            const tx = ctx.proTokenOperations
                .connect(vault)
                .strategicUnmint(ctx.yAssetAddress, vaultPro, dest);

            await expect(tx).to.emit(
                ctx.proTokenOperations,
                EVENTS.StrategicUnmintQueued
            );
            await expect(tx).to.emit(
                ctx.proTokenUnmintHandler,
                EVENTS.UnmintRequestCreated
            );

            // proUSD burned regardless of path.
            expect(await ctx.proToken.totalSupply()).to.equal(supplyBefore - vaultPro);
            // destination did NOT receive yAsset yet.
            expect(await ctx.yAsset.balanceOf(dest)).to.equal(destBefore);

            // Handler batch exists for the destination.
            expect(
                await ctx.proTokenUnmintHandler.getCurrentUnmintBatchId(ctx.yAssetAddress),
            ).to.equal(1n);
            const requestId =
                await ctx.proTokenUnmintHandler.getUnmintRequestIdForReceiverInBatch(
                    ctx.yAssetAddress,
                    1n,
                    dest,
                );
            // The first queued request in a fresh fixture has id 0 — don't assert
            // requestId > 0. Confirm the request exists by reading the struct and
            // checking the receiver matches.
            const req = await ctx.proTokenUnmintHandler.getUnmintRequest(
                ctx.yAssetAddress,
                requestId,
            );
            expect(req.receiver).to.equal(dest);
            expect(req.totalAmount).to.be.gt(0n);
        });

        it("strategicUnmint (queued): emitted handlerRequestId matches the handler's view", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            const vault = ctx.accounts.strategyVault;

            await ctx.yAsset.mint(vault.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(vault)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS);
            await ctx.proTokenOperations
                .connect(vault)
                .strategicMint(HUNDRED_TOKENS, ctx.yAssetAddress);

            await drainYAssetOps(ctx);

            const vaultPro = await ctx.proToken.balanceOf(vault.address);
            const dest = ctx.accounts.user1.address;

            const tx = await ctx.proTokenOperations
                .connect(vault)
                .strategicUnmint(ctx.yAssetAddress, vaultPro, dest);
            const receipt = await tx.wait();

            const queuedEvent = receipt!.logs
                .map((l) => {
                    try {
                        return ctx.proTokenOperations.interface.parseLog(l as never);
                    } catch {
                        return null;
                    }
                })
                .find((e) => e?.name === EVENTS.StrategicUnmintQueued);
            expect(queuedEvent).to.not.be.undefined;

            const emittedHandlerRequestId =
                queuedEvent!.args.handlerRequestId as bigint;
            const viewHandlerRequestId =
                await ctx.proTokenUnmintHandler.getUnmintRequestIdForReceiverInBatch(
                    ctx.yAssetAddress,
                    1n,
                    dest,
                );

            expect(emittedHandlerRequestId).to.equal(viewHandlerRequestId);
        });

        it("strategicUnmint: no minWithdrawBase floor (sub-floor amount succeeds where user path would revert)", async function () {
            // The user path enforces minWithdrawBase at createUnmintRequest; strategicUnmint
            // intentionally skips it because the vault is privileged. This test exercises
            // that asymmetry: a 1-wei strategist unmint succeeds end-to-end (instant path
            // with sufficient yOps liquidity), while the same amount from a user would
            // revert with BelowMinWithdraw at request creation.
            const ctx = await loadFixture(fullProtocolFixture);
            const vault = ctx.accounts.strategyVault;

            // Seed: vault has proUSD, handler has yAsset (instant available).
            await ctx.yAsset.mint(vault.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(vault)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS);
            await ctx.proTokenOperations
                .connect(vault)
                .strategicMint(HUNDRED_TOKENS, ctx.yAssetAddress);

            // 1 wei is far below the 100e18 floor — no revert from strategist path.
            await expect(
                ctx.proTokenOperations
                    .connect(vault)
                    .strategicUnmint(ctx.yAssetAddress, 1n, ctx.accounts.user1.address)
            ).to.not.be.reverted;
        });

        it("strategicUnmint reverts on zero destination", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.strategyVault)
                    .strategicUnmint(ctx.yAssetAddress, HUNDRED_TOKENS, ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(ctx.proTokenOperations, ERRORS.ZeroAddress);
        });

        it("strategic paths revert when protocol is globally paused", async function () {
            const ctx = await loadFixture(fullProtocolFixture);
            await ctx.proTokenSettings.connect(ctx.accounts.admin).pause();
            await expect(
                ctx.proTokenOperations
                    .connect(ctx.accounts.strategyVault)
                    .strategicMint(HUNDRED_TOKENS, ctx.yAssetAddress)
            ).to.be.revertedWithCustomError(ctx.proTokenOperations, ERRORS.Paused);
        });
    });

    // =======================================================================
    // View functions
    // =======================================================================
    describe("View functions", function () {
        it("minDepositBase / minWithdrawBase are publicly readable", async function () {
            const { proTokenOperations } = await loadFixture(fullProtocolFixture);
            expect(await proTokenOperations.minDepositBase()).to.equal(HUNDRED_TOKENS);
            expect(await proTokenOperations.minWithdrawBase()).to.equal(HUNDRED_TOKENS);
        });

        it("mintRequests is publicly readable", async function () {
            const ctx = await fullProtocolFixture();
            await ctx.yAsset.mint(ctx.accounts.user1.address, HUNDRED_TOKENS);
            await ctx.yAsset
                .connect(ctx.accounts.user1)
                .approve(ctx.proTokenOperationsAddress, HUNDRED_TOKENS);
            await ctx.proTokenOperations
                .connect(ctx.accounts.user1)
                .createMintRequest(ctx.yAssetAddress, HUNDRED_TOKENS, ONE_TOKEN, ZERO_ADDRESS);

            const req = await ctx.proTokenOperations.mintRequests(0);
            expect(req.yAsset).to.equal(ctx.yAssetAddress);
            expect(req.amount).to.equal(HUNDRED_TOKENS);
            expect(req.minAmountOut).to.equal(ONE_TOKEN);
        });
    });

    // =======================================================================
    // _authorizeUpgrade (UUPS)
    // =======================================================================
    describe("_authorizeUpgrade (UUPS)", function () {
        it("admin can upgrade to higher VERSION", async function () {
            const { proTokenOperations, accounts } = await loadFixture(fullProtocolFixture);

            const V2 = await ethers.getContractFactory("MockUpgradeTargetHigherVersion");
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();

            await expect(
                proTokenOperations
                    .connect(accounts.admin)
                    .upgradeToAndCall(await v2Impl.getAddress(), "0x")
            ).to.not.be.reverted;
        });

        it("reverts VersionNotIncremented when new VERSION equals current", async function () {
            const { proTokenOperations, accounts } = await loadFixture(fullProtocolFixture);

            const Same = await ethers.getContractFactory("MockUpgradeTargetSameVersion");
            const sameImpl = await Same.deploy();
            await sameImpl.waitForDeployment();

            await expect(
                proTokenOperations
                    .connect(accounts.admin)
                    .upgradeToAndCall(await sameImpl.getAddress(), "0x")
            )
                .to.be.revertedWithCustomError(
                    proTokenOperations,
                    ERRORS.VersionNotIncremented
                )
                .withArgs(VERSION_1_0_0, VERSION_1_0_0);
        });

        it("reverts VersionNotIncremented when new VERSION is lower", async function () {
            const { proTokenOperations, accounts } = await loadFixture(fullProtocolFixture);

            const Lower = await ethers.getContractFactory("MockUpgradeTargetLowerVersion");
            const lowerImpl = await Lower.deploy();
            await lowerImpl.waitForDeployment();

            await expect(
                proTokenOperations
                    .connect(accounts.admin)
                    .upgradeToAndCall(await lowerImpl.getAddress(), "0x")
            )
                .to.be.revertedWithCustomError(
                    proTokenOperations,
                    ERRORS.VersionNotIncremented
                )
                .withArgs(VERSION_1_0_0, 1n);
        });

        it("reverts NotAdmin when called by operator", async function () {
            const { proTokenOperations, accounts } = await loadFixture(fullProtocolFixture);

            const V2 = await ethers.getContractFactory("MockUpgradeTargetHigherVersion");
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();

            await expect(
                proTokenOperations
                    .connect(accounts.operator)
                    .upgradeToAndCall(await v2Impl.getAddress(), "0x")
            ).to.be.revertedWithCustomError(proTokenOperations, ERRORS.NotAdmin);
        });

        it("reverts NotAdmin when called by random attacker", async function () {
            const { proTokenOperations, accounts } = await loadFixture(fullProtocolFixture);

            const V2 = await ethers.getContractFactory("MockUpgradeTargetHigherVersion");
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();

            await expect(
                proTokenOperations
                    .connect(accounts.attacker)
                    .upgradeToAndCall(await v2Impl.getAddress(), "0x")
            ).to.be.revertedWithCustomError(proTokenOperations, ERRORS.NotAdmin);
        });
    });
});