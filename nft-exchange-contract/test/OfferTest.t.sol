// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test, console2} from "forge-std/Test.sol";
import {NFTExchange} from "../src/NFTExchange.sol";
import {MockERC721} from "./mocks/MockERC721.sol";
import {MockERC1155} from "./mocks/MockERC1155.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract OfferTest is Test {
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
    uint256 offerAmount = 50 * 10**6; // 50 USDC
    uint256 offerDuration = 3 days;

    function setUp() public {
        usdc = new MockUSDC();
        exchange = new NFTExchange(address(usdc), feeRecipient, feeBps);
        erc721 = new MockERC721();
        erc1155 = new MockERC1155();

        // Setup initial NFTs
        tokenId721 = erc721.mint(alice);
        erc1155.mint(alice, tokenId1155, 10);

        // Give Bob and Charlie some USDC
        usdc.mint(bob, 1000 * 10**6); // 1000 USDC
        usdc.mint(charlie, 1000 * 10**6); // 1000 USDC
        
        // Approvals
        vm.prank(alice);
        erc721.setApprovalForAll(address(exchange), true);
        
        vm.prank(alice);
        erc1155.setApprovalForAll(address(exchange), true);
        
        vm.prank(bob);
        usdc.approve(address(exchange), type(uint256).max);
        
        vm.prank(charlie);
        usdc.approve(address(exchange), type(uint256).max);
    }

    function testMakeOfferERC721() public {
        vm.prank(bob);
        uint256 offerId = exchange.makeOffer(
            address(erc721),
            tokenId721,
            offerAmount,
            offerDuration
        );

        assertEq(offerId, 1);
        
        (
            address buyer,
            address nftContract,
            uint256 tokenId,
            uint256 amount,
            uint256 expiresAt,
            bool accepted,
            bool cancelled
        ) = exchange.offers(offerId);

        assertEq(buyer, bob);
        assertEq(nftContract, address(erc721));
        assertEq(tokenId, tokenId721);
        assertEq(amount, offerAmount);
        assertEq(expiresAt, block.timestamp + offerDuration);
        assertFalse(accepted);
        assertFalse(cancelled);
    }

    function testMakeOfferERC1155() public {
        vm.prank(bob);
        uint256 offerId = exchange.makeOffer(
            address(erc1155),
            tokenId1155,
            offerAmount,
            offerDuration
        );

        assertEq(offerId, 1);
        
        (address buyer,,,,,bool accepted,) = exchange.offers(offerId);
        assertEq(buyer, bob);
    }

    function testMakeOfferFailsWithZeroAmount() public {
        vm.prank(bob);
        vm.expectRevert(NFTExchange.InvalidPrice.selector);
        exchange.makeOffer(
            address(erc721),
            tokenId721,
            0,
            offerDuration
        );
    }

    function testMakeOfferFailsWithZeroDuration() public {
        vm.prank(bob);
        vm.expectRevert(NFTExchange.InvalidDuration.selector);
        exchange.makeOffer(
            address(erc721),
            tokenId721,
            offerAmount,
            0
        );
    }

    function testMakeOfferFailsWithInvalidNFT() public {
        vm.prank(bob);
        vm.expectRevert(NFTExchange.UnsupportedNFTStandard.selector);
        exchange.makeOffer(
            address(usdc),
            0,
            offerAmount,
            offerDuration
        );
    }

    function testMakeOfferFailsWithInsufficientBalance() public {
        address broke = address(0xBEEF);
        vm.prank(broke);
        usdc.approve(address(exchange), offerAmount);

        vm.prank(broke);
        vm.expectRevert(NFTExchange.InsufficientUSDCBalance.selector);
        exchange.makeOffer(
            address(erc721),
            tokenId721,
            offerAmount,
            offerDuration
        );
    }

    function testMakeOfferFailsWithInsufficientApproval() public {
        vm.prank(bob);
        usdc.approve(address(exchange), offerAmount - 1);

        vm.prank(bob);
        vm.expectRevert(NFTExchange.UnauthorizedCaller.selector);
        exchange.makeOffer(
            address(erc721),
            tokenId721,
            offerAmount,
            offerDuration
        );
    }

    function testAcceptOfferERC721() public {
        vm.prank(bob);
        uint256 offerId = exchange.makeOffer(
            address(erc721),
            tokenId721,
            offerAmount,
            offerDuration
        );

        uint256 aliceBalanceBefore = usdc.balanceOf(alice);
        uint256 bobBalanceBefore = usdc.balanceOf(bob);
        uint256 feeRecipientBalanceBefore = usdc.balanceOf(feeRecipient);

        vm.prank(alice);
        exchange.acceptOffer(offerId);

        // Check NFT transferred
        assertEq(erc721.ownerOf(tokenId721), bob);

        // Check payments
        uint256 fee = (offerAmount * feeBps) / 10000;
        uint256 sellerAmount = offerAmount - fee;

        assertEq(usdc.balanceOf(bob), bobBalanceBefore - offerAmount);
        assertEq(usdc.balanceOf(alice), aliceBalanceBefore + sellerAmount);
        assertEq(usdc.balanceOf(feeRecipient), feeRecipientBalanceBefore + fee);

        // Check offer marked as accepted
        (,,,,,bool accepted,) = exchange.offers(offerId);
        assertTrue(accepted);
    }

    function testAcceptOfferERC1155() public {
        vm.prank(bob);
        uint256 offerId = exchange.makeOffer(
            address(erc1155),
            tokenId1155,
            offerAmount,
            offerDuration
        );

        uint256 aliceBalanceBefore = erc1155.balanceOf(alice, tokenId1155);
        uint256 bobBalanceBefore = erc1155.balanceOf(bob, tokenId1155);

        vm.prank(alice);
        exchange.acceptOffer(offerId);

        // Check NFT transferred (1 unit)
        assertEq(erc1155.balanceOf(alice, tokenId1155), aliceBalanceBefore - 1);
        assertEq(erc1155.balanceOf(bob, tokenId1155), bobBalanceBefore + 1);
    }

    function testAcceptOfferFailsIfNotOwner() public {
        vm.prank(bob);
        uint256 offerId = exchange.makeOffer(
            address(erc721),
            tokenId721,
            offerAmount,
            offerDuration
        );

        vm.prank(charlie);
        vm.expectRevert(NFTExchange.UnauthorizedCaller.selector);
        exchange.acceptOffer(offerId);
    }

    function testAcceptOfferFailsIfExpired() public {
        vm.prank(bob);
        uint256 offerId = exchange.makeOffer(
            address(erc721),
            tokenId721,
            offerAmount,
            offerDuration
        );

        // Fast forward past expiry
        vm.warp(block.timestamp + offerDuration + 1);

        vm.prank(alice);
        vm.expectRevert(NFTExchange.OfferExpired.selector);
        exchange.acceptOffer(offerId);
    }

    function testAcceptOfferFailsIfCancelled() public {
        vm.prank(bob);
        uint256 offerId = exchange.makeOffer(
            address(erc721),
            tokenId721,
            offerAmount,
            offerDuration
        );

        vm.prank(bob);
        exchange.cancelOffer(offerId);

        vm.prank(alice);
        vm.expectRevert(NFTExchange.OfferAlreadyCancelled.selector);
        exchange.acceptOffer(offerId);
    }

    function testAcceptOfferFailsIfAlreadyAccepted() public {
        vm.prank(bob);
        uint256 offerId = exchange.makeOffer(
            address(erc721),
            tokenId721,
            offerAmount,
            offerDuration
        );

        vm.prank(alice);
        exchange.acceptOffer(offerId);

        // Try to accept again
        uint256 newTokenId = erc721.mint(alice);
        vm.prank(alice);
        vm.expectRevert(NFTExchange.OfferAlreadyAccepted.selector);
        exchange.acceptOffer(offerId);
    }

    function testCancelOffer() public {
        vm.prank(bob);
        uint256 offerId = exchange.makeOffer(
            address(erc721),
            tokenId721,
            offerAmount,
            offerDuration
        );

        vm.prank(bob);
        exchange.cancelOffer(offerId);

        (,,,,,, bool cancelled) = exchange.offers(offerId);
        assertTrue(cancelled);
    }

    function testCancelOfferByOperator() public {
        vm.prank(bob);
        uint256 offerId = exchange.makeOffer(
            address(erc721),
            tokenId721,
            offerAmount,
            offerDuration
        );

        // Set charlie as operator
        exchange.setOperator(charlie, true);

        vm.prank(charlie);
        exchange.cancelOffer(offerId);

        (,,,,,, bool cancelled) = exchange.offers(offerId);
        assertTrue(cancelled);
    }

    function testCancelOfferFailsForNonBuyer() public {
        vm.prank(bob);
        uint256 offerId = exchange.makeOffer(
            address(erc721),
            tokenId721,
            offerAmount,
            offerDuration
        );

        vm.prank(alice);
        vm.expectRevert(NFTExchange.UnauthorizedCaller.selector);
        exchange.cancelOffer(offerId);
    }

    function testCancelOfferFailsIfAlreadyAccepted() public {
        vm.prank(bob);
        uint256 offerId = exchange.makeOffer(
            address(erc721),
            tokenId721,
            offerAmount,
            offerDuration
        );

        vm.prank(alice);
        exchange.acceptOffer(offerId);

        vm.prank(bob);
        vm.expectRevert(NFTExchange.OfferAlreadyAccepted.selector);
        exchange.cancelOffer(offerId);
    }

    function testOfferEvents() public {
        vm.prank(bob);
        vm.expectEmit(true, true, true, true);
        emit NFTExchange.OfferMade(1, bob, address(erc721), tokenId721, offerAmount);
        
        uint256 offerId = exchange.makeOffer(
            address(erc721),
            tokenId721,
            offerAmount,
            offerDuration
        );

        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit NFTExchange.OfferAccepted(offerId, alice);
        exchange.acceptOffer(offerId);
    }

    function testMultipleOffersOnSameNFT() public {
        // Bob makes an offer
        vm.prank(bob);
        uint256 offerId1 = exchange.makeOffer(
            address(erc721),
            tokenId721,
            offerAmount,
            offerDuration
        );

        // Charlie makes a higher offer
        vm.prank(charlie);
        uint256 offerId2 = exchange.makeOffer(
            address(erc721),
            tokenId721,
            offerAmount * 2,
            offerDuration
        );

        // Alice accepts Charlie's offer
        vm.prank(alice);
        exchange.acceptOffer(offerId2);

        // Bob's offer is still active but can't be accepted now
        vm.prank(alice);
        vm.expectRevert(NFTExchange.UnauthorizedCaller.selector);
        exchange.acceptOffer(offerId1);

        // Bob should cancel his offer
        vm.prank(bob);
        exchange.cancelOffer(offerId1);
    }

    function testOfferWithoutApproval() public {
        uint256 newTokenId = erc721.mint(charlie);

        vm.prank(bob);
        uint256 offerId = exchange.makeOffer(
            address(erc721),
            newTokenId,
            offerAmount,
            offerDuration
        );

        // Charlie tries to accept without approving
        vm.prank(charlie);
        vm.expectRevert(NFTExchange.UnauthorizedCaller.selector);
        exchange.acceptOffer(offerId);

        // Now approve and try again
        vm.prank(charlie);
        erc721.approve(address(exchange), newTokenId);

        vm.prank(charlie);
        exchange.acceptOffer(offerId);

        assertEq(erc721.ownerOf(newTokenId), bob);
    }
}