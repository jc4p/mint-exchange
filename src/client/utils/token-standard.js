import { parseAbi } from 'viem'

// Interface IDs
const ERC721_INTERFACE_ID = '0x80ac58cd'
const ERC1155_INTERFACE_ID = '0xd9b67a26'

// Minimal ABIs for detection
const ERC165_ABI = parseAbi([
  'function supportsInterface(bytes4 interfaceId) view returns (bool)'
])

const ERC721_DETECTION_ABI = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)'
])

const ERC1155_DETECTION_ABI = parseAbi([
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])'
])

/**
 * Detect the token standard of an NFT contract (works with proxy contracts)
 * @param {string} contractAddress - The NFT contract address
 * @param {string|number} tokenId - The token ID to check
 * @param {object} publicClient - Viem public client
 * @param {string} ownerAddress - Optional owner address for balance checks
 * @returns {Promise<'ERC721'|'ERC1155'>} The detected token standard
 */
export async function detectTokenStandard(contractAddress, tokenId, publicClient, ownerAddress = null) {
  console.log(`Detecting token standard for ${contractAddress}...`)
  
  // Method 1: Try ERC165 supportsInterface (most reliable for modern contracts)
  try {
    // Check ERC721
    const supportsERC721 = await publicClient.readContract({
      address: contractAddress,
      abi: ERC165_ABI,
      functionName: 'supportsInterface',
      args: [ERC721_INTERFACE_ID]
    })
    
    if (supportsERC721) {
      console.log('✅ Detected ERC721 via supportsInterface')
      return 'ERC721'
    }
    
    // Check ERC1155
    const supportsERC1155 = await publicClient.readContract({
      address: contractAddress,
      abi: ERC165_ABI,
      functionName: 'supportsInterface',
      args: [ERC1155_INTERFACE_ID]
    })
    
    if (supportsERC1155) {
      console.log('✅ Detected ERC1155 via supportsInterface')
      return 'ERC1155'
    }
  } catch (e) {
    console.log('ERC165 detection failed, trying fallback methods...')
  }
  
  // Method 2: Try calling ERC721-specific methods
  try {
    // Try ownerOf - this is ERC721 specific
    await publicClient.readContract({
      address: contractAddress,
      abi: ERC721_DETECTION_ABI,
      functionName: 'ownerOf',
      args: [BigInt(tokenId)]
    })
    
    console.log('✅ Detected ERC721 via ownerOf method')
    return 'ERC721'
  } catch (e) {
    // Not ERC721 or method doesn't exist
  }
  
  // Method 3: Try calling ERC1155-specific methods
  try {
    // Use provided owner address or a zero address for balance check
    const checkAddress = ownerAddress || '0x0000000000000000000000000000000000000000'
    
    // Try balanceOf with two parameters - this is ERC1155 specific
    const balance = await publicClient.readContract({
      address: contractAddress,
      abi: ERC1155_DETECTION_ABI,
      functionName: 'balanceOf',
      args: [checkAddress, BigInt(tokenId)]
    })
    
    // If we get here without error, it's likely ERC1155
    console.log('✅ Detected ERC1155 via balanceOf method')
    return 'ERC1155'
  } catch (e) {
    // Not ERC1155 or method doesn't exist
  }
  
  // Method 4: Try a more aggressive ERC721 check with balanceOf(address)
  try {
    const checkAddress = ownerAddress || '0x0000000000000000000000000000000000000000'
    
    // ERC721 balanceOf only takes one parameter (address)
    await publicClient.readContract({
      address: contractAddress,
      abi: ERC721_DETECTION_ABI,
      functionName: 'balanceOf',
      args: [checkAddress]
    })
    
    console.log('✅ Detected ERC721 via single-param balanceOf')
    return 'ERC721'
  } catch (e) {
    // Still couldn't determine
  }
  
  // If all detection methods fail, throw an error
  throw new Error(`Unable to detect NFT token standard for contract ${contractAddress}`)
}

/**
 * Cache for token standard detection results to avoid repeated RPC calls
 */
const tokenStandardCache = new Map()

/**
 * Cached version of detectTokenStandard
 */
export async function detectTokenStandardCached(contractAddress, tokenId, publicClient, ownerAddress = null) {
  const cacheKey = contractAddress.toLowerCase()
  
  if (tokenStandardCache.has(cacheKey)) {
    return tokenStandardCache.get(cacheKey)
  }
  
  const standard = await detectTokenStandard(contractAddress, tokenId, publicClient, ownerAddress)
  tokenStandardCache.set(cacheKey, standard)
  
  return standard
}