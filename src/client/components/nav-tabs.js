import { BaseElement } from './base-element.js'
import { EVENTS } from '../utils/events.js'

export class NavTabs extends BaseElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this._state = {
      active: this.getAttribute('active') || 'browse'
    }
  }

  static get observedAttributes() {
    return ['active']
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'active' && oldValue !== newValue) {
      this.setState({ active: newValue })
    }
  }

  connectedCallback() {
    super.connectedCallback()
    
    // Detect current route and set active tab
    this.detectActiveTab()
    
    // Listen for tab changes from other components
    this.subscribe(EVENTS.TAB_CHANGE, ({ tab }) => {
      if (tab !== this._state.active) {
        this.setState({ active: tab })
      }
    })
    
    // Listen for navigation changes
    window.addEventListener('popstate', () => this.detectActiveTab())
  }
  
  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('popstate', () => this.detectActiveTab())
  }
  
  detectActiveTab() {
    const path = window.location.pathname
    let active = 'home'
    
    if (path.includes('/search')) {
      active = 'search'
    } else if (path.includes('/activity')) {
      active = 'activity'
    } else if (path.includes('/profile')) {
      active = 'profile'
    }
    
    this.setState({ active })
  }

  render() {
    const styles = `
      <style>
        :host {
          display: block;
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: var(--surface-color, #FFFFFF);
          border-top: 1px solid var(--border-color, #f1f2f4);
          z-index: 100;
        }
        
        .nav-tabs {
          width: 100%;
        }
        
        .nav-tabs-container {
          display: flex;
          justify-content: space-around;
          align-items: center;
          padding: 8px 0;
          max-width: 600px;
          margin: 0 auto;
        }
        
        .nav-tab {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 12px;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: opacity 0.2s;
          font-family: inherit;
          color: var(--text-secondary, #6a7681);
        }
        
        .nav-tab:hover {
          opacity: 0.8;
        }
        
        .nav-tab-active {
          color: var(--primary-color, #5B3EFF);
        }
        
        .nav-tab-icon {
          width: 28px;
          height: 28px;
        }
        
        .nav-tab-icon svg {
          width: 100%;
          height: 100%;
          fill: currentColor;
        }
        
        .nav-tab-label {
          font-size: 11px;
          font-weight: 500;
          margin: 0;
        }
        
        @media (min-width: 768px) {
          :host {
            position: static;
            border-top: none;
            border-bottom: 1px solid var(--border-color, #f1f2f4);
          }
          
          .nav-tabs-container {
            justify-content: center;
            gap: 32px;
          }
          
          .nav-tab {
            flex-direction: row;
            gap: 8px;
          }
          
          .nav-tab-label {
            font-size: 14px;
          }
        }
      </style>
    `
    
    const tabs = [
      { 
        id: 'home', 
        label: 'Home', 
        outlineIcon: 'M218.83,103.77l-80-75.48a1.14,1.14,0,0,1-.11-.11,16,16,0,0,0-21.53,0l-.11.11L37.17,103.77A16,16,0,0,0,32,115.55V208a16,16,0,0,0,16,16H88a16,16,0,0,0,16-16V168a8,8,0,0,1,8-8h32a8,8,0,0,1,8,8v40a16,16,0,0,0,16,16h40a16,16,0,0,0,16-16V115.55A16,16,0,0,0,218.83,103.77ZM208,208H168V168a24,24,0,0,0-24-24H112a24,24,0,0,0-24,24v40H48V115.55l.11-.1L128,40l79.9,75.43.11.1Z',
        fillIcon: 'M224,115.55V208a16,16,0,0,1-16,16H168a16,16,0,0,1-16-16V168a8,8,0,0,0-8-8H112a8,8,0,0,0-8,8v40a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V115.55a16,16,0,0,1,5.17-11.78l80-75.48.11-.11a16,16,0,0,1,21.53,0,1.14,1.14,0,0,0,.11.11l80,75.48A16,16,0,0,1,224,115.55Z'
      },
      { 
        id: 'search', 
        label: 'Search', 
        outlineIcon: 'M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z',
        fillIcon: 'M168,112a56,56,0,1,1-56-56A56.06,56.06,0,0,1,168,112Zm61.66,117.66a8,8,0,0,1-11.32,0l-50.06-50.07a88.11,88.11,0,1,1,11.31-11.31l50.07,50.06A8,8,0,0,1,229.66,229.66ZM112,184a72,72,0,1,0-72-72A72.08,72.08,0,0,0,112,184Z'
      },
      { 
        id: 'activity', 
        label: 'Activity', 
        outlineIcon: 'M221.8,175.94C216.25,166.38,208,139.33,208,104a80,80,0,1,0-160,0c0,35.34-8.26,62.38-13.81,71.94A16,16,0,0,0,48,200H88.81a40,40,0,0,0,78.38,0H208a16,16,0,0,0,13.8-24.06ZM128,216a24,24,0,0,1-22.62-16h45.24A24,24,0,0,1,128,216ZM48,184c7.7-13.24,16-43.92,16-80a64,64,0,1,1,128,0c0,36.05,8.28,66.73,16,80Z',
        fillIcon: 'M221.8,175.94C216.25,166.38,208,139.33,208,104a80,80,0,1,0-160,0c0,35.34-8.26,62.38-13.81,71.94A16,16,0,0,0,48,200H88.81a40,40,0,0,0,78.38,0H208a16,16,0,0,0,13.8-24.06ZM128,216a24,24,0,0,1-22.62-16h45.24A24,24,0,0,1,128,216Z'
      },
      { 
        id: 'profile', 
        label: 'Profile', 
        outlineIcon: 'M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z',
        fillIcon: 'M231.79,187.33A80,80,0,0,0,169.57,72.59,80,80,0,1,0,24.21,187.33,7.13,7.13,0,0,0,25,188.63a8,8,0,0,0,7,7.37,7.27,7.27,0,0,0,1.32.1H222.7A7.27,7.27,0,0,0,224,196a8,8,0,0,0,7-7.37A7.13,7.13,0,0,0,231.79,187.33ZM96,120a32,32,0,1,1,32,32A32,32,0,0,1,96,120Z'
      }
    ]
    
    this.shadowRoot.innerHTML = `
      ${styles}
      <nav class="nav-tabs">
        <div class="nav-tabs-container">
          ${tabs.map(tab => {
            const isActive = tab.id === this._state.active
            const icon = isActive ? tab.fillIcon : tab.outlineIcon
            return `
              <button class="nav-tab ${isActive ? 'nav-tab-active' : ''}" data-tab="${tab.id}" type="button">
                <div class="nav-tab-icon">
                  <svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256">
                    <path d="${icon}"></path>
                  </svg>
                </div>
              </button>
            `
          }).join('')}
        </div>
      </nav>
    `
  }

  attachEventListeners() {
    const buttons = this.shadowRoot.querySelectorAll('button[data-tab]')
    buttons.forEach(button => {
      this.on(button, 'click', (e) => {
        const tabId = e.currentTarget.dataset.tab
        this.setState({ active: tabId })
        this.emit(EVENTS.TAB_CHANGE, { tab: tabId })
      })
    })
  }
}

customElements.define('nav-tabs', NavTabs)