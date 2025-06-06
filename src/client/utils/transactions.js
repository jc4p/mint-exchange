import { frameUtils } from '../components/frame-provider.js'
import { EVENTS, emit, eventBus } from '../utils/events.js'
import { 
  ADDRESSES, 
  encodeNFTExchange, 
  encodeERC20, 
  encodeERC721,
  encodeERC1155,
  toUSDCAmount,
  checkUSDCAllowance,
  checkUSDCBalance,
  checkNFTApproval,
  checkNFTOwnership
} from './contract.js'

export class TransactionManager {
  constructor() {
    this.ethProvider = frameUtils.sdk.wallet.ethProvider
    this._walletAddress = window.userWalletAddress || null
    
    // Listen for wallet connection events
    eventBus.on(EVENTS.WALLET_CONNECTED, ({ address }) => {
      console.log('TransactionManager: Wallet connected', address)
      this._walletAddress = address
    })
  }

  /**
   * Get the user's wallet address
   */
  async getWalletAddress() {
    // Return cached address if available
    if (this._walletAddress) {
      return this._walletAddress
    }
    
    // Otherwise request it
    console.log('Requesting wallet address')
    const accounts = await this.ethProvider.request({
      method: 'eth_requestAccounts'
    })
    this._walletAddress = accounts[0]
    
    // Store globally and emit event
    if (this._walletAddress) {
      window.userWalletAddress = this._walletAddress
      emit(EVENTS.WALLET_CONNECTED, { address: this._walletAddress })
    }
    
    return this._walletAddress
  }

  /**
   * Send a transaction
   */
  async sendTransaction(from, to, data, value = '0x0') {
    return await this.ethProvider.request({
      method: 'eth_sendTransaction',
      params: [{
        from,
        to,
        data,
        value
      }]
    })
  }

