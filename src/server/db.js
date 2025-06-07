/**
 * Database utilities for D1
 * Provides typed queries and helper functions for database operations
 */

export class Database {
  constructor(db) {
    this.db = db
  }

  // User operations
  async getUser(fid) {
    return await this.db
      .prepare('SELECT * FROM users WHERE fid = ?')
      .bind(fid)
      .first()
  }

  async createOrUpdateUser(userData) {
    const { fid, username, display_name, pfp_url } = userData
    
    return await this.db
      .prepare(`
        INSERT INTO users (fid, username, display_name, pfp_url)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(fid) DO UPDATE SET
          username = excluded.username,
          display_name = excluded.display_name,
          pfp_url = excluded.pfp_url,
          updated_at = CURRENT_TIMESTAMP
      `)
      .bind(fid, username, display_name, pfp_url)
      .run()
  }

  // Listing operations
  async getActiveListings({ page = 1, limit = 20, sort = 'recent', sellerFid = null, search = null }) {
    const offset = (page - 1) * limit
    let orderBy = 'created_at DESC'
    
    if (sort === 'price_low') orderBy = 'price ASC'
    else if (sort === 'price_high') orderBy = 'price DESC'
    
    // Build WHERE conditions
    const conditions = [
      'l.sold_at IS NULL',
      'l.cancelled_at IS NULL',
      "l.expiry > datetime('now')"
    ]
    
    const params = []
    if (sellerFid) {
      conditions.push('l.seller_fid = ?')
      params.push(sellerFid)
    }
    
    if (search) {
      conditions.push('(LOWER(l.name) LIKE ? OR LOWER(l.description) LIKE ?)')
      params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`)
    }
    
    const whereClause = `WHERE ${conditions.join(' AND ')}`
    
    const query = `
      SELECT l.*, u.username, u.display_name, u.pfp_url
      FROM listings l
      LEFT JOIN users u ON u.fid = l.seller_fid
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `
    
    params.push(limit, offset)
    
    const results = await this.db
      .prepare(query)
      .bind(...params)
      .all()
    
    const totalQuery = `
      SELECT COUNT(*) as count
      FROM listings l
      ${whereClause}
    `
    
    const totalParams = sellerFid ? [sellerFid] : []
    if (search) {
      totalParams.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`)
    }
    const total = await this.db
      .prepare(totalQuery)
      .bind(...totalParams)
      .first()
    
