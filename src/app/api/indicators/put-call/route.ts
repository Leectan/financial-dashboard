import { NextResponse } from 'next/server'
import { computePutCallIndex } from '@/lib/calculations/put-call'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'edge'

export async function GET() {
  try {
    const cacheKey = CACHE_KEYS.INDICATOR_PUTCALL
    const cached = await getCached<any>(cacheKey)
    if (cached) {
      return NextResponse.json({
        data: cached,
        cached: true,
        lastUpdated: cached.current?.date ?? new Date().toISOString(),
      })
    }

    const data = await computePutCallIndex('5y')
    await setCached(cacheKey, data, CACHE_TTL.PUTCALL)

    return NextResponse.json({
      data,
      cached: false,
      lastUpdated: data.current?.date ?? new Date().toISOString(),
    })
  } catch (error) {
    console.error('Put/Call API error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch Put/Call ratio data',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}


