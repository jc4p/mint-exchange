import { Hono } from 'hono'
import { EventIndexer } from '../indexer.js'
import { adminAuth } from '../middleware/auth.js'
import { Database } from '../db.js'
import { fetchNFTMetadata } from '../utils/metadata.js'
import { ShareImageQueue } from '../services/share-image-queue.js'

const admin = new Hono()

// Apply admin auth to all routes
admin.use('/*', adminAuth())

// Manual indexing endpoint
admin.post('/index-events', async (c) => {
  try {
    const { fromBlock, toBlock } = await c.req.json()
    const indexer = new EventIndexer(c.env)
    
    const result = await indexer.indexEvents(fromBlock, toBlock)
    
    return c.json({
      success: true,
      result
    })
  } catch (error) {
    console.error('Error indexing events:', error)
    return c.json({ error: 'Indexing failed' }, 500)
  }
})

// Get indexing status
admin.get('/index-status', async (c) => {
  try {
    const indexer = new EventIndexer(c.env)
    const lastBlock = await indexer.getLastIndexedBlock()
    const latestBlock = await indexer.blockchain.getLatestBlockNumber()
    
    return c.json({
      lastIndexedBlock: lastBlock,
      latestBlock: Number(latestBlock),
      behindBy: Number(latestBlock) - lastBlock
    })
  } catch (error) {
    console.error('Error getting index status:', error)
    return c.json({ error: 'Failed to get index status' }, 500)
  }
})

// Force reindex from a specific block
admin.post('/reindex', async (c) => {
  try {
    const { fromBlock } = await c.req.json()
    const indexer = new EventIndexer(c.env)
    
    // Update the last indexed block to force reindexing
    await indexer.updateLastIndexedBlock(fromBlock - 1)
    
    // Run the indexer
    const result = await indexer.indexEvents()
    
    return c.json({
      success: true,
      result
    })
  } catch (error) {
    console.error('Error reindexing:', error)
    return c.json({ error: 'Reindexing failed' }, 500)
  }
})

