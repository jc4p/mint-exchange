import { BaseElement } from './base-element.js'
import { EVENTS } from '../utils/events.js'

export class Modal extends BaseElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this._state = {
      isOpen: false,
      title: '',
      message: '',
      type: 'alert', // 'alert' or 'confirm'
      confirmText: 'OK',
      cancelText: 'Cancel',
      onConfirm: null,
      onCancel: null
    }
  }

  connectedCallback() {
    super.connectedCallback()
    
    // Listen for modal events
    this.subscribe(EVENTS.MODAL_OPEN, (data) => {
      this.show(data)
    })
    
    this.subscribe(EVENTS.MODAL_CLOSE, () => {
      this.hide()
    })
  }

  show(options) {
    this.setState({
      isOpen: true,
      title: options.title || 'Alert',
      message: options.message || '',
      type: options.type || 'alert',
      confirmText: options.confirmText || 'OK',
      cancelText: options.cancelText || 'Cancel',
      onConfirm: options.onConfirm || null,
      onCancel: options.onCancel || null
    })
  }

  hide() {
    this.setState({ isOpen: false })
  }

  handleConfirm() {
    if (this._state.onConfirm) {
      this._state.onConfirm()
    }
    this.hide()
  }

  handleCancel() {
    if (this._state.onCancel) {
      this._state.onCancel()
    }
    this.hide()
  }

  render() {
    const { isOpen, title, message, type, confirmText, cancelText } = this._state

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: ${isOpen ? 'block' : 'none'};
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .modal-content {
          background: white;
          border-radius: 12px;
          max-width: 400px;
          width: 100%;
          padding: 24px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }

        .modal-title {
          margin: 0 0 12px 0;
          font-size: 20px;
          font-weight: 600;
          color: #0d141c;
        }

        .modal-message {
          margin: 0 0 24px 0;
          font-size: 16px;
          line-height: 1.5;
          color: #49739c;
        }

        .modal-buttons {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }

        .modal-button {
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .modal-button-confirm {
          background: #0c7ff2;
          color: white;
        }

        .modal-button-confirm:hover {
          background: #0b6dd4;
        }

        .modal-button-cancel {
          background: #e7edf4;
          color: #49739c;
        }

        .modal-button-cancel:hover {
          background: #d9e2ec;
        }

        .modal-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      </style>

      ${isOpen ? `
        <div class="modal-overlay">
          <div class="modal-content">
            <h3 class="modal-title">${title}</h3>
            <p class="modal-message">${message}</p>
            <div class="modal-buttons">
              ${type === 'confirm' ? `
                <button class="modal-button modal-button-cancel">${cancelText}</button>
              ` : ''}
              <button class="modal-button modal-button-confirm">${confirmText}</button>
            </div>
          </div>
        </div>
      ` : ''}
    `
  }

  attachEventListeners() {
    const confirmBtn = this.shadowRoot.querySelector('.modal-button-confirm')
    if (confirmBtn) {
      this.on(confirmBtn, 'click', () => this.handleConfirm())
    }

    const cancelBtn = this.shadowRoot.querySelector('.modal-button-cancel')
    if (cancelBtn) {
      this.on(cancelBtn, 'click', () => this.handleCancel())
    }

    // Close on overlay click
    const overlay = this.shadowRoot.querySelector('.modal-overlay')
    if (overlay) {
      this.on(overlay, 'click', (e) => {
        if (e.target === overlay) {
          this.handleCancel()
        }
      })
    }
  }
}

customElements.define('app-modal', Modal)

// Helper functions to replace alert() and confirm()
export function showAlert(message, title = 'Alert') {
  const modal = document.querySelector('app-modal') || createModal()
  return new Promise((resolve) => {
    modal.show({
      type: 'alert',
      title,
      message,
      onConfirm: resolve
    })
  })
}

export function showConfirm(message, title = 'Confirm') {
  const modal = document.querySelector('app-modal') || createModal()
  return new Promise((resolve) => {
    modal.show({
      type: 'confirm',
      title,
      message,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false)
    })
  })
}

function createModal() {
  const modal = document.createElement('app-modal')
  document.body.appendChild(modal)
  return modal
}