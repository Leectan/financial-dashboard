import { fredAPI } from '@/lib/api-clients/fred'
import { yahooFinanceClient } from '@/lib/api-clients/yahoo-finance'

export type SeriesPoint = { date: string; value: number }

export type BofaBullBearComponentId =
  | 'hedge_fund_positioning'
  | 'equity_flow'
  | 'bond_flow'
  | 'credit_market_technicals'
  | 'global_stock_breadth'
  | 'fms_positioning'

export type BofaBullBearSentiment = 'V Bullish' | 'Bullish' | 'Neutral' | 'Bearish' | 'V Bearish' | 'N/A'

export type BofaBullBearComponent = {
  id: BofaBullBearComponentId
  name: string
  percentile: number | null
  sentiment: BofaBullBearSentiment
  /** Percentile series (0-100), BofA-table style */
  series: SeriesPoint[]
  source: string
  note?: string
}

export type BofaBullBearProxyData = {
  asOf: string
  components: BofaBullBearComponent[]
  notes: string[]
}

function percentileIndex(values: number[], value: number): number {
  if (!values.length) return 50
  const sorted = [...values].sort((a, b) => a - b)
  let count = 0
  for (const v of sorted) {
    if (v <= value) count++
    else break
  }
  const pct = (count - 1) / (sorted.length - 1 || 1)
  return Math.min(100, Math.max(0, pct * 100))
}

function toSentiment(p: number | null): BofaBullBearSentiment {
  if (p == null || !Number.isFinite(p)) return 'N/A'
  if (p >= 85) return 'V Bullish'
  if (p >= 60) return 'Bullish'
  if (p >= 40) return 'Neutral'
  if (p >= 15) return 'Bearish'
  return 'V Bearish'
}

async function fetchCftcTffSeries(contractCode: string, startISO: string): Promise<any[]> {
  // CFTC Public Reporting (Socrata) - COT TFF Futures Only dataset (gpe5-46if)
  // https://publicreporting.cftc.gov/stories/s/TFF-Futures/98ig-3k9y/
  const base = 'https://publicreporting.cftc.gov/resource/gpe5-46if.json'
  const where = `cftc_contract_market_code='${contractCode}' AND report_date_as_yyyy_mm_dd >= '${startISO}T00:00:00.000'`
  const url = `${base}?$where=${encodeURIComponent(where)}&$order=report_date_as_yyyy_mm_dd ASC&$limit=5000`
  const res = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' })
  if (!res.ok) throw new Error(`CFTC TFF HTTP ${res.status}`)
  return (await res.json()) as any[]
}

function buildPercentileSeries(points: SeriesPoint[], invert = false): SeriesPoint[] {
  const vals = points.map((p) => p.value).filter((v) => Number.isFinite(v))
  if (!vals.length) return []
  return points.map((p) => {
    const pct = percentileIndex(vals, p.value)
    const v = invert ? 100 - pct : pct
    return { date: p.date, value: v }
  })
}

async function computeHedgeFundPositioning(startISO: string): Promise<{ series: SeriesPoint[]; source: string }> {
  // Use E-mini S&P 500 futures (CFTC code 13874A) leveraged money net % of open interest.
  const rows = await fetchCftcTffSeries('13874A', startISO)
  const series: SeriesPoint[] = []
  for (const r of rows) {
    const dateRaw: string | undefined = r?.report_date_as_yyyy_mm_dd
    const date = typeof dateRaw === 'string' ? dateRaw.slice(0, 10) : null
    const oi = Number(r?.open_interest_all)
    const long = Number(r?.lev_money_positions_long)
    const short = Number(r?.lev_money_positions_short)
    if (!date || !Number.isFinite(oi) || !Number.isFinite(long) || !Number.isFinite(short) || oi <= 0) continue
    const netPctOI = ((long - short) / oi) * 100
    series.push({ date, value: netPctOI })
  }
  return { series, source: 'CFTC Public Reporting (COT TFF FutOnly, Leveraged Money net %OI, E-mini S&P 500)' }
}

