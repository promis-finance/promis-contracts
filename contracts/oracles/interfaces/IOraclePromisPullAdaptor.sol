// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;
pragma abicoder v2;

interface IOraclePromisPullAdaptor {
    // ================================================
    // =========== Open External Functions ============
    // ================================================

    // ================================================
    // ======== Restricted External Functions =========
    // ================================================

    // ================================================
    // =========== Owner External Functions ===========
    // ================================================

    /// @notice Sets the staleness threshold for oracle data
    /// @dev This function is restricted to the admin of the contract
    /// @param _stalenessThreshold The new staleness threshold in seconds
    function setStalenessThreshold(uint256 _stalenessThreshold) external;

    /// @notice Adds a new authorized signer
    /// @dev This function is restricted to the admin of the contract
    /// @param signer The address of the signer to add
    function addSigner(address signer) external;

    /// @notice Removes an authorized signer
    /// @dev This function is restricted to the admin of the contract
    /// @param signer The address of the signer to remove
    function removeSigner(address signer) external;

    // ================================================
    // ================ View functions ================
    // ================================================

    /// @notice Checks if an address is an authorized signer
    /// @param signer The address to check
    /// @return True if the address is an authorized signer, false otherwise
    function isSigner(address signer) external view returns (bool);

    /// @notice Gets the list of all authorized signers
    /// @return An array of signer addresses
    function getSigners() external view returns (address[] memory);

    /// @notice Gets the current staleness threshold
    /// @return The staleness threshold in seconds
    function getStalenessThreshold() external view returns (uint256);

    // ================================================
    // ==================== Events ====================
    // ================================================

    /// @notice Emitted when staleness threshold is updated
    /// @param newThreshold The new staleness threshold in seconds
    event StalenessThresholdUpdated(uint256 newThreshold);

    /// @notice Emitted when a signer is added
    /// @param signer The address of the added signer
    event SignerAdded(address indexed signer);

    /// @notice Emitted when a signer is removed
    /// @param signer The address of the removed signer
    event SignerRemoved(address indexed signer);

    // ================================================
    // ==================== Errors ====================
    // ================================================

    error Unauthorized();
    error InvalidAddr();
    error InvalidInputs();
    error InvalidOraclePrice();
    error StaleOracleData();
    /// @notice Thrown when oracle timestamp is in the future (clock skew / buggy oracle)
    error FutureOracleTimestamp();
    /// @notice Thrown when the signer is not authorized
    error UnauthorizedSigner();
    /// @notice Thrown when the signer is already added
    error SignerAlreadyAdded();
    /// @notice Thrown when the signer is not found
    error SignerNotFound();
    /// @notice Thrown when not all signers have signed the payload
    error InsufficientSignatures();
    /// @notice Thrown when a duplicate signature is detected
    error DuplicateSignature();
    /// @notice Thrown when trying to initialize with fewer than minimum signers
    error InsufficientSigners();
    /// @notice Thrown when trying to remove a signer would go below minimum
    error MinimumSignersRequired();
}
