import { Hono } from 'hono'
import { Database } from '../db.js'
import { authMiddleware } from '../middleware/auth.js'
import { fetchNFTMetadata } from '../utils/metadata.js'
import { SEAPORT_ABI } from '../blockchain.js'

const listings = new Hono()

// Get current user's listings (protected - uses JWT)
listings.get('/me', authMiddleware(), async (c) => {
  console.log('=== GET /api/listings/me ===')
  try {
    const db = new Database(c.env.DB)
    const user = c.get('user')
    console.log('User from JWT:', { fid: user.fid, username: user.username })
    
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '20')
    const sort = c.req.query('sort') || 'recent'
    console.log('Query params:', { page, limit, sort })
    
    const result = await db.getActiveListings({ 
      page, 
      limit, 
      sort, 
      sellerFid: user.fid, 
      search: null 
    })
    console.log('Database result:', { 
      listingCount: result.listings.length, 
      pagination: result.pagination 
    })
    
    // Transform data to match frontend expectations
    const transformedListings = result.listings.map(listing => ({
      id: listing.id,
      blockchainListingId: listing.blockchain_listing_id,
      tokenId: listing.token_id,
      contractAddress: listing.nft_contract,
      name: listing.name,
      image: listing.image_url,
      price: listing.price,
      shareImageUrl: listing.share_image_url,
      seller: {
        address: listing.seller_address,
        username: listing.username || user.username,
        fid: listing.seller_fid,
        display_name: listing.display_name || user.display_name,
        pfp_url: listing.pfp_url || user.pfp_url
      },
      listedAt: listing.created_at,
      expiresAt: listing.expiry,
      txHash: listing.tx_hash
    }))
    
    return c.json({
      listings: transformedListings,
      pagination: result.pagination
    })
  } catch (error) {
    console.error('❌ Error fetching user listings:', error)
    console.error('Stack trace:', error.stack)
    return c.json({ error: 'Failed to fetch your listings' }, 500)
  }
})

// Get all active listings
listings.get('/', async (c) => {
  console.log('=== GET /api/listings ===')
  try {
    const db = new Database(c.env.DB)
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '20')
    const sort = c.req.query('sort') || 'recent'
    const sellerFid = c.req.query('seller_fid') ? parseInt(c.req.query('seller_fid')) : null
    const search = c.req.query('search')
    const contractType = c.req.query('contract_type') // Added contract_type
    
    console.log('Query params:', { page, limit, sort, sellerFid, search, contractType })
    
    const result = await db.getActiveListings({ page, limit, sort, sellerFid, search, contractType })
    console.log('Database query result:', {
      listingCount: result.listings.length,
      pagination: result.pagination
    })
    
    // Transform data to match frontend expectations
    const transformedListings = result.listings.map(listing => {
      const baseListing = {
        id: listing.id,
        blockchainListingId: listing.blockchain_listing_id, // May be null for Seaport listings not yet matched
        tokenId: listing.token_id,
        contractAddress: listing.nft_contract,
        name: listing.name,
        image: listing.image_url,
        price: listing.price,
        seller: {
          address: listing.seller_address,
          username: listing.username || `user_${listing.seller_fid || 'unknown'}`,
          fid: listing.seller_fid,
          displayName: listing.display_name,
          pfpUrl: listing.pfp_url
        },
        listedAt: listing.created_at,
        expiresAt: listing.expiry,
        txHash: listing.tx_hash, // Initial tx_hash if applicable
        contractType: listing.contract_type
      };

      if (listing.contract_type === 'seaport') {
        console.log(`Seaport listing ${listing.id}:`, {
          orderHash: listing.order_hash,
          hasOrderParameters: !!listing.order_parameters,
          zoneAddress: listing.zone_address
        });
        return {
          ...baseListing,
          orderHash: listing.order_hash,
          orderData: listing.order_parameters ? JSON.parse(listing.order_parameters) : null, // Parse and rename for frontend compatibility
          orderParameters: listing.order_parameters, // Keep original for backward compatibility
          zoneAddress: listing.zone_address,
          conduitKey: listing.conduit_key,
          salt: listing.salt,
          counter: listing.counter
        };
      }
      return baseListing;
    })
    
    return c.json({
      listings: transformedListings,
      pagination: result.pagination
    })
  } catch (error) {
    console.error('❌ Error fetching listings:', error)
    console.error('Stack trace:', error.stack)
    
    // Fallback to mock data if database is not available
    if (error.message?.includes('D1_ERROR') || !c.env.DB) {
      console.log('⚠️ Falling back to mock data')
      const page = parseInt(c.req.query('page') || '1')
      const limit = parseInt(c.req.query('limit') || '20')
      
      // Mock data for development
      const mockListings = Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        tokenId: `${1000 + i}`,
        contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
        name: `Cool NFT #${1000 + i}`,
        image: `https://picsum.photos/seed/${i}/400/400`,
        price: (Math.random() * 100).toFixed(2),
        seller: {
          address: `0x${Math.random().toString(16).slice(2, 10)}`,
          username: `user${i}`,
          fid: 10000 + i
        },
        listedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }))
      
      const start = (page - 1) * limit
      const paginatedListings = mockListings.slice(start, start + limit)
      
      return c.json({
        listings: paginatedListings,
        pagination: {
          page,
          limit,
          total: mockListings.length,
          hasMore: start + limit < mockListings.length
        }
      })
    }
    
    // Re-throw other errors
    throw error
  }
})

