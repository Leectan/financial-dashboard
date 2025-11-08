/**
 * Data Validation and Staleness Detection Utilities
 *
 * Provides comprehensive validation for financial data freshness,
 * following Bloomberg/Reuters best practices for data quality assurance.
 */

export type DataFreshnessStatus = 'live' | 'delayed' | 'stale' | 'error'

export interface DataFreshnessInfo {
  status: DataFreshnessStatus
  ageInMinutes: number
  ageInHours: number
  timestamp: Date
  formattedAge: string
  isStale: boolean
  warningMessage?: string
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  freshness: DataFreshnessInfo
}

/**
 * Maximum acceptable age for different data types (in minutes)
 */
export const DATA_FRESHNESS_THRESHOLDS = {
  // Real-time market data (VIX, stock prices)
  REAL_TIME: {
    live: 1,      // < 1 min = live
    delayed: 15,  // 1-15 min = delayed
    stale: 60,    // > 15 min = stale
  },
  // Daily updated data (Treasury yields, updated 4:05 PM CST daily)
  DAILY: {
    live: 60,       // < 1 hour = live
    delayed: 1440,  // 1-24 hours = delayed (1 day)
    stale: 2880,    // > 24 hours = stale (2 days)
  },
  // Weekly updated data (M2 money supply, weekly Monday updates)
  WEEKLY: {
    live: 1440,     // < 24 hours = live
    delayed: 10080, // 1-7 days = delayed
    stale: 20160,   // > 7 days = stale (14 days)
  },
  // Monthly updated data (GDP, PMI, sentiment)
  MONTHLY: {
    live: 10080,    // < 7 days = live
    delayed: 43200, // 7-30 days = delayed
    stale: 86400,   // > 30 days = stale (60 days)
  },
  // Quarterly updated data (GDP components)
  QUARTERLY: {
    live: 43200,    // < 30 days = live
    delayed: 129600, // 30-90 days = delayed
    stale: 259200,   // > 90 days = stale (180 days)
  },
} as const

/**
 * Calculate data freshness based on timestamp and thresholds
 */
export function calculateDataFreshness(
  timestamp: Date | string,
  thresholds: { readonly live: number; readonly delayed: number; readonly stale: number } = DATA_FRESHNESS_THRESHOLDS.DAILY
): DataFreshnessInfo {
  const dataDate = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
  const now = new Date()
  const ageMs = now.getTime() - dataDate.getTime()
  const ageInMinutes = Math.floor(ageMs / (1000 * 60))
  const ageInHours = Math.floor(ageInMinutes / 60)

  let status: DataFreshnessStatus = 'live'
  let warningMessage: string | undefined

  if (ageInMinutes < 0) {
    status = 'error'
    warningMessage = 'Data timestamp is in the future - system clock may be incorrect'
  } else if (ageInMinutes <= thresholds.live) {
    status = 'live'
  } else if (ageInMinutes <= thresholds.delayed) {
    status = 'delayed'
  } else if (ageInMinutes <= thresholds.stale) {
    status = 'stale'
    warningMessage = `Data is ${formatAge(ageInMinutes)} old - may be outdated`
  } else {
    status = 'stale'
    warningMessage = `Data is severely outdated (${formatAge(ageInMinutes)} old) - results may be unreliable`
  }

  return {
    status,
    ageInMinutes,
    ageInHours,
    timestamp: dataDate,
    formattedAge: formatAge(ageInMinutes),
    isStale: status === 'stale' || status === 'error',
    warningMessage,
  }
}

/**
 * Format age in human-readable format
 */
