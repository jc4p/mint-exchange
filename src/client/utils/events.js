import mitt from 'mitt'

// Create a singleton event bus
export const eventBus = mitt()

// Event types for better type safety and documentation
export const EVENTS = {
  // Frame events
  FRAME_READY: 'frame:ready',
  FRAME_ERROR: 'frame:error',
  
  // Auth events
  AUTH_REQUEST: 'auth:request',
  AUTH_SUCCESS: 'auth:success',
  AUTH_FAILED: 'auth:failed',
  AUTH_LOGOUT: 'auth:logout',
  
  // Navigation events
  TAB_CHANGE: 'nav:tab-change',
  ROUTE_CHANGE: 'nav:route-change',
  
  // NFT events
  NFT_SELECTED: 'nft:selected',
  NFT_LISTED: 'nft:listed',
  NFT_PURCHASED: 'nft:purchased',
  NFT_LISTING_CANCELLED: 'nft:listing-cancelled',
  CREATE_LISTING: 'nft:create-listing',
  EDIT_LISTING: 'nft:edit-listing',
  
  // UI events
  MODAL_OPEN: 'ui:modal-open',
  MODAL_CLOSE: 'ui:modal-close',
  TOAST_SHOW: 'ui:toast-show',
  
  // Data events
  DATA_REFRESH: 'data:refresh',
  DATA_LOADED: 'data:loaded',
  DATA_ERROR: 'data:error'
}

// Helper function to emit events with consistent structure
export function emit(eventName, data = {}) {
  eventBus.emit(eventName, {
    timestamp: Date.now(),
    ...data
  })
}

// Helper function to listen to events
export function on(eventName, handler) {
  eventBus.on(eventName, handler)
  // Return cleanup function
  return () => eventBus.off(eventName, handler)
}

// Helper function to listen once
export function once(eventName, handler) {
  const wrappedHandler = (data) => {
    handler(data)
    eventBus.off(eventName, wrappedHandler)
  }
  eventBus.on(eventName, wrappedHandler)
}