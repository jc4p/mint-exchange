import { Hono } from 'hono'
import { Database } from '../db.js'
import { authMiddleware } from '../middleware/auth.js'

const listings = new Hono()

// Get current user's listings (protected - uses JWT)
listings.get('/me', authMiddleware(), async (c) => {
  try {
    const db = new Database(c.env.DB)
    const user = c.get('user')
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '20')
    const sort = c.req.query('sort') || 'recent'
    
    const result = await db.getActiveListings({ 
      page, 
      limit, 
      sort, 
      sellerFid: user.fid, 
      search: null 
    })
    
    // Transform data to match frontend expectations
    const transformedListings = result.listings.map(listing => ({
      id: listing.id,
      tokenId: listing.token_id,
      contractAddress: listing.nft_contract,
      name: listing.name,
      image: listing.image_url,
      price: listing.price,
      seller: {
        address: listing.seller_address,
        username: listing.username || user.username,
        fid: listing.seller_fid,
        display_name: listing.display_name || user.display_name,
        pfp_url: listing.pfp_url || user.pfp_url
      },
      listedAt: listing.created_at,
      expiresAt: listing.expiry,
      txHash: listing.tx_hash
    }))
    
    return c.json({
      listings: transformedListings,
      pagination: result.pagination
    })
  } catch (error) {
    console.error('Error fetching user listings:', error)
    return c.json({ error: 'Failed to fetch your listings' }, 500)
  }
})

// Get all active listings
listings.get('/', async (c) => {
  try {
    const db = new Database(c.env.DB)
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '20')
    const sort = c.req.query('sort') || 'recent'
    const sellerFid = c.req.query('seller_fid') ? parseInt(c.req.query('seller_fid')) : null
    const search = c.req.query('search')
    
    const result = await db.getActiveListings({ page, limit, sort, sellerFid, search })
    
    // Transform data to match frontend expectations
    const transformedListings = result.listings.map(listing => ({
      id: listing.id,
      tokenId: listing.token_id,
      contractAddress: listing.nft_contract,
      name: listing.name,
      image: listing.image_url,
      price: listing.price,
      seller: {
        address: listing.seller_address,
        username: listing.username || `user_${listing.seller_fid || 'unknown'}`,
        fid: listing.seller_fid,
        displayName: listing.display_name,  // Changed to camelCase
        pfpUrl: listing.pfp_url            // Changed to camelCase
      },
      listedAt: listing.created_at,
      expiresAt: listing.expiry,
      txHash: listing.tx_hash
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
      const page = parseInt(c.req.query('page') || '1')
      const limit = parseInt(c.req.query('limit') || '20')
      
      // Mock data for development
      const mockListings = Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
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

// Get single listing
listings.get('/:id', async (c) => {
  try {
    const db = new Database(c.env.DB)
    const listingId = c.req.param('id')
    
    const listing = await db.getListing(listingId)
    if (!listing) {
      return c.json({ error: 'Listing not found' }, 404)
    }
    
    // Transform to match frontend format
    const transformed = {
      id: listing.id,
      tokenId: listing.token_id,
      contractAddress: listing.nft_contract,
      name: listing.name,
      description: listing.description,
      image: listing.image_url,
      price: listing.price,
      seller: {
        address: listing.seller_address,
        username: listing.username || `user_${listing.seller_fid || 'unknown'}`,
        fid: listing.seller_fid,
        displayName: listing.display_name,  // Changed to camelCase
        pfpUrl: listing.pfp_url            // Changed to camelCase
      },
      listedAt: listing.created_at,
      expiresAt: listing.expiry,
      status: listing.sold_at ? 'sold' : listing.cancelled_at ? 'cancelled' : 'active',
      txHash: listing.tx_hash
    }
    
    return c.json(transformed)
  } catch (error) {
    console.error('Error fetching listing:', error)
    return c.json({ error: 'Failed to fetch listing' }, 500)
  }
})

// Create listing (protected route - requires auth)
listings.post('/', authMiddleware(), async (c) => {
  try {
    const db = new Database(c.env.DB)
    const body = await c.req.json()
    const user = c.get('user')
    
    // txHash is required for onchain operations
    if (!body.txHash) {
      return c.json({ error: 'Transaction hash is required' }, 400)
    }
    
    // Get seller address from the transaction
    const { createRpcClient } = await import('../utils/rpc-client.js')
    const client = createRpcClient(c.env)
    const tx = await client.getTransaction({ hash: body.txHash })
    const sellerAddress = tx.from
    
    // Create listing in database - let the DB handle the auto-increment ID
    const result = await db.createListing({
      blockchain_listing_id: body.blockchainListingId || null,
      seller_fid: user.fid,
      seller_address: sellerAddress,
      nft_contract: body.nftContract,
      token_id: body.tokenId,
      price: body.price,
      expiry: body.expiry,
      metadata_uri: body.metadata?.metadata_uri || '',
      image_url: body.metadata?.image_url || '',
      name: body.metadata?.name || 'Untitled NFT',
      description: body.metadata?.description || '',
      tx_hash: body.txHash
    })
    
    // Get the created listing with its auto-generated ID
    const createdListing = await db.getListing(result.meta.last_row_id)
    
    // Return the created listing
    return c.json({
      id: createdListing.id,
      ...createdListing
    })
  } catch (error) {
    console.error('Error creating listing:', error)
    return c.json({ error: 'Failed to create listing' }, 500)
  }
})

// Cancel listing (protected route)
listings.delete('/:id', authMiddleware(), async (c) => {
  try {
    const db = new Database(c.env.DB)
    const user = c.get('user')
    const listingId = c.req.param('id')
    const txHash = c.req.query('txHash')
    
    // Get listing to verify ownership
    const listing = await db.getListing(listingId)
    if (!listing) {
      return c.json({ error: 'Listing not found' }, 404)
    }
    
    // txHash is required for onchain operations
    if (!txHash) {
      return c.json({ error: 'Transaction hash is required' }, 400)
    }
    
    // Check if user owns the listing (by FID)
    if (listing.seller_fid !== user.fid) {
      return c.json({ error: 'Unauthorized - You can only cancel your own listings' }, 403)
    }
    
    // Get canceller address from the transaction
    const { createRpcClient } = await import('../utils/rpc-client.js')
    const client = createRpcClient(c.env)
    const tx = await client.getTransaction({ hash: txHash })
    const cancellerAddress = tx.from
    
    // Cancel the listing
    await db.cancelListing(listing.blockchain_listing_id, cancellerAddress, txHash)
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Error cancelling listing:', error)
    return c.json({ error: 'Failed to cancel listing' }, 500)
  }
})

export default listings