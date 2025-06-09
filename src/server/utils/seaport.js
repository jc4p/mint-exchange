import { encodeAbiParameters, keccak256 } from 'viem';

// Define the EIP-712 domain separator and order type hash for Seaport orders.
// These values are standard for Seaport 1.1.
// You might need to adjust if using a different Seaport version or custom domain.
const SEAPORT_DOMAIN_NAME = "Seaport";
const SEAPORT_DOMAIN_VERSION = "1.1";

// Based on Seaport OrderComponents EIP-712 type definition
// struct OrderComponents {
//     address offerer;
//     address zone;
//     OrderItem[] offer;
//     OrderItem[] consideration;
//     uint8 orderType;
//     uint256 startTime;
//     uint256 endTime;
//     bytes32 zoneHash;
//     uint256 salt;
//     bytes32 conduitKey;
//     uint256 counter;
// }
// struct OrderItem {
//     uint8 itemType;
//     address token;
//     uint256 identifierOrCriteria;
//     uint256 startAmount;
//     uint256 endAmount;
// }
// The EIP712 type string for OrderComponents
const ORDER_COMPONENTS_EIP712_TYPE =
  "OrderComponents(address offerer,address zone,OrderItem[] offer,OrderItem[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 counter)";
const ORDER_ITEM_EIP712_TYPE =
  "OrderItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)";

// Pre-calculate the type hashes
const ORDER_COMPONENTS_TYPE_HASH = keccak256(Buffer.from(ORDER_COMPONENTS_EIP712_TYPE, 'utf-8'));
const ORDER_ITEM_TYPE_HASH = keccak256(Buffer.from(ORDER_ITEM_EIP712_TYPE, 'utf-8'));


function hashOrderComponents(orderComponents) {
  // Helper to hash an array of OrderItems
  const hashOrderItems = (items) => {
    if (!items || items.length === 0) {
      return keccak256(Buffer.from('', 'utf-8')); // Or specific hash for empty array if defined by Seaport
    }
    const encodedItems = items.map(item => hashOrderItem(item));
    return keccak256(encodePacked(Array(items.length).fill('bytes32'), encodedItems));
  };

  // Helper to hash a single OrderItem
  const hashOrderItem = (item) => {
    return keccak256(
      encodeAbiParameters(
        [
          { type: 'bytes32' },      // typeHash for OrderItem
          { type: 'uint8' },       // itemType
          { type: 'address' },     // token
          { type: 'uint256' },     // identifierOrCriteria
          { type: 'uint256' },     // startAmount
          { type: 'uint256' }      // endAmount
        ],
        [
          ORDER_ITEM_TYPE_HASH,
          item.itemType,
          item.token,
          item.identifierOrCriteria, // Ensure this is correctly named (or identifier for non-criteria)
          item.startAmount,
          item.endAmount
        ]
      )
    );
  };

  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },   // typeHash for OrderComponents
        { type: 'address' },   // offerer
        { type: 'address' },   // zone
        { type: 'bytes32' },   // offer hash
        { type: 'bytes32' },   // consideration hash
        { type: 'uint8' },     // orderType
        { type: 'uint256' },   // startTime
        { type: 'uint256' },   // endTime
        { type: 'bytes32' },   // zoneHash
        { type: 'uint256' },   // salt
        { type: 'bytes32' },   // conduitKey
        { type: 'uint256' }    // counter
      ],
      [
        ORDER_COMPONENTS_TYPE_HASH,
        orderComponents.offerer,
        orderComponents.zone,
        hashOrderItems(orderComponents.offer),
        hashOrderItems(orderComponents.consideration),
        orderComponents.orderType,
        orderComponents.startTime,
        orderComponents.endTime,
        orderComponents.zoneHash,
        orderComponents.salt,
        orderComponents.conduitKey,
        orderComponents.counter
      ]
    )
  );
}


/**
 * Calculates the Seaport order hash.
 * @param {object} orderParameters The Seaport order parameters (OrderComponents).
 * @param {string} seaportAddress The address of the Seaport contract.
 * @param {number} chainId The chain ID.
 * @returns {string} The order hash.
 */
export function getOrderHash(orderParameters, seaportAddress, chainId) {
  if (!orderParameters || typeof orderParameters !== 'object') {
    throw new Error('Invalid orderParameters provided for hashing.');
  }
  if (!seaportAddress || !chainId) {
    // These are not directly part of the order hash itself but the EIP-712 domain.
    // However, Seaport's getOrderHash function on-chain does not use domain separator.
    // It hashes the OrderComponents struct directly.
    // The domain separator is used for signing, not for getOrderHash.
    // Let's clarify if the caller expects EIP-712 struct hash or `_deriveOrderHash`
  }

  // Seaport's `getOrderHash` is a hash of the `OrderComponents` struct.
  // It does NOT involve the EIP-712 domain separator.
  // The EIP-712 domain separator is used when signing the order.
  return hashOrderComponents(orderParameters);
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
