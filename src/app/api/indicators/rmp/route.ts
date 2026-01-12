import { NextResponse } from 'next/server'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'
import { computeRMPProxy } from '@/lib/calculations/rmp'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const fresh = url.searchParams.get('fresh') === '1'
    const cacheKey = CACHE_KEYS.INDICATOR_RMP
    const cached = fresh ? null : await getCached<any>(cacheKey)
    if (cached) {
      return NextResponse.json({
        data: cached,
        cached: true,
        lastUpdated: cached.current?.date ?? new Date().toISOString(),
      })
    }

    const data = await computeRMPProxy()
    await setCached(cacheKey, data, CACHE_TTL.RMP)

    return NextResponse.json({
      data,
      cached: false,
      lastUpdated: data.current?.date ?? new Date().toISOString(),
    })
  } catch (error) {
    console.error('RMP API error:', error)
    return NextResponse.json(
      {
        error: 'Failed to compute RMP proxy series',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}




