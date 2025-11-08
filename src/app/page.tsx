'use client'

import { useAllIndicators } from '@/hooks/use-indicators'
import { IndicatorCard } from '@/components/dashboard/IndicatorCard'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { RefreshButton } from '@/components/dashboard/RefreshButton'
import { M2Chart } from '@/components/charts/M2Chart'
import { YieldCurveChart } from '@/components/charts/YieldCurveChart'
import { BuffettHistoryChart } from '@/components/charts/BuffettChart'
import { SimpleLineChart } from '@/components/charts/SimpleLineChart'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useEffect, useState } from 'react'

export default function DashboardPage() {
  const { m2, yieldCurve, buffett, isLoading } = useAllIndicators()

  const [sahm, setSahm] = useState<any>(null)
  const [housing, setHousing] = useState<any>(null)
  const [pmi, setPmi] = useState<any>(null)
  const [sentiment, setSentiment] = useState<any>(null)
  const [jobless, setJobless] = useState<any>(null)
  const [vix, setVix] = useState<any>(null)
  const [margin, setMargin] = useState<any>(null)
  const [defaults, setDefaults] = useState<any>(null)
  const [rrp, setRrp] = useState<any>(null)

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal

    const fetchWithTimeout = (url: string, timeout = 10000) => {
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
          fetchWithTimeout('/api/indicators/pmi', 5000), // Give PMI more time as it's slower
          fetchWithTimeout('/api/indicators/sentiment'),
          fetchWithTimeout('/api/indicators/jobless'),
          fetchWithTimeout('/api/indicators/vix', 3000),
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
      }
    })()

    return () => controller.abort()
  }, [])

  if (isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-center items-center h-96">
            <LoadingSpinner size="large" />
          </div>
        </div>
      </main>
    )
  }

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
          {vix && (
            <IndicatorCard title="VIX (Fear Gauge)" value={`${vix.current.toFixed(2)}`} subtitle="Higher = more fear">
              <SimpleLineChart data={vix.history} valueLabel="VIX" valueFormatter={(v) => `${v.toFixed(2)}`} refLines={[{ y: 12, color: '#22c55e' }, { y: 20, color: '#f59e0b' }, { y: 30, color: '#dc2626' }]} defaultWindowCount={156} />
            </IndicatorCard>
          )}

          {rrp && (
            <IndicatorCard
              title="Federal Reserve Reverse Repo (ON RRP)"
              value={rrp.current != null ? `$${(rrp.current / 1000).toFixed(2)}T` : ''}
              subtitle="Overnight RRPs outstanding (daily)"
            >
              <SimpleLineChart
                data={rrp.values}
                valueLabel="RRP"
                valueFormatter={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(2)}T` : `$${v.toFixed(0)}B`)}
                defaultWindowCount={2520}
              />
            </IndicatorCard>
          )}

          <IndicatorCard
            title="10Y/2Y Treasury Yield Spread"
            value={yieldCurve.data ? `${yieldCurve.data.spread.toFixed(2)}%` : 'Loading...'}
            subtitle={yieldCurve.data?.interpretation}
            interpretation={yieldCurve.data?.recessionProbability}
            alert={yieldCurve.data?.inverted}
            error={yieldCurve.error as Error | null}
            isLoading={yieldCurve.isLoading}
            freshnessStatus={yieldCurve.data?.validation?.freshness?.status}
            freshnessAge={yieldCurve.data?.validation?.freshness?.formattedAge}
            validationWarnings={yieldCurve.data?.validation?.warnings}
            dataTimestamp={yieldCurve.data?.date10Y}
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

          {sahm && (
            <IndicatorCard
              title="Sahm Rule Recession Indicator"
              value={`${sahm.latest.toFixed(2)}%`}
              subtitle={sahm.interpretation}
              interpretation={sahm.triggered ? 'Triggered (≥ 0.5%)' : 'Not Triggered'}
            >
              <SimpleLineChart data={sahm.history} valueLabel="Sahm" valueFormatter={(v) => `${v.toFixed(2)}%`} refLines={[{ y: 0.5, color: '#dc2626' }]} defaultWindowCount={240} />
            </IndicatorCard>
          )}

          {housing && (
            <IndicatorCard
              title="Housing Starts & Building Permits"
              value={housing.starts?.length ? `${housing.starts[housing.starts.length - 1].value.toFixed(0)}K` : ''}
              subtitle="Monthly"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SimpleLineChart data={housing.starts} valueLabel="Starts" valueFormatter={(v) => `${v.toFixed(0)}K`} defaultWindowCount={240} />
                <SimpleLineChart data={housing.permits} valueLabel="Permits" valueFormatter={(v) => `${v.toFixed(0)}K`} defaultWindowCount={240} />
              </div>
            </IndicatorCard>
          )}

          {pmi && (
            <IndicatorCard title="ISM Manufacturing PMI" value={`${pmi.values[pmi.values.length - 1].value.toFixed(1)}`} subtitle="<50 = contraction">
              <SimpleLineChart
                data={pmi.values}
                valueLabel="PMI"
                valueFormatter={(v) => `${v.toFixed(1)}`}
                refLines={[{ y: 50, color: '#22c55e' }, { y: 48, color: '#f59e0b' }]}
                defaultWindowCount={240}
              />
            </IndicatorCard>
          )}

          {sentiment && (
            <IndicatorCard title="Consumer Sentiment (UMich)" value={`${sentiment.values[sentiment.values.length - 1].value.toFixed(1)}`} subtitle="Monthly">
              <SimpleLineChart data={sentiment.values} valueLabel="Sentiment" valueFormatter={(v) => `${v.toFixed(1)}`} defaultWindowCount={240} />
            </IndicatorCard>
          )}

          {jobless && (
            <IndicatorCard title="Initial Jobless Claims" value={`${jobless.values[jobless.values.length - 1].value.toFixed(0)}`} subtitle="Weekly">
              <SimpleLineChart data={jobless.values} valueLabel="Claims" valueFormatter={(v) => `${v.toFixed(0)}`} defaultWindowCount={260} />
            </IndicatorCard>
          )}

          {margin && (
            <IndicatorCard title="Margin Debt (NYSE)" value={margin.current ? `${margin.current.toFixed(0)}B` : ''} subtitle="Monthly">
              <SimpleLineChart data={margin.values} valueLabel="Margin" valueFormatter={(v) => `${v.toFixed(0)}B`} defaultWindowCount={240} />
            </IndicatorCard>
          )}

          {defaults && (
            <IndicatorCard title="Default Rates" value={''} subtitle="Consumer Delinquency & Credit Card Charge-offs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SimpleLineChart data={defaults.consumerDelinquency} valueLabel="Consumer Delinquency" valueFormatter={(v) => `${v.toFixed(2)}%`} defaultWindowCount={240} />
                <SimpleLineChart data={defaults.creditCardChargeOffs} valueLabel="CC Charge-offs" valueFormatter={(v) => `${v.toFixed(2)}%`} defaultWindowCount={240} />
              </div>
            </IndicatorCard>
          )}

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

        <footer className="mt-12 text-center text-sm text-gray-500 dark:text-gray-400 space-y-2">
          <p>Data sources: Federal Reserve Economic Data (FRED), Yahoo Finance</p>
          <p className="mt-2">
            Treasury yields update hourly • M2/GDP update daily • Use refresh button to force update
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            🟢 Live: {'<'}1h old • 🟡 Delayed: 1-24h old • 🔴 Stale: {'>'}24h old
          </p>
        </footer>
      </div>
    </main>
  )
}
