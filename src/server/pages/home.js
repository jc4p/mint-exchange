import { html, raw } from 'hono/html'
import { Database } from '../db.js'
import { Layout } from './layout.js'

export async function homePage(c) {
  let listings = []
  let featuredCollection = null
  
  try {
    // Try to fetch from database
    const db = new Database(c.env.DB)
    
    // Get featured collection
    featuredCollection = await db.getFeaturedCollection()
    
    // Get active listings
    const result = await db.getActiveListings({ page: 1, limit: 8 })
    
    listings = result.listings.map(listing => ({
      id: listing.id,
      tokenId: listing.token_id,
      contractAddress: listing.nft_contract,
      name: listing.name,
      image: listing.image_url,
      price: listing.price,
      seller: {
        address: listing.seller_address,
        username: listing.username || `user_${listing.seller_address.slice(2, 8)}`,
        fid: listing.fid || null
      }
    }))
  } catch (error) {
    console.log('Using mock data for homepage:', error.message)
    // Fallback to mock data
    listings = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      tokenId: `${1000 + i}`,
      contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
      name: `Cool NFT #${1000 + i}`,
      image: `https://picsum.photos/seed/${i}/400/400`,
      price: (Math.random() * 100).toFixed(2),
      seller: {
        address: i % 2 === 0 ? '0x0db12C0A67bc5B8942ea3126a465d7a0b23126C7' : `0x${Math.random().toString(16).slice(2, 10)}`,
        username: i % 2 === 0 ? 'kasra' : `user${i}`,
        fid: i % 2 === 0 ? 12345 : 10000 + i
      }
    }))
    
    if (listings.length > 0) {
      featuredCollection = {
        contract_address: listings[0].contractAddress,
        listing_count: 5,
        name: 'Cool NFT Collection',
        sample_listings: listings.slice(0, 1).map(l => ({
          id: l.id,
          name: l.name,
          image_url: l.image,
          price: l.price
        }))
      }
    }
  }
  
  return c.html(
    Layout({
      children: html`
        <frame-provider>
          <main class="main-content">
            <h2 class="section-header">Featured Collection</h2>
            <featured-section>
              ${raw(featuredCollection ? `
                <div class="featured-collection-tile" data-collection-address="${featuredCollection.contract_address}">
                  <div class="collection-header">
                    <h3 class="collection-name">${featuredCollection.name}</h3>
                    <div class="collection-stats">
                      <span class="view-all">View all →</span>
                    </div>
                  </div>
                  <div class="collection-preview">
                    ${featuredCollection.sample_listings.map((listing, index) => `
                      <div class="preview-item" style="${index >= 1 ? 'display: none;' : ''}">
                        <div class="preview-image" style="background-image: url('${listing.image_url}')"></div>
                        <div class="preview-info">
                          <p class="preview-name">${listing.name}</p>
                          <p class="preview-price">${listing.price} USDC</p>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : `
                <div class="empty-state" style="text-align: center; padding: 60px 20px; color: #49739c;">
                  <p style="font-size: 18px; font-weight: 500;">No featured collections yet</p>
                  <p style="font-size: 14px; margin-top: 8px;">Be the first to list an NFT!</p>
                </div>
              `)}
            </featured-section>
            
            <h2 class="section-header">Latest</h2>
            <latest-section>
              ${raw(listings.filter(nft => 
                !featuredCollection || nft.contractAddress !== featuredCollection.contract_address
              ).slice(0, 6).map((nft, index) => `
                <div class="latest-item" data-listing-id="${nft.id}">
                  <div class="latest-image" style="background-image: url('${nft.image}')"></div>
                  <div class="latest-info">
                    <p class="latest-label">${index % 3 === 0 ? 'Trending' : index % 3 === 1 ? 'New' : 'Popular'}</p>
                    <p class="latest-title">${nft.name}</p>
                    <p class="latest-description">$${nft.price} USDC</p>
                  </div>
                </div>
              `).join(''))}
            </latest-section>
          </main>
          
          <nav-tabs active="home"></nav-tabs>
          <create-listing></create-listing>
        </frame-provider>
      `,
      title: 'Browse NFTs - FC NFT Exchange'
    })
  )
}