    return {
      listings: results.results,
      pagination: {
        page,
        limit,
        total: total.count,
        hasMore: offset + limit < total.count
      }
    }
  }

  async getListing(listingId) {
    return await this.db
      .prepare(`
        SELECT l.*, u.username, u.display_name, u.pfp_url
        FROM listings l
        LEFT JOIN users u ON u.fid = l.seller_fid
        WHERE l.id = ?
      `)
      .bind(listingId)
      .first()
  }

  async createListing(listingData) {
    const {
      blockchain_listing_id,
      seller_fid,
      seller_address,
      nft_contract,
      token_id,
      price,
      expiry,
      metadata_uri,
      image_url,
      name,
      description,
      tx_hash
    } = listingData
    
    // Check if listing already exists with this blockchain_listing_id
    if (blockchain_listing_id) {
      const existingListing = await this.db
        .prepare(`
          SELECT id FROM listings 
          WHERE blockchain_listing_id = ?
        `)
        .bind(blockchain_listing_id)
        .first()
      
      if (existingListing) {
        console.log(`Listing with blockchain_listing_id ${blockchain_listing_id} already exists`)
        return { meta: { last_row_id: existingListing.id } }
      }
    }
    
    // Also check if there's an active listing for this NFT
    const activeListing = await this.db
      .prepare(`
        SELECT id FROM listings 
        WHERE nft_contract = ? 
          AND token_id = ?
          AND sold_at IS NULL
          AND cancelled_at IS NULL
          AND expiry > datetime('now')
      `)
      .bind(nft_contract.toLowerCase(), token_id)
      .first()
    
    if (activeListing) {
      console.log(`Active listing already exists for ${nft_contract} #${token_id}`)
      return { meta: { last_row_id: activeListing.id } }
    }
    
    const result = await this.db
      .prepare(`
        INSERT INTO listings (
          blockchain_listing_id, seller_fid, seller_address, nft_contract, token_id,
          price, expiry, metadata_uri, image_url, name, description, tx_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        blockchain_listing_id || null,
        seller_fid || null,
        seller_address.toLowerCase(),
        nft_contract.toLowerCase(),
        token_id,
        price,
        expiry,
        metadata_uri,
        image_url,
        name,
        description,
        tx_hash || null
      )
      .run()
    
    // Record activity
    await this.recordActivity({
      type: 'listing_created',
      actor_fid: seller_fid,
      actor_address: seller_address,
      nft_contract,
      token_id,
      price,
      metadata: JSON.stringify({ listing_id: result.meta.last_row_id }),
      tx_hash
    })
    
    return result
  }

  async markListingSold(blockchainListingId, buyerAddress, buyerFid, saleTxHash) {
    // First, find the listing by blockchain_listing_id
    const listing = await this.db
      .prepare(`
        SELECT * FROM listings 
        WHERE blockchain_listing_id = ?
      `)
      .bind(blockchainListingId)
      .first()
    
    if (!listing) throw new Error('Listing not found')
    
    // Update the listing with sale information
    await this.db
      .prepare(`
        UPDATE listings 
        SET sold_at = CURRENT_TIMESTAMP, 
            buyer_fid = ?,
            buyer_address = ?,
            sale_tx_hash = ?
        WHERE blockchain_listing_id = ?
      `)
      .bind(buyerFid, buyerAddress.toLowerCase(), saleTxHash, blockchainListingId)
      .run()
    
    // Record sale activity
    await this.recordActivity({
      type: 'sale',
      actor_fid: buyerFid,
      actor_address: buyerAddress,
      nft_contract: listing.nft_contract,
      token_id: listing.token_id,
      price: listing.price,
      metadata: JSON.stringify({ 
        listing_id: listing.id, 
        blockchain_listing_id: blockchainListingId,
        seller: listing.seller_address,
        seller_fid: listing.seller_fid
      }),
      tx_hash: saleTxHash
    })
  }

  async cancelListing(blockchainListingId, cancellerAddress, cancelTxHash) {
    // Find the listing by blockchain_listing_id
    const listing = await this.db
      .prepare(`
        SELECT * FROM listings 
        WHERE blockchain_listing_id = ?
      `)
      .bind(blockchainListingId)
      .first()
    
    if (!listing) throw new Error('Listing not found')
    
    // Verify the canceller is the seller
    if (listing.seller_address.toLowerCase() !== cancellerAddress.toLowerCase()) {
      throw new Error('Only the seller can cancel their listing')
    }
    
    // Update the listing with cancellation information
    await this.db
      .prepare(`
        UPDATE listings 
        SET cancelled_at = CURRENT_TIMESTAMP,
            cancel_tx_hash = ?
        WHERE blockchain_listing_id = ?
      `)
      .bind(cancelTxHash, blockchainListingId)
      .run()
    
    // Record cancellation
    await this.recordActivity({
      type: 'listing_cancelled',
      actor_fid: listing.seller_fid,
      actor_address: cancellerAddress,
      nft_contract: listing.nft_contract,
      token_id: listing.token_id,
      price: listing.price,
      metadata: JSON.stringify({ 
        listing_id: listing.id, 
        blockchain_listing_id: blockchainListingId 
      }),
      tx_hash: cancelTxHash
    })
  }

  // Activity operations
  async recordActivity(activityData) {
    const { type, actor_fid, actor_address, nft_contract, token_id, price, metadata, tx_hash } = activityData
    
    // Check if activity with this tx_hash already exists to prevent duplicates
    if (tx_hash) {
      const existingActivity = await this.db
        .prepare(`
          SELECT id FROM activity 
          WHERE tx_hash = ? AND type = ?
        `)
        .bind(tx_hash, type)
        .first()
      
      if (existingActivity) {
        console.log(`Activity of type ${type} with tx_hash ${tx_hash} already exists`)
        return { meta: { last_row_id: existingActivity.id } }
      }
    }
    
    return await this.db
      .prepare(`
        INSERT INTO activity (type, actor_fid, actor_address, nft_contract, token_id, price, metadata, tx_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        type,
        actor_fid || null,
        actor_address.toLowerCase(),
        nft_contract?.toLowerCase() || null,
        token_id || null,
        price || null,
        metadata || null,
        tx_hash || null
      )
      .run()
  }

  async getActivity({ page = 1, limit = 20, filter = {} }) {
    const offset = (page - 1) * limit
    let conditions = []
    let params = []
    
    if (filter.type) {
      conditions.push('type = ?')
      params.push(filter.type)
    }
    
    if (filter.actor_fid) {
      conditions.push('actor_fid = ?')
      params.push(filter.actor_fid)
    }
    
    if (filter.nft_contract) {
      conditions.push('nft_contract = ?')
      params.push(filter.nft_contract.toLowerCase())
    }
    
    if (filter.token_id) {
      conditions.push('token_id = ?')
      params.push(filter.token_id)
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    
    const query = `
      SELECT a.*, u.username, u.display_name, u.pfp_url,
             l.image_url, l.name as nft_name
      FROM activity a
      LEFT JOIN users u ON u.fid = a.actor_fid
      LEFT JOIN listings l ON (
        l.nft_contract = a.nft_contract 
        AND l.token_id = a.token_id
        AND l.blockchain_listing_id = (
          SELECT MAX(blockchain_listing_id) 
          FROM listings 
          WHERE nft_contract = a.nft_contract 
          AND token_id = a.token_id
        )
      )
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `
    
    params.push(limit, offset)
    
    const results = await this.db
      .prepare(query)
      .bind(...params)
      .all()
    
    const totalQuery = `
      SELECT COUNT(*) as count
      FROM activity
      ${whereClause}
    `
    
    const total = await this.db
      .prepare(totalQuery)
      .bind(...params.slice(0, -2)) // Remove limit and offset
      .first()
    
    return {
      activities: results.results,
      pagination: {
        page,
        limit,
        total: total.count,
        hasMore: offset + limit < total.count
      }
    }
  }

  // Stats and analytics
  async getUserStats(fid) {
    const [listings, sales, purchases] = await Promise.all([
      // Active listings
      this.db
        .prepare(`
          SELECT COUNT(*) as count, SUM(price) as total_value
          FROM listings
          WHERE seller_fid = ?
            AND sold_at IS NULL
            AND cancelled_at IS NULL
            AND expiry > datetime('now')
        `)
        .bind(fid)
        .first(),
      
      // Sales - count listings that were sold by this user
      this.db
        .prepare(`
          SELECT COUNT(*) as count, SUM(l.price) as total_volume
          FROM listings l
          WHERE l.seller_fid = ?
            AND l.sold_at IS NOT NULL
        `)
        .bind(fid)
        .first(),
      
      // Purchases
      this.db
        .prepare(`
          SELECT COUNT(*) as count, SUM(price) as total_spent
          FROM listings
          WHERE buyer_fid = ?
            AND sold_at IS NOT NULL
        `)
        .bind(fid)
        .first()
    ])
    
    return {
      active_listings: listings.count || 0,
      total_listing_value: listings.total_value || 0,
      total_sales: sales.count || 0,
      total_sales_volume: sales.total_volume || 0,
      total_purchases: purchases.count || 0,
      total_spent: purchases.total_spent || 0
    }
  }

  // Get user's NFTs (owned NFTs from purchases)
  async getUserNFTs(fid, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit
    
    const query = `
      SELECT 
        l.nft_contract,
        l.token_id,
        l.name,
        l.image_url,
        l.metadata_uri,
        l.description,
        l.price as purchase_price,
        l.sold_at as purchased_at,
        l.sale_tx_hash
      FROM listings l
      WHERE l.buyer_fid = ?
        AND l.sold_at IS NOT NULL
      ORDER BY l.sold_at DESC
      LIMIT ? OFFSET ?
    `
    
    const results = await this.db
      .prepare(query)
      .bind(fid, limit, offset)
      .all()
    
    const totalQuery = `
      SELECT COUNT(*) as count
      FROM listings
      WHERE buyer_fid = ?
        AND sold_at IS NOT NULL
    `
    
    const total = await this.db
      .prepare(totalQuery)
      .bind(fid)
      .first()
    
    return {
      nfts: results.results,
      pagination: {
        page,
        limit,
        total: total.count,
        hasMore: offset + limit < total.count
      }
    }
  }

  // Get featured collection (most common NFT contract in active listings)
  async getFeaturedCollection() {
    const result = await this.db
      .prepare(`
        SELECT 
          nft_contract,
          COUNT(*) as listing_count,
          MIN(name) as sample_name,
          MIN(image_url) as sample_image
        FROM listings
        WHERE sold_at IS NULL
          AND cancelled_at IS NULL
          AND expiry > datetime('now')
        GROUP BY nft_contract
        ORDER BY listing_count DESC
        LIMIT 1
      `)
      .all()
    
    if (!result.results || result.results.length === 0) {
      return null
    }
    
    const collection = result.results[0]
    
    // Get sample listings for the collection
    const sampleListings = await this.db
      .prepare(`
        SELECT id, name, image_url, price
        FROM listings
        WHERE nft_contract = ?
          AND sold_at IS NULL
          AND cancelled_at IS NULL
          AND expiry > datetime('now')
        ORDER BY created_at DESC
        LIMIT 4
      `)
      .bind(collection.nft_contract)
      .all()
    
    return {
      contract_address: collection.nft_contract,
      listing_count: collection.listing_count,
      name: this.extractCollectionName(collection.sample_name),
      sample_listings: sampleListings.results
    }
  }

  // Get listings for a specific collection
  async getCollectionListings(contractAddress, { page = 1, limit = 20, sort = 'ending_soon' }) {
    const offset = (page - 1) * limit
    let orderBy = 'l.expiry ASC' // Default to ending soon
    
    if (sort === 'recent') orderBy = 'l.created_at DESC'
    else if (sort === 'price_low') orderBy = 'l.price ASC'
    else if (sort === 'price_high') orderBy = 'l.price DESC'
    
    const query = `
      SELECT l.*, u.username, u.display_name, u.pfp_url
      FROM listings l
      LEFT JOIN users u ON u.fid = l.seller_fid
      WHERE l.nft_contract = ?
        AND l.sold_at IS NULL
        AND l.cancelled_at IS NULL
        AND l.expiry > datetime('now')
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `
    
    const results = await this.db
      .prepare(query)
      .bind(contractAddress.toLowerCase(), limit, offset)
      .all()
    
    const totalQuery = `
      SELECT COUNT(*) as count
      FROM listings
      WHERE nft_contract = ?
        AND sold_at IS NULL
        AND cancelled_at IS NULL
        AND expiry > datetime('now')
    `
    
    const total = await this.db
      .prepare(totalQuery)
      .bind(contractAddress.toLowerCase())
      .first()
    
    // Try to extract collection name from the first listing
    const collectionName = results.results.length > 0 
      ? this.extractCollectionName(results.results[0].name)
      : 'Collection'
    
    return {
      collection_name: collectionName,
      contract_address: contractAddress,
      listings: results.results,
      pagination: {
        page,
        limit,
        total: total.count,
        hasMore: offset + limit < total.count
      }
    }
  }

  // Helper to extract collection name from NFT name
  extractCollectionName(nftName) {
    if (!nftName) return 'Collection'
    
    // Common patterns: "CollectionName #123", "CollectionName 123"
    const match = nftName.match(/^(.+?)(?:\s*#?\d+)?$/)
    if (match && match[1]) {
      return match[1].trim()
    }
    
    return nftName
  }
}