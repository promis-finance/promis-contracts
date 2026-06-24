// SPDX-License-Identifier: Proprietary
pragma solidity 0.8.29;

/// @title IVersioned
/// @author Promis Team
/// @notice Interface for version tracking in UUPS upgradeable contracts
/// @dev All upgradeable contracts should implement this interface to enable
///      version monotonicity checks during upgrades.
///      Version format: MAJOR_MINOR_PATCH (e.g., 1_00_00 for v1.0.0, 1_02_03 for v1.2.3)
interface IVersioned {
    /// @notice Returns the implementation version
    /// @dev This should be a constant in each implementation contract
    /// @return The version number (e.g., 1_00_00 for v1.0.0)
    function VERSION() external view returns (uint256);

    /// @notice Error thrown when upgrade version is not strictly greater than current
    /// @param currentVersion The current implementation version
    /// @param newVersion The proposed new implementation version
    error VersionNotIncremented(uint256 currentVersion, uint256 newVersion);
}
