import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import {
    ZERO_ADDRESS,
    ONE_USD,
    DECIMALS_18,
    ONE_PERCENT_WAD,
    HUNDRED_PERCENT,
    MAX_PRICE_DEVIATION_BPS,
    VERSION_1_0_0,
    ERRORS,
    EVENTS,
} from "../helpers/constants";
import {
    proTokenSettingsFixture,
    fullProtocolFixture,
} from "../helpers/fixtures";
import {
    deployMintableERC20,
    deployYAssetOperationsHandler,
    getTestAccounts,
    createDefaultYAssetSettings,
    type YAssetSettings,
} from "../helpers/deploy";
import { getRandomAddress } from "../helpers/mocks";
import { ZeroAddress } from "ethers";

// ---------------------------------------------------------------------------
// ProTokenSettings — unit tests
//
// Goal: 100% line/branch coverage of contracts/core/ProTokenSettings.sol.
//
// Uses real ProTokenSettings deployed as a UUPS proxy. Tests exercise both
// the simple admin/role machinery and the more complex yAsset registry.
// LST ratio machinery removed; StrategyVault + Authority registries added.
// ---------------------------------------------------------------------------

describe("ProTokenSettings", function () {
    // =======================================================================
    // Constants
    // =======================================================================
    describe("Constants", function () {
        it("VERSION = 1_00_00", async function () {
            const { proTokenSettings } = await loadFixture(proTokenSettingsFixture);
            expect(await proTokenSettings.VERSION()).to.equal(VERSION_1_0_0);
        });

        it("MAX_PRICE_DEVIATION_BPS = 10000", async function () {
            const { proTokenSettings } = await loadFixture(proTokenSettingsFixture);
            expect(await proTokenSettings.MAX_PRICE_DEVIATION_BPS()).to.equal(
                MAX_PRICE_DEVIATION_BPS
            );
        });
    });

    // =======================================================================
    // initialize
    // =======================================================================
    describe("initialize()", function () {
        it("sets admin and operator from constructor args", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            expect(await proTokenSettings.getAdmin()).to.equal(accounts.admin.address);
            expect(await proTokenSettings.getOperator()).to.equal(
                accounts.operator.address
            );
        });

        it("starts unpaused", async function () {
            const { proTokenSettings } = await loadFixture(proTokenSettingsFixture);
            expect(await proTokenSettings.isPaused()).to.equal(false);
        });

        it("externalBusiness defaults to zero address", async function () {
            const { proTokenSettings } = await loadFixture(proTokenSettingsFixture);
            expect(await proTokenSettings.getExternalBusiness()).to.equal(ZERO_ADDRESS);
        });

        it("unmintYAssets starts empty", async function () {
            const { proTokenSettings } = await loadFixture(proTokenSettingsFixture);
            expect((await proTokenSettings.getUnmintYAssets()).length).to.equal(0);
        });

        it("reverts when _admin is zero address", async function () {
            const accounts = await getTestAccounts();
            const Factory = await ethers.getContractFactory("ProTokenSettings");

            await expect(
                upgrades.deployProxy(
                    Factory,
                    [ZERO_ADDRESS, accounts.operator.address, accounts.priceOperator.address],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(Factory, ERRORS.ZeroAddress);
        });

        it("reverts when _operator is zero address", async function () {
            const accounts = await getTestAccounts();
            const Factory = await ethers.getContractFactory("ProTokenSettings");

            await expect(
                upgrades.deployProxy(
                    Factory,
                    [accounts.admin.address, ZERO_ADDRESS, accounts.priceOperator.address],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(Factory, ERRORS.ZeroAddress);
        });

        it("reverts when both addresses are zero", async function () {
            const Factory = await ethers.getContractFactory("ProTokenSettings");
            await expect(
                upgrades.deployProxy(
                    Factory,
                    [ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(Factory, ERRORS.ZeroAddress);
        });

        it("reverts on re-initialization", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings.initialize(
                    accounts.admin.address,
                    accounts.operator.address,
                    accounts.priceOperator.address
                )
            ).to.be.revertedWithCustomError(
                proTokenSettings,
                ERRORS.InvalidInitialization
            );
        });

        it("implementation contract has initializers disabled", async function () {
            const { proTokenSettings } = await loadFixture(proTokenSettingsFixture);
            const implAddress = await upgrades.erc1967.getImplementationAddress(
                await proTokenSettings.getAddress()
            );
            const impl = await ethers.getContractAt(
                "ProTokenSettings",
                implAddress
            );
            await expect(
                impl.initialize(ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(impl, ERRORS.InvalidInitialization);
        });
    });

    // =======================================================================
    // Admin two-step transfer
    // =======================================================================
    describe("proposeAdmin() / acceptAdmin()", function () {
        it("admin can propose a new admin", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .proposeAdmin(accounts.user1.address)
            )
                .to.emit(proTokenSettings, EVENTS.AdminProposed)
                .withArgs(accounts.admin.address, accounts.user1.address);
        });

        it("proposed admin is not yet the admin", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await proTokenSettings
                .connect(accounts.admin)
                .proposeAdmin(accounts.user1.address);
            expect(await proTokenSettings.getAdmin()).to.equal(accounts.admin.address);
        });

        it("proposeAdmin reverts on zero address", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings.connect(accounts.admin).proposeAdmin(ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.ZeroAddress);
        });

        it("proposeAdmin reverts when called by non-admin", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );

            await expect(
                proTokenSettings
                    .connect(accounts.operator)
                    .proposeAdmin(accounts.user1.address)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);

            await expect(
                proTokenSettings
                    .connect(accounts.attacker)
                    .proposeAdmin(accounts.user1.address)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);
        });

        it("pending admin can accept", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await proTokenSettings
                .connect(accounts.admin)
                .proposeAdmin(accounts.user1.address);

            await expect(proTokenSettings.connect(accounts.user1).acceptAdmin())
                .to.emit(proTokenSettings, EVENTS.AdminAccepted)
                .withArgs(accounts.admin.address, accounts.user1.address);

            expect(await proTokenSettings.getAdmin()).to.equal(accounts.user1.address);
        });

        it("acceptAdmin clears pendingAdmin (cannot accept twice)", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await proTokenSettings
                .connect(accounts.admin)
                .proposeAdmin(accounts.user1.address);
            await proTokenSettings.connect(accounts.user1).acceptAdmin();

            await expect(
                proTokenSettings.connect(accounts.user1).acceptAdmin()
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotPendingAdmin);
        });

        it("acceptAdmin reverts when called by old admin", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await proTokenSettings
                .connect(accounts.admin)
                .proposeAdmin(accounts.user1.address);

            await expect(
                proTokenSettings.connect(accounts.admin).acceptAdmin()
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotPendingAdmin);
        });

        it("acceptAdmin reverts when called by random caller", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await proTokenSettings
                .connect(accounts.admin)
                .proposeAdmin(accounts.user1.address);

            await expect(
                proTokenSettings.connect(accounts.user2).acceptAdmin()
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotPendingAdmin);
        });

        it("acceptAdmin reverts when there is no pending admin", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings.connect(accounts.user1).acceptAdmin()
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotPendingAdmin);
        });

        it("admin can re-propose to overwrite a pending admin", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await proTokenSettings
                .connect(accounts.admin)
                .proposeAdmin(accounts.user1.address);
            await proTokenSettings
                .connect(accounts.admin)
                .proposeAdmin(accounts.user2.address);

            await expect(
                proTokenSettings.connect(accounts.user1).acceptAdmin()
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotPendingAdmin);

            await proTokenSettings.connect(accounts.user2).acceptAdmin();
            expect(await proTokenSettings.getAdmin()).to.equal(accounts.user2.address);
        });
    });

    // =======================================================================
    // setOperator
    // =======================================================================
    describe("setOperator()", function () {
        it("admin can set a new operator", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setOperator(accounts.user1.address)
            )
                .to.emit(proTokenSettings, EVENTS.OperatorSet)
                .withArgs(accounts.operator.address, accounts.user1.address);

            expect(await proTokenSettings.getOperator()).to.equal(
                accounts.user1.address
            );
        });

        it("reverts on zero address", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings.connect(accounts.admin).setOperator(ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.ZeroAddress);
        });

        it("reverts when called by operator (not admin)", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings
                    .connect(accounts.operator)
                    .setOperator(accounts.user1.address)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);
        });

        it("reverts when called by random attacker", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings
                    .connect(accounts.attacker)
                    .setOperator(accounts.user1.address)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);
        });
    });

    // =======================================================================
    // setExternalBusiness
    // =======================================================================
    describe("setExternalBusiness()", function () {
        it("admin can set the external business", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setExternalBusiness(accounts.externalBusiness.address)
            )
                .to.emit(proTokenSettings, EVENTS.ExternalBusinessSet)
                .withArgs(ZERO_ADDRESS, accounts.externalBusiness.address);

            expect(await proTokenSettings.getExternalBusiness()).to.equal(
                accounts.externalBusiness.address
            );
        });

        it("allows setting zero address (to disable)", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await proTokenSettings
                .connect(accounts.admin)
                .setExternalBusiness(accounts.externalBusiness.address);

            await expect(
                proTokenSettings.connect(accounts.admin).setExternalBusiness(ZERO_ADDRESS)
            )
                .to.emit(proTokenSettings, EVENTS.ExternalBusinessSet)
                .withArgs(accounts.externalBusiness.address, ZERO_ADDRESS);

            expect(await proTokenSettings.getExternalBusiness()).to.equal(ZERO_ADDRESS);
        });

        it("reverts when called by non-admin", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings
                    .connect(accounts.operator)
                    .setExternalBusiness(accounts.externalBusiness.address)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);
        });
    });

    // =======================================================================
    // setProToken
    // =======================================================================
    describe("setProToken()", function () {
        it("admin can set the ProToken address", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            const proTokenAddr = getRandomAddress();

            await expect(
                proTokenSettings.connect(accounts.admin).setProToken(proTokenAddr)
            )
                .to.emit(proTokenSettings, EVENTS.ProTokenSet)
                .withArgs(ZERO_ADDRESS, proTokenAddr);
        });

        it("emits with previous and new on subsequent sets", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            const first = getRandomAddress();
            const second = getRandomAddress();

            await proTokenSettings.connect(accounts.admin).setProToken(first);
            await expect(
                proTokenSettings.connect(accounts.admin).setProToken(second)
            )
                .to.emit(proTokenSettings, EVENTS.ProTokenSet)
                .withArgs(first, second);
        });

        it("reverts on zero address", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings.connect(accounts.admin).setProToken(ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.ZeroAddress);
        });

        it("reverts when called by non-admin", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings
                    .connect(accounts.operator)
                    .setProToken(getRandomAddress())
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);
        });
    });

    // =======================================================================
    // setProTokenOperations
    // =======================================================================
    describe("setProTokenOperations()", function () {
        it("admin can set the ProTokenOperations address", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            const ops = getRandomAddress();

            await expect(
                proTokenSettings.connect(accounts.admin).setProTokenOperations(ops)
            )
                .to.emit(proTokenSettings, EVENTS.ProTokenOperationsSet)
                .withArgs(ZERO_ADDRESS, ops);
        });

        it("reverts on zero address", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setProTokenOperations(ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.ZeroAddress);
        });

        it("reverts when called by non-admin", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings
                    .connect(accounts.operator)
                    .setProTokenOperations(getRandomAddress())
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);
        });
    });

    // =======================================================================
    // setProTokenUnmintHandler
    // =======================================================================
    describe("setProTokenUnmintHandler()", function () {
        it("admin can set the unmint handler", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            const handler = getRandomAddress();

            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setProTokenUnmintHandler(handler)
            )
                .to.emit(proTokenSettings, EVENTS.ProTokenUnmintHandlerSet)
                .withArgs(ZERO_ADDRESS, handler);
        });

        it("reverts on zero address", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setProTokenUnmintHandler(ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.ZeroAddress);
        });

        it("reverts when called by non-admin", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings
                    .connect(accounts.operator)
                    .setProTokenUnmintHandler(getRandomAddress())
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);
        });
    });

    // =======================================================================
    // setStrategyVault
    // =======================================================================
    describe("setStrategyVault()", function () {
        it("admin can set the strategy vault", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            const vault = getRandomAddress();

            await expect(
                proTokenSettings.connect(accounts.admin).setStrategyVault(vault)
            )
                .to.emit(proTokenSettings, EVENTS.StrategyVaultSet)
                .withArgs(ZERO_ADDRESS, vault);

            expect(await proTokenSettings.getStrategyVault()).to.equal(vault);
        });

        it("emits with previous and new on subsequent sets", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            const first = getRandomAddress();
            const second = getRandomAddress();

            await proTokenSettings.connect(accounts.admin).setStrategyVault(first);
            await expect(
                proTokenSettings.connect(accounts.admin).setStrategyVault(second)
            )
                .to.emit(proTokenSettings, EVENTS.StrategyVaultSet)
                .withArgs(first, second);
        });

        it("reverts on zero address", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings.connect(accounts.admin).setStrategyVault(ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.ZeroAddress);
        });

        it("reverts when called by non-admin", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings
                    .connect(accounts.operator)
                    .setStrategyVault(getRandomAddress())
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);
        });
    });

    // =======================================================================
    // setAuthority
    // =======================================================================
    describe("setAuthority()", function () {
        it("admin can authorize a new signer", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setAuthority(accounts.authority.address, true)
            )
                .to.emit(proTokenSettings, EVENTS.AuthoritySet)
                .withArgs(accounts.authority.address, false, true);

            expect(await proTokenSettings.isAuthority(accounts.authority.address)).to.equal(
                true
            );
        });

        it("admin can deauthorize a signer", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await proTokenSettings
                .connect(accounts.admin)
                .setAuthority(accounts.authority.address, true);

            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setAuthority(accounts.authority.address, false)
            )
                .to.emit(proTokenSettings, EVENTS.AuthoritySet)
                .withArgs(accounts.authority.address, true, false);

            expect(await proTokenSettings.isAuthority(accounts.authority.address)).to.equal(
                false
            );
        });

        it("reverts on zero address", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings.connect(accounts.admin).setAuthority(ZERO_ADDRESS, true)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.ZeroAddress);
        });

        it("reverts when called by non-admin", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings
                    .connect(accounts.operator)
                    .setAuthority(accounts.authority.address, true)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);
        });
    });

    // =======================================================================
    // setProTokenPriceSettings
    // =======================================================================
    describe("setProTokenPriceSettings()", function () {
        it("admin can set price settings", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            const oracle = getRandomAddress();

            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setProTokenPriceSettings({ oraclePriceSource: oracle })
            )
                .to.emit(proTokenSettings, EVENTS.ProTokenPriceSettingsSet)
                .withArgs(oracle);
        });

        it("allows oracle = zero address", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setProTokenPriceSettings({ oraclePriceSource: ZERO_ADDRESS })
            )
                .to.emit(proTokenSettings, EVENTS.ProTokenPriceSettingsSet)
                .withArgs(ZERO_ADDRESS);
        });

        it("reverts when called by non-admin", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings
                    .connect(accounts.operator)
                    .setProTokenPriceSettings({ oraclePriceSource: getRandomAddress() })
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);
        });
    });

    // =======================================================================
    // setYAsset
    // =======================================================================
    describe("setYAsset()", function () {
        it("admin can register a new yAsset", async function () {
            const { proTokenSettings, accounts, proTokenSettingsAddress } =
                await loadFixture(proTokenSettingsFixture);

            const yAsset = await deployMintableERC20("Test", "T", DECIMALS_18);
            const yAssetAddress = await yAsset.getAddress();
            const yOpsHandler = await deployYAssetOperationsHandler(
                proTokenSettingsAddress,
                yAssetAddress
            );

            const settings = createDefaultYAssetSettings(await yOpsHandler.getAddress());

            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setYAsset(yAssetAddress, settings)
            )
                .to.emit(proTokenSettings, EVENTS.YAssetSet)
                .withArgs(yAssetAddress);
        });

        it("registered yAsset is returned from getYAssets", async function () {
            const { proTokenSettings, accounts, proTokenSettingsAddress } =
                await loadFixture(proTokenSettingsFixture);

            const yAsset = await deployMintableERC20("Test", "T", DECIMALS_18);
            const yAssetAddress = await yAsset.getAddress();
            const yOpsHandler = await deployYAssetOperationsHandler(
                proTokenSettingsAddress,
                yAssetAddress
            );

            const settings = createDefaultYAssetSettings(await yOpsHandler.getAddress());
            await proTokenSettings
                .connect(accounts.admin)
                .setYAsset(yAssetAddress, settings);

            const response = await proTokenSettings.getYAssets([yAssetAddress]);
            expect(response.yAssets.length).to.equal(1);
            expect(response.yAssets[0].yAsset).to.equal(yAssetAddress);
            expect(response.yAssets[0].settings.isEnabled).to.equal(true);
            expect(response.yAssets[0].settings.decimals).to.equal(DECIMALS_18);
        });

        it("updating an existing yAsset replaces its settings", async function () {
            const { proTokenSettings, accounts, proTokenSettingsAddress } =
                await loadFixture(proTokenSettingsFixture);

            const yAsset = await deployMintableERC20("Test", "T", DECIMALS_18);
            const yAssetAddress = await yAsset.getAddress();
            const yOpsHandler = await deployYAssetOperationsHandler(
                proTokenSettingsAddress,
                yAssetAddress
            );
            const handlerAddr = await yOpsHandler.getAddress();

            const initial = createDefaultYAssetSettings(handlerAddr);
            await proTokenSettings
                .connect(accounts.admin)
                .setYAsset(yAssetAddress, initial);

            const updated: YAssetSettings = {
                ...initial,
                isPaused: true,
                unmintFeePer: ONE_PERCENT_WAD,
            };
            await proTokenSettings
                .connect(accounts.admin)
                .setYAsset(yAssetAddress, updated);

            const response = await proTokenSettings.getYAssets([yAssetAddress]);
            expect(response.yAssets[0].settings.isPaused).to.equal(true);
            expect(response.yAssets[0].settings.unmintFeePer).to.equal(ONE_PERCENT_WAD);
        });

        it("reverts when _yAsset is zero address", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            const settings = createDefaultYAssetSettings(getRandomAddress());
            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setYAsset(ZERO_ADDRESS, settings)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.ZeroAddress);
        });

        it("reverts when yOperationsHandler is zero address", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            const settings = createDefaultYAssetSettings(ZERO_ADDRESS);
            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setYAsset(getRandomAddress(), settings)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.ZeroAddress);
        });

        it("reverts when both staticPriceSource and oraclePriceSources are empty (ZeroSources)", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            const base = createDefaultYAssetSettings(getRandomAddress());
            const settings: YAssetSettings = {
                ...base,
                priceSettings: {
                    ...base.priceSettings,
                    staticPriceSource: 0n,
                    oraclePriceSources: [],
                },
            };

            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setYAsset(getRandomAddress(), settings)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.ZeroSources);
        });

        it("reverts when an oracle in oraclePriceSources is zero address", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            const base = createDefaultYAssetSettings(getRandomAddress());
            const settings: YAssetSettings = {
                ...base,
                priceSettings: {
                    ...base.priceSettings,
                    staticPriceSource: 0n,
                    oraclePriceSources: [ZERO_ADDRESS],
                },
            };
            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setYAsset(getRandomAddress(), settings)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.ZeroAddress);
        });

        it("reverts when called by operator (admin-only)", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            const settings = createDefaultYAssetSettings(getRandomAddress());
            await expect(
                proTokenSettings
                    .connect(accounts.operator)
                    .setYAsset(getRandomAddress(), settings)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);
        });

        it("reverts when called by random attacker", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            const settings = createDefaultYAssetSettings(getRandomAddress());
            await expect(
                proTokenSettings
                    .connect(accounts.attacker)
                    .setYAsset(getRandomAddress(), settings)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);
        });
    });

    // =======================================================================
    // setUnmintYAssets
    // =======================================================================
    describe("setUnmintYAssets()", function () {
        it("admin can set unmint yAssets", async function () {
            const { proTokenSettings, accounts, proTokenSettingsAddress } =
                await loadFixture(proTokenSettingsFixture);

            const yAsset = await deployMintableERC20("Test", "T", DECIMALS_18);
            const yAssetAddress = await yAsset.getAddress();
            const yOpsHandler = await deployYAssetOperationsHandler(
                proTokenSettingsAddress,
                yAssetAddress
            );
            await proTokenSettings
                .connect(accounts.admin)
                .setYAsset(yAssetAddress, createDefaultYAssetSettings(await yOpsHandler.getAddress()));

            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setUnmintYAssets([yAssetAddress])
            ).to.emit(proTokenSettings, EVENTS.UnmintYAssetsUpdated);

            const result = await proTokenSettings.getUnmintYAssets();
            expect(result.length).to.equal(1);
            expect(result[0]).to.equal(yAssetAddress);
        });

        it("replaces the existing unmint set on subsequent calls", async function () {
            const { proTokenSettings, accounts, proTokenSettingsAddress, yAssetAddress } =
                await loadFixture(fullProtocolFixture);

            const yAsset2 = await deployMintableERC20("Test2", "T2", DECIMALS_18);
            const yAsset2Addr = await yAsset2.getAddress();
            const handler2 = await deployYAssetOperationsHandler(
                proTokenSettingsAddress,
                yAsset2Addr
            );
            await proTokenSettings
                .connect(accounts.admin)
                .setYAsset(yAsset2Addr, createDefaultYAssetSettings(await handler2.getAddress()));

            await proTokenSettings
                .connect(accounts.admin)
                .setUnmintYAssets([yAsset2Addr]);

            const result = await proTokenSettings.getUnmintYAssets();
            expect(result.length).to.equal(1);
            expect(result[0]).to.equal(yAsset2Addr);
        });

        it("supports multiple yAssets in the unmint set", async function () {
            const { proTokenSettings, accounts, proTokenSettingsAddress, yAssetAddress } =
                await loadFixture(fullProtocolFixture);

            const yAsset2 = await deployMintableERC20("Test2", "T2", DECIMALS_18);
            const yAsset2Addr = await yAsset2.getAddress();
            const handler2 = await deployYAssetOperationsHandler(
                proTokenSettingsAddress,
                yAsset2Addr
            );
            await proTokenSettings
                .connect(accounts.admin)
                .setYAsset(yAsset2Addr, createDefaultYAssetSettings(await handler2.getAddress()));

            await proTokenSettings
                .connect(accounts.admin)
                .setUnmintYAssets([yAssetAddress, yAsset2Addr]);

            const result = await proTokenSettings.getUnmintYAssets();
            expect(result.length).to.equal(2);
        });

        it("reverts for an unregistered yAsset", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                fullProtocolFixture
            );
            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setUnmintYAssets([getRandomAddress()])
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.YAssetNotFound);
        });

        it("reverts when a yAsset is registered but not enabled", async function () {
            const { proTokenSettings, accounts, proTokenSettingsAddress } =
                await loadFixture(proTokenSettingsFixture);

            const yAsset = await deployMintableERC20("Test", "T", DECIMALS_18);
            const yAssetAddress = await yAsset.getAddress();
            const yOpsHandler = await deployYAssetOperationsHandler(
                proTokenSettingsAddress,
                yAssetAddress
            );
            const settings: YAssetSettings = {
                ...createDefaultYAssetSettings(await yOpsHandler.getAddress()),
                isEnabled: false,
            };
            await proTokenSettings
                .connect(accounts.admin)
                .setYAsset(yAssetAddress, settings);

            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setUnmintYAssets([yAssetAddress])
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotEnabled);
        });

        it("reverts when a yAsset is paused", async function () {
            const { proTokenSettings, accounts, proTokenSettingsAddress } =
                await loadFixture(proTokenSettingsFixture);

            const yAsset = await deployMintableERC20("Test", "T", DECIMALS_18);
            const yAssetAddress = await yAsset.getAddress();
            const yOpsHandler = await deployYAssetOperationsHandler(
                proTokenSettingsAddress,
                yAssetAddress
            );
            const settings: YAssetSettings = {
                ...createDefaultYAssetSettings(await yOpsHandler.getAddress()),
                isPaused: true,
            };
            await proTokenSettings
                .connect(accounts.admin)
                .setYAsset(yAssetAddress, settings);

            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setUnmintYAssets([yAssetAddress])
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.PausedInSettings);
        });

        it("reverts when called by non-admin", async function () {
            const { proTokenSettings, accounts, yAssetAddress } =
                await loadFixture(fullProtocolFixture);

            await expect(
                proTokenSettings
                    .connect(accounts.operator)
                    .setUnmintYAssets([yAssetAddress])
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);
        });
    });

    // =======================================================================
    // removeYAsset
    // =======================================================================
    describe("removeYAsset()", function () {
        it("admin can remove an unused yAsset with zero handler balance", async function () {
            const { proTokenSettings, accounts, proTokenSettingsAddress } =
                await loadFixture(proTokenSettingsFixture);

            const yAsset = await deployMintableERC20("Test", "T", DECIMALS_18);
            const yAssetAddress = await yAsset.getAddress();
            const yOpsHandler = await deployYAssetOperationsHandler(
                proTokenSettingsAddress,
                yAssetAddress
            );
            await proTokenSettings
                .connect(accounts.admin)
                .setYAsset(yAssetAddress, createDefaultYAssetSettings(await yOpsHandler.getAddress()));

            await expect(
                proTokenSettings.connect(accounts.admin).removeYAsset(yAssetAddress)
            )
                .to.emit(proTokenSettings, EVENTS.YAssetRemoved)
                .withArgs(yAssetAddress);

            await expect(
                proTokenSettings.getYAssets([yAssetAddress])
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NoYAssetsFound);
        });

        it("reverts when yAsset does not exist", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings.connect(accounts.admin).removeYAsset(getRandomAddress())
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.YAssetNotFound);
        });

        it("reverts when yAsset is in the unmintYAssets array", async function () {
            const { proTokenSettings, accounts, yAssetAddress } =
                await loadFixture(fullProtocolFixture);

            await expect(
                proTokenSettings.connect(accounts.admin).removeYAsset(yAssetAddress)
            ).to.be.revertedWithCustomError(
                proTokenSettings,
                ERRORS.YAssetInUseForUnmint
            );
        });

        it("reverts when yOperationsHandler has non-zero balance", async function () {
            const { proTokenSettings, accounts, proTokenSettingsAddress } =
                await loadFixture(proTokenSettingsFixture);

            const yAsset = await deployMintableERC20("Test", "T", DECIMALS_18);
            const yAssetAddress = await yAsset.getAddress();
            const yOpsHandler = await deployYAssetOperationsHandler(
                proTokenSettingsAddress,
                yAssetAddress
            );
            const handlerAddr = await yOpsHandler.getAddress();
            await proTokenSettings
                .connect(accounts.admin)
                .setYAsset(yAssetAddress, createDefaultYAssetSettings(handlerAddr));

            await yAsset.mint(handlerAddr, ethers.parseUnits("100", 18));

            await expect(
                proTokenSettings.connect(accounts.admin).removeYAsset(yAssetAddress)
            ).to.be.revertedWithCustomError(
                proTokenSettings,
                ERRORS.YOperationsHandlerInUseBalanceNotZero
            );
        });

        it("succeeds when yOperationsHandler is misconfigured (try-catch fallback)", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );

            const yAsset = await deployMintableERC20("Test", "T", DECIMALS_18);
            const yAssetAddress = await yAsset.getAddress();

            const fakeHandler = await deployMintableERC20("Fake", "F", DECIMALS_18);
            const settings = createDefaultYAssetSettings(await fakeHandler.getAddress());
            await proTokenSettings
                .connect(accounts.admin)
                .setYAsset(yAssetAddress, settings);

            await expect(
                proTokenSettings.connect(accounts.admin).removeYAsset(yAssetAddress)
            )
                .to.emit(proTokenSettings, EVENTS.YAssetRemoved)
                .withArgs(yAssetAddress);
        });

        it("allows re-registering a yAsset after removal", async function () {
            const { proTokenSettings, accounts, proTokenSettingsAddress } =
                await loadFixture(proTokenSettingsFixture);

            const yAsset = await deployMintableERC20("Test", "T", DECIMALS_18);
            const yAssetAddress = await yAsset.getAddress();
            const yOpsHandler = await deployYAssetOperationsHandler(
                proTokenSettingsAddress,
                yAssetAddress
            );
            const settings = createDefaultYAssetSettings(await yOpsHandler.getAddress());

            await proTokenSettings
                .connect(accounts.admin)
                .setYAsset(yAssetAddress, settings);

            await proTokenSettings.connect(accounts.admin).removeYAsset(yAssetAddress);

            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setYAsset(yAssetAddress, settings)
            )
                .to.emit(proTokenSettings, EVENTS.YAssetSet)
                .withArgs(yAssetAddress);

            const result = await proTokenSettings.getYAssets([yAssetAddress]);
            expect(result.yAssets[0].yAsset).to.equal(yAssetAddress);
        });

        it("reverts when called by non-admin", async function () {
            const { proTokenSettings, accounts, proTokenSettingsAddress } =
                await loadFixture(proTokenSettingsFixture);

            const yAsset = await deployMintableERC20("Test", "T", DECIMALS_18);
            const yAssetAddress = await yAsset.getAddress();
            const yOpsHandler = await deployYAssetOperationsHandler(
                proTokenSettingsAddress,
                yAssetAddress
            );
            await proTokenSettings
                .connect(accounts.admin)
                .setYAsset(yAssetAddress, createDefaultYAssetSettings(await yOpsHandler.getAddress()));

            await expect(
                proTokenSettings.connect(accounts.operator).removeYAsset(yAssetAddress)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);

            await expect(
                proTokenSettings.connect(accounts.attacker).removeYAsset(yAssetAddress)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);
        });
    });

    // =======================================================================
    // setOracleAggregationSettings
    // =======================================================================
    describe("setOracleAggregationSettings()", function () {
        it("admin can set the max price deviation", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            const dev = 500n;
            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setOracleAggregationSettings(dev)
            )
                .to.emit(proTokenSettings, EVENTS.OracleAggregationSettingsSet)
                .withArgs(dev);

            const result = await proTokenSettings.getOracleAggregationSettings();
            expect(result.maxPriceDeviation).to.equal(dev);
        });

        it("allows 0 deviation (strict matching)", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await proTokenSettings
                .connect(accounts.admin)
                .setOracleAggregationSettings(0n);

            const result = await proTokenSettings.getOracleAggregationSettings();
            expect(result.maxPriceDeviation).to.equal(0n);
        });

        it("allows the max value (MAX_PRICE_DEVIATION_BPS)", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await proTokenSettings
                .connect(accounts.admin)
                .setOracleAggregationSettings(MAX_PRICE_DEVIATION_BPS);

            const result = await proTokenSettings.getOracleAggregationSettings();
            expect(result.maxPriceDeviation).to.equal(MAX_PRICE_DEVIATION_BPS);
        });

        it("reverts when deviation exceeds max", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .setOracleAggregationSettings(MAX_PRICE_DEVIATION_BPS + 1n)
            ).to.be.revertedWithCustomError(
                proTokenSettings,
                ERRORS.GreaterThanAllowed
            );
        });

        it("reverts when called by non-admin", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings
                    .connect(accounts.operator)
                    .setOracleAggregationSettings(500n)
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);
        });
    });

    // =======================================================================
    // Pause functionality
    // =======================================================================
    describe("pause() / unpause()", function () {
        it("admin can pause", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );

            await expect(proTokenSettings.connect(accounts.admin).pause())
                .to.emit(proTokenSettings, EVENTS.Paused)
                .withArgs(accounts.admin.address);

            expect(await proTokenSettings.isPaused()).to.equal(true);
        });

        it("admin can unpause", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );

            await proTokenSettings.connect(accounts.admin).pause();
            await expect(proTokenSettings.connect(accounts.admin).unpause())
                .to.emit(proTokenSettings, EVENTS.Unpaused)
                .withArgs(accounts.admin.address);

            expect(await proTokenSettings.isPaused()).to.equal(false);
        });

        it("pause reverts when called by operator", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings.connect(accounts.operator).pause()
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);
        });

        it("pause reverts when called by random caller", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await expect(
                proTokenSettings.connect(accounts.attacker).pause()
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);
        });

        it("unpause reverts when called by operator", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await proTokenSettings.connect(accounts.admin).pause();

            await expect(
                proTokenSettings.connect(accounts.operator).unpause()
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);
        });

        it("pause reverts if already paused (OZ EnforcedPause)", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            await proTokenSettings.connect(accounts.admin).pause();

            await expect(
                proTokenSettings.connect(accounts.admin).pause()
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.EnforcedPause);
        });

        it("unpause reverts if not paused (OZ ExpectedPause)", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );

            await expect(
                proTokenSettings.connect(accounts.admin).unpause()
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.ExpectedPause);
        });
    });

    // =======================================================================
    // View functions
    // =======================================================================
    describe("View functions", function () {
        it("getAdmin returns the current admin", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            expect(await proTokenSettings.getAdmin()).to.equal(accounts.admin.address);
        });

        it("getOperator returns the current operator", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            expect(await proTokenSettings.getOperator()).to.equal(
                accounts.operator.address
            );
        });

        it("getExternalBusiness returns ZERO_ADDRESS by default", async function () {
            const { proTokenSettings } = await loadFixture(proTokenSettingsFixture);
            expect(await proTokenSettings.getExternalBusiness()).to.equal(
                ZERO_ADDRESS
            );
        });

        it("getStrategyVault returns ZERO_ADDRESS by default", async function () {
            const { proTokenSettings } = await loadFixture(proTokenSettingsFixture);
            expect(await proTokenSettings.getStrategyVault()).to.equal(ZERO_ADDRESS);
        });

        it("isAuthority returns false for an unregistered signer", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            expect(
                await proTokenSettings.isAuthority(accounts.authority.address)
            ).to.equal(false);
        });

        it("getYAssets([]) returns all registered yAssets", async function () {
            const { proTokenSettings } = await loadFixture(fullProtocolFixture);
            const response = await proTokenSettings.getYAssets([]);
            expect(response.yAssets.length).to.be.gte(1);
        });

        it("getYAssets([yAsset]) returns just that yAsset", async function () {
            const { proTokenSettings, yAssetAddress } = await loadFixture(
                fullProtocolFixture
            );
            const response = await proTokenSettings.getYAssets([yAssetAddress]);
            expect(response.yAssets.length).to.equal(1);
            expect(response.yAssets[0].yAsset).to.equal(yAssetAddress);
        });

        it("getYAssets filters out unregistered addresses", async function () {
            const { proTokenSettings, yAssetAddress } = await loadFixture(
                fullProtocolFixture
            );
            const random = getRandomAddress();
            const response = await proTokenSettings.getYAssets([yAssetAddress, random]);
            expect(response.yAssets.length).to.equal(1);
            expect(response.yAssets[0].yAsset).to.equal(yAssetAddress);
        });

        it("getYAssets reverts when all requested are unregistered", async function () {
            const { proTokenSettings } = await loadFixture(proTokenSettingsFixture);
            await expect(
                proTokenSettings.getYAssets([getRandomAddress()])
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NoYAssetsFound);
        });

        it("getProTokenInfo returns the configured addresses and price settings", async function () {
            const {
                proTokenSettings,
                proTokenAddress,
                proTokenOperationsAddress,
                proTokenUnmintHandlerAddress,
            } = await loadFixture(fullProtocolFixture);

            const info = await proTokenSettings.getProTokenInfo();
            expect(info.proToken).to.equal(proTokenAddress);
            expect(info.proTokenOperations).to.equal(proTokenOperationsAddress);
            expect(info.proTokenUnmintHandler).to.equal(proTokenUnmintHandlerAddress);
        });

        it("getUnmintYAssets reflects the configured set", async function () {
            const { proTokenSettings, yAssetAddress } = await loadFixture(
                fullProtocolFixture
            );
            const result = await proTokenSettings.getUnmintYAssets();
            expect(result.length).to.equal(1);
            expect(result[0]).to.equal(yAssetAddress);
        });

        it("getOracleAggregationSettings starts at zero", async function () {
            const { proTokenSettings } = await loadFixture(proTokenSettingsFixture);
            const result = await proTokenSettings.getOracleAggregationSettings();
            expect(result.maxPriceDeviation).to.equal(0n);
        });

        it("isPaused returns false by default and true after pause", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );
            expect(await proTokenSettings.isPaused()).to.equal(false);
            await proTokenSettings.connect(accounts.admin).pause();
            expect(await proTokenSettings.isPaused()).to.equal(true);
        });
    });

    // =======================================================================
    // _authorizeUpgrade (UUPS)
    // =======================================================================
    describe("_authorizeUpgrade (UUPS)", function () {
        it("admin can upgrade to higher VERSION", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );

            const V2 = await ethers.getContractFactory(
                "MockUpgradeTargetHigherVersion"
            );
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();

            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .upgradeToAndCall(await v2Impl.getAddress(), "0x")
            ).to.not.be.reverted;
        });

        it("emits Upgraded on successful upgrade", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );

            const V2 = await ethers.getContractFactory(
                "MockUpgradeTargetHigherVersion"
            );
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();

            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .upgradeToAndCall(await v2Impl.getAddress(), "0x")
            )
                .to.emit(proTokenSettings, EVENTS.Upgraded)
                .withArgs(await v2Impl.getAddress());
        });

        it("reverts VersionNotIncremented when new VERSION equals current", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );

            const Same = await ethers.getContractFactory(
                "MockUpgradeTargetSameVersion"
            );
            const sameImpl = await Same.deploy();
            await sameImpl.waitForDeployment();

            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .upgradeToAndCall(await sameImpl.getAddress(), "0x")
            )
                .to.be.revertedWithCustomError(
                    proTokenSettings,
                    ERRORS.VersionNotIncremented
                )
                .withArgs(VERSION_1_0_0, VERSION_1_0_0);
        });

        it("reverts VersionNotIncremented when new VERSION is lower", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );

            const Lower = await ethers.getContractFactory("MockUpgradeTargetLowerVersion");
            const lowerImpl = await Lower.deploy();
            await lowerImpl.waitForDeployment();

            await expect(
                proTokenSettings
                    .connect(accounts.admin)
                    .upgradeToAndCall(await lowerImpl.getAddress(), "0x")
            )
                .to.be.revertedWithCustomError(proTokenSettings, ERRORS.VersionNotIncremented)
                .withArgs(VERSION_1_0_0, 1n);
        });

        it("reverts NotAdmin when called by operator", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );

            const V2 = await ethers.getContractFactory(
                "MockUpgradeTargetHigherVersion"
            );
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();

            await expect(
                proTokenSettings
                    .connect(accounts.operator)
                    .upgradeToAndCall(await v2Impl.getAddress(), "0x")
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);
        });

        it("reverts NotAdmin when called by random attacker", async function () {
            const { proTokenSettings, accounts } = await loadFixture(
                proTokenSettingsFixture
            );

            const V2 = await ethers.getContractFactory(
                "MockUpgradeTargetHigherVersion"
            );
            const v2Impl = await V2.deploy();
            await v2Impl.waitForDeployment();

            await expect(
                proTokenSettings
                    .connect(accounts.attacker)
                    .upgradeToAndCall(await v2Impl.getAddress(), "0x")
            ).to.be.revertedWithCustomError(proTokenSettings, ERRORS.NotAdmin);
        });
    });
});