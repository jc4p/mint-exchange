import { Hono } from 'hono';
import { sendFrameNotification } from '../../../lib/notifications'; // Adjusted path assuming src/lib
import { D1Database } from '@cloudflare/workers-types';

// Define the environment type
type Env = {
  DB: D1Database;
  // Add other env variables if needed, e.g., for base URL
  APP_BASE_URL?: string;
};

// Mock database interaction and types - replace with your actual types and logic
interface Offer {
  id: string; // offer_id
  nft_id: string;
  nft_name: string; // Name of the NFT
  seller_fid: number; // Farcaster ID of the NFT seller
  buyer_display_name: string; // Display name of the buyer making the offer
  amount: string; // e.g., "0.5 ETH"
  // other offer details
}

const app = new Hono<{ Bindings: Env }>();

// Mock function to simulate saving an offer and getting seller FID
// In a real app, this would involve actual database inserts and lookups
async function createOfferInDb(db: D1Database, offerDetails: any): Promise<Offer> {
  console.log('Simulating database insert for offer:', offerDetails);
  // Simulate fetching/knowing seller_fid. This might come from NFT ownership data.
  const mockSellerFid = offerDetails.proposed_seller_fid || 123; // Example FID

  // Simulate creating an offer ID
  const offerId = `offer-${Date.now()}`;

  const newOffer: Offer = {
    id: offerId,
    nft_id: offerDetails.nft_id || 'nft-001',
    nft_name: offerDetails.nft_name || 'Awesome NFT',
    seller_fid: mockSellerFid,
    buyer_display_name: offerDetails.buyer_display_name || 'Anonymous Buyer',
    amount: offerDetails.amount || '1 ETH',
  };
  // Here you would typically do: await db.prepare(...).bind(...).run();
  console.log(`Offer ${newOffer.id} "created" for NFT ${newOffer.nft_id} by ${newOffer.buyer_display_name} to seller FID ${newOffer.seller_fid}`);
  return newOffer;
}

app.post('/', async (c) => {
  const body = await c.req.json();

  // Assume body contains necessary data to create an offer
  // e.g., { nft_id: "some-nft-id", amount: "0.5 ETH", buyer_fid: 456, buyer_display_name: "Friendly Buyer", nft_name: "Cool NFT", proposed_seller_fid: 789 }

  if (!body.nft_id || !body.amount || !body.buyer_display_name || !body.nft_name || !body.proposed_seller_fid) {
    return c.json({ error: 'Missing required offer details' }, 400);
  }

  let newOffer: Offer;
  try {
    // Simulate saving the offer to the database
    newOffer = await createOfferInDb(c.env.DB, body);
  } catch (dbError) {
    console.error('Failed to create offer in DB:', dbError);
    return c.json({ error: 'Failed to create offer' }, 500);
  }

  // --- Send Notification ---
  if (newOffer.seller_fid) {
    const title = "New Offer Received!";
    // Make sure to use nft_name and buyer_display_name from the actual offer data
    const bodyText = `You've received a new offer on your NFT '${newOffer.nft_name}' from ${newOffer.buyer_display_name} for ${newOffer.amount}.`;

    // Construct targetUrl (ensure your base URL is configured or hardcoded appropriately)
    const appBaseUrl = c.env.APP_BASE_URL || 'https://your-app.com'; // Fallback if not in env
    const targetUrl = `${appBaseUrl}/nfts/${newOffer.nft_id}/offers/${newOffer.id}`;

    const notificationId = `new-offer-${newOffer.id}`; // Idempotent ID

    try {
      console.log(`Attempting to send notification for offer ${newOffer.id} to FID ${newOffer.seller_fid}`);
      await sendFrameNotification(
        c.env.DB,
        newOffer.seller_fid,
        title,
        bodyText,
        targetUrl,
        notificationId
      );
      console.log(`Notification successfully queued/sent for offer ${newOffer.id} to FID ${newOffer.seller_fid}`);
    } catch (notificationError) {
      // Log the error, but typically do not fail the entire transaction
      console.error(
        `Failed to send notification for offer ${newOffer.id} to FID ${newOffer.seller_fid}:`,
        notificationError
      );
      // Optionally, you could add this to a retry queue or monitoring system
    }
  } else {
    console.log(`Offer ${newOffer.id} created, but no seller_fid available for notification.`);
  }

  return c.json({ message: 'Offer created successfully', offer: newOffer }, 201);
});

export default app;