// Update missing metadata endpoint
admin.post('/update-missing-metadata', async (c) => {
  try {
    const body = await c.req.json()
    const { limit = 10, dryRun = false } = body
    
    const db = new Database(c.env.DB)
    
    // Get listings without image URLs
    const listings = await db.db
      .prepare(`
        SELECT id, nft_contract, token_id, name, description, image_url, metadata_uri
        FROM listings
        WHERE (image_url IS NULL OR image_url = '')
          AND sold_at IS NULL
          AND cancelled_at IS NULL
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .bind(limit)
      .all()
    
    const results = {
      total: listings.results.length,
      processed: 0,
      updated: 0,
      failed: 0,
      details: []
    }
    
    // Process each listing
    for (const listing of listings.results) {
      const detail = {
        id: listing.id,
        nft_contract: listing.nft_contract,
        token_id: listing.token_id,
        status: 'processing',
        updates: {}
      }
      
      try {
        // Fetch metadata using unified utility
        const metadata = await fetchNFTMetadata(
          c.env,
          listing.nft_contract,
          listing.token_id,
          listing.metadata_uri
        )
        
        if (!metadata.success) {
          detail.status = 'failed'
          detail.error = metadata.error
          results.failed++
          results.details.push(detail)
          continue
        }
        
        // Extract relevant fields
        const updates = {
          name: metadata.name,
          description: metadata.description,
          image_url: metadata.image_url,
          metadata_uri: metadata.metadata_uri
        }
        
        detail.updates = updates
        
        // Update in database if not dry run
        if (!dryRun && updates.image_url) {
          await db.db
            .prepare(`
              UPDATE listings 
              SET name = ?, description = ?, image_url = ?, metadata_uri = ?
              WHERE id = ?
            `)
            .bind(
              updates.name,
              updates.description,
              updates.image_url,
              updates.metadata_uri,
              listing.id
            )
            .run()
          
          detail.status = 'updated'
          results.updated++
        } else if (dryRun && updates.image_url) {
          detail.status = 'would_update'
          results.updated++
        } else {
          detail.status = 'no_image'
          detail.error = 'No image URL found in metadata'
          results.failed++
        }
        
      } catch (error) {
        detail.status = 'error'
        detail.error = error.message
        results.failed++
      }
      
      results.processed++
      results.details.push(detail)
      
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    return c.json(results)
    
  } catch (error) {
    console.error('Error updating metadata:', error)
    return c.json({ error: 'Failed to update metadata', details: error.message }, 500)
  }
})

// Sync listings with blockchain data
admin.post('/sync-listings', async (c) => {
  try {
    const body = await c.req.json()
    const { limit = 50, dryRun = false } = body
    
    const db = new Database(c.env.DB)
    const { createRpcClient, waitForAndGetTransaction } = await import('../utils/rpc-client.js')
    const { decodeEventLog, parseAbi } = await import('viem')
    const client = createRpcClient(c.env)
    
    // ABI for decoding ListingCreated events
    const NFT_EXCHANGE_EVENTS = parseAbi([
      'event ListingCreated(uint256 indexed listingId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 price, string metadataURI)'
    ])
    
    // Get ALL listings that have tx_hash (including those with blockchain_listing_id)
    const listings = await db.db
      .prepare(`
        SELECT id, tx_hash, blockchain_listing_id, nft_contract, token_id
        FROM listings
        WHERE tx_hash IS NOT NULL
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .bind(limit)
      .all()
    
    const results = {
      total: listings.results.length,
      processed: 0,
      updated: 0,
      failed: 0,
      conflicts_resolved: 0,
      details: []
    }
    
    // First pass: collect all mappings
    const mappings = new Map() // blockchain_listing_id -> listing record
    const updates = [] // Array of { id, blockchain_listing_id } to apply
    
    // Process each listing to find its correct blockchain_listing_id
    for (const listing of listings.results) {
      const detail = {
        id: listing.id,
        tx_hash: listing.tx_hash,
        current_blockchain_listing_id: listing.blockchain_listing_id,
        status: 'processing',
        blockchain_listing_id: null
      }
      
      try {
        // Fetch transaction and its receipt
        const [tx, receipt] = await Promise.all([
          waitForAndGetTransaction(client, listing.tx_hash),
          client.getTransactionReceipt({ hash: listing.tx_hash })
        ])
        
        // Find ListingCreated event in the logs
        let listingId = null
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
              if (decoded.args.nftContract.toLowerCase() === listing.nft_contract.toLowerCase() &&
                  decoded.args.tokenId.toString() === listing.token_id) {
                listingId = decoded.args.listingId.toString()
                break
              }
            }
          } catch (e) {
            // Skip non-matching events
          }
        }
        
        if (listingId) {
          detail.blockchain_listing_id = listingId
          
          // Check if this would be a change
          if (listing.blockchain_listing_id !== listingId) {
            updates.push({ id: listing.id, blockchain_listing_id: listingId })
            detail.status = 'pending_update'
          } else {
            detail.status = 'already_correct'
          }
          
          // Track which listing should have this blockchain_listing_id
          if (mappings.has(listingId)) {
            detail.conflict_with = mappings.get(listingId).id
          }
          mappings.set(listingId, listing)
        } else {
          detail.status = 'no_listing_id_found'
          detail.error = 'No ListingCreated event found in transaction'
          results.failed++
        }
        
      } catch (error) {
        detail.status = 'error'
        detail.error = error.message
        results.failed++
      }
      
      results.processed++
      results.details.push(detail)
      
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Second pass: apply updates if not dry run
    if (!dryRun && updates.length > 0) {
      // First, clear all blockchain_listing_ids that will be reassigned
      const idsToUpdate = updates.map(u => u.blockchain_listing_id)
      if (idsToUpdate.length > 0) {
        await db.db
          .prepare(`
            UPDATE listings 
            SET blockchain_listing_id = NULL
            WHERE blockchain_listing_id IN (${idsToUpdate.map(() => '?').join(',')})
          `)
          .bind(...idsToUpdate)
          .run()
      }
      
      // Then apply all updates
      for (const update of updates) {
        try {
          await db.db
            .prepare(`
              UPDATE listings 
              SET blockchain_listing_id = ?
              WHERE id = ?
            `)
            .bind(update.blockchain_listing_id, update.id)
            .run()
          
          const detail = results.details.find(d => d.id === update.id)
          if (detail) {
            detail.status = 'updated'
            results.updated++
          }
        } catch (error) {
          const detail = results.details.find(d => d.id === update.id)
          if (detail) {
            detail.status = 'update_failed'
            detail.error = error.message
          }
        }
      }
    } else if (dryRun) {
      // In dry run, mark what would be updated
      for (const update of updates) {
        const detail = results.details.find(d => d.id === update.id)
        if (detail) {
          detail.status = 'would_update'
          results.updated++
        }
      }
    }
    
    return c.json(results)
    
  } catch (error) {
    console.error('Error syncing listings:', error)
    return c.json({ error: 'Failed to sync listings', details: error.message }, 500)
  }
})

