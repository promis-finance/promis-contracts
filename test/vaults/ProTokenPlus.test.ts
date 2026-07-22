import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import {
    ZERO_ADDRESS,
    HUNDRED_TOKENS,
    DECIMALS_18,
    DECIMALS_6,
    ONE_DAY,
    ONE_WEEK,
    VERSION_1_0_0,
    PROTOKEN_NAME,
    PROTOKEN_SYMBOL,
    ERRORS,
    EVENTS,
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
import {
    signMintProof,
    signUnmintProof,
    ProofKind,
    ProofData,
} from "../helpers/proofs";

// ---------------------------------------------------------------------------
// EIP-712 helpers for ProTokenPlus
//
// Domain: ("ProTokenPlus", "1") — set in ProTokenPlus.initialize via __EIP712_init
// Types:
//   DepositProof  (requestId, tierID, amount, user, unlockedPositionsToMerge, proofKind)
//   WithdrawProof (requestId, positionIDs, user, unlockedPositionsToMerge, proofKind)
//
// NOTE: withdrawal has no `amount` — createWithdrawRequest(positionIDs,
// unlockedPositionsToMerge) always withdraws the FULL listed position(s), and the
// WithdrawProof typehash has no amount field (5 fields). Partial exits are done by
// splitting positions beforehand, not by passing a partial amount.
// ---------------------------------------------------------------------------

enum VaultProofKind {
    PROOF_OF_APPROVE = 0,
    PROOF_OF_RETURN = 1,
}

interface DepositProofData {
    requestId: bigint;
    tierID: number;
    amount: bigint;
    user: string;
    unlockedPositionsToMerge: bigint[];
    proofKind: VaultProofKind;
}

interface WithdrawProofData {
    requestId: bigint;
    positionIDs: bigint[];
    user: string;
    unlockedPositionsToMerge: bigint[];
    proofKind: VaultProofKind;
}

const DEPOSIT_PROOF_TYPES = {
    DepositProof: [
        { name: "requestId", type: "uint256" },
        { name: "tierID", type: "uint8" },
        { name: "amount", type: "uint256" },
        { name: "user", type: "address" },
        { name: "unlockedPositionsToMerge", type: "uint256[]" },
        { name: "proofKind", type: "uint8" },
    ],
};

const WITHDRAW_PROOF_TYPES = {
    WithdrawProof: [
        { name: "requestId", type: "uint256" },
        { name: "positionIDs", type: "uint256[]" },
        { name: "user", type: "address" },
        { name: "unlockedPositionsToMerge", type: "uint256[]" },
        { name: "proofKind", type: "uint8" },
    ],
};

async function buildVaultDomain(verifyingContract: string) {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    return { name: "ProTokenPlus", version: "1", chainId, verifyingContract };
}

async function signDepositProof(
    signer: HardhatEthersSigner,
    verifyingContract: string,
    data: DepositProofData,
): Promise<string> {
    const domain = await buildVaultDomain(verifyingContract);
    return await signer.signTypedData(domain, DEPOSIT_PROOF_TYPES, data);
}

async function signWithdrawProof(
    signer: HardhatEthersSigner,
    verifyingContract: string,
    data: WithdrawProofData,
): Promise<string> {
    const domain = await buildVaultDomain(verifyingContract);
    return await signer.signTypedData(domain, WITHDRAW_PROOF_TYPES, data);
}

// ---------------------------------------------------------------------------
// Tier constants
// ---------------------------------------------------------------------------

const FLOOR_TIER_ID = 0;
const QUARTERLY_TIER_ID = 1;
const SEMI_ANNUAL_TIER_ID = 2;
const ANNUAL_TIER_ID = 3;

const ONE_DAY_BN = BigInt(ONE_DAY);
const ONE_WEEK_BN = BigInt(ONE_WEEK);

const QUARTERLY_DURATION = 90n * ONE_DAY_BN;
const SEMI_ANNUAL_DURATION = 180n * ONE_DAY_BN;
const ANNUAL_DURATION = 365n * ONE_DAY_BN;
const DEFAULT_UNBONDING_PERIOD = 14n * ONE_DAY_BN;

const MIN_DEPOSIT = ethers.parseEther("100");
const QUARTERLY_APR = ethers.parseEther("0.06"); // 6%
const SEMI_ANNUAL_APR = ethers.parseEther("0.09"); // 9%
const ANNUAL_APR = ethers.parseEther("0.12"); // 12%

const USD_PRECISION = 10n ** 18n;

// ---------------------------------------------------------------------------
// Fixture
//
// The vault custody layer is now part of the deposit/withdraw path, so the
// fixture deploys and wires the full stack ProTokenPlus needs:
//   ProTokenSettings + ProToken(proUSD) + ProTokenOperations + UnmintHandler
//   + YAssetOperationsHandler(yAsset) + StrategyVault + ProTokenPlus(+satellite)
//
// proUSD is both the ProTokenPlus deposit token AND the StrategyVault custody
// token. proUSD's own minter is ProTokenOperations (so strategicMint can mint
// it); we additionally fund users by having ProTokenOperations-as-minter mint.
//
// Ordering matters: StrategyVault.initialize snapshots proToken/proTokenOperations
// from Settings.getProTokenInfo(), so Settings must have setProToken /
// setProTokenOperations called BEFORE the vault is deployed.
// ---------------------------------------------------------------------------

interface ProTokenPlusFixture {
    accounts: TestAccounts & {
        strategist: HardhatEthersSigner;
        yieldRecipient: HardhatEthersSigner;
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

async function proTokenPlusFixture(): Promise<ProTokenPlusFixture> {
    const baseAccounts = await getTestAccounts();

    // The StrategyVault flow needs two roles the shared TestAccounts doesn't expose
    // yet: a `strategist` (borrow/repay) and a `yieldRecipient` (claimYield sink).
    // Derive them from the signer pool that getTestAccounts didn't claim, so this
    // test is self-contained. If you add `strategist`/`yieldRecipient` to
    // getTestAccounts, delete this block and the spread below.
    const allSigners = await ethers.getSigners();
    const accounts = {
        ...baseAccounts,
        strategist: (baseAccounts as any).strategist ?? allSigners[10],
        yieldRecipient: (baseAccounts as any).yieldRecipient ?? allSigners[11],
    } as TestAccounts & {
        strategist: HardhatEthersSigner;
        yieldRecipient: HardhatEthersSigner;
    };

    // --- Settings ---
    const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator);
    const proTokenSettingsAddress = await proTokenSettings.getAddress();

    // --- ProTokenOperations (must be proUSD's minter so strategicMint can mint) ---
    const ProTokenOperationsFactory = await ethers.getContractFactory("ProTokenOperations");
    const proTokenOperations = (await upgrades.deployProxy(
        ProTokenOperationsFactory,
        [proTokenSettingsAddress],
        { kind: "uups" },
    )) as unknown as ProTokenOperations;
    await proTokenOperations.waitForDeployment();
    const proTokenOperationsAddress = await proTokenOperations.getAddress();

    // --- proUSD: minter = ProTokenOperations ---
    const proUSD = await deployProToken(
        PROTOKEN_NAME,
        PROTOKEN_SYMBOL,
        proTokenSettingsAddress,
        proTokenOperationsAddress,
    );
    const proUSDAddress = await proUSD.getAddress();

    // --- UnmintHandler ---
    // initialize(proTokenSettings, unmintBatchDuration). The duration is the batch
    // window in seconds; ProTokenPlus doesn't exercise the unmint-batch path, so any
    // non-zero value works here. (Confirm the arg order/name against your final ABI.)
    const UnmintHandlerFactory = await ethers.getContractFactory("ProTokenUnmintHandler");
    const proTokenUnmintHandler = (await upgrades.deployProxy(
        UnmintHandlerFactory,
        [proTokenSettingsAddress, ONE_DAY],
        { kind: "uups" },
    )) as unknown as ProTokenUnmintHandler;
    await proTokenUnmintHandler.waitForDeployment();
    const proTokenUnmintHandlerAddress = await proTokenUnmintHandler.getAddress();

    // --- yAsset (the asset the strategist deploys proUSD into; 6-dec USDC-like) ---
    const yAsset = await deployMintableERC20("USD Coin", "USDC", DECIMALS_6);
    const yAssetAddress = await yAsset.getAddress();

    const yAssetOperationsHandler = await deployYAssetOperationsHandler(
        proTokenSettingsAddress,
        yAssetAddress,
    );
    const yAssetOperationsHandlerAddress = await yAssetOperationsHandler.getAddress();

    // Seed the handler's yAsset reserve. When the strategist borrows, the vault calls
    // ProTokenOperations.strategicUnmint → YAssetOperationsHandler.payOut, which sources
    // the yAsset from this handler's unallocated reserve (pulling from yield protocols on
    // a shortfall). With no yield-protocol handlers configured here, payOut must be able to
    // serve borrows entirely from this reserve, so pre-fund it generously.
    await yAsset.mint(yAssetOperationsHandlerAddress, 1_000_000n * 10n ** BigInt(DECIMALS_6));

    // --- Wire Settings BEFORE deploying the vault (vault snapshots these) ---
    await proTokenSettings.connect(accounts.admin).setProToken(proUSDAddress);
    await proTokenSettings.connect(accounts.admin).setProTokenOperations(proTokenOperationsAddress);
    await proTokenSettings.connect(accounts.admin).setProTokenUnmintHandler(proTokenUnmintHandlerAddress);

    // yAsset config: static $1, 6 decimals, registered + unmintable
    const yAssetSettings = createDefaultYAssetSettings(yAssetOperationsHandlerAddress, DECIMALS_6);
    await proTokenSettings.connect(accounts.admin).setYAsset(yAssetAddress, yAssetSettings);
    await proTokenSettings.connect(accounts.admin).setUnmintYAssets([yAssetAddress]);

    // Strategist role (borrow/repay) and the proof signer authority (Operations side)
    await proTokenSettings.connect(accounts.admin).setStrategist(accounts.strategist.address);
    await proTokenSettings.connect(accounts.admin).setAuthority(accounts.authority.address, true);

    // --- ProTokenPlus proxy ---
    const tierIds = [FLOOR_TIER_ID, QUARTERLY_TIER_ID, SEMI_ANNUAL_TIER_ID, ANNUAL_TIER_ID];
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

    // --- StrategyVault (after Settings knows proToken + proTokenOperations) ---
    const StrategyVaultFactory = await ethers.getContractFactory("StrategyVault");
    const strategyVault = (await upgrades.deployProxy(
        StrategyVaultFactory,
        [proTokenSettingsAddress, proTokenPlusAddress],
        { kind: "uups" },
    )) as unknown as StrategyVault;
    await strategyVault.waitForDeployment();
    const strategyVaultAddress = await strategyVault.getAddress();

    // Register the vault in Settings; set the yield sink to a dedicated account.
    await proTokenSettings.connect(accounts.admin).setStrategyVault(strategyVaultAddress);
    await strategyVault.connect(accounts.admin).setYieldRecipient(accounts.yieldRecipient.address);

    // --- Satellite + wiring ---
    const ProTokenPlusOperationsFactory = await ethers.getContractFactory("ProTokenPlusOperations");
    const proTokenPlusOperations = (await ProTokenPlusOperationsFactory.deploy()) as unknown as ProTokenPlusOperations;
    await proTokenPlusOperations.waitForDeployment();
    const proTokenPlusOperationsAddress = await proTokenPlusOperations.getAddress();
    await proTokenPlus.connect(accounts.admin).setOperationsHandler(proTokenPlusOperationsAddress);

    // NOTE: ProTokenPlus has NO setAuthority of its own — the proof-signer registry
    // lives in ProTokenSettings (set above via setAuthority), and ProTokenPlusOperations
    // reads it from there when verifying deposit/withdraw proofs.

    // --- Seed users with proUSD via Operations-as-minter, and approve the vault ---
    // (ProTokenOperations is the minter; impersonate it to fund test users directly.)
    // Several tests deposit more than once from the same user (e.g. the growth tests
    // deposit 1000 then top up to trigger accrual), so seed generously rather than the
    // bare THOUSAND_TOKENS — otherwise the first 1000-deposit drains the user to zero.
    const USER_SEED = ethers.parseEther("100000");
    await ethers.provider.send("hardhat_impersonateAccount", [proTokenOperationsAddress]);
    await ethers.provider.send("hardhat_setBalance", [proTokenOperationsAddress, "0xDE0B6B3A7640000"]);
    const opsSigner = await ethers.getSigner(proTokenOperationsAddress);
    await proUSD.connect(opsSigner).mint(accounts.user1.address, USER_SEED);
    await proUSD.connect(opsSigner).mint(accounts.user2.address, USER_SEED);
    await proUSD.connect(opsSigner).mint(accounts.externalBusiness.address, USER_SEED);
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [proTokenOperationsAddress]);

    await proUSD.connect(accounts.user1).approve(proTokenPlusAddress, ethers.MaxUint256);
    await proUSD.connect(accounts.user2).approve(proTokenPlusAddress, ethers.MaxUint256);
    await proUSD.connect(accounts.externalBusiness).approve(proTokenPlusAddress, ethers.MaxUint256);

    return {
        accounts,
        proTokenSettings,
        proTokenSettingsAddress,
        proUSD,
        proUSDAddress,
        proTokenOperations,
        proTokenOperationsAddress,
        proTokenUnmintHandler,
        proTokenUnmintHandlerAddress,
        yAsset,
        yAssetAddress,
        yAssetOperationsHandler,
        yAssetOperationsHandlerAddress,
        strategyVault,
        strategyVaultAddress,
        proTokenPlus,
        proTokenPlusAddress,
        proTokenPlusOperations,
        proTokenPlusOperationsAddress,
    };
}

// ---------------------------------------------------------------------------
// Status / state constants
// ---------------------------------------------------------------------------

const POSITION_STATE_LOCKED = 0n;
const POSITION_STATE_UNLOCKED = 1n;

const POSITION_STATUS_ACTIVE = 0n;
const POSITION_STATUS_WITHDRAWN = 1n;
const POSITION_STATUS_UNLOCKED_MERGED = 3n;
const POSITION_STATUS_RELOCATED = 4n;

// ---------------------------------------------------------------------------
// Flow helpers
// ---------------------------------------------------------------------------

async function depositFor(
    ctx: ProTokenPlusFixture,
    user: HardhatEthersSigner,
    tierId: number,
    amount: bigint,
    unlockedPositionsToMerge: bigint[] = [],
): Promise<bigint> {
    const createTx = await ctx.proTokenPlus
        .connect(user)
        .createDepositRequest(tierId, amount, unlockedPositionsToMerge);
    const createReceipt = await createTx.wait();
    const createEvent = createReceipt!.logs
        .map((l) => {
            try {
                return ctx.proTokenPlus.interface.parseLog(l as never);
            } catch {
                return null;
            }
        })
        .find((e) => e?.name === "DepositRequestCreated");
    const requestId = createEvent!.args.requestID as bigint;

    const proof = await signDepositProof(ctx.accounts.authority, ctx.proTokenPlusAddress, {
        requestId,
        tierID: tierId,
        amount,
        user: user.address,
        unlockedPositionsToMerge,
        proofKind: VaultProofKind.PROOF_OF_APPROVE,
    });

    const finalizeTx = await ctx.proTokenPlus
        .connect(user)
        .finalizeDepositRequest(requestId, VaultProofKind.PROOF_OF_APPROVE, proof);
    const finalizeReceipt = await finalizeTx.wait();
    const finalizeEvent = finalizeReceipt!.logs
        .map((l) => {
            try {
                return ctx.proTokenPlus.interface.parseLog(l as never);
            } catch {
                return null;
            }
        })
        .find((e) => e?.name === "DepositRequestFinalized");
    return finalizeEvent!.args.positionID as bigint;
}

async function positionTotalBase(ctx: ProTokenPlusFixture, positionId: bigint): Promise<bigint> {
    const positions = await ctx.proTokenPlus.getUserPositions([positionId]);
    return BigInt(positions[0].amount) + BigInt(positions[0].lockedRewards);
}

async function convertFromBase(ctx: ProTokenPlusFixture, amountBase: bigint): Promise<bigint> {
    const price = BigInt(await ctx.proUSD.getUSDPrice());
    return (amountBase * USD_PRECISION) / price;
}

// ---------------------------------------------------------------------------
// totalDepositsBase invariant helper
//
// The contract maintains: totalDepositsBase == Σ (active position.amount) across
// ALL users. To check it, we sum the `.amount` (principal-base) of every active
// position for the set of users a test touches, and compare to the on-chain
// accumulator. `lockedRewards` is deliberately excluded — the ledger tracks
// principal only; rewards enter solely when promoted into a position's `.amount`
// (relock / merge), which this sum captures automatically.
//
// NOTE: assumes ProTokenPlus exposes `totalDepositsBase()` as a public getter.
// ---------------------------------------------------------------------------

async function sumActiveAmounts(
    ctx: ProTokenPlusFixture,
    users: HardhatEthersSigner[],
): Promise<bigint> {
    let sum = 0n;
    for (const u of users) {
        const ids = await ctx.proTokenPlus.getUserPositionIds(u.address, 0, 1000, true);
        if (ids.positionIdsResult.length === 0) continue;
        const positions = await ctx.proTokenPlus.getUserPositions([...ids.positionIdsResult]);
        for (const p of positions) {
            sum += BigInt(p.amount);
        }
    }
    return sum;
}

// Assert the global ledger equals the summed principal of active positions.
async function expectDepositsBaseInvariant(
    ctx: ProTokenPlusFixture,
    users: HardhatEthersSigner[],
): Promise<void> {
    const ledger = await ctx.proTokenPlus.totalDepositsBase();
    const summed = await sumActiveAmounts(ctx, users);
    expect(ledger).to.equal(summed);
}

// Drive a withdraw create→sign→finalize cycle; returns the unbondingIndex.
// Withdrawal is always the FULL listed position(s) — no amount is passed.
async function withdrawFor(
    ctx: ProTokenPlusFixture,
    user: HardhatEthersSigner,
    positionIds: bigint[],
    unlockedPositionsToMerge: bigint[] = [],
): Promise<bigint> {
    const createTx = await ctx.proTokenPlus
        .connect(user)
        .createWithdrawRequest(positionIds, unlockedPositionsToMerge);
    const createReceipt = await createTx.wait();
    const createEvent = createReceipt!.logs
        .map((l) => {
            try {
                return ctx.proTokenPlus.interface.parseLog(l as never);
            } catch {
                return null;
            }
        })
        .find((e) => e?.name === "WithdrawRequestCreated");
    const requestId = createEvent!.args.requestID as bigint;

    const proof = await signWithdrawProof(ctx.accounts.authority, ctx.proTokenPlusAddress, {
        requestId,
        positionIDs: positionIds,
        user: user.address,
        unlockedPositionsToMerge,
        proofKind: VaultProofKind.PROOF_OF_APPROVE,
    });

    const finalizeTx = await ctx.proTokenPlus
        .connect(user)
        .finalizeWithdrawRequest(requestId, VaultProofKind.PROOF_OF_APPROVE, proof);
    const finalizeReceipt = await finalizeTx.wait();
    const finalizeEvent = finalizeReceipt!.logs
        .map((l) => {
            try {
                return ctx.proTokenPlus.interface.parseLog(l as never);
            } catch {
                return null;
            }
        })
        .find((e) => e?.name === "UnbondingStarted");
    return finalizeEvent!.args.unbondingIndex as bigint;
}

async function relockFor(
    ctx: ProTokenPlusFixture,
    user: HardhatEthersSigner,
    positionIds: bigint[],
    amount: bigint,
    toTierId: number,
    unlockedPositionsToMerge: bigint[] = [],
): Promise<{ newPositionId: bigint; fromTierId: bigint }> {
    const tx = await ctx.proTokenPlus
        .connect(user)
        .relock(positionIds, amount, toTierId, unlockedPositionsToMerge);
    const receipt = await tx.wait();
    const event = receipt!.logs
        .map((l) => {
            try {
                return ctx.proTokenPlus.interface.parseLog(l as never);
            } catch {
                return null;
            }
        })
        .find((e) => e?.name === "PositionRelocated");
    return {
        newPositionId: event!.args.newPositionId as bigint,
        fromTierId: event!.args.fromTierId as bigint,
    };
}

// ---------------------------------------------------------------------------
// Strategist flow helpers
//
// The strategist generates yield off-chain by deploying borrowed proUSD into a
// yAsset venue. On-chain we model the lifecycle:
//   borrow(amountBase, yAsset, destination): vault burns depositProUSD and instructs
//     Operations to unmint it into yAsset, delivered to `destination` (the strategist).
//   <off-chain: strategist earns; we simulate by minting extra yAsset to them>
//   repay(yAssetAmount, yAsset): vault pulls yAsset from the strategist,
//     strategicMint's it into proUSD, and books it into the withdraw reserve
//     (withdrawProUSD / withdrawBase).
// ---------------------------------------------------------------------------

// Strategist borrows `amountBase` (USD/18-dec) worth of yAsset out of the vault.
// borrow(amountBase, yAsset, destination) returns the yAsset delivered to `destination`.
// Returns the tx response so callers can pass it to expect().to.emit; awaiting the
// helper still resolves once the tx is sent (mined under the test harness).
async function strategistBorrow(ctx: ProTokenPlusFixture, amountBase: bigint) {
    return ctx.strategyVault
        .connect(ctx.accounts.strategist)
        .borrow(amountBase, ctx.yAssetAddress, ctx.accounts.strategist.address);
}

// Strategist repays `yAssetAmount` of yAsset into the withdraw reserve.
// Caller must have funded the strategist with the yAsset; we approve here.
// Returns the repay tx response (the approve is awaited first).
async function strategistRepay(ctx: ProTokenPlusFixture, yAssetAmount: bigint) {
    await ctx.yAsset
        .connect(ctx.accounts.strategist)
        .approve(ctx.strategyVaultAddress, yAssetAmount);
    return ctx.strategyVault.connect(ctx.accounts.strategist).repay(yAssetAmount, ctx.yAssetAddress);
}

// ===========================================================================
// Tests
// ===========================================================================

describe("ProTokenPlus + ProTokenPlusOperations", function () {
    // =======================================================================
    // Deployment & initialization
    // =======================================================================
    describe("Deployment & initialization", function () {
        it("sets initial state correctly", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            expect(await ctx.proTokenPlus.proTokenSettings()).to.equal(ctx.proTokenSettingsAddress);
            expect(await ctx.proTokenPlus.proUSD()).to.equal(ctx.proUSDAddress);
            expect(await ctx.proTokenPlus.operationsHandler()).to.equal(ctx.proTokenPlusOperationsAddress);
            expect(await ctx.proTokenPlus.unbondingPeriod()).to.equal(DEFAULT_UNBONDING_PERIOD);
            expect(await ctx.proTokenPlus.nextPositionId()).to.equal(1);
        });

        it("wires the StrategyVault and snapshots proToken/proTokenOperations", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            expect(await ctx.proTokenSettings.getStrategyVault()).to.equal(ctx.strategyVaultAddress);
            expect(await ctx.strategyVault.proTokenPlus()).to.equal(ctx.proTokenPlusAddress);
            expect(await ctx.strategyVault.proToken()).to.equal(ctx.proUSDAddress);
            expect(await ctx.strategyVault.proTokenOperations()).to.equal(ctx.proTokenOperationsAddress);
            // Pools start empty.
            expect(await ctx.strategyVault.depositProUSD()).to.equal(0n);
            expect(await ctx.strategyVault.withdrawProUSD()).to.equal(0n);
            expect(await ctx.strategyVault.growthProUSD()).to.equal(0n);
        });

        it("exposes the correct VERSION constant", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            expect(await ctx.proTokenPlus.VERSION()).to.equal(VERSION_1_0_0);
            expect(await ctx.proTokenPlusOperations.VERSION()).to.equal(VERSION_1_0_0);
        });

        it("registers the configured tiers", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const tiers = await ctx.proTokenPlus.getTiers([]);
            expect(tiers.length).to.equal(4);

            expect(tiers[0].tierId).to.equal(FLOOR_TIER_ID);
            expect(tiers[0].config.name).to.equal("Floor");
            expect(tiers[0].config.isDepositable).to.equal(false);

            expect(tiers[1].tierId).to.equal(QUARTERLY_TIER_ID);
            expect(tiers[1].config.duration).to.equal(QUARTERLY_DURATION);
            expect(tiers[1].config.apr).to.equal(QUARTERLY_APR);
            expect(tiers[1].config.isDepositable).to.equal(true);

            expect(tiers[3].tierId).to.equal(ANNUAL_TIER_ID);
            expect(tiers[3].config.duration).to.equal(ANNUAL_DURATION);
        });

        it("reverts initialize with zero proTokenSettings", async function () {
            const ProTokenPlusFactory = await ethers.getContractFactory("ProTokenPlus");
            const proUSD = await deployProToken(
                PROTOKEN_NAME,
                PROTOKEN_SYMBOL,
                ethers.Wallet.createRandom().address,
                ethers.Wallet.createRandom().address,
            );
            await expect(
                upgrades.deployProxy(
                    ProTokenPlusFactory,
                    [ZERO_ADDRESS, await proUSD.getAddress(), [], []],
                    { kind: "uups", unsafeAllow: ["delegatecall"] },
                ),
            ).to.be.revertedWithCustomError(ProTokenPlusFactory, "ZeroAddress");
        });

        it("reverts initialize with zero proUSD", async function () {
            const accounts = await getTestAccounts();
            const settings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator);
            const ProTokenPlusFactory = await ethers.getContractFactory("ProTokenPlus");
            await expect(
                upgrades.deployProxy(
                    ProTokenPlusFactory,
                    [await settings.getAddress(), ZERO_ADDRESS, [], []],
                    { kind: "uups", unsafeAllow: ["delegatecall"] },
                ),
            ).to.be.revertedWithCustomError(ProTokenPlusFactory, "ZeroAddress");
        });

        it("reverts initialize when tier arrays have mismatched lengths", async function () {
            const accounts = await getTestAccounts();
            const settings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator);
            const proUSD = await deployProToken(
                PROTOKEN_NAME,
                PROTOKEN_SYMBOL,
                await settings.getAddress(),
                accounts.minter.address,
            );
            const ProTokenPlusFactory = await ethers.getContractFactory("ProTokenPlus");

            await expect(
                upgrades.deployProxy(
                    ProTokenPlusFactory,
                    [
                        await settings.getAddress(),
                        await proUSD.getAddress(),
                        [0, 1],
                        [{ name: "Floor", apr: 0n, duration: 0n, minDeposit: 0n, isDepositable: false, isActive: true }],
                    ],
                    { kind: "uups", unsafeAllow: ["delegatecall"] },
                ),
            ).to.be.revertedWithCustomError(ProTokenPlusFactory, "TierConfigLengthMismatch");
        });

        it("reverts initialize when a non-floor tier has zero duration", async function () {
            const accounts = await getTestAccounts();
            const settings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator);
            const proUSD = await deployProToken(
                PROTOKEN_NAME,
                PROTOKEN_SYMBOL,
                await settings.getAddress(),
                accounts.minter.address,
            );
            const ProTokenPlusFactory = await ethers.getContractFactory("ProTokenPlus");

            await expect(
                upgrades.deployProxy(
                    ProTokenPlusFactory,
                    [
                        await settings.getAddress(),
                        await proUSD.getAddress(),
                        [1],
                        [{ name: "Bad", apr: QUARTERLY_APR, duration: 0n, minDeposit: MIN_DEPOSIT, isDepositable: true, isActive: true }],
                    ],
                    { kind: "uups", unsafeAllow: ["delegatecall"] },
                ),
            ).to.be.revertedWithCustomError(ProTokenPlusFactory, "InvalidDuration");
        });

        it("disables initializers on the satellite (DirectCallForbidden on operate)", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            await expect(
                ctx.proTokenPlusOperations.executeCreateDepositRequest(
                    ctx.accounts.user1.address,
                    QUARTERLY_TIER_ID,
                    HUNDRED_TOKENS,
                    [],
                ),
            ).to.be.revertedWithCustomError(ctx.proTokenPlusOperations, "DirectCallForbidden");
        });
    });

    // =======================================================================
    // Deposit lifecycle — now forwards proUSD to the StrategyVault via give()
    // =======================================================================
    describe("Deposit lifecycle", function () {
        it("creates a deposit request and escrows proUSD in the vault contract", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const userBalBefore = await ctx.proUSD.balanceOf(user.address);
            const vaultBalBefore = await ctx.proUSD.balanceOf(ctx.proTokenPlusAddress);

            await expect(
                ctx.proTokenPlus.connect(user).createDepositRequest(QUARTERLY_TIER_ID, HUNDRED_TOKENS, []),
            ).to.emit(ctx.proTokenPlus, "DepositRequestCreated");

            // proUSD escrowed inside ProTokenPlus until finalize (not yet in the vault).
            expect(await ctx.proUSD.balanceOf(user.address)).to.equal(userBalBefore - HUNDRED_TOKENS);
            expect(await ctx.proUSD.balanceOf(ctx.proTokenPlusAddress)).to.equal(vaultBalBefore + HUNDRED_TOKENS);
            expect(await ctx.proTokenPlus.totalPendingDeposits()).to.equal(HUNDRED_TOKENS);
        });

        it("reverts createDepositRequest with zero amount", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.user1).createDepositRequest(QUARTERLY_TIER_ID, 0n, []),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "ZeroAmount");
        });

        it("reverts createDepositRequest when below tier minimum", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.user1).createDepositRequest(QUARTERLY_TIER_ID, MIN_DEPOSIT - 1n, []),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "BelowMinDeposit");
        });

        it("finalize forwards proUSD to the StrategyVault (give) and books depositProUSD/depositBase", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const vaultProBefore = await ctx.proUSD.balanceOf(ctx.strategyVaultAddress);

            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);

            // Position created
            expect(positionId).to.equal(1n);
            const positions = await ctx.proTokenPlus.getUserPositions([positionId]);
            expect(positions[0].owner).to.equal(user.address);
            expect(positions[0].amount).to.equal(HUNDRED_TOKENS); // USD-base at NAV $1
            expect(positions[0].lockedTierId).to.equal(QUARTERLY_TIER_ID);
            expect(positions[0].state).to.equal(POSITION_STATE_LOCKED);
            expect(positions[0].status).to.equal(POSITION_STATUS_ACTIVE);

            // proUSD moved out of ProTokenPlus into the vault, and was booked.
            expect(await ctx.proUSD.balanceOf(ctx.strategyVaultAddress)).to.equal(vaultProBefore + HUNDRED_TOKENS);
            expect(await ctx.strategyVault.depositProUSD()).to.equal(HUNDRED_TOKENS);
            expect(await ctx.strategyVault.depositBase()).to.equal(HUNDRED_TOKENS); // NAV $1
            // ProTokenPlus no longer holds the escrow.
            expect(await ctx.proUSD.balanceOf(ctx.proTokenPlusAddress)).to.equal(0n);
            expect(await ctx.proTokenPlus.totalPendingDeposits()).to.equal(0n);

            const idsResult = await ctx.proTokenPlus.getUserPositionIds(user.address, 0, 10, true);
            expect(idsResult.totalCount).to.equal(1n);
            expect(idsResult.positionIdsResult[0]).to.equal(positionId);
        });

        it("finalize PROOF_OF_RETURN refunds proUSD and does NOT touch the vault", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;
            const userBalBefore = await ctx.proUSD.balanceOf(user.address);
            const vaultProBefore = await ctx.proUSD.balanceOf(ctx.strategyVaultAddress);

            const tx = await ctx.proTokenPlus
                .connect(user)
                .createDepositRequest(QUARTERLY_TIER_ID, HUNDRED_TOKENS, []);
            const receipt = await tx.wait();
            const createEvent = receipt!.logs
                .map((l) => {
                    try {
                        return ctx.proTokenPlus.interface.parseLog(l as never);
                    } catch {
                        return null;
                    }
                })
                .find((e) => e?.name === "DepositRequestCreated");
            const requestId = createEvent!.args.requestID as bigint;

            const proof = await signDepositProof(ctx.accounts.authority, ctx.proTokenPlusAddress, {
                requestId,
                tierID: QUARTERLY_TIER_ID,
                amount: HUNDRED_TOKENS,
                user: user.address,
                unlockedPositionsToMerge: [],
                proofKind: VaultProofKind.PROOF_OF_RETURN,
            });
            await ctx.proTokenPlus.connect(user).finalizeDepositRequest(requestId, VaultProofKind.PROOF_OF_RETURN, proof);

            expect(await ctx.proUSD.balanceOf(user.address)).to.equal(userBalBefore);
            // No give() happened.
            expect(await ctx.proUSD.balanceOf(ctx.strategyVaultAddress)).to.equal(vaultProBefore);
            expect(await ctx.strategyVault.depositProUSD()).to.equal(0n);
            const idsResult = await ctx.proTokenPlus.getUserPositionIds(user.address, 0, 10, true);
            expect(idsResult.totalCount).to.equal(0n);
        });

        it("reverts finalize when called by a non-owner", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const tx = await ctx.proTokenPlus
                .connect(ctx.accounts.user1)
                .createDepositRequest(QUARTERLY_TIER_ID, HUNDRED_TOKENS, []);
            const receipt = await tx.wait();
            const event = receipt!.logs
                .map((l) => {
                    try {
                        return ctx.proTokenPlus.interface.parseLog(l as never);
                    } catch {
                        return null;
                    }
                })
                .find((e) => e?.name === "DepositRequestCreated");
            const requestId = event!.args.requestID as bigint;

            const proof = await signDepositProof(ctx.accounts.authority, ctx.proTokenPlusAddress, {
                requestId,
                tierID: QUARTERLY_TIER_ID,
                amount: HUNDRED_TOKENS,
                user: ctx.accounts.user1.address,
                unlockedPositionsToMerge: [],
                proofKind: VaultProofKind.PROOF_OF_APPROVE,
            });

            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.user2).finalizeDepositRequest(requestId, VaultProofKind.PROOF_OF_APPROVE, proof),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "Unauthorized");
        });

        it("reverts finalize with InvalidAuthority when signed by a non-authorized signer", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;
            const tx = await ctx.proTokenPlus.connect(user).createDepositRequest(QUARTERLY_TIER_ID, HUNDRED_TOKENS, []);
            const receipt = await tx.wait();
            const event = receipt!.logs
                .map((l) => {
                    try {
                        return ctx.proTokenPlus.interface.parseLog(l as never);
                    } catch {
                        return null;
                    }
                })
                .find((e) => e?.name === "DepositRequestCreated");
            const requestId = event!.args.requestID as bigint;

            const badProof = await signDepositProof(ctx.accounts.attacker, ctx.proTokenPlusAddress, {
                requestId,
                tierID: QUARTERLY_TIER_ID,
                amount: HUNDRED_TOKENS,
                user: user.address,
                unlockedPositionsToMerge: [],
                proofKind: VaultProofKind.PROOF_OF_APPROVE,
            });

            await expect(
                ctx.proTokenPlus.connect(user).finalizeDepositRequest(requestId, VaultProofKind.PROOF_OF_APPROVE, badProof),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "InvalidAuthority");
        });

        it("reverts finalize when request is not PENDING (replay)", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;
            await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);

            const proof = await signDepositProof(ctx.accounts.authority, ctx.proTokenPlusAddress, {
                requestId: 0n,
                tierID: QUARTERLY_TIER_ID,
                amount: HUNDRED_TOKENS,
                user: user.address,
                unlockedPositionsToMerge: [],
                proofKind: VaultProofKind.PROOF_OF_APPROVE,
            });
            await expect(
                ctx.proTokenPlus.connect(user).finalizeDepositRequest(0n, VaultProofKind.PROOF_OF_APPROVE, proof),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "RequestNotPending");
        });

        it("computes lockedRewards from APR × principal × duration", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const principal = MIN_DEPOSIT * 10n; // 1000 proUSD
            const positionId = await depositFor(ctx, user, ANNUAL_TIER_ID, principal);

            const positions = await ctx.proTokenPlus.getUserPositions([positionId]);
            const expectedReward = (principal * ANNUAL_APR * ANNUAL_DURATION) / (USD_PRECISION * 365n * ONE_DAY_BN);
            expect(positions[0].amount).to.equal(principal);
            expect(positions[0].lockedRewards).to.equal(expectedReward);
            expect(positions[0].status).to.equal(POSITION_STATUS_ACTIVE);
        });

        it("reverts finalize on the satellite directly (DirectCallForbidden)", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            await expect(
                ctx.proTokenPlusOperations.executeFinalizeDepositRequest(
                    ctx.accounts.user1.address,
                    0n,
                    VaultProofKind.PROOF_OF_APPROVE,
                    "0x",
                ),
            ).to.be.revertedWithCustomError(ctx.proTokenPlusOperations, "DirectCallForbidden");
        });
    });

    // =======================================================================
    // Position state transitions
    // =======================================================================
    describe("Position state transitions", function () {
        it("position is LOCKED before lockExpiry, UNLOCKED after", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;
            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);

            let positions = await ctx.proTokenPlus.getUserPositions([positionId]);
            expect(positions[0].state).to.equal(POSITION_STATE_LOCKED);

            await time.increase(Number(QUARTERLY_DURATION) + 1);

            positions = await ctx.proTokenPlus.getUserPositions([positionId]);
            expect(positions[0].state).to.equal(POSITION_STATE_UNLOCKED);
            expect(positions[0].lockedTierId).to.equal(QUARTERLY_TIER_ID);
        });

        it("getUserBalanceSummary categorizes locked vs unlocked correctly", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await depositFor(ctx, user, ANNUAL_TIER_ID, HUNDRED_TOKENS * 2n);

            let summary = await ctx.proTokenPlus.getUserBalanceSummary(user.address);
            expect(summary.totalLocked).to.equal(HUNDRED_TOKENS * 3n);
            expect(summary.totalUnlocked).to.equal(0n);
            expect(summary.activePositionCount).to.equal(2n);

            await time.increase(Number(QUARTERLY_DURATION) + 1);

            summary = await ctx.proTokenPlus.getUserBalanceSummary(user.address);
            expect(summary.totalLocked).to.equal(HUNDRED_TOKENS * 2n);
            expect(summary.totalUnlocked).to.equal(HUNDRED_TOKENS);
        });

        it("getUserPositions returns a stub for non-existent ids", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const positions = await ctx.proTokenPlus.getUserPositions([9999n]);
            expect(positions.length).to.equal(1);
            expect(positions[0].positionId).to.equal(0n);
            expect(positions[0].owner).to.equal(ZERO_ADDRESS);
        });
    });

    // =======================================================================
    // Full StrategyVault flow: deposit → borrow → repay → withdraw → claim
    //
    // This is the end-to-end custody lifecycle. Because user withdrawals are
    // paid ONLY from the strategist-funded withdraw reserve (take consumes
    // withdrawProUSD), the strategist must repay enough proUSD to cover the
    // user's full position (principal + rewards) before completeWithdraw works.
    // =======================================================================
    describe("Full StrategyVault flow", function () {
        it("deposit books depositProUSD; borrow draws it into yAsset for the strategist", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            // Deposit 1000 proUSD → vault holds 1000 proUSD as depositProUSD.
            const principal = MIN_DEPOSIT * 10n;
            await depositFor(ctx, user, ANNUAL_TIER_ID, principal);
            expect(await ctx.strategyVault.depositProUSD()).to.equal(principal);
            expect(await ctx.strategyVault.depositBase()).to.equal(principal);

            const stratYBefore = await ctx.yAsset.balanceOf(ctx.accounts.strategist.address);
            const vaultProBefore = await ctx.proUSD.balanceOf(ctx.strategyVaultAddress);

            // Strategist borrows the full base; vault burns depositProUSD and unmints
            // it into yAsset delivered to the strategist.
            await expect(strategistBorrow(ctx, principal)).to.emit(ctx.strategyVault, EVENTS.Borrowed);

            // Borrow allowance consumed.
            expect(await ctx.strategyVault.depositProUSD()).to.equal(0n);
            // proUSD burned out of the vault (sent to Operations and burned).
            expect(await ctx.proUSD.balanceOf(ctx.strategyVaultAddress)).to.be.lt(vaultProBefore);
            // Strategist received yAsset (USDC, 6-dec). At $1 NAV, 1000 base → ~1000 USDC.
            const stratYAfter = await ctx.yAsset.balanceOf(ctx.accounts.strategist.address);
            expect(stratYAfter - stratYBefore).to.be.gt(0n);
        });

        it("strategist repay funds the withdraw reserve (withdrawProUSD/withdrawBase)", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;
            const principal = MIN_DEPOSIT * 10n;

            await depositFor(ctx, user, ANNUAL_TIER_ID, principal);
            await strategistBorrow(ctx, principal);

            // Simulate the strategist having generated yield: give them enough yAsset to
            // repay the principal plus a surplus. yAsset is 6-dec; 1 proUSD ≈ 1 USDC.
            const repayUSDC = 1200n * 10n ** 6n; // 1200 USDC covers 1000 principal + surplus
            await ctx.yAsset.mint(ctx.accounts.strategist.address, repayUSDC);

            const withdrawProBefore = await ctx.strategyVault.withdrawProUSD();
            await expect(strategistRepay(ctx, repayUSDC)).to.emit(ctx.strategyVault, EVENTS.Repaid);

            // Reserve grew by the proUSD minted from the repaid yAsset.
            const withdrawProAfter = await ctx.strategyVault.withdrawProUSD();
            expect(withdrawProAfter).to.be.gt(withdrawProBefore);
            expect(await ctx.strategyVault.withdrawBase()).to.be.gt(0n);
        });

        it("completeWithdraw is paid from the strategist-funded reserve (take consumes withdrawProUSD)", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            // Deposit a quarterly position.
            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            const totalBase = await positionTotalBase(ctx, positionId);
            const expectedPayout = await convertFromBase(ctx, totalBase);

            // Strategist borrows everything, then refills the reserve ahead of the exit.
            await strategistBorrow(ctx, await ctx.strategyVault.depositBase());
            // Fund the strategist with yAsset to repay enough proUSD to cover the exit.
            // totalBase includes rewards; over-fund to be safe (yAsset is 6-dec).
            const repayUSDC = 200n * 10n ** 6n;
            await ctx.yAsset.mint(ctx.accounts.strategist.address, repayUSDC);
            await strategistRepay(ctx, repayUSDC);

            // Unlock, then create + finalize the withdraw (starts unbonding).
            await time.increase(Number(QUARTERLY_DURATION) + 1);
            const unbondingIndex = await withdrawFor(ctx, user, [positionId], []);

            const positions = await ctx.proTokenPlus.getUserPositions([positionId]);
            expect(positions[0].status).to.equal(POSITION_STATUS_WITHDRAWN);

            // Before unbonding elapses, completeWithdraw reverts.
            await expect(
                ctx.proTokenPlus.connect(user).completeWithdraw([unbondingIndex], []),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "UnbondingNotComplete");

            await time.increase(Number(DEFAULT_UNBONDING_PERIOD) + 1);

            const reserveBefore = await ctx.strategyVault.withdrawProUSD();
            const balBefore = await ctx.proUSD.balanceOf(user.address);

            await expect(
                ctx.proTokenPlus.connect(user).completeWithdraw([unbondingIndex], []),
            ).to.emit(ctx.proTokenPlus, "Withdrawn");

            // User paid out in proUSD; the reserve was consumed by exactly the payout.
            const balAfter = await ctx.proUSD.balanceOf(user.address);
            expect(balAfter - balBefore).to.equal(expectedPayout);
            const reserveAfter = await ctx.strategyVault.withdrawProUSD();
            expect(reserveBefore - reserveAfter).to.equal(expectedPayout);

            const finalRequests = await ctx.proTokenPlus.getUnbondingRequests(user.address, 0, 10);
            expect(finalRequests[0].isActive).to.equal(false);
        });

        it("completeWithdraw reverts when the strategist has NOT funded the reserve", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            const totalBase = await positionTotalBase(ctx, positionId);

            // Strategist borrows everything and never repays — reserve stays empty.
            await strategistBorrow(ctx, await ctx.strategyVault.depositBase());

            await time.increase(Number(QUARTERLY_DURATION) + 1);
            const unbondingIndex = await withdrawFor(ctx, user, [positionId], []);
            await time.increase(Number(DEFAULT_UNBONDING_PERIOD) + 1);

            // take() reverts because withdrawProUSD is underfunded (by design).
            await expect(
                ctx.proTokenPlus.connect(user).completeWithdraw([unbondingIndex], []),
            ).to.be.revertedWithCustomError(ctx.strategyVault, "WithdrawReserveUnderfunded");
        });

        it("enforces the vault solvency invariant across the lifecycle", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            await depositFor(ctx, user, ANNUAL_TIER_ID, MIN_DEPOSIT * 5n);

            const held = await ctx.proUSD.balanceOf(ctx.strategyVaultAddress);
            const deposit = await ctx.strategyVault.depositProUSD();
            const reserve = await ctx.strategyVault.withdrawProUSD();
            const yield_ = await ctx.strategyVault.growthProUSD();

            // held >= depositProUSD + growthProUSD + withdrawProUSD
            expect(held).to.be.gte(deposit + reserve + yield_);
        });

        it("borrow reverts for a non-strategist caller", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            await depositFor(ctx, ctx.accounts.user1, ANNUAL_TIER_ID, MIN_DEPOSIT);
            await expect(
                ctx.strategyVault
                    .connect(ctx.accounts.attacker)
                    .borrow(MIN_DEPOSIT, ctx.yAssetAddress, ctx.accounts.attacker.address),
            ).to.be.revertedWithCustomError(ctx.strategyVault, "NotStrategist");
        });

        it("give reverts for a non-ProTokenPlus caller", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            await expect(
                ctx.strategyVault.connect(ctx.accounts.attacker).give(HUNDRED_TOKENS, HUNDRED_TOKENS),
            ).to.be.revertedWithCustomError(ctx.strategyVault, "NotProTokenPlus");
        });
    });

    // =======================================================================
    // Growth (price appreciation → growthProUSD, claimed by admin via claimGrowth)
    //
    // When proUSD appreciates, the vault needs fewer proUSD tokens to back the
    // same depositBase/withdrawBase. _accrueGrowth banks the freed tokens into
    // growthProUSD on the next interaction (emitting YieldAccrued); the ratchet
    // only moves on a rise. Admin claimGrowth(to, amount) pays out banked
    // growthProUSD (amount 0 = claim all) and emits YieldWithdrawn.
    // =======================================================================
    describe("Growth accumulation and claimGrowth", function () {
        // Bump proUSD's USD price to simulate appreciation. ProToken.setUSDPrice
        // is operator-gated (per the price model); the operator drives it here.
        async function appreciate(ctx: ProTokenPlusFixture, newPrice: bigint) {
            await ctx.proUSD.connect(ctx.accounts.admin).setUSDPrice(newPrice);
        }

        it("price appreciation banks freed proUSD into growthProUSD on the next interaction", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            // Deposit at $1: vault holds 1000 proUSD backing 1000 base.
            const principal = MIN_DEPOSIT * 10n;
            await depositFor(ctx, user, ANNUAL_TIER_ID, principal);
            expect(await ctx.strategyVault.growthProUSD()).to.equal(0n);

            // proUSD appreciates 10% → backing 1000 base now needs ~909 proUSD,
            // freeing ~91 proUSD as growth.
            await appreciate(ctx, (USD_PRECISION * 110n) / 100n);

            // claimableGrowth reflects the freed amount before it is banked.
            const claimable = await ctx.strategyVault.claimableGrowth();
            expect(claimable).to.be.gt(0n);

            // A second deposit triggers _accrueGrowth, banking the freed proUSD.
            await depositFor(ctx, user, ANNUAL_TIER_ID, MIN_DEPOSIT);
            const banked = await ctx.strategyVault.growthProUSD();
            expect(banked).to.be.gt(0n);
        });

        it("admin claimGrowth withdraws banked growthProUSD and never touches depositProUSD", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const principal = MIN_DEPOSIT * 10n;
            await depositFor(ctx, user, ANNUAL_TIER_ID, principal);
            await appreciate(ctx, (USD_PRECISION * 110n) / 100n);
            // Trigger accrual so growthProUSD is banked.
            await depositFor(ctx, user, ANNUAL_TIER_ID, MIN_DEPOSIT);

            const banked = await ctx.strategyVault.growthProUSD();
            expect(banked).to.be.gt(0n);
            const depositBefore = await ctx.strategyVault.depositProUSD();

            const adminBalBefore = await ctx.proUSD.balanceOf(ctx.accounts.admin.address);
            // proUSDAmount 0 = claim all banked growth.
            await expect(ctx.strategyVault.connect(ctx.accounts.admin).claimGrowth(ctx.accounts.admin.address, 0n))
                .to.emit(ctx.strategyVault, EVENTS.GrowthWithdrawn);

            // Admin received the banked growth; growthProUSD drained; deposit untouched.
            expect(await ctx.proUSD.balanceOf(ctx.accounts.admin.address)).to.equal(adminBalBefore + banked);
            expect(await ctx.strategyVault.growthProUSD()).to.equal(0n);
            expect(await ctx.strategyVault.depositProUSD()).to.equal(depositBefore);
        });

        it("the growth ratchet is monotonic: a price drop does not bank negative growth", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            await depositFor(ctx, user, ANNUAL_TIER_ID, MIN_DEPOSIT * 10n);
            // Rise then fall back below the high-water mark.
            await appreciate(ctx, (USD_PRECISION * 110n) / 100n);
            await depositFor(ctx, user, ANNUAL_TIER_ID, MIN_DEPOSIT); // banks growth at 1.10
            const bankedAtHigh = await ctx.strategyVault.growthProUSD();

            await appreciate(ctx, (USD_PRECISION * 105n) / 100n); // drop to 1.05
            await depositFor(ctx, user, ANNUAL_TIER_ID, MIN_DEPOSIT); // no new growth banked
            const bankedAfterDrop = await ctx.strategyVault.growthProUSD();

            expect(bankedAfterDrop).to.equal(bankedAtHigh);
            // lastPrice held at the high-water mark.
            expect(await ctx.strategyVault.lastPrice()).to.equal((USD_PRECISION * 110n) / 100n);
        });

        it("claimGrowth reverts for a non-admin caller", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            await expect(
                ctx.strategyVault.connect(ctx.accounts.user1).claimGrowth(ctx.accounts.user1.address, 0n),
            ).to.be.revertedWithCustomError(ctx.strategyVault, "NotAdminOrOperator");
        });
    });

    // =======================================================================
    // Yield (strategist-generated surplus → swept to yieldRecipient by claimYield)
    //
    // claimYield is permissionless but pays only the fixed admin-set
    // yieldRecipient. Its sweepable surplus is:
    //   held − (depositProUSD + growthProUSD + withdrawProUSD)
    // i.e. proUSD sitting in the vault above every earmarked pool.
    //
    // IMPORTANT: repay() books 100% of the minted proUSD into withdrawProUSD, so
    // over-repaying does NOT create surplus — it just grows the reserve. A genuine
    // claimable surplus is proUSD that lands in the vault's balance WITHOUT being
    // booked into any pool: a direct transfer in (the strategist routing generated
    // value straight to the vault, or any stray donation). We model that with a
    // direct proUSD transfer into the vault.
    // =======================================================================
    // describe("Yield accumulation and claimYield", function () {
    //     // proUSD transferred straight into the vault, bypassing give/repay accounting,
    //     // is unbooked excess — exactly what claimYield is meant to sweep.
    //     async function donateToVault(ctx: ProTokenPlusFixture, amount: bigint) {
    //         await ctx.proUSD.connect(ctx.accounts.externalBusiness).transfer(ctx.strategyVaultAddress, amount);
    //     }

    //     it("unbooked proUSD in the vault is a sweepable surplus above all obligations", async function () {
    //         const ctx = await loadFixture(proTokenPlusFixture);
    //         const user = ctx.accounts.user1;
    //         const principal = MIN_DEPOSIT * 10n;

    //         // Normal deposit → all of it is booked as depositProUSD (an obligation).
    //         await depositFor(ctx, user, ANNUAL_TIER_ID, principal);
    //         expect(await ctx.strategyVault.claimableYield()).to.equal(0n);

    //         // Unbooked proUSD arrives in the vault (strategist-generated value / donation).
    //         const donation = ethers.parseEther("300");
    //         await donateToVault(ctx, donation);

    //         const held = await ctx.proUSD.balanceOf(ctx.strategyVaultAddress);
    //         const obligations =
    //             (await ctx.strategyVault.depositProUSD()) +
    //             (await ctx.strategyVault.growthProUSD()) +
    //             (await ctx.strategyVault.withdrawProUSD());

    //         // The donation is surplus above all earmarked pools.
    //         expect(held - obligations).to.equal(donation);
    //         expect(await ctx.strategyVault.claimableYield()).to.equal(donation);
    //     });

    //     it("claimYield sweeps the surplus to the fixed yieldRecipient (permissionless trigger)", async function () {
    //         const ctx = await loadFixture(proTokenPlusFixture);
    //         const user = ctx.accounts.user1;

    //         await depositFor(ctx, user, ANNUAL_TIER_ID, MIN_DEPOSIT * 10n);
    //         const donation = ethers.parseEther("300");
    //         await donateToVault(ctx, donation);

    //         const surplus = await ctx.strategyVault.claimableYield();
    //         expect(surplus).to.equal(donation);
    //         const recipientBefore = await ctx.proUSD.balanceOf(ctx.accounts.yieldRecipient.address);

    //         // Anyone may trigger; funds go only to the stored recipient.
    //         await expect(ctx.strategyVault.connect(ctx.accounts.user2).claimYield(surplus))
    //             .to.emit(ctx.strategyVault, EVENTS.YieldClaimed);

    //         expect(await ctx.proUSD.balanceOf(ctx.accounts.yieldRecipient.address)).to.equal(
    //             recipientBefore + surplus,
    //         );
    //         // After sweeping, no surplus remains above obligations.
    //         expect(await ctx.strategyVault.claimableYield()).to.equal(0n);
    //     });

    //     it("claimYield does not touch the deposit allowance or the withdraw reserve", async function () {
    //         const ctx = await loadFixture(proTokenPlusFixture);
    //         const user = ctx.accounts.user1;
    //         const principal = MIN_DEPOSIT * 10n;

    //         // Deposit, fund the reserve via borrow+repay, then add an unbooked surplus.
    //         await depositFor(ctx, user, ANNUAL_TIER_ID, principal);
    //         await strategistBorrow(ctx, principal / 2n);
    //         const repayUSDC = 800n * 10n ** 6n;
    //         await ctx.yAsset.mint(ctx.accounts.strategist.address, repayUSDC);
    //         await strategistRepay(ctx, repayUSDC);
    //         await donateToVault(ctx, ethers.parseEther("250"));

    //         const depositBefore = await ctx.strategyVault.depositProUSD();
    //         const reserveBefore = await ctx.strategyVault.withdrawProUSD();

    //         const surplus = await ctx.strategyVault.claimableYield();
    //         expect(surplus).to.be.gt(0n);
    //         await ctx.strategyVault.connect(ctx.accounts.user2).claimYield(surplus);

    //         // Earmarked pools unchanged by the sweep.
    //         expect(await ctx.strategyVault.depositProUSD()).to.equal(depositBefore);
    //         expect(await ctx.strategyVault.withdrawProUSD()).to.equal(reserveBefore);
    //     });

    //     it("setYieldRecipient is admin-only and redirects the sweep", async function () {
    //         const ctx = await loadFixture(proTokenPlusFixture);
    //         await expect(
    //             ctx.strategyVault.connect(ctx.accounts.attacker).setYieldRecipient(ctx.accounts.user1.address),
    //         ).to.be.revertedWithCustomError(ctx.strategyVault, "NotAdmin");

    //         await expect(
    //             ctx.strategyVault.connect(ctx.accounts.admin).setYieldRecipient(ctx.accounts.user1.address),
    //         ).to.emit(ctx.strategyVault, EVENTS.YieldRecipientSet);
    //         expect(await ctx.strategyVault.yieldRecipient()).to.equal(ctx.accounts.user1.address);
    //     });
    // });

    // =======================================================================
    // Withdraw lifecycle (request/proof mechanics; funding covered above)
    //
    // These reuse a generously pre-funded reserve so the focus stays on the
    // request/finalize/complete mechanics rather than strategist funding.
    // =======================================================================
    describe("Withdraw lifecycle", function () {
        // Pre-fund the reserve by having the strategist borrow then over-repay,
        // so completeWithdraw is never gated on funding within these tests.
        async function prefundReserve(ctx: ProTokenPlusFixture, depositBase: bigint) {
            await strategistBorrow(ctx, depositBase);
            const repayUSDC = 2000n * 10n ** 6n;
            await ctx.yAsset.mint(ctx.accounts.strategist.address, repayUSDC);
            await strategistRepay(ctx, repayUSDC);
        }

        it("creates withdraw request only against unlocked positions", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;
            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);

            await expect(
                ctx.proTokenPlus.connect(user).createWithdrawRequest([positionId], []),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "PositionNotUnlocked");

            await time.increase(Number(QUARTERLY_DURATION) + 1);
            await expect(
                ctx.proTokenPlus.connect(user).createWithdrawRequest([positionId], []),
            ).to.emit(ctx.proTokenPlus, "WithdrawRequestCreated");
        });

        it("rejects PROOF_OF_RETURN on finalize (withdraw is APPROVE-only)", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;
            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await time.increase(Number(QUARTERLY_DURATION) + 1);

            const tx = await ctx.proTokenPlus.connect(user).createWithdrawRequest([positionId], []);
            const receipt = await tx.wait();
            const event = receipt!.logs
                .map((l) => {
                    try {
                        return ctx.proTokenPlus.interface.parseLog(l as never);
                    } catch {
                        return null;
                    }
                })
                .find((e) => e?.name === "WithdrawRequestCreated");
            const requestId = event!.args.requestID as bigint;

            const proof = await signWithdrawProof(ctx.accounts.authority, ctx.proTokenPlusAddress, {
                requestId,
                positionIDs: [positionId],
                user: user.address,
                unlockedPositionsToMerge: [],
                proofKind: VaultProofKind.PROOF_OF_RETURN,
            });

            await expect(
                ctx.proTokenPlus.connect(user).finalizeWithdrawRequest(requestId, VaultProofKind.PROOF_OF_RETURN, proof),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "IrrelevantProofKind");
        });

        it("full withdraw of a position leaves no remainder", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const principal = HUNDRED_TOKENS * 2n;
            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, principal);
            await prefundReserve(ctx, await ctx.strategyVault.depositBase());
            await time.increase(Number(QUARTERLY_DURATION) + 1);

            // Withdrawal is always the full listed position — no amount, no remainder.
            await withdrawFor(ctx, user, [positionId], []);

            // The position is fully withdrawn; no active positions remain.
            const idsResult = await ctx.proTokenPlus.getUserPositionIds(user.address, 0, 10, true);
            expect(idsResult.totalCount).to.equal(0n);

            const positions = await ctx.proTokenPlus.getUserPositions([positionId]);
            expect(positions[0].status).to.equal(POSITION_STATUS_WITHDRAWN);
        });

        it("reverts createWithdrawRequest with empty positions array", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.user1).createWithdrawRequest([], []),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "EmptyPositionArray");
        });

        it("reverts createWithdrawRequest with duplicate position ids", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;
            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await time.increase(Number(QUARTERLY_DURATION) + 1);

            await expect(
                ctx.proTokenPlus.connect(user).createWithdrawRequest([positionId, positionId], []),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "DuplicatePositionId");
        });

        it("reverts createWithdrawRequest when caller does not own a listed position", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const positionId = await depositFor(ctx, ctx.accounts.user1, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await time.increase(Number(QUARTERLY_DURATION) + 1);

            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.user2).createWithdrawRequest([positionId], []),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "PositionNotOwned");
        });

        it("can complete multiple unbondings in a single transaction", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const positionId1 = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            const positionId2 = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await prefundReserve(ctx, await ctx.strategyVault.depositBase());
            await time.increase(Number(QUARTERLY_DURATION) + 1);

            const base1 = await positionTotalBase(ctx, positionId1);
            const base2 = await positionTotalBase(ctx, positionId2);
            const u1 = await withdrawFor(ctx, user, [positionId1], []);
            const u2 = await withdrawFor(ctx, user, [positionId2], []);

            await time.increase(Number(DEFAULT_UNBONDING_PERIOD) + 1);

            const expectedPayout = (await convertFromBase(ctx, base1)) + (await convertFromBase(ctx, base2));
            const balBefore = await ctx.proUSD.balanceOf(user.address);
            await ctx.proTokenPlus.connect(user).completeWithdraw([u1, u2], []);
            const balAfter = await ctx.proUSD.balanceOf(user.address);
            expect(balAfter - balBefore).to.equal(expectedPayout);
        });
    });

    // =======================================================================
    // Relock — folds rewards in place; the vault is intentionally NOT touched
    // (rewards already live with the strategist; relock transfers no proUSD).
    // =======================================================================
    describe("Relock", function () {
        // Relock now rotates the position's reserve back into the borrowable deposit
        // pool via regive(), so the reserve must be funded first. Realistic sequence:
        // deposit → strategist borrows → strategist repays (funds withdrawProUSD) →
        // user relocks (rotates reserve → deposit). Fund generously so rotation has
        // proUSD to draw.
        async function prefundReserve(ctx: ProTokenPlusFixture, depositBase: bigint) {
            await strategistBorrow(ctx, depositBase);
            const repayUSDC = 5000n * 10n ** 6n;
            await ctx.yAsset.mint(ctx.accounts.strategist.address, repayUSDC);
            await strategistRepay(ctx, repayUSDC);
        }

        it("relock rotates reserve into the borrowable deposit pool (regive)", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;
            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);

            // Strategist funds the reserve ahead of expiry so relock can rotate.
            await prefundReserve(ctx, await ctx.strategyVault.depositBase());
            await time.increase(Number(QUARTERLY_DURATION) + 1);

            const depositProBefore = await ctx.strategyVault.depositProUSD();
            const withdrawProBefore = await ctx.strategyVault.withdrawProUSD();
            const heldBefore = await ctx.proUSD.balanceOf(ctx.strategyVaultAddress);

            const { newPositionId, fromTierId } = await relockFor(ctx, user, [positionId], HUNDRED_TOKENS, ANNUAL_TIER_ID);
            expect(fromTierId).to.equal(QUARTERLY_TIER_ID);

            const positions = await ctx.proTokenPlus.getUserPositions([newPositionId]);
            expect(positions[0].lockedTierId).to.equal(ANNUAL_TIER_ID);
            expect(positions[0].state).to.equal(POSITION_STATE_LOCKED);
            expect(positions[0].amount).to.equal(HUNDRED_TOKENS);

            const oldPositions = await ctx.proTokenPlus.getUserPositions([positionId]);
            expect(oldPositions[0].status).to.equal(POSITION_STATUS_RELOCATED);

            // regive moved proUSD from the withdraw reserve into the deposit pool:
            // depositProUSD up, withdrawProUSD down, by the same proUSD amount.
            const rotated = withdrawProBefore - (await ctx.strategyVault.withdrawProUSD());
            expect(rotated).to.be.gt(0n);
            expect((await ctx.strategyVault.depositProUSD()) - depositProBefore).to.equal(rotated);

            // No tokens entered or left the vault — only the earmark changed.
            expect(await ctx.proUSD.balanceOf(ctx.strategyVaultAddress)).to.equal(heldBefore);

            // Solvency invariant intact.
            const held = await ctx.proUSD.balanceOf(ctx.strategyVaultAddress);
            const obligations =
                (await ctx.strategyVault.depositProUSD()) +
                (await ctx.strategyVault.growthProUSD()) +
                (await ctx.strategyVault.withdrawProUSD());
            expect(held).to.be.gte(obligations);
        });

        it("relock with unfunded reserve emits RegivenAsync instead of reverting", async function () {
            // Under the async-regive design, an underfunded reserve does NOT block relock.
            // The vault emits RegivenAsync with the deferred amounts and skips its ledger
            // shuffle; a follow-up rotate() by the operator settles the ledger once the
            // strategist has repaid. Covered end-to-end in the "Async regive and rotate"
            // describe block below.
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;
            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            // No prefund — reserve is empty.
            await time.increase(Number(QUARTERLY_DURATION) + 1);

            // At NAV $1, proUSDAmount == worthBase == HUNDRED_TOKENS.
            await expect(
                ctx.proTokenPlus.connect(user).relock([positionId], HUNDRED_TOKENS, ANNUAL_TIER_ID, []),
            )
                .to.emit(ctx.strategyVault, "RegivenAsync")
                .withArgs(ctx.proTokenPlusAddress, HUNDRED_TOKENS, HUNDRED_TOKENS);

            // Position-side state advanced: source RELOCATED, new position exists.
            const oldPositions = await ctx.proTokenPlus.getUserPositions([positionId]);
            expect(oldPositions[0].status).to.equal(POSITION_STATUS_RELOCATED);
            const activeIds = await ctx.proTokenPlus.getUserPositionIds(user.address, 0, 10, true);
            expect(activeIds.totalCount).to.equal(2n);
        });

        it("reverts when relocking from a still-locked position", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;
            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await expect(
                ctx.proTokenPlus.connect(user).relock([positionId], HUNDRED_TOKENS, ANNUAL_TIER_ID, []),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "PositionNotUnlocked");
        });

        it("reverts when relocking to a non-depositable tier", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;
            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await time.increase(Number(QUARTERLY_DURATION) + 1);
            await expect(
                ctx.proTokenPlus.connect(user).relock([positionId], HUNDRED_TOKENS, FLOOR_TIER_ID, []),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "TierError");
        });

        it("partial relock creates a remainder on the source tier", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;
            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS * 2n);
            await prefundReserve(ctx, await ctx.strategyVault.depositBase());
            await time.increase(Number(QUARTERLY_DURATION) + 1);

            await ctx.proTokenPlus.connect(user).relock([positionId], HUNDRED_TOKENS, ANNUAL_TIER_ID, []);

            const ids = await ctx.proTokenPlus.getUserPositionIds(user.address, 0, 10, true);
            expect(ids.totalCount).to.equal(2n);

            const positions = await ctx.proTokenPlus.getUserPositions([...ids.positionIdsResult]);
            const annualPos = positions.find((p) => p.lockedTierId === BigInt(ANNUAL_TIER_ID));
            const quarterlyRemainder = positions.find((p) => p.lockedTierId === BigInt(QUARTERLY_TIER_ID));
            expect(annualPos).to.not.be.undefined;
            expect(quarterlyRemainder).to.not.be.undefined;
            expect(annualPos!.state).to.equal(POSITION_STATE_LOCKED);
            expect(quarterlyRemainder!.state).to.equal(POSITION_STATE_UNLOCKED);
        });

        it("reverts relock with duplicate position ids", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;
            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await time.increase(Number(QUARTERLY_DURATION) + 1);
            await expect(
                ctx.proTokenPlus.connect(user).relock([positionId, positionId], HUNDRED_TOKENS, ANNUAL_TIER_ID, []),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "DuplicatePositionId");
        });
    });

    // =======================================================================
    // Async regive and rotate
    //
    // When executeRelock calls regive() on a vault whose withdraw reserve is
    // underfunded (strategist hasn't repaid yet), the vault does NOT revert.
    // It emits RegivenAsync with the shortfall amounts, skips its ledger
    // shuffle, and returns. This lets user-facing relock succeed regardless
    // of strategist repay timing.
    //
    // The ledger catch-up happens later: once the strategist repays and the
    // withdraw reserve holds funds, the operator (or admin) calls rotate()
    // to move worthBase (and its proUSD equivalent at current price) from
    // the withdraw pool to the deposit pool, emitting Rotated. Backend
    // tracks the running sum: Σ RegivenAsync.worthBase − Σ Rotated.worthBase
    // gives the pending delta that still needs settlement.
    //
    // Scenario the tests exercise: strategist borrows the ENTIRE original
    // deposit BEFORE the relock. This drives depositBase to 0 and, since
    // no repay has happened, withdrawBase is 0 too — so relock's regive
    // truly cannot shuffle, and RegivenAsync fires. 
    // =======================================================================
    describe("Async regive and rotate", function () {
        it("RegivenAsync fires with (caller, proUSDAmount, worthBase); no Regiven and no ledger movement", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            // Strategist drains depositBase and never repays → withdrawBase is also 0.
            await strategistBorrow(ctx, HUNDRED_TOKENS);
            expect(await ctx.strategyVault.depositBase()).to.equal(0n);
            expect(await ctx.strategyVault.withdrawBase()).to.equal(0n);

            await time.increase(Number(QUARTERLY_DURATION) + 1);

            const depositProBefore = await ctx.strategyVault.depositProUSD();
            const depositBaseBefore = await ctx.strategyVault.depositBase();
            const withdrawProBefore = await ctx.strategyVault.withdrawProUSD();
            const withdrawBaseBefore = await ctx.strategyVault.withdrawBase();

            // caller in the event is the ProTokenPlus proxy (regive runs from the
            // Operations delegatecall inside ProTokenPlus's context).
            await expect(
                ctx.proTokenPlus.connect(user).relock([positionId], HUNDRED_TOKENS, ANNUAL_TIER_ID, []),
            )
                .to.emit(ctx.strategyVault, "RegivenAsync")
                .withArgs(ctx.proTokenPlusAddress, HUNDRED_TOKENS, HUNDRED_TOKENS);

            // Vault ledgers untouched — regive's async branch skipped every mutation.
            expect(await ctx.strategyVault.depositProUSD()).to.equal(depositProBefore);
            expect(await ctx.strategyVault.depositBase()).to.equal(depositBaseBefore);
            expect(await ctx.strategyVault.withdrawProUSD()).to.equal(withdrawProBefore);
            expect(await ctx.strategyVault.withdrawBase()).to.equal(withdrawBaseBefore);
        });

        it("async relock still creates the new position and marks the source RELOCATED", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await strategistBorrow(ctx, HUNDRED_TOKENS);
            await time.increase(Number(QUARTERLY_DURATION) + 1);

            const { newPositionId, fromTierId } = await relockFor(
                ctx, user, [positionId], HUNDRED_TOKENS, ANNUAL_TIER_ID,
            );
            expect(fromTierId).to.equal(QUARTERLY_TIER_ID);

            const newPositions = await ctx.proTokenPlus.getUserPositions([newPositionId]);
            expect(newPositions[0].lockedTierId).to.equal(ANNUAL_TIER_ID);
            expect(newPositions[0].amount).to.equal(HUNDRED_TOKENS);

            const oldPositions = await ctx.proTokenPlus.getUserPositions([positionId]);
            expect(oldPositions[0].status).to.equal(POSITION_STATUS_RELOCATED);
        });

        it("rotate moves worthBase from withdraw pool to deposit pool and emits Rotated", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            // Deposit, strategist borrows, then user relocks → RegivenAsync (deferred).
            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await strategistBorrow(ctx, HUNDRED_TOKENS);
            await time.increase(Number(QUARTERLY_DURATION) + 1);
            await ctx.proTokenPlus.connect(user).relock([positionId], HUNDRED_TOKENS, ANNUAL_TIER_ID, []);

            // Strategist repays enough to cover the deferred worthBase.
            // yAsset is 6-dec USDC; strategicMint converts 1:1 to proUSD at NAV $1.
            const repayUSDC = 200n * 10n ** 6n; // 200 USDC → ~200 proUSD into withdraw pool
            await ctx.yAsset.mint(ctx.accounts.strategist.address, repayUSDC);
            await strategistRepay(ctx, repayUSDC);

            const depositBaseBefore = await ctx.strategyVault.depositBase();
            const depositProBefore = await ctx.strategyVault.depositProUSD();
            const withdrawBaseBefore = await ctx.strategyVault.withdrawBase();
            const withdrawProBefore = await ctx.strategyVault.withdrawProUSD();

            const price = BigInt(await ctx.proUSD.getUSDPrice());
            const expectedProUSD = (HUNDRED_TOKENS * USD_PRECISION) / price;

            await expect(
                ctx.strategyVault.connect(ctx.accounts.operator).rotate(HUNDRED_TOKENS),
            )
                .to.emit(ctx.strategyVault, "Rotated")
                .withArgs(ctx.accounts.operator.address, expectedProUSD, HUNDRED_TOKENS);

            // depositBase / depositProUSD ↑ by (worthBase, proUSD); withdraw side ↓ by the same.
            expect((await ctx.strategyVault.depositBase()) - depositBaseBefore).to.equal(HUNDRED_TOKENS);
            expect((await ctx.strategyVault.depositProUSD()) - depositProBefore).to.equal(expectedProUSD);
            expect(withdrawBaseBefore - (await ctx.strategyVault.withdrawBase())).to.equal(HUNDRED_TOKENS);
            expect(withdrawProBefore - (await ctx.strategyVault.withdrawProUSD())).to.equal(expectedProUSD);

            // No new proUSD entered or left the vault — rotate is a pure ledger reshuffle.
            const held = await ctx.proUSD.balanceOf(ctx.strategyVaultAddress);
            const obligations =
                (await ctx.strategyVault.depositProUSD()) +
                (await ctx.strategyVault.growthProUSD()) +
                (await ctx.strategyVault.withdrawProUSD());
            expect(held).to.be.gte(obligations);
        });

        it("rotate supports partial settlement across multiple calls", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            // 300-token deposit; strategist borrows all 300; user relocks all 300 → RegivenAsync.
            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS * 3n);
            await strategistBorrow(ctx, HUNDRED_TOKENS * 3n);
            await time.increase(Number(QUARTERLY_DURATION) + 1);
            await ctx.proTokenPlus.connect(user).relock([positionId], HUNDRED_TOKENS * 3n, ANNUAL_TIER_ID, []);

            // Repay enough to cover all 300.
            const repayUSDC = 400n * 10n ** 6n;
            await ctx.yAsset.mint(ctx.accounts.strategist.address, repayUSDC);
            await strategistRepay(ctx, repayUSDC);

            const depositBaseStart = await ctx.strategyVault.depositBase();

            // First chunk.
            await ctx.strategyVault.connect(ctx.accounts.operator).rotate(HUNDRED_TOKENS);
            expect((await ctx.strategyVault.depositBase()) - depositBaseStart).to.equal(HUNDRED_TOKENS);

            // Second chunk completes the settlement.
            await ctx.strategyVault.connect(ctx.accounts.operator).rotate(HUNDRED_TOKENS * 2n);
            expect((await ctx.strategyVault.depositBase()) - depositBaseStart).to.equal(HUNDRED_TOKENS * 3n);
        });

        it("admin can also call rotate (not just operator)", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await strategistBorrow(ctx, HUNDRED_TOKENS);
            await time.increase(Number(QUARTERLY_DURATION) + 1);
            await ctx.proTokenPlus.connect(user).relock([positionId], HUNDRED_TOKENS, ANNUAL_TIER_ID, []);

            const repayUSDC = 200n * 10n ** 6n;
            await ctx.yAsset.mint(ctx.accounts.strategist.address, repayUSDC);
            await strategistRepay(ctx, repayUSDC);

            await expect(
                ctx.strategyVault.connect(ctx.accounts.admin).rotate(HUNDRED_TOKENS),
            ).to.emit(ctx.strategyVault, "Rotated");
        });

        it("rotate(0) reverts ZeroAmount", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            await expect(
                ctx.strategyVault.connect(ctx.accounts.operator).rotate(0n),
            ).to.be.revertedWithCustomError(ctx.strategyVault, "ZeroAmount");
        });

        it("rotate reverts RotateUnderfunded when withdrawBase is short", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            // Empty reserve; any positive worthBase should trip the base-side check.
            await expect(
                ctx.strategyVault.connect(ctx.accounts.operator).rotate(HUNDRED_TOKENS),
            )
                .to.be.revertedWithCustomError(ctx.strategyVault, "RotateUnderfunded")
                .withArgs(HUNDRED_TOKENS, 0n);
        });

        it("rotate reverts for a non-admin/operator caller", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            await expect(
                ctx.strategyVault.connect(ctx.accounts.user1).rotate(HUNDRED_TOKENS),
            ).to.be.revertedWithCustomError(ctx.strategyVault, "NotAdminOrOperator");
        });

        it("full sequence: deposit → borrow → async relock → repay → rotate → ledgers resync", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            // Deposit and immediately borrow — both sides of the vault ledger are exposed.
            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await strategistBorrow(ctx, HUNDRED_TOKENS);
            expect(await ctx.strategyVault.depositBase()).to.equal(0n);
            expect(await ctx.strategyVault.withdrawBase()).to.equal(0n);

            // Async relock: totalDepositsBase stays at HUNDRED_TOKENS (source burned +
            // new position credited), depositBase stays at 0.
            await time.increase(Number(QUARTERLY_DURATION) + 1);
            await ctx.proTokenPlus.connect(user).relock([positionId], HUNDRED_TOKENS, ANNUAL_TIER_ID, []);
            expect(await ctx.proTokenPlus.totalDepositsBase()).to.equal(HUNDRED_TOKENS);
            expect(await ctx.strategyVault.depositBase()).to.equal(0n);

            // Strategist repays; withdraw reserve fills up.
            const repayUSDC = 200n * 10n ** 6n;
            await ctx.yAsset.mint(ctx.accounts.strategist.address, repayUSDC);
            await strategistRepay(ctx, repayUSDC);
            expect(await ctx.strategyVault.withdrawBase()).to.be.gte(HUNDRED_TOKENS);

            // Operator rotates the pending worthBase.
            await ctx.strategyVault.connect(ctx.accounts.operator).rotate(HUNDRED_TOKENS);

            // depositBase now reflects the outstanding user position again.
            expect(await ctx.strategyVault.depositBase()).to.equal(HUNDRED_TOKENS);

            // Solvency invariant intact.
            const held = await ctx.proUSD.balanceOf(ctx.strategyVaultAddress);
            const obligations =
                (await ctx.strategyVault.depositProUSD()) +
                (await ctx.strategyVault.growthProUSD()) +
                (await ctx.strategyVault.withdrawProUSD());
            expect(held).to.be.gte(obligations);
        });
    });

    // =======================================================================
    // Earmark protection (withdraw-reserve race)
    //
    // Finding: nothing reserved withdraw-pool capacity for in-flight
    // unbondings, so a permissionless relock (regive) or an operator rotate
    // could drain the reserve first-come and block a matured completeWithdraw
    // with WithdrawReserveUnderfunded.
    //
    // Fix under test: _executeInitiateWithdraw calls vault.earmark(amount)
    // (BASE-denominated → price-invariant); take() releases the same amount
    // when the exit is paid; regive/rotate are gated on the SURPLUS
    // (withdrawBase − earmarkedWithdrawBase), not the raw aggregate, with the
    // markdown-window belt-and-braces token check retained.
    //
    // Invariant: earmarkedWithdrawBase == Σ active unbondingRequests[i].amount
    // (take() is the ONLY release path; there is no cancel/expiry).
    // =======================================================================
    describe("Earmark protection (withdraw-reserve race)", function () {
        // Mirror of the on-chain invariant's right-hand side.
        async function sumActiveUnbondings(
            ctx: ProTokenPlusFixture,
            users: HardhatEthersSigner[],
        ): Promise<bigint> {
            let sum = 0n;
            for (const u of users) {
                const reqs = await ctx.proTokenPlus.getUnbondingRequests(u.address, 0, 100);
                for (const r of reqs) {
                    if (r.isActive) sum += BigInt(r.amount);
                }
            }
            return sum;
        }

        async function expectEarmarkInvariant(
            ctx: ProTokenPlusFixture,
            users: HardhatEthersSigner[],
        ) {
            expect(await ctx.strategyVault.earmarkedWithdrawBase()).to.equal(
                await sumActiveUnbondings(ctx, users),
            );
        }

        it("WIRING: initiate-withdraw earmarks exactly the unbonding amount and emits Earmarked", async function () {
            // This test is the tripwire for the silent-no-op failure mode: the
            // earmark call is a void external call, so an unset vault or a
            // dropped call site would fail SILENTLY everywhere except here.
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            const totalBase = await positionTotalBase(ctx, positionId);
            await time.increase(Number(QUARTERLY_DURATION) + 1);

            expect(await ctx.strategyVault.earmarkedWithdrawBase()).to.equal(0n);

            // withdrawFor finalizes the request → _executeInitiateWithdraw →
            // vault.earmark(request.amount). Caller seen by the vault is the
            // ProTokenPlus proxy (delegatecall context).
            const createTx = await ctx.proTokenPlus.connect(user).createWithdrawRequest([positionId], []);
            const requestId = (await createTx.wait())!.logs
                .map((l) => { try { return ctx.proTokenPlus.interface.parseLog(l as never); } catch { return null; } })
                .find((e) => e?.name === "WithdrawRequestCreated")!.args.requestID as bigint;
            const proof = await signWithdrawProof(ctx.accounts.authority, ctx.proTokenPlusAddress, {
                requestId,
                positionIDs: [positionId],
                user: user.address,
                unlockedPositionsToMerge: [],
                proofKind: VaultProofKind.PROOF_OF_APPROVE,
            });

            await expect(
                ctx.proTokenPlus.connect(user).finalizeWithdrawRequest(requestId, VaultProofKind.PROOF_OF_APPROVE, proof),
            )
                .to.emit(ctx.strategyVault, "Earmarked")
                .withArgs(ctx.proTokenPlusAddress, totalBase, totalBase);

            expect(await ctx.strategyVault.earmarkedWithdrawBase()).to.equal(totalBase);
            await expectEarmarkInvariant(ctx, [user]);
        });

        it("take() releases the earmark when the exit is paid", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            const totalBase = await positionTotalBase(ctx, positionId);

            // Fund the reserve generously so completion is not funding-gated.
            await strategistBorrow(ctx, await ctx.strategyVault.depositBase());
            const repayUSDC = 2000n * 10n ** 6n;
            await ctx.yAsset.mint(ctx.accounts.strategist.address, repayUSDC);
            await strategistRepay(ctx, repayUSDC);

            await time.increase(Number(QUARTERLY_DURATION) + 1);
            const unbondingIndex = await withdrawFor(ctx, user, [positionId], []);
            expect(await ctx.strategyVault.earmarkedWithdrawBase()).to.equal(totalBase);

            await time.increase(Number(DEFAULT_UNBONDING_PERIOD) + 1);
            await ctx.proTokenPlus.connect(user).completeWithdraw([unbondingIndex], []);

            // Obligation settled → earmark fully released.
            expect(await ctx.strategyVault.earmarkedWithdrawBase()).to.equal(0n);
            await expectEarmarkInvariant(ctx, [user]);
        });

        it("THE RACE: a relock can no longer drain reserve owed to a matured exit (defers async; exit succeeds)", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const alice = ctx.accounts.user1;
            const bob = ctx.accounts.user2;

            // Both hold quarterly positions; strategist borrows everything, then
            // repays 110 — enough for ALICE's exit (~101.5 incl. rewards) but not
            // for alice's exit AND bob's 100-relock.
            const alicePos = await depositFor(ctx, alice, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            const bobPos = await depositFor(ctx, bob, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            const aliceTotal = await positionTotalBase(ctx, alicePos);
            await strategistBorrow(ctx, await ctx.strategyVault.depositBase());
            const repayUSDC = 110n * 10n ** 6n;
            await ctx.yAsset.mint(ctx.accounts.strategist.address, repayUSDC);
            await strategistRepay(ctx, repayUSDC);

            await time.increase(Number(QUARTERLY_DURATION) + 1);

            // Alice initiates: her exit is now earmarked.
            const unbondingIndex = await withdrawFor(ctx, alice, [alicePos], []);
            expect(await ctx.strategyVault.earmarkedWithdrawBase()).to.equal(aliceTotal);

            // RED-TEST PRECONDITION: the AGGREGATE reserve covers bob's relock
            // (100 ≤ 110) — under pre-fix code, regive's aggregate-only check
            // would have passed and DRAINED alice's funding here.
            expect(await ctx.strategyVault.withdrawProUSD()).to.be.gte(HUNDRED_TOKENS);
            expect(await ctx.strategyVault.withdrawBase()).to.be.gte(HUNDRED_TOKENS);

            // GREEN: the surplus gate (110 − 101.5 ≈ 8.5 < 100) defers instead.
            const reserveBefore = await ctx.strategyVault.withdrawProUSD();
            await expect(
                ctx.proTokenPlus.connect(bob).relock([bobPos], HUNDRED_TOKENS, ANNUAL_TIER_ID, []),
            )
                .to.emit(ctx.strategyVault, "RegivenAsync")
                .withArgs(ctx.proTokenPlusAddress, HUNDRED_TOKENS, HUNDRED_TOKENS);

            // Reserve untouched by the deferred regive; bob's relock still
            // succeeded on the position side (async design).
            expect(await ctx.strategyVault.withdrawProUSD()).to.equal(reserveBefore);
            expect(
                (await ctx.proTokenPlus.getUserPositions([bobPos]))[0].status,
            ).to.equal(POSITION_STATUS_RELOCATED);

            // Alice's matured exit is paid in full — the race is gone.
            await time.increase(Number(DEFAULT_UNBONDING_PERIOD) + 1);
            const balBefore = await ctx.proUSD.balanceOf(alice.address);
            await ctx.proTokenPlus.connect(alice).completeWithdraw([unbondingIndex], []);
            expect((await ctx.proUSD.balanceOf(alice.address)) - balBefore).to.equal(
                await convertFromBase(ctx, aliceTotal),
            );
            await expectEarmarkInvariant(ctx, [alice, bob]);
        });

        it("rotate is bounded to the surplus: reverts RotateUnderfunded(requested, surplus), then succeeds for exactly the surplus", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const alice = ctx.accounts.user1;

            const alicePos = await depositFor(ctx, alice, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            const aliceTotal = await positionTotalBase(ctx, alicePos);
            await strategistBorrow(ctx, await ctx.strategyVault.depositBase());
            const repayUSDC = 110n * 10n ** 6n;
            await ctx.yAsset.mint(ctx.accounts.strategist.address, repayUSDC);
            await strategistRepay(ctx, repayUSDC);

            await time.increase(Number(QUARTERLY_DURATION) + 1);
            const unbondingIndex = await withdrawFor(ctx, alice, [alicePos], []);

            // Surplus = reserve base − earmark (all at $1, so bases are exact).
            const surplus = (await ctx.strategyVault.withdrawBase()) - aliceTotal;
            expect(surplus).to.be.gt(0n);

            // Over-surplus rotate reverts, reporting the ACTIONABLE ceiling.
            await expect(
                ctx.strategyVault.connect(ctx.accounts.operator).rotate(HUNDRED_TOKENS / 2n),
            )
                .to.be.revertedWithCustomError(ctx.strategyVault, "RotateUnderfunded")
                .withArgs(HUNDRED_TOKENS / 2n, surplus);

            // Rotating exactly the surplus succeeds…
            await expect(ctx.strategyVault.connect(ctx.accounts.operator).rotate(surplus))
                .to.emit(ctx.strategyVault, "Rotated");

            // …and leaves the reserve at exactly alice's earmark: her exit still clears.
            expect(await ctx.strategyVault.withdrawBase()).to.equal(aliceTotal);
            await time.increase(Number(DEFAULT_UNBONDING_PERIOD) + 1);
            await expect(
                ctx.proTokenPlus.connect(alice).completeWithdraw([unbondingIndex], []),
            ).to.emit(ctx.proTokenPlus, "Withdrawn");
            expect(await ctx.strategyVault.earmarkedWithdrawBase()).to.equal(0n);
        });

        it("PRE-REPAY CLAMP: earmark exceeding the reserve clamps surplus to zero — reshuffling waits for repay", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const alice = ctx.accounts.user1;
            const bob = ctx.accounts.user2;

            // Bigger positions so bob's tier-minimum relock (100) fits under the reserve.
            const alicePos = await depositFor(ctx, alice, QUARTERLY_TIER_ID, HUNDRED_TOKENS * 3n);
            const bobPos = await depositFor(ctx, bob, QUARTERLY_TIER_ID, HUNDRED_TOKENS * 3n);
            const aliceTotal = await positionTotalBase(ctx, alicePos); // ≈ 304.4
            await strategistBorrow(ctx, await ctx.strategyVault.depositBase());

            await time.increase(Number(QUARTERLY_DURATION) + 1);
            await withdrawFor(ctx, alice, [alicePos], []);

            // Partial repay: reserve (150) is POSITIVE and would cover bob's
            // 100-relock under the old aggregate check — but it's entirely
            // inside alice's ~304 earmark, so surplus clamps to 0.
            const repayUSDC = 150n * 10n ** 6n;
            await ctx.yAsset.mint(ctx.accounts.strategist.address, repayUSDC);
            await strategistRepay(ctx, repayUSDC);
            expect(await ctx.strategyVault.withdrawBase()).to.be.gte(HUNDRED_TOKENS);
            expect(await ctx.strategyVault.earmarkedWithdrawBase()).to.be.gt(
                await ctx.strategyVault.withdrawBase(),
            );

            // Every regive defers…
            await expect(
                ctx.proTokenPlus.connect(bob).relock([bobPos], HUNDRED_TOKENS, ANNUAL_TIER_ID, []),
            ).to.emit(ctx.strategyVault, "RegivenAsync");

            // …and every rotate reverts with surplus 0.
            await expect(
                ctx.strategyVault.connect(ctx.accounts.operator).rotate(1n),
            )
                .to.be.revertedWithCustomError(ctx.strategyVault, "RotateUnderfunded")
                .withArgs(1n, 0n);
        });

        it("earmark is BASE-denominated: survives appreciation and ratchet accrual unchanged; released on completion at the higher price", async function () {
            // NOTE: the markdown half of this property (earmark unchanged across
            // markdownPrice, exit payable after cover) lives on the slash branch —
            // add it to SlashMarkdownCover.test.ts when the branches merge.
            const ctx = await loadFixture(proTokenPlusFixture);
            const alice = ctx.accounts.user1;
            const P_110 = (USD_PRECISION * 110n) / 100n;

            const alicePos = await depositFor(ctx, alice, QUARTERLY_TIER_ID, HUNDRED_TOKENS * 2n);
            const aliceTotal = await positionTotalBase(ctx, alicePos);

            // Borrow everything at $1, repay 300 USDC → 300 base in the reserve.
            await strategistBorrow(ctx, await ctx.strategyVault.depositBase());
            const repayUSDC = 300n * 10n ** 6n;
            await ctx.yAsset.mint(ctx.accounts.strategist.address, repayUSDC);
            await strategistRepay(ctx, repayUSDC);

            await time.increase(Number(QUARTERLY_DURATION) + 1);
            await withdrawFor(ctx, alice, [alicePos], []);
            expect(await ctx.strategyVault.earmarkedWithdrawBase()).to.equal(aliceTotal);

            // Price rises to $1.10 and the ratchet ACCRUES (banking freed tokens
            // out of the withdraw pool into growth). The earmark is a BASE
            // commitment: the accrual shrinks the token pool and the token cost
            // of alice's exit in lockstep, and the earmark itself must not move.
            await ctx.proUSD.connect(ctx.accounts.admin).setUSDPrice(P_110);
            await ctx.strategyVault
                .connect(ctx.accounts.admin)
                .claimGrowth(ctx.accounts.admin.address, 0n); // triggers _accrueGrowth
            expect(await ctx.strategyVault.earmarkedWithdrawBase()).to.equal(aliceTotal);

            // Completion pays FEWER tokens at the higher price (aliceTotal/1.10)
            // and releases the full BASE earmark — pinning that the release is
            // worthBase-keyed, not token-keyed.
            await time.increase(Number(DEFAULT_UNBONDING_PERIOD) + 1);
            const balBefore = await ctx.proUSD.balanceOf(alice.address);
            const unbondings = await ctx.proTokenPlus.getActiveUnbondingIndices(alice.address);
            await ctx.proTokenPlus.connect(alice).completeWithdraw([unbondings[0]], []);

            expect((await ctx.proUSD.balanceOf(alice.address)) - balBefore).to.equal(
                (aliceTotal * USD_PRECISION) / P_110,
            );
            expect(await ctx.strategyVault.earmarkedWithdrawBase()).to.equal(0n);
        });

        it("INVARIANT: earmarkedWithdrawBase == Σ active unbondings through a mixed sequence", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const alice = ctx.accounts.user1;
            const bob = ctx.accounts.user2;

            const a1 = await depositFor(ctx, alice, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            const a2 = await depositFor(ctx, alice, QUARTERLY_TIER_ID, HUNDRED_TOKENS * 2n);
            const b1 = await depositFor(ctx, bob, QUARTERLY_TIER_ID, HUNDRED_TOKENS);

            // Fund completions generously up front.
            await strategistBorrow(ctx, await ctx.strategyVault.depositBase());
            const repayUSDC = 2000n * 10n ** 6n;
            await ctx.yAsset.mint(ctx.accounts.strategist.address, repayUSDC);
            await strategistRepay(ctx, repayUSDC);

            await time.increase(Number(QUARTERLY_DURATION) + 1);

            const uA1 = await withdrawFor(ctx, alice, [a1], []);
            await expectEarmarkInvariant(ctx, [alice, bob]);

            await withdrawFor(ctx, bob, [b1], []);
            await expectEarmarkInvariant(ctx, [alice, bob]);

            await time.increase(Number(DEFAULT_UNBONDING_PERIOD) + 1);
            await ctx.proTokenPlus.connect(alice).completeWithdraw([uA1], []);
            await expectEarmarkInvariant(ctx, [alice, bob]);

            // A late initiate after completions still tracks.
            await withdrawFor(ctx, alice, [a2], []);
            await expectEarmarkInvariant(ctx, [alice, bob]);

            // Bob completes last; only alice's a2 unbonding remains earmarked.
            const bobUnbondings = await ctx.proTokenPlus.getActiveUnbondingIndices(bob.address);
            await ctx.proTokenPlus.connect(bob).completeWithdraw([bobUnbondings[0]], []);
            await expectEarmarkInvariant(ctx, [alice, bob]);
            expect(await ctx.strategyVault.earmarkedWithdrawBase()).to.equal(
                await positionTotalBase(ctx, a2),
            );
        });
    });

    // =======================================================================
    // Unlocked merge
    // =======================================================================
    describe("Unlocked merge", function () {
        it("merges multiple unlocked positions on the same tier into one", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const id1 = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            const id2 = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await time.increase(Number(QUARTERLY_DURATION) + 1);

            await expect(ctx.proTokenPlus.connect(user).unlockedMerge([id1, id2])).to.emit(ctx.proTokenPlus, "UnlockedMerged");

            const ids = await ctx.proTokenPlus.getUserPositionIds(user.address, 0, 10, true);
            expect(ids.totalCount).to.equal(1n);
            const merged = await ctx.proTokenPlus.getUserPositions([ids.positionIdsResult[0]]);

            const SECONDS_PER_YEAR_BN = 365n * ONE_DAY_BN;
            const rewardsPerPosition = (HUNDRED_TOKENS * QUARTERLY_APR * QUARTERLY_DURATION) / (SECONDS_PER_YEAR_BN * USD_PRECISION);
            const expectedMergedAmount = 2n * (HUNDRED_TOKENS + rewardsPerPosition);
            expect(merged[0].amount).to.equal(expectedMergedAmount);
            expect(merged[0].lockedTierId).to.equal(QUARTERLY_TIER_ID);
            expect(merged[0].state).to.equal(POSITION_STATE_UNLOCKED);

            const sources = await ctx.proTokenPlus.getUserPositions([id1, id2]);
            expect(sources[0].status).to.equal(POSITION_STATUS_UNLOCKED_MERGED);
            expect(sources[1].status).to.equal(POSITION_STATUS_UNLOCKED_MERGED);
        });

        it("reverts merging positions on different tiers", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;
            const id1 = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            const id2 = await depositFor(ctx, user, SEMI_ANNUAL_TIER_ID, HUNDRED_TOKENS);
            await time.increase(Number(SEMI_ANNUAL_DURATION) + 1);
            await expect(
                ctx.proTokenPlus.connect(user).unlockedMerge([id1, id2]),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "PositionTierMismatch");
        });

        it("reverts merging a locked position", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;
            const id1 = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            const id2 = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await expect(
                ctx.proTokenPlus.connect(user).unlockedMerge([id1, id2]),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "PositionNotUnlocked");
        });

        it("reverts on duplicate position ids", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;
            const id = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await time.increase(Number(QUARTERLY_DURATION) + 1);
            await expect(
                ctx.proTokenPlus.connect(user).unlockedMerge([id, id]),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "DuplicatePositionId");
        });

        it("pre-merge via unlockedPositionsToMerge consolidates before the main action", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const id1 = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            const id2 = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await time.increase(Number(QUARTERLY_DURATION) + 1);

            await depositFor(ctx, user, ANNUAL_TIER_ID, HUNDRED_TOKENS, [id1, id2]);

            const ids = await ctx.proTokenPlus.getUserPositionIds(user.address, 0, 10, true);
            expect(ids.totalCount).to.equal(2n);
        });
    });

    // =======================================================================
    // Admin / configuration
    // =======================================================================
    describe("Admin configuration", function () {
        it("addTier adds a new tier", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const newTierId = 4;
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.admin).addTier(newTierId, {
                    name: "Biennial",
                    apr: ANNUAL_APR * 2n,
                    duration: 730n * ONE_DAY_BN,
                    minDeposit: MIN_DEPOSIT,
                    isDepositable: true,
                    isActive: true,
                }),
            ).to.emit(ctx.proTokenPlus, "TierAdded");

            const tiers = await ctx.proTokenPlus.getTiers([newTierId]);
            expect(tiers[0].config.name).to.equal("Biennial");
        });

        it("addTier reverts for non-admin caller", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.user1).addTier(99, {
                    name: "X", apr: 0n, duration: ONE_DAY_BN, minDeposit: 0n, isDepositable: true, isActive: true,
                }),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "NotAdmin");
        });

        it("addTier reverts when a non-floor tier has zero duration", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.admin).addTier(99, {
                    name: "Bad", apr: 0n, duration: 0n, minDeposit: 0n, isDepositable: true, isActive: true,
                }),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "InvalidDuration");
        });

        it("addTier reverts on duplicate tierId", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.admin).addTier(QUARTERLY_TIER_ID, {
                    name: "Conflict", apr: 0n, duration: QUARTERLY_DURATION, minDeposit: 0n, isDepositable: true, isActive: true,
                }),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "TierError");
        });

        it("updateTierConfig updates fields", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const newMin = ethers.parseEther("200");
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.admin).updateTierConfig(
                    QUARTERLY_TIER_ID, "Quarterly v2", QUARTERLY_APR, QUARTERLY_DURATION, newMin, true, true,
                ),
            ).to.emit(ctx.proTokenPlus, "TierConfigUpdated");

            const tiers = await ctx.proTokenPlus.getTiers([QUARTERLY_TIER_ID]);
            expect(tiers[0].config.name).to.equal("Quarterly v2");
            expect(tiers[0].config.minDeposit).to.equal(newMin);
        });

        it("setUnbondingPeriod updates the period", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.admin).setUnbondingPeriod(ONE_WEEK_BN),
            ).to.emit(ctx.proTokenPlus, "UnbondingPeriodSet");
            expect(await ctx.proTokenPlus.unbondingPeriod()).to.equal(ONE_WEEK_BN);
        });

        it("setProUSD updates the address and rejects zero", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const newProUSD = await deployProToken("Other", "OTH", ctx.proTokenSettingsAddress, ctx.accounts.minter.address);
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.admin).setProUSD(await newProUSD.getAddress()),
            ).to.emit(ctx.proTokenPlus, "ProUSDSet");
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.admin).setProUSD(ZERO_ADDRESS),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "ZeroAddress");
        });

        it("setOperationsHandler enforces version compatibility", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const NewSat = await ethers.getContractFactory("ProTokenPlusOperations");
            const newSat = await NewSat.deploy();
            await newSat.waitForDeployment();
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.admin).setOperationsHandler(await newSat.getAddress()),
            ).to.emit(ctx.proTokenPlus, "OperationsHandlerSet");
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.admin).setOperationsHandler(ZERO_ADDRESS),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "ZeroAddress");
        });

        it("non-admin cannot call admin functions", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.user1).setUnbondingPeriod(ONE_WEEK_BN),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "NotAdmin");
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.user1).setProUSD(ctx.accounts.user1.address),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "NotAdmin");
        });

        it("pause/unpause blocks user operations", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            await expect(ctx.proTokenPlus.connect(user).pause()).to.be.revertedWithCustomError(ctx.proTokenPlus, "NotAdmin");

            await ctx.proTokenPlus.connect(ctx.accounts.admin).pause();
            expect(await ctx.proTokenPlus.isPaused()).to.equal(true);

            await expect(
                ctx.proTokenPlus.connect(user).createDepositRequest(QUARTERLY_TIER_ID, HUNDRED_TOKENS, []),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "EnforcedPause");

            await expect(ctx.proTokenPlus.connect(user).unpause()).to.be.revertedWithCustomError(ctx.proTokenPlus, "NotAdmin");

            await ctx.proTokenPlus.connect(ctx.accounts.admin).unpause();
            expect(await ctx.proTokenPlus.isPaused()).to.equal(false);
        });
    });

    // =======================================================================
    // Satellite (ProTokenPlusOperations) — direct invocation
    // =======================================================================
    describe("ProTokenPlusOperations (satellite)", function () {
        it("rejects all execute* calls made directly (DirectCallForbidden)", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);

            await expect(
                ctx.proTokenPlusOperations.executeCreateDepositRequest(ctx.accounts.user1.address, QUARTERLY_TIER_ID, HUNDRED_TOKENS, []),
            ).to.be.revertedWithCustomError(ctx.proTokenPlusOperations, "DirectCallForbidden");

            await expect(
                ctx.proTokenPlusOperations.executeFinalizeDepositRequest(ctx.accounts.user1.address, 0n, VaultProofKind.PROOF_OF_APPROVE, "0x"),
            ).to.be.revertedWithCustomError(ctx.proTokenPlusOperations, "DirectCallForbidden");

            await expect(
                ctx.proTokenPlusOperations.executeCreateWithdrawRequest(ctx.accounts.user1.address, [1n], []),
            ).to.be.revertedWithCustomError(ctx.proTokenPlusOperations, "DirectCallForbidden");

            await expect(
                ctx.proTokenPlusOperations.executeFinalizeWithdrawRequest(ctx.accounts.user1.address, 0n, VaultProofKind.PROOF_OF_APPROVE, "0x"),
            ).to.be.revertedWithCustomError(ctx.proTokenPlusOperations, "DirectCallForbidden");

            await expect(
                ctx.proTokenPlusOperations.executeCompleteWithdraw(ctx.accounts.user1.address, [0n], []),
            ).to.be.revertedWithCustomError(ctx.proTokenPlusOperations, "DirectCallForbidden");

            await expect(
                ctx.proTokenPlusOperations.executeRelock(ctx.accounts.user1.address, [1n], HUNDRED_TOKENS, ANNUAL_TIER_ID, []),
            ).to.be.revertedWithCustomError(ctx.proTokenPlusOperations, "DirectCallForbidden");

            await expect(
                ctx.proTokenPlusOperations.executeUnlockedMerge(ctx.accounts.user1.address, [1n, 2n]),
            ).to.be.revertedWithCustomError(ctx.proTokenPlusOperations, "DirectCallForbidden");
        });

        it("satellite VERSION matches the proxy VERSION", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            expect(await ctx.proTokenPlusOperations.VERSION()).to.equal(await ctx.proTokenPlus.VERSION());
        });

        it("setOperationsHandler reverts on VERSION mismatch", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const otherImpl = await deployProToken("X", "X", ctx.proTokenSettingsAddress, ctx.accounts.minter.address);
            const otherAddr = await otherImpl.getAddress();

            const otherVersion = await otherImpl.VERSION();
            const plusVersion = await ctx.proTokenPlus.VERSION();
            if (otherVersion === plusVersion) {
                this.skip();
            }

            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.admin).setOperationsHandler(otherAddr),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "VersionMismatch");
        });
    });

    // =======================================================================
    // View functions
    // =======================================================================
    describe("View functions", function () {
        it("getTiers returns all when called with empty array", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const tiers = await ctx.proTokenPlus.getTiers([]);
            expect(tiers.length).to.equal(4);
        });

        it("getTiers returns only requested when given specific ids", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const tiers = await ctx.proTokenPlus.getTiers([ANNUAL_TIER_ID, QUARTERLY_TIER_ID]);
            expect(tiers.length).to.equal(2);
            expect(tiers[0].tierId).to.equal(ANNUAL_TIER_ID);
            expect(tiers[1].tierId).to.equal(QUARTERLY_TIER_ID);
        });

        it("getUserPositionIds paginates correctly", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;
            await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await depositFor(ctx, user, SEMI_ANNUAL_TIER_ID, HUNDRED_TOKENS);
            await depositFor(ctx, user, ANNUAL_TIER_ID, HUNDRED_TOKENS);

            const page1 = await ctx.proTokenPlus.getUserPositionIds(user.address, 0, 2, true);
            expect(page1.totalCount).to.equal(3n);
            expect(page1.positionIdsResult.length).to.equal(2);

            const page2 = await ctx.proTokenPlus.getUserPositionIds(user.address, 2, 2, true);
            expect(page2.positionIdsResult.length).to.equal(1);

            const beyond = await ctx.proTokenPlus.getUserPositionIds(user.address, 100, 10, true);
            expect(beyond.positionIdsResult.length).to.equal(0);
        });

        it("getUserPositionIds(activeOnly=false) returns inactive positions, not all", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;
            const principalId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await time.increase(Number(QUARTERLY_DURATION) + 1);
            const totalBase = await positionTotalBase(ctx, principalId);
            await withdrawFor(ctx, user, [principalId], []);

            const inactive = await ctx.proTokenPlus.getUserPositionIds(user.address, 0, 10, false);
            expect(inactive.totalCount).to.equal(1n);
            expect(inactive.positionIdsResult[0]).to.equal(principalId);

            const active = await ctx.proTokenPlus.getUserPositionIds(user.address, 0, 10, true);
            const activeIdsArray = [...active.positionIdsResult].map((x) => x.toString());
            expect(activeIdsArray).to.not.include(principalId.toString());
        });

        it("getUnbondingRequests and getActiveUnbondingIndices reflect in-flight unbondings", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;
            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await time.increase(Number(QUARTERLY_DURATION) + 1);
            const totalBase = await positionTotalBase(ctx, positionId);
            const unbondingIndex = await withdrawFor(ctx, user, [positionId], []);

            const requests = await ctx.proTokenPlus.getUnbondingRequests(user.address, 0, 10);
            expect(requests.length).to.equal(1);
            expect(requests[0].amount).to.equal(totalBase);
            expect(requests[0].isActive).to.equal(true);

            const indices = await ctx.proTokenPlus.getActiveUnbondingIndices(user.address);
            expect(indices.length).to.equal(1);
            expect(indices[0]).to.equal(unbondingIndex);

            const count = await ctx.proTokenPlus.getUnbondingRequestCount(user.address);
            expect(count).to.equal(1n);
        });
    });

    // =======================================================================
    // totalDepositsBase invariant
    //
    // Invariant: totalDepositsBase == Σ active position.amount (principal-base),
    // across every mutating path. Rewards are promoted into principal on relock
    // and merge, and must be reflected; withdrawal removes principal at INITIATE
    // (not at completeWithdraw). Each test asserts the invariant after the op.
    // =======================================================================
    describe("totalDepositsBase invariant", function () {
        async function prefundReserve(ctx: ProTokenPlusFixture, depositBase: bigint) {
            await strategistBorrow(ctx, depositBase);
            const repayUSDC = 5000n * 10n ** 6n;
            await ctx.yAsset.mint(ctx.accounts.strategist.address, repayUSDC);
            await strategistRepay(ctx, repayUSDC);
        }

        it("starts at zero", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            expect(await ctx.proTokenPlus.totalDepositsBase()).to.equal(0n);
            await expectDepositsBaseInvariant(ctx, [ctx.accounts.user1, ctx.accounts.user2]);
        });

        it("tracks deposits: equals summed principal of active positions", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const { user1, user2 } = ctx.accounts;

            await depositFor(ctx, user1, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await expectDepositsBaseInvariant(ctx, [user1, user2]);

            await depositFor(ctx, user1, ANNUAL_TIER_ID, MIN_DEPOSIT * 3n);
            await depositFor(ctx, user2, SEMI_ANNUAL_TIER_ID, HUNDRED_TOKENS * 2n);
            await expectDepositsBaseInvariant(ctx, [user1, user2]);

            // Ledger equals the sum of the three principals (rewards excluded).
            const expected = HUNDRED_TOKENS + MIN_DEPOSIT * 3n + HUNDRED_TOKENS * 2n;
            expect(await ctx.proTokenPlus.totalDepositsBase()).to.equal(expected);
        });

        it("PROOF_OF_RETURN deposit does not change the ledger", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const tx = await ctx.proTokenPlus
                .connect(user)
                .createDepositRequest(QUARTERLY_TIER_ID, HUNDRED_TOKENS, []);
            const receipt = await tx.wait();
            const requestId = receipt!.logs
                .map((l) => {
                    try { return ctx.proTokenPlus.interface.parseLog(l as never); } catch { return null; }
                })
                .find((e) => e?.name === "DepositRequestCreated")!.args.requestID as bigint;

            const proof = await signDepositProof(ctx.accounts.authority, ctx.proTokenPlusAddress, {
                requestId,
                tierID: QUARTERLY_TIER_ID,
                amount: HUNDRED_TOKENS,
                user: user.address,
                unlockedPositionsToMerge: [],
                proofKind: VaultProofKind.PROOF_OF_RETURN,
            });
            await ctx.proTokenPlus.connect(user).finalizeDepositRequest(requestId, VaultProofKind.PROOF_OF_RETURN, proof);

            expect(await ctx.proTokenPlus.totalDepositsBase()).to.equal(0n);
            await expectDepositsBaseInvariant(ctx, [user]);
        });

        it("withdraw initiate removes principal from the ledger; completeWithdraw does not change it", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const positionId = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await prefundReserve(ctx, await ctx.strategyVault.depositBase());
            await time.increase(Number(QUARTERLY_DURATION) + 1);

            const beforeInitiate = await ctx.proTokenPlus.totalDepositsBase();
            expect(beforeInitiate).to.equal(HUNDRED_TOKENS);

            const unbondingIndex = await withdrawFor(ctx, user, [positionId], []);

            // Principal left the ledger at initiate (position no longer active).
            expect(await ctx.proTokenPlus.totalDepositsBase()).to.equal(0n);
            await expectDepositsBaseInvariant(ctx, [user]);

            // completeWithdraw pays out but doesn't touch totalDepositsBase.
            await time.increase(Number(DEFAULT_UNBONDING_PERIOD) + 1);
            await ctx.proTokenPlus.connect(user).completeWithdraw([unbondingIndex], []);

            expect(await ctx.proTokenPlus.totalDepositsBase()).to.equal(0n);
            await expectDepositsBaseInvariant(ctx, [user]);
        });

        it("full relock promotes rewards into principal (ledger rises by lockedRewards)", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const positionId = await depositFor(ctx, user, ANNUAL_TIER_ID, MIN_DEPOSIT * 10n);
            const total = await positionTotalBase(ctx, positionId); // principal + rewards
            const principalBefore = await ctx.proTokenPlus.totalDepositsBase();

            // Strategist funds the reserve so relock can rotate (regive) it back.
            await prefundReserve(ctx, await ctx.strategyVault.depositBase());
            await time.increase(Number(ANNUAL_DURATION) + 1);

            // Relock the FULL position value into a new tier.
            await relockFor(ctx, user, [positionId], total, QUARTERLY_TIER_ID);

            // New position's principal = the full relocked value (rewards promoted).
            expect(await ctx.proTokenPlus.totalDepositsBase()).to.equal(total);
            // Rose by exactly the promoted rewards.
            const positions = await ctx.proTokenPlus.getUserPositions([positionId]);
            const rewards = total - BigInt(positions[0].amount); // amount field still holds old principal
            expect(await ctx.proTokenPlus.totalDepositsBase()).to.equal(principalBefore + rewards);

            await expectDepositsBaseInvariant(ctx, [user]);
        });

        it("partial relock keeps the invariant (principal-first slice)", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const positionId = await depositFor(ctx, user, ANNUAL_TIER_ID, MIN_DEPOSIT * 10n);
            const total = await positionTotalBase(ctx, positionId);
            await prefundReserve(ctx, await ctx.strategyVault.depositBase());
            await time.increase(Number(ANNUAL_DURATION) + 1);

            // Relock half the total value; the rest stays as a remainder.
            const sliceAmount = total / 2n;
            await ctx.proTokenPlus.connect(user).relock([positionId], sliceAmount, QUARTERLY_TIER_ID, []);

            // Invariant must hold regardless of how the slice split principal vs rewards.
            await expectDepositsBaseInvariant(ctx, [user]);

            // Two active positions now: the relocked one and the remainder.
            const ids = await ctx.proTokenPlus.getUserPositionIds(user.address, 0, 10, true);
            expect(ids.totalCount).to.equal(2n);
        });

        it("merge promotes rewards into principal and keeps the invariant", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const id1 = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            const id2 = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            const base1 = await positionTotalBase(ctx, id1);
            const base2 = await positionTotalBase(ctx, id2);

            await time.increase(Number(QUARTERLY_DURATION) + 1);
            await ctx.proTokenPlus.connect(user).unlockedMerge([id1, id2]);

            // Merged position's principal = sum of both totals (rewards promoted).
            expect(await ctx.proTokenPlus.totalDepositsBase()).to.equal(base1 + base2);
            await expectDepositsBaseInvariant(ctx, [user]);
        });

        it("merge via unlockedPositionsToMerge (during a deposit) keeps the invariant", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const id1 = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            const id2 = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await time.increase(Number(QUARTERLY_DURATION) + 1);

            // This deposit pre-merges id1+id2, then books the new deposit.
            await depositFor(ctx, user, ANNUAL_TIER_ID, HUNDRED_TOKENS, [id1, id2]);

            await expectDepositsBaseInvariant(ctx, [user]);
        });

        it("survives a full mixed sequence: deposit → relock → merge → withdraw", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            // Two deposits.
            const idA = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS * 2n);
            await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            await prefundReserve(ctx, await ctx.strategyVault.depositBase());
            await expectDepositsBaseInvariant(ctx, [user]);

            await time.increase(Number(QUARTERLY_DURATION) + 1);

            // Partial relock of idA into ANNUAL.
            const totalA = await positionTotalBase(ctx, idA);
            await ctx.proTokenPlus.connect(user).relock([idA], totalA / 2n, ANNUAL_TIER_ID, []);
            await expectDepositsBaseInvariant(ctx, [user]);

            // Merge the remaining unlocked QUARTERLY positions.
            const unlockedIds = await ctx.proTokenPlus.getUserPositionIds(user.address, 0, 10, true);
            const quarterlyActive: bigint[] = [];
            const positions = await ctx.proTokenPlus.getUserPositions([...unlockedIds.positionIdsResult]);
            for (let i = 0; i < positions.length; i++) {
                if (
                    positions[i].lockedTierId === BigInt(QUARTERLY_TIER_ID) &&
                    positions[i].state === POSITION_STATE_UNLOCKED
                ) {
                    quarterlyActive.push(BigInt(positions[i].positionId));
                }
            }
            if (quarterlyActive.length >= 2) {
                await ctx.proTokenPlus.connect(user).unlockedMerge(quarterlyActive);
                await expectDepositsBaseInvariant(ctx, [user]);
            }

            // Withdraw whatever unlocked positions remain.
            const finalActive = await ctx.proTokenPlus.getUserPositionIds(user.address, 0, 10, true);
            const finalPositions = await ctx.proTokenPlus.getUserPositions([...finalActive.positionIdsResult]);
            for (let i = 0; i < finalPositions.length; i++) {
                if (finalPositions[i].state === POSITION_STATE_UNLOCKED) {
                    await withdrawFor(ctx, user, [BigInt(finalPositions[i].positionId)], []);
                    await expectDepositsBaseInvariant(ctx, [user]);
                }
            }
        });
    });

    // =======================================================================
    // Deposit cap
    //
    // depositCap bounds NEW external capital: it is checked in _executeDeposit
    // against totalDepositsBase + worthBase, before any state mutation. A cap of
    // 0 disables enforcement. Relock and merge promote already-counted principal/
    // rewards and move no new proUSD into the vault, so they intentionally bypass
    // the cap — totalDepositsBase can therefore exceed depositCap via those paths.
    //
    // NOTE: assumes admin setter `setDepositCap(uint256)`, public getter
    // `depositCap()`, and error `DepositCapReached(attempted, cap)`. Adjust names
    // if the contract differs. Cap is in base units (== proUSD at $1 NAV).
    // =======================================================================
    describe("Deposit cap", function () {
        async function prefundReserve(ctx: ProTokenPlusFixture, depositBase: bigint) {
            await strategistBorrow(ctx, depositBase);
            const repayUSDC = 5000n * 10n ** 6n;
            await ctx.yAsset.mint(ctx.accounts.strategist.address, repayUSDC);
            await strategistRepay(ctx, repayUSDC);
        }

        it("setDepositCap is admin-only", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.user1).setDepositCap(MIN_DEPOSIT * 10n),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "NotAdmin");

            await ctx.proTokenPlus.connect(ctx.accounts.admin).setDepositCap(MIN_DEPOSIT * 10n);
            expect(await ctx.proTokenPlus.depositCap()).to.equal(MIN_DEPOSIT * 10n);
        });

        it("defaults to 0 (disabled) — deposits above any notional cap succeed", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            expect(await ctx.proTokenPlus.depositCap()).to.equal(0n);

            // With cap disabled, a large deposit goes through.
            await depositFor(ctx, ctx.accounts.user1, ANNUAL_TIER_ID, MIN_DEPOSIT * 50n);
            expect(await ctx.proTokenPlus.totalDepositsBase()).to.equal(MIN_DEPOSIT * 50n);
        });

        it("allows deposits up to exactly the cap", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const cap = MIN_DEPOSIT * 10n; // 1000 base
            await ctx.proTokenPlus.connect(ctx.accounts.admin).setDepositCap(cap);

            // Two deposits summing to exactly the cap both succeed.
            await depositFor(ctx, ctx.accounts.user1, ANNUAL_TIER_ID, MIN_DEPOSIT * 6n);
            await depositFor(ctx, ctx.accounts.user2, ANNUAL_TIER_ID, MIN_DEPOSIT * 4n);

            expect(await ctx.proTokenPlus.totalDepositsBase()).to.equal(cap);
        });

        it("reverts the deposit that would cross the cap (DepositCapReached)", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const cap = MIN_DEPOSIT * 10n;
            await ctx.proTokenPlus.connect(ctx.accounts.admin).setDepositCap(cap);

            // Fill to the cap.
            await depositFor(ctx, ctx.accounts.user1, ANNUAL_TIER_ID, cap);
            expect(await ctx.proTokenPlus.totalDepositsBase()).to.equal(cap);

            // The next deposit (any size) crosses the cap. The cap is enforced at
            // finalize (_executeDeposit), so the revert surfaces there.
            const user = ctx.accounts.user2;
            const tx = await ctx.proTokenPlus
                .connect(user)
                .createDepositRequest(ANNUAL_TIER_ID, MIN_DEPOSIT, []);
            const requestId = (await tx.wait())!.logs
                .map((l) => {
                    try { return ctx.proTokenPlus.interface.parseLog(l as never); } catch { return null; }
                })
                .find((e) => e?.name === "DepositRequestCreated")!.args.requestID as bigint;

            const proof = await signDepositProof(ctx.accounts.authority, ctx.proTokenPlusAddress, {
                requestId,
                tierID: ANNUAL_TIER_ID,
                amount: MIN_DEPOSIT,
                user: user.address,
                unlockedPositionsToMerge: [],
                proofKind: VaultProofKind.PROOF_OF_APPROVE,
            });

            await expect(
                ctx.proTokenPlus.connect(user).finalizeDepositRequest(requestId, VaultProofKind.PROOF_OF_APPROVE, proof),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "DepositCapReached");

            // Ledger unchanged by the reverted deposit.
            expect(await ctx.proTokenPlus.totalDepositsBase()).to.equal(cap);
        });

        it("enforces the cap from the very first deposit (no zero-balance bypass)", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const cap = MIN_DEPOSIT * 5n; // 500 base
            await ctx.proTokenPlus.connect(ctx.accounts.admin).setDepositCap(cap);

            // First-ever deposit exceeds the cap → must revert (totalDepositsBase is 0).
            const user = ctx.accounts.user1;
            const tx = await ctx.proTokenPlus
                .connect(user)
                .createDepositRequest(ANNUAL_TIER_ID, MIN_DEPOSIT * 6n, []);
            const requestId = (await tx.wait())!.logs
                .map((l) => {
                    try { return ctx.proTokenPlus.interface.parseLog(l as never); } catch { return null; }
                })
                .find((e) => e?.name === "DepositRequestCreated")!.args.requestID as bigint;

            const proof = await signDepositProof(ctx.accounts.authority, ctx.proTokenPlusAddress, {
                requestId,
                tierID: ANNUAL_TIER_ID,
                amount: MIN_DEPOSIT * 6n,
                user: user.address,
                unlockedPositionsToMerge: [],
                proofKind: VaultProofKind.PROOF_OF_APPROVE,
            });

            await expect(
                ctx.proTokenPlus.connect(user).finalizeDepositRequest(requestId, VaultProofKind.PROOF_OF_APPROVE, proof),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "DepositCapReached");
        });

        it("relock can push totalDepositsBase above the cap (promoted rewards bypass the cap by design)", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            // Deposit at the cap exactly (cap = the deposit's base).
            const principal = MIN_DEPOSIT * 10n;
            const positionId = await depositFor(ctx, user, ANNUAL_TIER_ID, principal);
            await ctx.proTokenPlus.connect(ctx.accounts.admin).setDepositCap(principal);
            expect(await ctx.proTokenPlus.totalDepositsBase()).to.equal(principal);

            // Fund the reserve so the relock can rotate (regive) it back.
            await prefundReserve(ctx, await ctx.strategyVault.depositBase());
            await time.increase(Number(ANNUAL_DURATION) + 1);

            // Relock the full position (principal + rewards). Rewards promote into
            // principal, pushing totalDepositsBase ABOVE the cap — and this is allowed,
            // because relock moves no new proUSD in.
            const total = await positionTotalBase(ctx, positionId);
            expect(total).to.be.gt(principal); // rewards make total exceed cap
            await relockFor(ctx, user, [positionId], total, QUARTERLY_TIER_ID);

            expect(await ctx.proTokenPlus.totalDepositsBase()).to.equal(total);
            expect(await ctx.proTokenPlus.totalDepositsBase()).to.be.gt(await ctx.proTokenPlus.depositCap());
        });

        it("merge can push totalDepositsBase above the cap (promoted rewards bypass the cap by design)", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const user = ctx.accounts.user1;

            const id1 = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            const id2 = await depositFor(ctx, user, QUARTERLY_TIER_ID, HUNDRED_TOKENS);
            const base1 = await positionTotalBase(ctx, id1);
            const base2 = await positionTotalBase(ctx, id2);

            // Cap set to the deposited principal (excludes rewards).
            const cap = HUNDRED_TOKENS * 2n;
            await ctx.proTokenPlus.connect(ctx.accounts.admin).setDepositCap(cap);

            await time.increase(Number(QUARTERLY_DURATION) + 1);
            await ctx.proTokenPlus.connect(user).unlockedMerge([id1, id2]);

            // Merged principal includes promoted rewards → above the cap, by design.
            expect(await ctx.proTokenPlus.totalDepositsBase()).to.equal(base1 + base2);
            expect(await ctx.proTokenPlus.totalDepositsBase()).to.be.gt(cap);
        });

        it("lowering the cap below current deposits blocks new deposits but does not claw back", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);

            await depositFor(ctx, ctx.accounts.user1, ANNUAL_TIER_ID, MIN_DEPOSIT * 10n);
            const current = await ctx.proTokenPlus.totalDepositsBase();

            // Set cap below current total.
            await ctx.proTokenPlus.connect(ctx.accounts.admin).setDepositCap(current - MIN_DEPOSIT);

            // Existing deposits untouched.
            expect(await ctx.proTokenPlus.totalDepositsBase()).to.equal(current);

            // Any new deposit reverts (already above cap).
            const user = ctx.accounts.user2;
            const tx = await ctx.proTokenPlus
                .connect(user)
                .createDepositRequest(ANNUAL_TIER_ID, MIN_DEPOSIT, []);
            const requestId = (await tx.wait())!.logs
                .map((l) => {
                    try { return ctx.proTokenPlus.interface.parseLog(l as never); } catch { return null; }
                })
                .find((e) => e?.name === "DepositRequestCreated")!.args.requestID as bigint;
            const proof = await signDepositProof(ctx.accounts.authority, ctx.proTokenPlusAddress, {
                requestId,
                tierID: ANNUAL_TIER_ID,
                amount: MIN_DEPOSIT,
                user: user.address,
                unlockedPositionsToMerge: [],
                proofKind: VaultProofKind.PROOF_OF_APPROVE,
            });
            await expect(
                ctx.proTokenPlus.connect(user).finalizeDepositRequest(requestId, VaultProofKind.PROOF_OF_APPROVE, proof),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, "DepositCapReached");
        });
    });

    // =======================================================================
    // _authorizeUpgrade (UUPS)
    // =======================================================================
    describe("_authorizeUpgrade (UUPS)", function () {
        it("admin can upgrade to a higher VERSION", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const V2 = await ethers.getContractFactory("MockUpgradeTargetHigherVersion");
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.admin).upgradeToAndCall(await v2Impl.getAddress(), "0x"),
            ).to.not.be.reverted;
        });

        it("emits Upgraded(newImpl) on successful upgrade", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const V2 = await ethers.getContractFactory("MockUpgradeTargetHigherVersion");
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.admin).upgradeToAndCall(await v2Impl.getAddress(), "0x"),
            )
                .to.emit(ctx.proTokenPlus, EVENTS.Upgraded)
                .withArgs(await v2Impl.getAddress());
        });

        it("reverts VersionNotIncremented when new VERSION equals current", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const Same = await ethers.getContractFactory("MockUpgradeTargetSameVersion");
            const sameImpl = await Same.deploy();
            await sameImpl.waitForDeployment();
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.admin).upgradeToAndCall(await sameImpl.getAddress(), "0x"),
            )
                .to.be.revertedWithCustomError(ctx.proTokenPlus, ERRORS.VersionNotIncremented)
                .withArgs(VERSION_1_0_0, VERSION_1_0_0);
        });

        it("reverts VersionNotIncremented when new VERSION is lower", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const Lower = await ethers.getContractFactory("MockUpgradeTargetLowerVersion");
            const lowerImpl = await Lower.deploy();
            await lowerImpl.waitForDeployment();
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.admin).upgradeToAndCall(await lowerImpl.getAddress(), "0x"),
            )
                .to.be.revertedWithCustomError(ctx.proTokenPlus, ERRORS.VersionNotIncremented)
                .withArgs(VERSION_1_0_0, 1n);
        });

        it("reverts NotAdmin when called by operator", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const V2 = await ethers.getContractFactory("MockUpgradeTargetHigherVersion");
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.operator).upgradeToAndCall(await v2Impl.getAddress(), "0x"),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, ERRORS.NotAdmin);
        });

        it("reverts NotAdmin when called by an authorized backend signer", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const V2 = await ethers.getContractFactory("MockUpgradeTargetHigherVersion");
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.authority).upgradeToAndCall(await v2Impl.getAddress(), "0x"),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, ERRORS.NotAdmin);
        });

        it("reverts NotAdmin when called by a random user", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const V2 = await ethers.getContractFactory("MockUpgradeTargetHigherVersion");
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.user1).upgradeToAndCall(await v2Impl.getAddress(), "0x"),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, ERRORS.NotAdmin);
        });

        it("reverts NotAdmin when called by the attacker", async function () {
            const ctx = await loadFixture(proTokenPlusFixture);
            const V2 = await ethers.getContractFactory("MockUpgradeTargetHigherVersion");
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();
            await expect(
                ctx.proTokenPlus.connect(ctx.accounts.attacker).upgradeToAndCall(await v2Impl.getAddress(), "0x"),
            ).to.be.revertedWithCustomError(ctx.proTokenPlus, ERRORS.NotAdmin);
        });
    });
});