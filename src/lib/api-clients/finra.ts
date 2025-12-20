/**
 * FINRA Margin Statistics Fetcher
 *
 * Fetches margin debt data directly from FINRA's margin statistics page.
 * Source: https://www.finra.org/rules-guidance/key-topics/margin-accounts/margin-statistics
 *
 * FINRA publishes monthly margin statistics including:
 * - Debit balances in customers' securities margin accounts
 * - Free credit balances in customers' cash accounts
 * - Free credit balances in customers' securities margin accounts
 *
 * Data is reported in millions of dollars.
 * Updates typically occur on the third week of the month following the reference month.
 */

import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

const FINRA_MARGIN_URL = 'https://www.finra.org/rules-guidance/key-topics/margin-accounts/margin-statistics'

export interface FINRAMarginData {
  date: string // Format: "YYYY-MM" (e.g., "2025-11")
  debitBalance: number // In millions of dollars
  freeCreditCash: number | null // In millions of dollars
  freeCreditMargin: number | null // In millions of dollars
}

export interface FINRAMarginResponse {
  current: FINRAMarginData
  history: FINRAMarginData[]
  lastUpdated: string
  source: string
}

/**
 * Parse month string like "Nov-25" to "2025-11"
 */
function parseMonthString(monthStr: string): string {
  const months: Record<string, string> = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
  }

  const match = monthStr.match(/^(\w{3})-(\d{2})$/)
  if (!match) return ''

  const month = match[1]
  const year = match[2]
  if (!month || !year) return ''

  const monthNum = months[month]
  if (!monthNum) return ''

  // Assume 20xx for years 00-99
  const fullYear = parseInt(year, 10) > 50 ? `19${year}` : `20${year}`
  return `${fullYear}-${monthNum}`
}

/**
 * Parse dollar amount string like "$1,214,321" to number 1214321
 */
function parseDollarAmount(amountStr: string): number {
  const cleaned = amountStr.replace(/[$,\s]/g, '')
  const value = parseInt(cleaned, 10)
  return isNaN(value) ? 0 : value
}

/**
 * Fetch and parse FINRA margin statistics from their website
 */
async function fetchFINRAMarginData(): Promise<FINRAMarginResponse> {
  const response = await fetch(FINRA_MARGIN_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; FinancialDashboard/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
    },
    next: { revalidate: 3600 } // Cache for 1 hour
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch FINRA data: ${response.status}`)
  }

  const html = await response.text()

  // Parse the table data from HTML
  // The table contains rows with: Month, Debit Balances, Free Credit (Cash), Free Credit (Margin)
  const history: FINRAMarginData[] = []

  // Match table rows with margin data
  // Pattern: Month | Debit Balance | Free Credit Cash | Free Credit Margin
  const rowPattern = /<tr[^>]*>[\s\S]*?<td[^>]*>([A-Z][a-z]{2}-\d{2})<\/td>[\s\S]*?<td[^>]*>\$?([\d,]+)<\/td>[\s\S]*?<td[^>]*>\$?([\d,]+)<\/td>[\s\S]*?<td[^>]*>\$?([\d,]+)<\/td>[\s\S]*?<\/tr>/gi

  let match: RegExpExecArray | null
  while ((match = rowPattern.exec(html)) !== null) {
    const monthStr = match[1]
    const debit = match[2]
    const creditCash = match[3]
    const creditMargin = match[4]

    if (!monthStr || !debit) continue

    const date = parseMonthString(monthStr)
    if (date) {
      history.push({
        date,
        debitBalance: parseDollarAmount(debit),
        freeCreditCash: creditCash ? parseDollarAmount(creditCash) : null,
        freeCreditMargin: creditMargin ? parseDollarAmount(creditMargin) : null,
      })
    }
  }

  // If regex parsing failed, try a simpler approach
  if (history.length === 0) {
    // Look for patterns like "Nov-25" followed by dollar amounts
    const simplePattern = /([A-Z][a-z]{2}-\d{2})\s*\|?\s*\$?([\d,]+)/g
    let simpleMatch: RegExpExecArray | null
    while ((simpleMatch = simplePattern.exec(html)) !== null) {
      const monthStr = simpleMatch[1]
      const amount = simpleMatch[2]

      if (!monthStr || !amount) continue

      const date = parseMonthString(monthStr)
      if (date && !history.find(h => h.date === date)) {
        history.push({
          date,
          debitBalance: parseDollarAmount(amount),
          freeCreditCash: null,
          freeCreditMargin: null,
        })
      }
    }
  }

  // Sort by date descending (most recent first)
  history.sort((a, b) => b.date.localeCompare(a.date))

  if (history.length === 0) {
    throw new Error('Could not parse FINRA margin data from page')
  }

  const current = history[0]
  if (!current) {
    throw new Error('Could not parse FINRA margin data from page')
  }

  return {
    current,
    history,
    lastUpdated: new Date().toISOString(),
    source: 'FINRA Margin Statistics',
  }
}

/**
 * Get FINRA margin debt data with caching
 */
export async function getFINRAMarginDebt(fresh = false): Promise<FINRAMarginResponse> {
  const cacheKey = `${CACHE_KEYS.INDICATOR_MARGIN}:finra`

  if (!fresh) {
    const cached = await getCached<FINRAMarginResponse>(cacheKey)
    if (cached) return cached
  }

  const data = await fetchFINRAMarginData()
  await setCached(cacheKey, data, CACHE_TTL.MONTHLY)

  return data
}

/**
 * Get current margin debt in trillions
 */
export async function getCurrentMarginDebtTrillion(): Promise<number> {
  const data = await getFINRAMarginDebt()
  // Convert from millions to trillions
  return data.current.debitBalance / 1_000_000
}

/**
 * Get margin debt history formatted for charts
 * Returns data in millions of dollars with ISO date format
 */
export async function getMarginDebtHistory(): Promise<Array<{ date: string; value: number }>> {
  const data = await getFINRAMarginDebt()

  return data.history.map(item => ({
    date: `${item.date}-01`, // Convert "2025-11" to "2025-11-01" for chart compatibility
    value: item.debitBalance, // Keep in millions for chart
  })).reverse() // Chronological order for charts
}

export const finraAPI = {
  getMarginDebt: getFINRAMarginDebt,
  getCurrentMarginDebtTrillion,
  getMarginDebtHistory,
}
