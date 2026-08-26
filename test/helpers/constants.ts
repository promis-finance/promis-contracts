import { ethers } from "hardhat";
import { takeSnapshot } from "./time";

// ============================================
// Address Constants
// ============================================
export const ZERO_ADDRESS = ethers.ZeroAddress;
export const ZERO_HASH = ethers.ZeroHash;

// ============================================
// Amount Constants
// ============================================
export const ZERO = 0n;
export const ONE = 1n;
export const WAD = ethers.parseEther("1"); // 1e18
export const RAY = 10n ** 27n; // 1e27 (used in Aave)

// Common test amounts
export const ONE_TOKEN = ethers.parseEther("1");
export const TEN_TOKENS = ethers.parseEther("10");
export const HUNDRED_TOKENS = ethers.parseEther("100");
export const THOUSAND_TOKENS = ethers.parseEther("1000");
export const MILLION_TOKENS = ethers.parseEther("1000000");

// USDC-like amounts (6 decimals)
export const ONE_USDC = 1_000_000n; // 1e6
export const HUNDRED_USDC = 100_000_000n; // 1e8
export const THOUSAND_USDC = 1_000_000_000n; // 1e9
export const MILLION_USDC = 1_000_000_000_000n; // 1e12

// ============================================
// Price Constants (18 decimals)
// ============================================
export const ONE_USD = ethers.parseEther("1"); // $1.00
export const MIN_USD_PRICE = ethers.parseEther("1"); // Minimum price for ProToken
export const DEFAULT_USD_PRICE = ethers.parseEther("1"); // Default price

// ============================================
// Time Constants (in seconds)
// ============================================
export const ONE_MINUTE = 60;
export const FIVE_MINUTES = 5 * 60;
export const FIFTEEN_MINUTES = 15 * 60;
export const ONE_HOUR = 60 * 60;
export const TWO_HOURS = 2 * 60 * 60;
export const ONE_DAY = 24 * 60 * 60;
export const ONE_WEEK = 7 * 24 * 60 * 60;
export const ONE_YEAR = 365 * 24 * 60 * 60;

// ============================================
// Percentage Constants (basis points)
// ============================================
export const PERCENTAGE_PRECISION = 10000n; // 100% = 10000
export const ONE_PERCENT = 100n;
export const FIVE_PERCENT = 500n;
export const TEN_PERCENT = 1000n;
export const FIFTY_PERCENT = 5000n;
export const HUNDRED_PERCENT = 10000n;

// Fee percentages (WAD precision - 1e18)
export const ONE_PERCENT_WAD = ethers.parseEther("0.01"); // 1%
export const HALF_PERCENT_WAD = ethers.parseEther("0.005"); // 0.5%

// ============================================
// Protocol Constants
// ============================================
export const MAX_BATCH_SIZE = 10;
export const DEFAULT_UNMINT_BATCH_DURATION = ONE_DAY;
export const ALLOCATION_PRECISION = 10000n;
export const ALLOCATION_PRECISION_BPS = 10000n;
export const FIFTY_PERCENT_BPS        = 5000n;
export const TEN_PERCENT_BPS          = 1000n;

// ============================================
// Oracle Constants
// ============================================
export const DEFAULT_TWAP_PERIOD = 900; // 15 minutes
export const DEFAULT_TWAP_PERIOD_MIDDLE = 7200; // 2 hours
export const DEFAULT_TWAP_PERIOD_LONGEST = 86400; // 24 hours
export const DEFAULT_STALENESS_THRESHOLD = 180; // 3 minutes
export const DEFAULT_PUSH_STALENESS_THRESHOLD = 300; // 5 minutes
export const MAX_PRICE_DEVIATION_BPS = 10000n;

// ============================================
// Version Constants
// ============================================
export const VERSION_1_0_0 = 1_00_00n;
export const VERSION_1_0_1 = 1_00_01n;
export const VERSION_1_0_2 = 1_00_02n;
export const VERSION_2_0_0 = 2_00_00n;

// ============================================
// Token Decimals
// ============================================
export const DECIMALS_18 = 18;
export const DECIMALS_8 = 8;
export const DECIMALS_6 = 6;

// ============================================
// ProToken metadata used in fixtures
// ============================================
export const PROTOKEN_NAME = "Promis Token";
export const PROTOKEN_SYMBOL = "proToken";

// ============================================
// Test Account Roles
// ============================================
export const ROLE_ADMIN = "admin";
export const ROLE_OPERATOR = "operator";
export const ROLE_MINTER = "minter";
export const ROLE_USER = "user";
export const ROLE_EXTERNAL_BUSINESS = "externalBusiness";

