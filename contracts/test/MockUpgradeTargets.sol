// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title MockUpgradeTargetHigherVersion
/// @notice Upgrade target with VERSION = 1_00_01 (greater than ProToken's 1_00_00).
///         Used to test _authorizeUpgrade success path. Inherits UUPSUpgradeable
///         so proxiableUUID() is available for the UUPS upgrade flow.
contract MockUpgradeTargetHigherVersion is UUPSUpgradeable {
    uint256 public constant VERSION = 1_00_01;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function _authorizeUpgrade(address) internal override {}
}

/// @title MockUpgradeTargetSameVersion
/// @notice Upgrade target with VERSION = 1_00_00 (equal to ProToken's).
///         Used to test _authorizeUpgrade revert (VersionNotIncremented).
contract MockUpgradeTargetSameVersion is UUPSUpgradeable {
    uint256 public constant VERSION = 1_00_00;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function _authorizeUpgrade(address) internal override {}
}

/// @title MockUpgradeTargetLowerVersion
/// @notice Upgrade target with VERSION = 0_99_99 (less than ProToken's).
///         Used to test _authorizeUpgrade revert when downgrading.
contract MockUpgradeTargetLowerVersion is UUPSUpgradeable {
    uint256 public constant VERSION = 1; // can not make is 0_99_99 because can't start with 0, so 1 is smaller plain number

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function _authorizeUpgrade(address) internal override {}
}

/// @title MockSettingsUpgradeTargetHigherVersion
/// @notice Upgrade target with VERSION = 1_00_03 (greater than
///         ProTokenSettings.VERSION = 1_00_02). Used to test Settings'
///         _authorizeUpgrade success path.
contract MockSettingsUpgradeTargetHigherVersion is UUPSUpgradeable {
    uint256 public constant VERSION = 1_00_03;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function _authorizeUpgrade(address) internal override {}
}
