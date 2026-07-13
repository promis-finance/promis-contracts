// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;
pragma abicoder v2;

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

    /// @notice Sets the USD price of the pro token arbitrarily
    /// @dev Only callable by the admin. Price must be normalized to 18 decimals and >= 1e18 (minimum 1 USD).
    /// @param _price The USD price in 18 decimal format (e.g., 1.5 USD = 1500000000000000000)
    function setUSDPrice(uint256 _price) external;

    /// @notice Sets the USD price of the pro token: subject to only increasing value and conforming to step size
    /// @dev Only callable by the price operator. Price must be normalized to 18 decimals and >= 1e18 (minimum 1 USD).
    ///      Reverts USDPriceDisabled if the price is currently 0.
    /// @param _price The USD price in 18 decimal format (e.g., 1.5 USD = 1500000000000000000)
    function updateUSDPrice(uint256 _price) external;

    /// @notice Sets the step size for USD price update
    /// @dev Only callable by admin.
    /// @param _stepSize The USD price step size in 18 decimal format
    function setStepSize(uint256 _stepSize) external;

    // ================================================
    // =========== Owner External Functions ===========
    // ================================================

    /// @notice Sets a new minter address
    /// @dev This function can only be called by the admin
    /// @param newMinter The address of the new minter
    function setMinter(address newMinter) external;

    // ================================================
    // ================ View functions ================
    // ================================================

    /// @notice Returns the address of the current minter
    function getMinter() external view returns (address);

    /// @notice Returns the current USD price of the pro token
    /// @return The USD price in 18 decimal format
    function getUSDPrice() external view returns (uint256);

    /// @notice Returns the address of the current proTokenSettings
    function getProTokenSettings() external view returns (address);

    // ================================================
    // ==================== Events ====================
    // ================================================

    /// @notice Emitted when a new minter is set
    /// @param newMinter The address of the new minter
    event MinterSet(address indexed oldMinter, address indexed newMinter);

    /// @notice Emitted when tokens are minted
    /// @param to The address that received the minted tokens
    /// @param amount The amount of tokens that were minted
    event Minted(address indexed to, uint256 amount);

    /// @notice Emitted when tokens are burned
    /// @param from The address from which the tokens were burned
    /// @param amount The amount of tokens that were burned
    event Burned(address indexed from, uint256 amount);

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

    /// @dev A non-increasing price was provided
    error PriceNotIncreasing();

    /// @dev A price with exceeding step size was provided
    error PriceStepSizeExceeded();
    
    /// @dev Zero amount is provided for mint/burn operations
    error InvalidAmount();
    
    /// @dev USD price is disabled
    error USDPriceDisabled();
}
