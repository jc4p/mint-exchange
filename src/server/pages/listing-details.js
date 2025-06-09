import { html, raw } from 'hono/html'
import { Layout } from './layout.js'
import { fetchNFTMetadata } from '../utils/metadata.js'

export async function listingDetailsPage(c) {
  const listingId = c.req.param('id')
  
  // Try to fetch listing details
  let listing = null
  let nftAttributes = []
  const db = c.env?.DB
  
  if (db) {
    try {
      const result = await db.prepare(`
        SELECT 
          l.*,
          u.username as seller_username,
          u.display_name as seller_display_name,
          u.pfp_url as seller_avatar
        FROM listings l
        LEFT JOIN users u ON l.seller_fid = u.fid
        WHERE l.id = ?
      `).bind(listingId).first()
      
      listing = result
      
      // Fetch complete metadata if missing or incomplete
      if (listing && (!listing.image_url || !listing.name || listing.metadata_uri)) {
        const metadata = await fetchNFTMetadata(
          c.env,
          listing.nft_contract,
          listing.token_id,
          listing.metadata_uri
        )
        
        if (metadata.success) {
          // Update listing with fetched metadata
          listing.name = listing.name || metadata.name
          listing.description = listing.description || metadata.description
          listing.image_url = listing.image_url || metadata.image_url
          listing.metadata_uri = metadata.metadata_uri
          nftAttributes = metadata.attributes || []
        }
      }
    } catch (error) {
      console.error('Error fetching listing:', error)
    }
  }
  
  // If no listing found, use mock data for development
  if (!listing) {
    listing = {
      id: listingId,
      name: 'Sample NFT',
      description: 'This is a sample NFT for development',
      image_url: 'https://via.placeholder.com/400',
      price: '100',
      nft_contract: '0x1234567890abcdef1234567890abcdef12345678',
      token_id: '1',
      seller_address: '0xabc123...',
      seller_username: 'SampleUser',
      seller_avatar: 'https://via.placeholder.com/100',
      seller_fid: null,
      status: 'active',
      created_at: new Date().toISOString(),
      expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      sold_at: null,
      cancelled_at: null,
      tx_hash: null
    }
  }
  
  // Determine listing status
  let status = 'active'
  if (listing.sold_at) {
    status = 'sold'
  } else if (listing.cancelled_at) {
    status = 'cancelled'
  } else if (new Date(listing.expiry) < new Date()) {
    status = 'expired'
  }
  
  // Calculate remaining time
  let remainingTimeText = ''
  if (status === 'active') {
    const now = new Date()
    const expiry = new Date(listing.expiry)
    const diffMs = expiry - now
    
    if (diffMs > 0) {
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
      
      if (days > 0) {
        remainingTimeText = `${days}d ${hours}h remaining`
      } else if (hours > 0) {
        remainingTimeText = `${hours}h ${minutes}m remaining`
      } else {
        remainingTimeText = `${minutes}m remaining`
      }
    } else {
      remainingTimeText = 'Expired'
    }
  }
  
  // Serialize the listing data for client-side JS
  const listingData = {
    id: listing.id,
    sellerFid: listing.seller_fid,
    price: listing.price,
    contractType: listing.contract_type,
    orderHash: listing.order_hash,
    blockchainListingId: listing.blockchain_listing_id
  }
  
  // Prepare frame metadata for this listing
  const frameMetadata = listing.share_image_url ? {
    version: "next",
    imageUrl: listing.share_image_url,
    button: {
      title: `View Listing`,
      action: {
        type: "launch_frame",
        name: "Mint Exchange",
        url: `https://mint-exchange.xyz/listing/${listing.id}`,
        splashImageUrl: "https://cover-art.kasra.codes/mint_exchange_square.png",
        splashBackgroundColor: "#6DD8FD"
      }
    }
  } : undefined
  
  return c.html(
    Layout({
      frameMetadata,
      children: html`
        <frame-provider>
          <main class="main-content">
            <div class="listing-header-section">
              <div class="listing-header-nav">
                <a href="/" class="back-link">← Back</a>
                <button class="share-button" id="share-listing-btn" data-listing-id="${listing.id}" data-listing-name="${listing.name.replace(/"/g, '&quot;')}">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                    <polyline points="16 6 12 2 8 6"></polyline>
                    <line x1="12" y1="2" x2="12" y2="15"></line>
                  </svg>
                  Share
                </button>
              </div>
              <h1 class="listing-page-title">Listing Details</h1>
            </div>
            <listing-details>
              ${raw(`
                <div class="listing-container">
                  <div class="listing-image">
                    <img src="${listing.image_url || '/placeholder.png'}" alt="${listing.name}" />
                  </div>
                  
                  <div class="listing-info">
                    <h1 class="listing-title">${listing.name}</h1>
                    
                    <div class="listing-price">
                      <span class="price-label">Buy Now:</span>
                      <span class="price-value">$${listing.price} USDC</span>
                    </div>
                    
                    <div class="listing-seller">
                      <img class="seller-avatar" src="${listing.seller_avatar || 'https://via.placeholder.com/40'}" alt="${listing.seller_username || 'Seller'}" />
                      <div class="seller-info">
                        <span class="seller-label">Listed by</span>
                        <span class="seller-name">${listing.seller_username || listing.seller_address?.slice(0, 6) + '...'}</span>
                      </div>
                      <div class="listing-status">
                        <span class="status-badge ${status}">${status}</span>
                        ${remainingTimeText ? `<span class="remaining-time">${remainingTimeText}</span>` : ''}
                      </div>
                    </div>
                    
                    ${listing.description ? `
                      <div class="listing-description">
                        <h3>Description</h3>
                        <p>${listing.description}</p>
                      </div>
                    ` : ''}
                    
                    <div class="listing-metadata">
                      <h3>Details</h3>
                      <div class="metadata-grid">
                        <div class="metadata-item full-width">
                          <span class="metadata-label">Contract</span>
                          <div class="metadata-value-row">
                            <a href="https://basescan.org/address/${listing.nft_contract}" target="_blank" class="metadata-value">
                              ${listing.nft_contract?.slice(0, 6)}...${listing.nft_contract?.slice(-4)}
                            </a>
                            <span class="metadata-separator">•</span>
                            <span class="metadata-value">Token ID #${listing.token_id}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    ${nftAttributes.length > 0 ? `
                      <div class="listing-attributes">
                        <h3>Attributes</h3>
                        <div class="attributes-grid">
                          ${nftAttributes.map(attr => `
                            <div class="attribute-item">
                              <span class="attribute-trait">${attr.trait_type || attr.name || 'Unknown'}</span>
                              <span class="attribute-value">${attr.value || 'N/A'}</span>
                            </div>
                          `).join('')}
                        </div>
                      </div>
                    ` : ''}
                    
                    ${status === 'active' ? `
                      <div class="listing-actions">
                        <button class="btn-primary" id="action-btn" data-listing='${JSON.stringify(listingData)}'>
                          Buy for $${listing.price}
                        </button>
                      </div>
                    ` : ''}
                  </div>
                </div>
                
                <script type="module">
                  // This will be handled by the listing-details component
                  const listingData = ${JSON.stringify(listingData)};
                </script>
              `)}
            </listing-details>
          </main>
          
          <nav-tabs></nav-tabs>
          <create-listing></create-listing>
        </frame-provider>
      `,
      title: `${listing.name || 'NFT'} - FC NFT Exchange`
    })
  )
}