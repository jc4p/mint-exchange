import { html } from 'hono/html'
import { Layout } from './layout.js'

export async function profilePage(c) {
  return c.html(
    Layout({
      children: html`
        <frame-provider>
          <div class="frame-provider">
            <main class="main-content">
              <profile-tab></profile-tab>
            </main>
            
            <nav-tabs active="profile"></nav-tabs>
            <create-listing></create-listing>
          </div>
        </frame-provider>
      `,
      title: 'Profile - FC NFT Exchange'
    })
  )
}