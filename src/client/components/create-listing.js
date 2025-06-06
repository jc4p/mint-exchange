import { BaseElement } from './base-element.js'
import { EVENTS } from '../utils/events.js'
import { transactionManager } from '../utils/transactions.js'
import { showAlert } from './modal.js'

export class CreateListing extends BaseElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this._state = {
      isOpen: false,
      nft: null,
      price: '',
      expiryDays: 7,
      loading: false,
      error: null,
      // Manual entry fields
      contractAddress: '',
      tokenId: ''
    }
    this._priceDebounceTimer = null
  }

  connectedCallback() {
    super.connectedCallback()
    
    // Listen for create listing events
    this.subscribe(EVENTS.CREATE_LISTING, ({ nft }) => {
      this.openModal(nft)
    })
  }

  openModal(nft) {
    this.setState({
      isOpen: true,
      nft,
      price: '',
      error: null
    })
  }

  closeModal() {
    this.setState({
      isOpen: false,
      nft: null,
      price: '',
      error: null
    })
  }

  async submitListing() {
    const { nft, expiryDays } = this._state
    
    // Get the price from the input directly
    const priceInput = this.shadowRoot.querySelector('input[type="number"]')
    const price = priceInput?.value || this._priceValue || ''
    
    if (!price || parseFloat(price) <= 0) {
      this.setState({ error: 'Please enter a valid price' })
      return
    }
    
    this.setState({ loading: true, error: null })
    
    try {
      // Check network first
      await transactionManager.checkNetwork()
      
      // Create listing on blockchain
      console.log('Creating listing on blockchain...')
      const txHash = await transactionManager.createListing(
        nft.contract.address,
        nft.tokenId,
        parseFloat(price),
        expiryDays,
        false // Assuming ERC721 for now, can be enhanced to detect standard
      )
      
      console.log('Transaction submitted:', txHash)
      
      // Calculate expiry date
      const expiryDate = new Date()
      expiryDate.setDate(expiryDate.getDate() + expiryDays)
      
      // Save listing to database for indexing
      const response = await fetch('/api/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${window.authToken || ''}`
        },
        body: JSON.stringify({
          nftContract: nft.contract.address,
          tokenId: nft.tokenId,
          price: price,
          expiry: expiryDate.toISOString(),
          metadata: {
            name: nft.title,
            description: nft.description,
            image_url: nft.media[0]?.gateway || '',
            metadata_uri: ''
          },
          txHash: txHash
        })
      })
      
      if (!response.ok) {
        console.error('Failed to save listing to database')
      }
      
      const data = await response.json()
      
      // Success! Close modal and emit success event
      this.closeModal()
      this.emit(EVENTS.LISTING_CREATED, { listing: data })
      
      // Show success message with transaction link
      alert(`NFT listed successfully! Transaction: ${txHash}`)
      
    } catch (error) {
      console.error('Error creating listing:', error)
      this.setState({ 
        error: error.message || 'Failed to create listing. Please try again.',
        loading: false 
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
          max-width: 500px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
        }
        
        .modal-header {
          padding: 24px;
          border-bottom: 1px solid #e7edf4;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .modal-title {
          color: #0d141c;
          font-size: 20px;
          font-weight: 700;
          margin: 0;
        }
        
        .close-button {
          background: none;
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }
        
        .close-button:hover {
          background: #f8fafc;
        }
        
        .close-button svg {
          width: 20px;
          height: 20px;
          fill: #49739c;
        }
        
        .modal-body {
          padding: 24px;
        }
        
        .nft-preview {
          display: flex;
          gap: 16px;
          padding: 16px;
          background: #f8fafc;
          border-radius: 12px;
          margin-bottom: 24px;
        }
        
        .nft-image {
          width: 80px;
          height: 80px;
          border-radius: 8px;
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
          background-color: #e7edf4;
          flex-shrink: 0;
        }
        
        .nft-details {
          flex: 1;
          min-width: 0;
        }
        
        .nft-name {
          color: #0d141c;
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 4px 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .nft-collection {
          color: #49739c;
          font-size: 14px;
          margin: 0 0 4px 0;
        }
        
        .nft-token {
          color: #49739c;
          font-size: 12px;
          font-family: monospace;
          margin: 0;
        }
        
        .form-group {
          margin-bottom: 24px;
        }
        
        .form-label {
          display: block;
          color: #0d141c;
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 8px;
        }
        
        .form-input {
          width: 100%;
          padding: 12px 16px;
          border: 1px solid #cedbe8;
          border-radius: 8px;
          font-size: 16px;
          font-family: inherit;
          transition: border-color 0.2s;
          box-sizing: border-box;
        }
        
        .form-input:focus {
          outline: none;
          border-color: #0c7ff2;
        }
        
        .price-input-wrapper {
          position: relative;
        }
        
        .price-suffix {
          position: absolute;
          right: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: #49739c;
          font-size: 14px;
          font-weight: 600;
        }
        
        .expiry-options {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        
        .expiry-option {
          padding: 8px;
          border: 1px solid #cedbe8;
          border-radius: 8px;
          background: white;
          font-size: 14px;
          font-weight: 500;
          color: #49739c;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
        }
        
        .expiry-option:hover {
          border-color: #0c7ff2;
          color: #0c7ff2;
        }
        
        .expiry-option.active {
          background: #0c7ff2;
          border-color: #0c7ff2;
          color: white;
        }
        
        .error-message {
          color: #ff4757;
          font-size: 14px;
          margin-top: 8px;
        }
        
        .modal-footer {
          padding: 24px;
          border-top: 1px solid #e7edf4;
          display: flex;
          gap: 12px;
        }
        
        .button {
          flex: 1;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
          font-family: inherit;
        }
        
        .button-secondary {
          background: #e7edf4;
          color: #0d141c;
        }
        
        .button-secondary:hover {
          background: #d9e2ec;
        }
        
        .button-primary {
          background: #0c7ff2;
          color: white;
        }
        
        .button-primary:hover {
          background: #0968d9;
        }
        
        .button-primary:disabled {
          background: #b8c9dd;
          cursor: not-allowed;
        }
        
        @media (max-width: 480px) {
          .modal {
            margin: 20px;
          }
          
          .expiry-options {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      </style>
    `

    const { isOpen, nft, price, expiryDays, loading, error } = this._state

    this.shadowRoot.innerHTML = `
      ${styles}
      <div class="modal-overlay ${isOpen ? 'open' : ''}">
        <div class="modal">
          <div class="modal-header">
            <h2 class="modal-title">List NFT for Sale</h2>
            <button class="close-button" aria-label="Close">
              <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256">
                <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"></path>
              </svg>
            </button>
          </div>
          
          ${nft ? `
            <div class="modal-body">
              <div class="nft-preview">
                <div class="nft-image" style="background-image: url('${nft.media[0]?.gateway || '/placeholder.png'}')"></div>
                <div class="nft-details">
                  <h3 class="nft-name">${nft.title}</h3>
                  <p class="nft-collection">${nft.contract.name || 'Unknown Collection'}</p>
                  <p class="nft-token">Token ID: ${nft.tokenId}</p>
                </div>
              </div>
              
              <div class="form-group">
                <label class="form-label">List Price</label>
                <div class="price-input-wrapper">
                  <input 
                    type="number" 
                    class="form-input" 
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    inputmode="decimal"
                  />
                  <span class="price-suffix">USDC</span>
                </div>
                ${error ? `<p class="error-message">${error}</p>` : ''}
              </div>
              
              <div class="form-group">
                <label class="form-label">Listing Duration</label>
                <div class="expiry-options">
                  <button class="expiry-option ${expiryDays === 1 ? 'active' : ''}" data-days="1">
                    1 day
                  </button>
                  <button class="expiry-option ${expiryDays === 3 ? 'active' : ''}" data-days="3">
                    3 days
                  </button>
                  <button class="expiry-option ${expiryDays === 7 ? 'active' : ''}" data-days="7">
                    7 days
                  </button>
                  <button class="expiry-option ${expiryDays === 30 ? 'active' : ''}" data-days="30">
                    30 days
                  </button>
                </div>
              </div>
            </div>
            
            <div class="modal-footer">
              <button class="button button-secondary" ${loading ? 'disabled' : ''}>
                Cancel
              </button>
              <button class="button button-primary" ${loading || !price ? 'disabled' : ''}>
                ${loading ? 'Listing...' : 'List NFT'}
              </button>
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

    // Click outside to close
    const overlay = this.shadowRoot.querySelector('.modal-overlay')
    if (overlay) {
      this.on(overlay, 'click', (e) => {
        if (e.target === overlay) {
          this.closeModal()
        }
      })
    }

    // Price input - uncontrolled component
    const priceInput = this.shadowRoot.querySelector('input[type="number"]')
    if (priceInput) {
      // Just store the value internally without triggering re-render
      this.on(priceInput, 'input', (e) => {
        // Store the price value without setState
        this._priceValue = e.target.value
        
        // Clear error if there was one
        if (this._state.error) {
          this.setState({ error: null })
        }
      })
    }

    // Expiry options
    const expiryOptions = this.shadowRoot.querySelectorAll('.expiry-option')
    expiryOptions.forEach(option => {
      this.on(option, 'click', (e) => {
        const days = parseInt(e.currentTarget.dataset.days)
        this.setState({ expiryDays: days })
      })
    })

    // Submit button
    const submitBtn = this.shadowRoot.querySelector('.button-primary')
    if (submitBtn) {
      this.on(submitBtn, 'click', () => this.submitListing())
    }

    // Cancel button
    const cancelBtn = this.shadowRoot.querySelector('.button-secondary')
    if (cancelBtn) {
      this.on(cancelBtn, 'click', () => this.closeModal())
    }
  }
}

customElements.define('create-listing', CreateListing)