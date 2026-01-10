import { NextResponse } from 'next/server'
import { finraAPI } from '@/lib/api-clients/finra'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

// Use nodejs runtime for HTML parsing
export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    // Accept both `fresh=true` and `fresh=1` (Refresh button uses `fresh=1`)
    const freshParam = (searchParams.get('fresh') || '').trim().toLowerCase()
    const fresh = freshParam === 'true' || freshParam === '1'

    const key = CACHE_KEYS.INDICATOR_MARGIN

    if (!fresh) {
      const cached = await getCached<any>(key)
      if (cached) {
        return NextResponse.json({ data: cached, cached: true, lastUpdated: new Date().toISOString() })
      }
    }

    // Fetch FINRA margin debt data (actual margin statistics)
    // Source: https://www.finra.org/rules-guidance/key-topics/margin-accounts/margin-statistics
    // Units: Millions of Dollars
    const finraData = await finraAPI.getMarginDebt(fresh)

    // Format for chart compatibility
    const values = finraData.history.map(item => ({
      date: `${item.date}-01`, // Convert "2025-11" to "2025-11-01"
      value: item.debitBalance, // In millions
    })).reverse() // Chronological order

    const data = {
      current: finraData.current.debitBalance, // In millions (e.g., 1214321 = $1.214T)
      date: `${finraData.current.date}-01`,
      values,
      source: 'FINRA',
      unit: 'millions',
    }

    await setCached(key, data, CACHE_TTL.MONTHLY)
    return NextResponse.json({ data, cached: false, lastUpdated: finraData.lastUpdated })
  } catch (e) {
    console.error('Failed to fetch FINRA margin debt:', e)
    return NextResponse.json({ error: 'Failed to fetch margin debt' }, { status: 500 })
  }
}

