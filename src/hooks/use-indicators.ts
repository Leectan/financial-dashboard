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
      rmp.isLoading,
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
      rmp.isError,
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
    },
  }
}
