import { NextResponse } from 'next/server'
import { fredAPI } from '@/lib/api-clients/fred'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'edge'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start') || '1959-01-01'

    const cacheKey = `${CACHE_KEYS.INDICATOR_M2}:start:${start}`
    const cached = await getCached<any>(cacheKey)
    if (cached) {
      return NextResponse.json({ data: cached, cached: true, lastUpdated: cached.lastUpdated || new Date().toISOString() })
    }

    const observations = await fredAPI.getM2History(start)
    const first = observations.at(-1) || observations[0]
    const latest = observations[observations.length - 1]
    if (!latest) {
      return NextResponse.json(
        { error: 'No M2 observations available', message: 'FRED returned no observations for WM2NS' },
        { status: 503 }
      )
    }

    const response = {
      current: parseFloat(latest.value),
      date: latest.date,
      historical: observations.map((obs) => ({ date: obs.date, value: parseFloat(obs.value) })),
      unit: 'Billions of Dollars',
      source: 'FRED (WM2NS)',
      lastUpdated: new Date().toISOString(),
    }

    await setCached(cacheKey, response, CACHE_TTL.M2)

    return NextResponse.json({ data: response, cached: false, lastUpdated: response.lastUpdated })
  } catch (error) {
    console.error('M2 API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch M2 data', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
