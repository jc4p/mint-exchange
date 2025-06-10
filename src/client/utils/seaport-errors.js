/**
 * Seaport Error Codes and Handlers
 * 
 * This module provides comprehensive error mapping for Seaport protocol errors.
 * Error codes are derived from Seaport's custom errors defined in the contract.
 */

// Common Seaport error codes (4-byte function selectors)
export const SEAPORT_ERROR_CODES = {
  // Signature and validation errors
  '0x8baa579f': 'InvalidSignature',
  '0x815e1d64': 'InvalidSigner',
  '0xeaf38844': 'BadSignatureV',
  '0x1a515574': 'BadContractSignature',
  
  // Order state errors
  '0x1a783b8d': 'OrderAlreadyFilled',
  '0x9cfab14b': 'OrderIsCancelled',
  '0x12af9b19': 'OrderPartiallyFilled',
  '0x773b6d12': 'CannotCancelOrder',
  
  // Time-related errors
  '0x0a5e7268': 'InvalidTime',
  '0xee4e2d71': 'OrderExpired',
  
  // Token transfer errors
  '0xf8ba8054': 'TokenTransferGenericFailure',
  '0x98e9db6e': 'ERC1155BatchTransferGenericFailure',
  '0x5c427cd9': 'InvalidERC721TransferAmount',
  '0xebd3b362': 'Invalid1155BatchTransferEncoding',
  '0xf4844814': 'BadReturnValueFromERC20OnTransfer',
  
  // Insufficient balance/approval errors
  '0xf9c0959d': 'InsufficientTokenApprovals',
  '0x1f4654a4': 'InsufficientNativeTokensSupplied',
  '0x7939f424': 'MissingItemAmount',
  
  // Order configuration errors
  '0x93979285': 'InvalidNativeOfferItem',
  '0x8b5e8b40': 'InvalidProof',
  '0x7932f1fc': 'InvalidCallToConduit',
  '0xd268796f': 'InvalidConduit',
  '0x4f19899d': 'InvalidContractOrder',
  '0x2165628a': 'InvalidRestrictedOrder',
  '0x48fee69b': 'InvalidMsgValue',
  
  // Consideration errors
  '0xa6358dd8': 'ConsiderationNotMet',
  '0xfb4baf17': 'ConsiderationLengthNotEqualToTotalOriginal',
  '0x133c37c6': 'ConsiderationCriteriaResolverOutOfRange',
  '0x40b58a27': 'MissingOriginalConsiderationItems',
  
  // Criteria and fulfillment errors
  '0x94eb6af2': 'CriteriaNotEnabledForItem',
  '0x7fb7c5a1': 'InvalidFulfillmentComponentData',
  '0xf70a9562': 'MismatchedFulfillmentOfferAndConsiderationComponents',
  '0x6c7b5b3e': 'MissingFulfillmentComponentOnAggregation',
  
  // Fraction errors
  '0x3c2a2dce': 'BadFraction',
  '0xc63cf089': 'InexactFraction',
  
  // Other errors
  '0x17e96ed9': 'InvalidBasicOrderParameterEncoding',
  '0x571e5b18': 'UnusedItemParameters',
  '0xa11b63e4': 'NoContract',

  '0x177e802f': 'ERC721InsufficientApproval',
  
  // Additional error patterns (not 4-byte selectors)
  'ERC721InsufficientApproval': 'ERC721InsufficientApproval',
  'ERC1155InsufficientApproval': 'ERC1155InsufficientApproval',
  'ERC20InsufficientBalance': 'ERC20InsufficientBalance',
  'ERC20InsufficientAllowance': 'ERC20InsufficientAllowance'
}

