import { yahooFinanceClient } from '@/lib/api-clients/yahoo-finance'
import { fetchIsharesFundHistoricalFromProductPage } from '@/lib/api-clients/ishares'
import { fetchNaaimExposureHistory } from '@/lib/api-clients/naaim'

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
  // Best free "manager positioning" proxy: NAAIM Exposure Index (weekly), published by NAAIM as a public XLSX.
  // Fallback: CFTC Asset Manager net %OI (also free, weekly) in case NAAIM fetch/parsing fails.
  try {
    const naaim = await fetchNaaimExposureHistory()
    const series: SeriesPoint[] = naaim.values
      .filter((p) => p.date >= startISO && Number.isFinite(p.value))
      .map((p) => ({ date: p.date, value: p.value }))
    if (series.length > 0) {
      return {
        series,
        source: `NAAIM Exposure Index (weekly, public XLSX)`,
        note: `Source file: ${naaim.sourceUrl}. Proxy: BofA FMS is proprietary; NAAIM is a free, widely used active-manager exposure gauge.`,
      }
    }
  } catch (e) {
    // fall through to CFTC
  }

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
    note: 'Fallback proxy: using CFTC Asset Manager positioning when NAAIM fetch is unavailable.',
  }
}

async function computeEquityFlowProxy(startISO: string, fresh: boolean): Promise<{ series: SeriesPoint[]; source: string; note: string }> {
  // Best free/near-real-time "flow" proxy: ETF creations/redemptions via shares outstanding changes.
  // iShares publishes an auditable daily Historical sheet in its “Data Download” XLS (SpreadsheetML).
  const hist = await fetchIsharesFundHistoricalFromProductPage(
    'https://www.ishares.com/us/products/239726/ishares-core-sp-500-etf',
  )
  const series: SeriesPoint[] = []
  for (let i = 1; i < hist.length; i++) {
    const prev = hist[i - 1]
    const cur = hist[i]
    const prevShares = prev?.sharesOutstanding
    const curShares = cur?.sharesOutstanding
    if (!cur?.date || !Number.isFinite(prevShares) || !Number.isFinite(curShares) || prevShares! <= 0) continue
    if (cur.date < startISO) continue
    const pct = ((curShares! - prevShares!) / prevShares!) * 100
    series.push({ date: cur.date, value: pct })
  }
  return {
    series,
    source: 'iShares (IVV Data Download → Historical → Shares Outstanding Δ% daily)',
    note: 'Using daily % change in shares outstanding as a proxy for equity fund flows (ETF creations/redemptions). Positive = net inflows; negative = net outflows.',
  }
}

async function computeBondFlowProxy(startISO: string, fresh: boolean): Promise<{ series: SeriesPoint[]; source: string; note: string }> {
  const hist = await fetchIsharesFundHistoricalFromProductPage(
    'https://www.ishares.com/us/products/239458/ishares-core-us-aggregate-bond-etf',
  )
  const series: SeriesPoint[] = []
  for (let i = 1; i < hist.length; i++) {
    const prev = hist[i - 1]
    const cur = hist[i]
    const prevShares = prev?.sharesOutstanding
    const curShares = cur?.sharesOutstanding
    if (!cur?.date || !Number.isFinite(prevShares) || !Number.isFinite(curShares) || prevShares! <= 0) continue
    if (cur.date < startISO) continue
    const pct = ((curShares! - prevShares!) / prevShares!) * 100
    series.push({ date: cur.date, value: pct })
  }
  return {
    series,
    source: 'iShares (AGG Data Download → Historical → Shares Outstanding Δ% daily)',
    note: 'Using daily % change in shares outstanding as a proxy for bond fund flows (ETF creations/redemptions). Positive = net inflows; negative = net outflows.',
  }
}

async function computeCreditMarketTechnicals(startISO: string, fresh: boolean): Promise<{ series: SeriesPoint[]; source: string; note: string; invert: boolean }> {
  // Best free/near-real-time "credit technicals" proxy: high-yield ETF share creations/redemptions.
  const hist = await fetchIsharesFundHistoricalFromProductPage(
    'https://www.ishares.com/us/products/239565/ishares-iboxx-high-yield-corporate-bond-etf',
  )
  const series: SeriesPoint[] = []
  for (let i = 1; i < hist.length; i++) {
    const prev = hist[i - 1]
    const cur = hist[i]
    const prevShares = prev?.sharesOutstanding
    const curShares = cur?.sharesOutstanding
    if (!cur?.date || !Number.isFinite(prevShares) || !Number.isFinite(curShares) || prevShares! <= 0) continue
    if (cur.date < startISO) continue
    const pct = ((curShares! - prevShares!) / prevShares!) * 100
    series.push({ date: cur.date, value: pct })
  }
  return {
    series,
    source: 'iShares (HYG Data Download → Historical → Shares Outstanding Δ% daily)',
    note: 'Using daily % change in shares outstanding as a proxy for high-yield credit “technical” demand (ETF creations/redemptions). Positive = net inflows; negative = net outflows.',
    invert: false,
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
    computeEquityFlowProxy(startISO, fresh),
    computeBondFlowProxy(startISO, fresh),
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
      'This mirrors the structure of the BofA Bull & Bear indicator table, but uses only free/public sources.',
      'Equity/Bond/Credit “flow/technical” components use ETF shares outstanding changes (creation/redemption activity) from iShares fund Data Download files.',
      'Each component is converted into a 0–100 percentile score to match the BofA table style.',
    ],
  }
}

