import { Hono } from 'hono'
import { EventIndexer } from '../indexer.js'
import { adminAuth } from '../middleware/auth.js'

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

export default admin