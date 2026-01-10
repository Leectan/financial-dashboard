/**
 * Research Module - Regime Signals & Correlation Engine
 *
 * This module provides quantitative regime signals derived from the dashboard's
 * existing indicators. All computations are lookahead-free and auditable.
 */

// Types
export type {
  DataSource,
  DataFrequency,
  DatasetMetadata,
  TimePoint,
  AlignedSeries,
  CorrelationPair,
  RollingCorrelation,
  TriggerType,
  TriggerConfig,
  TriggerThresholds,
  TriggerStat,
  RegimeLabel,
  RegimeComponent,
  RegimeScore,
  RegimeSignalsResponse,
} from './types'

// Dataset Registry
export { DATASET_REGISTRY, getDatasetMetadata, getAvailableDatasetIds } from './dataset-registry'

// Alignment Utilities
export {
  parseDate,
  formatDate,
  addDays,
  subtractDays,
  daysBetween,
  isWeekday,
  generateDailyGrid,
  generateBusinessDayGrid,
  generateWeeklyGrid,
  valueAsOf,
  alignToGrid,
  alignMultipleSeries,
  rollingMean,
  nDayChange,
  nDayPercentChange,
  expandingPercentile,
  expandingZScore,
} from './alignment'

// Correlations
export {
  pearsonCorrelation,
  spearmanCorrelation,
  rollingCorrelation,
  computeCorrelationPairs,
  computeRollingCorrelations,
  getTopCorrelations,
} from './correlations'

// Triggers
export {
  DEFAULT_THRESHOLDS,
  TRIGGER_DEFINITIONS,
  wilsonInterval,
  evaluateTriggers,
  computeTriggerStat,
  computeForwardOutcome,
  computeAllTriggerStats,
  getCurrentlyFiringTriggers,
} from './triggers'

// Regime Score
export {
  REGIME_COMPONENTS,
  computeRegimeScore,
  getRegimeLabelColor,
  getRegimeLabelDescription,
} from './regime-score'

// Main Computation
export { computeRegimeSignals } from './compute-signals'