// Get admin stats
admin.get('/stats', async (c) => {
  try {
    const db = new Database(c.env.DB)
    
    // Get various stats
    const stats = await db.db
      .prepare(`
        SELECT 
          COUNT(*) as total_listings,
          COUNT(CASE WHEN sold_at IS NOT NULL THEN 1 END) as sold_listings,
          COUNT(CASE WHEN cancelled_at IS NOT NULL THEN 1 END) as cancelled_listings,
          COUNT(CASE WHEN sold_at IS NULL AND cancelled_at IS NULL AND expiry > datetime('now') THEN 1 END) as active_listings,
          COUNT(CASE WHEN image_url IS NULL OR image_url = '' THEN 1 END) as missing_images,
          COUNT(DISTINCT seller_fid) as unique_sellers,
          COUNT(DISTINCT nft_contract) as unique_collections
        FROM listings
      `)
      .first()
    
    // Get stats by contract type
    const contractTypeStats = await db.db
      .prepare(`
        SELECT 
          contract_type,
          COUNT(*) as total,
          COUNT(CASE WHEN sold_at IS NULL AND cancelled_at IS NULL THEN 1 END) as active,
          COUNT(CASE WHEN sold_at IS NULL AND cancelled_at IS NULL AND expiry <= datetime('now') THEN 1 END) as expired_active
        FROM listings
        WHERE blockchain_listing_id IS NOT NULL
        GROUP BY contract_type
      `)
      .all()
    
    // Get recent activity
    const recentActivity = await db.db
      .prepare(`
        SELECT type, COUNT(*) as count, MAX(created_at) as last_activity
        FROM activity
        WHERE created_at > datetime('now', '-7 days')
        GROUP BY type
        ORDER BY count DESC
      `)
      .all()
    
    return c.json({
      listings: stats,
      byContractType: contractTypeStats.results,
      recentActivity: recentActivity.results
    })
    
  } catch (error) {
    console.error('Error getting admin stats:', error)
    return c.json({ error: 'Failed to get stats' }, 500)
  }
})

