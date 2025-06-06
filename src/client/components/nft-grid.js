import { BaseElement } from './base-element.js'
import { EVENTS } from '../utils/events.js'

export class NFTGrid extends BaseElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this._state = {
      nfts: [],
      loading: true
    }
  }

  connectedCallback() {
    super.connectedCallback()
    
    // Listen for data refresh events
    this.subscribe(EVENTS.DATA_REFRESH, () => {
      this.loadNFTs()
    })
    
    // Listen for NFT events
    this.subscribe(EVENTS.NFT_LISTED, ({ listing }) => {
      // Add new listing to the grid
      this.setState({ 
        nfts: [listing, ...this._state.nfts] 
      })
    })
    
    // Always load from API
    this.loadNFTs()
  }

  async loadNFTs() {
    try {
      const response = await fetch('/api/listings')
      const data = await response.json()
      this.setState({ 
        nfts: data.listings || [],
        loading: false
      })
    } catch (error) {
      console.error('Failed to load NFTs:', error)
      this.setState({ loading: false })
    }
  }

  render() {
    const styles = `
      <style>
        :host {
          display: block;
          padding: 16px;
        }
        
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 20px;
        }
        
        .skeleton {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          border-radius: 12px;
          height: 320px;
        }
        
        @keyframes loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        
        .empty {
          grid-column: 1 / -1;
          text-align: center;
          padding: 60px 20px;
          color: var(--text-secondary, #6a7681);
        }
        
        .card {
          background: var(--surface-color, #FFFFFF);
          border: 1px solid var(--border-color, #f1f2f4);
          border-radius: 12px;
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
        }
        
        .image-wrapper {
          aspect-ratio: 1;
          overflow: hidden;
          background: var(--border-color, #f1f2f4);
        }
        
        .image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .content {
          padding: 16px;
        }
        
        .name {
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 8px 0;
          color: var(--text-primary, #121416);
        }
        
        .price {
          display: flex;
          align-items: baseline;
          gap: 4px;
        }
        
        .price-amount {
          font-size: 18px;
          font-weight: 700;
          color: var(--primary-color, #5B3EFF);
        }
        
        .price-currency {
          font-size: 14px;
          color: var(--text-secondary, #6a7681);
        }
        
        @media (min-width: 768px) {
          :host {
            padding: 24px;
          }
          
          .grid {
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 24px;
          }
        }
      </style>
    `
    
    if (this._state.loading) {
      this.shadowRoot.innerHTML = `
        ${styles}
        <div class="grid">
          ${[...Array(6)].map(() => `
            <div class="skeleton"></div>
          `).join('')}
        </div>
      `
      return
    }

    this.shadowRoot.innerHTML = `
      ${styles}
      <div class="grid">
        ${this._state.nfts.length === 0 ? `
          <div class="empty">
            <p>No NFTs available</p>
          </div>
        ` : this._state.nfts.map(nft => `
          <article class="card" data-id="${nft.id}">
            <div class="image-wrapper">
              <img 
                src="${nft.image || '/placeholder.png'}" 
                alt="${nft.name}"
                class="image"
                loading="lazy"
              />
            </div>
            <div class="content">
              <h3 class="name">${nft.name}</h3>
              <div class="price">
                <span class="price-amount">${nft.price}</span>
                <span class="price-currency">USDC</span>
              </div>
            </div>
          </article>
        `).join('')}
      </div>
    `
  }

  attachEventListeners() {
    const cards = this.shadowRoot.querySelectorAll('.card')
    cards.forEach(card => {
      this.on(card, 'click', (e) => {
        const id = e.currentTarget.dataset.id
        // Navigate to listing details page
        window.location.href = `/listing/${id}`
      })
    })
  }
}

customElements.define('nft-grid', NFTGrid)