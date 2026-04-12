import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { getTransactions } from '../firebase/service'
import { getSavingsAccounts, getLoans, getSavingsTransactions, getLoanPayments } from '../firebase/savingsLoans'
import { groupByCategory, fmtCurrency, fmtCurrencyCompact, toFirestoreDate } from '../utils/helpers'
import {
  startOfMonth, endOfMonth, startOfYear, endOfYear,
  startOfWeek, endOfWeek, addMonths, subMonths,
  addYears, subYears, addWeeks, subWeeks, format
} from 'date-fns'
import TransactionItem from '../components/TransactionItem'
import AddTransaction from '../components/AddTransaction'
import './Stats.css'

const PERIOD_OPTIONS = ['Weekly', 'Monthly', 'Annually', 'Custom']
const TX_TYPES = ['expense', 'income', 'savings', 'loans']

const COLORS = [
  '#e05c5c','#3b82a0','#e8923a','#5ba05b','#8b5cf6',
  '#c7a020','#2e8b7a','#d4608a','#4a7fc1','#7a9e3b',
  '#b05090','#3a9e8a','#c0703a','#5070c0','#8e4e3e',
]

const badgeColor = (pct) => {
  if (pct >= 25) return '#ef4444'
  if (pct >= 18) return '#f97316'
  if (pct >= 12) return '#eab308'
  if (pct >= 7)  return '#84cc16'
  if (pct >= 4)  return '#22c55e'
  return '#06b6d4'
}

// ── Squarified Treemap ───────────────────────────────────────
// Returns pixel-perfect rects that fill the entire container with no gaps
function squarify(items, x, y, w, h) {
  if (!items.length || w <= 0 || h <= 0) return []
  const total = items.reduce((s, i) => s + i.value, 0)
  if (!total) return []

  const rows    = []   // each row: { isWide, x, y, w, h, items }
  let remaining = [...items]
  let rx = x, ry = y, rw = w, rh = h

  while (remaining.length > 0) {
    const isWide    = rw >= rh
    const rowLength = isWide ? rh : rw
    const rowItems  = []
    let rowSum = 0, bestRatio = Infinity

    for (let i = 0; i < remaining.length; i++) {
      rowItems.push(remaining[i])
      rowSum += remaining[i].value
      const rowArea  = (rowSum / total) * (rw * rh)
      const rowWidth = rowArea / rowLength
      let ratio = 0
      for (const item of rowItems) {
        const itemLen = (item.value / rowSum) * rowLength
        ratio = Math.max(ratio, Math.max(rowWidth / itemLen, itemLen / rowWidth))
      }
      if (ratio > bestRatio && rowItems.length > 1) { rowItems.pop(); break }
      bestRatio = ratio
    }

    const rowSum2  = rowItems.reduce((s, i) => s + i.value, 0)
    const rowArea  = (rowSum2 / total) * (rw * rh)
    const rowWidth = rowArea / rowLength

    rows.push({ isWide, rx, ry, rw, rh, rowWidth, rowSum2, items: rowItems })
    remaining = remaining.slice(rowItems.length)
    if (isWide) { rx += rowWidth; rw -= rowWidth }
    else        { ry += rowWidth; rh -= rowWidth }
  }

  // Second pass: stretch each row's cross-axis to fill exactly remaining space
  // This eliminates floating-point gaps completely
  const results = []
  let usedCross_x = x, usedCross_y = y

  rows.forEach((row, rowIdx) => {
    const isLast = rowIdx === rows.length - 1
    const { isWide, items: rowItems, rowSum2 } = row

    // Stretch the row's cross-axis to fill remaining space
    const crossSize = isWide
      ? (isLast ? (y + h) - usedCross_x : row.rowWidth)
      : (isLast ? (y + h) - usedCross_y : row.rowWidth)

    const rowX = isWide ? usedCross_x : row.ry
    const rowY = isWide ? row.ry      : usedCross_y

    let offset = isWide ? rowY : rowX
    const mainSize = isWide ? row.rh : row.rw

    rowItems.forEach((item, itemIdx) => {
      const isLastItem = itemIdx === rowItems.length - 1
      // Stretch last item to fill remaining main-axis space
      const mainEnd = isWide ? rowY + mainSize : rowX + mainSize
      const itemMain = isLastItem
        ? mainEnd - offset
        : (item.value / rowSum2) * mainSize

      const rect = isWide
        ? { x: rowX, y: offset, w: crossSize, h: itemMain }
        : { x: offset, y: rowX, w: itemMain, h: crossSize }

      results.push({ ...item, ...rect })
      offset += itemMain
    })

    if (isWide) usedCross_x += crossSize
    else        usedCross_y += crossSize
  })

  return results
}