// Generate share images for listings
admin.post('/generate-share-images', async (c) => {
  try {
    let body = {}
    try {
      body = await c.req.json()
    } catch (e) {
      // Default to empty object if no body provided
      body = {}
    }
    const { limit = 10, regenerate = false } = body
    
    const shareImageQueue = new ShareImageQueue(c.env)

    // Queue share image generation for listings that don't have them (backfill)
    const db = new Database(c.env.DB)
    const listings = await db.db
      .prepare(`
        SELECT id
        FROM listings
        WHERE share_image_url IS NULL
        AND cancelled_at IS NULL
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .bind(limit)
      .all()
    
    // Queue generation for each listing
    console.log(`About to queue ${listings.results.length} listings for share image generation`)
    for (const listing of listings.results) {
      console.log(`Queueing listing ${listing.id}`)
      await shareImageQueue.queueShareImageGeneration(listing.id)
    }
    
    console.log(`Finished queueing all ${listings.results.length} listings`)
    
    return c.json({
      success: true,
      queued: listings.results.length,
      message: `Queued ${listings.results.length} listings for share image generation (backfill)`
    })
  } catch (error) {
    console.error('Error generating share images:', error)
    return c.json({ error: 'Failed to generate share images', details: error.message }, 500)
  }
})

// Get share image generation stats
admin.get('/share-image-stats', async (c) => {
  try {
    const db = new Database(c.env.DB)
    
    const stats = await db.db
      .prepare(`
        SELECT 
          COUNT(*) as total_listings,
          COUNT(CASE WHEN share_image_url IS NOT NULL THEN 1 END) as with_share_images,
          COUNT(CASE WHEN share_image_url IS NULL AND cancelled_at IS NULL THEN 1 END) as pending_generation,
          COUNT(CASE WHEN share_image_url IS NULL AND cancelled_at IS NOT NULL THEN 1 END) as cancelled_without_image
        FROM listings
      `)
      .first()
    
    return c.json({
      ...stats,
      percentage_with_images: stats.total_listings > 0 
        ? Math.round((stats.with_share_images / stats.total_listings) * 100) 
        : 0
    })
  } catch (error) {
    console.error('Error getting share image stats:', error)
    return c.json({ error: 'Failed to get share image stats' }, 500)
  }
})

// Test queue endpoint
admin.post('/test-queue', async (c) => {
  try {    
    console.log('Testing queue with a single message')

    await c.env.SHARE_IMAGE_QUEUE.send({
      type: 'generate_share_image',
      listingId: 720,
      timestamp: Date.now()
    })
    
    return c.json({
      success: true,
      message: 'Test message sent to queue'
    })
  } catch (error) {
    console.error('Error testing queue:', error)
    return c.json({ error: 'Failed to test queue', details: error.message }, 500)
  }
})

// Fix Seaport order hashes
admin.post('/fix-seaport-order-hashes', async (c) => {
  try {
    const body = await c.req.json()
    const { limit = 100, dryRun = true } = body
    
    const db = new Database(c.env.DB)
    const { createRpcClient } = await import('../utils/rpc-client.js')
    const client = createRpcClient(c.env)
    
    // Get Seaport listings that might have incorrect order hashes
    const listings = await db.db
      .prepare(`
        SELECT id, order_parameters, order_hash, seller_address
        FROM listings
        WHERE contract_type = 'seaport'
        AND order_parameters IS NOT NULL
        AND cancelled_at IS NULL
        AND sold_at IS NULL
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .bind(limit)
      .all()
    
    const results = {
      total: listings.results.length,
      processed: 0,
      updated: 0,
      failed: 0,
      details: []
    }
    
    const SEAPORT_ADDRESS = c.env.SEAPORT_CONTRACT_ADDRESS || '0x0000000000000068F116a894984e2DB1123eB395'
    
    for (const listing of listings.results) {
      const detail = {
        id: listing.id,
        status: 'processing',
        oldHash: listing.order_hash,
        newHash: null
      }
      
      try {
        // Parse order parameters
        const orderData = JSON.parse(listing.order_parameters)
        const orderParameters = orderData.parameters || orderData
        
        // Calculate the correct order hash using Seaport contract
        const orderHash = await client.readContract({
          address: SEAPORT_ADDRESS,
          abi: [{
            name: 'getOrderHash',
            type: 'function',
            stateMutability: 'view',
            inputs: [{
              name: 'orderComponents',
              type: 'tuple',
              components: [
                { name: 'offerer', type: 'address' },
                { name: 'zone', type: 'address' },
                { name: 'offer', type: 'tuple[]', components: [
                  { name: 'itemType', type: 'uint8' },
                  { name: 'token', type: 'address' },
                  { name: 'identifierOrCriteria', type: 'uint256' },
                  { name: 'startAmount', type: 'uint256' },
                  { name: 'endAmount', type: 'uint256' }
                ]},
                { name: 'consideration', type: 'tuple[]', components: [
                  { name: 'itemType', type: 'uint8' },
                  { name: 'token', type: 'address' },
                  { name: 'identifierOrCriteria', type: 'uint256' },
                  { name: 'startAmount', type: 'uint256' },
                  { name: 'endAmount', type: 'uint256' },
                  { name: 'recipient', type: 'address' }
                ]},
                { name: 'orderType', type: 'uint8' },
                { name: 'startTime', type: 'uint256' },
                { name: 'endTime', type: 'uint256' },
                { name: 'zoneHash', type: 'bytes32' },
                { name: 'salt', type: 'uint256' },
                { name: 'conduitKey', type: 'bytes32' },
                { name: 'counter', type: 'uint256' }
              ]
            }],
            outputs: [{ name: 'orderHash', type: 'bytes32' }]
          }],
          functionName: 'getOrderHash',
          args: [orderParameters]
        })
        
        detail.newHash = orderHash
        
        // Check if hash needs updating
        if (listing.order_hash !== orderHash) {
          detail.status = dryRun ? 'would_update' : 'pending_update'
          detail.needsUpdate = true
          
          // Update in database if not dry run
          if (!dryRun) {
            await db.db
              .prepare(`
                UPDATE listings 
                SET order_hash = ?
                WHERE id = ?
              `)
              .bind(orderHash, listing.id)
              .run()
            
            detail.status = 'updated'
            results.updated++
          } else {
            results.updated++
          }
        } else {
          detail.status = 'already_correct'
          detail.needsUpdate = false
        }
        
      } catch (error) {
        detail.status = 'error'
        detail.error = error.message
        results.failed++
      }
      
      results.processed++
      results.details.push(detail)
    }
    
    return c.json(results)
    
  } catch (error) {
    console.error('Error fixing Seaport order hashes:', error)
    return c.json({ error: 'Failed to fix order hashes', details: error.message }, 500)
  }
})

// Verify Seaport order signature
admin.post('/verify-seaport-signature/:id', async (c) => {
  try {
    const listingId = c.req.param('id')
    const db = new Database(c.env.DB)
    const { createRpcClient } = await import('../utils/rpc-client.js')
    const { verifyTypedData, recoverTypedDataAddress, getAddress } = await import('viem')
    const client = createRpcClient(c.env)
    
    // Get the listing
    const listing = await db.db
      .prepare(`
        SELECT * FROM listings
        WHERE id = ? AND contract_type = 'seaport'
      `)
      .bind(listingId)
      .first()
    
    if (!listing) {
      return c.json({ error: 'Seaport listing not found' }, 404)
    }
    
    // Parse order data
    const orderData = JSON.parse(listing.order_parameters)
    const orderParameters = orderData.parameters || orderData
    const signature = orderData.signature
    
    const SEAPORT_ADDRESS = c.env.SEAPORT_CONTRACT_ADDRESS || '0x0000000000000068F116a894984e2DB1123eB395'
    
    // Prepare EIP-712 domain
    const domain = {
      name: "Seaport",
      version: "1.6",
      chainId: 8453, // Base mainnet
      verifyingContract: getAddress(SEAPORT_ADDRESS)
    }
    
    // EIP-712 types
    const types = {
      OrderComponents: [
        { name: 'offerer', type: 'address' },
        { name: 'zone', type: 'address' },
        { name: 'offer', type: 'OfferItem[]' },
        { name: 'consideration', type: 'ConsiderationItem[]' },
        { name: 'orderType', type: 'uint8' },
        { name: 'startTime', type: 'uint256' },
        { name: 'endTime', type: 'uint256' },
        { name: 'zoneHash', type: 'bytes32' },
        { name: 'salt', type: 'uint256' },
        { name: 'conduitKey', type: 'bytes32' },
        { name: 'counter', type: 'uint256' }
      ],
      OfferItem: [
        { name: 'itemType', type: 'uint8' },
        { name: 'token', type: 'address' },
        { name: 'identifierOrCriteria', type: 'uint256' },
        { name: 'startAmount', type: 'uint256' },
        { name: 'endAmount', type: 'uint256' }
      ],
      ConsiderationItem: [
        { name: 'itemType', type: 'uint8' },
        { name: 'token', type: 'address' },
        { name: 'identifierOrCriteria', type: 'uint256' },
        { name: 'startAmount', type: 'uint256' },
        { name: 'endAmount', type: 'uint256' },
        { name: 'recipient', type: 'address' }
      ]
    }
    
    // Get the order status from Seaport
    let orderStatus = null
    try {
      orderStatus = await client.readContract({
        address: SEAPORT_ADDRESS,
        abi: [{
          name: 'getOrderStatus',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'orderHash', type: 'bytes32' }],
          outputs: [
            { name: 'isValidated', type: 'bool' },
            { name: 'isCancelled', type: 'bool' },
            { name: 'totalFilled', type: 'uint256' },
            { name: 'totalSize', type: 'uint256' }
          ]
        }],
        functionName: 'getOrderStatus',
        args: [listing.order_hash]
      })
    } catch (e) {
      // Ignore
    }
    
    // Verify the signature
    let signatureValid = false
    let recoveredAddress = null
    let verificationError = null
    
    try {
      signatureValid = await verifyTypedData({
        address: getAddress(orderParameters.offerer),
        domain,
        types,
        primaryType: 'OrderComponents',
        message: orderParameters,
        signature: signature
      })
      
      // Also try to recover the address
      recoveredAddress = await recoverTypedDataAddress({
        domain,
        types,
        primaryType: 'OrderComponents',
        message: orderParameters,
        signature: signature
      })
    } catch (error) {
      verificationError = error.message
    }
    
    // Get current counter for the offerer
    let currentCounter = null
    try {
      currentCounter = await client.readContract({
        address: SEAPORT_ADDRESS,
        abi: [{
          name: 'getCounter',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'offerer', type: 'address' }],
          outputs: [{ name: 'counter', type: 'uint256' }]
        }],
        functionName: 'getCounter',
        args: [orderParameters.offerer]
      })
    } catch (e) {
      // Ignore
    }
    
    return c.json({
      listingId: listing.id,
      orderHash: listing.order_hash,
      offerer: orderParameters.offerer,
      orderCounter: orderParameters.counter,
      currentOffererCounter: currentCounter?.toString(),
      signature: signature,
      signatureValid,
      recoveredAddress,
      verificationError,
      orderStatus: orderStatus ? {
        isValidated: orderStatus[0],
        isCancelled: orderStatus[1],
        totalFilled: orderStatus[2].toString(),
        totalSize: orderStatus[3].toString()
      } : null,
      orderParameters: orderParameters
    })
    
  } catch (error) {
    console.error('Error verifying signature:', error)
    return c.json({ error: 'Failed to verify signature', details: error.message }, 500)
  }
})

