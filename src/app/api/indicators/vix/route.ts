import { NextResponse } from 'next/server'
import { fredAPI } from '@/lib/api-clients/fred'
import { yahooFinanceClient } from '@/lib/api-clients/yahoo-finance'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'edge'

export async function GET() {
  try {
    const key = CACHE_KEYS.INDICATOR_VIX
    const cached = await getCached<any>(key)
    if (cached) return NextResponse.json({ data: cached, cached: true, lastUpdated: new Date().toISOString() })

    // Primary: FRED VIXCLS (daily close)
    try {
      const series = await fredAPI.getSeriesFromStart('VIXCLS', '1990-01-01')
      const history = series
        .filter((o) => o.value !== null && o.value !== undefined && o.value !== '.' && o.value !== '')
        .map((o) => ({ date: o.date, value: parseFloat(o.value) }))
      const last = history[history.length - 1]
      if (!last || Number.isNaN(last.value)) throw new Error('No VIX data from FRED')
      const data = { current: last.value, date: last.date, history }
      await setCached(key, data, CACHE_TTL.TREASURY_YIELDS)
      return NextResponse.json({ data, cached: false, lastUpdated: new Date().toISOString() })
    } catch (e) {
      // Fallback: Yahoo ^VIX
      const quote = await yahooFinanceClient.getSymbolQuote('^VIX')
      const hist = await yahooFinanceClient.getSymbolHistory('^VIX', '5y', '1wk')
      const history = hist.map((p) => ({ date: p.date, value: p.price }))
      const data = { current: quote.price, date: quote.date, history }
      await setCached(key, data, CACHE_TTL.TREASURY_YIELDS)
      return NextResponse.json({ data, cached: false, lastUpdated: new Date().toISOString() })
    }
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch VIX' }, { status: 500 })
  }
}

