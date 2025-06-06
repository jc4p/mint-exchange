# FC NFT Exchange

A mobile-first NFT marketplace built as a Farcaster Frame, enabling USDC-based trading on Base L2 with instant settlement.

## Overview

FC NFT Exchange is a decentralized NFT marketplace that lives entirely within Farcaster as a Frame. Users can list, browse, and purchase NFTs using USDC on Base mainnet, all without leaving the Farcaster app.

### Key Features

- 🎨 **Multi-Standard Support**: Seamlessly handles both ERC721 and ERC1155 NFTs
- 💰 **USDC Trading**: All transactions use USDC on Base mainnet for stable pricing
- 🖼️ **Frame-Native**: Built specifically for the Farcaster Frame environment
- ⚡ **Real-time Updates**: Blockchain events synced via webhooks and scheduled indexing
- 🔒 **Secure Authentication**: Uses Farcaster Quick Auth for seamless sign-in
- 📱 **Mobile-First Design**: Optimized for mobile viewing within Farcaster

## Architecture

### Tech Stack

- **Smart Contract**: Solidity contract deployed on Base L2 (see `/nft-exchange-contract`)
- **Backend**: Cloudflare Workers + Hono framework
- **Frontend**: Server-side rendering with Custom Elements for interactivity
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2 for images
- **Blockchain Integration**: Viem for contract interactions
- **Package Manager**: Bun

### Project Structure

```
/
├── src/
│   ├── index.js              # Main entry point
│   ├── server/
│   │   ├── app.js           # API application setup
│   │   ├── pages.js         # Server-side rendered pages
│   │   ├── db.js            # Database queries
│   │   ├── blockchain.js    # Blockchain RPC interactions
│   │   ├── indexer.js       # Event indexing system
│   │   ├── middleware/
│   │   │   └── auth.js      # Authentication middleware
│   │   └── routes/
│   │       ├── listings.js  # NFT listing endpoints
│   │       ├── users.js     # User profile/NFT endpoints
│   │       ├── activity.js  # Activity feed endpoints
│   │       ├── auth.js      # Authentication endpoints
│   │       ├── webhooks.js  # Webhook handlers
│   │       └── admin.js     # Admin endpoints
│   └── client/
│       ├── components/      # Custom Elements
│       │   ├── frame-provider.js   # Frame SDK integration
│       │   ├── nft-grid.js        # NFT display grid
│       │   ├── nft-details.js     # NFT detail modal
│       │   ├── create-listing.js  # Listing creation flow
│       │   └── ...
│       └── utils/
│           ├── contract.js        # Contract encoding (viem)
│           └── transactions.js    # Transaction management
├── nft-exchange-contract/    # Smart contract code
├── docs/                     # Documentation
└── schema.sql               # Database schema
```

### How It Works

1. **Server-Side Rendering**: Initial page loads are server-rendered for fast performance
2. **Custom Elements**: Client-side interactivity via native Web Components
3. **Frame Integration**: Uses Farcaster Frame SDK for wallet connections and auth
4. **Event Syncing**: Dual approach with Alchemy webhooks + scheduled indexing
5. **Contract Interactions**: Direct on-chain transactions via Frame wallet

## API Endpoints

### Public Endpoints

- `GET /api/listings` - Browse active listings
- `GET /api/listings/:id` - Get listing details
- `GET /api/users/:address/nfts` - Get user's NFTs
- `GET /api/users/:address/stats` - Get user statistics
- `GET /api/activity` - Get activity feed
- `GET /api/health` - Health check

### Protected Endpoints (Require Auth)

- `POST /api/listings` - Create new listing
- `DELETE /api/listings/:id` - Cancel listing
- `GET /api/users/me` - Get current user profile
- `PUT /api/users/me` - Update profile

### Admin Endpoints (Require Admin Token)

- `POST /api/admin/index-events` - Manual blockchain indexing
- `GET /api/admin/index-status` - Check indexing status
- `POST /api/admin/reindex` - Force reindex from block

### Webhook Endpoints

- `POST /api/webhooks/alchemy` - Alchemy event notifications

## Smart Contract

The NFT Exchange smart contract is deployed on Base mainnet at:
```
0x06fB7424Ba65D587405b9C754Bc40dA9398B72F0
```

See `/nft-exchange-contract/README.md` for contract details and deployment instructions.

## Setup & Development

### Prerequisites

- [Bun](https://bun.sh) runtime
- Cloudflare account (Workers, D1, R2)
- Alchemy API key for Base mainnet
- Base ETH for gas fees

### Environment Variables

Create a `.dev.vars` file:
```bash
# Copy from example
cp .dev.vars.example .dev.vars

# Required variables:
ALCHEMY_API_KEY=your_alchemy_api_key
ADMIN_TOKEN=your_secure_admin_token
DOMAIN=localhost:8787  # or your production domain
ALCHEMY_WEBHOOK_SECRET=your_webhook_secret  # optional
```

### Local Development

```bash
# Install dependencies
bun install

# Run database migrations
wrangler d1 execute nft-exchange --local --file=./schema.sql

# Start dev server
bun run dev

# Visit http://localhost:8787
```

### Database Setup

```bash
# Create D1 database
wrangler d1 create nft-exchange

# Update wrangler.toml with the database ID

# Run migrations
wrangler d1 execute nft-exchange --file=./schema.sql
```

### Deployment

```bash
# Deploy to Cloudflare Workers
bun run deploy

# Or manually
wrangler deploy
```

## Event Indexing

The marketplace uses two methods to sync blockchain events:

1. **Alchemy Webhooks** (Real-time)
   - Set up webhook in Alchemy dashboard
   - Point to: `https://your-domain.com/api/webhooks/alchemy`
   - Monitor contract: `0x06fB7424Ba65D587405b9C754Bc40dA9398B72F0`

2. **Scheduled Worker** (Every 5 minutes)
   - Automatically configured in `wrangler.toml`
   - Catches any missed events
   - Provides redundancy

## Features Implemented

✅ **Core Marketplace**
- Browse active NFT listings
- Create listings with on-chain transactions
- Buy NFTs with USDC
- Cancel listings
- Real-time activity feed

✅ **Authentication**
- Farcaster Quick Auth integration
- JWT-based session management
- Protected API endpoints

✅ **Blockchain Integration**
- Contract interactions via Viem
- USDC & NFT approval flows
- Transaction status tracking
- Event indexing system

✅ **User Experience**
- Server-side rendering for fast loads
- Custom Elements for interactivity
- Mobile-optimized design
- Frame SDK integration

## Features To Implement

🔄 **Offer System**
- Make offers on any NFT
- Accept/reject offers
- Offer expiration
- Counter-offers

🔄 **Enhanced Features**
- Collection pages
- Push notifications

🔄 **Social Features**
- Share functionality
- Show listings by followers
- Trading reputation

## Frame Configuration

The app is configured as a Farcaster Frame with the following metadata:

```html
<meta name="fc:frame" content='{
  "version": "next",
  "imageUrl": "https://your-domain.com/preview.png",
  "button": {
    "title": "Browse NFTs",
    "action": {
      "type": "launch_frame",
      "name": "NFT Exchange",
      "url": "https://your-domain.com",
      "splashImageUrl": "https://your-domain.com/splash.png",
      "splashBackgroundColor": "#f8fafc"
    }
  }
}' />
```

## Security Considerations

- All contract interactions require user approval
- Admin endpoints protected by bearer token
- CORS enabled only for API routes
- Input validation on all endpoints
- SQL injection prevention via prepared statements

## License

MIT License - see LICENSE file for details
