/**
 * Utility functions for handling timestamps
 */

/**
 * Formats SQLite timestamp strings to ISO format for JavaScript consumption
 * @param {string} sqliteTimestamp - Timestamp in SQLite format (e.g., "2025-06-07 22:53:04")
 * @returns {string} ISO formatted timestamp
 */
export function formatTimestampForClient(sqliteTimestamp) {
  if (!sqliteTimestamp) return null
  return new Date(sqliteTimestamp + ' UTC').toISOString()
}

/**
 * Formats activity data by converting all timestamp fields to ISO format
 * @param {Object} activityData - Activity data object with activities array
 * @returns {Object} Activity data with formatted timestamps
 */
export function formatActivityTimestamps(activityData) {
  if (!activityData || !activityData.activities) return activityData
  
  return {
    ...activityData,
    activities: activityData.activities.map(activity => ({
      ...activity,
      created_at: formatTimestampForClient(activity.created_at)
    }))
  }
}

/**
 * Formats listing data by converting timestamp fields to ISO format
 * @param {Object|Array} listingData - Single listing object or array of listings
 * @returns {Object|Array} Listing data with formatted timestamps
 */
export function formatListingTimestamps(listingData) {
  if (!listingData) return listingData
  
  const formatSingle = (listing) => ({
    ...listing,
    created_at: formatTimestampForClient(listing.created_at),
    sold_at: formatTimestampForClient(listing.sold_at),
    cancelled_at: formatTimestampForClient(listing.cancelled_at),
    expiry: formatTimestampForClient(listing.expiry)
  })
  
  if (Array.isArray(listingData)) {
    return listingData.map(formatSingle)
  }
  
  return formatSingle(listingData)
} 