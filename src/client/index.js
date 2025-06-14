import './styles/base.css'
import './styles/app.css'
import './components/frame-provider.js'
import './components/auth-button.js'
import './components/nav-tabs.js'
import './components/nft-grid.js'
// import './components/nft-details.js' // Removed - using deeplinked pages now
import './components/featured-section.js'
import './components/latest-section.js'
import './components/profile-tab.js'
import './components/activity-feed.js'
import './components/create-listing.js'
import './components/search-page.js'
import './components/listing-details.js'
import './components/modal.js'
import { eventBus, EVENTS } from './utils/events.js'

console.log('Client index loaded - all components imported')

// Global event listeners using mitt
eventBus.on(EVENTS.TAB_CHANGE, ({ tab }) => {
  console.log('Tab changed to:', tab)
  
  // Navigate based on tab
  switch(tab) {
    case 'home':
      console.log('Navigating to home...')
      window.location.href = '/'
      break
    case 'profile':
      console.log('Navigating to profile...')
      window.location.href = '/profile'
      break
    case 'create':
      console.log('Create listing tab clicked')
      // Emit event to open create listing modal without a specific NFT
      eventBus.emit(EVENTS.CREATE_LISTING, { nft: null })
      break
    case 'activity':
      console.log('Navigating to activity...')
      window.location.href = '/activity'
      break
    case 'search':
      console.log('Navigating to search...')
      window.location.href = '/search'
      break
  }
})

// NFT_SELECTED event removed - using deeplinked pages now

eventBus.on(EVENTS.FRAME_READY, (data) => {
  console.log('Frame ready:', data)
})

eventBus.on(EVENTS.AUTH_SUCCESS, ({ user }) => {
  console.log('Auth success:', user)
})

eventBus.on(EVENTS.AUTH_FAILED, ({ error }) => {
  console.error('Auth failed:', error)
})

// Debug: Log all events
if (import.meta.env.DEV) {
  eventBus.on('*', (type, data) => {
    console.log(`[Event] ${type}:`, data)
  })
}