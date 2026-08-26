// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MockAaveV3
 * @notice Enhanced mock implementation of AAVE v3 Pool for testnet testing
 * @dev Simulates supply/withdraw functionality with configurable yield accumulation
 */
contract MockAaveV3 {
    using SafeERC20 for IERC20;

    struct ReserveData {
        address aTokenAddress;
        uint128 currentLiquidityRate;
        uint40 lastUpdateTimestamp;
    }

    mapping(address => mapping(address => uint256)) public deposits;
    mapping(address => ReserveData) public reserves;
    mapping(address => uint256) public yieldRateBasisPoints; // 100 = 1%, 500 = 5%
    mapping(address => address) public aTokenToAsset; // Maps aToken address to underlying asset
    mapping(address => uint256) private _reserveDeficit;
    bool public deficitReverts;

    address public admin;

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

    event YieldRateSet(address indexed asset, uint256 rateBasisPoints);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /**
     * @notice Set the aToken address and initialize reserve for an asset
     * @param asset The underlying asset address
     * @param aToken The corresponding aToken address
     */
    function setAToken(address asset, address aToken) external onlyAdmin {
        reserves[asset] = ReserveData({
            aTokenAddress: aToken,
            currentLiquidityRate: 0,
            lastUpdateTimestamp: uint40(block.timestamp)
        });
        aTokenToAsset[aToken] = asset;
        MockATokenV3(aToken).setUnderlyingAsset(asset);
    }

    /**
     * @notice Set yield rate for an asset
     * @param asset The asset address
     * @param rateBasisPoints Yield rate in basis points (500 = 5%)
     */
    function setYieldRate(address asset, uint256 rateBasisPoints) external onlyAdmin {
        require(rateBasisPoints <= 10000, "Rate too high");
        yieldRateBasisPoints[asset] = rateBasisPoints;
        reserves[asset].currentLiquidityRate = uint128(rateBasisPoints * 1e23); // Convert to ray (1e27)
        reserves[asset].lastUpdateTimestamp = uint40(block.timestamp);
        emit YieldRateSet(asset, rateBasisPoints);
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
        require(reserves[asset].aTokenAddress != address(0), "Asset not supported");
        require(amount > 0, "Amount must be greater than 0");

        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        deposits[asset][onBehalfOf] += amount;

        MockATokenV3(reserves[asset].aTokenAddress).mint(onBehalfOf, amount);

        emit Supply(asset, amount, onBehalfOf, referralCode);
    }

    /**
     * @notice Withdraw assets from the pool
     * @param asset The asset to withdraw
     * @param amount The amount to withdraw (use type(uint256).max for all)
     * @param to The address receiving the assets
     * @return actualAmount The actual amount withdrawn
     */
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256) {
        require(reserves[asset].aTokenAddress != address(0), "Asset not supported");
        
        MockATokenV3 aToken = MockATokenV3(reserves[asset].aTokenAddress);
        uint256 aTokenBalance = aToken.balanceOf(msg.sender);
        
        uint256 withdrawAmount = amount == type(uint256).max ? aTokenBalance : amount;
        require(aTokenBalance >= withdrawAmount, "Insufficient aToken balance");

        // In AAVE v3, the aToken balance represents the underlying amount
        // The simulateYield function already increased the aToken balance
        // So we just return the aToken amount as-is (no additional yield multiplier)
        uint256 actualAmount = withdrawAmount;
        
        uint256 poolBalance = IERC20(asset).balanceOf(address(this));
        if (actualAmount > poolBalance) {
            actualAmount = poolBalance;
        }

        aToken.burn(msg.sender, withdrawAmount);
        deposits[asset][msg.sender] = deposits[asset][msg.sender] > withdrawAmount 
            ? deposits[asset][msg.sender] - withdrawAmount 
            : 0;

        IERC20(asset).safeTransfer(to, actualAmount);

        emit Withdraw(asset, withdrawAmount, to, actualAmount);
        return actualAmount;
    }

    /**
     * @notice Get reserve data for an asset
     * @param asset The asset address
     * @return The reserve data struct
     */
    function getReserveData(address asset) external view returns (ReserveData memory) {
        return reserves[asset];
    }

    /**
     * @notice Get the aToken address for an asset
     * @param asset The asset address
     * @return The aToken address
     */
    function getReserveAToken(address asset) external view returns (address) {
        return reserves[asset].aTokenAddress;
    }

    /**
     * @notice Fund the pool with extra assets to cover yield payments
     * @dev In real AAVE, this comes from borrower interest. In mock, admin must fund it.
     * @param asset The asset to add
     * @param amount The amount to add to pool reserves
     */
    function fundPoolForYield(address asset, uint256 amount) external {
        require(amount > 0, "Amount must be positive");
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        // This extra balance will be used to pay yield on withdrawals
    }

    function setReserveDeficit(address asset, uint256 amount) external onlyAdmin {
        _reserveDeficit[asset] = amount;
    }

    function setDeficitReverts(bool shouldRevert) external onlyAdmin {
        deficitReverts = shouldRevert;
    }

    function getReserveDeficit(address asset) external view returns (uint256) {
        require(!deficitReverts, "deficit read reverts");
        return _reserveDeficit[asset];
    }

}