export function formatAge(ageInMinutes: number): string {
  if (ageInMinutes < 1) return 'just now'
  if (ageInMinutes < 60) return `${ageInMinutes}m ago`

  const hours = Math.floor(ageInMinutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`

  const years = Math.floor(months / 12)
  return `${years}y ago`
}

/**
 * Validate treasury yield data
 */
export function validateTreasuryYield(
  value: number,
  date: string,
  seriesName: string
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Validate value is a reasonable treasury yield (historically 0% to 20%)
  if (isNaN(value)) {
    errors.push(`${seriesName} value is NaN`)
  } else if (value < -5 || value > 25) {
    errors.push(`${seriesName} value ${value}% is outside historical range (-5% to 25%)`)
  } else if (value < 0 || value > 20) {
    warnings.push(`${seriesName} value ${value}% is unusual but possible`)
  }

  // Validate date
  const dataDate = new Date(date)
  if (isNaN(dataDate.getTime())) {
    errors.push(`Invalid date: ${date}`)
  }

  const freshness = calculateDataFreshness(date, DATA_FRESHNESS_THRESHOLDS.DAILY)

  if (freshness.warningMessage) {
    warnings.push(freshness.warningMessage)
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    freshness,
  }
}

/**
 * Validate yield curve spread
 */
export function validateYieldSpread(
  spread: number,
  treasury10Y: number,
  treasury2Y: number,
  date10Y: string,
  date2Y: string
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Validate the spread calculation
  const calculatedSpread = treasury10Y - treasury2Y
  const spreadDiff = Math.abs(spread - calculatedSpread)

  if (spreadDiff > 0.01) {
    errors.push(`Spread calculation mismatch: ${spread}% vs calculated ${calculatedSpread.toFixed(2)}%`)
  }

  // Validate individual yields
  const yield10YValidation = validateTreasuryYield(treasury10Y, date10Y, '10Y Treasury')
  const yield2YValidation = validateTreasuryYield(treasury2Y, date2Y, '2Y Treasury')

  errors.push(...yield10YValidation.errors, ...yield2YValidation.errors)
  warnings.push(...yield10YValidation.warnings, ...yield2YValidation.warnings)

  // Validate spread is reasonable (-5% to +5%)
  if (isNaN(spread)) {
    errors.push('Yield spread is NaN')
  } else if (Math.abs(spread) > 5) {
    errors.push(`Yield spread ${spread}% is outside historical range (-5% to +5%)`)
  } else if (Math.abs(spread) > 3) {
    warnings.push(`Yield spread ${spread}% is unusually large`)
  }

  // Validate dates are recent (use the older of the two dates)
  const olderDate = new Date(date10Y) < new Date(date2Y) ? date10Y : date2Y
  const freshness = calculateDataFreshness(olderDate, DATA_FRESHNESS_THRESHOLDS.DAILY)

  if (freshness.warningMessage) {
    warnings.push(freshness.warningMessage)
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    freshness,
  }
}

/**
 * Validate M2 money supply data
 */
export function validateM2Data(
  current: number,
  date: string
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // M2 is measured in billions, typically 15000-25000 as of 2024-2025
  if (isNaN(current)) {
    errors.push('M2 current value is NaN')
  } else if (current < 1000 || current > 50000) {
    errors.push(`M2 value ${current}B is outside expected range (1000B-50000B)`)
  } else if (current < 10000 || current > 30000) {
    warnings.push(`M2 value ${current}B is unusual for recent years`)
  }

  const freshness = calculateDataFreshness(date, DATA_FRESHNESS_THRESHOLDS.WEEKLY)

  if (freshness.warningMessage) {
    warnings.push(freshness.warningMessage)
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    freshness,
  }
}

/**
 * Validate VIX data
 */
export function validateVIXData(
  current: number,
  date: string | Date
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // VIX typically ranges from 9 to 80 (extreme fear)
  if (isNaN(current)) {
    errors.push('VIX value is NaN')
  } else if (current < 5 || current > 100) {
    errors.push(`VIX value ${current} is outside historical range (5-100)`)
  } else if (current > 80) {
    warnings.push(`VIX value ${current} indicates extreme market fear`)
  }

  const freshness = calculateDataFreshness(date, DATA_FRESHNESS_THRESHOLDS.REAL_TIME)

  if (freshness.warningMessage) {
    warnings.push(freshness.warningMessage)
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    freshness,
  }
}

/**
 * Validate Buffett Indicator data
 */
export function validateBuffettIndicator(
  ratio: number,
  wilshireDate: string,
  gdpDate: string
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Buffett Indicator typically ranges from 50% to 200%
  if (isNaN(ratio)) {
    errors.push('Buffett Indicator ratio is NaN')
  } else if (ratio < 20 || ratio > 300) {
    errors.push(`Buffett Indicator ${ratio}% is outside historical range (20%-300%)`)
  } else if (ratio > 200) {
    warnings.push(`Buffett Indicator ${ratio}% suggests significant market overvaluation`)
  } else if (ratio < 50) {
    warnings.push(`Buffett Indicator ${ratio}% suggests significant market undervaluation`)
  }

  // Use the older of Wilshire or GDP date for freshness
  const wilshireTimestamp = new Date(wilshireDate)
  const gdpTimestamp = new Date(gdpDate)
  const olderTimestamp = wilshireTimestamp < gdpTimestamp ? wilshireTimestamp : gdpTimestamp

  // Wilshire should be recent (real-time), GDP can be quarterly
  const wilshireFreshness = calculateDataFreshness(wilshireDate, DATA_FRESHNESS_THRESHOLDS.REAL_TIME)
  const gdpFreshness = calculateDataFreshness(gdpDate, DATA_FRESHNESS_THRESHOLDS.QUARTERLY)

  if (wilshireFreshness.status === 'stale') {
    warnings.push(`Wilshire data is stale (${wilshireFreshness.formattedAge})`)
  }

  if (gdpFreshness.status === 'stale') {
    warnings.push(`GDP data is stale (${gdpFreshness.formattedAge})`)
  }

  const freshness = calculateDataFreshness(olderTimestamp, DATA_FRESHNESS_THRESHOLDS.DAILY)

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    freshness,
  }
}

/**
 * Get color class for freshness status (Tailwind CSS)
 */
export function getFreshnessColorClass(status: DataFreshnessStatus): string {
  switch (status) {
    case 'live':
      return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
    case 'delayed':
      return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20'
    case 'stale':
      return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
    case 'error':
      return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20'
  }
}

/**
 * Get status badge text
 */
export function getFreshnessLabel(status: DataFreshnessStatus): string {
  switch (status) {
    case 'live':
      return 'Live'
    case 'delayed':
      return 'Delayed'
    case 'stale':
      return 'Stale'
    case 'error':
      return 'Error'
  }
}
