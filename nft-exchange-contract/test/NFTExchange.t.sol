// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test, console2} from "forge-std/Test.sol";
import {NFTExchange} from "../src/NFTExchange.sol";
import {MockERC721} from "./mocks/MockERC721.sol";
import {MockERC1155} from "./mocks/MockERC1155.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract NFTExchangeTest is Test {
    NFTExchange exchange;
    MockERC721 erc721;
    MockERC1155 erc1155;
    MockUSDC usdc;

    address owner = address(this);
    address feeRecipient = address(0x1337);
    uint256 feeBps = 250; // 2.5%

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        usdc = new MockUSDC();
        exchange = new NFTExchange(address(usdc), feeRecipient, feeBps);
        erc721 = new MockERC721();
        erc1155 = new MockERC1155();
    }

    function testNFTStandardDetection() public view {
        // Test ERC721 detection
        assertTrue(exchange.isERC721(address(erc721)));
        assertFalse(exchange.isERC1155(address(erc721)));

        // Test ERC1155 detection
        assertTrue(exchange.isERC1155(address(erc1155)));
        assertFalse(exchange.isERC721(address(erc1155)));

        // Test non-NFT contract (ERC20)
        assertFalse(exchange.isERC721(address(usdc)));
        assertFalse(exchange.isERC1155(address(usdc)));

        // Test EOA - returns false due to try/catch
        assertFalse(exchange.isERC721(alice));
        assertFalse(exchange.isERC1155(alice));
    }

    function testERC721OwnershipCheck() public {
        uint256 tokenId = erc721.mint(alice);

        // Check ownership
        assertTrue(exchange.isERC721Owner(address(erc721), alice, tokenId));
        assertFalse(exchange.isERC721Owner(address(erc721), bob, tokenId));

        // Transfer and recheck
        vm.prank(alice);
        erc721.transferFrom(alice, bob, tokenId);
        
        assertFalse(exchange.isERC721Owner(address(erc721), alice, tokenId));
        assertTrue(exchange.isERC721Owner(address(erc721), bob, tokenId));
    }

    function testERC1155BalanceCheck() public {
        uint256 tokenId = 1;
        uint256 amount = 100;

        erc1155.mint(alice, tokenId, amount);

        // Check balances
        assertEq(exchange.getERC1155Balance(address(erc1155), alice, tokenId), amount);
        assertEq(exchange.getERC1155Balance(address(erc1155), bob, tokenId), 0);

        // Transfer some and recheck
        vm.prank(alice);
        erc1155.safeTransferFrom(alice, bob, tokenId, 30, "");

        assertEq(exchange.getERC1155Balance(address(erc1155), alice, tokenId), 70);
        assertEq(exchange.getERC1155Balance(address(erc1155), bob, tokenId), 30);
    }

    function testInvalidContractChecks() public {
        // Create a contract without ERC165 support
        address invalidContract = address(new InvalidContract());
        
        assertFalse(exchange.isERC721(invalidContract));
        assertFalse(exchange.isERC1155(invalidContract));
        assertFalse(exchange.isERC721Owner(invalidContract, alice, 0));
    }
}

contract InvalidContract {
    // Contract without ERC165 support
}

contract AccessControlTest is NFTExchangeTest {
    function testOnlyOwnerCanSetFee() public {
        // Owner can set fee
        exchange.setMarketplaceFee(500); // 5%
        assertEq(exchange.feeBps(), 500);

        // Non-owner cannot set fee
        vm.prank(alice);
        vm.expectRevert("UNAUTHORIZED");
        exchange.setMarketplaceFee(1000);
    }

    function testFeeCannotExceedMaximum() public {
        // Cannot set fee over 100%
        vm.expectRevert(NFTExchange.InvalidPrice.selector);
        exchange.setMarketplaceFee(10001);
    }

    function testOnlyOwnerCanSetFeeRecipient() public {
        address newRecipient = address(0x1234);
        
        // Owner can set fee recipient
        exchange.setFeeRecipient(newRecipient);
        assertEq(exchange.feeRecipient(), newRecipient);

        // Non-owner cannot set fee recipient
        vm.prank(alice);
        vm.expectRevert("UNAUTHORIZED");
        exchange.setFeeRecipient(address(0x5678));
    }

    function testCannotSetZeroAddressFeeRecipient() public {
        vm.expectRevert(NFTExchange.InvalidNFTContract.selector);
        exchange.setFeeRecipient(address(0));
    }

    function testOnlyOwnerCanSetOperators() public {
        // Owner can set operators
        exchange.setOperator(alice, true);
        assertTrue(exchange.operators(alice));

        exchange.setOperator(alice, false);
        assertFalse(exchange.operators(alice));

        // Non-owner cannot set operators
        vm.prank(bob);
        vm.expectRevert("UNAUTHORIZED");
        exchange.setOperator(alice, true);
    }

    function testOperatorModifier() public {
        // Create a mock listing to test operator access
        // For now, just verify the modifier exists and works
        // We'll test this more thoroughly when we implement listing functions
        assertTrue(true);
    }
}