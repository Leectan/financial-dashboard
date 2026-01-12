import { NextResponse } from 'next/server'
import { fredAPI } from '@/lib/api-clients/fred'
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'edge'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start') || '1990-01-01'
    const fresh = searchParams.get('fresh') === '1'
    const key = `${CACHE_KEYS.INDICATOR_DEFAULT_CREDIT}:start:${start}`
    const cached = fresh ? null : await getCached<any>(key)
    if (cached) return NextResponse.json({ data: cached, cached: true, lastUpdated: new Date().toISOString() })

    // Proxies: consumer loan delinquency and credit card charge-offs
    const [consumerDelq, ccChargeOff] = await Promise.all([
      fredAPI.getSeriesFromStart('DRCLACBS', start, fresh), // Delinquency Rate on Consumer Loans, All Commercial Banks
      fredAPI.getSeriesFromStart('CORCACBS', start, fresh), // Net Charge-Offs on Credit Card Loans, All Commercial Banks
    ])
    const data = {
      consumerDelinquency: consumerDelq.map((o) => ({ date: o.date, value: parseFloat(o.value) })),
      creditCardChargeOffs: ccChargeOff.map((o) => ({ date: o.date, value: parseFloat(o.value) })),
    }
    await setCached(key, data, CACHE_TTL.MONTHLY)
    return NextResponse.json({ data, cached: false, lastUpdated: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch defaults' }, { status: 500 })
  }
}





