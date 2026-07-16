// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./state/YAssetOperationsHandlerState.sol";
import "./interfaces/IYAssetOperationsHandler.sol";
import "./interfaces/IProTokenSettings.sol";
import "./interfaces/IVersioned.sol";
import "../yields/interfaces/IYieldProtocolHandler.sol";
import "./types/YAssetOperationsHandlerTypes.sol";
import "./types/ProTokenSettingsTypes.sol";

/**
 * @title YAssetOperationsHandler
 * @notice Distributes a yield asset across multiple yield protocol handlers by allocation.
 * @dev UUPS proxy logic. One handler instance per yAsset. Routes deposited yAsset to the
 *      configured yield protocols by their allocation percentages, and sources it back on
 *      withdrawal/payout.
 */
contract YAssetOperationsHandler is
    YAssetOperationsHandlerState,
    UUPSUpgradeable,
    IYAssetOperationsHandler,
    IVersioned
{
    using SafeERC20 for IERC20;

    /// @notice Implementation version (v1.0.0)
    uint256 public constant VERSION = 1_00_00;

    /// @notice Total allocation percentage (100% = 10000 basis points)
    uint256 public constant ALLOCATION_PRECISION = 10000;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _proTokenSettings,
        address _yAsset
    ) public initializer {
        __UUPSUpgradeable_init();
        if (_proTokenSettings == address(0)) revert ZeroAddress();
        if (_yAsset == address(0)) revert ZeroAddress();

        proTokenSettings = _proTokenSettings;
        yAsset = _yAsset;
    }

    modifier onlyAdmin() {
        IProTokenSettings settings = IProTokenSettings(proTokenSettings);
        if (msg.sender != settings.getAdmin()) revert NotAdmin();
        _;
    }

    modifier whenNotPaused() {
        IProTokenSettings pauseSource = IProTokenSettings(proTokenSettings);
        if (pauseSource.isPaused()) revert Paused();
        _;
    }

    // ================================================
    // =========== Open External Functions ============
    // ================================================

    /// @inheritdoc IYAssetOperationsHandler
    /// @notice SECURITY NOTE: This function is intentionally public/permissionless.
    /// It only distributes assets that are already held by this contract to the configured
    /// yield protocol handlers. Anyone can call this to help ensure assets are earning yield,
    /// which benefits the protocol. There is no security risk as it cannot move assets
    /// to unauthorized destinations - only to pre-configured protocol handlers.
    function distributeUnallocatedYAsset() external override whenNotPaused {
        // check contract balance
        uint256 unallocatedBalance = IERC20(yAsset).balanceOf(address(this));

        // distribute unallocated balance
        _allocateToHandlers(unallocatedBalance);
    }

    // ================================================
    // ======== Restricted External Functions =========
    // ================================================

    /// @inheritdoc IYAssetOperationsHandler
    function distributeYAsset(uint256 _amount) external override whenNotPaused {
        if (_amount == 0) revert ZeroAmount();

        // Check what is the caller
        if (
            msg.sender ==
            IProTokenSettings(proTokenSettings)
                .getProTokenInfo()
                .proTokenOperations
        ) {} else if (
            msg.sender ==
            IProTokenSettings(proTokenSettings).getExternalBusiness() ||
            msg.sender == IProTokenSettings(proTokenSettings).getOperator() ||
            msg.sender == IProTokenSettings(proTokenSettings).getAdmin()
        ) {
            IERC20(yAsset).safeTransferFrom(msg.sender, address(this), _amount);
        } else {
            revert Unauthorized();
        }

        emit YAssetsAllocated(_amount);

        _allocateToHandlers(_amount);
    }

    /// @inheritdoc IYAssetOperationsHandler
    function withdrawalYieldAssets(
        address _handler,
        uint256 _amount
    ) external whenNotPaused {
        if (_amount == 0) revert ZeroAmount();

        // Check what is the caller
        // External Business, operator and admin can ask yield Operations to withdrawal assets and transfer them to themselves
        //   - External Business need money for other things
        //   - Operator to handle unmint requests or crosschain operations
        //   - Admin for emergency stuff
        if (
            msg.sender !=
            IProTokenSettings(proTokenSettings).getExternalBusiness() &&
            msg.sender != IProTokenSettings(proTokenSettings).getOperator() &&
            msg.sender != IProTokenSettings(proTokenSettings).getAdmin()
        ) {
            revert Unauthorized();
        }

        uint256 actualAmount;

        if (_handler == address(0)) {
            // Withdraw from unallocated balance
            uint256 unallocatedBalance = IERC20(yAsset).balanceOf(
                address(this)
            );
            if (unallocatedBalance < _amount) revert InsufficientBalance();
            actualAmount = _amount;
        } else {
            // Withdraw from specified handler
            if (!isProtocolHandler[_handler]) revert ProtocolHandlerNotFound();

            actualAmount = IYieldProtocolHandler(_handler).withdrawYieldAsset(
                _amount
            );
            if (actualAmount < _amount) revert WithdrawFailed();
        }

        IERC20(yAsset).safeTransfer(msg.sender, actualAmount);

        emit YAssetsWithdrawn(_handler, msg.sender, actualAmount);
    }

    /// @inheritdoc IYAssetOperationsHandler
    function withdrawalYieldAssetsMultiple(
        address[] memory _handlers,
        uint256[] memory _amounts
    ) external whenNotPaused {
        if (_handlers.length != _amounts.length) revert ArrayLengthMismatch();
        if (_handlers.length == 0) revert NoHandlers();

        // Check what is the caller
        // External Business, operator and admin can ask yield Operations to withdrawal assets and transfer them to themselves
        //   - External Business need money for other things
        //   - Operator to handle unmint requests or crosschain operations
        //   - Admin for emergency stuff
        if (
            msg.sender !=
            IProTokenSettings(proTokenSettings).getExternalBusiness() &&
            msg.sender != IProTokenSettings(proTokenSettings).getOperator() &&
            msg.sender != IProTokenSettings(proTokenSettings).getAdmin()
        ) {
            revert Unauthorized();
        }

        uint256 totalWithdrawn = 0;

        for (uint256 i = 0; i < _handlers.length; i++) {
            address handler = _handlers[i];
            uint256 amount = _amounts[i];

            if (amount == 0) revert ZeroAmount();

            uint256 actualAmount;

            if (handler == address(0)) {
                // Withdraw from unallocated balance
                uint256 unallocatedBalance = IERC20(yAsset).balanceOf(
                    address(this)
                );
                if (unallocatedBalance < amount) revert InsufficientBalance();
                actualAmount = amount;
            } else {
                // Withdraw from specified handler
                if (!isProtocolHandler[handler])
                    revert ProtocolHandlerNotFound();

                actualAmount = IYieldProtocolHandler(handler)
                    .withdrawYieldAsset(amount);
                if (actualAmount < amount) revert WithdrawFailed();
            }

            totalWithdrawn += actualAmount;

            emit YAssetsWithdrawn(handler, msg.sender, actualAmount);
        }

        IERC20(yAsset).safeTransfer(msg.sender, totalWithdrawn);
    }

    /// @inheritdoc IYAssetOperationsHandler
    function payOut(address to, uint256 amount)
        external
        whenNotPaused
        returns (uint256 sent)
    {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        // Auth: ProTokenOperations OR externalBusiness/operator/admin.
        IProTokenSettings s = IProTokenSettings(proTokenSettings);
        if (
            msg.sender != s.getProTokenInfo().proTokenOperations &&
            msg.sender != s.getExternalBusiness() &&
            msg.sender != s.getOperator() &&
            msg.sender != s.getAdmin()
        ) revert Unauthorized();
        uint256 remaining = amount;

        // 1. Use unallocated reserve held directly on this contract.
        uint256 unallocated = IERC20(yAsset).balanceOf(address(this));
        if (unallocated >= remaining) {
            IERC20(yAsset).safeTransfer(to, amount);
            emit YAssetsPaidOut(to, amount);
            return amount;
        }
        remaining -= unallocated; // reserve fully consumed below

        // 2. Withdraw the shortfall from yield handlers in order.
        for (uint256 i = 0; i < protocolHandlers.length && remaining > 0; i++) {
            address handlerAddr = protocolHandlers[i].handlerContract;
            if (handlerAddr == address(0) || handlerAddr.code.length == 0) continue;

            uint256 handlerBalance;
            try IYieldProtocolHandler(handlerAddr).getBalance() returns (uint256 bal) {
                handlerBalance = bal;
            } catch {
                continue; // unreadable venue: skip
            }
            if (handlerBalance == 0) continue;
        
            uint256 toPull = handlerBalance >= remaining
                ? remaining
                : handlerBalance;
            // Handler withdraws the asset to THIS contract (msg.sender of withdraw).
            try IYieldProtocolHandler(handlerAddr).withdrawYieldAsset(toPull) returns (uint256 got) {
                // Trust no handler to over-report: never credit more than asked.
                remaining -= got > toPull ? toPull : got;
            } catch {
                // crunched venue (e.g. Aave pool at high utilization): skip,
                // the next handler may cover the shortfall.
            }
        }
        if (remaining > 0) revert InsufficientBalance();
        
        // 3. Everything is now on this contract; send the full amount out.
        IERC20(yAsset).safeTransfer(to, amount);
        emit YAssetsPaidOut(to, amount);
        return amount;
    }
    
    // ================================================
    // =========== Admin External Functions ===========
    // ================================================

    /// @notice Emergency withdrawal of any ERC20 tokens stuck in the contract
    /// @dev Only callable by admin. Use with caution - this is for emergency recovery only.
    ///      SECURITY NOTE: The onlyAdmin modifier provides sufficient access control for this
    ///      emergency function. The low-level call pattern for ETH transfers is acceptable
    ///      here since the admin is a trusted role and controls the recipient address.
    /// @param _token Address of the token to withdraw (use address(0) for native ETH)
    /// @param _to Address to send the tokens to
    /// @param _amount Amount to withdraw
    function emergencyWithdraw(
        address _token,
        address _to,
        uint256 _amount
    ) external onlyAdmin {
        if (_to == address(0)) revert ZeroAddress();
        if (_amount == 0) revert ZeroAmount();

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

    /// @inheritdoc IYAssetOperationsHandler
    function setYProtocolHandlers(
        address[] memory _handlers,
        uint256[] memory _allocations
    ) external onlyAdmin {
        if (_handlers.length != _allocations.length)
            revert ArrayLengthMismatch();
        if (_handlers.length == 0) revert NoHandlers();

        // Validate all handler addresses are non-zero
        for (uint256 i = 0; i < _handlers.length; i++) {
            if (_handlers[i] == address(0)) revert ZeroAddress();
        }

        uint256 totalAllocation = 0;
        for (uint256 i = 0; i < _allocations.length; i++) {
            totalAllocation += _allocations[i];
        }
        if (totalAllocation != ALLOCATION_PRECISION) revert InvalidAllocation();

        uint256 oldLen = protocolHandlers.length;
        for (uint256 i = 0; i < oldLen; ) {
            address old = protocolHandlers[i].handlerContract;
            if (old != address(0)) isProtocolHandler[old] = false;
            unchecked { ++i; }
        }
        delete protocolHandlers;

        uint256 handlersLength = _handlers.length;
        for (uint256 i = 0; i < handlersLength; i++) {
            address handlerAddr = _handlers[i];
            uint256 allocation = _allocations[i];

            isProtocolHandler[handlerAddr] = true;

            protocolHandlers.push(
                YAssetOperationsHandlerTypes.YieldProtocolHandler({
                    handlerContract: handlerAddr,
                    allocationPercentage: allocation
                })
            );
        }

        emit YProtocolHandlersSet(_handlers, _allocations);
    }

    // ================================================
    // ================ View functions ================
    // ================================================

    /// @inheritdoc IYAssetOperationsHandler
    function previewPayOut(
        uint256 amount
    ) external view returns (bool sufficient) {
        if (amount == 0) return true;

        uint256 available = IERC20(yAsset).balanceOf(address(this));
        if (available >= amount) return true;

        uint256 len = protocolHandlers.length;
        for (uint256 i = 0; i < len; ) {
            address h = protocolHandlers[i].handlerContract;
            if (h != address(0)) {
                available += IYieldProtocolHandler(h).getBalance();
                if (available >= amount) return true;
            }
            unchecked { ++i; }
        }
        return false;
    }
    
    /// @inheritdoc IYAssetOperationsHandler
    function getYAssetInfo()
        external
        view
        returns (address asset, uint256 totalAmount)
    {
        // loop through protocol handlers to get total balance
        uint256 len = protocolHandlers.length;
        for (uint256 i = 0; i < len; ) {
            uint256 handlerBalance =
                IYieldProtocolHandler(protocolHandlers[i].handlerContract).getBalance();
            totalAmount += handlerBalance;
            unchecked { ++i; }
        }

        // add the unallocated balance
        totalAmount += IERC20(yAsset).balanceOf(address(this));

        return (yAsset, totalAmount);
    }

    /// @inheritdoc IYAssetOperationsHandler
    function getYProtocolHandlers()
        external
        view
        returns (
            YAssetOperationsHandlerTypes.YieldProtocolHandler[] memory handlers
        )
    {
        return protocolHandlers;
    }

    /// @inheritdoc IYAssetOperationsHandler
    function getProtocolBalance(
        address _handler
    ) external view returns (uint256 balance) {
        return (IYieldProtocolHandler(_handler).getBalance());
    }

    /// @inheritdoc IYAssetOperationsHandler
    function getYAsset() external view returns (address) {
        return yAsset;
    }

    /// @inheritdoc IYAssetOperationsHandler
    function getUnallocatedBalance() external view returns (uint256 balance) {
        return IERC20(yAsset).balanceOf(address(this));
    }

    /////////////////
    // ============ Internal Functions ============
    /////////////////

    function _allocateToHandlers(uint256 _amount) internal {
        if (_amount == 0) return;

        uint256 len = protocolHandlers.length;
        uint256 remainingAmount = _amount;
        for (uint256 i = 0; i < len; ) {
            YAssetOperationsHandlerTypes.YieldProtocolHandler storage handler = protocolHandlers[i];

            uint256 allocationAmount;
            if (i == len - 1) {
                allocationAmount = remainingAmount;
            } else {
                allocationAmount = (_amount * handler.allocationPercentage) / ALLOCATION_PRECISION;
                remainingAmount -= allocationAmount;
            }

            if (allocationAmount > 0) {
                address handlerAddr = handler.handlerContract;
                IERC20(yAsset).forceApprove(handlerAddr, allocationAmount);
                IYieldProtocolHandler(handlerAddr).depositYieldAsset(allocationAmount);
                emit YAssetsDistributed(handlerAddr, allocationAmount);
            }
            unchecked { ++i; }
        }
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyAdmin {
        uint256 newVersion = IVersioned(newImplementation).VERSION();
        if (newVersion <= VERSION) {
            revert VersionNotIncremented(VERSION, newVersion);
        }
    }
}
