import { Hono } from 'hono'
import { Database } from '../db.js'
import { authMiddleware } from '../middleware/auth.js'
import { fetchNFTMetadata } from '../utils/metadata.js'

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
      blockchainListingId: listing.blockchain_listing_id,
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
      blockchainListingId: listing.blockchain_listing_id,
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
      blockchainListingId: listing.blockchain_listing_id,
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
    
    // Get seller address from the transaction and blockchain listing ID from event logs
    const { createRpcClient, waitForAndGetTransaction, waitForAndGetTransactionReceipt } = await import('../utils/rpc-client.js')
    const { parseAbi, decodeEventLog } = await import('viem')
    const client = createRpcClient(c.env)
    
    // Get both transaction and receipt
    const [tx, receipt] = await Promise.all([
      waitForAndGetTransaction(client, body.txHash),
      waitForAndGetTransactionReceipt(client, body.txHash)
    ])
    
    const sellerAddress = tx.from
    
    // Define the ListingCreated event ABI
    const NFT_EXCHANGE_EVENTS = parseAbi([
      'event ListingCreated(uint256 indexed listingId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 price, string metadataURI)'
    ])
    
    // Extract blockchain listing ID from event logs
    let blockchainListingId = null
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: NFT_EXCHANGE_EVENTS,
          data: log.data,
          topics: log.topics,
          strict: false
        })
        
        if (decoded.eventName === 'ListingCreated') {
          // Verify this is for the correct NFT
          if (decoded.args.nftContract.toLowerCase() === body.nftContract.toLowerCase() &&
              decoded.args.tokenId.toString() === body.tokenId.toString()) {
            blockchainListingId = decoded.args.listingId.toString()
            break
          }
        }
      } catch (e) {
        // Skip non-matching events
      }
    }
    
    if (!blockchainListingId) {
      return c.json({ error: 'Could not find ListingCreated event in transaction logs' }, 400)
    }
    
    // Fetch metadata if not provided or incomplete
    let metadata = body.metadata || {}
    if (!metadata.image_url || !metadata.name) {
      console.log('Fetching metadata for listing...')
      const fetchedMetadata = await fetchNFTMetadata(
        c.env,
        body.nftContract,
        body.tokenId,
        metadata.metadata_uri
      )
      
      if (fetchedMetadata.success) {
        metadata = {
          metadata_uri: fetchedMetadata.metadata_uri,
          image_url: fetchedMetadata.image_url,
          name: fetchedMetadata.name,
          description: fetchedMetadata.description,
          ...metadata // Keep any existing metadata that was passed
        }
      }
    }
    
    // Create listing in database using the blockchain listing ID from event logs
    const result = await db.createListing({
      blockchain_listing_id: blockchainListingId,
      seller_fid: user.fid,
      seller_address: sellerAddress,
      nft_contract: body.nftContract,
      token_id: body.tokenId,
      price: body.price,
      expiry: body.expiry,
      metadata_uri: metadata.metadata_uri || '',
      image_url: metadata.image_url || '',
      name: metadata.name || `Token #${body.tokenId}`,
      description: metadata.description || '',
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
    const { createRpcClient, waitForAndGetTransaction } = await import('../utils/rpc-client.js')
    const client = createRpcClient(c.env)
    const tx = await waitForAndGetTransaction(client, txHash)
    const cancellerAddress = tx.from
    
    // Cancel the listing
    await db.cancelListing(listing.blockchain_listing_id, cancellerAddress, txHash)
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Error cancelling listing:', error)
    return c.json({ error: 'Failed to cancel listing' }, 500)
  }
})

// Record purchase (protected route)
listings.post('/:id/purchase', authMiddleware(), async (c) => {
  try {
    const db = new Database(c.env.DB)
    const user = c.get('user')
    const listingId = c.req.param('id')
    const body = await c.req.json()
    
    // txHash is required
    if (!body.txHash) {
      return c.json({ error: 'Transaction hash is required' }, 400)
    }
    
    // Get listing to verify it exists
    const listing = await db.getListing(listingId)
    if (!listing) {
      return c.json({ error: 'Listing not found' }, 404)
    }
    
    // Import necessary utilities
    const { createRpcClient, waitForAndGetTransactionReceipt } = await import('../utils/rpc-client.js')
    const { parseAbi, decodeEventLog } = await import('viem')
    const client = createRpcClient(c.env)
    
    // Wait for transaction receipt
    console.log('Waiting for purchase transaction:', body.txHash)
    const receipt = await waitForAndGetTransactionReceipt(client, body.txHash)
    
    if (receipt.status !== 'success') {
      return c.json({ error: 'Transaction failed' }, 400)
    }
    
    // Define the ListingSold event ABI
    const NFT_EXCHANGE_EVENTS = parseAbi([
      'event ListingSold(uint256 indexed listingId, address indexed buyer, uint256 price)'
    ])
    
    // Find and validate the ListingSold event
    let purchaseEvent = null
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: NFT_EXCHANGE_EVENTS,
          data: log.data,
          topics: log.topics,
          strict: false
        })
        
        if (decoded.eventName === 'ListingSold') {
          // Verify this is for the correct listing
          if (decoded.args.listingId.toString() === listing.blockchain_listing_id) {
            purchaseEvent = decoded.args
            break
          }
        }
      } catch (e) {
        // Skip non-matching events
      }
    }
    
    if (!purchaseEvent) {
      return c.json({ error: 'ListingSold event not found or listing ID mismatch' }, 400)
    }
    
    // Extract buyer address from event
    const buyerAddress = purchaseEvent.buyer
    
    // Verify the authenticated user is the buyer
    if (user.wallet_address && buyerAddress.toLowerCase() !== user.wallet_address.toLowerCase()) {
      return c.json({ error: 'Transaction buyer does not match authenticated user' }, 403)
    }
    
    // Process the purchase immediately
    console.log('Processing purchase for listing:', listing.blockchain_listing_id)
    
    // Resolve buyer FID if not already known
    let buyerFid = user.fid
    
    // Mark listing as sold in database
    await db.markListingSold(
      listing.blockchain_listing_id, 
      buyerAddress, 
      buyerFid, 
      body.txHash
    )
    
    // Record activity
    await db.recordActivity({
      type: 'nft_bought',
      actor_fid: buyerFid,
      actor_address: buyerAddress,
      nft_contract: listing.nft_contract,
      token_id: listing.token_id,
      price: listing.price,
      metadata: JSON.stringify({ 
        listing_id: listing.blockchain_listing_id,
        seller_fid: listing.seller_fid 
      }),
      tx_hash: body.txHash
    })
    
    return c.json({ 
      success: true,
      message: 'Purchase recorded successfully'
    })
    
  } catch (error) {
    console.error('Error recording purchase:', error)
    return c.json({ error: 'Failed to record purchase' }, 500)
  }
})

export default listings