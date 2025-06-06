import { html } from 'hono/html'
import { Layout } from './layout.js'

export async function searchPage(c) {
  return c.html(
    Layout({
      children: html`
        <frame-provider>
          <main class="main-content">
            <search-page></search-page>
          </main>
          
          <nav-tabs active="search"></nav-tabs>
          <create-listing></create-listing>
        </frame-provider>
      `,
      title: 'Search NFTs - FC NFT Exchange'
    })
  )
}