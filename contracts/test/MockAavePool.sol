// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MockAavePool
 * @notice Mock implementation of AAVE v3 Pool for testing
 * @dev Simulates basic supply/withdraw functionality with yield accumulation
 */
contract MockAavePool {
    using SafeERC20 for IERC20;

    mapping(address => mapping(address => uint256)) public deposits;
    mapping(address => address) public aTokens;
    mapping(address => uint256) public yieldMultiplier;

    event Supply(
        address indexed asset,
        uint256 amount,
        address indexed onBehalfOf,
        uint16 referralCode
    );

    event Withdraw(
        address indexed asset,
        uint256 amount,
        address indexed to,
        uint256 actualAmount
    );

    /**
     * @notice Set the aToken address for an asset
     * @param asset The underlying asset address
     * @param aToken The corresponding aToken address
     */
    function setAToken(address asset, address aToken) external {
        aTokens[asset] = aToken;
    }

    /**
     * @notice Set yield multiplier for testing yield accumulation
     * @param asset The asset address
     * @param multiplier Yield multiplier (1e18 = 100%, 1.1e18 = 110%)
     */
    function setYieldMultiplier(address asset, uint256 multiplier) external {
        yieldMultiplier[asset] = multiplier;
    }

    /**
     * @notice Supply assets to the pool
     * @param asset The asset to supply
     * @param amount The amount to supply
     * @param onBehalfOf The address receiving the aTokens
     * @param referralCode Referral code (unused in mock)
     */
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external {
        require(aTokens[asset] != address(0), "Asset not supported");
        require(amount > 0, "Amount must be greater than 0");

        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        deposits[asset][onBehalfOf] += amount;

        MockAToken(aTokens[asset]).mint(onBehalfOf, amount);

        emit Supply(asset, amount, onBehalfOf, referralCode);
    }

    /**
     * @notice Withdraw assets from the pool
     * @param asset The asset to withdraw
     * @param amount The amount to withdraw
     * @param to The address receiving the assets
     * @return actualAmount The actual amount withdrawn (may include yield)
     */
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256) {
        require(aTokens[asset] != address(0), "Asset not supported");
        
        MockAToken aToken = MockAToken(aTokens[asset]);
        uint256 aTokenBalance = aToken.balanceOf(msg.sender);
        require(aTokenBalance >= amount, "Insufficient aToken balance");

        uint256 multiplier = yieldMultiplier[asset];
        if (multiplier == 0) {
            multiplier = 1e18;
        }

        uint256 actualAmount = (amount * multiplier) / 1e18;
        uint256 poolBalance = IERC20(asset).balanceOf(address(this));
        if (actualAmount > poolBalance) {
            actualAmount = poolBalance;
        }

        aToken.burn(msg.sender, amount);
        deposits[asset][msg.sender] = deposits[asset][msg.sender] > amount 
            ? deposits[asset][msg.sender] - amount 
            : 0;

        IERC20(asset).safeTransfer(to, actualAmount);

        emit Withdraw(asset, amount, to, actualAmount);
        return actualAmount;
    }

    /**
     * @notice Get the aToken address for an asset
     * @param asset The asset address
     * @return The aToken address
     */
    function getReserveAToken(
        address asset
    ) external view returns (address) {
        return aTokens[asset];
    }
}

/**
 * @title MockAToken
 * @notice Mock implementation of AAVE aToken for testing
 * @dev Simple ERC20-like token that can be minted/burned
 */
contract MockAToken {
    mapping(address => uint256) private _balances;
    uint256 private _totalSupply;
    address public pool;

    event Transfer(address indexed from, address indexed to, uint256 value);

    modifier onlyPool() {
        require(msg.sender == pool, "Only pool can call");
        _;
    }

    constructor() {
        pool = msg.sender;
    }

    function setPool(address _pool) external {
        require(pool == address(0) || msg.sender == pool, "Unauthorized");
        pool = _pool;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function mint(address account, uint256 amount) external onlyPool {
        _balances[account] += amount;
        _totalSupply += amount;
        emit Transfer(address(0), account, amount);
    }

    function burn(address account, uint256 amount) external onlyPool {
        require(_balances[account] >= amount, "Insufficient balance");
        _balances[account] -= amount;
        _totalSupply -= amount;
        emit Transfer(account, address(0), amount);
    }

    function simulateYield(address account, uint256 additionalAmount) external {
        _balances[account] += additionalAmount;
        _totalSupply += additionalAmount;
        emit Transfer(address(0), account, additionalAmount);
    }
}