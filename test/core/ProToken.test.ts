import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
    ZERO_ADDRESS,
    ONE_TOKEN,
    HUNDRED_TOKENS,
    THOUSAND_TOKENS,
    MIN_USD_PRICE,
    DEFAULT_USD_PRICE,
    VERSION_1_0_0,
    PROTOKEN_NAME,
    PROTOKEN_SYMBOL,
    ONE_MINUTE,
    ERRORS,
    EVENTS,
} from "../helpers/constants";
import {
    proTokenFixture,
    proTokenSettingsFixture,
    proTokenFundedFixture,
} from "../helpers/fixtures";
import {
    deployProToken,
    getTestAccounts,
} from "../helpers/deploy";
// Mirrors ProToken.DEFAULT_PRICE_UPDATE_COOLDOWN (23 hours, in seconds).
const PRICE_UPDATE_COOLDOWN = 23 * 60 * 60;
// ---------------------------------------------------------------------------
// ProToken — unit tests
//
// Goal: 100% line/branch coverage of contracts/core/ProToken.sol.
//
// Uses real ProTokenSettings (deployed as UUPS proxy in the fixture) as the
// access-control source. Upgrade tests use minimal UUPS impls with controlled
// VERSION values to exercise _authorizeUpgrade's version check directly.
//
// PRICE AUTHORITY SPLIT:
//   setUSDPrice    — ADMIN-only. Arbitrary values in {0} ∪ [1e18, ∞), including
//                    DECREASES (the slash-markdown escape hatch) and 0 (disable).
//                    RESETS the operator cooldown clock: admin actions are
//                    exempt from, but restart, the window (markdown-race fix).
//   updateUSDPrice — PRICE-OPERATOR-only. Opens a linear ramp segment
//                    (price, startTime, period) instead of jumping instantly —
//                    see the "Linear price ramp" section below. The segment's
//                    inPrice is NOT a parameter: it's set automatically to the
//                    previous segment's futurePrice (see that function's
//                    NatSpec). Strictly increasing vs. that stored futurePrice,
//                    step-size bounded (stepSize 0 = unlimited), cannot run
//                    while price is disabled, cooldown-gated against
//                    lastPriceUpdateAt, period-bounded, and startTime must be
//                    at or after the current segment's own END (its startTime
//                    + period) — segments can never overlap (replay/overlap guard).
//   setStepSize    — ADMIN-only. Bounds the priceOperator's per-update increment.
//
// COOLDOWN SEEDING: initialize() seeds lastPriceUpdateAt = block.timestamp, so
// the operator's FIRST update is cooldown-gated like every other. Fresh-fixture
// tests that call updateUSDPrice must first skipInitialCooldown().
//
// Fixture requirements: accounts.priceOperator exists in TestAccounts, and
// deployProTokenSettings passes it as the third initialize arg.
// ---------------------------------------------------------------------------
// Fresh fixtures seed lastPriceUpdateAt at deploy; the operator's first
// update must wait out the initial window.
async function skipInitialCooldown() {
    await time.increase(PRICE_UPDATE_COOLDOWN + 1);
}
// updateUSDPrice's real signature is (price, startTime, period) — the oracle
// computes one segment off-chain and submits identical calldata to every
// chain; inPrice is derived on-chain from the previous segment's futurePrice,
// so it's never passed explicitly (see the "Linear price ramp" /
// "Multichain segment consistency" sections for tests of the curve itself
// and of that cross-chain guarantee).
//
// Most tests in this file aren't testing the ramp *shape* — they're testing
// access control, monotonicity, step size, and cooldown. Since inPrice is
// forced to be the previous futurePrice, getUSDPrice() only reads the new
// `price` once the segment has fully settled (block.timestamp >=
// startTime + period); updateUSDPrice() below submits with a short default
// period and then fast-forwards past it, so getUSDPrice() reads `price`
// immediately after the call returns — preserving the pre-ramp "instant
// update" test semantics for everything that isn't specifically about
// interpolation. Pass settle:false, or call proToken.updateUSDPrice(...)
// directly, to inspect the ramp mid-flight instead.
async function buildUpdateArgs(price: bigint, opts: { period?: number } = {}) {
    const startTime = (await time.latest()) + 1;
    const period = opts.period ?? ONE_MINUTE; // MIN_RAMP_PERIOD
    return { price, startTime, period };
}
// Convenience wrapper for call sites that don't need the raw args (e.g. for
// .to.emit(...) assertions, build args separately and call updateUSDPrice directly).
async function updateUSDPrice(
    proToken: any,
    operator: any,
    price: bigint,
    opts: { period?: number; settle?: boolean } = {}
) {
    const args = await buildUpdateArgs(price, opts);
    const tx = await proToken.connect(operator).updateUSDPrice(
        args.price, args.startTime, args.period
    );
    if (opts.settle !== false) {
        await time.increaseTo(args.startTime + args.period);
    }
    return tx;
}
describe("ProToken", function () {
    // =======================================================================
    // Constants
    // =======================================================================
    describe("Constants", function () {
        it("VERSION = 1_00_00", async function () {
            const { proToken } = await loadFixture(proTokenFixture);
            expect(await proToken.VERSION()).to.equal(VERSION_1_0_0);
        });
        it("MIN_USD_PRICE = 1e18", async function () {
            const { proToken } = await loadFixture(proTokenFixture);
            expect(await proToken.MIN_USD_PRICE()).to.equal(MIN_USD_PRICE);
        });
        it("DEFAULT_USD_PRICE = 1e18", async function () {
            const { proToken } = await loadFixture(proTokenFixture);
            expect(await proToken.DEFAULT_USD_PRICE()).to.equal(DEFAULT_USD_PRICE);
        });
        it("DEFAULT_PRICE_UPDATE_COOLDOWN = 23 hours", async function () {
            const { proToken } = await loadFixture(proTokenFixture);
            expect(await proToken.DEFAULT_PRICE_UPDATE_COOLDOWN()).to.equal(BigInt(PRICE_UPDATE_COOLDOWN));
        });
    });
    // =======================================================================
    // initialize
    // =======================================================================
    describe("initialize()", function () {
        it("sets name and symbol", async function () {
            const { proToken } = await loadFixture(proTokenFixture);
            expect(await proToken.name()).to.equal(PROTOKEN_NAME);
            expect(await proToken.symbol()).to.equal(PROTOKEN_SYMBOL);
        });
        it("uses 18 decimals (ERC20 default)", async function () {
            const { proToken } = await loadFixture(proTokenFixture);
            expect(await proToken.decimals()).to.equal(18);
        });
        it("sets minter to provided address", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            expect(await proToken.getMinter()).to.equal(accounts.minter.address);
        });
        it("sets proTokenSettings to provided address", async function () {
            const { proToken, proTokenSettingsAddress } = await loadFixture(proTokenFixture);
            expect(await proToken.getProTokenSettings()).to.equal(proTokenSettingsAddress);
        });
        it("initializes usdPrice to DEFAULT_USD_PRICE", async function () {
            const { proToken } = await loadFixture(proTokenFixture);
            expect(await proToken.getUSDPrice()).to.equal(DEFAULT_USD_PRICE);
        });
        it("initializes priceUpdateCooldown to DEFAULT_PRICE_UPDATE_COOLDOWN", async function () {
            const { proToken } = await loadFixture(proTokenFixture);
            expect(await proToken.getPriceUpdateCooldown()).to.equal(BigInt(PRICE_UPDATE_COOLDOWN));
        });
        it("lastPriceUpdateAt is seeded at deployment (first operator update is cooldown-gated)", async function () {
            const { proToken } = await loadFixture(proTokenFixture);
            expect(await proToken.getLastPriceUpdateAt()).to.be.gt(0n);
        });
        it("totalSupply starts at zero", async function () {
            const { proToken } = await loadFixture(proTokenFixture);
            expect(await proToken.totalSupply()).to.equal(0n);
        });
        it("ERC20Permit domain is initialized (DOMAIN_SEPARATOR non-zero)", async function () {
            // Validates __ERC20Permit_init(_name) was called by checking the
            // domain separator is non-zero (hashed from name + version + chain id).
            const { proToken } = await loadFixture(proTokenFixture);
            expect(await proToken.DOMAIN_SEPARATOR()).to.not.equal(ethers.ZeroHash);
        });
        it("reverts when called twice (initializer guard)", async function () {
            const { proToken, accounts, proTokenSettingsAddress } =
                await loadFixture(proTokenFixture);
            await expect(
                proToken.initialize(
                    PROTOKEN_NAME,
                    PROTOKEN_SYMBOL,
                    proTokenSettingsAddress,
                    accounts.minter.address,
                )
            ).to.be.revertedWithCustomError(proToken, ERRORS.InvalidInitialization);
        });
        it("reverts when _minter is zero address", async function () {
            const { proTokenSettingsAddress } = await loadFixture(proTokenSettingsFixture);
            const Factory = await ethers.getContractFactory("ProToken");
            await expect(
                upgrades.deployProxy(
                    Factory,
                    [PROTOKEN_NAME, PROTOKEN_SYMBOL, proTokenSettingsAddress, ZERO_ADDRESS],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(Factory, ERRORS.ZeroAddress);
        });
        it("reverts when _proTokenSettings is zero address", async function () {
            const accounts = await getTestAccounts();
            const Factory = await ethers.getContractFactory("ProToken");
            await expect(
                upgrades.deployProxy(
                    Factory,
                    [PROTOKEN_NAME, PROTOKEN_SYMBOL, ZERO_ADDRESS, accounts.minter.address],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(Factory, ERRORS.ZeroAddress);
        });
        it("reverts when both addresses are zero (minter check fires first)", async function () {
            const Factory = await ethers.getContractFactory("ProToken");
            await expect(
                upgrades.deployProxy(
                    Factory,
                    [PROTOKEN_NAME, PROTOKEN_SYMBOL, ZERO_ADDRESS, ZERO_ADDRESS],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(Factory, ERRORS.ZeroAddress);
        });
        it("implementation contract has initializers disabled", async function () {
            const { proToken } = await loadFixture(proTokenFixture);
            const implAddress = await upgrades.erc1967.getImplementationAddress(
                await proToken.getAddress()
            );
            const impl = await ethers.getContractAt("ProToken", implAddress);
            await expect(
                impl.initialize(PROTOKEN_NAME, PROTOKEN_SYMBOL, ZERO_ADDRESS, ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(impl, ERRORS.InvalidInitialization);
        });
    });
    // =======================================================================
    // setMinter
    // =======================================================================
    describe("setMinter()", function () {
        it("admin can set a new minter", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.admin).setMinter(accounts.user1.address);
            expect(await proToken.getMinter()).to.equal(accounts.user1.address);
        });
        it("emits MinterSet(oldMinter, newMinter)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.admin).setMinter(accounts.user1.address)
            )
                .to.emit(proToken, EVENTS.MinterSet)
                .withArgs(accounts.minter.address, accounts.user1.address);
        });
        it("reverts on zero address", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.admin).setMinter(ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(proToken, ERRORS.ZeroAddress);
        });
        it("reverts when new minter equals current minter", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.admin).setMinter(accounts.minter.address)
            ).to.be.revertedWithCustomError(proToken, ERRORS.SameAddress);
        });
        it("reverts when called by operator (admin-only)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.operator).setMinter(accounts.user1.address)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotAdmin);
        });
        it("reverts when called by current minter", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.minter).setMinter(accounts.user1.address)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotAdmin);
        });
        it("reverts when called by random attacker", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.attacker).setMinter(accounts.user1.address)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotAdmin);
        });
        it("new minter can mint after change", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.admin).setMinter(accounts.user1.address);
            await proToken.connect(accounts.user1).mint(accounts.user2.address, ONE_TOKEN);
            expect(await proToken.balanceOf(accounts.user2.address)).to.equal(ONE_TOKEN);
        });
        it("old minter loses mint power after change", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.admin).setMinter(accounts.user1.address);
            await expect(
                proToken.connect(accounts.minter).mint(accounts.user2.address, ONE_TOKEN)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotMinter);
        });
        it("supports multiple sequential minter changes", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.admin).setMinter(accounts.user1.address);
            await proToken.connect(accounts.admin).setMinter(accounts.user2.address);
            await proToken.connect(accounts.admin).setMinter(accounts.externalBusiness.address);
            expect(await proToken.getMinter()).to.equal(accounts.externalBusiness.address);
        });
    });
    // =======================================================================
    // setUSDPrice (ADMIN-only, arbitrary — the escape hatch)
    //
    // Under the price-authority split, setUSDPrice is the admin's unconstrained
    // path: any value in {0} ∪ [1e18, ∞), including DECREASES (used for slash
    // markdowns) and 0 (disable). The operator is a REJECTED caller here —
    // routine increases go through the priceOperator's updateUSDPrice instead.
    //
    // MARKDOWN-RACE FIX: every setUSDPrice RESETS lastPriceUpdateAt, so an
    // admin correction is guaranteed a full cooldown window before the
    // priceOperator can move the price again.
    // =======================================================================
    describe("setUSDPrice() — admin-only", function () {
        it("admin can set price equal to MIN_USD_PRICE", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            // Move to 2e18 first, then back to MIN, to verify the second set wrote
            await proToken.connect(accounts.admin).setUSDPrice(ethers.parseUnits("2", 18));
            await proToken.connect(accounts.admin).setUSDPrice(MIN_USD_PRICE);
            expect(await proToken.getUSDPrice()).to.equal(MIN_USD_PRICE);
        });
        it("admin can set price greater than MIN_USD_PRICE", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const newPrice = ethers.parseUnits("1.5", 18);
            await proToken.connect(accounts.admin).setUSDPrice(newPrice);
            expect(await proToken.getUSDPrice()).to.equal(newPrice);
        });
        it("admin can set a very high price", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const high = ethers.parseUnits("1000000", 18);
            await proToken.connect(accounts.admin).setUSDPrice(high);
            expect(await proToken.getUSDPrice()).to.equal(high);
        });
        it("admin can DECREASE the price (slash-markdown path)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const high = ethers.parseUnits("1.5", 18);
            const markedDown = ethers.parseUnits("1.2", 18);
            await proToken.connect(accounts.admin).setUSDPrice(high);
            // Decreases are exactly what this function exists for (venue slash →
            // honest markdown). updateUSDPrice forbids this by design.
            await proToken.connect(accounts.admin).setUSDPrice(markedDown);
            expect(await proToken.getUSDPrice()).to.equal(markedDown);
        });
        it("allows setting price to 0 (disables getUSDPrice)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.admin).setUSDPrice(0);
            await expect(proToken.getUSDPrice()).to.be.revertedWithCustomError(
                proToken, ERRORS.USDPriceDisabled
            );
        });
        it("reverts when price > 0 but < MIN_USD_PRICE (boundary)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.admin).setUSDPrice(MIN_USD_PRICE - 1n)
            ).to.be.revertedWithCustomError(proToken, ERRORS.InvalidPrice);
        });
        it("reverts on price = 1 wei (just above zero)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.admin).setUSDPrice(1n)
            ).to.be.revertedWithCustomError(proToken, ERRORS.InvalidPrice);
        });
        it("emits USDPriceSet(prev, new)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const newPrice = ethers.parseUnits("1.1", 18);
            await expect(proToken.connect(accounts.admin).setUSDPrice(newPrice))
                .to.emit(proToken, EVENTS.USDPriceSet)
                .withArgs(DEFAULT_USD_PRICE, newPrice);
        });
        it("emits USDPriceSet with new=0 when disabling", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(proToken.connect(accounts.admin).setUSDPrice(0))
                .to.emit(proToken, EVENTS.USDPriceSet)
                .withArgs(DEFAULT_USD_PRICE, 0);
        });
        it("emits USDPriceSet with prev=0 when re-enabling from disabled", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.admin).setUSDPrice(0);
            const newPrice = ethers.parseUnits("1.5", 18);
            await expect(proToken.connect(accounts.admin).setUSDPrice(newPrice))
                .to.emit(proToken, EVENTS.USDPriceSet)
                .withArgs(0, newPrice);
        });
        it("resets lastPriceUpdateAt to the admin action's timestamp", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.admin).setUSDPrice(ethers.parseUnits("1.3", 18));
            expect(await proToken.getLastPriceUpdateAt()).to.equal(BigInt(await time.latest()));
        });
        it("reverts when called by operator (previously allowed — now admin-only)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.operator).setUSDPrice(MIN_USD_PRICE)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotAdmin);
        });
        it("reverts when called by priceOperator (role isolation: their path is updateUSDPrice)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.priceOperator).setUSDPrice(ethers.parseUnits("2", 18))
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotAdmin);
        });
        it("reverts when called by minter", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.minter).setUSDPrice(MIN_USD_PRICE)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotAdmin);
        });
        it("reverts when called by random attacker", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.attacker).setUSDPrice(MIN_USD_PRICE)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotAdmin);
        });
        it("supports full enable → disable → re-enable cycle", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const p1 = ethers.parseUnits("1.1", 18);
            const p2 = ethers.parseUnits("1.2", 18);
            await proToken.connect(accounts.admin).setUSDPrice(p1);
            expect(await proToken.getUSDPrice()).to.equal(p1);
            await proToken.connect(accounts.admin).setUSDPrice(0);
            await expect(proToken.getUSDPrice()).to.be.revertedWithCustomError(
                proToken, ERRORS.USDPriceDisabled
            );
            await proToken.connect(accounts.admin).setUSDPrice(p2);
            expect(await proToken.getUSDPrice()).to.equal(p2);
        });
        it("price changes do not affect totalSupply or balances", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.minter).mint(accounts.user1.address, HUNDRED_TOKENS);
            const supplyBefore = await proToken.totalSupply();
            const balBefore = await proToken.balanceOf(accounts.user1.address);
            await proToken.connect(accounts.admin).setUSDPrice(ethers.parseUnits("1.5", 18));
            expect(await proToken.totalSupply()).to.equal(supplyBefore);
            expect(await proToken.balanceOf(accounts.user1.address)).to.equal(balBefore);
        });
        // --- Corner case: setUSDPrice mid-ramp, an asymmetry vs. updateUSDPrice ---
        // updateUSDPrice anchors its "old" on the stored futurePrice (the pending
        // target), but setUSDPrice anchors on _currentPrice() (the LIVE
        // interpolated value) — it's the admin's escape hatch and is meant to
        // reflect what users are actually seeing right now, not the abandoned
        // segment's destination.
        describe("mid-ramp override (asymmetry vs. updateUSDPrice)", function () {
            it("emits the LIVE interpolated price as `old`, not the pending target", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await skipInitialCooldown();
                const period = 1000;
                const startTime = (await time.latest()) + 1;
                const target = ethers.parseUnits("2.0", 18);
                await proToken.connect(accounts.priceOperator).updateUSDPrice(
                    target, startTime, period
                );
                // Partway through 1.0 -> 2.0, still mid-ramp.
                await time.increaseTo(startTime + period / 2);
                const tx = await proToken.connect(accounts.admin).setUSDPrice(
                    ethers.parseUnits("3.0", 18)
                );
                // "old" must be the live interpolated value at the moment of this
                // tx — strictly between inPrice and the pending target — not the
                // abandoned segment's futurePrice (2.0) itself.
                await expect(tx)
                    .to.emit(proToken, EVENTS.USDPriceSet)
                    .withArgs((v: bigint) => v > DEFAULT_USD_PRICE && v < target, ethers.parseUnits("3.0", 18));
            });
            it("collapses an active ramp to a flat segment immediately", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await skipInitialCooldown();
                const period = 1000;
                const startTime = (await time.latest()) + 1;
                await proToken.connect(accounts.priceOperator).updateUSDPrice(
                    ethers.parseUnits("2.0", 18), startTime, period
                );
                await time.increaseTo(startTime + period / 2);
                const overridePrice = ethers.parseUnits("5.0", 18);
                await proToken.connect(accounts.admin).setUSDPrice(overridePrice);
                const seg = await proToken.getUSDPriceSegment();
                expect(seg[0]).to.equal(overridePrice); // inPrice
                expect(seg[1]).to.equal(overridePrice); // futurePrice
                expect(seg[3]).to.equal(0n);             // period — flat, no ramp
                // Time passing after the override doesn't move the price at all.
                await time.increase(period * 10);
                expect(await proToken.getUSDPrice()).to.equal(overridePrice);
            });
        });
    });
    // =======================================================================
    // updateUSDPrice (PRICE-OPERATOR-only, constrained — the hot path)
    //
    // The priceOperator's routine path: opens a linear ramp segment (price,
    // startTime, period) instead of jumping instantly (see the "Linear price
    // ramp" section below for the curve itself; inPrice is derived on-chain
    // from the previous segment's futurePrice, never passed in). Strictly
    // increasing vs. that stored futurePrice, step-size bounded (stepSize 0 =
    // unlimited), refuses to run while the price is disabled (re-enabling
    // from 0 is an admin-only action via setUSDPrice), and cooldown-gated.
    //
    // Validation order in the contract:
    //   1. InvalidPrice              (_price > 0 but < 1e18)
    //   2. InvalidRampPeriod         (_period outside [MIN_RAMP_PERIOD, MAX_RAMP_PERIOD])
    //   3. StaleSegment              (_startTime < current segment's own end, startTime + period)
    //   4. PriceUpdateCooldownActive (block.timestamp < lastPriceUpdateAt + cooldown)
    //   5. USDPriceDisabled          (stored futurePrice is 0)
    //   6. PriceNotIncreasing        (_price <= stored futurePrice)
    //   7. PriceStepSizeExceeded     (stepSize != 0 and jump > stepSize)
    // Tests that target checks 5–7 must first clear the cooldown (check 4),
    // hence skipInitialCooldown() at the top of those tests. InvalidPrice
    // (check 1) fires before the cooldown, so those tests need no skip.
    //
    // updateUSDPrice() (the JS helper) submits with a short default period and
    // settles time past it, so getUSDPrice() reads `price` immediately after
    // the call returns — see the helper's doc comment above. The ramp's
    // actual shape (interpolation, boundaries, cross-chain identical curves)
    // is covered separately in "Linear price ramp" and "Multichain segment
    // consistency" below.
    // =======================================================================
    describe("updateUSDPrice() — priceOperator-only", function () {
        it("priceOperator can increase the price (no step size configured = unlimited)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await skipInitialCooldown();
            const newPrice = ethers.parseUnits("1.25", 18);
            await updateUSDPrice(proToken, accounts.priceOperator, newPrice);
            expect(await proToken.getUSDPrice()).to.equal(newPrice);
        });
        it("emits USDPriceUpdated(prev, new)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await skipInitialCooldown();
            const newPrice = ethers.parseUnits("1.1", 18);
            const args = await buildUpdateArgs(newPrice);
            await expect(
                proToken.connect(accounts.priceOperator).updateUSDPrice(
                    args.price, args.startTime, args.period
                )
            )
                .to.emit(proToken, EVENTS.USDPriceUpdated)
                .withArgs(DEFAULT_USD_PRICE, newPrice);
        });
        it("supports sequential increases (each strictly above the last)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await skipInitialCooldown();
            const p1 = ethers.parseUnits("1.05", 18);
            const p2 = ethers.parseUnits("1.10", 18);
            const p3 = ethers.parseUnits("1.15", 18);
            await updateUSDPrice(proToken, accounts.priceOperator, p1);
            await time.increase(PRICE_UPDATE_COOLDOWN + 1); // respect the 23h cooldown
            await updateUSDPrice(proToken, accounts.priceOperator, p2);
            await time.increase(PRICE_UPDATE_COOLDOWN + 1);
            await updateUSDPrice(proToken, accounts.priceOperator, p3);
            expect(await proToken.getUSDPrice()).to.equal(p3);
        });
        it("reverts PriceNotIncreasing when new price equals current", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await skipInitialCooldown(); // clear the cooldown so monotonicity is what fires
            await expect(
                updateUSDPrice(proToken, accounts.priceOperator, DEFAULT_USD_PRICE)
            ).to.be.revertedWithCustomError(proToken, ERRORS.PriceNotIncreasing);
        });
        it("reverts PriceNotIncreasing when new price is lower (no markdowns on this path)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await skipInitialCooldown();
            await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.5", 18));
            await time.increase(PRICE_UPDATE_COOLDOWN + 1); // past the cooldown so monotonicity is what fires
            await expect(
                updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.2", 18))
            ).to.be.revertedWithCustomError(proToken, ERRORS.PriceNotIncreasing);
        });
        it("reverts PriceNotIncreasing on _price = 0 (cannot disable via this path)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await skipInitialCooldown();
            // _price=0 passes the InvalidPrice check (0 is exempt), then fails
            // monotonicity since 0 <= the stored futurePrice (DEFAULT_USD_PRICE).
            // The priceOperator has no route to disabling the price.
            await expect(
                updateUSDPrice(proToken, accounts.priceOperator, 0n)
            ).to.be.revertedWithCustomError(proToken, ERRORS.PriceNotIncreasing);
        });
        it("reverts InvalidPrice when _price > 0 but < MIN_USD_PRICE (checked before the cooldown)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            // No skip: InvalidPrice fires before the cooldown check, so it is the
            // revert even while the initial window is still running.
            await expect(
                updateUSDPrice(proToken, accounts.priceOperator, MIN_USD_PRICE - 1n)
            ).to.be.revertedWithCustomError(proToken, ERRORS.InvalidPrice);
        });
        it("reverts USDPriceDisabled when price is disabled (admin must re-enable)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.admin).setUSDPrice(0);
            // The disable RESET the cooldown clock; wait it out so the disabled
            // check (which runs after the cooldown check) is what fires.
            await skipInitialCooldown();
            await expect(
                updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.5", 18))
            ).to.be.revertedWithCustomError(proToken, ERRORS.USDPriceDisabled);
        });
        it("reverts when called by admin (role isolation: their path is setUSDPrice)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const p = ethers.parseUnits("1.5", 18);
            await expect(
                proToken.connect(accounts.admin).updateUSDPrice(p, 1, ONE_MINUTE)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotPriceOperator);
        });
        it("reverts when called by operator", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const p = ethers.parseUnits("1.5", 18);
            await expect(
                proToken.connect(accounts.operator).updateUSDPrice(p, 1, ONE_MINUTE)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotPriceOperator);
        });
        it("reverts when called by random attacker", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const p = ethers.parseUnits("1.5", 18);
            await expect(
                proToken.connect(accounts.attacker).updateUSDPrice(p, 1, ONE_MINUTE)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotPriceOperator);
        });
        describe("step-size enforcement", function () {
            const STEP = ethers.parseUnits("0.1", 18); // 0.1 USD per update
            it("allows a jump of exactly stepSize (boundary passes)", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await proToken.connect(accounts.admin).setStepSize(STEP);
                await skipInitialCooldown();
                await updateUSDPrice(proToken, accounts.priceOperator, DEFAULT_USD_PRICE + STEP);
                expect(await proToken.getUSDPrice()).to.equal(DEFAULT_USD_PRICE + STEP);
            });
            it("reverts PriceStepSizeExceeded on a jump of stepSize + 1 wei", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await proToken.connect(accounts.admin).setStepSize(STEP);
                await skipInitialCooldown();
                await expect(
                    updateUSDPrice(proToken, accounts.priceOperator, DEFAULT_USD_PRICE + STEP + 1n)
                ).to.be.revertedWithCustomError(proToken, ERRORS.PriceStepSizeExceeded);
            });
            it("step applies per-update: two sequential max-step jumps both pass", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await proToken.connect(accounts.admin).setStepSize(STEP);
                await skipInitialCooldown();
                await updateUSDPrice(proToken, accounts.priceOperator, DEFAULT_USD_PRICE + STEP);
                await time.increase(PRICE_UPDATE_COOLDOWN + 1); // respect the 23h cooldown
                await updateUSDPrice(proToken, accounts.priceOperator, DEFAULT_USD_PRICE + STEP * 2n);
                expect(await proToken.getUSDPrice()).to.equal(DEFAULT_USD_PRICE + STEP * 2n);
            });
            it("stepSize = 0 means UNLIMITED jumps (documented risk semantics)", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await skipInitialCooldown();
                // Default stepSize is 0 — no bound. A giant jump succeeds.
                const giant = ethers.parseUnits("1000", 18);
                await updateUSDPrice(proToken, accounts.priceOperator, giant);
                expect(await proToken.getUSDPrice()).to.equal(giant);
            });
            it("admin tightening stepSize immediately constrains the next update", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await skipInitialCooldown();
                // Unlimited jump first...
                await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("2", 18));
                // ...then admin bounds it; an over-step now reverts.
                await proToken.connect(accounts.admin).setStepSize(STEP);
                await time.increase(PRICE_UPDATE_COOLDOWN + 1); // past the cooldown so the step check is what fires
                await expect(
                    updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("3", 18))
                ).to.be.revertedWithCustomError(proToken, ERRORS.PriceStepSizeExceeded);
            });
        });
        describe("segment validation (period bound, replay/ordering guard)", function () {
            it("reverts InvalidRampPeriod when period is below MIN_RAMP_PERIOD", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await skipInitialCooldown();
                const min = await proToken.MIN_RAMP_PERIOD();
                await expect(
                    updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.1", 18), {
                        period: Number(min) - 1,
                    })
                ).to.be.revertedWithCustomError(proToken, ERRORS.InvalidRampPeriod);
            });
            it("reverts InvalidRampPeriod on period = 0", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await skipInitialCooldown();
                await expect(
                    updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.1", 18), {
                        period: 0,
                    })
                ).to.be.revertedWithCustomError(proToken, ERRORS.InvalidRampPeriod);
            });
            it("reverts InvalidRampPeriod when period exceeds MAX_RAMP_PERIOD", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await skipInitialCooldown();
                const max = await proToken.MAX_RAMP_PERIOD();
                await expect(
                    updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.1", 18), {
                        period: Number(max) + 1,
                    })
                ).to.be.revertedWithCustomError(proToken, ERRORS.InvalidRampPeriod);
            });
            it("accepts period at exactly MIN_RAMP_PERIOD and MAX_RAMP_PERIOD (boundaries pass)", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await skipInitialCooldown();
                const min = await proToken.MIN_RAMP_PERIOD();
                await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.1", 18), {
                    period: Number(min),
                });
                await time.increase(PRICE_UPDATE_COOLDOWN + 1);
                const max = await proToken.MAX_RAMP_PERIOD();
                await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.2", 18), {
                    period: Number(max),
                });
                expect(await proToken.getUSDPrice()).to.equal(ethers.parseUnits("1.2", 18));
            });
            it("reverts StaleSegment when startTime is before the current (flat) segment's", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await skipInitialCooldown();
                const [, , currentStartTime] = await proToken.getUSDPriceSegment();
                await expect(
                    proToken.connect(accounts.priceOperator).updateUSDPrice(
                        ethers.parseUnits("1.1", 18), currentStartTime - 1n, ONE_MINUTE
                    )
                )
                    .to.be.revertedWithCustomError(proToken, ERRORS.StaleSegment)
                    .withArgs(currentStartTime - 1n, currentStartTime);
            });
            it("accepts startTime exactly equal to a flat (period = 0) segment's own startTime — its end coincides with its start", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await skipInitialCooldown();
                const [, , currentStartTime] = await proToken.getUSDPriceSegment();
                // Bootstrap segment has period == 0, so startTime + period == startTime;
                // an incoming segment starting at that same instant does not overlap.
                await proToken.connect(accounts.priceOperator).updateUSDPrice(
                    ethers.parseUnits("1.1", 18), currentStartTime, ONE_MINUTE
                );
                expect((await proToken.getUSDPriceSegment())[2]).to.equal(currentStartTime);
            });
            it("reverts StaleSegment when startTime falls strictly inside an active (non-flat) ramp — segments can never overlap", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await skipInitialCooldown();
                const period = 1000;
                const priorStart = (await time.latest()) + 1;
                await proToken.connect(accounts.priceOperator).updateUSDPrice(
                    ethers.parseUnits("1.5", 18), priorStart, period
                );
                const priorEnd = priorStart + period;
                await expect(
                    proToken.connect(accounts.priceOperator).updateUSDPrice(
                        ethers.parseUnits("1.6", 18), priorEnd - 1, ONE_MINUTE
                    )
                )
                    .to.be.revertedWithCustomError(proToken, ERRORS.StaleSegment)
                    .withArgs(priorEnd - 1, priorStart);
            });
            it("accepts startTime exactly at the end of the previous (non-flat) segment (boundary passes, no overlap)", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await skipInitialCooldown();
                await proToken.connect(accounts.admin).setPriceUpdateCooldown(0); // isolate the overlap boundary from the 23h cooldown
                const period = 1000;
                const priorStart = (await time.latest()) + 1;
                await proToken.connect(accounts.priceOperator).updateUSDPrice(
                    ethers.parseUnits("1.5", 18), priorStart, period
                );
                const priorEnd = priorStart + period;
                await proToken.connect(accounts.priceOperator).updateUSDPrice(
                    ethers.parseUnits("1.6", 18), priorEnd, ONE_MINUTE
                );
                expect((await proToken.getUSDPriceSegment())[2]).to.equal(BigInt(priorEnd));
            });
            it("reverts StaleSegment against a segment written by admin's setUSDPrice, not just a prior updateUSDPrice", async function () {
                // The replay/overlap guard reads the single shared startTime/period
                // slots regardless of which function last wrote them.
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await proToken.connect(accounts.admin).setUSDPrice(ethers.parseUnits("1.3", 18));
                const [, , adminStartTime] = await proToken.getUSDPriceSegment();
                await skipInitialCooldown();
                await expect(
                    proToken.connect(accounts.priceOperator).updateUSDPrice(
                        ethers.parseUnits("1.4", 18), adminStartTime - 1n, ONE_MINUTE
                    )
                )
                    .to.be.revertedWithCustomError(proToken, ERRORS.StaleSegment)
                    .withArgs(adminStartTime - 1n, adminStartTime);
                // setUSDPrice's segment is flat (period 0), so startTime itself
                // (its own end) is a valid boundary for the next segment too.
                await proToken.connect(accounts.priceOperator).updateUSDPrice(
                    ethers.parseUnits("1.4", 18), adminStartTime, ONE_MINUTE
                );
            });
            it("InvalidPrice takes precedence over InvalidRampPeriod when both _price and _period are invalid", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await skipInitialCooldown();
                await expect(
                    proToken.connect(accounts.priceOperator).updateUSDPrice(
                        MIN_USD_PRICE - 1n, (await time.latest()) + 1, 0
                    )
                ).to.be.revertedWithCustomError(proToken, ERRORS.InvalidPrice);
            });
        });
        describe("price update cooldown (23h; seeded at init, reset by admin sets)", function () {
            it("first update after deployment IS cooldown-gated (init seeds the clock)", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await expect(
                    updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.1", 18))
                ).to.be.revertedWithCustomError(proToken, ERRORS.PriceUpdateCooldownActive);
                await time.increase(PRICE_UPDATE_COOLDOWN + 1);
                await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.1", 18));
                expect(await proToken.getUSDPrice()).to.equal(ethers.parseUnits("1.1", 18));
            });
            it("second update within the window reverts PriceUpdateCooldownActive", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await skipInitialCooldown();
                await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.1", 18));
                await time.increase(60 * 60); // 1h — still 22h short
                await expect(
                    updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.2", 18))
                ).to.be.revertedWithCustomError(proToken, ERRORS.PriceUpdateCooldownActive);
            });
            it("update succeeds once the cooldown has elapsed", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await skipInitialCooldown();
                await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.1", 18));
                await time.increase(PRICE_UPDATE_COOLDOWN + 1);
                await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.2", 18));
                expect(await proToken.getUSDPrice()).to.equal(ethers.parseUnits("1.2", 18));
            });
            it("passes at exactly availableAt (boundary: check is strict <)", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await skipInitialCooldown();
                await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.1", 18));
                const last = await proToken.getLastPriceUpdateAt();
                // Next tx mines at last + COOLDOWN exactly → block.timestamp == availableAt → passes.
                await time.increaseTo(last + BigInt(PRICE_UPDATE_COOLDOWN) - 1n);
                await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.2", 18));
                expect(await proToken.getUSDPrice()).to.equal(ethers.parseUnits("1.2", 18));
            });
            it("a reverted attempt does not extend the window", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await skipInitialCooldown();
                await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.1", 18));
                const last = await proToken.getLastPriceUpdateAt();
                await time.increase(60 * 60);
                await expect(
                    updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.2", 18))
                ).to.be.revertedWithCustomError(proToken, ERRORS.PriceUpdateCooldownActive);
                // The window is still keyed to the ORIGINAL successful update.
                await time.increaseTo(last + BigInt(PRICE_UPDATE_COOLDOWN) + 1n);
                await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.2", 18));
                expect(await proToken.getUSDPrice()).to.equal(ethers.parseUnits("1.2", 18));
            });
            it("admin setUSDPrice RESETS the cooldown: operator must wait a full window after an admin set", async function () {
                // REGRESSION for the markdown-race finding: pre-fix, the admin
                // path left lastPriceUpdateAt untouched and the operator could
                // overwrite an admin correction instantly.
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await proToken.connect(accounts.admin).setUSDPrice(ethers.parseUnits("1.5", 18));
                // The admin action started a fresh cooldown window — an
                // immediate operator update is rejected.
                await expect(
                    updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.6", 18))
                ).to.be.revertedWithCustomError(proToken, ERRORS.PriceUpdateCooldownActive);
                // After the full window, the operator proceeds normally.
                await time.increase(PRICE_UPDATE_COOLDOWN + 1);
                await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.6", 18));
                expect(await proToken.getUSDPrice()).to.equal(ethers.parseUnits("1.6", 18));
            });
            it("admin markdown RESETS the operator's clock (markdown-race protection)", async function () {
                // REGRESSION for the markdown-race finding: the slash runbook
                // (setUSDPrice → markdownPrice → cover) is guaranteed a full
                // operator-free window from the ADMIN action.
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await skipInitialCooldown();
                await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.1", 18));
                // Partway through the window, admin marks down (slash step 1).
                await time.increase(60 * 60);
                await proToken.connect(accounts.admin).setUSDPrice(ethers.parseUnits("1.02", 18));
                const adminSetAt = BigInt(await time.latest());
                // Operator locked out for a FULL window from the ADMIN action.
                await expect(
                    updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.06", 18))
                ).to.be.revertedWithCustomError(proToken, ERRORS.PriceUpdateCooldownActive);
                // Even after the ORIGINAL window would have elapsed, still
                // locked — the clock re-keyed to the admin set.
                await time.increaseTo(adminSetAt + BigInt(PRICE_UPDATE_COOLDOWN) - 10n);
                await expect(
                    updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.06", 18))
                ).to.be.revertedWithCustomError(proToken, ERRORS.PriceUpdateCooldownActive);
                await time.increaseTo(adminSetAt + BigInt(PRICE_UPDATE_COOLDOWN) + 1n);
                await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.06", 18));
                expect(await proToken.getUSDPrice()).to.equal(ethers.parseUnits("1.06", 18));
            });
            it("getLastPriceUpdateAt tracks the last successful operator update", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await skipInitialCooldown();
                // settle:false — the assertion checks the tx's own block
                // timestamp, so the helper's post-call fast-forward would
                // otherwise move time.latest() past it.
                await updateUSDPrice(
                    proToken, accounts.priceOperator, ethers.parseUnits("1.1", 18), { settle: false }
                );
                expect(await proToken.getLastPriceUpdateAt()).to.equal(BigInt(await time.latest()));
            });
        });
    });
    // =======================================================================
    // Linear price ramp — the interpolation curve itself
    //
    // getUSDPrice() is a pure function of the active segment
    // (inPrice, futurePrice, startTime, period) and block.timestamp. inPrice
    // is never a caller-supplied value — updateUSDPrice() sets it automatically
    // to the *previous* segment's futurePrice, so every test here gets its
    // starting inPrice "for free" from whatever the current stored futurePrice
    // already is (DEFAULT_USD_PRICE straight after the fixture's bootstrap
    // segment) rather than passing it explicitly.
    // =======================================================================
    describe("Linear price ramp (getUSDPrice interpolation)", function () {
        const PERIOD = 1000; // seconds
        it("returns inPrice at/before startTime", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await skipInitialCooldown();
            const futurePrice = ethers.parseUnits("1.5", 18);
            const startTime = (await time.latest()) + 100; // in the future
            await proToken.connect(accounts.priceOperator).updateUSDPrice(
                futurePrice, startTime, PERIOD
            );
            // block.timestamp is still well before startTime; inPrice was
            // derived automatically from the bootstrap segment's futurePrice.
            expect(await proToken.getUSDPrice()).to.equal(DEFAULT_USD_PRICE);
        });
        it("returns inPrice exactly AT startTime (boundary: block.timestamp <= startTime)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await skipInitialCooldown();
            const futurePrice = ethers.parseUnits("1.5", 18);
            const startTime = (await time.latest()) + 100;
            await proToken.connect(accounts.priceOperator).updateUSDPrice(
                futurePrice, startTime, PERIOD
            );
            await time.increaseTo(startTime); // block.timestamp === startTime exactly
            expect(await proToken.getUSDPrice()).to.equal(DEFAULT_USD_PRICE);
        });
        it("interpolates linearly at the midpoint (increasing segment)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await skipInitialCooldown();
            const futurePrice = ethers.parseUnits("1.5", 18);
            const startTime = (await time.latest()) + 1;
            await proToken.connect(accounts.priceOperator).updateUSDPrice(
                futurePrice, startTime, PERIOD
            );
            await time.increaseTo(startTime + PERIOD / 2);
            // Halfway through a 1e18 -> 1.5e18 ramp: 1.25e18.
            expect(await proToken.getUSDPrice()).to.equal(ethers.parseUnits("1.25", 18));
        });
        it("returns futurePrice at exactly startTime + period", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await skipInitialCooldown();
            const futurePrice = ethers.parseUnits("1.5", 18);
            const startTime = (await time.latest()) + 1;
            await proToken.connect(accounts.priceOperator).updateUSDPrice(
                futurePrice, startTime, PERIOD
            );
            await time.increaseTo(startTime + PERIOD);
            expect(await proToken.getUSDPrice()).to.equal(futurePrice);
        });
        it("is still strictly below futurePrice one second before the segment ends", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await skipInitialCooldown();
            const futurePrice = ethers.parseUnits("1.5", 18);
            const startTime = (await time.latest()) + 1;
            await proToken.connect(accounts.priceOperator).updateUSDPrice(
                futurePrice, startTime, PERIOD
            );
            await time.increaseTo(startTime + PERIOD - 1);
            const price = await proToken.getUSDPrice();
            expect(price).to.be.lt(futurePrice);
            expect(price).to.be.gt(DEFAULT_USD_PRICE);
        });
        it("floors (truncates) the interpolated value when elapsed/period doesn't divide evenly", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await skipInitialCooldown();
            // inPrice=1e18 (bootstrap), futurePrice=inPrice+1 wei, period=PERIOD
            // (1000s, >= MIN_RAMP_PERIOD). (1 wei * elapsed) / period floors to
            // 0 for every elapsed strictly below period, since the numerator
            // never reaches the denominator — so the price reads exactly
            // inPrice for the entire ramp, then jumps straight to futurePrice
            // the instant the segment ends. No fractional-wei drift mid-ramp.
            const futurePrice = DEFAULT_USD_PRICE + 1n;
            const startTime = (await time.latest()) + 1;
            await proToken.connect(accounts.priceOperator).updateUSDPrice(
                futurePrice, startTime, PERIOD
            );
            await time.increaseTo(startTime + 1);
            expect(await proToken.getUSDPrice()).to.equal(DEFAULT_USD_PRICE);
            await time.increaseTo(startTime + PERIOD - 1);
            expect(await proToken.getUSDPrice()).to.equal(DEFAULT_USD_PRICE);
            // At elapsed == period: the >= endTime branch takes over and
            // returns futurePrice exactly, regardless of the division.
            await time.increaseTo(startTime + PERIOD);
            expect(await proToken.getUSDPrice()).to.equal(futurePrice);
        });
        it("getUSDPriceSegment() does not revert and returns the zeroed segment while the price is disabled", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.admin).setUSDPrice(0);
            await expect(proToken.getUSDPrice()).to.be.revertedWithCustomError(
                proToken, ERRORS.USDPriceDisabled
            );
            const seg = await proToken.getUSDPriceSegment();
            expect(seg[0]).to.equal(0n); // inPrice
            expect(seg[1]).to.equal(0n); // futurePrice
            expect(seg[3]).to.equal(0n); // period
        });
        it("stays flat at futurePrice after the segment ends", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await skipInitialCooldown();
            const futurePrice = ethers.parseUnits("1.5", 18);
            const startTime = (await time.latest()) + 1;
            await proToken.connect(accounts.priceOperator).updateUSDPrice(
                futurePrice, startTime, PERIOD
            );
            await time.increaseTo(startTime + PERIOD * 10);
            expect(await proToken.getUSDPrice()).to.equal(futurePrice);
        });
        it("getUSDPriceSegment() returns the raw stored segment, including the auto-derived inPrice", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await skipInitialCooldown();
            const futurePrice = ethers.parseUnits("1.5", 18);
            const startTime = (await time.latest()) + 1;
            await proToken.connect(accounts.priceOperator).updateUSDPrice(
                futurePrice, startTime, PERIOD
            );
            const seg = await proToken.getUSDPriceSegment();
            expect(seg[0]).to.equal(DEFAULT_USD_PRICE); // inPrice, derived not passed
            expect(seg[1]).to.equal(futurePrice);
            expect(seg[2]).to.equal(BigInt(startTime));
            expect(seg[3]).to.equal(BigInt(PERIOD));
        });
        it("reverts StaleSegment on a mid-ramp update attempt — segments can never overlap", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await skipInitialCooldown();
            // The 23h cooldown would otherwise block a second update while
            // still mid-way through a ~16min ramp; disable it to isolate the
            // overlap guard under test.
            await proToken.connect(accounts.admin).setPriceUpdateCooldown(0);
            // First segment: 1.0 -> 2.0 over 1000s.
            const startTime1 = (await time.latest()) + 1;
            await proToken.connect(accounts.priceOperator).updateUSDPrice(
                ethers.parseUnits("2.0", 18), startTime1, PERIOD
            );
            // Attempt a second segment mid-ramp, at the 50% point — live price
            // is 1.5, but the first segment hasn't reached its own end yet.
            await time.increaseTo(startTime1 + PERIOD / 2);
            expect(await proToken.getUSDPrice()).to.equal(ethers.parseUnits("1.5", 18));
            const startTime2 = (await time.latest()) + 1;
            await expect(
                proToken.connect(accounts.priceOperator).updateUSDPrice(
                    ethers.parseUnits("2.5", 18), startTime2, PERIOD
                )
            ).to.be.revertedWithCustomError(proToken, ERRORS.StaleSegment);
            // Once the first segment fully settles, a new one is accepted normally.
            await time.increaseTo(startTime1 + PERIOD);
            const startTime3 = (await time.latest()) + 1;
            await proToken.connect(accounts.priceOperator).updateUSDPrice(
                ethers.parseUnits("2.5", 18), startTime3, PERIOD
            );
            expect((await proToken.getUSDPriceSegment())[0]).to.equal(ethers.parseUnits("2.0", 18));
        });
    });
    // =======================================================================
    // Multichain segment consistency
    //
    // updateUSDPrice takes (price, startTime, period) as caller-supplied
    // values — inPrice is deliberately NOT one of them. The oracle submits
    // the exact same three-value calldata to every chain the token is
    // deployed on; each chain independently derives the identical inPrice
    // from its own (identically-built) prior state, so every chain ends up
    // tracing the identical curve — regardless of each chain's own
    // confirmation timing, and with nothing extra to keep in sync.
    // =======================================================================
    describe("Multichain segment consistency", function () {
        it("identical calldata submitted at different local times produces identical segments (including the derived inPrice) and converges to the same price", async function () {
            // Two genuinely independent deployments simulating two chains —
            // loadFixture() would snapshot/reuse the SAME contract instance
            // for a repeated fixture within one test, which defeats the point
            // here, so proTokenFixture() is called directly (unwrapped) twice.
            const { proToken: chainA, accounts: accountsA } = await proTokenFixture();
            const { proToken: chainB, accounts: accountsB } = await proTokenFixture();
            await time.increase(PRICE_UPDATE_COOLDOWN + 1);
            const futurePrice = ethers.parseUnits("1.5", 18);
            const period = 1000;
            // The oracle computes one absolute startTime off-chain (in the
            // near future relative to submission) and broadcasts the same
            // three values everywhere.
            const startTime = (await time.latest()) + 500;
            // Chain A's update confirms almost immediately...
            await chainA.connect(accountsA.priceOperator).updateUSDPrice(
                futurePrice, startTime, period
            );
            // ...chain B's confirms much later (simulating slower/laggier
            // finality), but the calldata submitted is byte-for-byte the same.
            await time.increase(200);
            await chainB.connect(accountsB.priceOperator).updateUSDPrice(
                futurePrice, startTime, period
            );
            const segA = await chainA.getUSDPriceSegment();
            const segB = await chainB.getUSDPriceSegment();
            expect(segA[0]).to.equal(segB[0]); // inPrice — derived locally on each chain, still matches
            expect(segA[1]).to.equal(segB[1]); // futurePrice
            expect(segA[2]).to.equal(segB[2]); // startTime
            expect(segA[3]).to.equal(segB[3]); // period
            // Both chains converge to the identical final price once the
            // shared, absolute startTime + period has elapsed everywhere.
            await time.increaseTo(startTime + period + 1);
            expect(await chainA.getUSDPrice()).to.equal(futurePrice);
            expect(await chainB.getUSDPrice()).to.equal(futurePrice);
        });
    });
    // =======================================================================
    // setStepSize (ADMIN-only)
    // =======================================================================
    describe("setStepSize()", function () {
        const STEP = ethers.parseUnits("0.05", 18);
        it("admin can set the step size", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.admin).setStepSize(STEP);
            await skipInitialCooldown();
            // No public getter for stepSize; verify behaviorally: an over-step reverts.
            await expect(
                updateUSDPrice(proToken, accounts.priceOperator, DEFAULT_USD_PRICE + STEP + 1n)
            ).to.be.revertedWithCustomError(proToken, ERRORS.PriceStepSizeExceeded);
        });
        it("emits StepSizeChanged(prev, new)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(proToken.connect(accounts.admin).setStepSize(STEP))
                .to.emit(proToken, EVENTS.StepSizeChanged)
                .withArgs(0n, STEP);
        });
        it("emits previous value on subsequent change", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.admin).setStepSize(STEP);
            await expect(proToken.connect(accounts.admin).setStepSize(STEP * 2n))
                .to.emit(proToken, EVENTS.StepSizeChanged)
                .withArgs(STEP, STEP * 2n);
        });
        it("can reset to 0 (removes the bound)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.admin).setStepSize(STEP);
            await proToken.connect(accounts.admin).setStepSize(0n);
            await skipInitialCooldown();
            // Unlimited again: a giant jump passes.
            await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("100", 18));
            expect(await proToken.getUSDPrice()).to.equal(ethers.parseUnits("100", 18));
        });
        it("reverts when called by operator", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.operator).setStepSize(STEP)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotAdmin);
        });
        it("reverts when called by priceOperator (cannot loosen own constraint)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.priceOperator).setStepSize(0n)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotAdmin);
        });
        it("reverts when called by random attacker", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.attacker).setStepSize(STEP)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotAdmin);
        });
    });
    // =======================================================================
    // setPriceUpdateCooldown (ADMIN-only)
    // =======================================================================
    describe("setPriceUpdateCooldown()", function () {
        const ONE_HOUR = 60 * 60;
        it("admin can change the cooldown (getter reflects it)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.admin).setPriceUpdateCooldown(ONE_HOUR);
            expect(await proToken.getPriceUpdateCooldown()).to.equal(BigInt(ONE_HOUR));
        });
        it("emits PriceUpdateCooldownChanged(prev, new)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(proToken.connect(accounts.admin).setPriceUpdateCooldown(ONE_HOUR))
                .to.emit(proToken, EVENTS.PriceUpdateCooldownChanged)
                .withArgs(BigInt(PRICE_UPDATE_COOLDOWN), BigInt(ONE_HOUR));
        });
        it("cooldown = 0 disables the wait (immediate sequential updates pass)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            // With cooldown 0, availableAt == lastPriceUpdateAt (the init seed),
            // which is already in the past — no skip needed.
            await proToken.connect(accounts.admin).setPriceUpdateCooldown(0n);
            await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.1", 18));
            await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.2", 18));
            expect(await proToken.getUSDPrice()).to.equal(ethers.parseUnits("1.2", 18));
        });
        it("shortening the cooldown applies to the already-running window", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await skipInitialCooldown();
            await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.1", 18));
            // 23h window is running; admin shortens it to 1h.
            await proToken.connect(accounts.admin).setPriceUpdateCooldown(ONE_HOUR);
            await time.increase(ONE_HOUR + 1);
            // Passes 1h after the last update — no need to wait out the original 23h.
            await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.2", 18));
            expect(await proToken.getUSDPrice()).to.equal(ethers.parseUnits("1.2", 18));
        });
        it("reverts when called by operator", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.operator).setPriceUpdateCooldown(ONE_HOUR)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotAdmin);
        });
        it("reverts when called by priceOperator (cannot loosen own constraint)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.priceOperator).setPriceUpdateCooldown(0n)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotAdmin);
        });
        it("reverts when called by random attacker", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.attacker).setPriceUpdateCooldown(ONE_HOUR)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotAdmin);
        });
    });
    // =======================================================================
    // mint
    // =======================================================================
    describe("mint()", function () {
        it("minter can mint to a user", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.minter).mint(accounts.user1.address, HUNDRED_TOKENS);
            expect(await proToken.balanceOf(accounts.user1.address)).to.equal(HUNDRED_TOKENS);
        });
        it("increases totalSupply", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.minter).mint(accounts.user1.address, HUNDRED_TOKENS);
            expect(await proToken.totalSupply()).to.equal(HUNDRED_TOKENS);
        });
        it("emits Minted(to, amount)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.minter).mint(accounts.user1.address, HUNDRED_TOKENS)
            )
                .to.emit(proToken, EVENTS.Minted)
                .withArgs(accounts.user1.address, HUNDRED_TOKENS, accounts.minter.address);
        });
        it("emits Transfer(0, to, amount) (OZ ERC20)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.minter).mint(accounts.user1.address, HUNDRED_TOKENS)
            )
                .to.emit(proToken, EVENTS.Transfer)
                .withArgs(ZERO_ADDRESS, accounts.user1.address, HUNDRED_TOKENS);
        });
        it("emits both Minted and Transfer in the same tx", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const tx = proToken.connect(accounts.minter).mint(accounts.user1.address, ONE_TOKEN);
            await expect(tx)
                .to.emit(proToken, EVENTS.Minted)
                .withArgs(accounts.user1.address, ONE_TOKEN, accounts.minter.address);
            await expect(tx)
                .to.emit(proToken, EVENTS.Transfer)
                .withArgs(ZERO_ADDRESS, accounts.user1.address, ONE_TOKEN);
        });
        it("reverts on amount = 0", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.minter).mint(accounts.user1.address, 0)
            ).to.be.revertedWithCustomError(proToken, ERRORS.InvalidAmount);
        });
        it("reverts when to is zero address (OZ _mint)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.minter).mint(ZERO_ADDRESS, ONE_TOKEN)
            ).to.be.revertedWithCustomError(proToken, ERRORS.ERC20InvalidReceiver);
        });
        it("reverts when called by admin (not minter)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.admin).mint(accounts.user1.address, ONE_TOKEN)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotMinter);
        });
        it("reverts when called by operator (not minter)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.operator).mint(accounts.user1.address, ONE_TOKEN)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotMinter);
        });
        it("reverts when called by random attacker", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.attacker).mint(accounts.user1.address, ONE_TOKEN)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotMinter);
        });
        it("can mint to multiple users sequentially", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.minter).mint(accounts.user1.address, ONE_TOKEN);
            await proToken.connect(accounts.minter).mint(accounts.user2.address, HUNDRED_TOKENS);
            expect(await proToken.balanceOf(accounts.user1.address)).to.equal(ONE_TOKEN);
            expect(await proToken.balanceOf(accounts.user2.address)).to.equal(HUNDRED_TOKENS);
            expect(await proToken.totalSupply()).to.equal(ONE_TOKEN + HUNDRED_TOKENS);
        });
        it("accumulates balance on repeat mints to same user", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.minter).mint(accounts.user1.address, ONE_TOKEN);
            await proToken.connect(accounts.minter).mint(accounts.user1.address, ONE_TOKEN);
            await proToken.connect(accounts.minter).mint(accounts.user1.address, ONE_TOKEN);
            expect(await proToken.balanceOf(accounts.user1.address)).to.equal(ONE_TOKEN * 3n);
        });
        it("supports very large mint amounts", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const huge = ethers.parseUnits("1000000000000", 18);
            await proToken.connect(accounts.minter).mint(accounts.user1.address, huge);
            expect(await proToken.balanceOf(accounts.user1.address)).to.equal(huge);
        });
    });
    // =======================================================================
    // burn
    // =======================================================================
    describe("burn()", function () {
        it("minter can burn from a user with balance", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            const burnAmount = HUNDRED_TOKENS;
            const before = await proToken.balanceOf(accounts.user1.address);
            await proToken.connect(accounts.minter).burn(accounts.user1.address, burnAmount);
            expect(await proToken.balanceOf(accounts.user1.address)).to.equal(before - burnAmount);
        });
        it("decreases totalSupply", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            const before = await proToken.totalSupply();
            await proToken.connect(accounts.minter).burn(accounts.user1.address, HUNDRED_TOKENS);
            expect(await proToken.totalSupply()).to.equal(before - HUNDRED_TOKENS);
        });
        it("emits Burned(from, amount)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            await expect(
                proToken.connect(accounts.minter).burn(accounts.user1.address, ONE_TOKEN)
            )
                .to.emit(proToken, EVENTS.Burned)
                .withArgs(accounts.user1.address, ONE_TOKEN, accounts.minter.address);
        });
        it("emits Transfer(from, 0, amount) (OZ ERC20)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            await expect(
                proToken.connect(accounts.minter).burn(accounts.user1.address, ONE_TOKEN)
            )
                .to.emit(proToken, EVENTS.Transfer)
                .withArgs(accounts.user1.address, ZERO_ADDRESS, ONE_TOKEN);
        });
        it("emits both Burned and Transfer in the same tx", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            const tx = proToken.connect(accounts.minter).burn(accounts.user1.address, ONE_TOKEN);
            await expect(tx)
                .to.emit(proToken, EVENTS.Burned)
                .withArgs(accounts.user1.address, ONE_TOKEN, accounts.minter.address);
            await expect(tx)
                .to.emit(proToken, EVENTS.Transfer)
                .withArgs(accounts.user1.address, ZERO_ADDRESS, ONE_TOKEN);
        });
        it("reverts on amount = 0", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            await expect(
                proToken.connect(accounts.minter).burn(accounts.user1.address, 0)
            ).to.be.revertedWithCustomError(proToken, ERRORS.InvalidAmount);
        });
        it("reverts when from is zero address (OZ _burn)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            await expect(
                proToken.connect(accounts.minter).burn(ZERO_ADDRESS, ONE_TOKEN)
            ).to.be.revertedWithCustomError(proToken, ERRORS.ERC20InvalidSender);
        });
        it("reverts when called by admin (not minter)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            await expect(
                proToken.connect(accounts.admin).burn(accounts.user1.address, ONE_TOKEN)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotMinter);
        });
        it("reverts when called by operator (not minter)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            await expect(
                proToken.connect(accounts.operator).burn(accounts.user1.address, ONE_TOKEN)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotMinter);
        });
        it("reverts when called by random attacker", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            await expect(
                proToken.connect(accounts.attacker).burn(accounts.user1.address, ONE_TOKEN)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotMinter);
        });
        it("reverts when burning more than balance", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            const balance = await proToken.balanceOf(accounts.user1.address);
            await expect(
                proToken.connect(accounts.minter).burn(accounts.user1.address, balance + 1n)
            ).to.be.revertedWithCustomError(proToken, ERRORS.ERC20InsufficientBalance);
        });
        it("can burn entire balance to zero", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            const balance = await proToken.balanceOf(accounts.user1.address);
            await proToken.connect(accounts.minter).burn(accounts.user1.address, balance);
            expect(await proToken.balanceOf(accounts.user1.address)).to.equal(0n);
        });
        it("reverts when burning from a user with zero balance", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            // user2 has no balance
            await expect(
                proToken.connect(accounts.minter).burn(accounts.user2.address, ONE_TOKEN)
            ).to.be.revertedWithCustomError(proToken, ERRORS.ERC20InsufficientBalance);
        });
    });
    // =======================================================================
    // View functions
    // =======================================================================
    describe("View Functions", function () {
        it("getMinter() returns the minter", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            expect(await proToken.getMinter()).to.equal(accounts.minter.address);
        });
        it("getUSDPrice() returns current price", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const p = ethers.parseUnits("1.42", 18);
            await proToken.connect(accounts.admin).setUSDPrice(p);
            expect(await proToken.getUSDPrice()).to.equal(p);
        });
        it("getUSDPrice() reverts with USDPriceDisabled when price = 0", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.admin).setUSDPrice(0);
            await expect(proToken.getUSDPrice()).to.be.revertedWithCustomError(
                proToken, ERRORS.USDPriceDisabled
            );
        });
        it("getProTokenSettings() returns the settings address", async function () {
            const { proToken, proTokenSettingsAddress } = await loadFixture(proTokenFixture);
            expect(await proToken.getProTokenSettings()).to.equal(proTokenSettingsAddress);
        });
    });
    // =======================================================================
    // ERC20 inherited behavior
    // =======================================================================
    describe("ERC20 Standard Functions", function () {
        it("transfer moves tokens between accounts", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            await proToken.connect(accounts.user1).transfer(accounts.user2.address, HUNDRED_TOKENS);
            expect(await proToken.balanceOf(accounts.user2.address)).to.equal(HUNDRED_TOKENS);
        });
        it("transfer emits Transfer event", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            await expect(
                proToken.connect(accounts.user1).transfer(accounts.user2.address, ONE_TOKEN)
            )
                .to.emit(proToken, EVENTS.Transfer)
                .withArgs(accounts.user1.address, accounts.user2.address, ONE_TOKEN);
        });
        it("transfer reverts on insufficient balance", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            // user2 has no balance
            await expect(
                proToken.connect(accounts.user2).transfer(accounts.externalBusiness.address, ONE_TOKEN)
            ).to.be.revertedWithCustomError(proToken, ERRORS.ERC20InsufficientBalance);
        });
        it("approve sets allowance", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            await proToken.connect(accounts.user1).approve(accounts.user2.address, HUNDRED_TOKENS);
            expect(
                await proToken.allowance(accounts.user1.address, accounts.user2.address)
            ).to.equal(HUNDRED_TOKENS);
        });
        it("approve emits Approval event", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            await expect(
                proToken.connect(accounts.user1).approve(accounts.user2.address, ONE_TOKEN)
            )
                .to.emit(proToken, EVENTS.Approval)
                .withArgs(accounts.user1.address, accounts.user2.address, ONE_TOKEN);
        });
        it("transferFrom respects allowance and reduces it", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            await proToken.connect(accounts.user1).approve(accounts.user2.address, HUNDRED_TOKENS);
            await proToken
                .connect(accounts.user2)
                .transferFrom(accounts.user1.address, accounts.externalBusiness.address, HUNDRED_TOKENS);
            expect(await proToken.balanceOf(accounts.externalBusiness.address)).to.equal(HUNDRED_TOKENS);
            expect(
                await proToken.allowance(accounts.user1.address, accounts.user2.address)
            ).to.equal(0n);
        });
        it("transferFrom reverts on insufficient allowance", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            await proToken.connect(accounts.user1).approve(accounts.user2.address, 10n);
            await expect(
                proToken
                    .connect(accounts.user2)
                    .transferFrom(accounts.user1.address, accounts.externalBusiness.address, HUNDRED_TOKENS)
            ).to.be.revertedWithCustomError(proToken, ERRORS.ERC20InsufficientAllowance);
        });
        it("transferFrom with max allowance does NOT decrement allowance", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            const maxUint = ethers.MaxUint256;
            await proToken.connect(accounts.user1).approve(accounts.user2.address, maxUint);
            await proToken
                .connect(accounts.user2)
                .transferFrom(accounts.user1.address, accounts.externalBusiness.address, ONE_TOKEN);
            expect(
                await proToken.allowance(accounts.user1.address, accounts.user2.address)
            ).to.equal(maxUint);
        });
    });
    // =======================================================================
    // EIP-2612 permit
    // =======================================================================
    describe("permit (EIP-2612)", function () {
        async function buildPermitSig(
            proToken: any,
            owner: any,
            spender: any,
            value: bigint,
            deadline: number,
            nonceOverride?: bigint
        ) {
            const chainId = (await ethers.provider.getNetwork()).chainId;
            const domain = {
                name: PROTOKEN_NAME,
                version: "1",
                chainId,
                verifyingContract: await proToken.getAddress(),
            };
            const types = {
                Permit: [
                    { name: "owner",    type: "address" },
                    { name: "spender",  type: "address" },
                    { name: "value",    type: "uint256" },
                    { name: "nonce",    type: "uint256" },
                    { name: "deadline", type: "uint256" },
                ],
            };
            const nonce = nonceOverride ?? await proToken.nonces(owner.address);
            const message = {
                owner: owner.address,
                spender: spender.address,
                value,
                nonce,
                deadline,
            };
            const sig = await owner.signTypedData(domain, types, message);
            return ethers.Signature.from(sig);
        }
        it("DOMAIN_SEPARATOR is non-zero", async function () {
            const { proToken } = await loadFixture(proTokenFixture);
            expect(await proToken.DOMAIN_SEPARATOR()).to.not.equal(ethers.ZeroHash);
        });
        it("initial nonce is 0", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            expect(await proToken.nonces(accounts.user1.address)).to.equal(0n);
        });
        it("happy path: grants allowance and increments nonce", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const deadline = (await time.latest()) + 3600;
            const { v, r, s } = await buildPermitSig(
                proToken, accounts.user1, accounts.user2, HUNDRED_TOKENS, deadline
            );
            await proToken.permit(
                accounts.user1.address,
                accounts.user2.address,
                HUNDRED_TOKENS,
                deadline,
                v, r, s,
            );
            expect(
                await proToken.allowance(accounts.user1.address, accounts.user2.address)
            ).to.equal(HUNDRED_TOKENS);
            expect(await proToken.nonces(accounts.user1.address)).to.equal(1n);
        });
        it("reverts when deadline has passed", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const pastDeadline = 1;
            const { v, r, s } = await buildPermitSig(
                proToken, accounts.user1, accounts.user2, HUNDRED_TOKENS, pastDeadline
            );
            await expect(
                proToken.permit(
                    accounts.user1.address,
                    accounts.user2.address,
                    HUNDRED_TOKENS,
                    pastDeadline,
                    v, r, s,
                )
            ).to.be.revertedWithCustomError(proToken, ERRORS.ERC2612ExpiredSignature);
        });
        it("reverts when signer does not match owner", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const deadline = (await time.latest()) + 3600;
            // attacker signs, but we claim owner=user1
            const { v, r, s } = await buildPermitSig(
                proToken, accounts.attacker, accounts.user2, HUNDRED_TOKENS, deadline
            );
            await expect(
                proToken.permit(
                    accounts.user1.address,
                    accounts.user2.address,
                    HUNDRED_TOKENS,
                    deadline,
                    v, r, s,
                )
            ).to.be.revertedWithCustomError(proToken, ERRORS.ERC2612InvalidSigner);
        });
        it("replay attack fails (nonce changes after first use)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const deadline = (await time.latest()) + 3600;
            const { v, r, s } = await buildPermitSig(
                proToken, accounts.user1, accounts.user2, HUNDRED_TOKENS, deadline
            );
            await proToken.permit(
                accounts.user1.address,
                accounts.user2.address,
                HUNDRED_TOKENS,
                deadline,
                v, r, s,
            );
            await expect(
                proToken.permit(
                    accounts.user1.address,
                    accounts.user2.address,
                    HUNDRED_TOKENS,
                    deadline,
                    v, r, s,
                )
            ).to.be.revertedWithCustomError(proToken, ERRORS.ERC2612InvalidSigner);
        });
    });
    // =======================================================================
    // Access control reactivity (real ProTokenSettings drives admin/priceOperator)
    // =======================================================================
    describe("Access control reactivity", function () {
        it("admin change propagates: new admin can setMinter, old cannot", async function () {
            const { proToken, proTokenSettings, accounts } =
                await loadFixture(proTokenFixture);
            // Two-step admin transfer
            await proTokenSettings.connect(accounts.admin).proposeAdmin(accounts.user1.address);
            await proTokenSettings.connect(accounts.user1).acceptAdmin();
            await expect(
                proToken.connect(accounts.admin).setMinter(accounts.user2.address)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotAdmin);
            await proToken.connect(accounts.user1).setMinter(accounts.user2.address);
            expect(await proToken.getMinter()).to.equal(accounts.user2.address);
        });
        it("admin change propagates: new admin can setUSDPrice, old cannot", async function () {
            const { proToken, proTokenSettings, accounts } =
                await loadFixture(proTokenFixture);
            const p = ethers.parseUnits("1.3", 18);
            await proTokenSettings.connect(accounts.admin).proposeAdmin(accounts.user1.address);
            await proTokenSettings.connect(accounts.user1).acceptAdmin();
            await expect(
                proToken.connect(accounts.admin).setUSDPrice(p)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotAdmin);
            await proToken.connect(accounts.user1).setUSDPrice(p);
            expect(await proToken.getUSDPrice()).to.equal(p);
        });
        it("priceOperator change propagates: new priceOperator can updateUSDPrice, old cannot", async function () {
            const { proToken, proTokenSettings, accounts } =
                await loadFixture(proTokenFixture);
            await skipInitialCooldown();
            const p = ethers.parseUnits("1.3", 18);
            await proTokenSettings.connect(accounts.admin).setPriceOperator(accounts.user1.address);
            await expect(
                updateUSDPrice(proToken, accounts.priceOperator, p)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotPriceOperator);
            await updateUSDPrice(proToken, accounts.user1, p);
            expect(await proToken.getUSDPrice()).to.equal(p);
        });
        it("pending admin proposal does not change current admin yet", async function () {
            const { proToken, proTokenSettings, accounts } =
                await loadFixture(proTokenFixture);
            // Propose but do not accept
            await proTokenSettings.connect(accounts.admin).proposeAdmin(accounts.user1.address);
            // Old admin still works
            await proToken.connect(accounts.admin).setMinter(accounts.user2.address);
            expect(await proToken.getMinter()).to.equal(accounts.user2.address);
            // user1 (proposed but not accepted) cannot yet act as admin
            await expect(
                proToken.connect(accounts.user1).setMinter(accounts.admin.address)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotAdmin);
        });
    });
    // =======================================================================
    // _authorizeUpgrade (UUPS)
    // =======================================================================
    describe("_authorizeUpgrade (UUPS)", function () {
        it("admin can upgrade to higher VERSION", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const V2 = await ethers.getContractFactory("MockUpgradeTargetHigherVersion");
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();
            await expect(
                proToken.connect(accounts.admin).upgradeToAndCall(await v2Impl.getAddress(), "0x")
            ).to.not.be.reverted;
        });
        it("emits Upgraded(newImpl) on successful upgrade", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const V2 = await ethers.getContractFactory("MockUpgradeTargetHigherVersion");
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();
            await expect(
                proToken.connect(accounts.admin).upgradeToAndCall(await v2Impl.getAddress(), "0x")
            )
                .to.emit(proToken, EVENTS.Upgraded)
                .withArgs(await v2Impl.getAddress());
        });
        it("reverts VersionNotIncremented when new VERSION equals current", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const Same = await ethers.getContractFactory("MockUpgradeTargetSameVersion");
            const sameImpl = await Same.deploy();
            await sameImpl.waitForDeployment();
            await expect(
                proToken.connect(accounts.admin).upgradeToAndCall(await sameImpl.getAddress(), "0x")
            )
                .to.be.revertedWithCustomError(proToken, ERRORS.VersionNotIncremented)
                .withArgs(VERSION_1_0_0, VERSION_1_0_0);
        });
        it("reverts VersionNotIncremented when new VERSION is lower", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const Lower = await ethers.getContractFactory("MockUpgradeTargetLowerVersion");
            const lowerImpl = await Lower.deploy();
            await lowerImpl.waitForDeployment();
            await expect(
                proToken.connect(accounts.admin).upgradeToAndCall(await lowerImpl.getAddress(), "0x")
            )
                .to.be.revertedWithCustomError(proToken, ERRORS.VersionNotIncremented)
                .withArgs(VERSION_1_0_0, 1n);
        });
        it("reverts NotAdmin when called by operator", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const V2 = await ethers.getContractFactory("MockUpgradeTargetHigherVersion");
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();
            await expect(
                proToken.connect(accounts.operator).upgradeToAndCall(await v2Impl.getAddress(), "0x")
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotAdmin);
        });
        it("reverts NotAdmin when called by minter", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const V2 = await ethers.getContractFactory("MockUpgradeTargetHigherVersion");
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();
            await expect(
                proToken.connect(accounts.minter).upgradeToAndCall(await v2Impl.getAddress(), "0x")
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotAdmin);
        });
        it("reverts NotAdmin when called by random attacker", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const V2 = await ethers.getContractFactory("MockUpgradeTargetHigherVersion");
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();
            await expect(
                proToken.connect(accounts.attacker).upgradeToAndCall(await v2Impl.getAddress(), "0x")
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotAdmin);
        });
    });
    // =======================================================================
    // End-to-end flows within the contract
    // =======================================================================
    describe("End-to-end flows", function () {
        it("mint → transfer → burn full cycle", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.minter).mint(accounts.user1.address, HUNDRED_TOKENS);
            await proToken.connect(accounts.user1).transfer(accounts.user2.address, HUNDRED_TOKENS);
            await proToken.connect(accounts.minter).burn(accounts.user2.address, HUNDRED_TOKENS);
            expect(await proToken.totalSupply()).to.equal(0n);
            expect(await proToken.balanceOf(accounts.user1.address)).to.equal(0n);
            expect(await proToken.balanceOf(accounts.user2.address)).to.equal(0n);
        });
        it("minter handoff: old minter blocked, new minter active", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.minter).mint(accounts.user1.address, ONE_TOKEN);
            await proToken.connect(accounts.admin).setMinter(accounts.user2.address);
            await expect(
                proToken.connect(accounts.minter).mint(accounts.user1.address, ONE_TOKEN)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotMinter);
            await proToken.connect(accounts.user2).mint(accounts.user1.address, ONE_TOKEN);
            expect(await proToken.balanceOf(accounts.user1.address)).to.equal(ONE_TOKEN * 2n);
        });
        it("price disable does not affect ERC20 operations", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFundedFixture);
            await proToken.connect(accounts.admin).setUSDPrice(0);
            // Transfer still works
            await proToken.connect(accounts.user1).transfer(accounts.user2.address, ONE_TOKEN);
            // Mint still works
            await proToken.connect(accounts.minter).mint(accounts.user1.address, ONE_TOKEN);
            // Burn still works
            await proToken.connect(accounts.minter).burn(accounts.user1.address, ONE_TOKEN);
            // Only getUSDPrice is affected
            await expect(proToken.getUSDPrice()).to.be.revertedWithCustomError(
                proToken, ERRORS.USDPriceDisabled
            );
        });
        it("split-authority lifecycle: priceOperator ratchets up, admin marks down, priceOperator resumes", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await skipInitialCooldown();
            // Routine appreciation via the constrained path.
            await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.05", 18));
            await time.increase(PRICE_UPDATE_COOLDOWN + 1); // respect the 23h cooldown
            await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.10", 18));
            // Slash: admin marks down (the only role that can decrease). This
            // RESETS the operator's cooldown clock — the markdown gets a full
            // protected window for markdownPrice()/cover().
            await proToken.connect(accounts.admin).setUSDPrice(ethers.parseUnits("1.02", 18));
            expect(await proToken.getUSDPrice()).to.equal(ethers.parseUnits("1.02", 18));
            // An immediate operator overwrite is blocked (the race fix).
            await expect(
                updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.06", 18))
            ).to.be.revertedWithCustomError(proToken, ERRORS.PriceUpdateCooldownActive);
            // Recovery: priceOperator resumes increases once the admin-keyed
            // window has elapsed.
            await time.increase(PRICE_UPDATE_COOLDOWN + 1);
            await updateUSDPrice(proToken, accounts.priceOperator, ethers.parseUnits("1.06", 18));
            expect(await proToken.getUSDPrice()).to.equal(ethers.parseUnits("1.06", 18));
        });
    });
});