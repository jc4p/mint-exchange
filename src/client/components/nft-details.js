import { BaseElement } from './base-element.js'
import { EVENTS } from '../utils/events.js'
import { transactionManager } from '../utils/transactions.js'
import { frameUtils } from './frame-provider.js'
import { showAlert } from './modal.js'

export class NFTDetails extends BaseElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this._state = {
      nft: null,
      loading: false,
      error: null,
      buyLoading: false,
      userAddress: null
    }
  }

  connectedCallback() {
    super.connectedCallback()
    
    // Listen for NFT selection events
    this.subscribe(EVENTS.NFT_SELECTED, async ({ nft }) => {
      await this.loadNFTDetails(nft)
    })

    // Listen for wallet connection events
    this.subscribe(EVENTS.WALLET_CONNECTED, ({ address }) => {
      console.log('NFTDetails: Wallet connected', address)
      this.setState({ userAddress: address })
    })

    // Use stored wallet address if available
    if (window.userWalletAddress) {
      this.setState({ userAddress: window.userWalletAddress })
    }
  }

  async loadNFTDetails(nft) {
    this.setState({ loading: true, error: null })
    
    try {
      // Fetch full details from API
      const response = await fetch(`/api/listings/${nft.id}`)
      if (!response.ok) throw new Error('Failed to load listing details')
      
      const data = await response.json()
      this.setState({ nft: data, loading: false })
      
      // Show the modal
      this.showModal()
    } catch (error) {
      console.error('Error loading NFT details:', error)
      this.setState({ 
        error: 'Failed to load NFT details',
        loading: false 
      })
    }
  }

  showModal() {
    const modal = this.shadowRoot.querySelector('.modal-overlay')
    if (modal) {
      modal.classList.add('open')
    }
  }

  closeModal() {
    const modal = this.shadowRoot.querySelector('.modal-overlay')
    if (modal) {
      modal.classList.remove('open')
    }
    this.setState({ nft: null, error: null })
  }

  async buyNFT() {
    const { nft } = this._state
    if (!nft) return

    this.setState({ buyLoading: true, error: null })

    try {
      // Check network first
      await transactionManager.checkNetwork()

      // Use the listing ID directly
      const listingId = nft.id
      
      // Buy the listing
      console.log('Buying listing:', listingId, 'for', nft.price, 'USDC')
      const txHash = await transactionManager.buyListing(listingId, parseFloat(nft.price))
      
      console.log('Transaction submitted:', txHash)
      
      // Update UI
      await showAlert(`Purchase successful! Transaction: ${txHash}`, 'Purchase Complete')
      this.closeModal()
      
      // Emit event for other components to refresh
      this.emit(EVENTS.NFT_PURCHASED, { listing: nft, txHash })
      this.emit(EVENTS.DATA_REFRESH)
      
    } catch (error) {
      console.error('Error buying NFT:', error)
      this.setState({ 
        error: error.message || 'Failed to purchase NFT. Please try again.',
        buyLoading: false 
      })
    }
  }

  render() {
    const styles = `
      <style>
        :host {
          font-family: "Spline Sans", "Noto Sans", sans-serif;
        }
        
        .modal-overlay {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 1000;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        
        .modal-overlay.open {
          display: flex;
        }
        
        .modal {
          background: white;
          border-radius: 16px;
          max-width: 600px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
        }
        
        .close-button {
          position: absolute;
          top: 16px;
          right: 16px;
          background: rgba(255, 255, 255, 0.9);
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
          z-index: 10;
        }
        
        .close-button:hover {
          background: rgba(255, 255, 255, 1);
        }
        
        .close-button svg {
          width: 20px;
          height: 20px;
          fill: #49739c;
        }
        
        .nft-image {
          width: 100%;
          aspect-ratio: 1;
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
          background-color: #f1f2f4;
          border-radius: 16px 16px 0 0;
          position: relative;
        }
        
        .content {
          padding: 24px;
        }
        
        .nft-title {
          color: #0d141c;
          font-size: 24px;
          font-weight: 700;
          margin: 0 0 8px 0;
        }
        
        .collection-name {
          color: #49739c;
          font-size: 16px;
          margin: 0 0 24px 0;
        }
        
        .details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 24px;
        }
        
        .detail-item {
          padding: 16px;
          background: #f8fafc;
          border-radius: 12px;
        }
        
        .detail-label {
          color: #49739c;
          font-size: 14px;
          margin: 0 0 4px 0;
        }
        
        .detail-value {
          color: #0d141c;
          font-size: 18px;
          font-weight: 600;
          margin: 0;
        }
        
        .seller-info {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: #f8fafc;
          border-radius: 12px;
          margin-bottom: 24px;
        }
        
        .seller-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #e7edf4;
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
        }
        
        .seller-details {
          flex: 1;
        }
        
        .seller-label {
          color: #49739c;
          font-size: 14px;
          margin: 0 0 2px 0;
        }
        
        .seller-name {
          color: #0d141c;
          font-size: 16px;
          font-weight: 600;
          margin: 0;
        }
        
        .description {
          color: #49739c;
          font-size: 16px;
          line-height: 1.5;
          margin: 0 0 24px 0;
        }
        
        .error-message {
          color: #ff4757;
          font-size: 14px;
          margin: 0 0 16px 0;
          padding: 12px;
          background: #fff5f5;
          border-radius: 8px;
        }
        
        .action-buttons {
          display: flex;
          gap: 12px;
        }
        
        .button {
          flex: 1;
          padding: 16px 24px;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
          font-family: inherit;
        }
        
        .button-primary {
          background: #0c7ff2;
          color: white;
        }
        
        .button-primary:hover:not(:disabled) {
          background: #0968d9;
        }
        
        .button-primary:disabled {
          background: #b8c9dd;
          cursor: not-allowed;
        }
        
        .button-secondary {
          background: #e7edf4;
          color: #0d141c;
        }
        
        .button-secondary:hover {
          background: #d9e2ec;
        }
        
        .loading-skeleton {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          border-radius: 8px;
          height: 20px;
          margin: 8px 0;
        }
        
        @keyframes loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        
        @media (max-width: 480px) {
          .modal {
            margin: 20px;
          }
          
          .details-grid {
            grid-template-columns: 1fr;
          }
        }
      </style>
    `

    const { nft, loading, error, buyLoading, userAddress } = this._state

    if (!nft && !loading) {
      this.shadowRoot.innerHTML = `${styles}<div></div>`
      return
    }

    const isOwnListing = userAddress && nft?.seller?.address?.toLowerCase() === userAddress.toLowerCase()

    this.shadowRoot.innerHTML = `
      ${styles}
      <div class="modal-overlay ${nft ? 'open' : ''}">
        <div class="modal">
          ${loading ? `
            <div class="nft-image">
              <div class="loading-skeleton" style="height: 100%;"></div>
            </div>
            <div class="content">
              <div class="loading-skeleton" style="width: 60%; height: 32px;"></div>
              <div class="loading-skeleton" style="width: 40%; height: 20px;"></div>
            </div>
          ` : nft ? `
            <button class="close-button" aria-label="Close">
              <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256">
                <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"></path>
              </svg>
            </button>
            
            <div class="nft-image" style="background-image: url('${nft.image || '/placeholder.png'}')"></div>
            
            <div class="content">
              <h2 class="nft-title">${nft.name}</h2>
              <p class="collection-name">${nft.contractAddress}</p>
              
              ${nft.description ? `
                <p class="description">${nft.description}</p>
              ` : ''}
              
              <div class="details-grid">
                <div class="detail-item">
                  <p class="detail-label">Price</p>
                  <p class="detail-value">${nft.price} USDC</p>
                </div>
                <div class="detail-item">
                  <p class="detail-label">Token ID</p>
                  <p class="detail-value">#${nft.tokenId}</p>
                </div>
              </div>
              
              <div class="seller-info">
                ${nft.seller.pfp_url ? `
                  <div class="seller-avatar" style="background-image: url('${nft.seller.pfp_url}')"></div>
                ` : `
                  <div class="seller-avatar"></div>
                `}
                <div class="seller-details">
                  <p class="seller-label">Seller</p>
                  <p class="seller-name">${nft.seller.display_name || nft.seller.username || `${nft.seller.address.slice(0, 6)}...${nft.seller.address.slice(-4)}`}</p>
                </div>
              </div>
              
              ${error ? `
                <p class="error-message">${error}</p>
              ` : ''}
              
              <div class="action-buttons">
                ${nft.status === 'active' && !isOwnListing ? `
                  <button class="button button-primary" ${buyLoading ? 'disabled' : ''}>
                    ${buyLoading ? 'Processing...' : 'Buy Now'}
                  </button>
                ` : nft.status === 'sold' ? `
                  <button class="button button-primary" disabled>
                    Sold
                  </button>
                ` : isOwnListing ? `
                  <button class="button button-secondary" disabled>
                    Your Listing
                  </button>
                ` : ''}
                <button class="button button-secondary">
                  Close
                </button>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `
  }

  attachEventListeners() {
    // Close button
    const closeBtn = this.shadowRoot.querySelector('.close-button')
    if (closeBtn) {
      this.on(closeBtn, 'click', () => this.closeModal())
    }

    // Close on background click
    const overlay = this.shadowRoot.querySelector('.modal-overlay')
    if (overlay) {
      this.on(overlay, 'click', (e) => {
        if (e.target === overlay) {
          this.closeModal()
        }
      })
    }

    // Buy button
    const buyBtn = this.shadowRoot.querySelector('.button-primary:not([disabled])')
    if (buyBtn && !this._state.buyLoading) {
      this.on(buyBtn, 'click', () => this.buyNFT())
    }

    // Close button (secondary)
    const closeSecondaryBtn = this.shadowRoot.querySelector('.action-buttons .button-secondary')
    if (closeSecondaryBtn) {
      this.on(closeSecondaryBtn, 'click', () => this.closeModal())
    }
  }
}

customElements.define('nft-details', NFTDetails)