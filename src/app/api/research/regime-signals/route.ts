import { NextRequest, NextResponse } from 'next/server'
import { computeRegimeSignals, type RegimeSignalsResponse } from '@/lib/research'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

// Use Node.js runtime for heavy computation
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const fresh = url.searchParams.get('fresh') === '1'

    const cacheKey = CACHE_KEYS.RESEARCH_REGIME_SIGNALS

    // Check cache unless fresh=1 is requested
    if (!fresh) {
      const cached = await getCached<RegimeSignalsResponse>(cacheKey)
      if (cached) {
        return NextResponse.json({
          data: cached,
          cached: true,
          computedAt: cached.meta.computedAt,
        })
      }
    }

    // Compute fresh signals
    console.log('Computing regime signals (fresh)...')
    const data = await computeRegimeSignals(fresh)

    // Cache the result
    await setCached(cacheKey, data, CACHE_TTL.REGIME_SIGNALS)

    return NextResponse.json({
      data,
      cached: false,
      computedAt: data.meta.computedAt,
    })
  } catch (error) {
    console.error('Regime signals API error:', error)
    return NextResponse.json(
      {
        error: 'Failed to compute regime signals',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
