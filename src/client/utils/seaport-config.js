// Seaport configuration constants
export const SEAPORT_ADDRESS = '0x0000000000000068F116a894984e2DB1123eB395'
export const SEAPORT_VERSION = '1.6'

// Seaport item types
export const ItemType = {
  NATIVE: 0,
  ERC20: 1,
  ERC721: 2,
  ERC1155: 3,
  ERC721_WITH_CRITERIA: 4,
  ERC1155_WITH_CRITERIA: 5
}

// Order types
export const OrderType = {
  FULL_OPEN: 0,
  PARTIAL_OPEN: 1,
  FULL_RESTRICTED: 2,
  PARTIAL_RESTRICTED: 3,
  CONTRACT: 4
}

// Base USDC address
export const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

// Fee configuration
export const FEE_RECIPIENT = '0x0db12C0A67bc5B8942ea3126a465d7a0b23126C7'
export const FEE_BASIS_POINTS = 100 // 1% fee

// Conduit configuration (default conduit)
export const CONDUIT_KEY = '0x0000000000000000000000000000000000000000000000000000000000000000'
export const CONDUIT_ADDRESS = '0x1E0049783F008A0085193E00003D00cd54003c71'

// Zone configuration (no zone for basic orders)
export const ZONE_ADDRESS = '0x0000000000000000000000000000000000000000'

// Helper to calculate fee amounts
export function calculateFeeAmounts(price) {
  const priceInWei = BigInt(price)
  const feeAmount = (priceInWei * BigInt(FEE_BASIS_POINTS)) / BigInt(10000)
  const sellerAmount = priceInWei - feeAmount
  
  return {
    sellerAmount: sellerAmount.toString(),
    feeAmount: feeAmount.toString(),
    totalAmount: priceInWei.toString()
  }
}