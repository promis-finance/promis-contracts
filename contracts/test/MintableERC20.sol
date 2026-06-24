// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MintableERC20
contract MintableERC20 is ERC20, ERC20Burnable, Ownable {
    mapping(address => bool) public minters;
    uint8 private _decimals;

    event MinterSet(address indexed minter, bool allowed);

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        minters[msg.sender] = true;
        _decimals = decimals_;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    function setMinter(address minter, bool allowed) external onlyOwner {
        minters[minter] = allowed;
        emit MinterSet(minter, allowed);
    }

    function removeMinter(address minter) external onlyOwner {
        minters[minter] = false;
        emit MinterSet(minter, false);
    }

    function mint(address to, uint256 amount) external {
        require(minters[msg.sender], "NOT_MINTER");
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}
