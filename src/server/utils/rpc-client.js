import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

/**
 * Get the RPC URL based on environment configuration
 * Prioritizes Alchemy API key if available, falls back to BASE_RPC_URL or default
 */
export function getRpcUrl(env) {
  if (env.ALCHEMY_API_KEY) {
    return `https://base-mainnet.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`
  }
  return env.BASE_RPC_URL || 'https://mainnet.base.org'
}

/**
 * Create a viem public client with the appropriate RPC endpoint
 */
export function createRpcClient(env) {
  return createPublicClient({
    chain: base,
    transport: http(getRpcUrl(env))
  })
}

/**
 * Proxy a JSON-RPC request through our configured RPC endpoint
 */
export async function proxyRpcRequest(env, { method, params, id = 1, jsonrpc = '2.0' }) {
  console.log('Proxying RPC method:', method)
  
  const rpcUrl = getRpcUrl(env)
  
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc, id, method, params })
  })
  
  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.statusText}`)
  }
  
  return await response.json()
}