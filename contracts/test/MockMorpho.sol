// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MockMorpho
 * @notice Mock Morpho Blue protocol for testing purposes
 * @dev Simulates the IMorpho interface with configurable behavior
 */
contract MockMorpho {
    using SafeERC20 for IERC20;

    struct MarketParams {
        address loanToken;
        address collateralToken;
        address oracle;
        address irm;
        uint256 lltv;
    }

    struct Position {
        uint256 supplyShares;
        uint256 borrowShares;
        uint256 collateral;
    }

    // Market ID => Position mapping
    mapping(bytes32 => mapping(address => Position)) public positions;
    // Market ID => Total supply shares
    mapping(bytes32 => uint256) public totalSupplyShares;
    // Market ID => Total supply assets
    mapping(bytes32 => uint256) public totalSupplyAssets;
    // Market ID => Total borrow shares
    mapping(bytes32 => uint256) public totalBorrowShares;
    // Market ID => Total borrow assets
    mapping(bytes32 => uint256) public totalBorrowAssets;
    // Market ID => Last update timestamp
    mapping(bytes32 => uint256) public lastUpdate;
    // Market ID => Fee
    mapping(bytes32 => uint256) public fee;

    bool public shouldRevert;
    uint256 public withdrawReturnAmount;

    /**
     * @notice Calculate market ID from market params
     * @param marketParams The market parameters
     * @return The market ID
     */
    function id(
        MarketParams memory marketParams
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(marketParams));
    }

    /**
     * @notice Configure the mock to revert on operations
     * @param _shouldRevert Whether to revert
     */
    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    /**
     * @notice Set the amount to return on withdraw
     * @param amount The amount to return
     */
    function setWithdrawReturnAmount(uint256 amount) external {
        withdrawReturnAmount = amount;
    }

    /**
     * @notice Supply assets to a market
     * @param marketParams The market parameters
     * @param assets The amount of assets to supply
     * @param shares The amount of shares to mint (0 for asset-based supply)
     * @param onBehalfOf The address to supply on behalf of
     * @param data Callback data (unused in mock)
     * @return assetsSupplied The actual assets supplied
     * @return sharesSupplied The shares minted
     */
    function supply(
        MarketParams memory marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalfOf,
        bytes memory data
    ) external returns (uint256 assetsSupplied, uint256 sharesSupplied) {
        require(!shouldRevert, "MockMorpho: reverted");

        bytes32 marketId = id(marketParams);

        // For simplicity, 1:1 share to asset ratio
        if (assets > 0) {
            assetsSupplied = assets;
            sharesSupplied = assets;
        } else {
            assetsSupplied = shares;
            sharesSupplied = shares;
        }

        // Transfer tokens from sender
        IERC20(marketParams.loanToken).safeTransferFrom(
            msg.sender,
            address(this),
            assetsSupplied
        );

        // Update position
        positions[marketId][onBehalfOf].supplyShares += sharesSupplied;
        totalSupplyShares[marketId] += sharesSupplied;
        totalSupplyAssets[marketId] += assetsSupplied;

        return (assetsSupplied, sharesSupplied);
    }

    /**
     * @notice Withdraw assets from a market
     * @param marketParams The market parameters
     * @param assets The amount of assets to withdraw
     * @param shares The amount of shares to burn (0 for asset-based withdraw)
     * @param onBehalfOf The address to withdraw on behalf of
     * @param receiver The address to receive the assets
     * @return assetsWithdrawn The actual assets withdrawn
     * @return sharesWithdrawn The shares burned
     */
    function withdraw(
        MarketParams memory marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalfOf,
        address receiver
    ) external returns (uint256 assetsWithdrawn, uint256 sharesWithdrawn) {
        require(!shouldRevert, "MockMorpho: reverted");

        bytes32 marketId = id(marketParams);

        // For simplicity, 1:1 share to asset ratio
        if (assets > 0) {
            assetsWithdrawn = assets;
            sharesWithdrawn = assets;
        } else {
            assetsWithdrawn = shares;
            sharesWithdrawn = shares;
        }

        // Override with configured return amount if set
        if (withdrawReturnAmount > 0) {
            assetsWithdrawn = withdrawReturnAmount;
        }

        // Update position
        positions[marketId][onBehalfOf].supplyShares -= sharesWithdrawn;
        totalSupplyShares[marketId] -= sharesWithdrawn;
        totalSupplyAssets[marketId] -= assetsWithdrawn;

        // Transfer tokens to receiver
        IERC20(marketParams.loanToken).safeTransfer(receiver, assetsWithdrawn);

        return (assetsWithdrawn, sharesWithdrawn);
    }

    /**
     * @notice Get expected supply assets for a position
     * @param marketParams The market parameters
     * @param user The user address
     * @return The expected supply assets
     */
    function expectedSupplyAssets(
        MarketParams memory marketParams,
        address user
    ) external view returns (uint256) {
        bytes32 marketId = id(marketParams);
        // For simplicity, 1:1 share to asset ratio
        return positions[marketId][user].supplyShares;
    }

    /**
     * @notice Get position for a user in a market
     * @dev Returns individual values to match Morpho Blue interface
     * @param marketId The market ID
     * @param user The user address
     * @return supplyShares_ The supply shares
     * @return borrowShares_ The borrow shares (as uint128)
     * @return collateral_ The collateral (as uint128)
     */
    function position(
        bytes32 marketId,
        address user
    )
        external
        view
        returns (
            uint256 supplyShares_,
            uint128 borrowShares_,
            uint128 collateral_
        )
    {
        Position memory pos = positions[marketId][user];
        return (
            pos.supplyShares,
            uint128(pos.borrowShares),
            uint128(pos.collateral)
        );
    }

    /**
     * @notice Get supply shares for a user in a market (MorphoLib compatibility)
     * @param marketId The market ID
     * @param user The user address
     * @return The supply shares
     */
    function supplyShares(
        bytes32 marketId,
        address user
    ) external view returns (uint256) {
        return positions[marketId][user].supplyShares;
    }

    /**
     * @notice Manually set a position (for testing)
     * @param marketParams The market parameters
     * @param user The user address
     * @param supplyShares The supply shares
     */
    function setPosition(
        MarketParams memory marketParams,
        address user,
        uint256 supplyShares
    ) external {
        bytes32 marketId = id(marketParams);
        positions[marketId][user].supplyShares = supplyShares;
        totalSupplyShares[marketId] = supplyShares;
        totalSupplyAssets[marketId] = supplyShares;
    }

    /**
     * @notice Get market data for a market ID
     * @dev Returns values to match Morpho Blue interface for MorphoBalancesLib
     * @param marketId The market ID
     * @return totalSupplyAssets_ Total supply assets
     * @return totalSupplyShares_ Total supply shares
     * @return totalBorrowAssets_ Total borrow assets
     * @return totalBorrowShares_ Total borrow shares
     * @return lastUpdate_ Last update timestamp
     * @return fee_ Fee
     */
    function market(
        bytes32 marketId
    )
        external
        view
        returns (
            uint128 totalSupplyAssets_,
            uint128 totalSupplyShares_,
            uint128 totalBorrowAssets_,
            uint128 totalBorrowShares_,
            uint128 lastUpdate_,
            uint128 fee_
        )
    {
        return (
            uint128(totalSupplyAssets[marketId]),
            uint128(totalSupplyShares[marketId]),
            uint128(totalBorrowAssets[marketId]),
            uint128(totalBorrowShares[marketId]),
            uint128(lastUpdate[marketId]),
            uint128(fee[marketId])
        );
    }

    /**
     * @notice Fund the mock with tokens for withdrawals
     * @param token The token to fund
     * @param amount The amount to fund
     */
    function fundMock(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice Read storage slots (MorphoLib compatibility)
     * @dev Returns zeros for all slots since we don't use actual storage layout
     * @param slots Array of storage slots to read
     * @return values Array of values (all zeros for mock)
     */
    function extSloads(
        bytes32[] calldata slots
    ) external pure returns (bytes32[] memory values) {
        values = new bytes32[](slots.length);
        // Return zeros - the mock uses explicit mappings instead of storage slots
        // This is sufficient for testing since getBalance() will return 0
        return values;
    }
}
