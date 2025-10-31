/**
 * Format number as currency with abbreviations (K, M, B, T)
 */
export function formatCurrency(value: number, decimals: number = 2): string {
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(decimals)}T`
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(decimals)}B`
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(decimals)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(decimals)}K`
  return `$${value.toFixed(decimals)}`
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  return `${value.toFixed(decimals)}%`
}

/**
 * Format large numbers with commas
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

/**
 * Format date as relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const now = Date.now()
  const then = typeof date === 'string' ? new Date(date).getTime() : date.getTime()
  const diffMs = now - then

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
  return 'just now'
}


