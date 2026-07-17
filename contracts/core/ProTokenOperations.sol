// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./state/ProTokenOperationsState.sol";
import "./interfaces/IProTokenOperations.sol";
import "./interfaces/IProTokenSettings.sol";
import "./interfaces/IProToken.sol";
import "./interfaces/IVersioned.sol";
import "../oracles/interfaces/IOracleAdaptor.sol";
import "./types/ProTokenOperationsTypes.sol";
import "./interfaces/IYAssetOperationsHandler.sol";
import "./interfaces/IProTokenUnmintHandler.sol";

/**
 * @title ProTokenOperations
 * @notice Mints and unmints proUSD against yield assets (yAssets) via an async
 *         request → backend proof → finalize flow.
 * @dev UUPS proxy logic with reentrancy protection. SafeERC20 for all transfers.
 *
 *      PRECISION LOSS TOLERANCE: divide-before-multiply is used in places for gas.
 *      Bounds: 18-dec assets negligible (<1 wei per 1e18); 6-dec assets (e.g. USDC)
 *      up to 1e-12 per operation. Acceptable because (1) losses always favor the
 *      protocol (users receive slightly less, never more), (2) they are below typical
 *      gas costs, and (3) the minDepositBase/minWithdrawBase floors prevent dust
 *      exploitation.
 */
