# Data Sources (Auditable + Deep History)

This project mixes **official macro series** (mostly via FRED) with **modern operational data** (NY Fed Markets API) and (optionally) **long-run historical datasets** (e.g., Shiller). This document is the canonical place to track provenance, licenses/constraints, and “data lag” expectations.

## 1) Principles (non-negotiable)

- **Cite everything**: for each dataset, record a stable source, access date, and (when possible) a version/vintage identifier.
- **Track lags**: many “latest values” are end-of-day or released with a delay (weekly/monthly/quarterly). The UI should show **as-of dates** and not imply intraday freshness when it’s not available.
- **Avoid lookahead bias** in research/backtests:
  - align to a time grid (weekly or daily)
  - use “as-of” forward-fill
  - apply conservative publication lags (or series-specific lags) before feature computation
- **Prefer open + stable** sources: FRED and government sources first, then academic datasets, then anything scraped/unstable as a last resort.

## 2) Primary sources used in the app today

### 2.1 FRED (Federal Reserve Economic Data)

- **What it provides**: Thousands of macro/market time series with clear IDs, metadata, and stable API.
- **Access**: API key required.
- **Docs**: `https://fred.stlouisfed.org/docs/api/fred/`
- **Typical lags**:
  - Daily market series: often **T+1** close (or later)
  - Weekly macro series: released on a schedule (e.g., M2 weekly)
  - Monthly/Quarterly: release lag can be weeks/months
- **Known caveat**: many macro series can be **revised** historically; backtests may differ from “real-time” vintages unless you explicitly use ALFRED/real-time datasets.

#### FRED series currently referenced (non-exhaustive)

- **Treasury yields / curve**
  - `DGS10` (10Y Treasury yield, daily)
  - `DGS2` (2Y Treasury yield, daily)
  - `T10Y2Y` (10Y-2Y spread, daily)
- **Volatility**
  - `VIXCLS` (VIX close, daily; generally T+1)
- **M2**
  - `WM2NS` (M2, weekly)
- **GDP**
  - `GDPC1` (real GDP, quarterly)
- **Housing**
  - `HOUST` (housing starts, monthly)
  - `PERMIT` (building permits, monthly)
- **Labor**
  - `ICSA` (initial claims, weekly)
  - `SAHMREALTIME` (Sahm rule indicator, monthly-ish publication)
- **Credit stress (used)**
  - `BAMLH0A0HYM2` (ICE BofA US High Yield OAS)
- **Reverse repo (used)**
  - `RRPONTSYD` (ON RRP, daily)
- **Liquidity construction inputs (used)**
  - `WALCL` (Fed balance sheet)
  - `WDTGAL` or `WTREGEN` (Treasury General Account)

### 2.2 NY Fed Markets API (operations + SOMA)

- **What it provides**: Public operational/summary data for repo facilities and SOMA holdings.
- **Source**: NY Fed Markets “Markets Data” endpoints (the project currently uses JSON endpoints).
- **Used for**:
  - **SRF usage proxy**: Repo “allotment results” operations aggregated daily (`src/lib/calculations/srf.ts`).
  - **RMP proxy**: SOMA Treasury bills held outright (weekly as-of dates) (`src/lib/calculations/rmp.ts`).
- **Typical lags**: can be intraday or same-day depending on operation timing; treat as “near-real-time” but still show as-of date + release/close times where available.
- **Risk**: API response shape can change; keep parsing defensive and cache results.

## 3) Deep-history candidates (100–150+ years)

These are for the **research engine**, not necessarily for the main dashboard cards (because UX + payload size).

### 3.1 NBER recession chronology (via FRED or direct)

- **Best practical choice**: Use the FRED recession indicator series (e.g., `USREC`) if coverage is acceptable.
  - URL: `https://fred.stlouisfed.org/series/USREC`
- **Alternative**: NBER’s own recession dates tables (may require manual curation).
  - URL: `https://www.nber.org/research/data/us-business-cycle-expansions-and-contractions`
