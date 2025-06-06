import { Hono } from 'hono'
import { createClient } from '@farcaster/quick-auth'
import { Database } from '../db.js'
import { NeynarService } from '../neynar.js'

const auth = new Hono()
const authClient = createClient()

// Verify a JWT token (for client-side validation)
auth.post('/verify', async (c) => {
  try {
    const { token } = await c.req.json()
    
    if (!token) {
      return c.json({ error: 'Token required' }, 400)
    }
    
    // Get domain from environment or request
    const domain = c.env.DOMAIN || new URL(c.req.url).hostname
    
    // Verify JWT
    const payload = await authClient.verifyJwt({ token, domain })
    
    // Get or create user in database
    const db = new Database(c.env.DB)
    let user = await db.getUser(payload.sub)
    
    // If user doesn't exist, fetch from Neynar and create profile
    if (!user) {
      let userData = {
        fid: payload.sub,
        username: null,
        display_name: null,
        pfp_url: null
      }

      // Try to fetch user data from Neynar
      if (c.env.NEYNAR_API_KEY) {
        const neynar = new NeynarService(c.env.NEYNAR_API_KEY)
        const neynarUser = await neynar.fetchUserByFid(payload.sub)
        
        if (neynarUser) {
          userData = {
            fid: payload.sub,
            username: neynarUser.username,
            display_name: neynarUser.display_name,
            pfp_url: neynarUser.pfp_url
          }
        }
      }

      await db.createOrUpdateUser(userData)
      user = await db.getUser(payload.sub)
    }
    
    return c.json({
      valid: true,
      user: {
        fid: payload.sub,
        username: user?.username,
        displayName: user?.display_name,  // Transform to camelCase
        pfpUrl: user?.pfp_url            // Transform to camelCase
      }
    })
  } catch (error) {
    console.error('Token verification error:', error)
    return c.json({
      valid: false,
      error: 'Invalid or expired token'
    })
  }
})

// Refresh user data from Farcaster
auth.post('/refresh-profile', async (c) => {
  try {
    const { fid } = await c.req.json()
    
    if (!fid) {
      return c.json({ error: 'FID required' }, 400)
    }
    
    const db = new Database(c.env.DB)
    
    // Fetch fresh data from Neynar
    if (c.env.NEYNAR_API_KEY) {
      const neynar = new NeynarService(c.env.NEYNAR_API_KEY)
      const neynarUser = await neynar.fetchUserByFid(fid)
      
      if (neynarUser) {
        // Update user in database with fresh data
        await db.createOrUpdateUser({
          fid: fid,
          username: neynarUser.username,
          display_name: neynarUser.display_name,
          pfp_url: neynarUser.pfp_url
        })
      }
    }
    
    // Return updated user data
    const user = await db.getUser(fid)
    
    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }
    
    // Transform to camelCase for consistency
    return c.json({
      fid: user.fid,
      username: user.username,
      displayName: user.display_name,
      pfpUrl: user.pfp_url
    })
  } catch (error) {
    console.error('Error refreshing profile:', error)
    return c.json({ error: 'Failed to refresh profile' }, 500)
  }
})

export default auth