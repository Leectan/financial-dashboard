import { NextRequest, NextResponse } from 'next/server'
import { fredAPI } from '@/lib/api-clients/fred'
import { finraAPI } from '@/lib/api-clients/finra'
import { calculateBuffettIndicator } from '@/lib/calculations/buffett'
import { calculateYieldCurveSpread, getYieldCurveHistory } from '@/lib/calculations/yield-curve'
import { computeCorpCreditSpreads } from '@/lib/calculations/corp-credit-spreads'
import { computeRegimeSignals } from '@/lib/research'
import { setCached, getCached, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/redis'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const tokenParam = url.searchParams.get('token')?.trim()
  const authHeader = request.headers.get('authorization')?.trim()
  const secret = (process.env.CRON_SECRET || '').trim()
  const expectedAuth = `Bearer ${secret}`
  if (!(authHeader === expectedAuth || (tokenParam && tokenParam === secret))) {
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
      if (!first) throw new Error('No M2 observations')
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
      const hist = await getYieldCurveHistory('1950-01-01')
      await setCached(`${CACHE_KEYS.INDICATOR_YIELD_CURVE}:start:1950-01-01`, { ...data, history: hist }, CACHE_TTL.YIELD_CURVE)
      results.yieldCurve = 'success'
    })(),
    (async () => {
      const data = await calculateBuffettIndicator()
      await setCached(CACHE_KEYS.INDICATOR_BUFFETT, data, CACHE_TTL.BUFFETT)
      results.buffett = 'success'
    })(),
    (async () => {
      // Fetch FINRA margin debt data (actual margin statistics)
      // Source: https://www.finra.org/rules-guidance/key-topics/margin-accounts/margin-statistics
      const finraData = await finraAPI.getMarginDebt(true) // Force fresh fetch
      const values = finraData.history.map(item => ({
        date: `${item.date}-01`,
        value: item.debitBalance,
      })).reverse()
      await setCached(CACHE_KEYS.INDICATOR_MARGIN, {
        current: finraData.current.debitBalance,
        date: `${finraData.current.date}-01`,
        values,
        source: 'FINRA',
        unit: 'millions',
      }, CACHE_TTL.MONTHLY)
      results.margin = 'success'
    })(),
    (async () => {
      const [consumerDelq, ccChargeOff] = await Promise.all([
        fredAPI.getSeriesFromStart('DRCLACBS', '1990-01-01'),
        fredAPI.getSeriesFromStart('CORCACBS', '1990-01-01'),
      ])
      await setCached(`${CACHE_KEYS.INDICATOR_DEFAULT_CREDIT}:start:1990-01-01`, {
        consumerDelinquency: consumerDelq.map((o) => ({ date: o.date, value: parseFloat(o.value) })),
        creditCardChargeOffs: ccChargeOff.map((o) => ({ date: o.date, value: parseFloat(o.value) })),
      }, CACHE_TTL.MONTHLY)
      results.defaults = 'success'
    })(),
    (async () => {
      const series = await fredAPI.getSeriesFromStart('RRPONTSYD', '2014-01-01')
      const values = series.map((o) => ({ date: o.date, value: parseFloat(o.value) }))
      const last = values[values.length - 1]
      await setCached(`${CACHE_KEYS.INDICATOR_RRP}:start:2014-01-01`, { current: last?.value ?? null, date: last?.date ?? null, values }, CACHE_TTL.M2)
      results.rrp = 'success'
    })(),
    (async () => {
      const data = await computeCorpCreditSpreads('1997-01-01', true)
      await setCached(`${CACHE_KEYS.INDICATOR_CORP_CREDIT}:start:1997-01-01`, data, CACHE_TTL.CORP_CREDIT)
      results.corpCredit = 'success'
    })(),
    (async () => {
      const data = await computeRegimeSignals(true)
      await setCached(CACHE_KEYS.RESEARCH_REGIME_SIGNALS, data, CACHE_TTL.REGIME_SIGNALS)
      results.regimeSignals = 'success'
    })(),
  ])

  updates.forEach((result, index) => {
    const names = ['m2', 'yieldCurve', 'buffett', 'margin', 'defaults', 'rrp', 'corpCredit', 'regimeSignals']
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
