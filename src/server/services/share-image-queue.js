export class ShareImageQueue {
  constructor(env) {
    this.env = env
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
}