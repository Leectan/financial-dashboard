export type IsharesHistoricalPoint = {
  /** ISO date (YYYY-MM-DD) */
  date: string
  /** NAV per share (if present) */
  nav?: number
  /** Shares outstanding (if present) */
  sharesOutstanding?: number
}

const ISHARES_ORIGIN = 'https://www.ishares.com'

function monthToNumber(mon: string): number | null {
  const m = mon.toLowerCase()
  const map: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  }
  return map[m] ?? null
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function parseIsharesAsOfDate(raw: string): string | null {
  // Examples observed: "Jan 12, 2026"
  const m = raw.trim().match(/^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})$/)
  if (!m) return null
  const mon = monthToNumber(m[1] ?? '')
  const day = Number(m[2])
  const year = Number(m[3])
  if (!mon || !Number.isFinite(day) || !Number.isFinite(year)) return null
  if (day < 1 || day > 31 || year < 1900 || year > 2100) return null
  return `${year}-${pad2(mon)}-${pad2(day)}`
}

function extractWorksheet(xml: string, worksheetName: string): string | null {
  const startTag = `<ss:Worksheet ss:Name=\"${worksheetName}\">`
  const start = xml.indexOf(startTag)
  if (start < 0) return null
  const end = xml.indexOf('</ss:Worksheet>', start)
  if (end < 0) return null
  return xml.slice(start, end)
}

function extractRows(sheetXml: string): string[] {
  return [...sheetXml.matchAll(/<ss:Row[^>]*>[\s\S]*?<\/ss:Row>/g)].map((m) => m[0])
}

function extractRowCells(rowXml: string): string[] {
  return [...rowXml.matchAll(/<ss:Data[^>]*>([\s\S]*?)<\/ss:Data>/g)].map((m) =>
    (m[1] ?? '').replace(/<[^>]+>/g, '').trim(),
  )
}

function discoverFundXlsDownloadUrlFromProductPageHtml(html: string): string | null {
  // Example href in product page:
  // /us/products/239726/ishares-core-sp-500-etf/1521942788811.ajax?fileType=xls&fileName=...&dataType=fund
  const m = html.match(
    /href="(\/us\/products\/[^"\s<>]+\d+\.ajax\?fileType=xls&fileName=[^&"\s<>]+&dataType=fund)"/i,
  )
  if (!m?.[1]) return null
  return `${ISHARES_ORIGIN}${m[1]}`
}

export async function fetchIsharesFundHistoricalFromProductPage(
  productPageUrl: string,
): Promise<IsharesHistoricalPoint[]> {
  // Always bypass Next.js/Vercel fetch caching here. We already control caching at the API route layer (Redis).
  const productRes = await fetch(productPageUrl, { headers: { accept: 'text/html' }, cache: 'no-store' })
  if (!productRes.ok) throw new Error(`iShares product page HTTP ${productRes.status}`)
  const html = await productRes.text()
  const xlsUrl = discoverFundXlsDownloadUrlFromProductPageHtml(html)
  if (!xlsUrl) throw new Error('Could not discover iShares fund XLS download URL from product page HTML')

  const xlsRes = await fetch(xlsUrl, { headers: { accept: 'application/vnd.ms-excel' }, cache: 'no-store' })
  if (!xlsRes.ok) throw new Error(`iShares fund XLS HTTP ${xlsRes.status}`)
  const xml = Buffer.from(await xlsRes.arrayBuffer()).toString('utf8')

  const historicalSheet = extractWorksheet(xml, 'Historical')
  if (!historicalSheet) throw new Error('iShares fund XLS did not contain a Historical worksheet')

  const rows = extractRows(historicalSheet)
  if (!rows.length) return []

  const headerCells = extractRowCells(rows[0] ?? '')
  if (!headerCells.length) return []

  const headerIndex = new Map<string, number>()
  headerCells.forEach((h, idx) => headerIndex.set(h.trim(), idx))

  const asOfIdx = headerIndex.get('As Of')
  const navIdx = headerIndex.get('NAV per Share')
  const sharesIdx = headerIndex.get('Shares Outstanding')
  if (asOfIdx == null) throw new Error('iShares Historical worksheet missing As Of column')

  const points: IsharesHistoricalPoint[] = []
  for (let i = 1; i < rows.length; i++) {
    const cells = extractRowCells(rows[i] ?? '')
    const asOfRaw = cells[asOfIdx] ?? ''
    const date = parseIsharesAsOfDate(asOfRaw)
    if (!date) continue

    const navRaw = navIdx != null ? cells[navIdx] : undefined
    const sharesRaw = sharesIdx != null ? cells[sharesIdx] : undefined

    const nav = navRaw != null && navRaw !== '--' ? Number(navRaw) : undefined
    const sharesOutstanding = sharesRaw != null && sharesRaw !== '--' ? Number(sharesRaw) : undefined

    points.push({
      date,
      nav: nav != null && Number.isFinite(nav) ? nav : undefined,
      sharesOutstanding: sharesOutstanding != null && Number.isFinite(sharesOutstanding) ? sharesOutstanding : undefined,
    })
  }

  // iShares Historical sheet is typically newest-first; normalize ascending by date.
  points.sort((a, b) => a.date.localeCompare(b.date))
  return points
}

