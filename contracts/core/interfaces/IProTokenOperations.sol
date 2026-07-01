// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;
pragma abicoder v2;

import "../types/ProTokenOperationsTypes.sol";

/// @title The interface of the ProTokenOperations contract
/// @notice Defines the core functionality for minting and unminting pro tokens using y-bearing assets
interface IProTokenOperations {
    // ================================================
    // =========== Open External Functions ============
    // ================================================

    /**
     * @notice Creates a request for minting pro tokens by locking in yAssets
     * @dev Anyone can call this function. Requires the y asset to be enabled and not paused.
     * @param _yAsset The contract address of the y-bearing asset being deposited (e.g., USDT, USDC)
     * @param _amount The quantity of y asset to deposit, in the asset's native decimals
     * @param _minAmountOut The minimum amount of pro tokens to receive, providing slippage protection
     * @param _receiver The address to receive the minted pro tokens. If address(0), defaults to msg.sender
     */
    function createMintRequest(
        address _yAsset, 
        uint256 _amount,       // yAsset
        uint256 _minAmountOut, // proToken
        address _receiver
    ) external;

    /**
     * @notice Simulates a mint operation and returns the pro tokens that would be minted
     * @dev Performs the same validations and pricing logic as `mintProToken` but does not transfer assets or emit events.
     *      Useful for frontends and off-chain callers that need a read-only quote.
     * @param _yAsset The contract address of the y-bearing asset being deposited
     * @param _amount The quantity of y asset to deposit, in the asset's native decimals
     * @return mintedAmount The amount of pro tokens that would be minted, in 18 decimals
     */
    function simulateMintProToken(
        address _yAsset,
        uint256 _amount
    ) external returns (uint256 mintedAmount);

    

    /**
     * @notice Creates a request for unminting pro tokens to get yAssets
     * @dev Anyone can call this function. Automatically unmints to the unmint asset indicated when finalized.
     * @param _yAsset The contract address of the unmint asset to withdraw
     * @param _amount The quantity of pro tokens to burn, in 18 decimals
     * @param _minAmountOut The minimum amount to receive after fees, providing slippage protection
     * @param _receiver The address to receive the unminted assets. If address(0), defaults to msg.sender
     */
    function createUnmintRequest(
        address _yAsset, 
        uint256 _amount,       // proToken
        uint256 _minAmountOut, // yAsset
        address _receiver
    ) external;

    // ================================================
    // ======== Restricted External Functions =========
    // ================================================

    /**
     * @notice Instant proUSD mint against a returned yAsset, for the StrategyVault.
     * @dev Bypasses the mint request/proof mechanism. Pulls yAsset from the vault,
     *      routes it to the yOperationsHandler (same as a normal mint), and mints
     *      proUSD to `_proUSDRecipient`. Restricted to the configured StrategyVault.
     * @param _yAssetAmount Amount of yAsset returned
     * @param _yAsset The returned deposit asset (e.g. USDT)
     * @return proUSDMinted Amount of proUSD minted
     */
    function strategicMint(
        uint256 _yAssetAmount,
        address _yAsset
    ) external returns(uint256 proUSDMinted);

    /** 
     * @notice Instant proUSD -> yAsset redeem for the StrategyVault.
     * @dev Bypasses the unmint batch/unbonding mechanism and proof verification.
     *      Access is restricted to the configured StrategyVault. Pulls proUSD from
     *      the vault (which has approved this contract), burns it, sources the yAsset
     *      from the yOperationsHandler (pulling from yield handlers on a shortfall),
     *      and transfers the yAsset directly to `destination`.
     * @param _yAsset The deposit asset to redeem into
     * @param _proUSDAmount proUSD amount to burn
     * @param _destination Recipient of the yAsset
     * @return yAssetReceived Amount of yAsset transferred to destination
     */ 
    function strategicUnmint(
        address _yAsset,
        uint256 _proUSDAmount,
        address _destination
    ) external returns(uint256 yAssetReceived) ;

    // ================================================
    // =========== Owner External Functions ===========
    // ================================================

