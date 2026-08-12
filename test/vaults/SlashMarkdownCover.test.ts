import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import {
    ZERO_ADDRESS,
    HUNDRED_TOKENS,
    DECIMALS_6,
    ONE_DAY,
    PROTOKEN_NAME,
    PROTOKEN_SYMBOL,
} from "../helpers/constants";
import {
    deployProTokenSettings,
    deployProToken,
    deployMintableERC20,
    deployYAssetOperationsHandler,
    createDefaultYAssetSettings,
    getTestAccounts,
    TestAccounts,
} from "../helpers/deploy";
import {
    ProToken,
    ProTokenSettings,
    ProTokenPlus,
    ProTokenPlusOperations,
    ProTokenOperations,
    ProTokenUnmintHandler,
    YAssetOperationsHandler,
    StrategyVault,
    MintableERC20,
} from "../../typechain-types";

// ---------------------------------------------------------------------------
// Slash markdown and cover — depeg lifecycle tests
//
// When backing assets are slashed at an external venue (e.g. an Aave shortfall
// event on strategist-deployed funds), the runbook is (under pause, ideally
// batched in one multisig transaction):
//
//   1. admin ProToken.setUSDPrice(lower)    — socialize the loss honestly;
//      mint/unmint immediately price at the marked-down rate
//   2. admin vault.markdownPrice()           — re-anchor the vault's lastPrice
//      to the live price (the monotonic ratchet never lowers it on its own)
//      and MEASURE the per-pool token shortfalls (emits PriceMarkedDown)
//   3. treasury vault.cover(dShort, wShort)  — feed real proUSD into the
//      impaired pools, capped by the deficits markdownPrice recorded
//      impaired pools (external recapitalization; growthProUSD is untouched)
//
// Key properties pinned here:
//   - markdownPrice moves NO tokens and never touches base ledgers — base is
//     what users are owed; the slash changed the backing, not the debt
//   - a slash without cover BLOCKS user withdrawals (reserve stocked at the
//     old price can't stretch to the new tokens-per-dollar rate); cover
//     unblocks them at the marked-down price
//   - cover round-trips: on recovery the ratchet frees exactly the covered
//     amount back as growth — the double-banking regression test
//
// NOTE: ProToken.MIN_USD_PRICE = 1e18, so every slash scenario must first
// appreciate above $1 (advancing the ratchet), then mark down toward $1.
//
// Fixture requirements: deployProTokenSettings takes (admin, operator,
// priceOperator) under the split price-authority model.
//
// PROOF DEADLINES: every EIP-712 proof (DepositProof / WithdrawProof) carries
// a `deadline`, which is part of the signed struct AND passed as the third
// argument to the finalize functions. The flow helpers below sign and pass an
// explicit deadline (a wide TTL so intra-test time travel never expires one).
//
// MERGE: unlockedPositionsToMerge has been removed from deposit/withdraw/relock
// and their proofs — merge is now a standalone unlockedMerge call only.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// EIP-712 deposit/withdraw proofs (ProTokenPlus domain)
// ---------------------------------------------------------------------------

enum VaultProofKind {
    PROOF_OF_APPROVE = 0,
    PROOF_OF_RETURN = 1,
}

const DEPOSIT_PROOF_TYPES = {
    DepositProof: [
        { name: "requestId", type: "uint256" },
        { name: "tierID", type: "uint8" },
        { name: "amount", type: "uint256" },
        { name: "user", type: "address" },
        { name: "deadline", type: "uint256" },
        { name: "proofKind", type: "uint8" },
    ],
};

const WITHDRAW_PROOF_TYPES = {
    WithdrawProof: [
        { name: "requestId", type: "uint256" },
        { name: "positionIDs", type: "uint256[]" },
        { name: "user", type: "address" },
        { name: "deadline", type: "uint256" },
        { name: "proofKind", type: "uint8" },
    ],
};

async function buildVaultDomain(verifyingContract: string) {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    return { name: "ProTokenPlus", version: "1", chainId, verifyingContract };
}

/// Default proof validity window used by the flow helpers. Wide enough that
/// intra-test `time.increase` calls (lock expiry, unbonding) never expire a
/// proof that is finalized immediately after signing.
const PROOF_TTL = BigInt(ONE_DAY);

/// A deadline `ttl` seconds past the current chain time.
async function futureDeadline(ttl: bigint = PROOF_TTL): Promise<bigint> {
    return BigInt(await time.latest()) + ttl;
}

// ---------------------------------------------------------------------------
// Tier constants
// ---------------------------------------------------------------------------

const FLOOR_TIER_ID = 0;
const QUARTERLY_TIER_ID = 1;
const ANNUAL_TIER_ID = 3;

const ONE_DAY_BN = BigInt(ONE_DAY);
const QUARTERLY_DURATION = 90n * ONE_DAY_BN;
const SEMI_ANNUAL_DURATION = 180n * ONE_DAY_BN;
const ANNUAL_DURATION = 365n * ONE_DAY_BN;
const DEFAULT_UNBONDING_PERIOD = 14n * ONE_DAY_BN;

