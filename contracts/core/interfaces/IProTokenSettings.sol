// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;
pragma abicoder v2;

import "../types/ProTokenSettingsTypes.sol";
import "../types/ProTokenOperationsTypes.sol";

/**
 * @title IProTokenSettings
 * @notice Interface for the ProTokenSettings contract that manages configuration parameters
 *         for the Promis DeFi protocol's token system
 * @dev This contract serves as the central configuration hub for all tunable protocol parameters
 *      including y asset settings, price configurations, and system component addresses.
 */
interface IProTokenSettings {

    // ================================================
    // =========== Owner External Functions ===========
    // ================================================

    /**
     * @notice Initiates a two-step admin transfer process by proposing a new admin
     * @dev Part of a secure admin transfer mechanism that prevents accidental loss of admin privileges.
     *      The proposed admin must call acceptAdmin() to complete the transfer.
     * @param _newAdmin Address of the proposed new admin
     */
    function proposeAdmin(address _newAdmin) external;

    /**
     * @notice Completes the admin transfer process by accepting the admin role
     * @dev Second step of the two-step admin transfer. Can only be called by the previously
     *      proposed admin address. Clears the pending admin and transfers all admin privileges.
     */
    function acceptAdmin() external;

    /**
     * @notice Updates the operator address that can perform operational functions
     * @dev The operator has limited privileges compared to admin, typically for routine
     *      operations like updating LST ratios without requiring full admin access.
     * @param _operator Address of the new operator
     */
    function setOperator(address _operator) external;

    /**
     * @notice Updates the externalBusiness address that can manipulate funds from yield
     * @param _externalBusiness Address of the new externalBusiness
     */
    function setExternalBusiness(address _externalBusiness) external;

    /**
     * @notice Updates the strategist address that can manipulate funds from strategyVault
     * @param _strategist Address of the new strategist
     */
    function setStrategist(address _strategist) external;

    /**
     * @notice Configures price settings for the pro token
     * @dev Price settings determine how the pro token's value is calculated.
     *      Get the price directly from the contract can only be used on the chain the price is being pushed on (with getDollarPrice()).
     *      The other chains will need to use oracle price source
     * @param _proTokenPriceSettings Struct containing price configuration:
     *        - oraclePriceSource: Address of price oracle contract (zero address if not using oracle)
     */
    function setProTokenPriceSettings(
        ProTokenSettingsTypes.ProTokenPriceSettings memory _proTokenPriceSettings
    ) external;

    /**
     * @notice Sets the address of the pro token operations contract
     * @dev The operations contract handles core functionality like minting and unminting of pro tokens
     * @param _proTokenOperations Address of the pro token operations contract
     */
    function setProTokenOperations(address _proTokenOperations) external;

    /**
     * @notice Sets the address of the pro token unmint handler contract
     * @param _proTokenUnmintHandler Address of the pro token unmint handler contract
     */
    function setProTokenUnmintHandler(address _proTokenUnmintHandler) external;

    /**
     * @notice Sets the address of the pro token contract
     * @dev The pro token contract represents the actual ERC20 token being managed
     * @param _proToken Address of the pro token contract
     */
    function setProToken(address _proToken) external;

    /**
     * @notice Pauses the contract, disabling certain functions
     * @dev Only callable by admin. Uses OpenZeppelin's PausableUpgradeable
     */
    function pause() external;

    /**
     * @notice Unpauses the contract, re-enabling paused functions
     * @dev Only callable by admin. Uses OpenZeppelin's PausableUpgradeable
     */
    function unpause() external;

    /**
     * @notice Registers a new y asset or updates an existing one with comprehensive settings
     * @dev Y assets are tokens that can generate y while being held as collateral.
     *      Each asset must have allocation percentages that sum to exactly 100% (1e18).
     * @param _yAsset Address of the y-bearing asset
     * @param _settings Complete configuration for the y asset including:
     *        - isEnabled: Whether the asset is active for deposits
     *        - isPaused: Whether operations are temporarily paused
     *        - decimals: Token decimals (since ERC20 decimals() is optional)
     *        - priceSettings: Price calculation configuration
     *        - unmintFeePer: Fee charged when unminting (with 18 decimals)
     *        - yOperationsHandler: Contract managing y operations for this asset
     */
    function setYAsset(
        address _yAsset,
        ProTokenSettingsTypes.YAssetSettings memory _settings
    ) external;

