import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import {
    deployProTokenSettings,
    deployProToken,
    deployProTokenOperations,
    deployProTokenUnmintHandler,
    deployYAssetOperationsHandler,
    deployOracleAlgebraAdaptor,
    deployOracleRedStoneAdaptor,
    deployOracleRedStonePushAdaptor,
    deployAaveV3YieldHandler,
    deployMorphoYieldHandler,
    deployMintableERC20,
    deployMockAaveV3,
    deployMockAToken,
    getTestAccounts,
    createDefaultYAssetSettings,
    TestAccounts,
    YAssetSettings,
} from "./deploy";
import {
    ProToken,
    ProTokenSettings,
    ProTokenOperations,
    ProTokenUnmintHandler,
    YAssetOperationsHandler,
    OracleAlgebraAdaptor,
    OracleRedStoneAdaptor,
    OracleRedStonePushAdaptor,
    AaveV3YieldHandler,
    MorphoYieldHandler,
    MintableERC20,
    MockAaveV3,
    MockATokenV3,
} from "../../typechain-types";
import {
    DECIMALS_18,
    DECIMALS_6,
    ONE_USD,
    DEFAULT_UNMINT_BATCH_DURATION,
    HUNDRED_PERCENT, 
    HUNDRED_TOKENS, 
    THOUSAND_TOKENS
} from "./constants";

// ============================================
// Base Fixtures
// ============================================

/**
 * Basic fixture with just test accounts
 */
export async function accountsFixture() {
    const accounts = await getTestAccounts();
    return { accounts };
}

export interface ProTokenSettingsFixture {
    accounts: TestAccounts;
    proTokenSettings: ProTokenSettings;
    proTokenSettingsAddress: string;
}

/**
 * Fixture with ProTokenSettings deployed
 */
export async function proTokenSettingsFixture() {
    const accounts = await getTestAccounts();
    const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator, accounts.priceOperator);
    const proTokenSettingsAddress = await proTokenSettings.getAddress();

    return {
        accounts,
        proTokenSettings,
        proTokenSettingsAddress,
    };
}

// ============================================
// ProToken Fixtures
// ============================================

export interface ProTokenFixture {
    accounts: TestAccounts;
    proTokenSettings: ProTokenSettings;
    proTokenSettingsAddress: string;
    proToken: ProToken;
    proTokenAddress: string;
}

/**
 * Fixture with ProToken deployed (with a mock minter)
 */
export async function proTokenFixture(): Promise<ProTokenFixture> {
    const accounts = await getTestAccounts();
    const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator, accounts.priceOperator);
    const proTokenSettingsAddress = await proTokenSettings.getAddress();

    // Use minter account as the minter for testing
    const proToken = await deployProToken(
        "Promis Token",
        "proToken",
        proTokenSettingsAddress,
        accounts.minter.address
    );
    const proTokenAddress = await proToken.getAddress();

    // Configure settings
    await proTokenSettings.connect(accounts.admin).setProToken(proTokenAddress);

    return {
        accounts,
        proTokenSettings,
        proTokenSettingsAddress,
        proToken,
        proTokenAddress,
    };
}


export async function proTokenFundedFixture() {
    const ctx = await proTokenFixture();
    await ctx.proToken
        .connect(ctx.accounts.minter)
        .mint(ctx.accounts.user1.address, THOUSAND_TOKENS);
    return ctx;
}
// ============================================
// Full Protocol Fixtures
// ============================================

export interface FullProtocolFixture {
    accounts: TestAccounts;
    proTokenSettings: ProTokenSettings;
    proTokenSettingsAddress: string;
    proToken: ProToken;
    proTokenAddress: string;
    proTokenOperations: ProTokenOperations;
    proTokenOperationsAddress: string;
    proTokenUnmintHandler: ProTokenUnmintHandler;
    proTokenUnmintHandlerAddress: string;
    yAsset: MintableERC20;
    yAssetAddress: string;
    yAssetOperationsHandler: YAssetOperationsHandler;
    yAssetOperationsHandlerAddress: string;
}

/**
 * Full protocol fixture with all core contracts deployed and configured
 */
