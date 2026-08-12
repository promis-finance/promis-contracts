// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./state/ProTokenSettingsState.sol";
import "./interfaces/IProTokenSettings.sol";
import "./interfaces/IVersioned.sol";
import "./interfaces/IYAssetOperationsHandler.sol";

/**
 * @title ProTokenSettings
 * @notice Central configuration contract for the Promis protocol.
 * @dev UUPS proxy logic with PausableUpgradeable. Manages admin/operator/strategist
 *      roles, yAsset configurations, oracle settings, authorities, and the StrategyVault
 *      address.
 */
contract ProTokenSettings is
    ProTokenSettingsState,
    PausableUpgradeable,
    UUPSUpgradeable,
    IProTokenSettings,
    IVersioned
{
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice Implementation version (v1.0.0)
    uint256 public constant VERSION = 1_00_00;

    /// @notice Maximum allowed price deviation for oracle aggregation (100% = 10000 basis points)
    uint256 public constant MAX_PRICE_DEVIATION_BPS = 10000;

    /// @notice Maximum allowed unmint fee in WAD
    uint256 public constant MAX_UNMINT_FEE = 1e17; // 10%

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _admin, address _operator, address _priceOperator) public initializer {
        __Pausable_init();
        __UUPSUpgradeable_init();
        if (_admin == address(0) || _operator == address(0) || _priceOperator == address(0))
            revert ZeroAddress();
        admin = _admin;
        operator = _operator;
        priceOperator = _priceOperator;

        emit AdminAccepted(address(0), _admin);
        emit OperatorSet(address(0), _operator);
        emit PriceOperatorSet(address(0), _priceOperator);
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    // ================================================
    // =========== Owner External Functions ===========
    // ================================================

    /// @inheritdoc IProTokenSettings
    function proposeAdmin(address _newAdmin) external override onlyAdmin {
        if (_newAdmin == address(0)) revert ZeroAddress();
        pendingAdmin = _newAdmin;
        emit AdminProposed(admin, _newAdmin);
    }

    /// @inheritdoc IProTokenSettings
    function acceptAdmin() external override {
        if (msg.sender != pendingAdmin) revert NotPendingAdmin();
        address previousAdmin = admin;
        admin = pendingAdmin;
        pendingAdmin = address(0);
        emit AdminAccepted(previousAdmin, admin);
    }

    /// @inheritdoc IProTokenSettings
    function setOperator(address _operator) external override onlyAdmin {
        if (_operator == address(0)) revert ZeroAddress();
        address previousOperator = operator;
        operator = _operator;
        emit OperatorSet(previousOperator, _operator);
    }

    /// @inheritdoc IProTokenSettings
    function setPriceOperator(address _priceOperator) external override onlyAdmin {
        if (_priceOperator == address(0)) revert ZeroAddress();
        address previous = priceOperator;
        priceOperator = _priceOperator;
        emit PriceOperatorSet(previous, _priceOperator);
    }

    /// @inheritdoc IProTokenSettings
    /// @notice Sets the external business address. Can be set to zero address to disable.
    function setExternalBusiness(
        address _externalBusiness
    ) external override onlyAdmin {
        address previousExternalBusiness = externalBusiness;
        externalBusiness = _externalBusiness;
        emit ExternalBusinessSet(previousExternalBusiness, _externalBusiness);
    }

    /// @inheritdoc IProTokenSettings
    function setStrategist(
        address _strategist
    ) external override onlyAdmin {
        address previousStrategist = strategist;
        strategist = _strategist;
        emit StrategistSet(previousStrategist, _strategist);
    }

    /// @inheritdoc IProTokenSettings
    function setBridgeAdmin(
        address _bridgeAdmin
    ) external override onlyAdmin {
        address previousBridgeAdmin = bridgeAdmin;
        bridgeAdmin = _bridgeAdmin;
        emit BridgeAdminSet(previousBridgeAdmin, _bridgeAdmin);
    }

    /// @inheritdoc IProTokenSettings
    function setProToken(address _proToken) external override onlyAdmin {
        if (_proToken == address(0)) revert ZeroAddress();
        address previousProToken = proToken;
        proToken = _proToken;
        emit ProTokenSet(previousProToken, _proToken);
    }

    /// @inheritdoc IProTokenSettings
    function setProTokenOperations(
        address _proTokenOperations
    ) external override onlyAdmin {
        if (_proTokenOperations == address(0)) revert ZeroAddress();
        address previousOperations = proTokenOperations;
        proTokenOperations = _proTokenOperations;
        emit ProTokenOperationsSet(previousOperations, _proTokenOperations);
    }

    /// @inheritdoc IProTokenSettings
    function setProTokenUnmintHandler(
        address _proTokenUnmintHandler
    ) external override onlyAdmin {
        if (_proTokenUnmintHandler == address(0)) revert ZeroAddress();
        address previousUnmintHandler = proTokenUnmintHandler;
        proTokenUnmintHandler = _proTokenUnmintHandler;
        emit ProTokenUnmintHandlerSet(
            previousUnmintHandler,
            _proTokenUnmintHandler
        );
    }

    /// @notice Pauses the contract, disabling certain functions
    /// @dev Only callable by admin. Uses OpenZeppelin's PausableUpgradeable
    function pause() external onlyAdmin {
        _pause();
    }

    /// @notice Unpauses the contract, re-enabling paused functions
    /// @dev Only callable by admin. Uses OpenZeppelin's PausableUpgradeable
    function unpause() external onlyAdmin {
        _unpause();
    }

    /// @inheritdoc IProTokenSettings
    function setYAsset(
        address _yAsset,
        ProTokenSettingsTypes.YAssetSettings memory _settings
    ) external override onlyAdmin {
        if (_yAsset == address(0)) revert ZeroAddress();
        if (_settings.yOperationsHandler == address(0)) revert ZeroAddress();
        if (_settings.unmintFeePer > MAX_UNMINT_FEE) revert MaxFeeExceeded();
        if (_settings.priceSettings.usdCap == 0) revert ZeroUsdCap();
        yAssets.add(_yAsset);

        // Cache storage pointer
        ProTokenSettingsTypes.YAssetSettings
            storage storageSettings = yAssetSettings[_yAsset];

        if (
            (_settings.priceSettings.staticPriceSource == 0 &&
                _settings.priceSettings.oraclePriceSources.length == 0)
        ) revert ZeroSources();
        
        // Assign other settings
        storageSettings.isEnabled = _settings.isEnabled;
        storageSettings.isPaused = _settings.isPaused;
        storageSettings.decimals = _settings.decimals;
        storageSettings.priceSettings.staticPriceSource = _settings
            .priceSettings
            .staticPriceSource;
        // Clear and copy oracle price sources array
        delete storageSettings.priceSettings.oraclePriceSources;
        for (
            uint256 i = 0;
            i < _settings.priceSettings.oraclePriceSources.length;
            ++i
        ) {
            if (_settings.priceSettings.oraclePriceSources[i] == address(0))
                revert ZeroAddress();
            storageSettings.priceSettings.oraclePriceSources.push(
                _settings.priceSettings.oraclePriceSources[i]
            );
        }

        if (IYAssetOperationsHandler(_settings.yOperationsHandler).getYAsset() != _yAsset)
            revert HandlerAssetMismatch();
        
        storageSettings.priceSettings.usdCap = _settings
            .priceSettings
            .usdCap;
        storageSettings.unmintFeePer = _settings.unmintFeePer;
        storageSettings.yOperationsHandler = _settings.yOperationsHandler;

        emit YAssetSet(_yAsset);
    }

    /// @inheritdoc IProTokenSettings
    function setUnmintYAssets(
        address[] memory _unmintYAssets
    ) external override onlyAdmin {
        for (uint256 i = 0; i < _unmintYAssets.length; ++i) {
            // Validate that the unmint y asset is registered and enabled
            if (!yAssets.contains(_unmintYAssets[i]))
                revert YAssetNotFound(_unmintYAssets[i]);

            ProTokenSettingsTypes.YAssetSettings
                storage settings = yAssetSettings[_unmintYAssets[i]];

            if (!settings.isEnabled) revert NotEnabled();
            if (settings.isPaused) revert PausedInSettings();
        }

        address[] memory oldAssets = unmintYAssets;
        unmintYAssets = _unmintYAssets;
        emit UnmintYAssetsUpdated(oldAssets, unmintYAssets);
    }

    /// @inheritdoc IProTokenSettings
    function setOracleAggregationSettings(
        uint256 _maxPriceDeviation
    ) external override onlyAdmin {
        if (_maxPriceDeviation > MAX_PRICE_DEVIATION_BPS) revert GreaterThanAllowed();
        oracleAggregationSettings.maxPriceDeviation = _maxPriceDeviation;
        emit OracleAggregationSettingsSet(_maxPriceDeviation);
    }

    /// @inheritdoc IProTokenSettings
    function removeYAsset(address _yAsset) external override onlyAdmin {
        // Check yAsset exists in the set
        if (!yAssets.contains(_yAsset)) revert YAssetNotFound(_yAsset);

        // Check yAsset is NOT in unmintYAssets array
        for (uint256 i = 0; i < unmintYAssets.length; ++i) {
            if (unmintYAssets[i] == _yAsset)
                revert YAssetInUseForUnmint(_yAsset);
        }

        // Check yOperationsHandler has 0 balance
        // Use try-catch to handle misconfigured yOperationsHandler addresses
        // If the call fails (e.g., invalid contract, or non-ERC20), assume balance is 0
        address yOpsHandler = yAssetSettings[_yAsset].yOperationsHandler;
        uint256 totalAmount = 0;
        bool balanceVerified;
        if (yOpsHandler.code.length > 0) {
            try IYAssetOperationsHandler(yOpsHandler).getYAssetInfo() returns (
                address,
                uint256 amount
            ) {
                totalAmount = amount;
                balanceVerified = true;
            } catch {
                // If call fails, totalAmount remains 0 - safe to remove misconfigured yAsset
                // Emit YAssetRemovedUnverified to mark this case
            }
        }

        if (totalAmount > 0) revert YOperationsHandlerInUseBalanceNotZero();

        if (!balanceVerified) {
            // Deliberate policy: an unreadable handler must not deadlock removal of its
            // own asset. The backing (if any) remains on the handler contract,
            // recoverable via its admin paths.
            emit YAssetRemovedUnverified(_yAsset, yOpsHandler);
        }

        // Remove from EnumerableSet
        yAssets.remove(_yAsset);

        // Delete settings mapping entry
        delete yAssetSettings[_yAsset];

        emit YAssetRemoved(_yAsset);
    }

    /// @inheritdoc IProTokenSettings
    function setAuthority(
        address _authority, 
        bool _status
    ) external override onlyAdmin {
        if (_authority == address(0)) revert ZeroAddress();

        bool prevStatus = authority[_authority];
        authority[_authority] = _status;

        emit AuthoritySet(_authority, prevStatus, _status);
    }

    /// @inheritdoc IProTokenSettings
    function setStrategyVault(
        address _strategyVault
    ) external override onlyAdmin {
        if (_strategyVault == address(0)) revert ZeroAddress();

        address prev = strategyVault;
        strategyVault = _strategyVault;

        emit StrategyVaultSet(prev, _strategyVault);
    }

    // ================================================
    // ================ View functions ================
    // ================================================

    /// @inheritdoc IProTokenSettings
    function getAdmin() external view override returns (address) {
        return admin;
    }

    /// @inheritdoc IProTokenSettings
    function getOperator() external view override returns (address) {
        return operator;
    }

    /// @inheritdoc IProTokenSettings
    function getPriceOperator() external view override returns (address) {
        return priceOperator;
    }

    /// @inheritdoc IProTokenSettings
    function getUnmintYAssets()
        external
        view
        override
        returns (address[] memory)
    {
        return unmintYAssets;
    }

    /// @inheritdoc IProTokenSettings
    function getYAssets(
        address[] memory _yAssets
    )
        external
        view
        override
        returns (
            ProTokenSettingsTypes.GetYAssetsResponse memory yAssetsResponse
        )
    {
        if (_yAssets.length == 0) {
            uint256 assetsLength = yAssets.length();
            ProTokenSettingsTypes.GetYAssetResponse[]
                memory responses = new ProTokenSettingsTypes.GetYAssetResponse[](
                    assetsLength
                );

            for (uint256 i = 0; i < assetsLength; ++i) {
                address asset = yAssets.at(i);
                responses[i] = ProTokenSettingsTypes.GetYAssetResponse({
                    yAsset: asset,
                    settings: yAssetSettings[asset]
                });
            }

            yAssetsResponse.yAssets = responses;
        } else {
            // Count how many of the provided assets are valid
            uint256 count = 0;
            for (uint256 i = 0; i < _yAssets.length; ++i) {
                if (yAssets.contains(_yAssets[i])) {
                    ++count;
                }
            }

            ProTokenSettingsTypes.GetYAssetResponse[]
                memory responses = new ProTokenSettingsTypes.GetYAssetResponse[](
                    count
                );

            uint256 j = 0;
            for (uint256 i = 0; i < _yAssets.length; ++i) {
                address asset = _yAssets[i];
                if (yAssets.contains(asset)) {
                    responses[j++] = ProTokenSettingsTypes.GetYAssetResponse({
                        yAsset: asset,
                        settings: yAssetSettings[asset]
                    });
                }
            }

            if (j == 0) revert NoYAssetsFound();
            yAssetsResponse.yAssets = responses;
        }
    }

    /// @inheritdoc IProTokenSettings
    function getProTokenInfo()
        external
        view
        override
        returns (ProTokenSettingsTypes.GetProTokenInfoResponse memory)
    {
        return (
            ProTokenSettingsTypes.GetProTokenInfoResponse({
                proToken: proToken,
                proTokenOperations: proTokenOperations,
                proTokenUnmintHandler: proTokenUnmintHandler
            })
        );
    }

    /// @inheritdoc IProTokenSettings
    function getExternalBusiness() external view override returns (address) {
        return externalBusiness;
    }

    /// @inheritdoc IProTokenSettings
    function getStrategist() external view override returns (address) {
        return strategist;
    }

    /// @inheritdoc IProTokenSettings
    function getBridgeAdmin() external view override returns (address) {
        return bridgeAdmin;
    }

    /// @inheritdoc IProTokenSettings
    function isPaused() external view override returns (bool) {
        return paused();
    }

    /// @inheritdoc IProTokenSettings
    function getOracleAggregationSettings()
        external
        view
        override
        returns (ProTokenOperationsTypes.OracleAggregationSettings memory)
    {
        return oracleAggregationSettings;
    }

    /// @inheritdoc IProTokenSettings
    function isAuthority(address _addr) external view override returns (bool) {
            return authority[_addr];
    }

    /// @inheritdoc IProTokenSettings
    function getStrategyVault() external view override returns (address) {
            return strategyVault;
    }

    // ================================================
    // ============== Internal functions ==============
    // ================================================

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyAdmin {
        uint256 newVersion = IVersioned(newImplementation).VERSION();
        if (newVersion <= VERSION) {
            revert VersionNotIncremented(VERSION, newVersion);
        }
    }
}
