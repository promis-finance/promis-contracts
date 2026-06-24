// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../yields/interfaces/IYieldProtocolHandler.sol";

/**
 * @title MockYieldProtocolHandler
 * @notice Mock yield protocol handler for testing purposes
 * @dev Implements IYieldProtocolHandler interface with configurable behavior
 */
contract MockYieldProtocolHandler is IYieldProtocolHandler {
    using SafeERC20 for IERC20;

    address public yieldAsset;
    uint256 public balance;
    bool public shouldRevertDeposit;
    bool public shouldRevertWithdraw;
    uint256 public withdrawReturnAmount;
    bool public useActualBalance;

    constructor(address _yieldAsset) {
        yieldAsset = _yieldAsset;
        useActualBalance = true;
    }

    /**
     * @notice Configure deposit to revert
     * @param _shouldRevert Whether to revert on deposit
     */
    function setShouldRevertDeposit(bool _shouldRevert) external {
        shouldRevertDeposit = _shouldRevert;
    }

    /**
     * @notice Configure withdraw to revert
     * @param _shouldRevert Whether to revert on withdraw
     */
    function setShouldRevertWithdraw(bool _shouldRevert) external {
        shouldRevertWithdraw = _shouldRevert;
    }

    /**
     * @notice Set the amount to return on withdraw
     * @param amount The amount to return (0 to use actual amount)
     */
    function setWithdrawReturnAmount(uint256 amount) external {
        withdrawReturnAmount = amount;
    }

    /**
     * @notice Set whether to use actual token balance or tracked balance
     * @param _useActual Whether to use actual balance
     */
    function setUseActualBalance(bool _useActual) external {
        useActualBalance = _useActual;
    }

    /**
     * @notice Manually set the tracked balance
     * @param _balance The balance to set
     */
    function setBalance(uint256 _balance) external {
        balance = _balance;
    }

    /**
     * @inheritdoc IYieldProtocolHandler
     */
    function depositYieldAsset(uint256 amount) external override {
        require(
            !shouldRevertDeposit,
            "MockYieldProtocolHandler: deposit reverted"
        );
        require(amount > 0, "MockYieldProtocolHandler: invalid amount");

        // Pull tokens from sender
        IERC20(yieldAsset).safeTransferFrom(msg.sender, address(this), amount);

        // Update tracked balance
        balance += amount;

        emit YieldAssetDeposited(amount, block.timestamp);
    }

    /**
     * @inheritdoc IYieldProtocolHandler
     */
    function withdrawYieldAsset(
        uint256 amount
    ) external override returns (uint256) {
        require(
            !shouldRevertWithdraw,
            "MockYieldProtocolHandler: withdraw reverted"
        );

        uint256 currentBalance = useActualBalance
            ? IERC20(yieldAsset).balanceOf(address(this))
            : balance;

        uint256 amountToWithdraw = amount == 0 ? currentBalance : amount;
        require(
            currentBalance >= amountToWithdraw,
            "MockYieldProtocolHandler: insufficient balance"
        );

        // Determine actual return amount
        uint256 actualAmount = withdrawReturnAmount > 0
            ? withdrawReturnAmount
            : amountToWithdraw;

        // Update tracked balance
        if (balance >= amountToWithdraw) {
            balance -= amountToWithdraw;
        } else {
            balance = 0;
        }

        // Transfer tokens to sender
        IERC20(yieldAsset).safeTransfer(msg.sender, actualAmount);

        emit YieldAssetWithdrawn(amount, actualAmount, block.timestamp);

        return actualAmount;
    }

    /**
     * @inheritdoc IYieldProtocolHandler
     */
    function getBalance() external view override returns (uint256) {
        if (useActualBalance) {
            return IERC20(yieldAsset).balanceOf(address(this));
        }
        return balance;
    }

    /**
     * @inheritdoc IYieldProtocolHandler
     */
    function getYieldAsset() external view override returns (address) {
        return yieldAsset;
    }

    /**
     * @notice Fund the mock with tokens
     * @param amount The amount to fund
     */
    function fundMock(uint256 amount) external {
        IERC20(yieldAsset).safeTransferFrom(msg.sender, address(this), amount);
        balance += amount;
    }

    /**
     * @notice Simulate yield accrual
     * @param yieldAmount The yield amount to add
     */
    function simulateYield(uint256 yieldAmount) external {
        balance += yieldAmount;
    }
}
