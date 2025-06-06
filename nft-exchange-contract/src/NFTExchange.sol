// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Owned} from "solmate/auth/Owned.sol";
import {ReentrancyGuard} from "solmate/utils/ReentrancyGuard.sol";
import {ERC20} from "solmate/tokens/ERC20.sol";
import {ERC721} from "solmate/tokens/ERC721.sol";
import {ERC1155} from "solmate/tokens/ERC1155.sol";
import {SafeTransferLib} from "solmate/utils/SafeTransferLib.sol";

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

contract NFTExchange is Owned, ReentrancyGuard {
    using SafeTransferLib for ERC20;

    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    bytes4 private constant ERC721_INTERFACE_ID = 0x80ac58cd;
    bytes4 private constant ERC1155_INTERFACE_ID = 0xd9b67a26;
    uint256 private constant BASIS_POINTS = 10000;

    /*//////////////////////////////////////////////////////////////
                                STORAGE
    //////////////////////////////////////////////////////////////*/

    ERC20 public immutable usdcToken;
    address public feeRecipient;
    uint256 public feeBps;
    
    mapping(address => bool) public operators;
    
    uint256 private _listingIdCounter;
    uint256 private _offerIdCounter;

    struct Listing {
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 price;
        uint256 expiresAt;
        bool isERC721;
        bool sold;
        bool cancelled;
    }

    struct Offer {
        address buyer;
        address nftContract;
        uint256 tokenId;
        uint256 amount;
        uint256 expiresAt;
        bool accepted;
        bool cancelled;
    }

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Offer) public offers;

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event ListingCreated(
        uint256 indexed listingId,
        address indexed seller,
        address indexed nftContract,
        uint256 tokenId,
        uint256 price,
        string metadataURI
    );

    event ListingSold(
        uint256 indexed listingId,
        address indexed buyer,
        uint256 price
    );

    event ListingCancelled(
        uint256 indexed listingId
    );

    event OfferMade(
        uint256 indexed offerId,
        address indexed buyer,
        address indexed nftContract,
        uint256 tokenId,
        uint256 amount
    );

    event OfferAccepted(
        uint256 indexed offerId,
        address indexed seller
    );

    event OfferCancelled(
        uint256 indexed offerId
    );

    event MarketplaceFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);

    /*//////////////////////////////////////////////////////////////
                               MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier onlyOperator() {
        if (!operators[msg.sender] && msg.sender != owner) revert UnauthorizedCaller();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    error ListingNotFound();
    error ListingExpired();
    error ListingAlreadySold();
    error ListingAlreadyCancelled();
    error UnauthorizedCaller();
    error InvalidNFTContract();
    error InsufficientNFTBalance();
    error InsufficientUSDCBalance();
    error InvalidPrice();
    error InvalidDuration();
    error TransferFailed();
    error UnsupportedNFTStandard();
    error OfferNotFound();
    error OfferExpired();
    error OfferAlreadyAccepted();
    error OfferAlreadyCancelled();

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(
        address _usdcToken,
        address _feeRecipient,
        uint256 _feeBps
    ) Owned(msg.sender) {
        usdcToken = ERC20(_usdcToken);
        feeRecipient = _feeRecipient;
        feeBps = _feeBps;
    }

    /*//////////////////////////////////////////////////////////////
                          UTILITY FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function isERC721(address nftContract) public view returns (bool) {
        if (nftContract.code.length == 0) return false;
        
        try IERC165(nftContract).supportsInterface(ERC721_INTERFACE_ID) returns (bool supported) {
            return supported;
        } catch {
            return false;
        }
    }

    function isERC1155(address nftContract) public view returns (bool) {
        if (nftContract.code.length == 0) return false;
        
        try IERC165(nftContract).supportsInterface(ERC1155_INTERFACE_ID) returns (bool supported) {
            return supported;
        } catch {
            return false;
        }
    }

    function getERC1155Balance(
        address nftContract,
        address owner,
        uint256 tokenId
    ) external view returns (uint256) {
        return ERC1155(nftContract).balanceOf(owner, tokenId);
    }

    function isERC721Owner(
        address nftContract,
        address owner,
        uint256 tokenId
    ) external view returns (bool) {
        try ERC721(nftContract).ownerOf(tokenId) returns (address tokenOwner) {
            return tokenOwner == owner;
        } catch {
            return false;
        }
    }

    /*//////////////////////////////////////////////////////////////
                         CONFIGURATION FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function setMarketplaceFee(uint256 _feeBps) external onlyOwner {
        if (_feeBps > BASIS_POINTS) revert InvalidPrice();
        uint256 oldFee = feeBps;
        feeBps = _feeBps;
        emit MarketplaceFeeUpdated(oldFee, _feeBps);
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) revert InvalidNFTContract();
        address oldRecipient = feeRecipient;
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(oldRecipient, _feeRecipient);
    }

    function setOperator(address operator, bool authorized) external onlyOwner {
        operators[operator] = authorized;
    }

    /*//////////////////////////////////////////////////////////////
                         MARKETPLACE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function createListing(
        address nftContract,
        uint256 tokenId,
        uint256 price,
        uint256 duration
    ) external nonReentrant returns (uint256 listingId) {
        if (price == 0) revert InvalidPrice();
        if (duration == 0) revert InvalidDuration();
        
        bool isNFT721 = isERC721(nftContract);
        bool isNFT1155 = isERC1155(nftContract);
        
        if (!isNFT721 && !isNFT1155) revert UnsupportedNFTStandard();
        
        // Verify ownership
        if (isNFT721) {
            if (ERC721(nftContract).ownerOf(tokenId) != msg.sender) {
                revert UnauthorizedCaller();
            }
            // Check approval
            if (ERC721(nftContract).getApproved(tokenId) != address(this) &&
                !ERC721(nftContract).isApprovedForAll(msg.sender, address(this))) {
                revert UnauthorizedCaller();
            }
        } else {
            uint256 balance = ERC1155(nftContract).balanceOf(msg.sender, tokenId);
            if (balance == 0) revert InsufficientNFTBalance();
            // Check approval
            if (!ERC1155(nftContract).isApprovedForAll(msg.sender, address(this))) {
                revert UnauthorizedCaller();
            }
        }
        
        listingId = ++_listingIdCounter;
        
        listings[listingId] = Listing({
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            price: price,
            expiresAt: block.timestamp + duration,
            isERC721: isNFT721,
            sold: false,
            cancelled: false
        });
        
        // Get metadata URI for event
        string memory metadataURI = "";
        if (isNFT721) {
            try ERC721(nftContract).tokenURI(tokenId) returns (string memory uri) {
                metadataURI = uri;
            } catch {}
        } else {
            try ERC1155(nftContract).uri(tokenId) returns (string memory uri) {
                metadataURI = uri;
            } catch {}
        }
        
        emit ListingCreated(listingId, msg.sender, nftContract, tokenId, price, metadataURI);
    }

    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];
        
        if (listing.seller == address(0)) revert ListingNotFound();
        if (listing.sold) revert ListingAlreadySold();
        if (listing.cancelled) revert ListingAlreadyCancelled();
        if (listing.seller != msg.sender && !operators[msg.sender] && msg.sender != owner) {
            revert UnauthorizedCaller();
        }
        
        listing.cancelled = true;
        
        emit ListingCancelled(listingId);
    }

    function buyListing(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];
        
        if (listing.seller == address(0)) revert ListingNotFound();
        if (listing.sold) revert ListingAlreadySold();
        if (listing.cancelled) revert ListingAlreadyCancelled();
        if (block.timestamp > listing.expiresAt) revert ListingExpired();
        
        listing.sold = true;
        
        // Calculate fees
        uint256 fee = (listing.price * feeBps) / BASIS_POINTS;
        uint256 sellerAmount = listing.price - fee;
        
        // Transfer USDC from buyer
        usdcToken.safeTransferFrom(msg.sender, address(this), listing.price);
        
        // Transfer NFT from seller to buyer
        if (listing.isERC721) {
            ERC721(listing.nftContract).safeTransferFrom(
                listing.seller,
                msg.sender,
                listing.tokenId
            );
        } else {
            ERC1155(listing.nftContract).safeTransferFrom(
                listing.seller,
                msg.sender,
                listing.tokenId,
                1,
                ""
            );
        }
        
        // Distribute payments
        if (fee > 0) {
            usdcToken.safeTransfer(feeRecipient, fee);
        }
        usdcToken.safeTransfer(listing.seller, sellerAmount);
        
        emit ListingSold(listingId, msg.sender, listing.price);
    }

    /*//////////////////////////////////////////////////////////////
                          OFFER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function makeOffer(
        address nftContract,
        uint256 tokenId,
        uint256 offerAmount,
        uint256 duration
    ) external nonReentrant returns (uint256 offerId) {
        if (offerAmount == 0) revert InvalidPrice();
        if (duration == 0) revert InvalidDuration();
        
        bool isNFT721 = isERC721(nftContract);
        bool isNFT1155 = isERC1155(nftContract);
        
        if (!isNFT721 && !isNFT1155) revert UnsupportedNFTStandard();
        
        // Verify buyer has sufficient USDC balance and approval
        if (usdcToken.balanceOf(msg.sender) < offerAmount) revert InsufficientUSDCBalance();
        if (usdcToken.allowance(msg.sender, address(this)) < offerAmount) revert UnauthorizedCaller();
        
        offerId = ++_offerIdCounter;
        
        offers[offerId] = Offer({
            buyer: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            amount: offerAmount,
            expiresAt: block.timestamp + duration,
            accepted: false,
            cancelled: false
        });
        
        emit OfferMade(offerId, msg.sender, nftContract, tokenId, offerAmount);
    }

    function acceptOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        
        if (offer.buyer == address(0)) revert OfferNotFound();
        if (offer.accepted) revert OfferAlreadyAccepted();
        if (offer.cancelled) revert OfferAlreadyCancelled();
        if (block.timestamp > offer.expiresAt) revert OfferExpired();
        
        bool isNFT721 = isERC721(offer.nftContract);
        
        // Verify seller owns the NFT
        if (isNFT721) {
            if (ERC721(offer.nftContract).ownerOf(offer.tokenId) != msg.sender) {
                revert UnauthorizedCaller();
            }
            // Check approval
            if (ERC721(offer.nftContract).getApproved(offer.tokenId) != address(this) &&
                !ERC721(offer.nftContract).isApprovedForAll(msg.sender, address(this))) {
                revert UnauthorizedCaller();
            }
        } else {
            uint256 balance = ERC1155(offer.nftContract).balanceOf(msg.sender, offer.tokenId);
            if (balance == 0) revert InsufficientNFTBalance();
            // Check approval
            if (!ERC1155(offer.nftContract).isApprovedForAll(msg.sender, address(this))) {
                revert UnauthorizedCaller();
            }
        }
        
        offer.accepted = true;
        
        // Calculate fees
        uint256 fee = (offer.amount * feeBps) / BASIS_POINTS;
        uint256 sellerAmount = offer.amount - fee;
        
        // Transfer USDC from buyer
        usdcToken.safeTransferFrom(offer.buyer, address(this), offer.amount);
        
        // Transfer NFT from seller to buyer
        if (isNFT721) {
            ERC721(offer.nftContract).safeTransferFrom(
                msg.sender,
                offer.buyer,
                offer.tokenId
            );
        } else {
            ERC1155(offer.nftContract).safeTransferFrom(
                msg.sender,
                offer.buyer,
                offer.tokenId,
                1,
                ""
            );
        }
        
        // Distribute payments
        if (fee > 0) {
            usdcToken.safeTransfer(feeRecipient, fee);
        }
        usdcToken.safeTransfer(msg.sender, sellerAmount);
        
        emit OfferAccepted(offerId, msg.sender);
    }

    function cancelOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        
        if (offer.buyer == address(0)) revert OfferNotFound();
        if (offer.accepted) revert OfferAlreadyAccepted();
        if (offer.cancelled) revert OfferAlreadyCancelled();
        if (offer.buyer != msg.sender && !operators[msg.sender] && msg.sender != owner) {
            revert UnauthorizedCaller();
        }
        
        offer.cancelled = true;
        
        emit OfferCancelled(offerId);
    }
}