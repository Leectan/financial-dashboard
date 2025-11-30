import { NextResponse } from 'next/server'
import { fredAPI } from '@/lib/api-clients/fred'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'edge'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start') || '1970-01-01'
    const key = `${CACHE_KEYS.INDICATOR_MARGIN}:start:${start}`
    const cached = await getCached<any>(key)
    if (cached) return NextResponse.json({ data: cached, cached: true, lastUpdated: new Date().toISOString() })

    // MDSP: Securities in brokers' and dealers' margin accounts, level (Z.1)
    const series = await fredAPI.getSeriesFromStart('MDSP', start)
    const values = series.map((o) => ({ date: o.date, value: parseFloat(o.value) }))
    const last = values[values.length - 1]
    const data = { current: last?.value ?? null, date: last?.date ?? null, values }
    await setCached(key, data, CACHE_TTL.MONTHLY)
    return NextResponse.json({ data, cached: false, lastUpdated: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch margin debt' }, { status: 500 })
  }
}


