// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "./state/OraclePromisPullAdaptorState.sol";
import "./interfaces/IOracleAdaptor.sol";
import "./interfaces/IOraclePromisPullAdaptor.sol";
import "../core/interfaces/IProTokenSettings.sol";
import "../core/interfaces/IVersioned.sol";

/// @title OraclePromisPullAdaptor
/// @notice Oracle adaptor for Promis pull-based price feeds
/// @dev Implementation logic for UUPS proxy. Uses a pull model where price data
///      is passed in the transaction calldata and verified on-chain via signatures.
contract OraclePromisPullAdaptor is
    IOracleAdaptor,
    IOraclePromisPullAdaptor,
    OraclePromisPullAdaptorState,
    Initializable,
    UUPSUpgradeable,
    IVersioned
{
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    /// @notice Implementation version (v1.0.0)
    uint256 public constant VERSION = 1_00_00;

    /// @notice Minimum number of signers required
    uint256 public constant MIN_SIGNERS = 2;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _proTokenSettings,
        address[] calldata _initialSigners
    ) public initializer {
        __UUPSUpgradeable_init();
        if (_proTokenSettings == address(0)) revert InvalidAddr();
        if (_initialSigners.length < MIN_SIGNERS) revert InsufficientSigners();

        proTokenSettings = _proTokenSettings;
        stalenessThreshold = 180; // Default: 3 minutes

        // Add initial signers (check for duplicates within the initial array)
        for (uint256 i = 0; i < _initialSigners.length; i++) {
            if (_initialSigners[i] == address(0)) revert InvalidAddr();
            for (uint256 j = 0; j < i; j++) {
                if (_initialSigners[j] == _initialSigners[i])
                    revert SignerAlreadyAdded();
            }
            signers.push(_initialSigners[i]);
            emit SignerAdded(_initialSigners[i]);
        }
    }

    modifier onlyAdmin() {
        if (msg.sender != IProTokenSettings(proTokenSettings).getAdmin())
            revert Unauthorized();
        _;
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyAdmin {
        uint256 newVersion = IVersioned(newImplementation).VERSION();
        if (newVersion <= VERSION) {
            revert VersionNotIncremented(VERSION, newVersion);
        }
    }

    // ================================================
    // =========== Open External Functions ============
    // ================================================

    // ================================================
    // ======== Restricted External Functions =========
    // ================================================

    // ================================================
    // =========== Owner External Functions ===========
    // ================================================

    /// @inheritdoc IOraclePromisPullAdaptor
    function setStalenessThreshold(
        uint256 _stalenessThreshold
    ) external onlyAdmin {
        stalenessThreshold = _stalenessThreshold;
        emit StalenessThresholdUpdated(_stalenessThreshold);
    }

    /// @inheritdoc IOraclePromisPullAdaptor
    function addSigner(address signer) external onlyAdmin {
        if (signer == address(0)) revert InvalidAddr();

        // Check for duplicates
        for (uint256 i = 0; i < signers.length; i++) {
            if (signers[i] == signer) revert SignerAlreadyAdded();
        }

        signers.push(signer);
        emit SignerAdded(signer);
    }

    /// @inheritdoc IOraclePromisPullAdaptor
    function removeSigner(address signer) external onlyAdmin {
        if (signers.length <= MIN_SIGNERS) revert MinimumSignersRequired();

        uint256 index = signers.length;
        for (uint256 i = 0; i < signers.length; i++) {
            if (signers[i] == signer) {
                index = i;
                break;
            }
        }

        if (index == signers.length) revert SignerNotFound();

        // Swap with last element and pop
        signers[index] = signers[signers.length - 1];
        signers.pop();
        emit SignerRemoved(signer);
    }

    // ================================================
    // ================ View functions ================
    // ================================================

    /// @inheritdoc IOracleAdaptor
    function getOraclePriceForAsset(
        address asset,
        bytes calldata data
    ) public view override returns (uint256 price) {
        if (asset == address(0)) revert InvalidAddr();
        if (data.length < 32) revert InvalidInputs();

        price = uint256(bytes32(data[0:32]));
        if (price == 0) revert InvalidOraclePrice();

        // Each signer block is 32 (timestamp) + 65 (signature) = 97 bytes
        if ((data.length - 32) % 97 != 0) revert InvalidInputs();
        uint256 numSignatures = (data.length - 32) / 97;

        address[] memory _signers = signers;
        uint256 signersLength = _signers.length;
        if (signersLength == 0) revert InsufficientSignatures();
        if (numSignatures != signersLength) revert InsufficientSignatures();

        bool[] memory hasSigned = new bool[](signersLength);

        for (uint256 i = 0; i < numSignatures; i++) {
            _verifySignatureAndTimestamp(
                asset,
                price,
                data,
                i,
                _signers,
                hasSigned
            );
        }
    }

    /// @inheritdoc IOraclePromisPullAdaptor
    function isSigner(address signer) external view override returns (bool) {
        for (uint256 i = 0; i < signers.length; i++) {
            if (signers[i] == signer) return true;
        }
        return false;
    }

    /// @inheritdoc IOraclePromisPullAdaptor
    function getSigners() external view override returns (address[] memory) {
        return signers;
    }

    /// @inheritdoc IOraclePromisPullAdaptor
    function getStalenessThreshold() external view override returns (uint256) {
        return stalenessThreshold;
    }

    // ================================================
    // ============== Internal functions ==============
    // ================================================

    function _verifySignatureAndTimestamp(
        address asset,
        uint256 price,
        bytes calldata data,
        uint256 i,
        address[] memory _signers,
        bool[] memory hasSigned
    ) internal view {
        uint256 blockOffset = 32 + i * 97;
        uint256 timestamp = uint256(
            bytes32(data[blockOffset:blockOffset + 32])
        );

        if (timestamp > block.timestamp) revert FutureOracleTimestamp();
        if (block.timestamp - timestamp > stalenessThreshold)
            revert StaleOracleData();

        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked(asset, price, timestamp)
        ).toEthSignedMessageHash();

        uint256 sigOffset = blockOffset + 32;
        address recoveredSigner = ECDSA.recover(
            ethSignedMessageHash,
            uint8(bytes1(data[sigOffset + 64])),
            bytes32(data[sigOffset:sigOffset + 32]),
            bytes32(data[sigOffset + 32:sigOffset + 64])
        );

        bool isAuthorized = false;
        uint256 signersLength = _signers.length;
        for (uint256 j = 0; j < signersLength; j++) {
            if (_signers[j] == recoveredSigner) {
                if (hasSigned[j]) revert DuplicateSignature();
                hasSigned[j] = true;
                isAuthorized = true;
                break;
            }
        }

        if (!isAuthorized) revert UnauthorizedSigner();
    }
}