const MIN_DEPOSIT = ethers.parseEther("100");
const QUARTERLY_APR = ethers.parseEther("0.06");
const SEMI_ANNUAL_APR = ethers.parseEther("0.09");
const ANNUAL_APR = ethers.parseEther("0.12");

const USD_PRECISION = 10n ** 18n;

// Slash-scenario prices.
const P_102 = (USD_PRECISION * 102n) / 100n; // $1.02
const P_110 = (USD_PRECISION * 110n) / 100n; // $1.10

// ---------------------------------------------------------------------------
// Fixture — full ProTokenPlus + StrategyVault stack (mirrors the fixture in
// ProTokenPlus.test.ts; kept local because these tests exercise the same
// custody stack from a different angle)
// ---------------------------------------------------------------------------

interface Ctx {
    accounts: TestAccounts & {
        strategist: HardhatEthersSigner;
        yieldRecipient: HardhatEthersSigner;
        priceOperator: HardhatEthersSigner;
    };
    proTokenSettings: ProTokenSettings;
    proTokenSettingsAddress: string;
    proUSD: ProToken;
    proUSDAddress: string;
    proTokenOperations: ProTokenOperations;
    proTokenOperationsAddress: string;
    proTokenUnmintHandler: ProTokenUnmintHandler;
    proTokenUnmintHandlerAddress: string;
    yAsset: MintableERC20;
    yAssetAddress: string;
    yAssetOperationsHandler: YAssetOperationsHandler;
    yAssetOperationsHandlerAddress: string;
    strategyVault: StrategyVault;
    strategyVaultAddress: string;
    proTokenPlus: ProTokenPlus;
    proTokenPlusAddress: string;
    proTokenPlusOperations: ProTokenPlusOperations;
    proTokenPlusOperationsAddress: string;
}

