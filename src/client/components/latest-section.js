import { BaseElement } from './base-element.js'
import { EVENTS } from '../utils/events.js'

export class LatestSection extends BaseElement {
  constructor() {
    super()
    // NO shadow DOM - we enhance server HTML
    this._state = {
      items: []
    }
  }

  connectedCallback() {
    super.connectedCallback()
    
    // Extract data from existing server-rendered DOM
    const items = this.querySelectorAll('.latest-item')
    const data = Array.from(items).map((item, index) => ({
      id: `latest_${index}`,
      element: item
    }))
    
    this.setState({ items: data })
    
    // Add enhanced styles
    this.addStyles()
  }

  addStyles() {
    if (!document.getElementById('latest-section-enhanced-styles')) {
      const style = document.createElement('style')
      style.id = 'latest-section-enhanced-styles'
      style.textContent = `
        latest-section {
          display: block;
        }
        
        latest-section .latest-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          background: var(--surface-color, #FFFFFF);
          border: 1px solid var(--border-color, #f1f2f4);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 16px;
        }
        
        latest-section .latest-item:last-child {
          margin-bottom: 0;
        }
        
        latest-section .latest-item:hover {
          background: var(--hover-color, #f8f9fa);
          transform: translateX(4px);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        latest-section .latest-info {
          flex: 1;
        }
        
        latest-section .latest-label {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0 0 4px 0;
        }
        
        /* Dynamic label colors based on content */
        latest-section .latest-label:contains("Trending"),
        latest-section .latest-label[data-type="trending"] {
          color: var(--success-color, #22c55e);
        }
        
        latest-section .latest-label:contains("New"),
        latest-section .latest-label[data-type="new"] {
          color: var(--primary-color, #5B3EFF);
        }
        
        latest-section .latest-label:contains("Popular"),
        latest-section .latest-label[data-type="popular"] {
          color: var(--warning-color, #f59e0b);
        }
        
        latest-section .latest-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary, #121416);
          margin: 0 0 4px 0;
        }
        
        latest-section .latest-description {
          font-size: 14px;
          color: var(--text-secondary, #6a7681);
          margin: 0;
        }
        
        latest-section .latest-image {
          width: 60px;
          height: 60px;
          border-radius: 8px;
          background-size: cover;
          background-position: center;
          background-color: var(--border-color, #f1f2f4);
          flex-shrink: 0;
        }
        
        @media (min-width: 768px) {
          latest-section {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
          }
          
          latest-section .latest-item {
            padding: 20px;
            margin-bottom: 0;
          }
          
          latest-section .latest-image {
            width: 80px;
            height: 80px;
          }
        }
      `
      document.head.appendChild(style)
    }
    
    // Apply label colors based on text content
    this.enhanceLabels()
  }

  enhanceLabels() {
    const labels = this.querySelectorAll('.latest-label')
    labels.forEach(label => {
      const text = label.textContent.toLowerCase().trim()
      if (text === 'trending') {
        label.style.color = 'var(--success-color, #22c55e)'
        label.dataset.type = 'trending'
      } else if (text === 'new') {
        label.style.color = 'var(--primary-color, #5B3EFF)'
        label.dataset.type = 'new'
      } else if (text === 'popular') {
        label.style.color = 'var(--warning-color, #f59e0b)'
        label.dataset.type = 'popular'
      }
    })
  }

  render() {
    // We don't re-render - we enhance existing server HTML
    // This method is called by BaseElement when state changes
  }

  attachEventListeners() {
    // Add click handlers to items
    const items = this.querySelectorAll('.latest-item')
    items.forEach((item, index) => {
      this.on(item, 'click', () => {
        // Extract data from the clicked item
        const labelEl = item.querySelector('.latest-label')
        const titleEl = item.querySelector('.latest-title')
        const priceEl = item.querySelector('.latest-description')
        const imageEl = item.querySelector('.latest-image')
        
        const nftData = {
          id: `latest_${index}`,
          label: labelEl ? labelEl.textContent : '',
          name: titleEl ? titleEl.textContent : '',
          price: priceEl ? priceEl.textContent : '',
          image: imageEl ? window.getComputedStyle(imageEl).backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/)?.[1] : ''
        }
        
        this.emit(EVENTS.NFT_SELECTED, { 
          id: nftData.id, 
          nft: nftData 
        })
      })
      
      // Add hover effect enhancement
      this.on(item, 'mouseenter', () => {
        item.style.transform = 'translateX(4px) scale(1.01)'
      })
      
      this.on(item, 'mouseleave', () => {
        item.style.transform = ''
      })
    })
  }
}

customElements.define('latest-section', LatestSection)