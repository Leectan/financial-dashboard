import { NextResponse } from 'next/server'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'
import { computePutCallIndex } from '@/lib/calculations/put-call'

export const runtime = 'nodejs'

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

    // Best-effort: try Yahoo ^PCALL when it works; fall back to placeholder when it doesn't.
    // We intentionally avoid throwing a 500 here so the dashboard remains stable.
    let data: any
    try {
      const computed = await computePutCallIndex('5y')
      if (computed.current && computed.history.length) {
        data = { ...computed, note: 'Source: Yahoo Finance (^PCALL). Free/unofficial feed; may be rate-limited or unavailable.' }
      } else {
        data = {
          history: [],
          current: {
            date: new Date().toISOString().slice(0, 10),
            ratio: null,
            smoothed: null,
            index: null,
          },
          note: 'Put/Call ratio data unavailable from free sources right now. We are using VIX + UMich as sentiment proxies.',
        }
      }
    } catch {
      data = {
        history: [],
        current: {
          date: new Date().toISOString().slice(0, 10),
          ratio: null,
          smoothed: null,
          index: null,
        },
        note: 'Put/Call ratio data unavailable from free sources right now. We are using VIX + UMich as sentiment proxies.',
      }
    }

    await setCached(cacheKey, data, CACHE_TTL.PUTCALL)

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