// Get single listing
listings.get('/:id', async (c) => {
  try {
    const db = new Database(c.env.DB)
    const listingId = c.req.param('id')
    
    const listing = await db.getListing(listingId)
    if (!listing) {
      return c.json({ error: 'Listing not found' }, 404)
    }
    
    // Transform to match frontend format
    const transformed = {
      id: listing.id,
      blockchainListingId: listing.blockchain_listing_id, // May be null for Seaport if not yet matched
      tokenId: listing.token_id,
      contractAddress: listing.nft_contract,
      name: listing.name,
      description: listing.description,
      image: listing.image_url,
      price: listing.price,
      shareImageUrl: listing.share_image_url,
      seller: {
        address: listing.seller_address,
        username: listing.username || `user_${listing.seller_fid || 'unknown'}`,
        fid: listing.seller_fid,
        displayName: listing.display_name,
        pfpUrl: listing.pfp_url
      },
      listedAt: listing.created_at,
      expiresAt: listing.expiry,
      status: listing.sold_at ? 'sold' : listing.cancelled_at ? 'cancelled' : 'active',
      txHash: listing.tx_hash, // Initial tx_hash if applicable
      contractType: listing.contract_type
    };

    if (listing.contract_type === 'seaport') {
      transformed.orderHash = listing.order_hash;
      transformed.orderData = listing.order_parameters ? JSON.parse(listing.order_parameters) : null; // Parse and rename for frontend compatibility
      transformed.orderParameters = listing.order_parameters; // Keep original for backward compatibility
      transformed.zoneAddress = listing.zone_address;
      transformed.conduitKey = listing.conduit_key;
      transformed.salt = listing.salt;
      transformed.counter = listing.counter;
    }
    
    return c.json(transformed)
  } catch (error) {
    console.error('Error fetching listing:', error)
    return c.json({ error: 'Failed to fetch listing' }, 500)
  }
})

import { getOrderHash } from '../utils/seaport.js'; // Import getOrderHash

