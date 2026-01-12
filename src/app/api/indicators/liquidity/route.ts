import { NextResponse } from 'next/server'
import { computeLiquidity } from '@/lib/calculations/liquidity'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'edge'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const fresh = url.searchParams.get('fresh') === '1'
    const cacheKey = CACHE_KEYS.INDICATOR_LIQUIDITY
    const cached = fresh ? null : await getCached<any>(cacheKey)
    if (cached) {
      return NextResponse.json({
        data: cached,
        cached: true,
        lastUpdated: cached.current?.date ?? new Date().toISOString(),
      })
    }

    const data = await computeLiquidity(undefined, fresh)
    await setCached(cacheKey, data, CACHE_TTL.LIQUIDITY)

    return NextResponse.json({
      data,
      cached: false,
      lastUpdated: data.current?.date ?? new Date().toISOString(),
    })
  } catch (error) {
    console.error('Liquidity API error:', error)
    return NextResponse.json(
      {
        error: 'Failed to compute Liquidity Index',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}




