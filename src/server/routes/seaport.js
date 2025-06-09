import { Hono } from 'hono';
import { recoverTypedDataAddress } from 'viem';
import { getOrderHash, getSeaportDomain, seaportOrderTypes, EIP712_PRIMARY_TYPE } from '../utils/seaport.js';
import { createRpcClient } from '../utils/rpc-client.js';
import { SEAPORT_ABI } from '../blockchain.js'; // To interact with Seaport for status check

const seaport = new Hono();

// Endpoint to validate a Seaport order
seaport.post('/validate', async (c) => {
  try {
    const body = await c.req.json();
    const { orderParameters, signature } = body;

    if (!orderParameters || typeof orderParameters !== 'object') {
      return c.json({ valid: false, error: 'orderParameters are required' }, 400);
    }
    if (!signature) {
      return c.json({ valid: false, error: 'signature is required' }, 400);
    }

    // 1. Calculate the order hash (using the utility from seaport.js)
    // Note: getOrderHash from seaport.js doesn't require chainId or seaportAddress
    // as it calculates the struct hash, not the EIP-712 digest.
    const orderHash = getOrderHash(orderParameters);

    // 2. Verify the EIP-712 signature
    const chainId = c.env.CHAIN_ID ? parseInt(c.env.CHAIN_ID) : 8453; // Default to Base, ensure CHAIN_ID is in env
    const seaportContractAddress = c.env.SEAPORT_CONTRACT_ADDRESS;

    if (!seaportContractAddress) {
        console.error("SEAPORT_CONTRACT_ADDRESS environment variable is not set.");
        return c.json({ valid: false, error: 'Server configuration error for Seaport address.' }, 500);
    }
    if (!chainId) {
        console.error("CHAIN_ID environment variable is not set.");
        return c.json({ valid: false, error: 'Server configuration error for Chain ID.' }, 500);
    }

    let recoveredAddress;
    try {
      recoveredAddress = await recoverTypedDataAddress({
        domain: getSeaportDomain(chainId, seaportContractAddress),
        types: seaportOrderTypes,
        primaryType: EIP712_PRIMARY_TYPE,
        message: orderParameters, // The OrderComponents struct itself
        signature: signature,
      });
    } catch (e) {
      console.error("Error during signature recovery:", e);
      return c.json({ valid: false, orderHash, error: `Signature recovery failed: ${e.message}` }, 400);
    }

    const offererAddress = orderParameters.offerer;
    if (recoveredAddress.toLowerCase() !== offererAddress.toLowerCase()) {
      return c.json({
        valid: false,
        orderHash,
        error: 'Invalid signature: recovered address does not match offerer',
        recoveredAddress: recoveredAddress.toLowerCase(),
        offererAddress: offererAddress.toLowerCase()
      }, 400);
    }

    // 3. Optional: On-Chain Status Check
    let onChainStatus = 'unknown'; // Default status if check is skipped or fails
    let orderStatusFromContract;
    try {
      const rpcClient = createRpcClient(c.env);
      
      // Call Seaport's getOrderStatus function
      orderStatusFromContract = await rpcClient.readContract({
        address: seaportContractAddress,
        abi: SEAPORT_ABI,
        functionName: 'getOrderStatus',
        args: [orderHash],
      });

      const [isValidated, isCancelled, totalFilled, totalSize] = orderStatusFromContract;
      
      // First check if expired
      const currentTime = Math.floor(Date.now() / 1000);
      if (parseInt(orderParameters.endTime) < currentTime) {
        onChainStatus = 'expired';
      } else if (isCancelled) {
        onChainStatus = 'cancelled';
      } else if (totalFilled >= totalSize && totalSize > 0) { // totalSize might be 0 for some order types
        onChainStatus = 'filled';
      } else if (isValidated) { // And not cancelled or filled
        onChainStatus = 'validated'; // Means it's active and fillable by Seaport's view
      } else {
        onChainStatus = 'not_validated'; // Not yet seen/validated by Seaport, or invalid parameters
      }

    } catch (e) {
      console.error("Error checking on-chain order status:", e);
      // Don't fail the whole validation if on-chain check fails, but report it.
      onChainStatus = `error_checking_status: ${e.message}`;
    }

    return c.json({
      valid: true, // Signature is valid at this point
      orderHash,
      status: onChainStatus // Could be 'unknown', 'validated', 'filled', 'cancelled', 'expired'
    });

  } catch (error) {
    console.error('Error in /seaport/validate:', error);
    return c.json({ valid: false, error: `Validation failed: ${error.message}` }, 500);
  }
});

export default seaport;
