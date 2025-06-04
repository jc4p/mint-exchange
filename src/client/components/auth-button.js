import { BaseElement } from './base-element.js'
import { EVENTS } from '../utils/events.js'

export class AuthButton extends BaseElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this._state = {
      authenticated: false,
      user: null,
      loading: false,
      isFrameContext: false
    }
  }

  connectedCallback() {
    super.connectedCallback()
    
    // Listen for events using mitt
    this.subscribe(EVENTS.FRAME_READY, ({ user, isFrameContext }) => {
      this.setState({ isFrameContext })
      if (user) {
        this.setState({ authenticated: true, user })
      }
    })
    
    this.subscribe(EVENTS.AUTH_SUCCESS, ({ user }) => {
      this.setState({ authenticated: true, user, loading: false })
    })
    
    this.subscribe(EVENTS.AUTH_FAILED, ({ error }) => {
      this.setState({ loading: false })
      console.error('Auth failed:', error)
    })
  }

  async handleAuth() {
    this.setState({ loading: true })
    
    if (this._state.isFrameContext) {
      // Emit auth request event
      this.emit(EVENTS.AUTH_REQUEST)
    } else {
      // Fallback for testing outside frame
      setTimeout(() => {
        const testUser = { 
          fid: 12345, 
          username: 'testuser',
          displayName: 'Test User' 
        }
        this.setState({ 
          authenticated: true, 
          user: testUser,
          loading: false
        })
        this.emit(EVENTS.AUTH_SUCCESS, { user: testUser })
      }, 1000)
    }
  }

  render() {
    const styles = `
      <style>
        :host {
          display: inline-block;
        }
        
        button {
          background: var(--primary-color, #5B3EFF);
          color: white;
          border: none;
          border-radius: 8px;
          padding: 12px 24px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.2s;
          font-family: inherit;
        }
        
        button:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
        }
        
        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .auth-profile {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px;
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.02);
        }
        
        .auth-profile-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
        }
        
        .auth-profile-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        
        .auth-profile-username {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary, #121416);
        }
        
        .auth-profile-fid {
          font-size: 12px;
          color: var(--text-secondary, #6a7681);
        }
      </style>
    `

    if (this._state.authenticated && this._state.user) {
      const username = this._state.user.username || `user${this._state.user.fid}`
      this.shadowRoot.innerHTML = `
        ${styles}
        <div class="auth-profile">
          <img 
            src="https://ui-avatars.com/api/?name=${username}&background=5B3EFF&color=fff" 
            alt="Profile"
            class="auth-profile-avatar"
          />
          <div class="auth-profile-info">
            <span class="auth-profile-username">@${username}</span>
            <span class="auth-profile-fid">FID: ${this._state.user.fid}</span>
          </div>
        </div>
      `
    } else {
      this.shadowRoot.innerHTML = `
        ${styles}
        <button ${this._state.loading ? 'disabled' : ''}>
          ${this._state.loading ? 'Connecting...' : 'Connect with Farcaster'}
        </button>
      `
    }
  }

  attachEventListeners() {
    // Set up once on initial connection
    if (!this._hasAttachedListeners) {
      const button = this.shadowRoot.querySelector('button')
      if (button) {
        this.on(button, 'click', () => this.handleAuth())
        this._hasAttachedListeners = true
      }
    }
  }
}

customElements.define('auth-button', AuthButton)