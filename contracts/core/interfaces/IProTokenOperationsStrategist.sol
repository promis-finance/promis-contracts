// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

/// @title IProTokenOperationsStrategist
/// @author Promis Team
/// @notice Interface fragment for the privileged StrategyVault redeem path on
///         ProTokenOperations. Kept separate so the StrategyVault can depend only
///         on the function it needs.
/// @dev In practice this can be folded into IProTokenOperations; shown standalone
///      here to keep the change surface obvious.
interface IProTokenOperationsStrategist {
    /// @notice Instant redeem of proUSD into a yAsset, callable only by the StrategyVault.
    /// @dev Bypasses the unmint batch/unbonding mechanism entirely. proUSD must already
    ///      be held by ProTokenOperations (the vault transfers it in before calling, or
    ///      ProTokenOperations pulls it — see implementation note in the diff). Burns the
    ///      proUSD, sources the yAsset from reserves and pulls from yield handlers on a
    ///      shortfall, then transfers the yAsset to `destination`.
    /// @param yAsset The deposit asset to redeem into
    /// @param proUSDAmount The proUSD amount to burn
    /// @param destination Recipient of the yAsset
    /// @return yAssetReceived Amount of yAsset transferred to destination
    function strategicUnmint(
        address yAsset,
        uint256 proUSDAmount,
        address destination
    ) external returns (uint256 yAssetReceived);

    /// @notice Instant mint of proUSD against a returned yAsset, callable only by the
    ///         StrategyVault. Mirror of strategistRedeem — used to refund the vault so
    ///         user withdrawals can be paid.
    /// @dev Bypasses the mint request/proof mechanism. The yAsset is pulled from the
    ///      caller (the vault, which has approved this contract) and routed to the
    ///      yOperationsHandler exactly like a normal mint; the freshly minted proUSD is
    ///      sent to `proUSDRecipient` (the vault). The minted proUSD amount is computed
    ///      from the yAsset's USD worth at the current price.
    /// @param yAssetAmount Amount of yAsset being returned
    /// @param yAsset The deposit asset being returned (e.g. USDT)
    /// @return proUSDMinted Amount of proUSD minted to proUSDRecipient
    function strategicMint(
        uint256 yAssetAmount,
        address yAsset
    ) external returns (uint256 proUSDMinted);
}