    /**
     * @notice Sets the y assets to be used for unminting operations
     * @dev The unmint y asset can be any registered and enabled y asset.
     * @param _unmintYAssets Address of the y asset to use for unminting
     */
    function setUnmintYAssets(address[] memory _unmintYAssets) external;

    /**
     * @notice Configures oracle aggregation settings for multi-oracle price validation
     * @dev Sets the maximum allowed price deviation between multiple oracle responses
     * @param _maxPriceDeviation Maximum allowed deviation between oracle prices in basis points (e.g., 500 = 5%)
     */
    function setOracleAggregationSettings(uint256 _maxPriceDeviation) external;

    /**
     * @notice Removes a y asset from the registry
     * @dev Only callable by admin. The y asset must not be in the unmintYAssets array
     *      and its yOperationsHandler must have 0 balance (no funds allocated).
     *      This is used to clean up y assets that are no longer used or were mistakenly configured.
     * @param _yAsset Address of the y asset to remove
     */
    function removeYAsset(address _yAsset) external;

    /**
     * @notice Sets status of an authority address for proofs acceptance
     * @dev Only callable by admin.
     * @param _authority The address to change authority status of
     * @param _status The new authority status of the address
     */
    function setAuthority(
        address _authority, 
        bool _status
    ) external;

    /**
     * @notice Sets the strategy vault
     * @dev Only callable by admin.
     * @param _strategyVault Address of the strategy vault
     */
    function setStrategyVault(
        address _strategyVault
    ) external;
    
    // ================================================
    // ================ View functions ================
    // ================================================

    /**
     * @notice Returns the current admin address
     * @return admin Address of the current admin who has full control over the contract
     */
    function getAdmin() external view returns (address admin);

    /**
     * @notice Returns the current operator address
     * @return operator Address of the current operator with limited operational privileges
     */
    function getOperator() external view returns (address operator);

    /**
     * @notice Returns the current externalBusiness address
     * @return externalBusiness Address of the current externalBusiness that can manipulate funds from yield
     */
    function getExternalBusiness()
        external
        view
        returns (address externalBusiness);

    /**
     * @notice Returns the current strategist address
     * @return strategist Address of the current strategist that can manipulate funds in strategyVault
     */
    function getStrategist() 
        external 
        view 
        returns (address strategist);

    /**
     * @notice Returns the configured unmint y assets address
     * @return unmintYAssets Address of the y assets used for unminting operations
     */
    function getUnmintYAssets()
        external
        view
        returns (address[] memory unmintYAssets);

    /**
     * @notice Retrieves configuration and status information for y assets
     * @dev If _yAssets is empty, returns all registered y assets.
     *      If specific addresses are provided, only returns data for valid/registered assets.
     * @param _yAssets Array of y asset addresses to query. Pass empty array for all assets.
     * @return response Struct containing:
     *         - yAssets: Array of y asset data including settings and configurations
     */
    function getYAssets(
        address[] memory _yAssets
    )
        external
        view
        returns (ProTokenSettingsTypes.GetYAssetsResponse memory response);

    /**
     * @notice Returns comprehensive information about the pro token system configuration
     * @return info Struct containing all pro token related addresses and settings:
     *         - proToken: Address of the main pro token contract
     *         - proTokenOperations: Address of the operations contract (mint/burn)
     *         - proTokenUnmintHandler: Address of the unmint handler contract
     *         - priceSettings: Current price calculation configuration for the pro token
     */
    function getProTokenInfo()
        external
        view
        returns (ProTokenSettingsTypes.GetProTokenInfoResponse memory info);

    /**
     * @notice Checks if the contract is currently paused
     * @dev Inherits from OpenZeppelin's PausableUpgradeable. When paused, certain operations
     *      may be restricted depending on implementation in the main contract.
     * @return paused True if contract is paused, false otherwise
     */
    function isPaused() external view returns (bool paused);

    /**
     * @notice Returns the current oracle aggregation settings
     * @return settings The oracle aggregation settings including max price deviation
     */
    function getOracleAggregationSettings()
        external
        view
        returns (
            ProTokenOperationsTypes.OracleAggregationSettings memory settings
        );

    /**
     * @notice Returns true if address is a signer authority
     * @param _addr Address to check
     * @return isTrue If the address is an authority
     */
    function isAuthority(address _addr) external view returns (bool isTrue);

    /**
     * @notice Returns address of StrategyVault
     * @return _strategyVault Address of StrategyVault
     */
    function getStrategyVault() external view returns (address _strategyVault);

    // ================================================
    // ==================== Events ====================
    // ================================================

