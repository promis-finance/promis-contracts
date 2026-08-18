// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IYieldProtocolHandler.sol";
import "./state/AaveV3YieldHandlerState.sol";
import "../core/interfaces/IProTokenSettings.sol";
import "../core/interfaces/IVersioned.sol";
import "../core/types/ProTokenSettingsTypes.sol";

/**
 * @notice Minimal interface for AAVE v3 Pool
 * @dev Only includes functions needed for this handler
 */
interface IPool {
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);

    function getReserveAToken(address asset) external view returns (address);
    function getReserveDeficit(address asset) external view returns (uint256);
}

/**
 * @notice Minimal interface for AAVE aToken
 * @dev Only includes functions needed for this handler
 */
interface IAToken {
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);   // reserve-wide aToken supply
}

/**
 * @notice Minimal interface for AAVE V3 Rewards Controller
 * @dev Only includes functions needed for claiming rewards
 */
interface IRewardsController {
    function claimAllRewards(
        address[] calldata assets,
        address to
    )
        external
        returns (address[] memory rewardsList, uint256[] memory claimedAmounts);
}

/**
 * @title AaveV3YieldHandler
 * @notice Handles yield generation through AAVE v3 protocol for a single yield asset
 * @dev UUPS upgradeable contract implementing standardized yield protocol interface.
 *      Deposits assets into AAVE v3 lending pools to earn yield.
 */
