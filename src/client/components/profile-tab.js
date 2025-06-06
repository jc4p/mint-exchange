import { BaseElement } from './base-element.js'
import { EVENTS } from '../utils/events.js'

export class ProfileTab extends BaseElement {
  constructor() {
    super()
    console.log('ProfileTab: Constructor called')
    this.attachShadow({ mode: 'open' })
    this._state = {
      user: null,
      fid: null,
      nfts: [],
      listings: [],
      purchases: [],
      stats: null,
      loading: true,
      contentLoading: true, // Separate loading state for NFT content
      activeView: 'owned', // 'owned', 'listings', 'purchases'
      nftsPage: 1,
      nftsPerPage: 12,
      totalNfts: 0
    }
  }

  connectedCallback() {
    super.connectedCallback()
    
    console.log('Profile: Connected, checking auth status')
    
    // Always start with loading state
    this.setState({ loading: true })
    
    // Check if we already have auth token
    if (window.authToken) {
      console.log('Profile: Auth token found, initializing')
      this.initialize()
    } else {
      console.log('Profile: No auth token, waiting for authentication')
      // Keep loading state while auth happens
    }
    
    // Listen for auth success events to initialize
    this.subscribe(EVENTS.AUTH_SUCCESS, async ({ user, token }) => {
      console.log('Profile: Auth success, initializing')
      await this.initialize()
    })
    
    // Listen for listing created events to refresh data
    this.subscribe(EVENTS.LISTING_CREATED, async () => {
      if (this._state.fid) {
        await this.fetchUserListings()
        await this.fetchUserStats()
      }
    })
  }

  async initialize() {
    // Keep loading state until we have user data
    
    // Fetch user data from API if we have auth token
    if (window.authToken) {
      try {
        const response = await fetch('/api/users/me', {
          headers: {
            'Authorization': `Bearer ${window.authToken}`
          }
        })
        if (response.ok) {
          const userData = await response.json()
          console.log('Fetched user data from /api/users/me:', userData)
          
          this.setState({ 
            user: userData, 
            fid: userData.fid,
            loading: false,
            contentLoading: true
          })
        } else {
          console.error('Failed to fetch user profile:', response.status)
          // Set default state without user data
          this.setState({ 
            user: null,
            fid: null,
            loading: false,
            contentLoading: true
          })
        }
      } catch (error) {
        console.error('Failed to fetch user profile:', error)
        this.setState({ 
          user: null,
          fid: null,
          loading: false,
          contentLoading: true
        })
      }
    } else {
      console.log('No auth token available')
      // For development/testing, use a test FID if not available
      this.setState({ 
        user: null,
        fid: 10000, // Test FID for development
        loading: false,
        contentLoading: true
      })
    }
    
    // Only fetch data if we have a valid FID
    if (this._state.fid) {
      // Fetch all data in parallel but don't wait for them
      Promise.all([
        this.fetchUserNFTs(),
        this.fetchUserListings(),
        this.fetchUserPurchases(),
        this.fetchUserStats()
      ]).then(() => {
        this.setState({ contentLoading: false })
      }).catch(error => {
        console.error('Error fetching user data:', error)
        this.setState({ contentLoading: false })
      })
    }
  }

  async fetchUserNFTs() {
    try {
      // If we have auth token, use /me endpoint
      const url = window.authToken 
        ? '/api/users/me/nfts'
        : `/api/users/${this._state.fid}/nfts`
      
      const headers = window.authToken 
        ? { 
            'Authorization': `Bearer ${window.authToken}`,
            'X-Wallet-Address': window.userWalletAddress || ''
          }
        : {}
        
      const response = await fetch(url, { headers })
      const data = await response.json()
      this.setState({ 
        nfts: data.nfts || [],
        totalNfts: data.pagination?.total || data.nfts?.length || 0
      })
    } catch (error) {
      console.error('Failed to fetch NFTs:', error)
      this.setState({ nfts: [], totalNfts: 0 })
    }
  }

