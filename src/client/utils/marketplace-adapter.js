import { parseUnits, formatUnits, encodePacked, keccak256 } from 'viem'
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
    if (!listing.blockchainListingId) {
      throw new Error('No blockchainListingId found in listing object')
    }
    
    const { request } = await this.publicClient.simulateContract({
      address: NFT_EXCHANGE_ADDRESS,
      abi: NFT_EXCHANGE_ABI,
      functionName: 'buyListing',
      args: [BigInt(listing.blockchainListingId)],
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

// Adapter for Seaport protocol - simplified to work directly with Frame ethProvider
export class SeaportAdapter extends MarketplaceAdapter {
  constructor(signer, account, publicClient) {
    super(signer, account)
    this.publicClient = publicClient
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

    console.log('Creating Seaport order with parameters:', order)
    
    try {
      // For Seaport, we need to:
      // 1. Get the order components with proper formatting
      // 2. Sign the order
      // 3. Return the order hash and signed order
      
      // Log individual values to find the null
      console.log('Debugging order values:', {
        'nft.contract': nft.contract,
        'nft.tokenId': nft.tokenId,
        'sellerAmount': sellerAmount,
        'feeAmount': feeAmount,
        'this.account': this.account,
        'order.endTime': order.endTime
      })
      
      // Get standardized order parameters with proper BigNumber formatting
      const orderParameters = {
        offerer: this.account,
        zone: order.zone || '0x0000000000000000000000000000000000000000',
        offer: order.offer.map(item => {
          const amount = item.amount ? BigInt(item.amount).toString() : "1";
          const formatted = {
            itemType: item.itemType,
            token: item.token,
            startAmount: amount,  // Seaport 1.6 uses startAmount
            endAmount: amount,    // Same as startAmount for fixed-price listings
            identifierOrCriteria: item.identifier ? BigInt(item.identifier).toString() : "0"  // Always include for all items in 1.6
          };
          return formatted;
        }),
        consideration: order.consideration.map(item => {
          const amount = item.amount ? BigInt(item.amount).toString() : "0";
          const formatted = {
            itemType: item.itemType,
            token: item.token,
            startAmount: amount,  // Seaport 1.6 uses startAmount
            endAmount: amount,    // Same as startAmount for fixed-price listings
            identifierOrCriteria: "0",  // Required for all items in 1.6, "0" for ERC20
            recipient: item.recipient
          };
          return formatted;
        }),
        orderType: order.orderType,
        startTime: Math.floor(Date.now() / 1000).toString(),
        endTime: order.endTime.toString(),
        zoneHash: order.zoneHash || '0x0000000000000000000000000000000000000000000000000000000000000000',
        salt: `0x${[...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('')}`,
        conduitKey: order.conduitKey || '0x0000000000000000000000000000000000000000000000000000000000000000',
        counter: "0" // Will be fetched from chain
      }
      
      console.log('Order parameters before getting counter:', orderParameters)
      
      // Get the current counter from the contract
      const counterData = await this.publicClient.readContract({
        address: SEAPORT_ADDRESS,
        abi: [{
          name: 'getCounter',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'offerer', type: 'address' }],
          outputs: [{ name: 'counter', type: 'uint256' }]
        }],
        functionName: 'getCounter',
        args: [this.account]
      })
      console.log('Counter from Seaport:', counterData, 'Type:', typeof counterData)
      orderParameters.counter = counterData.toString()
      
      console.log('Final order parameters:', orderParameters)
      
      // Calculate order hash using viem's keccak256 and proper EIP-712 encoding
      console.log('Calculating order hash with EIP-712...')
      
      // Encode the order parameters for hashing according to Seaport 1.6
      // The order hash is keccak256 of the encoded order parameters
      const orderHash = await this.publicClient.readContract({
        address: SEAPORT_ADDRESS,
        abi: [{
          name: 'getOrderHash',
          type: 'function',
          stateMutability: 'view',
          inputs: [{
            name: 'orderComponents',
            type: 'tuple',
            components: [
              { name: 'offerer', type: 'address' },
              { name: 'zone', type: 'address' },
              { name: 'offer', type: 'tuple[]', components: [
                { name: 'itemType', type: 'uint8' },
                { name: 'token', type: 'address' },
                { name: 'identifierOrCriteria', type: 'uint256' },
                { name: 'startAmount', type: 'uint256' },
                { name: 'endAmount', type: 'uint256' }
              ]},
              { name: 'consideration', type: 'tuple[]', components: [
                { name: 'itemType', type: 'uint8' },
                { name: 'token', type: 'address' },
                { name: 'identifierOrCriteria', type: 'uint256' },
                { name: 'startAmount', type: 'uint256' },
                { name: 'endAmount', type: 'uint256' },
                { name: 'recipient', type: 'address' }
              ]},
              { name: 'orderType', type: 'uint8' },
              { name: 'startTime', type: 'uint256' },
              { name: 'endTime', type: 'uint256' },
              { name: 'zoneHash', type: 'bytes32' },
              { name: 'salt', type: 'uint256' },
              { name: 'conduitKey', type: 'bytes32' },
              { name: 'counter', type: 'uint256' }
            ]
          }],
          outputs: [{ name: 'orderHash', type: 'bytes32' }]
        }],
        functionName: 'getOrderHash',
        args: [orderParameters]
      })
      
      console.log('Order hash:', orderHash)
      
      // Sign the order off-chain using Frame's ethProvider
      console.log('Signing order off-chain using Frame ethProvider...')
      
      // Import frameUtils to access the ethProvider
      const { frameUtils } = await import('../components/frame-provider.js')
      const ethProvider = frameUtils.sdk.wallet.ethProvider
      
      const domain = {
        name: "Seaport",
        version: "1.6",
        chainId: 8453,
        verifyingContract: SEAPORT_ADDRESS
      }
      
      const types = {
        OrderComponents: [
          { name: "offerer", type: "address" },
          { name: "zone", type: "address" },
          { name: "offer", type: "OfferItem[]" },
          { name: "consideration", type: "ConsiderationItem[]" },
          { name: "orderType", type: "uint8" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "zoneHash", type: "bytes32" },
          { name: "salt", type: "uint256" },
          { name: "conduitKey", type: "bytes32" },
          { name: "counter", type: "uint256" }
        ],
        OfferItem: [
          { name: "itemType", type: "uint8" },
          { name: "token", type: "address" },
          { name: "identifierOrCriteria", type: "uint256" },
          { name: "startAmount", type: "uint256" },
          { name: "endAmount", type: "uint256" }
        ],
        ConsiderationItem: [
          { name: "itemType", type: "uint8" },
          { name: "token", type: "address" },
          { name: "identifierOrCriteria", type: "uint256" },
          { name: "startAmount", type: "uint256" },
          { name: "endAmount", type: "uint256" },
          { name: "recipient", type: "address" }
        ]
      }
      
      const typedData = {
        domain,
        types,
        primaryType: 'OrderComponents',
        message: orderParameters
      }

      console.log('Calling eth_signTypedData_v4 with params:', [this.account, JSON.stringify(typedData)])

      // Use eth_signTypedData_v4 directly through the Frame's ethProvider
      const signature = await ethProvider.request({
        method: 'eth_signTypedData_v4',
        params: [this.account, JSON.stringify(typedData)]
      })
      
      console.log('Order signature:', signature)
      
      // Return the signed order data
      return {
        hash: orderHash,
        contractType: 'seaport',
        order: {
          parameters: orderParameters,
          signature: signature
        }
      }
    } catch (error) {
      console.error('Error creating Seaport order:', error)
      console.error('Error stack:', error.stack)
      throw error
    }
  }

  async buyListing(listing) {
    try {
      // For Seaport orders, we need to call fulfillOrder on the contract
      const { request } = await this.publicClient.simulateContract({
        address: SEAPORT_ADDRESS,
        abi: [{
          name: 'fulfillOrder',
          type: 'function',
          stateMutability: 'payable',
          inputs: [
            {
              name: 'order',
              type: 'tuple',
              components: [
                {
                  name: 'parameters',
                  type: 'tuple',
                  components: [
                    { name: 'offerer', type: 'address' },
                    { name: 'zone', type: 'address' },
                    { name: 'offer', type: 'tuple[]', components: [
                      { name: 'itemType', type: 'uint8' },
                      { name: 'token', type: 'address' },
                      { name: 'identifierOrCriteria', type: 'uint256' },
                      { name: 'startAmount', type: 'uint256' },
                      { name: 'endAmount', type: 'uint256' }
                    ]},
                    { name: 'consideration', type: 'tuple[]', components: [
                      { name: 'itemType', type: 'uint8' },
                      { name: 'token', type: 'address' },
                      { name: 'identifierOrCriteria', type: 'uint256' },
                      { name: 'startAmount', type: 'uint256' },
                      { name: 'endAmount', type: 'uint256' },
                      { name: 'recipient', type: 'address' }
                    ]},
                    { name: 'orderType', type: 'uint8' },
                    { name: 'startTime', type: 'uint256' },
                    { name: 'endTime', type: 'uint256' },
                    { name: 'zoneHash', type: 'bytes32' },
                    { name: 'salt', type: 'uint256' },
                    { name: 'conduitKey', type: 'bytes32' },
                    { name: 'totalOriginalConsiderationItems', type: 'uint256' }
                  ]
                },
                { name: 'signature', type: 'bytes' }
              ]
            },
            { name: 'fulfillerConduitKey', type: 'bytes32' }
          ],
          outputs: [{ name: 'fulfilled', type: 'bool' }]
        }],
        functionName: 'fulfillOrder',
        args: [
          {
            parameters: {
              ...listing.orderData.parameters,
              totalOriginalConsiderationItems: listing.orderData.parameters.consideration.length
            },
            signature: listing.orderData.signature
          },
          '0x0000000000000000000000000000000000000000000000000000000000000000'
        ],
        account: this.account
      })

      const hash = await this.signer.writeContract(request)
      return { hash }
    } catch (error) {
      console.error('Error fulfilling Seaport order:', error)
      
      // Check for common Seaport errors
      if (error.message?.includes('0xeaf38844')) {
        throw new Error('Invalid order signature. The order may have been modified or signed incorrectly.')
      } else if (error.message?.includes('0x1a783b8d')) {
        throw new Error('Order has already been filled or cancelled.')
      } else if (error.message?.includes('0xf9c0959d')) {
        throw new Error('Insufficient token approvals. Please check USDC and NFT approvals.')
      }
      
      throw error
    }
  }

  async cancelListing(orderComponents) {
    try {
      // For Seaport, we need to cancel using the order components
      const { request } = await this.publicClient.simulateContract({
        address: SEAPORT_ADDRESS,
        abi: [{
          name: 'cancel',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [{
            name: 'orders',
            type: 'tuple[]',
            components: [
              { name: 'offerer', type: 'address' },
              { name: 'zone', type: 'address' },
              { name: 'offer', type: 'tuple[]', components: [
                { name: 'itemType', type: 'uint8' },
                { name: 'token', type: 'address' },
                { name: 'identifierOrCriteria', type: 'uint256' },
                { name: 'startAmount', type: 'uint256' },
                { name: 'endAmount', type: 'uint256' }
              ]},
              { name: 'consideration', type: 'tuple[]', components: [
                { name: 'itemType', type: 'uint8' },
                { name: 'token', type: 'address' },
                { name: 'identifierOrCriteria', type: 'uint256' },
                { name: 'startAmount', type: 'uint256' },
                { name: 'endAmount', type: 'uint256' },
                { name: 'recipient', type: 'address' }
              ]},
              { name: 'orderType', type: 'uint8' },
              { name: 'startTime', type: 'uint256' },
              { name: 'endTime', type: 'uint256' },
              { name: 'zoneHash', type: 'bytes32' },
              { name: 'salt', type: 'uint256' },
              { name: 'conduitKey', type: 'bytes32' },
              { name: 'counter', type: 'uint256' }
            ]
          }],
          outputs: [{ name: 'cancelled', type: 'bool' }]
        }],
        functionName: 'cancel',
        args: [[orderComponents]],
        account: this.account
      })

      const hash = await this.signer.writeContract(request)
      return { hash }
    } catch (error) {
      console.error('Error cancelling Seaport order:', error)
      throw error
    }
  }

  async makeOffer(nft, amount) {
    // For now, Seaport offers work similarly to listings but with reversed offer/consideration
    // This would need the same treatment as createListing with proper EIP-712 signing
    throw new Error('Seaport offers not yet implemented in simplified adapter')
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