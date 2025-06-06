import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import api from './routes/index.js'

// Create the main app
export function createApp() {
  const app = new Hono()

  // Global middleware
  app.use('*', logger())
  app.use('/api/*', cors())

  // Mount API routes
  app.route('/api', api)

  // 404 handler for API routes
  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: 'API endpoint not found' }, 404)
    }
    // Let the main app handle non-API 404s
    return c.notFound()
  })

  // Error handler for API routes
  app.onError((err, c) => {
    console.error('API Error:', err)
    
    if (c.req.path.startsWith('/api/')) {
      return c.json({ 
        error: 'Internal server error',
        message: err.message 
      }, 500)
    }
    
    // Let the main app handle non-API errors
    throw err
  })

  return app
}