import { Database } from './db.js'
import { BlockchainService } from './blockchain.js'
import { parseAbi } from 'viem'

/**
 * Listing verifier for checking on-chain status of active listings
 */
export class ListingVerifier {
  constructor(env) {
    this.env = env
    this.db = new Database(env.DB)
    this.blockchain = new BlockchainService(env)
  }

  /**
   * Verify NFTExchange (v1 and v2) listings on-chain
   */
  async verifyNFTExchangeListings(checkLimit = 100) {
    try {
      const startTime = Date.now()
      
      // Get active NFTExchange listings (both v1 and v2)
      // Prioritize listings that haven't been checked recently or ever
      const activeListings = await this.env.DB.prepare(`
        SELECT 
          l.id, 
          l.blockchain_listing_id, 
          l.seller_address, 
          l.nft_contract, 
          l.token_id, 
          l.contract_type,
          lv.last_verified_at,
          lv.verification_count
        FROM listings l
        LEFT JOIN listing_verifications lv ON l.id = lv.listing_id
        WHERE l.contract_type IN ('nft_exchange', 'nft_exchange_v2')
        AND l.blockchain_listing_id IS NOT NULL
        AND l.cancelled_at IS NULL
        AND l.sold_at IS NULL
        ORDER BY 
          CASE 
            WHEN lv.last_verified_at IS NULL THEN 0
            ELSE julianday('now') - julianday(lv.last_verified_at)
          END DESC,
          l.created_at DESC
        LIMIT ?
      `).bind(checkLimit).all()
      
      const NFT_EXCHANGE_ABI = parseAbi([
        'function listings(uint256) view returns (address seller, address nftContract, uint256 tokenId, uint256 price, uint256 expiresAt, bool isERC721, bool sold, bool cancelled)'
      ])
      
      const stats = {
        expired: 0,
        sold: 0,
        cancelled: 0,
        notFound: 0,
        active: 0,
        errors: 0
      }
      
      for (const listing of activeListings.results) {
        try {
          // Determine contract address based on type
          const contractAddress = listing.contract_type === 'nft_exchange_v2' 
            ? this.env.NFT_EXCHANGE_V2_ADDRESS 
            : this.env.CONTRACT_ADDRESS
          
          // Extract numeric listing ID (remove v2_ prefix if present)
          const listingId = listing.blockchain_listing_id.startsWith('v2_') 
            ? listing.blockchain_listing_id.substring(3)
            : listing.blockchain_listing_id
          
          // Get on-chain listing data
          const onChainListing = await this.blockchain.client.readContract({
            address: contractAddress,
            abi: NFT_EXCHANGE_ABI,
            functionName: 'listings',
            args: [BigInt(listingId)]
          })
          
          const [seller, nftContract, tokenId, price, expiresAt, isERC721, sold, cancelled] = onChainListing
          
          // Track verification status
          let verificationStatus = 'active'
          
          // Check if listing exists on-chain
          if (seller === '0x0000000000000000000000000000000000000000') {
            // Listing not found on-chain
            await this.env.DB.prepare(`
              UPDATE listings 
              SET cancelled_at = datetime('now'), 
                  cancel_tx_hash = 'auto_cancelled_not_found_onchain'
              WHERE id = ?
            `).bind(listing.id).run()
            stats.notFound++
            verificationStatus = 'not_found'
          } else if (sold) {
            // Mark as sold if not already
            await this.env.DB.prepare(`
              UPDATE listings 
              SET sold_at = datetime('now'), 
                  buyer_address = '0x0000000000000000000000000000000000000000',
                  sale_tx_hash = 'auto_marked_sold_from_verification'
              WHERE id = ?
            `).bind(listing.id).run()
            stats.sold++
            verificationStatus = 'sold'
          } else if (cancelled) {
            // Mark as cancelled if not already
            await this.env.DB.prepare(`
              UPDATE listings 
              SET cancelled_at = datetime('now'), 
                  cancel_tx_hash = 'auto_marked_cancelled_from_verification'
              WHERE id = ?
            `).bind(listing.id).run()
            stats.cancelled++
            verificationStatus = 'cancelled'
          } else if (expiresAt > 0 && Number(expiresAt) < Math.floor(Date.now() / 1000)) {
            // Mark as expired
            await this.env.DB.prepare(`
              UPDATE listings 
              SET cancelled_at = datetime('now'), 
                  cancel_tx_hash = 'auto_cancelled_expired_from_verification'
              WHERE id = ?
            `).bind(listing.id).run()
            stats.expired++
            verificationStatus = 'expired'
          } else {
            // Listing is still active
            stats.active++
            verificationStatus = 'active'
          }
          
          // Update verification tracking
          await this.env.DB.prepare(`
            INSERT INTO listing_verifications (listing_id, last_verified_at, verification_count, last_status)
            VALUES (?, datetime('now'), 1, ?)
            ON CONFLICT(listing_id) DO UPDATE SET
              last_verified_at = datetime('now'),
              verification_count = verification_count + 1,
              last_status = excluded.last_status
          `).bind(listing.id, verificationStatus).run()
        } catch (error) {
          console.error(`Error verifying listing ${listing.id}:`, error.message)
          stats.errors++
          
          // Track failed verification
          try {
            await this.env.DB.prepare(`
              INSERT INTO listing_verifications (listing_id, last_verified_at, verification_count, last_status)
              VALUES (?, datetime('now'), 1, 'error')
              ON CONFLICT(listing_id) DO UPDATE SET
                last_verified_at = datetime('now'),
                verification_count = verification_count + 1,
                last_status = 'error'
            `).bind(listing.id).run()
          } catch (trackingError) {
            console.error(`Error tracking verification for listing ${listing.id}:`, trackingError.message)
          }
        }
      }
      
      const runtime = Date.now() - startTime
      
      return {
        runtime: `${runtime}ms`,
        checked: activeListings.results.length,
        ...stats
      }
    } catch (error) {
      console.error('Error verifying NFTExchange listings:', error)
      return {
        error: error.message,
        checked: 0
      }
    }
  }

