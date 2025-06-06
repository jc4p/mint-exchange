// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test, console2} from "forge-std/Test.sol";
import {NFTExchange} from "../src/NFTExchange.sol";
import {MockERC721} from "./mocks/MockERC721.sol";
import {MockERC1155} from "./mocks/MockERC1155.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract ListingTest is Test {
    NFTExchange exchange;
    MockERC721 erc721;
    MockERC1155 erc1155;
    MockUSDC usdc;

    address owner = address(this);
    address feeRecipient = address(0x1337);
    uint256 feeBps = 250; // 2.5%

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address charlie = address(0xC0C0);

    uint256 tokenId721;
    uint256 tokenId1155 = 1;
    uint256 listingPrice = 100 * 10**6; // 100 USDC
    uint256 listingDuration = 7 days;

    function setUp() public {
        usdc = new MockUSDC();
        exchange = new NFTExchange(address(usdc), feeRecipient, feeBps);
        erc721 = new MockERC721();
        erc1155 = new MockERC1155();

        // Setup initial NFTs
        tokenId721 = erc721.mint(alice);
        erc1155.mint(alice, tokenId1155, 10);

        // Give Bob some USDC
        usdc.mint(bob, 1000 * 10**6); // 1000 USDC
        
        // Approvals
        vm.prank(alice);
        erc721.setApprovalForAll(address(exchange), true);
        
        vm.prank(alice);
        erc1155.setApprovalForAll(address(exchange), true);
        
        vm.prank(bob);
        usdc.approve(address(exchange), type(uint256).max);
    }

    function testCreateListingERC721() public {
        vm.prank(alice);
        uint256 listingId = exchange.createListing(
            address(erc721),
            tokenId721,
            listingPrice,
            listingDuration
        );

        assertEq(listingId, 1);
        
        (
            address seller,
            address nftContract,
            uint256 tokenId,
            uint256 price,
            uint256 expiresAt,
            bool isERC721,
            bool sold,
            bool cancelled
        ) = exchange.listings(listingId);

        assertEq(seller, alice);
        assertEq(nftContract, address(erc721));
        assertEq(tokenId, tokenId721);
        assertEq(price, listingPrice);
        assertEq(expiresAt, block.timestamp + listingDuration);
        assertTrue(isERC721);
        assertFalse(sold);
        assertFalse(cancelled);
    }

    function testCreateListingERC1155() public {
        vm.prank(alice);
        uint256 listingId = exchange.createListing(
            address(erc1155),
            tokenId1155,
            listingPrice,
            listingDuration
        );

        assertEq(listingId, 1);
        
        (,,,,,bool isERC721,,) = exchange.listings(listingId);
        assertFalse(isERC721);
    }

    function testCreateListingFailsWithoutOwnership() public {
        vm.prank(bob);
        vm.expectRevert(NFTExchange.UnauthorizedCaller.selector);
        exchange.createListing(
            address(erc721),
            tokenId721,
            listingPrice,
            listingDuration
        );
    }

    function testCreateListingFailsWithoutApproval() public {
        uint256 newTokenId = erc721.mint(bob);
        
        vm.prank(bob);
        vm.expectRevert(NFTExchange.UnauthorizedCaller.selector);
        exchange.createListing(
            address(erc721),
            newTokenId,
            listingPrice,
            listingDuration
        );
    }

    function testCreateListingFailsWithZeroPrice() public {
        vm.prank(alice);
        vm.expectRevert(NFTExchange.InvalidPrice.selector);
        exchange.createListing(
            address(erc721),
            tokenId721,
            0,
            listingDuration
        );
    }

    function testCreateListingFailsWithZeroDuration() public {
        vm.prank(alice);
        vm.expectRevert(NFTExchange.InvalidDuration.selector);
        exchange.createListing(
            address(erc721),
            tokenId721,
            listingPrice,
            0
        );
    }

    function testCreateListingFailsWithInvalidNFT() public {
        vm.prank(alice);
        vm.expectRevert(NFTExchange.UnsupportedNFTStandard.selector);
        exchange.createListing(
            address(usdc),
            0,
            listingPrice,
            listingDuration
        );
    }

    function testCancelListing() public {
        vm.prank(alice);
        uint256 listingId = exchange.createListing(
            address(erc721),
            tokenId721,
            listingPrice,
            listingDuration
        );

        vm.prank(alice);
        exchange.cancelListing(listingId);

        (,,,,,, bool sold, bool cancelled) = exchange.listings(listingId);
        assertFalse(sold);
        assertTrue(cancelled);
    }

    function testCancelListingByOperator() public {
        vm.prank(alice);
        uint256 listingId = exchange.createListing(
            address(erc721),
            tokenId721,
            listingPrice,
            listingDuration
        );

        // Set charlie as operator
        exchange.setOperator(charlie, true);

        vm.prank(charlie);
        exchange.cancelListing(listingId);

        (,,,,,, bool sold, bool cancelled) = exchange.listings(listingId);
        assertTrue(cancelled);
    }

    function testCancelListingFailsForNonOwner() public {
        vm.prank(alice);
        uint256 listingId = exchange.createListing(
            address(erc721),
            tokenId721,
            listingPrice,
            listingDuration
        );

        vm.prank(bob);
        vm.expectRevert(NFTExchange.UnauthorizedCaller.selector);
        exchange.cancelListing(listingId);
    }

    function testCancelListingFailsIfAlreadySold() public {
        vm.prank(alice);
        uint256 listingId = exchange.createListing(
            address(erc721),
            tokenId721,
            listingPrice,
            listingDuration
        );

        // Buy the listing
        vm.prank(bob);
        exchange.buyListing(listingId);

        // Try to cancel
        vm.prank(alice);
        vm.expectRevert(NFTExchange.ListingAlreadySold.selector);
        exchange.cancelListing(listingId);
    }

    function testBuyListingERC721() public {
        vm.prank(alice);
        uint256 listingId = exchange.createListing(
            address(erc721),
            tokenId721,
            listingPrice,
            listingDuration
        );

        uint256 bobBalanceBefore = usdc.balanceOf(bob);
        uint256 aliceBalanceBefore = usdc.balanceOf(alice);
        uint256 feeRecipientBalanceBefore = usdc.balanceOf(feeRecipient);

        vm.prank(bob);
        exchange.buyListing(listingId);

        // Check NFT transferred
        assertEq(erc721.ownerOf(tokenId721), bob);

        // Check payments
        uint256 fee = (listingPrice * feeBps) / 10000;
        uint256 sellerAmount = listingPrice - fee;

        assertEq(usdc.balanceOf(bob), bobBalanceBefore - listingPrice);
        assertEq(usdc.balanceOf(alice), aliceBalanceBefore + sellerAmount);
        assertEq(usdc.balanceOf(feeRecipient), feeRecipientBalanceBefore + fee);

        // Check listing marked as sold
        (,,,,,, bool sold,) = exchange.listings(listingId);
        assertTrue(sold);
    }

    function testBuyListingERC1155() public {
        vm.prank(alice);
        uint256 listingId = exchange.createListing(
            address(erc1155),
            tokenId1155,
            listingPrice,
            listingDuration
        );

        uint256 aliceBalanceBefore = erc1155.balanceOf(alice, tokenId1155);
        uint256 bobBalanceBefore = erc1155.balanceOf(bob, tokenId1155);

        vm.prank(bob);
        exchange.buyListing(listingId);

        // Check NFT transferred (1 unit)
        assertEq(erc1155.balanceOf(alice, tokenId1155), aliceBalanceBefore - 1);
        assertEq(erc1155.balanceOf(bob, tokenId1155), bobBalanceBefore + 1);
    }

    function testBuyListingFailsIfExpired() public {
        vm.prank(alice);
        uint256 listingId = exchange.createListing(
            address(erc721),
            tokenId721,
            listingPrice,
            listingDuration
        );

        // Fast forward past expiry
        vm.warp(block.timestamp + listingDuration + 1);

        vm.prank(bob);
        vm.expectRevert(NFTExchange.ListingExpired.selector);
        exchange.buyListing(listingId);
    }

    function testBuyListingFailsIfCancelled() public {
        vm.prank(alice);
        uint256 listingId = exchange.createListing(
            address(erc721),
            tokenId721,
            listingPrice,
            listingDuration
        );

        vm.prank(alice);
        exchange.cancelListing(listingId);

        vm.prank(bob);
        vm.expectRevert(NFTExchange.ListingAlreadyCancelled.selector);
        exchange.buyListing(listingId);
    }

    function testBuyListingFailsIfAlreadySold() public {
        vm.prank(alice);
        uint256 listingId = exchange.createListing(
            address(erc721),
            tokenId721,
            listingPrice,
            listingDuration
        );

        vm.prank(bob);
        exchange.buyListing(listingId);

        // Charlie tries to buy the same listing
        usdc.mint(charlie, listingPrice);
        vm.prank(charlie);
        usdc.approve(address(exchange), listingPrice);

        vm.prank(charlie);
        vm.expectRevert(NFTExchange.ListingAlreadySold.selector);
        exchange.buyListing(listingId);
    }

    function testBuyListingFailsWithInsufficientBalance() public {
        vm.prank(alice);
        uint256 listingId = exchange.createListing(
            address(erc721),
            tokenId721,
            listingPrice,
            listingDuration
        );

        // Charlie has no USDC
        vm.prank(charlie);
        usdc.approve(address(exchange), listingPrice);

        vm.prank(charlie);
        vm.expectRevert("TRANSFER_FROM_FAILED");
        exchange.buyListing(listingId);
    }

    function testListingEvents() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, false);
        emit NFTExchange.ListingCreated(1, alice, address(erc721), tokenId721, listingPrice, "");
        
        uint256 listingId = exchange.createListing(
            address(erc721),
            tokenId721,
            listingPrice,
            listingDuration
        );

        vm.prank(bob);
        vm.expectEmit(true, true, true, true);
        emit NFTExchange.ListingSold(listingId, bob, listingPrice);
        exchange.buyListing(listingId);
    }

    function testFeeCalculation() public {
        // Test with no fee
        exchange.setMarketplaceFee(0);
        
        vm.prank(alice);
        uint256 listingId = exchange.createListing(
            address(erc721),
            tokenId721,
            listingPrice,
            listingDuration
        );

        uint256 aliceBalanceBefore = usdc.balanceOf(alice);
        uint256 feeRecipientBalanceBefore = usdc.balanceOf(feeRecipient);

        vm.prank(bob);
        exchange.buyListing(listingId);

        // Alice gets full amount
        assertEq(usdc.balanceOf(alice), aliceBalanceBefore + listingPrice);
        // Fee recipient gets nothing
        assertEq(usdc.balanceOf(feeRecipient), feeRecipientBalanceBefore);
    }
}