/**
 * @title MockATokenV3
 * @notice Enhanced mock implementation of AAVE aToken for testnet testing
 * @dev ERC20-like token with automatic yield accumulation like real Aave V3
 */
contract MockATokenV3 {
    mapping(address => uint256) private _balances; // Stores principal amount
    mapping(address => uint256) private _lastUpdateTimestamp; // Track last update time per user
    uint256 private _totalSupply;
    address public pool;
    address public underlyingAsset; // The underlying asset this aToken represents
    
    string public name;
    string public symbol;
    uint8 public decimals;
    bool public totalSupplyReverts;

    event Transfer(address indexed from, address indexed to, uint256 value);

    modifier onlyPool() {
        require(msg.sender == pool, "Only pool can call");
        _;
    }

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        pool = msg.sender;
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function setPool(address _pool) external {
        require(pool == address(0) || msg.sender == pool, "Unauthorized");
        pool = _pool;
    }

    /**
     * @notice Set the underlying asset address
     * @param _asset The underlying asset address
     */
    function setUnderlyingAsset(address _asset) external {
        require(msg.sender == pool, "Only pool can set asset");
        underlyingAsset = _asset;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _getBalanceWithYield(account);
    }

    /**
     * @notice Calculate balance including accumulated yield
     * @dev Mimics Aave V3's automatic yield accumulation through liquidity index
     * @param account The account to calculate balance for
     * @return Current balance including yield
     */
    function _getBalanceWithYield(address account) internal view returns (uint256) {
        if (_balances[account] == 0) {
            return 0;
        }
        
        MockAaveV3 mockPool = MockAaveV3(pool);
        address asset = _getUnderlyingAsset();
        uint256 yieldRate = mockPool.yieldRateBasisPoints(asset);
        
        if (yieldRate == 0 || _lastUpdateTimestamp[account] == 0) {
            return _balances[account];
        }
        
        // Calculate time-based yield (simplified version of Aave's liquidity index)
        uint256 timeDelta = block.timestamp - _lastUpdateTimestamp[account];
        // Yield calculation: principal * rate * time / (10000 * 365 days)
        // This gives APY-based yield accumulation
        uint256 accumulatedYield = (_balances[account] * yieldRate * timeDelta) / (10000 * 365 days);
        
        return _balances[account] + accumulatedYield;
    }

    /**
     * @notice Get the underlying asset address
     * @dev Returns the stored underlying asset address
     */
    function _getUnderlyingAsset() internal view returns (address) {
        return underlyingAsset;
    }

    function totalSupply() external view returns (uint256) {
        require(!totalSupplyReverts, "totalSupply reverts");
        return _totalSupply;
    }

    function mint(address account, uint256 amount) external onlyPool {
        // Update balance to include any accumulated yield before minting
        uint256 currentBalance = _getBalanceWithYield(account);
        _balances[account] = currentBalance + amount;
        _lastUpdateTimestamp[account] = block.timestamp;
        _totalSupply += amount;
        emit Transfer(address(0), account, amount);
    }

    function burn(address account, uint256 amount) external onlyPool {
        uint256 currentBalance = _getBalanceWithYield(account);
        require(currentBalance >= amount, "Insufficient balance");
        
        // Update the principal balance after burn
        _balances[account] = currentBalance - amount;
        _lastUpdateTimestamp[account] = block.timestamp;
        _totalSupply = _totalSupply > amount ? _totalSupply - amount : 0;
        emit Transfer(account, address(0), amount);
    }

    /**
     * @notice Force update the balance timestamp (for testing purposes)
     * @dev This allows testing of yield accumulation by simulating time passage
     * @param account The account to update
     * @param newTimestamp The new timestamp to set
     */
    function setLastUpdateTimestamp(address account, uint256 newTimestamp) external {
        require(msg.sender == pool, "Only pool can update timestamp");
        _lastUpdateTimestamp[account] = newTimestamp;
    }

    /**
     * @notice Get the principal balance without yield
     * @param account The account to query
     * @return The principal balance
     */
    function principalBalanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function setTotalSupplyReverts(bool shouldRevert) external {
        totalSupplyReverts = shouldRevert;
    }
}