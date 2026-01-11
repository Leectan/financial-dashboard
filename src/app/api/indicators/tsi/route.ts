import { NextRequest, NextResponse } from 'next/server'
import { fredAPI } from '@/lib/api-clients/fred'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'edge'

interface TSIPoint {
  date: string
  value: number
}

interface TSIData {
  values: TSIPoint[]
  current: number | null
  date: string | null
  unit: string
  source: string
}

async function computeTSI(start: string): Promise<TSIData> {
  // Fetch Freight Transportation Services Index from FRED
  // TSIFRGHT: Freight Transportation Services Index (Monthly, SA, Index 2000=100)
  const raw = await fredAPI.getSeriesFromStart('TSIFRGHT', start)

  const values = raw.map((o) => ({
    date: o.date,
    value: parseFloat(o.value),
  }))

  const lastPoint = values.length > 0 ? values[values.length - 1] : null

  return {
    values,
    current: lastPoint?.value ?? null,
    date: lastPoint?.date ?? null,
    unit: 'Index (2000=100)',
    source: 'FRED (TSIFRGHT)',
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const start = url.searchParams.get('start') || '2000-01-01'
    const fresh = url.searchParams.get('fresh') === '1'

    const cacheKey = `${CACHE_KEYS.INDICATOR_TSI}:start:${start}`

    // Check cache first unless fresh is requested
    if (!fresh) {
      const cached = await getCached<TSIData>(cacheKey)
      if (cached) {
        return NextResponse.json({
          data: cached,
          cached: true,
          lastUpdated: new Date().toISOString(),
        })
      }
    }

    // Compute fresh data
    const data = await computeTSI(start)

    // Cache the result (monthly data)
    await setCached(cacheKey, data, CACHE_TTL.MONTHLY)

    return NextResponse.json({
      data,
      cached: false,
      lastUpdated: new Date().toISOString(),
    })
  } catch (error) {
    console.error('TSI API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch Transportation Services Index data' },
      { status: 500 }
    )
  }
}