async function slashFixture(): Promise<Ctx> {
    const baseAccounts = await getTestAccounts();

    const allSigners = await ethers.getSigners();
    const accounts = {
        ...baseAccounts,
        strategist: (baseAccounts as any).strategist ?? allSigners[10],
        yieldRecipient: (baseAccounts as any).yieldRecipient ?? allSigners[11],
        priceOperator: (baseAccounts as any).priceOperator ?? allSigners[12],
    } as Ctx["accounts"];

    // --- Settings (3-arg initialize under the split price-authority model) ---
    const proTokenSettings = await deployProTokenSettings(
        accounts.admin,
        accounts.operator,
        accounts.priceOperator,
    );
    const proTokenSettingsAddress = await proTokenSettings.getAddress();

    // --- ProTokenOperations (proUSD's minter) ---
    const ProTokenOperationsFactory = await ethers.getContractFactory("ProTokenOperations");
    const proTokenOperations = (await upgrades.deployProxy(
        ProTokenOperationsFactory,
        [proTokenSettingsAddress],
        { kind: "uups" },
    )) as unknown as ProTokenOperations;
    await proTokenOperations.waitForDeployment();
    const proTokenOperationsAddress = await proTokenOperations.getAddress();

    // --- proUSD ---
    const proUSD = await deployProToken(
        PROTOKEN_NAME,
        PROTOKEN_SYMBOL,
        proTokenSettingsAddress,
        proTokenOperationsAddress,
    );
    const proUSDAddress = await proUSD.getAddress();

    // --- UnmintHandler ---
    const UnmintHandlerFactory = await ethers.getContractFactory("ProTokenUnmintHandler");
    const proTokenUnmintHandler = (await upgrades.deployProxy(
        UnmintHandlerFactory,
        [proTokenSettingsAddress, ONE_DAY],
        { kind: "uups" },
    )) as unknown as ProTokenUnmintHandler;
    await proTokenUnmintHandler.waitForDeployment();
    const proTokenUnmintHandlerAddress = await proTokenUnmintHandler.getAddress();

    // --- yAsset (6-dec USDC-like) + ops handler, generously pre-funded ---
    const yAsset = await deployMintableERC20("USD Coin", "USDC", DECIMALS_6);
    const yAssetAddress = await yAsset.getAddress();
    const yAssetOperationsHandler = await deployYAssetOperationsHandler(
        proTokenSettingsAddress,
        yAssetAddress,
    );
    const yAssetOperationsHandlerAddress = await yAssetOperationsHandler.getAddress();
    await yAsset.mint(yAssetOperationsHandlerAddress, 1_000_000n * 10n ** BigInt(DECIMALS_6));

    // --- Wire Settings BEFORE deploying the vault ---
    await proTokenSettings.connect(accounts.admin).setProToken(proUSDAddress);
    await proTokenSettings.connect(accounts.admin).setProTokenOperations(proTokenOperationsAddress);
    await proTokenSettings.connect(accounts.admin).setProTokenUnmintHandler(proTokenUnmintHandlerAddress);

    const yAssetSettings = createDefaultYAssetSettings(yAssetOperationsHandlerAddress, DECIMALS_6);
    await proTokenSettings.connect(accounts.admin).setYAsset(yAssetAddress, yAssetSettings);
    await proTokenSettings.connect(accounts.admin).setUnmintYAssets([yAssetAddress]);
    await proTokenSettings.connect(accounts.admin).setStrategist(accounts.strategist.address);
    await proTokenSettings.connect(accounts.admin).setAuthority(accounts.authority.address, true);

    // --- ProTokenPlus proxy ---
    const tierIds = [FLOOR_TIER_ID, QUARTERLY_TIER_ID, 2, ANNUAL_TIER_ID];
    const tierConfigs = [
        { name: "Floor", apr: 0n, duration: 0n, minDeposit: 0n, isDepositable: false, isActive: true },
        { name: "Quarterly", apr: QUARTERLY_APR, duration: QUARTERLY_DURATION, minDeposit: MIN_DEPOSIT, isDepositable: true, isActive: true },
        { name: "Semi-Annual", apr: SEMI_ANNUAL_APR, duration: SEMI_ANNUAL_DURATION, minDeposit: MIN_DEPOSIT, isDepositable: true, isActive: true },
        { name: "Annual", apr: ANNUAL_APR, duration: ANNUAL_DURATION, minDeposit: MIN_DEPOSIT, isDepositable: true, isActive: true },
    ];
    const ProTokenPlusFactory = await ethers.getContractFactory("ProTokenPlus");
    const proTokenPlus = (await upgrades.deployProxy(
        ProTokenPlusFactory,
        [proTokenSettingsAddress, proUSDAddress, tierIds, tierConfigs],
        { kind: "uups", unsafeAllow: ["delegatecall"] },
    )) as unknown as ProTokenPlus;
    await proTokenPlus.waitForDeployment();
    const proTokenPlusAddress = await proTokenPlus.getAddress();

    // --- StrategyVault ---
    const StrategyVaultFactory = await ethers.getContractFactory("StrategyVault");
    const strategyVault = (await upgrades.deployProxy(
        StrategyVaultFactory,
        [proTokenSettingsAddress, proTokenPlusAddress],
        { kind: "uups" },
    )) as unknown as StrategyVault;
    await strategyVault.waitForDeployment();
    const strategyVaultAddress = await strategyVault.getAddress();

    await proTokenSettings.connect(accounts.admin).setStrategyVault(strategyVaultAddress);
    await strategyVault.connect(accounts.admin).setYieldRecipient(accounts.yieldRecipient.address);

    // --- Satellite ---
    const ProTokenPlusOperationsFactory = await ethers.getContractFactory("ProTokenPlusOperations");
    const proTokenPlusOperations = (await ProTokenPlusOperationsFactory.deploy()) as unknown as ProTokenPlusOperations;
    await proTokenPlusOperations.waitForDeployment();
    const proTokenPlusOperationsAddress = await proTokenPlusOperations.getAddress();
    await proTokenPlus.connect(accounts.admin).setOperationsHandler(proTokenPlusOperationsAddress);

    // --- Seed users with proUSD; approve ProTokenPlus ---
    const USER_SEED = ethers.parseEther("100000");
    await ethers.provider.send("hardhat_impersonateAccount", [proTokenOperationsAddress]);
    await ethers.provider.send("hardhat_setBalance", [proTokenOperationsAddress, "0xDE0B6B3A7640000"]);
    const opsSigner = await ethers.getSigner(proTokenOperationsAddress);
    await proUSD.connect(opsSigner).mint(accounts.user1.address, USER_SEED);
    await proUSD.connect(opsSigner).mint(accounts.user2.address, USER_SEED);
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [proTokenOperationsAddress]);

    await proUSD.connect(accounts.user1).approve(proTokenPlusAddress, ethers.MaxUint256);
    await proUSD.connect(accounts.user2).approve(proTokenPlusAddress, ethers.MaxUint256);

    return {
        accounts,
        proTokenSettings, proTokenSettingsAddress,
        proUSD, proUSDAddress,
        proTokenOperations, proTokenOperationsAddress,
        proTokenUnmintHandler, proTokenUnmintHandlerAddress,
        yAsset, yAssetAddress,
        yAssetOperationsHandler, yAssetOperationsHandlerAddress,
        strategyVault, strategyVaultAddress,
        proTokenPlus, proTokenPlusAddress,
        proTokenPlusOperations, proTokenPlusOperationsAddress,
    };
}

// ---------------------------------------------------------------------------
// Flow helpers
// ---------------------------------------------------------------------------

