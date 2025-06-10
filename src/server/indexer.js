import { Database } from './db.js'
import { BlockchainService } from './blockchain.js'

/**
 * Event indexer for syncing blockchain events with the database
 */
export class EventIndexer {
  constructor(env) {
    this.env = env
    this.db = new Database(env.DB)
    this.blockchain = new BlockchainService(env)
  }

  /**
   * Get the last indexed block from the database
   */
  async getLastIndexedBlock() {
    const result = await this.env.DB.prepare(
      'SELECT MAX(block_number) as last_block FROM indexed_blocks'
    ).first()
    
    // If no blocks indexed yet, start from contract deployment block
    const CONTRACT_DEPLOYMENT_BLOCK = 31090760
    return result?.last_block || CONTRACT_DEPLOYMENT_BLOCK
  }

  /**
   * Update the last indexed block
   */
  async updateLastIndexedBlock(blockNumber) {
    await this.env.DB.prepare(
      'INSERT OR REPLACE INTO indexed_blocks (id, block_number) VALUES (1, ?)'
    ).bind(blockNumber).run()
  }

  /**
   * Index events from the blockchain
   */
  async indexEvents(fromBlock = null, toBlock = null, maxRuntime = 50000) {
    try {
      const startTime = Date.now()
      
      // Get the last indexed block if not specified
      if (!fromBlock) {
        fromBlock = await this.getLastIndexedBlock()
        fromBlock = fromBlock + 1 // Start from next block
      }

      // Get the latest block if not specified
      if (!toBlock) {
        toBlock = await this.blockchain.getLatestBlockNumber()
        toBlock = Number(toBlock)
      }

      // Don't process if we're already up to date
      if (fromBlock > toBlock) {
        console.log('Already up to date. No new blocks to process.')
        return { processed: 0, fromBlock, toBlock }
      }

      // Limit how many blocks we process in one run
      const MAX_BLOCKS_PER_RUN = 100000 // Process max 10k blocks per run
      const originalToBlock = toBlock
      toBlock = Math.min(fromBlock + MAX_BLOCKS_PER_RUN - 1, toBlock)

      // Process in smaller chunks to avoid hitting RPC limits
      const CHUNK_SIZE = 100 // Reduced from 1000 to avoid rate limits
      let currentBlock = fromBlock
      let totalProcessed = 0

      while (currentBlock <= toBlock) {
        // Check if we're approaching the time limit
        if (Date.now() - startTime > maxRuntime) {
          console.log(`Approaching time limit, stopping at block ${currentBlock - 1}`)
          break
        }

        const chunkEnd = Math.min(currentBlock + CHUNK_SIZE - 1, toBlock)
        
        // console.log(`Processing blocks ${currentBlock} to ${chunkEnd}`)
        
        try {
          // Process events for this chunk
          await this.blockchain.processEvents(currentBlock, chunkEnd, this.db)
          
          // Update last indexed block after successful processing
          await this.updateLastIndexedBlock(chunkEnd)
          
          totalProcessed += (chunkEnd - currentBlock + 1)
          currentBlock = chunkEnd + 1
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100))
        } catch (error) {
          if (error.message?.includes('Too many subrequests')) {
            console.log('Rate limit hit, stopping indexing for this run')
            break
          }
          throw error
        }
      }

      const runtime = Date.now() - startTime
      console.log(`Indexing completed in ${runtime}ms`)

