# Product Requirements Document: FC NFT Exchange

## 1. Overview

**FC NFT Exchange** - A mobile-first NFT marketplace Frame for Farcaster on Base L2, enabling USDC-based trading with instant settlement.

### Architecture
- **Smart Contract**: Solmate-based on Base L2
- **Frontend**: React + Vite with Frame SDK
- **Backend**: Cloudflare Workers + Hono
- **Database**: Cloudflare D1
- **Storage**: R2 for images, contract for critical data

## 2. Smart Contract Specification

### Core Functions

```solidity
// Listing Functions
function createListing(address nftContract, uint256 tokenId, uint256 price, uint256 duration) external returns (uint256 listingId)
function cancelListing(uint256 listingId) external
function buyListing(uint256 listingId) external

// Offer Functions
function makeOffer(address nftContract, uint256 tokenId, uint256 offerAmount, uint256 duration) external returns (uint256 offerId)
function acceptOffer(uint256 offerId) external
function cancelOffer(uint256 offerId) external
```

### Events (for indexing)
```solidity
event ListingCreated(uint256 indexed listingId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 price, string metadataURI);
event OfferMade(uint256 indexed offerId, address indexed buyer, address indexed nftContract, uint256 tokenId, uint256 amount);
event ListingSold(uint256 indexed listingId, address buyer, uint256 price);
event OfferAccepted(uint256 indexed offerId, address seller);
```

## 3. Frontend Implementation

### Frame Configuration
```javascript
// index.html
<meta name="fc:frame" content='{
  "version": "next",
  "imageUrl": "https://fc-nft-exchange.com/splash.png",
  "button": {
    "title": "Start Trading",
    "action": {
      "type": "launch_frame",
      "name": "FC NFT Exchange",
      "url": "https://fc-nft-exchange.com/",
      "splashImageUrl": "https://fc-nft-exchange.com/icon.png",
      "splashBackgroundColor": "#0052FF"
    }
  }
}' />
```

### Core Implementation

```javascript
// App.jsx - Main entry point
import { useEffect, useState } from 'react';
import * as frame from '@farcaster/frame-sdk';

function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      // Get user context
      const context = await frame.sdk.context;
      let userData = context.user;
      if (userData.user) userData = userData.user; // Handle SDK quirk
      
      setUser(userData);
      
      // Signal frame ready
      await frame.sdk.actions.ready();
      setReady(true);
    };
    
    init();
  }, []);

  if (!ready) return <SplashScreen />;
  
  return <MainApp user={user} />;
}
```

### Transaction Handler
```javascript
// utils/transactions.js
export class TransactionManager {
  constructor() {
    this.MARKETPLACE_ADDRESS = '0x...';
    this.USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  }

  async buyListing(listingId, price) {
    const accounts = await frame.sdk.wallet.ethProvider.request({
      method: 'eth_requestAccounts'
    });
    
    // 1. Approve USDC
    const approveData = this.encodeApprove(this.MARKETPLACE_ADDRESS, price);
    await this.sendTransaction(accounts[0], this.USDC_ADDRESS, approveData);
    
    // 2. Buy NFT
    const buyData = this.encodeBuyListing(listingId);
    const txHash = await this.sendTransaction(accounts[0], this.MARKETPLACE_ADDRESS, buyData);
    
    return txHash;
  }

  async createListing(nftContract, tokenId, price, duration) {
    const accounts = await frame.sdk.wallet.ethProvider.request({
      method: 'eth_requestAccounts'
    });
    
    // 1. Approve NFT
    const approveNFTData = this.encodeNFTApprove(this.MARKETPLACE_ADDRESS, tokenId);
    await this.sendTransaction(accounts[0], nftContract, approveNFTData);
    
    // 2. Create listing
    const listingData = this.encodeCreateListing(nftContract, tokenId, price, duration);
    return await this.sendTransaction(accounts[0], this.MARKETPLACE_ADDRESS, listingData);
  }

  async sendTransaction(from, to, data) {
    return await frame.sdk.wallet.ethProvider.request({
      method: 'eth_sendTransaction',
      params: [{ from, to, data }]
    });
  }

  // Encoding helpers
  encodeApprove(spender, amount) {
    const selector = '0x095ea7b3';
    const spenderPadded = spender.slice(2).padStart(64, '0');
    const amountHex = BigInt(amount * 1e6).toString(16).padStart(64, '0'); // USDC decimals
    return selector + spenderPadded + amountHex;
  }

  encodeBuyListing(listingId) {
    const selector = '0x1b84bf11'; // buyListing(uint256)
    return selector + listingId.toString(16).padStart(64, '0');
  }
}
```

### Key Components

