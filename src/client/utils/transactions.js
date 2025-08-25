import { frameUtils } from '../components/frame-provider.js'
import { EVENTS, emit, eventBus } from '../utils/events.js'
import { createWalletClient, custom, createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { getMarketplaceAdapter } from './marketplace-adapter.js'
import { SEAPORT_ADDRESS, CONDUIT_ADDRESS } from './seaport-config.js'
import { 
  ADDRESSES, 
  encodeNFTExchange, 
  encodeERC20, 
  encodeERC721,
  encodeERC1155,
  ERC721_ABI,
  ERC1155_ABI,
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
   * Get viem clients for blockchain interaction
   */
  async getViemClients() {
    const account = await this.getWalletAddress()
    
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: custom(this.ethProvider)
    })
    
    const publicClient = createPublicClient({
      chain: base,
      transport: http('/api/rpc/proxy')
    })
    
    return { walletClient, publicClient, account }
  }

  /**
   * Send a transaction (legacy method for backward compatibility)
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
   * Create a new listing
   */
  async createListing(nftContract, tokenId, price, durationInDays, isERC1155 = false, useSeaport = false, contractType = null) {
    const { walletClient, publicClient, account } = await this.getViemClients()
    
    console.log('=== Starting createListing process ===')
    console.log('User address:', account)
    console.log('NFT contract:', nftContract)
    console.log('Token ID:', tokenId)
    console.log('Using:', useSeaport ? 'Seaport' : 'NFTExchange')

    // First check if user owns the NFT
    console.log('Checking NFT ownership...')
    const isOwner = await checkNFTOwnership(nftContract, tokenId, account, isERC1155)
    if (!isOwner) {
      throw new Error('You do not own this NFT')
    }
    console.log('✅ Ownership confirmed')

    // Get the appropriate adapter
    // If contractType is provided, use it. Otherwise fall back to useSeaport flag
    const adapterType = contractType || (useSeaport ? 'seaport' : 'nft_exchange')
    const adapter = getMarketplaceAdapter(
      adapterType,
      walletClient,
      account,
      publicClient
    )

    // For Seaport, always request approval for the conduit.
    // The user's wallet will handle cases where approval already exists.
    if (useSeaport) {
      console.log('--- Seaport Listing ---')
      const approvalTarget = CONDUIT_ADDRESS
      console.log('Requesting approval for Seaport Conduit:', approvalTarget)
      
      let approveTx
      try {
        if (isERC1155) {
          approveTx = await walletClient.writeContract({
            address: nftContract,
            abi: ERC1155_ABI,
            functionName: 'setApprovalForAll',
            args: [approvalTarget, true]
          })
        } else {
          approveTx = await walletClient.writeContract({
            address: nftContract,
            abi: ERC721_ABI,
            functionName: 'setApprovalForAll',
            args: [approvalTarget, true]
          })
        }
        
        console.log('Approval transaction sent:', approveTx)
        await this.waitForTransaction(approveTx)
        console.log('✅ NFT approval confirmed for Seaport conduit')
      } catch (error) {
        // This can happen if the user rejects the transaction.
        // Or if the contract doesn't support setApprovalForAll, which is rare.
        console.error('Approval transaction failed:', error)
        throw new Error('NFT approval is required to list on Seaport.')
      }
    } else {
      // NFTExchange approval logic (v1 or v2)
      const targetContract = adapterType === 'nft_exchange_v2' ? ADDRESSES.NFT_EXCHANGE_V2 : ADDRESSES.NFT_EXCHANGE
      const isApproved = await checkNFTApproval(nftContract, tokenId, account, targetContract, isERC1155)
      if (!isApproved) {
        console.log(`NFT not approved for ${adapterType}, sending approval transaction...`)
        let approveData
        if (isERC1155) {
          approveData = encodeERC1155.setApprovalForAll(targetContract, true)
        } else {
          approveData = encodeERC721.approve(targetContract, tokenId)
        }
        const approveTx = await this.sendTransaction(account, nftContract, approveData)
        await this.waitForTransaction(approveTx)
        console.log(`✅ NFT approved for ${adapterType} successfully`)
      }
    }

    // Create the listing through the adapter
    console.log('Creating listing through adapter...')
    console.log('Adapter type:', adapterType)
    console.log('Listing parameters:', {
      contract: nftContract,
      tokenId,
      isERC721: !isERC1155,
      price,
      duration: durationInDays * 24 * 60 * 60
    })
    
    try {
      const result = await adapter.createListing(
        { contract: nftContract, tokenId, isERC721: !isERC1155 },
        price,
        durationInDays * 24 * 60 * 60
      )
      
      console.log('✅ Listing created:', result)
      // For Seaport, return the full result including order data
      if (useSeaport && result.order) {
        return result
      }
      // For NFTExchange, just return the hash for backward compatibility
      return result.hash
    } catch (error) {
      console.error('❌ Create listing failed:', error)
      throw error
    }
  }

  /**
   * Approve USDC spending for the appropriate contract
   */
  async approveUSDC(amount, contractType = 'seaport') {
    const userAddress = await this.getWalletAddress()
    const amountInUSDC = toUSDCAmount(amount)
    // For Seaport, USDC needs to be approved to the conduit, not the Seaport contract
    // For NFT Exchange V2, use the V2 address
    let spenderAddress
    if (contractType === 'seaport') {
      spenderAddress = CONDUIT_ADDRESS
    } else if (contractType === 'nft_exchange_v2') {
      spenderAddress = ADDRESSES.NFT_EXCHANGE_V2
    } else {
      spenderAddress = ADDRESSES.NFT_EXCHANGE
    }
    
    console.log('Approving USDC:', amount, 'USDC for', contractType, 'to address:', spenderAddress)
    
    // Check current allowance
    const allowance = await checkUSDCAllowance(userAddress, spenderAddress)
    
    if (allowance >= amountInUSDC) {
      console.log('USDC already approved')
      return null // No transaction needed
    }
    
    // Approve USDC
    const approveData = encodeERC20.approve(spenderAddress, amountInUSDC)
    const approveTx = await this.sendTransaction(userAddress, ADDRESSES.USDC, approveData)
    console.log('USDC approval tx:', approveTx)
    
    // Wait for approval to be mined
    await this.waitForTransaction(approveTx)
    
    return approveTx
  }

  /**
   * Buy a listing (works for both NFTExchange and Seaport)
   */
  async buyListing(listing) {
    const { walletClient, publicClient, account } = await this.getViemClients()
    
    console.log('Buying listing:', listing)
    
    // Determine contract type from listing
    const contractType = listing.contractType || 'nftexchange'
    const adapter = getMarketplaceAdapter(contractType, walletClient, account, publicClient)

    // For Seaport, approve USDC if needed
    if (contractType === 'seaport') {
      // For Seaport, we need to approve the total amount (including fees)
      // Calculate total from the order's consideration items
      if (listing.orderData && listing.orderData.parameters && listing.orderData.parameters.consideration) {
        const totalAmount = listing.orderData.parameters.consideration.reduce((sum, item) => {
          return sum + BigInt(item.startAmount)
        }, 0n)
        // Convert from USDC smallest unit (6 decimals) to human readable
        const totalInUSDC = Number(totalAmount) / 1e6
        console.log(`Approving total USDC amount for Seaport: ${totalInUSDC} USDC (${totalAmount} smallest units)`)
        await this.approveUSDC(totalInUSDC, 'seaport')
      } else {
        // Fallback to listing price if order data not available
        await this.approveUSDC(listing.price, 'seaport')
      }
    }
    
    const result = await adapter.buyListing(listing)
    return result.hash
  }

  /**
   * Cancel a listing
   */
  async cancelListing(listingId, contractType = 'nftexchange') {
    const { walletClient, publicClient, account } = await this.getViemClients()
    const adapter = getMarketplaceAdapter(contractType, walletClient, account, publicClient)
    
    const result = await adapter.cancelListing(listingId)
    return result.hash
  }

  /**
   * Make an offer on an NFT
   */
  async makeOffer(nftContract, tokenId, offerAmount, durationInDays, useSeaport = true) {
    const { walletClient, publicClient, account } = await this.getViemClients()
    const adapter = getMarketplaceAdapter(
      useSeaport ? 'seaport' : 'nftexchange',
      walletClient,
      account,
      publicClient
    )

    // Check USDC balance
    const amountInUSDC = toUSDCAmount(offerAmount)
    const balance = await checkUSDCBalance(account)
    if (balance < amountInUSDC) {
      throw new Error(`Insufficient USDC balance. You have ${Number(balance) / 1e6} USDC, need ${offerAmount} USDC`)
    }

    // Detect token standard for proxy contract compatibility
    const { detectTokenStandardCached } = await import('./token-standard.js')
    const tokenStandard = await detectTokenStandardCached(nftContract, tokenId, publicClient)
    const isERC721 = tokenStandard === 'ERC721'

    // Approve USDC for the appropriate contract
    await this.approveUSDC(offerAmount, useSeaport ? 'seaport' : 'nftexchange')

    // Make the offer
    const result = await adapter.makeOffer(
      { contract: nftContract, tokenId, isERC721 },
      offerAmount
    )
    
    return result.hash
  }

  /**
   * Accept an offer
   */
  async acceptOffer(offer, nftContract, tokenId, isERC1155 = false) {
    const { walletClient, publicClient, account } = await this.getViemClients()
    const contractType = offer.contractType || 'nftexchange'
    const adapter = getMarketplaceAdapter(contractType, walletClient, account, publicClient)

    // Detect token standard if not provided
    if (isERC1155 === false) {
      const { detectTokenStandardCached } = await import('./token-standard.js')
      const tokenStandard = await detectTokenStandardCached(nftContract, tokenId, publicClient, account)
      isERC1155 = tokenStandard === 'ERC1155'
    }

    // For Seaport offers, we need to approve the NFT
    if (contractType === 'seaport') {
      const approvalTarget = CONDUIT_ADDRESS
      let isApproved = false
      
      if (isERC1155) {
        const approval = await publicClient.readContract({
          address: nftContract,
          abi: ERC1155_ABI,
          functionName: 'isApprovedForAll',
          args: [account, approvalTarget]
        })
        isApproved = approval
      } else {
        const approval = await publicClient.readContract({
          address: nftContract,
          abi: ERC721_ABI,
          functionName: 'isApprovedForAll',
          args: [account, approvalTarget]
        })
        isApproved = approval
      }

      if (!isApproved) {
        console.log('Approving NFT for Seaport conduit...')
        let approveTx
        
        if (isERC1155) {
          approveTx = await walletClient.writeContract({
            address: nftContract,
            abi: ERC1155_ABI,
            functionName: 'setApprovalForAll',
            args: [approvalTarget, true]
          })
        } else {
          approveTx = await walletClient.writeContract({
            address: nftContract,
            abi: ERC721_ABI,
            functionName: 'setApprovalForAll',
            args: [approvalTarget, true]
          })
        }
        
        await this.waitForTransaction(approveTx)
      }
    } else {
      // Original NFTExchange approval logic (v1 or v2)
      const targetContract = contractType === 'nft_exchange_v2' ? ADDRESSES.NFT_EXCHANGE_V2 : ADDRESSES.NFT_EXCHANGE
      const isApproved = await checkNFTApproval(nftContract, tokenId, account, targetContract, isERC1155)
      
      if (!isApproved) {
        let approveData
        if (isERC1155) {
          approveData = encodeERC1155.setApprovalForAll(targetContract, true)
        } else {
          approveData = encodeERC721.approve(targetContract, tokenId)
        }
        
        const approveTx = await this.sendTransaction(account, nftContract, approveData)
        await this.waitForTransaction(approveTx)
      }
    }

    const result = await adapter.acceptOffer(offer.id || offer)
    return result.hash
  }

  /**
   * Cancel an offer
   */
  async cancelOffer(offerId, contractType = 'nftexchange') {
    if (contractType === 'seaport') {
      // Seaport uses cancelListing for offers too
      return this.cancelListing(offerId, 'seaport')
    }
    
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