export async function fullProtocolFixture(): Promise<FullProtocolFixture> {
    const accounts = await getTestAccounts();

    // Deploy ProTokenSettings
    const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator, accounts.priceOperator);
    const proTokenSettingsAddress = await proTokenSettings.getAddress();

    // Deploy ProTokenOperations first (needed as minter)
    const proTokenOperations = await deployProTokenOperations(proTokenSettingsAddress);
    const proTokenOperationsAddress = await proTokenOperations.getAddress();

    // Deploy ProToken with operations as minter
    const proToken = await deployProToken(
        "Promis Token",
        "PRO",
        proTokenSettingsAddress,
        proTokenOperationsAddress
    );
    const proTokenAddress = await proToken.getAddress();

    // Deploy ProTokenUnmintHandler
    const proTokenUnmintHandler = await deployProTokenUnmintHandler(proTokenSettingsAddress);
    const proTokenUnmintHandlerAddress = await proTokenUnmintHandler.getAddress();

    // Deploy yAsset (mock ERC20)
    const yAsset = await deployMintableERC20("Yield Asset", "yASSET", DECIMALS_18);
    const yAssetAddress = await yAsset.getAddress();

    // Deploy YAssetOperationsHandler
    const yAssetOperationsHandler = await deployYAssetOperationsHandler(
        proTokenSettingsAddress,
        yAssetAddress
    );
    const yAssetOperationsHandlerAddress = await yAssetOperationsHandler.getAddress();

    // Configure ProTokenSettings
    await proTokenSettings.connect(accounts.admin).setProToken(proTokenAddress);
    await proTokenSettings.connect(accounts.admin).setProTokenOperations(proTokenOperationsAddress);
    await proTokenSettings.connect(accounts.admin).setProTokenUnmintHandler(proTokenUnmintHandlerAddress);
    await proTokenSettings.connect(accounts.admin).setStrategyVault(accounts.strategyVault.address);
    
    // Configure yAsset in settings
    const yAssetSettings = createDefaultYAssetSettings(yAssetOperationsHandlerAddress);
    await proTokenSettings.connect(accounts.admin).setYAsset(yAssetAddress, yAssetSettings);

    // Configure unmint yAssets
    await proTokenSettings.connect(accounts.admin).setUnmintYAssets([yAssetAddress]);

    // Authorize the backend signer
    await proTokenSettings
        .connect(accounts.admin)
        .setAuthority(accounts.authority.address, true);

    return {
        accounts,
        proTokenSettings,
        proTokenSettingsAddress,
        proToken,
        proTokenAddress,
        proTokenOperations,
        proTokenOperationsAddress,
        proTokenUnmintHandler,
        proTokenUnmintHandlerAddress,
        yAsset,
        yAssetAddress,
        yAssetOperationsHandler,
        yAssetOperationsHandlerAddress,
    };
}

// ============================================
// Oracle Fixtures
// ============================================

export interface OracleAlgebraFixture {
    accounts: TestAccounts;
    proTokenSettings: ProTokenSettings;
    proTokenSettingsAddress: string;
    oracleAlgebraAdaptor: OracleAlgebraAdaptor;
    oracleAlgebraAdaptorAddress: string;
}

export async function oracleAlgebraFixture(): Promise<OracleAlgebraFixture> {
    const accounts = await getTestAccounts();
    const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator, accounts.priceOperator);
    const proTokenSettingsAddress = await proTokenSettings.getAddress();

    const oracleAlgebraAdaptor = await deployOracleAlgebraAdaptor(proTokenSettingsAddress);
    const oracleAlgebraAdaptorAddress = await oracleAlgebraAdaptor.getAddress();

    return {
        accounts,
        proTokenSettings,
        proTokenSettingsAddress,
        oracleAlgebraAdaptor,
        oracleAlgebraAdaptorAddress,
    };
}

export interface OracleRedStoneFixture {
    accounts: TestAccounts;
    proTokenSettings: ProTokenSettings;
    proTokenSettingsAddress: string;
    oracleRedStoneAdaptor: OracleRedStoneAdaptor;
    oracleRedStoneAdaptorAddress: string;
}

export async function oracleRedStoneFixture(): Promise<OracleRedStoneFixture> {
    const accounts = await getTestAccounts();
    const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator, accounts.priceOperator);
    const proTokenSettingsAddress = await proTokenSettings.getAddress();

    const oracleRedStoneAdaptor = await deployOracleRedStoneAdaptor(proTokenSettingsAddress);
    const oracleRedStoneAdaptorAddress = await oracleRedStoneAdaptor.getAddress();

    return {
        accounts,
        proTokenSettings,
        proTokenSettingsAddress,
        oracleRedStoneAdaptor,
        oracleRedStoneAdaptorAddress,
    };
}

