import { NextResponse } from 'next/server'
import { calculateYieldCurveSpread, getYieldCurveHistory } from '@/lib/calculations/yield-curve'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'edge'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const start = searchParams.get('start') || '1950-01-01'
  const fresh = searchParams.get('fresh') === '1'

  const cacheKey = `${CACHE_KEYS.INDICATOR_YIELD_CURVE}:start:${start}`
  try {
    const cached = fresh ? null : await getCached<any>(cacheKey)
    if (cached) {
      return NextResponse.json({ data: cached, cached: true, lastUpdated: cached.calculatedAt || new Date().toISOString() })
    }
  } catch {}

  try {
    const [current, history] = await Promise.all([
      calculateYieldCurveSpread(),
      getYieldCurveHistory(start),
    ])

    const data = { ...current, history }
    await setCached(cacheKey, data, CACHE_TTL.YIELD_CURVE)
    return NextResponse.json({ data, cached: false, lastUpdated: new Date().toISOString() })
  } catch (error) {
    console.error('Yield Curve API error:', error)
    const fallback = await getCached<any>(cacheKey)
    if (fallback) {
      return NextResponse.json({ data: { ...fallback, stale: true }, cached: true, lastUpdated: new Date().toISOString() })
    }
    return NextResponse.json(
      { error: 'Failed to fetch yield curve', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