async function computeFmsPositioningProxy(startISO: string): Promise<{ series: SeriesPoint[]; source: string; note: string }> {
  // Proxy BofA Fund Manager Survey positioning with Asset Manager net % OI in E-mini S&P 500.
  const rows = await fetchCftcTffSeries('13874A', startISO)
  const series: SeriesPoint[] = []
  for (const r of rows) {
    const dateRaw: string | undefined = r?.report_date_as_yyyy_mm_dd
    const date = typeof dateRaw === 'string' ? dateRaw.slice(0, 10) : null
    const oi = Number(r?.open_interest_all)
    const long = Number(r?.asset_mgr_positions_long)
    const short = Number(r?.asset_mgr_positions_short)
    if (!date || !Number.isFinite(oi) || !Number.isFinite(long) || !Number.isFinite(short) || oi <= 0) continue
    const netPctOI = ((long - short) / oi) * 100
    series.push({ date, value: netPctOI })
  }
  return {
    series,
    source: 'CFTC Public Reporting (COT TFF FutOnly, Asset Manager net %OI, E-mini S&P 500)',
    note: 'Proxy: BofA Fund Manager Survey is proprietary; using CFTC Asset Manager positioning as a free, auditable proxy.',
  }
}

async function computeEquityFlowProxy(fresh: boolean): Promise<{ series: SeriesPoint[]; source: string; note: string }> {
  // Free flow data like EPFR/Lipper is generally paid; proxy with SPY 12-week momentum.
  const hist = await yahooFinanceClient.getSymbolHistory('SPY', '10y', '1wk', fresh)
  const pts = [...hist].sort((a, b) => a.date.localeCompare(b.date))
  const series: SeriesPoint[] = []
  const lookback = 12
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (!p) continue
    if (i < lookback) continue
    const prev = pts[i - lookback]
    if (!prev) continue
    const ret = ((p.price - prev.price) / prev.price) * 100
    series.push({ date: p.date, value: ret })
  }
  return {
    series,
    source: 'Yahoo Finance (SPY, 12-week momentum proxy)',
    note: 'Proxy: true EPFR/Lipper equity fund flow series are typically paywalled; using SPY 12-week return as a rough risk-on “flow-like” proxy.',
  }
}

async function computeBondFlowProxy(fresh: boolean): Promise<{ series: SeriesPoint[]; source: string; note: string }> {
  // Proxy bond flows with TLT 12-week momentum.
  const hist = await yahooFinanceClient.getSymbolHistory('TLT', '10y', '1wk', fresh)
  const pts = [...hist].sort((a, b) => a.date.localeCompare(b.date))
  const series: SeriesPoint[] = []
  const lookback = 12
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (!p) continue
    if (i < lookback) continue
    const prev = pts[i - lookback]
    if (!prev) continue
    const ret = ((p.price - prev.price) / prev.price) * 100
    series.push({ date: p.date, value: ret })
  }
  return {
    series,
    source: 'Yahoo Finance (TLT, 12-week momentum proxy)',
    note: 'Proxy: true EPFR/Lipper bond fund flow series are typically paywalled; using TLT 12-week return as a rough bond-demand “flow-like” proxy.',
  }
}

async function computeCreditMarketTechnicals(startISO: string, fresh: boolean): Promise<{ series: SeriesPoint[]; source: string; note: string; invert: boolean }> {
  // Proxy credit technicals with HY OAS level; tighter spreads = more bullish, so we invert percentile.
  const raw = await fredAPI.getSeriesFromStart('BAMLH0A0HYM2', startISO, fresh)
  const series = raw
    .map((o) => ({ date: o.date, value: parseFloat(o.value) }))
    .filter((p) => !Number.isNaN(p.value))
    .sort((a, b) => a.date.localeCompare(b.date))
  return {
    series,
    source: 'FRED (BAMLH0A0HYM2)',
    note: 'Proxy: BofA “Credit Market Technicals” blends multiple internals; we approximate with HY OAS tightness (tighter spreads = more bullish).',
    invert: true,
  }
}

