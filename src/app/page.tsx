'use client'

import { useAllIndicators } from '@/hooks/use-indicators'
import { IndicatorCard } from '@/components/dashboard/IndicatorCard'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { RefreshButton } from '@/components/dashboard/RefreshButton'
import { M2Chart } from '@/components/charts/M2Chart'
import { YieldCurveChart } from '@/components/charts/YieldCurveChart'
import { BuffettHistoryChart } from '@/components/charts/BuffettChart'
import { SimpleLineChart } from '@/components/charts/SimpleLineChart'
import { useEffect, useMemo, useState } from 'react'

export default function DashboardPage() {
  const { m2, yieldCurve, buffett, qqqDeviation, hySpread, putCall, fedExpectations, liquidity, srf, rmp } = useAllIndicators()

  const [sahm, setSahm] = useState<any>(null)
  const [housing, setHousing] = useState<any>(null)
  const [pmi, setPmi] = useState<any>(null)
  const [sentiment, setSentiment] = useState<any>(null)
  const [jobless, setJobless] = useState<any>(null)
  const [vix, setVix] = useState<any>(null)
  const [margin, setMargin] = useState<any>(null)
  const [defaults, setDefaults] = useState<any>(null)
  const [rrp, setRrp] = useState<any>(null)

  // Track loading states for useEffect-based indicators
  const [effectLoading, setEffectLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal

    // Backend APIs on Vercel take 20-35 seconds due to cold starts + FRED API latency
    // Set timeout to 60 seconds to ensure we don't give up before data arrives
    const fetchWithTimeout = (url: string, timeout = 60000) => {
      return Promise.race([
        fetch(url, { signal }).then((r) => r.json()),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), timeout)
        )
      ])
    }

    ;(async () => {
      try {
        const [sahmRes, housingRes, pmiRes, sentimentRes, joblessRes, vixRes, marginRes, defaultsRes, rrpRes] = await Promise.allSettled([
          fetchWithTimeout('/api/indicators/sahm'),
          fetchWithTimeout('/api/indicators/housing'),
          fetchWithTimeout('/api/indicators/pmi'),
          fetchWithTimeout('/api/indicators/sentiment'),
          fetchWithTimeout('/api/indicators/jobless'),
          fetchWithTimeout('/api/indicators/vix'),
          fetchWithTimeout('/api/indicators/margin'),
          fetchWithTimeout('/api/indicators/defaults'),
          fetchWithTimeout('/api/indicators/rrp'),
        ])

        // Handle fulfilled promises only
        if (sahmRes.status === 'fulfilled') setSahm(sahmRes.value.data)
        if (housingRes.status === 'fulfilled') setHousing(housingRes.value.data)
        if (pmiRes.status === 'fulfilled') setPmi(pmiRes.value.data)
        if (sentimentRes.status === 'fulfilled') setSentiment(sentimentRes.value.data)
        if (joblessRes.status === 'fulfilled') setJobless(joblessRes.value.data)
        if (vixRes.status === 'fulfilled') setVix(vixRes.value.data)
        if (marginRes.status === 'fulfilled') setMargin(marginRes.value.data)
        if (defaultsRes.status === 'fulfilled') setDefaults(defaultsRes.value.data)
        if (rrpRes.status === 'fulfilled') setRrp(rrpRes.value.data)
      } catch (error) {
        console.error('Error fetching indicators:', error)
      } finally {
        setEffectLoading(false)
      }
    })()

    return () => controller.abort()
  }, [])

  // NO BLOCKING isLoading gate - render immediately and let individual cards show their own loading states

  // Helper utilities for composite indices
  const average = (nums: number[]): number | null => {
    const filtered = nums.filter((n) => Number.isFinite(n))
    if (!filtered.length) return null
    const sum = filtered.reduce((acc, n) => acc + n, 0)
    return sum / filtered.length
  }

  type SeriesPoint = { date: string; value: number }

  // Build percentile helper that pre-sorts values once
  const makePercentileFn = (values: number[]): ((value: number) => number) => {
    const sorted = [...values].sort((a, b) => a - b)
    const n = sorted.length
    return (value: number): number => {
      if (!n) return 50
      let count = 0
      for (const v of sorted) {
        if (v <= value) count++
        else break
      }
      const pct = (count - 1) / (n - 1 || 1)
      return Math.min(100, Math.max(0, pct * 100))
    }
  }

  // Helper: given a sorted series [{date, value}], get the latest value as of a given date
  const makeAsOfGetter = <T extends { date: string }>(
    series: T[],
    getValue: (p: T) => number | null,
  ): ((date: string) => number | null) => {
    let i = 0
    const n = series.length
    return (date: string): number | null => {
      while (i < n) {
        const current = series[i]
        if (!current || current.date > date) break
        i++
      }
      const idx = i - 1
      if (idx < 0) return null
      const entry = series[idx]
      if (!entry) return null
      const v = getValue(entry)
      return typeof v === 'number' && !Number.isNaN(v) ? v : null
    }
  }

  const {
    greedHistory,
    bubbleHistory,
    smartDumbHistory,
    greedCurrent,
    bubbleCurrent,
    smartDumbCurrent,
  } = useMemo(() => {
    // Require all underlying series for historical composites
    if (
      !vix?.history ||
      !Array.isArray(vix.history) ||
      !sentiment?.values ||
      !Array.isArray(sentiment.values) ||
      !hySpread.data?.history ||
      !liquidity.data?.history ||
      !qqqDeviation.data?.history ||
      !(buffett.data && Array.isArray(buffett.data.history))
    ) {
      return {
        greedHistory: [] as SeriesPoint[],
        bubbleHistory: [] as SeriesPoint[],
        smartDumbHistory: [] as SeriesPoint[],
        greedCurrent: null as number | null,
        bubbleCurrent: null as number | null,
        smartDumbCurrent: null as number | null,
      }
    }

    // Use QQQ deviation history (where index exists) as main time grid
    const qqqHist = qqqDeviation.data.history
      .filter((p) => p.index != null)
      .map((p) => ({ date: p.date, qqqIndex: p.index as number }))
      .sort((a, b) => a.date.localeCompare(b.date))

    if (!qqqHist.length) {
      return {
        greedHistory: [] as SeriesPoint[],
        bubbleHistory: [] as SeriesPoint[],
        smartDumbHistory: [] as SeriesPoint[],
        greedCurrent: null as number | null,
        bubbleCurrent: null as number | null,
        smartDumbCurrent: null as number | null,
      }
    }

    const vixHist = [...vix.history].sort((a: any, b: any) => a.date.localeCompare(b.date))
    const umichHist = [...sentiment.values].sort((a: any, b: any) => a.date.localeCompare(b.date))
    const hyHist = [...hySpread.data.history].sort((a, b) => a.date.localeCompare(b.date))
    const liqHist = [...liquidity.data.history].sort((a, b) => a.date.localeCompare(b.date))
    const buffHist = [...(buffett.data.history || [])]
      .map((p: any) => ({ date: p.date, ratio: p.ratio }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const getVix = makeAsOfGetter(vixHist, (p: any) => p.value)
    const getUmich = makeAsOfGetter(umichHist, (p: any) => p.value)
    const getHy = makeAsOfGetter(hyHist, (p) => p.spread)
    const getLiqIdx = makeAsOfGetter(liqHist, (p) => p.index)
    const getBuff = makeAsOfGetter(buffHist, (p) => p.ratio)

    type RawRow = {
      date: string
      vix: number
      umich: number
      hy: number
      liqIdx: number
      buff: number
      qqqIndex: number
    }

    const rows: RawRow[] = []
    const vixAll: number[] = []
    const umichAll: number[] = []
    const hyAll: number[] = []
    const liqAll: number[] = []
    const buffAll: number[] = []

    for (const p of qqqHist) {
      const date = p.date
      const vixVal = getVix(date)
      const umichVal = getUmich(date)
      const hyVal = getHy(date)
      const liqVal = getLiqIdx(date)
      const buffVal = getBuff(date)
      const qqqIndex = p.qqqIndex

      if (
        vixVal == null ||
        umichVal == null ||
        hyVal == null ||
        liqVal == null ||
        buffVal == null ||
        qqqIndex == null
      ) {
        continue
      }

      rows.push({ date, vix: vixVal, umich: umichVal, hy: hyVal, liqIdx: liqVal, buff: buffVal, qqqIndex })
      vixAll.push(vixVal)
      umichAll.push(umichVal)
      hyAll.push(hyVal)
      liqAll.push(liqVal)
      buffAll.push(buffVal)
    }

    if (!rows.length) {
      return {
        greedHistory: [] as SeriesPoint[],
        bubbleHistory: [] as SeriesPoint[],
        smartDumbHistory: [] as SeriesPoint[],
        greedCurrent: null as number | null,
        bubbleCurrent: null as number | null,
        smartDumbCurrent: null as number | null,
      }
    }

    const vixPctFn = makePercentileFn(vixAll)
    const umichPctFn = makePercentileFn(umichAll)
    const hyPctFn = makePercentileFn(hyAll)
    const buffPctFn = makePercentileFn(buffAll)

    const greedHistory: SeriesPoint[] = []
    const bubbleHistory: SeriesPoint[] = []
    const smartDumbHistory: SeriesPoint[] = []

    for (const row of rows) {
      const vixGreed = 100 - vixPctFn(row.vix)
      const umichGreed = umichPctFn(row.umich)

      const greedComponents: number[] = []
      // Put/call is not available for free; rely on VIX + UMich
      if (Number.isFinite(vixGreed)) greedComponents.push(vixGreed)
      if (Number.isFinite(umichGreed)) greedComponents.push(umichGreed)

      const greed = average(greedComponents)

      const liquidityRisk = Math.max(0, Math.min(100, 100 - row.liqIdx))
      const creditRisk = 100 - hyPctFn(row.hy)
      const buffettRisk = buffPctFn(row.buff)
      const qqqRisk = row.qqqIndex

      const bubbleComponents: number[] = []
      if (greed != null) bubbleComponents.push(greed)
      if (Number.isFinite(liquidityRisk)) bubbleComponents.push(liquidityRisk)
      if (Number.isFinite(creditRisk)) bubbleComponents.push(creditRisk)
      if (Number.isFinite(buffettRisk)) bubbleComponents.push(buffettRisk)
      if (Number.isFinite(qqqRisk)) bubbleComponents.push(qqqRisk)

      const bubble = average(bubbleComponents)

      const smartDumbComponents: number[] = []
      if (greed != null) smartDumbComponents.push(greed)
      if (Number.isFinite(liquidityRisk)) smartDumbComponents.push(liquidityRisk)
      if (Number.isFinite(creditRisk)) smartDumbComponents.push(creditRisk)

      const smartDumb = average(smartDumbComponents)

      if (greed != null) greedHistory.push({ date: row.date, value: greed })
      if (bubble != null) bubbleHistory.push({ date: row.date, value: bubble })
      if (smartDumb != null) smartDumbHistory.push({ date: row.date, value: smartDumb })
    }

    const greedCurrent = greedHistory.length ? (greedHistory[greedHistory.length - 1]?.value ?? null) : null
    const bubbleCurrent = bubbleHistory.length ? (bubbleHistory[bubbleHistory.length - 1]?.value ?? null) : null
    const smartDumbCurrent = smartDumbHistory.length ? (smartDumbHistory[smartDumbHistory.length - 1]?.value ?? null) : null

    return { greedHistory, bubbleHistory, smartDumbHistory, greedCurrent, bubbleCurrent, smartDumbCurrent }
  }, [vix, sentiment, hySpread.data, liquidity.data, qqqDeviation.data, buffett.data])

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Financial Indicators Dashboard</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">Real-time macroeconomic indicators and market valuation metrics</p>
            </div>
            <RefreshButton />
          </div>
        </header>

        <DashboardGrid>
          {/* SRF Usage (NY Fed Repo Full Allotment) */}
          <IndicatorCard
            title="Standing Repo Facility (SRF) Usage"
            value={
              srf.data?.current
                ? `$${(srf.data.current.accepted / 1e9).toFixed(2)}B`
                : 'Loading...'
            }
            subtitle={
              srf.data?.current?.minimumBidRate != null
                ? `Minimum bid rate: ${srf.data.current.minimumBidRate.toFixed(2)}%`
                : 'Accepted amount (sum of intraday ops)'
            }
            isLoading={srf.isLoading && !srf.data}
            error={srf.error as any}
          >
            {srf.data?.history?.length ? (
              <SimpleLineChart
                data={srf.data.history.map((p) => ({ date: p.date, value: p.accepted / 1e9 }))}
                valueLabel="Accepted ($B)"
                valueFormatter={(v) => `$${v.toFixed(2)}B`}
                defaultWindowCount={260}
              />
            ) : null}
            {srf.data?.note ? (
              <div className="mt-3 text-xs text-gray-500 dark:text-gray-500">{srf.data.note}</div>
            ) : null}
          </IndicatorCard>

          {/* RMP Proxy (SOMA Treasury Bills Held Outright) */}
          <IndicatorCard
            title="RMP Proxy: SOMA Treasury Bills Held Outright"
            value={
              rmp.data?.current
                ? `$${(rmp.data.current.billsHeldOutright / 1e12).toFixed(2)}T`
                : 'Loading...'
            }
            subtitle="Stock of Treasury bills held outright (SOMA, weekly as-of)"
            isLoading={rmp.isLoading && !rmp.data}
            error={rmp.error as any}
          >
            {rmp.data?.history?.length ? (
              <SimpleLineChart
                data={rmp.data.history.map((p) => ({ date: p.date, value: p.billsHeldOutright / 1e12 }))}
                valueLabel="Bills ($T)"
                valueFormatter={(v) => `$${v.toFixed(2)}T`}
                defaultWindowCount={520}
              />
            ) : null}
            {rmp.data?.note ? (
              <div className="mt-3 text-xs text-gray-500 dark:text-gray-500">{rmp.data.note}</div>
            ) : null}
          </IndicatorCard>

          {/* VIX - always show card, loading state if no data */}
          <IndicatorCard 
            title="VIX (Fear Gauge)" 
            value={vix ? `${vix.current.toFixed(2)}` : 'Loading...'} 
            subtitle="Higher = more fear"
            isLoading={effectLoading && !vix}
          >
            {vix && (
              <SimpleLineChart data={vix.history} valueLabel="VIX" valueFormatter={(v) => `${v.toFixed(2)}`} refLines={[{ y: 12, color: '#22c55e' }, { y: 20, color: '#f59e0b' }, { y: 30, color: '#dc2626' }]} defaultWindowCount={156} />
            )}
          </IndicatorCard>

          {/* RRP - always show card */}
          <IndicatorCard
            title="Federal Reserve Reverse Repo (ON RRP)"
            value={rrp?.current != null ? `$${(rrp.current / 1000).toFixed(2)}T` : 'Loading...'}
            subtitle="Overnight RRPs outstanding (daily)"
            isLoading={effectLoading && !rrp}
          >
            {rrp && (
              <SimpleLineChart
                data={rrp.values}
                valueLabel="RRP"
                valueFormatter={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(2)}T` : `$${v.toFixed(0)}B`)}
                defaultWindowCount={2520}
              />
            )}
          </IndicatorCard>

          <IndicatorCard
            title="10Y/2Y Treasury Yield Spread"
            value={yieldCurve.data ? `${yieldCurve.data.spread.toFixed(2)}%` : 'Loading...'}
            subtitle={yieldCurve.data?.interpretation}
            interpretation={yieldCurve.data?.recessionProbability}
            alert={yieldCurve.data?.inverted}
            error={yieldCurve.error as Error | null}
            isLoading={yieldCurve.isLoading}
          >
            {yieldCurve.data && (
              <YieldCurveChart
                spread={yieldCurve.data.spread}
                treasury10Y={yieldCurve.data.treasury10Y}
                treasury2Y={yieldCurve.data.treasury2Y}
                inverted={yieldCurve.data.inverted}
                history={yieldCurve.data.history}
              />
            )}
          </IndicatorCard>

          <IndicatorCard
            title="Buffett Indicator"
            value={buffett.data ? `${buffett.data.ratio.toFixed(1)}%` : 'Loading...'}
            subtitle={buffett.data?.interpretation}
            interpretation={`Market Cap / GDP Ratio`}
            error={buffett.error as Error | null}
            isLoading={buffett.isLoading}
          >
            {buffett.data?.history && <BuffettHistoryChart history={buffett.data.history} />}
          </IndicatorCard>

          {/* QQQ Deviation - always show */}
          <IndicatorCard
            title="QQQ 200-Day Deviation Index"
            value={
              qqqDeviation.data?.current?.deviationPct != null
                ? `${qqqDeviation.data.current.deviationPct.toFixed(1)}%`
                : 'Loading...'
            }
            subtitle={
              qqqDeviation.data?.current?.index != null
                ? `Percentile: ${qqqDeviation.data.current.index.toFixed(1)}`
                : 'Deviation vs 200-day moving average'
            }
            isLoading={qqqDeviation.isLoading}
            error={qqqDeviation.error as Error | null}
          >
            {qqqDeviation.data?.history && (
              <SimpleLineChart
                data={qqqDeviation.data.history
                  .filter((p) => p.index != null)
                  .map((p) => ({ date: p.date, value: p.index as number }))}
                valueLabel="Deviation Percentile"
                valueFormatter={(v) => v.toFixed(1)}
                refLines={[
                  { y: 70, color: '#22c55e' },
                  { y: 85, color: '#f59e0b' },
                  { y: 95, color: '#dc2626' },
                ]}
                defaultWindowCount={520}
              />
            )}
          </IndicatorCard>

          {/* Sahm Rule - always show */}
          <IndicatorCard
            title="Sahm Rule Recession Indicator"
            value={sahm ? `${sahm.latest.toFixed(2)}%` : 'Loading...'}
            subtitle={sahm?.interpretation || 'Recession probability indicator'}
            interpretation={sahm?.triggered ? 'Triggered (≥ 0.5%)' : 'Not Triggered'}
            isLoading={effectLoading && !sahm}
          >
            {sahm && (
              <SimpleLineChart data={sahm.history} valueLabel="Sahm" valueFormatter={(v) => `${v.toFixed(2)}%`} refLines={[{ y: 0.5, color: '#dc2626' }]} defaultWindowCount={240} />
            )}
          </IndicatorCard>

          {/* Housing - always show */}
          <IndicatorCard
            title="Housing Starts & Building Permits"
            value={housing?.starts?.length ? `${housing.starts[housing.starts.length - 1].value.toFixed(0)}K` : 'Loading...'}
            subtitle="Monthly"
            isLoading={effectLoading && !housing}
          >
            {housing && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SimpleLineChart data={housing.starts} valueLabel="Starts" valueFormatter={(v) => `${v.toFixed(0)}K`} defaultWindowCount={240} />
                <SimpleLineChart data={housing.permits} valueLabel="Permits" valueFormatter={(v) => `${v.toFixed(0)}K`} defaultWindowCount={240} />
              </div>
            )}
          </IndicatorCard>

          {/* PMI - always show */}
          <IndicatorCard 
            title="ISM Manufacturing PMI" 
            value={pmi?.values?.length ? `${pmi.values[pmi.values.length - 1].value.toFixed(1)}` : 'Loading...'} 
            subtitle="<50 = contraction"
            isLoading={effectLoading && !pmi}
          >
            {pmi && (
              <SimpleLineChart
                data={pmi.values}
                valueLabel="PMI"
                valueFormatter={(v) => `${v.toFixed(1)}`}
                refLines={[{ y: 50, color: '#22c55e' }, { y: 48, color: '#f59e0b' }]}
                defaultWindowCount={240}
              />
            )}
          </IndicatorCard>

          {/* Consumer Sentiment - always show */}
          <IndicatorCard 
            title="Consumer Sentiment (UMich)" 
            value={sentiment?.values?.length ? `${sentiment.values[sentiment.values.length - 1].value.toFixed(1)}` : 'Loading...'} 
            subtitle="Monthly"
            isLoading={effectLoading && !sentiment}
          >
            {sentiment && (
              <SimpleLineChart data={sentiment.values} valueLabel="Sentiment" valueFormatter={(v) => `${v.toFixed(1)}`} defaultWindowCount={240} />
            )}
          </IndicatorCard>

          {/* Jobless Claims - always show */}
          <IndicatorCard 
            title="Initial Jobless Claims" 
            value={jobless?.values?.length ? `${jobless.values[jobless.values.length - 1].value.toFixed(0)}` : 'Loading...'} 
            subtitle="Weekly"
            isLoading={effectLoading && !jobless}
          >
            {jobless && (
              <SimpleLineChart data={jobless.values} valueLabel="Claims" valueFormatter={(v) => `${v.toFixed(0)}`} defaultWindowCount={260} />
            )}
          </IndicatorCard>

          {/* Margin Debt - always show */}
          <IndicatorCard 
            title="Margin Debt (NYSE)" 
            value={margin?.current ? `${margin.current.toFixed(0)}B` : 'Loading...'} 
            subtitle="Monthly"
            isLoading={effectLoading && !margin}
          >
            {margin && (
              <SimpleLineChart data={margin.values} valueLabel="Margin" valueFormatter={(v) => `${v.toFixed(0)}B`} defaultWindowCount={240} />
            )}
          </IndicatorCard>

          {/* Default Rates - always show */}
          <IndicatorCard 
            title="Default Rates" 
            value={defaults ? 'See chart' : 'Loading...'} 
            subtitle="Consumer Delinquency & Credit Card Charge-offs"
            isLoading={effectLoading && !defaults}
          >
            {defaults && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SimpleLineChart data={defaults.consumerDelinquency} valueLabel="Consumer Delinquency" valueFormatter={(v) => `${v.toFixed(2)}%`} defaultWindowCount={240} />
                <SimpleLineChart data={defaults.creditCardChargeOffs} valueLabel="CC Charge-offs" valueFormatter={(v) => `${v.toFixed(2)}%`} defaultWindowCount={240} />
              </div>
            )}
          </IndicatorCard>

          {/* HY Spread - always show */}
          <IndicatorCard
            title="High-Yield Credit Spread"
            value={hySpread.data?.current ? `${hySpread.data.current.spread.toFixed(2)}%` : 'Loading...'}
            subtitle="ICE BofA US High Yield OAS"
            isLoading={hySpread.isLoading}
            error={hySpread.error as Error | null}
          >
            {hySpread.data?.history && (
              <SimpleLineChart
                data={hySpread.data.history.map((p) => ({ date: p.date, value: p.spread }))}
                valueLabel="Spread"
                valueFormatter={(v) => `${v.toFixed(2)}%`}
                defaultWindowCount={520}
              />
            )}
          </IndicatorCard>

          {/* Put/Call - show note about data limitation */}
          <IndicatorCard
            title="Put/Call Ratio Index"
            value={
              putCall.data?.current?.index != null
                ? putCall.data.current.index.toFixed(1)
                : putCall.data?.note 
                ? 'N/A'
                : 'Loading...'
            }
            subtitle={
              putCall.data?.note 
                ? 'Free data unavailable - see VIX for sentiment'
                : putCall.data?.current?.smoothed != null
                ? `Smoothed ratio: ${putCall.data.current.smoothed.toFixed(2)}`
                : 'Smoothed equity put/call ratio'
            }
            isLoading={putCall.isLoading}
          >
            {putCall.data?.history && putCall.data.history.length > 0 ? (
              <SimpleLineChart
                data={putCall.data.history
                  .filter((p) => p.index != null)
                  .map((p) => ({ date: p.date, value: p.index as number }))}
                valueLabel="Complacency Index"
                valueFormatter={(v) => v.toFixed(1)}
                refLines={[
                  { y: 25, color: '#22c55e' },
                  { y: 70, color: '#f59e0b' },
                  { y: 85, color: '#dc2626' },
                ]}
                defaultWindowCount={260}
              />
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400 p-4 text-center">
                Put/Call ratio requires paid data subscription.<br/>
                VIX and Consumer Sentiment are used as sentiment proxies.
              </div>
            )}
          </IndicatorCard>

          {/* Market Sentiment / Greed Index - historical composite */}
          <IndicatorCard
            title="Market Sentiment / Greed Index"
            value={greedCurrent != null ? greedCurrent.toFixed(1) : 'Loading...'}
            subtitle="0 = Extreme Fear, 100 = Extreme Greed"
            isLoading={(effectLoading || !greedHistory.length)}
          >
            {greedHistory.length > 0 && (
              <SimpleLineChart
                data={greedHistory}
                valueLabel="Greed Index"
                valueFormatter={(v) => v.toFixed(1)}
                refLines={[
                  { y: 30, color: '#22c55e' },
                  { y: 70, color: '#f59e0b' },
                  { y: 85, color: '#dc2626' },
                ]}
                defaultWindowCount={260}
              />
            )}
          </IndicatorCard>

          {/* Bubble Risk Composite - historical composite */}
          <IndicatorCard
            title="Bubble Risk Composite Index"
            value={bubbleCurrent != null ? bubbleCurrent.toFixed(1) : 'Loading...'}
            subtitle="Composite of valuation, technicals, liquidity, credit, and sentiment"
            isLoading={(effectLoading || qqqDeviation.isLoading || hySpread.isLoading || liquidity.isLoading || buffett.isLoading) && !bubbleHistory.length}
          >
            {bubbleHistory.length > 0 && (
              <SimpleLineChart
                data={bubbleHistory}
                valueLabel="Bubble Risk"
                valueFormatter={(v) => v.toFixed(1)}
                refLines={[
                  { y: 60, color: '#22c55e' },
                  { y: 75, color: '#f59e0b' },
                  { y: 90, color: '#dc2626' },
                ]}
                defaultWindowCount={260}
              />
            )}
          </IndicatorCard>

          {/* Smart vs Dumb Money Proxy - historical composite */}
          <IndicatorCard
            title="Smart vs Dumb Money Proxy Index"
            value={smartDumbCurrent != null ? smartDumbCurrent.toFixed(1) : 'Loading...'}
            subtitle="Higher = Dumb money more aggressive relative to Smart proxies"
            isLoading={(effectLoading || hySpread.isLoading || liquidity.isLoading) && !smartDumbHistory.length}
          >
            {smartDumbHistory.length > 0 && (
              <SimpleLineChart
                data={smartDumbHistory}
                valueLabel="Smart vs Dumb Proxy"
                valueFormatter={(v) => v.toFixed(1)}
                refLines={[
                  { y: 40, color: '#22c55e' },
                  { y: 70, color: '#f59e0b' },
                  { y: 85, color: '#dc2626' },
                ]}
                defaultWindowCount={260}
              />
            )}
          </IndicatorCard>

          {/* Fed Expectations - always show */}
          <IndicatorCard
            title="CME-Style Fed Expectations Index"
            value={
              fedExpectations.data?.current?.index != null
                ? fedExpectations.data.current.index.toFixed(1)
                : fedExpectations.data?.current?.easing != null
                ? `${fedExpectations.data.current.easing.toFixed(2)}%`
                : 'Loading...'
            }
            subtitle={
              fedExpectations.data?.current?.targetRate != null &&
              fedExpectations.data?.current?.impliedRate != null
                ? `Target: ${fedExpectations.data.current.targetRate.toFixed(2)}%, Implied: ${fedExpectations.data.current.impliedRate.toFixed(2)}%`
                : 'Implied easing from Fed funds futures vs FOMC target'
            }
            isLoading={fedExpectations.isLoading}
            error={fedExpectations.error as Error | null}
          >
            {fedExpectations.data?.history && (
              <SimpleLineChart
                data={fedExpectations.data.history
                  .filter((p) => p.index != null)
                  .map((p) => ({ date: p.date, value: p.index as number }))}
                valueLabel="Easing Expectation Index"
                valueFormatter={(v) => v.toFixed(1)}
                defaultWindowCount={520}
              />
            )}
          </IndicatorCard>

          {/* Liquidity Index - always show */}
          <IndicatorCard
            title="Liquidity Index (Fed Net Liquidity)"
            value={liquidity.data?.current?.index != null ? liquidity.data.current.index.toFixed(1) : 'Loading...'}
            subtitle={
              liquidity.data?.current?.yoyChange != null
                ? `YoY change: ${liquidity.data.current.yoyChange.toFixed(1)}%`
                : 'Fed Balance Sheet - TGA - RRP'
            }
            isLoading={liquidity.isLoading}
            error={liquidity.error as Error | null}
          >
            {liquidity.data?.history && (
              <SimpleLineChart
                data={liquidity.data.history
                  .filter((p) => p.index != null)
                  .map((p) => ({ date: p.date, value: p.index as number }))}
                valueLabel="Liquidity Index"
                valueFormatter={(v) => v.toFixed(1)}
                refLines={[
                  { y: 20, color: '#dc2626' },
                  { y: 40, color: '#f59e0b' },
                  { y: 60, color: '#22c55e' },
                ]}
                defaultWindowCount={260}
              />
            )}
          </IndicatorCard>

          <IndicatorCard
            title="M2 Money Supply"
            value={m2.data ? `$${(m2.data.current / 1000).toFixed(2)}T` : 'Loading...'}
            subtitle={m2.data?.date}
            interpretation="Weekly updates from Federal Reserve"
            error={m2.error as Error | null}
            isLoading={m2.isLoading}
          >
            {m2.data && <M2Chart data={m2.data.historical} />}
          </IndicatorCard>
        </DashboardGrid>

        <footer className="mt-12 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>Data sources: Federal Reserve Economic Data (FRED), Yahoo Finance</p>
          <p className="mt-2">
            Updates automatically every hour • Last updated:{' '}
            {m2.data?.lastUpdated ? new Date(m2.data.lastUpdated).toLocaleString() : 'Unknown'}
          </p>
        </footer>
      </div>
    </main>
  )
}
