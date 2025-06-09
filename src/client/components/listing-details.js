import { BaseElement } from './base-element.js'
import { EVENTS } from '../utils/events.js'
import { transactionManager } from '../utils/transactions.js'
import { showAlert, showConfirm } from './modal.js'
import { detectTokenStandardCached } from '../utils/token-standard.js'

export class ListingDetails extends BaseElement {
  constructor() {
    super()
    this._state = {
      listingData: null,
      loading: false,
      error: null,
      purchasingStep: null
    }
  }

  connectedCallback() {
    super.connectedCallback()
    
    // Get listing data from the action button if it exists
    const actionBtn = this.querySelector('#action-btn')
    if (actionBtn) {
      try {
        const listingData = JSON.parse(actionBtn.getAttribute('data-listing'))
        this.setState({ listingData })
      } catch (error) {
        console.error('Error parsing listing data:', error)
      }
    }
    
    
    // Listen for frame events to update button state
    this.subscribe(EVENTS.FRAME_READY, ({ user }) => {
      this.checkOwnership(user)
    })
    
    this.subscribe(EVENTS.AUTH_SUCCESS, ({ user }) => {
      this.checkOwnership(user)
    })
  }

  render() {
    // Don't re-render - we're using server-rendered HTML
    // Just attach event listeners
  }

  attachEventListeners() {
    // Handle share button
    const shareBtn = document.querySelector('#share-listing-btn')
    if (shareBtn) {
      this.on(shareBtn, 'click', () => this.handleShare(shareBtn))
    }

    // Handle action button clicks
    const actionBtn = this.querySelector('#action-btn')
    if (actionBtn) {
      this.on(actionBtn, 'click', () => {
        const isCancel = actionBtn.textContent.includes('Cancel')
        if (isCancel) {
          this.handleCancelListing()
        } else {
          this.handlePurchase()
        }
      })
    }
    
    // Handle frame-compatible links
    const links = this.querySelectorAll('a[target="_blank"]')
    links.forEach(link => {
      this.on(link, 'click', async (e) => {
        e.preventDefault()
        const url = link.href
        if (url) {
          const frameProvider = document.querySelector('frame-provider')
          if (frameProvider && frameProvider.constructor.openUrl) {
            await frameProvider.constructor.openUrl(url)
          } else {
            window.open(url, '_blank')
          }
        }
      })
    })
  }

  checkOwnership(user) {
    const { listingData } = this._state
    if (!listingData || !user || !user.fid) return
    
    const actionBtn = this.querySelector('#action-btn')
    if (!actionBtn) return
    
    const isOwner = user.fid == listingData.sellerFid
    
    if (isOwner) {
      actionBtn.textContent = 'Cancel Listing'
      actionBtn.style.background = '#ef4444'
      actionBtn.style.borderColor = '#ef4444'
      
      // Add helper text
      // const actionsDiv = this.querySelector('.listing-actions')
      // if (actionsDiv && !actionsDiv.querySelector('.owner-text')) {
      //   const ownerText = document.createElement('p')
      //   ownerText.className = 'owner-text'
      //   ownerText.style.cssText = 'margin-top: 12px; font-size: 14px; color: #6a7681; text-align: center;'
      //   ownerText.textContent = 'This is your listing'
      //   actionsDiv.appendChild(ownerText)
      // }
    }
  }