// Debug Seaport order fulfillment
admin.post('/debug-seaport-fulfillment/:id', async (c) => {
  try {
    const listingId = c.req.param('id')
    const db = new Database(c.env.DB)
    const { createRpcClient } = await import('../utils/rpc-client.js')
    const client = createRpcClient(c.env)
    
    // Get the listing
    const listing = await db.db
      .prepare(`
        SELECT * FROM listings
        WHERE id = ? AND contract_type = 'seaport'
      `)
      .bind(listingId)
      .first()
    
    if (!listing) {
      return c.json({ error: 'Seaport listing not found' }, 404)
    }
    
    // Parse order data
    const orderData = JSON.parse(listing.order_parameters)
    const orderParameters = orderData.parameters || orderData
    const signature = orderData.signature
    
    const SEAPORT_ADDRESS = c.env.SEAPORT_CONTRACT_ADDRESS || '0x0000000000000068F116a894984e2DB1123eB395'
    
    // Check various conditions that could cause InvalidSigner
    const checks = {
      hasSignature: !!signature,
      signatureLength: signature ? signature.length : 0,
      offererMatches: orderParameters.offerer === listing.seller_address,
      considerationValid: true,
      approvals: {}
    }
    
    // Check if buyer would be paying themselves
    const buyer = c.req.query('buyer')
    if (buyer) {
      const buyerLower = buyer.toLowerCase()
      const hasRecipientConflict = orderParameters.consideration.some(
        item => item.recipient && item.recipient.toLowerCase() === buyerLower
      )
      checks.buyerIsRecipient = hasRecipientConflict
      
      // Check USDC approval for buyer
      try {
        const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
        const conduitAddress = '0xf9ed144bACaed98d0f3899B8B56c965D1A966D08' // Base chain default conduit
        
        const allowance = await client.readContract({
          address: usdcAddress,
          abi: [{
            name: 'allowance',
            type: 'function',
            stateMutability: 'view',
            inputs: [
              { name: 'owner', type: 'address' },
              { name: 'spender', type: 'address' }
            ],
            outputs: [{ name: '', type: 'uint256' }]
          }],
          functionName: 'allowance',
          args: [buyer, conduitAddress]
        })
        
        const totalConsiderationAmount = orderParameters.consideration
          .filter(item => item.token.toLowerCase() === usdcAddress.toLowerCase())
          .reduce((sum, item) => sum + BigInt(item.startAmount || item.amount || 0), 0n)
        
        checks.approvals.usdcAllowance = allowance.toString()
        checks.approvals.usdcRequired = totalConsiderationAmount.toString()
        checks.approvals.usdcSufficient = allowance >= totalConsiderationAmount
      } catch (e) {
        checks.approvals.usdcError = e.message
      }
    }
    
    // Check NFT approval from seller
    try {
      const nftContract = orderParameters.offer[0].token
      const conduitAddress = '0xf9ed144bACaed98d0f3899B8B56c965D1A966D08' // Base chain default conduit
      
      // Check if it's ERC721 or ERC1155 based on itemType
      const isERC721 = orderParameters.offer[0].itemType === 2
      
      if (isERC721) {
        // Check both getApproved and isApprovedForAll for ERC721
        let isApproved = false
        
        // First check isApprovedForAll (most common for marketplaces)
        try {
          const approvedForAll = await client.readContract({
            address: nftContract,
            abi: [{
              name: 'isApprovedForAll',
              type: 'function',
              stateMutability: 'view',
              inputs: [
                { name: 'owner', type: 'address' },
                { name: 'operator', type: 'address' }
              ],
              outputs: [{ name: '', type: 'bool' }]
            }],
            functionName: 'isApprovedForAll',
            args: [orderParameters.offerer, conduitAddress]
          })
          isApproved = approvedForAll
        } catch (e) {
          // Ignore error, try getApproved next
        }
        
        // If not approved for all, check specific token approval
        if (!isApproved) {
          try {
            const approved = await client.readContract({
              address: nftContract,
              abi: [{
                name: 'getApproved',
                type: 'function',
                stateMutability: 'view',
                inputs: [{ name: 'tokenId', type: 'uint256' }],
                outputs: [{ name: '', type: 'address' }]
              }],
              functionName: 'getApproved',
              args: [BigInt(orderParameters.offer[0].identifierOrCriteria)]
            })
            isApproved = approved.toLowerCase() === conduitAddress.toLowerCase()
          } catch (e) {
            // Token might not exist or other error
          }
        }
        
        checks.approvals.nftApproved = isApproved
      } else {
        const isApproved = await client.readContract({
          address: nftContract,
          abi: [{
            name: 'isApprovedForAll',
            type: 'function',
            stateMutability: 'view',
            inputs: [
              { name: 'owner', type: 'address' },
              { name: 'operator', type: 'address' }
            ],
            outputs: [{ name: '', type: 'bool' }]
          }],
          functionName: 'isApprovedForAll',
          args: [orderParameters.offerer, conduitAddress]
        })
        checks.approvals.nftApprovedForAll = isApproved
      }
    } catch (e) {
      checks.approvals.nftError = e.message
    }
    
    // Check order timing
    const now = Math.floor(Date.now() / 1000)
    checks.timing = {
      startTime: parseInt(orderParameters.startTime),
      endTime: parseInt(orderParameters.endTime),
      currentTime: now,
      isActive: now >= parseInt(orderParameters.startTime) && now <= parseInt(orderParameters.endTime)
    }
    
    return c.json({
      listingId: listing.id,
      orderHash: listing.order_hash,
      checks,
      orderParameters,
      signature,
      recommendations: [
        checks.buyerIsRecipient ? "Buyer is a recipient in consideration - this will cause InvalidSigner error" : null,
        !checks.timing.isActive ? "Order is not active (check start/end times)" : null,
        !checks.approvals.usdcSufficient ? "Buyer needs to approve more USDC" : null,
        !checks.approvals.nftApproved && !checks.approvals.nftApprovedForAll ? "Seller's NFT is not approved to Seaport conduit" : null
      ].filter(Boolean)
    })
    
  } catch (error) {
    console.error('Error debugging fulfillment:', error)
    return c.json({ error: 'Failed to debug fulfillment', details: error.message }, 500)
  }
})

