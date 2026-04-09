import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { getTransactions } from '../firebase/service'
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

// ── Squarified Treemap algorithm ─────────────────────────────
// Returns array of { x, y, w, h, ...item } for each node
function squarify(items, x, y, w, h) {
  if (!items.length) return []
  const total = items.reduce((s, i) => s + i.value, 0)
  if (!total || w <= 0 || h <= 0) return []

  const results = []
  let remaining = [...items]
  let rx = x, ry = y, rw = w, rh = h

  while (remaining.length > 0) {
    const isWide = rw >= rh
    const rowLength = isWide ? rh : rw
    const rowItems = []
    let rowSum = 0
    let bestRatio = Infinity

    for (let i = 0; i < remaining.length; i++) {
      rowItems.push(remaining[i])
      rowSum += remaining[i].value
      const rowArea = (rowSum / total) * (rw * rh)
      const rowWidth = rowArea / rowLength
      let ratio = 0
      for (const item of rowItems) {
        const itemLen = (item.value / rowSum) * rowLength
        ratio = Math.max(ratio, Math.max(rowWidth / itemLen, itemLen / rowWidth))
      }
      if (ratio > bestRatio && rowItems.length > 1) {
        rowItems.pop()
        break
      }
      bestRatio = ratio
    }

    // Layout this row
    const rowSum2 = rowItems.reduce((s, i) => s + i.value, 0)
    const rowArea = (rowSum2 / total) * (rw * rh)
    const rowWidth = rowArea / rowLength
    let offset = isWide ? ry : rx

    rowItems.forEach(item => {
      const itemLen = (item.value / rowSum2) * rowLength
      const rect = isWide
        ? { x: rx, y: offset, w: rowWidth, h: itemLen }
        : { x: offset, y: ry, w: itemLen, h: rowWidth }
      results.push({ ...item, ...rect })
      offset += itemLen
    })

    remaining = remaining.slice(rowItems.length)
    if (isWide) { rx += rowWidth; rw -= rowWidth }
    else        { ry += rowWidth; rh -= rowWidth }
  }

  return results
}

