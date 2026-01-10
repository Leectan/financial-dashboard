# Regime Signals & Correlation Engine (Spec for Claude)

## 0) Why this spec exists (and what it is **not**)

This document describes an **auditable research + modeling pipeline** and a **UI feature** to surface quantitative “regime signals” derived from the dashboard’s existing indicators (e.g., Liquidity, HY spread, SRF usage, RMP proxy, VIX, yield curve, etc.).

- **Not a promise of omniscience**: it is impossible to guarantee “every dataset on the internet” or 150 years of complete, perfectly clean data.
- **No-lookahead / anti-hallucination requirement**: every signal must be computed using only information that would have been available at that time, with explicit publication lags where relevant.
- **Not financial advice**: signals are research outputs; present them as probabilistic regimes/backtests, not as trade recommendations.

## 1) Current repo context (must align with existing implementation)

The dashboard already contains:

- **SRF usage** via NY Fed Markets Repo operations aggregation (see `src/lib/calculations/srf.ts` and `src/app/api/indicators/srf/route.ts`).
- **RMP proxy** via SOMA Treasury Bills held outright (“stock” proxy) (see `src/lib/calculations/rmp.ts` and `src/app/api/indicators/rmp/route.ts`).
- **Liquidity Index / Net liquidity** using `WALCL - TGA - ON RRP` with as-of alignment (see `src/lib/calculations/liquidity.ts` and `src/app/api/indicators/liquidity/route.ts`).
- **HY credit spread** from FRED OAS series `BAMLH0A0HYM2` (see `src/lib/calculations/hy-spread.ts` and `src/app/api/indicators/hy-spread/route.ts`).

Key constraint: the app is Next.js App Router, uses API routes, Upstash Redis caching, and a cron cache-warmer at `src/app/api/cron/update/route.ts`.

## 2) Feature goal

Add a **right-side UI panel** (“Signals”) that:

1. Shows **current regime score(s)** (e.g., “Credit Stress”, “Liquidity Stress”, “Funding Stress”, “Risk-Off Composite”).
2. Explains which underlying indicators are currently driving the score (top contributors).
3. Shows **rolling correlations** and/or **conditional event statistics** (e.g., “When SRF take-up rises AND RMP proxy increases AND HY spreads widen, recession odds historically increase over the next N months”).
4. Is explicit about **as-of dates** and **data lags** for each component.

The engine must compute signals server-side and cache them. The UI must not trigger expensive computations on page load.

## 3) Data scope and “150-year” reality check

### 3.1 What can realistically go back ~150 years with decent quality (free-ish)

These are candidates; implement incrementally.

- **NBER recession dates**: FRED `USREC` (daily recession indicator; post-1850 in some forms, but FRED series typically covers post-1854/1857 depending on series variant). Validate availability.
- **Long-run equity returns**:
  - If you can keep it free and clean: use **Robert Shiller dataset** (S&P composite / CAPE / real returns). This requires either a curated CSV in-repo (preferred for auditability) or a stable public source URL with checksum/version pinning.
  - As a fallback, use **FRED** series for S&P 500 levels/dividends where available (shorter history), or Yahoo (limited history, not 150y).
- **Long-term rates / inflation**: FRED has some deep history series (e.g., CPI variants, long yields), but coverage varies; validate each.

### 3.2 What cannot go back 150 years (hard constraint)

These are modern post-2008/2021 constructs and won’t have 150-year history:

- SRF usage (facility launched recently)
- RRP (modern era)
- WALCL (Fed balance sheet history in current form)
- ICE BofA OAS series (modern; post-1990s)

So the research engine must support **mixed-history features**:

- For long-horizon backtests (100y+), you use a “core macro pack” (recession + equity + rates + inflation).
- For modern regime detection (2000+), you use the full set (liquidity, HY OAS, VIX, SRF, RMP, etc.).

## 4) Data ingestion architecture (must be reproducible)

### 4.1 Canonical “dataset registry”

Create a typed registry describing each series:

- `id` (internal)
- `source` (FRED | NYFed Markets | Yahoo | StaticCSV)
- `fetcher` (code path / endpoint)
- `frequency` (daily/weekly/monthly/irregular)
- `asOfRule` (how to align to the model time grid)
- `knownLagDays` (publication lag; conservative default if unknown)
- `units` + normalization
- `startDate` realistic

### 4.2 Time grid alignment (critical)

Pick a canonical model grid:

- **Daily** grid for modern regimes (post-1990), using business days; or
- **Weekly** grid (Friday close) to reduce noise and alignment complexity.

For each input series:

- Convert to points `{ dateISO, value }` sorted ascending.
- Define `valueAsOf(dateISO)` = last observed value at or before dateISO.
- Apply **lag**: when computing features for date D, use `valueAsOf(D - lagDays)` to avoid lookahead.

This is mandatory for any claim about predictive correlations.

## 5) Modeling approach (layered, auditable)

Implement in layers, each producing artifacts the UI can show.

### Layer A — Rolling correlations (diagnostic, not predictive by itself)

Compute rolling correlations between:

- SRF accepted (or accepted/submitted ratio)
- RMP proxy wowChange (and/or billsHeldOutright)
- Liquidity netLiquidity YoY change (and percentile index)
- HY OAS
- VIX
- Yield curve spread
- Equity drawdowns (if available)

Parameters:

- window sizes: 20d / 60d / 126d / 252d (or 4w / 13w / 26w / 52w)
- correlation type: Pearson + Spearman (Spearman is robust to outliers)

