import * as XLSX from 'xlsx'

export type NaaimExposurePoint = { date: string; value: number }

const NAAIM_PAGE_URL = 'https://naaim.org/programs/naaim-exposure-index/'

function parseISODate(s: string): string | null {
  const t = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  return null
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, '').trim())
    return Number.isFinite(n) ? n : null
  }
  return null
}

function discoverLatestXlsxUrlFromHtml(html: string): string | null {
  // The NAAIM page publishes a direct XLSX link like:
  // https://naaim.org/wp-content/uploads/2026/01/USE_Data-since-Inception_2026-01-14.xlsx
  const re = /https:\/\/naaim\.org\/wp-content\/uploads\/\d{4}\/\d{2}\/USE_Data-since-Inception_\d{4}-\d{2}-\d{2}\.xlsx/gi
  const matches = [...html.matchAll(re)].map((m) => m[0]).filter(Boolean)
  if (!matches.length) return null
  // If multiple links exist, choose the lexicographically max (date is embedded as YYYY-MM-DD).
  return matches.sort().at(-1) ?? null
}

export async function fetchNaaimExposureHistory(): Promise<{
  asOf: string | null
  sourceUrl: string
  values: NaaimExposurePoint[]
}> {
  const pageRes = await fetch(NAAIM_PAGE_URL, { headers: { accept: 'text/html' }, cache: 'no-store' })
  if (!pageRes.ok) throw new Error(`NAAIM page HTTP ${pageRes.status}`)
  const html = await pageRes.text()

  const xlsxUrl = discoverLatestXlsxUrlFromHtml(html)
  if (!xlsxUrl) throw new Error('Could not discover NAAIM Exposure Index XLSX URL from page HTML')

  const xRes = await fetch(xlsxUrl, { headers: { accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, cache: 'no-store' })
  if (!xRes.ok) throw new Error(`NAAIM XLSX HTTP ${xRes.status}`)
  const buf = Buffer.from(await xRes.arrayBuffer())

  const wb = XLSX.read(buf, { type: 'buffer' })
  const firstSheetName = wb.SheetNames[0]
  if (!firstSheetName) throw new Error('NAAIM XLSX contained no worksheets')
  const sheet = wb.Sheets[firstSheetName]
  if (!sheet) throw new Error('NAAIM XLSX first worksheet missing')

  // Convert to 2D array.
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][]
  if (!rows.length) return { asOf: null, sourceUrl: xlsxUrl, values: [] }

  // Find header row containing "Date" and some "Exposure" column.
  let headerRowIdx = -1
  let dateCol = -1
  let valueCol = -1
  for (let r = 0; r < Math.min(50, rows.length); r++) {
    const row = rows[r] ?? []
    const normalized = row.map((c) => String(c ?? '').trim().toLowerCase())
    const dIdx = normalized.findIndex((c) => c === 'date' || c.includes('date'))
    // Observed in official XLSX: "Mean/Average" is the NAAIM Exposure Index level.
    // Some files also include "NAAIM Number" which appears to duplicate the mean.
    const meanIdx = normalized.findIndex((c) => c === 'mean/average' || c.includes('mean') || c.includes('average'))
    const naaimIdx = normalized.findIndex((c) => c.includes('naaim') && c.includes('number'))
    const vIdx = meanIdx >= 0 ? meanIdx : naaimIdx
    if (dIdx >= 0 && vIdx >= 0) {
      headerRowIdx = r
      dateCol = dIdx
      valueCol = vIdx
      break
    }
  }
  if (headerRowIdx < 0 || dateCol < 0 || valueCol < 0) {
    throw new Error('Could not locate Date / Mean(Average) columns in NAAIM XLSX')
  }

  const values: NaaimExposurePoint[] = []
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const rawDate = row[dateCol]
    const rawVal = row[valueCol]

    // Date may be Excel serial number or an ISO-like string.
    let iso: string | null = null
    if (typeof rawDate === 'number' && Number.isFinite(rawDate)) {
      const d = XLSX.SSF.parse_date_code(rawDate)
      if (d?.y && d?.m && d?.d) {
        iso = `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
      }
    } else if (typeof rawDate === 'string') {
      iso = parseISODate(rawDate)
    }

    const v = toNumber(rawVal)
    if (!iso || v == null) continue
    values.push({ date: iso, value: v })
  }

  values.sort((a, b) => a.date.localeCompare(b.date))
  const asOf = values.at(-1)?.date ?? null

  return { asOf, sourceUrl: xlsxUrl, values }
}

