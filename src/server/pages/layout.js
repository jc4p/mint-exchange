import { html } from 'hono/html'

const FRAME_URL = "https://mint-exchange.xyz"

export const Layout = ({ children, title }) => html`
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title || 'FC NFT Exchange'}</title>
    <meta name="fc:frame" content='{"version":"next","imageUrl":"https://cover-art.kasra.codes/mint_exchange_rectangle.png","button":{"title":"Browse NFTs","action":{"type":"launch_frame","name":"Mint Exchange","url":"${FRAME_URL}","splashImageUrl":"https://cover-art.kasra.codes/mint_exchange_square.png","splashBackgroundColor":"#6DD8FD"}}}' />
    <script type="module" src="/bundle.js"></script>
    <link rel="stylesheet" href="/bundle.css">
  </head>
  <body>
    <div id="app">
      ${children}
    </div>
    <app-modal></app-modal>
  </body>
  </html>
`