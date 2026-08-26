// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

/// @title IStrategyVault
/// @author Promis Team
/// @notice Interface for the StrategyVault — custodies proUSD deposited via ProTokenPlus
///         and lets a strategist borrow the recorded USD worth into a yAsset.
interface IStrategyVault {
    // ================================================
    // ==================== Errors ====================
    // ================================================
    error ZeroAddress();
    error ZeroAmount();
    error NotAdmin();
    error NotAdminOrOperator();
    error NotStrategist();
    error NotProTokenPlus();
    error SameAddress();
    error ExceedsRecordedUSD(uint256 requested, uint256 available);
    error WithdrawReserveUnderfunded(uint256 requested, uint256 reserve);
    error InsufficientVaultBalance(uint256 needed, uint256 held);
    error NoYieldAvailable();
    error PriceUnavailable();
    error RotateUnderfunded(uint256 requested, uint256 available);
    error YieldRecipientNotSet();
    error ExceedsClaimableYield(uint256 requested, uint256 available);
    error InsufficientDepositProUSD();
    error NotAMarkdown(uint256 livePrice, uint256 lastPrice);
    error CoverExceedsDeficit(uint256 depositInput, uint256 depositRequired, uint256 withdrawInput, uint256 withdrawRequired);

    // ================================================
    // ==================== Events ====================
    // ================================================
    event Given(
        address indexed from,
        uint256 proUSDAmount,
        uint256 worthBase
    );
    event Taken(
        address indexed from,
        uint256 proUSDAmount,
        uint256 worthBase
    );
    event Regiven(
        address indexed from,
        uint256 proUSDAmount,
        uint256 worthBase
    );
    event RegivenAsync(
        address indexed from,
        uint256 proUSDAmount,
        uint256 worthBase
    );
    event Borrowed(
        address indexed strategist,
        address indexed yAsset,
        address indexed destination,
        uint256 amountBase,
        uint256 proUSDBurned,
        uint256 yAssetReceived
    );
    event Repaid(
        address indexed strategist,
        address indexed yAsset,
        uint256 yAssetAmount,
        uint256 proUSDMinted,
        uint256 usdValue
    );
    event Rotated(
        address indexed rotator, 
        uint256 indexed proUSDAmount, 
        uint256 indexed worthBase
    );
    event GrowthWithdrawn(
        address indexed admin,
        address indexed to,
        uint256 proUSDAmount
    );
    event YieldAccrued(uint256 proUSDBanked, uint256 atPrice);
    event ProTokenPlusSet(address indexed previous, address indexed current);
    event ProTokenOperationsSet(address indexed previous, address indexed current);
    event YieldRecipientSet(address indexed previous, address indexed current);
    event YieldClaimed(address indexed caller, address indexed recipient, uint256 amount);
    event Earmarked(address indexed from, uint256 worthBase, uint256 totalEarmarked);
    event PriceMarkedDown(uint256 oldPrice, uint256 newPrice, uint256 depositShortfall, uint256 withdrawShortfall);
    event Covered(address indexed caller, uint256 toDepositPool, uint256 toWithdrawPool);

    // ================================================
    // ============= ProTokenPlus-only ================
    // ================================================

    /// @notice Records proUSD forwarded from ProTokenPlus on a finalized deposit.
    /// @dev Caller must already have transferred `proUSDAmount` to this vault. The
    ///      `worthBase` is the same value ProTokenPlus booked the position at (worthBase),
    ///      so both ledgers agree and no extra oracle read is needed.
    /// @param proUSDAmount Amount of proUSD now held by the vault for this deposit
    /// @param worthBase USD worth of the deposit at booking time (18 decimals)
    function give(uint256 proUSDAmount, uint256 worthBase) external;

    /// @notice Returns proUSD to ProTokenPlus to pay a user withdrawal, from the
    ///         SEGREGATED withdraw reserve only. Reverts if the reserve is underfunded.
    ///         Never touches depositProUSD / depositUSD.
    /// @param proUSDAmount proUSD tokens to send to ProTokenPlus
    /// @param worthBase USD worth of the withdrawal (principal + rewards)
    function take(
        uint256 proUSDAmount,
        uint256 worthBase
    ) external;

