import { fetchNYFedJson, NYFedSomaSummaryResponse, toNumberOrNull } from '@/lib/calculations/nyfed-markets'

export type RMPPoint = {
  date: string
  billsHeldOutright: number
  wowChange: number | null
}

export type RMPData = {
  source: 'NYFed Markets API (SOMA)'
  note: string
  history: RMPPoint[]
  current: RMPPoint | null
}

// Important: "RMP" (Reserve Management Purchases) is not always published as a standalone labeled series.
// The most robust free proxy for "RMP in action" is the *stock* of Treasury Bills held outright in SOMA.
// This reflects the cumulative outcome of bill purchases/redemptions.
export async function computeRMPProxy(): Promise<RMPData> {
  const json = await fetchNYFedJson<NYFedSomaSummaryResponse>('/api/soma/summary.json')
  const rows = Array.isArray(json?.soma?.summary) ? json.soma.summary : []

  const history: RMPPoint[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const date = r?.asOfDate
    const bills = toNumberOrNull(r?.bills)
    if (!date || bills == null) continue

    // week-over-week change (same cadence as asOfDate series)
    let wowChange: number | null = null
    // Find previous valid point (usually i-1 but data quality varies historically)
    for (let j = i - 1; j >= 0; j--) {
      const prev = rows[j]
      const prevBills = toNumberOrNull(prev?.bills)
      if (prevBills != null) {
        wowChange = bills - prevBills
        break
      }
    }

    history.push({ date, billsHeldOutright: bills, wowChange })
  }

  history.sort((a, b) => a.date.localeCompare(b.date))
  const current = history.length ? (history[history.length - 1] ?? null) : null

  return {
    source: 'NYFed Markets API (SOMA)',
    note:
      'This chart uses SOMA Treasury Bills held outright as a free, auditable proxy for Reserve Management Purchases (RMP). It reflects the cumulative stock of bill holdings (weekly as-of dates), not intraday operation-by-operation flows.',
    history,
    current,
  }
}


