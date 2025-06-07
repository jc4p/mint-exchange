import { parseAbi, decodeEventLog } from 'viem'
import { createRpcClient } from './utils/rpc-client.js'
import { NeynarService } from './neynar.js'
import { fetchNFTMetadata } from './utils/metadata.js'
import { ShareImageQueue } from './services/share-image-queue.js'

// Contract configuration
const CONTRACT_ADDRESS = '0x06fB7424Ba65D587405b9C754Bc40dA9398B72F0'
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

// Event signatures for the NFT Exchange contract
const NFT_EXCHANGE_EVENTS = parseAbi([
  'event ListingCreated(uint256 indexed listingId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 price, string metadataURI)',
  'event ListingSold(uint256 indexed listingId, address indexed buyer, uint256 price)',
  'event ListingCancelled(uint256 indexed listingId)',
  'event OfferMade(uint256 indexed offerId, address indexed buyer, address indexed nftContract, uint256 tokenId, uint256 amount)',
  'event OfferAccepted(uint256 indexed offerId, address indexed seller)',
  'event OfferCancelled(uint256 indexed offerId)',
  'event MarketplaceFeeUpdated(uint256 oldFee, uint256 newFee)',
  'event FeeRecipientUpdated(address oldRecipient, address newRecipient)'
])

export class BlockchainService {
  constructor(env) {
    this.env = env
    this.client = createRpcClient(env)
    this.neynar = env.NEYNAR_API_KEY ? new NeynarService(env.NEYNAR_API_KEY) : null
    this.shareImageQueue = new ShareImageQueue(env)
  }

  /**
   * Get the latest block number
   */
  async getLatestBlockNumber() {
    return await this.client.getBlockNumber()
  }

  /**
   * Get events from the contract
   */
  async getContractEvents(fromBlock, toBlock) {
    try {
      const logs = await this.client.getLogs({
        address: CONTRACT_ADDRESS,
        fromBlock: BigInt(fromBlock),
        toBlock: BigInt(toBlock)
      })

      // Decode the logs
      const decodedEvents = []
      for (const log of logs) {
        try {
          const decoded = decodeEventLog({
            abi: NFT_EXCHANGE_EVENTS,
            data: log.data,
            topics: log.topics,
            strict: false  // Allow unknown events to be skipped
          })
          
          decodedEvents.push({
            eventName: decoded.eventName,
            args: decoded.args,
            blockNumber: Number(log.blockNumber),
            transactionHash: log.transactionHash,
            logIndex: log.logIndex
          })
        } catch (error) {
          // Only log if it's not an unknown event error
          if (!error.message?.includes('not found on ABI')) {
            console.error('Failed to decode log:', error)
          }
          // Skip unknown events silently
        }
      }

      return decodedEvents
    } catch (error) {
      console.error('Error fetching contract events:', error)
      throw error
    }
  }

  /**
   * Process ListingCreated event
   */
  async processListingCreated(event, db) {
    const { listingId, seller, nftContract, tokenId, price, metadataURI } = event.args
    
    console.log('Processing ListingCreated event:', {
      listingId: listingId.toString(),
      seller,
      nftContract,
      tokenId: tokenId.toString(),
      price: price.toString()
    })

    // Resolve seller address to FID
    let sellerFid = null
    if (this.neynar) {
      const users = await this.neynar.fetchUsersByAddress(seller)
      if (users.length > 0) {
        // Use the first user found (addresses can belong to multiple users)
        sellerFid = users[0].fid
        
        // Ensure user exists in our database
        const existingUser = await db.getUser(sellerFid)
        if (!existingUser) {
          await db.createOrUpdateUser({
            fid: sellerFid,
            username: users[0].username,
            display_name: users[0].display_name,
            pfp_url: users[0].pfp_url
          })
        }
      }
    }

    // Fetch metadata using unified utility
    const metadata = await fetchNFTMetadata(
      this.env,
      nftContract,
      tokenId.toString(),
      metadataURI
    )

    // Create listing in database
    const result = await db.createListing({
      blockchain_listing_id: listingId.toString(),
      seller_fid: sellerFid,
      seller_address: seller,
      nft_contract: nftContract,
      token_id: tokenId.toString(),
      price: Number(price) / 1e6, // Convert from USDC decimals
      expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Default 7 days
      metadata_uri: metadata.metadata_uri || metadataURI || '',
      image_url: metadata.image_url || '',
      name: metadata.name || `NFT #${tokenId}`,
      description: metadata.description || '',
      tx_hash: event.transactionHash
    })
    
    // Queue share image generation (non-blocking)
    if (result.meta && result.meta.last_row_id) {
      this.shareImageQueue.queueShareImageGeneration(result.meta.last_row_id)
    }
  }