// Create listing (protected route - requires auth)
listings.post('/', authMiddleware(), async (c) => {
  try {
    const db = new Database(c.env.DB);
    const body = await c.req.json();
    const user = c.get('user'); // Authenticated user

    // Assuming new listings are Seaport orders
    const contractType = 'seaport'; // For now, default new listings to Seaport

    if (contractType === 'seaport') {
      if (!body.orderParameters || typeof body.orderParameters !== 'object') {
        return c.json({ error: 'Seaport orderParameters are required' }, 400);
      }
      // Signature might be required if we were to submit to Seaport, but for DB storage it's part of orderParameters
      // if (!body.signature) {
      //   return c.json({ error: 'Seaport order signature is required' }, 400);
      // }

      const orderParameters = body.orderParameters;

      // Extract necessary data from orderParameters
      const sellerAddress = orderParameters.offerer;
      const nftOfferItem = orderParameters.offer.find(item => item.itemType === 2 /* ERC721 */ || item.itemType === 3 /* ERC1155 */);
      if (!nftOfferItem) {
        return c.json({ error: 'Valid NFT (ERC721/ERC1155) must be in offer items' }, 400);
      }
      const nftContract = nftOfferItem.token;
      const tokenId = nftOfferItem.identifierOrCriteria.toString(); // Ensure this field name is correct

      // Calculate total price from consideration items going to the offerer
      let price = 0;
      const USDC_ADDRESS = c.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
      
      if (orderParameters.consideration && Array.isArray(orderParameters.consideration)) {
        for (const item of orderParameters.consideration) {
          if (item.recipient.toLowerCase() === sellerAddress.toLowerCase()) {
            // Check if this is a USDC payment (itemType 1 is ERC20)
            if (item.itemType === 1 && item.token.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
              // USDC has 6 decimals
              price += parseFloat(item.startAmount) / 1e6;
            } else if (item.itemType === 0) {
              // Native ETH has 18 decimals
              price += parseFloat(item.startAmount) / 1e18;
            }
            // Add other token types as needed
          }
        }
      }
      if (price === 0 && body.price) { // Fallback to body.price if not calculable or zero
        price = parseFloat(body.price);
      }
      if (isNaN(price)) {
        return c.json({ error: 'Invalid price calculation from orderParameters' }, 400);
      }


      const expiry = new Date(parseInt(orderParameters.endTime) * 1000).toISOString();

      // Calculate order_hash
      // Note: getOrderHash needs the Seaport contract address and chainId if it were to compute EIP-712 domain hash
      // But for Seaport's internal getOrderHash, it's a direct hash of components.
      // Assuming `getOrderHash` from `seaport.js` is designed for this.
      const orderHash = getOrderHash(orderParameters);

      // Fetch metadata
      let metadata = body.metadata || {};
      if (!metadata.image_url || !metadata.name) {
        const fetchedMetadata = await fetchNFTMetadata(c.env, nftContract, tokenId, metadata.metadata_uri);
        if (fetchedMetadata.success) {
          metadata = { ...metadata, ...fetchedMetadata };
        }
      }

      const listingData = {
        seller_fid: user.fid,
        seller_address: sellerAddress.toLowerCase(),
        nft_contract: nftContract.toLowerCase(),
        token_id: tokenId,
        price: price,
        expiry: expiry,
        metadata_uri: metadata.metadata_uri || '',
        image_url: metadata.image_url || '',
        name: metadata.name || `Token #${tokenId}`,
        description: metadata.description || '',
        contract_type: 'seaport',
        order_hash: orderHash,
        order_parameters: JSON.stringify(orderParameters), // Store the full parameters
        zone_address: orderParameters.zone?.toLowerCase(),
        conduit_key: orderParameters.conduitKey,
        salt: orderParameters.salt,
        counter: orderParameters.counter,
        blockchain_listing_id: null, // No direct equivalent for Seaport until matched
        tx_hash: body.txHash || null // Optional tx_hash if order is submitted on-chain immediately
      };

      const result = await db.createListing(listingData);
      const createdListing = await db.getListing(result.meta.last_row_id);
      return c.json(createdListing);

    } else { // Existing NFT_EXCHANGE logic (currently unreachable as we default to seaport)
      // This path would need to be triggered by a different contract_type in body if supported
      if (!body.txHash) {
        return c.json({ error: 'Transaction hash is required for nft_exchange listings' }, 400);
      }
      const { createRpcClient, waitForAndGetTransaction, waitForAndGetTransactionReceipt } = await import('../utils/rpc-client.js');
      const { parseAbi, decodeEventLog } = await import('viem');
      const client = createRpcClient(c.env);
      const [tx, receipt] = await Promise.all([
        waitForAndGetTransaction(client, body.txHash),
        waitForAndGetTransactionReceipt(client, body.txHash)
      ]);
      const sellerAddress = tx.from;
      const NFT_EXCHANGE_EVENTS = parseAbi(['event ListingCreated(uint256 indexed listingId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 price, string metadataURI)']);
      let blockchainListingId = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: NFT_EXCHANGE_EVENTS, data: log.data, topics: log.topics, strict: false });
          if (decoded.eventName === 'ListingCreated' && decoded.args.nftContract.toLowerCase() === body.nftContract.toLowerCase() && decoded.args.tokenId.toString() === body.tokenId.toString()) {
            blockchainListingId = decoded.args.listingId.toString();
            break;
          }
        } catch (e) { /* skip */ }
      }
      if (!blockchainListingId) return c.json({ error: 'Could not find ListingCreated event' }, 400);

      let metadata = body.metadata || {};
      if (!metadata.image_url || !metadata.name) {
         const fetchedMetadata = await fetchNFTMetadata(c.env, body.nftContract, body.tokenId, metadata.metadata_uri);
         if (fetchedMetadata.success) metadata = { ...metadata, ...fetchedMetadata };
      }

      const result = await db.createListing({
        blockchain_listing_id: blockchainListingId,
        seller_fid: user.fid, seller_address: sellerAddress,
        nft_contract: body.nftContract, token_id: body.tokenId, price: body.price, expiry: body.expiry,
        metadata_uri: metadata.metadata_uri || '', image_url: metadata.image_url || '',
        name: metadata.name || `Token #${body.tokenId}`, description: metadata.description || '',
        tx_hash: body.txHash, contract_type: 'nft_exchange'
      });
      const createdListing = await db.getListing(result.meta.last_row_id);
      return c.json(createdListing);
    }
  } catch (error) {
    console.error('Error creating listing:', error);
    return c.json({ error: `Failed to create listing: ${error.message}` }, 500);
  }
});


