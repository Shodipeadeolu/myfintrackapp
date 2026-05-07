import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { getTransactions } from '../firebase/service'
import { groupByCategory, fmtCurrency, fmtCurrencyCompact, toFirestoreDate } from '../utils/helpers'
import { fmtSec } from '../utils/secCurrency'
import { calcSavingsBalance, calcLoanBalance } from '../utils/balanceCalc'
import {
  startOfMonth, endOfMonth, startOfYear, endOfYear,
  startOfWeek, endOfWeek, addMonths, subMonths,
  addYears, subYears, addWeeks, subWeeks, format
} from 'date-fns'
import TransactionItem from '../components/TransactionItem'
import AddTransaction from '../components/AddTransaction'
import SavingsSheet from '../components/SavingsSheet'
import LoansSheet from '../components/LoansSheet'
import './Stats.css'

const PERIOD_OPTIONS = ['Weekly', 'Monthly', 'Annually', 'Custom']

const COLORS = [
  '#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff922b',
  '#cc5de8','#20c997','#f06595','#74c0fc','#a9e34b',
  '#f783ac','#38d9a9','#ff8787','#845ef7'
]

const badgeColor = (pct) => {
  if (pct >= 25) return '#ef4444'
  if (pct >= 18) return '#f97316'
  if (pct >= 12) return '#eab308'
  if (pct >= 7)  return '#84cc16'
  if (pct >= 4)  return '#22c55e'
  return '#06b6d4'
}

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
      return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`
    }
    return ''
  }
  const atLimit = () => {
    if (period === 'Annually') return anchor.getFullYear() >= new Date().getFullYear()
    if (period === 'Monthly')  return anchor >= startOfMonth(new Date())
    if (period === 'Weekly')   return anchor >= startOfWeek(new Date(), { weekStartsOn: 1 })
    return false
  }
  return (
    <div className="period-nav">
      <button className="period-nav-btn" onClick={prev}>‹</button>
      <span className="period-nav-label">{label()}</span>
      <button className="period-nav-btn" onClick={next} disabled={atLimit()}>›</button>
    </div>
  )
}

function squarify(items, x, y, w, h) {
  if (!items.length || w <= 0 || h <= 0) return []
  const total = items.reduce((s, d) => s + d.value, 0)
  if (!total) return []
  const results = []
  let remaining = [...items]
  let cx = x, cy = y, cw = w, ch = h

  while (remaining.length) {
    const horiz = cw >= ch
    const lineLen = horiz ? cw : ch
    let batch = [], batchSum = 0, bestRatio = Infinity

    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i]
      const newBatch = [...batch, item]
      const newSum = batchSum + item.value
      const area = (newSum / total) * (cw * ch)
      const side = area / lineLen
      let worst = 0
      for (const b of newBatch) {
        const bArea = (b.value / total) * (cw * ch)
        const bSide = bArea / side
        const ratio = Math.max(side / bSide, bSide / side)
        worst = Math.max(worst, ratio)
      }
      if (worst > bestRatio) break
      bestRatio = worst; batch = newBatch; batchSum = newSum
    }

    const batchArea = (batchSum / total) * (cw * ch)
    const side = batchArea / lineLen
    let offset = 0
    for (const b of batch) {
      const bArea = (b.value / total) * (cw * ch)
      const bLen = bArea / side
      results.push({
        ...b,
        x: horiz ? cx : cx + offset,
        y: horiz ? cy + offset : cy,
        w: horiz ? side : bLen,
        h: horiz ? bLen : side,
      })
      offset += bLen
    }
    if (horiz) { cx += side; cw -= side }
    else { cy += side; ch -= side }
    remaining = remaining.slice(batch.length)
  }
  return results
}

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

  const total = data.reduce((s, d) => s + d.amount, 0)
  const items = data.map((d, i) => ({ ...d, value: d.amount, color: colors[i % colors.length] }))
  const { w, h } = dims
  const rects = w > 0 && h > 0 ? squarify(items, 0, 0, w, h) : []

  return (
    <div ref={containerRef} className="treemap-container">
      {rects.map((r, i) => {
        const pct = total > 0 ? Math.round((r.amount / total) * 100) : 0
        const small = r.w < 60 || r.h < 40
        const tinyW = r.w < 50, tinyH = r.h < 32
        const fontSize = r.w < 80 ? 9 : r.w < 120 ? 10 : 11
        return (
          <button key={i} className="treemap-cell"
            style={{ left: r.x, top: r.y, width: r.w, height: r.h, background: r.color }}
            onClick={() => onSelect(r)}>
            {!tinyW && !tinyH && (
              <div className="treemap-label">
                {!small && <span className="treemap-name" style={{ fontSize }}>{r.name}</span>}
                <span className="treemap-pct" style={{ fontSize }}>{pct}%</span>
                {!small && <span className="treemap-amt" style={{ fontSize: fontSize - 1 }}>{fmtC(r.amount)}</span>}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default function Stats() {
  const { user, householdId, categories, reloadTrigger, currency, secEnabled, secCurrency, secRate } = useApp()
  const [period, setPeriod]           = useState('Monthly')
  const [anchor, setAnchor]           = useState(new Date())
  const [customStart, setCustomStart] = useState(toFirestoreDate(startOfMonth(new Date())))
  const [customEnd, setCustomEnd]     = useState(toFirestoreDate(endOfMonth(new Date())))
  const [txType, setTxType]           = useState('expense')
  const [transactions, setTransactions] = useState([])
  const [allTimeTxs, setAllTimeTxs]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [drillCat, setDrillCat]       = useState(null)
  const [drillSub, setDrillSub]       = useState(null)
  const [editTx, setEditTx]           = useState(null)
  const [showSavings, setShowSavings] = useState(false)
  const [showLoans, setShowLoans]     = useState(false)

  useEffect(() => { load() }, [period, anchor, customStart, customEnd, householdId, reloadTrigger])

  // Also load all-time for savings/loan balances
  useEffect(() => {
    if (!user) return
    getTransactions(user.uid, householdId, '2000-01-01', '2099-12-31')
      .then(setAllTimeTxs).catch(console.error)
  }, [householdId, reloadTrigger])

  const getRange = () => {
    if (period === 'Custom')   return { start: customStart, end: customEnd }
    if (period === 'Weekly')   return { start: toFirestoreDate(startOfWeek(anchor, { weekStartsOn: 1 })), end: toFirestoreDate(endOfWeek(anchor, { weekStartsOn: 1 })) }
    if (period === 'Annually') return { start: toFirestoreDate(startOfYear(anchor)), end: toFirestoreDate(endOfYear(anchor)) }
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
  const sec  = n => fmtSec(n, secEnabled, secRate, secCurrency)

  // Savings/Loans use all-time transactions for balance
  const savingsBalance = calcSavingsBalance(allTimeTxs)
  const loanBalance    = calcLoanBalance(allTimeTxs)

  // Only expense/income use the period-based breakdown
  const breakdown = ['expense', 'income'].includes(txType)
    ? groupByCategory(transactions, txType)
    : []

  const totalByType = (type) => transactions.filter(t => t.type === type).reduce((a,t) => a+t.amount, 0)

  const catTxs = drillCat ? transactions.filter(t => t.type === txType && t.category === drillCat) : []

  const subBreakdown = (() => {
    if (!drillCat) return []
    const map = {}
    catTxs.forEach(t => { const k = t.subcategory?.trim() || '(no subcategory)'; map[k] = (map[k]||0)+t.amount })
    const sub = Object.values(map).reduce((a,b) => a+b, 0)
    return Object.entries(map).sort((a,b) => b[1]-a[1])
      .map(([name, amount]) => ({ name, amount, pct: sub ? Math.round((amount/sub)*100) : 0 }))
  })()

  const subTxs = drillSub
    ? (drillSub === '__all__' ? catTxs : catTxs.filter(t => (t.subcategory?.trim()||'(no subcategory)') === drillSub))
    : []

  const periodLabel = () => {
    if (period === 'Weekly')   return `Week of ${format(startOfWeek(anchor, { weekStartsOn: 1 }), 'MMM d')}`
    if (period === 'Annually') return format(anchor, 'yyyy')
    if (period === 'Monthly')  return format(anchor, 'MMMM yyyy')
    return `${customStart} → ${customEnd}`
  }

  const handleTabClick = (key) => {
    setDrillCat(null); setDrillSub(null)
    if (key === 'savings') { setShowSavings(true); return }
    if (key === 'loans')   { setShowLoans(true);   return }
    setTxType(key)
  }

  const TABS = [
    { key: 'expense', label: 'Exp.',   colorClass: 'expense', total: fmtC(totalByType('expense')), secTotal: sec(totalByType('expense')) },
    { key: 'income',  label: 'Income', colorClass: 'income',  total: fmtC(totalByType('income')),  secTotal: sec(totalByType('income'))  },
    { key: 'savings', label: '💰 Sav.',colorClass: 'savings', total: fmtC(savingsBalance),         secTotal: sec(savingsBalance), isBalance: true },
    { key: 'loans',   label: '🏦 Loans',colorClass:'loans',   total: fmtC(loanBalance),            secTotal: sec(loanBalance),   isBalance: true },
  ]

  return (
    <div className="stats-screen">
      {/* Period tabs */}
      <div className="stats-header">
        <div className="stats-period-tabs">
          {PERIOD_OPTIONS.map(p => (
            <button key={p} className={`stats-period-tab ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)}>{p}</button>
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

      {/* 4 type tabs */}
      <div className="stats-type-tabs">
        {TABS.map(({ key, label, colorClass, total, secTotal, isBalance }) => {
          const active = txType === key && !showSavings && !showLoans
          return (
            <button key={key}
              className={`stats-type-tab ${active ? `active ${colorClass}` : ''}`}
              onClick={() => handleTabClick(key)}>
              <span className="stt-label">{label}</span>
              <span className="stt-totals">
                <span className="stt-total">{total}</span>
                {secTotal && <span className="stt-total-sec">{secTotal}</span>}
                {isBalance && <span className="stt-balance-hint">balance</span>}
              </span>
            </button>
          )
        })}
      </div>

      {/* Treemap */}
      <div className="treemap-wrap">
        {loading ? (
          <div className="treemap-loading"><span className="spinner" /></div>
        ) : breakdown.length === 0 ? (
          <div className="treemap-empty">
            <span style={{ fontSize: 32, opacity: 0.3 }}>📊</span>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
              No {txType} data for {periodLabel()}
            </p>
          </div>
        ) : (
          <Treemap data={breakdown} colors={COLORS} fmt={fmt} fmtC={fmtC}
            onSelect={d => { setDrillCat(d.name); setDrillSub(null) }} />
        )}
      </div>

      {/* Category list */}
      <div className="stats-scroll">
        {!loading && breakdown.length > 0 && (
          <div className="stats-cat-list">
            {breakdown.map((cat, i) => {
              const catDef = categories.find(c => c.name === cat.name)
              const icon = catDef?.icon || ''
              return (
                <button key={cat.name} className="stats-cat-item"
                  onClick={() => { setDrillCat(cat.name); setDrillSub(null) }}>
                  <div className="stats-pct-badge" style={{ background: badgeColor(cat.pct) }}>{cat.pct}%</div>
                  <div className="stats-cat-name">
                    {icon && <span className="stats-cat-icon">{icon}</span>}
                    <span className="stats-cat-text">{cat.name}</span>
                  </div>
                  <div className="stats-cat-amounts">
                    <div className="stats-cat-amount">{fmt(cat.amount)}</div>
                    {sec(cat.amount) && <div className="stats-cat-amount-sec">{sec(cat.amount)}</div>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Drill sheets */}
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
                {fmt(catTxs.reduce((a,t)=>a+t.amount,0))}
                {sec(catTxs.reduce((a,t)=>a+t.amount,0)) && <span className="drill-total-sec"> · {sec(catTxs.reduce((a,t)=>a+t.amount,0))}</span>}
                {' '}· {catTxs.length} transactions
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
                          {sec(sub.amount) && <div className="drill-sub-amt-sec">{sec(sub.amount)}</div>}
                        </div>
                      </div>
                      <div className="drill-sub-right">
                        <div className="pct-badge" style={{ background: COLORS[i%COLORS.length]+'22', color: COLORS[i%COLORS.length] }}>{sub.pct}%</div>
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
                {fmt(subTxs.reduce((a,t)=>a+t.amount,0))}
                {sec(subTxs.reduce((a,t)=>a+t.amount,0)) && <span className="drill-total-sec"> · {sec(subTxs.reduce((a,t)=>a+t.amount,0))}</span>}
                {' '}· {subTxs.length} transactions
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

      {/* Savings & Loans sheets */}
      {showSavings && (
        <SavingsSheet onClose={() => setShowSavings(false)} onSaved={() => { setShowSavings(false); load() }} />
      )}
      {showLoans && (
        <LoansSheet onClose={() => setShowLoans(false)} onSaved={() => { setShowLoans(false); load() }} />
      )}
    </div>
  )
}
