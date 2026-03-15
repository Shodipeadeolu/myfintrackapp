import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear, subMonths } from 'date-fns'
import * as XLSX from 'xlsx'
import SparkMD5 from 'spark-md5'

// ─── Formatting ───────────────────────────────────────────────
export const fmtCurrency = (n, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n || 0)

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
export const parseTransactionXLSX = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

        const skipKeywords = ['transfer', 'balance', 'opening', 'closing']
        const seen = new Set()
        const transactions = []
        const categoryMap = {}

        rows.forEach(row => {
          const desc = String(row.Description || row.description || row.Memo || row.memo || '').trim()
          const amtRaw = row.Amount || row.amount || row.Debit || row.Credit || 0
          const amt = parseFloat(String(amtRaw).replace(/[^0-9.-]/g, ''))
          const dateRaw = row.Date || row.date || row['Transaction Date'] || ''
          const cat = String(row.Category || row.category || 'Miscellaneous').trim()
          const subcat = String(row.Subcategory || row.subcategory || '').trim()

          if (!amt || isNaN(amt)) return
          if (skipKeywords.some(k => desc.toLowerCase().includes(k))) return

          const hash = SparkMD5.hash(`${dateRaw}|${desc}|${amt}`)
          if (seen.has(hash)) return
          seen.add(hash)

          let dateStr = ''
          try {
            const parsed = new Date(dateRaw)
            dateStr = format(parsed, 'yyyy-MM-dd')
          } catch {
            return
          }

          const type = amt < 0 ? 'expense' : 'income'
          if (!categoryMap[cat]) categoryMap[cat] = { type, subcategories: [] }
          if (subcat && !categoryMap[cat].subcategories.includes(subcat))
            categoryMap[cat].subcategories.push(subcat)

          transactions.push({
            amount: Math.abs(amt),
            type,
            category: cat,
            subcategory: subcat,
            note: desc,
            date: dateStr,
            hash
          })
        })

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