    /** 
     * @notice Set minDeposit and minWithdraw amounts in base denomination
     * @dev Both are required to avoid dust requests hence spamming signatures
     * @param _minDepositBase Minimum deposit amount in base denomination
     * @param _minWithdrawBase Minimum withdraw amount in base denomination
     */
    function setMinBases(
        uint256 _minDepositBase, 
        uint256 _minWithdrawBase
    ) external;

    // ================================================
    // ==================== Events ====================
    // ================================================

    /**
     * @notice Emitted when mint request for pro tokens is created
     * @dev This event provides complete detail for mint proof generation on backend.
     * @param requestID The request ID number generated internally for identification of the request
     * @param user The wallet address that deposited yAssets
     * @param yAsset The contract address of the y-bearing asset that was deposited
     * @param amount The quantity of y asset deposited, in the asset's native decimals
     * @param minAmountOut The minimum quantity of pro tokens expected to be minted
     * @param receiver Recipient of the pro tokens when minted
     */
    event MintRequestCreated(
        uint256 indexed requestID, 
        address user, 
        address indexed yAsset, 
        uint256 amount, 
        uint256 minAmountOut, 
        address indexed receiver
    );

    /**
     * @notice Emitted when mint request for pro tokens is finalized via proof
     * @dev This event provides complete detail on successful mint or successful return of assets
     * @param requestID The request ID number generated internally for identification of the request
     * @param user The wallet address that deposited yAssets
     * @param yAsset The contract address of the y-bearing asset that was deposited
     * @param amount The quantity of y asset deposited, in the asset's native decimals
     * @param mintAmount The amount of pro tokens minted. Equals 0 if assets were returned
     * @param proofKind 0 for PROOF_OF_APPROVE, 1 for PROOF_OF_RETURN
     */
    event MintRequestFinalized(
        uint256 indexed requestID, 
        address user, 
        address indexed yAsset, 
        uint256 amount, 
        uint256 mintAmount, 
        uint8 indexed proofKind
    );

    event MintRequestReclaimed(
        uint256 requestID,
        address user,
        uint256 amount
    );

    /**
     * @notice Emitted when unmint request for pro tokens is created
     * @dev This event provides complete detail for unmint proof generation on backend.
     * @param requestID The request ID number generated internally for identification of the request
     * @param user The wallet address that deposited yAssets
     * @param yAsset The contract address of the y-bearing asset that was deposited
     * @param proTokenAmount The quantity of pro tokens burned
     * @param minAmountOut The minimum quantity of yAssets expected to be received
     * @param receiver Recipient of the yAssets
     */
    event UnmintRequestCreated(
        uint256 indexed requestID, 
        address user, 
        address indexed yAsset, 
        uint256 proTokenAmount, 
        uint256 minAmountOut, 
        address indexed receiver
    );

    /**
     * @notice Emitted when unmint request for pro tokens is finalized via proof
     * @dev This event provides complete detail on successful unmint. No PROOF_OF_RETURN path
     * @param requestID The request ID number generated internally for identification of the request
     * @param user The wallet address that deposited yAssets
     * @param yAsset The contract address of the y-bearing asset that was deposited
     * @param proTokenAmount The quantity of pro tokens burned
     * @param yAssetAmount The amount of yAssets sent for unbonding
     */
    event UnmintRequestFinalized(
        uint256 indexed requestID, 
        address user, 
        address indexed yAsset, 
        uint256 proTokenAmount, 
        uint256 yAssetAmount
    );

    event UnmintRequestReclaimed(
        uint256 requestID,
        address user,
        uint256 amount
    );

