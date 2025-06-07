import puppeteer from '@cloudflare/puppeteer'

export class ShareImageGenerator {
  constructor(env) {
    this.env = env
  }

  async generateShareImage(listing) {
    const cacheKey = `share-image:${listing.id}`
    
    // Check KV cache first
    const cached = await this.env.MINT_EXCHANGE_BROWSER_KV.get(cacheKey)
    if (cached) {
      return cached
    }

    try {
      // Generate HTML for the share image
      const html = this.generateHTML(listing)
      
      // Launch browser and take screenshot
      const browser = await puppeteer.launch(this.env.BROWSER)
      const page = await browser.newPage()
      
      // Set viewport to exact dimensions we want
      await page.setViewport({
        width: 1200,
        height: 800,
        deviceScaleFactor: 2 // For retina quality
      })
      
      // Set content and wait for fonts to load
      await page.setContent(html, { waitUntil: 'networkidle0' })
      
      // Take screenshot
      const screenshot = await page.screenshot({
        type: 'png',
        encoding: 'binary'
      })
      
      await browser.close()
      
      // Upload to R2
      const r2Key = `share-images/${listing.id}.png`
      await this.env.R2.put(r2Key, screenshot, {
        httpMetadata: {
          contentType: 'image/png',
          cacheControl: 'public, max-age=31536000' // 1 year cache
        }
      })
      
      // Get public URL (assuming R2 bucket is configured with public access)
      const publicUrl = `https://images.mint-exchange.xyz/${r2Key}`
      
      // Cache in KV for 24 hours
      await this.env.MINT_EXCHANGE_BROWSER_KV.put(cacheKey, publicUrl, {
        expirationTtl: 86400
      })
      
      return publicUrl
    } catch (error) {
      console.error('Error generating share image:', error)
      throw error
    }
  }

  generateHTML(listing) {
    // Format price to 2 decimal places
    const formattedPrice = parseFloat(listing.price).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    })

    // Format auction end date
    let auctionText = 'AUCTION ENDING SOON'
    if (listing.expiry) {
      const expiry = new Date(listing.expiry)
      const options = { 
        month: 'short', 
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short'
      }
      const formattedDate = expiry.toLocaleString('en-US', options).toUpperCase()
      auctionText = `AUCTION ENDING ${formattedDate}`
    }

    // const collectionName = listing.collection_name
    const listingName = listing.name || `Token #${listing.token_id}`
    // if (collectionName) {
    //   listingName = listingName.replace(collectionName, '').trim()
    // }
    
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    body {
      width: 1200px;
      height: 800px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      position: relative;
      overflow: hidden;
    }
    
    .background-pattern {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      opacity: 0.05;
      background-image: repeating-linear-gradient(
        45deg,
        transparent,
        transparent 35px,
        rgba(255, 255, 255, 0.1) 35px,
        rgba(255, 255, 255, 0.1) 70px
      );
    }
    
    .container {
      width: 100%;
      height: 100%;
      padding: 80px;
      display: flex;
      gap: 80px;
      align-items: center;
      position: relative;
      z-index: 1;
    }
    
    .nft-image-wrapper {
      flex-shrink: 0;
      width: 500px;
      height: 500px;
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
      background: #2a2a2a;
      position: relative;
    }
    
    .nft-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 32px;
    }
    
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      background: rgba(109, 216, 253, 0.1);
      border: 1px solid rgba(109, 216, 253, 0.3);
      padding: 12px 24px;
      border-radius: 100px;
      font-size: 18px;
      font-weight: 600;
      color: #6DD8FD;
      width: fit-content;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .collection-name {
      font-size: 24px;
      color: #999;
      font-weight: 500;
      margin-bottom: 8px;
    }
    
    .title {
      font-size: 64px;
      font-weight: 700;
      line-height: 1.1;
      margin: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
    }
    
    .price-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .price-label {
      font-size: 24px;
      color: #888;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .price {
      font-size: 72px;
      font-weight: 700;
      color: #6DD8FD;
      display: flex;
      align-items: baseline;
      gap: 16px;
    }
    
    .currency {
      font-size: 40px;
      font-weight: 500;
      color: #888;
    }
    
    .seller-section {
      display: flex;
      align-items: center;
      gap: 20px;
      margin-top: 32px;
    }
    
    .seller-avatar {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: #3a3a3a;
      overflow: hidden;
    }
    
    .seller-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .seller-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    
    .seller-label {
      font-size: 18px;
      color: #888;
    }
    
    .seller-name {
      font-size: 26px;
      font-weight: 600;
    }
    
    .branding {
      position: absolute;
      bottom: 40px;
      right: 40px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 18px;
      font-weight: 600;
      color: #6DD8FD;
    }
    
    .logo {
      width: 32px;
      height: 32px;
      background: #6DD8FD;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      color: #000;
      font-size: 16px;
    }
  </style>
</head>
<body>
  <div class="background-pattern"></div>
  
  <div class="container">
    <div class="nft-image-wrapper">
      <img src="${listing.image_url || 'https://via.placeholder.com/500x500/2a2a2a/666?text=NFT'}" alt="${listing.name}" class="nft-image" />
    </div>
    
    <div class="content">
      <div class="badge">
        <span>🕐</span>
        <span>${auctionText}</span>
      </div>
      
      <h1 class="title">${listingName}</h1>
      
      <div class="price-section">
        <div class="price">
          $${formattedPrice}
          <span class="currency">USDC</span>
        </div>
      </div>
      
      <div class="seller-section">
        <div class="seller-avatar">
          ${listing.seller_pfp_url ? 
            `<img src="${listing.seller_pfp_url}" alt="${listing.seller_username}" />` :
            `<div style="width: 100%; height: 100%; background: linear-gradient(135deg, #6DD8FD, #4FC3F7); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700;">${(listing.seller_username || 'U')[0].toUpperCase()}</div>`
          }
        </div>
        <div class="seller-info">
          <div class="seller-label">Listed by</div>
          <div class="seller-name">@${listing.seller_username || `fid:${listing.seller_fid}`}</div>
        </div>
      </div>
    </div>
  </div>
  
  <div class="branding">
    <span>mint-exchange.xyz</span>
  </div>
</body>
</html>`
  }

  async updateListingShareImage(listingId, shareImageUrl) {
    try {
      await this.env.DB.prepare(
        'UPDATE listings SET share_image_url = ? WHERE id = ?'
      ).bind(shareImageUrl, listingId).run()
    } catch (error) {
      console.error('Error updating listing share image URL:', error)
      throw error
    }
  }
}