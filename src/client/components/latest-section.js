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
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 20px;
          padding: 0 1.25rem;
        }
        
        latest-section .latest-item {
          display: flex;
          flex-direction: column;
          background: var(--surface-color, #FFFFFF);
          border: 1px solid var(--border-color, #f1f2f4);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          overflow: hidden;
        }
        
        latest-section .latest-item:hover {
          transform: translateY(-4px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        }
        
        latest-section .latest-image {
          width: 100%;
          aspect-ratio: 1;
          background-size: contain;
          background-position: center;
          background-color: white;
          position: relative;
          overflow: hidden;
        }
        
        latest-section .latest-image::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, transparent 70%, rgba(0,0,0,0.1) 100%);
          opacity: 0;
          transition: opacity 0.2s;
        }
        
        latest-section .latest-item:hover .latest-image::after {
          opacity: 1;
        }
        
        latest-section .latest-info {
          padding: 16px;
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        
        latest-section .latest-label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0 0 8px 0;
        }
        
        /* Dynamic label colors based on content */
        latest-section .latest-label[data-type="trending"] {
          color: var(--success-color, #22c55e);
        }
        
        latest-section .latest-label[data-type="new"] {
          color: var(--primary-color, #5B3EFF);
        }
        
        latest-section .latest-label[data-type="popular"] {
          color: var(--warning-color, #f59e0b);
        }
        
        latest-section .latest-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary, #121416);
          margin: 0 0 8px 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        latest-section .latest-description {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-secondary, #6a7681);
          margin: 0;
          margin-top: auto;
        }
        
        @media (max-width: 768px) {
          latest-section {
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
            gap: 12px;
          }
          
          latest-section .latest-info {
            padding: 12px;
          }
          
          latest-section .latest-title {
            font-size: 14px;
          }
          
          latest-section .latest-description {
            font-size: 13px;
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
        const listingId = item.dataset.listingId
        if (!listingId) {
          console.error('No listing ID found on latest item')
          return
        }

        window.location.href = `/listing/${listingId}`
      })
    })
  }
}

customElements.define('latest-section', LatestSection)