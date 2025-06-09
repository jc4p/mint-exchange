import { parseAbi, decodeEventLog } from 'viem'
import { createRpcClient } from './utils/rpc-client.js'
import { NeynarService } from './neynar.js'
import { fetchNFTMetadata } from './utils/metadata.js'
import { ShareImageQueue } from './services/share-image-queue.js'

// Contract configuration
const CONTRACT_ADDRESS = '0x06fB7424Ba65D587405b9C754Bc40dA9398B72F0'
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

// Event signatures for the NFT Exchange contract
const NFT_EXCHANGE_EVENTS = parseAbi([
  'event ListingCreated(uint256 indexed listingId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 price, string metadataURI)',
  'event ListingSold(uint256 indexed listingId, address indexed buyer, uint256 price)',
  'event ListingCancelled(uint256 indexed listingId)',
  'event OfferMade(uint256 indexed offerId, address indexed buyer, address indexed nftContract, uint256 tokenId, uint256 amount)',
  'event OfferAccepted(uint256 indexed offerId, address indexed seller)',
  'event OfferCancelled(uint256 indexed offerId)',
  'event MarketplaceFeeUpdated(uint256 oldFee, uint256 newFee)',
  'event FeeRecipientUpdated(address oldRecipient, address newRecipient)'
])

// Seaport ABI - focusing on key events for sales and cancellations
// This is a simplified version. A more complete ABI might be needed for full Seaport interaction.
const SEAPORT_ABI = parseAbi([
  'event OrderFulfilled(bytes32 orderHash, address indexed offerer, address indexed zone, address recipient, (uint8 itemType, address token, uint256 identifier, uint256 amount)[] offer, (uint8 itemType, address token, uint256 identifier, uint256 amount, address recipient)[] consideration)',
  'event OrderCancelled(bytes32 orderHash, address indexed offerer, address indexed zone)',
  'event OrdersMatched(bytes32[] orderHashes)'
  // TODO: Consider adding OrderValidated if needed:
  // 'event OrderValidated(bytes32 orderHash, address indexed offerer, address indexed zone)'
])

// TODO: Define Seaport event topics/signatures if needed for direct filtering,
// or rely on viem's decodeEventLog with the SEAPORT_ABI.
// For example:
// const SEAPORT_ORDER_FULFILLED_TOPIC = keccak256(toSignature(SEAPORT_ABI.find(e => e.name === 'OrderFulfilled')));


export class BlockchainService {
  constructor(env) {
    this.env = env
    this.client = createRpcClient(env)
    this.neynar = env.NEYNAR_API_KEY ? new NeynarService(env.NEYNAR_API_KEY) : null
    this.shareImageQueue = new ShareImageQueue(env)
  }

  /**
   * Get the latest block number
   */
  async getLatestBlockNumber() {
    return await this.client.getBlockNumber()
  }

  /**
   * Get events from the contract
   */
  async getContractEvents(fromBlock, toBlock) {
    try {
      const logs = await this.client.getLogs({
        address: CONTRACT_ADDRESS,
        fromBlock: BigInt(fromBlock),
        toBlock: BigInt(toBlock)
      })

      // Decode the logs
      const decodedEvents = []
      for (const log of logs) {
        try {
          const decoded = decodeEventLog({
            abi: NFT_EXCHANGE_EVENTS,
            data: log.data,
            topics: log.topics,
            strict: false  // Allow unknown events to be skipped
          })
          
          decodedEvents.push({
            eventName: decoded.eventName,
            args: decoded.args,
            blockNumber: Number(log.blockNumber),
            transactionHash: log.transactionHash,
            logIndex: log.logIndex
          })
        } catch (error) {
          // Only log if it's not an unknown event error
          if (!error.message?.includes('not found on ABI')) {
            console.error('Failed to decode log:', error)
          }
          // Skip unknown events silently
        }
      }

      return decodedEvents
    } catch (error) {
      console.error('Error fetching contract events:', error)
      throw error
    }
  }

