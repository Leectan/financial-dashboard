import { NextResponse } from 'next/server'
import { calculateSahm } from '@/lib/calculations/sahm'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'edge'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start') || '1970-01-01'
    const key = `${CACHE_KEYS.INDICATOR_SAHM}:start:${start}`
    const cached = await getCached<any>(key)
    if (cached) return NextResponse.json({ data: cached, cached: true, lastUpdated: new Date().toISOString() })
    const data = await calculateSahm(start)
    await setCached(key, data, CACHE_TTL.MONTHLY)
    return NextResponse.json({ data, cached: false, lastUpdated: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to compute Sahm Rule' }, { status: 500 })
  }
}



