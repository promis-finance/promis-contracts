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
//   updateUSDPrice — PRICE-OPERATOR-only. Strictly increasing, step-size bounded
//                    (stepSize 0 = unlimited), cannot run while price is disabled.
//   setStepSize    — ADMIN-only. Bounds the priceOperator's per-update increment.
//
// Fixture requirements: accounts.priceOperator exists in TestAccounts, and
// deployProTokenSettings passes it as the third initialize arg.
// ---------------------------------------------------------------------------

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
    // markdowns) and 0 (disable). The operator is now a REJECTED caller here —
    // routine increases go through the priceOperator's updateUSDPrice instead.
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
    });

    // =======================================================================
    // updateUSDPrice (PRICE-OPERATOR-only, constrained — the hot path)
    //
    // The priceOperator's routine path: strictly increasing, step-size bounded
    // (stepSize 0 = unlimited), and refuses to run while the price is disabled
    // (re-enabling from 0 is an admin-only action via setUSDPrice).
    //
    // Validation order in the contract:
    //   1. InvalidPrice        (_price > 0 but < 1e18)
    //   2. USDPriceDisabled    (current price is 0)
    //   3. PriceNotIncreasing  (_price <= current)
    //   4. PriceStepSizeExceeded (stepSize != 0 and jump > stepSize)
    // Tests below pin this ordering where reachable inputs overlap.
    // =======================================================================
    describe("updateUSDPrice() — priceOperator-only", function () {
        it("priceOperator can increase the price (no step size configured = unlimited)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const newPrice = ethers.parseUnits("1.25", 18);
            await proToken.connect(accounts.priceOperator).updateUSDPrice(newPrice);
            expect(await proToken.getUSDPrice()).to.equal(newPrice);
        });

        it("emits USDPriceUpdated(prev, new)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const newPrice = ethers.parseUnits("1.1", 18);
            await expect(proToken.connect(accounts.priceOperator).updateUSDPrice(newPrice))
                .to.emit(proToken, EVENTS.USDPriceUpdated)
                .withArgs(DEFAULT_USD_PRICE, newPrice);
        });

        it("supports sequential increases (each strictly above the last)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            const p1 = ethers.parseUnits("1.05", 18);
            const p2 = ethers.parseUnits("1.10", 18);
            const p3 = ethers.parseUnits("1.15", 18);

            await proToken.connect(accounts.priceOperator).updateUSDPrice(p1);
            await proToken.connect(accounts.priceOperator).updateUSDPrice(p2);
            await proToken.connect(accounts.priceOperator).updateUSDPrice(p3);
            expect(await proToken.getUSDPrice()).to.equal(p3);
        });

        it("reverts PriceNotIncreasing when new price equals current", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.priceOperator).updateUSDPrice(DEFAULT_USD_PRICE)
            ).to.be.revertedWithCustomError(proToken, ERRORS.PriceNotIncreasing);
        });

        it("reverts PriceNotIncreasing when new price is lower (no markdowns on this path)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.priceOperator).updateUSDPrice(ethers.parseUnits("1.5", 18));
            await expect(
                proToken.connect(accounts.priceOperator).updateUSDPrice(ethers.parseUnits("1.2", 18))
            ).to.be.revertedWithCustomError(proToken, ERRORS.PriceNotIncreasing);
        });

        it("reverts PriceNotIncreasing on _price = 0 (cannot disable via this path)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            // _price=0 passes the InvalidPrice check (0 is exempt), then fails
            // the monotonicity check since 0 <= current. The priceOperator has
            // no route to disabling the price.
            await expect(
                proToken.connect(accounts.priceOperator).updateUSDPrice(0)
            ).to.be.revertedWithCustomError(proToken, ERRORS.PriceNotIncreasing);
        });

        it("reverts InvalidPrice when _price > 0 but < MIN_USD_PRICE (checked before monotonicity)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            // MIN-1 is both sub-minimum AND non-increasing; InvalidPrice fires
            // because that check runs first.
            await expect(
                proToken.connect(accounts.priceOperator).updateUSDPrice(MIN_USD_PRICE - 1n)
            ).to.be.revertedWithCustomError(proToken, ERRORS.InvalidPrice);
        });

        it("reverts USDPriceDisabled when price is disabled (admin must re-enable)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await proToken.connect(accounts.admin).setUSDPrice(0);

            // Even a perfectly valid increase target is rejected while disabled:
            // resurrecting a disabled price is an emergency-exit reversal that
            // stays admin-only.
            await expect(
                proToken.connect(accounts.priceOperator).updateUSDPrice(ethers.parseUnits("1.5", 18))
            ).to.be.revertedWithCustomError(proToken, ERRORS.USDPriceDisabled);
        });

        it("reverts when called by admin (role isolation: their path is setUSDPrice)", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.admin).updateUSDPrice(ethers.parseUnits("1.5", 18))
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotPriceOperator);
        });

        it("reverts when called by operator", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.operator).updateUSDPrice(ethers.parseUnits("1.5", 18))
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotPriceOperator);
        });

        it("reverts when called by random attacker", async function () {
            const { proToken, accounts } = await loadFixture(proTokenFixture);
            await expect(
                proToken.connect(accounts.attacker).updateUSDPrice(ethers.parseUnits("1.5", 18))
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotPriceOperator);
        });

        describe("step-size enforcement", function () {
            const STEP = ethers.parseUnits("0.1", 18); // 0.1 USD per update

            it("allows a jump of exactly stepSize (boundary passes)", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await proToken.connect(accounts.admin).setStepSize(STEP);

                await proToken.connect(accounts.priceOperator).updateUSDPrice(
                    DEFAULT_USD_PRICE + STEP
                );
                expect(await proToken.getUSDPrice()).to.equal(DEFAULT_USD_PRICE + STEP);
            });

            it("reverts PriceStepSizeExceeded on a jump of stepSize + 1 wei", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await proToken.connect(accounts.admin).setStepSize(STEP);

                await expect(
                    proToken.connect(accounts.priceOperator).updateUSDPrice(
                        DEFAULT_USD_PRICE + STEP + 1n
                    )
                ).to.be.revertedWithCustomError(proToken, ERRORS.PriceStepSizeExceeded);
            });

            it("step applies per-update: two sequential max-step jumps both pass", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                await proToken.connect(accounts.admin).setStepSize(STEP);

                await proToken.connect(accounts.priceOperator).updateUSDPrice(DEFAULT_USD_PRICE + STEP);
                await proToken.connect(accounts.priceOperator).updateUSDPrice(DEFAULT_USD_PRICE + STEP * 2n);
                expect(await proToken.getUSDPrice()).to.equal(DEFAULT_USD_PRICE + STEP * 2n);
            });

            it("stepSize = 0 means UNLIMITED jumps (documented risk semantics)", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                // Default stepSize is 0 — no bound. A giant jump succeeds.
                const giant = ethers.parseUnits("1000", 18);
                await proToken.connect(accounts.priceOperator).updateUSDPrice(giant);
                expect(await proToken.getUSDPrice()).to.equal(giant);
            });

            it("admin tightening stepSize immediately constrains the next update", async function () {
                const { proToken, accounts } = await loadFixture(proTokenFixture);
                // Unlimited jump first...
                await proToken.connect(accounts.priceOperator).updateUSDPrice(ethers.parseUnits("2", 18));
                // ...then admin bounds it; an over-step now reverts.
                await proToken.connect(accounts.admin).setStepSize(STEP);
                await expect(
                    proToken.connect(accounts.priceOperator).updateUSDPrice(ethers.parseUnits("3", 18))
                ).to.be.revertedWithCustomError(proToken, ERRORS.PriceStepSizeExceeded);
            });
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
            // No public getter for stepSize; verify behaviorally: an over-step reverts.
            await expect(
                proToken.connect(accounts.priceOperator).updateUSDPrice(
                    DEFAULT_USD_PRICE + STEP + 1n
                )
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

            // Unlimited again: a giant jump passes.
            await proToken.connect(accounts.priceOperator).updateUSDPrice(ethers.parseUnits("100", 18));
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
                .withArgs(accounts.user1.address, HUNDRED_TOKENS);
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
                .withArgs(accounts.user1.address, ONE_TOKEN);
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
                .withArgs(accounts.user1.address, ONE_TOKEN);
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
                .withArgs(accounts.user1.address, ONE_TOKEN);
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
            const p = ethers.parseUnits("1.3", 18);

            await proTokenSettings.connect(accounts.admin).setPriceOperator(accounts.user1.address);

            await expect(
                proToken.connect(accounts.priceOperator).updateUSDPrice(p)
            ).to.be.revertedWithCustomError(proToken, ERRORS.NotPriceOperator);

            await proToken.connect(accounts.user1).updateUSDPrice(p);
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

            // Routine appreciation via the constrained path.
            await proToken.connect(accounts.priceOperator).updateUSDPrice(ethers.parseUnits("1.05", 18));
            await proToken.connect(accounts.priceOperator).updateUSDPrice(ethers.parseUnits("1.10", 18));

            // Slash: admin marks down (the only role that can decrease).
            await proToken.connect(accounts.admin).setUSDPrice(ethers.parseUnits("1.02", 18));
            expect(await proToken.getUSDPrice()).to.equal(ethers.parseUnits("1.02", 18));

            // Recovery: priceOperator resumes increases from the marked-down level.
            await proToken.connect(accounts.priceOperator).updateUSDPrice(ethers.parseUnits("1.06", 18));
            expect(await proToken.getUSDPrice()).to.equal(ethers.parseUnits("1.06", 18));
        });
    });
});