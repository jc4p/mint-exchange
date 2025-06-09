# Seaport Migration Plan - Backend

## Executive Summary

The backend migration enables our platform to support both NFTExchange and Seaport contracts simultaneously. This unlocks proxy NFT support, reduces gas costs by 20-40%, and enables advanced trading features while maintaining our 1% platform fee structure.

## Why This Architecture?

### Current State
- Single contract indexing (NFTExchange only)
- Direct database mapping to contract events
- Simple API serving contract data
- No support for proxy NFTs

### What We're Building
- **Dual Contract Indexing**: Process events from both contracts in parallel
- **Unified Data Model**: Single API serving both contract types seamlessly
- **Contract Abstraction**: Backend agnostic to which contract frontend uses
- **Future Extensibility**: Easy to add more protocols later

### Key Benefits
- Zero downtime during migration
- Existing 1000 listings continue working
- Can instantly rollback if issues arise
- Learn from both contracts' performance

## Daily Deliverables - Backend Developer

### Day 1: Database Schema Evolution
**Morning (by lunch)**
- Create migration scripts for new fields
- Add `contract_type` to all relevant tables
- Add Seaport-specific columns (order_hash, order_parameters, etc.)
- Create indexes for performance

**Afternoon (by EOD)**
- Test migrations on development database
- Verify existing queries still work
- Create rollback scripts
- **EOD Test**: Can insert/query both contract types in database

**SQL Migration Example:**
```sql
-- Morning deliverables
ALTER TABLE listings ADD COLUMN contract_type VARCHAR(20) DEFAULT 'nft_exchange';
ALTER TABLE listings ADD COLUMN order_hash VARCHAR(66);
ALTER TABLE listings ADD COLUMN order_parameters JSONB;
ALTER TABLE listings ADD COLUMN zone_address VARCHAR(42);
ALTER TABLE listings ADD COLUMN conduit_key VARCHAR(66);
ALTER TABLE listings ADD COLUMN salt VARCHAR(66);
ALTER TABLE listings ADD COLUMN counter BIGINT;

CREATE INDEX idx_listings_contract_type ON listings(contract_type);
CREATE INDEX idx_listings_order_hash ON listings(order_hash) WHERE order_hash IS NOT NULL;

-- Afternoon: Test queries
-- Verify this still works:
SELECT * FROM listings WHERE status = 'active' AND seller_address = $1;
-- And this new query works:
SELECT * FROM listings WHERE contract_type = 'seaport' AND order_hash = $1;
```

### Day 2: Seaport Event Decoder
**Morning**
- Add Seaport ABI and event signatures
- Create event parsing functions
- Map Seaport events to database schema

**Afternoon**
- Unit test event parsing with real Seaport events
- Handle edge cases (partial fills, cancellations)
- **EOD Test**: Can decode all Seaport event types correctly

**Code Example:**
```javascript
// src/server/indexer/seaport-events.js
const SEAPORT_EVENTS = {
  OrderFulfilled: {
    signature: 'OrderFulfilled(bytes32,address,address,address,(uint8,address,uint256,uint256)[],(uint8,address,uint256,uint256,address)[])',
    decode: (log) => {
      const decoded = decodeEventLog({
        abi: SEAPORT_ABI,
        data: log.data,
        topics: log.topics
      })
      
      // Extract NFT and payment details
      const nftItem = decoded.args.offer.find(item => [2,3].includes(item.itemType))
      const paymentItems = decoded.args.consideration.filter(item => item.itemType === 1)
      
      return {
        orderHash: decoded.args.orderHash,
        seller: decoded.args.offerer,
        buyer: decoded.args.recipient,
        nftContract: nftItem.token,
        tokenId: nftItem.identifier,
        totalPrice: paymentItems.reduce((sum, item) => sum + BigInt(item.amount), 0n),
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash
      }
    }
  }
}
```

### Day 3: Dual Indexing Implementation
**Morning**
- Update indexer to monitor both contracts
- Implement parallel event fetching
- Add contract type to all indexed data

