import { html } from 'hono/html'
import { Layout } from './layout.js'

export async function activityPage(c) {
  return c.html(
    Layout({
      children: html`
        <frame-provider>
          <main class="main-content">
            <activity-feed></activity-feed>
          </main>
          
          <nav-tabs active="activity"></nav-tabs>
          <create-listing></create-listing>
        </frame-provider>
      `,
      title: 'Activity Feed - FC NFT Exchange'
    })
  )
}