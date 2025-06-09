# Seaport Migration Plan - Frontend

## Executive Summary

Seaport is OpenSea's open-source marketplace protocol that has processed over $2.5B in volume. By migrating to Seaport, we unlock:

- **Proxy Contract Support**: Full compatibility with proxy NFTs (like Zora collections)
- **Gas Savings**: 20-40% reduction in transaction costs through optimized assembly code
- **Advanced Trading**: Collection offers, trait-based offers, bulk operations
- **Cross-Platform Liquidity**: Orders can be filled across any Seaport-integrated platform
- **Future-Proof**: Active development, audit history, and wide ecosystem adoption

## Why Seaport?

### What Seaport Unlocks

#### 1. **Proxy & Advanced NFT Support**
- Handles all proxy patterns (UUPS, Transparent, Custom)
- Supports any ERC165-compliant contract
- Works with non-standard implementations
- Enables listing of Zora, Manifold, and other proxy-based collections

#### 2. **Collection & Attribute Offers**
```javascript
// Current: Offer on specific token only
makeOffer(contractAddress, tokenId: 123, amount)

// Seaport: Offer on ANY token in collection
makeCollectionOffer(contractAddress, amount)

// Seaport: Offer on tokens with specific traits
makeTraitOffer(contractAddress, traits: {background: "gold"}, amount)
```

#### 3. **Bulk Operations**
- List 100 NFTs in one transaction
- Buy multiple items with single approval
- Sweep floor of collections efficiently
- Batch cancel outdated listings

#### 4. **Gas Optimization Examples**
- Simple sale: ~85k gas → ~65k gas (23% savings)
- Bundle sale: ~250k gas → ~120k gas (52% savings)
- The more complex the trade, the bigger the savings

#### 5. **Advanced Order Types**
- **Dutch Auctions**: Price decreases over time
- **English Auctions**: Traditional bidding
- **Private Sales**: Specific buyer only
- **Bundle Sales**: Multiple items as package
- **Partial Fills**: Buy some items from larger listing

## Daily Deliverables - Frontend Developer

### Day 1: Foundation Setup
**Morning (by lunch)**
- Install Seaport SDK: `npm install @opensea/seaport-js`
- Create `marketplace-adapter.js` with base classes
- Set up test environment with Base fork

**Afternoon (by EOD)**
- Implement NFTExchangeAdapter (wrap existing code)
- Write adapter factory function
- Create unit tests for adapter pattern
- **EOD Test**: Can instantiate both adapters, existing functionality still works

### Day 2: Seaport Integration
**Morning**
- Implement SeaportAdapter skeleton
- Add Seaport configuration constants
- Set up Seaport SDK initialization

**Afternoon**
- Build createOrder method in SeaportAdapter
- Add order validation logic
- **EOD Test**: Can create valid Seaport order object (not on-chain yet)

### Day 3: Read Operations
**Morning**
- Update data fetching to query both contracts
- Add contract type to listing objects
- Implement listing merge/sort logic

**Afternoon**
- Update UI components to display both types
- Add visual indicator for Seaport listings
- **EOD Test**: Can see mock Seaport + real NFTExchange listings together

### Day 4: Create Listing Flow
**Morning**
- Add `?seaport=true` detection
- Implement createSeaportListing function
- Handle approval flow for Seaport

**Afternoon**
- Test on Base Sepolia testnet
- Fix any approval/signature issues
- **EOD Test**: Successfully create Seaport listing on testnet

### Day 5: Purchase Flow
**Morning**
- Implement fulfillSeaportOrder function
- Add order validation before fulfillment
- Handle USDC approvals for Seaport

**Afternoon**
- Test full purchase flow on testnet
- Verify fee distribution works correctly
- **EOD Test**: Can buy Seaport listing, fees go to right addresses

### Day 6: Testing & Edge Cases
**Morning**
- Test expired orders
- Test cancelled orders
- Test insufficient balance scenarios

**Afternoon**
- Add error handling and user feedback
- Test with multiple wallets
- **EOD Test**: All error cases handled gracefully

### Day 7: Mainnet Soft Launch
**Morning**
- Deploy to production with feature flag
- Test with team wallets on mainnet
- Monitor gas usage comparison

**Afternoon**
- Fix any mainnet-specific issues
- Document gas savings achieved
- **EOD Test**: Team can list/buy via Seaport on mainnet

### Day 8: Advanced Features
**Morning**
- Implement collection offers UI
- Add bulk listing interface
- Create bundle purchase flow