**Afternoon**
- Test indexing on Base testnet
- Verify no duplicate processing
- Monitor indexing performance
- **EOD Test**: Both contracts indexed simultaneously without conflicts

**Implementation:**
```javascript
async function indexNewBlocks(fromBlock, toBlock) {
  // Index both contracts in parallel
  const [nftExchangeEvents, seaportEvents] = await Promise.all([
    fetchNFTExchangeEvents(fromBlock, toBlock),
    fetchSeaportEvents(fromBlock, toBlock)
  ])
  
  // Process in order to maintain consistency
  await db.transaction(async (trx) => {
    await processNFTExchangeEvents(nftExchangeEvents, trx)
    await processSeaportEvents(seaportEvents, trx)
    await updateIndexerState(toBlock, trx)
  })
}
```

### Day 4: API Unification
**Morning**
- Update listing endpoints to handle both types
- Add contract type filters to queries
- Ensure backward compatibility

**Afternoon**
- Update response formatting for Seaport data
- Add Seaport-specific endpoints
- Test all API endpoints
- **EOD Test**: API returns unified data from both contracts

**API Updates:**
```javascript
// Unified listing endpoint
router.get('/listings', async (req, res) => {
  const { contract_type, status = 'active', sort = 'created_at', order = 'desc' } = req.query
  
  let query = db('listings').where({ status })
  
  if (contract_type) {
    query = query.where({ contract_type })
  }
  
  const listings = await query.orderBy(sort, order)
  
  // Format based on contract type
  const formatted = listings.map(listing => {
    if (listing.contract_type === 'seaport') {
      return {
        ...listing,
        order_parameters: listing.order_parameters,
        can_partially_fill: listing.order_parameters?.orderType === 1
      }
    }
    return listing
  })
  
  res.json({ listings: formatted })
})
```

### Day 5: Seaport-Specific Features
**Morning**
- Add order validation endpoint
- Implement order status checking
- Create signature verification

**Afternoon**
- Add collection offer detection
- Implement criteria-based order handling
- **EOD Test**: Can validate and query Seaport orders

**New Endpoints:**
```javascript
// Validate Seaport order
router.post('/seaport/validate', async (req, res) => {
  const { orderParameters, signature } = req.body
  
  try {
    // Verify signature
    const orderHash = getOrderHash(orderParameters)
    const signer = recoverOrderSigner(orderHash, signature)
    
    if (signer.toLowerCase() !== orderParameters.offerer.toLowerCase()) {
      throw new Error('Invalid signature')
    }
    
    // Check on-chain status
    const status = await getSeaportOrderStatus(orderHash)
    
    res.json({ 
      valid: true, 
      orderHash,
      status 
    })
  } catch (error) {
    res.status(400).json({ 
      valid: false, 
      error: error.message 
    })
  }
})
```

### Day 6: Testing & Monitoring
**Morning**
- Create comprehensive test suite
- Test error scenarios
- Verify data integrity

**Afternoon**
- Add performance monitoring
- Create health check endpoints
- Set up alerting
- **EOD Test**: Full test suite passes, monitoring active

**Monitoring Setup:**
```javascript
// Health check endpoint
router.get('/health', async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    nftExchangeIndexer: await checkIndexer('nft_exchange'),
    seaportIndexer: await checkIndexer('seaport'),
    lastBlock: await getLastIndexedBlock()
  }
  
  const healthy = Object.values(checks).every(check => check.status === 'ok')
  
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    checks
  })
})

// Metrics collection
const metrics = {
  eventsProcessed: new Counter({
    name: 'indexer_events_processed',
    help: 'Total events processed',
    labelNames: ['contract_type', 'event_type']
  }),
  indexingLatency: new Histogram({
    name: 'indexer_latency_seconds',
    help: 'Indexing latency',
    labelNames: ['contract_type']
  })
}
```

### Day 7: Production Deployment Prep
**Morning**
- Deploy to staging environment
- Run full integration tests
- Test with production data volume

