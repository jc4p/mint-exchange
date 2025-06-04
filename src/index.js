import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { html, raw } from 'hono/html'
import { Database } from './server/db.js'

const app = new Hono()

app.use('*', logger())
app.use('/api/*', cors())

const FRAME_URL = "https://mint-exchange.xyz"

const Layout = ({ children, title }) => html`
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title || 'FC NFT Exchange'}</title>
    <meta name="fc:frame" content='{"version":"next","imageUrl":"${FRAME_URL}/preview.png","button":{"title":"Browse NFTs","action":{"type":"launch_frame","name":"NFT Exchange","url":"${FRAME_URL}","splashImageUrl":"${FRAME_URL}/splash.png","splashBackgroundColor":"#f8fafc"}}}' />
    <script type="module" src="/bundle.js"></script>
    <link rel="stylesheet" href="/bundle.css">
  </head>
  <body>
    <div id="app">
      ${children}
    </div>
  </body>
  </html>
`

// Single listing endpoint
app.get('/api/listings/:id', async (c) => {
  try {
    const db = new Database(c.env.DB)
    const listingId = c.req.param('id').replace('listing_', '')
    
    const listing = await db.getListing(listingId)
    if (!listing) {
      return c.json({ error: 'Listing not found' }, 404)
    }
    
    // Transform to match frontend format
    const transformed = {
      id: `listing_${listing.listing_id}`,
      tokenId: listing.token_id,
      contractAddress: listing.nft_contract,
      name: listing.name,
      description: listing.description,
      image: listing.image_url,
      price: listing.price,
      seller: {
        address: listing.seller_address,
        username: listing.username || `user_${listing.seller_address.slice(2, 8)}`,
        fid: listing.fid || null,
        display_name: listing.display_name,
        pfp_url: listing.pfp_url
      },
      listedAt: listing.created_at,
      expiresAt: listing.expiry,
      status: listing.sold_at ? 'sold' : listing.cancelled_at ? 'cancelled' : 'active'
    }
    
    return c.json(transformed)
  } catch (error) {
    console.error('Error fetching listing:', error)
    return c.json({ error: 'Failed to fetch listing' }, 500)
  }
})

// Activity endpoint
app.get('/api/activity', async (c) => {
  try {
    const db = new Database(c.env.DB)
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '20')
    const type = c.req.query('type')
    const actor = c.req.query('actor')
    
    const filter = {}
    if (type) filter.type = type
    if (actor) filter.actor_address = actor
    
    const result = await db.getActivity({ page, limit, filter })
    
    return c.json(result)
  } catch (error) {
    console.error('Error fetching activity:', error)
    return c.json({ error: 'Failed to fetch activity' }, 500)
  }
})

// User NFTs endpoint - fetch from Alchemy
app.get('/api/users/:address/nfts', async (c) => {
  try {
    const address = c.req.param('address')
    const alchemyApiKey = c.env.ALCHEMY_API_KEY
    
    if (!alchemyApiKey) {
      // Return mock data if no API key
      return c.json({
        nfts: [
          {
            contract: { address: '0x1234567890abcdef1234567890abcdef12345678' },
            tokenId: '1',
            title: 'Mock NFT #1',
            media: [{ gateway: 'https://picsum.photos/seed/nft1/400/400' }],
            description: 'This is a mock NFT for development'
          },
          {
            contract: { address: '0xabcdef1234567890abcdef1234567890abcdef12' },
            tokenId: '42',
            title: 'Mock NFT #42',
            media: [{ gateway: 'https://picsum.photos/seed/nft42/400/400' }],
            description: 'Another mock NFT'
          }
        ]
      })
    }
    
    // Fetch NFTs from Alchemy on Base mainnet with spam filtering
    const baseUrl = `https://base-mainnet.g.alchemy.com/nft/v3/${alchemyApiKey}/getNFTsForOwner`
    const params = new URLSearchParams({
      owner: address,
      withMetadata: 'true',
      pageSize: '100',
      spamConfidenceLevel: 'MEDIUM'
    })
    
    // Add excludeFilters parameter
    params.append('excludeFilters[]', 'SPAM')
    params.append('excludeFilters[]', 'AIRDROPS')
    
    const response = await fetch(`${baseUrl}?${params}`)
    
    if (!response.ok) {
      throw new Error(`Alchemy API error: ${response.status}`)
    }
    
    const data = await response.json()
    
    // Transform Alchemy response to our format
    const transformedNfts = data.ownedNfts.map(nft => ({
      contract: {
        address: nft.contract.address,
        name: nft.contract.name || 'Unknown Collection',
        symbol: nft.contract.symbol
      },
      tokenId: nft.tokenId,
      title: nft.name || `${nft.contract.name || 'NFT'} #${nft.tokenId}`,
      description: nft.description || '',
      media: nft.image ? [{ gateway: nft.image.cachedUrl || nft.image.originalUrl }] : [],
      metadata: nft.raw?.metadata || {}
    }))
    
    // Filter out spam NFTs based on keywords
    const spamKeywords = ['claim', 'voucher', 'airdrop']
    const filteredNfts = transformedNfts.filter(nft => {
      const textFields = [
        nft.title?.toLowerCase() || '',
        nft.description?.toLowerCase() || '',
        nft.contract.name?.toLowerCase() || '',
        nft.contract.symbol?.toLowerCase() || ''
      ]
      
      return !spamKeywords.some(keyword => 
        textFields.some(field => field.includes(keyword))
      )
    })
    
    return c.json({ nfts: filteredNfts })
  } catch (error) {
    console.error('Error fetching NFTs:', error)
    return c.json({ error: 'Failed to fetch NFTs' }, 500)
  }
})