  async fetchUserListings() {
    try {
      // If we have auth token, use /me endpoint
      const url = window.authToken 
        ? '/api/listings/me'
        : `/api/listings?seller_fid=${this._state.fid}`
      
      const headers = window.authToken 
        ? { 'Authorization': `Bearer ${window.authToken}` }
        : {}
        
      const response = await fetch(url, { headers })
      const data = await response.json()
      console.log('Fetched listings data:', data)
      this.setState({ listings: data.listings || [] })
    } catch (error) {
      console.error('Failed to fetch listings:', error)
      this.setState({ listings: [] })
    }
  }

  async fetchUserPurchases() {
    try {
      // If we have auth token, use /me endpoint
      const url = window.authToken 
        ? '/api/activity/me?type=sale'
        : `/api/activity?actor_fid=${this._state.fid}&type=sale`
      
      const headers = window.authToken 
        ? { 'Authorization': `Bearer ${window.authToken}` }
        : {}
        
      const response = await fetch(url, { headers })
      const data = await response.json()
      console.log('Fetched purchases data:', data)
      this.setState({ purchases: data.activities || [] })
    } catch (error) {
      console.error('Failed to fetch purchases:', error)
      this.setState({ purchases: [] })
    }
  }

  async fetchUserStats() {
    try {
      // If we have auth token, use /me endpoint
      const url = window.authToken 
        ? '/api/users/me/stats'
        : `/api/users/${this._state.fid}/stats`
      
      const headers = window.authToken 
        ? { 'Authorization': `Bearer ${window.authToken}` }
        : {}
        
      const response = await fetch(url, { headers })
      const data = await response.json()
      this.setState({ stats: data })
    } catch (error) {
      console.error('Failed to fetch stats:', error)
      this.setState({ stats: null })
    }
  }

  getAvatarUrl() {
    const { user } = this._state
    // Now everything uses pfpUrl (camelCase)
    if (user?.pfpUrl) return user.pfpUrl
    return `https://api.dicebear.com/7.x/shapes/svg?seed=${this._state.fid || 'default'}`
  }

  formatDate(dateString) {
    const date = new Date(dateString)
    const options = { month: 'short', day: 'numeric', year: 'numeric' }
    return date.toLocaleDateString('en-US', options)
  }

  getPaginatedNfts() {
    const { nfts, nftsPage, nftsPerPage } = this._state
    const startIndex = (nftsPage - 1) * nftsPerPage
    return nfts.slice(startIndex, startIndex + nftsPerPage)
  }

  getTotalPages() {
    const { totalNfts, nftsPerPage } = this._state
    return Math.ceil(totalNfts / nftsPerPage)
  }

