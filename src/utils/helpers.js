import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear, subMonths } from 'date-fns'
import * as XLSX from 'xlsx'
import SparkMD5 from 'spark-md5'

// ─── Formatting ───────────────────────────────────────────────
// Currency symbol map — ensures correct symbols are used (e.g. ₦ not NGN)
const CURRENCY_SYMBOLS = {
  NGN: '₦', USD: '$', EUR: '€', GBP: '£', GHS: '₵',
  KES: 'KSh', ZAR: 'R', EGP: 'E£', UGX: 'USh', TZS: 'TSh',
  ETB: 'Br', XOF: 'CFA', MAD: 'MAD', CAD: 'CA$', AUD: 'A$',
  JPY: '¥', CNY: '¥', INR: '₹', AED: 'AED', SAR: 'SAR',
  BRL: 'R$', MXN: 'MX$', SGD: 'S$', CHF: 'CHF', NOK: 'kr',
  SEK: 'kr', DKK: 'kr', NZD: 'NZ$', HKD: 'HK$', PKR: '₨',
  BDT: '৳', PHP: '₱', IDR: 'Rp', MYR: 'RM', THB: '฿',
  TRY: '₺', RUB: '₽', PLN: 'zł', CZK: 'Kč', HUF: 'Ft',
  ILS: '₪', CLP: 'CLP', COP: 'COP', PEN: 'S/', ARS: 'ARS',
  VND: '₫', KRW: '₩',
}

const getCurrencySymbol = (currency = 'USD') =>
  CURRENCY_SYMBOLS[currency] || currency

// Format a raw amount-input string (e.g. "1234.5") for display with comma
// grouping on the integer part, WITHOUT touching the decimal part — a plain
// `parseFloat(raw).toLocaleString()` drops a trailing "." or trailing "0"
// on every keystroke, which makes it impossible to type "200.50".
export const formatAmountInput = (raw) => {
  if (!raw || raw === '-') return raw || ''
  const neg = raw.startsWith('-')
  const unsigned = neg ? raw.slice(1) : raw
  const [intPart, decPart] = unsigned.split('.')
  const intNum = intPart ? Number(intPart) : 0
  const formattedInt = isNaN(intNum) ? '0' : intNum.toLocaleString('en-US')
  const withDecimal = decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt
  return neg ? `-${withDecimal}` : withDecimal
}

export const fmtCurrency = (n, currency = 'USD') => {
  const sym = getCurrencySymbol(currency)
  const abs = Math.abs(n || 0)
  const sign = (n || 0) < 0 ? '-' : ''
  const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs)
  return `${sign}${sym}${formatted}`
}

export const fmtDate = (dateStr) => {
  try { return format(new Date(dateStr), 'd MMM yyyy') } catch { return dateStr }
}

export const fmtMonthYear = (date) => format(date, 'MMMM yyyy')

// ─── Date ranges ──────────────────────────────────────────────
export const getDateRange = (period, anchor) => {
  const d = anchor || new Date()
  switch (period) {
    case 'weekly':
      return { start: startOfWeek(d, { weekStartsOn: 1 }), end: endOfWeek(d, { weekStartsOn: 1 }) }
    case 'annually':
      return { start: startOfYear(d), end: endOfYear(d) }
    case 'custom':
      return null
    default: // monthly
      return { start: startOfMonth(d), end: endOfMonth(d) }
  }
}

export const toFirestoreDate = (d) => format(d, 'yyyy-MM-dd')

// ─── Import XLSX ──────────────────────────────────────────────

// Strip leading emojis/symbols from category names
const cleanCategoryName = (name) => {
  if (!name) return ''
  return String(name)
    .replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\uFE00-\uFE0F\s]+/gu, '')
    .trim()
    || String(name).trim() // fallback to original if stripping removed everything
}

// Parse a date value that could be a JS Date object, Excel serial, or string
const parseDate = (raw) => {
  if (!raw) return null
  // Already a JS Date (happens with openpyxl / xlsx cellDates:true)
  if (raw instanceof Date) return format(raw, 'yyyy-MM-dd')
  // Excel serial number
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw)
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
  }
  // String
  try {
    const d = new Date(raw)
    if (!isNaN(d)) return format(d, 'yyyy-MM-dd')
  } catch {}
  return null
}

