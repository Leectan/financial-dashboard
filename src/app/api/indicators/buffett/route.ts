import { NextResponse } from 'next/server'
import { calculateBuffettIndicator, getBuffettHistory } from '@/lib/calculations/buffett'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'edge'

export async function GET() {
  try {
    const cacheKey = `${CACHE_KEYS.INDICATOR_BUFFETT}:history`
    const cached = await getCached<any>(cacheKey)
    if (cached) {
      return NextResponse.json({ data: cached, cached: true, lastUpdated: cached.calculatedAt || new Date().toISOString() })
    }

    const [current, history] = await Promise.all([
      calculateBuffettIndicator(),
      getBuffettHistory(),
    ])

    const data = { ...current, history }
    await setCached(cacheKey, data, CACHE_TTL.BUFFETT)
    return NextResponse.json({ data, cached: false, lastUpdated: new Date().toISOString() })
  } catch (error) {
    console.error('Buffett API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch Buffett indicator', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
