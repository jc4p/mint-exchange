import { Hono } from 'hono'
import { EventIndexer } from '../indexer.js'
import { adminAuth } from '../middleware/auth.js'
import { Database } from '../db.js'
import { fetchNFTMetadata } from '../utils/metadata.js'

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

export default admin