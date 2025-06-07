-- Ensure a clean setup during development and testing
DROP TABLE IF EXISTS farcaster_notification_subscriptions;

-- Create the table for Farcaster Notification Subscriptions
CREATE TABLE IF NOT EXISTS farcaster_notification_subscriptions (
    fid INTEGER PRIMARY KEY,
    notification_token TEXT NOT NULL,
    notification_url TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
