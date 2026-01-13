/**
 * Regime Signals & Correlation Engine - Type Definitions
 *
 * These types support the research/backtesting pipeline for regime detection.
 * All computations must be lookahead-free (use only data available at the time).
 */

// ============================================================================
// Dataset Registry Types
// ============================================================================

export type DataSource = 'FRED' | 'NYFedMarkets' | 'Yahoo' | 'StaticCSV' | 'PublicWeb'
export type DataFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'irregular'

export interface DatasetMetadata {
  id: string
  name: string
  source: DataSource
  frequency: DataFrequency
  /** How to align to the model time grid */
  asOfRule: 'lastKnown' | 'endOfPeriod'
  /** Publication lag in days (conservative default if unknown) */
  knownLagDays: number
  /** Unit description */
  units: string
  /** Earliest reliable start date (ISO) */
  startDate: string
  /** Optional notes about the series */
  notes?: string
}

// ============================================================================
// Time Series Types
// ============================================================================

export interface TimePoint {
  date: string // ISO date string YYYY-MM-DD
  value: number
}

export interface AlignedSeries {
  id: string
  points: TimePoint[]
  metadata: DatasetMetadata
  /** Last observation date in the series */
  lastAsOf: string
}

// ============================================================================
// Layer A: Rolling Correlations
// ============================================================================

export interface CorrelationPair {
  a: string
  b: string
  pearson: number
  spearman: number
}

export interface RollingCorrelation {
  asOf: string
  window: string // e.g., '20d', '60d', '126d', '252d'
  windowDays: number
  pairs: CorrelationPair[]
}

// ============================================================================
// Layer B: Trigger Stats / Event Study
// ============================================================================

export type TriggerType =
  | 'srf_takeup'
  | 'rmp_increase'
  | 'liquidity_stress'
  | 'credit_stress'
  | 'volatility_spike'
  | 'yield_curve_inversion'

export interface TriggerConfig {
  id: TriggerType
  name: string
  description: string
  /** Function to evaluate if trigger fires on a given date */
  evaluate: (data: Record<string, number | null>, config: TriggerThresholds) => boolean
}

export interface TriggerThresholds {
  srfAcceptedThreshold?: number // e.g., > 0
  rmpWowChangeThreshold?: number // e.g., > 25 (billions)
  liquidityPercentileThreshold?: number // e.g., < 20
  hyOasThreshold?: number // e.g., > 6 (percent)
  hyOas3mChangeThreshold?: number // e.g., > 1 (percent widening)
  vixThreshold?: number // e.g., > 25
  yieldCurveSpreadThreshold?: number // e.g., < 0 (inverted)
}

export interface TriggerStat {
  triggerId: TriggerType
  triggerName: string
  horizonDays: number
  triggeredCount: number
  outcomeCount: number
  /** Base rate of outcome in full sample */
  baseRate: number
  /** Conditional rate when trigger fires */
  conditionalRate: number
  /** Lift = conditionalRate / baseRate */
  lift: number
  /** 95% Wilson confidence interval for conditional rate */
  ci95: [number, number]
  notes: string[]
}

// ============================================================================
// Layer C: Composite Regime Score
// ============================================================================

export type RegimeLabel = 'Risk-On' | 'Neutral' | 'Risk-Off' | 'Stress'

export interface RegimeComponent {
  id: string
  name: string
  /** Raw value of the indicator */
  value: number | null
  /** Percentile rank (0-100) within historical sample */
  percentile: number | null
  /** Contribution to overall score (0-100 scale contribution) */
  contribution: number
  /** As-of date for this component */
  asOf: string
  /** Data lag description */
  lagDescription: string
}

export interface RegimeScore {
  /** Computation date */
  asOf: string
  /** Overall score 0-100 (higher = more stress/risk-off) */
  score: number
  /** Categorical label */
  regimeLabel: RegimeLabel
  /** Individual component contributions */
  components: RegimeComponent[]
  /** Top drivers (sorted by absolute contribution) */
  topDrivers: string[]
  /** Active alerts (triggers currently firing) */
  activeAlerts: string[]
  /** Any warnings about data freshness or quality */
  warnings: string[]
}

// ============================================================================
// Combined API Response
// ============================================================================

export interface RegimeSignalsResponse {
  /** Current regime score */
  regime: RegimeScore
  /** Latest rolling correlations for key windows */
  correlations: RollingCorrelation[]
  /** Summary trigger statistics */
  triggerStats: TriggerStat[]
  /** Metadata about computation */
  meta: {
    computedAt: string
    version: string
    dataRange: {
      start: string
      end: string
    }
  }
}
