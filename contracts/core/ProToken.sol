// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "./interfaces/IProToken.sol";
import "./interfaces/IProTokenSettings.sol";
import "./interfaces/IVersioned.sol";

/**
 * @title ProToken
 * @author Promis Team
 * @notice ERC20 (18 decimals, EIP-2612 permit) mintable and burnable by the
 *         primary minter (ProTokenOperations) and by admin-approved bridge
 *         minters (cross-chain token pools / adapters).
 */
contract ProToken is
    ERC20Upgradeable,
    ERC20PermitUpgradeable,
    UUPSUpgradeable,
    IProToken,
    IVersioned
{
    /// @notice Implementation version (v1.0.0).
    uint256 public constant VERSION = 1_00_00;

    /// @notice Minimum allowed USD price (1 USD, 18 decimals); 0 is also allowed to disable.
    uint256 public constant MIN_USD_PRICE = 1e18;

    /// @notice Default USD price set at initialization (1 USD, 18 decimals).
    uint256 public constant DEFAULT_USD_PRICE = 1e18;

    /// @notice Default minimum interval between operator price updates.
    uint256 public constant DEFAULT_PRICE_UPDATE_COOLDOWN = 23 hours;

    /// @notice Default maximum distance `_startTime` may be ahead of block.timestamp in
    ///         updateUSDPrice, wide enough for cross-chain confirmation lag but short enough
    ///         that a mis-submitted segment can't freeze the price for long.
    uint256 public constant DEFAULT_MAX_START_TIME_AHEAD = 20 minutes;

    /// @notice Minimum allowed ramp duration for updateUSDPrice segments.
    uint256 public constant MIN_RAMP_PERIOD = 1 minutes;

    /// @notice Maximum allowed ramp duration for updateUSDPrice segments.
    uint256 public constant MAX_RAMP_PERIOD = 7 days;

    /// @notice ProTokenSettings contract, source of admin/operator roles.
    address private proTokenSettings;

    /// @notice Address authorized to mint and burn (typically ProTokenOperations).
    address private minter;

    /// @notice Price (WAD, 18 decimals) at the start of the current segment.
    uint256 private inPrice;

    /// @notice Price (WAD, 18 decimals) at the end of the current segment;
    ///         0 means disabled (getUSDPrice reverts).
    uint256 private futurePrice;

    /// @notice Unix timestamp the current segment started at.
    uint64 private startTime;

    /// @notice Ramp duration of the current segment, in seconds; 0 = flat/instant
    ///         segment (used for the bootstrap state and for admin's setUSDPrice).
    uint64 private period;

    /// @notice Increase step size of USD price allowed (0 means steps disabled).
    uint256 private stepSize;

    /// @notice Minimum interval between operator price updates (0 disables the cooldown).
    uint256 private priceUpdateCooldown;

    /// @notice Maximum distance `_startTime` may be ahead of block.timestamp in updateUSDPrice.
    uint256 private maxStartTimeAhead;

    /// @notice Timestamp of the last operator price update (updateUSDPrice).
    uint256 private lastPriceUpdateAt;

    /// @notice Authorized to mint/burn (cross-chain).
    mapping(address => bool) private bridgeMinters;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Emitted when a bridge minter is added or removed.
    event BridgeMinterSet(address indexed bridgeMinter, bool allowed);

    /**
     * @notice Initializes the token with name, symbol, settings, and minter.
     * @param _name Token name.
     * @param _symbol Token symbol.
     * @param _proTokenSettings ProTokenSettings contract address.
     * @param _minter Address authorized to mint and burn (ProTokenOperations).
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        address _proTokenSettings,
        address _minter
    ) external initializer {
        __ERC20_init(_name, _symbol);
        __ERC20Permit_init(_name);
        __UUPSUpgradeable_init();

        if (_minter == address(0)) revert ZeroAddress();
        if (_proTokenSettings == address(0)) revert ZeroAddress();

        minter = _minter;
        proTokenSettings = _proTokenSettings;

        // Bootstrap segment: the one place a zero-length (flat) segment is
        // written directly, rather than through updateUSDPrice.
        inPrice = DEFAULT_USD_PRICE;
        futurePrice = DEFAULT_USD_PRICE;
        startTime = uint64(block.timestamp);
        period = 0;

        priceUpdateCooldown = DEFAULT_PRICE_UPDATE_COOLDOWN;
        maxStartTimeAhead = DEFAULT_MAX_START_TIME_AHEAD;

        lastPriceUpdateAt = block.timestamp;

        emit MinterSet(address(0), _minter);
        emit USDPriceSet(0, DEFAULT_USD_PRICE);
        emit PriceUpdateCooldownChanged(0, DEFAULT_PRICE_UPDATE_COOLDOWN);
        emit MaxStartTimeAheadChanged(0, DEFAULT_MAX_START_TIME_AHEAD);
    }

    /// @notice Restricts access to the admin.
    modifier onlyAdmin() {
        IProTokenSettings ownerSource = IProTokenSettings(proTokenSettings);
        if (msg.sender != ownerSource.getAdmin()) revert NotAdmin();
        _;
    }

    /// @notice Restricts access to the price operator.
    modifier onlyPriceOperator() {
        IProTokenSettings ownerSource = IProTokenSettings(proTokenSettings);
        if (
            msg.sender != ownerSource.getPriceOperator()
        ) revert NotPriceOperator();
        _;
    }

    /// @notice Restricts access to the primary minter or an approved bridge minter.
    modifier onlyMinter() {
        if (msg.sender != minter && !bridgeMinters[msg.sender]) revert NotMinter();
        _;
    }

    /// @inheritdoc IProToken
    function setMinter(address newMinter) external override onlyAdmin {
        if (newMinter == address(0)) revert ZeroAddress();
        if (newMinter == minter) revert SameAddress();

        address oldMinter = minter;
        minter = newMinter;

        emit MinterSet(oldMinter, newMinter);
    }

    /// @inheritdoc IProToken
    function setBridgeMinter(address bridgeMinter, bool allowed) external override onlyAdmin {
        if (bridgeMinter == address(0)) revert ZeroAddress();

        bridgeMinters[bridgeMinter] = allowed;

        emit BridgeMinterSet(bridgeMinter, allowed);
    }

    /// @inheritdoc IProToken
    /// @dev Admin's arbitrary override ("manual correction, emergency override"): applied
    ///      as a flat, zero-length segment (`period = 0`) so it takes effect in the
    ///      same block, exactly like the old instant-set behaviour. Setting `_price == 0`
    ///      disables the feed; `futurePrice == 0` is what `getUSDPrice`/`updateUSDPrice`
    ///      check to detect that state.
    function setUSDPrice(uint256 _price) external override onlyAdmin {
        if (_price < MIN_USD_PRICE && _price != 0) revert InvalidPrice();

        uint256 old = _currentPrice();

        inPrice = _price;
        futurePrice = _price;
        startTime = uint64(block.timestamp);
        period = 0;

        lastPriceUpdateAt = block.timestamp;

        emit USDPriceSet(old, _price);
    }

    /// @inheritdoc IProToken
    /// @dev Linear on-chain price interpolation, oracle-driven multichain segment. The oracle
    ///      computes one `(_price, _startTime, _period)` tuple off-chain and submits the
    ///      identical calldata to every chain, so `getUSDPrice()` ramps along the exact same
    ///      curve everywhere regardless of each chain's own confirmation timing.
    ///
    ///      The new segment's `inPrice` is not a caller-supplied value — it's set automatically
    ///      to the *previous* segment's `futurePrice`. That previous `futurePrice` was itself
    ///      written by an earlier identical cross-chain call (all the way back to the
    ///      constructor's bootstrap price), so every chain that has applied the same sequence of
    ///      updates derives the identical `inPrice` locally, with nothing left to trust from the
    ///      caller. The same monotonicity/step-size checks that gate `_price` do double duty as
    ///      the segment-shape guarantee (`futurePrice >= inPrice` always holds) — there's no
    ///      separate `inPrice` input that could disagree with them.
    ///
    ///      Segments can never overlap, so a new segment always starts from the previous one's
    ///      completed `futurePrice`, never from a mid-ramp jump — `inPrice` reflects a
    ///      fully-settled prior price, always. This falls out of two independent checks rather
    ///      than a single explicit "no overlap" comparison:
    ///        1. SegmentInProgress: the call itself is rejected while the current segment is
    ///           still ramping (`block.timestamp < startTime + period`) — otherwise the call
    ///           would immediately collapse `_currentPrice()` to the old segment's `futurePrice`
    ///           for the gap until `_startTime` is reached, a visible jump-then-freeze.
    ///           `updateUSDPrice` is only ever callable once the previous segment has fully
    ///           settled in wall-clock time, i.e. once `block.timestamp >= startTime + period`.
    ///        2. StartTimeInPast: `_startTime` must be `>= block.timestamp`.
    ///      Together these force `_startTime >= startTime + period` (the current segment's own
    ///      end) as a corollary, without needing to check it directly — no overlap, no replay of
    ///      a stale `_startTime`, ever. For a flat segment (`period == 0`), its end coincides
    ///      with its start, so a new segment may begin at that same instant. `_period` must fall
    ///      within [MIN_RAMP_PERIOD, MAX_RAMP_PERIOD].
    ///
    ///      A backdated `_startTime` is never valid (StartTimeInPast) — there's no ambiguity
    ///      between "part of the ramp already elapsed" and "the whole ramp was skipped"; the
    ///      oracle always computes `_startTime` as now-plus-buffer, wide enough to cover the
    ///      slowest chain's confirmation lag, and a chain that misses even that buffer simply
    ///      reverts and gets resubmitted. `_startTime` is also capped at
    ///      `block.timestamp + maxStartTimeAhead` (reverts StartTimeTooFarInFuture, admin-tunable
    ///      via setMaxStartTimeAhead, default DEFAULT_MAX_START_TIME_AHEAD) so a mis-submitted
    ///      segment can't freeze the price indefinitely — the next update must itself start at or
    ///      after `_startTime + _period`.
    function updateUSDPrice(
        uint256 _price,
        uint64 _startTime,
        uint64 _period
    ) external override onlyPriceOperator {
        if (_price < MIN_USD_PRICE && _price != 0) revert InvalidPrice();
        if (_period < MIN_RAMP_PERIOD || _period > MAX_RAMP_PERIOD) revert InvalidRampPeriod();

        if (_startTime < block.timestamp) revert StartTimeInPast(_startTime, block.timestamp);
        if (uint256(_startTime) > block.timestamp + maxStartTimeAhead) {
            revert StartTimeTooFarInFuture(_startTime, block.timestamp);
        }

        if (block.timestamp < startTime + period) {
            revert SegmentInProgress(startTime + period, block.timestamp);
        }

        uint256 availableAt = lastPriceUpdateAt + priceUpdateCooldown;
        if (block.timestamp < availableAt) {
            revert PriceUpdateCooldownActive(availableAt, block.timestamp);
        }

        uint256 old = futurePrice;
        if (old == 0) revert USDPriceDisabled();
        if (_price <= old) revert PriceNotIncreasing();
        if (stepSize != 0 && _price - old > stepSize) revert PriceStepSizeExceeded();

        inPrice = old;
        futurePrice = _price;
        startTime = _startTime;
        period = _period;

        lastPriceUpdateAt = block.timestamp;

        emit USDPriceUpdated(old, _price);
    }

    /// @inheritdoc IProToken
    function setStepSize(uint256 _stepSize) external override onlyAdmin {

        uint256 old = stepSize;
        stepSize = _stepSize;

        emit StepSizeChanged(old, _stepSize);
    }

    /**
     * @notice Sets the minimum interval between operator price updates.
     * @dev A value of 0 disables the cooldown. Does not reset the running
     *      cooldown window from the last update.
     * @param _cooldown New cooldown in seconds.
     */
    function setPriceUpdateCooldown(uint256 _cooldown) external override onlyAdmin {
        uint256 old = priceUpdateCooldown;
        priceUpdateCooldown = _cooldown;

        emit PriceUpdateCooldownChanged(old, _cooldown);
    }

    /// @inheritdoc IProToken
    /// @dev Only callable by the admin. Bounds how far ahead of block.timestamp `_startTime`
    ///      may be set in updateUSDPrice (reverts StartTimeTooFarInFuture beyond it).
    function setMaxStartTimeAhead(uint256 _maxStartTimeAhead) external override onlyAdmin {
        uint256 old = maxStartTimeAhead;
        maxStartTimeAhead = _maxStartTimeAhead;

        emit MaxStartTimeAheadChanged(old, _maxStartTimeAhead);
    }

    /// @inheritdoc IProToken
    function mint(address to, uint256 amount) external override onlyMinter {
        if (amount == 0) revert InvalidAmount();
        _mint(to, amount);

        emit Minted(to, amount, msg.sender);
    }

    /// @inheritdoc IProToken
    function burn(address from, uint256 amount) external override onlyMinter {
        if (amount == 0) revert InvalidAmount();
        _burn(from, amount);

        emit Burned(from, amount, msg.sender);
    }

    /// @inheritdoc IProToken
    function getMinter() external view override returns (address) {
        return minter;
    }

    /// @inheritdoc IProToken
    /// @dev Pure function of the current segment and block.timestamp; no accumulator, no
    ///      crank. Reverts if the feed has been disabled via setUSDPrice(0).
    function getUSDPrice() external view override returns (uint256) {
        if (futurePrice == 0) revert USDPriceDisabled();
        return _currentPrice();
    }

    /// @notice Current interpolated price (WAD, 1e18) for the active segment, with no
    ///         disabled-check. Guards the `block.timestamp < startTime` underflow a naive
    ///         `block.timestamp - startTime` formula would have. Every stored segment has
    ///         `futurePrice >= inPrice` (enforced at updateUSDPrice ingestion; setUSDPrice and
    ///         the bootstrap segment are always flat, `inPrice == futurePrice`), so the curve is
    ///         monotonically non-decreasing and needs only one branch for the ramp itself.
    function _currentPrice() private view returns (uint256) {
        if (block.timestamp <= startTime) return inPrice;

        uint256 endTime = startTime + period;
        if (block.timestamp >= endTime) return futurePrice;

        uint256 elapsed = block.timestamp - startTime;
        return inPrice + (futurePrice - inPrice) * elapsed / period;
    }

    /// @notice Returns the raw active segment, for consumers that need the full curve, e.g.
    ///         to read `futurePrice` without waiting for the ramp to finish.
    function getUSDPriceSegment() external view returns (
        uint256 _inPrice,
        uint256 _futurePrice,
        uint64  _startTime,
        uint64  _period
    ) {
        return (inPrice, futurePrice, startTime, period);
    }

    /// @notice Returns the current price update cooldown in seconds.
    function getPriceUpdateCooldown() external view returns (uint256) {
        return priceUpdateCooldown;
    }

    /// @notice Returns the current max start-time-ahead bound (seconds) for updateUSDPrice.
    function getMaxStartTimeAhead() external view returns (uint256) {
        return maxStartTimeAhead;
    }

    /// @notice Returns the timestamp of the last operator price update.
    function getLastPriceUpdateAt() external view returns (uint256) {
        return lastPriceUpdateAt;
    }

    /// @inheritdoc IProToken
    function getProTokenSettings() external view override returns (address) {
        return proTokenSettings;
    }

    /// @inheritdoc IProToken
    function getCCIPAdmin() external view override returns (address) {
        return IProTokenSettings(proTokenSettings).getBridgeAdmin();
    }
    /// @inheritdoc IProToken
    function isBridgeMinter(address account) external view override returns (bool) {
        return bridgeMinters[account];
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
