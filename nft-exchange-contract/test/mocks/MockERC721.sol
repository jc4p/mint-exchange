// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ERC721} from "solmate/tokens/ERC721.sol";

contract MockERC721 is ERC721 {
    uint256 private _tokenIdCounter;

    constructor() ERC721("MockNFT", "MNFT") {}

    function tokenURI(uint256) public pure override returns (string memory) {
        return "https://example.com/token/";
    }

    function mint(address to) public returns (uint256) {
        uint256 tokenId = _tokenIdCounter++;
        _mint(to, tokenId);
        return tokenId;
    }

    function mintTo(address to, uint256 tokenId) public {
        _mint(to, tokenId);
    }
}