// Cancel listing (protected route) - Unified, handles both types
listings.delete('/:id', authMiddleware(), async (c) => {
  try {
    const db = new Database(c.env.DB);
    const user = c.get('user');
    const listingId = c.req.param('id');
    const txHash = c.req.query('txHash'); // For nft_exchange
    const body = await c.req.json().catch(() => ({})); // For Seaport, txHash might be in body

    const finalTxHash = txHash || body.txHash;

    if (!finalTxHash) {
      return c.json({ error: 'Transaction hash (txHash) is required in query or body' }, 400);
    }

    const listing = await db.getListing(listingId);
    if (!listing) {
      return c.json({ error: 'Listing not found' }, 404);
    }

    if (listing.seller_fid !== user.fid) {
      return c.json({ error: 'Unauthorized - You can only cancel your own listings' }, 403);
    }

    const { createRpcClient, waitForAndGetTransaction, waitForAndGetTransactionReceipt } = await import('../utils/rpc-client.js');
    const { parseAbi, decodeEventLog } = await import('viem');
    const client = createRpcClient(c.env);

    if (listing.contract_type === 'nft_exchange') {
      const tx = await waitForAndGetTransaction(client, finalTxHash);
      const cancellerAddress = tx.from;
      // Ensure canceller from tx matches listing seller from db, or authenticated user if stricter
      if (cancellerAddress.toLowerCase() !== listing.seller_address.toLowerCase()){
         return c.json({ error: 'Transaction sender does not match listing seller for nft_exchange type.' }, 403);
      }
      await db.cancelListing(listing.blockchain_listing_id, cancellerAddress, finalTxHash);
    } else if (listing.contract_type === 'seaport') {
      const receipt = await waitForAndGetTransactionReceipt(client, finalTxHash);
      if (receipt.status !== 'success') {
        return c.json({ error: 'Seaport cancellation transaction failed' }, 400);
      }
      let eventFound = false;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== c.env.SEAPORT_CONTRACT_ADDRESS?.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({ abi: SEAPORT_ABI, data: log.data, topics: log.topics, eventName: 'OrderCancelled', strict: false });
          if (decoded && decoded.args && decoded.args.orderHash === listing.order_hash) {
            if (decoded.args.offerer.toLowerCase() !== listing.seller_address.toLowerCase()) {
              return c.json({ error: 'Order canceller does not match listing seller.' }, 403);
            }
            await db.cancelSeaportListingByOrderHash({
              orderHash: listing.order_hash,
              cancellerAddress: decoded.args.offerer,
              cancelTxHash: finalTxHash,
              contractType: 'seaport'
            });
            eventFound = true;
            break;
          }
        } catch (e) { /* Skip decoding errors */ }
      }
      if (!eventFound) {
        return c.json({ error: 'Valid Seaport OrderCancelled event not found for this listing\'s orderHash' }, 400);
      }
    } else {
      return c.json({ error: 'Unknown listing contract type' }, 400);
    }
    return c.json({ success: true, message: "Listing cancelled." });
  } catch (error) {
    console.error('Error cancelling listing:', error);
    return c.json({ error: `Failed to cancel listing: ${error.message}` }, 500);
  }
});

