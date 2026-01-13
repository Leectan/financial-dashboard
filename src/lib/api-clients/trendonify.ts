/**
 * Trendonify forward P/E fetcher (public webpage scrape)
 *
 * Why scrape?
 * - True "forward P/E" requires analyst earnings estimates and is often paywalled.
 * - Trendonify publishes a public historical series for US forward P/E.
 *
 * NOTE:
 * - This is a best-effort public-data scraper. If Trendonify changes markup, this may break.
 * - We rely on Redis for caching; upstream fetch is always `no-store`.
 */

export type TrendonifyPoint = { date: string; value: number }

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

/**
 * Extracts chart points from Trendonify's Astro-serialized props:
 * props="{&quot;chartData&quot;:[1,[[0,{&quot;x&quot;:[0,&quot;2009-05-01&quot;],&quot;y&quot;:[0,13.77]}], ... ]]}"
 */
export function parseTrendonifyForwardPEFromHtml(html: string): TrendonifyPoint[] {
  const match = html.match(/props=\"([^\"]*chartData[^\"]*)\"/)
  if (!match?.[1]) {
    throw new Error('Trendonify: could not locate chartData props payload')
  }

  const decoded = decodeHtmlEntities(match[1])

  let props: any
  try {
    props = JSON.parse(decoded)
  } catch (e) {
    throw new Error('Trendonify: failed to parse props JSON')
  }

  const chartData = props?.chartData
  const rows = Array.isArray(chartData) ? chartData[1] : null
  if (!Array.isArray(rows)) {
    throw new Error('Trendonify: unexpected chartData structure')
  }

  const points: TrendonifyPoint[] = []
  for (const item of rows) {
    const obj = item?.[1]
    const date = obj?.x?.[1]
    const value = obj?.y?.[1]
    if (typeof date === 'string' && typeof value === 'number' && Number.isFinite(value)) {
      points.push({ date, value })
    }
  }

  if (points.length === 0) {
    throw new Error('Trendonify: parsed 0 points')
  }

  // Ensure chronological order
  points.sort((a, b) => a.date.localeCompare(b.date))
  return points
}

export async function fetchUSForwardPEHistory(fresh: boolean = false): Promise<TrendonifyPoint[]> {
  const url = 'https://trendonify.com/united-states/stock-market/forward-pe-ratio'
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinancialDashboard/1.0)' },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Trendonify HTTP ${res.status}`)
  }
  const html = await res.text()
  return parseTrendonifyForwardPEFromHtml(html)
}

