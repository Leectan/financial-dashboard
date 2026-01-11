import { NextRequest, NextResponse } from 'next/server'
import { fredAPI } from '@/lib/api-clients/fred'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'edge'

interface CorpDefaultsPoint {
  date: string
  value: number
}

interface CorpDefaultsData {
  delinquency: CorpDefaultsPoint[]
  chargeOffs: CorpDefaultsPoint[]
  currentDelinquency: number | null
  currentChargeOffs: number | null
  meta: {
    source: 'FRED'
    note: string
    delinquencySeries: string
    chargeOffsSeries: string
  }
}

async function computeCorpDefaults(start: string): Promise<CorpDefaultsData> {
  // Fetch business loan credit stress proxies from FRED
  // DRBLACBS: Delinquency Rate on Business Loans, All Commercial Banks (Quarterly, SA)
  // CORBLACBS: Charge-Off Rate on Business Loans, All Commercial Banks (Quarterly, SA)
  const [delinquencyRaw, chargeOffsRaw] = await Promise.all([
    fredAPI.getSeriesFromStart('DRBLACBS', start),
    fredAPI.getSeriesFromStart('CORBLACBS', start),
  ])

  const delinquency = delinquencyRaw.map((o) => ({
    date: o.date,
    value: parseFloat(o.value),
  }))

  const chargeOffs = chargeOffsRaw.map((o) => ({
    date: o.date,
    value: parseFloat(o.value),
  }))

  const currentDelinquency = delinquency.length > 0 ? delinquency[delinquency.length - 1]?.value ?? null : null
  const currentChargeOffs = chargeOffs.length > 0 ? chargeOffs[chargeOffs.length - 1]?.value ?? null : null

  return {
    delinquency,
    chargeOffs,
    currentDelinquency,
    currentChargeOffs,
    meta: {
      source: 'FRED',
      note: 'These are bank business loan credit-stress proxies (delinquency & charge-offs), NOT corporate bond default rates. Quarterly data, seasonally adjusted.',
      delinquencySeries: 'DRBLACBS',
      chargeOffsSeries: 'CORBLACBS',
    },
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const start = url.searchParams.get('start') || '1990-01-01'
    const fresh = url.searchParams.get('fresh') === '1'

    const cacheKey = `${CACHE_KEYS.INDICATOR_CORP_DEFAULTS}:start:${start}`

    // Check cache first unless fresh is requested
    if (!fresh) {
      const cached = await getCached<CorpDefaultsData>(cacheKey)
      if (cached) {
        return NextResponse.json({
          data: cached,
          cached: true,
          lastUpdated: new Date().toISOString(),
        })
      }
    }

    // Compute fresh data
    const data = await computeCorpDefaults(start)

    // Cache the result (quarterly data, use MONTHLY TTL)
    await setCached(cacheKey, data, CACHE_TTL.MONTHLY)

    return NextResponse.json({
      data,
      cached: false,
      lastUpdated: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Corp defaults API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch corporate defaults proxy data' },
      { status: 500 }
    )
  }
}