  /**
   * Process ListingCreated event
   */
  async processListingCreated(event, db) {
    const { listingId, seller, nftContract, tokenId, price, metadataURI } = event.args
    
    console.log('Processing ListingCreated event:', {
      listingId: listingId.toString(),
      seller,
      nftContract,
      tokenId: tokenId.toString(),
      price: price.toString()
    })

    // Resolve seller address to FID
    let sellerFid = null
    if (this.neynar) {
      const users = await this.neynar.fetchUsersByAddress(seller)
      if (users.length > 0) {
        // Use the first user found (addresses can belong to multiple users)
        sellerFid = users[0].fid
        
        // Ensure user exists in our database
        const existingUser = await db.getUser(sellerFid)
        if (!existingUser) {
          await db.createOrUpdateUser({
            fid: sellerFid,
            username: users[0].username,
            display_name: users[0].display_name,
            pfp_url: users[0].pfp_url
          })
        }
      }
    }

    // Fetch metadata using unified utility
    const metadata = await fetchNFTMetadata(
      this.env,
      nftContract,
      tokenId.toString(),
      metadataURI
    )

    // Create listing in database
    const result = await db.createListing({
      blockchain_listing_id: listingId.toString(),
      seller_fid: sellerFid,
      seller_address: seller,
      nft_contract: nftContract,
      token_id: tokenId.toString(),
      price: Number(price) / 1e6, // Convert from USDC decimals
      expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Default 7 days
      metadata_uri: metadata.metadata_uri || metadataURI || '',
      image_url: metadata.image_url || '',
      name: metadata.name || `NFT #${tokenId}`,
      description: metadata.description || '',
      tx_hash: event.transactionHash
    })
    
    // Queue share image generation (non-blocking)
    if (result.meta && result.meta.last_row_id) {
      this.shareImageQueue.queueShareImageGeneration(result.meta.last_row_id)
    }
  }

  /**
   * Process ListingSold event
   */
  async processListingSold(event, db) {
    const { listingId, buyer, price } = event.args
    
    console.log('Processing ListingSold event:', {
      listingId: listingId.toString(),
      buyer,
      price: price.toString()
    })

    // Resolve buyer address to FID
    let buyerFid = null
    if (this.neynar) {
      const users = await this.neynar.fetchUsersByAddress(buyer)
      if (users.length > 0) {
        buyerFid = users[0].fid
        
        // Ensure user exists in our database
        const existingUser = await db.getUser(buyerFid)
        if (!existingUser) {
          await db.createOrUpdateUser({
            fid: buyerFid,
            username: users[0].username,
            display_name: users[0].display_name,
            pfp_url: users[0].pfp_url
          })
        }
      }
    }

    await db.markListingSold(listingId.toString(), buyer, buyerFid, event.transactionHash)
  }

  /**
   * Process ListingCancelled event
   */
  async processListingCancelled(event, db) {
    const { listingId } = event.args
    
    console.log('Processing ListingCancelled event:', {
      listingId: listingId.toString()
    })

    // Get the listing to find the seller
    const listing = await db.db
      .prepare(`
        SELECT * FROM listings 
        WHERE blockchain_listing_id = ?
      `)
      .bind(listingId.toString())
      .first()
      
    if (listing) {
      await db.cancelListing(listingId.toString(), listing.seller_address, event.transactionHash)
    }
  }

