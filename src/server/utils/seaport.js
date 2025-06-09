import { Seaport } from '@opensea/seaport-js';
import { ethers } from 'ethers';

// Seaport configuration
const SEAPORT_DOMAIN_NAME = "Seaport";
const SEAPORT_DOMAIN_VERSION = "1.6";

/**
 * Calculates the Seaport order hash using the Seaport SDK
 * @param {object} orderParameters The Seaport order parameters (OrderComponents).
 * @returns {string} The order hash.
 */
export function getOrderHash(orderParameters) {
  if (!orderParameters || typeof orderParameters !== 'object') {
    throw new Error('Invalid orderParameters provided for hashing.');
  }

  // Create a minimal provider for Seaport SDK (just for hashing, no RPC needed)
  const provider = new ethers.JsonRpcProvider();
  
  // Create Seaport instance
  const seaport = new Seaport(provider, {
    overrides: {
      // We don't need a specific contract address for just hashing
      contractAddress: ethers.ZeroAddress
    }
  });

  // Use Seaport SDK's getOrderHash method
  return seaport.getOrderHash(orderParameters);
}

// Example Usage (for testing or reference):
/*
const exampleOrderParameters = {
  offerer: "0x0000000000000000000000000000000000000001",
  zone: "0x0000000000000000000000000000000000000000", // Optional: Use actual zone or zero address
  offer: [
    {
      itemType: 2, // ERC721
      token: "0x0000000000000000000000000000000000000002",
      identifierOrCriteria: "123", // tokenId
      startAmount: "1",
      endAmount: "1",
    },
  ],
  consideration: [
    {
      itemType: 0, // Native ETH or 1 for ERC20
      token: "0x0000000000000000000000000000000000000000", // Zero address for ETH
      identifierOrCriteria: "0",
      startAmount: "1000000000000000000", // 1 ETH in wei
      endAmount: "1000000000000000000",
      recipient: "0x0000000000000000000000000000000000000001", // Offerer receives payment
    },
  ],
  orderType: 0, // FULL_OPEN (no partial fills, anyone can fill)
  startTime: Math.floor(Date.now() / 1000).toString(),
  endTime: (Math.floor(Date.now() / 1000) + 24 * 60 * 60).toString(), // 1 day validity
  zoneHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  salt: "0x" + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex'), // Random salt
  conduitKey: "0x0000000000000000000000000000000000000000000000000000000000000000", // Default conduit
  counter: "0", // Offerer's nonce from Seaport contract
};

// This is a conceptual example. `crypto.getRandomValues` is browser-specific. Use 'crypto' module in Node.js.
// const orderHash = getOrderHash(exampleOrderParameters);
// console.log("Calculated Order Hash:", orderHash);
*/

// Note: The above EIP-712 hashing for OrderComponents is complex.
// Viem's `hashTypedData` or ethers.js `_TypedDataEncoder.hash` are typically used with the full EIP-712 domain
// and type definitions when dealing with signatures.
// However, Seaport's on-chain `getOrderHash(OrderComponents)` function, which is what `orderHash` usually refers to,
// is a direct hash of the OrderComponents struct.
// The implementation above attempts to replicate that direct struct hashing.
// For production, it's highly recommended to use a well-tested Seaport SDK or verify this hashing against
// known Seaport tools or contract calls.
// A simpler approach if using Viem might be to define the struct types and use `hashAbiParameters`.

// Simpler approach if `orderParameters` is already the `OrderComponents` struct that Seaport expects.
// Seaport.sol's _deriveOrderHash function:
// return _nameVerifiedOrders[orderComponents.offerer][orderComponents.counter] == bytes32(0)
// ? _hashOrderComponents(orderComponents)
// : _nameVerifiedOrders[orderComponents.offerer][orderComponents.counter];
// where _hashOrderComponents is keccak256(abi.encode(orderComponents)) after packing arrays.

// The `encodeAbiParameters` approach used in `hashOrderItem` and `hashOrderComponents`
// is effectively doing the `abi.encode()` part.
// It's crucial that the `identifierOrCriteria` field in `OrderItem` is correctly named
// and holds `identifier` for ERC721/ERC1155 and `criteria` for criteria-based orders.
// The example assumes `identifierOrCriteria` is used for simplicity.
// If your `orderParameters.offer[j].identifier` is the field, adjust accordingly.
// For now, I'll assume `identifierOrCriteria` is the correct field name in the input `orderParameters`.
// If `orderParameters` comes directly from a library like `seaport-js`, it should conform.
// If it's constructed manually, ensure field names match the struct definition used for hashing.
// The current implementation of `hashOrderItem` uses `identifierOrCriteria`.
// The example uses `identifierOrCriteria` for `identifier` as well.
// For typical ERC721/ERC1155, this should be `identifier`.
// Let's assume the input `orderParameters` will have `identifierOrCriteria` as the field name.
// If not, the caller of `getOrderHash` might need to map their structure.

// A note on `identifier` vs `identifierOrCriteria`:
// Seaport's OrderItem struct uses `identifierOrCriteria`.
// When creating an OrderItem for a specific NFT (ERC721/ERC1155), you provide the `identifier` (tokenId).
// When creating an OrderItem for a criteria-based order (e.g. "any NFT from this collection"), you provide `criteria`.
// The hashing mechanism uses `identifierOrCriteria` for both.
// So, if your input `orderParameters.offer[j]` has `identifier`, it should be passed as `identifierOrCriteria` to hashing.
// The current code assumes the field is already named `identifierOrCriteria`.
// This is generally fine if the input `orderParameters` is already structured for Seaport.
// The example `orderParameters` in comments correctly uses `identifierOrCriteria`.

// --- EIP-712 Domain and Types for Seaport Signature Verification ---

// Domain for Seaport v1.1 on mainnet (chainId 1). Adjust chainId as needed.
// The verifyingContract is the Seaport contract address.
export function getSeaportDomain(chainId, verifyingContractAddress) {
  return {
    name: SEAPORT_DOMAIN_NAME, // "Seaport"
    version: SEAPORT_DOMAIN_VERSION, // "1.1"
    chainId: chainId, // e.g., 1 for mainnet, 8453 for Base
    verifyingContract: verifyingContractAddress, // Address of the Seaport contract
  };
}

// EIP-712 Types for Seaport OrderComponents.
// These must exactly match the struct definition used by Seaport for EIP-712 signing.
export const seaportOrderTypes = {
  OrderComponents: [
    { name: 'offerer', type: 'address' },
    { name: 'zone', type: 'address' },
    { name: 'offer', type: 'OrderItem[]' },
    { name: 'consideration', type: 'OrderItem[]' },
    { name: 'orderType', type: 'uint8' },
    { name: 'startTime', type: 'uint256' },
    { name: 'endTime', type: 'uint256' },
    { name: 'zoneHash', type: 'bytes32' },
    { name: 'salt', type: 'uint256' },
    { name: 'conduitKey', type: 'bytes32' },
    { name: 'counter', type: 'uint256' },
  ],
  OrderItem: [
    { name: 'itemType', type: 'uint8' },
    { name: 'token', type: 'address' },
    { name: 'identifierOrCriteria', type: 'uint256' },
    { name: 'startAmount', type: 'uint256' },
    { name: 'endAmount', type: 'uint256' },
  ],
};

// Primary type for signing
export const EIP712_PRIMARY_TYPE = 'OrderComponents';
