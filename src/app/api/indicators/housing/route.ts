import { NextResponse } from 'next/server'
import { fredAPI } from '@/lib/api-clients/fred'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'edge'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start') || '1970-01-01'
    const key = `${CACHE_KEYS.INDICATOR_HOUSING}:start:${start}`
    const cached = await getCached<any>(key)
    if (cached) return NextResponse.json({ data: cached, cached: true, lastUpdated: new Date().toISOString() })

    const [starts, permits] = await Promise.all([
      fredAPI.getSeriesFromStart('HOUST', start),
      fredAPI.getSeriesFromStart('PERMIT', start),
    ])
    const data = {
      starts: starts.map((o) => ({ date: o.date, value: parseFloat(o.value) })),
      permits: permits.map((o) => ({ date: o.date, value: parseFloat(o.value) })),
    }
    await setCached(key, data, CACHE_TTL.MONTHLY)
    return NextResponse.json({ data, cached: false, lastUpdated: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch housing data' }, { status: 500 })
  }
}



