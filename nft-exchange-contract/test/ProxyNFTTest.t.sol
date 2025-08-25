// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test, console2} from "forge-std/Test.sol";
import {NFTExchange} from "../src/NFTExchange.sol";
import {MockProxyNFT} from "./mocks/MockProxyNFT.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract ProxyNFTTest is Test {
    NFTExchange exchange;
    MockProxyNFT proxyNFT;
    MockUSDC usdc;

    address owner = address(this);
    address feeRecipient = address(0x1337);
    uint256 feeBps = 100; // 1%

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        usdc = new MockUSDC();
        exchange = new NFTExchange(address(usdc), feeRecipient, feeBps);
        proxyNFT = new MockProxyNFT();
        
        // Give users some USDC
        usdc.mint(alice, 10000 * 1e6);
        usdc.mint(bob, 10000 * 1e6);
    }

    function testProxyNFTDetection() public view {
        // Should detect as ERC721 even without ERC165 support
        assertTrue(exchange.isERC721(address(proxyNFT)));
        assertFalse(exchange.isERC1155(address(proxyNFT)));
    }

    function testCreateListingWithProxyNFT() public {
        // Mint NFT to alice
        uint256 tokenId = proxyNFT.mint(alice);
        
        // Approve exchange
        vm.prank(alice);
        proxyNFT.approve(address(exchange), tokenId);
        
        // Create listing
        vm.prank(alice);
        uint256 listingId = exchange.createListing(
            address(proxyNFT),
            tokenId,
            100 * 1e6, // 100 USDC
            7 days
        );
        
        // Verify listing
        (
            address seller,
            address nftContract,
            uint256 listedTokenId,
            uint256 price,
            uint256 expiresAt,
            bool isERC721,
            bool sold,
            bool cancelled
        ) = exchange.listings(listingId);
        
        assertEq(seller, alice);
        assertEq(nftContract, address(proxyNFT));
        assertEq(listedTokenId, tokenId);
        assertEq(price, 100 * 1e6);
        assertGt(expiresAt, block.timestamp);
        assertTrue(isERC721);
        assertFalse(sold);
        assertFalse(cancelled);
    }

    function testBuyListingWithProxyNFT() public {
        // Setup listing
        uint256 tokenId = proxyNFT.mint(alice);
        vm.prank(alice);
        proxyNFT.approve(address(exchange), tokenId);
        
        vm.prank(alice);
        uint256 listingId = exchange.createListing(
            address(proxyNFT),
            tokenId,
            100 * 1e6,
            7 days
        );
        
        // Bob approves USDC
        vm.prank(bob);
        usdc.approve(address(exchange), 100 * 1e6);
        
        // Bob buys
        vm.prank(bob);
        exchange.buyListing(listingId);
        
        // Verify NFT transferred
        assertEq(proxyNFT.ownerOf(tokenId), bob);
        
        // Verify payments (alice started with 10000 USDC)
        assertEq(usdc.balanceOf(alice), 10000 * 1e6 + 99 * 1e6); // initial + sale - fee
        assertEq(usdc.balanceOf(feeRecipient), 1 * 1e6);
    }

    function testMakeOfferWithProxyNFT() public {
        uint256 tokenId = proxyNFT.mint(alice);
        
        // Bob makes offer
        vm.prank(bob);
        usdc.approve(address(exchange), 50 * 1e6);
        
        vm.prank(bob);
        uint256 offerId = exchange.makeOffer(
            address(proxyNFT),
            tokenId,
            50 * 1e6,
            3 days
        );
        
        // Verify offer
        (
            address buyer,
            address nftContract,
            uint256 offerTokenId,
            uint256 amount,
            uint256 expiresAt,
            bool accepted,
            bool cancelled
        ) = exchange.offers(offerId);
        
        assertEq(buyer, bob);
        assertEq(nftContract, address(proxyNFT));
        assertEq(offerTokenId, tokenId);
        assertEq(amount, 50 * 1e6);
        assertGt(expiresAt, block.timestamp);
        assertFalse(accepted);
        assertFalse(cancelled);
    }

    function testAcceptOfferWithProxyNFT() public {
        uint256 tokenId = proxyNFT.mint(alice);
        
        // Bob makes offer
        vm.prank(bob);
        usdc.approve(address(exchange), 50 * 1e6);
        
        vm.prank(bob);
        uint256 offerId = exchange.makeOffer(
            address(proxyNFT),
            tokenId,
            50 * 1e6,
            3 days
        );
        
        // Alice approves and accepts
        vm.prank(alice);
        proxyNFT.approve(address(exchange), tokenId);
        
        vm.prank(alice);
        exchange.acceptOffer(offerId);
        
        // Verify NFT transferred
        assertEq(proxyNFT.ownerOf(tokenId), bob);
        
        // Verify payments (alice started with 10000 USDC)
        assertEq(usdc.balanceOf(alice), 10000 * 1e6 + uint256(49.5 * 1e6)); // initial + sale - fee
        assertEq(usdc.balanceOf(feeRecipient), uint256(0.5 * 1e6));
    }

    function testProxyNFTWithoutSafeTransfer() public {
        // Create a special proxy NFT that only has transferFrom
        ProxyNFTNoSafe proxyNoSafe = new ProxyNFTNoSafe();
        
        // Should still detect as ERC721
        assertTrue(exchange.isERC721(address(proxyNoSafe)));
        
        // Mint to alice
        uint256 tokenId = proxyNoSafe.mint(alice);
        
        // Create listing
        vm.prank(alice);
        proxyNoSafe.approve(address(exchange), tokenId);
        
        vm.prank(alice);
        uint256 listingId = exchange.createListing(
            address(proxyNoSafe),
            tokenId,
            100 * 1e6,
            7 days
        );
        
        // Bob buys - should use transferFrom fallback
        vm.prank(bob);
        usdc.approve(address(exchange), 100 * 1e6);
        
        vm.prank(bob);
        exchange.buyListing(listingId);
        
        // Verify transfer worked
        assertEq(proxyNoSafe.ownerOf(tokenId), bob);
    }
}

