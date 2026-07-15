// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

/**
 * @title StrategyVaultState
 * @author Promis Team
 * @notice Storage layout for the StrategyVault, separated from logic.
 * @dev Append new variables before __gap and shrink __gap to preserve layout.
 *      The three pools (deposit / withdraw / yield) are access-segregated: borrow
 *      consumes only deposit*, take consumes only withdraw*, yield* is appreciation only.
 */
abstract contract StrategyVaultState {
    /// @notice ProTokenSettings contract, source of admin/strategist roles.
    address public proTokenSettings;

    /// @notice The proUSD token held by this vault.
    address public proToken;

    /// @notice ProTokenPlus contract — the only caller allowed to give/take.
    address public proTokenPlus;

    /// @notice ProTokenOperations contract — target of the privileged strategic mint/unmint.
    address public proTokenOperations;

    /// @notice proUSD available for the strategist to borrow; reduced by borrow and by yield settled out.
    uint256 public depositProUSD;

    /// @notice USD worth (base) available to borrow against — the borrow ceiling.
    uint256 public depositBase;

    /// @notice proUSD reserved for pending user withdrawals; fed by repay, consumed by take and by yield settled out.
    uint256 public withdrawProUSD;

    /// @notice USD worth (base) reserved for pending withdrawals; mirror of withdrawProUSD.
    uint256 public withdrawBase;

    /// @notice proUSD banked as price-appreciation yield; admin-claimable, price-independent once banked.
    uint256 public growthProUSD;

    /// @notice proUSD price at last settlement; monotonic ratchet (only increases).
    uint256 public lastPrice;

    /// @notice Fixed admin-set sink for claimYield (permissionless trigger, fixed recipient).
    address public yieldRecipient;

    /// @notice Base denominated worth commited to ACTIVE unbonding oligations.
    uint256 public earmarkedWithdrawBase;

    /// @notice Reserved storage for future upgrades.
    uint256[38] private __gap;
}