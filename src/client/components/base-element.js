import { emit, on } from '../utils/events.js'

export class BaseElement extends HTMLElement {
  constructor() {
    super()
    this._state = {}
    this._listeners = new Map()
    this._eventCleanups = []
  }

  connectedCallback() {
    this.render()
    this.attachEventListeners()
  }

  disconnectedCallback() {
    this.cleanup()
  }

  setState(newState) {
    const oldState = { ...this._state }
    this._state = { ...this._state, ...newState }
    this.stateChanged(oldState, this._state)
    // Clean up old DOM event listeners before re-rendering
    this._listeners.forEach((listener, element) => {
      Object.entries(listener).forEach(([event, handler]) => {
        element.removeEventListener(event, handler)
      })
    })
    this._listeners.clear()
    this.render()
    this.attachEventListeners()
  }

  getState() {
    return { ...this._state }
  }

  stateChanged(oldState, newState) {
  }

  render() {
  }

  attachEventListeners() {
  }

  cleanup() {
    // Clean up DOM event listeners
    this._listeners.forEach((listener, element) => {
      Object.entries(listener).forEach(([event, handler]) => {
        element.removeEventListener(event, handler)
      })
    })
    this._listeners.clear()
    
    // Clean up mitt event listeners
    this._eventCleanups.forEach(cleanup => cleanup())
    this._eventCleanups = []
  }

  on(element, event, handler) {
    if (!this._listeners.has(element)) {
      this._listeners.set(element, {})
    }
    const listeners = this._listeners.get(element)
    if (listeners[event]) {
      element.removeEventListener(event, listeners[event])
    }
    listeners[event] = handler
    element.addEventListener(event, handler)
  }

  emit(eventName, data = {}) {
    emit(eventName, data)
  }
  
  subscribe(eventName, handler) {
    const cleanup = on(eventName, handler)
    this._eventCleanups.push(cleanup)
    return cleanup
  }

  html(strings, ...values) {
    const template = strings.reduce((result, str, i) => {
      const value = values[i] !== undefined ? values[i] : ''
      return result + str + value
    }, '')
    
    const temp = document.createElement('template')
    temp.innerHTML = template.trim()
    
    return temp.content
  }

  clearContent() {
    while (this.firstChild) {
      this.removeChild(this.firstChild)
    }
  }

  setContent(content) {
    this.clearContent()
    if (typeof content === 'string') {
      this.innerHTML = content
    } else if (content instanceof DocumentFragment) {
      this.appendChild(content.cloneNode(true))
    } else if (content instanceof Element) {
      this.appendChild(content)
    }
  }

  getAttribute(name) {
    const value = super.getAttribute(name)
    if (value === null) return null
    
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }

  setAttribute(name, value) {
    if (typeof value === 'object') {
      super.setAttribute(name, JSON.stringify(value))
    } else {
      super.setAttribute(name, value)
    }
  }
}