# Smart Contract Requirements for FC NFT Exchange

## Overview
This document outlines the smart contract requirements for the FC NFT Exchange marketplace. The contract will handle NFT marketplace functionality for both ERC721 and ERC1155 tokens with USDC-based trading on Base L2.

## Core Requirements

### 1. Multi-Standard NFT Support
- **ERC721**: Standard NFTs (unique tokens)
- **ERC1155**: Multi-token standard (fungible, non-fungible, and semi-fungible)
- The contract must detect and handle both standards appropriately

### 2. Marketplace Functions
- Support for creating, canceling, and buying listings
- Support for making, accepting, and canceling offers
- Time-limited listings with automatic expiry
- No escrow system - direct transfers between buyer and seller
- Backend-controlled execution via private key for certain operations

### 3. Payment System
- All transactions use **USDC on Base mainnet**
- USDC contract address: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Support for direct USDC transfers between buyer and seller
- Configurable marketplace fee (percentage-based)

## Contract Functions Required

### Core Marketplace Functions

```solidity
/**
 * @notice Create a new listing for an NFT
 * @param nftContract The NFT contract address
 * @param tokenId The token ID
 * @param price The listing price in USDC (6 decimals)
 * @param duration Duration in seconds until listing expires
 * @return listingId The unique identifier for this listing
 */
function createListing(
    address nftContract,
    uint256 tokenId,
    uint256 price,
    uint256 duration
) external returns (uint256 listingId);

/**
 * @notice Cancel an existing listing
 * @param listingId The listing ID to cancel
 */
function cancelListing(uint256 listingId) external;

/**
 * @notice Buy an NFT from an active listing
 * @param listingId The listing ID to purchase
 */
function buyListing(uint256 listingId) external;

/**
 * @notice Make an offer on an NFT
 * @param nftContract The NFT contract address
 * @param tokenId The token ID
 * @param offerAmount The offer amount in USDC (6 decimals)
 * @param duration Duration in seconds until offer expires
 * @return offerId The unique identifier for this offer
 */
function makeOffer(
    address nftContract,
    uint256 tokenId,
    uint256 offerAmount,
    uint256 duration
) external returns (uint256 offerId);

/**
 * @notice Accept an offer on your NFT
 * @param offerId The offer ID to accept
 */
function acceptOffer(uint256 offerId) external;

/**
 * @notice Cancel an offer you made
 * @param offerId The offer ID to cancel
 */
function cancelOffer(uint256 offerId) external;
```

### Utility Functions

```solidity
/**
 * @notice Check if a contract supports ERC721
 */
function isERC721(address nftContract) external view returns (bool);

/**
 * @notice Check if a contract supports ERC1155
 */
function isERC1155(address nftContract) external view returns (bool);

/**
 * @notice Get the balance of ERC1155 tokens for an address
 */
function getERC1155Balance(
    address nftContract,
    address owner,
    uint256 tokenId
) external view returns (uint256);

/**
 * @notice Check if an address owns an ERC721 token
 */
function isERC721Owner(
    address nftContract,
    address owner,
    uint256 tokenId
) external view returns (bool);
```

### Configuration Functions

```solidity
/**
 * @notice Set the marketplace fee percentage (in basis points)
 * @param feeBps Fee in basis points (100 = 1%)
 */
function setMarketplaceFee(uint256 feeBps) external onlyOwner;

/**
 * @notice Set the fee recipient address
 */
function setFeeRecipient(address feeRecipient) external onlyOwner;

/**
 * @notice Add or remove operator addresses
 */
function setOperator(address operator, bool authorized) external onlyOwner;
```

## Events Required

```solidity
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
```

## Security Requirements

### Access Control
- Use OpenZeppelin's `Ownable` for contract ownership
- Listing creators can only cancel their own listings
- Offer makers can only cancel their own offers
- NFT owners can accept offers on their NFTs
- Only contract owner can modify fees and configuration

