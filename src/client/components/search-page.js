import { BaseElement } from './base-element.js'
import { EVENTS } from '../utils/events.js'

export class SearchPage extends BaseElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this._state = {
      searchQuery: '',
      searchResults: [],
      loading: false,
      hasSearched: false,
      sortBy: 'recent' // recent, price_low, price_high
    }
  }

  async search() {
    const { searchQuery } = this._state
    
    if (!searchQuery.trim()) {
      this.setState({ searchResults: [], hasSearched: false })
      return
    }
    
    this.setState({ loading: true, hasSearched: true })
    
    try {
      // Search in listings
      const response = await fetch(`/api/listings?search=${encodeURIComponent(searchQuery)}&sort=${this._state.sortBy}`)
      const data = await response.json()
      
      this.setState({ 
        searchResults: data.listings || [],
        loading: false
      })
    } catch (error) {
      console.error('Search failed:', error)
      this.setState({ loading: false })
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
        
        .search-header {
          background: white;
          border-bottom: 1px solid #e7edf4;
          padding: 16px;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        
        .search-input-wrapper {
          position: relative;
          margin-bottom: 16px;
        }
        
        .search-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          width: 20px;
          height: 20px;
          fill: #49739c;
        }
        
        .search-input {
          width: 100%;
          padding: 12px 16px 12px 48px;
          border: 1px solid #cedbe8;
          border-radius: 12px;
          font-size: 16px;
          font-family: inherit;
          transition: border-color 0.2s;
          box-sizing: border-box;
        }
        
        .search-input:focus {
          outline: none;
          border-color: #0c7ff2;
        }
        
        .search-input::placeholder {
          color: #a0aec0;
        }
        
        .filter-row {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        
        .filter-row::-webkit-scrollbar {
          display: none;
        }
        
        .sort-button {
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
        
        .sort-button:hover {
          border-color: #0c7ff2;
          color: #0c7ff2;
        }
        
        .sort-button.active {
          background: #0c7ff2;
          border-color: #0c7ff2;
          color: white;
        }
        
        .results-section {
          padding: 16px;
        }
        
        .results-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        }
        
        .listing-card {
          background: white;
          border: 1px solid #cedbe8;
          border-radius: 12px;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .listing-card:hover {
          border-color: #b8c9dd;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          transform: translateY(-2px);
        }
        
        .listing-image {
          width: 100%;
          aspect-ratio: 1;
          background-size: cover;
          background-position: center;
          background-color: #e7edf4;
        }
        
        .listing-info {
          padding: 12px;
        }
        
        .listing-title {
          color: #0d141c;
          font-size: 14px;
          font-weight: 600;
          margin: 0 0 4px 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .listing-price {
          color: #0c7ff2;
          font-size: 16px;
          font-weight: 700;
          margin: 0 0 4px 0;
        }
        
        .listing-seller {
          color: #49739c;
          font-size: 12px;
          margin: 0;
        }
        
        .loading {
          text-align: center;
          padding: 60px 20px;
          color: #49739c;
        }
        
        .empty-state {
          text-align: center;
          padding: 80px 20px;
        }
        
        .empty-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 16px;
          background: #e7edf4;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
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
          margin: 0 0 8px 0;
        }
        
        .empty-text {
          color: #49739c;
          font-size: 14px;
          margin: 0;
        }
      </style>
    `

    const { searchQuery, searchResults, loading, hasSearched, sortBy } = this._state

    this.shadowRoot.innerHTML = `
      ${styles}
      
      <div class="search-header">
        <div class="search-input-wrapper">
          <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256">
            <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"></path>
          </svg>
          <input 
            type="text" 
            class="search-input" 
            placeholder="Search NFTs by name or collection..."
            value="${searchQuery}"
          />
        </div>
        
        <div class="filter-row">
          <button class="sort-button ${sortBy === 'recent' ? 'active' : ''}" data-sort="recent">
            Recently Listed
          </button>
          <button class="sort-button ${sortBy === 'price_low' ? 'active' : ''}" data-sort="price_low">
            Price: Low to High
          </button>
          <button class="sort-button ${sortBy === 'price_high' ? 'active' : ''}" data-sort="price_high">
            Price: High to Low
          </button>
        </div>
      </div>
      
      <div class="results-section">
        ${loading ? `
          <div class="loading">
            <p>Searching...</p>
          </div>
        ` : hasSearched ? `
          ${searchResults.length > 0 ? `
            <div class="results-grid">
              ${searchResults.map(listing => `
                <div class="listing-card" data-id="${listing.id}">
                  <div class="listing-image" style="background-image: url('${listing.image || '/placeholder.png'}')"></div>
                  <div class="listing-info">
                    <h3 class="listing-title">${listing.name}</h3>
                    <p class="listing-price">${listing.price} USDC</p>
                    <p class="listing-seller">@${listing.seller.username || listing.seller.address.slice(0, 6)}...</p>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="empty-state">
              <div class="empty-icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"></path>
                </svg>
              </div>
              <h3 class="empty-title">No results found</h3>
              <p class="empty-text">Try searching with different keywords</p>
            </div>
          `}
        ` : `
          <div class="empty-state">
            <div class="empty-icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256">
                <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"></path>
              </svg>
            </div>
            <h3 class="empty-title">Search for NFTs</h3>
            <p class="empty-text">Find NFTs by name or collection</p>
          </div>
        `}
      </div>
    `
  }

  attachEventListeners() {
    // Search input
    const searchInput = this.shadowRoot.querySelector('.search-input')
    if (searchInput) {
      let searchTimeout
      this.on(searchInput, 'input', (e) => {
        const query = e.target.value
        this.setState({ searchQuery: query })
        
        // Debounce search
        clearTimeout(searchTimeout)
        searchTimeout = setTimeout(() => {
          this.search()
        }, 500)
      })
    }

    // Sort buttons
    const sortButtons = this.shadowRoot.querySelectorAll('.sort-button')
    sortButtons.forEach(btn => {
      this.on(btn, 'click', (e) => {
        const sort = e.currentTarget.dataset.sort
        this.setState({ sortBy: sort })
        if (this._state.hasSearched) {
          this.search()
        }
      })
    })

    // Listing cards
    const listingCards = this.shadowRoot.querySelectorAll('.listing-card')
    listingCards.forEach(card => {
      this.on(card, 'click', (e) => {
        const listingId = e.currentTarget.dataset.id
        // TODO: Navigate to listing detail page
        console.log('Navigate to listing:', listingId)
      })
    })
  }
}

customElements.define('search-page', SearchPage)