      return {
        processed: totalProcessed,
        fromBlock,
        toBlock: currentBlock - 1,
        lastIndexedBlock: currentBlock - 1,
        blocksRemaining: originalToBlock - (currentBlock - 1),
        runtime
      }
    } catch (error) {
      console.error('Error indexing events:', error)
      throw error
    }
  }

  /**
   * Process a single transaction from Alchemy webhook
   */
  async processWebhookTransaction(txHash, logs) {
    console.log(`Processing webhook transaction: ${txHash}`)
    
    // Process each log in the transaction
    for (const log of logs) {
      try {
        // Only process logs from our known contracts (NFTExchange or Seaport)
        const lowerCaseLogAddress = log.address.toLowerCase();
        const knownContracts = [];
        if (this.env.CONTRACT_ADDRESS) {
          knownContracts.push(this.env.CONTRACT_ADDRESS.toLowerCase());
        }
        if (this.env.SEAPORT_CONTRACT_ADDRESS) {
          knownContracts.push(this.env.SEAPORT_CONTRACT_ADDRESS.toLowerCase());
        }

        if (!knownContracts.includes(lowerCaseLogAddress)) {
          // console.log(`Webhook log from unknown address ${log.address}, skipping.`);
          continue;
        }

        // Create a viem-compatible log object
        const viemLog = {
          address: log.address,
          topics: log.topics,
          data: log.data,
          blockNumber: BigInt(log.blockNumber),
          transactionHash: log.transactionHash,
          logIndex: log.logIndex
        }

        // Process the log as an event
        const event = await this.blockchain.decodeAndProcessLog(viemLog, this.db)
        
        if (event) {
          console.log(`Processed event: ${event.eventName} from webhook`)
        }
      } catch (error) {
        console.error('Error processing webhook log:', error)
      }
    }
  }

  /**
   * Clean up expired NFTExchange listings
   * @param {number} checkLimit - Maximum number of active listings to check on-chain (default: 50)
   */
  async cleanupExpiredNFTExchangeListings(checkLimit = 50) {
    try {
      const startTime = Date.now()
      
      // First, mark expired listings in the database
      const expiredResult = await this.env.DB.prepare(`
        UPDATE listings 
        SET cancelled_at = datetime('now'), 
            cancel_tx_hash = 'auto_cancelled_expired'
        WHERE contract_type = 'nft_exchange'
        AND cancelled_at IS NULL
        AND sold_at IS NULL
        AND expiry < datetime('now')
        AND blockchain_listing_id IS NOT NULL
      `).run()
      
      const expiredCount = expiredResult.meta.changes
      console.log(`Marked ${expiredCount} expired NFTExchange listings as cancelled`)
      
      // Now check on-chain status for active listings
      const activeListings = await this.env.DB.prepare(`
        SELECT id, blockchain_listing_id, seller_address, nft_contract, token_id
        FROM listings
        WHERE contract_type = 'nft_exchange'
        AND blockchain_listing_id IS NOT NULL
        AND cancelled_at IS NULL
        AND sold_at IS NULL
        ORDER BY created_at DESC
        LIMIT ?
      `).bind(checkLimit).all()
      
      const NFT_EXCHANGE_ADDRESS = this.env.CONTRACT_ADDRESS || '0x06fB7424Ba65D587405b9C754Bc40dA9398B72F0'
      const { parseAbi } = await import('viem')
      const NFT_EXCHANGE_ABI = parseAbi([
        'function listings(uint256) view returns (address seller, address nftContract, uint256 tokenId, uint256 price, uint256 expiresAt, bool isERC721, bool sold, bool cancelled)'
      ])
      
      let soldCount = 0
      let cancelledCount = 0
      let notFoundCount = 0
      
      for (const listing of activeListings.results) {
        try {
          // Get on-chain listing data
          const onChainListing = await this.blockchain.publicClient.readContract({
            address: NFT_EXCHANGE_ADDRESS,
            abi: NFT_EXCHANGE_ABI,
            functionName: 'listings',
            args: [BigInt(listing.blockchain_listing_id)]
          })
          
          const [seller, nftContract, tokenId, price, expiresAt, isERC721, sold, cancelled] = onChainListing
          
          // Check if listing exists on-chain
          if (seller === '0x0000000000000000000000000000000000000000') {
            // Listing not found on-chain, mark as cancelled
            await this.env.DB.prepare(`
              UPDATE listings 
              SET cancelled_at = datetime('now'), 
                  cancel_tx_hash = 'auto_cancelled_not_found'
              WHERE id = ?
            `).bind(listing.id).run()
            notFoundCount++
          } else if (sold) {
            // Mark as sold if not already
            await this.env.DB.prepare(`
              UPDATE listings 
              SET sold_at = datetime('now'), 
                  buyer_address = '0x0000000000000000000000000000000000000000',
                  sale_tx_hash = 'auto_marked_sold'
              WHERE id = ?
            `).bind(listing.id).run()
            soldCount++
          } else if (cancelled) {
            // Mark as cancelled if not already
            await this.env.DB.prepare(`
              UPDATE listings 
              SET cancelled_at = datetime('now'), 
                  cancel_tx_hash = 'auto_marked_cancelled'
              WHERE id = ?
            `).bind(listing.id).run()
            cancelledCount++
          }
        } catch (error) {
          console.error(`Error checking listing ${listing.id}:`, error.message)
        }
      }
      
      const runtime = Date.now() - startTime
      
      return {
        runtime: `${runtime}ms`,
        expired: expiredCount,
        soldOnChain: soldCount,
        cancelledOnChain: cancelledCount,
        notFoundOnChain: notFoundCount,
        checked: activeListings.results.length
      }
    } catch (error) {
      console.error('Error cleaning up NFTExchange listings:', error)
      return {
        error: error.message,
        expired: 0,
        soldOnChain: 0,
        cancelledOnChain: 0,
        notFoundOnChain: 0,
        checked: 0
      }
    }
  }
}

/**
 * Scheduled worker export for Cloudflare Workers
 */
export default {
  async scheduled(event, env, ctx) {
    console.log('=== Scheduled indexer started ===')
    console.log(`Time: ${new Date().toISOString()}`)

    const indexer = new EventIndexer(env)
    try {
      // First, run the blockchain event indexing
      const result = await indexer.indexEvents()
      console.log('Indexing complete:', {
        blocksProcessed: result.processed,
        fromBlock: result.fromBlock,
        toBlock: result.toBlock,
        blocksRemaining: result.blocksRemaining,
        runtime: `${result.runtime}ms`
      })
      if (result.blocksRemaining > 0) {
        console.log(`Note: ${result.blocksRemaining} blocks remaining. Will continue in next run.`)
      }
      
      // Then clean up expired NFTExchange listings
      const cleanupResult = await indexer.cleanupExpiredNFTExchangeListings()
      console.log('NFTExchange cleanup complete:', cleanupResult)
      
      return new Response(
        JSON.stringify({ indexing: result, cleanup: cleanupResult }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    } catch (error) {
      console.error('Scheduled task failed:', error.message)
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }
}