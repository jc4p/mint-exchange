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
 * Wait for a transaction to be available and get it
 * Retries up to maxAttempts times with a delay between attempts
 */
export async function waitForAndGetTransaction(client, hash, maxAttempts = 10, delayMs = 200) {
  console.log(`Waiting for transaction ${hash} to be available...`)
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const transaction = await client.getTransaction({ hash })
      console.log(`Transaction found on attempt ${attempt}`)
      return transaction
    } catch (error) {
      if (attempt === maxAttempts) {
        console.error(`Transaction not found after ${maxAttempts} attempts`)
        throw error
      }
      
      console.log(`Transaction not found on attempt ${attempt}, retrying in ${delayMs}ms...`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
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