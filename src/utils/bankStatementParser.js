import * as XLSX from 'xlsx'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// ── Internal OPay entries to skip ────────────────────────────────
const SKIP_PATTERNS = [
  /OWealth Withdrawal\(Transaction Payment\)/i,
  /Auto-save to OWealth Balance/i,
  /OWealth Balance/i,
]
const isInternalEntry = (d) => SKIP_PATTERNS.some(p => p.test(d))

// ── Date parser: "01 Jun 2026 23:24:32" → "2026-06-01" ───────────
const MONTH_MAP = {
  jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
  jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
}
const parseStatementDate = (raw) => {
  if (!raw) return null
  const s = String(raw).trim()
  const m = s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/)
  if (m) {
    const mon = MONTH_MAP[m[2].toLowerCase()]
    if (mon) return `${m[3]}-${mon}-${m[1].padStart(2,'0')}`
  }
  // ISO / slash fallback
  try {
    const d = new Date(s)
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    }
  } catch {}
  return null
}

const parseAmount = (val) => {
  if (!val || val === '--') return 0
  const n = parseFloat(String(val).replace(/[^\d.]/g, ''))
  return isNaN(n) ? 0 : n
}

// ── Merchant name extractor ───────────────────────────────────────
export const extractMerchant = (description) => {
  const d = String(description).trim()

  const transfer = d.match(/Transfer (?:to|from)\s+([^|]+)/i)
  if (transfer) return transfer[1].trim()

  // OPay Card Payment | BANK | TERMINAL | CODE | MERCHANT
  const card = d.match(/OPay Card Payment(?:\s*\|[^|]*){3}\|\s*(.+)$/i)
  if (card) {
    return card[1]
      .replace(/\s+\d+\s+\w+\s+LANG\s*$/i, '')
      .replace(/\s+LANG\s*$/i, '')
      .trim()
  }

  const elec = d.match(/^Electricity\s*\|\s*[^|]+\|\s*([^|]+)/i)
  if (elec) return `Electricity - ${elec[1].trim()}`

  const air = d.match(/^Airtime\s*\|\s*[^|]+\|\s*(.+)/i)
  if (air) return `Airtime - ${air[1].trim()}`

  const data = d.match(/^Data\s*\|\s*[^|]+\|\s*(.+)/i)
  if (data) return `Data - ${data[1].trim()}`

  return d.split('|')[0].trim()
}