  /**
   * Wait for a transaction to be mined using RPC proxy
   */
  async waitForTransaction(txHash, maxWaitTime = 30000) {
    console.log(`Waiting for transaction ${txHash} to be mined...`)
    const startTime = Date.now()
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Use our RPC proxy to check transaction receipt
        const response = await fetch('/api/rpc/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'eth_getTransactionReceipt',
            params: [txHash]
          })
        })
        
        const data = await response.json()
        const receipt = data.result
        
        if (receipt && receipt.blockNumber) {
          console.log(`Transaction mined in block ${parseInt(receipt.blockNumber, 16)}`)
          console.log(`Transaction status: ${receipt.status === '0x1' ? '✅ Success' : '❌ Failed'}`)
          return receipt
        }
      } catch (error) {
        console.log('Error checking transaction receipt:', error)
      }
      
      // Wait 2 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    
    throw new Error(`Transaction ${txHash} not mined after ${maxWaitTime}ms`)
  }

  /**
   * Buy an NFT listing
   */
  async buyListing(listingId, price) {
    const userAddress = await this.getWalletAddress()
    const priceInUSDC = toUSDCAmount(price)

    // Check USDC balance
    const balance = await checkUSDCBalance(userAddress)
    if (balance < priceInUSDC) {
      throw new Error(`Insufficient USDC balance. You have ${Number(balance) / 1e6} USDC, need ${price} USDC`)
    }

    // Check USDC allowance
    const allowance = await checkUSDCAllowance(userAddress, ADDRESSES.NFT_EXCHANGE)
    
    // If allowance is insufficient, approve USDC
    if (allowance < priceInUSDC) {
      console.log('Approving USDC spending...')
      const approveData = encodeERC20.approve(ADDRESSES.NFT_EXCHANGE, priceInUSDC)
      const approveTx = await this.sendTransaction(userAddress, ADDRESSES.USDC, approveData)
      console.log('USDC approval tx:', approveTx)
      
      // Wait for approval to be mined
      await this.waitForTransaction(approveTx)
    }

    // Buy the listing
    console.log('Buying listing...')
    const buyData = encodeNFTExchange.buyListing(listingId)
    const buyTx = await this.sendTransaction(userAddress, ADDRESSES.NFT_EXCHANGE, buyData)
    console.log('Buy listing tx:', buyTx)

    return buyTx
  }

  /**
   * Create a new listing
   */
  async createListing(nftContract, tokenId, price, durationInDays, isERC1155 = false) {
    const userAddress = await this.getWalletAddress()
    const priceInUSDC = toUSDCAmount(price)
    const durationInSeconds = durationInDays * 24 * 60 * 60

    console.log('=== Starting createListing process ===')
    console.log('User address:', userAddress)
    console.log('NFT contract:', nftContract)
    console.log('Token ID:', tokenId)
    console.log('NFT Exchange address:', ADDRESSES.NFT_EXCHANGE)

    // First check if user owns the NFT
    console.log('Checking NFT ownership...')
    const isOwner = await checkNFTOwnership(nftContract, tokenId, userAddress, isERC1155)
    if (!isOwner) {
      throw new Error('You do not own this NFT')
    }
    console.log('✅ Ownership confirmed')

    // Check NFT approval
    console.log('Checking current approval status...')
    const isApproved = await checkNFTApproval(nftContract, tokenId, userAddress, isERC1155)
    console.log('Current approval status:', isApproved)
    
    if (!isApproved) {
      console.log('NFT not approved, sending approval transaction...')
      let approveData
      
      if (isERC1155) {
        // ERC1155 requires setApprovalForAll
        approveData = encodeERC1155.setApprovalForAll(ADDRESSES.NFT_EXCHANGE, true)
        console.log('Using ERC1155 setApprovalForAll')
      } else {
        // For ERC721, use specific token approval
        approveData = encodeERC721.approve(ADDRESSES.NFT_EXCHANGE, tokenId)
        console.log('Using ERC721 approve for token:', tokenId)
      }
      
      console.log('Sending approval transaction...')
      const approveTx = await this.sendTransaction(userAddress, nftContract, approveData)
      console.log('Approval transaction hash:', approveTx)
      
      // Wait for approval to be mined
      console.log('Waiting for approval transaction to be mined...')
      const approvalReceipt = await this.waitForTransaction(approveTx)
      console.log('Approval transaction mined! Receipt:', approvalReceipt)
      
      // Wait an extra second for state to propagate
      console.log('Waiting 1 second for state propagation...')
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Double-check approval after waiting
      console.log('Double-checking approval status...')
      const isNowApproved = await checkNFTApproval(nftContract, tokenId, userAddress, isERC1155)
      console.log('Approval status after waiting:', isNowApproved)
      
      if (!isNowApproved) {
        throw new Error('NFT approval failed. The approval transaction was mined but the contract is still not approved.')
      }
      console.log('✅ NFT approved successfully')
    } else {
      console.log('✅ NFT already approved')
    }

    // Create the listing
    console.log('Creating listing with params:', {
      nftContract,
      tokenId,
      priceInUSDC: priceInUSDC.toString(),
      durationInSeconds,
      userAddress
    })
    
    try {
      const createData = encodeNFTExchange.createListing(nftContract, tokenId, priceInUSDC, durationInSeconds)
      console.log('Encoded createListing data:', createData)
      
      console.log('Sending createListing transaction...')
      const createTx = await this.sendTransaction(userAddress, ADDRESSES.NFT_EXCHANGE, createData)
      console.log('✅ Create listing transaction sent:', createTx)
      
      return createTx
    } catch (error) {
      console.error('❌ Create listing failed:', error)
      console.error('Full error:', JSON.stringify(error, null, 2))
      
      if (error.message?.includes('UnauthorizedCaller')) {
        // Let's check the approval status one more time
        const finalApprovalCheck = await checkNFTApproval(nftContract, tokenId, userAddress, isERC1155)
        console.error('Final approval check:', finalApprovalCheck)
        
        throw new Error(`The NFT Exchange contract is not authorized to transfer your NFT. 
          Approval status: ${finalApprovalCheck}. 
          This might be a timing issue. Please try again in a few seconds.`)
      }
      throw error
    }
  }

  /**
   * Cancel a listing
   */
  async cancelListing(listingId) {
    const userAddress = await this.getWalletAddress()
    const cancelData = encodeNFTExchange.cancelListing(listingId)
    return await this.sendTransaction(userAddress, ADDRESSES.NFT_EXCHANGE, cancelData)
  }

  /**
   * Make an offer on an NFT
   */
  async makeOffer(nftContract, tokenId, offerAmount, durationInDays) {
    const userAddress = await this.getWalletAddress()
    const amountInUSDC = toUSDCAmount(offerAmount)
    const durationInSeconds = durationInDays * 24 * 60 * 60

    // Check USDC balance
    const balance = await checkUSDCBalance(userAddress)
    if (balance < amountInUSDC) {
      throw new Error(`Insufficient USDC balance. You have ${Number(balance) / 1e6} USDC, need ${offerAmount} USDC`)
    }

    // Check USDC allowance
    const allowance = await checkUSDCAllowance(userAddress, ADDRESSES.NFT_EXCHANGE)
    
    // If allowance is insufficient, approve USDC
    if (allowance < amountInUSDC) {
      console.log('Approving USDC for offer...')
      const approveData = encodeERC20.approve(ADDRESSES.NFT_EXCHANGE, amountInUSDC)
      const approveTx = await this.sendTransaction(userAddress, ADDRESSES.USDC, approveData)
      console.log('USDC approval tx:', approveTx)
      
      // Wait for approval to be mined
      await this.waitForTransaction(approveTx)
    }

    // Make the offer
    console.log('Making offer...')
    const offerData = encodeNFTExchange.makeOffer(nftContract, tokenId, amountInUSDC, durationInSeconds)
    const offerTx = await this.sendTransaction(userAddress, ADDRESSES.NFT_EXCHANGE, offerData)
    console.log('Make offer tx:', offerTx)

    return offerTx
  }

  /**
   * Accept an offer
   */
  async acceptOffer(offerId, nftContract, tokenId, isERC1155 = false) {
    const userAddress = await this.getWalletAddress()

    // Check NFT approval
    const isApproved = await checkNFTApproval(nftContract, tokenId, userAddress, isERC1155)
    
    if (!isApproved) {
      console.log('Approving NFT transfer for offer acceptance...')
      let approveData
      if (isERC1155) {
        approveData = encodeERC1155.setApprovalForAll(ADDRESSES.NFT_EXCHANGE, true)
      } else {
        // For ERC721, approve only the specific token
        approveData = encodeERC721.approve(ADDRESSES.NFT_EXCHANGE, tokenId)
      }
      
      const approveTx = await this.sendTransaction(userAddress, nftContract, approveData)
      console.log('NFT approval tx:', approveTx)
      
      // Wait for approval to be mined
      await this.waitForTransaction(approveTx)
    }

    // Accept the offer
    console.log('Accepting offer...')
    const acceptData = encodeNFTExchange.acceptOffer(offerId)
    const acceptTx = await this.sendTransaction(userAddress, ADDRESSES.NFT_EXCHANGE, acceptData)
    console.log('Accept offer tx:', acceptTx)

    return acceptTx
  }

  /**
   * Cancel an offer
   */
  async cancelOffer(offerId) {
    const userAddress = await this.getWalletAddress()
    const cancelData = encodeNFTExchange.cancelOffer(offerId)
    return await this.sendTransaction(userAddress, ADDRESSES.NFT_EXCHANGE, cancelData)
  }

  /**
   * Check if the current chain is Base mainnet
   */
  async checkNetwork() {
    const chainId = await this.ethProvider.request({
      method: 'eth_chainId'
    })
    
    const chainIdDecimal = typeof chainId === 'number' ? chainId : parseInt(chainId, 16)
    
    if (chainIdDecimal !== 8453) {
      // Try to switch to Base
      try {
        await this.ethProvider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x2105' }] // Base mainnet chainId in hex
        })
      } catch (error) {
        throw new Error('Please switch to Base mainnet to continue')
      }
    }
  }
}

// Export a singleton instance
export const transactionManager = new TransactionManager()