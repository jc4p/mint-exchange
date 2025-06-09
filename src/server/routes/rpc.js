import { Hono } from 'hono'
import { proxyRpcRequest } from '../utils/rpc-client.js'

const rpc = new Hono()

// Generic JSON-RPC proxy - ALL requests go through here
rpc.post('/proxy', async (c) => {
  let body
  try {
    body = await c.req.json()
    
    // Handle batch requests
    if (Array.isArray(body)) {
      const results = await Promise.all(
        body.map(request => proxyRpcRequest(c.env, request))
      )
      return c.json(results)
    }
    
    // Handle single request
    const result = await proxyRpcRequest(c.env, body)
    return c.json(result)
  } catch (error) {
    console.error('RPC proxy error:', error)
    
    // If body is an array, return error for each request
    if (Array.isArray(body)) {
      return c.json(body.map(req => ({
        jsonrpc: '2.0',
        id: req.id || null,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        }
      })))
    }
    
    // Single request error
    return c.json({ 
      jsonrpc: '2.0',
      id: body?.id || null,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error.message
      }
    })
  }
})

export default rpc