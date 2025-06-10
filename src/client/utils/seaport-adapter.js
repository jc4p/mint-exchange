import { Seaport } from '@opensea/seaport-js'
import { BrowserProvider, JsonRpcProvider, JsonRpcSigner } from 'ethers'
import { parseUnits, getAddress } from 'viem'
import { 
  SEAPORT_ADDRESS, 
  USDC_ADDRESS, 
  FEE_RECIPIENT,
  FEE_BASIS_POINTS,
  ItemType,
  OrderType,
  calculateFeeAmounts 
} from './seaport-config.js'
import { getSeaportErrorMessage, debugSeaportError } from './seaport-errors.js'

// Custom provider that routes reads through proxy and writes through Frame
class HybridProvider extends JsonRpcProvider {
  constructor(frameEthProvider) {
    // Use the proxy for read operations with absolute URL
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8787'
    super(`${baseUrl}/api/rpc/proxy`)
    this.frameEthProvider = frameEthProvider
  }

  async getSigner(address) {
    // Return a custom signer that uses Frame for signing/sending
    return new HybridSigner(this, this.frameEthProvider, address)
  }
}

// Custom signer that uses Frame's ethProvider for all operations
class HybridSigner extends JsonRpcSigner {
  constructor(provider, frameEthProvider, address) {
    super(provider, address)
    this.frameEthProvider = frameEthProvider
    this._address = address
  }

  async getAddress() {
    return this._address
  }

  async signTypedData(domain, types, value) {
    // Use Frame's ethProvider for signing
    const typedData = {
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" }
        ],
        ...types
      },
      domain,
      primaryType: 'OrderComponents',
      message: value
    }

    const signature = await this.frameEthProvider.request({
      method: 'eth_signTypedData_v4',
      params: [this._address.toLowerCase(), JSON.stringify(typedData)]
    })

    return signature
  }

  async sendTransaction(tx) {
    // Use Frame's ethProvider for sending transactions
    const txParams = {
      from: this._address,
      to: tx.to,
      data: tx.data,
      value: tx.value ? '0x' + BigInt(tx.value).toString(16) : '0x0',
      gas: tx.gasLimit ? '0x' + BigInt(tx.gasLimit).toString(16) : undefined
    }

    const hash = await this.frameEthProvider.request({
      method: 'eth_sendTransaction',
      params: [txParams]
    })

    return { hash }
  }
}

// Seaport adapter using @opensea/seaport-js for payload generation
// and Frame's ethProvider for all wallet interactions
export class SeaportJSAdapter {
  constructor(account) {
    this.account = account
    this.seaport = null
    this.ethersProvider = null
    this.ethersSigner = null
  }

  async initialize() {
    if (this.seaport) return

    // Get Frame's ethProvider
    const { frameUtils } = await import('../components/frame-provider.js')
    const frameEthProvider = frameUtils.sdk.wallet.ethProvider

    // Create a hybrid provider that uses proxy for reads and Frame for writes
    this.ethersProvider = new HybridProvider(frameEthProvider)
    
    // Get the signer from the provider - this will use Frame's ethProvider for signing
    this.ethersSigner = await this.ethersProvider.getSigner(this.account)

    // Initialize Seaport with the hybrid signer
    this.seaport = new Seaport(this.ethersSigner, {
      overrides: {
        contractAddress: SEAPORT_ADDRESS
      }
    })
  }

  async createListing(nft, price, duration) {
    await this.initialize()

    const priceInWei = parseUnits(price.toString(), 6)
    const { sellerAmount, feeAmount } = calculateFeeAmounts(priceInWei.toString())
    
    const endTime = Math.floor(Date.now() / 1000) + duration

    try {
      console.log('Creating Seaport order with seaport-js...')

      // Use seaport-js to create the order structure (no blockchain calls yet)
      const { actions } = await this.seaport.createOrder({
        offer: [{
          itemType: nft.isERC721 ? ItemType.ERC721 : ItemType.ERC1155,
          token: getAddress(nft.contract),
          identifier: nft.tokenId.toString(),
          amount: "1"
        }],
        consideration: [
          {
            itemType: ItemType.ERC20,
            token: getAddress(USDC_ADDRESS),
            amount: sellerAmount,
            recipient: getAddress(this.account)
          },
          {
            itemType: ItemType.ERC20,
            token: getAddress(USDC_ADDRESS),
            amount: feeAmount,
            recipient: getAddress(FEE_RECIPIENT)
          }
        ],
        endTime: endTime.toString(),
        orderType: OrderType.FULL_OPEN,
        zone: '0x0000000000000000000000000000000000000000',
        zoneHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
        conduitKey: '0x0000000000000000000000000000000000000000000000000000000000000000'
      }, this.account)

      console.log('Order actions:', actions)
      
      // Find the create order action to get the order parameters
      const createOrderAction = actions.find(action => action.type === 'create')
      if (!createOrderAction) {
        throw new Error('No create order action found')
      }

      // Get the order parameters that need to be signed
      const orderParameters = await createOrderAction.getMessageToSign()
      
      console.log('Order parameters to sign:', orderParameters)

      // Now we sign using Frame's ethProvider directly (not through seaport-js)
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

      console.log('Signing order with Frame ethProvider...')
      const signature = await ethProvider.request({
        method: 'eth_signTypedData_v4',
        params: [this.account, JSON.stringify(typedData)]
      })
      
      console.log('Order signature:', signature)

      // Get order hash using seaport-js
      const orderHash = this.seaport.getOrderHash(orderParameters)

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
      debugSeaportError(error)
      const userMessage = getSeaportErrorMessage(error)
      throw new Error(userMessage)
    }
  }