  /**
   * Verify Seaport listings on-chain
   */
  async verifySeaportListings(checkLimit = 50) {
    try {
      const startTime = Date.now()
      
      // Get active Seaport listings
      // Prioritize listings that haven't been checked recently or ever
      const activeListings = await this.env.DB.prepare(`
        SELECT 
          l.id, 
          l.order_hash, 
          l.seller_address,
          lv.last_verified_at,
          lv.verification_count
        FROM listings l
        LEFT JOIN listing_verifications lv ON l.id = lv.listing_id
        WHERE l.contract_type = 'seaport'
        AND l.order_hash IS NOT NULL
        AND l.cancelled_at IS NULL
        AND l.sold_at IS NULL
        ORDER BY 
          CASE 
            WHEN lv.last_verified_at IS NULL THEN 0
            ELSE julianday('now') - julianday(lv.last_verified_at)
          END DESC,
          l.created_at DESC
        LIMIT ?
      `).bind(checkLimit).all()
      
      const SEAPORT_ABI = parseAbi([
        'function getOrderStatus(bytes32 orderHash) view returns (bool isValidated, bool isCancelled, uint256 totalFilled, uint256 totalSize)'
      ])
      
      const stats = {
        cancelled: 0,
        filled: 0,
        active: 0,
        errors: 0
      }
      
      for (const listing of activeListings.results) {
        try {
          // Get on-chain order status
          const orderStatus = await this.blockchain.client.readContract({
            address: this.env.SEAPORT_CONTRACT_ADDRESS,
            abi: SEAPORT_ABI,
            functionName: 'getOrderStatus',
            args: [listing.order_hash]
          })
          
          const [isValidated, isCancelled, totalFilled, totalSize] = orderStatus
          
          // Track verification status
          let verificationStatus = 'active'
          
          if (isCancelled) {
            // Order was cancelled on-chain
            await this.env.DB.prepare(`
              UPDATE listings 
              SET cancelled_at = datetime('now'), 
                  cancel_tx_hash = 'auto_marked_cancelled_from_verification'
              WHERE id = ?
            `).bind(listing.id).run()
            stats.cancelled++
            verificationStatus = 'cancelled'
          } else if (totalFilled > 0 && totalFilled >= totalSize) {
            // Order was fully filled
            await this.env.DB.prepare(`
              UPDATE listings 
              SET sold_at = datetime('now'), 
                  buyer_address = '0x0000000000000000000000000000000000000000',
                  sale_tx_hash = 'auto_marked_sold_from_verification'
              WHERE id = ?
            `).bind(listing.id).run()
            stats.filled++
            verificationStatus = 'sold'
          } else {
            // Order is still active
            stats.active++
            verificationStatus = 'active'
          }
          
          // Update verification tracking
          await this.env.DB.prepare(`
            INSERT INTO listing_verifications (listing_id, last_verified_at, verification_count, last_status)
            VALUES (?, datetime('now'), 1, ?)
            ON CONFLICT(listing_id) DO UPDATE SET
              last_verified_at = datetime('now'),
              verification_count = verification_count + 1,
              last_status = excluded.last_status
          `).bind(listing.id, verificationStatus).run()
        } catch (error) {
          console.error(`Error verifying Seaport listing ${listing.id}:`, error.message)
          stats.errors++
          
          // Track failed verification
          try {
            await this.env.DB.prepare(`
              INSERT INTO listing_verifications (listing_id, last_verified_at, verification_count, last_status)
              VALUES (?, datetime('now'), 1, 'error')
              ON CONFLICT(listing_id) DO UPDATE SET
                last_verified_at = datetime('now'),
                verification_count = verification_count + 1,
                last_status = 'error'
            `).bind(listing.id).run()
          } catch (trackingError) {
            console.error(`Error tracking verification for Seaport listing ${listing.id}:`, trackingError.message)
          }
        }
      }
      
      const runtime = Date.now() - startTime
      
      return {
        runtime: `${runtime}ms`,
        checked: activeListings.results.length,
        ...stats
      }
    } catch (error) {
      console.error('Error verifying Seaport listings:', error)
      return {
        error: error.message,
        checked: 0
      }
    }
  }

