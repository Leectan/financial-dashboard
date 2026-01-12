import { NextResponse } from 'next/server'
import { computeHYSpread } from '@/lib/calculations/hy-spread'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'edge'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const fresh = url.searchParams.get('fresh') === '1'
    const cacheKey = CACHE_KEYS.INDICATOR_HY_SPREAD
    const cached = fresh ? null : await getCached<any>(cacheKey)
    if (cached) {
      return NextResponse.json({
        data: cached,
        cached: true,
        lastUpdated: cached.current?.date ?? new Date().toISOString(),
      })
    }

    const data = await computeHYSpread(undefined, fresh)
    await setCached(cacheKey, data, CACHE_TTL.HY_SPREAD)

    return NextResponse.json({
      data,
      cached: false,
      lastUpdated: data.current?.date ?? new Date().toISOString(),
    })
  } catch (error) {
    console.error('HY spread API error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch High-Yield spread data',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}




