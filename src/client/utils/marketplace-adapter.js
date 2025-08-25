import { parseUnits, formatUnits, encodePacked, keccak256, getAddress } from 'viem'
import { 
  SEAPORT_ADDRESS, 
  USDC_ADDRESS, 
  FEE_RECIPIENT,
  FEE_BASIS_POINTS,
  ItemType,
  OrderType,
  calculateFeeAmounts 
} from './seaport-config.js'
import { NFT_EXCHANGE_ADDRESS, NFT_EXCHANGE_V2_ADDRESS, NFT_EXCHANGE_ABI } from './contract.js'
import { getSeaportErrorMessage, debugSeaportError } from './seaport-errors.js'
import { SeaportJSAdapter } from './seaport-adapter.js'

// Base marketplace adapter class
export class MarketplaceAdapter {
  constructor(signer, account) {
    this.signer = signer
    this.account = account
  }

  async createListing(nft, price, duration) {
    throw new Error('Not implemented')
  }

  async buyListing(listing) {
    throw new Error('Not implemented')
  }

  async cancelListing(listingId) {
    throw new Error('Not implemented')
  }

  async makeOffer(nft, amount) {
    throw new Error('Not implemented')
  }

  async acceptOffer(offerId) {
    throw new Error('Not implemented')
  }
}

// Adapter for existing NFTExchange contract
export class NFTExchangeAdapter extends MarketplaceAdapter {
  constructor(signer, account, publicClient, contractType = 'nft_exchange') {
    super(signer, account)
    this.publicClient = publicClient
    this.contractType = contractType
    // Use v2 address if specified, otherwise use v1
    this.contractAddress = contractType === 'nft_exchange_v2' ? NFT_EXCHANGE_V2_ADDRESS : NFT_EXCHANGE_ADDRESS
  }

  async createListing(nft, price, duration) {
    const priceInWei = parseUnits(price.toString(), 6) // USDC has 6 decimals
    
    const { request } = await this.publicClient.simulateContract({
      address: this.contractAddress,
      abi: NFT_EXCHANGE_ABI,
      functionName: 'createListing',
      args: [nft.contract, BigInt(nft.tokenId), priceInWei, BigInt(duration)],
      account: this.account
    })

    const hash = await this.signer.writeContract(request)
    return { hash, contractType: this.contractType }
  }

  async buyListing(listing) {
    if (!listing.blockchainListingId) {
      throw new Error('No blockchainListingId found in listing object')
    }
    
    // Strip v2_ prefix if present to get the actual on-chain listing ID
    const onChainListingId = listing.blockchainListingId.startsWith('v2_') 
      ? listing.blockchainListingId.substring(3)
      : listing.blockchainListingId
    
    const { request } = await this.publicClient.simulateContract({
      address: this.contractAddress,
      abi: NFT_EXCHANGE_ABI,
      functionName: 'buyListing',
      args: [BigInt(onChainListingId)],
      account: this.account
    })

    const hash = await this.signer.writeContract(request)
    return { hash }
  }

  async cancelListing(listingId) {
    // Strip v2_ prefix if present to get the actual on-chain listing ID
    const onChainListingId = listingId.toString().startsWith('v2_') 
      ? listingId.toString().substring(3)
      : listingId
    
    const { request } = await this.publicClient.simulateContract({
      address: this.contractAddress,
      abi: NFT_EXCHANGE_ABI,
      functionName: 'cancelListing',
      args: [BigInt(onChainListingId)],
      account: this.account
    })

    const hash = await this.signer.writeContract(request)
    return { hash }
  }

  async makeOffer(nft, amount) {
    const amountInWei = parseUnits(amount.toString(), 6)
    
    const { request } = await this.publicClient.simulateContract({
      address: this.contractAddress,
      abi: NFT_EXCHANGE_ABI,
      functionName: 'makeOffer',
      args: [nft.contract, BigInt(nft.tokenId), amountInWei],
      account: this.account
    })

    const hash = await this.signer.writeContract(request)
    return { hash }
  }

  async acceptOffer(offerId) {
    const { request } = await this.publicClient.simulateContract({
      address: this.contractAddress,
      abi: NFT_EXCHANGE_ABI,
      functionName: 'acceptOffer',
      args: [BigInt(offerId)],
      account: this.account
    })

    const hash = await this.signer.writeContract(request)
    return { hash }
  }
}

// Adapter for Seaport protocol - using @opensea/seaport-js
export class SeaportAdapter extends SeaportJSAdapter {
  constructor(signer, account, publicClient) {
    super(account)
    // Keep references for compatibility with the factory function
    this.signer = signer
    this.publicClient = publicClient
  }
  // All methods are inherited from SeaportJSAdapter
}

// Factory function to create appropriate adapter
export function getMarketplaceAdapter(contractType, signer, account, publicClient) {
  if (contractType === 'seaport') {
    return new SeaportAdapter(signer, account, publicClient)
  }
  
  // Both nft_exchange and nft_exchange_v2 use the same adapter
  // since they have the same interface
  return new NFTExchangeAdapter(signer, account, publicClient, contractType)
}