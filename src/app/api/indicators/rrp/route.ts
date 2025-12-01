import { NextResponse } from 'next/server'
import { fredAPI } from '@/lib/api-clients/fred'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'edge'

// Overnight Reverse Repurchase Agreements: Treasury Securities Sold by the Federal Reserve (Daily)
// FRED series: RRPONTSYD
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start') || '2014-01-01'
    const fresh = searchParams.get('fresh') === '1'
    const key = `${CACHE_KEYS.INDICATOR_RRP}:start:${start}`
    const cached = fresh ? null : await getCached<any>(key)
    if (cached) return NextResponse.json({ data: cached, cached: true, lastUpdated: new Date().toISOString() })

    const series = await fredAPI.getSeriesFromStart('RRPONTSYD', start)
    const values = series
      .filter((o) => o.value !== null && o.value !== undefined && o.value !== '.' && o.value !== '')
      .map((o) => ({ date: o.date, value: parseFloat(o.value) }))

    const last = values[values.length - 1]
    const data = { current: last?.value ?? null, date: last?.date ?? null, values }

    // RRP is a daily series; cache for 24h
    await setCached(key, data, CACHE_TTL.M2)
    return NextResponse.json({ data, cached: false, lastUpdated: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch Reverse Repo (RRP)' }, { status: 500 })
  }
}





