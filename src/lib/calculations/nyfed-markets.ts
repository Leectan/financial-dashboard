export type NYFedSomaSummaryRow = {
  asOfDate: string
  bills: string
  notesbonds: string
  tips: string
  frn: string
  agencies: string
  mbs: string
  cmbs: string
  total: string
}

export type NYFedSomaSummaryResponse = {
  soma: {
    summary: NYFedSomaSummaryRow[]
  }
}

export type NYFedRepoOperationDetail = {
  securityType: string
  amtSubmitted: number
  amtAccepted: number
  minimumBidRate?: number
}

export type NYFedRepoOperation = {
  operationId: string
  auctionStatus: string
  operationDate: string
  settlementDate: string
  maturityDate: string
  operationType: string
  operationMethod: string
  settlementType: string
  termCalenderDays: number
  term?: string
  releaseTime?: string
  closeTime?: string
  lastUpdated?: string
  note?: string
  totalAmtSubmitted?: number
  totalAmtAccepted?: number
  details?: NYFedRepoOperationDetail[]
}

export type NYFedRepoAllotmentResultsResponse = {
  repo: {
    operations: NYFedRepoOperation[]
  }
}

const NYFED_MARKETS_BASE = 'https://markets.newyorkfed.org'

export async function fetchNYFedJson<T>(pathAndQuery: string): Promise<T> {
  const url = `${NYFED_MARKETS_BASE}${pathAndQuery}`
  const res = await fetch(url, {
    // The NY Fed Markets API is public and does not require auth.
    // Cache control is handled by our Redis layer.
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`NY Fed Markets API error ${res.status} for ${pathAndQuery}`)
  }
  return (await res.json()) as T
}

export function toNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}


