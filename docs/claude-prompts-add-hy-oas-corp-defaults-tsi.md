# Claude Implementation Prompt — Add HY OAS, Corporate “Default Rates”, and Transportation Services Index Charts

## Understanding (what to build)
Add **three new dashboard charts** to the existing Next.js 14 App Router app in `financial-dashboard/`:

1. **ICE BofA US High Yield Index Option-Adjusted Spread (HY OAS)**  
   - Source: **FRED series `BAMLH0A0HYM2`** (already used in the codebase).
2. **Corporate bond default rates**  
   - If a truly “corporate bond default rate” dataset is freely available via Bravos/Barchart **as a raw time series feed**, use it.  
   - Otherwise use **FRED**. Since FRED does *not* appear to expose true corporate bond default-rate time series, implement an explicit **proxy** chart (see “Data Source Decision” below) with strong labeling.
3. **Freight & Transportation: Transportation Services Index (TSI)**  
   - Source: **FRED series `TSIFRGHT`** (Freight Transportation Services Index; **Monthly**, **Index 2000=100**, **Seasonally Adjusted**, BTS source).

All three charts must be added to the **main dashboard grid** (see `src/app/page.tsx`) and wired into:
- API routes (`src/app/api/indicators/.../route.ts`)
- caching (`src/lib/cache/redis.ts`)
- React Query hooks (`src/hooks/use-indicators.ts`) when appropriate
- refresh button (`src/components/dashboard/RefreshButton.tsx`)
- cron cache warmer (`src/app/api/cron/update/route.ts`)

## Repo Context (reuse what already exists)
HY OAS already exists as the “HY Spread” indicator:
- API route: `src/app/api/indicators/hy-spread/route.ts`
- Calculator: `src/lib/calculations/hy-spread.ts` (FRED `BAMLH0A0HYM2`)
- Hook: `useHYSpread()` in `src/hooks/use-indicators.ts`
- UI card exists in `src/app/page.tsx` titled “High-Yield Credit Spread”

**Do not duplicate this dataset**; instead rename/reframe the existing card so it matches the requested wording.

## Data Source Decision (corporate bond default rates)
### Hard requirement
We need a chart labeled “corporate bond default rates.” However, unless you have a free, machine-readable default-rate series, we cannot honestly implement “bond default rates” from FRED.

### Investigation conclusion (free alternatives)
After investigating common “default rate” publishers (Moody’s / S&P / Fitch / ICE / CDS index vendors) and the Bravos/Barchart ecosystem:
- **Moody’s / S&P / Fitch**: default-rate databases and time series are generally **subscription/licensed**; public content is mostly **PDF narratives** or summary tables, not stable APIs/CSVs.
- **Barchart / Bravos**: articles may be free to read, but there is no clearly supported **free raw time-series feed** for corporate bond default rates suitable for automated ingestion.
- **FRED**: does not appear to expose a true “corporate bond default rate” time series, but it does expose **credible, free corporate credit deterioration proxies** via the Fed’s charge-off/delinquency tables.

Therefore: **use FRED proxy approach** unless you later provide a free raw dataset endpoint (API/CSV) with permissive terms.

### Decision logic
- **If** you find a free raw dataset feed (CSV/API) from Bravos/Barchart for corporate bond default rates, use it.  
  - Use `[PLACEHOLDER: barchart/bravos endpoint + terms]` and store a pinned CSV if the API is unstable.
- **Else (default)** implement **corporate credit default/stress proxies** from FRED (Fed charge-off & delinquency tables), and **label it explicitly** as a proxy so users don’t confuse it with true bond default rates:
  - `DRBLACBS`: *Delinquency Rate on Business Loans, All Commercial Banks* (Percent, Quarterly, SA)  
  - `CORBLACBS`: *Charge-Off Rate on Business Loans, All Commercial Banks* (Percent, Quarterly, SA; annualized net of recoveries)

This is still “corporate credit stress/default-like behavior,” but it is **not bond defaults**. The UI must say “proxy” unless a true bond-default dataset is sourced.

### Optional (recommended) “real-time-ish” supplement
If you want something that updates closer to real-time without paid data, consider adding a **market-implied credit risk** line alongside the proxy chart:
- `BAA10Y`: *Moody’s Seasoned Baa Corporate Bond Yield Relative to Yield on 10-Year Treasury Constant Maturity* (credit spread proxy)

This still isn’t a default rate, but it’s often a more timely “credit stress” gauge than quarterly charge-offs/delinquencies. Only add if you can label it clearly.

## Implementation Requirements (architectural)
Follow the existing conventions:
- API routes return `{ data, cached, lastUpdated }`
- Use Upstash cache via `getCached/setCached` and `CACHE_KEYS`/`CACHE_TTL` in `src/lib/cache/redis.ts`
- Prefer cache-first behavior; support `?fresh=1` to bypass cache
- Keep the dashboard responsive: no client-side polling; use the existing React Query settings (staleTime + no refetchInterval)

## Step-by-step Implementation Tasks

### A) HY OAS chart (rename/upgrade existing)
1. **UI: rename the existing HY Spread card** in `src/app/page.tsx`
   - Current: “High-Yield Credit Spread”
   - Change title to: **“ICE BofA US High Yield OAS (Option-Adjusted Spread)”**
   - Keep the same underlying hook: `hySpread`
   - Update the subtitle to explicitly mention: `FRED BAMLH0A0HYM2`
   - Add more context in `interpretation`:
     - Tight spreads (< ~3%) often indicate risk-on/complacency
     - Widening / > ~5% indicates credit stress risk-off