// Record cancel (protected route) - Unified
// This endpoint might become redundant if DELETE /:id handles all cancellations.
// For now, let's unify it similarly.
listings.post('/:id/cancel', authMiddleware(), async (c) => {
  try {
    const db = new Database(c.env.DB);
    const user = c.get('user');
    const listingId = c.req.param('id');
    const body = await c.req.json();

    if (!body.txHash) {
      return c.json({ error: 'Transaction hash (txHash) is required' }, 400);
    }

    const listing = await db.getListing(listingId);
    if (!listing) return c.json({ error: 'Listing not found' }, 404);
    if (listing.seller_fid !== user.fid) return c.json({ error: 'Unauthorized' }, 403);

    const { createRpcClient, waitForAndGetTransactionReceipt } = await import('../utils/rpc-client.js');
    const { parseAbi, decodeEventLog } = await import('viem');
    const client = createRpcClient(c.env);
    const receipt = await waitForAndGetTransactionReceipt(client, body.txHash);

    if (receipt.status !== 'success') return c.json({ error: 'Transaction failed' }, 400);

    if (listing.contract_type === 'nft_exchange') {
      console.log('Processing NFTExchange cancellation, looking for ListingCancelled event');
      console.log('Expected blockchain_listing_id:', listing.blockchain_listing_id);
      console.log('NFTExchange contract address:', c.env.CONTRACT_ADDRESS);
      console.log('Receipt logs count:', receipt.logs.length);
      
      const NFT_EXCHANGE_EVENTS = parseAbi(['event ListingCancelled(uint256 indexed listingId)']);
      let eventFound = false;
      for (const log of receipt.logs) {
        console.log('Checking log from address:', log.address);
        if (log.address.toLowerCase() !== c.env.CONTRACT_ADDRESS?.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({ abi: NFT_EXCHANGE_EVENTS, data: log.data, topics: log.topics, eventName: 'ListingCancelled', strict: false });
          console.log('Decoded ListingCancelled event:', decoded.args);
          if (decoded && decoded.args && decoded.args.listingId.toString() === listing.blockchain_listing_id) {
            await db.cancelListing(listing.blockchain_listing_id, listing.seller_address, body.txHash);
            eventFound = true;
            break;
          }
        } catch (e) { 
          console.log('Error decoding log:', e.message);
        }
      }
      if (!eventFound) {
        console.log('ListingCancelled event not found for listing ID:', listing.blockchain_listing_id);
        return c.json({ error: 'NFTExchange ListingCancelled event not found or ID mismatch' }, 400);
      }
    } else if (listing.contract_type === 'seaport') {
      console.log('Processing Seaport cancellation, looking for OrderCancelled event');
      console.log('Expected orderHash:', listing.order_hash);
      console.log('Seaport contract address:', c.env.SEAPORT_CONTRACT_ADDRESS);
      console.log('Receipt logs count:', receipt.logs.length);
      
      let eventFound = false;
      for (const log of receipt.logs) {
        console.log('Checking log from address:', log.address);
        if (log.address.toLowerCase() !== c.env.SEAPORT_CONTRACT_ADDRESS?.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({ abi: SEAPORT_ABI, data: log.data, topics: log.topics, eventName: 'OrderCancelled', strict: false });
          console.log('Decoded OrderCancelled event:', decoded.args);
          if (decoded && decoded.args && decoded.args.orderHash === listing.order_hash) {
             if (decoded.args.offerer.toLowerCase() !== listing.seller_address.toLowerCase()){
               return c.json({ error: 'Seaport order canceller does not match listing seller.'}, 403);
            }
            await db.cancelSeaportListingByOrderHash({
              orderHash: listing.order_hash,
              cancellerAddress: decoded.args.offerer,
              cancelTxHash: body.txHash,
              contractType: 'seaport'
            });
            eventFound = true;
            break;
          }
        } catch (e) { 
          console.log('Error decoding log:', e.message);
        }
      }
      if (!eventFound) {
        console.log('OrderCancelled event not found for orderHash:', listing.order_hash);
        return c.json({ error: 'Seaport OrderCancelled event not found for this listing orderHash' }, 400);
      }
    } else {
      return c.json({ error: 'Unknown listing contract type' }, 400);
    }
    
    return c.json({ 
      success: true,
      message: 'Cancellation recorded successfully'
    })
    
  } catch (error) {
    console.error('Error recording cancellation:', error)
    return c.json({ error: 'Failed to record cancellation' }, 500)
  }
})