async function depositFor(
    ctx: Ctx,
    user: HardhatEthersSigner,
    tierId: number,
    amount: bigint,
): Promise<bigint> {
    const createTx = await ctx.proTokenPlus
        .connect(user)
        .createDepositRequest(tierId, amount);
    const createReceipt = await createTx.wait();
    const createEvent = createReceipt!.logs
        .map((l) => { try { return ctx.proTokenPlus.interface.parseLog(l as never); } catch { return null; } })
        .find((e) => e?.name === "DepositRequestCreated");
    const requestId = createEvent!.args.requestID as bigint;

    const deadline = await futureDeadline();
    const domain = await buildVaultDomain(ctx.proTokenPlusAddress);
    const proof = await ctx.accounts.authority.signTypedData(domain, DEPOSIT_PROOF_TYPES, {
        requestId,
        tierID: tierId,
        amount,
        user: user.address,
        deadline,
        proofKind: VaultProofKind.PROOF_OF_APPROVE,
    });

    const finalizeTx = await ctx.proTokenPlus
        .connect(user)
        .finalizeDepositRequest(requestId, VaultProofKind.PROOF_OF_APPROVE, deadline, proof);
    const finalizeReceipt = await finalizeTx.wait();
    const finalizeEvent = finalizeReceipt!.logs
        .map((l) => { try { return ctx.proTokenPlus.interface.parseLog(l as never); } catch { return null; } })
        .find((e) => e?.name === "DepositRequestFinalized");
    return finalizeEvent!.args.positionID as bigint;
}

async function withdrawFor(
    ctx: Ctx,
    user: HardhatEthersSigner,
    positionIds: bigint[],
): Promise<bigint> {
    const createTx = await ctx.proTokenPlus
        .connect(user)
        .createWithdrawRequest(positionIds);
    const createReceipt = await createTx.wait();
    const createEvent = createReceipt!.logs
        .map((l) => { try { return ctx.proTokenPlus.interface.parseLog(l as never); } catch { return null; } })
        .find((e) => e?.name === "WithdrawRequestCreated");
    const requestId = createEvent!.args.requestID as bigint;

    const deadline = await futureDeadline();
    const domain = await buildVaultDomain(ctx.proTokenPlusAddress);
    const proof = await ctx.accounts.authority.signTypedData(domain, WITHDRAW_PROOF_TYPES, {
        requestId,
        positionIDs: positionIds,
        user: user.address,
        deadline,
        proofKind: VaultProofKind.PROOF_OF_APPROVE,
    });

    const finalizeTx = await ctx.proTokenPlus
        .connect(user)
        .finalizeWithdrawRequest(requestId, VaultProofKind.PROOF_OF_APPROVE, deadline, proof);
    const finalizeReceipt = await finalizeTx.wait();
    const finalizeEvent = finalizeReceipt!.logs
        .map((l) => { try { return ctx.proTokenPlus.interface.parseLog(l as never); } catch { return null; } })
        .find((e) => e?.name === "UnbondingStarted");
    return finalizeEvent!.args.unbondingIndex as bigint;
}

async function positionTotalBase(ctx: Ctx, positionId: bigint): Promise<bigint> {
    const positions = await ctx.proTokenPlus.getUserPositions([positionId]);
    return BigInt(positions[0].amount) + BigInt(positions[0].lockedRewards);
}

async function strategistBorrow(ctx: Ctx, amountBase: bigint) {
    return ctx.strategyVault
        .connect(ctx.accounts.strategist)
        .borrow(amountBase, ctx.yAssetAddress, ctx.accounts.strategist.address);
}

async function strategistRepay(ctx: Ctx, yAssetAmount: bigint) {
    await ctx.yAsset
        .connect(ctx.accounts.strategist)
        .approve(ctx.strategyVaultAddress, yAssetAmount);
    return ctx.strategyVault.connect(ctx.accounts.strategist).repay(yAssetAmount, ctx.yAssetAddress);
}

async function setPrice(ctx: Ctx, p: bigint) {
    await ctx.proUSD.connect(ctx.accounts.admin).setUSDPrice(p);
}

// Treasury funding: mint proUSD via the ops-as-minter impersonation (same
// mechanism the fixture uses to seed users).
async function fundWithProUSD(ctx: Ctx, to: string, amount: bigint) {
    await ethers.provider.send("hardhat_impersonateAccount", [ctx.proTokenOperationsAddress]);
    await ethers.provider.send("hardhat_setBalance", [ctx.proTokenOperationsAddress, "0xDE0B6B3A7640000"]);
    const ops = await ethers.getSigner(ctx.proTokenOperationsAddress);
    await ctx.proUSD.connect(ops).mint(to, amount);
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [ctx.proTokenOperationsAddress]);
}

// Shortfall formula mirror (identical integer ops to the contract).
function shortfall(base: bigint, pool: bigint, price: bigint): bigint {
    const need = (base * USD_PRECISION) / price;
    return need > pool ? need - pool : 0n;
}

// ===========================================================================
// Tests
// ===========================================================================

