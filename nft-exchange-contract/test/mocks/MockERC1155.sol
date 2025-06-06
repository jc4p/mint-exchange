// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ERC1155} from "solmate/tokens/ERC1155.sol";

contract MockERC1155 is ERC1155 {
    function uri(uint256) public pure override returns (string memory) {
        return "https://example.com/token/";
    }

    function mint(address to, uint256 id, uint256 amount) public {
        _mint(to, id, amount, "");
    }

    function mintBatch(address to, uint256[] memory ids, uint256[] memory amounts) public {
        _batchMint(to, ids, amounts, "");
    }
}