  /**
   * Process ListingSold event
   */
  async processListingSold(event, db) {
    const { listingId, buyer, price } = event.args
    
    console.log('Processing ListingSold event:', {
      listingId: listingId.toString(),
      buyer,
      price: price.toString()
    })

    // Resolve buyer address to FID
    let buyerFid = null
    if (this.neynar) {
      const users = await this.neynar.fetchUsersByAddress(buyer)
      if (users.length > 0) {
        buyerFid = users[0].fid
        
        // Ensure user exists in our database
        const existingUser = await db.getUser(buyerFid)
        if (!existingUser) {
          await db.createOrUpdateUser({
            fid: buyerFid,
            username: users[0].username,
            display_name: users[0].display_name,
            pfp_url: users[0].pfp_url
          })
        }
      }
    }

    await db.markListingSold(listingId.toString(), buyer, buyerFid, event.transactionHash)
  }

  /**
   * Process ListingCancelled event
   */
  async processListingCancelled(event, db) {
    const { listingId } = event.args
    
    console.log('Processing ListingCancelled event:', {
      listingId: listingId.toString()
    })

    // Get the listing to find the seller
    const listing = await db.db
      .prepare(`
        SELECT * FROM listings 
        WHERE blockchain_listing_id = ?
      `)
      .bind(listingId.toString())
      .first()
      
    if (listing) {
      await db.cancelListing(listingId.toString(), listing.seller_address, event.transactionHash)
    }
  }

