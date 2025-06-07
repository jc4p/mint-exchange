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
    
    if (regenerate) {
      // Regenerate share images for listings that already have them
      const db = new Database(c.env.DB)
      const listings = await db.db
        .prepare(`
          SELECT id, share_image_url
          FROM listings
          WHERE share_image_url IS NOT NULL
          AND cancelled_at IS NULL
          ORDER BY created_at DESC
          LIMIT ?
        `)
        .bind(limit)
        .all()
      
      const results = []
      
      // Clear existing share images and regenerate
      for (const listing of listings.results) {
        try {
          // Clear from KV cache
          const cacheKey = `share-image:${listing.id}`
          await c.env.MINT_EXCHANGE_BROWSER_KV.delete(cacheKey)
          
          // Clear from database to force regeneration
          await db.db
            .prepare('UPDATE listings SET share_image_url = NULL WHERE id = ?')
            .bind(listing.id)
            .run()
          
          // Regenerate the image
          await shareImageQueue.generateShareImage(listing.id)
          
          results.push({
            id: listing.id,
            status: 'regenerated',
            oldUrl: listing.share_image_url
          })
        } catch (error) {
          results.push({
            id: listing.id,
            status: 'error',
            error: error.message
          })
        }
      }
      
      return c.json({
        success: true,
        regenerated: results.filter(r => r.status === 'regenerated').length,
        failed: results.filter(r => r.status === 'error').length,
        results
      })
    } else {
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
        shareImageQueue.queueShareImageGeneration(listing.id)
      }
      console.log(`Finished queueing all ${listings.results.length} listings`)
      
      return c.json({
        success: true,
        queued: listings.results.length,
        message: `Queued ${listings.results.length} listings for share image generation (backfill)`
      })
    }
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
    const shareImageQueue = new ShareImageQueue(c.env)
    
    console.log('Testing queue with a single message')
    
    // Send a test message
    await shareImageQueue.queueShareImageGeneration(1) // Use a fake listing ID
    
    return c.json({
      success: true,
      message: 'Test message sent to queue'
    })
  } catch (error) {
    console.error('Error testing queue:', error)
    return c.json({ error: 'Failed to test queue', details: error.message }, 500)
  }
})

export default admin