  /**
   * Main verification function that checks all listing types
   */
  async verifyAllListings(options = {}) {
    const {
      nftExchangeLimit = 100,
      seaportLimit = 50,
      maxRuntime = 55000 // 55 seconds to leave buffer for worker timeout
    } = options
    
    const startTime = Date.now()
    const results = {
      nftExchange: null,
      seaport: null,
      totalRuntime: 0
    }
    
    // Verify NFTExchange listings first
    if (Date.now() - startTime < maxRuntime) {
      console.log('Verifying NFTExchange listings...')
      results.nftExchange = await this.verifyNFTExchangeListings(nftExchangeLimit)
    }
    
    // Verify Seaport listings if we have time
    if (Date.now() - startTime < maxRuntime - 10000) { // Leave 10s buffer
      console.log('Verifying Seaport listings...')
      results.seaport = await this.verifySeaportListings(seaportLimit)
    }
    
    results.totalRuntime = `${Date.now() - startTime}ms`
    
    return results
  }
}

/**
 * Scheduled worker export for Cloudflare Workers
 */
export default {
  async scheduled(event, env, ctx) {
    console.log('=== Scheduled listing verifier started ===')
    console.log(`Time: ${new Date().toISOString()}`)

    const verifier = new ListingVerifier(env)
    try {
      const result = await verifier.verifyAllListings()
      
      console.log('Verification complete:', result)
      
      return new Response(
        JSON.stringify({ verification: result }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    } catch (error) {
      console.error('Scheduled verification failed:', error.message)
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }
}