contract AaveV3YieldHandler is
    IYieldProtocolHandler,
    AaveV3YieldHandlerState,
    Initializable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable,
    IVersioned
{
    using SafeERC20 for IERC20;

    /// @notice Implementation version (v1.0.0)
    uint256 public constant VERSION = 1_00_00;

    // Additional events for reward collection
    event IncentivesControllerUpdated(address indexed incentivesController);
    event ATokenUpdated(address indexed aTokenAddress);
    event ImpairmentToleranceUpdated(uint256 old, uint256 bps);
    event OperationsContractUpdated(address indexed operationsContract);
    /// @notice Emitted when an emergency withdrawal is performed
    event EmergencyWithdraw(
        address indexed token,
        address indexed to,
        uint256 amount
    );
    error RewardsClaimMismatch();
    error Paused();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract
     * @param _proTokenSettings Address of the ProTokenSettings contract to get settings from (ex. admin address)
     * @param _operationsContract Authorized operations contract address
     * @param _aavePool AAVE v3 Pool contract address
     * @param _yieldAsset Address of the yield asset to manage
     * @param _aToken Optional override for the aToken linked to the yield asset
     */
    function initialize(
        address _proTokenSettings,
        address _operationsContract,
        address _aavePool,
        address _yieldAsset,
        address _aToken
    ) public initializer {
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        if (_proTokenSettings == address(0)) revert InvalidAddr();
        if (_operationsContract == address(0)) revert InvalidAddr();
        if (_aavePool == address(0)) revert InvalidAddr();
        if (_yieldAsset == address(0)) revert InvalidAddr();

        proTokenSettings = _proTokenSettings;
        operationsContract = _operationsContract;
        aavePool = _aavePool;
        yieldAsset = _yieldAsset;
        aToken = _aToken;

        emit OperationsContractUpdated(_operationsContract);
        emit ATokenUpdated(_aToken);
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
        _requireActiveConfiguration();

        address asset = yieldAsset;
        address pool = aavePool;

        // Pull tokens from operations contract
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);

        // Approve and supply to AAVE
        IERC20(asset).forceApprove(pool, amount);
        IPool(pool).supply(asset, amount, address(this), 0);

        emit YieldAssetDeposited(amount, block.timestamp);
    }

    /// @inheritdoc IYieldProtocolHandler
    function withdrawYieldAsset(
        uint256 amount
    ) external whenNotPaused nonReentrant returns (uint256) {
        if (msg.sender != operationsContract) revert Unauthorized();
        _requireActiveConfiguration();

        uint256 amountToWithdraw = amount == 0 ? this.getBalance() : amount;
        if (amountToWithdraw == 0) revert InsufficientBalance();

        address aTokenAddress = _getATokenAddress();
        if (aTokenAddress == address(0)) revert WithdrawFailed();

        uint256 aTokenBalance = IAToken(aTokenAddress).balanceOf(address(this));
        if (aTokenBalance < amountToWithdraw) revert InsufficientBalance();

        // Always withdraw to the operations contract (msg.sender)
        address pool = aavePool;
        address asset = yieldAsset;
        uint256 actualAmount = IPool(pool).withdraw(
            asset,
            amountToWithdraw,
            msg.sender
        );

        if (actualAmount < amountToWithdraw) revert WithdrawFailed();

        emit YieldAssetWithdrawn(amount, actualAmount, block.timestamp);
        return actualAmount;
    }

    // ================================================
    // =========== Admin External Functions ===========
    // ================================================

    /**
     * @notice Set the yield asset address
     * @dev Only callable by admin, ensure no funds are locked
     * @param _yieldAsset New yield asset address
     */
    function setYieldAsset(address _yieldAsset) external onlyAdmin {
        if (_yieldAsset == address(0)) revert InvalidAddr();

        address aTokenAddress = _getATokenAddress();
        if (aTokenAddress != address(0) && aTokenAddress.code.length > 0) {
            try IAToken(aTokenAddress).balanceOf(address(this)) returns (uint256 bal) {
                if (bal > 0) revert InsufficientBalance();
            } catch {}
        }

        yieldAsset = _yieldAsset;
        _updateAToken(address(0));
    }

    /**
     * @notice Set the AAVE pool address
     * @dev Only callable by admin
     * @param _aavePool New AAVE pool address
     */
    function setAavePool(address _aavePool) external onlyAdmin {
        if (_aavePool == address(0)) revert InvalidAddr();

        address aTokenAddress = _getATokenAddress();
        if (aTokenAddress != address(0) && aTokenAddress.code.length > 0) {
            try IAToken(aTokenAddress).balanceOf(address(this)) returns (uint256 bal) {
                if (bal > 0) revert InsufficientBalance();
            } catch {}
        }

        aavePool = _aavePool;
        _updateAToken(address(0));
    }

    /**
     * @notice Set the aToken address override
     * @dev Only callable by admin; set to zero address to fall back to pool query
     * @param _aToken Address of the aToken linked to the current yield asset
     */
    function setAToken(address _aToken) external onlyAdmin {
        address aTokenAddress = _getATokenAddress();
        if (aTokenAddress != address(0) && aTokenAddress.code.length > 0) {
            try IAToken(aTokenAddress).balanceOf(address(this)) returns (uint256 bal) {
                if (bal > 0) revert InsufficientBalance();
            } catch {}
        }
        _updateAToken(_aToken);
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
     * @notice Sets the AAVE incentives controller address
     * @dev Only callable by admin. The incentivesController is stored for future use
     *      to enable claiming AAVE rewards when the feature is implemented.
     * @param _incentivesController Address of AAVE's rewards controller
     */
    function setIncentivesController(
        address _incentivesController
    ) external onlyAdmin {
        incentivesController = _incentivesController;
        emit IncentivesControllerUpdated(_incentivesController);
    }
 
    function setImpairmentTolerance(uint256 _bps) external onlyAdmin {
        if (_bps > 10000) revert InvalidAmount();
        uint256 old = impairmentToleranceBps;
        impairmentToleranceBps = _bps;
        emit ImpairmentToleranceUpdated(old, _bps);
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
        address aTokenAddress = _getATokenAddress();
        if (aTokenAddress == address(0)) return 0;

        uint256 nominal = IAToken(aTokenAddress).balanceOf(address(this));
        if (nominal == 0) return 0;

        (uint256 deficit, uint256 totalReserveSupply, bool readable) = _reserveImpairment();
        if (!readable || deficit == 0 || totalReserveSupply == 0) return nominal;

        uint256 impairedPortion = (nominal * deficit) / totalReserveSupply;

        return nominal > impairedPortion ? nominal - impairedPortion : 0;
    }

    /// @inheritdoc IYieldProtocolHandler
    function getYieldAsset() external view returns (address) {
        return yieldAsset;
    }

    function getAavePool() external view returns (address) {
        return aavePool;
    }

    /// @inheritdoc IYieldProtocolHandler
    function acceptsAllocation() external override view returns (bool) {
        (uint256 deficit, uint256 totalReserveSupply, bool readable) = _reserveImpairment();
        if (!readable) return false;                   // UNREADABLE → fail closed
        if (deficit == 0) return true;                 // healthy → accept
        if (totalReserveSupply == 0) return false;     // degenerate: deficit but no supply → refuse
        if (impairmentToleranceBps == 0) return false; // zero tolerance → any deficit refused
        // impairment ratio in bps
        uint256 ratioBps = (deficit * 10000) / totalReserveSupply;
        return ratioBps <= impairmentToleranceBps;
    }

    // ================================================
    // ============== Internal Functions ==============
    // ================================================

    /// @notice Returns the reserve's impairment as (deficit, totalSupply) for the
    ///         current yieldAsset reserve. Both zero if unreadable or healthy.
    /// @dev Never reverts — callers depend on this for liveness (valuation and
    ///      allocation must degrade gracefully, not fail, on an unreadable read).
    function _reserveImpairment()
        internal
        view
        returns (uint256 deficit, uint256 totalReserveSupply, bool readable)
    {
        address pool = aavePool;
        address asset = yieldAsset;
        address aTokenAddress = _getATokenAddress();
        if (aTokenAddress == address(0)) return (0, 0, false);  // can't resolve → unreadable

        try IPool(pool).getReserveDeficit(asset) returns (uint256 d) {
            deficit = d;
        } catch {
            return (0, 0, false);  // deficit read failed → UNREADABLE (not healthy)
        }

        if (deficit == 0) return (0, 0, true);  // genuinely healthy, readable

        try IAToken(aTokenAddress).totalSupply() returns (uint256 ts) {
            totalReserveSupply = ts;
        } catch {
            return (deficit, 0, false);  // known deficit but can't size → UNREADABLE
        }

        readable = true;  // deficit > 0, supply read OK
    }

    /**
     * @notice Get the aToken address for the current yield asset
     * @dev Fetches dynamically from AAVE pool using efficient getReserveAToken
     * @return aTokenAddress Address of the aToken, or address(0) if not found
     */
    function _getATokenAddress() internal view returns (address) {
        if (aToken != address(0)) {
            return aToken;
        }

        if (aavePool == address(0) || yieldAsset == address(0)) {
            return address(0);
        }

        try IPool(aavePool).getReserveAToken(yieldAsset) returns (
            address aTokenAddress
        ) {
            return aTokenAddress;
        } catch {
            return address(0);
        }
    }

    function _requireActiveConfiguration() internal view {
        if (aavePool == address(0) || yieldAsset == address(0)) {
            revert InvalidAddr();
        }
    }

    function _updateAToken(address _aToken) internal {
        aToken = _aToken;
        emit ATokenUpdated(_aToken);
    }
}
