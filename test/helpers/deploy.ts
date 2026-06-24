import { ethers, upgrades } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
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
import { DECIMALS_18, DEFAULT_UNMINT_BATCH_DURATION, ONE_USD } from "./constants";

// ============================================
// Type Definitions
// ============================================

export interface TestAccounts {
    admin: HardhatEthersSigner;
    operator: HardhatEthersSigner;
    minter: HardhatEthersSigner;
    user1: HardhatEthersSigner;
    user2: HardhatEthersSigner;
    externalBusiness: HardhatEthersSigner;
    authority: HardhatEthersSigner;
    attacker: HardhatEthersSigner;
    strategyVault: HardhatEthersSigner;
    strategist: HardhatEthersSigner;
    yieldRecipient: HardhatEthersSigner;
}

export interface YAssetSettings {
    yOperationsHandler: string;
    decimals: number;
    isEnabled: boolean;
    isPaused: boolean;
    unmintFeePer: bigint;
    priceSettings: {
        staticPriceSource: bigint;
        usdCap: bigint;
        oraclePriceSources: string[];
    };
}

// ============================================
// Account Helpers
// ============================================

export async function getTestAccounts(): Promise<TestAccounts> {
    const [admin, operator, minter, user1, user2, externalBusiness, authority, attacker, strategyVault, strategist, yieldRecipient] =
        await ethers.getSigners();
    return { admin, operator, minter, user1, user2, externalBusiness, authority, attacker, strategyVault, strategist, yieldRecipient };
}

// ============================================
// Token Deployment
// ============================================

export async function deployMintableERC20(
    name: string,
    symbol: string,
    decimals: number = DECIMALS_18
): Promise<MintableERC20> {
    const MintableERC20Factory = await ethers.getContractFactory("MintableERC20");
    const token = await MintableERC20Factory.deploy(name, symbol, decimals);
    await token.waitForDeployment();
    return token;
}

// ============================================
// Core Contract Deployment
// ============================================

export async function deployProTokenSettings(
    admin: HardhatEthersSigner,
    operator: HardhatEthersSigner
): Promise<ProTokenSettings> {
    const ProTokenSettingsFactory = await ethers.getContractFactory("ProTokenSettings");
    const proTokenSettings = (await upgrades.deployProxy(
        ProTokenSettingsFactory,
        [admin.address, operator.address],
        { kind: "uups" }
    )) as unknown as ProTokenSettings;
    await proTokenSettings.waitForDeployment();
    return proTokenSettings;
}

export async function deployProToken(
    name: string,
    symbol: string,
    proTokenSettings: string,
    minter: string
): Promise<ProToken> {
    const ProTokenFactory = await ethers.getContractFactory("ProToken");
    const proToken = (await upgrades.deployProxy(
        ProTokenFactory,
        [name, symbol, proTokenSettings, minter],
        { kind: "uups" }
    )) as unknown as ProToken;
    await proToken.waitForDeployment();
    return proToken;
}

export async function deployProTokenOperations(
    proTokenSettings: string
): Promise<ProTokenOperations> {
    const ProTokenOperationsFactory = await ethers.getContractFactory("ProTokenOperations");
    const proTokenOperations = (await upgrades.deployProxy(
        ProTokenOperationsFactory,
        [proTokenSettings],
        { kind: "uups" }
    )) as unknown as ProTokenOperations;
    await proTokenOperations.waitForDeployment();
    return proTokenOperations;
}

export async function deployProTokenUnmintHandler(
    proTokenSettings: string,
    unmintBatchDuration: number = DEFAULT_UNMINT_BATCH_DURATION
): Promise<ProTokenUnmintHandler> {
    const ProTokenUnmintHandlerFactory = await ethers.getContractFactory("ProTokenUnmintHandler");
    const proTokenUnmintHandler = (await upgrades.deployProxy(
        ProTokenUnmintHandlerFactory,
        [proTokenSettings, unmintBatchDuration],
        { kind: "uups" }
    )) as unknown as ProTokenUnmintHandler;
    await proTokenUnmintHandler.waitForDeployment();
    return proTokenUnmintHandler;
}

export async function deployYAssetOperationsHandler(
    proTokenSettings: string,
    yAsset: string
): Promise<YAssetOperationsHandler> {
    const YAssetOperationsHandlerFactory = await ethers.getContractFactory("YAssetOperationsHandler");
    const yAssetOperationsHandler = (await upgrades.deployProxy(
        YAssetOperationsHandlerFactory,
        [proTokenSettings, yAsset],
        { kind: "uups" }
    )) as unknown as YAssetOperationsHandler;
    await yAssetOperationsHandler.waitForDeployment();
    return yAssetOperationsHandler;
}

// ============================================
// Oracle Contract Deployment
// ============================================

export async function deployOracleAlgebraAdaptor(
    proTokenSettings: string
): Promise<OracleAlgebraAdaptor> {
    const OracleAlgebraAdaptorFactory = await ethers.getContractFactory("OracleAlgebraAdaptor");
    const oracleAlgebraAdaptor = (await upgrades.deployProxy(
        OracleAlgebraAdaptorFactory,
        [proTokenSettings],
        { kind: "uups" }
    )) as unknown as OracleAlgebraAdaptor;
    await oracleAlgebraAdaptor.waitForDeployment();
    return oracleAlgebraAdaptor;
}

export async function deployOracleRedStoneAdaptor(
    proTokenSettings: string
): Promise<OracleRedStoneAdaptor> {
    const OracleRedStoneAdaptorFactory = await ethers.getContractFactory("OracleRedStoneAdaptor");
    const oracleRedStoneAdaptor = (await upgrades.deployProxy(
        OracleRedStoneAdaptorFactory,
        [proTokenSettings],
        { kind: "uups" }
    )) as unknown as OracleRedStoneAdaptor;
    await oracleRedStoneAdaptor.waitForDeployment();
    return oracleRedStoneAdaptor;
}