async function computeGlobalBreadthProxy(fresh: boolean): Promise<{ series: SeriesPoint[]; source: string; note: string }> {
  // Proxy global breadth with ACWI 200-day deviation (higher = broader/risk-on).
  const hist = await yahooFinanceClient.getSymbolHistory('ACWI', '10y', '1d', fresh)
  const pts = [...hist].sort((a, b) => a.date.localeCompare(b.date))
  const window = 200
  const series: SeriesPoint[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (!p) continue
    if (i < window - 1) continue
    let sum = 0
    for (let j = i - window + 1; j <= i; j++) {
      const pj = pts[j]
      if (!pj) continue
      sum += pj.price
    }
    const ma = sum / window
    const dev = ((p.price - ma) / ma) * 100
    series.push({ date: p.date, value: dev })
  }
  return {
    series,
    source: 'Yahoo Finance (ACWI, 200D deviation proxy)',
    note: 'Proxy: true “global breadth” (% of stocks above trend) requires paid constituent data; we approximate with ACWI vs its 200-day average.',
  }
}

export async function computeBofaBullBearProxy(startISO: string, fresh: boolean): Promise<BofaBullBearProxyData> {
  const [hedgeFund, fms, equityFlow, bondFlow, credit, breadth] = await Promise.all([
    computeHedgeFundPositioning(startISO),
    computeFmsPositioningProxy(startISO),
    computeEquityFlowProxy(fresh),
    computeBondFlowProxy(fresh),
    computeCreditMarketTechnicals(startISO, fresh),
    computeGlobalBreadthProxy(fresh),
  ])

  // Convert to percentile series (0-100) to match BofA table style.
  const hfPct = buildPercentileSeries(hedgeFund.series)
  const fmsPct = buildPercentileSeries(fms.series)
  const eqPct = buildPercentileSeries(equityFlow.series)
  const bondPct = buildPercentileSeries(bondFlow.series)
  const creditPct = buildPercentileSeries(credit.series, credit.invert)
  const breadthPct = buildPercentileSeries(breadth.series)

  const latestDate =
    [hfPct.at(-1)?.date, eqPct.at(-1)?.date, bondPct.at(-1)?.date, creditPct.at(-1)?.date, breadthPct.at(-1)?.date, fmsPct.at(-1)?.date]
      .filter(Boolean)
      .sort()
      .at(-1) ?? new Date().toISOString().slice(0, 10)

  const components: BofaBullBearComponent[] = [
    {
      id: 'hedge_fund_positioning',
      name: 'Hedge Fund Positioning',
      percentile: hfPct.at(-1)?.value ?? null,
      sentiment: toSentiment(hfPct.at(-1)?.value ?? null),
      series: hfPct,
      source: hedgeFund.source,
    },
    {
      id: 'equity_flow',
      name: 'Equity Flow',
      percentile: eqPct.at(-1)?.value ?? null,
      sentiment: toSentiment(eqPct.at(-1)?.value ?? null),
      series: eqPct,
      source: equityFlow.source,
      note: equityFlow.note,
    },
    {
      id: 'bond_flow',
      name: 'Bond Flow',
      percentile: bondPct.at(-1)?.value ?? null,
      sentiment: toSentiment(bondPct.at(-1)?.value ?? null),
      series: bondPct,
      source: bondFlow.source,
      note: bondFlow.note,
    },
    {
      id: 'credit_market_technicals',
      name: 'Credit Market Technicals',
      percentile: creditPct.at(-1)?.value ?? null,
      sentiment: toSentiment(creditPct.at(-1)?.value ?? null),
      series: creditPct,
      source: credit.source,
      note: credit.note,
    },
    {
      id: 'global_stock_breadth',
      name: 'Global Stock Index Breadth',
      percentile: breadthPct.at(-1)?.value ?? null,
      sentiment: toSentiment(breadthPct.at(-1)?.value ?? null),
      series: breadthPct,
      source: breadth.source,
      note: breadth.note,
    },
    {
      id: 'fms_positioning',
      name: 'FMS Positioning',
      percentile: fmsPct.at(-1)?.value ?? null,
      sentiment: toSentiment(fmsPct.at(-1)?.value ?? null),
      series: fmsPct,
      source: fms.source,
      note: fms.note,
    },
  ]

  return {
    asOf: latestDate,
    components,
    notes: [
      'This mirrors the structure of the BofA Bull & Bear indicator table. Several components use free proxies because the original sources (EPFR, Lipper, BofA FMS) are typically paywalled.',
      'Each component is converted into a 0–100 percentile score to match the BofA table style.',
    ],
  }
}

