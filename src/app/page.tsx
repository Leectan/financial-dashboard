'use client'

import { useAllIndicators } from '@/hooks/use-indicators'
import { IndicatorCard } from '@/components/dashboard/IndicatorCard'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { RefreshButton } from '@/components/dashboard/RefreshButton'
import { SignalsPanel } from '@/components/dashboard/SignalsPanel'
import { M2Chart } from '@/components/charts/M2Chart'
import { YieldCurveChart } from '@/components/charts/YieldCurveChart'
import { BuffettHistoryChart } from '@/components/charts/BuffettChart'
import { SimpleLineChart } from '@/components/charts/SimpleLineChart'
import { CorpCreditSpreadsChart } from '@/components/charts/CorpCreditSpreadsChart'
import { useMemo } from 'react'

export default function DashboardPage() {
  const {
    m2,
    yieldCurve,
    buffett,
    forwardPE,
    qqqDeviation,
    hySpread,
    putCall,
    fedExpectations,
    liquidity,
    srf,
    rmp,
    corpCredit,
    corpDefaults,
    tsi,
    vix,
    sahm,
    housing,
    pmi,
    sentiment,
    jobless,
    defaults,
    margin,
    rrp,
  } = useAllIndicators()

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
      !vix.data?.history ||
      !Array.isArray(vix.data.history) ||
      !sentiment.data?.values ||
      !Array.isArray(sentiment.data.values) ||
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

    const vixHist = [...vix.data.history].sort((a: any, b: any) => a.date.localeCompare(b.date))
    const umichHist = [...sentiment.data.values].sort((a: any, b: any) => a.date.localeCompare(b.date))
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
  }, [vix.data, sentiment.data, hySpread.data, liquidity.data, qqqDeviation.data, buffett.data])

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

        {/* 2-column layout: charts left, signals right */}
        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8">
          {/* Main chart grid */}
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
            interpretation='How much cash dealers/banks borrowed overnight from the Fed by pledging safe bonds. $0 is normal; spikes mean funding plumbing stress (not “bullish/bearish” by itself, but a stress signal).'
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
            interpretation="Bigger = the Fed holds more T-bills (more reserves/liquidity injected over time). Smaller = runoff/drain. Good for stability/risk assets, but also means looser financial conditions."
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
            value={vix.data ? `${vix.data.current.toFixed(2)}` : 'Loading...'} 
            subtitle="Higher = more fear"
            interpretation="Market’s expected 30-day S&P volatility. High = panic/hedging demand; very low = complacency (can be a late-cycle warning)."
            isLoading={vix.isLoading && !vix.data}
          >
            {vix.data && (
              <SimpleLineChart data={vix.data.history} valueLabel="VIX" valueFormatter={(v) => `${v.toFixed(2)}`} refLines={[{ y: 12, color: '#22c55e' }, { y: 20, color: '#f59e0b' }, { y: 30, color: '#dc2626' }]} defaultWindowCount={156} />
            )}
          </IndicatorCard>

          {/* RRP - always show card */}
          <IndicatorCard
            title="Federal Reserve Reverse Repo (ON RRP)"
            value={rrp.data?.current != null ? `$${(rrp.data.current / 1000).toFixed(2)}T` : 'Loading...'}
            subtitle="Overnight RRPs outstanding (daily)"
            interpretation="How much cash money funds park at the Fed overnight. High = lots of idle cash; falling often means cash is moving back into markets/banks (context-dependent)."
            isLoading={rrp.isLoading && !rrp.data}
          >
            {rrp.data && (
              <SimpleLineChart
                data={rrp.data.values}
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
            interpretation={`When this is negative (inverted), short rates are higher than long rates — historically a recession warning. When positive, funding conditions are usually healthier. (${yieldCurve.data?.recessionProbability ?? 'Recession risk varies'})`}
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
            subtitle={
              buffett.data
                ? `${buffett.data.interpretation} • Wilshire as-of ${new Date(buffett.data.wilshireDate).toISOString().slice(0, 10)} • GDP as-of ${buffett.data.gdpDate}`
                : undefined
            }
            interpretation="Market value of US equities vs US GDP. Higher = “more expensive” market vs economy (lower long-run expected returns); can stay elevated for years."
            error={buffett.error as Error | null}
            isLoading={buffett.isLoading}
          >
            {buffett.data?.history && <BuffettHistoryChart history={buffett.data.history} />}
          </IndicatorCard>

          <IndicatorCard
            title="S&P 500 Forward P/E"
            value={forwardPE.data?.current != null ? forwardPE.data.current.toFixed(2) : 'Loading...'}
            subtitle={forwardPE.data?.date ? `As of ${forwardPE.data.date}` : 'Forward price/earnings ratio'}
            interpretation="Forward P/E uses projected future earnings (analyst estimates). Higher = investors paying more per $ of expected earnings (richer valuations). Lower = cheaper, or expectations falling."
            isLoading={forwardPE.isLoading}
            error={forwardPE.error as Error | null}
          >
            {forwardPE.data?.values?.length ? (
              <>
                <SimpleLineChart
                  data={forwardPE.data.values}
                  valueLabel="Forward P/E"
                  valueFormatter={(v) => v.toFixed(2)}
                  refLines={[
                    { y: 15, color: '#22c55e' },
                    { y: 20, color: '#f59e0b' },
                    { y: 25, color: '#dc2626' },
                  ]}
                  defaultWindowCount={260}
                />
                {forwardPE.data.notes?.length ? (
                  <div className="mt-3 text-xs text-gray-500 dark:text-gray-500">
                    {forwardPE.data.notes[0]}
                  </div>
                ) : null}
              </>
            ) : null}
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
            interpretation="How stretched Nasdaq-100 is vs its 200-day average. High percentile = unusually extended (fragile to pullbacks); low percentile = depressed/washed-out."
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
            value={sahm.data ? `${sahm.data.latest.toFixed(2)}%` : 'Loading...'}
            subtitle={sahm.data?.interpretation || 'Recession probability indicator'}
            interpretation={
              sahm.data?.triggered
                ? 'Triggered: unemployment has risen enough (≥0.5pp vs 12-month low) that recession is often already starting.'
                : 'Not triggered: labor market hasn’t weakened enough by this specific historical rule.'
            }
            isLoading={sahm.isLoading && !sahm.data}
          >
            {sahm.data && (
              <SimpleLineChart data={sahm.data.history} valueLabel="Sahm" valueFormatter={(v) => `${v.toFixed(2)}%`} refLines={[{ y: 0.5, color: '#dc2626' }]} defaultWindowCount={240} />
            )}
          </IndicatorCard>

          {/* Housing - always show */}
          <IndicatorCard
            title="Housing Starts & Building Permits"
            value={housing.data?.starts?.length ? `${housing.data.starts[housing.data.starts.length - 1]?.value.toFixed(0)}K` : 'Loading...'}
            subtitle="Monthly"
            interpretation="New home-building activity. Rising = growth/confidence; falling = rates/credit are biting and the economy is slowing (housing is a leading indicator)."
            isLoading={housing.isLoading && !housing.data}
          >
            {housing.data && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SimpleLineChart data={housing.data.starts} valueLabel="Starts" valueFormatter={(v) => `${v.toFixed(0)}K`} defaultWindowCount={240} />
                <SimpleLineChart data={housing.data.permits} valueLabel="Permits" valueFormatter={(v) => `${v.toFixed(0)}K`} defaultWindowCount={240} />
              </div>
            )}
          </IndicatorCard>

          {/* PMI - always show */}
          <IndicatorCard 
            title="ISM Manufacturing PMI" 
            value={pmi.data?.values?.length ? `${pmi.data.values[pmi.data.values.length - 1]?.value.toFixed(1)}` : 'Loading...'} 
            subtitle="<50 = contraction"
            interpretation="A monthly business survey. Above 50 = expansion; below 50 = contraction. Direction and persistence matter more than one print."
            isLoading={pmi.isLoading && !pmi.data}
          >
            {pmi.data && (
              <SimpleLineChart
                data={pmi.data.values}
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
            value={sentiment.data?.values?.length ? `${sentiment.data.values[sentiment.data.values.length - 1]?.value.toFixed(1)}` : 'Loading...'} 
            subtitle="Monthly"
            interpretation="How confident households feel. Low = cautious spending; very low can be a contrarian “too pessimistic” signal. High = optimism (sometimes late-cycle)."
            isLoading={sentiment.isLoading && !sentiment.data}
          >
            {sentiment.data && (
              <SimpleLineChart data={sentiment.data.values} valueLabel="Sentiment" valueFormatter={(v) => `${v.toFixed(1)}`} defaultWindowCount={240} />
            )}
          </IndicatorCard>

          {/* Jobless Claims - always show */}
          <IndicatorCard 
            title="Initial Jobless Claims" 
            value={jobless.data?.values?.length ? `${jobless.data.values[jobless.data.values.length - 1]?.value.toFixed(0)}` : 'Loading...'} 
            subtitle="Weekly"
            interpretation="Near-real-time layoffs signal. Rising trend = labor market weakening (recession risk up). Falling/low = labor market tight."
            isLoading={jobless.isLoading && !jobless.data}
          >
            {jobless.data && (
              <SimpleLineChart data={jobless.data.values} valueLabel="Claims" valueFormatter={(v) => `${v.toFixed(0)}`} defaultWindowCount={260} />
            )}
          </IndicatorCard>

          {/* Margin Debt - FINRA data */}
          <IndicatorCard
            title="Margin Debt (FINRA)"
            value={margin.data?.current ? `$${(margin.data.current / 1000000).toFixed(2)}T` : 'Loading...'}
            subtitle="Monthly (FINRA)"
            interpretation="How much investors borrow to buy stocks. Rising = leverage/risk-on; sharp drops = deleveraging (can amplify market selloffs)."
            isLoading={margin.isLoading && !margin.data}
          >
            {margin.data && (
              <SimpleLineChart data={margin.data.values} valueLabel="Margin Debt" valueFormatter={(v) => `$${(v / 1000000).toFixed(2)}T`} defaultWindowCount={120} />
            )}
          </IndicatorCard>

          {/* Default Rates - always show */}
          <IndicatorCard 
            title="Default Rates" 
            value={defaults.data ? 'See chart' : 'Loading...'} 
            subtitle="Consumer Delinquency & Credit Card Charge-offs"
            interpretation="Household credit stress. Rising = consumers struggling + lenders tighten credit (usually a lagging-but-important recession signal)."
            isLoading={defaults.isLoading && !defaults.data}
          >
            {defaults.data && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SimpleLineChart data={defaults.data.consumerDelinquency} valueLabel="Consumer Delinquency" valueFormatter={(v) => `${v.toFixed(2)}%`} defaultWindowCount={240} />
                <SimpleLineChart data={defaults.data.creditCardChargeOffs} valueLabel="CC Charge-offs" valueFormatter={(v) => `${v.toFixed(2)}%`} defaultWindowCount={240} />
              </div>
            )}
          </IndicatorCard>

          {/* HY OAS - ICE BofA US High Yield Index Option-Adjusted Spread */}
          <IndicatorCard
            title="ICE BofA US High Yield OAS"
            value={hySpread.data?.current ? `${hySpread.data.current.spread.toFixed(2)}%` : 'Loading...'}
            subtitle="FRED BAMLH0A0HYM2 (Option-Adjusted Spread)"
            interpretation="Extra yield investors demand to hold junk bonds vs Treasuries. Tight spreads (<3%) indicate risk-on/complacency; widening or >5% indicates credit stress/risk-off."
            isLoading={hySpread.isLoading}
            error={hySpread.error as Error | null}
          >
            {hySpread.data?.history && (
              <SimpleLineChart
                data={hySpread.data.history.map((p) => ({ date: p.date, value: p.spread }))}
                valueLabel="OAS"
                valueFormatter={(v) => `${v.toFixed(2)}%`}
                refLines={[
                  { y: 3, color: '#22c55e' },
                  { y: 5, color: '#f59e0b' },
                  { y: 8, color: '#dc2626' },
                ]}
                defaultWindowCount={520}
              />
            )}
          </IndicatorCard>

          {/* Corporate Credit Spreads (OAS) - IG/BBB/HY multi-line */}
          <IndicatorCard
            title="Corporate Credit Spreads (OAS)"
            value={
              corpCredit.data
                ? `HY ${corpCredit.data.hy.current?.value.toFixed(2) ?? '—'}% | BBB ${corpCredit.data.bbb.current?.value.toFixed(2) ?? '—'}% | IG ${corpCredit.data.ig.current?.value.toFixed(2) ?? '—'}%`
                : 'Loading...'
            }
            subtitle={
              corpCredit.data
                ? `FRED ICE BofA OAS • as of ${corpCredit.data.meta.asOf}`
                : 'Investment Grade, BBB, and High Yield OAS'
            }
            interpretation="Option-adjusted spreads for US corporate bonds. Widening spreads = credit stress / risk-off; tightening = risk-on / complacency. BBB (near-junk) often leads IG during stress."
            isLoading={corpCredit.isLoading}
            error={corpCredit.error as Error | null}
          >
            {corpCredit.data && (
              <CorpCreditSpreadsChart
                ig={corpCredit.data.ig.history}
                bbb={corpCredit.data.bbb.history}
                hy={corpCredit.data.hy.history}
                defaultWindowCount={2600}
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
            interpretation="If available: higher put/call = more fear/hedging; lower = more call-buying/complacency. This card is a placeholder because reliable free put/call history isn’t available."
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
            interpretation="Composite (VIX + consumer sentiment) scaled 0–100. High = complacency/greed; low = fear. Extremes matter more than day-to-day wiggles."
            isLoading={(vix.isLoading || sentiment.isLoading) && !greedHistory.length}
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
            interpretation="0–100 risk regime score. High = market looks historically “bubble-like” (stretched prices + easy liquidity + tight credit spreads + greedy sentiment)."
            isLoading={(qqqDeviation.isLoading || hySpread.isLoading || liquidity.isLoading || buffett.isLoading || vix.isLoading || sentiment.isLoading) && !bubbleHistory.length}
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
            interpretation="A proxy: it rises when sentiment is hot while liquidity/credit conditions look late-cycle. High = crowd behavior risk; it is not a true COT/flow-based ‘smart money’ measure."
            isLoading={(hySpread.isLoading || liquidity.isLoading || vix.isLoading || sentiment.isLoading) && !smartDumbHistory.length}
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
            interpretation="Higher = the market is pricing more future rate cuts (easing). That can be supportive for risk assets, but it often appears when growth is weakening."
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
            interpretation="0–100 percentile of “net liquidity” (Fed assets minus Treasury cash and RRPs). Higher = more liquidity tailwind; lower = liquidity drain (headwind)."
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
            interpretation="Total money in the system (cash + deposits). Growth supports spending/inflation; sustained contraction is tightening (often a risk-off macro signal)."
            error={m2.error as Error | null}
            isLoading={m2.isLoading}
          >
            {m2.data && <M2Chart data={m2.data.historical} />}
          </IndicatorCard>

          {/* Corporate Credit Defaults Proxy (Business Loans) */}
          <IndicatorCard
            title="Corporate Credit Defaults (Proxy)"
            value={
              corpDefaults.data?.currentDelinquency != null
                ? `${corpDefaults.data.currentDelinquency.toFixed(2)}%`
                : 'Loading...'
            }
            subtitle="Business loan delinquency & charge-offs (FRED)"
            interpretation="PROXY for corporate credit stress (NOT bond default rates). Rising delinquencies and charge-offs indicate businesses struggling to service debt - a sign of credit tightening and potential recession."
            isLoading={corpDefaults.isLoading}
            error={corpDefaults.error as Error | null}
          >
            {corpDefaults.data && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Business Loan Delinquency (%)</div>
                  <SimpleLineChart
                    data={corpDefaults.data.delinquency}
                    valueLabel="Delinquency"
                    valueFormatter={(v) => `${v.toFixed(2)}%`}
                    defaultWindowCount={120}
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Business Loan Charge-Offs (%)</div>
                  <SimpleLineChart
                    data={corpDefaults.data.chargeOffs}
                    valueLabel="Charge-Offs"
                    valueFormatter={(v) => `${v.toFixed(2)}%`}
                    defaultWindowCount={120}
                  />
                </div>
              </div>
            )}
            {corpDefaults.data?.meta?.note && (
              <div className="mt-3 text-xs text-gray-500 dark:text-gray-500">{corpDefaults.data.meta.note}</div>
            )}
          </IndicatorCard>

          {/* Freight Transportation Services Index (TSI) */}
          <IndicatorCard
            title="Freight Transportation Services Index (TSI)"
            value={tsi.data?.current != null ? tsi.data.current.toFixed(1) : 'Loading...'}
            subtitle="BTS freight activity index (2000=100)"
            interpretation="Freight activity is a real-economy barometer. Persistent declines often precede economic slowdowns; rising = goods movement/economic activity expanding."
            isLoading={tsi.isLoading}
            error={tsi.error as Error | null}
          >
            {tsi.data?.values && (
              <SimpleLineChart
                data={tsi.data.values}
                valueLabel="TSI"
                valueFormatter={(v) => v.toFixed(1)}
                refLines={[{ y: 100, color: '#6b7280' }]}
                defaultWindowCount={240}
              />
            )}
          </IndicatorCard>
          </DashboardGrid>

          {/* Signals Panel - sticky sidebar on desktop, collapsible on mobile */}
          <aside className="mt-8 lg:mt-0">
            <div className="lg:sticky lg:top-8">
              <SignalsPanel />
            </div>
          </aside>
        </div>

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
