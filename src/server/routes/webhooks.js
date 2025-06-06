import { Hono } from 'hono'
import { EventIndexer } from '../indexer.js'

const webhooks = new Hono()

// Alchemy webhook endpoint
webhooks.post('/alchemy', async (c) => {
  try {
    const body = await c.req.json()
    
    // Verify the webhook signature if configured
    const alchemySignature = c.req.header('x-alchemy-signature')
    if (c.env.ALCHEMY_WEBHOOK_SECRET) {
      // TODO: Implement signature verification
      // For now, we'll trust the webhook
    }
    
    console.log('Received Alchemy webhook:', body.type)
    
    // Handle different webhook types
    if (body.type === 'ADDRESS_ACTIVITY') {
      const indexer = new EventIndexer(c.env)
      
      // Process each activity
      for (const activity of body.event.activity) {
        // Check if this is a transaction to our contract
        if (activity.toAddress?.toLowerCase() === c.env.CONTRACT_ADDRESS.toLowerCase() ||
            activity.fromAddress?.toLowerCase() === c.env.CONTRACT_ADDRESS.toLowerCase()) {
          
          console.log('Processing contract activity:', activity.hash)
          
          // Process the transaction logs
          if (activity.log) {
            await indexer.processWebhookTransaction(activity.hash, [activity.log])
          }
        }
      }
    } else if (body.type === 'MINED_TRANSACTION') {
      const indexer = new EventIndexer(c.env)
      
      // Process the mined transaction
      if (body.event.transaction && body.event.logs) {
        await indexer.processWebhookTransaction(
          body.event.transaction.hash,
          body.event.logs
        )
      }
    }
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Error processing Alchemy webhook:', error)
    return c.json({ error: 'Webhook processing failed' }, 500)
  }
})

export default webhooks