Output:

```ts
type RollingCorr = {
  asOf: string
  window: string
  pairs: Array<{ a: string; b: string; corr: number }>
}
```

### Layer B — Event study / conditional probabilities (interpretable)

Define events and compute conditional outcomes:

**Outcomes (labels)**:
- Recession within N months: use NBER recession indicator series `USREC` (or equivalent). Define “within N months” using forward window; ensure no lookahead by evaluating historical only (offline computation).
- Equity drawdown within N months: e.g., S&P500 drawdown ≥ X% within N months (requires equity index).

**Triggers (examples; must be configurable)**:
- SRF take-up: `accepted > 0` for K consecutive operations/days; optionally magnitude thresholds.
- RMP proxy: `wowChange > threshold` (e.g., > +$25B) or `billsHeldOutright` rising for K weeks.
- Liquidity stress: liquidity index < P percentile or YoY netLiquidity < 0.
- Credit stress: HY OAS > threshold (e.g., 6%) or 3m change > threshold.
- Volatility: VIX > 25.

Compute:
- hit rate, false positives, lead time distribution
- conditional probabilities and confidence intervals (Wilson intervals)
- summary tables the UI can show

Output:

```ts
type TriggerStat = {
  triggerId: string
  horizonDays: number
  triggeredCount: number
  outcomeCount: number
  baseRate: number
  conditionalRate: number
  lift: number
  ci95: [number, number]
  notes: string[]
}
```

### Layer C — Simple composite regime score (for UI)

Build a composite score (0–100) from standardized sub-scores:

- Liquidity subscore (e.g., percentile of YoY netLiquidity change)
- Credit subscore (e.g., percentile of HY OAS level and change)
- Funding subscore (SRF take-up / RMP change; only modern era)
- Vol subscore (VIX percentile)

Standardization:
- Use expanding-window z-scores or percentile ranks within the available sample to avoid future leakage.

Score must include:
- `asOf` date
- data freshness per component
- “drivers” (top contributing features)

Output:

```ts
type RegimeScore = {
  asOf: string
  score: number // 0-100
  regimeLabel: 'Risk-On' | 'Neutral' | 'Risk-Off' | 'Stress'
  components: Array<{ id: string; value: number; contribution: number; asOf: string }>
  warnings: string[]
}
```

### Layer D — Optional model (only after A/B/C are stable)

If you add a predictive model, keep it simple and auditable:

- Logistic regression (recession within 12 months)
- Use regularization, time-series split, walk-forward validation
- Log all coefficients and training window
- Do not claim causality

## 6) Compute strategy (performance + reliability)

### 6.1 Do not compute heavy stats on page load

Create a server-side endpoint:

- `GET /api/research/regime-signals` returns cached artifact:
  - current regime score
  - latest rolling correlations (few windows)
  - latest trigger stats summary (precomputed)

Where “precomputed” means:

- Computed by cron once per day (or every 6h for modern-only features)
- Stored in Redis key like `research:regime-signals:v1`

### 6.2 Cron integration

Extend `src/app/api/cron/update/route.ts` to also warm:

- `research:regime-signals:v1`

Ensure cron failures do not break the dashboard; use stale fallback if possible.

## 7) UI spec — Right-side “Signals” panel

### 7.1 Layout

On the main dashboard page:

- Use a 2-column layout at `lg+`:
  - left: existing chart feed
  - right: sticky sidebar panel with:
    - “Regime Score” card
    - “Top Drivers” list
    - “Alerts” (trigger rules currently firing)
    - “Correlations” mini table (top +/- correlations)
    - “As-of & data lag” section (per component)

On mobile:
- Sidebar becomes a section below charts, collapsible.

### 7.2 UX requirements

- Every displayed signal must show:
  - `asOf` date
  - “Data lag expected” vs “Data stale unexpectedly” distinction
- Avoid scary red warnings unless confidence is high; use neutral language.

## 8) Implementation steps (Claude checklist)

1. Add a new “research” module folder: `src/lib/research/`
2. Implement dataset registry and alignment helpers.
3. Implement rolling correlations (Layer A).
4. Implement trigger stats for modern-only sample (Layer B) using HY/VIX/liquidity and (optionally) equity drawdowns.
   - If long-history equity data is required, add `docs/data/` with a pinned CSV + citation + checksum; parse it in Node runtime only.
5. Implement composite regime score (Layer C).
6. Add API route `src/app/api/research/regime-signals/route.ts` (cache-first, supports `fresh=1`).
7. Update cron route to warm this artifact.
8. Add sidebar UI components:
   - `src/components/dashboard/SignalsPanel.tsx`
   - integrate into `src/app/page.tsx` layout
9. Add clear docs in README: what signals mean, what they do *not* mean, and data-lag expectations.

## 9) Validation (must-do)

- Unit tests for:
  - alignment + lagging functions
  - rolling correlation correctness
  - percentile / z-score calculation
- Backtest sanity checks:
  - verify no future data used (spot check by shifting series and asserting different outputs)
  - verify trigger stats reproduce base rates
- Performance:
  - compute time bounded (<2–5s) in cron, not on page view
  - response payload small (no massive matrices in UI; keep “top N correlations”)

## 10) Data ethics / reproducibility notes

- Every external dataset must be cited in a `docs/data-sources.md` with:
  - URL, access date, license constraints
  - last updated time
  - data transformations applied
- For any series that can revise (macro), track vintage if possible; otherwise note that backtests may be optimistic.