// ── Treemap component ────────────────────────────────────────
function Treemap({ data, colors, fmt, fmtC, onSelect }) {
  const containerRef = useRef(null)
  const [dims, setDims] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setDims({ w: Math.floor(width), h: Math.floor(height) })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const { w, h } = dims
  const GAP = 2

  const items = data.map((d, i) => ({
    ...d, value: d.amount, color: colors[i % colors.length], index: i,
  }))

  const rects = (w > 0 && h > 0) ? squarify(items, 0, 0, w, h) : []

  return (
    <div ref={containerRef} className="treemap-container">
      {rects.map((r) => {
        const cw = r.w - GAP
        const ch = r.h - GAP
        if (cw <= 2 || ch <= 2) return null

        // Adaptive font sizing based on cell dimensions
        const area    = cw * ch
        const minDim  = Math.min(cw, ch)
        const nameFz  = Math.min(14, Math.max(7,  minDim / 5.5))
        const pctFz   = Math.min(13, Math.max(7,  minDim / 6))
        const amtFz   = Math.min(11, Math.max(6.5, minDim / 7))

        // Show/hide layers based on available area
        const showName = cw >= 24 && ch >= 18
        const showPct  = cw >= 30 && ch >= 28  && area >= 800
        const showAmt  = cw >= 36 && ch >= 42  && area >= 1400

        // Truncate based on px width (approx 6px per char at default size)
        const maxChars = Math.max(2, Math.floor(cw / (nameFz * 0.6)))
        const displayName = r.name.length > maxChars
          ? r.name.slice(0, maxChars - 1) + '…'
          : r.name

        return (
          <button
            key={r.name}
            className="treemap-cell"
            style={{
              left: r.x + GAP / 2, top: r.y + GAP / 2,
              width: cw, height: ch,
              background: r.color,
            }}
            onClick={() => onSelect && onSelect(r)}
          >
            {showName && (
              <div className="treemap-label">
                <div className="treemap-name" style={{ fontSize: nameFz }}>
                  {displayName}
                </div>
                {showPct && (
                  <div className="treemap-pct" style={{ fontSize: pctFz }}>
                    {r.pct}%
                  </div>
                )}
                {showAmt && (
                  <div className="treemap-amt" style={{ fontSize: amtFz }}>
                    {fmtC(r.amount)}
                  </div>
                )}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Period nav ───────────────────────────────────────────────
function PeriodNav({ period, anchor, onChange }) {
  const prev = () => {
    if (period === 'Monthly')  onChange(subMonths(anchor, 1))
    if (period === 'Annually') onChange(subYears(anchor, 1))
    if (period === 'Weekly')   onChange(subWeeks(anchor, 1))
  }
  const next = () => {
    if (period === 'Monthly')  onChange(addMonths(anchor, 1))
    if (period === 'Annually') onChange(addYears(anchor, 1))
    if (period === 'Weekly')   onChange(addWeeks(anchor, 1))
  }
  const label = () => {
    if (period === 'Monthly')  return format(anchor, 'MMMM yyyy')
    if (period === 'Annually') return format(anchor, 'yyyy')
    if (period === 'Weekly') {
      const s = startOfWeek(anchor, { weekStartsOn: 1 })
      const e = endOfWeek(anchor, { weekStartsOn: 1 })
      return `${format(s,'MMM d')} – ${format(e,'MMM d, yyyy')}`
    }
    return ''
  }
  const isAtLimit = () => {
    if (period === 'Annually') return anchor.getFullYear() >= new Date().getFullYear()
    if (period === 'Monthly')  return anchor >= startOfMonth(new Date())
    if (period === 'Weekly')   return anchor >= startOfWeek(new Date(),{weekStartsOn:1})
    return false
  }
  return (
    <div className="period-nav">
      <button className="period-nav-btn" onClick={prev}>‹</button>
      <span className="period-nav-label">{label()}</span>
      <button className="period-nav-btn" onClick={next} disabled={isAtLimit()}>›</button>
    </div>
  )
}

export default function Stats() {
  const { user, householdId, categories, reloadTrigger, currency } = useApp()
  const [period, setPeriod]           = useState('Monthly')
  const [anchor, setAnchor]           = useState(new Date())
  const [customStart, setCustomStart] = useState(toFirestoreDate(startOfMonth(new Date())))
  const [customEnd, setCustomEnd]     = useState(toFirestoreDate(endOfMonth(new Date())))
  const [txType, setTxType]           = useState('expense')
  const [transactions, setTransactions] = useState([])
  const [savingsAccounts, setSavingsAccounts] = useState([])
  const [loans, setLoans]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [drillCat, setDrillCat]       = useState(null)
  const [drillSub, setDrillSub]       = useState(null)
  const [editTx, setEditTx]           = useState(null)

  useEffect(() => { load() }, [period, anchor, customStart, customEnd, householdId, reloadTrigger])

  const getRange = () => {
    if (period === 'Custom')   return { start: customStart, end: customEnd }
    if (period === 'Weekly')   return {
      start: toFirestoreDate(startOfWeek(anchor,{weekStartsOn:1})),
      end:   toFirestoreDate(endOfWeek(anchor,{weekStartsOn:1}))
    }
    if (period === 'Annually') return {
      start: toFirestoreDate(startOfYear(anchor)),
      end:   toFirestoreDate(endOfYear(anchor))
    }
    return {
      start: toFirestoreDate(startOfMonth(anchor)),
      end:   toFirestoreDate(endOfMonth(anchor))
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const { start, end } = getRange()
      const [txs, savAccts, loanList] = await Promise.all([
        getTransactions(user.uid, householdId, start, end),
        getSavingsAccounts(user.uid, householdId),
        getLoans(user.uid, householdId),
      ])
      setTransactions(txs)
      setSavingsAccounts(savAccts)
      setLoans(loanList)
    } finally { setLoading(false) }
  }

  const fmt  = n => fmtCurrency(n, currency)
  const fmtC = n => fmtCurrencyCompact(n, currency)

  // Savings account names — used to exclude them from expenses
  const savingsNames = savingsAccounts.map(s => s.name.toLowerCase())
  const isSavingsTx  = t => savingsNames.some(n => t.subcategory?.toLowerCase() === n) ||
    t.category?.toLowerCase().includes('saving')

  // Filter transactions by tab
  const expenseTxs = transactions.filter(t => t.type === 'expense' && !isSavingsTx(t))
  const incomeTxs  = transactions.filter(t => t.type === 'income')

  // Savings breakdown — each account as a "category"
  const savingsBreakdown = (() => {
    const totalSav = savingsAccounts.reduce((a, s) => a + (s.balance || 0), 0)
    return savingsAccounts
      .filter(s => s.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .map(s => ({
        name:   s.name,
        amount: s.balance,
        pct:    totalSav > 0 ? Math.round((s.balance / totalSav) * 100) : 0,
        icon:   s.icon || '💰',
      }))
  })()

  // Loans breakdown — each loan as a "category"
  const loansBreakdown = (() => {
    const totalDebt = loans.reduce((a, l) => a + (l.remainingBalance || 0), 0)
    return loans
      .filter(l => l.remainingBalance > 0)
      .sort((a, b) => b.remainingBalance - a.remainingBalance)
      .map(l => ({
        name:   l.name,
        amount: l.remainingBalance,
        pct:    totalDebt > 0 ? Math.round((l.remainingBalance / totalDebt) * 100) : 0,
        icon:   l.icon || '🏦',
      }))
  })()

  const breakdown = (() => {
    if (txType === 'savings') return savingsBreakdown
    if (txType === 'loans')   return loansBreakdown
    const txs = txType === 'expense' ? expenseTxs : incomeTxs
    return groupByCategory(txs, txType === 'expense' ? 'expense' : 'income')
  })()

  const totals = {
    expense: expenseTxs.reduce((a,t) => a+t.amount, 0),
    income:  incomeTxs.reduce((a,t)  => a+t.amount, 0),
    savings: savingsAccounts.reduce((a,s) => a+(s.balance||0), 0),
    loans:   loans.reduce((a,l) => a+(l.remainingBalance||0), 0),
  }

  // Drill into regular tx categories
  const catTxs = drillCat
    ? (txType === 'expense' ? expenseTxs : incomeTxs)
        .filter(t => t.category === drillCat)
    : []

  const subBreakdown = (() => {
    if (!drillCat || txType === 'savings' || txType === 'loans') return []
    const map = {}
    catTxs.forEach(t => {
      const k = t.subcategory?.trim() || '(no subcategory)'
      map[k] = (map[k]||0) + t.amount
    })
    const sub = Object.values(map).reduce((a,b) => a+b, 0)
    return Object.entries(map).sort((a,b) => b[1]-a[1])
      .map(([name, amount]) => ({ name, amount, pct: sub ? Math.round((amount/sub)*100) : 0 }))
  })()

  const subTxs = drillSub
    ? (drillSub === '__all__'
        ? catTxs
        : catTxs.filter(t => (t.subcategory?.trim()||'(no subcategory)') === drillSub))
    : []

  const periodLabel = () => {
    if (period === 'Weekly')   return `Week of ${format(startOfWeek(anchor,{weekStartsOn:1}),'MMM d')}`
    if (period === 'Annually') return format(anchor, 'yyyy')
    if (period === 'Monthly')  return format(anchor, 'MMMM yyyy')
    return `${customStart} → ${customEnd}`
  }

  const TAB_CONFIG = [
    { id: 'expense', label: 'Exp.',    activeClass: 'expense' },
    { id: 'income',  label: 'Income',  activeClass: '' },
    { id: 'savings', label: '💰 Sav.', activeClass: 'savings' },
    { id: 'loans',   label: '🏦 Loans',activeClass: 'loans' },
  ]

  return (
    <div className="screen stats-screen">
      {/* Period tabs */}
      <div className="stats-header">
        <div className="stats-period-tabs">
          {PERIOD_OPTIONS.map(p => (
            <button key={p}
              className={`stats-period-tab ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)}
            >{p}</button>
          ))}
        </div>
        <div className="stats-nav-row">
          {period === 'Custom' ? (
            <div className="custom-range">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
              <span>→</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
            </div>
          ) : (
            <PeriodNav period={period} anchor={anchor} onChange={setAnchor} />
          )}
        </div>
      </div>

      {/* 4-tab type selector */}
      <div className="stats-type-tabs">
        {TAB_CONFIG.map(tab => (
          <button
            key={tab.id}
            className={`stats-type-tab ${txType === tab.id ? `active ${tab.activeClass}` : ''}`}
            onClick={() => { setTxType(tab.id); setDrillCat(null); setDrillSub(null) }}
          >
            <span className="stt-label">{tab.label}</span>
            {txType === tab.id && (
              <span className="stt-total">{fmtC(totals[tab.id])}</span>
            )}
          </button>
        ))}
      </div>

      <div className="scroll-area stats-scroll">
        {loading ? (
          <div className="load-row"><span className="spinner" /></div>
        ) : breakdown.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 40 }}>
            <span className="icon">📊</span>
            <p>No {txType} data for {periodLabel()}.</p>
          </div>
        ) : (
          <>
            <div className="treemap-wrap">
              <Treemap
                data={breakdown} colors={COLORS}
                fmt={fmt} fmtC={fmtC}
                onSelect={d => {
                  if (txType === 'expense' || txType === 'income') {
                    setDrillCat(d.name); setDrillSub(null)
                  }
                }}
              />
            </div>

            <div className="stats-cat-list">
              {breakdown.map((cat, i) => {
                const catDef = categories.find(c => c.name === cat.name)
                const icon   = cat.icon || catDef?.icon || ''
                return (
                  <button key={cat.name} className="stats-cat-item"
                    onClick={() => {
                      if (txType === 'expense' || txType === 'income') {
                        setDrillCat(cat.name); setDrillSub(null)
                      }
                    }}
                  >
                    <div className="stats-cat-swatch" style={{ background: COLORS[i % COLORS.length] }} />
                    <div className="stats-pct-badge" style={{ background: badgeColor(cat.pct) }}>
                      {cat.pct}%
                    </div>
                    <div className="stats-cat-name">
                      {icon && <span className="stats-cat-icon">{icon}</span>}
                      <span className="stats-cat-text">{cat.name}</span>
                    </div>
                    <div className="stats-cat-amount">{fmt(cat.amount)}</div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Drill level 1 */}
      {drillCat && !drillSub && (
        <>
          <div className="sheet-overlay" onClick={() => setDrillCat(null)} />
          <div className="sheet">
            <div className="sheet-handle" />
            <div className="sheet-header">
              <button className="btn btn-ghost" onClick={() => setDrillCat(null)}>✕</button>
              <span className="sheet-title">{drillCat}</span>
              <span style={{ width: 40 }} />
            </div>
            <div className="sheet-body">
              <div className="drill-total">
                {fmt(catTxs.reduce((a,t) => a+t.amount, 0))} · {catTxs.length} transactions
              </div>
              <button className="drill-all-btn" onClick={() => setDrillSub('__all__')}>
                <span>All transactions</span>
                <span className="drill-all-count">{catTxs.length}</span>
              </button>
              {subBreakdown.length > 0 && (
                <div className="drill-sub-list">
                  <div className="drill-sub-title">By Subcategory</div>
                  {subBreakdown.map((sub, i) => (
                    <button key={sub.name} className="drill-sub-row" onClick={() => setDrillSub(sub.name)}>
                      <div className="drill-sub-left">
                        <div className="drill-sub-dot" style={{ background: COLORS[i%COLORS.length] }} />
                        <div>
                          <div className="drill-sub-name">{sub.name}</div>
                          <div className="drill-sub-amt">{fmt(sub.amount)}</div>
                        </div>
                      </div>
                      <div className="drill-sub-right">
                        <div className="pct-badge" style={{ background: COLORS[i%COLORS.length]+'22', color: COLORS[i%COLORS.length] }}>
                          {sub.pct}%
                        </div>
                        <span className="drill-sub-arrow">›</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Drill level 2 */}
      {drillCat && drillSub && (
        <>
          <div className="sheet-overlay" onClick={() => setDrillSub(null)} />
          <div className="sheet">
            <div className="sheet-handle" />
            <div className="sheet-header">
              <button className="btn btn-ghost" onClick={() => setDrillSub(null)}>‹ Back</button>
              <span className="sheet-title">{drillSub === '__all__' ? drillCat : drillSub}</span>
              <span style={{ width: 40 }} />
            </div>
            <div className="sheet-body">
              <div className="drill-total">
                {fmt(subTxs.reduce((a,t) => a+t.amount, 0))} · {subTxs.length} transactions
              </div>
              {subTxs.map(tx => (
                <TransactionItem key={tx.id} tx={tx} categories={categories}
                  onClick={t => { setDrillCat(null); setDrillSub(null); setEditTx(t) }} />
              ))}
            </div>
          </div>
        </>
      )}

      {editTx && (
        <AddTransaction tx={editTx} onClose={() => setEditTx(null)}
          onSaved={() => { setEditTx(null); load() }} />
      )}
    </div>
  )
}