contract ProTokenOperations is
    ProTokenOperationsState,
    ReentrancyGuardUpgradeable,
    EIP712Upgradeable,
    UUPSUpgradeable,
    IProTokenOperations,
    IVersioned
{
    using SafeERC20 for IERC20;

    /// @notice Implementation version (v1.0.0)
    uint256 public constant VERSION = 1_00_00;

    /// @notice Precision for percentage calculations (100% = 10000)
    uint256 private constant PERCENTAGE_PRECISION = 10000;

    /// @notice Precision for USD calculations (18 decimals)
    uint256 private constant USD_PRECISION = 1e18;

    /// @notice Signature hash for async minting proof
    bytes32 private constant MINT_PROOF_TYPEHASH = keccak256("MintProof(uint256 requestId,address user,address receiver,address yAsset,uint256 amount,uint256 minAmountOut,uint8 proofKind)");
    
    /// @notice Signature hash for async unminting proof
    bytes32 private constant UNMINT_PROOF_TYPEHASH = keccak256("UnmintProof(uint256 requestId,address user,address receiver,address yAsset,uint256 amount,uint256 minAmountOut,uint8 proofKind)");

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract and seeds the deposit/withdraw floors.
     * @dev Both floors start at 100e18 (base/USD) so the anti-spam minimums are live
     *      from deployment; admin can adjust via setMinBases (withdraw floor never 0).
     * @param _proTokenSettings ProTokenSettings contract address.
     */
    function initialize(address _proTokenSettings) public initializer {
        __ReentrancyGuard_init();
        __EIP712_init("ProTokenOperations", "1");
        __UUPSUpgradeable_init();

        if (_proTokenSettings == address(0)) revert ZeroAddress();
        proTokenSettings = _proTokenSettings;

        minDepositBase = 100e18;
        minWithdrawBase = 100e18;
    }

    /// @notice Restricts access to the admin.
    modifier onlyAdmin() {
        IProTokenSettings ownerSource = IProTokenSettings(proTokenSettings);
        if (msg.sender != ownerSource.getAdmin()) revert NotAdmin();
        _;
    }

    /// @notice Reverts if the protocol is paused (pause state lives in ProTokenSettings).
    modifier whenNotPaused() {
        IProTokenSettings pauseSource = IProTokenSettings(proTokenSettings);
        if (pauseSource.isPaused()) revert Paused();
        _;
    }

    /// @notice Restricts access to the StrategyVault (for strategic mint/unmint).
    modifier onlyStrategyVault() {
        IProTokenSettings source = IProTokenSettings(proTokenSettings);
        if (msg.sender != source.getStrategyVault()) revert NotStrategyVault();
        _;
    }

    // ================================================
    // =========== Open External Functions ============
    // ================================================

    struct MintContext {
        uint256 proTokenMintAmount;
        uint256 yAssetUSD;
        uint256 proTokenUSD;
    }

    struct MintSettings {
        ProTokenSettingsTypes.GetYAssetResponse yAssetSettings;
        address proToken;
    }

    function _verifyProof(
        bytes32 _structHash,
        bytes calldata _proof
    ) internal view {
        bytes32 digest = _hashTypedDataV4(_structHash);
        address signer = ECDSA.recover(digest, _proof);

        IProTokenSettings source = IProTokenSettings(proTokenSettings);
        if (!source.isAuthority(signer)) revert InvalidAuthority();
    }

    function _prepareMintProToken(
        address _yAsset,
        uint256 _amount
    )
        internal
        view
        returns (
            MintContext memory ctx,
            MintSettings memory settings
        )
    {
        settings = _getRelevantSettingsStruct(_yAsset);
        if (!settings.yAssetSettings.settings.isEnabled) revert YAssetNotEnabled();
        if (settings.yAssetSettings.settings.isPaused) revert YAssetPaused();

        ctx = _calculateMintAmount(
            _yAsset,
            _amount,
            settings
        );
    }

    /// @inheritdoc IProTokenOperations
    function createMintRequest(
        address _yAsset, 
        uint256 _amount,       // yAsset
        uint256 _minAmountOut, // proToken
        address _receiver
    ) external override whenNotPaused nonReentrant {
        _validateMintInputs(_yAsset, _amount);

        // Assuming no fee-on-transfer asset
        IERC20(_yAsset).safeTransferFrom(msg.sender, address(this), _amount);
        
        uint256 requestID = mintRequestID++;
        mintRequests[requestID] = ProTokenOperationsTypes.Request({
            user: msg.sender,
            status: ProTokenOperationsTypes.Status.PENDING,
            receiver: _receiver,
            yAsset: _yAsset,
            amount: _amount,
            minAmountOut: _minAmountOut
        });

        emit MintRequestCreated(requestID, msg.sender, _yAsset, _amount, _minAmountOut, _receiver);
    }

    function finalizeMintRequest(
        uint256 _requestID, 
        ProTokenOperationsTypes.ProofKind _proofKind, 
        bytes calldata _proof
    ) external whenNotPaused nonReentrant {
        ProTokenOperationsTypes.Request storage request = mintRequests[_requestID];
        if (request.status != ProTokenOperationsTypes.Status.PENDING) revert RequestNotPending();
        if (msg.sender != request.user) revert Unauthorized();

        bytes32 structHash = keccak256(
            abi.encode(
                MINT_PROOF_TYPEHASH,
                _requestID,
                request.user,
                request.receiver,
                request.yAsset,
                request.amount,
                request.minAmountOut,
                uint8(_proofKind)
            )
        );

        _verifyProof(
            structHash,
            _proof
        );

        request.status = ProTokenOperationsTypes.Status.EXECUTED;

        uint256 mintAmount;
        if (_proofKind == ProTokenOperationsTypes.ProofKind.PROOF_OF_APPROVE) {
            mintAmount = _mintProToken(request);
        } else if (_proofKind == ProTokenOperationsTypes.ProofKind.PROOF_OF_RETURN) {            
            IERC20(request.yAsset).safeTransfer(
                request.user,
                request.amount
            );
        } else revert InvalidProofKind();

        emit MintRequestFinalized(_requestID, request.user, request.yAsset, request.amount, mintAmount, uint8(_proofKind));
    }

    function _mintProToken(
        ProTokenOperationsTypes.Request memory request
    ) internal returns(uint256) {
        (
            MintContext memory ctx,
            MintSettings memory settings
        ) = _prepareMintProToken(request.yAsset, request.amount);

        if (ctx.proTokenMintAmount < request.minAmountOut)
            revert InsufficientAmountOut(ctx.proTokenMintAmount, request.minAmountOut);

        address recipient = request.receiver == address(0) ? request.user : request.receiver;
        _executeMint(
            request.user,
            recipient,
            request.yAsset,
            request.amount,
            ctx.proTokenMintAmount,
            ctx,
            settings
        );

        return ctx.proTokenMintAmount;
    }

    /// @inheritdoc IProTokenOperations
    function simulateMintProToken(
        address _yAsset,
        uint256 _amount
    ) external view override whenNotPaused returns (uint256) {
        (MintContext memory ctx, ) = _prepareMintProToken(
            _yAsset,
            _amount
        );

        return ctx.proTokenMintAmount;
    }

    /// @inheritdoc IProTokenOperations
    function createUnmintRequest(
        address _yAsset, 
        uint256 _amount,       // proToken
        uint256 _minAmountOut, // yAsset
        address _receiver
    ) external whenNotPaused nonReentrant {
        if (_amount == 0) revert ZeroAmount();
        _validateUnmintAsset(_yAsset);

        ProTokenSettingsTypes.GetYAssetResponse
            memory yAssetSettings = _getYAssetSettings(_yAsset);
        if (!yAssetSettings.settings.isEnabled) revert YAssetNotEnabled();
        if (yAssetSettings.settings.isPaused) revert YAssetPaused();

        ProTokenSettingsTypes.GetProTokenInfoResponse
            memory proTokenInfo = IProTokenSettings(proTokenSettings).getProTokenInfo();

        uint256 minW = minWithdrawBase;
        if (minW != 0) {
            UsdRepresentation memory rep = _getUsdRepresentationProToken(
                proTokenInfo.proToken,
                _amount,
                18
            );
            if (rep.assetAmountUSD < minW)
                revert BelowMinWithdraw(rep.assetAmountUSD, minW);
        }

        IERC20(proTokenInfo.proToken).safeTransferFrom(msg.sender, address(this), _amount);

        uint256 requestID = unmintRequestID++;
        unmintRequests[requestID] = ProTokenOperationsTypes.Request({
            user: msg.sender,
            status: ProTokenOperationsTypes.Status.PENDING,
            receiver: _receiver,
            yAsset: _yAsset,
            amount: _amount,
            minAmountOut: _minAmountOut
        });        

        emit UnmintRequestCreated(requestID, msg.sender, _yAsset, _amount, _minAmountOut, _receiver);
    }

    function finalizeUnmintRequest(
        uint256 _requestID, 
        ProTokenOperationsTypes.ProofKind _proofKind, 
        bytes calldata _proof
    ) external whenNotPaused nonReentrant {
        ProTokenOperationsTypes.Request storage request = unmintRequests[_requestID];
        if (request.status != ProTokenOperationsTypes.Status.PENDING) revert RequestNotPending();
        if (msg.sender != request.user) revert Unauthorized();

        bytes32 structHash = keccak256(
            abi.encode(
                UNMINT_PROOF_TYPEHASH,
                _requestID,
                request.user,
                request.receiver,
                request.yAsset,
                request.amount,
                request.minAmountOut,
                uint8(_proofKind)
            )
        );
        
        _verifyProof(
            structHash,
            _proof
        );

        request.status = ProTokenOperationsTypes.Status.EXECUTED;

        uint256 yAssetAmount;
        if (_proofKind == ProTokenOperationsTypes.ProofKind.PROOF_OF_APPROVE) {
            yAssetAmount = _unMintProToken(request);
        } else if (_proofKind == ProTokenOperationsTypes.ProofKind.PROOF_OF_RETURN) {            
            ProTokenSettingsTypes.GetProTokenInfoResponse
                memory proTokenInfo = IProTokenSettings(proTokenSettings).getProTokenInfo();
            IERC20(proTokenInfo.proToken).safeTransfer(
                request.user,
                request.amount
            );
        } else revert InvalidProofKind();

        emit UnmintRequestFinalized(_requestID, request.user, request.yAsset, request.amount, yAssetAmount);
    }

    function _unMintProToken(
        ProTokenOperationsTypes.Request memory request
    ) internal returns(uint256) {

        address recipient = request.receiver == address(0) ? request.user : request.receiver;

        return _executeUnmint(
            request.user,
            recipient,
            request.yAsset,
            request.amount,
            request.minAmountOut
        );
    }

    function _executeUnmint(
        address _sender,
        address _recipient,
        address _yAsset,
        uint256 _amount,
        uint256 _minAmountOut
    ) internal returns(uint256) {
        // Get pro token info
        ProTokenSettingsTypes.GetProTokenInfoResponse
            memory proTokenInfo = IProTokenSettings(proTokenSettings)
                .getProTokenInfo();

        // Validate unmint asset
        _validateUnmintAsset(_yAsset);

        // Get y asset settings for the unmint y asset
        ProTokenSettingsTypes.GetYAssetResponse
            memory yAssetSettings = _getYAssetSettings(_yAsset);

        if (!yAssetSettings.settings.isEnabled) revert YAssetNotEnabled();
        if (yAssetSettings.settings.isPaused) revert YAssetPaused();

        uint256 yAssetToReceiveAmount = _calculateUnmintAmount(
            _yAsset,
            _amount,
            yAssetSettings,
            proTokenInfo.proToken
        );

        // Check if there are any fees to pay for the unmint configured.
        // unmintFeePer is scaled by 1e18 (wad precision): 1e16 = 1% fee, 5e15 = 0.5% fee.
        if (yAssetSettings.settings.unmintFeePer > 0) {
            // Calculate the fee amount using wad precision (1e18)
            uint256 feeAmount = (yAssetToReceiveAmount *
                yAssetSettings.settings.unmintFeePer) / USD_PRECISION;

            // Reduce the amount to unmint by the fee amount
            yAssetToReceiveAmount -= feeAmount;

            // Fee stays on the protocol (protocol keeps it)
        }

        if (yAssetToReceiveAmount < _minAmountOut)
            revert InsufficientAmountOut(yAssetToReceiveAmount, _minAmountOut);

        // burn the pro tokens from the user
        IProToken(proTokenInfo.proToken).burn(address(this), _amount);

        // Branch: instant payout if liquidity allows, otherwise queue in UnmintHandler
        IYAssetOperationsHandler yOps =
            IYAssetOperationsHandler(yAssetSettings.settings.yOperationsHandler);

        uint256 backlog = IProTokenUnmintHandler(proTokenInfo.proTokenUnmintHandler).getUnpaidQueuedLiability(_yAsset);
        bool paidInstant;
        if (yOps.previewPayOut(yAssetToReceiveAmount + backlog)) {
            try yOps.payOut(_recipient, yAssetToReceiveAmount) {
                paidInstant = true;
            } catch {
                // fall through to the queue path below
            }
        }

        if (paidInstant) {
            emit ProTokenUnmintInstant(
                _sender,
                _recipient,
                _yAsset,
                _amount,
                yAssetToReceiveAmount
            );
        } else {
            uint256 handlerRequestId = IProTokenUnmintHandler(
                proTokenInfo.proTokenUnmintHandler
            ).createUnmintRequest(_recipient, _yAsset, yAssetToReceiveAmount);

            emit ProTokenUnmintQueued(
                _sender,
                _recipient,
                _yAsset,
                _amount,
                yAssetToReceiveAmount,
                handlerRequestId
            );
        }

        return yAssetToReceiveAmount;
    }

    function _validateUnmintAsset(address _yAsset) internal view {
        // Get the configured unmint y assets
        address[] memory unmintYAssets = IProTokenSettings(proTokenSettings)
            .getUnmintYAssets();

        // Check if _yAsset is in the unmintYAssets array
        bool isValidUnmintAsset = false;
        for (uint256 i = 0; i < unmintYAssets.length; i++) {
            if (unmintYAssets[i] == _yAsset) {
                isValidUnmintAsset = true;
                break;
            }
        }
        if (!isValidUnmintAsset) revert InvalidUnmintAsset(_yAsset);
    }

    function _getYAssetSettings(
        address _yAsset
    ) internal view returns (ProTokenSettingsTypes.GetYAssetResponse memory) {
        address[] memory queryAssets = new address[](1);
        queryAssets[0] = _yAsset;
        ProTokenSettingsTypes.GetYAssetsResponse
            memory yAssetsResponse = IProTokenSettings(proTokenSettings)
                .getYAssets(queryAssets);

        if (yAssetsResponse.yAssets.length == 0) {
            revert YAssetNotEnabled();
        }

        return yAssetsResponse.yAssets[0];
    }

    // ================================================
    // ======== Restricted External Functions =========
    // ================================================

    /// @inheritdoc IProTokenOperations
    function strategicMint(
        uint256 _yAssetAmount,
        address _yAsset
    ) external override whenNotPaused nonReentrant onlyStrategyVault returns (uint256 proUSDMinted) {
        if (_yAssetAmount == 0) revert ZeroAmount();
        if (_yAsset == address(0)) revert ZeroAddress();

        // Pull the yAsset from the vault.
        IERC20(_yAsset).safeTransferFrom(msg.sender, address(this), _yAssetAmount);

        // Validates enabled/not paused and computes proUSD out + routing context.
        (MintContext memory ctx, MintSettings memory settings) =
            _prepareMintProToken(_yAsset, _yAssetAmount);
        proUSDMinted = ctx.proTokenMintAmount;

        // Same internal path as a normal mint: routes yAsset to the handler and mints proUSD.
        _executeMint(
            msg.sender,
            msg.sender,
            _yAsset,
            _yAssetAmount,
            proUSDMinted,
            ctx,
            settings
        );

        emit StrategicMint(
            msg.sender, 
            _yAsset, 
            msg.sender, 
            _yAssetAmount, 
            proUSDMinted
        );
    }

    /// @inheritdoc IProTokenOperations
    function strategicUnmint(
        address _yAsset,
        uint256 _proUSDAmount,
        address _destination
    ) external override whenNotPaused nonReentrant onlyStrategyVault returns (uint256 yAssetReceived) {
        if (_proUSDAmount == 0) revert ZeroAmount();
        if (_yAsset == address(0) || _destination == address(0)) revert ZeroAddress();

        _validateUnmintAsset(_yAsset);

        ProTokenSettingsTypes.GetYAssetResponse memory yAssetSettings =
            _getYAssetSettings(_yAsset);
        if (!yAssetSettings.settings.isEnabled) revert YAssetNotEnabled();
        if (yAssetSettings.settings.isPaused) revert YAssetPaused();

        ProTokenSettingsTypes.GetProTokenInfoResponse memory proTokenInfo =
            IProTokenSettings(proTokenSettings).getProTokenInfo();

        // yAsset owed for this proUSD amount (same conversion as the normal unmint).
        yAssetReceived = _calculateUnmintAmount(
            _yAsset,
            _proUSDAmount,
            yAssetSettings,
            proTokenInfo.proToken
        );

        // Burn the vault's proUSD. yAsset is paid out instantly if liquidity allows, 
        // otherwise queued in the unmint handler for later claim by the destination.
        IProToken(proTokenInfo.proToken).burn(msg.sender, _proUSDAmount);

        // Branch: instant payout if handlers can cover it, otherwise queue
        IYAssetOperationsHandler yOps =
            IYAssetOperationsHandler(yAssetSettings.settings.yOperationsHandler);

        uint256 backlog = IProTokenUnmintHandler(proTokenInfo.proTokenUnmintHandler).getUnpaidQueuedLiability(_yAsset);
        bool paidInstant;
        if (yOps.previewPayOut(yAssetReceived + backlog)) {
            try yOps.payOut(_destination, yAssetReceived) {
                paidInstant = true;
            } catch {
                // fall through to the queue path below
            }
        } 
        
        if (paidInstant) {
            emit StrategicUnmintInstant(
                msg.sender,
                _yAsset,
                _destination,
                _proUSDAmount,
                yAssetReceived
            );
        } else {
            uint256 handlerRequestId = IProTokenUnmintHandler(
                proTokenInfo.proTokenUnmintHandler
            ).createUnmintRequest(_destination, _yAsset, yAssetReceived);

            emit StrategicUnmintQueued(
                msg.sender,
                _yAsset,
                _destination,
                _proUSDAmount,
                yAssetReceived,
                handlerRequestId
            );
        }
    }

    // ================================================
    // =========== Owner External Functions ===========
    // ================================================

    /// @inheritdoc IProTokenOperations
    function setMinBases(uint256 _minDepositBase, uint256 _minWithdrawBase) external override onlyAdmin {

        if (_minDepositBase == 0 || _minWithdrawBase == 0) revert InvalidMinBases();
 
        uint256 previousD = minDepositBase;
        minDepositBase = _minDepositBase;

        uint256 previousW = minWithdrawBase;
        minWithdrawBase = _minWithdrawBase;

        emit MinDepositBaseSet(previousD, _minDepositBase);
        emit MinWithdrawBaseSet(previousW, _minWithdrawBase);
    }

    // ================================================
    // ============== Internal functions ==============
    // ================================================

    function _validateMintInputs(
        address _yAsset,
        uint256 _amount
    ) internal view {
        if (_yAsset == address(0)) revert ZeroAddress();
        if (_amount == 0) revert ZeroAmount();

        ProTokenSettingsTypes.GetYAssetResponse memory yAssetSettings =
            _getYAssetSettings(_yAsset);

        if (!yAssetSettings.settings.isEnabled) revert YAssetNotEnabled();
        if (yAssetSettings.settings.isPaused) revert YAssetPaused();

        uint256 min = minDepositBase;
        if (min != 0) {
            UsdRepresentation memory rep = _getUsdRepresentationYAsset(
                _yAsset,
                _amount,
                yAssetSettings.settings.priceSettings,
                yAssetSettings.settings.decimals
            );
            if (rep.assetAmountUSD < min)
                revert BelowMinDeposit(rep.assetAmountUSD, min);
        }
    }

    function _calculateMintAmount(
        address _yAsset,
        uint256 _amount,
        MintSettings memory settings
    ) internal view returns (MintContext memory ctx) {

        // Convert both proToken and yAsset to their current USD representations
        UsdRepresentation
            memory proTokenUsdRepresentation = _getUsdRepresentationProToken(
                settings.proToken,
                1e18, // 1 pro token in 18 decimals
                18
            );

        UsdRepresentation
            memory yAssetUsdRepresentation = _getUsdRepresentationYAsset(
                _yAsset,
                _amount,
                settings.yAssetSettings.settings.priceSettings,
                settings.yAssetSettings.settings.decimals
            );

        // Zero-division protection for pro token price
        if (proTokenUsdRepresentation.assetAmountUSD == 0) {
            revert InvalidOraclePrice(address(0));
        }

        ctx.proTokenMintAmount = _calculateMintingAmount(
            _amount,
            yAssetUsdRepresentation,
            proTokenUsdRepresentation,
            settings.yAssetSettings.settings.priceSettings,
            settings.yAssetSettings.settings.decimals
        );
        ctx.yAssetUSD = yAssetUsdRepresentation.assetUSD;
        ctx.proTokenUSD = proTokenUsdRepresentation.assetUSD;
    }

    function _executeMint(
        address _sender,
        address _recipient,
        address _yAsset,
        uint256 _yAmount,
        uint256 _mintAmount,
        MintContext memory ctx,
        MintSettings memory settings
    ) internal {
        emit ProTokenMint(
            _sender,
            _recipient,
            _yAsset,
            _yAmount,
            _mintAmount,
            ctx.yAssetUSD,
            ctx.proTokenUSD
        );

        // Transfer the y asset to the yield operations handler
        IERC20(_yAsset).safeTransfer(
            settings.yAssetSettings.settings.yOperationsHandler,
            _yAmount
        );

        // Send message to the yield operations handler
        IYAssetOperationsHandler(
            settings.yAssetSettings.settings.yOperationsHandler
        ).distributeYAsset(_yAmount);

        // Mint the pro tokens to the recipient
        IProToken(settings.proToken).mint(_recipient, _mintAmount);
    }

    function _getRelevantSettingsStruct(
        address _yAsset
    ) internal view returns (MintSettings memory settings) {
        (
            settings.yAssetSettings,
            settings.proToken
        ) = _getRelevantSettings(_yAsset);
    }

    function _getRelevantSettings(
        address _yAsset
    )
        internal
        view
        returns (
            ProTokenSettingsTypes.GetYAssetResponse memory yAssetSettings,
            address proToken
        )
    {
        yAssetSettings = _getYAssetSettings(_yAsset);

        ProTokenSettingsTypes.GetProTokenInfoResponse memory proTokenInfo =
            IProTokenSettings(proTokenSettings).getProTokenInfo();

        proToken = proTokenInfo.proToken;
    }

    struct UsdRepresentation {
        uint256 assetUSD;
        uint256 assetAmountUSD;
    }

    function _calculateUnmintAmount(
        address _yAsset,
        uint256 _proTokenAmount,
        ProTokenSettingsTypes.GetYAssetResponse memory yAssetSettings,
        address proToken
    ) internal view returns (uint256) {
        // Convert both proToken and yAsset to their current USD representations
        UsdRepresentation
            memory proTokenUsdRepresentation = _getUsdRepresentationProToken(
                proToken,
                _proTokenAmount,
                18
            );

        // Get USD representation for 1 unit of yAsset to establish the exchange rate
        uint256 oneYAssetUnit = 10 ** yAssetSettings.settings.decimals;
        UsdRepresentation
            memory yAssetUsdRepresentation = _getUsdRepresentationYAsset(
                _yAsset,
                oneYAssetUnit,
                yAssetSettings.settings.priceSettings,
                yAssetSettings.settings.decimals
            );

        // Zero-division protection for y asset price
        if (yAssetUsdRepresentation.assetAmountUSD == 0) {
            revert InvalidOraclePrice(address(0));
        }

        // A configured usdCap is mandatory (see _calculateMintingAmount).
        if (yAssetSettings.settings.priceSettings.usdCap == 0) revert ZeroUsdCap();
            
        // Cap the yAsset USD value at the configured cap
        uint256 cappedYAssetUSD = yAssetUsdRepresentation.assetUSD >
            yAssetSettings.settings.priceSettings.usdCap
            ? yAssetSettings.settings.priceSettings.usdCap
            : yAssetUsdRepresentation.assetUSD;

        // Calculate amount using capped USD value
        // yAssetAmount = (proTokenUSD * yAssetDecimals) / cappedYAssetUSD
        return
            (proTokenUsdRepresentation.assetAmountUSD *
                oneYAssetUnit) /
            cappedYAssetUSD;
    }

    function _calculateMintingAmount(
        uint256 yAssetAmount,
        UsdRepresentation memory yAssetUsdRep,
        UsdRepresentation memory proTokenUsdRep,
        ProTokenSettingsTypes.YAssetPriceSettings memory yAssetPriceSettings,
        uint8 yAssetDecimals
    ) internal pure returns (uint256) {

        // A configured usdCap is mandatory: it clamps the yAsset's USD value on the
        // mint side (credit at most min(price, cap) per unit).
        if (yAssetPriceSettings.usdCap == 0) revert ZeroUsdCap();

        // Cap the yAsset USD value at the configured cap: min(price, cap)
        uint256 cappedYAssetUSD = yAssetUsdRep.assetUSD >
            yAssetPriceSettings.usdCap
            ? yAssetPriceSettings.usdCap
            : yAssetUsdRep.assetUSD;

        // Calculate amount using capped USD value
        uint256 cappedYAssetAmountUSD = (yAssetAmount *
            cappedYAssetUSD) / (10 ** yAssetDecimals);
        return
            (cappedYAssetAmountUSD * USD_PRECISION) /
            proTokenUsdRep.assetAmountUSD;
    }

    function _getUsdRepresentationProToken(
        address _proToken,
        uint256 _amount,
        uint8 _decimals
    ) internal view returns (UsdRepresentation memory usdRepresentation) {
        // get price directly from pro token contract
        usdRepresentation.assetUSD = IProToken(_proToken).getUSDPrice();
        usdRepresentation.assetAmountUSD =
            (_amount * usdRepresentation.assetUSD) /
            (10 ** _decimals); // come as 18 decimals
    }

    function _getUsdRepresentationYAsset(
        address _asset,
        uint256 _amount,
        ProTokenSettingsTypes.YAssetPriceSettings memory _priceSettings,
        uint8 _decimals
    ) internal view returns (UsdRepresentation memory usdRepresentation) {
        // calculate the USD representation of the y asset using the configured price settings
        if (_priceSettings.staticPriceSource != 0) {
            usdRepresentation.assetUSD = _priceSettings.staticPriceSource; // come always as 18 decimals
            usdRepresentation.assetAmountUSD =
                (_amount * _priceSettings.staticPriceSource) /
                (10 ** _decimals); // come as 18 decimals
        } else if (_priceSettings.oraclePriceSources.length > 0) {
            usdRepresentation.assetUSD = _aggregateOraclePrices(
                _asset,
                _priceSettings.oraclePriceSources
            ); // come always as 18 decimals
            usdRepresentation.assetAmountUSD =
                (_amount * usdRepresentation.assetUSD) /
                (10 ** _decimals); // come as 18 decimals
        }
    }

    function _aggregateOraclePrices(
        address _asset,
        address[] memory _oracles
    ) internal view returns (uint256 aggregatedPrice) {
        if (_oracles.length == 0) {
            return 0;
        }

        uint256[] memory prices = new uint256[](_oracles.length);

        // Query all oracles - ALL must respond successfully
        for (uint256 i = 0; i < _oracles.length; i++) {

            // Revert if any oracle fails - this is critical for security
            // All configured oracles must be operational for multi-oracle security to work
            uint256 price = IOracleAdaptor(_oracles[i]).getOraclePriceForAsset(_asset);

            if (price == 0) {
                revert InvalidOraclePrice(_oracles[i]);
            }

            prices[i] = price;
        }

        // Calculate median price from all oracles
        aggregatedPrice = _calculateMedianPrice(prices, _oracles.length);

        // Validate price deviation if multiple oracles responded
        if (_oracles.length > 1) {
            _validatePriceDeviation(prices, _oracles.length, aggregatedPrice);
        }
    }

    function _calculateMedianPrice(
        uint256[] memory prices,
        uint256 length
    ) internal pure returns (uint256) {
        // Sort prices
        for (uint256 i = 0; i < length - 1; i++) {
            for (uint256 j = 0; j < length - i - 1; j++) {
                if (prices[j] > prices[j + 1]) {
                    uint256 temp = prices[j];
                    prices[j] = prices[j + 1];
                    prices[j + 1] = temp;
                }
            }
        }

        // Return median
        if (length % 2 == 0) {
            return (prices[length / 2 - 1] + prices[length / 2]) / 2;
        } else {
            return prices[length / 2];
        }
    }

    function _validatePriceDeviation(
        uint256[] memory prices,
        uint256 length,
        uint256 medianPrice
    ) internal view {
        ProTokenOperationsTypes.OracleAggregationSettings
            memory settings = IProTokenSettings(proTokenSettings)
                .getOracleAggregationSettings();

        if (settings.maxPriceDeviation == 0) {
            return; // No deviation check configured
        }

        uint256 minPrice = prices[0];
        uint256 maxPrice = prices[length - 1];
        uint256 spread = ((maxPrice - minPrice) * PERCENTAGE_PRECISION) / minPrice;
        if (spread > settings.maxPriceDeviation) {
            revert OraclePriceDeviation(spread, settings.maxPriceDeviation);
        }
        
        for (uint256 i = 0; i < length; i++) {
            uint256 deviation;
            if (prices[i] > medianPrice) {
                deviation =
                    ((prices[i] - medianPrice) * PERCENTAGE_PRECISION) /
                    medianPrice;
            } else {
                deviation =
                    ((medianPrice - prices[i]) * PERCENTAGE_PRECISION) /
                    medianPrice;
            }

            if (deviation > settings.maxPriceDeviation) {
                revert OraclePriceDeviation(
                    deviation,
                    settings.maxPriceDeviation
                );
            }
        }
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
