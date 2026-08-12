// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    IMorpho,
    MarketParams,
    Id
} from "@morpho-org/morpho-blue/src/interfaces/IMorpho.sol";
import {
    MorphoBalancesLib
} from "@morpho-org/morpho-blue/src/libraries/periphery/MorphoBalancesLib.sol";
import {
    MorphoLib
} from "@morpho-org/morpho-blue/src/libraries/periphery/MorphoLib.sol";
import {
    MarketParamsLib
} from "@morpho-org/morpho-blue/src/libraries/MarketParamsLib.sol";
import "./interfaces/IYieldProtocolHandler.sol";
import "./state/MorphoYieldHandlerState.sol";
import "../core/interfaces/IProTokenSettings.sol";
import "../core/interfaces/IVersioned.sol";
import "../core/types/ProTokenSettingsTypes.sol";

/**
 * @title MorphoYieldHandler
 * @notice Handles yield generation through Morpho protocol for a single yield asset
 * @dev UUPS upgradeable contract implementing standardized yield protocol interface.
 *      Deposits assets into Morpho Blue markets to earn yield.
 */
contract MorphoYieldHandler is
    IYieldProtocolHandler,
    MorphoYieldHandlerState,
    Initializable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable,
    IVersioned
{
    using MorphoBalancesLib for IMorpho;
    using MorphoLib for IMorpho;
    using MarketParamsLib for MarketParams;
    using SafeERC20 for IERC20;

    /// @notice Implementation version (v1.0.0)
    uint256 public constant VERSION = 1_00_00;
    event MorphoMarketParamsUpdated(MarketParams indexed morphoMarketParams);
    event OperationsContractUpdated(address indexed operationsContract);
    event SetMorphoCoreContract(address indexed morphoCoreContract);
    /// @notice Emitted when an emergency withdrawal is performed
    event EmergencyWithdraw(
        address indexed token,
        address indexed to,
        uint256 amount
    );
    error Paused();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract
     * @param _proTokenSettings Address of the ProTokenSettings contract to get settings from (ex. admin address)
     * @param _operationsContract Authorized operations contract address
     * @param _morphoCoreContract Address of the Morpho core contract
     * @param _morphoMarketParams Morpho market parameters for the yield asset
     */
    function initialize(
        address _proTokenSettings,
        address _operationsContract,
        address _morphoCoreContract,
        MarketParams memory _morphoMarketParams
    ) public initializer {
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        if (_proTokenSettings == address(0)) revert InvalidAddr();
        if (_operationsContract == address(0)) revert InvalidAddr();
        if (_morphoCoreContract == address(0)) revert InvalidAddr();
        proTokenSettings = _proTokenSettings;
        operationsContract = _operationsContract;
        morphoCoreContract = _morphoCoreContract;
        morphoMarketParams = _morphoMarketParams;

        emit OperationsContractUpdated(_operationsContract);
        emit SetMorphoCoreContract(_morphoCoreContract);
        emit MorphoMarketParamsUpdated(_morphoMarketParams);
    }

    modifier onlyAdmin() {
        IProTokenSettings settings = IProTokenSettings(proTokenSettings);
        if (msg.sender != settings.getAdmin()) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        IProTokenSettings pauseSource = IProTokenSettings(proTokenSettings);
        if (pauseSource.isPaused()) revert Paused();
        _;
    }

    /**
     * @notice Authorize an upgrade to a new implementation
     * @dev Internal function called by upgradeTo and upgradeToAndCall
     * @param newImplementation Address of the new implementation
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyAdmin {
        uint256 newVersion = IVersioned(newImplementation).VERSION();
        if (newVersion <= VERSION) {
            revert VersionNotIncremented(VERSION, newVersion);
        }
    }

    // ================================================
    // =========== Open External Functions ============
    // ================================================

    // ================================================
    // ======== Restricted External Functions =========
    // ================================================

    /// @inheritdoc IYieldProtocolHandler
    function depositYieldAsset(
        uint256 amount
    ) external whenNotPaused nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (msg.sender != operationsContract) revert Unauthorized();

        // Pull tokens from operations contract
        IERC20(morphoMarketParams.loanToken).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        // Approve and supply to Morpho
        IERC20(morphoMarketParams.loanToken).forceApprove(
            morphoCoreContract,
            amount
        );
        IMorpho(morphoCoreContract).supply(
            morphoMarketParams,
            amount,
            0,
            address(this),
            ""
        );

        emit YieldAssetDeposited(amount, block.timestamp);
    }

    /// @inheritdoc IYieldProtocolHandler
    function withdrawYieldAsset(
        uint256 amount
    ) external whenNotPaused nonReentrant returns (uint256) {
        if (msg.sender != operationsContract) revert Unauthorized();

        uint256 assetsWithdrawn;

        if (amount == 0) {
            // Full drain: withdraw by SHARES. getBalance() rounds shares->assets
            // DOWN, and an asset-denominated withdraw of that figure burns shares
            // rounded UP — leaving share dust that keeps getBalance() > 0
            Id id = morphoMarketParams.id();
            uint256 shares = IMorpho(morphoCoreContract).supplyShares(
                id,
                address(this)
            );
            if (shares == 0) revert InsufficientBalance();

            (assetsWithdrawn, ) = IMorpho(morphoCoreContract).withdraw(
                morphoMarketParams,
                0,          // assets = 0
                shares,     // burn the whole position
                address(this),
                msg.sender
            );
        } else {
            if (this.getBalance() < amount) revert InsufficientBalance();

            (assetsWithdrawn, ) = IMorpho(morphoCoreContract).withdraw(
                morphoMarketParams,
                amount,
                0,
                address(this),
                msg.sender
            );
            if (assetsWithdrawn < amount) revert WithdrawFailed();
        }

        emit YieldAssetWithdrawn(amount, assetsWithdrawn, block.timestamp);
        return assetsWithdrawn;
    }

    // ================================================
    // =========== Admin External Functions ===========
    // ================================================

    /**
     * @notice Set the Morpho market parameters
     * @dev Only callable by admin, ensure no funds are locked
     * @param _morphoMarketParams New Morpho market parameters
     */
    function setMorphoMarketParams(
        MarketParams memory _morphoMarketParams
    ) external onlyAdmin {
        // Check if there are funds deposited before changing market params
        uint256 balance = this.getBalance();
        if (balance > 0) revert InsufficientBalance();

        morphoMarketParams = _morphoMarketParams;
        emit MorphoMarketParamsUpdated(_morphoMarketParams);
    }

    /**
     * @notice Set the operations contract address
     * @dev Only callable by admin
     * @param _operationsContract New operations contract address (cannot be zero)
     */
    function setOperationsContract(
        address _operationsContract
    ) external onlyAdmin {
        if (_operationsContract == address(0)) revert InvalidAddr();
        operationsContract = _operationsContract;
        emit OperationsContractUpdated(_operationsContract);
    }

    /**
     * @notice Set the Morpho core contract address
     * @dev Only callable by admin, ensure no funds are locked
     * @param _morphoCoreContract New Morpho core contract address
     */
    function setMorphoCoreContract(
        address _morphoCoreContract
    ) external onlyAdmin {
        if (_morphoCoreContract == address(0)) revert InvalidAddr();

        // Check if there are funds deposited before changing core contract
        uint256 balance = this.getBalance();
        if (balance > 0) revert InsufficientBalance();

        morphoCoreContract = _morphoCoreContract;
        emit SetMorphoCoreContract(_morphoCoreContract);
    }

    /**
     * @notice Emergency withdrawal of any ERC20 tokens stuck in the contract
     * @dev Only callable by admin. Use with caution - this is for emergency recovery only.
     *      SECURITY NOTE: The onlyAdmin modifier provides sufficient access control for this
     *      emergency function. The low-level call pattern for ETH transfers is acceptable
     *      here since the admin is a trusted role and controls the recipient address.
     * @param _token Address of the token to withdraw (use address(0) for native ETH)
     * @param _to Address to send the tokens to
     * @param _amount Amount to withdraw
     */
    function emergencyWithdraw(
        address _token,
        address _to,
        uint256 _amount
    ) external onlyAdmin {
        if (_to == address(0)) revert InvalidAddr();
        if (_amount == 0) revert InvalidAmount();

        if (_token == address(0)) {
            // Withdraw native ETH
            (bool success, ) = _to.call{value: _amount}("");
            if (!success) revert WithdrawFailed();
        } else {
            // Withdraw ERC20 tokens
            IERC20(_token).safeTransfer(_to, _amount);
        }

        emit EmergencyWithdraw(_token, _to, _amount);
    }

    // ================================================
    // =========== View Functions ==========
    // ================================================

    /// @inheritdoc IYieldProtocolHandler
    function getBalance() external view returns (uint256) {
        return
            IMorpho(morphoCoreContract).expectedSupplyAssets(
                morphoMarketParams,
                address(this)
            );
    }

    /// @inheritdoc IYieldProtocolHandler
    function getYieldAsset() external view returns (address) {
        return morphoMarketParams.loanToken;
    }

    function getMorphoMarketParams()
        external
        view
        returns (MarketParams memory)
    {
        return morphoMarketParams;
    }

    // ================================================
    // ============== Internal Functions ==============
    // ================================================
}
