import { Hono } from 'hono'
import { Database } from '../db.js'
import { authMiddleware } from '../middleware/auth.js'

const activity = new Hono()

// Get current user's activity (protected - uses JWT)
activity.get('/me', authMiddleware(), async (c) => {
  try {
    const db = new Database(c.env.DB)
    const user = c.get('user')
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '20')
    const type = c.req.query('type')
    
    const filter = {
      actor_fid: user.fid
    }
    if (type) filter.type = type
    
    const result = await db.getActivity({ page, limit, filter })
    
    return c.json(result)
  } catch (error) {
    console.error('Error fetching user activity:', error)
    return c.json({ error: 'Failed to fetch your activity' }, 500)
  }
})

// Get activity feed
activity.get('/', authMiddleware({ required: false }), async (c) => {
  try {
    const db = new Database(c.env.DB)
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '20')
    const type = c.req.query('type')
    const actorFid = c.req.query('actor_fid') ? parseInt(c.req.query('actor_fid')) : null
    const user = c.get('user')
    
    const filter = {}
    if (type) filter.type = type
    if (actorFid) filter.actor_fid = actorFid
    
    // If user is authenticated and requests "my" activity
    if (c.req.query('my') === 'true' && user) {
      filter.actor_fid = user.fid
    }
    
    const result = await db.getActivity({ page, limit, filter })
    
    return c.json(result)
  } catch (error) {
    console.error('Error fetching activity:', error)
    return c.json({ error: 'Failed to fetch activity' }, 500)
  }
})

// Get activity for a specific NFT
activity.get('/nft/:contract/:tokenId', async (c) => {
  try {
    const db = new Database(c.env.DB)
    const contract = c.req.param('contract')
    const tokenId = c.req.param('tokenId')
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '20')
    
    const filter = {
      nft_contract: contract,
      token_id: tokenId
    }
    
    const result = await db.getActivity({ page, limit, filter })
    
    return c.json(result)
  } catch (error) {
    console.error('Error fetching NFT activity:', error)
    return c.json({ error: 'Failed to fetch NFT activity' }, 500)
  }
})

export default activity