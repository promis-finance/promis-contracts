// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./state/StrategyVaultState.sol";
import "./interfaces/IStrategyVault.sol";
import "../../core/interfaces/IProToken.sol";
import "../../core/interfaces/IProTokenSettings.sol";
import "../../core/interfaces/IProTokenOperationsStrategist.sol";
import "../../core/interfaces/IProTokenOperations.sol";
import "../../core/interfaces/IVersioned.sol";
import "../../core/types/ProTokenSettingsTypes.sol";

/**
 * @title StrategyVault
 * @author Promis Team
 * @notice Custodies proUSD deposited through ProTokenPlus and lets a strategist borrow
 *         the recorded USD worth as a yAsset, repaying into a segregated withdrawal reserve.
 * @dev UUPS upgradeable, reentrancy-guarded. Holds proUSD, which appreciates in USD value;
 *      the strategist may borrow only up to the USD worth recorded at deposit, so
 *      appreciation beyond that stays in the vault as protocol yield.
 *
 *      CUSTODY MODEL:
 *      - ProTokenPlus forwards proUSD here on each finalized deposit and calls give(),
 *        booking depositProUSD / depositBase.
 *      - For user withdrawals, ProTokenPlus pulls proUSD back via take() during unbonding,
 *        consuming the strategist-funded withdraw reserve (withdrawProUSD / withdrawBase).
 *      - The strategist borrow()s proUSD into a yAsset via the privileged
 *        ProTokenOperations.strategicUnmint() path, and repay()s yAsset back into the reserve.
 */