// ============================================
// Error Messages / Custom Errors
// ============================================
export const ERRORS = {
    // Common
    InvalidAddr: "InvalidAddr",
    InvalidInput: "InvalidInput",
    Unauthorized: "Unauthorized",
    Paused: "Paused",
    InvalidInitialization: "InvalidInitialization",


// ---- ProTokenSettings ----
    NotPendingAdmin: "NotPendingAdmin",
    LengthMismatch: "LengthMismatch",
    ZeroRatio: "ZeroRatio",
    ZeroSources: "ZeroSources",
    NotEnabled: "NotEnabled",
    PausedInSettings: "PausedInSettings",
    GreaterThanAllowed: "GreaterThanAllowed",
    BalanceUnverifiable: "BalanceUnverifiable",
    
    // ---- Pausable (OZ v5) ----
    EnforcedPause: "EnforcedPause",
    ExpectedPause: "ExpectedPause",

    // ProToken
    ZeroAddress: "ZeroAddress",
    SameAddress: "SameAddress",
    NotAdmin: "NotAdmin",
    NotAdminOrOperator: "NotAdminOrOperator",
    NotMinter: "NotMinter",
    InvalidPrice: "InvalidPrice",
    InvalidAmount: "InvalidAmount",
    USDPriceDisabled: "USDPriceDisabled",
    PriceNotConfigured: "PriceNotConfigured",
    NotPriceOperator: "NotPriceOperator",
    PriceNotIncreasing: "PriceNotIncreasing",
    PriceStepSizeExceeded: "PriceStepSizeExceeded",
    PriceUpdateCooldownActive: "PriceUpdateCooldownActive",

    // ERC20 (OZ v5)
    ERC20InvalidReceiver: "ERC20InvalidReceiver",
    ERC20InvalidSender: "ERC20InvalidSender",
    ERC20InsufficientBalance: "ERC20InsufficientBalance",
    ERC20InsufficientAllowance: "ERC20InsufficientAllowance",

    // ERC20Permit (OZ v5)
    ERC2612ExpiredSignature: "ERC2612ExpiredSignature",
    ERC2612InvalidSigner: "ERC2612InvalidSigner",

    // ProTokenSettings
    YAssetNotFound: "YAssetNotFound",
    YAssetInUseForUnmint: "YAssetInUseForUnmint",
    NoYAssetsFound: "NoYAssetsFound",
    YOperationsHandlerInUseBalanceNotZero: "YOperationsHandlerInUseBalanceNotZero",

    // ProTokenOperations
    YAssetNotEnabled: "YAssetNotEnabled",
    YAssetPaused: "YAssetPaused",
    InsufficientAmountOut: "InsufficientAmountOut",
    InsufficientUnmintAmount: "InsufficientUnmintAmount",
    InvalidUnmintAsset: "InvalidUnmintAsset",
    InvalidOraclePrice: "InvalidOraclePrice",
    MissingOraclePayload: "MissingOraclePayload",
    OraclePriceDeviation: "OraclePriceDeviation",
    YAssetPriceExceedsThreshold: "YAssetPriceExceedsThreshold",
    ZeroAmount: "ZeroAmount",
    InvalidAuthority: "InvalidAuthority",
    RequestNotPending: "RequestNotPending",
    InvalidProofKind: "InvalidProofKind",
    MinDepositBaseSet: "MinDepositBaseSet",
    MinWithdrawBaseSet: "MinWithdrawBaseSet",
    InvalidMinBases: "InvalidMinBases",
    BelowMinDeposit: "BelowMinDeposit",
    BelowMinWithdraw: "BelowMinWithdraw",
    NotStrategyVault: "NotStrategyVault",
    ZeroUsdCap: "ZeroUsdCap",
    ProofExpired: "ProofExpired",

    // ProTokenUnmintHandler
    InvalidDuration: "InvalidDuration",
    BatchStillProcessing: "BatchStillProcessing",
    BatchAlreadyProcessed: "BatchAlreadyProcessed",
    AlreadyClaimed: "AlreadyClaimed",
    WithdrawFailed: "WithdrawFailed",
    NotOperations: "NotOperations",

    // YAssetOperationsHandler
    ArrayLengthMismatch: "ArrayLengthMismatch",
    InvalidAllocation: "InvalidAllocation",
    ProtocolHandlerNotFound: "ProtocolHandlerNotFound",
    NoHandlers: "NoHandlers",

    // Oracle Adaptors
    InvalidInputs: "InvalidInputs",
    RouteNotConfigured: "RouteNotConfigured",
    StaleOracleData: "StaleOracleData",
    FutureOracleTimestamp: "FutureOracleTimestamp",
    AssetOracleMappingNotFound: "AssetOracleMappingNotFound",
    OracleIdTooLong: "OracleIdTooLong",
    DataFeedIdTooLong: "DataFeedIdTooLong",
    UnauthorizedSigner: "UnauthorizedSigner",
    SignerAlreadyAdded: "SignerAlreadyAdded",
    SignerNotFound: "SignerNotFound",
    InsufficientSignatures: "InsufficientSignatures",
    DuplicateSignature: "DuplicateSignature",
    InsufficientSigners: "InsufficientSigners",
    MinimumSignersRequired: "MinimumSignersRequired",

    // Yield Handlers
    InsufficientBalance: "InsufficientBalance",

    // Versioning
    VersionNotIncremented: "VersionNotIncremented",
} as const;

