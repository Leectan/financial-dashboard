import { NextResponse } from 'next/server'
import { calculateYieldCurveSpread } from '@/lib/calculations/yield-curve'
import { calculateBuffettIndicator } from '@/lib/calculations/buffett'
import { fredAPI } from '@/lib/api-clients/fred'

export const runtime = 'edge'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fresh = searchParams.get('fresh') === '1'
  const results = await Promise.allSettled([
    (async () => {
      const observations = await fredAPI.getM2MoneySupply(fresh)
      const first = observations[0]
      if (!first) throw new Error('No M2 observations')
      return {
        current: parseFloat(first.value),
        date: first.date,
        historical: observations.slice(0, 20).map((obs) => ({ date: obs.date, value: parseFloat(obs.value) })),
        unit: 'Billions of Dollars',
        source: 'FRED (WM2NS)',
        lastUpdated: new Date().toISOString(),
      }
    })(),
    calculateYieldCurveSpread(fresh),
    calculateBuffettIndicator(fresh),
  ])

  const [m2Res, yieldCurveRes, buffettRes] = results

  const response: any = { m2: null, yieldCurve: null, buffett: null, errors: [] as string[] }

  if (m2Res.status === 'fulfilled') response.m2 = m2Res.value
  else response.errors.push(`m2: ${m2Res.reason instanceof Error ? m2Res.reason.message : 'failed'}`)

  if (yieldCurveRes.status === 'fulfilled') response.yieldCurve = yieldCurveRes.value
  else response.errors.push(`yieldCurve: ${yieldCurveRes.reason instanceof Error ? yieldCurveRes.reason.message : 'failed'}`)

  if (buffettRes.status === 'fulfilled') response.buffett = buffettRes.value
  else response.errors.push(`buffett: ${buffettRes.reason instanceof Error ? buffettRes.reason.message : 'failed'}`)

  return NextResponse.json(response)
}
