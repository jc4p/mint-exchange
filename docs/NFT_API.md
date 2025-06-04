# NFT API Integration Documentation

## Overview

This document outlines the integration strategy for the Alchemy NFT API (`getNFTsForOwner`) with our FC NFT Exchange platform. The API provides comprehensive NFT ownership data for Base L2 addresses, which we'll use to enable users to list their NFTs on our marketplace.

## API Endpoint Details

### Endpoint
```
https://base-mainnet.g.alchemy.com/nft/v3/{API_KEY}/getNFTsForOwner
```

### Key Parameters
- `owner`: Wallet address to query NFTs for
- `spamConfidenceLevel`: Filter spam NFTs (we use `MEDIUM`)
- `excludeFilters[]`: Additional filters (we exclude `SPAM`)
- `pageKey`: For pagination when user has many NFTs
- `pageSize`: Number of results per page (default 100)

### Response Structure
```json
{
  "ownedNfts": [
    {
      "contract": {
        "address": "0x...",
        "name": "Collection Name",
        "symbol": "SYMBOL",
        "tokenType": "ERC721/ERC1155",
        "isSpam": false
      },
      "tokenId": "123",
      "tokenType": "ERC721/ERC1155",
      "name": "NFT Name",
      "description": "NFT Description",
      "image": {
        "cachedUrl": "https://...",
        "thumbnailUrl": "https://...",
        "originalUrl": "https://..."
      },
      "balance": "1",
      "collection": {
        "name": "Collection Name",
        "slug": "collection-slug"
      }
    }
  ],
  "totalCount": 42,
  "pageKey": "next-page-key"
}
```

## Integration Strategy

### 1. NFT Display for Listing Creation

When users want to create a listing, we'll fetch their NFTs dynamically:

```javascript
// Backend endpoint: GET /api/users/:address/nfts
app.get('/api/users/:address/nfts', async (c) => {
  const address = c.req.param('address');
  const pageKey = c.req.query('pageKey');
  
  const params = new URLSearchParams({
    owner: address,
    spamConfidenceLevel: 'MEDIUM',
    'excludeFilters[]': 'SPAM',
    ...(pageKey && { pageKey })
  });
  
  const response = await fetch(
    `${c.env.ALCHEMY_BASE_URL}/getNFTsForOwner?${params}`,
    { headers: { 'Accept': 'application/json' } }
  );
  
  const data = await response.json();
  
  // Filter and format NFTs for frontend
  const formattedNfts = data.ownedNfts
    .filter(nft => nft.tokenType === 'ERC721' || nft.tokenType === 'ERC1155')
    .map(nft => ({
      contract: nft.contract.address,
      tokenId: nft.tokenId,
      name: nft.name || `${nft.contract.name} #${nft.tokenId}`,
      image: nft.image?.thumbnailUrl || nft.image?.cachedUrl || '/placeholder.png',
      collection: nft.contract.name,
      tokenType: nft.tokenType,
      balance: nft.balance
    }));
  
  return c.json({
    nfts: formattedNfts,
    pageKey: data.pageKey,
    totalCount: data.totalCount
  });
});
```

### 2. Database Storage Strategy

**Important**: We only store NFT data when a listing is created, not all user NFTs.

```sql
-- Only NFTs with active listings are stored
CREATE TABLE listings (
  listing_id INTEGER PRIMARY KEY,
  seller_address VARCHAR(42),
  nft_contract VARCHAR(42),
  token_id VARCHAR(78),
  price DECIMAL(36, 18),
  expiry TIMESTAMP,
  -- NFT metadata cached at listing time
  metadata_uri TEXT,
  image_url TEXT,
  name VARCHAR(255),
  description TEXT,
  collection_name VARCHAR(255),
  token_type VARCHAR(10), -- ERC721 or ERC1155
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sold_at TIMESTAMP,
  cancelled_at TIMESTAMP
);
```

### 3. Listing Creation Flow

1. **User initiates listing**: Frontend calls `/api/users/{address}/nfts`
2. **NFT selection**: User selects from their fetched NFTs
3. **Metadata caching**: When creating the listing transaction, we cache the NFT metadata
4. **Smart contract interaction**: Create listing on-chain
5. **Database update**: Store listing details with cached metadata

```javascript
// Frontend: CreateListing component
const handleCreateListing = async (selectedNft, price, duration) => {
  // 1. Create on-chain listing
  const tx = new TransactionManager();
  const txHash = await tx.createListing(
    selectedNft.contract,
    selectedNft.tokenId,
    price,
    duration
  );
  
  // 2. Index listing with metadata
  await fetch('/api/listings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      txHash,
      nftData: {
        contract: selectedNft.contract,
        tokenId: selectedNft.tokenId,
        name: selectedNft.name,
        image: selectedNft.image,
        collection: selectedNft.collection,
        tokenType: selectedNft.tokenType
      }
    })
  });
};
```

### 4. Metadata Refresh Strategy

For active listings, we can periodically refresh metadata:

```javascript
// Scheduled worker: Update NFT metadata for active listings
export async function updateListingMetadata(env) {
  const activeListings = await env.DB.prepare(`
    SELECT DISTINCT nft_contract, token_id 
    FROM listings 
    WHERE sold_at IS NULL AND cancelled_at IS NULL
    LIMIT 100
  `).all();
  
  for (const listing of activeListings.results) {
    const metadata = await fetchNFTMetadata(
      env.ALCHEMY_BASE_URL,
      listing.nft_contract,
      listing.token_id
    );
    
    if (metadata) {
      await env.DB.prepare(`
        UPDATE listings 
        SET image_url = ?, name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE nft_contract = ? AND token_id = ?
      `).bind(
        metadata.image,
        metadata.name,
        listing.nft_contract,
        listing.token_id
      ).run();
    }
  }
}
```

### 5. Performance Considerations

1. **Lazy Loading**: Only fetch NFTs when user wants to create listing
2. **Pagination**: Handle users with large NFT collections
3. **Caching**: Cache NFT metadata for active listings only
4. **Image Optimization**: Use thumbnail URLs for list views
5. **Spam Filtering**: Use Alchemy's spam detection to reduce noise

### 6. Error Handling

```javascript
// Graceful fallbacks for API failures
const fetchUserNFTs = async (address) => {
  try {
    const response = await fetch(`/api/users/${address}/nfts`);
    if (!response.ok) throw new Error('Failed to fetch NFTs');
    return await response.json();
  } catch (error) {
    console.error('NFT fetch error:', error);
    // Show cached listings or empty state
    return { nfts: [], error: 'Unable to load NFTs. Please try again.' };
  }
};
```

## Key Benefits

1. **Minimal Storage**: Only store NFT data for actual listings
2. **Fresh Data**: Always show user's current NFT holdings
3. **Scalability**: No need to index all Base NFTs
4. **Cost Effective**: Reduce database storage and API calls
5. **User Experience**: Fast loading with paginated results

## Implementation Checklist

- [ ] Set up Alchemy API key in environment variables
- [ ] Implement `/api/users/:address/nfts` endpoint
- [ ] Add NFT selector component with pagination
- [ ] Cache NFT metadata on listing creation
- [ ] Handle ERC1155 balance amounts properly
- [ ] Implement metadata refresh for active listings
- [ ] Add proper error handling and loading states
- [ ] Test with wallets containing 100+ NFTs