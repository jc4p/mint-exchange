import { BaseElement } from './base-element.js'
import { EVENTS } from '../utils/events.js'
import * as frame from '@farcaster/frame-sdk'

export class FrameProvider extends BaseElement {
  constructor() {
    super()
    this._state = {
      isFrameContext: false,
      context: null,
      user: null,
      loading: true,
      error: null
    }
  }

  async connectedCallback() {
    await this.initializeFrame()
    super.connectedCallback()
    
    // Listen for auth requests
    this.subscribe(EVENTS.AUTH_REQUEST, () => {
      this.authenticate()
    })
  }

  async initializeFrame() {
    try {
      const context = await frame.sdk.context
      const user = context?.user || null
      
      // Only consider it a frame context if we actually have context data
      const isFrameContext = !!context
      
      this.setState({
        isFrameContext,
        context,
        user,
        loading: false
      })

      if (isFrameContext) {
        await frame.sdk.actions.ready()
      }
      
      // Dispatch event for other components
      console.log('FrameProvider: Emitting FRAME_READY', { context, user, isFrameContext })
      this.emit(EVENTS.FRAME_READY, { context, user, isFrameContext })
      
    } catch (error) {
      console.log('Not in Frame context:', error.message)
      this.setState({
        isFrameContext: false,
        loading: false
      })
      
      // Dispatch event for non-frame context
      console.log('FrameProvider: Emitting FRAME_READY (non-frame)', { context: null, user: null, isFrameContext: false })
      this.emit(EVENTS.FRAME_READY, { context: null, user: null, isFrameContext: false })
    }
  }

  async authenticate() {
    if (!this._state.isFrameContext) {
      this.setState({ error: 'Authentication only available in Frame context' })
      this.emit(EVENTS.AUTH_FAILED, { error: 'Not in Frame context' })
      return null
    }

    try {
      // Use quickAuth as per the docs
      const { token } = await frame.sdk.experimental.quickAuth()
      
      if (token) {
        // Store the token for authenticated requests
        window.authToken = token
        
        // Decode the JWT to get user info (for display purposes only)
        // In production, verify this server-side
        const payload = JSON.parse(atob(token.split('.')[1]))
        const user = {
          fid: payload.sub,
          address: payload.address,
          token
        }
        
        this.setState({ user })
        this.emit(EVENTS.AUTH_SUCCESS, { user, token })
        return { user, token }
      }
    } catch (error) {
      console.error('Authentication failed:', error)
      this.setState({ error: 'Authentication failed' })
      this.emit(EVENTS.AUTH_FAILED, { error: error.message })
    }
    return null
  }

  async getWalletAddress() {
    if (!this._state.isFrameContext) return null
    
    try {
      const accounts = await frame.sdk.wallet.ethProvider.request({
        method: 'eth_requestAccounts'
      })
      return accounts[0]
    } catch (error) {
      console.error('Failed to get wallet address:', error)
      return null
    }
  }

  render() {
    // Don't replace existing content - just update the data attribute
    const providerDiv = this.querySelector('.frame-provider')
    if (providerDiv) {
      providerDiv.setAttribute('data-frame', this._state.isFrameContext)
    }
  }

  // Make Frame utilities available globally
  static get frameSDK() {
    return frame.sdk
  }

  static async openUrl(url) {
    try {
      await frame.sdk.actions.openUrl(url)
    } catch (error) {
      // Fallback for non-frame context
      window.open(url, '_blank')
    }
  }

  static async viewProfile(fid) {
    try {
      await frame.sdk.actions.viewProfile({ fid })
    } catch (error) {
      console.error('Cannot view profile outside Frame context')
    }
  }
}

customElements.define('frame-provider', FrameProvider)

// Export utilities
export const frameUtils = {
  sdk: frame.sdk,
  openUrl: FrameProvider.openUrl,
  viewProfile: FrameProvider.viewProfile
}