    /**
     * @notice Emitted when pro tokens are successfully minted for a user
     * @dev This event provides a complete record of the minting transaction including exchange rates used.
     *      USD values are in 18 decimals for consistency across different y asset decimal formats.
     * @param sender The wallet address that initiated the minting transaction and provided the y assets
     * @param receiver The wallet address that received the minted pro tokens
     * @param yAsset The contract address of the y-bearing asset that was deposited
     * @param yAssetAmount The quantity of y asset deposited, in the asset's native decimals
     * @param proTokenAmount The quantity of pro tokens minted and transferred to receiver, in 18 decimals
     * @param yAssetUSD The USD price per unit of the y asset at time of minting, in 18 decimals. (if underlying asset, this is 0 because no need to use oracles for the operation)
     * @param proTokenUSD The USD price per unit of the pro token at time of minting, in 18 decimals. (if underlying asset, this is 0 because no need to use oracles for the operation)
     */
    event ProTokenMint(
        address indexed sender,
        address indexed receiver,
        address indexed yAsset,
        uint256 yAssetAmount,
        uint256 proTokenAmount,
        uint256 yAssetUSD,
        uint256 proTokenUSD
    );

    /**
     * @notice Emitted when an unmint request is finalized via the instant path —
     *         yAsset was paid out directly to the recipient in the same transaction.
     * @dev Fires from finalizeUnmintRequest -> _executeUnmint when YAssetOperationsHandler
     *      reports sufficient liquidity (unallocated + handler balances) to cover the
     *      payout. The proUSD has been burned and the yAsset has been transferred to
     *      the recipient before this event fires.
     * @param sender The user who created the unmint request.
     * @param recipient The address that received the yAsset (request.receiver if set,
     *        otherwise request.user).
     * @param yAsset The yield asset that was paid out.
     * @param proTokenAmount The amount of proUSD burned to fulfill the request.
     * @param yAssetAmount The amount of yAsset transferred to the recipient,
     *        net of any unmintFeePer.
     */
    event ProTokenUnmintInstant(
        address indexed sender,
        address indexed recipient,
        address indexed yAsset,
        uint256 proTokenAmount,
        uint256 yAssetAmount
    );

    /**
     * @notice Emitted when an unmint request is finalized via the queued path —
     *         yAsset will be paid out to the recipient when the next batch in
     *         ProTokenUnmintHandler is processed.
     * @dev Fires from finalizeUnmintRequest -> _executeUnmint when YAssetOperationsHandler
     *      reports insufficient liquidity for an instant payout. The proUSD has been
     *      burned and the recipient must claim from ProTokenUnmintHandler once the
     *      batch is processed by the operator. The handlerRequestId may refer to a
     *      newly-created request or an existing aggregated request in the current batch
     *      (UnmintHandler aggregates by (yAsset, receiver)).
     * @param sender The user who created the unmint request.
     * @param recipient The address that will receive the yAsset on claim.
     * @param yAsset The yield asset that will be paid out.
     * @param proTokenAmount The amount of proUSD burned to fulfill the request.
     * @param yAssetQueued The amount of yAsset queued for delivery, net of any unmintFeePer.
     * @param handlerRequestId The request id in ProTokenUnmintHandler used to claim
     *        the yAsset once the batch is processed.
     */
    event ProTokenUnmintQueued(
        address indexed sender,
        address indexed recipient,
        address indexed yAsset,
        uint256 proTokenAmount,
        uint256 yAssetQueued,
        uint256 handlerRequestId
    );

    /**
     * @notice Emitted when StrategyVault is being repayed by Strategist.
     * @dev Keeps track of strategist actions when repaying
     * @param vault The address of StrategyVault borrowing yAssets
     * @param yAsset Address of yAsset being deposited
     * @param proUSDRecipient Receiver of proUSD minted
     * @param yAssetAmount Amount of yAssets being used for mint
     * @param proUSDMinted Amount of proUSD minted
     */
    event StrategicMint(
        address indexed vault,
        address indexed yAsset,
        address indexed proUSDRecipient,
        uint256 yAssetAmount,
        uint256 proUSDMinted
    );