```javascript
// components/NFTCard.jsx
export function NFTCard({ listing, onPress }) {
  const handleBuy = async () => {
    const tx = new TransactionManager();
    try {
      const txHash = await tx.buyListing(listing.id, listing.price);
      // Update UI optimistically
      onPress(txHash);
    } catch (error) {
      console.error('Transaction failed:', error);
    }
  };

  return (
    <div className="nft-card" onClick={onPress}>
      <img src={listing.image} alt={listing.name} loading="lazy" />
      <div className="nft-info">
        <h3>{listing.name}</h3>
        <p className="price">{listing.price} USDC</p>
        <button onClick={handleBuy}>Buy Now</button>
      </div>
    </div>
  );
}

// components/CreateListing.jsx
export function CreateListing() {
  const [selectedNFT, setSelectedNFT] = useState(null);
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState(7);

  const loadUserNFTs = async () => {
    const accounts = await frame.sdk.wallet.ethProvider.request({
      method: 'eth_requestAccounts'
    });
    
    // Fetch from backend
    const response = await fetch(`/api/users/${accounts[0]}/nfts`);
    return await response.json();
  };

  const handleSubmit = async () => {
    const tx = new TransactionManager();
    const txHash = await tx.createListing(
      selectedNFT.contract,
      selectedNFT.tokenId,
      parseFloat(price),
      duration * 86400
    );
    
    // Notify backend
    await fetch('/api/listings/index', {
      method: 'POST',
      body: JSON.stringify({ txHash })
    });
  };

  return (
    <div className="create-listing">
      <NFTSelector onSelect={setSelectedNFT} />
      <PriceInput value={price} onChange={setPrice} />
      <DurationPicker value={duration} onChange={setDuration} />
      <button onClick={handleSubmit}>Create Listing</button>
    </div>
  );
}
```

### Navigation Handler
```javascript
// hooks/useNavigation.js
export function useNavigation() {
  const openUrl = async (url) => {
    await frame.sdk.actions.openUrl({ url });
  };

  const shareToFarcaster = async (text, embedUrl) => {
    const castUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(embedUrl)}`;
    await openUrl(castUrl);
  };

  const viewProfile = async (fid) => {
    await frame.sdk.actions.viewProfile({ fid });
  };

  return { openUrl, shareToFarcaster, viewProfile };
}
```

## 4. Backend Implementation (Cloudflare Workers)

### Worker Setup
```javascript
// src/index.js
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { D1Database } from '@cloudflare/workers-types';

const app = new Hono();
app.use('*', cors());

// Bindings
interface Env {
  DB: D1Database;
  R2: R2Bucket;
  BASE_RPC_URL: string;
  CONTRACT_ADDRESS: string;
}

// Routes
app.get('/api/listings', async (c) => {
  const { page = 1, limit = 20, sort = 'recent' } = c.req.query();
  
  const offset = (page - 1) * limit;
  const orderBy = sort === 'price_low' ? 'price ASC' : 'created_at DESC';
  
  const listings = await c.env.DB.prepare(`
    SELECT * FROM listings 
    WHERE sold_at IS NULL 
      AND cancelled_at IS NULL 
      AND expiry > datetime('now')
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all();
  
  return c.json(listings);
});

app.get('/api/listings/:id', async (c) => {
  const id = c.req.param('id');
  
  const listing = await c.env.DB.prepare(
    'SELECT * FROM listings WHERE listing_id = ?'
  ).bind(id).first();
  
  if (!listing) return c.notFound();
  
  // Get offers for this listing
  const offers = await c.env.DB.prepare(`
    SELECT * FROM offers 
    WHERE nft_contract = ? AND token_id = ?
    AND cancelled_at IS NULL AND accepted_at IS NULL
    ORDER BY amount DESC
  `).bind(listing.nft_contract, listing.token_id).all();
  
  return c.json({ ...listing, offers: offers.results });
});

app.post('/api/listings/index', async (c) => {
  const { txHash } = await c.req.json();
  
  // Queue transaction indexing
  await c.env.QUEUE.send({
    type: 'index_transaction',
    txHash
  });
  
  return c.json({ success: true });
});

app.get('/api/users/:address/nfts', async (c) => {
  const address = c.req.param('address');
  
  // Call Alchemy/QuickNode API to get user's NFTs
  const response = await fetch(`${c.env.ALCHEMY_URL}/getNFTs?owner=${address}`);
  const data = await response.json();
  
  // Filter for Base chain NFTs
  const baseNFTs = data.ownedNfts.filter(nft => nft.contract.address);
  
  return c.json(baseNFTs);
});

export default app;
```

### Event Indexer (Scheduled Worker)
```javascript
// src/indexer.js
import { ethers } from 'ethers';

export default {
  async scheduled(event, env, ctx) {
    const provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const contract = new ethers.Contract(env.CONTRACT_ADDRESS, ABI, provider);
    
    // Get last indexed block
    const lastBlock = await env.DB.prepare(
      'SELECT MAX(block_number) as last FROM indexed_blocks'
    ).first();
    
    const fromBlock = lastBlock?.last || 0;
    const toBlock = await provider.getBlockNumber();
    
    // Index ListingCreated events
    const listingEvents = await contract.queryFilter(
      contract.filters.ListingCreated(),
      fromBlock + 1,
      toBlock
    );
    
    for (const event of listingEvents) {
      const { listingId, seller, nftContract, tokenId, price, metadataURI } = event.args;
      
      // Fetch metadata
      const metadata = await fetchMetadata(metadataURI);
      
      await env.DB.prepare(`
        INSERT INTO listings (
          listing_id, seller_address, nft_contract, token_id, 
          price, expiry, metadata_uri, image_url, name, description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        listingId.toString(),
        seller,
        nftContract,
        tokenId.toString(),
        price.toString() / 1e6, // Convert to USDC decimals
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days default
        metadataURI,
        metadata.image,
        metadata.name,
        metadata.description
      ).run();
    }
    
    // Update last indexed block
    await env.DB.prepare(
      'INSERT OR REPLACE INTO indexed_blocks (id, block_number) VALUES (1, ?)'
    ).bind(toBlock).run();
  }
};
```

### API Endpoints

```javascript
// Additional endpoints
app.get('/api/offers/received/:fid', async (c) => {
  const fid = c.req.param('fid');
  
  // Get user's address from FID
  const user = await c.env.DB.prepare(
    'SELECT wallet_address FROM users WHERE fid = ?'
  ).bind(fid).first();
  
  if (!user) return c.json([]);
  
  const offers = await c.env.DB.prepare(`
    SELECT o.*, l.name, l.image_url 
    FROM offers o
    JOIN listings l ON o.nft_contract = l.nft_contract AND o.token_id = l.token_id
    WHERE l.seller_address = ?
    AND o.cancelled_at IS NULL AND o.accepted_at IS NULL
    ORDER BY o.created_at DESC
  `).bind(user.wallet_address).all();
  
  return c.json(offers.results);
});

