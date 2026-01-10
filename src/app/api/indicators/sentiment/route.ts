import { NextResponse } from 'next/server'
import { fredAPI } from '@/lib/api-clients/fred'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'edge'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start') || '1978-01-01'
    const key = `${CACHE_KEYS.INDICATOR_SENTIMENT}:start:${start}`
    const cached = await getCached<any>(key)
    if (cached) return NextResponse.json({ data: cached, cached: true, lastUpdated: new Date().toISOString() })

    const series = await fredAPI.getSeriesFromStart('UMCSENT', start)
    const values = series.map((o) => ({ date: o.date, value: parseFloat(o.value) }))
    await setCached(key, { values }, CACHE_TTL.MONTHLY)
    return NextResponse.json({ data: { values }, cached: false, lastUpdated: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch sentiment' }, { status: 500 })
  }
}






