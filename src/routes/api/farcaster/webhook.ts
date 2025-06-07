import { Hono } from 'hono';
import {
  parseWebhookEvent,
  verifyAppKeyWithNeynar,
  WebhookEvent,
  NotificationDetails,
} from '@farcaster/frame-node';

// Define the environment type
type Env = {
  DB: D1Database;
  NEYNAR_API_KEY: string;
};

const app = new Hono<{ Bindings: Env }>();

app.post('/', async (c) => {
  const neynarApiKey = c.env.NEYNAR_API_KEY;
  if (!neynarApiKey) {
    console.error('NEYNAR_API_KEY is not set');
    return c.json({ error: 'Internal Server Error: Missing Neynar API Key' }, 500);
  }

  let rawBody: string;
  try {
    rawBody = await c.req.text(); // Read raw body as text
  } catch (error) {
    console.error('Failed to read request body:', error);
    return c.json({ error: 'Bad Request: Could not read request body' }, 400);
  }

  const signature = c.req.header('x-neynar-signature');
  if (!signature) {
    console.error('Missing x-neynar-signature header');
    return c.json({ error: 'Unauthorized: Missing signature' }, 401);
  }

  let event: WebhookEvent;
  try {
    // parseWebhookEvent will verify the signature against the rawBody using the neynarApiKey
    event = await parseWebhookEvent(rawBody, signature, { neynarApiKey });
  } catch (error: any) {
    // Check if the error is due to signature mismatch for a more specific error message
    if (error.message && error.message.includes('signature mismatch')) {
      console.error('Webhook signature verification failed:', error.message);
      return c.json({ error: 'Unauthorized: Invalid signature' }, 401);
    }
    console.error('Failed to parse or verify webhook event:', error);
    return c.json({ error: 'Bad Request: Invalid event payload or signature' }, 400);
  }

  // Ensure event.message exists and contains signerFid and notificationDetails
  if (!event.message || typeof event.message.signerFid === 'undefined') {
    console.error('Could not extract fid from webhook event message');
    return c.json({ error: 'Bad Request: Missing fid in event payload' }, 400);
  }
  const fid = event.message.signerFid;
  const notificationDetails = event.message.notificationDetails as NotificationDetails | undefined;

  try {
    if (event.type === 'frame_added' || event.type === 'notifications_enabled') {
      if (!notificationDetails || !notificationDetails.token || !notificationDetails.url) {
        console.error('Missing notification token or URL for frame_added/notifications_enabled event. FID:', fid);
        return c.json({ error: 'Bad Request: Missing notification details' }, 400);
      }
      const { token, url } = notificationDetails;
      const stmt = c.env.DB.prepare(`
        INSERT INTO farcaster_notification_subscriptions (fid, notification_token, notification_url, is_active, updated_at)
        VALUES (?, ?, ?, TRUE, CURRENT_TIMESTAMP)
        ON CONFLICT(fid) DO UPDATE SET
        notification_token = excluded.notification_token,
        notification_url = excluded.notification_url,
        is_active = TRUE,
        updated_at = CURRENT_TIMESTAMP;
      `);
      await stmt.bind(fid, token, url).run();
      console.log(`Subscription activated/updated for FID: ${fid}`);
      return c.json({ message: 'Subscription activated/updated successfully' }, 200);

    } else if (event.type === 'frame_removed' || event.type === 'notifications_disabled') {
      const stmt = c.env.DB.prepare(`
        UPDATE farcaster_notification_subscriptions
        SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
        WHERE fid = ?;
      `);
      await stmt.bind(fid).run();
      console.log(`Subscription deactivated for FID: ${fid}`);
      return c.json({ message: 'Subscription deactivated successfully' }, 200);

    } else {
      console.log(`Received unhandled event type: ${event.type}`);
      return c.json({ message: 'Event type not handled' }, 202); // Accepted, but not processed
    }
  } catch (dbError) {
    console.error('Database error:', dbError);
    return c.json({ error: 'Internal Server Error: Database operation failed' }, 500);
  }
});

export default app;