export const parseTransactionXLSX = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

        if (rows.length === 0) return resolve({ transactions: [], categoryMap: {} })

        // Detect format by checking header keys
        const headers = Object.keys(rows[0]).map(h => h.trim().toLowerCase())
        const isNativeFormat = headers.includes('period') && headers.includes('income/expense')

        // Types to skip entirely in native format
        const skipTypes = new Set(['Transfer-In', 'Transfer-Out', 'Income Balance', 'Expense Balance'])

        const seen = new Set()
        const transactions = []
        const categoryMap = {}

        rows.forEach(row => {
          let dateStr, amtRaw, type, catRaw, subcat, note

          if (isNativeFormat) {
            // ── Native app export format ──────────────────────────
            // Period | Accounts | Category | Subcategory | Note | NGN | Income/Expense | ...
            const txType = String(row['Income/Expense'] || row['income/expense'] || '').trim()
            if (skipTypes.has(txType)) return

            dateStr = parseDate(row['Period'] || row['period'])
            amtRaw  = row['NGN'] || row['ngn'] || row['Amount'] || row['amount'] || 0
            catRaw  = row['Category'] || row['category'] || 'Miscellaneous'
            subcat  = String(row['Subcategory'] || row['subcategory'] || '').trim()
            note    = String(row['Note'] || row['note'] || '').trim()

            const amt = parseFloat(String(amtRaw).replace(/[^0-9.-]/g, ''))
            if (!amt || isNaN(amt)) return

            // Negative Exp. = refund → treat as income
            if (txType === 'Income' || (txType === 'Exp.' && amt < 0)) {
              type = 'income'
            } else {
              type = 'expense'
            }

            const absAmt = Math.abs(amt)
            const cat = cleanCategoryName(catRaw)
            if (!cat) return

            const hash = SparkMD5.hash(`${dateStr}|${cat}|${subcat}|${absAmt}|${type}`)
            if (seen.has(hash)) return
            seen.add(hash)

            if (!categoryMap[cat]) categoryMap[cat] = { type, subcategories: [] }
            if (subcat && !categoryMap[cat].subcategories.includes(subcat))
              categoryMap[cat].subcategories.push(subcat)

            transactions.push({ amount: absAmt, type, category: cat, subcategory: subcat, note, date: dateStr, hash })

          } else {
            // ── Standard / generic format ─────────────────────────
            // Date | Description | Amount | Category | Subcategory | Type (optional)
            const dateRaw = row.Date || row.date || row['Transaction Date'] || ''
            dateStr = parseDate(dateRaw)
            if (!dateStr) return

            const desc  = String(row.Description || row.description || row.Memo || row.memo || '').trim()
            amtRaw      = row.Amount || row.amount || row.Debit || row.Credit || 0
            catRaw      = row.Category || row.category || 'Miscellaneous'
            subcat      = String(row.Subcategory || row.subcategory || '').trim()
            note        = desc

            const amt = parseFloat(String(amtRaw).replace(/[^0-9.-]/g, ''))
            if (!amt || isNaN(amt)) return

            // Honour explicit Type column if present, else infer from sign
            const typeCol = String(row.Type || row.type || '').toLowerCase()
            if (typeCol === 'income') type = 'income'
            else if (typeCol === 'expense') type = 'expense'
            else type = amt < 0 ? 'expense' : 'income'

            const cat = cleanCategoryName(catRaw)
            const hash = SparkMD5.hash(`${dateStr}|${desc}|${Math.abs(amt)}`)
            if (seen.has(hash)) return
            seen.add(hash)

            if (!categoryMap[cat]) categoryMap[cat] = { type, subcategories: [] }
            if (subcat && !categoryMap[cat].subcategories.includes(subcat))
              categoryMap[cat].subcategories.push(subcat)

            transactions.push({ amount: Math.abs(amt), type, category: cat, subcategory: subcat, note, date: dateStr, hash })
          }
        })

        // Placeholder to close the forEach — real closing brace below
        void 0

        resolve({ transactions, categoryMap })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsBinaryString(file)
  })
}

// ─── Stats helpers ────────────────────────────────────────────
export const groupByCategory = (transactions, type) => {
  const map = {}
  transactions
    .filter(t => t.type === type)
    .forEach(t => {
      map[t.category] = (map[t.category] || 0) + t.amount
    })
  const total = Object.values(map).reduce((a, b) => a + b, 0)
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({ name, amount, pct: total ? Math.round((amount / total) * 100) : 0 }))
}

export const get6MonthTrend = (transactions) => {
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = subMonths(new Date(), i)
    const key = format(d, 'yyyy-MM')
    months.push({ label: format(d, 'MMM'), key, income: 0, expense: 0 })
  }
  transactions.forEach(t => {
    const key = t.date?.substring(0, 7)
    const m = months.find(m => m.key === key)
    if (m) m[t.type] += t.amount
  })
  return months
}

// ─── ROLES ───────────────────────────────────────────────────
export const ROLES = [
  { value: 'all-access', label: 'All Access', desc: 'Can do everything except manage members' },
  { value: 'record-edit', label: 'Record & Edit', desc: 'Add and edit transactions only' },
  { value: 'view-only', label: 'View Only', desc: 'Read-only access' },
]

// Compact formatter for tight spaces — abbreviates large numbers
// e.g. NGN 976,199 → NGN 976K, NGN 1,500,000 → NGN 1.5M
export const fmtCurrencyCompact = (n, currency = 'USD') => {
  const abs = Math.abs(n || 0)
  const sign = (n || 0) < 0 ? '-' : ''
  const sym = getCurrencySymbol(currency)

  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${sign}${sym}${(abs / 1_000).toFixed(0)}K`
  return `${sign}${sym}${abs.toFixed(2)}`
}