export async function deployOracleRedStonePushAdaptor(
    proTokenSettings: string
): Promise<OracleRedStonePushAdaptor> {
    const OracleRedStonePushAdaptorFactory = await ethers.getContractFactory("OracleRedStonePushAdaptor");
    const oracleRedStonePushAdaptor = (await upgrades.deployProxy(
        OracleRedStonePushAdaptorFactory,
        [proTokenSettings],
        { kind: "uups" }
    )) as unknown as OracleRedStonePushAdaptor;
    await oracleRedStonePushAdaptor.waitForDeployment();
    return oracleRedStonePushAdaptor;
}

// ============================================
// Yield Handler Deployment
// ============================================

export async function deployAaveV3YieldHandler(
    proTokenSettings: string,
    operationsContract: string,
    aavePool: string,
    yieldAsset: string,
    aToken: string
): Promise<AaveV3YieldHandler> {
    const AaveV3YieldHandlerFactory = await ethers.getContractFactory("AaveV3YieldHandler");
    const aaveV3YieldHandler = (await upgrades.deployProxy(
        AaveV3YieldHandlerFactory,
        [proTokenSettings, operationsContract, aavePool, yieldAsset, aToken],
        { kind: "uups" }
    )) as unknown as AaveV3YieldHandler;
    await aaveV3YieldHandler.waitForDeployment();
    return aaveV3YieldHandler;
}

export async function deployMorphoYieldHandler(
    proTokenSettings: string,
    operationsContract: string,
    morphoCoreContract: string,
    morphoMarketParams: {
        loanToken: string;
        collateralToken: string;
        oracle: string;
        irm: string;
        lltv: bigint;
    }
): Promise<MorphoYieldHandler> {
    const MorphoYieldHandlerFactory = await ethers.getContractFactory("MorphoYieldHandler");
    const morphoYieldHandler = (await upgrades.deployProxy(
        MorphoYieldHandlerFactory,
        [proTokenSettings, operationsContract, morphoCoreContract, morphoMarketParams],
        { kind: "uups" }
    )) as unknown as MorphoYieldHandler;
    await morphoYieldHandler.waitForDeployment();
    return morphoYieldHandler;
}

// ============================================
// Mock Contract Deployment
// ============================================

export async function deployMockAaveV3(): Promise<MockAaveV3> {
    const MockAaveV3Factory = await ethers.getContractFactory("MockAaveV3");
    const mockAaveV3 = await MockAaveV3Factory.deploy();
    await mockAaveV3.waitForDeployment();
    return mockAaveV3;
}

export async function deployMockAToken(
    name: string,
    symbol: string,
    decimals: number = DECIMALS_18
): Promise<MockATokenV3> {
    const MockATokenV3Factory = await ethers.getContractFactory("MockATokenV3");
    const mockAToken = await MockATokenV3Factory.deploy(name, symbol, decimals);
    await mockAToken.waitForDeployment();
    return mockAToken;
}

// ============================================
// Full Protocol Deployment
// ============================================

export interface FullProtocolDeployment {
    accounts: TestAccounts;
    proTokenSettings: ProTokenSettings;
    proToken: ProToken;
    proTokenOperations: ProTokenOperations;
    proTokenUnmintHandler: ProTokenUnmintHandler;
    yAsset: MintableERC20;
    yAssetOperationsHandler: YAssetOperationsHandler;
}

export async function deployFullProtocol(): Promise<FullProtocolDeployment> {
    const accounts = await getTestAccounts();

    // Deploy ProTokenSettings
    const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator);
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

    // Configure yAsset in settings
    const yAssetSettings: YAssetSettings = {
        yOperationsHandler: yAssetOperationsHandlerAddress,
        decimals: DECIMALS_18,
        isEnabled: true,
        isPaused: false,
        unmintFeePer: 0n,
        priceSettings: {
            staticPriceSource: ONE_USD,
            usdCap: 0n,
            oraclePriceSources: [],
        },
    };

    await proTokenSettings.connect(accounts.admin).setYAsset(yAssetAddress, yAssetSettings);

    return {
        accounts,
        proTokenSettings,
        proToken,
        proTokenOperations,
        proTokenUnmintHandler,
        yAsset,
        yAssetOperationsHandler,
    };
}

// ============================================
// Helper Functions
// ============================================

export function createDefaultYAssetSettings(
    yOperationsHandler: string,
    decimals: number = DECIMALS_18,
    staticPrice: bigint = ONE_USD
): YAssetSettings {
    return {
        yOperationsHandler,
        decimals,
        isEnabled: true,
        isPaused: false,
        unmintFeePer: 0n,
        priceSettings: {
            staticPriceSource: staticPrice,
            usdCap: 0n,
            oraclePriceSources: [],
        },
    };
}

export function createLstYAssetSettings(
    yOperationsHandler: string,
    lstUnderlyingAsset: string,
    lstRatio: bigint,
    decimals: number = DECIMALS_18,
    staticPrice: bigint = ONE_USD
): YAssetSettings {
    return {
        isEnabled: true,
        isPaused: false,
        decimals,
        priceSettings: {
            staticPriceSource: staticPrice,
            oraclePriceSources: [],
            lstUnderlyingAsset,
            lstUnderlyingAssetRatio: lstRatio,
            lstUnderlyingAssetStaticPriceSource: ONE_USD,
            lstUnderlyingAssetOraclePriceSources: [],
            usdCap: 0n,
        },
        unmintFeePer: 0n,
        yOperationsHandler,
    };
}