**Afternoon**
- Create deployment runbook
- Set up feature flags
- Prepare rollback plan
- **EOD Test**: Staging environment fully functional

### Day 8: Mainnet Soft Launch
**Morning**
- Deploy to production (read-only mode)
- Start indexing Seaport events
- Monitor system performance

**Afternoon**
- Enable Seaport reads for internal testing
- Verify data accuracy
- Compare with on-chain state
- **EOD Test**: Seaport data indexed correctly on mainnet

### Day 9: Migration Controls
**Morning**
- Implement admin dashboard
- Add migration statistics
- Create rollout controls

**Afternoon**
- Test progressive rollout
- Monitor both contracts' performance
- Document any issues
- **EOD Test**: Can control rollout percentage dynamically

**Admin Dashboard:**
```javascript
router.get('/admin/stats', requireAdmin, async (req, res) => {
  const stats = await db.raw(`
    SELECT 
      contract_type,
      COUNT(*) as total_listings,
      COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
      COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as last_24h,
      AVG(CASE WHEN status = 'sold' THEN price END) as avg_sale_price,
      SUM(CASE WHEN status = 'sold' THEN price END) as total_volume
    FROM listings
    GROUP BY contract_type
  `)
  
  const indexerStats = await db.raw(`
    SELECT 
      contract_type,
      MAX(last_block) as last_indexed_block,
      COUNT(*) as total_events_24h
    FROM indexer_events
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY contract_type
  `)
  
  res.json({ 
    listings: stats.rows,
    indexer: indexerStats.rows,
    timestamp: new Date()
  })
})
```

### Day 10: Full Production Launch
**Morning**
- Enable Seaport writes
- Monitor all metrics
- Support team briefing

**Afternoon**
- Address any issues
- Document lessons learned
- Plan next features
- **EOD Test**: Both contracts fully operational in production

## Testing Strategy

### Unit Tests
- Event parsing accuracy
- Database operations
- API response formats
- Error handling

### Integration Tests
- Full indexing flow
- API with database
- Multiple contract types
- Concurrent operations

### Load Tests
- 1000 events/second indexing
- 100 concurrent API requests
- Database connection pooling
- Memory usage under load

### Data Integrity Tests
```javascript
// Verify indexed data matches on-chain
async function verifyDataIntegrity() {
  const listings = await db('listings')
    .where({ contract_type: 'seaport', status: 'active' })
    .limit(100)
  
  for (const listing of listings) {
    const onChainStatus = await getSeaportOrderStatus(listing.order_hash)
    
    if (onChainStatus.isCancelled && listing.status === 'active') {
      console.error(`Data mismatch: ${listing.order_hash}`)
      await db('listings')
        .where({ id: listing.id })
        .update({ status: 'cancelled' })
    }
  }
}
```

## Performance Considerations

### Database Optimization
- Partial indexes for active listings
- JSONB indexes for order parameters
- Connection pooling configuration
- Query optimization for dual contracts

### Indexing Optimization
- Batch event processing
- Parallel contract indexing
- Checkpoint recovery system
- Event deduplication

### API Optimization
- Response caching for static data
- Query result pagination
- Database query optimization
- CDN for static assets

## Rollback Plan

### Immediate (< 1 minute)
1. Set `SEAPORT_ENABLED=false` in environment
2. API stops returning Seaport data
3. Frontend falls back to NFTExchange only

### Short-term (< 10 minutes)
1. Stop Seaport indexer
2. Clear Seaport data from cache
3. Monitor system stability

### Full rollback (< 1 hour)
1. Restore database from pre-migration backup
2. Deploy previous code version
3. Restart all services

## Success Metrics

- ✅ Both indexers running with < 5 block lag
- ✅ API response time < 200ms (p95)
- ✅ Zero data inconsistencies
- ✅ 99.9% uptime maintained
- ✅ Successful indexing of 10k+ Seaport events
- ✅ Platform fees correctly tracked for both contracts