app.get('/api/stats/volume/:period', async (c) => {
  const period = c.req.param('period'); // 24h, 7d, 30d
  
  const hours = period === '24h' ? 24 : period === '7d' ? 168 : 720;
  
  const stats = await c.env.DB.prepare(`
    SELECT 
      COUNT(*) as sales,
      SUM(price) as volume,
      AVG(price) as avg_price
    FROM activity
    WHERE type = 'sale'
    AND created_at > datetime('now', '-${hours} hours')
  `).first();
  
  return c.json(stats);
});

app.post('/api/images/upload', async (c) => {
  const body = await c.req.parseBody();
  const file = body['image'];
  
  if (!file) return c.json({ error: 'No file provided' }, 400);
  
  const key = `nfts/${Date.now()}-${file.name}`;
  await c.env.R2.put(key, file.stream());
  
  return c.json({ 
    url: `https://fc-nft-exchange.com/images/${key}` 
  });
});
```

## 5. Database Schema (Cloudflare D1)

```sql
-- Users table
CREATE TABLE users (
  fid INTEGER PRIMARY KEY,
  username VARCHAR(255),
  display_name VARCHAR(255),
  pfp_url TEXT,
  wallet_address VARCHAR(42),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Listings table
CREATE TABLE listings (
  listing_id INTEGER PRIMARY KEY,
  seller_address VARCHAR(42),
  nft_contract VARCHAR(42),
  token_id VARCHAR(78),
  price DECIMAL(36, 18),
  expiry TIMESTAMP,
  metadata_uri TEXT,
  image_url TEXT,
  name VARCHAR(255),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sold_at TIMESTAMP,
  cancelled_at TIMESTAMP
);
CREATE INDEX idx_active_listings ON listings(expiry, sold_at, cancelled_at);
CREATE INDEX idx_collection ON listings(nft_contract);

-- Offers table
CREATE TABLE offers (
  offer_id INTEGER PRIMARY KEY,
  buyer_address VARCHAR(42),
  nft_contract VARCHAR(42),
  token_id VARCHAR(78),
  amount DECIMAL(36, 18),
  expiry TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP,
  cancelled_at TIMESTAMP
);
CREATE INDEX idx_nft_offers ON offers(nft_contract, token_id);

-- Activity table
CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT CHECK(type IN ('listing_created', 'offer_made', 'sale', 'offer_accepted')),
  actor_address VARCHAR(42),
  nft_contract VARCHAR(42),
  token_id VARCHAR(78),
  price DECIMAL(36, 18),
  metadata TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_nft_activity ON activity(nft_contract, token_id);

-- Indexed blocks tracker
CREATE TABLE indexed_blocks (
  id INTEGER PRIMARY KEY,
  block_number INTEGER NOT NULL
);
```

## 6. Deployment Configuration

### wrangler.toml
```toml
name = "fc-nft-exchange"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "fc-nft-exchange"
database_id = "your-database-id"

[[r2_buckets]]
binding = "R2"
bucket_name = "fc-nft-exchange-images"

[vars]
BASE_RPC_URL = "https://mainnet.base.org"
CONTRACT_ADDRESS = "0x..."

[[triggers]]
crons = ["*/5 * * * *"] # Index every 5 minutes
```

### Environment Setup
```bash
# Deploy database schema
wrangler d1 execute fc-nft-exchange --file=./schema.sql

# Deploy worker
wrangler deploy

# Set up custom domain
wrangler domains add fc-nft-exchange.com
```

This architecture leverages Cloudflare's edge infrastructure for optimal performance while maintaining a clean separation between on-chain critical data and off-chain metadata. The Frame SDK integration ensures seamless wallet interactions within the Farcaster app constraints.