describe("StrategyVault: slash markdown and cover", function () {
    describe("Full depeg lifecycle", function () {
        it("deposit → borrow → repay → appreciate → slash → markdown measures both pools → cover restores backing", async function () {
            const ctx = await loadFixture(slashFixture);
            const user = ctx.accounts.user1;
            const admin = ctx.accounts.admin;

            // Populate BOTH pools: deposit 1000, borrow 400 (deposit side 600),
            // repay 500 USDC (withdraw side ~500).
            await depositFor(ctx, user, ANNUAL_TIER_ID, MIN_DEPOSIT * 10n);
            await strategistBorrow(ctx, MIN_DEPOSIT * 4n);
            const repayUSDC = 500n * 10n ** 6n;
            await ctx.yAsset.mint(ctx.accounts.strategist.address, repayUSDC);
            await strategistRepay(ctx, repayUSDC);

            // Appreciate and bank the ratchet; claimGrowth doubles as the
            // accrual trigger AND leaves lastPrice at 1.10 without adding
            // anything to the pools.
            await setPrice(ctx, P_110);
            await ctx.strategyVault.connect(admin).claimGrowth(admin.address, 0n);
            expect(await ctx.strategyVault.lastPrice()).to.equal(P_110);

            // ---- Slash: live price marked down to $1.02 ----
            await setPrice(ctx, P_102);

            // Pools/bases as they stand going into the markdown.
            const dBase = await ctx.strategyVault.depositBase();
            const dPool = await ctx.strategyVault.depositProUSD();
            const wBase = await ctx.strategyVault.withdrawBase();
            const wPool = await ctx.strategyVault.withdrawProUSD();

            const expDShort = shortfall(dBase, dPool, P_102);
            const expWShort = shortfall(wBase, wPool, P_102);
            expect(expDShort).to.be.gt(0n); // pools sized at 1.10; 1.02 needs more tokens
            expect(expWShort).to.be.gt(0n);

            // Return values match the event, and both match the mirror math.
            const [retD, retW] = await ctx.strategyVault.connect(admin).markdownPrice.staticCall();
            expect(retD).to.equal(expDShort);
            expect(retW).to.equal(expWShort);

            await expect(ctx.strategyVault.connect(admin).markdownPrice())
                .to.emit(ctx.strategyVault, "PriceMarkedDown")
                .withArgs(P_110, P_102, expDShort, expWShort);

            // Deficits stored on-chain — the treasury sizes cover() from these
            // (no indexer needed), and cover() enforces them as caps.
            expect(await ctx.strategyVault.depositDeficit()).to.equal(expDShort);
            expect(await ctx.strategyVault.withdrawDeficit()).to.equal(expWShort);

            // Re-anchored; pools and base ledgers UNTOUCHED by measurement.
            expect(await ctx.strategyVault.lastPrice()).to.equal(P_102);
            expect(await ctx.strategyVault.depositProUSD()).to.equal(dPool);
            expect(await ctx.strategyVault.withdrawProUSD()).to.equal(wPool);
            expect(await ctx.strategyVault.depositBase()).to.equal(dBase);
            expect(await ctx.strategyVault.withdrawBase()).to.equal(wBase);

            // ---- Cover: treasury feeds the measured deficits ----
            const total = expDShort + expWShort;
            await fundWithProUSD(ctx, admin.address, total);
            await ctx.proUSD.connect(admin).approve(ctx.strategyVaultAddress, total);

            await expect(
                ctx.strategyVault.connect(admin).cover(expDShort, expWShort),
            )
                .to.emit(ctx.strategyVault, "Covered")
                .withArgs(admin.address, expDShort, expWShort);

            // Deficits fully consumed.
            expect(await ctx.strategyVault.depositDeficit()).to.equal(0n);
            expect(await ctx.strategyVault.withdrawDeficit()).to.equal(0n);

            // Each pool now holds exactly what its base ledger requires at $1.02.
            expect(await ctx.strategyVault.depositProUSD()).to.equal(
                (dBase * USD_PRECISION) / P_102,
            );
            expect(await ctx.strategyVault.withdrawProUSD()).to.equal(
                (wBase * USD_PRECISION) / P_102,
            );

            // Solvency invariant intact (cover raised held and obligations equally).
            const held = await ctx.proUSD.balanceOf(ctx.strategyVaultAddress);
            const obligations =
                (await ctx.strategyVault.depositProUSD()) +
                (await ctx.strategyVault.growthProUSD()) +
                (await ctx.strategyVault.withdrawProUSD());
            expect(held).to.be.gte(obligations);
        });

        it("depeg blocks a user withdrawal; cover unblocks it (paid at the marked-down price)", async function () {
            const ctx = await loadFixture(slashFixture);
            const user = ctx.accounts.user1;
            const operator = ctx.accounts.operator; // cover is admin-OR-operator

            // Deposit, appreciate, strategist borrows everything at $1.10.
            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS * 2n);
            const totalBase = await positionTotalBase(ctx, positionId);
            await setPrice(ctx, P_110);
            await strategistBorrow(ctx, await ctx.strategyVault.depositBase());

            // Stock the reserve to cover the exit at $1.10 but NOT at $1.02 —
            // the exact window a slash exposes. Target minted tokens midway.
            const payout110 = (totalBase * USD_PRECISION) / P_110;
            const payout102 = (totalBase * USD_PRECISION) / P_102;
            const targetMint = payout110 + (payout102 - payout110) / 2n;
            // USDC (6-dec, $1) needed to mint targetMint proUSD at price 1.10:
            const repayUSDC = (targetMint * P_110) / (USD_PRECISION * 10n ** 12n) + 1n;
            await ctx.yAsset.mint(ctx.accounts.strategist.address, repayUSDC);
            await strategistRepay(ctx, repayUSDC);

            // Guard the scenario's own premise: covered at 1.10, short at 1.02.
            const reserve = await ctx.strategyVault.withdrawProUSD();
            expect(reserve).to.be.gte(payout110);
            expect(reserve).to.be.lt(payout102);

            // Unlock, then SLASH before the user initiates (so initiate and
            // completion both price at $1.02 — no cross-price ambiguity).
            await time.increase(Number(QUARTERLY_DURATION) + 1);
            await setPrice(ctx, P_102);

            const [dShort, wShort] = await ctx.strategyVault
                .connect(ctx.accounts.admin).markdownPrice.staticCall();
            await ctx.strategyVault.connect(ctx.accounts.admin).markdownPrice();
            expect(dShort).to.equal(0n); // deposit side fully borrowed → base 0
            expect(wShort).to.be.gt(0n);

            const unbondingIndex = await withdrawFor(ctx, user, [positionId]);
            await time.increase(Number(DEFAULT_UNBONDING_PERIOD) + 1);

            // Pre-cover: the reserve can't stretch to the $1.02 token count.
            await expect(
                ctx.proTokenPlus.connect(user).completeWithdraw([unbondingIndex]),
            ).to.be.revertedWithCustomError(ctx.strategyVault, "WithdrawReserveUnderfunded");

            // Operator covers the measured withdraw-side hole.
            await fundWithProUSD(ctx, operator.address, wShort);
            await ctx.proUSD.connect(operator).approve(ctx.strategyVaultAddress, wShort);
            await ctx.strategyVault.connect(operator).cover(0n, wShort);
            expect(await ctx.strategyVault.withdrawProUSD()).to.be.gte(payout102);

            // Post-cover: the same withdrawal succeeds, paid at $1.02.
            const balBefore = await ctx.proUSD.balanceOf(user.address);
            const reserveBefore = await ctx.strategyVault.withdrawProUSD();
            await ctx.proTokenPlus.connect(user).completeWithdraw([unbondingIndex]);
            const received = (await ctx.proUSD.balanceOf(user.address)) - balBefore;
            const consumed = reserveBefore - (await ctx.strategyVault.withdrawProUSD());

            expect(received).to.equal(payout102);
            expect(consumed).to.equal(received);
        });

        it("cover round-trips: on recovery, the ratchet frees exactly the covered amount back as growth (no double-banking)", async function () {
            const ctx = await loadFixture(slashFixture);
            const admin = ctx.accounts.admin;

            // Deposit only — keep the withdraw side empty so the algebra is pure.
            const B = MIN_DEPOSIT * 10n;
            await depositFor(ctx, ctx.accounts.user1, ANNUAL_TIER_ID, B);

            // Ride up: $1.00 → $1.10; claim banks AND hands the treasury the
            // growth it will later cover with.
            await setPrice(ctx, P_110);
            const growthRideUp = await ctx.strategyVault
                .connect(admin).claimGrowth.staticCall(admin.address, 0n);
            await ctx.strategyVault.connect(admin).claimGrowth(admin.address, 0n);

            // Slash to $1.02 and mark down.
            await setPrice(ctx, P_102);
            const [dShort] = await ctx.strategyVault.connect(admin).markdownPrice.staticCall();
            await ctx.strategyVault.connect(admin).markdownPrice();
            expect(dShort).to.be.gt(0n);
            expect(growthRideUp).to.be.gte(dShort); // ride-up growth covers its own slash-back

            // Treasury covers out of the growth it claimed.
            await ctx.proUSD.connect(admin).approve(ctx.strategyVaultAddress, dShort);
            await ctx.strategyVault.connect(admin).cover(dShort, 0n);
            expect(await ctx.strategyVault.depositProUSD()).to.equal(
                (B * USD_PRECISION) / P_102,
            );

            // Recovery: $1.02 → $1.10. The ratchet frees EXACTLY dShort — the
            // cover flows back to the treasury as growth. Had lastPrice merely
            // been reset without a measured cover, this same accrual would have
            // double-banked the 1.02→1.10 range out of user backing.
            await setPrice(ctx, P_110);
            const growthRecovery = await ctx.strategyVault
                .connect(admin).claimGrowth.staticCall(admin.address, 0n);
            await ctx.strategyVault.connect(admin).claimGrowth(admin.address, 0n);
            expect(growthRecovery).to.equal(dShort);

            // End-state pool matches a single uninterrupted 1.00→1.10 ride.
            expect(await ctx.strategyVault.depositProUSD()).to.equal(
                (B * USD_PRECISION) / P_110,
            );
        });
    });

    describe("markdownPrice guards", function () {
        it("reverts NotAMarkdown when live price >= lastPrice", async function () {
            const ctx = await loadFixture(slashFixture);
            // Fresh fixture: live == lastPrice == $1.00 — nothing to mark down.
            await expect(
                ctx.strategyVault.connect(ctx.accounts.admin).markdownPrice(),
            ).to.be.revertedWithCustomError(ctx.strategyVault, "NotAMarkdown");
        });

        it("second markdownPrice immediately after reverts NotAMarkdown (idempotence guard)", async function () {
            const ctx = await loadFixture(slashFixture);
            await depositFor(ctx, ctx.accounts.user1, ANNUAL_TIER_ID, MIN_DEPOSIT * 10n);
            await setPrice(ctx, P_110);
            await ctx.strategyVault.connect(ctx.accounts.admin).claimGrowth(ctx.accounts.admin.address, 0n);
            await setPrice(ctx, P_102);

            await ctx.strategyVault.connect(ctx.accounts.admin).markdownPrice();
            // live == lastPrice == 1.02 now.
            await expect(
                ctx.strategyVault.connect(ctx.accounts.admin).markdownPrice(),
            ).to.be.revertedWithCustomError(ctx.strategyVault, "NotAMarkdown");
        });

        it("a FURTHER decrease re-arms markdownPrice and measures incrementally", async function () {
            const ctx = await loadFixture(slashFixture);
            const admin = ctx.accounts.admin;
            const B = MIN_DEPOSIT * 10n;
            await depositFor(ctx, ctx.accounts.user1, ANNUAL_TIER_ID, B);
            await setPrice(ctx, P_110);
            await ctx.strategyVault.connect(admin).claimGrowth(admin.address, 0n);

            // First slash + full cover at 1.05.
            const P_105 = (USD_PRECISION * 105n) / 100n;
            await setPrice(ctx, P_105);
            const [d1] = await ctx.strategyVault.connect(admin).markdownPrice.staticCall();
            await ctx.strategyVault.connect(admin).markdownPrice();
            await fundWithProUSD(ctx, admin.address, d1);
            await ctx.proUSD.connect(admin).approve(ctx.strategyVaultAddress, d1);
            await ctx.strategyVault.connect(admin).cover(d1, 0n);

            // Second slash to 1.02: shortfall measured net of the prior cover.
            await setPrice(ctx, P_102);
            const [d2] = await ctx.strategyVault.connect(admin).markdownPrice.staticCall();
            const expected = (B * USD_PRECISION) / P_102 - (B * USD_PRECISION) / P_105;
            expect(d2).to.equal(expected);
        });

        it("reverts PriceUnavailable when the price is disabled", async function () {
            const ctx = await loadFixture(slashFixture);
            await setPrice(ctx, 0n);
            await expect(
                ctx.strategyVault.connect(ctx.accounts.admin).markdownPrice(),
            ).to.be.revertedWithCustomError(ctx.strategyVault, "PriceUnavailable");
        });

        it("reverts NotAdmin for operator and user", async function () {
            const ctx = await loadFixture(slashFixture);
            await expect(
                ctx.strategyVault.connect(ctx.accounts.operator).markdownPrice(),
            ).to.be.revertedWithCustomError(ctx.strategyVault, "NotAdmin");
            await expect(
                ctx.strategyVault.connect(ctx.accounts.user1).markdownPrice(),
            ).to.be.revertedWithCustomError(ctx.strategyVault, "NotAdmin");
        });
    });

    describe("cover guards and deficit lifecycle", function () {
        // Establish a known deficit: deposit B, ride to $1.10 (claim banks the
        // ratchet and funds the admin for later covers), slash to $1.02,
        // markdown. Returns the recorded per-pool deficits.
        async function markdownWithDeficit(ctx: Ctx, B: bigint) {
            const admin = ctx.accounts.admin;
            await depositFor(ctx, ctx.accounts.user1, ANNUAL_TIER_ID, B);
            await setPrice(ctx, P_110);
            await ctx.strategyVault.connect(admin).claimGrowth(admin.address, 0n);
            await setPrice(ctx, P_102);
            const [dShort, wShort] = await ctx.strategyVault
                .connect(admin).markdownPrice.staticCall();
            await ctx.strategyVault.connect(admin).markdownPrice();
            return { dShort, wShort };
        }

        it("cover(0, 0) reverts ZeroAmount", async function () {
            const ctx = await loadFixture(slashFixture);
            await expect(
                ctx.strategyVault.connect(ctx.accounts.admin).cover(0n, 0n),
            ).to.be.revertedWithCustomError(ctx.strategyVault, "ZeroAmount");
        });

        it("cover from a user reverts NotAdminOrOperator (auth before deficit check)", async function () {
            const ctx = await loadFixture(slashFixture);
            await expect(
                ctx.strategyVault.connect(ctx.accounts.user1).cover(1n, 0n),
            ).to.be.revertedWithCustomError(ctx.strategyVault, "NotAdminOrOperator");
        });

        it("cover with NO recorded deficit reverts CoverExceedsDeficit (no longer a generic top-up hook)", async function () {
            const ctx = await loadFixture(slashFixture);
            const admin = ctx.accounts.admin;
            await fundWithProUSD(ctx, admin.address, HUNDRED_TOKENS);
            await ctx.proUSD.connect(admin).approve(ctx.strategyVaultAddress, HUNDRED_TOKENS);

            // Deficits are 0 (no markdown has run): any positive feed exceeds
            // them. This is the guard against stranding tokens — excess in
            // depositProUSD above base/price is unreachable by borrow and by
            // the ratchet.
            await expect(
                ctx.strategyVault.connect(admin).cover(HUNDRED_TOKENS, 0n),
            ).to.be.revertedWithCustomError(ctx.strategyVault, "CoverExceedsDeficit");
        });

        it("cover exceeding either side's deficit reverts CoverExceedsDeficit with all four args", async function () {
            const ctx = await loadFixture(slashFixture);
            const admin = ctx.accounts.admin;
            const { dShort } = await markdownWithDeficit(ctx, MIN_DEPOSIT * 10n);

            await fundWithProUSD(ctx, admin.address, dShort + 1n);
            await ctx.proUSD.connect(admin).approve(ctx.strategyVaultAddress, dShort + 1n);

            // Deposit side over by 1 wei.
            await expect(
                ctx.strategyVault.connect(admin).cover(dShort + 1n, 0n),
            )
                .to.be.revertedWithCustomError(ctx.strategyVault, "CoverExceedsDeficit")
                .withArgs(dShort + 1n, dShort, 0n, 0n);

            // Withdraw side (deficit 0 here — no repay happened) over by 1 wei.
            await expect(
                ctx.strategyVault.connect(admin).cover(0n, 1n),
            )
                .to.be.revertedWithCustomError(ctx.strategyVault, "CoverExceedsDeficit")
                .withArgs(0n, dShort, 1n, 0n);
        });

        it("partial cover decrements the deficit and books the pool; remainder stays coverable", async function () {
            const ctx = await loadFixture(slashFixture);
            const admin = ctx.accounts.admin;
            const { dShort } = await markdownWithDeficit(ctx, MIN_DEPOSIT * 10n);

            await fundWithProUSD(ctx, admin.address, dShort);
            await ctx.proUSD.connect(admin).approve(ctx.strategyVaultAddress, dShort);

            const half = dShort / 2n;
            const dPoolBefore = await ctx.strategyVault.depositProUSD();
            const heldBefore = await ctx.proUSD.balanceOf(ctx.strategyVaultAddress);

            await ctx.strategyVault.connect(admin).cover(half, 0n);

            expect(await ctx.strategyVault.depositProUSD()).to.equal(dPoolBefore + half);
            expect(await ctx.strategyVault.depositDeficit()).to.equal(dShort - half);
            expect(await ctx.proUSD.balanceOf(ctx.strategyVaultAddress)).to.equal(heldBefore + half);

            // Second tranche completes it, sized straight from the on-chain view.
            const rest = await ctx.strategyVault.depositDeficit();
            await ctx.strategyVault.connect(admin).cover(rest, 0n);
            expect(await ctx.strategyVault.depositDeficit()).to.equal(0n);
        });

        it("deficit persists through recovery until cover (only markdown sets it, only cover retires it)", async function () {
            const ctx = await loadFixture(slashFixture);
            const admin = ctx.accounts.admin;
            const B = MIN_DEPOSIT * 10n;
            const { dShort } = await markdownWithDeficit(ctx, B);
            expect(dShort).to.be.gt(0n);

            // Price recovers to $1.10. Nothing clears the deficit — it's only set by
            // markdown and retired by cover. Recovery does not touch it.
            await setPrice(ctx, P_110);
            // (no claimGrowth trigger — it would revert NoYieldAvailable and, more to the
            //  point, settlement doesn't affect the deficit under this model)

            expect(await ctx.strategyVault.depositDeficit()).to.equal(dShort);

            // Covering the figure measured at $1.02 restores exact backing — the stored
            // deficit is the right cover amount at any later price.
            await fundWithProUSD(ctx, admin.address, dShort);
            await ctx.proUSD.connect(admin).approve(ctx.strategyVaultAddress, dShort);
            await ctx.strategyVault.connect(admin).cover(dShort, 0n);
            expect(await ctx.strategyVault.depositDeficit()).to.equal(0n);
        });

        it("a second markdown OVERWRITES deficits net of prior covers (self-correcting)", async function () {
            const ctx = await loadFixture(slashFixture);
            const admin = ctx.accounts.admin;
            const B = MIN_DEPOSIT * 10n;
            const { dShort: d1 } = await markdownWithDeficit(ctx, B);

            // Cover only half of the first slash's hole.
            await fundWithProUSD(ctx, admin.address, d1);
            await ctx.proUSD.connect(admin).approve(ctx.strategyVaultAddress, d1);
            await ctx.strategyVault.connect(admin).cover(d1 / 2n, 0n);

            // Further slash to $1.00: markdown re-measures ABSOLUTELY —
            // need at $1.00 minus the (half-covered) pool — which already
            // includes the uncovered remainder of the first slash.
            const P_100 = USD_PRECISION;
            await setPrice(ctx, P_100);
            const pool = await ctx.strategyVault.depositProUSD();
            const expected = (B * USD_PRECISION) / P_100 - pool;
            const [d2] = await ctx.strategyVault.connect(admin).markdownPrice.staticCall();
            await ctx.strategyVault.connect(admin).markdownPrice();

            expect(d2).to.equal(expected);
            expect(await ctx.strategyVault.depositDeficit()).to.equal(expected);
        });
    });
});