export interface OracleRedStonePushFixture {
    accounts: TestAccounts;
    proTokenSettings: ProTokenSettings;
    proTokenSettingsAddress: string;
    oracleRedStonePushAdaptor: OracleRedStonePushAdaptor;
    oracleRedStonePushAdaptorAddress: string;
}

export async function oracleRedStonePushFixture(): Promise<OracleRedStonePushFixture> {
    const accounts = await getTestAccounts();
    const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator, accounts.priceOperator);
    const proTokenSettingsAddress = await proTokenSettings.getAddress();

    const oracleRedStonePushAdaptor = await deployOracleRedStonePushAdaptor(proTokenSettingsAddress);
    const oracleRedStonePushAdaptorAddress = await oracleRedStonePushAdaptor.getAddress();

    return {
        accounts,
        proTokenSettings,
        proTokenSettingsAddress,
        oracleRedStonePushAdaptor,
        oracleRedStonePushAdaptorAddress,
    };
}

// ============================================
// Yield Handler Fixtures
// ============================================

export interface AaveV3YieldHandlerFixture {
    accounts: TestAccounts;
    proTokenSettings: ProTokenSettings;
    proTokenSettingsAddress: string;
    yAsset: MintableERC20;
    yAssetAddress: string;
    mockAavePool: MockAaveV3;
    mockAavePoolAddress: string;
    mockAToken: MockATokenV3;
    mockATokenAddress: string;
    yAssetOperationsHandler: YAssetOperationsHandler;
    yAssetOperationsHandlerAddress: string;
    aaveV3YieldHandler: AaveV3YieldHandler;
    aaveV3YieldHandlerAddress: string;
}

export async function aaveV3YieldHandlerFixture(): Promise<AaveV3YieldHandlerFixture> {
    const accounts = await getTestAccounts();
    const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator, accounts.priceOperator);
    const proTokenSettingsAddress = await proTokenSettings.getAddress();

    // Deploy yAsset
    const yAsset = await deployMintableERC20("Yield Asset", "yASSET", DECIMALS_18);
    const yAssetAddress = await yAsset.getAddress();

    // Deploy mock Aave pool and aToken
    const mockAavePool = await deployMockAaveV3();
    const mockAavePoolAddress = await mockAavePool.getAddress();

    const mockAToken = await deployMockAToken("Aave yASSET", "ayASSET", DECIMALS_18);
    const mockATokenAddress = await mockAToken.getAddress();

    // Configure mock Aave pool
    await mockAToken.setPool(mockAavePoolAddress);
    await mockAavePool.setAToken(yAssetAddress, mockATokenAddress);

    // Deploy YAssetOperationsHandler
    const yAssetOperationsHandler = await deployYAssetOperationsHandler(
        proTokenSettingsAddress,
        yAssetAddress
    );
    const yAssetOperationsHandlerAddress = await yAssetOperationsHandler.getAddress();

    // Deploy AaveV3YieldHandler
    const aaveV3YieldHandler = await deployAaveV3YieldHandler(
        proTokenSettingsAddress,
        yAssetOperationsHandlerAddress,
        mockAavePoolAddress,
        yAssetAddress,
        mockATokenAddress
    );
    const aaveV3YieldHandlerAddress = await aaveV3YieldHandler.getAddress();

    // Configure YAssetOperationsHandler with the yield handler
    await yAssetOperationsHandler.connect(accounts.admin).setYProtocolHandlers(
        [aaveV3YieldHandlerAddress],
        [HUNDRED_PERCENT]
    );

    return {
        accounts,
        proTokenSettings,
        proTokenSettingsAddress,
        yAsset,
        yAssetAddress,
        mockAavePool,
        mockAavePoolAddress,
        mockAToken,
        mockATokenAddress,
        yAssetOperationsHandler,
        yAssetOperationsHandlerAddress,
        aaveV3YieldHandler,
        aaveV3YieldHandlerAddress,
    };
}

// ============================================
// Multi-Asset Fixtures
// ============================================

