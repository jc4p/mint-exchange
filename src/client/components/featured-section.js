import { BaseElement } from './base-element.js'
import { EVENTS } from '../utils/events.js'

export class FeaturedSection extends BaseElement {
  constructor() {
    super()
    // NO shadow DOM - we want to enhance server HTML
    this._state = {
      currentIndex: 0,
      items: []
    }
  }

  connectedCallback() {
    super.connectedCallback()
    
    // Extract items data from existing server-rendered DOM
    const cards = this.querySelectorAll('.featured-card')
    const items = Array.from(cards).map((card, index) => ({
      id: `featured_${index}`,
      element: card
    }))
    
    this.setState({ items })
    
    // Only add styles once globally
    this.addStyles()
    
    // Add mobile carousel functionality
    this.setupCarousel()
    
    // Start auto-rotation for all screen sizes
    this.startAutoRotation()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.stopAutoRotation()
  }

  addStyles() {
    if (!document.getElementById('featured-section-enhanced-styles')) {
      const style = document.createElement('style')
      style.id = 'featured-section-enhanced-styles'
      style.textContent = `
        /* Enhancement styles */
        featured-section {
          display: block;
          position: relative;
        }
        
        /* Carousel for all screen sizes */
        featured-section .featured-container {
          transition: transform 0.5s ease-in-out;
        }
        
        /* Desktop carousel specific */
        @media (min-width: 768px) {
          featured-section {
            overflow: hidden;
            border-radius: 16px;
          }
          
          featured-section .featured-container {
            display: flex !important;
            gap: 0 !important;
          }
          
          featured-section .featured-card {
            flex: 0 0 33.333%;
            padding: 0 10px;
          }
        }
        
        /* Carousel indicators */
        featured-section .carousel-indicators {
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 8px;
          z-index: 10;
        }
        
        featured-section .carousel-indicators .indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          border: none;
          background: rgba(255,255,255,0.5);
          cursor: pointer;
          transition: background 0.3s;
        }
        
        featured-section .carousel-indicators .indicator.active {
          background: white;
        }
        
        /* Navigation arrows for desktop */
        @media (min-width: 768px) {
          featured-section .carousel-nav {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            width: 40px;
            height: 40px;
            background: rgba(0,0,0,0.5);
            border: none;
            border-radius: 50%;
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.3s;
            z-index: 10;
          }
          
          featured-section .carousel-nav:hover {
            background: rgba(0,0,0,0.7);
          }
          
          featured-section .carousel-nav.prev {
            left: 20px;
          }
          
          featured-section .carousel-nav.next {
            right: 20px;
          }
        }
      `
      document.head.appendChild(style)
    }
  }

  setupCarousel() {
    const container = this.querySelector('.featured-container')
    if (!container) return

    // Add carousel indicators
    if (this._state.items.length > 1 && !this.querySelector('.carousel-indicators')) {
      const indicators = document.createElement('div')
      indicators.className = 'carousel-indicators'
      
      this._state.items.forEach((_, index) => {
        const dot = document.createElement('button')
        dot.className = index === 0 ? 'indicator active' : 'indicator'
        dot.dataset.index = index
        indicators.appendChild(dot)
      })
      
      this.appendChild(indicators)
    }
    
    // Add navigation arrows for desktop
    if (window.innerWidth >= 768 && this._state.items.length > 3 && !this.querySelector('.carousel-nav')) {
      // Previous button
      const prevBtn = document.createElement('button')
      prevBtn.className = 'carousel-nav prev'
      prevBtn.innerHTML = '←'
      prevBtn.setAttribute('aria-label', 'Previous')
      
      // Next button
      const nextBtn = document.createElement('button')
      nextBtn.className = 'carousel-nav next'
      nextBtn.innerHTML = '→'
      nextBtn.setAttribute('aria-label', 'Next')
      
      this.appendChild(prevBtn)
      this.appendChild(nextBtn)
    }

    // Update carousel position
    this.updateCarousel()
  }

  updateCarousel() {
    const container = this.querySelector('.featured-container')
    if (!container) return
    
    if (window.innerWidth < 768) {
      // Mobile: Show one at a time
      container.style.transform = `translateX(-${this._state.currentIndex * 100}%)`
    } else {
      // Desktop: Show three at a time, scroll by one
      const itemsToShow = 3
      const maxIndex = Math.max(0, this._state.items.length - itemsToShow)
      const clampedIndex = Math.min(this._state.currentIndex, maxIndex)
      const translatePercent = (clampedIndex * 100) / itemsToShow
      container.style.transform = `translateX(-${translatePercent}%)`
    }
    
    // Update indicators
    const indicators = this.querySelectorAll('.indicator')
    indicators.forEach((dot, index) => {
      dot.classList.toggle('active', index === this._state.currentIndex)
    })
  }

  startAutoRotation() {
    this._rotationInterval = setInterval(() => {
      const nextIndex = (this._state.currentIndex + 1) % this._state.items.length
      this.setState({ currentIndex: nextIndex })
      this.updateCarousel()
    }, 5000)
  }

  stopAutoRotation() {
    if (this._rotationInterval) {
      clearInterval(this._rotationInterval)
      this._rotationInterval = null
    }
  }

  render() {
    // We don't replace content - just update carousel position
    this.updateCarousel()
  }

  attachEventListeners() {
    // Click handlers for cards
    const cards = this.querySelectorAll('.featured-card')
    cards.forEach((card, index) => {
      this.on(card, 'click', () => {
        const imageEl = card.querySelector('.featured-image')
        const titleEl = card.querySelector('.featured-title')
        const image = imageEl ? window.getComputedStyle(imageEl).backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/)?.[1] : ''
        const name = titleEl ? titleEl.textContent : ''
        
        this.emit(EVENTS.NFT_SELECTED, { 
          id: `featured_${index}`, 
          nft: { name, image }
        })
      })
    })

    // Indicator clicks
    const indicators = this.querySelectorAll('.indicator')
    indicators.forEach(indicator => {
      this.on(indicator, 'click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index)
        this.setState({ currentIndex: index })
        this.stopAutoRotation()
        this.startAutoRotation()
      })
    })

    // Pause on hover
    const container = this.querySelector('.featured-container')
    if (container) {
      this.on(container, 'mouseenter', () => this.stopAutoRotation())
      this.on(container, 'mouseleave', () => {
        this.startAutoRotation()
      })
    }

    // Handle nav button clicks
    const prevBtn = this.querySelector('.carousel-nav.prev')
    const nextBtn = this.querySelector('.carousel-nav.next')
    
    if (prevBtn) {
      this.on(prevBtn, 'click', () => {
        const newIndex = this._state.currentIndex > 0 ? this._state.currentIndex - 1 : this._state.items.length - 1
        this.setState({ currentIndex: newIndex })
        this.stopAutoRotation()
        this.startAutoRotation()
      })
    }
    
    if (nextBtn) {
      this.on(nextBtn, 'click', () => {
        const newIndex = (this._state.currentIndex + 1) % this._state.items.length
        this.setState({ currentIndex: newIndex })
        this.stopAutoRotation()
        this.startAutoRotation()
      })
    }
    
    // Handle resize
    this.on(window, 'resize', () => {
      // Re-setup carousel for new screen size
      this.setupCarousel()
      this.updateCarousel()
    })
  }
}

customElements.define('featured-section', FeaturedSection)