// Human-readable error messages
export const SEAPORT_ERROR_MESSAGES = {
  // Signature errors
  InvalidSignature: 'The order signature is invalid. Please try signing the order again.',
  InvalidSigner: 'The signer address does not match the order creator.',
  BadSignatureV: 'Invalid signature format. The signature V value is incorrect.',
  BadContractSignature: 'Contract signature validation failed.',
  
  // Order state
  OrderAlreadyFilled: 'This order has already been filled.',
  OrderIsCancelled: 'This order has been cancelled by the seller.',
  OrderPartiallyFilled: 'This order has been partially filled.',
  CannotCancelOrder: 'You cannot cancel this order. Only the order creator can cancel.',
  
  // Time errors
  InvalidTime: 'Invalid order timing. Start time must be before end time.',
  OrderExpired: 'This order has expired.',
  
  // Token transfer errors
  TokenTransferGenericFailure: 'Token transfer failed. The seller may have transferred the NFT or revoked approval.',
  ERC1155BatchTransferGenericFailure: 'Failed to transfer ERC1155 tokens. Check ownership and approvals.',
  InvalidERC721TransferAmount: 'Invalid transfer amount for ERC721 token. Amount must be 1.',
  Invalid1155BatchTransferEncoding: 'Invalid encoding for ERC1155 batch transfer.',
  BadReturnValueFromERC20OnTransfer: 'ERC20 token transfer returned unexpected value.',
  ERC721InsufficientApproval: 'The NFT is not approved for transfer. The seller needs to approve the NFT.',
  ERC1155InsufficientApproval: 'The ERC1155 tokens are not approved for transfer.',
  ERC20InsufficientBalance: 'Insufficient USDC balance to complete this purchase.',
  ERC20InsufficientAllowance: 'Insufficient USDC approval. Please approve USDC spending.',
  
  // Balance/approval
  InsufficientTokenApprovals: 'Insufficient token approvals. Please check USDC and NFT approvals.',
  InsufficientNativeTokensSupplied: 'Insufficient ETH sent with transaction.',
  MissingItemAmount: 'Item amount is missing or zero.',
  
  // Configuration errors
  InvalidNativeOfferItem: 'Cannot offer native ETH as an item. Use consideration instead.',
  InvalidProof: 'Invalid merkle proof provided for criteria resolution.',
  InvalidCallToConduit: 'Invalid call to conduit contract.',
  InvalidConduit: 'Invalid or unregistered conduit.',
  InvalidContractOrder: 'Invalid contract order parameters.',
  InvalidRestrictedOrder: 'This restricted order cannot be fulfilled.',
  InvalidMsgValue: 'Incorrect ETH amount sent with transaction.',
  
  // Consideration errors
  ConsiderationNotMet: 'Order consideration requirements not met. Check payment amounts.',
  ConsiderationLengthNotEqualToTotalOriginal: 'Consideration array length mismatch.',
  ConsiderationCriteriaResolverOutOfRange: 'Consideration criteria resolver index out of range.',
  MissingOriginalConsiderationItems: 'Original consideration items are missing.',
  
  // Criteria/fulfillment
  CriteriaNotEnabledForItem: 'Criteria-based orders not enabled for this item type.',
  InvalidFulfillmentComponentData: 'Invalid fulfillment component data provided.',
  MismatchedFulfillmentOfferAndConsiderationComponents: 'Offer and consideration components do not match.',
  MissingFulfillmentComponentOnAggregation: 'Missing fulfillment component for aggregation.',
  
  // Fractions
  BadFraction: 'Invalid fraction specified. Numerator cannot exceed denominator.',
  InexactFraction: 'Fraction results in inexact division.',
  
  // Other
  InvalidBasicOrderParameterEncoding: 'Invalid encoding for basic order parameters.',
  UnusedItemParameters: 'Unused parameters provided for this item type.',
  NoContract: 'No contract code at the specified address.'
}

/**
 * Extract error code from error message or data
 * @param {Error} error - The error object
 * @returns {string|null} - The error code if found
 */