export interface MultiAssetFixture extends FullProtocolFixture {
    yAsset2: MintableERC20;
    yAsset2Address: string;
    yAssetOperationsHandler2: YAssetOperationsHandler;
    yAssetOperationsHandler2Address: string;
    usdcAsset: MintableERC20;
    usdcAssetAddress: string;
    usdcOperationsHandler: YAssetOperationsHandler;
    usdcOperationsHandlerAddress: string;
}

/**
 * Fixture with multiple yAssets configured (18 decimals and 6 decimals)
 */
export async function multiAssetFixture(): Promise<MultiAssetFixture> {
    const base = await fullProtocolFixture();

    // Deploy second 18-decimal yAsset
    const yAsset2 = await deployMintableERC20("Yield Asset 2", "yASSET2", DECIMALS_18);
    const yAsset2Address = await yAsset2.getAddress();

    const yAssetOperationsHandler2 = await deployYAssetOperationsHandler(
        base.proTokenSettingsAddress,
        yAsset2Address
    );
    const yAssetOperationsHandler2Address = await yAssetOperationsHandler2.getAddress();

    // Deploy 6-decimal USDC-like asset
    const usdcAsset = await deployMintableERC20("USD Coin", "USDC", DECIMALS_6);
    const usdcAssetAddress = await usdcAsset.getAddress();

    const usdcOperationsHandler = await deployYAssetOperationsHandler(
        base.proTokenSettingsAddress,
        usdcAssetAddress
    );
    const usdcOperationsHandlerAddress = await usdcOperationsHandler.getAddress();

    // Configure yAsset2 in settings
    const yAsset2Settings = createDefaultYAssetSettings(yAssetOperationsHandler2Address);
    await base.proTokenSettings.connect(base.accounts.admin).setYAsset(yAsset2Address, yAsset2Settings);

    // Configure USDC in settings
    const usdcSettings: YAssetSettings = {
        yOperationsHandler: usdcOperationsHandlerAddress,
        decimals: DECIMALS_6,
        isEnabled: true,
        isPaused: false,
        unmintFeePer: 0n,
        priceSettings: {
            staticPriceSource: ONE_USD,
            usdCap: 0n,
            oraclePriceSources: [],
        },
    };
    await base.proTokenSettings.connect(base.accounts.admin).setYAsset(usdcAssetAddress, usdcSettings);

    // Update unmint yAssets to include all
    await base.proTokenSettings.connect(base.accounts.admin).setUnmintYAssets([
        base.yAssetAddress,
        yAsset2Address,
        usdcAssetAddress,
    ]);

    return {
        ...base,
        yAsset2,
        yAsset2Address,
        yAssetOperationsHandler2,
        yAssetOperationsHandler2Address,
        usdcAsset,
        usdcAssetAddress,
        usdcOperationsHandler,
        usdcOperationsHandlerAddress,
    };
}

// ============================================
// Fixture Loader Helpers
// ============================================

/**
 * Load the accounts fixture
 */
export function loadAccountsFixture() {
    return loadFixture(accountsFixture);
}

/**
 * Load the ProTokenSettings fixture
 */
export function loadProTokenSettingsFixture() {
    return loadFixture(proTokenSettingsFixture);
}

/**
 * Load the ProToken fixture
 */
export function loadProTokenFixture() {
    return loadFixture(proTokenFixture);
}

/**
 * Load the full protocol fixture
 */
export function loadFullProtocolFixture() {
    return loadFixture(fullProtocolFixture);
}

/**
 * Load the Oracle Algebra fixture
 */
export function loadOracleAlgebraFixture() {
    return loadFixture(oracleAlgebraFixture);
}

/**
 * Load the Oracle RedStone fixture
 */
export function loadOracleRedStoneFixture() {
    return loadFixture(oracleRedStoneFixture);
}

/**
 * Load the Oracle RedStone Push fixture
 */
export function loadOracleRedStonePushFixture() {
    return loadFixture(oracleRedStonePushFixture);
}

/**
 * Load the AaveV3 Yield Handler fixture
 */
export function loadAaveV3YieldHandlerFixture() {
    return loadFixture(aaveV3YieldHandlerFixture);
}

/**
 * Load the multi-asset fixture
 */
export function loadMultiAssetFixture() {
    return loadFixture(multiAssetFixture);
}
