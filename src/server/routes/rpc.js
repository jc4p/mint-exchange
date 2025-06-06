import { Hono } from 'hono'
import { proxyRpcRequest } from '../utils/rpc-client.js'

const rpc = new Hono()

// Generic JSON-RPC proxy - ALL requests go through here
rpc.post('/proxy', async (c) => {
  try {
    const body = await c.req.json()
    const result = await proxyRpcRequest(c.env, body)
    return c.json(result)
  } catch (error) {
    console.error('RPC proxy error:', error)
    return c.json({ 
      jsonrpc: '2.0',
      id: body.id || 1,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error.message
      }
    })
  }
})

export default rpc