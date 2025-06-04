/**
 * Hydration utilities for custom elements
 * Helps custom elements read initial data from server-rendered attributes
 */

export function hydrateFromAttribute(element, attributeName = 'data-initial') {
  const data = element.getAttribute(attributeName)
  if (!data) return null
  
  try {
    return JSON.parse(data)
  } catch (error) {
    console.error(`Failed to parse ${attributeName}:`, error)
    return null
  }
}

export function hydrateFromSlot(element, slotName = null) {
  const slot = slotName 
    ? element.querySelector(`[slot="${slotName}"]`)
    : element.querySelector(':not([slot])')
  
  return slot ? slot.innerHTML : null
}

export function extractDataFromChildren(element, selector, extractor) {
  const children = element.querySelectorAll(selector)
  return Array.from(children).map(extractor)
}

/**
 * Progressive enhancement wrapper
 * Ensures custom element only enhances if JavaScript is available
 */
export function progressiveEnhance(element, enhancementFn) {
  // Mark element as enhanced to prevent double initialization
  if (element.hasAttribute('data-enhanced')) return
  
  element.setAttribute('data-enhanced', 'true')
  
  // Hide element briefly to prevent FOUC during enhancement
  const originalDisplay = element.style.display
  element.style.display = 'none'
  
  try {
    enhancementFn()
    // Restore display after enhancement
    requestAnimationFrame(() => {
      element.style.display = originalDisplay
    })
  } catch (error) {
    console.error('Enhancement failed:', error)
    // Restore original display on error
    element.style.display = originalDisplay
  }
}

/**
 * Preserve server-rendered content in shadow DOM
 * Useful for SEO and progressive enhancement
 */
export function preserveServerContent(element) {
  const serverContent = element.innerHTML
  const shadowRoot = element.shadowRoot || element.attachShadow({ mode: 'open' })
  
  // Create a slot for server content
  const slot = document.createElement('slot')
  slot.name = 'server-content'
  
  // Move server content to a named slot
  const wrapper = document.createElement('div')
  wrapper.setAttribute('slot', 'server-content')
  wrapper.innerHTML = serverContent
  
  element.innerHTML = ''
  element.appendChild(wrapper)
  
  return { shadowRoot, slot, serverContent }
}