  /**
   * Process OfferMade event
   */
  async processOfferMade(event, db) {
    const { offerId, buyer, nftContract, tokenId, amount } = event.args
    
    console.log('Processing OfferMade event:', {
      offerId: offerId.toString(),
      buyer,
      nftContract,
      tokenId: tokenId.toString(),
      amount: amount.toString()
    })

    // Resolve buyer address to FID
    let buyerFid = null
    if (this.neynar) {
      const users = await this.neynar.fetchUsersByAddress(buyer)
      if (users.length > 0) {
        buyerFid = users[0].fid
        
        // Ensure user exists in our database
        const existingUser = await db.getUser(buyerFid)
        if (!existingUser) {
          await db.createOrUpdateUser({
            fid: buyerFid,
            username: users[0].username,
            display_name: users[0].display_name,
            pfp_url: users[0].pfp_url
          })
        }
      }
    }

    // Create offer in database
    await db.db.prepare(`
      INSERT INTO offers (
        blockchain_offer_id, buyer_fid, buyer_address, nft_contract, token_id, amount, expiry, tx_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      offerId.toString(),
      buyerFid,
      buyer.toLowerCase(),
      nftContract.toLowerCase(),
      tokenId.toString(),
      Number(amount) / 1e6, // Convert from USDC decimals
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Default 7 days
      event.transactionHash
    ).run()

    // Record activity
    await db.recordActivity({
      type: 'offer_made',
      actor_fid: buyerFid,
      actor_address: buyer,
      nft_contract: nftContract,
      token_id: tokenId.toString(),
      price: Number(amount) / 1e6,
      metadata: JSON.stringify({ offer_id: offerId.toString() }),
      tx_hash: event.transactionHash
    })
  }

  /**
   * Process OfferAccepted event
   */
  async processOfferAccepted(event, db) {
    const { offerId, seller } = event.args
    
    console.log('Processing OfferAccepted event:', {
      offerId: offerId.toString(),
      seller
    })

    // Resolve seller address to FID
    let sellerFid = null
    if (this.neynar) {
      const users = await this.neynar.fetchUsersByAddress(seller)
      if (users.length > 0) {
        sellerFid = users[0].fid
        
        // Ensure user exists in our database
        const existingUser = await db.getUser(sellerFid)
        if (!existingUser) {
          await db.createOrUpdateUser({
            fid: sellerFid,
            username: users[0].username,
            display_name: users[0].display_name,
            pfp_url: users[0].pfp_url
          })
        }
      }
    }

    // Update offer as accepted
    await db.db.prepare(`
      UPDATE offers 
      SET accepted_at = CURRENT_TIMESTAMP,
          seller_fid = ?,
          seller_address = ?,
          accept_tx_hash = ?
      WHERE blockchain_offer_id = ?
    `).bind(sellerFid, seller.toLowerCase(), event.transactionHash, offerId.toString()).run()

    // Get offer details for activity
    const offer = await db.db.prepare(`
      SELECT * FROM offers WHERE blockchain_offer_id = ?
    `).bind(offerId.toString()).first()

    if (offer) {
      // Record activity
      await db.recordActivity({
        type: 'offer_accepted',
        actor_fid: sellerFid,
        actor_address: seller,
        nft_contract: offer.nft_contract,
        token_id: offer.token_id,
        price: offer.amount,
        metadata: JSON.stringify({ 
          offer_id: offerId.toString(),
          buyer: offer.buyer_address,
          buyer_fid: offer.buyer_fid
        }),
        tx_hash: event.transactionHash
      })
    }
  }

  /**
   * Process OfferCancelled event
   */
  async processOfferCancelled(event, db) {
    const { offerId } = event.args
    
    console.log('Processing OfferCancelled event:', {
      offerId: offerId.toString()
    })

    // Update offer as cancelled
    await db.db.prepare(`
      UPDATE offers 
      SET cancelled_at = CURRENT_TIMESTAMP,
          cancel_tx_hash = ?
      WHERE blockchain_offer_id = ?
    `).bind(event.transactionHash, offerId.toString()).run()
  }

  /**
   * Decode and process a single log
   */
  async decodeAndProcessLog(log, db) {
    try {
      const decoded = decodeEventLog({
        abi: NFT_EXCHANGE_EVENTS,
        data: log.data,
        topics: log.topics
      })
      
      const event = {
        eventName: decoded.eventName,
        args: decoded.args,
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex
      }

      await this.processEvent(event, db)
      return event
    } catch (error) {
      console.error('Failed to decode log:', error)
      return null
    }
  }

  /**
   * Process a single event
   */
  async processEvent(event, db) {
    switch (event.eventName) {
      case 'ListingCreated':
        await this.processListingCreated(event, db)
        break
      case 'ListingSold':
        await this.processListingSold(event, db)
        break
      case 'ListingCancelled':
        await this.processListingCancelled(event, db)
        break
      case 'OfferMade':
        await this.processOfferMade(event, db)
        break
      case 'OfferAccepted':
        await this.processOfferAccepted(event, db)
        break
      case 'OfferCancelled':
        await this.processOfferCancelled(event, db)
        break
      default:
        console.log('Unhandled event:', event.eventName)
    }
  }

  /**
   * Process all events from a range of blocks
   */
  async processEvents(fromBlock, toBlock, db) {
    const events = await this.getContractEvents(fromBlock, toBlock)
    
    // console.log(`Processing ${events.length} events from blocks ${fromBlock} to ${toBlock}`)

    for (const event of events) {
      try {
        await this.processEvent(event, db)
      } catch (error) {
        console.error(`Error processing event ${event.eventName}:`, error)
      }
    }
  }
}