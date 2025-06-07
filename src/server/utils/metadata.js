import { createRpcClient } from './rpc-client.js'

// NFT contract ABIs
const NFT_ABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  }
]

const ERC721_ABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  }
]

// IPFS gateways (primary and fallback)
const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/'
]

/**
 * Convert IPFS URL to HTTP URL
 */
export function ipfsToHttp(url, gatewayIndex = 0) {
  if (!url) return url
  
  const gateway = IPFS_GATEWAYS[gatewayIndex] || IPFS_GATEWAYS[0]
  
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', gateway)
  }
  if (url.startsWith('Qm') && url.length === 46) {
    return gateway + url
  }
  if (url.includes('/ipfs/')) {
    // Already an HTTP gateway URL, return as-is
    return url
  }
  return url
}

/**
 * Fetch metadata from URL with retry on different IPFS gateways
 */
async function fetchMetadataFromUrl(url, gatewayIndex = 0) {
  try {
    const httpUrl = ipfsToHttp(url, gatewayIndex)
    console.log(`Fetching metadata from: ${httpUrl}`)
    
    const response = await fetch(httpUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NFTMetadataFetcher/1.0)'
      },
      signal: AbortSignal.timeout(30000) // 30 second timeout
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const metadata = await response.json()
    return metadata
  } catch (error) {
    console.error(`Failed to fetch metadata from gateway ${gatewayIndex}: ${error.message}`)
    
    // Try next gateway if available
    if (gatewayIndex < IPFS_GATEWAYS.length - 1) {
      console.log('Trying next IPFS gateway...')
      return fetchMetadataFromUrl(url, gatewayIndex + 1)
    }
    
    return null
  }
}

/**
 * Get token URI from contract
 */
async function getTokenURI(client, contractAddress, tokenId) {
  try {
    console.log(`Getting tokenURI for ${contractAddress} #${tokenId}`)
    
    const tokenURI = await client.readContract({
      address: contractAddress,
      abi: NFT_ABI,
      functionName: 'tokenURI',
      args: [BigInt(tokenId)]
    })
    
    return tokenURI
  } catch (error) {
    console.error(`Failed to get tokenURI: ${error.message}`)
    return null
  }
}

/**
 * Get collection name from contract
 */
async function getCollectionName(client, contractAddress) {
  try {
    const name = await client.readContract({
      address: contractAddress,
      abi: ERC721_ABI,
      functionName: 'name',
      args: []
    })
    return name
  } catch (error) {
    console.error(`Failed to get collection name: ${error.message}`)
    return null
  }
}

/**
 * Normalize metadata to a consistent format
 */
function normalizeMetadata(metadata, tokenId) {
  if (!metadata) return null
  
  return {
    name: metadata.name || `Token #${tokenId}`,
    description: metadata.description || '',
    image: ipfsToHttp(metadata.image || metadata.image_url || ''),
    attributes: metadata.attributes || metadata.traits || [],
    external_url: metadata.external_url || '',
    animation_url: metadata.animation_url || ''
  }
}

/**
 * Fetch complete NFT metadata including on-chain data
 * This is the main function that should be used by all services
 */
export async function fetchNFTMetadata(env, contractAddress, tokenId, existingMetadataUri = null) {
  const client = createRpcClient(env)
  
  const result = {
    contract_address: contractAddress,
    token_id: tokenId,
    metadata_uri: existingMetadataUri || '',
    name: '',
    description: '',
    image_url: '',
    collection_name: '',
    attributes: [],
    success: false,
    error: null
  }
  
  try {
    // Get collection name
    result.collection_name = await getCollectionName(client, contractAddress) || 'Unknown Collection'
    
    // Get token URI if not provided
    let metadataUri = existingMetadataUri
    if (!metadataUri) {
      metadataUri = await getTokenURI(client, contractAddress, tokenId)
      if (!metadataUri) {
        result.error = 'No tokenURI found on contract'
        return result
      }
    }
    result.metadata_uri = metadataUri
    
    // Fetch and normalize metadata
    const rawMetadata = await fetchMetadataFromUrl(metadataUri)
    if (!rawMetadata) {
      result.error = 'Failed to fetch metadata from URI'
      return result
    }
    
    const normalized = normalizeMetadata(rawMetadata, tokenId)
    if (!normalized) {
      result.error = 'Failed to normalize metadata'
      return result
    }
    
    // Update result with normalized data
    result.name = normalized.name
    result.description = normalized.description
    result.image_url = normalized.image
    result.attributes = normalized.attributes
    result.success = true
    
    return result
    
  } catch (error) {
    console.error('Error fetching NFT metadata:', error)
    result.error = error.message
    return result
  }
}

/**
 * Batch fetch metadata for multiple NFTs
 */
export async function batchFetchMetadata(env, nfts, concurrency = 3) {
  const results = []
  
  // Process in batches to avoid overwhelming the RPC
  for (let i = 0; i < nfts.length; i += concurrency) {
    const batch = nfts.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map(nft => 
        fetchNFTMetadata(env, nft.contract_address, nft.token_id, nft.metadata_uri)
          .catch(error => ({
            ...nft,
            success: false,
            error: error.message
          }))
      )
    )
    results.push(...batchResults)
    
    // Small delay between batches
    if (i + concurrency < nfts.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  return results
}