  /**
   * Process OfferMade event
   */
  async processOfferMade(event, db) {
    const { offerId, buyer, nftContract, tokenId, amount } = event.args
    
    console.log('Processing OfferMade event:', {
      offerId: offerId.toString(),
      buyer,
      nftContract,
      tokenId: tokenId.toString(),
      amount: amount.toString()
    })

    // Resolve buyer address to FID
    let buyerFid = null
    if (this.neynar) {
      const users = await this.neynar.fetchUsersByAddress(buyer)
      if (users.length > 0) {
        buyerFid = users[0].fid
        
        // Ensure user exists in our database
        const existingUser = await db.getUser(buyerFid)
        if (!existingUser) {
          await db.createOrUpdateUser({
            fid: buyerFid,
            username: users[0].username,
            display_name: users[0].display_name,
            pfp_url: users[0].pfp_url
          })
        }
      }
    }

    // Create offer in database
    await db.db.prepare(`
      INSERT INTO offers (
        blockchain_offer_id, buyer_fid, buyer_address, nft_contract, token_id, amount, expiry, tx_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      offerId.toString(),
      buyerFid,
      buyer.toLowerCase(),
      nftContract.toLowerCase(),
      tokenId.toString(),
      Number(amount) / 1e6, // Convert from USDC decimals
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Default 7 days
      event.transactionHash
    ).run()

    // Record activity
    await db.recordActivity({
      type: 'offer_made',
      actor_fid: buyerFid,
      actor_address: buyer,
      nft_contract: nftContract,
      token_id: tokenId.toString(),
      price: Number(amount) / 1e6,
      metadata: JSON.stringify({ offer_id: offerId.toString() }),
      tx_hash: event.transactionHash
    })
  }

  /**
   * Process OfferAccepted event
   */
  async processOfferAccepted(event, db) {
    const { offerId, seller } = event.args
    
    console.log('Processing OfferAccepted event:', {
      offerId: offerId.toString(),
      seller
    })

    // Resolve seller address to FID
    let sellerFid = null
    if (this.neynar) {
      const users = await this.neynar.fetchUsersByAddress(seller)
      if (users.length > 0) {
        sellerFid = users[0].fid
        
        // Ensure user exists in our database
        const existingUser = await db.getUser(sellerFid)
        if (!existingUser) {
          await db.createOrUpdateUser({
            fid: sellerFid,
            username: users[0].username,
            display_name: users[0].display_name,
            pfp_url: users[0].pfp_url
          })
        }
      }
    }

    // Update offer as accepted
    await db.db.prepare(`
      UPDATE offers 
      SET accepted_at = CURRENT_TIMESTAMP,
          seller_fid = ?,
          seller_address = ?,
          accept_tx_hash = ?
      WHERE blockchain_offer_id = ?
    `).bind(sellerFid, seller.toLowerCase(), event.transactionHash, offerId.toString()).run()

    // Get offer details for activity
    const offer = await db.db.prepare(`
      SELECT * FROM offers WHERE blockchain_offer_id = ?
    `).bind(offerId.toString()).first()

    if (offer) {
      // Record activity
      await db.recordActivity({
        type: 'offer_accepted',
        actor_fid: sellerFid,
        actor_address: seller,
        nft_contract: offer.nft_contract,
        token_id: offer.token_id,
        price: offer.amount,
        metadata: JSON.stringify({ 
          offer_id: offerId.toString(),
          buyer: offer.buyer_address,
          buyer_fid: offer.buyer_fid
        }),
        tx_hash: event.transactionHash
      })
    }
  }

  /**
   * Process OfferCancelled event
   */
  async processOfferCancelled(event, db) {
    const { offerId } = event.args
    
    console.log('Processing OfferCancelled event:', {
      offerId: offerId.toString()
    })

    // Update offer as cancelled
    await db.db.prepare(`
      UPDATE offers 
      SET cancelled_at = CURRENT_TIMESTAMP,
          cancel_tx_hash = ?
      WHERE blockchain_offer_id = ?
    `).bind(event.transactionHash, offerId.toString()).run()
  }

  /**
   * Decode and process a single log
   */
  async decodeAndProcessLog(log, db) {
    let decodedEvent = null;
    let eventAbiType = null; // 'NFT_EXCHANGE' or 'SEAPORT'

    // Check log address and attempt to decode with the appropriate ABI
    if (this.env.CONTRACT_ADDRESS && log.address.toLowerCase() === this.env.CONTRACT_ADDRESS.toLowerCase()) {
      try {
        const decodedNftExchange = decodeEventLog({
          abi: NFT_EXCHANGE_EVENTS,
          data: log.data,
          topics: log.topics,
          strict: false // Do not throw if event not found
        });
        if (decodedNftExchange && decodedNftExchange.eventName) {
          decodedEvent = {
            eventName: decodedNftExchange.eventName,
            args: decodedNftExchange.args,
            blockNumber: Number(log.blockNumber),
            transactionHash: log.transactionHash,
            logIndex: log.logIndex
          };
          eventAbiType = 'NFT_EXCHANGE';
        }
      } catch (e) {
        // console.warn('Failed to decode with NFT_EXCHANGE_EVENTS, might be different contract or unknown event:', log, e.message);
      }
    } else if (this.env.SEAPORT_CONTRACT_ADDRESS && log.address.toLowerCase() === this.env.SEAPORT_CONTRACT_ADDRESS.toLowerCase()) {
      const seaportOrderFulfilled = this.decodeSeaportOrderFulfilled(log); // This already returns a structured event or null
      if (seaportOrderFulfilled) {
        decodedEvent = seaportOrderFulfilled; // Already includes eventName, args, blockNumber etc.
        eventAbiType = 'SEAPORT';
      } else {
        const seaportOrderCancelled = this.decodeSeaportOrderCancelled(log);
        if (seaportOrderCancelled) {
          decodedEvent = seaportOrderCancelled;
          eventAbiType = 'SEAPORT';
        } else {
          const seaportOrdersMatched = this.decodeSeaportOrdersMatched(log);
          if (seaportOrdersMatched) {
            decodedEvent = seaportOrdersMatched;
            eventAbiType = 'SEAPORT';
          }
        }
      }
    } else {
      // Log from an unknown contract address
      // console.log('Log from unknown contract address:', log.address);
      return null;
    }


    if (decodedEvent && eventAbiType === 'NFT_EXCHANGE') {
      await this.processEvent(decodedEvent, db); // Existing handler for NFT Exchange
      return decodedEvent;
    } else if (decodedEvent && eventAbiType === 'SEAPORT') {
      switch (decodedEvent.eventName) {
        case 'OrderFulfilled':
          await this.processSeaportOrderFulfilled(decodedEvent, db);
          break;
        case 'OrderCancelled':
          await this.processSeaportOrderCancelled(decodedEvent, db);
          break;
        case 'OrdersMatched':
          await this.processSeaportOrdersMatched(decodedEvent, db);
          break;
        default:
          console.log('Unhandled Seaport event:', decodedEvent.eventName, decodedEvent);
      }
      return decodedEvent;
    } else {
      // If strict: false is used in individual decoders, this path might not be hit often
      // unless it's an event not present in any ABI for a known contract.
      // console.log('Log did not match known ABIs or event not found:', log);
      return null;
    }
  }

  /**
   * Process a single event
   */
  async processEvent(event, db) {
    switch (event.eventName) {
      case 'ListingCreated':
        await this.processListingCreated(event, db)
        break
      case 'ListingSold':
        await this.processListingSold(event, db)
        break
      case 'ListingCancelled':
        await this.processListingCancelled(event, db)
        break
      case 'OfferMade':
        await this.processOfferMade(event, db)
        break
      case 'OfferAccepted':
        await this.processOfferAccepted(event, db)
        break
      case 'OfferCancelled':
        await this.processOfferCancelled(event, db)
        break
      default:
        console.log('Unhandled event:', event.eventName)
    }
  }

  /**
   * Process all events from a range of blocks
   */
  async processEvents(fromBlock, toBlock, db) {
    let allLogs = [];
    const fromBlockBigInt = BigInt(fromBlock);
    const toBlockBigInt = BigInt(toBlock);

    // Fetch logs for NFTExchange contract
    if (this.env.CONTRACT_ADDRESS) {
      try {
        const nftExchangeLogs = await this.client.getLogs({
          address: this.env.CONTRACT_ADDRESS, // Already a string, no need for .toLowerCase() here
          fromBlock: fromBlockBigInt,
          toBlock: toBlockBigInt
        });
        if (nftExchangeLogs) {
          allLogs = allLogs.concat(nftExchangeLogs.map(log => ({ ...log, _sourceContract: 'NFTExchange' })));
        }
        // console.log(`Fetched ${nftExchangeLogs ? nftExchangeLogs.length : 0} logs for NFTExchange from ${fromBlock}-${toBlock}`);
      } catch (error) {
        console.error(`Error fetching NFTExchange logs for blocks ${fromBlock}-${toBlock}:`, error);
      }
    }

    // Fetch logs for Seaport contract
    if (this.env.SEAPORT_CONTRACT_ADDRESS) {
      try {
        const seaportLogs = await this.client.getLogs({
          address: this.env.SEAPORT_CONTRACT_ADDRESS, // Already a string
          // No specific `events` topics needed here, decodeAndProcessLog will handle it by address
          fromBlock: fromBlockBigInt,
          toBlock: toBlockBigInt
        });
        if (seaportLogs) {
          allLogs = allLogs.concat(seaportLogs.map(log => ({ ...log, _sourceContract: 'Seaport' })));
        }
        // console.log(`Fetched ${seaportLogs ? seaportLogs.length : 0} logs for Seaport from ${fromBlock}-${toBlock}`);
      } catch (error) {
        console.error(`Error fetching Seaport logs for blocks ${fromBlock}-${toBlock}:`, error);
      }
    }
    
    if (allLogs.length === 0) {
      // console.log(`No logs found from any contract for blocks ${fromBlock} to ${toBlock}`);
      return;
    }

    // Sort all logs by blockNumber and then logIndex to ensure chronological processing
    allLogs.sort((a, b) => {
      if (BigInt(a.blockNumber) === BigInt(b.blockNumber)) {
        return a.logIndex - b.logIndex;
      }
      return Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)); // Convert subtraction to Number for sort
    });

    // console.log(`Processing ${allLogs.length} total sorted logs from blocks ${fromBlock} to ${toBlock}`);

    for (const log of allLogs) {
      try {
        // decodeAndProcessLog will use log.address to determine how to decode
        await this.decodeAndProcessLog(log, db);
      } catch (error) {
        // Log individual log processing errors and continue with the next log
        console.error(`Error processing log (tx: ${log.transactionHash}, index: ${log.logIndex}, source: ${log._sourceContract}):`, error);
      }
    }
  }

  /**
   * Decode Seaport OrderFulfilled event log
   */
  decodeSeaportOrderFulfilled(log) {
    try {
      const decoded = decodeEventLog({
        abi: SEAPORT_ABI,
        data: log.data,
        topics: log.topics,
        eventName: 'OrderFulfilled',
        strict: false
      })

      if (!decoded || !decoded.args) return null

      const { orderHash, offerer, recipient, offer, consideration } = decoded.args

      let nftContract, tokenId, itemType
      // Find the NFT in the offer items (ERC721 or ERC1155)
      const nftOfferItem = offer.find(item => item.itemType === 2 /* ERC721 */ || item.itemType === 3 /* ERC1155 */)
      if (nftOfferItem) {
        nftContract = nftOfferItem.token
        tokenId = nftOfferItem.identifier.toString()
        itemType = nftOfferItem.itemType
      } else {
        // If no direct NFT found in offer, it might be a more complex swap.
        // For now, we require a clear NFT in the offer for our marketplace context.
        console.warn('OrderFulfilled: No clear NFT (ERC721/1155) found in offer items.', log)
        return null
      }

      let totalPrice = BigInt(0)
      let buyerAddress = recipient // Default buyer to overall recipient, might be refined by consideration items

      // Calculate total price paid to the seller (offerer) and identify actual buyer from consideration
      // Seaport consideration can be complex: item recipient can be different from overall tx recipient
      for (const item of consideration) {
        // Sum up amounts of known currency tokens (e.g., ETH, WETH, USDC) going to the offerer
        // This is a simplified assumption; real Seaport orders can have many permutations.
        // We assume the primary payment token is what the offerer receives.
        if (item.recipient.toLowerCase() === offerer.toLowerCase()) {
           // TODO: Add check for item.token (e.g. if it's ETH or USDC) to sum correctly.
           // For now, summing all amounts going to offerer.
          totalPrice += BigInt(item.amount)
        }

        // Attempt to find the "buyer" - often the one spending the primary currency.
        // This is heuristic. If an item is NOT going to the offerer, its spender might be the buyer.
        // The overall `recipient` of OrderFulfilled is often the marketplace or a contract.
        if (item.recipient.toLowerCase() !== offerer.toLowerCase() && item.itemType < 2 /* i.e. currency, not NFT */) {
            // This logic is very simplified. A robust solution needs to check spender of the log.
            // However, `spender` is not part of OrderFulfilled event args.
            // Relying on `log.address` (Seaport contract) and `offerer`.
            // The actual buyer might be the `msg.sender` to the Seaport contract call.
            // For now, if consideration items are not going to offerer, one of them might be the buyer's payment.
            // A more reliable way is to get transaction sender from transaction receipt if needed.
        }
      }

      // If no specific consideration item clearly identifies buyer's payment to seller,
      // and overall recipient is not the seller, it could be the buyer.
      // This is often the case for direct fills.
      if (recipient.toLowerCase() !== offerer.toLowerCase() && recipient.toLowerCase() !== '0x0000000000000000000000000000000000000000') {
        // buyerAddress is already recipient by default
      }


      return {
        eventName: decoded.eventName,
        orderHash,
        sellerAddress: offerer,
        buyerAddress: buyerAddress, // This is a best guess; may need refinement
        nftContract,
        tokenId,
        itemType, // 2 for ERC721, 3 for ERC1155
        totalPrice: totalPrice.toString(), // Convert BigInt to string
        offerItems: offer, // For more detailed inspection if needed
        considerationItems: consideration, // For more detailed inspection
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        log: log // Keep original log for further details if needed
      }
    } catch (error) {
      // Log error if it's not an "event not found" error, which is expected if log is not OrderFulfilled
      if (!error.message?.includes('event "OrderFulfilled" not found on ABI') && !error.message?.includes('data is required')) {
        console.error('Error decoding Seaport OrderFulfilled event:', error, log)
      }
      return null
    }
  }

  /**
   * Process Seaport OrderFulfilled event
   */
  async processSeaportOrderFulfilled(decodedEvent, db) {
    if (!decodedEvent) return

    console.log('Processing Seaport OrderFulfilled:', decodedEvent)
    const { orderHash, sellerAddress, buyerAddress, nftContract, tokenId, totalPrice, transactionHash } = decodedEvent

    // Resolve buyer address to FID
    let buyerFid = null
    if (this.neynar && buyerAddress && buyerAddress !== '0x0000000000000000000000000000000000000000') {
      const users = await this.neynar.fetchUsersByAddress(buyerAddress)
      if (users.length > 0) {
        buyerFid = users[0].fid
        await db.createOrUpdateUser({ // Ensure user exists
            fid: buyerFid, username: users[0].username,
            display_name: users[0].display_name, pfp_url: users[0].pfp_url
        })
      }
    }

    // Find listing by order_hash and mark as sold
    // TODO: Implement db.markSeaportListingSoldByOrderHash
    // This function would update the listing identified by orderHash,
    // set sold_at, buyer_fid, buyer_address, sale_tx_hash, etc.
    // It should also verify the listing is of contract_type 'seaport'.
    const saleData = {
        orderHash,
        buyerAddress,
        buyerFid,
        saleTxHash: transactionHash,
        price: Number(totalPrice) / 1e18, // Assuming price is in ETH/WETH (18 decimals)
                                         // TODO: Handle different currency decimals (e.g. USDC 6 decimals)
        contractType: 'seaport'
    }
    console.log('Calling db.markSeaportListingSoldByOrderHash with:', saleData)
    // await db.markSeaportListingSoldByOrderHash(saleData);


    // Record 'sale' activity
    // TODO: Fetch seller_fid if needed by finding the original listing by orderHash
    let sellerFid = null;
    const listing = await db.db.prepare("SELECT seller_fid FROM listings WHERE order_hash = ?").bind(orderHash).first();
    if(listing && listing.seller_fid) sellerFid = listing.seller_fid;

    await db.recordActivity({
      type: 'sale',
      actor_fid: buyerFid, // Buyer is the actor for a sale event
      actor_address: buyerAddress,
      nft_contract: nftContract,
      token_id: tokenId,
      price: saleData.price,
      metadata: JSON.stringify({
        orderHash,
        contract_type: 'seaport',
        seller_address: sellerAddress, // Seller of the NFT
        seller_fid: sellerFid, // Seller FID if known
        buyer_fid: buyerFid // Buyer FID if known
      }),
      tx_hash: transactionHash,
      contract_type: 'seaport'
    })
  }

  /**
   * Decode Seaport OrderCancelled event log
   */
  decodeSeaportOrderCancelled(log) {
    try {
      const decoded = decodeEventLog({
        abi: SEAPORT_ABI,
        data: log.data,
        topics: log.topics,
        eventName: 'OrderCancelled',
        strict: false
      })
      if (!decoded || !decoded.args) return null

      const { orderHash, offerer, zone } = decoded.args
      return {
        eventName: decoded.eventName,
        orderHash,
        cancellerAddress: offerer, // Offerer is the one who signed and cancelled the order
        zone,
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        log: log
      }
    } catch (error) {
      if (!error.message?.includes('event "OrderCancelled" not found on ABI') && !error.message?.includes('data is required')) {
        console.error('Error decoding Seaport OrderCancelled event:', error, log)
      }
      return null
    }
  }

  /**
   * Process Seaport OrderCancelled event
   */
  async processSeaportOrderCancelled(decodedEvent, db) {
    if (!decodedEvent) return

    console.log('Processing Seaport OrderCancelled:', decodedEvent)
    const { orderHash, cancellerAddress, transactionHash } = decodedEvent

    // TODO: Implement db.cancelSeaportListingByOrderHash
    // This function would find the listing by orderHash, verify cancellerAddress matches seller_address,
    // and set cancelled_at, cancel_tx_hash. It should ensure contract_type is 'seaport'.
    const cancelData = {
        orderHash,
        cancellerAddress,
        cancelTxHash: transactionHash,
        contractType: 'seaport'
    }
    console.log('Calling db.cancelSeaportListingByOrderHash with:', cancelData)
    // await db.cancelSeaportListingByOrderHash(cancelData);

    // Record 'listing_cancelled' activity
    // Need to fetch listing details (NFT contract, token ID, seller FID) for activity recording
    const listing = await db.db.prepare("SELECT nft_contract, token_id, seller_fid, price FROM listings WHERE order_hash = ?").bind(orderHash).first();
    if (listing) {
      await db.recordActivity({
        type: 'listing_cancelled',
        actor_fid: listing.seller_fid, // Seller is the actor
        actor_address: cancellerAddress,
        nft_contract: listing.nft_contract,
        token_id: listing.token_id,
        price: listing.price, // Price from original listing
        metadata: JSON.stringify({
            orderHash,
            contract_type: 'seaport'
        }),
        tx_hash: transactionHash,
        contract_type: 'seaport'
      })
    } else {
        console.warn(`Could not find listing for orderHash ${orderHash} to record cancel activity.`)
    }
  }

  /**
   * Decode Seaport OrdersMatched event log
   */
  decodeSeaportOrdersMatched(log) {
    try {
      const decoded = decodeEventLog({
        abi: SEAPORT_ABI,
        data: log.data,
        topics: log.topics,
        eventName: 'OrdersMatched',
        strict: false
      })
      if (!decoded || !decoded.args) return null

      const { orderHashes } = decoded.args
      return {
        eventName: decoded.eventName,
        orderHashes, // Array of order hashes
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        log: log
      }
    } catch (error) {
      if (!error.message?.includes('event "OrdersMatched" not found on ABI') && !error.message?.includes('data is required')) {
        console.error('Error decoding Seaport OrdersMatched event:', error, log)
      }
      return null
    }
  }

  /**
   * Process Seaport OrdersMatched event
   * This event contains multiple orderHashes that were matched together.
   * Each hash might correspond to an OrderFulfilled event, or this event itself signifies fulfillment.
   */
  async processSeaportOrdersMatched(decodedEvent, db) {
    if (!decodedEvent) return

    console.log('Processing Seaport OrdersMatched:', decodedEvent)
    const { orderHashes, transactionHash } = decodedEvent

    // For each orderHash, it's likely an OrderFulfilled event was also emitted.
    // If not, we might need to fetch transaction receipts to get more details for each matched order.
    // For now, we assume OrderFulfilled events are processed separately.
    // This handler could be used to link matched orders or trigger secondary checks.

    // Example: Record an activity for matching, or ensure each orderHash is processed.
    for (const orderHash of orderHashes) {
      // Potentially, ensure this orderHash is marked as sold if an OrderFulfilled event was missed.
      // However, relying on OrderFulfilled event is preferred.
      console.log(`OrderMatched: ${orderHash} in tx ${transactionHash}. Ensure it is processed.`);

      // Minimal activity logging for OrdersMatched if desired
      // await db.recordActivity({
      //   type: 'orders_matched_debug', // Custom type for debugging/tracking
      //   actor_address: 'SeaportContract', // System event
      //   metadata: JSON.stringify({ orderHash, matched_in_tx: transactionHash, contract_type: 'seaport' }),
      //   tx_hash: transactionHash,
      //   contract_type: 'seaport'
      // });
    }
  }

  // mapSeaportEventToDbSchema is integrated into each processSeaport<EventName> function.

  /**
   * Decode and process a single log
   */
  async decodeAndProcessLog(log, db) {
    let decodedEvent = null;
    let eventAbiType = null; // 'NFT_EXCHANGE' or 'SEAPORT'

    // Try decoding with NFT Exchange ABI first
    try {
      const decodedNftExchange = decodeEventLog({
        abi: NFT_EXCHANGE_EVENTS,
        data: log.data,
        topics: log.topics,
        strict: false // Do not throw if event not found
      });
      if (decodedNftExchange && decodedNftExchange.eventName) {
        decodedEvent = {
          eventName: decodedNftExchange.eventName,
          args: decodedNftExchange.args,
          blockNumber: Number(log.blockNumber),
          transactionHash: log.transactionHash,
          logIndex: log.logIndex
        };
        eventAbiType = 'NFT_EXCHANGE';
      }
    } catch (e) {
      // Ignore if NFT_EXCHANGE_EVENTS decoding fails, try Seaport next
    }

    // If not decoded by NFT Exchange ABI, try Seaport ABI
    // TODO: Add a check for log.address to ensure it's the Seaport contract address
    // if (this.env.SEAPORT_CONTRACT_ADDRESS && log.address.toLowerCase() === this.env.SEAPORT_CONTRACT_ADDRESS.toLowerCase())
    if (!decodedEvent) {
      const seaportOrderFulfilled = this.decodeSeaportOrderFulfilled(log);
      if (seaportOrderFulfilled) {
        decodedEvent = seaportOrderFulfilled;
        eventAbiType = 'SEAPORT';
      } else {
        const seaportOrderCancelled = this.decodeSeaportOrderCancelled(log);
        if (seaportOrderCancelled) {
          decodedEvent = seaportOrderCancelled;
          eventAbiType = 'SEAPORT';
        } else {
          const seaportOrdersMatched = this.decodeSeaportOrdersMatched(log);
          if (seaportOrdersMatched) {
            decodedEvent = seaportOrdersMatched;
            eventAbiType = 'SEAPORT';
          }
        }
      }
    }

    if (decodedEvent && eventAbiType === 'NFT_EXCHANGE') {
      await this.processEvent(decodedEvent, db); // Existing handler for NFT Exchange
      return decodedEvent;
    } else if (decodedEvent && eventAbiType === 'SEAPORT') {
      switch (decodedEvent.eventName) {
        case 'OrderFulfilled':
          await this.processSeaportOrderFulfilled(decodedEvent, db);
          break;
        case 'OrderCancelled':
          await this.processSeaportOrderCancelled(decodedEvent, db);
          break;
        case 'OrdersMatched':
          await this.processSeaportOrdersMatched(decodedEvent, db);
          break;
        default:
          console.log('Unhandled Seaport event:', decodedEvent.eventName, decodedEvent);
      }
      return decodedEvent;
    } else {
      // console.log('Log did not match known ABIs or event not found:', log);
      return null;
    }
  }
}