/**
 * Utility function to fetch NFTs from Alchemy for a given wallet address
 */
export async function fetchWalletNFTs(address, alchemyApiKey) {
  if (!alchemyApiKey) {
    // Return mock data if no API key
    return {
      nfts: [
        {
          contract: { address: '0x1234567890abcdef1234567890abcdef12345678' },
          tokenId: '1',
          title: 'Mock NFT #1',
          media: [{ gateway: 'https://picsum.photos/seed/nft1/400/400' }],
          description: 'This is a mock NFT for development'
        },
        {
          contract: { address: '0xabcdef1234567890abcdef1234567890abcdef12' },
          tokenId: '42',
          title: 'Mock NFT #42',
          media: [{ gateway: 'https://picsum.photos/seed/nft42/400/400' }],
          description: 'Another mock NFT'
        }
      ]
    }
  }
  
  // Fetch NFTs from Alchemy on Base mainnet with spam filtering
  const baseUrl = `https://base-mainnet.g.alchemy.com/nft/v3/${alchemyApiKey}/getNFTsForOwner`
  const params = new URLSearchParams({
    owner: address,
    withMetadata: 'true',
    pageSize: '100',
    spamConfidenceLevel: 'MEDIUM'
  })
  
  // Add excludeFilters parameter
  params.append('excludeFilters[]', 'SPAM')
  params.append('excludeFilters[]', 'AIRDROPS')
  
  const response = await fetch(`${baseUrl}?${params}`)
  
  if (!response.ok) {
    throw new Error(`Alchemy API error: ${response.status}`)
  }
  
  const data = await response.json()
  
  // Transform Alchemy response to our format
  const transformedNfts = data.ownedNfts.map(nft => ({
    contract: {
      address: nft.contract.address,
      name: nft.contract.name || 'Unknown Collection',
      symbol: nft.contract.symbol
    },
    tokenId: nft.tokenId,
    title: nft.name || `${nft.contract.name || 'NFT'} #${nft.tokenId}`,
    description: nft.description || '',
    media: nft.image ? [{ gateway: nft.image.cachedUrl || nft.image.originalUrl }] : [],
    metadata: nft.raw?.metadata || {}
  }))
  
  // Filter out spam NFTs based on keywords
  const spamKeywords = ['claim', 'voucher', 'airdrop']
  const filteredNfts = transformedNfts.filter(nft => {
    const textFields = [
      nft.title?.toLowerCase() || '',
      nft.description?.toLowerCase() || '',
      nft.contract.name?.toLowerCase() || '',
      nft.contract.symbol?.toLowerCase() || ''
    ]
    
    return !spamKeywords.some(keyword => 
      textFields.some(field => field.includes(keyword))
    )
  })
  
  return { nfts: filteredNfts }
}