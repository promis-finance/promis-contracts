// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

import "../types/ProTokenPlusTypes.sol";

/// @title IProTokenPlusOperations
/// @author Promis Team
/// @notice Interface for the ProTokenPlusOperations satellite contract
/// @dev All functions are called via delegatecall from ProTokenPlus.
///      Direct calls are forbidden and will revert.
interface IProTokenPlusOperations {
    // ============ Errors ============

    /// @notice Thrown when the satellite is called directly instead of via delegatecall
    error DirectCallForbidden();

    /// @notice Thrown when the caller parameter doesn't match msg.sender
    error CallerMismatch();

    /// @notice Thrown when a proof signed by backend authority has expired
    error ProofExpired();

    // ============ Execute Functions ============

    /// @notice Executes deposit request logic
    /// @dev Must be called via delegatecall. Reverts on direct call.
    /// @param caller Original msg.sender (verified against msg.sender)
    /// @param tierID The tier to deposit into
    /// @param amount Amount of proUSD to deposit
    function executeCreateDepositRequest(
        address caller, 
        uint8 tierID, 
        uint256 amount
    ) external;

    function executeFinalizeDepositRequest(
        address _caller,
        uint256 _requestID, 
        ProTokenPlusTypes.ProofKind _proofKind, 
        uint256 _deadline,
        bytes calldata _proof
    ) external returns (uint256 positionID);

    /// @notice Executes withdraw request logic
    /// @dev Must be called via delegatecall. Reverts on direct call.
    /// @param caller Original msg.sender (verified against msg.sender)
    /// @param positionIDs Array of position IDs to withdraw from
    function executeCreateWithdrawRequest(
        address caller,
        uint256[] calldata positionIDs
    ) external;

    function executeFinalizeWithdrawRequest(
        address _caller,
        uint256 _requestID, 
        ProTokenPlusTypes.ProofKind _proofKind, 
        uint256 _deadline,
        bytes calldata _proof
    ) external returns (uint256 unbondingIndex);

    /// @notice Execute completeWithdraw logic
    /// @dev Must be called via delegatecall. Reverts on direct call.
    /// @param caller Original msg.sender (verified against msg.sender)
    /// @param unbondingIndices Array of unbonding request indices to complete
    function executeCompleteWithdraw(
        address caller,
        uint256[] calldata unbondingIndices
    ) external;

    /// @notice Execute relock logic
    /// @dev Must be called via delegatecall. Reverts on direct call.
    /// @param caller Original msg.sender (verified against msg.sender)
    /// @param positionIds Array of position IDs to relock
    /// @param amount Amount to relock
    /// @param toTierId The tier to relock into
    /// @return newPositionId The ID of the newly created relocked position
    function executeRelock(
        address caller,
        uint256[] calldata positionIds,
        uint256 amount,
        uint8 toTierId
    ) external returns (uint256 newPositionId);

    /// @notice Execute unlockedMerge logic
    /// @dev Must be called via delegatecall. Reverts on direct call.
    /// @param caller Original msg.sender (verified against msg.sender)
    /// @param positionIds Array of unlocked position IDs to merge
    /// @return newPositionId The ID of the newly created merged position
    function executeUnlockedMerge(
        address caller,
        uint256[] calldata positionIds
    ) external returns (uint256 newPositionId);
}