  render() {
    const styles = `
      <style>
        :host {
          display: block;
          font-family: "Spline Sans", "Noto Sans", sans-serif;
          background: #f8fafc;
          min-height: 100vh;
          padding-bottom: 80px;
        }
        
        /* Profile Header Section */
        .profile-info {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          padding: 16px;
        }
        
        .avatar {
          width: 128px;
          height: 128px;
          border-radius: 50%;
          background-size: cover;
          background-repeat: no-repeat;
          background-position: center;
          background-color: #e7edf4;
        }
        
        .user-details {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        
        .username {
          color: #0d141c;
          font-size: 22px;
          font-weight: 700;
          line-height: 1.2;
          letter-spacing: -0.015em;
          margin: 0;
        }
        
        .wallet-address {
          color: #49739c;
          font-size: 16px;
          font-weight: 400;
          margin: 0;
        }
        
        /* Stats Cards */
        .stats-container {
          display: flex;
          justify-content: center;
          gap: 12px;
          padding: 12px 16px;
        }
        
        .stat-card {
          flex: 1;
          max-width: 200px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 12px;
          border: 1px solid #cedbe8;
          border-radius: 8px;
          background: white;
        }
        
        .stat-value {
          color: #0d141c;
          font-size: 24px;
          font-weight: 700;
          line-height: 1.2;
          margin: 0;
        }
        
        .stat-label {
          color: #49739c;
          font-size: 14px;
          font-weight: 400;
          margin: 0;
        }
        
        /* Tab Navigation */
        .tabs-container {
          padding-bottom: 12px;
        }
        
        .tabs {
          display: flex;
          border-bottom: 1px solid #cedbe8;
          padding: 0 16px;
          gap: 32px;
        }
        
        .tab {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 16px 0 13px;
          border-bottom: 3px solid transparent;
          background: none;
          border-top: none;
          border-left: none;
          border-right: none;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .tab-label {
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.015em;
          margin: 0;
        }
        
        .tab.active {
          border-bottom-color: #0c7ff2;
        }
        
        .tab.active .tab-label {
          color: #0d141c;
        }
        
        .tab:not(.active) .tab-label {
          color: #49739c;
        }
        
        /* Content Grid */
        .content-section {
          padding: 16px;
        }
        
        .nft-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(158px, 1fr));
          gap: 12px;
        }
        
        .nft-card {
          display: flex;
          flex-direction: column;
          background: white;
          border: 1px solid #cedbe8;
          border-radius: 12px;
          overflow: hidden;
          transition: all 0.2s;
        }
        
        .nft-card:hover {
          border-color: #b8c9dd;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          transform: translateY(-2px);
        }
        
        .nft-image {
          width: 100%;
          aspect-ratio: 1;
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
          background-color: #e7edf4;
        }
        
        .nft-info {
          padding: 12px;
        }
        
        .nft-title {
          color: #0d141c;
          font-size: 14px;
          font-weight: 600;
          margin: 0 0 4px 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .nft-collection {
          color: #49739c;
          font-size: 12px;
          margin: 0 0 12px 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .list-button {
          width: 100%;
          padding: 8px;
          background: #0c7ff2;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }
        
        .list-button:hover {
          background: #0968d9;
        }
        
        /* Listings View */
        .listings-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .listing-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          background: white;
          border: 1px solid #cedbe8;
          border-radius: 8px;
          transition: all 0.2s;
          cursor: pointer;
        }
        
        .listing-card:hover {
          border-color: #b8c9dd;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }
        
        .listing-image {
          width: 64px;
          height: 64px;
          border-radius: 8px;
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
          background-color: #e7edf4;
          flex-shrink: 0;
        }
        
        .listing-info {
          flex: 1;
          min-width: 0;
        }
        
        .listing-title {
          color: #0d141c;
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 4px 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .listing-price {
          color: #0c7ff2;
          font-size: 18px;
          font-weight: 700;
          margin: 0;
        }
        
        .listing-actions {
          display: flex;
          gap: 8px;
        }
        
        .listing-button {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          border: 1px solid #cedbe8;
          background: white;
          color: #49739c;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .listing-button:hover {
          border-color: #0c7ff2;
          color: #0c7ff2;
        }
        
        .listing-button.cancel {
          border-color: #ff4757;
          color: #ff4757;
        }
        
        .listing-button.cancel:hover {
          background: #ff4757;
          color: white;
        }
        
        /* Purchases View */
        .purchases-container {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 12px;
        }
        
        .purchase-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          background: white;
          border: 1px solid #cedbe8;
          border-radius: 8px;
          transition: all 0.2s;
        }
        
        .purchase-card:hover {
          border-color: #b8c9dd;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }
        
        .purchase-image {
          width: 64px;
          height: 64px;
          border-radius: 8px;
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
          background-color: #e7edf4;
          flex-shrink: 0;
        }
        
        .purchase-info {
          flex: 1;
          min-width: 0;
        }
        
        .purchase-title {
          color: #0d141c;
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 4px 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .purchase-price {
          color: #0c7ff2;
          font-size: 16px;
          font-weight: 700;
          margin: 0 0 4px 0;
        }
        
        .purchase-date {
          color: #49739c;
          font-size: 12px;
          margin: 0;
        }
        
        /* Loading State */
        .loading {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 80px 20px;
          color: #49739c;
        }
        
        /* Skeleton Loading */
        .skeleton-avatar {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          margin: 16px auto;
        }
        
        .skeleton-text {
          height: 20px;
          border-radius: 4px;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          margin: 8px auto;
        }
        
        .skeleton-text.title {
          width: 150px;
          height: 24px;
        }
        
        .skeleton-text.subtitle {
          width: 100px;
          height: 16px;
        }
        
        .skeleton-stat {
          flex: 1;
          max-width: 200px;
          height: 80px;
          border-radius: 8px;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
        }
        
        .skeleton-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          padding: 16px;
        }
        
        .skeleton-nft {
          aspect-ratio: 1;
          border-radius: 12px;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
        }
        
        @keyframes loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        
        /* Empty State */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          gap: 12px;
        }
        
        .empty-icon {
          width: 64px;
          height: 64px;
          background: #e7edf4;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 8px;
        }
        
        .empty-icon svg {
          width: 32px;
          height: 32px;
          fill: #49739c;
        }
        
        .empty-title {
          color: #0d141c;
          font-size: 18px;
          font-weight: 600;
          margin: 0;
        }
        
        .empty-text {
          color: #49739c;
          font-size: 14px;
          margin: 0;
        }
        
        /* Pagination */
        .pagination-container {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          margin-top: 24px;
          padding: 16px;
        }
        
        .pagination-button {
          padding: 8px 12px;
          background: white;
          border: 1px solid #cedbe8;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          color: #49739c;
          cursor: pointer;
          transition: all 0.2s;
          min-width: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .pagination-button:hover:not(:disabled) {
          border-color: #0c7ff2;
          color: #0c7ff2;
        }
        
        .pagination-button.active {
          background: #0c7ff2;
          border-color: #0c7ff2;
          color: white;
        }
        
        .pagination-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .pagination-info {
          color: #49739c;
          font-size: 14px;
          margin: 0 16px;
        }
        
      </style>
    `

    if (this._state.loading) {
      this.shadowRoot.innerHTML = `
        ${styles}
        <div class="profile-info">
          <div class="skeleton-avatar"></div>
          <div class="user-details">
            <div class="skeleton-text title"></div>
            <div class="skeleton-text subtitle"></div>
          </div>
        </div>
        
        <div class="stats-container">
          <div class="skeleton-stat"></div>
        </div>
        
        <div class="tabs-container">
          <div class="tabs">
            <button class="tab active" disabled>
              <p class="tab-label">Owned</p>
            </button>
            <button class="tab" disabled>
              <p class="tab-label">Listings</p>
            </button>
            <button class="tab" disabled>
              <p class="tab-label">Purchases</p>
            </button>
          </div>
        </div>
        
        <div class="skeleton-grid">
          ${[...Array(6)].map(() => `<div class="skeleton-nft"></div>`).join('')}
        </div>
      `
      return
    }

    const { fid, nfts, listings, purchases, stats, activeView, user, nftsPage, contentLoading } = this._state
    const avatarUrl = this.getAvatarUrl()
    const paginatedNfts = this.getPaginatedNfts()
    const totalPages = this.getTotalPages()
    
    console.log('Profile render state:', { activeView, listings: listings.length, purchases: purchases.length, nftsPage, totalPages })

    this.shadowRoot.innerHTML = `
      ${styles}
      
      <div class="profile-info">
        <div class="avatar" style="background-image: url('${avatarUrl}')"></div>
        <div class="user-details">
          <h1 class="username">${user?.displayName || user?.username || 'Anonymous User'}</h1>
          <p class="wallet-address">@${user?.username || `fid:${fid}`}</p>
        </div>
      </div>
      
      <div class="stats-container">
        <div class="stat-card">
          <p class="stat-value">${stats?.active_listings || 0}</p>
          <p class="stat-label">Active Listings</p>
        </div>
      </div>
      
      <div class="tabs-container">
        <div class="tabs">
          <button class="tab ${activeView === 'owned' ? 'active' : ''}" data-view="owned">
            <p class="tab-label">Owned</p>
          </button>
          <button class="tab ${activeView === 'listings' ? 'active' : ''}" data-view="listings">
            <p class="tab-label">Listings</p>
          </button>
          <button class="tab ${activeView === 'purchases' ? 'active' : ''}" data-view="purchases">
            <p class="tab-label">Purchases</p>
          </button>
        </div>
      </div>
      
      <div class="content-section">
        ${this._state.contentLoading ? `
          <div class="skeleton-grid">
            ${[...Array(4)].map(() => `<div class="skeleton-nft"></div>`).join('')}
          </div>
        ` : activeView === 'owned' ? `
          ${nfts.length > 0 ? `
            <div class="nft-grid">
              ${paginatedNfts.map(nft => `
                <div class="nft-card" data-contract="${nft.contract.address}" data-token="${nft.tokenId}">
                  <div class="nft-image" style="background-image: url('${nft.media[0]?.gateway || '/placeholder.png'}')"></div>
                  <div class="nft-info">
                    <h3 class="nft-title">${nft.title}</h3>
                    <p class="nft-collection">${nft.contract.name || 'Unknown Collection'}</p>
                    <button class="list-button">List for Sale</button>
                  </div>
                </div>
              `).join('')}
            </div>
            ${totalPages > 1 ? `
              <div class="pagination-container">
                <button class="pagination-button" data-action="prev" ${nftsPage === 1 ? 'disabled' : ''}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256">
                    <path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z"></path>
                  </svg>
                </button>
                
                ${Array.from({ length: totalPages }, (_, i) => i + 1).map(page => `
                  <button class="pagination-button ${page === nftsPage ? 'active' : ''}" data-page="${page}">
                    ${page}
                  </button>
                `).join('')}
                
                <button class="pagination-button" data-action="next" ${nftsPage === totalPages ? 'disabled' : ''}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256">
                    <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
                  </svg>
                </button>
                
                <p class="pagination-info">
                  ${(nftsPage - 1) * this._state.nftsPerPage + 1}-${Math.min(nftsPage * this._state.nftsPerPage, nfts.length)} of ${nfts.length}
                </p>
              </div>
            ` : ''}
          ` : `
            <div class="empty-state">
              <div class="empty-icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M224,48H32A8,8,0,0,0,24,56V192a8,8,0,0,0,8,8H224a8,8,0,0,0,8-8V56A8,8,0,0,0,224,48ZM40,172V152H216v20Zm0-36V120H216v16Zm0-32V84H216v20ZM216,68H40V64H216Z"></path>
                </svg>
              </div>
              <h3 class="empty-title">No NFTs found</h3>
              <p class="empty-text">NFTs you own on Base will appear here</p>
            </div>
          `}
        ` : activeView === 'listings' ? `
          ${listings.length > 0 ? `
            <div class="listings-container">
              ${listings.map(listing => `
                <div class="listing-card" data-id="${listing.id}">
                  <div class="listing-image" style="background-image: url('${listing.image || '/placeholder.png'}')"></div>
                  <div class="listing-info">
                    <h3 class="listing-title">${listing.name}</h3>
                    <p class="listing-price">${listing.price} USDC</p>
                  </div>
                  <div class="listing-actions">
                    <button class="listing-button" data-action="edit">Edit</button>
                    <button class="listing-button cancel" data-action="cancel">Cancel</button>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="empty-state">
              <div class="empty-icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM184,96a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,96Zm0,32a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,128Zm0,32a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,160Z"></path>
                </svg>
              </div>
              <h3 class="empty-title">No active listings</h3>
              <p class="empty-text">Your NFT listings will appear here</p>
            </div>
          `}
        ` : `
          ${purchases.length > 0 ? `
            <div class="purchases-container">
              ${purchases.map(purchase => `
                <div class="purchase-card">
                  <div class="purchase-image" style="background-image: url('${purchase.metadata?.image_url || '/placeholder.png'}')"></div>
                  <div class="purchase-info">
                    <h3 class="purchase-title">${purchase.metadata?.nft_name || 'NFT'}</h3>
                    <p class="purchase-price">${purchase.metadata?.price || '0'} USDC</p>
                    <p class="purchase-date">${this.formatDate(purchase.created_at)}</p>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="empty-state">
              <div class="empty-icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm40-68a28,28,0,0,1-28,28h-4v8a8,8,0,0,1-16,0v-8H104a8,8,0,0,1,0-16h36a12,12,0,0,0,0-24H116a28,28,0,0,1,0-56h4V72a8,8,0,0,1,16,0v8h16a8,8,0,0,1,0,16H116a12,12,0,0,0,0,24h24A28,28,0,0,1,168,148Z"></path>
                </svg>
              </div>
              <h3 class="empty-title">No purchases yet</h3>
              <p class="empty-text">Your purchase history will appear here</p>
            </div>
          `}
        `}
      </div>
    `
  }

  attachEventListeners() {
    // Tab switching
    const tabs = this.shadowRoot.querySelectorAll('.tab')
    console.log('Found tabs:', tabs.length)
    tabs.forEach(tab => {
      this.on(tab, 'click', (e) => {
        const view = e.currentTarget.dataset.view
        console.log('Tab clicked:', view)
        this.setState({ activeView: view, nftsPage: 1 }) // Reset to page 1 when switching tabs
      })
    })

    // Pagination buttons
    const paginationButtons = this.shadowRoot.querySelectorAll('.pagination-button')
    paginationButtons.forEach(btn => {
      this.on(btn, 'click', (e) => {
        const action = e.currentTarget.dataset.action
        const page = e.currentTarget.dataset.page
        
        if (page) {
          // Direct page navigation
          this.setState({ nftsPage: parseInt(page) })
        } else if (action === 'prev' && this._state.nftsPage > 1) {
          // Previous page
          this.setState({ nftsPage: this._state.nftsPage - 1 })
        } else if (action === 'next' && this._state.nftsPage < this.getTotalPages()) {
          // Next page
          this.setState({ nftsPage: this._state.nftsPage + 1 })
        }
      })
    })


    // List buttons on NFT cards
    const listBtns = this.shadowRoot.querySelectorAll('.list-button')
    listBtns.forEach(btn => {
      this.on(btn, 'click', (e) => {
        e.stopPropagation()
        const card = e.target.closest('.nft-card')
        const contract = card.dataset.contract
        const tokenId = card.dataset.token
        const nft = this._state.nfts.find(n => 
          n.contract.address === contract && n.tokenId === tokenId
        )
        
        // Emit event to open create listing modal
        this.emit(EVENTS.CREATE_LISTING, { nft })
      })
    })
    
    // No click handler for NFT images - only the list button should be clickable

    // Click on listing cards to view details
    const listingCards = this.shadowRoot.querySelectorAll('.listing-card')
    console.log('Found listing cards:', listingCards.length)
    listingCards.forEach(card => {
      this.on(card, 'click', (e) => {
        // Don't trigger if clicking on buttons
        if (e.target.closest('.listing-button')) return
        
        const listingId = card.dataset.id
        console.log('Listing card clicked, ID:', listingId, 'type:', typeof listingId)
        console.log('All listing IDs:', this._state.listings.map(l => ({ id: l.id, type: typeof l.id })))
        const listing = this._state.listings.find(l => l.id == listingId) // Use == instead of === to handle type mismatch
        console.log('Found listing:', listing)
        
        if (listing) {
          console.log('Navigating to listing details:', listing)
          window.location.href = `/listing/${listing.id}`
        }
      })
    })
    
    // Listing actions
    const listingButtons = this.shadowRoot.querySelectorAll('.listing-button')
    listingButtons.forEach(btn => {
      this.on(btn, 'click', (e) => {
        e.stopPropagation()
        const action = e.currentTarget.dataset.action
        const listingCard = e.currentTarget.closest('.listing-card')
        const listingId = listingCard.dataset.id
        const listing = this._state.listings.find(l => l.id === listingId)
        
        if (action === 'cancel') {
          this.cancelListing(listing)
        } else if (action === 'edit') {
          this.emit(EVENTS.EDIT_LISTING, { listing })
        }
      })
    })
  }

  async cancelListing(listing) {
    if (!confirm(`Cancel listing for ${listing.name}?`)) return
    
    try {
      // TODO: Call smart contract to cancel listing
      // For now, just update database
      const response = await fetch(`/api/listings/${listing.id}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${window.authToken}`
        }
      })
      
      if (response.ok) {
        // Refresh listings
        await this.fetchUserListings()
      }
    } catch (error) {
      console.error('Failed to cancel listing:', error)
    }
  }
}

customElements.define('profile-tab', ProfileTab)