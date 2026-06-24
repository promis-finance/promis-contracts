import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
    MintableERC20,
    MockAaveV3,
    MockATokenV3,
    MockOracle,
    MockRedStonePushOracle,
    MockChainlinkPushOracle,
    MockYieldProtocolHandler,
    MockMorpho,
    MockAlgebraPool,
} from "../../typechain-types";
import { DECIMALS_18, ONE_USD } from "./constants";

// ============================================
// Mock Oracle Deployment
// ============================================

export async function deployMockOracle(
    initialPrice: bigint = ONE_USD
): Promise<MockOracle> {
    const MockOracleFactory = await ethers.getContractFactory("MockOracle");
    const mockOracle = await MockOracleFactory.deploy(initialPrice);
    await mockOracle.waitForDeployment();
    return mockOracle;
}

export async function deployMockRedStonePushOracle(
    initialPrice: bigint = ONE_USD
): Promise<MockRedStonePushOracle> {
    const MockRedStonePushOracleFactory = await ethers.getContractFactory("MockRedStonePushOracle");
    const mockOracle = await MockRedStonePushOracleFactory.deploy(initialPrice);
    await mockOracle.waitForDeployment();
    return mockOracle;
}

export async function deployMockChainlinkPushOracle(
    initialPrice: bigint = ONE_USD
): Promise<MockChainlinkPushOracle> {
    const MockChainlinkPushOracleFactory = await ethers.getContractFactory("MockChainlinkPushOracle");
    const mockOracle = await MockChainlinkPushOracleFactory.deploy(initialPrice);
    await mockOracle.waitForDeployment();
    return mockOracle;
}

export async function deployMockAlgebraPool(): Promise<MockAlgebraPool> {
    const MockAlgebraPoolFactory = await ethers.getContractFactory("MockAlgebraPool");
    const mockPool = await MockAlgebraPoolFactory.deploy();
    await mockPool.waitForDeployment();
    return mockPool;
}

// ============================================
// Mock Yield Protocol Deployment
// ============================================

export async function deployMockYieldProtocolHandler(
    yieldAsset: string
): Promise<MockYieldProtocolHandler> {
    const MockYieldProtocolHandlerFactory = await ethers.getContractFactory("MockYieldProtocolHandler");
    const mockHandler = await MockYieldProtocolHandlerFactory.deploy(yieldAsset);
    await mockHandler.waitForDeployment();
    return mockHandler;
}

export async function deployMockMorpho(): Promise<MockMorpho> {
    const MockMorphoFactory = await ethers.getContractFactory("MockMorpho");
    const mockMorpho = await MockMorphoFactory.deploy();
    await mockMorpho.waitForDeployment();
    return mockMorpho;
}

// ============================================
// Token Minting Helpers
// ============================================

/**
 * Mint tokens to an address
 */
export async function mintTokens(
    token: MintableERC20,
    to: string,
    amount: bigint
): Promise<void> {
    await token.mint(to, amount);
}

/**
 * Mint tokens and approve spender
 */
export async function mintAndApprove(
    token: MintableERC20,
    to: HardhatEthersSigner,
    spender: string,
    amount: bigint
): Promise<void> {
    await token.mint(to.address, amount);
    await token.connect(to).approve(spender, amount);
}

/**
 * Mint tokens to multiple addresses
 */
export async function mintTokensToMultiple(
    token: MintableERC20,
    recipients: string[],
    amounts: bigint[]
): Promise<void> {
    for (let i = 0; i < recipients.length; i++) {
        await token.mint(recipients[i], amounts[i]);
    }
}

// ============================================
// Mock Aave Helpers
// ============================================

/**
 * Setup mock Aave pool with aToken
 */
export async function setupMockAave(
    yieldAsset: string,
    decimals: number = DECIMALS_18
): Promise<{
    mockAavePool: MockAaveV3;
    mockAToken: MockATokenV3;
}> {
    const MockAaveV3Factory = await ethers.getContractFactory("MockAaveV3");
    const mockAavePool = await MockAaveV3Factory.deploy();
    await mockAavePool.waitForDeployment();

    const MockATokenV3Factory = await ethers.getContractFactory("MockATokenV3");
    const mockAToken = await MockATokenV3Factory.deploy("Aave Token", "aToken", decimals);
    await mockAToken.waitForDeployment();

    const mockAavePoolAddress = await mockAavePool.getAddress();
    await mockAToken.setPool(mockAavePoolAddress);
    await mockAavePool.setAToken(yieldAsset, await mockAToken.getAddress());

    return { mockAavePool, mockAToken };
}

/**
 * Fund mock Aave pool for yield payments
 */
export async function fundMockAavePool(
    mockAavePool: MockAaveV3,
    token: MintableERC20,
    funder: HardhatEthersSigner,
    amount: bigint
): Promise<void> {
    await token.mint(funder.address, amount);
    await token.connect(funder).approve(await mockAavePool.getAddress(), amount);
    await mockAavePool.connect(funder).fundPoolForYield(await token.getAddress(), amount);
}

// ============================================
// Mock Oracle Price Helpers
// ============================================

/**
 * Set price on mock oracle
 */
export async function setMockOraclePrice(
    oracle: MockOracle,
    asset: string,
    price: bigint
): Promise<void> {
    await oracle.setPrice(asset, price);
}

/**
 * Set price on mock RedStone push oracle
 */
export async function setMockRedStonePushPrice(
    oracle: MockRedStonePushOracle,
    dataFeedId: string,
    price: bigint,
    timestamp?: number
): Promise<void> {
    const ts = timestamp ?? Math.floor(Date.now());
    await oracle.setPrice(dataFeedId, price, ts);
}

/**
 * Set stale price on mock oracle (for testing staleness)
 */
export async function setMockOracleStalePrice(
    oracle: MockRedStonePushOracle,
    dataFeedId: string,
    price: bigint,
    secondsAgo: number
): Promise<void> {
    const staleTimestamp = Math.floor(Date.now()) - (secondsAgo * 1000);
    await oracle.setPrice(dataFeedId, price, staleTimestamp);
}

// ============================================
// Mock Algebra Pool Helpers
// ============================================

/**
 * Configure mock Algebra pool TWAP
 */
export async function configureMockAlgebraPool(
    pool: MockAlgebraPool,
    tick: number,
    secondsAgo: number = 900
): Promise<void> {
    await pool.setTickCumulative(tick, secondsAgo);
}

// ============================================
// Mock Morpho Helpers
// ============================================

/**
 * Configure mock Morpho market
 */
export async function configureMockMorpho(
    morpho: MockMorpho,
    loanToken: string,
    collateralToken: string,
    oracle: string,
    irm: string,
    lltv: bigint
): Promise<void> {
    await morpho.setMarketParams({
        loanToken,
        collateralToken,
        oracle,
        irm,
        lltv,
    });
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get a random address for testing
 */
export function getRandomAddress(): string {
    return ethers.Wallet.createRandom().address;
}

/**
 * Get multiple random addresses
 */
export function getRandomAddresses(count: number): string[] {
    return Array.from({ length: count }, () => getRandomAddress());
}

/**
 * Create a bytes32 from a string
 */
export function stringToBytes32(str: string): string {
    return ethers.encodeBytes32String(str);
}

/**
 * Create empty bytes
 */
export function emptyBytes(): string {
    return "0x";
}

/**
 * Encode oracle query payload
 */
export function encodeOracleQuery(oracleAddress: string, payload: string = "0x"): {
    oracleAddress: string;
    payload: string;
} {
    return { oracleAddress, payload };
}
