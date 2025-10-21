import { NextRequest, NextResponse } from 'next/server'
import { fredAPI } from '@/lib/api-clients/fred'
import { calculateBuffettIndicator } from '@/lib/calculations/buffett'
import { calculateYieldCurveSpread } from '@/lib/calculations/yield-curve'
import { setCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`
  if (authHeader !== expectedAuth) {
    console.warn('Unauthorized cron request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('Starting scheduled cache update...')
  const startTime = Date.now()
  const results: Record<string, 'success' | 'failed'> = {}

  const updates = await Promise.allSettled([
    (async () => {
      const data = await fredAPI.getM2MoneySupply()
      const first = data[0]
      if (!first) throw new Error('No M2 observations returned')
      const formatted = {
        current: parseFloat(first.value),
        date: first.date,
        historical: data.slice(0, 20).map((obs) => ({ date: obs.date, value: parseFloat(obs.value) })),
        unit: 'Billions of Dollars',
        source: 'FRED (WM2NS)',
        lastUpdated: new Date().toISOString(),
      }
      await setCached(CACHE_KEYS.INDICATOR_M2, formatted, CACHE_TTL.M2)
      results.m2 = 'success'
    })(),
    (async () => {
      const data = await calculateYieldCurveSpread()
      await setCached(CACHE_KEYS.INDICATOR_YIELD_CURVE, data, CACHE_TTL.YIELD_CURVE)
      results.yieldCurve = 'success'
    })(),
    (async () => {
      const data = await calculateBuffettIndicator()
      await setCached(CACHE_KEYS.INDICATOR_BUFFETT, data, CACHE_TTL.BUFFETT)
      results.buffett = 'success'
    })(),
  ])

  updates.forEach((result, index) => {
    const names = ['m2', 'yieldCurve', 'buffett']
    if (result.status === 'rejected') {
      // @ts-ignore
      results[names[index]] = 'failed'
      console.error(`Failed to update ${names[index]}:`, result.reason)
    }
  })

  await setCached(CACHE_KEYS.CRON_LAST_RUN, new Date().toISOString(), CACHE_TTL.CRON_STATUS)

  const duration = Date.now() - startTime
  console.log(`Cache update completed in ${duration}ms`)

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    duration,
    results,
    summary: {
      total: Object.keys(results).length,
      successful: Object.values(results).filter((v) => v === 'success').length,
      failed: Object.values(results).filter((v) => v === 'failed').length,
    },
  })
}