// ============================================
// Event Names
// ============================================
export const EVENTS = {
    // ProToken
    MinterSet: "MinterSet",
    Minted: "Minted",
    Burned: "Burned",
    USDPriceSet: "USDPriceSet",
    USDPriceUpdated: "USDPriceUpdated",
    StepSizeChanged: "StepSizeChanged",
    PriceOperatorSet: "PriceOperatorSet",
    PriceUpdateCooldownChanged: "PriceUpdateCooldownChanged",

    // OZ ERC20
    Transfer:      "Transfer",
    Approval:      "Approval",

    // UUPS
    Upgraded:      "Upgraded",

    // ProTokenSettings
    AdminProposed: "AdminProposed",
    AdminAccepted: "AdminAccepted",
    OperatorSet: "OperatorSet",
    ExternalBusinessSet: "ExternalBusinessSet",
    ProTokenSet: "ProTokenSet",
    ProTokenPriceSettingsSet: "ProTokenPriceSettingsSet",
    ProTokenOperationsSet: "ProTokenOperationsSet",
    ProTokenUnmintHandlerSet: "ProTokenUnmintHandlerSet",
    YAssetSet: "YAssetSet",
    YAssetRemoved: "YAssetRemoved",
    YAssetLstRatioSet: "YAssetLstRatioSet",
    UnmintYAssetsUpdated: "UnmintYAssetsUpdated",
    OracleAggregationSettingsSet: "OracleAggregationSettingsSet",
    StrategyVaultSet: "StrategyVaultSet",
    YAssetRemovedUnverified: "YAssetRemovedUnverified",
    
    // ---- Pausable (OZ v5) ----
    Paused:                       "Paused",
    Unpaused:                     "Unpaused",

    // ProTokenOperations
    ProTokenMint: "ProTokenMint",
    ProTokenUnmintInstant: "ProTokenUnmintInstant",
    ProTokenUnmintQueued: "ProTokenUnmintQueued",
    LSTRatioApplied: "LSTRatioApplied",
    PriceDeviationThresholdSet: "PriceDeviationThresholdSet",
    MintRequestCreated: "MintRequestCreated",
    MintRequestFinalized: "MintRequestFinalized",
    UnmintRequestFinalized: "UnmintRequestFinalized",
    AuthoritySet: "AuthoritySet",
    MinDepositBaseSet: "MinDepositBaseSet",
    MinWithdrawBaseSet: "MinWithdrawBaseSet",
    StrategicMint: "StrategicMint",
    StrategicUnmintInstant: "StrategicUnmintInstant",
    StrategicUnmintQueued: "StrategicUnmintQueued",

    // ProTokenUnmintHandler
    UnmintRequestCreated: "UnmintRequestCreated",
    UnmintRequestAggregated: "UnmintRequestAggregated",
    UnmintRequestClaimed: "UnmintRequestClaimed",
    UnmintBatchProcessed: "UnmintBatchProcessed",
    UnmintBatchDurationUpdated: "UnmintBatchDurationUpdated",
    EmergencyWithdraw: "EmergencyWithdraw",

    // YAssetOperationsHandler
    YAssetsAllocated: "YAssetsAllocated",
    YAssetsDistributed: "YAssetsDistributed",
    YAssetsWithdrawn: "YAssetsWithdrawn",
    YProtocolHandlersSet: "YProtocolHandlersSet",
    YProtocolHandlerRemoved: "YProtocolHandlerRemoved",
    YAssetsPaidOut: "YAssetsPaidOut",

    // Oracle Adaptors
    RouteConfigured: "RouteConfigured",
    TwapPeriodsUpdated: "TwapPeriodsUpdated",
    AssetToOracleIdMappingUpdated: "AssetToOracleIdMappingUpdated",
    StalenessThresholdUpdated: "StalenessThresholdUpdated",
    AssetToPushOracleMappingUpdated: "AssetToPushOracleMappingUpdated",
    SignerAdded: "SignerAdded",
    SignerRemoved: "SignerRemoved",

    // Yield Handlers
    YieldAssetDeposited: "YieldAssetDeposited",
    YieldAssetWithdrawn: "YieldAssetWithdrawn",
    IncentivesControllerUpdated: "IncentivesControllerUpdated",
    ATokenUpdated: "ATokenUpdated",
    OperationsContractUpdated: "OperationsContractUpdated",
    MorphoMarketParamsUpdated: "MorphoMarketParamsUpdated",
    SetMorphoCoreContract: "SetMorphoCoreContract",

    // StrategyVault
    Borrowed: "Borrowed",
    Repaid: "Repaid",
    Taken: "Taken",
    Given: "Given",
    GrowthWithdrawn: "GrowthWithdrawn",
    YieldClaimed: "YieldClaimed",
    YieldRecipientSet: "YieldRecipientSet",
} as const;
