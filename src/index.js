import { Hono } from 'hono'
import { createApp } from './server/app.js'
import { homePage, profilePage, activityPage, searchPage, listingDetailsPage, collectionPage } from './server/pages.js'

// Create main application
const app = new Hono()

// Mount the API app
const apiApp = createApp()
app.route('/', apiApp)

// Well-known routes
app.get('/.well-known/farcaster.json', async (c) => {
  return c.json({
    "accountAssociation": {
      "header": "eyJmaWQiOjk3NzIzMywidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweGE2N0JhMDI4MTIzMWVCOUUyZWE0Y0Y5Nzg5NGMwYjBiNUI4MDFDYzYifQ",
      "payload": "eyJkb21haW4iOiJtaW50LWV4Y2hhbmdlLnh5eiJ9",
      "signature": "MHg2MmE0YWMwYjQ5ODFhODFhOTRkNWYwYjYzNDgyNzBkNjNiZDA1OTFkZjE5NjQ3ZmNhYjdmNmViYjdjYjFlZGZlNWFkYTVhN2JjNTQ1YTA1ZmQ0ZjliNmNhNGY5OTkzNzhjNzJmNDgwMDZhNGM3OWUwMzM5MzljMWZiZmQ1OTU1MjFi"
    },
    "frame": {
      "version": "1",
      "name": "Mint Exchange",
      "subtitle": "Farcaster NFT Marketplace",
      "description": "Buy and sell NFTs all within Farcaster",
      "primaryCategory": "shopping",
      "tags": ["nft", "opensea"],
      "iconUrl": "https://cover-art.kasra.codes/mint_exchange_square.png",
      "homeUrl": "https://mint-exchange.xyz",
      "imageUrl": "https://cover-art.kasra.codes/mint_exchange_rectangle.png",
      "buttonTitle": "Browse NFTs",
      "splashImageUrl": "https://cover-art.kasra.codes/mint_exchange_square.png",
      "splashBackgroundColor": "#6DD8FD"
    }
  })
})

// Page routes
app.get('/', homePage)
app.get('/profile', profilePage)
app.get('/activity', activityPage)
app.get('/search', searchPage)
app.get('/listing/:id', listingDetailsPage)
app.get('/collection/:address', collectionPage)

// 404 handler
app.notFound((c) => {
  return c.json({ message: 'Not Found' }, 404)
})

// Global error handler
app.onError((err, c) => {
  console.error(`${err}`)
  return c.json({ message: 'Internal Server Error' }, 500)
})

// Export for Cloudflare Workers
const worker = {
  fetch: app.fetch,
  // Scheduled worker for event indexing
  async scheduled(event, env, ctx) {
    const { default: scheduledHandler } = await import('./server/indexer.js')
    return scheduledHandler.scheduled(event, env, ctx)
  }
}

export default worker