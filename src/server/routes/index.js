import { Hono } from 'hono'
import listings from './listings.js'
import users from './users.js'
import activity from './activity.js'
import auth from './auth.js'
import webhooks from './webhooks.js'
import admin from './admin.js'
import rpc from './rpc.js'

// Create main API router
const api = new Hono()

// Mount all routes
api.route('/listings', listings)
api.route('/users', users)
api.route('/activity', activity)
api.route('/auth', auth)
api.route('/webhooks', webhooks)
api.route('/admin', admin)
api.route('/rpc', rpc)

// Health check endpoint
api.get('/health', (c) => {
  return c.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })
})

export default api