    /// @notice Records locked rewards forwarded (supposedly) from ProTokenPlus on a relock.
    /// @dev Caller is not transfering proUSD amount since Strategist already have them.
    ///      Only data needs to be updated since lockedRewards are part of principle.
    /// @param worthBase USD worth of the supposed deposit at booking time (18 decimals)
    function regive(
        uint256 worthBase
    ) external;

    /// @notice Reserves withdraw-pool capacity for an unbonding that just started,
    ///         protecting it from regive()/rotate() until take() settles the exit.
    /// @dev Called by ProTokenPlus from the initiate-withdraw path with the same
    ///      base amount the unbonding was booked at. Base-denominated so the
    ///      commitment is price-invariant; the token cost of serving it floats
    ///      with price and is enforced at take().
    /// @param worthBase USD base worth of the newly initiated unbonding.
    function earmark(
        uint256 worthBase
    ) external;

    // ================================================
    // ============== Strategist-only =================
    // ================================================

    /// @notice Borrows recorded USD worth: redeems proUSD into `yAsset`,
    ///         bypassing the unmint batch/unbonding wait, and sends it to `destination`.
    /// @dev Borrows recorded USD worth. Converts the requested USD into a proUSD
    ///      amount at the current price, transfers that proUSD to ProTokenOperations,
    ///      and triggers the privileged strategic unmint. The redeem burns the proUSD,
    ///      sources the yAsset (pulling from yield handlers on a shortfall), and sends
    ///      it to `destination`.
    ///
    ///      Because proUSD appreciates, the proUSD burned to satisfy `amountBase` is
    ///      typically less than the proUSD originally booked for that USD — the
    ///      remainder stays in the vault as yield. Ledgers are reduced by the proUSD
    ///      actually consumed and by the USD drawn.
    /// @param amountBase USD worth to borrow (18 decimals); must be <= depositUSD
    /// @param yAsset The deposit asset to receive (e.g. USDT)
    /// @param destination Address that receives the yAsset
    /// @return yAssetReceived Amount of yAsset sent to destination
    function borrow(
        uint256 amountBase,
        address yAsset,
        address destination
    ) external returns (uint256 yAssetReceived);

    /// @notice Strategist refunds the vault to cover pending user withdrawals. States a
    ///         USD target; the vault derives the yAsset needed (via Operations' quote),
    ///         pulls it, mints proUSD, and adds it to the SEGREGATED withdraw reserve —
    ///         not the strategist-drawable backing pool.
    /// @param yAsset The deposit asset being returned
    /// @param yAssetAmount Amount of yAsset to pull from the strategist and mint into the reserve (yAsset decimals).
    /// @return proUSDMinted proUSD minted into the reserve
    function repay(
        uint256 yAssetAmount,
        address yAsset
    ) external returns (uint256 proUSDMinted);

    // ================================================
    // ============== Admin-only ======================
    // ================================================
    function setProTokenPlus(address proTokenPlus) external;
    function setProTokenOperations(address proTokenOperations) external;
    function setYieldRecipient(address recipient) external;

    /// @notice Shuffles worthBase from the withdraw reserve into the deposit pool,
    ///         settling regives that were previously deferred via RegivenAsync.
    /// @dev Only callable by admin/operator. Computes the proUSD side from
    ///      worthBase at current lastPrice, then moves both from withdraw to deposit.
    ///      Reverts if the withdraw reserve cannot cover either side.
    ///
    ///      Pricing: proUSD is derived live at rotate time, not stored from regive
    ///      time, keeping rotate consistent with the yield ratchet.
    ///
    ///      Backend accounting: sum RegivenAsync.worthBase events, subtract
    ///      Rotated.worthBase events, and pass the delta (or a portion) as worthBase.
    ///
    /// @param worthBase Base worth to move from withdraw pool to deposit pool.
    function rotate(uint256 worthBase) external ;

