import { encodeFunctionData, parseAbi, decodeFunctionResult } from 'viem'
import { SEAPORT_ADDRESS } from './seaport-config.js'

// Contract addresses from environment
export const ADDRESSES = {
  NFT_EXCHANGE: '0x06fB7424Ba65D587405b9C754Bc40dA9398B72F0',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  SEAPORT: SEAPORT_ADDRESS
}

// Export for adapter compatibility
export const NFT_EXCHANGE_ADDRESS = ADDRESSES.NFT_EXCHANGE

// Helper function to make RPC calls through our proxy
async function rpcCall(method, params = []) {
  const response = await fetch('/api/rpc/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    })
  })

  if (!response.ok) {
    throw new Error('RPC request failed')
  }

  const data = await response.json()
  
  if (data.error) {
    throw new Error(data.error.message || 'RPC error')
  }
  
  return data.result
}

// Helper function to read contract through eth_call
async function readContract({ address, abi, functionName, args = [] }) {
  // Encode the function call
  const data = encodeFunctionData({
    abi,
    functionName,
    args
  })
  
  // Make eth_call through our proxy
  const result = await rpcCall('eth_call', [
    {
      to: address,
      data
    },
    'latest'
  ])
  
  // Decode the result
  const decoded = decodeFunctionResult({
    abi,
    functionName,
    data: result
  })
  
  return decoded
}

// NFT Exchange contract ABI (only the functions we need)
export const NFT_EXCHANGE_ABI = parseAbi([
  // Functions
  'function createListing(address nftContract, uint256 tokenId, uint256 price, uint256 duration) returns (uint256 listingId)',
  'function cancelListing(uint256 listingId)',
  'function buyListing(uint256 listingId)',
  'function makeOffer(address nftContract, uint256 tokenId, uint256 offerAmount, uint256 duration) returns (uint256 offerId)',
  'function acceptOffer(uint256 offerId)',
  'function cancelOffer(uint256 offerId)',
  'function isERC721(address nftContract) view returns (bool)',
  'function isERC1155(address nftContract) view returns (bool)',
  'function getERC1155Balance(address nftContract, address owner, uint256 tokenId) view returns (uint256)',
  'function isERC721Owner(address nftContract, address owner, uint256 tokenId) view returns (bool)',
  'function listings(uint256) view returns (address seller, address nftContract, uint256 tokenId, uint256 price, uint256 expiresAt, bool isERC721, bool sold, bool cancelled)',
  
  // Custom errors
  'error ListingNotFound()',
  'error ListingExpired()',
  'error ListingAlreadySold()',
  'error ListingAlreadyCancelled()',
  'error UnauthorizedCaller()',
  'error InvalidNFTContract()',
  'error InsufficientNFTBalance()',
  'error InsufficientUSDCBalance()',
  'error InvalidPrice()',
  'error InvalidDuration()',
  'error TransferFailed()',
  'error UnsupportedNFTStandard()',
  'error OfferNotFound()',
  'error OfferExpired()',
  'error OfferAlreadyAccepted()',
  'error OfferAlreadyCancelled()'
])

// ERC20 ABI for USDC
export const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)'
])

// ERC721 ABI
export const ERC721_ABI = parseAbi([
  'function approve(address to, uint256 tokenId)',
  'function setApprovalForAll(address operator, bool approved)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function ownerOf(uint256 tokenId) view returns (address)'
])

// ERC1155 ABI
export const ERC1155_ABI = parseAbi([
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address account, address operator) view returns (bool)',
  'function balanceOf(address account, uint256 id) view returns (uint256)'
])

/**
 * Encode function calls for the NFT Exchange contract
 */
export const encodeNFTExchange = {
  createListing: (nftContract, tokenId, price, duration) => {
    return encodeFunctionData({
      abi: NFT_EXCHANGE_ABI,
      functionName: 'createListing',
      args: [nftContract, BigInt(tokenId), BigInt(price), BigInt(duration)]
    })
  },

  cancelListing: (listingId) => {
    return encodeFunctionData({
      abi: NFT_EXCHANGE_ABI,
      functionName: 'cancelListing',
      args: [BigInt(listingId)]
    })
  },

  buyListing: (listingId) => {
    return encodeFunctionData({
      abi: NFT_EXCHANGE_ABI,
      functionName: 'buyListing',
      args: [BigInt(listingId)]
    })
  },

  makeOffer: (nftContract, tokenId, offerAmount, duration) => {
    return encodeFunctionData({
      abi: NFT_EXCHANGE_ABI,
      functionName: 'makeOffer',
      args: [nftContract, BigInt(tokenId), BigInt(offerAmount), BigInt(duration)]
    })
  },

  acceptOffer: (offerId) => {
    return encodeFunctionData({
      abi: NFT_EXCHANGE_ABI,
      functionName: 'acceptOffer',
      args: [BigInt(offerId)]
    })
  },

  cancelOffer: (offerId) => {
    return encodeFunctionData({
      abi: NFT_EXCHANGE_ABI,
      functionName: 'cancelOffer',
      args: [BigInt(offerId)]
    })
  }
}

