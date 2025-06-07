import { D1Database } from '@cloudflare/workers-types';

interface Subscription {
  notification_token: string;
  notification_url: string;
}

interface NotificationPayload {
  notifications: Array<{
    notificationId: string;
    title: string;
    body: string;
    targetUrl: string;
    token: string;
  }>;
}

/**
 * Sends a Frame notification to a user via their Farcaster client.
 *
 * @param db - The D1 Database instance.
 * @param fid - The Farcaster User ID of the recipient.
 * @param title - The title of the notification.
 * @param body - The body text of the notification.
 * @param targetUrl - The URL the user will be directed to when interacting with the notification.
 * @param notificationId - A stable and unique ID for this notification type (e.g., "new-comment-on-post-123").
 * @returns Promise<void>
 */
export async function sendFrameNotification(
  db: D1Database,
  fid: number,
  title: string,
  bodyText: string, // Renamed from 'body' to avoid conflict with Request.body
  targetUrl: string,
  notificationId: string
): Promise<void> {
  // 1. Database Lookup
  let subscription: Subscription | null = null;
  try {
    const stmt = db.prepare(
      'SELECT notification_token, notification_url FROM farcaster_notification_subscriptions WHERE fid = ? AND is_active = TRUE'
    );
    subscription = await stmt.bind(fid).first<Subscription>();
  } catch (error) {
    console.error(`Error fetching subscription for FID ${fid}:`, error);
    // Depending on desired behavior, could throw an error here
    return;
  }

  if (!subscription) {
    console.log(`No active Farcaster notification subscription found for FID ${fid}.`);
    return;
  }

  if (!subscription.notification_token || !subscription.notification_url) {
    console.error(`Incomplete subscription data for FID ${fid}: Missing token or URL.`);
    return;
  }

  // 2. Construct Notification Payload
  const payload: NotificationPayload = {
    notifications: [
      {
        notificationId,
        title,
        body: bodyText, // Use the renamed parameter
        targetUrl,
        token: subscription.notification_token,
      },
    ],
  };

  // 3. Send POST Request
  try {
    console.log(`Sending notification to FID ${fid} via URL: ${subscription.notification_url}`);
    const response = await fetch(subscription.notification_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // 4. Handle Response
    if (response.ok) {
      const responseBody = await response.json();
      // Farcaster clients should respond with HTTP 200 OK and a JSON body like {"status": "success", "message": "Notifications sent"}
      console.log(`Notification sent successfully to FID ${fid}. Response:`, responseBody);
    } else {
      const errorBody = await response.text();
      console.error(
        `Failed to send notification to FID ${fid}. Status: ${response.status}. Body: ${errorBody}`
      );
    }
  } catch (error) {
    console.error(`Error sending notification for FID ${fid}:`, error);
  }
}
