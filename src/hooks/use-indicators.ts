'use client'

import { useQuery, UseQueryResult } from '@tanstack/react-query'

export interface M2Data {
  current: number
  date: string
  historical: Array<{ date: string; value: number }>
  unit: string
  source: string
  lastUpdated: string
}

export interface YieldCurveData {
  spread: number
  treasury10Y: number
  treasury2Y: number
  inverted: boolean
  interpretation: string
  recessionProbability: string
  date10Y: string
  date2Y: string
  calculatedAt: string
  historicalContext: string
  history?: Array<{ date: string; spread: number }>
}

export interface BuffettData {
  ratio: number
  wilshireIndexLevel: number
  gdpBillions: number
  interpretation: string
  wilshireDate: string
  gdpDate: string
  calculatedAt: string
  notes: string[]
  dataFreshness: {
    wilshireAge: number
    gdpAge: number
  }
  history?: Array<{ date: string; ratio: number }>
}

interface APIResponse<T> {
  data: T
  cached: boolean
  lastUpdated: string
}

async function fetchM2(): Promise<M2Data> {
  // Optimize: fetch only last 10 years of M2 data
  const startDate = new Date()
  startDate.setFullYear(startDate.getFullYear() - 10)
  const start = startDate.toISOString().slice(0, 10)

  const response = await fetch(`/api/indicators/m2?start=${start}`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch M2 data')
  const json: APIResponse<M2Data> = await response.json()
  return json.data
}

async function fetchYieldCurve(): Promise<YieldCurveData> {
  // Try fresh first, then fallback to cached route
  const tryOnce = async (fresh: boolean) => {
    // Optimize: fetch only last 10 years of history by default
    const startDate = new Date()
    startDate.setFullYear(startDate.getFullYear() - 10)
    const start = startDate.toISOString().slice(0, 10)
    const url = fresh ? `/api/indicators/treasury?start=${start}&fresh=1` : `/api/indicators/treasury?start=${start}`
    const res = await fetch(url, { cache: 'no-store' })
    // Even if not ok, try to parse JSON, since server may return placeholder payload
    let json: any = null
    try {
      json = await res.json()
    } catch {}
    if (json && json.data) return json.data as YieldCurveData
    if (!res.ok) throw new Error('Failed to fetch yield curve data')
    throw new Error('Invalid yield curve payload')
  }

  try {
    return await tryOnce(true)
  } catch {
    return await tryOnce(false)
  }
}

async function fetchBuffett(): Promise<BuffettData> {
  const response = await fetch('/api/indicators/buffett', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch Buffett indicator data')
  const json: APIResponse<BuffettData> = await response.json()
  return json.data
}

export interface HYSpreadPoint {
  date: string
  spread: number
}

export interface HYSpreadData {
  history: HYSpreadPoint[]
  current: HYSpreadPoint | null
}

async function fetchHYSpread(): Promise<HYSpreadData> {
  const response = await fetch('/api/indicators/hy-spread', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch High-Yield spread data')
  const json: APIResponse<HYSpreadData> = await response.json()
  return json.data
}
export interface QQQDeviationPoint {
  date: string
  price: number
  ma200: number | null
  deviationPct: number | null
  index: number | null
}

export interface QQQDeviationData {
  history: QQQDeviationPoint[]
  current: QQQDeviationPoint | null
}

async function fetchQQQDeviation(): Promise<QQQDeviationData> {
  const response = await fetch('/api/indicators/qqq-deviation', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch QQQ deviation data')
  const json: APIResponse<QQQDeviationData> = await response.json()
  return json.data
}

export interface PutCallPoint {
  date: string
  ratio: number
  smoothed: number | null
  index: number | null
}

export interface PutCallData {
  history: PutCallPoint[]
  current: PutCallPoint | null
  note?: string
}

async function fetchPutCall(): Promise<PutCallData> {
  const response = await fetch('/api/indicators/put-call', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch Put/Call Index')
  const json: APIResponse<PutCallData> = await response.json()
  return json.data
}

export interface FedExpectationsPoint {
  date: string
  targetRate: number | null
  impliedRate: number | null
  easing: number | null
  index: number | null
}

export interface FedExpectationsData {
  history: FedExpectationsPoint[]
  current: FedExpectationsPoint | null
}

async function fetchFedExpectations(): Promise<FedExpectationsData> {
  const response = await fetch('/api/indicators/fed-expectations', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch Fed expectations index')
  const json: APIResponse<FedExpectationsData> = await response.json()
  return json.data
}
export interface LiquidityPoint {
  date: string
  netLiquidity: number
  yoyChange: number | null
  index: number | null
}

export interface LiquidityData {
  history: LiquidityPoint[]
  current: LiquidityPoint | null
}

async function fetchLiquidity(): Promise<LiquidityData> {
  const response = await fetch('/api/indicators/liquidity', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch Liquidity Index')
  const json: APIResponse<LiquidityData> = await response.json()
  return json.data
}

export interface SRFDailyPoint {
  date: string
  accepted: number
  submitted: number
  minimumBidRate: number | null
}

export interface SRFData {
  history: SRFDailyPoint[]
  current: SRFDailyPoint | null
  note: string
  source: string
}

async function fetchSRF(): Promise<SRFData> {
  const response = await fetch('/api/indicators/srf', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch SRF usage data')
  const json: APIResponse<SRFData> = await response.json()
  return json.data
}

export interface RMPPoint {
  date: string
  billsHeldOutright: number
  wowChange: number | null
}

export interface RMPData {
  history: RMPPoint[]
  current: RMPPoint | null
  note: string
  source: string
}

async function fetchRMP(): Promise<RMPData> {
  const response = await fetch('/api/indicators/rmp', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch RMP proxy data')
  const json: APIResponse<RMPData> = await response.json()
  return json.data
}

export interface CorpCreditSpreadPoint {
  date: string
  value: number
}

export interface CorpCreditSpreadSeries {
  current: CorpCreditSpreadPoint | null
  history: CorpCreditSpreadPoint[]
}

export interface CorpCreditData {
  ig: CorpCreditSpreadSeries
  bbb: CorpCreditSpreadSeries
  hy: CorpCreditSpreadSeries
  meta: {
    source: 'FRED'
    asOf: string
  }
}

async function fetchCorpCredit(start: string = '1997-01-01'): Promise<CorpCreditData> {
  const response = await fetch(`/api/indicators/corp-credit?start=${start}`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch Corporate Credit Spreads data')
  const json: APIResponse<CorpCreditData> = await response.json()
  return json.data
}

// Corporate Defaults Proxy (Business Loan Delinquency & Charge-Offs)
export interface CorpDefaultsPoint {
  date: string
  value: number
}

export interface CorpDefaultsData {
  delinquency: CorpDefaultsPoint[]
  chargeOffs: CorpDefaultsPoint[]
  currentDelinquency: number | null
  currentChargeOffs: number | null
  meta: {
    source: 'FRED'
    note: string
    delinquencySeries: string
    chargeOffsSeries: string
  }
}

async function fetchCorpDefaults(start: string = '1990-01-01'): Promise<CorpDefaultsData> {
  const response = await fetch(`/api/indicators/corp-defaults?start=${start}`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch Corporate Defaults proxy data')
  const json: APIResponse<CorpDefaultsData> = await response.json()
  return json.data
}

// Transportation Services Index (TSI)
export interface TSIPoint {
  date: string
  value: number
}

export interface TSIData {
  values: TSIPoint[]
  current: number | null
  date: string | null
  unit: string
  source: string
}

async function fetchTSI(start: string = '2000-01-01'): Promise<TSIData> {
  const response = await fetch(`/api/indicators/tsi?start=${start}`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch TSI data')
  const json: APIResponse<TSIData> = await response.json()
  return json.data
}

export interface VIXPoint {
  date: string
  value: number
}

export interface VIXData {
  current: number
  date: string
  history: VIXPoint[]
}

async function fetchVIX(): Promise<VIXData> {
  const response = await fetch('/api/indicators/vix', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch VIX data')
  const json: APIResponse<VIXData> = await response.json()
  return json.data
}

export interface SimpleSeriesPoint {
  date: string
  value: number
}

export interface SahmData {
  latest: number
  date: string
  triggered: boolean
  interpretation: string
  history: SimpleSeriesPoint[]
}

async function fetchSahm(): Promise<SahmData> {
  const response = await fetch('/api/indicators/sahm', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch Sahm Rule')
  const json: APIResponse<SahmData> = await response.json()
  return json.data
}

export interface HousingData {
  starts: SimpleSeriesPoint[]
  permits: SimpleSeriesPoint[]
}

async function fetchHousing(): Promise<HousingData> {
  const response = await fetch('/api/indicators/housing', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch housing data')
  const json: APIResponse<HousingData> = await response.json()
  return json.data
}

export interface PMIData {
  values: SimpleSeriesPoint[]
}

async function fetchPMI(): Promise<PMIData> {
  const response = await fetch('/api/indicators/pmi', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch PMI')
  const json: APIResponse<PMIData> = await response.json()
  return json.data
}

export interface SentimentData {
  values: SimpleSeriesPoint[]
}

async function fetchSentiment(): Promise<SentimentData> {
  const response = await fetch('/api/indicators/sentiment', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch sentiment')
  const json: APIResponse<SentimentData> = await response.json()
  return json.data
}

export interface JoblessData {
  values: SimpleSeriesPoint[]
}

async function fetchJobless(): Promise<JoblessData> {
  const response = await fetch('/api/indicators/jobless', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch jobless claims')
  const json: APIResponse<JoblessData> = await response.json()
  return json.data
}

export interface DefaultsData {
  consumerDelinquency: SimpleSeriesPoint[]
  creditCardChargeOffs: SimpleSeriesPoint[]
}

async function fetchDefaults(): Promise<DefaultsData> {
  const response = await fetch('/api/indicators/defaults', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch defaults')
  const json: APIResponse<DefaultsData> = await response.json()
  return json.data
}

export interface MarginPoint {
  date: string
  value: number
}

export interface MarginData {
  current: number | null
  date: string | null
  values: MarginPoint[]
  source: string
  unit: string
}

async function fetchMargin(): Promise<MarginData> {
  const response = await fetch('/api/indicators/margin', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch margin debt')
  const json: APIResponse<MarginData> = await response.json()
  return json.data
}

export interface RRPPoint {
  date: string
  value: number
}

export interface RRPData {
  current: number | null
  date: string | null
  values: RRPPoint[]
}

async function fetchRRP(): Promise<RRPData> {
  const response = await fetch('/api/indicators/rrp', { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch Reverse Repo (RRP)')
  const json: APIResponse<RRPData> = await response.json()
  return json.data
}

// Forward P/E (public series scrape)
export interface ForwardPEPoint {
  date: string
  value: number
}

export interface ForwardPEData {
  current: number | null
  date: string | null
  values: ForwardPEPoint[]
  unit: string
  source: string
  notes: string[]
}

async function fetchForwardPE(start: string = '2009-01-01'): Promise<ForwardPEData> {
  const response = await fetch(`/api/indicators/forward-pe?start=${start}`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to fetch Forward P/E')
  const json: APIResponse<ForwardPEData> = await response.json()
  return json.data
}

// All queries use longer staleTime (30 min) and retry with exponential backoff
// because Vercel cold starts + FRED API can take 20-35 seconds
const STALE_TIME = 30 * 60 * 1000 // 30 minutes
const RETRY_DELAY = (attemptIndex: number) => Math.min(2000 * 2 ** attemptIndex, 30000)

export function useM2(): UseQueryResult<M2Data> {
  const startDate = new Date()
  startDate.setFullYear(startDate.getFullYear() - 10)
  const start = startDate.toISOString().slice(0, 10)

  return useQuery({
    queryKey: ['indicator', 'm2', start],
    queryFn: fetchM2,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useYieldCurve(): UseQueryResult<YieldCurveData> {
  const startDate = new Date()
  startDate.setFullYear(startDate.getFullYear() - 10)
  const start = startDate.toISOString().slice(0, 10)

  return useQuery({
    queryKey: ['indicator', 'yield-curve', start],
    queryFn: fetchYieldCurve,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useBuffett(): UseQueryResult<BuffettData> {
  return useQuery({
    queryKey: ['indicator', 'buffett'],
    queryFn: fetchBuffett,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useQQQDeviation(): UseQueryResult<QQQDeviationData> {
  return useQuery({
    queryKey: ['indicator', 'qqq-deviation'],
    queryFn: fetchQQQDeviation,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useHYSpread(): UseQueryResult<HYSpreadData> {
  return useQuery({
    queryKey: ['indicator', 'hy-spread'],
    queryFn: fetchHYSpread,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function usePutCallIndex(): UseQueryResult<PutCallData> {
  return useQuery({
    queryKey: ['indicator', 'put-call'],
    queryFn: fetchPutCall,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useFedExpectations(): UseQueryResult<FedExpectationsData> {
  return useQuery({
    queryKey: ['indicator', 'fed-expectations'],
    queryFn: fetchFedExpectations,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useLiquidity(): UseQueryResult<LiquidityData> {
  return useQuery({
    queryKey: ['indicator', 'liquidity'],
    queryFn: fetchLiquidity,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useSRF(): UseQueryResult<SRFData> {
  return useQuery({
    queryKey: ['indicator', 'srf'],
    queryFn: fetchSRF,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useRMP(): UseQueryResult<RMPData> {
  return useQuery({
    queryKey: ['indicator', 'rmp'],
    queryFn: fetchRMP,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useCorpCredit(start: string = '1997-01-01'): UseQueryResult<CorpCreditData> {
  return useQuery({
    queryKey: ['indicator', 'corp-credit', start],
    queryFn: () => fetchCorpCredit(start),
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useCorpDefaults(start: string = '1990-01-01'): UseQueryResult<CorpDefaultsData> {
  return useQuery({
    queryKey: ['indicator', 'corp-defaults', start],
    queryFn: () => fetchCorpDefaults(start),
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useTSI(start: string = '2000-01-01'): UseQueryResult<TSIData> {
  return useQuery({
    queryKey: ['indicator', 'tsi', start],
    queryFn: () => fetchTSI(start),
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useVIX(): UseQueryResult<VIXData> {
  return useQuery({
    queryKey: ['indicator', 'vix'],
    queryFn: fetchVIX,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useSahm(): UseQueryResult<SahmData> {
  return useQuery({
    queryKey: ['indicator', 'sahm'],
    queryFn: fetchSahm,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useHousing(): UseQueryResult<HousingData> {
  return useQuery({
    queryKey: ['indicator', 'housing'],
    queryFn: fetchHousing,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function usePMI(): UseQueryResult<PMIData> {
  return useQuery({
    queryKey: ['indicator', 'pmi'],
    queryFn: fetchPMI,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useSentiment(): UseQueryResult<SentimentData> {
  return useQuery({
    queryKey: ['indicator', 'sentiment'],
    queryFn: fetchSentiment,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useJobless(): UseQueryResult<JoblessData> {
  return useQuery({
    queryKey: ['indicator', 'jobless'],
    queryFn: fetchJobless,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useDefaults(): UseQueryResult<DefaultsData> {
  return useQuery({
    queryKey: ['indicator', 'defaults'],
    queryFn: fetchDefaults,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useMargin(): UseQueryResult<MarginData> {
  return useQuery({
    queryKey: ['indicator', 'margin'],
    queryFn: fetchMargin,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useRRP(): UseQueryResult<RRPData> {
  return useQuery({
    queryKey: ['indicator', 'rrp'],
    queryFn: fetchRRP,
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useForwardPE(start: string = '2009-01-01'): UseQueryResult<ForwardPEData> {
  return useQuery({
    queryKey: ['indicator', 'forward-pe', start],
    queryFn: () => fetchForwardPE(start),
    staleTime: STALE_TIME,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: RETRY_DELAY,
  })
}

export function useAllIndicators() {
  const m2 = useM2()
  const yieldCurve = useYieldCurve()
  const buffett = useBuffett()
  const qqqDeviation = useQQQDeviation()
  const hySpread = useHYSpread()
  const putCall = usePutCallIndex()
  const fedExpectations = useFedExpectations()
  const liquidity = useLiquidity()
  const srf = useSRF()
  const rmp = useRMP()
  const corpCredit = useCorpCredit()
  const corpDefaults = useCorpDefaults()
  const tsi = useTSI()
  const vix = useVIX()
  const sahm = useSahm()
  const housing = useHousing()
  const pmi = usePMI()
  const sentiment = useSentiment()
  const jobless = useJobless()
  const defaults = useDefaults()
  const margin = useMargin()
  const rrp = useRRP()
  const forwardPE = useForwardPE()

  return {
    m2,
    yieldCurve,
    buffett,
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
    forwardPE,
    isLoading:
      m2.isLoading ||
      yieldCurve.isLoading ||
      buffett.isLoading ||
      qqqDeviation.isLoading ||
      hySpread.isLoading ||
      putCall.isLoading ||
      fedExpectations.isLoading ||
      liquidity.isLoading ||
      srf.isLoading ||
      rmp.isLoading ||
      corpCredit.isLoading ||
      corpDefaults.isLoading ||
      tsi.isLoading ||
      vix.isLoading ||
      sahm.isLoading ||
      housing.isLoading ||
      pmi.isLoading ||
      sentiment.isLoading ||
      jobless.isLoading ||
      defaults.isLoading ||
      margin.isLoading ||
      rrp.isLoading ||
      forwardPE.isLoading,
    isError:
      m2.isError ||
      yieldCurve.isError ||
      buffett.isError ||
      qqqDeviation.isError ||
      hySpread.isError ||
      putCall.isError ||
      fedExpectations.isError ||
      liquidity.isError ||
      srf.isError ||
      rmp.isError ||
      corpCredit.isError ||
      corpDefaults.isError ||
      tsi.isError ||
      vix.isError ||
      sahm.isError ||
      housing.isError ||
      pmi.isError ||
      sentiment.isError ||
      jobless.isError ||
      defaults.isError ||
      margin.isError ||
      rrp.isError ||
      forwardPE.isError,
    errors: {
      m2: m2.error,
      yieldCurve: yieldCurve.error,
      buffett: buffett.error,
      hySpread: hySpread.error,
      putCall: putCall.error,
      fedExpectations: fedExpectations.error,
      qqqDeviation: qqqDeviation.error,
      liquidity: liquidity.error,
      srf: srf.error,
      rmp: rmp.error,
      corpCredit: corpCredit.error,
      corpDefaults: corpDefaults.error,
      tsi: tsi.error,
      vix: vix.error,
      sahm: sahm.error,
      housing: housing.error,
      pmi: pmi.error,
      sentiment: sentiment.error,
      jobless: jobless.error,
      defaults: defaults.error,
      margin: margin.error,
      rrp: rrp.error,
      forwardPE: forwardPE.error,
    },
  }
}