// User stats endpoint
app.get('/api/users/:address/stats', async (c) => {
  try {
    const db = new Database(c.env.DB)
    const address = c.req.param('address')
    
    const stats = await db.getUserStats(address)
    return c.json(stats)
  } catch (error) {
    console.error('Error fetching user stats:', error)
    return c.json({ error: 'Failed to fetch user stats' }, 500)
  }
})

app.get('/', async (c) => {
  let listings = []
  
  try {
    // Try to fetch from database
    const db = new Database(c.env.DB)
    const result = await db.getActiveListings({ page: 1, limit: 8 })
    
    listings = result.listings.map(listing => ({
      id: `listing_${listing.listing_id}`,
      tokenId: listing.token_id,
      contractAddress: listing.nft_contract,
      name: listing.name,
      image: listing.image_url,
      price: listing.price,
      seller: {
        address: listing.seller_address,
        username: listing.username || `user_${listing.seller_address.slice(2, 8)}`,
        fid: listing.fid || null
      }
    }))
  } catch (error) {
    console.log('Using mock data for homepage:', error.message)
    // Fallback to mock data
    listings = Array.from({ length: 8 }, (_, i) => ({
      id: `listing_${i + 1}`,
      tokenId: `${1000 + i}`,
      contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
      name: `Cool NFT #${1000 + i}`,
      image: `https://picsum.photos/seed/${i}/400/400`,
      price: (Math.random() * 100).toFixed(2),
      seller: {
        address: i % 2 === 0 ? '0x0db12C0A67bc5B8942ea3126a465d7a0b23126C7' : `0x${Math.random().toString(16).slice(2, 10)}`,
        username: i % 2 === 0 ? 'kasra' : `user${i}`,
        fid: i % 2 === 0 ? 12345 : 10000 + i
      }
    }))
  }
  
  return c.html(
    Layout({
      children: html`
        <frame-provider>
          <header class="header">
            <div class="header-content">
              <h1>Explore</h1>
              <div class="header-actions">
                <button class="search-button" type="button" aria-label="Search">
                  <svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256">
                    <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"></path>
                  </svg>
                </button>
              </div>
            </div>
          </header>
        
          <main class="main-content">
            <h2 class="section-header">Featured</h2>
            <featured-section>
              ${raw(`<div class="featured-container">
                ${listings.slice(0, 3).map(nft => `
                  <div class="featured-card">
                    <div class="featured-image" style="background-image: url('${nft.image}')"></div>
                    <div class="featured-info">
                      <p class="featured-title">${nft.name}</p>
                      <p class="featured-description">Digital art collection</p>
                    </div>
                  </div>
                `).join('')}
              </div>`)}
            </featured-section>
            
            <h2 class="section-header">Latest</h2>
            <latest-section>
              ${raw(listings.slice(3, 6).map((nft, index) => `
                <div class="latest-item">
                  <div class="latest-info">
                    <p class="latest-label">${index === 0 ? 'Trending' : index === 1 ? 'New' : 'Popular'}</p>
                    <p class="latest-title">${nft.name}</p>
                    <p class="latest-description">${nft.price} USDC</p>
                  </div>
                  <div class="latest-image" style="background-image: url('${nft.image}')"></div>
                </div>
              `).join(''))}
            </latest-section>
          </main>
          
          <nav-tabs active="home"></nav-tabs>
        </frame-provider>
      `,
      title: 'Browse NFTs - FC NFT Exchange'
    })
  )
})

