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

  useEffect(() => {
    ;(async () => {
      try {
        const [sahmRes, housingRes, pmiRes, sentimentRes, joblessRes, vixRes] = await Promise.all([
          fetch('/api/indicators/sahm').then((r) => r.json()),
          fetch('/api/indicators/housing').then((r) => r.json()),
          fetch('/api/indicators/pmi').then((r) => r.json()),
          fetch('/api/indicators/sentiment').then((r) => r.json()),
          fetch('/api/indicators/jobless').then((r) => r.json()),
          fetch('/api/indicators/vix').then((r) => r.json()),
        ])
        setSahm(sahmRes.data)
        setHousing(housingRes.data)
        setPmi(pmiRes.data)
        setSentiment(sentimentRes.data)
        setJobless(joblessRes.data)
        setVix(vixRes.data)
      } catch {}
    })()
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

          {vix && (
            <IndicatorCard title="VIX (Fear Gauge)" value={`${vix.current.toFixed(2)}`} subtitle="Higher = more fear">
              <SimpleLineChart data={vix.history} valueLabel="VIX" valueFormatter={(v) => `${v.toFixed(2)}`} refLines={[{ y: 12, color: '#22c55e' }, { y: 20, color: '#f59e0b' }, { y: 30, color: '#dc2626' }]} defaultWindowCount={156} />
            </IndicatorCard>
          )}
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