    /**
     * @notice Emitted when a new admin is proposed in the two-step transfer process
     * @param currentAdmin Address of the current admin who made the proposal
     * @param proposedAdmin Address of the proposed new admin
     */
    event AdminProposed(
        address indexed currentAdmin,
        address indexed proposedAdmin
    );

    /**
     * @notice Emitted when the proposed admin accepts the role, completing the transfer
     * @param previousAdmin Address of the previous admin
     * @param newAdmin Address of the new admin who accepted the role
     */
    event AdminAccepted(
        address indexed previousAdmin,
        address indexed newAdmin
    );

    /**
     * @notice Emitted when the operator address is changed
     * @param previousOperator Address of the previous operator
     * @param newOperator Address of the new operator
     */
    event OperatorSet(
        address indexed previousOperator,
        address indexed newOperator
    );

    /**
     * @notice Emitted when pro token price settings are modified
     * @param oraclePriceSource oracle contract addresses (empty if not used)
     */
    event ProTokenPriceSettingsSet(address oraclePriceSource);

    /**
     * @notice Emitted when the pro token operations contract address is updated
     * @param previousOperations Address of the previous operations contract
     * @param newOperations Address of the new operations contract
     */
    event ProTokenOperationsSet(
        address indexed previousOperations,
        address indexed newOperations
    );

    /**
     * @notice Emitted when a y asset is registered or its settings are updated
     * @param yAsset Address of the y asset that was configured
     */
    event YAssetSet(address indexed yAsset);

    /**
     * @notice Emitted when a y asset is removed from the registry
     * @param yAsset Address of the y asset that was removed
     */
    event YAssetRemoved(address indexed yAsset);

    /**
     * @notice Emitted when the unmint y asset is changed
     * @param oldAssets Address of the previous unmint y asset
     * @param newAssets Address of the new unmint y asset
     */
    event UnmintYAssetsUpdated(address[] oldAssets, address[] newAssets);

    /**
     * @notice Emitted when oracle aggregation settings are updated
     * @param maxPriceDeviation Maximum allowed price deviation between oracles in basis points
     */
    event OracleAggregationSettingsSet(uint256 maxPriceDeviation);

    /**
     * @notice Emitted when the pro token contract address is updated
     * @param previousProToken Address of the previous pro token
     * @param newProToken Address of the new pro token
     */
    event ProTokenSet(
        address indexed previousProToken,
        address indexed newProToken
    );

    /**
     * @notice Emitted when the pro token unmint handler contract address is updated
     * @param previousUnmintHandler Address of the previous unmint handler contract
     * @param newUnmintHandler Address of the new unmint handler contract
     */
    event ProTokenUnmintHandlerSet(
        address previousUnmintHandler,
        address newUnmintHandler
    );

    /**
     * @notice Emitted when the externalBusiness address is changed
     * @param previousExternalBusiness Address of the previous externalBusiness
     * @param newExternalBusiness Address of the new externalBusiness
     */
    event ExternalBusinessSet(
        address previousExternalBusiness,
        address newExternalBusiness
    );

    /**
     * @notice Emitted when the strategist address is changed
     * @param previousStrategsit Address of the previous strategist
     * @param newStrategist Address of the new strategist
     */
    event StrategistSet(
        address previousStrategsit, 
        address newStrategist
    );

    /**
     * @notice Emitted when an authority is set/unset for proofs
     * @dev This event tracks the time at which an authority status had a change
     * @param authority The address that creates proofs
     * @param prevStatus The previous status of the authority
     * @param NewStatus The new status of the authority
     */
    event AuthoritySet(address indexed authority, bool prevStatus, bool NewStatus);

    /**
     * @notice Emitted when strategy vault is set
     * @dev This event tracks the time at which strategy vault was set
     * @param previous The previous strategy vault's address
     * @param current The new strategy vault's address
     */
    event StrategyVaultSet(address indexed previous, address indexed current);

    // ================================================
    // ==================== Errors ====================
    // ================================================

    error ZeroAddress();
    error NotAdmin();
    error NotAdminOrOperator();
    error LengthMismatch();
    error ZeroRatio();
    error NotPendingAdmin();
    error ZeroSources();
    error NotEnabled();
    error PausedInSettings();
    error GreaterThanAllowed();
    error Unauthorized();
    error NoYAssetsFound();
    error YAssetNotFound(address yAsset);
    error YAssetInUseForUnmint(address yAsset);
    error YOperationsHandlerInUseBalanceNotZero();
}
