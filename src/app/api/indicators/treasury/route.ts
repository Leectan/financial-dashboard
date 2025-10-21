import { NextResponse } from 'next/server'
import { calculateYieldCurveSpread, getYieldCurveHistory } from '@/lib/calculations/yield-curve'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'edge'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start') || '1950-01-01'

    const cacheKey = `${CACHE_KEYS.INDICATOR_YIELD_CURVE}:start:${start}`
    const cached = await getCached<any>(cacheKey)
    if (cached) {
      return NextResponse.json({ data: cached, cached: true, lastUpdated: cached.calculatedAt || new Date().toISOString() })
    }

    const [current, history] = await Promise.all([
      calculateYieldCurveSpread(),
      getYieldCurveHistory(start),
    ])

    const data = { ...current, history }
    await setCached(cacheKey, data, CACHE_TTL.YIELD_CURVE)
    return NextResponse.json({ data, cached: false, lastUpdated: new Date().toISOString() })
  } catch (error) {
    console.error('Yield Curve API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch yield curve', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