// Record purchase (protected route)
listings.post('/:id/purchase', authMiddleware(), async (c) => {
  try {
    const db = new Database(c.env.DB)
    const user = c.get('user')
    const listingId = c.req.param('id')
    const body = await c.req.json()
    
    // txHash is required
    if (!body.txHash) {
      return c.json({ error: 'Transaction hash is required' }, 400)
    }
    
    // Get listing to verify it exists
    const listing = await db.getListing(listingId)
    if (!listing) {
      return c.json({ error: 'Listing not found' }, 404)
    }
    
    // Import necessary utilities
    const { createRpcClient, waitForAndGetTransactionReceipt } = await import('../utils/rpc-client.js')
    const { parseAbi, decodeEventLog } = await import('viem')
    const client = createRpcClient(c.env)
    
    // Wait for transaction receipt
    console.log('Waiting for purchase transaction:', body.txHash)
    const receipt = await waitForAndGetTransactionReceipt(client, body.txHash)
    
    if (receipt.status !== 'success') {
      return c.json({ error: 'Transaction failed' }, 400)
    }
    
    // Define the ListingSold event ABI
    const NFT_EXCHANGE_EVENTS = parseAbi([
      'event ListingSold(uint256 indexed listingId, address indexed buyer, uint256 price)'
    ])
    
    // Find and validate the ListingSold event
    let purchaseEvent = null
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: NFT_EXCHANGE_EVENTS,
          data: log.data,
          topics: log.topics,
          strict: false
        })
        
        if (decoded.eventName === 'ListingSold') {
          // Verify this is for the correct listing
          if (decoded.args.listingId.toString() === listing.blockchain_listing_id) {
            purchaseEvent = decoded.args
            break
          }
        }
      } catch (e) {
        // Skip non-matching events
      }
    }
    
    if (!purchaseEvent) {
      return c.json({ error: 'ListingSold event not found or listing ID mismatch' }, 400)
    }
    
    // Extract buyer address from event
    const buyerAddress = purchaseEvent.buyer
    
    // Verify the authenticated user is the buyer
    if (user.wallet_address && buyerAddress.toLowerCase() !== user.wallet_address.toLowerCase()) {
      return c.json({ error: 'Transaction buyer does not match authenticated user' }, 403)
    }
    
    // Process the purchase immediately
    console.log('Processing purchase for listing:', listing.blockchain_listing_id)
    
    // Resolve buyer FID if not already known
    let buyerFid = user.fid
    
    // Mark listing as sold in database
    await db.markListingSold(
      listing.blockchain_listing_id, 
      buyerAddress, 
      buyerFid, 
      body.txHash
    )
    
    return c.json({ success: true, message: 'Cancellation recorded successfully' });
  } catch (error) {
    console.error('Error recording cancellation:', error);
    return c.json({ error: `Failed to record cancellation: ${error.message}` }, 500);
  }
});