export function extractErrorCode(error) {
  if (!error) return null
  
  // Check error.data first (most reliable)
  if (error.data?.errorName) {
    return error.data.errorName
  }
  
  // Check for error code in message (hex format)
  const hexMatch = error.message?.match(/0x[a-fA-F0-9]{8}/)
  if (hexMatch) {
    return hexMatch[0].toLowerCase()
  }
  
  // Check for known error strings
  for (const pattern of Object.keys(SEAPORT_ERROR_CODES)) {
    if (error.message?.includes(pattern)) {
      return pattern
    }
  }
  
  // Check shortMessage
  if (error.shortMessage) {
    const shortHexMatch = error.shortMessage.match(/0x[a-fA-F0-9]{8}/)
    if (shortHexMatch) {
      return shortHexMatch[0].toLowerCase()
    }
  }
  
  return null
}

/**
 * Get user-friendly error message for Seaport errors
 * @param {Error} error - The error object
 * @returns {string} - User-friendly error message
 */
export function getSeaportErrorMessage(error) {
  const errorCode = extractErrorCode(error)
  
  if (errorCode) {
    // Get the error name
    const errorName = SEAPORT_ERROR_CODES[errorCode]
    if (errorName && SEAPORT_ERROR_MESSAGES[errorName]) {
      return SEAPORT_ERROR_MESSAGES[errorName]
    }
  }
  
  // Fallback messages for common patterns
  if (error.message?.includes('insufficient allowance')) {
    return 'Insufficient token approval. Please approve the required tokens and try again.'
  }
  
  if (error.message?.includes('insufficient balance')) {
    return 'Insufficient token balance. Please ensure you have enough tokens to complete this transaction.'
  }
  
  if (error.message?.includes('execution reverted')) {
    return 'Transaction failed. Please check your balances and approvals, then try again.'
  }
  
  // Default message
  return error.message || 'An unknown error occurred with the Seaport transaction.'
}

/**
 * Check if error is due to insufficient approvals
 * @param {Error} error - The error object
 * @returns {boolean}
 */
export function isApprovalError(error) {
  const errorCode = extractErrorCode(error)
  const approvalErrors = [
    '0xf9c0959d', // InsufficientTokenApprovals
    'ERC721InsufficientApproval',
    'ERC1155InsufficientApproval',
    'ERC20InsufficientAllowance'
  ]
  
  return approvalErrors.includes(errorCode) || 
         error.message?.includes('insufficient approval') ||
         error.message?.includes('insufficient allowance')
}

/**
 * Check if error is due to insufficient balance
 * @param {Error} error - The error object
 * @returns {boolean}
 */
export function isBalanceError(error) {
  const errorCode = extractErrorCode(error)
  const balanceErrors = [
    '0x1f4654a4', // InsufficientNativeTokensSupplied
    'ERC20InsufficientBalance'
  ]
  
  return balanceErrors.includes(errorCode) || 
         error.message?.includes('insufficient balance')
}

/**
 * Check if error is due to order being unavailable
 * @param {Error} error - The error object
 * @returns {boolean}
 */
export function isOrderUnavailableError(error) {
  const errorCode = extractErrorCode(error)
  const unavailableErrors = [
    '0x1a783b8d', // OrderAlreadyFilled
    '0x9cfab14b', // OrderIsCancelled
    '0xee4e2d71', // OrderExpired
    '0xf8ba8054'  // TokenTransferGenericFailure (often means NFT was transferred)
  ]
  
  return unavailableErrors.includes(errorCode)
}

/**
 * Debug helper to log detailed error information
 * @param {Error} error - The error object
 */
export function debugSeaportError(error) {
  console.group('Seaport Error Debug')
  console.error('Full error:', error)
  console.log('Error code:', extractErrorCode(error))
  console.log('User message:', getSeaportErrorMessage(error))
  console.log('Is approval error:', isApprovalError(error))
  console.log('Is balance error:', isBalanceError(error))
  console.log('Is order unavailable:', isOrderUnavailableError(error))
  
  if (error.data) {
    console.log('Error data:', error.data)
  }
  
  if (error.cause) {
    console.log('Error cause:', error.cause)
  }
  
  console.groupEnd()
}