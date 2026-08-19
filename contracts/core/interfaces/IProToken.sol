// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

/// @title The interface of the IProToken
interface IProToken {
    // ================================================
    // =========== Open External Functions ============
    // ================================================

    // ================================================
    // ======== Restricted External Functions =========
    // ================================================

    /// @notice Mints tokens to a specified address
    /// @dev This function can only be called by the current minter
    /// @param to The address to mint tokens to
    /// @param amount The amount of tokens to mint
    function mint(address to, uint256 amount) external;

    /// @notice Burns tokens from a specified address
    /// @dev This function can only be called by the current minter
    /// @param from The address to burn tokens from
    /// @param amount The amount of tokens to burn
    function burn(address from, uint256 amount) external;

    /// @notice Sets the USD price of the pro token arbitrarily, effective immediately
    /// @dev Only callable by the admin. Price must be normalized to 18 decimals and >= 1e18
    ///      (minimum 1 USD), or 0 to disable the feed. Applied as a flat, zero-length segment
    ///      (no ramp) — the admin's manual-correction/emergency-override escape hatch.
    /// @param _price The USD price in 18 decimal format (e.g., 1.5 USD = 1500000000000000000)
    function setUSDPrice(uint256 _price) external;

    /// @notice Ramps the USD price of the pro token linearly to `_price` over `_period` seconds
    ///         starting at `_startTime`, subject to only increasing value and conforming to
    ///         step size
    /// @dev Only callable by the price operator. `_price` must be normalized to 18 decimals and
    ///      >= 1e18 (minimum 1 USD). Reverts USDPriceDisabled if the price is currently 0.
    ///      `_period` must fall within [MIN_RAMP_PERIOD, MAX_RAMP_PERIOD]. `_startTime` must be
    ///      `>=` the current segment's own end (startTime + period) — not merely after its
    ///      start — or reverts StaleSegment; segments can never overlap, so this also protects
    ///      against reordered/replayed calls. For a flat segment (period == 0), the end
    ///      coincides with the start, so a new segment may begin at that same instant.
    ///
    ///      The new segment's inPrice is not a caller-supplied value — it's set automatically to
    ///      the *previous* segment's futurePrice, so `_price`, `_startTime`, and `_period` are
    ///      the only values that need to be identical across chains for getUSDPrice() to ramp
    ///      along the same curve everywhere: every chain that has applied the same sequence of
    ///      updates derives the identical inPrice locally. The same monotonicity/step-size
    ///      checks that gate `_price` guarantee futurePrice >= inPrice for every segment.
    /// @param _price The price the segment ramps to, in 18 decimal format
    /// @param _startTime The unix timestamp the segment starts ramping from
    /// @param _period The ramp duration, in seconds
    function updateUSDPrice(
        uint256 _price,
        uint64 _startTime,
        uint64 _period
    ) external;

    /// @notice Sets the step size for USD price update
    /// @dev Only callable by admin.
    /// @param _stepSize The USD price step size in 18 decimal format
    function setStepSize(uint256 _stepSize) external;

    /// @notice Sets the cooldown for USD price update
    /// @dev Only callable by admin.
    /// @param _cooldown The new cooldown
    function setPriceUpdateCooldown(uint256 _cooldown) external;

    // ================================================
    // =========== Owner External Functions ===========
    // ================================================

    /// @notice Sets a new minter address
    /// @dev This function can only be called by the admin
    /// @param newMinter The address of the new minter
    function setMinter(address newMinter) external;

    /// @notice Sets a new bridge minter address
    /// @dev This function can only be called by the admin. 
    ///      Adds or removes a bridge minter (CCIP token pool). 
    /// @param bridgeMinter The bridge contract address
    /// @param allowed True to authorize, false to revoke
    function setBridgeMinter(address bridgeMinter, bool allowed) external;

    // ================================================
    // ================ View functions ================
    // ================================================

    /// @notice Returns the address of the current minter
    function getMinter() external view returns (address);

