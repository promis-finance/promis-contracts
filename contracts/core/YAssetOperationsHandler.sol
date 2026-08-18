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
        ) {
            if (IERC20(yAsset).balanceOf(address(this)) < _amount) revert AssetNotReceived();
        } else if (
            msg.sender ==
            IProTokenSettings(proTokenSettings).getExternalBusiness() ||
            msg.sender == IProTokenSettings(proTokenSettings).getOperator() ||
            msg.sender == IProTokenSettings(proTokenSettings).getAdmin()
        ) {
            IERC20(yAsset).safeTransferFrom(msg.sender, address(this), _amount);
        } else {
            revert Unauthorized();
        }

        _allocateToHandlers(_amount);
    }

    /// @inheritdoc IYAssetOperationsHandler
    function withdrawalYieldAssets(
        address _handler,
        uint256 _amount
    ) external whenNotPaused {
        if (_amount == 0 && _handler == address(0)) revert ZeroAmount();

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
            if (_amount != 0 && actualAmount < _amount) revert WithdrawFailed();
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

            if (amount == 0 && handler == address(0)) revert ZeroAmount();

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
                if (amount != 0 && actualAmount < amount) revert WithdrawFailed();
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
            _deliverOrThrow(to, amount);
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
        _deliverOrThrow(to, amount);
        emit YAssetsPaidOut(to, amount);
        return amount;
    }

    /// @dev Non-reverting transfer that throws a DISTINCT error on delivery
    ///      failure (e.g. blocklisted recipient), so callers can tell a
    ///      delivery failure apart from a sourcing/liquidity failure.
    function _deliverOrThrow(address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = yAsset.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        // ERC20: success == call didn't revert AND (no return data OR returned true)
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) {
            revert PayoutDeliveryFailed(to, amount);
        }
    }

    /// @inheritdoc IYAssetOperationsHandler
    function recordProtocolFee(address _yAsset, uint256 _amount) external {
        IProTokenSettings s = IProTokenSettings(proTokenSettings);
        if (msg.sender != s.getProTokenInfo().proTokenOperations)
            revert Unauthorized();
        if (_yAsset != yAsset) revert HandlerAssetMismatch(_yAsset);
        accruedProtocolFees[_yAsset] += _amount;
        emit UnmintFeeAccrued(_yAsset, _amount);
    }

    function collectFee(address _yAsset, address _to, uint256 _amount) external {
        if (msg.sender != IProTokenSettings(proTokenSettings).getAdmin()) revert Unauthorized();
        if (_to == address(0)) revert ZeroAddress();
        if (_yAsset != yAsset) revert HandlerAssetMismatch(_yAsset);

        uint256 owed = accruedProtocolFees[_yAsset];
        if (_amount == 0) _amount = owed;
        if (_amount > owed) revert CollectExceedsAccrued(_amount, owed);

        accruedProtocolFees[_yAsset] = owed - _amount;

        // Source the fee: idle first, then venues (accrual model — the fee tokens
        // are wherever our yAsset happens to sit, not necessarily idle).
        uint256 idle = IERC20(_yAsset).balanceOf(address(this));
        if (idle < _amount) {
            uint256 remaining = _amount - idle;
            for (uint256 i = 0; i < protocolHandlers.length && remaining > 0; i++) {
                address h = protocolHandlers[i].handlerContract;
                if (h == address(0) || h.code.length == 0) continue;
                uint256 bal;
                try IYieldProtocolHandler(h).getBalance() returns (uint256 b) { bal = b; } catch { continue; }
                if (bal == 0) continue;
                uint256 toPull = bal >= remaining ? remaining : bal;
                try IYieldProtocolHandler(h).withdrawYieldAsset(toPull) returns (uint256 got) {
                    remaining -= got > toPull ? toPull : got;
                } catch {}
            }
            if (remaining > 0) revert InsufficientBalance(); // total holdings < ledger: shouldn't happen unless a loss occurred
        }

        IERC20(_yAsset).safeTransfer(_to, _amount);
        emit ProtocolFeesCollected(_yAsset, _to, _amount);
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
        uint256[] memory _allocations,
        bool _forced
    ) external override onlyAdmin {
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
            if (old != address(0)) {
                // Only enforce the balance policy on handlers genuinely leaving the set.
                if (!_isInNewList(old, _handlers)) {
                    (uint256 bal, bool verified) = _tryGetHandlerBalance(old);
                    if (verified) {
                        // Known balance: a funded handler must be drained first (it is still
                        // registered here, so withdrawalYieldAssets works). forced does NOT
                        // override a confirmed balance.
                        if (bal > 0) revert HandlerHasBalance(old, bal);
                        // verified zero → clean removal, no event.
                    } else {
                        // Unreadable: drain-first may be impossible (handler broken), so a
                        // forced detachment is the escape hatch; recover via the handler's
                        // own emergency path afterward.
                        if (!_forced) revert HandlerBalanceUnverifiable(old);
                        emit HandlerDetachedUnverified(old);
                    }
                }
                // Handlers still in the new list: not a removal — no check, no event.
                isProtocolHandler[old] = false;
            }
            unchecked { ++i; }
        }
        delete protocolHandlers;

        uint256 handlersLength = _handlers.length;
        for (uint256 i = 0; i < handlersLength; i++) {
            address handlerAddr = _handlers[i];
            uint256 allocation = _allocations[i];

            if (IYieldProtocolHandler(handlerAddr).getYieldAsset() != yAsset)
                revert HandlerAssetMismatch(handlerAddr);

            if (isProtocolHandler[handlerAddr]) revert DuplicateHandler();
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

    /// @dev True if `handler` appears in the new `handlers` array.
    function _isInNewList(address handler, address[] memory handlers)
        internal pure returns (bool)
    {
        for (uint256 i = 0; i < handlers.length; ) {
            if (handlers[i] == handler) return true;
            unchecked { ++i; }
        }
        return false;
    }

    /// @dev Reads a handler's balance without reverting; (balance, verified).
    ///      verified == false when the handler has no code or getBalance() reverts.
    function _tryGetHandlerBalance(address handler)
        internal view returns (uint256 bal, bool verified)
    {
        if (handler.code.length == 0) return (0, false);
        try IYieldProtocolHandler(handler).getBalance() returns (uint256 b) {
            return (b, true);
        } catch {
            return (0, false);
        }
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
            if (h != address(0) && h.code.length != 0) {
                try IYieldProtocolHandler(h).getBalance() returns (uint256 balance) {
                    available += balance;
                    if (available >= amount) return true;
                } catch {}
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

        uint256 fees = accruedProtocolFees[yAsset];
        totalAmount = totalAmount > fees ? totalAmount - fees : 0;

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
            address handlerAddr = handler.handlerContract;

            // Skip venues that refuse allocation (e.g. impaired Aave reserve). Their
            // share is NOT force-fed; it stays as idle backing on this contract —
            // idle yAsset is fully-backed, just not yield-earning until the venue
            // recovers or admin re-routes. This avoids a DoS where one venue's
            // external deficit would otherwise revert the whole distribution
            // (and, upstream, block minting).
            bool accepts;
            if (handlerAddr != address(0) && handlerAddr.code.length != 0) {
                try IYieldProtocolHandler(handlerAddr).acceptsAllocation() returns (bool a) {
                    accepts = a;
                } catch {} // unreadable probe → don't route new capital there
            }

            uint256 allocationAmount;
            if (i == len - 1) {
                allocationAmount = remainingAmount; // last handler mops up the remainder
            } else {
                allocationAmount = (_amount * handler.allocationPercentage) / ALLOCATION_PRECISION;
                remainingAmount -= allocationAmount;
            }

            if (accepts && allocationAmount > 0) {
                IERC20(yAsset).forceApprove(handlerAddr, allocationAmount);
                try IYieldProtocolHandler(handlerAddr).depositYieldAsset(allocationAmount) {
                    emit YAssetsDistributed(handlerAddr, allocationAmount);
                } catch {
                    // Deposit reverted despite passing the probe → clear the approval and
                    // leave this share as idle backing on this contract.
                    IERC20(yAsset).forceApprove(handlerAddr, 0);
                    emit AllocationSkipped(handlerAddr, allocationAmount);
                }
            } else if (!accepts && allocationAmount > 0) {
                // Refused: leave this portion idle on the handler contract.
                // (remainingAmount was already decremented for non-last handlers;
                //  the tokens simply aren't forwarded — they stay in balanceOf(this).)
                emit AllocationSkipped(handlerAddr, allocationAmount);
            }
            unchecked { ++i; }
        }

        emit YAssetsAllocated(_amount);
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
