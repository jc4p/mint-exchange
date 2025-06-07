import { Hono } from 'hono'
import { Database } from '../db.js'
import { authMiddleware } from '../middleware/auth.js'
import { fetchWalletNFTs } from '../utils/nft-fetcher.js'

const users = new Hono()

// Get current user's NFTs (protected - uses JWT)
users.get('/me/nfts', authMiddleware(), async (c) => {
  try {
    // Get wallet address from header
    const walletAddress = c.req.header('X-Wallet-Address')
    
    if (!walletAddress) {
      return c.json({ error: 'No wallet address provided. Please ensure your Farcaster client has wallet access.' }, 400)
    }
        
    // Use the utility function to fetch NFTs
    const result = await fetchWalletNFTs(walletAddress, c.env.ALCHEMY_API_KEY)
    return c.json(result)
  } catch (error) {
    console.error('Error fetching user NFTs:', error)
    return c.json({ error: 'Failed to fetch NFTs' }, 500)
  }
})

// Get any user's public NFTs by FID
users.get('/:fid/nfts', async (c) => {
  try {
    const db = new Database(c.env.DB)
    const fid = parseInt(c.req.param('fid'))
    
    if (isNaN(fid)) {
      return c.json({ error: 'Invalid FID' }, 400)
    }
    
    // Get NFTs purchased through our marketplace
    const result = await db.getUserNFTs(fid)
    return c.json(result)
  } catch (error) {
    console.error('Error fetching user NFTs:', error)
    return c.json({ error: 'Failed to fetch NFTs' }, 500)
  }
})

// Get user's wallet NFTs from Alchemy (requires address)
users.get('/wallet/:address/nfts', async (c) => {
  try {
    const address = c.req.param('address')

    // Use the utility function to fetch NFTs
    const result = await fetchWalletNFTs(address, c.env.ALCHEMY_API_KEY)
    return c.json(result)
  } catch (error) {
    console.error('Error fetching NFTs:', error)
    return c.json({ error: 'Failed to fetch NFTs' }, 500)
  }
})

// Get current user's stats (protected - uses JWT)
users.get('/me/stats', authMiddleware(), async (c) => {
  try {
    const db = new Database(c.env.DB)
    const user = c.get('user')
    
    const stats = await db.getUserStats(user.fid)
    return c.json(stats)
  } catch (error) {
    console.error('Error fetching user stats:', error)
    return c.json({ error: 'Failed to fetch user stats' }, 500)
  }
})

// Get any user's public stats by FID
users.get('/:fid/stats', async (c) => {
  try {
    const db = new Database(c.env.DB)
    const fid = parseInt(c.req.param('fid'))
    
    if (isNaN(fid)) {
      return c.json({ error: 'Invalid FID' }, 400)
    }
    
    const stats = await db.getUserStats(fid)
    return c.json(stats)
  } catch (error) {
    console.error('Error fetching user stats:', error)
    return c.json({ error: 'Failed to fetch user stats' }, 500)
  }
})

// Get current user profile (protected)
users.get('/me', authMiddleware(), async (c) => {
  const user = c.get('user')
  return c.json({
    fid: user.fid,
    address: user.address,
    username: user.username,
    displayName: user.display_name,  // Changed to camelCase
    pfpUrl: user.pfp_url            // Changed to camelCase
  })
})

// Update user profile (protected)
users.put('/me', authMiddleware(), async (c) => {
  try {
    const db = new Database(c.env.DB)
    const user = c.get('user')
    const body = await c.req.json()
    
    // Update user profile
    await db.createOrUpdateUser({
      fid: user.fid,
      username: body.username || user.username,
      display_name: body.display_name || user.display_name,
      pfp_url: body.pfp_url || user.pfp_url
    })
    
    // Return updated profile
    const updatedUser = await db.getUser(user.fid)
    return c.json(updatedUser)
  } catch (error) {
    console.error('Error updating user profile:', error)
    return c.json({ error: 'Failed to update profile' }, 500)
  }
})

export default users