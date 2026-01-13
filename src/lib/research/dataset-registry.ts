/**
 * Dataset Registry - Canonical metadata for all series used in regime signals
 *
 * Each entry describes:
 * - Source and fetcher location
 * - Frequency and alignment rules
 * - Known publication lags
 * - Realistic start dates
 */

import type { DatasetMetadata } from './types'

export const DATASET_REGISTRY: Record<string, DatasetMetadata> = {
  // =========================================================================
  // Equity Valuation (Forward Estimates)
  // =========================================================================
  forward_pe: {
    id: 'forward_pe',
    name: 'S&P 500 Forward P/E',
    source: 'PublicWeb',
    frequency: 'daily',
    asOfRule: 'lastKnown',
    knownLagDays: 0, // scraped from a public page; treat as current when updated
    units: 'P/E',
    startDate: '2009-05-01',
    notes: 'Forward P/E for US stocks (S&P 500 proxy) scraped from Trendonify public series.',
  },

  // =========================================================================
  // Credit Stress Indicators
  // =========================================================================
  hy_oas: {
    id: 'hy_oas',
    name: 'High-Yield OAS',
    source: 'FRED',
    frequency: 'daily',
    asOfRule: 'lastKnown',
    knownLagDays: 1, // T+1 close
    units: 'percent',
    startDate: '1996-12-31',
    notes: 'ICE BofA US High Yield Index OAS (BAMLH0A0HYM2)',
  },

  ig_oas: {
    id: 'ig_oas',
    name: 'Investment Grade OAS',
    source: 'FRED',
    frequency: 'daily',
    asOfRule: 'lastKnown',
    knownLagDays: 1,
    units: 'percent',
    startDate: '1996-12-31',
    notes: 'ICE BofA US Corporate Index OAS (BAMLC0A0CM)',
  },

  bbb_oas: {
    id: 'bbb_oas',
    name: 'BBB OAS',
    source: 'FRED',
    frequency: 'daily',
    asOfRule: 'lastKnown',
    knownLagDays: 1,
    units: 'percent',
    startDate: '1996-12-31',
    notes: 'ICE BofA BBB US Corporate Index OAS (BAMLC0A4CBBB)',
  },

  // =========================================================================
  // Volatility
  // =========================================================================
  vix: {
    id: 'vix',
    name: 'VIX',
    source: 'FRED',
    frequency: 'daily',
    asOfRule: 'lastKnown',
    knownLagDays: 1,
    units: 'index',
    startDate: '1990-01-02',
    notes: 'CBOE Volatility Index (VIXCLS)',
  },

  // =========================================================================
  // Yield Curve
  // =========================================================================
  yield_curve_spread: {
    id: 'yield_curve_spread',
    name: '10Y-2Y Treasury Spread',
    source: 'FRED',
    frequency: 'daily',
    asOfRule: 'lastKnown',
    knownLagDays: 1,
    units: 'percent',
    startDate: '1976-06-01',
    notes: 'T10Y2Y or computed from DGS10 - DGS2',
  },

  // =========================================================================
  // Liquidity / Fed Balance Sheet
  // =========================================================================
  net_liquidity: {
    id: 'net_liquidity',
    name: 'Net Liquidity',
    source: 'FRED',
    frequency: 'weekly',
    asOfRule: 'lastKnown',
    knownLagDays: 7, // Weekly release, can be delayed
    units: 'billions USD',
    startDate: '2003-01-01',
    notes: 'WALCL - TGA - ON RRP; aligned by as-of dates',
  },

  rrp: {
    id: 'rrp',
    name: 'Overnight Reverse Repo',
    source: 'FRED',
    frequency: 'daily',
    asOfRule: 'lastKnown',
    knownLagDays: 1,
    units: 'billions USD',
    startDate: '2013-09-23',
    notes: 'RRPONTSYD',
  },

  // =========================================================================
  // Funding Stress (Modern Era)
  // =========================================================================
  srf_accepted: {
    id: 'srf_accepted',
    name: 'SRF Accepted Amount',
    source: 'NYFedMarkets',
    frequency: 'daily',
    asOfRule: 'lastKnown',
    knownLagDays: 0, // Near real-time
    units: 'billions USD',
    startDate: '2021-07-28', // SRF launched
    notes: 'Standing Repo Facility accepted amounts',
  },

  rmp_bills: {
    id: 'rmp_bills',
    name: 'SOMA Treasury Bills Held',
    source: 'NYFedMarkets',
    frequency: 'weekly',
    asOfRule: 'lastKnown',
    knownLagDays: 3,
    units: 'billions USD',
    startDate: '2014-01-01',
    notes: 'RMP proxy - SOMA Treasury bills held outright',
  },

  // =========================================================================
  // Recession Indicator (for backtesting labels)
  // =========================================================================
  recession: {
    id: 'recession',
    name: 'NBER Recession Indicator',
    source: 'FRED',
    frequency: 'monthly',
    asOfRule: 'lastKnown',
    knownLagDays: 30, // NBER announces with significant lag
    units: 'binary (0/1)',
    startDate: '1854-12-01',
    notes: 'USREC - 1 during recession, 0 otherwise. Dated ex-post.',
  },

  // =========================================================================
  // Equity Markets
  // =========================================================================
  sp500: {
    id: 'sp500',
    name: 'S&P 500',
    source: 'FRED',
    frequency: 'daily',
    asOfRule: 'lastKnown',
    knownLagDays: 1,
    units: 'index level',
    startDate: '1950-01-03',
    notes: 'S&P 500 index level (SP500)',
  },

  // =========================================================================
  // Real-Economy / Cyclical Indicators
  // =========================================================================
  heavy_truck_sales: {
    id: 'heavy_truck_sales',
    name: 'Heavy Weight Truck Sales',
    source: 'FRED',
    frequency: 'monthly',
    asOfRule: 'lastKnown',
    knownLagDays: 30, // monthly release timing varies; treat as ~1 month lag for no-lookahead
    units: 'millions of units (SAAR)',
    startDate: '1967-01-01',
    notes: 'Motor Vehicle Retail Sales: Heavy Weight Trucks (HTRUCKSSAAR)',
  },

  // =========================================================================
  // Sentiment / Economic Indicators
  // =========================================================================
  consumer_sentiment: {
    id: 'consumer_sentiment',
    name: 'Consumer Sentiment',
    source: 'FRED',
    frequency: 'monthly',
    asOfRule: 'lastKnown',
    knownLagDays: 14, // Released mid-month
    units: 'index',
    startDate: '1952-11-01',
    notes: 'University of Michigan Consumer Sentiment (UMCSENT)',
  },

  pmi: {
    id: 'pmi',
    name: 'ISM Manufacturing PMI',
    source: 'FRED',
    frequency: 'monthly',
    asOfRule: 'lastKnown',
    knownLagDays: 3, // Released first business day of month
    units: 'index',
    startDate: '1948-01-01',
    notes: 'ISM Manufacturing PMI (NAPM)',
  },
} as const

/**
 * Get metadata for a dataset by ID
 */
export function getDatasetMetadata(id: string): DatasetMetadata | null {
  return DATASET_REGISTRY[id] ?? null
}

/**
 * Get all dataset IDs available for regime signals
 */
export function getAvailableDatasetIds(): string[] {
  return Object.keys(DATASET_REGISTRY)
}

/**
 * Get datasets filtered by source
 */
export function getDatasetsBySource(source: DatasetMetadata['source']): DatasetMetadata[] {
  return Object.values(DATASET_REGISTRY).filter((d) => d.source === source)
}
