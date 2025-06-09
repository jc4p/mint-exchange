# Proxy Contract Compatibility

This document explains how our Seaport integration handles proxy contracts like Zora and Rodeo.

## Overview

Proxy contracts are widely used in NFT ecosystems for upgradability and gas optimization. Popular platforms using proxy patterns include:
- **Zora**: Uses UUPS (Universal Upgradeable Proxy Standard) pattern
- **Rodeo**: Custom proxy implementation
- **Manifold**: Beacon proxy pattern
- **Many others**: Factory patterns with minimal proxies

## Implementation

### Token Standard Detection

We've implemented a robust token standard detection mechanism that works with proxy contracts:

1. **ERC165 Detection** (Primary method)
   - Checks `supportsInterface` for ERC721 (0x80ac58cd) and ERC1155 (0xd9b67a26)
   - Most modern contracts, including proxies, implement ERC165

2. **Method-based Detection** (Fallback)
   - Tries calling ERC721-specific `ownerOf(tokenId)`
   - Tries calling ERC1155-specific `balanceOf(address, tokenId)`
   - Works even if ERC165 is not implemented

3. **Caching**
   - Results are cached per contract address to avoid repeated RPC calls
   - Improves performance for multiple operations on the same collection

### Usage in Our System

Token standard detection is automatically performed when:

1. **Creating Listings**
   ```javascript
   // Automatically detects if NFT is ERC721 or ERC1155
   const tokenStandard = await detectTokenStandardCached(
     nft.contract.address,
     nft.tokenId,
     publicClient,
     walletAddress
   )
   ```

2. **Making Offers**
   - Detection happens automatically before creating the Seaport order
   - Ensures correct `itemType` is used (2 for ERC721, 3 for ERC1155)

3. **Accepting Offers**
   - Detects token standard to use correct approval method
   - ERC721 and ERC1155 have different approval interfaces

### Seaport's Proxy Handling

Seaport Protocol v1.6 natively handles proxy contracts correctly:

1. **Token Address Resolution**
   - Seaport uses the proxy address directly (not implementation)
   - This is the correct approach for ownership and transfers

2. **Order Validation**
   - Seaport validates orders against the proxy contract
   - Transfers go through the proxy's transfer functions

3. **Conduit Approvals**
   - Users approve the Seaport conduit on the proxy contract
   - Conduit interacts with the proxy, not the implementation

### Testing with Proxy Contracts

To test with proxy contracts:

1. **Zora NFTs**
   - Any Zora collection on Base
   - Example: Zora's 1155 contracts at 0x... (varies per collection)

2. **Rodeo NFTs**
   - Rodeo collections use custom proxy patterns
   - Test with any Rodeo collection on Base

3. **Verification Steps**
   - Create listing with proxy NFT
   - Verify token standard is correctly detected
   - Confirm order contains correct itemType
   - Test buying/selling flow

### Common Issues and Solutions

1. **"Unable to detect NFT token standard"**
   - Contract doesn't implement standard interfaces
   - Solution: Add contract-specific detection logic if needed

2. **Approval failures**
   - Some proxies have non-standard approval methods
   - Solution: Our code uses `setApprovalForAll` which is universal

3. **Transfer failures**
   - Rare: Some proxies have transfer restrictions
   - Solution: These would fail in Seaport validation

### Security Considerations

1. **Implementation Address**
   - We never need the implementation address
   - All interactions are with the proxy

2. **Upgrade Safety**
   - Proxy upgrades don't affect our integration
   - We rely on standard interfaces, not implementation details

3. **Validation**
   - Seaport performs on-chain validation
   - Orders are validated at execution time

## Summary

Our Seaport integration is fully compatible with proxy contracts through:
- Automatic token standard detection that works with proxies
- Correct usage of proxy addresses (not implementation)
- Reliance on standard interfaces that proxies expose
- Seaport's native proxy support

No special handling is required for proxy contracts - they work the same as regular NFT contracts in our system.