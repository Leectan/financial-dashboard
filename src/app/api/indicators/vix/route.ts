import { NextResponse } from 'next/server'
import { fredAPI } from '@/lib/api-clients/fred'
import { yahooFinanceClient } from '@/lib/api-clients/yahoo-finance'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

// Use Node.js runtime because this route does heavier external calls (FRED + Yahoo)
export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const fresh = url.searchParams.get('fresh') === '1'
    const key = CACHE_KEYS.INDICATOR_VIX
    if (!fresh) {
      const cached = await getCached<any>(key)
      if (cached) return NextResponse.json({ data: cached, cached: true, lastUpdated: new Date().toISOString() })
    }

    // Build long history from FRED, but use Yahoo for the latest intraday price
    let history: Array<{ date: string; value: number }>
    try {
      const series = await fredAPI.getSeriesFromStart('VIXCLS', '1990-01-01')
      history = series
        .filter((o) => o.value !== null && o.value !== undefined && o.value !== '.' && o.value !== '')
        .map((o) => ({ date: o.date, value: parseFloat(o.value) }))
    } catch (e) {
      // If FRED fails entirely, fall back to Yahoo weekly history to keep the chart functional
      const hist = await yahooFinanceClient.getSymbolHistory('^VIX', '5y', '1wk')
      history = hist.map((p) => ({ date: p.date, value: p.price }))
    }

    // Always attempt to fetch Yahoo for up-to-date current price (intraday)
    let currentValue: number
    let currentDate: Date
    try {
      const quote = await yahooFinanceClient.getSymbolQuote('^VIX')
      currentValue = quote.price
      currentDate = quote.date
    } catch (e) {
      // If Yahoo fails, fall back to the last history point from FRED
      const last = history[history.length - 1]
      if (!last) throw new Error('No VIX data available from either provider')
      currentValue = last.value
      currentDate = new Date(last.date)
    }

    // If the intraday current date is newer than FRED's last point, append it to history
    const lastHist = history[history.length - 1]
    const currentISO = currentDate.toISOString().slice(0, 10)
    if (!lastHist || lastHist.date < currentISO) {
      history = [...history, { date: currentISO, value: currentValue }]
    } else if (lastHist.date === currentISO) {
      // ensure last point reflects the latest price
      history = [...history.slice(0, -1), { date: currentISO, value: currentValue }]
    }

    const data = { current: currentValue, date: currentISO, history }
    await setCached(key, data, CACHE_TTL.VIX)
    return NextResponse.json({ data, cached: false, lastUpdated: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch VIX' }, { status: 500 })
  }
}