// ── Treemap component ─────────────────────────────────────────
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
  const GAP = 3

  // Map data to treemap input
  const items = data.map((d, i) => ({
    ...d,
    value: d.amount,
    color: colors[i % colors.length],
    index: i,
  }))

  const rects = (w > 0 && h > 0) ? squarify(items, 0, 0, w, h) : []

  return (
    <div ref={containerRef} className="treemap-container">
      {rects.map((r, i) => {
        const rectW = r.w - GAP
        const rectH = r.h - GAP
        if (rectW <= 4 || rectH <= 4) return null

        const showLabel = rectW >= 50 && rectH >= 36
        const showSub   = rectW >= 70 && rectH >= 52
        const showAmt   = rectW >= 60 && rectH >= 64

        // Truncate name based on available width
        const maxChars = Math.max(3, Math.floor(rectW / 8))
        const displayName = r.name.length > maxChars
          ? r.name.slice(0, maxChars) + '…'
          : r.name

        return (
          <button
            key={r.name}
            className="treemap-cell"
            style={{
              left: r.x + GAP / 2, top: r.y + GAP / 2,
              width: rectW, height: rectH,
              background: r.color,
            }}
            onClick={() => onSelect && onSelect(r)}
          >
            {showLabel && (
              <div className="treemap-label">
                <div className="treemap-name"
                  style={{ fontSize: Math.min(14, Math.max(9, rectW / 9)) }}
                >
                  {displayName}
                </div>
                {showSub && (
                  <div className="treemap-pct"
                    style={{ fontSize: Math.min(12, Math.max(8, rectW / 11)) }}
                  >
                    {r.pct}%
                  </div>
                )}
                {showAmt && (
                  <div className="treemap-amt"
                    style={{ fontSize: Math.min(11, Math.max(8, rectW / 12)) }}
                  >
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

// ── Smart period navigator ────────────────────────────────────
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
      const e = endOfWeek(anchor,   { weekStartsOn: 1 })
      return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`
    }
    return ''
  }
  const isAtLimit = () => {
    if (period === 'Annually') return anchor.getFullYear() >= new Date().getFullYear()
    if (period === 'Monthly')  return anchor >= startOfMonth(new Date())
    if (period === 'Weekly')   return anchor >= startOfWeek(new Date(), { weekStartsOn: 1 })
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
  const [period, setPeriod]             = useState('Monthly')
  const [anchor, setAnchor]             = useState(new Date())
  const [customStart, setCustomStart]   = useState(toFirestoreDate(startOfMonth(new Date())))
  const [customEnd, setCustomEnd]       = useState(toFirestoreDate(endOfMonth(new Date())))
  const [txType, setTxType]             = useState('expense')
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading]           = useState(true)
  const [drillCat, setDrillCat]         = useState(null)
  const [drillSub, setDrillSub]         = useState(null)
  const [editTx, setEditTx]             = useState(null)

  useEffect(() => { load() }, [period, anchor, customStart, customEnd, householdId, reloadTrigger])

  const getRange = () => {
    if (period === 'Custom')   return { start: customStart, end: customEnd }
    if (period === 'Weekly')   return {
      start: toFirestoreDate(startOfWeek(anchor, { weekStartsOn: 1 })),
      end:   toFirestoreDate(endOfWeek(anchor,   { weekStartsOn: 1 }))
    }
    if (period === 'Annually') return {
      start: toFirestoreDate(startOfYear(anchor)),
      end:   toFirestoreDate(endOfYear(anchor))
    }
    return { start: toFirestoreDate(startOfMonth(anchor)), end: toFirestoreDate(endOfMonth(anchor)) }
  }

  const load = async () => {
    setLoading(true)
    try {
      const { start, end } = getRange()
      const txs = await getTransactions(user.uid, householdId, start, end)
      setTransactions(txs)
    } finally { setLoading(false) }
  }

  const fmt  = n => fmtCurrency(n, currency)
  const fmtC = n => fmtCurrencyCompact(n, currency)

  const breakdown    = groupByCategory(transactions, txType)
  const incomeTotal  = transactions.filter(t => t.type === 'income').reduce((a,t)  => a+t.amount, 0)
  const expenseTotal = transactions.filter(t => t.type === 'expense').reduce((a,t) => a+t.amount, 0)

  const catTxs = drillCat
    ? transactions.filter(t => t.type === txType && t.category === drillCat)
    : []

  const subBreakdown = (() => {
    if (!drillCat) return []
    const map = {}
    catTxs.forEach(t => {
      const k = t.subcategory?.trim() || '(no subcategory)'
      map[k] = (map[k] || 0) + t.amount
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

      {/* Income / Expense tabs */}
      <div className="stats-type-tabs">
        <button
          className={`stats-type-tab ${txType === 'income' ? 'active' : ''}`}
          onClick={() => setTxType('income')}
        >
          <span className="stt-label">Income</span>
          {txType === 'income' && <span className="stt-total">{fmt(incomeTotal)}</span>}
        </button>
        <button
          className={`stats-type-tab ${txType === 'expense' ? 'active expense' : ''}`}
          onClick={() => setTxType('expense')}
        >
          <span className="stt-label">Exp.</span>
          {txType === 'expense' && <span className="stt-total">{fmt(expenseTotal)}</span>}
        </button>
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
            {/* Treemap */}
            <div className="treemap-wrap">
              <Treemap
                data={breakdown}
                colors={COLORS}
                fmt={fmt}
                fmtC={fmtC}
                onSelect={d => { setDrillCat(d.name); setDrillSub(null) }}
              />
            </div>

            {/* Category list */}
            <div className="stats-cat-list">
              {breakdown.map((cat, i) => {
                const catDef = categories.find(c => c.name === cat.name)
                const icon   = catDef?.icon || ''
                return (
                  <button key={cat.name} className="stats-cat-item"
                    onClick={() => { setDrillCat(cat.name); setDrillSub(null) }}
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

      {/* Drill level 1 — subcategories */}
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
                        <div className="drill-sub-dot" style={{ background: COLORS[i % COLORS.length] }} />
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

      {/* Drill level 2 — transactions */}
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
