import { NextResponse } from 'next/server'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'
import { computeBofaBullBearProxy, type BofaBullBearProxyData } from '@/lib/calculations/bofa-bb'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: Request) {
  const url = new URL(request.url)
  const fresh = url.searchParams.get('fresh') === '1'
  const start = url.searchParams.get('start') || '2010-01-01'

  const cacheKey = `${CACHE_KEYS.INDICATOR_BOFA_BB}:start:${start}`
  if (!fresh) {
    const cached = await getCached<BofaBullBearProxyData>(cacheKey)
    if (cached) {
      return NextResponse.json({ data: cached, cached: true, lastUpdated: new Date().toISOString() })
    }
  }

  try {
    const data = await computeBofaBullBearProxy(start, fresh)

    await setCached(cacheKey, data, CACHE_TTL.BOFA_BB)
    return NextResponse.json({ data, cached: false, lastUpdated: new Date().toISOString() })
  } catch (error) {
    console.error('BofA B&B proxy API error:', error)
    return NextResponse.json(
      { error: 'Failed to compute BofA Bull & Bear proxy', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

