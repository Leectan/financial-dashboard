import { NextResponse } from 'next/server'
import { computeFedExpectations } from '@/lib/calculations/fed-expectations'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const cacheKey = CACHE_KEYS.INDICATOR_FED_EXPECTATIONS ?? 'indicator:fed-expectations'
    const cached = await getCached<any>(cacheKey)
    if (cached) {
      return NextResponse.json({
        data: cached,
        cached: true,
        lastUpdated: cached.current?.date ?? new Date().toISOString(),
      })
    }

    const data = await computeFedExpectations()
    await setCached(cacheKey, data, CACHE_TTL.WEEKLY)

    return NextResponse.json({
      data,
      cached: false,
      lastUpdated: data.current?.date ?? new Date().toISOString(),
    })
  } catch (error) {
    console.error('Fed expectations API error:', error)
    return NextResponse.json(
      {
        error: 'Failed to compute Fed expectations index',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}




