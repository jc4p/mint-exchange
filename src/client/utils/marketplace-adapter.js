import { Seaport } from '@opensea/seaport-js'
import { createWalletClient, custom, parseUnits, formatUnits } from 'viem'
import { base } from 'viem/chains'
import { 
  SEAPORT_ADDRESS, 
  USDC_ADDRESS, 
  FEE_RECIPIENT,
  FEE_BASIS_POINTS,
  ItemType,
  OrderType,
  calculateFeeAmounts 
} from './seaport-config.js'
import { NFT_EXCHANGE_ADDRESS, NFT_EXCHANGE_ABI } from './contract.js'

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
  constructor(signer, account, publicClient) {
    super(signer, account)
    this.publicClient = publicClient
  }

  async createListing(nft, price, duration) {
    const priceInWei = parseUnits(price.toString(), 6) // USDC has 6 decimals
    
    const { request } = await this.publicClient.simulateContract({
      address: NFT_EXCHANGE_ADDRESS,
      abi: NFT_EXCHANGE_ABI,
      functionName: 'createListing',
      args: [nft.contract, BigInt(nft.tokenId), priceInWei, BigInt(duration)],
      account: this.account
    })

    const hash = await this.signer.writeContract(request)
    return { hash, contractType: 'nftexchange' }
  }

  async buyListing(listing) {
    const { request } = await this.publicClient.simulateContract({
      address: NFT_EXCHANGE_ADDRESS,
      abi: NFT_EXCHANGE_ABI,
      functionName: 'buyListing',
      args: [BigInt(listing.listingId)],
      account: this.account
    })

    const hash = await this.signer.writeContract(request)
    return { hash }
  }

  async cancelListing(listingId) {
    const { request } = await this.publicClient.simulateContract({
      address: NFT_EXCHANGE_ADDRESS,
      abi: NFT_EXCHANGE_ABI,
      functionName: 'cancelListing',
      args: [BigInt(listingId)],
      account: this.account
    })

    const hash = await this.signer.writeContract(request)
    return { hash }
  }

  async makeOffer(nft, amount) {
    const amountInWei = parseUnits(amount.toString(), 6)
    
    const { request } = await this.publicClient.simulateContract({
      address: NFT_EXCHANGE_ADDRESS,
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
      address: NFT_EXCHANGE_ADDRESS,
      abi: NFT_EXCHANGE_ABI,
      functionName: 'acceptOffer',
      args: [BigInt(offerId)],
      account: this.account
    })

    const hash = await this.signer.writeContract(request)
    return { hash }
  }
}

// Adapter for Seaport protocol
export class SeaportAdapter extends MarketplaceAdapter {
  constructor(signer, account, publicClient) {
    super(signer, account)
    this.publicClient = publicClient
    
    // Create ethers provider wrapper for Seaport SDK
    const provider = {
      getNetwork: async () => ({ chainId: base.id }),
      getSigner: () => ({
        getAddress: async () => account,
        signMessage: async (message) => {
          return await signer.signMessage({ message, account })
        },
        _signTypedData: async (domain, types, value) => {
          return await signer.signTypedData({
            domain,
            types,
            primaryType: Object.keys(types).find(t => t !== 'EIP712Domain'),
            message: value,
            account
          })
        },
        sendTransaction: async (tx) => {
          const hash = await signer.sendTransaction(tx)
          return { hash, wait: async () => ({ status: 1 }) }
        }
      })
    }

    this.seaport = new Seaport(provider, {
      overrides: { contractAddress: SEAPORT_ADDRESS }
    })
  }

  async createListing(nft, price, duration) {
    const priceInWei = parseUnits(price.toString(), 6)
    const { sellerAmount, feeAmount } = calculateFeeAmounts(priceInWei.toString())
    
    const endTime = Math.floor(Date.now() / 1000) + duration

    const order = {
      offer: [{
        itemType: nft.isERC721 ? ItemType.ERC721 : ItemType.ERC1155,
        token: nft.contract,
        identifier: nft.tokenId.toString(),
        amount: "1"
      }],
      consideration: [
        {
          itemType: ItemType.ERC20,
          token: USDC_ADDRESS,
          amount: sellerAmount,
          recipient: this.account
        },
        {
          itemType: ItemType.ERC20,
          token: USDC_ADDRESS,
          amount: feeAmount,
          recipient: FEE_RECIPIENT
        }
      ],
      endTime,
      orderType: OrderType.FULL_OPEN,
      zone: '0x0000000000000000000000000000000000000000',
      zoneHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      conduitKey: '0x0000000000000000000000000000000000000000000000000000000000000000'
    }

    try {
      const { executeAllActions } = await this.seaport.createOrder(
        order,
        this.account
      )
      
      const response = await executeAllActions()
      
      // Extract order hash from the response
      const orderHash = response.orderHash || response.hash
      
      return { 
        hash: orderHash, 
        contractType: 'seaport',
        order: response.order || order
      }
    } catch (error) {
      console.error('Error creating Seaport order:', error)
      throw error
    }
  }

  async buyListing(listing) {
    try {
      const { executeAllActions } = await this.seaport.fulfillOrder({
        order: listing.orderData,
        accountAddress: this.account
      })

      const response = await executeAllActions()
      return { hash: response.hash }
    } catch (error) {
      console.error('Error fulfilling Seaport order:', error)
      throw error
    }
  }

  async cancelListing(orderHash) {
    try {
      const tx = await this.seaport.cancelOrders([orderHash], this.account)
      const response = await tx.wait()
      return { hash: response.transactionHash }
    } catch (error) {
      console.error('Error cancelling Seaport order:', error)
      throw error
    }
  }

  async makeOffer(nft, amount) {
    const amountInWei = parseUnits(amount.toString(), 6)
    const { sellerAmount, feeAmount } = calculateFeeAmounts(amountInWei.toString())
    
    const endTime = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days

    const order = {
      offer: [{
        itemType: ItemType.ERC20,
        token: USDC_ADDRESS,
        amount: amountInWei.toString()
      }],
      consideration: [
        {
          itemType: nft.isERC721 ? ItemType.ERC721 : ItemType.ERC1155,
          token: nft.contract,
          identifier: nft.tokenId.toString(),
          amount: "1",
          recipient: this.account
        },
        {
          itemType: ItemType.ERC20,
          token: USDC_ADDRESS,
          amount: feeAmount,
          recipient: FEE_RECIPIENT
        }
      ],
      endTime,
      orderType: OrderType.FULL_OPEN
    }

    try {
      const { executeAllActions } = await this.seaport.createOrder(
        order,
        this.account
      )
      
      const response = await executeAllActions()
      return { 
        hash: response.orderHash || response.hash,
        contractType: 'seaport'
      }
    } catch (error) {
      console.error('Error creating Seaport offer:', error)
      throw error
    }
  }

  async acceptOffer(offer) {
    return this.buyListing(offer) // Offers are just reverse listings in Seaport
  }
}

// Factory function to create appropriate adapter
export function getMarketplaceAdapter(contractType, signer, account, publicClient) {
  if (contractType === 'seaport') {
    return new SeaportAdapter(signer, account, publicClient)
  }
  
  return new NFTExchangeAdapter(signer, account, publicClient)
}