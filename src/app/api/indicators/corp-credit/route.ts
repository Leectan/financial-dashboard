import { NextRequest, NextResponse } from 'next/server'
import { computeCorpCreditSpreads, type CorpCreditSpreads } from '@/lib/calculations/corp-credit-spreads'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const start = url.searchParams.get('start') || '1997-01-01'
    const fresh = url.searchParams.get('fresh') === '1'

    const cacheKey = `${CACHE_KEYS.INDICATOR_CORP_CREDIT}:start:${start}`

    // Check cache unless fresh=1 is requested
    if (!fresh) {
      const cached = await getCached<CorpCreditSpreads>(cacheKey)
      if (cached) {
        return NextResponse.json({
          data: cached,
          cached: true,
          lastUpdated: cached.meta.asOf,
        })
      }
    }

    // Compute fresh data
    const data = await computeCorpCreditSpreads(start, fresh)
    await setCached(cacheKey, data, CACHE_TTL.CORP_CREDIT)

    return NextResponse.json({
      data,
      cached: false,
      lastUpdated: data.meta.asOf,
    })
  } catch (error) {
    console.error('Corporate credit spreads API error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch Corporate Credit Spreads data',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