// Record purchase (protected route) - Unified
listings.post('/:id/purchase', authMiddleware(), async (c) => {
  try {
    const db = new Database(c.env.DB);
    const user = c.get('user'); // Authenticated user is the buyer
    const listingId = c.req.param('id');
    const body = await c.req.json();

    if (!body.txHash) {
      return c.json({ error: 'Transaction hash (txHash) is required' }, 400);
    }

    const listing = await db.getListing(listingId);
    if (!listing) return c.json({ error: 'Listing not found' }, 404);
    if (listing.seller_fid === user.fid) return c.json({ error: 'Seller cannot purchase their own listing'}, 400);


    const { createRpcClient, waitForAndGetTransactionReceipt } = await import('../utils/rpc-client.js');
    const { parseAbi, decodeEventLog } = await import('viem');
    const client = createRpcClient(c.env);
    const receipt = await waitForAndGetTransactionReceipt(client, body.txHash);

    if (receipt.status !== 'success') return c.json({ error: 'Transaction failed' }, 400);

    let buyerActualAddress; // Address of the buyer from the event

    if (listing.contract_type === 'nft_exchange') {
      const NFT_EXCHANGE_EVENTS = parseAbi(['event ListingSold(uint256 indexed listingId, address indexed buyer, uint256 price)']);
      let eventFound = false;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== c.env.CONTRACT_ADDRESS?.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({ abi: NFT_EXCHANGE_EVENTS, data: log.data, topics: log.topics, eventName: 'ListingSold', strict: false });
          if (decoded && decoded.args && decoded.args.listingId.toString() === listing.blockchain_listing_id) {
            buyerActualAddress = decoded.args.buyer;
            // Optional: Verify price from event matches listing.price
            // const eventPrice = Number(decoded.args.price) / 1e6; // Assuming USDC
            // if (eventPrice !== listing.price) return c.json({ error: 'Price mismatch in event' }, 400);

            await db.markListingSold(listing.blockchain_listing_id, buyerActualAddress, user.fid, body.txHash);
            eventFound = true;
            break;
          }
        } catch (e) { /* Skip */ }
      }
      if (!eventFound) return c.json({ error: 'NFTExchange ListingSold event not found or ID mismatch' }, 400);
    } else if (listing.contract_type === 'seaport') {
      let eventFound = false;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== c.env.SEAPORT_CONTRACT_ADDRESS?.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({ abi: SEAPORT_ABI, data: log.data, topics: log.topics, eventName: 'OrderFulfilled', strict: false });
          if (decoded && decoded.args && decoded.args.orderHash === listing.order_hash) {
            // In Seaport, recipient of OrderFulfilled might be the marketplace or offerer if fees are involved.
            // The actual buyer is often an offerer of one side of the order or derived from consideration.
            // For simplicity, we'll assume the `user` calling this endpoint is the buyer.
            // The `buyerAddress` for `markSeaportListingSoldByOrderHash` should be the one who paid.
            // The `processSeaportOrderFulfilled` in blockchain.js has more complex logic to find buyer.
            // Here, we might use the authenticated user's primary wallet if available or tx sender.
            // For now, let's use the recipient from the event if it's not the seller, otherwise user's wallet.
            // This is a simplification.
            const eventOfferer = decoded.args.offerer; // This is the seller
            const eventRecipient = decoded.args.recipient; // This is often the marketplace or the buyer

            buyerActualAddress = (eventRecipient.toLowerCase() !== eventOfferer.toLowerCase()) ? eventRecipient : user.wallet_address || receipt.from;

            // Extract price from event to pass to DB potentially
            let totalPriceFromEvent = 0;
            const USDC_ADDRESS = c.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
            
            if (decoded.args.consideration && Array.isArray(decoded.args.consideration)) {
                for (const item of decoded.args.consideration) {
                    if (item.recipient.toLowerCase() === eventOfferer.toLowerCase()) {
                        // Check if this is a USDC payment (itemType 1 is ERC20)
                        if (item.itemType === 1 && item.token.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
                            // USDC has 6 decimals
                            totalPriceFromEvent += parseFloat(item.amount) / 1e6;
                        } else if (item.itemType === 0) {
                            // Native ETH has 18 decimals
                            totalPriceFromEvent += parseFloat(item.amount) / 1e18;
                        }
                    }
                }
            }

            await db.markSeaportListingSoldByOrderHash({
              orderHash: listing.order_hash,
              buyerAddress: buyerActualAddress,
              buyerFid: user.fid,
              saleTxHash: body.txHash,
              contractType: 'seaport',
              totalPriceFromEvent: totalPriceFromEvent
            });
            eventFound = true;
            break;
          }
        } catch (e) { /* Skip */ }
      }
      if (!eventFound) return c.json({ error: 'Seaport OrderFulfilled event not found for this listing orderHash' }, 400);
    } else {
      return c.json({ error: 'Unknown listing contract type' }, 400);
    }

    // Generic activity recording (buyer is the actor)
    await db.recordActivity({
      type: 'sale', // Unified activity type
      actor_fid: user.fid,
      actor_address: buyerActualAddress, // Use buyer address from event
      nft_contract: listing.nft_contract,
      token_id: listing.token_id,
      price: listing.price, // Price from original listing
      metadata: JSON.stringify({ 
        listing_db_id: listing.id,
        blockchain_listing_id: listing.blockchain_listing_id, // for nft_exchange
        order_hash: listing.order_hash, // for seaport
        seller_fid: listing.seller_fid,
        contract_type: listing.contract_type
      }),
      tx_hash: body.txHash,
      contract_type: listing.contract_type
    });
    
  } catch (error) {
    console.error('Error recording purchase:', error)
    return c.json({ error: 'Failed to record purchase' }, 500)
  }
})

export default listings