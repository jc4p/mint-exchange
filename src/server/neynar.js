/**
 * Neynar API integration for fetching Farcaster user data
 */

export class NeynarService {
  constructor(apiKey) {
    this.apiKey = apiKey
    this.baseUrl = 'https://api.neynar.com/v2'
  }

  /**
   * Fetch user information by FID
   * @param {number} fid - Farcaster ID
   * @returns {Promise<Object|null>} User data or null if not found
   */
  async fetchUserByFid(fid) {
    try {
      const url = `${this.baseUrl}/farcaster/user/bulk?fids=${fid}`
      // console.log('Neynar API request:', url)
      
      const response = await fetch(url, {
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        console.error('Neynar API error:', response.status, response.statusText)
        const errorText = await response.text()
        console.error('Error response:', errorText)
        return null
      }

      const data = await response.json()
      // console.log('Neynar API raw response:', JSON.stringify(data, null, 2))
      
      // The bulk endpoint returns an array of users
      if (data.users && data.users.length > 0) {
        const user = data.users[0]
        // console.log('First user object:', JSON.stringify(user, null, 2))
        
        // Extract the primary ETH address if available
        const primaryAddress = user.verified_addresses?.eth_addresses?.[0] || null

        return {
          fid: user.fid,
          username: user.username || null,
          display_name: user.display_name || null,
          pfp_url: user.pfp_url || null,
          custody_address: user.custody_address || null,
          primary_address: primaryAddress,
          bio: user.profile?.bio?.text || null,
          follower_count: user.follower_count || 0,
          following_count: user.following_count || 0,
          verified_addresses: user.verified_addresses?.eth_addresses || []
        }
      }

      return null
    } catch (error) {
      console.error('Error fetching user from Neynar:', error)
      return null
    }
  }

  /**
   * Fetch multiple users by FIDs
   * @param {number[]} fids - Array of Farcaster IDs (up to 100)
   * @returns {Promise<Object[]>} Array of user data
   */
  async fetchUsersByFids(fids) {
    if (!fids || fids.length === 0) return []
    
    // Neynar limits to 100 FIDs per request
    const chunks = []
    for (let i = 0; i < fids.length; i += 100) {
      chunks.push(fids.slice(i, i + 100))
    }

    const results = []
    
    for (const chunk of chunks) {
      try {
        const response = await fetch(
          `${this.baseUrl}/farcaster/user/bulk?fids=${chunk.join(',')}`,
          {
            headers: {
              'x-api-key': this.apiKey,
              'Content-Type': 'application/json'
            }
          }
        )

        if (response.ok) {
          const data = await response.json()
          if (data.users) {
            results.push(...data.users.map(user => ({
              fid: user.fid,
              username: user.username || null,
              display_name: user.display_name || null,
              pfp_url: user.pfp_url || null,
              custody_address: user.custody_address || null,
              primary_address: user.verified_addresses?.eth_addresses?.[0] || null,
              bio: user.profile?.bio?.text || null,
              follower_count: user.follower_count || 0,
              following_count: user.following_count || 0,
              verified_addresses: user.verified_addresses?.eth_addresses || []
            })))
          }
        }
      } catch (error) {
        console.error('Error fetching users chunk from Neynar:', error)
      }
    }

    return results
  }

  /**
   * Fetch users by Ethereum address
   * @param {string} address - Ethereum address
   * @returns {Promise<Object[]>} Array of users associated with this address
   */
  async fetchUsersByAddress(address) {
    try {
      const response = await fetch(
        `${this.baseUrl}/farcaster/user/bulk-by-address?addresses=${address}&address_types=verified_address`,
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!response.ok) {
        console.error('Neynar API error:', response.status, response.statusText)
        return []
      }

      const data = await response.json()
      
      // Map the response to our standard user format
      const users = []
      if (data[address.toLowerCase()]) {
        for (const user of data[address.toLowerCase()]) {
          users.push({
            fid: user.fid,
            username: user.username || null,
            display_name: user.display_name || null,
            pfp_url: user.pfp_url || null,
            custody_address: user.custody_address || null,
            wallet_address: address,
            bio: user.profile?.bio?.text || null,
            follower_count: user.follower_count || 0,
            following_count: user.following_count || 0,
            verified_addresses: user.verified_addresses?.eth_addresses || []
          })
        }
      }

      return users
    } catch (error) {
      console.error('Error fetching users by address from Neynar:', error)
      return []
    }
  }

  /**
   * Fetch users by multiple Ethereum addresses
   * @param {string[]} addresses - Array of Ethereum addresses (up to 350)
   * @returns {Promise<Object>} Map of address to users array
   */
  async fetchUsersByAddresses(addresses) {
    if (!addresses || addresses.length === 0) return {}
    
    // Neynar limits to 350 addresses per request
    const chunks = []
    for (let i = 0; i < addresses.length; i += 350) {
      chunks.push(addresses.slice(i, i + 350))
    }

    const results = {}
    
    for (const chunk of chunks) {
      try {
        const response = await fetch(
          `${this.baseUrl}/farcaster/user/bulk-by-address?addresses=${chunk.join(',')}&address_types=verified_address`,
          {
            headers: {
              'x-api-key': this.apiKey,
              'Content-Type': 'application/json'
            }
          }
        )

        if (response.ok) {
          const data = await response.json()
          
          // Process each address in the response
          for (const [address, users] of Object.entries(data)) {
            results[address] = users.map(user => ({
              fid: user.fid,
              username: user.username || null,
              display_name: user.display_name || null,
              pfp_url: user.pfp_url || null,
              custody_address: user.custody_address || null,
              wallet_address: address,
              bio: user.profile?.bio?.text || null,
              follower_count: user.follower_count || 0,
              following_count: user.following_count || 0,
              verified_addresses: user.verified_addresses?.eth_addresses || []
            }))
          }
        }
      } catch (error) {
        console.error('Error fetching users chunk by address from Neynar:', error)
      }
    }

    return results
  }
}