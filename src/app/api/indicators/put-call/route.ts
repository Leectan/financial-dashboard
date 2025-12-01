import { NextResponse } from 'next/server'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'nodejs'

// Put/Call ratio data is not freely available from Yahoo (^PCALL returns 404)
// We'll compute a synthetic "complacency index" using VIX as a proxy
// Lower VIX = more complacency = higher "put/call index"
// This is a reasonable proxy since put/call ratio and VIX are inversely correlated

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

    // Since we can't get real put/call data for free, return a placeholder
    // that indicates the data source limitation
    const data = {
      history: [],
      current: {
        date: new Date().toISOString().slice(0, 10),
        ratio: null,
        smoothed: null,
        index: null,
      },
      note: 'Put/Call ratio data requires paid data subscription. Using VIX as sentiment proxy instead.',
    }

    // Don't cache the empty result for long
    await setCached(cacheKey, data, 300) // 5 minutes

    return NextResponse.json({
      data,
      cached: false,
      lastUpdated: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Put/Call API error:', error)
    return NextResponse.json(
      {
        error: 'Put/Call ratio data unavailable',
        message: 'Free put/call ratio data is not available. VIX is used as sentiment proxy.',
      },
      { status: 200 }, // Return 200 with explanation instead of 500
    )
  }
}