    /// @notice Returns the current interpolated USD price of the pro token
    /// @dev Pure function of the active segment and block.timestamp; reverts USDPriceDisabled
    ///      if the feed is currently disabled (futurePrice == 0, see setUSDPrice).
    /// @return The USD price in 18 decimal format
    function getUSDPrice() external view returns (uint256);

    /// @notice Returns the address of the current proTokenSettings
    function getProTokenSettings() external view returns (address);

    /// @notice CCIP admin resolution hook
    /// @dev Chainlink's RegistryModuleOwnerCustom.registerAdminViaGetCCIPAdmin
    ///      calls this to identify who may claim the Token Admin Registry role
    ///      for this token.
    function getCCIPAdmin() external view returns (address);
    
    /// @notice Returns true if bridge "account" is approved minter
    function isBridgeMinter(address account) external view returns (bool);

    // ================================================
    // ==================== Events ====================
    // ================================================

    /// @notice Emitted when a new minter is set
    /// @param newMinter The address of the new minter
    event MinterSet(address indexed oldMinter, address indexed newMinter);

    /// @notice Emitted when tokens are minted
    /// @param to The address that received the minted tokens
    /// @param amount The amount of tokens that were minted
    /// @param minter The address which called mint
    event Minted(address indexed to, uint256 amount, address indexed minter);

    /// @notice Emitted when tokens are burned
    /// @param from The address from which the tokens were burned
    /// @param amount The amount of tokens that were burned
    /// @param burner The address which called burn
    event Burned(address indexed from, uint256 amount, address indexed burner);

    /// @notice Emitted when the USD price is set by Admin
    /// @param prevPrice The old USD price in 18 decimal format
    /// @param price The new USD price in 18 decimal format
    event USDPriceSet(uint256 prevPrice, uint256 price);

    /// @notice Emitted when the USD price is updated by PriceOperator
    /// @param prevPrice The old USD price in 18 decimal format
    /// @param price The new USD price in 18 decimal format
    event USDPriceUpdated(uint256 prevPrice, uint256 price);

    /// @notice Emitted when the USD price step size was set by admin
    /// @param prevSize The old USD price step size in 18 decimal format
    /// @param size The new USD price step size in 18 decimal format
    event StepSizeChanged(uint256 prevSize, uint256 size);
    
    /// @notice Emitted when the USD price change cooldown was set by admin
    /// @param prevCd The old USD price change cooldown
    /// @param newCd The new USD price change cooldown
    event PriceUpdateCooldownChanged(uint256 prevCd, uint256 newCd);

    // ================================================
    // ==================== Errors ====================
    // ================================================

    /// @dev Provided address is address(0)
    error ZeroAddress();

    /// @dev Provided address is existing address
    error SameAddress();

    /// @dev Unauthorized address calls admin only function
    error NotAdmin();

    /// @dev Unauthorized address calls price operator only function
    error NotPriceOperator();

    /// @dev Unauthorized address calls minter only function
    error NotMinter();

    /// @dev An invalid price is provided (must be >= 1e18)
    error InvalidPrice();

    /// @dev An invalid price update time
    error PriceUpdateCooldownActive(uint256 availableAt, uint256 currentTime);

    /// @dev A non-increasing price was provided
    error PriceNotIncreasing();

    /// @dev A price with exceeding step size was provided
    error PriceStepSizeExceeded();
    
    /// @dev Zero amount is provided for mint/burn operations
    error InvalidAmount();
    
    /// @dev USD price is disabled
    error USDPriceDisabled();

    /// @dev An invalid ramp period is provided (outside [MIN_RAMP_PERIOD, MAX_RAMP_PERIOD])
    error InvalidRampPeriod();

    /// @dev An incoming segment's startTime falls before the current segment's own end
    ///      (startTime + period) — segments can never overlap
    error StaleSegment(uint64 incomingStartTime, uint64 currentStartTime);
}
