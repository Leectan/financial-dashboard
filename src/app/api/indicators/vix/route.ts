import { NextResponse } from 'next/server'
import { yahooFinanceClient } from '@/lib/api-clients/yahoo-finance'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'edge'

export async function GET() {
  try {
    const key = CACHE_KEYS.INDICATOR_VIX
    const cached = await getCached<any>(key)
    if (cached) return NextResponse.json({ data: cached, cached: true, lastUpdated: new Date().toISOString() })

    const quote = await yahooFinanceClient.getSymbolQuote('^VIX')
    const history = await yahooFinanceClient.getSymbolHistory('^VIX', '5y', '1wk')
    const data = {
      current: quote.price,
      date: quote.date,
      history,
    }
    await setCached(key, data, CACHE_TTL.TREASURY_YIELDS)
    return NextResponse.json({ data, cached: false, lastUpdated: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch VIX' }, { status: 500 })
  }
}

