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

  async getUserByWallet(walletAddress) {
    return await this.db
      .prepare('SELECT * FROM users WHERE wallet_address = ?')
      .bind(walletAddress.toLowerCase())
      .first()
  }

  async createOrUpdateUser(userData) {
    const { fid, username, display_name, pfp_url, wallet_address } = userData
    
    return await this.db
      .prepare(`
        INSERT INTO users (fid, username, display_name, pfp_url, wallet_address)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(fid) DO UPDATE SET
          username = excluded.username,
          display_name = excluded.display_name,
          pfp_url = excluded.pfp_url,
          wallet_address = excluded.wallet_address,
          updated_at = CURRENT_TIMESTAMP
      `)
      .bind(fid, username, display_name, pfp_url, wallet_address?.toLowerCase())
      .run()
  }

  // Listing operations
  async getActiveListings({ page = 1, limit = 20, sort = 'recent', seller = null, search = null }) {
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
    if (seller) {
      conditions.push('l.seller_address = ?')
      params.push(seller.toLowerCase())
    }
    
    if (search) {
      conditions.push('(LOWER(l.name) LIKE ? OR LOWER(l.description) LIKE ?)')
      params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`)
    }
    
    const whereClause = `WHERE ${conditions.join(' AND ')}`
    
    const query = `
      SELECT l.*, u.username, u.display_name, u.pfp_url
      FROM listings l
      LEFT JOIN users u ON u.wallet_address = l.seller_address
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
    
    const totalParams = seller ? [seller.toLowerCase()] : []
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
        LEFT JOIN users u ON u.wallet_address = l.seller_address
        WHERE l.listing_id = ?
      `)
      .bind(listingId)
      .first()
  }

  async createListing(listingData) {
    const {
      listing_id,
      seller_address,
      nft_contract,
      token_id,
      price,
      expiry,
      metadata_uri,
      image_url,
      name,
      description
    } = listingData
    
    const result = await this.db
      .prepare(`
        INSERT INTO listings (
          listing_id, seller_address, nft_contract, token_id,
          price, expiry, metadata_uri, image_url, name, description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        listing_id,
        seller_address.toLowerCase(),
        nft_contract.toLowerCase(),
        token_id,
        price,
        expiry,
        metadata_uri,
        image_url,
        name,
        description
      )
      .run()
    
    // Record activity
    await this.recordActivity({
      type: 'listing_created',
      actor_address: seller_address,
      nft_contract,
      token_id,
      price,
      metadata: JSON.stringify({ listing_id })
    })
    
    return result
  }

  async markListingSold(listingId, buyerAddress) {
    const listing = await this.getListing(listingId)
    if (!listing) throw new Error('Listing not found')
    
    await this.db
      .prepare('UPDATE listings SET sold_at = CURRENT_TIMESTAMP WHERE listing_id = ?')
      .bind(listingId)
      .run()
    
    // Record sale activity
    await this.recordActivity({
      type: 'sale',
      actor_address: buyerAddress,
      nft_contract: listing.nft_contract,
      token_id: listing.token_id,
      price: listing.price,
      metadata: JSON.stringify({ listing_id: listingId, seller: listing.seller_address })
    })
  }

  async cancelListing(listingId, cancellerAddress) {
    const listing = await this.getListing(listingId)
    if (!listing) throw new Error('Listing not found')
    
    // Verify the canceller is the seller
    if (listing.seller_address.toLowerCase() !== cancellerAddress.toLowerCase()) {
      throw new Error('Only the seller can cancel their listing')
    }
    
    await this.db
      .prepare('UPDATE listings SET cancelled_at = CURRENT_TIMESTAMP WHERE listing_id = ?')
      .bind(listingId)
      .run()
    
    // Record cancellation
    await this.recordActivity({
      type: 'listing_cancelled',
      actor_address: cancellerAddress,
      nft_contract: listing.nft_contract,
      token_id: listing.token_id,
      price: listing.price,
      metadata: JSON.stringify({ listing_id: listingId })
    })
  }

  // Activity operations
  async recordActivity(activityData) {
    const { type, actor_address, nft_contract, token_id, price, metadata } = activityData
    
    return await this.db
      .prepare(`
        INSERT INTO activity (type, actor_address, nft_contract, token_id, price, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        type,
        actor_address.toLowerCase(),
        nft_contract.toLowerCase(),
        token_id,
        price,
        metadata
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
    
    if (filter.actor_address) {
      conditions.push('actor_address = ?')
      params.push(filter.actor_address.toLowerCase())
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
      SELECT a.*, u.username, u.display_name, u.pfp_url
      FROM activity a
      LEFT JOIN users u ON u.wallet_address = a.actor_address
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
  async getUserStats(walletAddress) {
    const address = walletAddress.toLowerCase()
    
    const [listings, sales, purchases] = await Promise.all([
      // Active listings
      this.db
        .prepare(`
          SELECT COUNT(*) as count, SUM(price) as total_value
          FROM listings
          WHERE seller_address = ?
            AND sold_at IS NULL
            AND cancelled_at IS NULL
            AND expiry > datetime('now')
        `)
        .bind(address)
        .first(),
      
      // Sales - count listings that were sold by this user
      this.db
        .prepare(`
          SELECT COUNT(*) as count, SUM(l.price) as total_volume
          FROM listings l
          WHERE l.seller_address = ?
            AND l.sold_at IS NOT NULL
        `)
        .bind(address)
        .first(),
      
      // Purchases
      this.db
        .prepare(`
          SELECT COUNT(*) as count, SUM(price) as total_spent
          FROM activity
          WHERE type = 'sale'
            AND actor_address = ?
        `)
        .bind(address)
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
}