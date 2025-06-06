import { html, raw } from 'hono/html'
import { Database } from '../db.js'
import { Layout } from './layout.js'

export async function collectionPage(c) {
  const contractAddress = c.req.param('address')
  const page = parseInt(c.req.query('page') || '1')
  const sort = c.req.query('sort') || 'ending_soon'
  
  const db = new Database(c.env.DB)
  
  try {
    const result = await db.getCollectionListings(contractAddress, { page, limit: 20, sort })
    
    if (!result.listings || result.listings.length === 0) {
      return c.html(
        Layout({
          children: html`
            <frame-provider>
              <main class="main-content">
                <div style="text-align: center; padding: 60px 20px; color: var(--text-secondary);">
                  <h2 style="color: var(--text-primary); margin-bottom: 1rem;">Collection Not Found</h2>
                  <p>No active listings found for this collection.</p>
                  <a href="/" style="color: var(--primary-color); text-decoration: none; margin-top: 1rem; display: inline-block;">
                    ← Back to Home
                  </a>
                </div>
              </main>
              <nav-tabs active="explore"></nav-tabs>
            </frame-provider>
          `,
          title: 'Collection Not Found - FC NFT Exchange'
        })
      )
    }
    
    const listings = result.listings.map(listing => ({
      id: listing.id,
      tokenId: listing.token_id,
      contractAddress: listing.nft_contract,
      name: listing.name,
      image: listing.image_url,
      price: listing.price,
      expiry: listing.expiry,
      seller: {
        address: listing.seller_address,
        username: listing.username || `user_${listing.seller_address.slice(2, 8)}`,
        fid: listing.seller_fid || null
      }
    }))
    
    return c.html(
      Layout({
        children: html`
          <frame-provider>
            <main class="main-content collection-page">
              <div class="collection-header-section">
                <a href="/" class="back-link">← Back</a>
                <h1 class="collection-title">${result.collection_name}</h1>
                <p class="collection-subtitle">${result.pagination.total} active listings</p>
              </div>
              
              <div class="sort-controls">
                <label for="sort-select">Sort by:</label>
                <select id="sort-select" class="sort-select" onchange="window.location.href='/collection/${contractAddress}?sort=' + this.value">
                  <option value="ending_soon" ${sort === 'ending_soon' ? 'selected' : ''}>Ending Soon</option>
                  <option value="recent" ${sort === 'recent' ? 'selected' : ''}>Recently Listed</option>
                  <option value="price_low" ${sort === 'price_low' ? 'selected' : ''}>Price: Low to High</option>
                  <option value="price_high" ${sort === 'price_high' ? 'selected' : ''}>Price: High to Low</option>
                </select>
              </div>
              
              <div class="collection-grid">
                ${raw(listings.map(nft => `
                  <div class="collection-item" data-listing-id="${nft.id}">
                    <div class="collection-item-image" style="background-image: url('${nft.image}')"></div>
                    <div class="collection-item-info">
                      <h3 class="item-name">${nft.name}</h3>
                      <div class="item-details">
                        <span class="item-price">${nft.price} USDC</span>
                        <span class="item-seller">@${nft.seller.username}</span>
                      </div>
                      <div class="item-expiry">
                        Ends ${getTimeRemaining(nft.expiry)}
                      </div>
                    </div>
                  </div>
                `).join(''))}
              </div>
              
              ${raw(result.pagination.hasMore ? `
                <div class="pagination">
                  <a href="/collection/${contractAddress}?page=${page + 1}&sort=${sort}" class="load-more-btn">
                    Load More
                  </a>
                </div>
              ` : '')}
            </main>
            
            <nav-tabs active="explore"></nav-tabs>
            <create-listing></create-listing>
          </frame-provider>
          
          <style>
            .collection-page {
              padding-bottom: 100px;
            }
            
            .collection-header-section {
              padding: 1.25rem;
              border-bottom: 1px solid var(--border-color);
            }
            
            .back-link {
              color: var(--primary-color);
              text-decoration: none;
              font-size: 0.875rem;
              display: inline-block;
              margin-bottom: 0.75rem;
            }
            
            .collection-title {
              margin: 0;
              font-size: 1.75rem;
              font-weight: 700;
              color: var(--text-primary);
            }
            
            .collection-subtitle {
              margin: 0.25rem 0 0;
              color: var(--text-secondary);
              font-size: 0.875rem;
            }
            
            .sort-controls {
              padding: 1rem 1.25rem;
              display: flex;
              align-items: center;
              gap: 0.75rem;
              font-size: 0.875rem;
            }
            
            .sort-controls label {
              color: var(--text-secondary);
            }
            
            .sort-select {
              background: var(--card-bg);
              border: 1px solid var(--border-color);
              border-radius: 0.5rem;
              padding: 0.5rem 1rem;
              font-size: 0.875rem;
              color: var(--text-primary);
              cursor: pointer;
            }
            
            .collection-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 1rem;
              padding: 1.25rem;
            }
            
            .collection-item {
              background: var(--card-bg);
              border: 1px solid var(--border-color);
              border-radius: 0.75rem;
              overflow: hidden;
              cursor: pointer;
              transition: all 0.2s ease;
            }
            
            .collection-item:hover {
              transform: translateY(-2px);
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            }
            
            .collection-item-image {
              width: 100%;
              aspect-ratio: 1;
              background-size: contain;
              background-position: center;
              background-repeat: no-repeat;
              background-color: var(--border-color);
            }
            
            .collection-item-info {
              padding: 1rem;
            }
            
            .item-name {
              margin: 0;
              font-size: 0.875rem;
              font-weight: 500;
              color: var(--text-primary);
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            
            .item-details {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-top: 0.5rem;
              font-size: 0.75rem;
            }
            
            .item-price {
              font-weight: 600;
              color: var(--text-primary);
            }
            
            .item-seller {
              color: var(--text-secondary);
            }
            
            .item-expiry {
              margin-top: 0.5rem;
              font-size: 0.75rem;
              color: var(--text-secondary);
            }
            
            .pagination {
              padding: 2rem 1.25rem;
              text-align: center;
            }
            
            .load-more-btn {
              display: inline-block;
              background: var(--primary-color);
              color: white;
              padding: 0.75rem 2rem;
              border-radius: 0.5rem;
              text-decoration: none;
              font-weight: 500;
              transition: opacity 0.2s;
            }
            
            .load-more-btn:hover {
              opacity: 0.9;
            }
            
            @media (min-width: 640px) {
              .collection-grid {
                grid-template-columns: repeat(3, 1fr);
              }
            }
            
            @media (min-width: 1024px) {
              .collection-grid {
                grid-template-columns: repeat(4, 1fr);
              }
            }
          </style>
          
          <script>
            // Add click handlers to collection items
            document.querySelectorAll('.collection-item').forEach(item => {
              item.addEventListener('click', () => {
                const listingId = item.dataset.listingId;
                if (listingId) {
                  window.location.href = '/listing/' + listingId;
                }
              });
            });
          </script>
        `,
        title: `${result.collection_name} - FC NFT Exchange`
      })
    )
  } catch (error) {
    console.error('Error loading collection:', error)
    return c.html(
      Layout({
        children: html`
          <frame-provider>
            <main class="main-content">
              <div style="text-align: center; padding: 60px 20px; color: var(--text-secondary);">
                <h2 style="color: var(--text-primary); margin-bottom: 1rem;">Error Loading Collection</h2>
                <p>Failed to load collection data. Please try again.</p>
                <a href="/" style="color: var(--primary-color); text-decoration: none; margin-top: 1rem; display: inline-block;">
                  ← Back to Home
                </a>
              </div>
            </main>
            <nav-tabs active="explore"></nav-tabs>
          </frame-provider>
        `,
        title: 'Error - FC NFT Exchange'
      })
    )
  }
}

// Helper function to get time remaining
function getTimeRemaining(expiry) {
  const now = new Date()
  const expiryDate = new Date(expiry)
  const diff = expiryDate - now
  
  if (diff <= 0) return 'Expired'
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  
  if (days > 0) return `in ${days}d ${hours}h`
  if (hours > 0) return `in ${hours}h ${minutes}m`
  return `in ${minutes}m`
}