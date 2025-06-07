import { ShareImageGenerator } from './share-image-generator.js'
import { Database } from '../db.js'
import { fetchNFTMetadata } from '../utils/metadata.js'

export class ShareImageQueue {
  constructor(env) {
    this.env = env
    this.generator = new ShareImageGenerator(env)
    this.db = new Database(env.DB)
  }

  /**
   * Queue share image generation for a listing using Cloudflare Queue
   * This properly queues the task instead of running it in the background
   */
  async queueShareImageGeneration(listingId) {
    try {
      // Debug: Check if queue binding exists
      if (!this.env.SHARE_IMAGE_QUEUE) {
        console.error('SHARE_IMAGE_QUEUE binding not found in environment')
        throw new Error('Queue binding not available')
      }

      console.log(`Attempting to queue share image generation for listing ${listingId}`)
      
      // Send message to the queue
      await this.env.SHARE_IMAGE_QUEUE.send({
        type: 'generate_share_image',
        listingId: listingId,
        timestamp: Date.now()
      })
      
      console.log(`Successfully queued share image generation for listing ${listingId}`)
    } catch (error) {
      console.error(`Failed to queue share image generation for listing ${listingId}:`, error)
      console.log(`Falling back to immediate generation for listing ${listingId}`)
      // Fallback to immediate generation if queue fails
      this.generateShareImage(listingId).catch(fallbackError => {
        console.error(`Fallback share image generation also failed for listing ${listingId}:`, fallbackError)
      })
    }
  }

  /**
   * Process queued share image generation tasks
   * This is called by the queue consumer
   */
  static async processQueueMessage(message, env) {
    console.log('processQueueMessage called with:', message.body)
    
    const queue = new ShareImageQueue(env)
    
    try {
      const { type, listingId } = message.body
      
      console.log(`Processing queue message - type: ${type}, listingId: ${listingId}`)
      
      if (type === 'generate_share_image') {
        console.log(`Starting share image generation for listing ${listingId}`)
        await queue.generateShareImage(listingId)
        console.log(`Successfully processed share image generation for listing ${listingId}`)
      } else {
        console.warn(`Unknown queue message type: ${type}`)
      }
    } catch (error) {
      console.error(`Error processing queue message:`, error)
      console.error('Full error details:', error.stack)
      throw error // Re-throw to trigger queue retry logic
    }
  }

  /**
   * Actually generate the share image
   */
  async generateShareImage(listingId) {
    try {
      // Fetch the listing with seller info
      const listing = await this.db.getListing(listingId)
      
      if (!listing) {
        console.error(`Listing ${listingId} not found`)
        return
      }

      // Skip if already has share image
      if (listing.share_image_url) {
        console.log(`Listing ${listingId} already has share image`)
        return
      }

      // Fetch collection name if not available
      let collectionName = listing.collection_name
      if (!collectionName) {
        const metadata = await fetchNFTMetadata(
          this.env,
          listing.nft_contract,
          listing.token_id,
          listing.metadata_uri
        )
        collectionName = metadata.collection_name || 'Unknown Collection'
      }

      // Generate the share image
      const shareImageUrl = await this.generator.generateShareImage({
        id: listing.id,
        name: listing.name,
        token_id: listing.token_id,
        price: listing.price,
        image_url: listing.image_url,
        seller_username: listing.username,
        seller_display_name: listing.display_name,
        seller_pfp_url: listing.pfp_url,
        seller_fid: listing.seller_fid,
        collection_name: collectionName,
        expiry: listing.expiry
      })

      // Update the listing with the share image URL
      await this.generator.updateListingShareImage(listingId, shareImageUrl)
      
      console.log(`Share image generated for listing ${listingId}: ${shareImageUrl}`)
    } catch (error) {
      console.error(`Error generating share image for listing ${listingId}:`, error)
      throw error
    }
  }

  /**
   * Regenerate share images for existing listings (admin function)
   */
  async regenerateShareImages(limit = 10) {
    try {
      // Get listings without share images
      const listings = await this.env.DB.prepare(`
        SELECT l.*, u.username, u.display_name, u.pfp_url
        FROM listings l
        LEFT JOIN users u ON u.fid = l.seller_fid
        WHERE l.share_image_url IS NULL
        AND l.cancelled_at IS NULL
        ORDER BY l.created_at DESC
        LIMIT ?
      `).bind(limit).all()

      const results = []
      
      for (const listing of listings.results) {
        try {
          // Fetch collection name if not available
          let collectionName = listing.collection_name
          if (!collectionName) {
            const metadata = await fetchNFTMetadata(
              this.env,
              listing.nft_contract,
              listing.token_id,
              listing.metadata_uri
            )
            collectionName = metadata.collection_name || 'Unknown Collection'
          }

          const shareImageUrl = await this.generator.generateShareImage({
            id: listing.id,
            name: listing.name,
            token_id: listing.token_id,
            price: listing.price,
            image_url: listing.image_url,
            seller_username: listing.username,
            seller_display_name: listing.display_name,
            seller_pfp_url: listing.pfp_url,
            seller_fid: listing.seller_fid,
            collection_name: collectionName,
            expiry: listing.expiry
          })

          await this.generator.updateListingShareImage(listing.id, shareImageUrl)
          
          results.push({
            listingId: listing.id,
            status: 'success',
            shareImageUrl
          })
        } catch (error) {
          console.error(`Failed to regenerate share image for listing ${listing.id}:`, error)
          results.push({
            listingId: listing.id,
            status: 'error',
            error: error.message
          })
        }
      }

      return results
    } catch (error) {
      console.error('Error regenerating share images:', error)
      throw error
    }
  }
}