### Safety Checks
```solidity
// Before every operation, verify:
- Listing/offer is still active (not expired, sold, or cancelled)
- NFT contract is valid (supports ERC721 or ERC1155 interface)
- Seller owns the NFT and has approved the marketplace contract
- Buyer has sufficient USDC balance and has approved the marketplace contract
- Price/amount is greater than 0
- Prevent reentrancy attacks with OpenZeppelin's ReentrancyGuard
- Check expiry timestamps before executing transactions
```

### Error Handling
```solidity
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
```

## Integration with Database

The contract events will be monitored by our backend to update the database:

### Marketplace Database Schema Integration
- `listings` table - Mirrors on-chain listing data with metadata
- `offers` table - Tracks all offers made through the contract
- `activity` table - Records all marketplace events for analytics
- Time-based expiry filtering for active listings and offers

### Event Indexing Strategy
1. **ListingCreated**: Create new record in `listings` table
2. **ListingSold**: Update `listings.sold_at` timestamp
3. **ListingCancelled**: Update `listings.cancelled_at` timestamp
4. **OfferMade**: Create new record in `offers` table
5. **OfferAccepted**: Update `offers.accepted_at` and create sale activity
6. **OfferCancelled**: Update `offers.cancelled_at` timestamp

### Data Flow
- **On-Chain**: Critical transaction data, ownership verification, payments
- **Off-Chain**: NFT metadata, user profiles, search indexes, notifications
- **Real-time**: Event indexing keeps database synchronized with blockchain state

## Deployment Configuration

### Base Mainnet Addresses
- **USDC**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Backend Operator**: TBD (provide this address after deployment)

### Constructor Parameters
```solidity
constructor(
    address _usdcToken,     // USDC contract address (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
    address _feeRecipient,  // Where marketplace fees go
    uint256 _feeBps         // Initial fee in basis points (e.g., 250 = 2.5%)
)
```

## Gas Optimization Notes

- Use `external` instead of `public` for functions not called internally
- Pack struct variables efficiently
- Consider using events for data that doesn't need to be stored on-chain
- Batch operations where possible for ERC1155 transfers

## Testing Requirements

### Unit Tests Needed
- ✅ ERC721 sale execution
- ✅ ERC1155 sale execution  
- ✅ Access control (operator restrictions)
- ✅ Fee calculation and distribution
- ✅ Interface detection (ERC721/ERC1155)
- ✅ Edge cases (zero amounts, invalid contracts)
- ✅ Reentrancy protection

### Integration Tests
- ✅ End-to-end sale flow with real NFT contracts
- ✅ USDC transfer verification
- ✅ Event emission verification
- ✅ Gas usage optimization

## Backend Integration Points

### Required Backend Functions
1. **Monitor Contract Events**: Listen for all marketplace events to update database
2. **Transaction Encoding**: Provide transaction data for frontend wallet interactions  
3. **Validate Ownership**: Check NFT ownership before allowing listings
4. **Handle Indexing**: Process events and update database state
5. **API Endpoints**: Provide REST APIs for marketplace data

### Environment Variables Needed
```bash
CONTRACT_ADDRESS=    # Deployed marketplace contract address
RPC_URL=            # Base mainnet RPC endpoint  
USDC_ADDRESS=       # USDC contract address on Base
ALCHEMY_API_KEY=    # For NFT metadata and ownership verification
```

### Transaction Flow Example
1. User creates listing via frontend (calls contract directly)
2. Contract emits `ListingCreated` event
3. Backend indexer picks up event and stores in database
4. API serves listing data to other users
5. Buyer calls `buyListing()` directly from frontend
6. Contract emits `ListingSold` event
7. Backend updates database with sale information

This contract design provides a clean, secure way to handle NFT marketplace transactions with direct user-to-contract interactions and comprehensive event tracking for both ERC721 and ERC1155 assets.