    /**
     * @notice Emitted when a strategist unmint is executed via the instant path —
     *         yAsset was paid out directly to the destination in the same transaction.
     * @dev Fires from strategicUnmint when YAssetOperationsHandler reports sufficient
     *      liquidity to cover the payout. Strategist actions skip proof verification
     *      and the minWithdrawBase floor; only the StrategyVault may invoke this path.
     *      The proUSD has been burned from the vault and the yAsset has been
     *      transferred to the destination before this event fires.
     * @param vault The StrategyVault that initiated the unmint.
     * @param yAsset The yield asset that was paid out.
     * @param destination The address that received the yAsset, as nominated by the
     *        strategist on the vault's borrow() call.
     * @param proUSDBurned The amount of proUSD burned from the vault.
     * @param yAssetReceived The amount of yAsset transferred to the destination.
     */
    event StrategicUnmintInstant(
        address indexed vault,
        address indexed yAsset,
        address indexed destination,
        uint256 proUSDBurned,
        uint256 yAssetReceived
    );

    /**
     * @notice Emitted when a strategist unmint is queued —
     *         yAsset will be paid out to the destination when the next batch in
     *         ProTokenUnmintHandler is processed.
     * @dev Fires from strategicUnmint when YAssetOperationsHandler reports insufficient
     *      liquidity for an instant payout. The proUSD has been burned from the vault;
     *      the destination must claim from ProTokenUnmintHandler once the operator
     *      processes the batch. Vault accounting (depositBase / depositProUSD) is reduced
     *      regardless of which path is taken — the obligation is settled at burn time.
     * @param vault The StrategyVault that initiated the unmint.
     * @param yAsset The yield asset that will be paid out.
     * @param destination The address that will receive the yAsset on claim, as
     *        nominated by the strategist on the vault's borrow() call.
     * @param proUSDBurned The amount of proUSD burned from the vault.
     * @param yAssetQueued The amount of yAsset queued for delivery to the destination.
     * @param handlerRequestId The request id in ProTokenUnmintHandler used to claim
     *        the yAsset once the batch is processed.
     */
    event StrategicUnmintQueued(
        address indexed vault,
        address indexed yAsset,
        address indexed destination,
        uint256 proUSDBurned,
        uint256 yAssetQueued,
        uint256 handlerRequestId
    );

    /**
     * @notice Emitted when a price deviation threshold is configured for a y asset
     * @dev This event tracks all threshold updates including setting to 0 (disabling the check)
     * @param yAsset The contract address of the y asset being configured
     * @param threshold The new price deviation threshold in 18 decimals (0 means disabled)
     */
    event PriceDeviationThresholdSet(address indexed yAsset, uint256 threshold);

    /**
     * @notice Emitted when minDeposit is set
     * @dev This event tracks all minDeposit value changes
     * @param previousD Old minDeposit
     * @param _minDepositBase New minDeposit
     */
    event MinDepositBaseSet(uint256 indexed previousD, uint256 indexed _minDepositBase);

    /**
     * @notice Emitted when minWithdraw is set
     * @dev This event tracks all minWithdraw value changes
     * @param previousW Old minWithdraw
     * @param _minWithdrawBase New minWithdraw
     */
    event MinWithdrawBaseSet(uint256 indexed previousW, uint256 indexed _minWithdrawBase);

    // ================================================
    // ==================== Errors ====================
    // ================================================
    error ZeroAddress();
    error ZeroAmount();
    error NotAdmin();
    error Unauthorized();
    error Paused();
    error YAssetNotEnabled();
    error YAssetPaused();
    error InsufficientAmountOut(uint256 amountOut, uint256 minAmountOut);
    error InvalidOraclePrice(address oracle);
    error YAssetPriceExceedsThreshold(uint256 assetPrice, uint256 upperLimit);
    error OraclePriceDeviation(uint256 deviation, uint256 maxAllowed);
    error InsufficientUnmintAmount(uint256 amount, uint256 minimumRequired);
    /// @notice Thrown when the provided yAsset is not in the configured unmint assets list
    error InvalidUnmintAsset(address yAsset);
    error RequestNotPending();
    error InvalidProofKind();
    error NotStrategyVault();
    error InvalidAuthority();
    error BelowMinDeposit(uint256 oldMin, uint256 newMin);
    error BelowMinWithdraw(uint256 oldMin, uint256 newMin);
    error InvalidMinBases();
}