    /// @notice Re-anchors the yield ratchet to the current live price after admin sets
    ///         decreasing price (e.g. backing-asset slash at an external venue).
    ///         Any appreciation observed but not yet settled above lastPrice is deliberately 
    ///         forfeited by the re-anchor.
    /// @dev Call AFTER ProToken.setUSDPrice has lowered the live price. Reads the
    ///      price itself — no parameter to fat-finger. Does NOT move tokens between
    ///      pools; it measures and emits the per-pool token shortfalls created by
    ///      the markdown, which the treasury feeds via cover(). Pools remain
    ///      under-backed until cover lands, so run the full sequence under pause:
    ///      pause → setUSDPrice → markdownPrice → cover → unpause. (Preferably in one batch)
    function markdownPrice() external returns (uint256 depositShortfall, uint256 withdrawShortfall);

    /// @notice Feeds proUSD into pools left under-backed by a price markdown,
    ///         capped by the deficits the last markdownPrice() recorded.
    /// @dev Tokens are transferred in from the caller — this INCREASES held,
    ///      unlike an internal reallocation — so the solvency invariant
    ///      (held >= depositProUSD + growthProUSD + withdrawProUSD) is
    ///      preserved by construction. Books into the token pools WITHOUT
    ///      touching the base ledgers: the base obligations didn't change in
    ///      the slash, only their token backing did.
    ///
    ///      Each side is capped at its recorded deficit and reverts
    ///      CoverExceedsDeficit above it. The cap exists because excess tokens
    ///      in depositProUSD beyond depositBase/price are UNREACHABLE — borrow
    ///      draws at most base/price and the ratchet frees only need-deltas —
    ///      so an uncapped over-feed would strand treasury funds permanently.
    ///      Consequence: cover is slash-scoped, not a generic top-up hook; it
    ///      reverts whenever no markdown has recorded a deficit. (The withdraw
    ///      reserve's generic funding path remains repay().)
    ///
    ///      Partial covers are supported: the remaining deficit stays readable
    ///      on-chain (depositDeficit / withdrawDeficit), so later tranches are
    ///      sized from the view, no event indexing required.
    /// @param toDepositPool proUSD to book into depositProUSD (<= depositDeficit)
    /// @param toWithdrawPool proUSD to book into withdrawProUSD (<= withdrawDeficit)
    function cover(uint256 toDepositPool, uint256 toWithdrawPool) external;

    /// @notice Sweeps strategist-generated yield — proUSD held in excess of all tracked
    ///         obligations — to the fixed yieldRecipient.
    /// @dev Does NOT touch depositProUSD, growthProUSD. The claimable
    ///      surplus is added to withdrawProUSD on repay:
    ///        held − (depositProUSD + growthProUSD)
    ///      which is proUSD that entered the vault above every earmarked pool (e.g. the
    ///      strategist returning more than the reserve accounting booked). Reverts if the
    ///      requested amount exceeds that surplus, so a claim can never reach into backing,
    ///      banked appreciation.
    /// @param amount proUSD to claim (must be <= claimableYield())
    /// @return claimed Amount of proUSD sent to yieldRecipient
    function claimYield(uint256 amount) external returns (uint256 claimed);

    /// @notice Admin-only or Operator: withdraw accrued proUSD appreciation yield.
    /// @dev Only admin/operator. Settles first to capture appreciation up to the current price,
    ///      then pays from yieldProUSD — never from depositProUSD, so user
    ///      obligations are untouched. Passing 0 or an amount >= banked withdraws all.
    /// @param to Recipient of the yield proUSD
    /// @param proUSDAmount Amount to withdraw (0 = all available)
    /// @return withdrawn Amount of proUSD sent
    function claimGrowth(
        address to,
        uint256 proUSDAmount
    ) external returns (uint256 withdrawn);
    // ================================================
    // ================ View functions ================
    // ================================================

    /// @notice Banked yield plus appreciation not yet settled, in proUSD tokens.
    function claimableGrowth() external view returns (uint256);
}