2. **Refresh wiring**: add `/api/indicators/hy-spread?fresh=1` to `RefreshButton.tsx`’s `Promise.allSettled([ ... ])`.
3. **Cron warmer**: in `src/app/api/cron/update/route.ts`, add an async block to warm:
   - `CACHE_KEYS.INDICATOR_HY_SPREAD` (call `computeHYSpread()` or fetch FRED series and format same as API)

### B) Corporate bond “default rates” chart (proxy unless a true dataset exists)
1. **Add cache keys**
   - In `src/lib/cache/redis.ts`, add a key for this indicator, e.g.:
     - `INDICATOR_CORP_DEFAULTS: 'indicator:corp-defaults'`
   - Reuse `CACHE_TTL.MONTHLY` (or add `QUARTERLY` if you want precision; but MONTHLY is acceptable since this is quarterly data and changes slowly).
2. **Create API route**
   - New file: `src/app/api/indicators/corp-defaults/route.ts`
   - Runtime: `export const runtime = 'edge'`
   - Query params:
     - `start` default `1990-01-01`
     - `fresh=1` bypass cache
   - Cache key pattern: `${CACHE_KEYS.INDICATOR_CORP_DEFAULTS}:start:${start}`
   - Fetch series in parallel from FRED:
     - `DRBLACBS` and `CORBLACBS`
   - Response `data` shape (example):
     - `delinquency: Array<{date, value}>`
     - `chargeOffs: Array<{date, value}>`
     - `meta: { source: 'FRED', note: 'These are bank loan credit-stress proxies (not bond default rates).' }`
3. **Hook**
   - In `src/hooks/use-indicators.ts` add:
     - Types for the response
     - `fetchCorpDefaults(start?)`
     - `useCorpDefaults(start?)`
   - Add it into `useAllIndicators()` return object so the dashboard can load it like other React Query indicators.
4. **Dashboard UI**
   - Add an `IndicatorCard` in `src/app/page.tsx`:
     - Title: **“Corporate Credit Defaults (Proxy)”** OR **“Corporate Bond Defaults (Proxy)”** (only if no true dataset)
     - Subtitle: `Business loan delinquency + charge-offs (FRED)`
     - Interpretation: explain clearly it’s a proxy; rising = corporate credit stress + tightening
   - Render 2 small charts (similar to the existing “Default Rates” card):
     - Delinquency (%)
     - Charge-offs (%)
5. **Refresh wiring**
   - Add `/api/indicators/corp-defaults?fresh=1` to the Refresh button.
6. **Cron warmer**
   - Add a cron update block to pre-warm `${CACHE_KEYS.INDICATOR_CORP_DEFAULTS}:start:1990-01-01`.

### C) Freight Transportation Services Index (TSI) chart
1. **Add cache keys**
   - In `src/lib/cache/redis.ts` add:
     - `INDICATOR_TSI: 'indicator:tsi'`
   - Use TTL `CACHE_TTL.MONTHLY`
2. **Create API route**
   - New file: `src/app/api/indicators/tsi/route.ts`
   - Runtime: `edge`
   - Query params:
     - `start` default `2000-01-01`
     - `fresh=1`
   - Fetch FRED series:
     - `TSIFRGHT` (Freight Transportation Services Index; Index 2000=100; Monthly; SA)
   - Return:
     - `values: Array<{date, value}>`
     - `current: number | null`
     - `date: string | null`
     - `unit: 'Index (2000=100)'`
     - `source: 'FRED (TSIFRGHT)'`
3. **Hook**
   - Add `fetchTSI(start?)` and `useTSI(start?)` to `src/hooks/use-indicators.ts`
   - Add to `useAllIndicators()`
4. **Dashboard UI**
   - Add an `IndicatorCard` in `src/app/page.tsx`:
     - Title: **“Freight Transportation Services Index (TSI)”**
     - Value: latest index reading
     - Subtitle: “BTS freight activity index (2000=100)”
     - Interpretation: freight activity is a cyclic/real-economy barometer; persistent declines often precede slowdowns
     - Chart: `SimpleLineChart` over `values`
5. **Refresh wiring**
   - Add `/api/indicators/tsi?fresh=1` to Refresh button.
6. **Cron warmer**
   - Add cron update block to warm `${CACHE_KEYS.INDICATOR_TSI}:start:2000-01-01`.

## QA / Verification Checklist
After implementing:
1. Hit each endpoint and confirm payloads are valid JSON:
   - `/api/indicators/hy-spread`
   - `/api/indicators/corp-defaults`
   - `/api/indicators/tsi`
2. Confirm `?fresh=1` bypasses cache.
3. Confirm the dashboard renders immediately and each new card shows “Loading…” until data arrives (no full-page spinner).
4. Confirm Refresh Data triggers the new endpoints and then reloads the page.
5. Confirm cron route warms caches without throwing (and logs failures per-indicator).

## Non-negotiables
- Don’t claim corporate bond default rates unless you truly have a bond-default dataset. If using FRED proxies, label it “proxy” in the UI and metadata.
- Follow the existing caching patterns and avoid client-side polling/refetch loops.

