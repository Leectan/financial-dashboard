import { fetchNYFedJson, NYFedRepoAllotmentResultsResponse } from '@/lib/calculations/nyfed-markets'

export type SRFIntradayOp = {
  date: string
  releaseTime: string | null
  closeTime: string | null
  accepted: number
  submitted: number
  minimumBidRate: number | null
  operationId: string
}

export type SRFDailyPoint = {
  date: string
  accepted: number
  submitted: number
  minimumBidRate: number | null
}

export type SRFData = {
  source: 'NYFed Markets API (Repo operations)'
  note: string
  intraday: SRFIntradayOp[]
  history: SRFDailyPoint[]
  current: SRFDailyPoint | null
}

function safeNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function pickMinBidRate(op: any): number | null {
  const details = Array.isArray(op?.details) ? op.details : []
  for (const d of details) {
    const r = d?.minimumBidRate
    if (typeof r === 'number' && Number.isFinite(r)) return r
  }
  return null
}

// SRF (Standing Repo Facility) operations are reported by NY Fed under Repo operations with method "allotment"
// (operationMethod "Full Allotment"). The public Markets API exposes these directly.
export async function computeSRFUsage(options?: { lastN?: number }): Promise<SRFData> {
  const lastN = options?.lastN ?? 400
  const json = await fetchNYFedJson<NYFedRepoAllotmentResultsResponse>(
    `/api/rp/repo/allotment/results/last/${lastN}.json`,
  )

  const ops = Array.isArray(json?.repo?.operations) ? json.repo.operations : []
  const intraday: SRFIntradayOp[] = ops
    .filter((op) => op?.auctionStatus === 'Results')
    .map((op: any) => {
      const accepted = safeNum(op?.totalAmtAccepted)
      const submitted = safeNum(op?.totalAmtSubmitted)
      return {
        date: op?.operationDate,
        releaseTime: op?.releaseTime ?? null,
        closeTime: op?.closeTime ?? null,
        accepted,
        submitted,
        minimumBidRate: pickMinBidRate(op),
        operationId: op?.operationId ?? '',
      }
    })
    .filter((p) => typeof p.date === 'string' && p.date.length > 0)
    .sort((a, b) => (a.date + (a.closeTime ?? '')).localeCompare(b.date + (b.closeTime ?? '')))

  // Aggregate to daily totals (sum accepted/submitted; keep last non-null minimumBidRate of the day)
  const dailyMap = new Map<string, SRFDailyPoint>()
  for (const op of intraday) {
    const prev = dailyMap.get(op.date)
    if (!prev) {
      dailyMap.set(op.date, {
        date: op.date,
        accepted: op.accepted,
        submitted: op.submitted,
        minimumBidRate: op.minimumBidRate,
      })
    } else {
      dailyMap.set(op.date, {
        date: op.date,
        accepted: prev.accepted + op.accepted,
        submitted: prev.submitted + op.submitted,
        minimumBidRate: op.minimumBidRate ?? prev.minimumBidRate,
      })
    }
  }

  const history = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))
  const current = history.length ? (history[history.length - 1] ?? null) : null

  return {
    source: 'NYFed Markets API (Repo operations)',
    note:
      'This chart uses NY Fed Markets API repo operations (method=allotment / operationMethod=Full Allotment) as the cleanest free proxy for SRF usage. "Accepted" > $0 indicates facility take-up; $0 is normal.',
    intraday,
    history,
    current,
  }
}