// ── Proper CSV line parser (handles "amount,with,commas") ─────────
const parseCSVLine = (line) => {
  const cells = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      // Handle escaped quotes ("")
      if (inQ && line[i+1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (ch === ',' && !inQ) {
      cells.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur.trim())
  return cells
}

// Convert array-of-arrays into array-of-objects using a header row
const aoaToRows = (aoa, headerIdx) => {
  const headers = aoa[headerIdx].map(h => String(h ?? '').trim())
  return aoa.slice(headerIdx + 1)
    .filter(row => row.some(c => c !== '' && c !== null && c !== undefined))
    .map(row => {
      const obj = {}
      headers.forEach((h, i) => { obj[h] = row[i] ?? '' })
      return obj
    })
}

// ── OPay row parser (flexible column detection) ───────────────────
const parseOpayRows = (rows) => {
  if (!rows.length) return []

  // Flexible column lookup — handles Debit(?), Debit(₦), DEBIT, etc.
  const keys = Object.keys(rows[0])
  const debitKey  = keys.find(k => /debit/i.test(k)  && !/balance|count/i.test(k))
  const creditKey = keys.find(k => /credit/i.test(k) && !/balance|count/i.test(k))
  const dateKey   = keys.find(k => /trans.*date/i.test(k)) || keys.find(k => /value.*date/i.test(k)) || keys.find(k => /date/i.test(k))
  const descKey   = keys.find(k => /description/i.test(k))
  const chanKey   = keys.find(k => /channel/i.test(k))

  const transactions = []
  rows.forEach(row => {
    const desc = String(row[descKey] || '').trim()
    if (!desc || isInternalEntry(desc)) return

    const dateStr = parseStatementDate(row[dateKey])
    if (!dateStr) return

    const debit  = parseAmount(debitKey  ? row[debitKey]  : '')
    const credit = parseAmount(creditKey ? row[creditKey] : '')
    if (debit === 0 && credit === 0) return

    const amount = debit > 0 ? debit : credit
    const type   = debit > 0 ? 'expense' : 'income'

    transactions.push({
      date: dateStr,
      description: desc,
      merchant: extractMerchant(desc),
      amount, type, debit, credit,
      channel: String(chanKey ? row[chanKey] : '').trim(),
    })
  })
  return transactions
}

// ── Generic bank CSV/XLSX row parser ─────────────────────────────
const parseGenericRows = (rows) => {
  if (!rows.length) return []
  const keys = Object.keys(rows[0])

  const dateKey   = keys.find(k => /date/i.test(k))
  const descKey   = keys.find(k => /desc|narration|detail|memo|particular|remarks/i.test(k))
  const debitKey  = keys.find(k => /debit|^dr\b|withdraw/i.test(k) && !/balance|count/i.test(k))
  const creditKey = keys.find(k => /credit|^cr\b|deposit/i.test(k) && !/balance|count/i.test(k))
  const amtKey    = keys.find(k => /^amount|^amt/i.test(k))

  if (!dateKey) return []

  const transactions = []
  rows.forEach(row => {
    const dateStr = parseStatementDate(row[dateKey])
    if (!dateStr) return
    const desc = String(row[descKey] || '').trim()
    if (!desc) return

    const debit  = parseAmount(row[debitKey]  ?? 0)
    const credit = parseAmount(row[creditKey] ?? 0)
    const amt    = parseAmount(row[amtKey]    ?? 0)

    let amount, type
    if      (debit  > 0 && credit === 0) { amount = debit;        type = 'expense' }
    else if (credit > 0 && debit  === 0) { amount = credit;       type = 'income'  }
    else if (amt !== 0)                  { amount = Math.abs(amt); type = amt < 0 ? 'expense' : 'income' }
    else return

    transactions.push({
      date: dateStr, description: desc,
      merchant: desc.split('|')[0].trim(),
      amount, type, debit, credit,
    })
  })
  return transactions
}

// ── CSV: find the row index that has the real column headers ──────
const findDataHeaderRow = (aoa) => {
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const row = aoa[i]
    const joined = row.map(c => String(c ?? '')).join('|').toLowerCase()
    // OPay: row contains "trans. date" AND ("debit" or "credit")
    if (joined.includes('trans') && joined.includes('date') && (joined.includes('debit') || joined.includes('credit'))) return i
    // Generic: row contains "date" AND ("debit" or "credit" or "amount")
    if (joined.includes('date') && (joined.includes('debit') || joined.includes('credit') || joined.includes('amount'))) return i
  }
  return -1
}

// ── CSV file dispatcher ───────────────────────────────────────────
const parseCsvFile = async (file) => {
  const raw = await file.text()
  // Strip BOM, normalise line endings
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = text.split('\n')

  // Build array-of-arrays using our own CSV parser (handles quoted commas)
  const aoa = lines
    .filter(l => l.trim())
    .map(parseCSVLine)

  const headerIdx = findDataHeaderRow(aoa)
  if (headerIdx !== -1) {
    const rows = aoaToRows(aoa, headerIdx)
    const transactions = parseOpayRows(rows)
    return { transactions, format: 'OPay CSV' }
  }

  // Generic fallback via XLSX
  const wb = XLSX.read(text, { type: 'string' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
  return { transactions: parseGenericRows(rows), format: 'Generic CSV' }
}

// ── XLSX file dispatcher ──────────────────────────────────────────
const parseXlsxFile = async (file) => {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]

  // Read as array-of-arrays first to locate the real header row
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const headerIdx = findDataHeaderRow(aoa)

  if (headerIdx !== -1) {
    const rows = aoaToRows(aoa, headerIdx)
    const transactions = parseOpayRows(rows)
    return { transactions, format: 'OPay XLSX' }
  }

  // Standard format — first row is headers
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
  return { transactions: parseGenericRows(rows), format: 'Generic XLSX' }
}

// ── PDF (text extraction heuristic) ──────────────────────────────
const parsePdfFile = async (file) => {
  const buf = await file.arrayBuffer()
  const pdf = await getDocument({ data: buf }).promise
  let fullText = ''
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const items = [...content.items].sort((a, b) => {
      const rA = Math.round(a.transform[5] / 5) * 5
      const rB = Math.round(b.transform[5] / 5) * 5
      return rA !== rB ? rB - rA : a.transform[4] - b.transform[4]
    })
    fullText += items.map(i => i.str).join(' ') + '\n'
  }
  return { transactions: parsePdfText(fullText), format: 'PDF' }
}

const parsePdfText = (text) => {
  const transactions = []
  for (const line of text.split('\n')) {
    const dateMatch = line.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/)
    if (!dateMatch) continue
    const dateStr = parseStatementDate(dateMatch[0])
    if (!dateStr) continue

    const amounts = [...line.matchAll(/[\d,]+\.\d{2}/g)]
      .map(m => parseAmount(m[0])).filter(n => n > 0)
    if (amounts.length < 2) continue

    const amount = amounts[amounts.length - 2]
    const afterDate = line.slice(line.indexOf(dateMatch[0]) + dateMatch[0].length)
    const desc = afterDate.replace(/[\d,]+\.\d{2}/g, '').replace(/--/g, '').trim()
    if (!desc || isInternalEntry(desc)) continue

    const type = /credit|cr\b|deposit/i.test(line) ? 'income' : 'expense'
    transactions.push({
      date: dateStr, description: desc,
      merchant: extractMerchant(desc), amount, type,
      debit:  type === 'expense' ? amount : 0,
      credit: type === 'income'  ? amount : 0,
    })
  }
  return transactions
}

// ── Public API ────────────────────────────────────────────────────
export const parseStatementFile = async (file) => {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf'))                          return parsePdfFile(file)
  if (name.endsWith('.csv'))                          return parseCsvFile(file)
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return parseXlsxFile(file)
  throw new Error('Unsupported file type. Please upload a CSV, XLSX, or PDF file.')
}
