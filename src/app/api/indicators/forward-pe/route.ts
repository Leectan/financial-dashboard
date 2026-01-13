import { NextResponse } from 'next/server'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'
import { fetchUSForwardPEHistory } from '@/lib/api-clients/trendonify'

export const runtime = 'nodejs'
export const maxDuration = 60

export type ForwardPEPoint = { date: string; value: number }

export type ForwardPEData = {
  current: number | null
  date: string | null
  values: ForwardPEPoint[]
  unit: string
  source: string
  notes: string[]
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const start = url.searchParams.get('start') || '2009-01-01'
    const fresh = url.searchParams.get('fresh') === '1'

    const cacheKey = `${CACHE_KEYS.INDICATOR_FORWARD_PE}:start:${start}`
    if (!fresh) {
      const cached = await getCached<ForwardPEData>(cacheKey)
      if (cached) {
        return NextResponse.json({ data: cached, cached: true, lastUpdated: new Date().toISOString() })
      }
    }

    const all = await fetchUSForwardPEHistory(fresh)
    const values = all.filter((p) => p.date >= start)
    const last = values.length ? values[values.length - 1] : null

    const data: ForwardPEData = {
      current: last?.value ?? null,
      date: last?.date ?? null,
      values,
      unit: 'P/E (forward)',
      source: 'Trendonify (public forward P/E series)',
      notes: [
        'Forward P/E is based on estimated future earnings; estimates can change and are not “final” like reported earnings.',
        'This series is sourced from a public Trendonify webpage and parsed server-side; if their markup changes, this chart may temporarily fail until updated.',
      ],
    }

    await setCached(cacheKey, data, CACHE_TTL.FORWARD_PE)
    return NextResponse.json({ data, cached: false, lastUpdated: new Date().toISOString() })
  } catch (error) {
    console.error('Forward P/E API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch forward P/E', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