  async buyListing(listing) {
    await this.initialize()

    try {
      console.log('=== SEAPORT BUY LISTING WITH SEAPORT-JS ===')
      console.log('Order data:', listing.orderData)

      // Validate order data
      if (!listing.orderData || !listing.orderData.parameters || !listing.orderData.signature) {
        throw new Error('Invalid order data: missing parameters or signature')
      }

      // Use seaport-js to generate the fulfillment transaction data
      const { actions } = await this.seaport.fulfillOrder({
        order: {
          parameters: listing.orderData.parameters,
          signature: listing.orderData.signature
        },
        accountAddress: this.account,
        conduitKey: listing.orderData.parameters.conduitKey
      })

      console.log('Fulfillment actions:', actions)
      
      // Find the exchange/transaction action
      const fulfillAction = actions.find(action => 
        action.type === 'exchange' || 
        action.type === 'transaction'
      )
      
      if (!fulfillAction) {
        throw new Error('No fulfillment action found')
      }

      // Get the transaction data from seaport-js
      const transactionRequest = await fulfillAction.transactionMethods.buildTransaction()
      
      console.log('Transaction request from seaport-js:', transactionRequest)

      // Send the transaction using Frame's ethProvider directly
      const { frameUtils } = await import('../components/frame-provider.js')
      const ethProvider = frameUtils.sdk.wallet.ethProvider
      
      console.log('Fulfilling order with Frame ethProvider...')
      const hash = await ethProvider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: this.account,
          to: transactionRequest.to,
          data: transactionRequest.data,
          value: transactionRequest.value ? '0x' + BigInt(transactionRequest.value).toString(16) : '0x0',
          gas: transactionRequest.gasLimit ? '0x' + BigInt(transactionRequest.gasLimit).toString(16) : undefined
        }]
      })
      
      return { hash }
    } catch (error) {
      console.error('Error fulfilling Seaport order:', error)
      debugSeaportError(error)
      const userMessage = getSeaportErrorMessage(error)
      throw new Error(userMessage)
    }
  }

  async cancelListing(orderComponents) {
    await this.initialize()

    try {
      console.log('Cancelling order with seaport-js...')

      // Use seaport-js to generate the cancel transaction
      const transactionMethods = this.seaport.cancelOrders([orderComponents])
      const transactionRequest = await transactionMethods.buildTransaction()
      
      console.log('Cancel transaction request from seaport-js:', transactionRequest)

      // Send the transaction using Frame's ethProvider directly
      const { frameUtils } = await import('../components/frame-provider.js')
      const ethProvider = frameUtils.sdk.wallet.ethProvider
      
      console.log('Cancelling order with Frame ethProvider...')
      const hash = await ethProvider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: this.account,
          to: transactionRequest.to,
          data: transactionRequest.data,
          value: '0x0',
          gas: transactionRequest.gasLimit ? '0x' + BigInt(transactionRequest.gasLimit).toString(16) : undefined
        }]
      })
      
      return { hash }
    } catch (error) {
      console.error('Error cancelling Seaport order:', error)
      debugSeaportError(error)
      const userMessage = getSeaportErrorMessage(error)
      throw new Error(userMessage)
    }
  }

  async makeOffer(nft, amount) {
    await this.initialize()

    const amountInWei = parseUnits(amount.toString(), 6)
    const { sellerAmount, feeAmount } = calculateFeeAmounts(amountInWei.toString())
    
    const endTime = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days

    try {
      console.log('Creating Seaport offer with seaport-js...')

      // Create an offer (inverse of listing)
      const { actions } = await this.seaport.createOrder({
        offer: [{
          itemType: ItemType.ERC20,
          token: getAddress(USDC_ADDRESS),
          amount: amountInWei.toString()
        }],
        consideration: [
          {
            itemType: nft.isERC721 ? ItemType.ERC721 : ItemType.ERC1155,
            token: getAddress(nft.contract),
            identifier: nft.tokenId.toString(),
            amount: "1",
            recipient: getAddress(this.account)
          }
        ],
        endTime: endTime.toString(),
        orderType: OrderType.FULL_OPEN,
        zone: '0x0000000000000000000000000000000000000000',
        zoneHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
        conduitKey: '0x0000000000000000000000000000000000000000000000000000000000000000'
      }, this.account)

      console.log('Offer actions:', actions)
      
      // Find the create order action
      const createOrderAction = actions.find(action => action.type === 'create')
      if (!createOrderAction) {
        throw new Error('No create order action found')
      }

      // Get the order parameters
      const orderParameters = await createOrderAction.getMessageToSign()
      
      // Sign using Frame's ethProvider
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

      const signature = await ethProvider.request({
        method: 'eth_signTypedData_v4',
        params: [getAddress(this.account), JSON.stringify(typedData)]
      })

      const orderHash = this.seaport.getOrderHash(orderParameters)

      return {
        hash: orderHash,
        contractType: 'seaport',
        order: {
          parameters: orderParameters,
          signature: signature
        }
      }
    } catch (error) {
      console.error('Error creating Seaport offer:', error)
      debugSeaportError(error)
      const userMessage = getSeaportErrorMessage(error)
      throw new Error(userMessage)
    }
  }

  async acceptOffer(offer) {
    // Accepting an offer is just fulfilling it
    return this.buyListing(offer)
  }
}