- **Lag**: recession dating is **ex post** (committee decisions come later). For predictive modeling, treat it as an evaluation label, not something “known in real-time.”

### 3.2 Robert Shiller long-run equity + rates dataset (recommended for 150y equity research)

- **What it provides**: Long-run monthly equity prices/dividends/earnings, CAPE, interest rates, CPI; widely used in academic and institutional research for long-horizon studies.
- **Why it’s valuable**: gives the “150-year spine” you asked for; enables drawdowns, return regimes, valuation regimes.
- **Source**: Shiller’s data page (ensure current link; can change).
  - Historically: `http://www.econ.yale.edu/~shiller/data.htm`
- **License/constraints**: academic dataset; you must respect terms of use. Because this is a dashboard, **prefer pinning a copy** (CSV) in `docs/data/` with attribution and access date for reproducibility.
- **Important**: Shiller values can be updated; pinning is essential.

### 3.3 Long-run inflation / CPI

Options:
- **FRED CPI variants** (coverage depends on series).
- **Shiller CPI** (if using Shiller as the spine).
- **BLS historical tables** (may need manual curation).

### 3.4 Long-run interest rates

Options:
- **Shiller long rate series** (common in macro research).
- **FRED long rate series** where available (coverage varies).

## 4) “Modern institutional” additions (post-1990) — recommended list

These are highly relevant for institutional risk regimes but won’t extend 150 years.

- **Credit spreads (OAS)**:
  - HY OAS: `BAMLH0A0HYM2` (already used)
  - IG OAS: (candidate) `BAMLC0A0CM`
  - BBB OAS: (candidate) `BAMLC0A4CBBB`
  - Validate IDs by querying FRED and checking data exists.
- **Funding/liquidity**:
  - `WALCL`, `WDTGAL/WTREGEN`, `RRPONTSYD` for net liquidity
  - NY Fed operations: SRF, repo operations
- **Volatility**:
  - VIX close (`VIXCLS`) and optional intraday proxy via Yahoo (already implemented)

## 5) Plan for pinning non-FRED datasets as versioned CSVs (reproducible research)

If you add Shiller or any other non-FRED deep-history series, do this:

### 5.1 Directory layout

- `financial-dashboard/docs/data/`
  - `shiller_ie_data_vYYYY-MM-DD.csv`
  - `shiller_ie_data_vYYYY-MM-DD.sha256`
  - `README.md` (provenance + transformation notes)

### 5.2 Pinning workflow

1. **Download** the dataset on a specific date.
2. **Convert** to a clean CSV schema that is stable:
   - columns: `date` (YYYY-MM), `sp500_price`, `dividend`, `earnings`, `cpi`, `long_rate`, etc.
3. **Record provenance** in `docs/data/README.md`:
   - original URL
   - access date/time (UTC)
   - any transformations (units, rounding, missing-value handling)
4. **Compute checksum** and commit it:

```bash
shasum -a 256 shiller_ie_data_vYYYY-MM-DD.csv > shiller_ie_data_vYYYY-MM-DD.sha256
```

5. **Never silently overwrite**: add a new versioned file when updating.

### 5.3 Loading policy in code

- Only load pinned CSVs in **Node runtime** (not Edge) to avoid large bundle and Edge runtime constraints.
- Implement a small parser module `src/lib/data/static-csv/` that:
  - validates schema with Zod
  - logs the pinned version in outputs (for auditability)

## 6) Required metadata to show in UI (to avoid “latest date” confusion)

Every indicator used in signals/backtests should include:

- **asOfDate**: last observation date used
- **expectedLag**: e.g., “Daily close (T+1)” or “Weekly release”
- **dataSource**: FRED / NY Fed / pinned CSV
- **freshnessWarning**: only if data is older than expected by a threshold (e.g., >3 business days for daily series)

## 7) Next implementation steps (short)

1. Add `docs/data/` folder scaffolding and `docs/data/README.md`.
2. Decide whether to include Shiller (recommended) or keep “modern-only” regimes.
3. Update the regime-signal engine spec to reference pinned datasets by filename + checksum.