contract StrategyVault is
    StrategyVaultState,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable,
    IStrategyVault,
    IVersioned
{
    using SafeERC20 for IERC20;

    /// @notice Implementation version (v1.0.0)
    uint256 public constant VERSION = 1_00_00;

    /// @notice USD precision (18 decimals)
    uint256 private constant USD_PRECISION = 1e18;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize the vault
    /// @param _proTokenSettings ProTokenSettings address (admin/operator source)
    /// @param _proTokenPlus ProTokenPlus address (only depositor)
    function initialize(
        address _proTokenSettings,
        address _proTokenPlus
    ) external initializer {
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        if (
            _proTokenSettings == address(0) ||
            _proTokenPlus == address(0)
        ) revert ZeroAddress();

        proTokenSettings = _proTokenSettings;
        proTokenPlus = _proTokenPlus;
        
        ProTokenSettingsTypes.GetProTokenInfoResponse memory proTokenInfo =
            IProTokenSettings(proTokenSettings).getProTokenInfo();

        proToken = proTokenInfo.proToken;
        proTokenOperations = proTokenInfo.proTokenOperations;

        // Seed the yield ratchet so the first settlement banks only appreciation. 
        // Tolerant of disabled price at deploy time: first live settlement seeds it.
        lastPrice = _tryGetPrice();
    }

    // ================================================
    // =================== Modifiers ==================
    // ================================================

    modifier onlyAdmin() {
        if (msg.sender != IProTokenSettings(proTokenSettings).getAdmin())
            revert NotAdmin();
        _;
    }

    modifier onlyStrategist() {
        if (msg.sender != IProTokenSettings(proTokenSettings).getStrategist()) revert NotStrategist();
        _;
    }

    modifier onlyProTokenPlus() {
        if (msg.sender != proTokenPlus) revert NotProTokenPlus();
        _;
    }

    // ================================================
    // ============ Yield settlement ==================
    // ================================================

    /// @notice Banks proUSD appreciation since last settlement, then advances price ratchet. 
    /// @dev Must run BEFORE any function changes depositProUSD, depositBase, withdrawProUSD 
    ///      or withdrawBase.    
    ///      Monotonic ratchet: if price has not risen above lastPrice, nothing is banked
    ///      and lastPrice is left untouched (a dip is deferred until price recovers).
    ///      When price rises, the proUSD freed from each USD obligation — because each
    ///      token now backs more USD — is moved into growthProUSD. 
    ///      BOTH pools accrue:
    ///        - depositProUSD against depositBase (strategist-drawable obligation)
    ///        - withdrawProUSD against withdrawBase (pending user-withdrawal obligation)
    ///      Each pool only needs its USD worth of proUSD; appreciation above that is
    ///      protocol yield. Banked tokens are price-independent thereafter.
    function _accrueGrowth() internal {
        // When proUSD price is disabled (getUSDPrice would revert with USDPriceDisabled), 
        // skip settlement entirely rather than bricking every state-changing path — 
        // including user withdrawals via returnToProTokenPlus.
        // Skipping is safe: it only defers banking appreciation until price is live again,
        // and the ratchet (lastPrice) is left untouched so nothing is lost.
        uint256 currentPrice = _tryGetPrice();
        if (currentPrice == 0) return;

        // First live settlement after a price-disabled deploy: lastPrice is 0, just seed it.
        if (lastPrice == 0) {
            lastPrice = currentPrice;
            return;
        }
        if (currentPrice <= lastPrice) return;

        uint256 totalFreed;

        // --- Backing pool: appreciation above what depositBase requires ---
        if (depositProUSD > 0 && depositBase > 0) {
            uint256 backingNeededLast = (depositBase * USD_PRECISION) / lastPrice;
            uint256 backingNeededNow = (depositBase * USD_PRECISION) / currentPrice;

            uint256 freedBacking = backingNeededLast > backingNeededNow
                ? backingNeededLast - backingNeededNow
                : 0;
            if (freedBacking > depositProUSD) freedBacking = depositProUSD;

            if (freedBacking > 0) {
                depositProUSD -= freedBacking;
                totalFreed += freedBacking;
            }
        }

        // --- Withdraw reserve: appreciation above what withdrawBase requires ---
        if (withdrawProUSD > 0 && withdrawBase > 0) {
            uint256 reserveNeededLast = (withdrawBase * USD_PRECISION) / lastPrice;
            uint256 reserveNeededNow = (withdrawBase * USD_PRECISION) / currentPrice;

            uint256 freedReserve = reserveNeededLast > reserveNeededNow
                ? reserveNeededLast - reserveNeededNow
                : 0;
            if (freedReserve > withdrawProUSD) freedReserve = withdrawProUSD;

            if (freedReserve > 0) {
                withdrawProUSD -= freedReserve;
                totalFreed += freedReserve;
            }
        }

        if (totalFreed > 0) {
            growthProUSD += totalFreed;
            emit YieldAccrued(totalFreed, currentPrice);
        }

        lastPrice = currentPrice;
    }

    /// @dev Reads proUSD price, returning 0 instead of reverting when price is disabled.
    ///      Lets settlement and yield views degrade gracefully while price is 0, instead
    ///      of propagating USDPriceDisabled through every interaction.
    function _tryGetPrice() internal view returns (uint256) {
        try IProToken(proToken).getUSDPrice() returns (uint256 p) {
            return p;
        } catch {
            return 0;
        }
    }

    // ================================================
    // ============= ProTokenPlus-only ================
    // ================================================

    /// @inheritdoc IStrategyVault
    function give(
        uint256 amount,
        uint256 worthBase
    ) external override onlyProTokenPlus nonReentrant {
        _accrueGrowth();

        if (amount == 0) revert ZeroAmount();

        depositProUSD += amount;
        depositBase += worthBase;

        IERC20(proToken).safeTransferFrom(msg.sender, address(this), amount);

        emit Given(msg.sender, amount, worthBase);
    }

    /// @inheritdoc IStrategyVault
    function take(
        uint256 proUSDAmount,
        uint256 worthBase
    ) external override onlyProTokenPlus nonReentrant {
        _accrueGrowth();

        if (proUSDAmount == 0) revert ZeroAmount();

        // Must be fully covered by the reserve the strategist pre-funded.
        if (proUSDAmount > withdrawProUSD)
            revert WithdrawReserveUnderfunded(proUSDAmount, withdrawProUSD);

        // Solvency invariant: take consumes only withdrawProUSD.
        uint256 held = IERC20(proToken).balanceOf(address(this));
        uint256 obligations = depositProUSD + growthProUSD + withdrawProUSD;
        if (held < obligations)
            revert InsufficientVaultBalance(obligations, held);

        // Consume the reserve (both the token pool and its USD ledger), clamping the
        // USD ledger so a withdrawal never reverts on accounting dust.
        withdrawProUSD -= proUSDAmount;
        withdrawBase = worthBase >= withdrawBase ? 0 : withdrawBase - worthBase;

        IERC20(proToken).safeTransfer(proTokenPlus, proUSDAmount);

        emit Taken(msg.sender, proUSDAmount, worthBase);
    }

    /// @inheritdoc IStrategyVault
    function regive(
        uint256 worthBase
    ) external override onlyProTokenPlus nonReentrant {
        _accrueGrowth();

        uint256 price = lastPrice;
        if (price == 0) revert PriceUnavailable();

        uint256 proUSDAmount = (worthBase * USD_PRECISION) / price;

        if (proUSDAmount > withdrawProUSD)
            revert RegiveUnderfunded(proUSDAmount, withdrawProUSD);
        if (worthBase > withdrawBase)
            revert RegiveUnderfunded(worthBase, withdrawBase);

        withdrawProUSD -= proUSDAmount;
        withdrawBase   -= worthBase;
        depositProUSD  += proUSDAmount;
        depositBase    += worthBase;

        emit Regiven(msg.sender, proUSDAmount, worthBase);
    }

    // ================================================
    // ============== Strategist-only =================
    // ================================================

    /// @inheritdoc IStrategyVault
    function borrow(
        uint256 amountBase,
        address yAsset,
        address destination
    ) external override onlyStrategist nonReentrant returns (uint256 yAssetReceived) {
        _accrueGrowth();

        if (amountBase == 0) revert ZeroAmount();
        if (yAsset == address(0) || destination == address(0))
            revert ZeroAddress();
        if (amountBase > depositBase)
            revert ExceedsRecordedUSD(amountBase, depositBase);

        // After settlement, depositProUSD holds exactly the proUSD backing depositBase. 
        uint256 price = lastPrice;
        if (price == 0) revert PriceUnavailable();
        uint256 proUSDToBurn = (amountBase * USD_PRECISION) / price;
        if (proUSDToBurn > depositProUSD) revert InsufficientDepositProUSD();
        if (proUSDToBurn == 0) revert ZeroAmount();

        // Solvency invariant: borrow consumes only depositProUSD.
        uint256 held = IERC20(proToken).balanceOf(address(this));
        uint256 obligations = depositProUSD + growthProUSD + withdrawProUSD;
        if (held < obligations)
            revert InsufficientVaultBalance(obligations, held);

        // Operations burns the proUSD directly from this vault.
        yAssetReceived = IProTokenOperationsStrategist(proTokenOperations)
            .strategicUnmint(yAsset, proUSDToBurn, destination);

        // Reduce obligations by the USD drawn; depositProUSD by proUSD burned.
        depositBase -= amountBase;
        depositProUSD -= proUSDToBurn;

        emit Borrowed(
            msg.sender,
            yAsset,
            destination,
            amountBase,
            proUSDToBurn,
            yAssetReceived
        );
    }

    /// @inheritdoc IStrategyVault
    function repay(
        uint256 yAssetAmount,
        address yAsset
    ) external override onlyStrategist nonReentrant returns (uint256 proUSDMinted) {
        _accrueGrowth();

        if (yAssetAmount == 0) revert ZeroAmount();
        if (yAsset == address(0)) revert ZeroAddress();
        if (lastPrice == 0) revert PriceUnavailable();

        // Pull exactly that yAsset from the strategist, forward to Operations to mint.
        IERC20(yAsset).safeTransferFrom(msg.sender, address(this), yAssetAmount);
        IERC20(yAsset).safeIncreaseAllowance(proTokenOperations, yAssetAmount);

        // minProUSDOut floor = proUSD worth of usdAmount at current price.
        proUSDMinted = IProTokenOperationsStrategist(proTokenOperations)
            .strategicMint(yAssetAmount, yAsset);
        
        // Derive the USD worth of what was minted, at the current (just-settled) price.
        // This is the reserve obligation the minted tokens cover.
        uint256 usdAmount = (proUSDMinted * lastPrice) / USD_PRECISION;

        // Feed the SEGREGATED reserve, not backing. withdrawBase tracks the USD target;
        // withdrawProUSD holds the minted tokens earmarked for user exits.
        withdrawProUSD += proUSDMinted;
        withdrawBase += usdAmount;

        emit Repaid(msg.sender, yAsset, yAssetAmount, proUSDMinted, usdAmount);
    }

    // ================================================
    // ============== Admin functions =================
    // ================================================

    /// @inheritdoc IStrategyVault
    function claimGrowth(
        address to,
        uint256 proUSDAmount
    ) external onlyAdmin nonReentrant returns (uint256 withdrawn) {
        _accrueGrowth();

        if (to == address(0)) revert ZeroAddress();

        uint256 available = growthProUSD;
        if (available == 0) revert NoYieldAvailable();

        withdrawn = (proUSDAmount == 0 || proUSDAmount > available)
            ? available
            : proUSDAmount;

        growthProUSD -= withdrawn;

        IERC20(proToken).safeTransfer(to, withdrawn);

        emit GrowthWithdrawn(msg.sender, to, withdrawn);
    }

    /// @inheritdoc IStrategyVault
    
    function claimYield(
        uint256 amount
    ) external override onlyAdmin returns (uint256 claimed) {
        _accrueGrowth();

        if (amount == 0) revert ZeroAmount();

        address recipient = yieldRecipient;
        if (recipient == address(0)) revert YieldRecipientNotSet();

        uint256 obligations = depositProUSD + growthProUSD;
        uint256 held = IERC20(proToken).balanceOf(address(this));
        uint256 available = held > obligations ? held - obligations : 0;

        if (amount > available) revert ExceedsClaimableYield(amount, available);

        claimed = amount;
        IERC20(proToken).safeTransfer(recipient, claimed);

        emit YieldClaimed(msg.sender, recipient, claimed);
    }

    /// @inheritdoc IStrategyVault
    function setProTokenPlus(
        address _proTokenPlus
    ) external override onlyAdmin {
        if (_proTokenPlus == address(0)) revert ZeroAddress();
        if (_proTokenPlus == proTokenPlus) revert SameAddress();
        address prev = proTokenPlus;
        proTokenPlus = _proTokenPlus;
        emit ProTokenPlusSet(prev, _proTokenPlus);
    }

    /// @inheritdoc IStrategyVault
    function setProTokenOperations(
        address _proTokenOperations
    ) external override onlyAdmin {
        if (_proTokenOperations == address(0)) revert ZeroAddress();
        if (_proTokenOperations == proTokenOperations) revert SameAddress();
        address prev = proTokenOperations;
        proTokenOperations = _proTokenOperations;
        emit ProTokenOperationsSet(prev, _proTokenOperations);
    }

    /// @inheritdoc IStrategyVault
    function setYieldRecipient(address recipient) external override onlyAdmin {
        if (recipient == address(0)) revert ZeroAddress();
        address prev = yieldRecipient;
        yieldRecipient = recipient;
        emit YieldRecipientSet(prev, recipient);
    }

    // ================================================
    // ================ View functions ================
    // ================================================

    /// @inheritdoc IStrategyVault
    function claimableGrowth() public view override returns (uint256) {
        uint256 currentPrice = _tryGetPrice();
        if (currentPrice <= lastPrice || lastPrice == 0) {
            return growthProUSD; // nothing new to bank
        }

        uint256 pending = 0;

        // Backing pool: appreciation above what depositBase requires.
        if (depositProUSD > 0 && depositBase > 0) {
            uint256 needLast = (depositBase * USD_PRECISION) / lastPrice;
            uint256 needNow = (depositBase * USD_PRECISION) / currentPrice;
            uint256 freed = needLast > needNow ? needLast - needNow : 0;
            if (freed > depositProUSD) freed = depositProUSD;
            pending += freed;
        }

        // Withdraw reserve: appreciation above what withdrawBase requires.
        if (withdrawProUSD > 0 && withdrawBase > 0) {
            uint256 needLast = (withdrawBase * USD_PRECISION) / lastPrice;
            uint256 needNow = (withdrawBase * USD_PRECISION) / currentPrice;
            uint256 freed = needLast > needNow ? needLast - needNow : 0;
            if (freed > withdrawProUSD) freed = withdrawProUSD;
            pending += freed;
        }

        return growthProUSD + pending;
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