**Afternoon**
- Test advanced features on testnet
- Optimize UX for new features
- **EOD Test**: Collection offer works end-to-end

### Day 9: Progressive Rollout
**Morning**
- Add percentage-based rollout logic
- Create admin controls for rollout
- Set up monitoring dashboard

**Afternoon**
- Enable for 10% of users
- Monitor metrics and errors
- **EOD Test**: Rollout controls work, metrics accurate

### Day 10: Full Launch Prep
**Morning**
- Polish UI/UX based on feedback
- Update help documentation
- Create user announcement

**Afternoon**
- Increase rollout to 50%
- Final testing of all flows
- **EOD Test**: Ready for 100% launch

## Testing Checklist Per Day

**Every EOD must verify:**
1. Existing NFTExchange functionality still works
2. No console errors in any flow
3. Gas estimates are accurate
4. Transactions succeed on testnet/mainnet
5. UI updates reflect contract state

**Key Testing Accounts:**
- Account A: Has NFTs and USDC
- Account B: Has USDC but no NFTs
- Account C: Fresh wallet (no approvals)
- Account D: Has existing NFTExchange listings

## Code Examples for Key Components

### Marketplace Adapter Pattern
```javascript
// src/client/utils/marketplace-adapter.js
class MarketplaceAdapter {
  async createListing(nft, price, duration) { throw new Error('Not implemented') }
  async buyListing(listingId) { throw new Error('Not implemented') }
  async makeOffer(nft, amount) { throw new Error('Not implemented') }
  async cancelListing(listingId) { throw new Error('Not implemented') }
}

class NFTExchangeAdapter extends MarketplaceAdapter {
  constructor(contract, signer) {
    super()
    this.contract = contract
    this.signer = signer
  }
  
  async createListing(nft, price, duration) {
    const tx = await this.contract.createListing(
      nft.contract,
      nft.tokenId,
      price,
      duration
    )
    return tx
  }
}

class SeaportAdapter extends MarketplaceAdapter {
  constructor(seaportSDK, signer) {
    super()
    this.seaport = seaportSDK
    this.signer = signer
  }
  
  async createListing(nft, price, duration) {
    const order = {
      offer: [{
        itemType: nft.isERC721 ? 2 : 3,
        token: nft.contract,
        identifier: nft.tokenId,
        amount: "1"
      }],
      consideration: [
        {
          itemType: 1, // ERC20
          token: USDC_ADDRESS,
          amount: (price * 0.99).toString(),
          recipient: await this.signer.getAddress()
        },
        {
          itemType: 1,
          token: USDC_ADDRESS,
          amount: (price * 0.01).toString(),
          recipient: FEE_RECIPIENT
        }
      ],
      endTime: Math.floor(Date.now() / 1000) + duration,
      orderType: 0 // FULL_OPEN
    }
    
    const { executeAllActions } = await this.seaport.createOrder(order)
    return await executeAllActions()
  }
}

export function getMarketplaceAdapter(contractType, signer) {
  if (contractType === 'seaport') {
    const seaport = new Seaport(signer)
    return new SeaportAdapter(seaport, signer)
  }
  
  const contract = new ethers.Contract(NFT_EXCHANGE_ADDRESS, NFT_EXCHANGE_ABI, signer)
  return new NFTExchangeAdapter(contract, signer)
}
```

### Seaport Configuration
```javascript
// src/client/utils/contract.js
export const SEAPORT_ADDRESS = '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC'
export const SEAPORT_VERSION = '1.6'
export const ZONE_ADDRESS = null
export const CONDUIT_KEY = '0x0000000000000000000000000000000000000000000000000000000000000000'
export const FEE_RECIPIENT = '0xYourFeeAddress'
export const FEE_BASIS_POINTS = 100 // 1%

// Helper to determine contract type
export function shouldUseSeaport() {
  // Start with query param for testing
  if (window.location.search.includes('seaport=true')) return true
  
  // Check feature flag
  if (!MIGRATION_CONFIG.seaportEnabled) return false
  
  // Check whitelist
  const userAddress = getCurrentUserAddress()
  if (MIGRATION_CONFIG.seaportWhitelist.includes(userAddress)) return true
  
  // Random rollout
  const hash = ethers.utils.id(userAddress)
  const rolloutValue = parseInt(hash.slice(2, 4), 16)
  return rolloutValue < (MIGRATION_CONFIG.seaportPercentage * 2.56)
}
```

## Success Metrics

- Transaction success rate > 99%
- Gas savings of 20-30% measured and documented
- No increase in support tickets
- Positive user feedback on new features
- Zero disruption to existing 1000 active listings