// Proxy NFT that doesn't implement safeTransferFrom
contract ProxyNFTNoSafe {
    mapping(uint256 => address) private _owners;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    uint256 private _tokenIdCounter;
    
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    
    function mint(address to) external returns (uint256) {
        uint256 tokenId = _tokenIdCounter++;
        _owners[tokenId] = to;
        emit Transfer(address(0), to, tokenId);
        return tokenId;
    }
    
    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = _owners[tokenId];
        require(owner != address(0), "Token does not exist");
        return owner;
    }
    
    function balanceOf(address owner) external view returns (uint256) {
        require(owner != address(0), "Invalid owner");
        uint256 balance = 0;
        for (uint256 i = 0; i < _tokenIdCounter; i++) {
            if (_owners[i] == owner) {
                balance++;
            }
        }
        return balance;
    }
    
    function approve(address to, uint256 tokenId) external {
        require(_owners[tokenId] == msg.sender, "Not owner");
        _tokenApprovals[tokenId] = to;
        emit Approval(msg.sender, to, tokenId);
    }
    
    function getApproved(uint256 tokenId) external view returns (address) {
        return _tokenApprovals[tokenId];
    }
    
    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
    }
    
    function isApprovedForAll(address owner, address operator) external view returns (bool) {
        return _operatorApprovals[owner][operator];
    }
    
    function transferFrom(address from, address to, uint256 tokenId) external {
        require(_owners[tokenId] == from, "Not owner");
        require(
            msg.sender == from || 
            _tokenApprovals[tokenId] == msg.sender ||
            _operatorApprovals[from][msg.sender],
            "Not authorized"
        );
        
        delete _tokenApprovals[tokenId];
        _owners[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }
    
    // No safeTransferFrom methods
}