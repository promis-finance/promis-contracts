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
 * @notice ERC20 (18 decimals, EIP-2612 permit) mintable and burnable only by an
 *         authorized minter contract (ProTokenOperations).
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

    /// @notice ProTokenSettings contract, source of admin/operator roles.
    address private proTokenSettings;

    /// @notice Address authorized to mint and burn (typically ProTokenOperations).
    address private minter;

    /// @notice USD price, 18 decimals; 0 means disabled (getUSDPrice reverts).
    uint256 private usdPrice;

    /// @notice Increase step size of USD price allowed (0 means steps disabled).
    uint256 private stepSize;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

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
        usdPrice = DEFAULT_USD_PRICE;
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

    /// @notice Restricts access to the minter.
    modifier onlyMinter() {
        if (msg.sender != minter) revert NotMinter();
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
    function setUSDPrice(uint256 _price) external override onlyAdmin {
        if (_price < MIN_USD_PRICE && _price != 0) revert InvalidPrice();

        uint256 old = usdPrice;
        usdPrice = _price;

        emit USDPriceSet(old, _price);
    }

    /// @inheritdoc IProToken
    function updateUSDPrice(uint256 _price) external override onlyPriceOperator {
        if (_price < MIN_USD_PRICE && _price != 0) revert InvalidPrice();

        uint256 old = usdPrice;

        if (old == 0) revert USDPriceDisabled();
        if (_price <= old) revert PriceNotIncreasing();
        if (stepSize != 0 && _price - old > stepSize) revert PriceStepSizeExceeded();

        usdPrice = _price;

        emit USDPriceUpdated(old, _price);
    }

    /// @inheritdoc IProToken
    function setStepSize(uint256 _stepSize) external override onlyAdmin {

        uint256 old = stepSize;
        stepSize = _stepSize;

        emit StepSizeChanged(old, _stepSize);
    }

    /// @inheritdoc IProToken
    function mint(address to, uint256 amount) external override onlyMinter {
        if (amount == 0) revert InvalidAmount();
        _mint(to, amount);

        emit Minted(to, amount);
    }

    /// @inheritdoc IProToken
    function burn(address from, uint256 amount) external override onlyMinter {
        if (amount == 0) revert InvalidAmount();
        _burn(from, amount);

        emit Burned(from, amount);
    }

    /// @inheritdoc IProToken
    function getMinter() external view override returns (address) {
        return minter;
    }

    /// @inheritdoc IProToken
    function getUSDPrice() external view override returns (uint256) {
        if (usdPrice == 0) revert USDPriceDisabled();
        return usdPrice;
    }

    /// @inheritdoc IProToken
    function getProTokenSettings() external view override returns (address) {
        return proTokenSettings;
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