/**
 * Encode ERC20 (USDC) function calls
 */
export const encodeERC20 = {
  approve: (spender, amount) => {
    return encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spender, BigInt(amount)]
    })
  }
}

/**
 * Encode ERC721 function calls
 */
export const encodeERC721 = {
  approve: (to, tokenId) => {
    console.log('Encoding ERC721 approve:', {
      to,
      tokenId: tokenId.toString(),
      functionName: 'approve'
    })
    return encodeFunctionData({
      abi: ERC721_ABI,
      functionName: 'approve',
      args: [to, BigInt(tokenId)]
    })
  }
}

/**
 * Encode ERC1155 function calls
 */
export const encodeERC1155 = {
  setApprovalForAll: (operator, approved) => {
    return encodeFunctionData({
      abi: ERC1155_ABI,
      functionName: 'setApprovalForAll',
      args: [operator, approved]
    })
  }
}

/**
 * Convert USDC amount to contract format (6 decimals)
 */
export function toUSDCAmount(amount) {
  // USDC has 6 decimals
  return BigInt(Math.floor(amount * 1e6))
}

/**
 * Convert from contract USDC format to display format
 */
export function fromUSDCAmount(amount) {
  return Number(amount) / 1e6
}

/**
 * Helper to check if user has approved USDC spending
 */
export async function checkUSDCAllowance(userAddress, spenderAddress) {
  const allowance = await readContract({
    address: ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [userAddress, spenderAddress]
  })
  
  return BigInt(allowance)
}

/**
 * Helper to check user's USDC balance
 */
export async function checkUSDCBalance(userAddress) {
  const balance = await readContract({
    address: ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [userAddress]
  })
  
  return BigInt(balance)
}

/**
 * Helper to check if user owns the NFT
 */
export async function checkNFTOwnership(nftContract, tokenId, ownerAddress, isERC1155 = false) {
  try {
    if (isERC1155) {
      const balance = await readContract({
        address: nftContract,
        abi: ERC1155_ABI,
        functionName: 'balanceOf',
        args: [ownerAddress, BigInt(tokenId)]
      })
      console.log('ERC1155 balance:', balance)
      return balance > 0n
    } else {
      const owner = await readContract({
        address: nftContract,
        abi: ERC721_ABI,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)]
      })
      console.log('ERC721 owner:', owner, 'expected:', ownerAddress)
      return owner.toLowerCase() === ownerAddress.toLowerCase()
    }
  } catch (error) {
    console.error('Error checking NFT ownership:', error)
    return false
  }
}

/**
 * Helper to check NFT approval status
 */
export async function checkNFTApproval(nftContract, tokenId, ownerAddress, isERC1155 = false) {
  console.log('Checking NFT approval:', {
    nftContract,
    tokenId,
    ownerAddress,
    isERC1155,
    nftExchange: ADDRESSES.NFT_EXCHANGE
  })
  
  if (isERC1155) {
    const isApproved = await readContract({
      address: nftContract,
      abi: ERC1155_ABI,
      functionName: 'isApprovedForAll',
      args: [ownerAddress, ADDRESSES.NFT_EXCHANGE]
    })
    
    console.log('ERC1155 isApprovedForAll result:', isApproved)
    return isApproved
  } else {
    // For ERC721, check both getApproved and isApprovedForAll
    try {
      // Check specific token approval
      const approvedAddress = await readContract({
        address: nftContract,
        abi: ERC721_ABI,
        functionName: 'getApproved',
        args: [BigInt(tokenId)]
      })
      
      console.log('ERC721 getApproved result:', approvedAddress)
      
      if (approvedAddress.toLowerCase() === ADDRESSES.NFT_EXCHANGE.toLowerCase()) {
        return true
      }
    } catch (error) {
      console.log('getApproved error (might be normal):', error.message)
      // Token might not exist or other error, continue to check operator approval
    }
    
    // Check operator approval
    const isApprovedForAll = await readContract({
      address: nftContract,
      abi: ERC721_ABI,
      functionName: 'isApprovedForAll',
      args: [ownerAddress, ADDRESSES.NFT_EXCHANGE]
    })
    
    console.log('ERC721 isApprovedForAll result:', isApprovedForAll)
    return isApprovedForAll
  }
}