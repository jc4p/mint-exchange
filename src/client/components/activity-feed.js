import { BaseElement } from './base-element.js'
import { EVENTS } from '../utils/events.js'

export class ActivityFeed extends BaseElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this._state = {
      activities: [],
      loading: true,
      filter: 'all', // all, listing_created, sale, offer_made
      page: 1,
      hasMore: true
    }
  }

  connectedCallback() {
    super.connectedCallback()
    this.fetchActivity()
  }

  async fetchActivity() {
    try {
      const { filter, page } = this._state
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20'
      })
      
      if (filter !== 'all') {
        params.append('type', filter)
      }
      
      const response = await fetch(`/api/activity?${params}`)
      const data = await response.json()
      
      if (page === 1) {
        this.setState({ 
          activities: data.activities || [],
          hasMore: data.pagination?.hasMore || false,
          loading: false
        })
      } else {
        this.setState({ 
          activities: [...this._state.activities, ...(data.activities || [])],
          hasMore: data.pagination?.hasMore || false,
          loading: false
        })
      }
    } catch (error) {
      console.error('Failed to fetch activity:', error)
      this.setState({ loading: false })
    }
  }

  formatTime(timestamp) {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    
    return date.toLocaleDateString()
  }

  getActivityIcon(type) {
    switch(type) {
      case 'listing_created':
        return 'M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM184,96a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,96Zm0,32a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,128Zm0,32a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,160Z'
      case 'sale':
        return 'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm45.66,85.66l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z'
      case 'offer_made':
        return 'M221.66,133.66l-72,72a8,8,0,0,1-11.32,0L117.66,185,28.28,274.35a16,16,0,0,1-22.63,0,16,16,0,0,1,0-22.63L95,162.34,74.34,141.66a8,8,0,0,1,0-11.32l72-72a8,8,0,0,1,11.32,0L178.34,79l25-25a8,8,0,0,1,11.32,11.32l-25,25,20.68,20.68a8,8,0,0,1,0,11.32Z'
      case 'offer_accepted':
        return 'M243.28,68.24l-24-23.56a16,16,0,0,0-22.59,0L168,73.35,147.28,52.7a16,16,0,0,0-22.59,0l-96,96a16,16,0,0,0,0,22.59l24,23.56a16,16,0,0,0,22.59,0L104,166.15l20.69,20.7a16,16,0,0,0,22.59,0l96-96A16,16,0,0,0,243.28,68.24Z'
      default:
        return 'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Z'
    }
  }

  getActivityDescription(activity) {
    const actor = activity.actor_display_name || activity.actor_username || `${activity.actor_address.slice(0, 6)}...${activity.actor_address.slice(-4)}`
    const nftName = activity.metadata?.nft_name || 'NFT'
    
    switch(activity.type) {
      case 'listing_created':
        return `${actor} listed ${nftName} for ${activity.metadata?.price || '0'} USDC`
      case 'sale':
        return `${actor} bought ${nftName} for ${activity.metadata?.price || '0'} USDC`
      case 'offer_made':
        return `${actor} made an offer of ${activity.metadata?.offer_amount || '0'} USDC on ${nftName}`
      case 'offer_accepted':
        return `${actor} accepted an offer on ${nftName}`
      case 'listing_cancelled':
        return `${actor} cancelled listing for ${nftName}`
      default:
        return `${actor} performed an action`
    }
  }

  getActivityColor(type) {
    switch(type) {
      case 'sale':
      case 'offer_accepted':
        return '#22c55e' // green
      case 'offer_made':
        return '#f59e0b' // amber
      case 'listing_created':
        return '#0c7ff2' // blue
      default:
        return '#49739c' // gray
    }
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
        
        /* Filter Tabs */
        .filter-tabs {
          display: flex;
          gap: 8px;
          padding: 16px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        
        .filter-tabs::-webkit-scrollbar {
          display: none;
        }
        
        .filter-tab {
          flex-shrink: 0;
          padding: 8px 16px;
          background: white;
          border: 1px solid #cedbe8;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 500;
          color: #49739c;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        
        .filter-tab:hover {
          border-color: #0c7ff2;
          color: #0c7ff2;
        }
        
        .filter-tab.active {
          background: #0c7ff2;
          border-color: #0c7ff2;
          color: white;
        }
        
        /* Activity List */
        .activity-list {
          padding: 0 16px;
        }
        
        .activity-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 0;
          border-bottom: 1px solid #e7edf4;
          cursor: pointer;
          transition: opacity 0.2s;
        }
        
        .activity-item:hover {
          opacity: 0.8;
        }
        
        .activity-item:last-child {
          border-bottom: none;
        }
        
        .activity-icon {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #e7edf4;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        
        .activity-icon svg {
          width: 20px;
          height: 20px;
        }
        
        .activity-details {
          flex: 1;
          min-width: 0;
        }
        
        .activity-description {
          color: #0d141c;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.4;
          margin: 0 0 4px 0;
        }
        
        .activity-time {
          color: #49739c;
          font-size: 12px;
          font-weight: 400;
          margin: 0;
        }
        
        .activity-image {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background-size: cover;
          background-position: center;
          background-color: #e7edf4;
          flex-shrink: 0;
        }
        
        /* Load More Button */
        .load-more-container {
          padding: 24px 16px;
        }
        
        .load-more {
          display: block;
          width: 100%;
          padding: 12px 24px;
          background: #e7edf4;
          color: #0d141c;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.015em;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .load-more:hover {
          background: #d9e2ec;
        }
        
        /* Loading State */
        .loading {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 80px 20px;
          color: #49739c;
        }
        
        /* Empty State */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 20px;
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
      </style>
    `

    if (this._state.loading && this._state.page === 1) {
      this.shadowRoot.innerHTML = `
        ${styles}
        <div class="loading">
          <p>Loading activity...</p>
        </div>
      `
      return
    }

    const { activities, filter, hasMore } = this._state

    this.shadowRoot.innerHTML = `
      ${styles}
      
      <div class="filter-tabs">
        <button class="filter-tab ${filter === 'all' ? 'active' : ''}" data-filter="all">
          All Activity
        </button>
        <button class="filter-tab ${filter === 'listing_created' ? 'active' : ''}" data-filter="listing_created">
          New Listings
        </button>
        <button class="filter-tab ${filter === 'sale' ? 'active' : ''}" data-filter="sale">
          Sales
        </button>
        <button class="filter-tab ${filter === 'offer_made' ? 'active' : ''}" data-filter="offer_made">
          Offers
        </button>
      </div>
      
      <div class="activity-list">
        ${activities.length > 0 ? activities.map(activity => {
          const iconColor = this.getActivityColor(activity.type)
          
          return `
            <div class="activity-item" data-id="${activity.id}">
              <div class="activity-icon" style="background-color: ${iconColor}20;">
                <svg xmlns="http://www.w3.org/2000/svg" fill="${iconColor}" viewBox="0 0 256 256">
                  <path d="${this.getActivityIcon(activity.type)}"></path>
                </svg>
              </div>
              <div class="activity-details">
                <p class="activity-description">${this.getActivityDescription(activity)}</p>
                <p class="activity-time">${this.formatTime(activity.created_at)}</p>
              </div>
              ${activity.metadata?.image_url ? `
                <div class="activity-image" style="background-image: url('${activity.metadata.image_url}')"></div>
              ` : ''}
            </div>
          `
        }).join('') : `
          <div class="empty-state">
            <div class="empty-icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256">
                <path d="M216,40V200a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V40A16,16,0,0,1,56,24H200A16,16,0,0,1,216,40ZM56,40V200H200V40ZM184,160a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,160Zm0-32a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,128Zm0-32a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,96Z"></path>
              </svg>
            </div>
            <h3 class="empty-title">No activity yet</h3>
            <p class="empty-text">Recent transactions will appear here</p>
          </div>
        `}
      </div>
      
      ${hasMore && activities.length > 0 ? `
        <div class="load-more-container">
          <button class="load-more">Load More</button>
        </div>
      ` : ''}
    `
  }

  attachEventListeners() {
    // Filter tabs
    const filterTabs = this.shadowRoot.querySelectorAll('.filter-tab')
    filterTabs.forEach(tab => {
      this.on(tab, 'click', (e) => {
        const filter = e.currentTarget.dataset.filter
        this.setState({ filter, page: 1, activities: [] })
        this.fetchActivity()
      })
    })

    // Load more button
    const loadMoreBtn = this.shadowRoot.querySelector('.load-more')
    if (loadMoreBtn) {
      this.on(loadMoreBtn, 'click', () => {
        this.setState({ page: this._state.page + 1 })
        this.fetchActivity()
      })
    }

    // Activity items
    const activityItems = this.shadowRoot.querySelectorAll('.activity-item')
    activityItems.forEach(item => {
      this.on(item, 'click', (e) => {
        const activityId = e.currentTarget.dataset.id
        const activity = this._state.activities.find(a => a.id === activityId)
        
        // Navigate to relevant page based on activity type
        if (activity.metadata?.listing_id) {
          window.location.href = `/listing/${activity.metadata.listing_id}`
        } else if (activity.metadata?.nft_contract && activity.metadata?.token_id) {
          // TODO: Navigate to NFT details page
          console.log('Navigate to NFT:', activity.metadata)
        }
      })
    })
  }
}

customElements.define('activity-feed', ActivityFeed)