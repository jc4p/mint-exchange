import { createClient, Errors } from '@farcaster/quick-auth'
import { Database } from '../db.js'
import { NeynarService } from '../neynar.js'

// Create a quick auth client
const authClient = createClient()

/**
 * Auth middleware for protected routes
 * Verifies JWT tokens from Farcaster Quick Auth
 */
export const authMiddleware = (options = {}) => {
  const { required = true } = options

  return async (c, next) => {
    const authorization = c.req.header('Authorization')
    
    // If auth is not required and no token provided, continue
    if (!required && !authorization) {
      c.set('user', null)
      return next()
    }

    // Check for Bearer token
    if (!authorization || !authorization.startsWith('Bearer ')) {
      if (required) {
        return c.json({ error: 'Unauthorized - No valid token provided' }, 401)
      }
      c.set('user', null)
      return next()
    }

    try {
      // Extract token
      const token = authorization.split(' ')[1]
      
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
          console.log('Fetching user data from Neynar for FID:', payload.sub)
          const neynar = new NeynarService(c.env.NEYNAR_API_KEY)
          const neynarUser = await neynar.fetchUserByFid(payload.sub)
          
          console.log('Neynar response:', neynarUser)
          
          if (neynarUser) {
            userData = {
              fid: payload.sub,
              username: neynarUser.username,
              display_name: neynarUser.display_name,
              pfp_url: neynarUser.pfp_url
            }
            console.log('User data to save:', userData)
          } else {
            console.log('No user data returned from Neynar')
          }
        } else {
          console.log('No NEYNAR_API_KEY configured')
        }

        await db.createOrUpdateUser(userData)
        user = await db.getUser(payload.sub)
      }
      
      // Attach user to context
      c.set('user', {
        fid: payload.sub,
        ...user
      })
      
      return next()
    } catch (error) {
      console.error('Auth error:', error)
      
      if (error instanceof Errors.InvalidTokenError) {
        return c.json({ error: 'Invalid or expired token' }, 401)
      }
      
      return c.json({ error: 'Authentication failed' }, 500)
    }
  }
}

/**
 * Admin auth middleware
 * Checks for admin token in Authorization header
 */
export const adminAuth = () => {
  return async (c, next) => {
    const authorization = c.req.header('X-Admin-Token')
    
    if (!authorization) {
      return c.json({ error: 'Unauthorized - Admin access required' }, 401)
    }
    
    if (authorization !== c.env.ADMIN_TOKEN) {
      return c.json({ error: 'Invalid admin token' }, 401)
    }
    
    return next()
  }
}