// Check NFTExchange listings status manually
admin.post('/check-nftexchange-listings', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const { limit = 100, autoCancel = false } = body
    
    const db = new Database(c.env.DB)
    const { createRpcClient } = await import('../utils/rpc-client.js')
    const { parseAbi } = await import('viem')
    const client = createRpcClient(c.env)
    
    // Get active NFTExchange listings
    const listings = await db.db
      .prepare(`
        SELECT id, blockchain_listing_id, seller_address, nft_contract, token_id, 
               price, expiry, created_at, tx_hash
        FROM listings
        WHERE contract_type = 'nft_exchange'
        AND blockchain_listing_id IS NOT NULL
        AND cancelled_at IS NULL
        AND sold_at IS NULL
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .bind(limit)
      .all()
    
    const NFT_EXCHANGE_ADDRESS = c.env.CONTRACT_ADDRESS || '0x06fB7424Ba65D587405b9C754Bc40dA9398B72F0'
    const NFT_EXCHANGE_ABI = parseAbi([
      'function listings(uint256) view returns (address seller, address nftContract, uint256 tokenId, uint256 price, uint256 expiresAt, bool isERC721, bool sold, bool cancelled)'
    ])
    
    const results = {
      total: listings.results.length,
      expired: 0,
      sold: 0,
      cancelled: 0,
      notFound: 0,
      valid: 0,
      autoCancelled: 0,
      details: []
    }
    
    const now = Math.floor(Date.now() / 1000)
    
    for (const listing of listings.results) {
      const detail = {
        id: listing.id,
        blockchainListingId: listing.blockchain_listing_id,
        status: 'checking',
        onChainData: null,
        issues: []
      }
      
      try {
        // Get on-chain listing data
        const onChainListing = await client.readContract({
          address: NFT_EXCHANGE_ADDRESS,
          abi: NFT_EXCHANGE_ABI,
          functionName: 'listings',
          args: [BigInt(listing.blockchain_listing_id)]
        })
        
        detail.onChainData = {
          seller: onChainListing[0],
          nftContract: onChainListing[1],
          tokenId: onChainListing[2].toString(),
          price: onChainListing[3].toString(),
          expiresAt: Number(onChainListing[4]),
          isERC721: onChainListing[5],
          sold: onChainListing[6],
          cancelled: onChainListing[7]
        }
        
        // Check for issues
        if (detail.onChainData.seller === '0x0000000000000000000000000000000000000000') {
          detail.status = 'not_found'
          detail.issues.push('Listing not found on-chain')
          results.notFound++
        } else if (detail.onChainData.sold) {
          detail.status = 'sold'
          detail.issues.push('Listing already sold on-chain but not marked in DB')
          results.sold++
          
          // Auto-mark as sold if requested
          if (autoCancel) {
            await db.db
              .prepare(`
                UPDATE listings 
                SET sold_at = datetime('now'), 
                    buyer_address = '0x0000000000000000000000000000000000000000',
                    sale_tx_hash = 'auto_marked_sold'
                WHERE id = ?
              `)
              .bind(listing.id)
              .run()
            detail.autoMarked = true
          }
        } else if (detail.onChainData.cancelled) {
          detail.status = 'cancelled'
          detail.issues.push('Listing already cancelled on-chain but not marked in DB')
          results.cancelled++
          
          // Auto-mark as cancelled if requested
          if (autoCancel) {
            await db.db
              .prepare(`
                UPDATE listings 
                SET cancelled_at = datetime('now'), 
                    cancel_tx_hash = 'auto_marked_cancelled'
                WHERE id = ?
              `)
              .bind(listing.id)
              .run()
            detail.autoMarked = true
          }
        } else if (detail.onChainData.expiresAt < now) {
          detail.status = 'expired'
          detail.issues.push(`Listing expired ${now - detail.onChainData.expiresAt} seconds ago`)
          results.expired++
          
          // Auto-cancel expired listings if requested
          if (autoCancel) {
            await db.db
              .prepare(`
                UPDATE listings 
                SET cancelled_at = datetime('now'), 
                    cancel_tx_hash = 'auto_cancelled_expired'
                WHERE id = ?
              `)
              .bind(listing.id)
              .run()
            
            detail.autoCancelled = true
            results.autoCancelled++
          }
        } else {
          detail.status = 'valid'
          results.valid++
        }
        
        // Check for data mismatches
        if (detail.onChainData.seller && detail.onChainData.seller.toLowerCase() !== listing.seller_address.toLowerCase()) {
          detail.issues.push('Seller address mismatch')
        }
        if (detail.onChainData.nftContract && detail.onChainData.nftContract.toLowerCase() !== listing.nft_contract.toLowerCase()) {
          detail.issues.push('NFT contract mismatch')
        }
        if (detail.onChainData.tokenId !== listing.token_id) {
          detail.issues.push('Token ID mismatch')
        }
        
      } catch (error) {
        detail.status = 'error'
        detail.error = error.message
        detail.issues.push(`Read error: ${error.message}`)
      }
      
      results.details.push(detail)
    }
    
    return c.json(results)
    
  } catch (error) {
    console.error('Error checking NFTExchange listings:', error)
    return c.json({ error: 'Failed to check listings', details: error.message }, 500)
  }
})

// Force run the cleanup task manually
admin.post('/cleanup-nftexchange-listings', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const { limit = 200 } = body // Default to 200 for manual runs
    
    const { EventIndexer } = await import('../indexer.js')
    const indexer = new EventIndexer(c.env)
    const result = await indexer.cleanupExpiredNFTExchangeListings(limit)
    
    return c.json({
      success: true,
      cleanup: result
    })
  } catch (error) {
    console.error('Error running cleanup:', error)
    return c.json({ error: 'Failed to run cleanup', details: error.message }, 500)
  }
})

export default admin