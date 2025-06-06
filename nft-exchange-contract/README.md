# NFT Exchange Smart Contract

A decentralized NFT marketplace smart contract supporting both ERC721 and ERC1155 standards with USDC-based trading on Base L2.

## Features

- 🎨 **Multi-Standard Support**: Seamlessly handles both ERC721 and ERC1155 NFTs
- 💰 **USDC Trading**: All transactions use USDC on Base mainnet
- 📋 **Listings & Offers**: Create time-limited listings and make offers on any NFT
- 🔒 **Security First**: ReentrancyGuard protection and comprehensive validation
- ⚡ **Gas Optimized**: Using Solmate libraries for efficient operations
- 👥 **Access Control**: Owner and operator system for administrative actions
- 📊 **Event-Driven**: Comprehensive events for backend indexing

## Contract Overview

### Core Functions

#### Listing Management
```solidity
// Create a listing for your NFT
function createListing(address nftContract, uint256 tokenId, uint256 price, uint256 duration) returns (uint256 listingId)

// Cancel your listing
function cancelListing(uint256 listingId)

// Buy from a listing
function buyListing(uint256 listingId)
```

#### Offer Management
```solidity
// Make an offer on any NFT
function makeOffer(address nftContract, uint256 tokenId, uint256 offerAmount, uint256 duration) returns (uint256 offerId)

// Accept an offer on your NFT
function acceptOffer(uint256 offerId)

// Cancel your offer
function cancelOffer(uint256 offerId)
```

#### Utility Functions
```solidity
// Check NFT standard support
function isERC721(address nftContract) returns (bool)
function isERC1155(address nftContract) returns (bool)

// Check ownership/balance
function isERC721Owner(address nftContract, address owner, uint256 tokenId) returns (bool)
function getERC1155Balance(address nftContract, address owner, uint256 tokenId) returns (uint256)
```

#### Admin Functions (Owner Only)
```solidity
function setMarketplaceFee(uint256 feeBps)        // Set fee percentage (in basis points)
function setFeeRecipient(address feeRecipient)    // Set fee recipient address
function setOperator(address operator, bool authorized)  // Manage operators
```

## Deployment

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) installed
- Private key for deployment account
- ETH on Base for gas fees

### Deploy to Base Mainnet

1. Clone the repository and install dependencies:
```bash
cd nft-exchange-contract
forge install
```

2. Set up environment variables:
```bash
# Create .env file
cp .env.example .env

# Edit .env with your values:
PRIVATE_KEY=your_private_key_here
ETHERSCAN_API_KEY=your_etherscan_api_key
```

3. Update deployment parameters in `script/Deploy.s.sol`:
```solidity
address constant FEE_RECIPIENT = address(0x1337); // Change to your fee recipient
uint256 constant INITIAL_FEE_BPS = 250;           // 2.5% fee (adjust as needed)
```

4. Deploy the contract:
```bash
# Deploy to Base mainnet
forge script script/Deploy.s.sol --rpc-url https://mainnet.base.org --broadcast --verify

# For testnet deployment (Base Sepolia)
forge script script/Deploy.s.sol --rpc-url https://sepolia.base.org --broadcast --verify
```

### Verify Contract

If automatic verification fails, manually verify:
```bash
forge verify-contract \
  --chain-id 8453 \
  --num-of-optimizations 200 \
  --compiler-version v0.8.19 \
  CONTRACT_ADDRESS \
  src/NFTExchange.sol:NFTExchange \
  --constructor-args $(cast abi-encode "constructor(address,address,uint256)" 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 FEE_RECIPIENT_ADDRESS 250)
```

## Backend Integration

### Event Monitoring

The contract emits the following events for backend indexing:

```solidity
event ListingCreated(uint256 indexed listingId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 price, string metadataURI);
event ListingSold(uint256 indexed listingId, address indexed buyer, uint256 price);
event ListingCancelled(uint256 indexed listingId);
event OfferMade(uint256 indexed offerId, address indexed buyer, address indexed nftContract, uint256 tokenId, uint256 amount);
event OfferAccepted(uint256 indexed offerId, address indexed seller);
event OfferCancelled(uint256 indexed offerId);
event MarketplaceFeeUpdated(uint256 oldFee, uint256 newFee);
event FeeRecipientUpdated(address oldRecipient, address newRecipient);
```

### Integration Points

1. **Event Indexing**: Set up event listeners for all marketplace events
2. **Database Sync**: Update listings/offers tables based on events
3. **Ownership Validation**: Verify NFT ownership before frontend actions
4. **Metadata Fetching**: Get NFT metadata from IPFS/APIs
5. **Transaction Encoding**: Help users create transaction data

### Environment Variables

```bash
# Required for backend integration
CONTRACT_ADDRESS=0x...         # Deployed NFTExchange address
RPC_URL=https://mainnet.base.org
USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
ALCHEMY_API_KEY=your_key       # For NFT metadata
```

### Transaction Flow Example

```javascript
// 1. User creates listing (frontend)
const tx = await nftExchange.createListing(
  nftContract,
  tokenId,
  parseUnits("100", 6), // 100 USDC
  86400 // 24 hours
);

// 2. Backend indexes ListingCreated event
// Event: ListingCreated(listingId, seller, nftContract, tokenId, price, metadataURI)

// 3. Buyer purchases listing (frontend)
const buyTx = await nftExchange.buyListing(listingId);

// 4. Backend indexes ListingSold event
// Event: ListingSold(listingId, buyer, price)
```

## Testing

Run the comprehensive test suite:

```bash
# Run all tests
forge test

# Run with gas reporting
forge test --gas-report

# Run specific test contract
forge test --match-contract ListingTest

# Run with verbosity
forge test -vvv
```

Test coverage includes:
- NFT standard detection
- Listing creation, cancellation, and purchases
- Offer creation, acceptance, and cancellation
- Access control and operator permissions
- Fee calculations and distribution
- Edge cases and security scenarios
- End-to-end integration tests

## Gas Costs

Approximate gas costs for main operations:
- Create Listing: ~185,000 gas
- Buy Listing: ~137,000 gas
- Make Offer: ~160,000 gas
- Accept Offer: ~99,000 gas
- Cancel Listing/Offer: ~35,000-50,000 gas

## Security Considerations

1. **Reentrancy Protection**: All state-changing functions use `nonReentrant` modifier
2. **Access Control**: Owner-only admin functions, operator system for maintenance
3. **Validation**: Comprehensive checks for ownership, balances, and approvals
4. **Time Limits**: Automatic expiry for listings and offers
5. **Safe Transfers**: Using Solmate's SafeTransferLib for USDC transfers

## Contract Addresses

### Base Mainnet
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- NFTExchange: `0x06fB7424Ba65D587405b9C754Bc40dA9398B72F0`

## License

MIT
