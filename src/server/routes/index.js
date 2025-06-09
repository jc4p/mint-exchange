import { Hono } from 'hono'
import listings from './listings.js'
import users from './users.js'
import activity from './activity.js'
import auth from './auth.js'
import webhooks from './webhooks.js'
import admin from './admin.js'
import rpc from './rpc.js'
import seaport from './seaport.js' // Import the new Seaport router

// Create main API router
const api = new Hono()

// Mount all routes
api.route('/listings', listings)
api.route('/users', users)
api.route('/activity', activity)
api.route('/auth', auth)
api.route('/webhooks', webhooks)
api.route('/admin', admin)
api.route('/rpc', rpc)
api.route('/seaport', seaport) // Mount the Seaport router

import { Database } from '../db.js';
import { BlockchainService } from '../blockchain.js';

// Health check endpoint
api.get('/health', async (c) => {
  const db = new Database(c.env.DB);
  const blockchain = new BlockchainService(c.env); // Assuming BlockchainService can be instantiated like this for getLatestBlockNumber

  let overallStatus = 'healthy';
  const checks = {};

  // Database Check
  try {
    await db.db.prepare('SELECT 1').first();
    checks.database = { status: 'ok' };
  } catch (e) {
    console.error('Health check: Database query failed', e);
    checks.database = { status: 'error', error: e.message };
    overallStatus = 'unhealthy';
  }

  // Indexer Status Check
  let lastIndexedBlock = null;
  let currentChainHeight = null;
  let indexerLag = null;
  let indexerStatus = 'ok';

  try {
    const lastBlockResult = await db.db.prepare('SELECT MAX(block_number) as last_block FROM indexed_blocks').first();
    lastIndexedBlock = lastBlockResult?.last_block || 0;

    currentChainHeight = Number(await blockchain.getLatestBlockNumber()); // Ensure this returns a number

    if (lastIndexedBlock !== null && currentChainHeight !== null) {
      indexerLag = currentChainHeight - lastIndexedBlock;
      if (indexerLag > 10) { // Define an acceptable lag threshold
        indexerStatus = 'delayed';
        overallStatus = 'unhealthy'; // Or 'degraded' if you prefer
      }
    } else {
      indexerStatus = 'unknown'; // If we can't get heights
      overallStatus = 'unhealthy';
    }
    checks.indexer = {
      status: indexerStatus,
      last_indexed_block: lastIndexedBlock,
      current_chain_height: currentChainHeight,
      lag: indexerLag
    };
  } catch (e) {
    console.error('Health check: Indexer status check failed', e);
    checks.indexer = { status: 'error', error: e.message };
    overallStatus = 'unhealthy';
  }

  return c.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks
  });
});

export default api