  async handleShare(shareBtn) {
    try {
      const listingId = shareBtn.getAttribute('data-listing-id')
      const listingName = shareBtn.getAttribute('data-listing-name')
      
      // Create the share text and URL
      const shareText = `Check out this auction on Mint Exchange: ${listingName}`
      const shareUrl = `${window.location.origin}/listing/${listingId}`
      
      // Create Warpcast compose URL
      const composeUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(shareText)}&embeds[]=${encodeURIComponent(shareUrl)}`
      
      // Get frame provider to use openUrl
      const frameProvider = document.querySelector('frame-provider')
      if (frameProvider && frameProvider.constructor.openUrl) {
        await frameProvider.constructor.openUrl(composeUrl)
      } else {
        // Fallback to regular window.open if not in frame
        window.open(composeUrl, '_blank')
      }
    } catch (error) {
      console.error('Error sharing:', error)
      await showAlert('Unable to share. Please try again.', 'Share Failed')
    }
  }

  async handlePurchase() {
    const { listingData } = this._state
    if (!listingData) return

    const actionBtn = this.querySelector('#action-btn')
    if (actionBtn) {
      actionBtn.disabled = true
      actionBtn.textContent = 'Processing...'
    }

    try {
      // Get user address from frame provider
      const frameProvider = document.querySelector('frame-provider')
      if (!frameProvider || !frameProvider._state.user) {
        throw new Error('Please connect your wallet first')
      }

      const userAddress = frameProvider._state.user.wallet_address

      // Fetch full listing details
      const response = await fetch(`/api/listings/${listingData.id}`)
      if (!response.ok) {
        throw new Error('Failed to fetch listing details')
      }
      const listing = await response.json()

      // Check network first
      await transactionManager.checkNetwork()

      // First approve USDC
      if (actionBtn) {
        actionBtn.textContent = 'Approving USDC...'
      }
      
      await transactionManager.approveUSDC(listing.price, listing.contractType || 'nft_exchange')

      // Then purchase NFT
      if (actionBtn) {
        actionBtn.textContent = 'Purchasing NFT...'
      }
      
      // Pass the full listing object for Seaport orders
      const purchaseTxHash = await transactionManager.buyListing(listing)

      // Notify backend immediately about the purchase
      if (actionBtn) {
        actionBtn.textContent = 'Recording purchase...'
      }
      
      const purchaseResponse = await fetch(`/api/listings/${listingData.id}/purchase`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${window.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ txHash: purchaseTxHash })
      })

      if (!purchaseResponse.ok) {
        console.error('Failed to record purchase:', await purchaseResponse.text())
        // Continue anyway - the indexer will catch it eventually
      }

      // Success - refresh the page to show updated status
      window.location.reload()
      
    } catch (error) {
      console.error('Purchase failed:', error)
      if (actionBtn) {
        actionBtn.disabled = false
        actionBtn.textContent = `Buy for $${listingData.price}`
      }
      await showAlert(error.message || 'Purchase failed. Please try again.', 'Purchase Failed')
    }
  }
  
  async handleCancelListing() {
    const { listingData } = this._state
    if (!listingData) return
    
    const confirmed = await showConfirm('Are you sure you want to cancel this listing?', 'Cancel Listing')
    if (!confirmed) {
      return
    }
    
    const actionBtn = this.querySelector('#action-btn')
    if (actionBtn) {
      actionBtn.disabled = true
      actionBtn.textContent = 'Cancelling...'
    }
    
    try {
      // Check network first
      await transactionManager.checkNetwork()
      
      // Get full listing details to get blockchain listing ID
      const response = await fetch(`/api/listings/${listingData.id}`)
      if (!response.ok) {
        throw new Error('Failed to fetch listing details')
      }
      const listing = await response.json()
      
      // Cancel the listing on the smart contract
      // For Seaport, we need to pass the order hash instead of listing ID
      const listingIdOrOrderHash = listing.contractType === 'seaport' ? listing.orderHash : listing.blockchainListingId
      const cancelTxHash = await transactionManager.cancelListing(listingIdOrOrderHash, listing.contractType || 'nft_exchange')

      // Notify backend immediately about the cancellation
      if (actionBtn) {
        actionBtn.textContent = 'Recording cancellation...'
      }
      
      const cancelResponse = await fetch(`/api/listings/${listingData.id}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${window.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ txHash: cancelTxHash })
      })

      if (!cancelResponse.ok) {
        console.error('Failed to record cancellation:', await cancelResponse.text())
        // Continue anyway - the indexer will catch it eventually
      }

      // Success - refresh the page
      window.location.reload()
    } catch (error) {
      console.error('Cancel listing failed:', error)
      if (actionBtn) {
        actionBtn.disabled = false
        actionBtn.textContent = 'Cancel Listing'
      }
      await showAlert(error.message || 'Failed to cancel listing. Please try again.', 'Cancel Failed')
    }
  }
}

customElements.define('listing-details', ListingDetails)