// Profile page route
app.get('/profile', async (c) => {
  return c.html(
    Layout({
      children: html`
        <frame-provider>
          <div class="frame-provider">
            <header class="header">
              <div class="header-content">
                <h1>Profile</h1>
              </div>
            </header>
          
            <main class="main-content">
              <profile-tab></profile-tab>
            </main>
            
            <nav-tabs active="profile"></nav-tabs>
          </div>
        </frame-provider>
      `,
      title: 'Profile - FC NFT Exchange'
    })
  )
})

// Activity page route
app.get('/activity', async (c) => {
  return c.html(
    Layout({
      children: html`
        <frame-provider>
          <header class="header">
            <div class="header-content">
              <h1>Activity</h1>
              <div class="header-actions">
                <button class="filter-button" type="button" aria-label="Filter">
                  <svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256">
                    <path d="M232,56v48a8,8,0,0,1-2.34,5.66L168,171.31V216a8,8,0,0,1-11.58,7.16l-40-20A8,8,0,0,1,112,196V171.31L50.34,109.66A8,8,0,0,1,48,104V56a8,8,0,0,1,8-8H224A8,8,0,0,1,232,56Z"></path>
                  </svg>
                </button>
              </div>
            </div>
          </header>
        
          <main class="main-content">
            <activity-feed></activity-feed>
          </main>
          
          <nav-tabs active="activity"></nav-tabs>
        </frame-provider>
      `,
      title: 'Activity Feed - FC NFT Exchange'
    })
  )
})

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// NFT listings endpoint - now using D1 database
app.get('/api/listings', async (c) => {
  try {
    const db = new Database(c.env.DB)
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '20')
    const sort = c.req.query('sort') || 'recent'
    const seller = c.req.query('seller')
    
    const result = await db.getActiveListings({ page, limit, sort, seller })
    
    // Transform data to match frontend expectations
    const transformedListings = result.listings.map(listing => ({
      id: `listing_${listing.listing_id}`,
      tokenId: listing.token_id,
      contractAddress: listing.nft_contract,
      name: listing.name,
      image: listing.image_url,
      price: listing.price,
      seller: {
        address: listing.seller_address,
        username: listing.username || `user_${listing.seller_address.slice(2, 8)}`,
        fid: listing.fid || null,
        display_name: listing.display_name,
        pfp_url: listing.pfp_url
      },
      listedAt: listing.created_at,
      expiresAt: listing.expiry
    }))
    
    return c.json({
      listings: transformedListings,
      pagination: result.pagination
    })
  } catch (error) {
    console.error('Error fetching listings:', error)
    
    // Fallback to mock data if database is not available
    if (error.message?.includes('D1_ERROR') || !c.env.DB) {
      console.log('Falling back to mock data')
      // Variables already declared above
      
      // Mock data for development
      const mockListings = Array.from({ length: 12 }, (_, i) => ({
    id: `listing_${i + 1}`,
    tokenId: `${1000 + i}`,
    contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
    name: `Cool NFT #${1000 + i}`,
    image: `https://picsum.photos/seed/${i}/400/400`,
    price: (Math.random() * 100).toFixed(2),
    seller: {
      address: `0x${Math.random().toString(16).slice(2, 10)}`,
      username: `user${i}`,
      fid: 10000 + i
    },
    listedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  }))
  
  const start = (page - 1) * limit
  const paginatedListings = mockListings.slice(start, start + limit)
  
      return c.json({
        listings: paginatedListings,
        pagination: {
          page,
          limit,
          total: mockListings.length,
          hasMore: start + limit < mockListings.length
        }
      })
    }
    
    // Re-throw other errors
    throw error
  }
})

app.notFound((c) => {
  return c.json({ message: 'Not Found' }, 404)
})

app.onError((err, c) => {
  console.error(`${err}`)
  return c.json({ message: 'Internal Server Error' }, 500)
})

export default app