import { BaseElement } from './base-element.js'
import { EVENTS } from '../utils/events.js'

export class FeaturedSection extends BaseElement {
  constructor() {
    super()
    // NO shadow DOM - we want to enhance server HTML
  }

  connectedCallback() {
    super.connectedCallback()
    
    // Check if we have an empty state
    const emptyState = this.querySelector('.empty-state')
    if (emptyState) {
      return
    }
    
    // Add click handler to featured collection tile
    const featuredTile = this.querySelector('.featured-collection-tile')
    if (featuredTile) {
      this.on(featuredTile, 'click', () => {
        const collectionAddress = featuredTile.dataset.collectionAddress
        if (collectionAddress) {
          window.location.href = `/collection/${collectionAddress}`
        }
      })
    }
  }




  render() {
    // We don't replace content - we enhance the existing DOM
  }

  disconnectedCallback() {
    super.disconnectedCallback()
  }

  attachEventListeners() {
    // Event listeners are handled in setupSwiper method
  }
}

customElements.define('featured-section', FeaturedSection)