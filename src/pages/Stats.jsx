import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getTransactions } from '../firebase/service'
import { groupByCategory, fmtCurrency, toFirestoreDate } from '../utils/helpers'
import { startOfMonth, endOfMonth, startOfYear, endOfYear, startOfWeek, endOfWeek, format } from 'date-fns'
import MonthNavigator from '../components/MonthNavigator'
import TransactionItem from '../components/TransactionItem'
import AddTransaction from '../components/AddTransaction'
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

// ── SVG Pie with leader-line labels ───────────────────────────
function PieChart({ data, colors }) {
  const W = 340          // SVG canvas width
  const H = 320          // SVG canvas height
  const cx = W / 2       // pie centre x
  const cy = H / 2 - 10 // pie centre y (slightly above middle)
  const R  = 95          // outer radius
  const Ri = 42          // inner hole radius

  const total = data.reduce((s, d) => s + d.amount, 0)
  if (!total) return null

  let startAngle = -Math.PI / 2
  const slices = []

  data.forEach((d, i) => {
    const frac   = d.amount / total
    const angle  = Math.min(frac * 2 * Math.PI, 2 * Math.PI - 0.001)
    const end    = startAngle + angle
    const mid    = startAngle + angle / 2

    // Arc points
    const cos0 = Math.cos(startAngle), sin0 = Math.sin(startAngle)
    const cos1 = Math.cos(end),        sin1 = Math.sin(end)
    const cosMid = Math.cos(mid),      sinMid = Math.sin(mid)
    const large  = angle > Math.PI ? 1 : 0

    const path = [
      `M ${cx + Ri*cos0} ${cy + Ri*sin0}`,
      `A ${Ri} ${Ri} 0 ${large} 1 ${cx + Ri*cos1} ${cy + Ri*sin1}`,
      `L ${cx + R*cos1} ${cy + R*sin1}`,
      `A ${R}  ${R}  0 ${large} 0 ${cx + R*cos0} ${cy + R*sin0}`,
      'Z'
    ].join(' ')

    // Leader line: starts at outer edge, goes outward
    const LR1  = R + 6              // line start (just outside slice)
    const LR2  = R + 22             // line elbow distance
    const isRight = cosMid >= 0     // right side of chart
    const elbowX  = cx + LR2 * cosMid
    const elbowY  = cy + LR2 * sinMid
    // Horizontal leg — clamped so text stays on screen
    const horizLen = 18
    const textX = isRight
      ? Math.min(elbowX + horizLen, W - 4)
      : Math.max(elbowX - horizLen, 4)
    const anchor = isRight ? 'start' : 'end'

    const shortName = d.name.length > 10 ? d.name.slice(0, 10) + '…' : d.name

    slices.push({
      path, color: colors[i % colors.length],
      lx0: cx + LR1 * cosMid, ly0: cy + LR1 * sinMid,
      elbowX, elbowY, textX, textY: elbowY,
      anchor, shortName,
      pctLabel: `${Math.round(d.pct)} %`,
      show: d.pct >= 2
    })

    startAngle = end
  })

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {slices.map((s, i) => (
        <path key={i} d={s.path} fill={s.color} stroke="#0d0f14" strokeWidth={1.5} />
      ))}
      {slices.map((s, i) => s.show && (
        <g key={`lbl-${i}`}>
          <polyline
            points={`${s.lx0},${s.ly0} ${s.elbowX},${s.elbowY} ${s.textX},${s.textY}`}
            fill="none" stroke={s.color} strokeWidth={0.9} opacity={0.8}
          />
          <text
            x={s.textX + (s.anchor === 'start' ? 2 : -2)}
            y={s.textY - 5}
            fill="#e0e6ff" fontSize={9.5} fontWeight={600}
            textAnchor={s.anchor}
            fontFamily="Plus Jakarta Sans, sans-serif"
          >
            {s.shortName}
          </text>
          <text
            x={s.textX + (s.anchor === 'start' ? 2 : -2)}
            y={s.textY + 7}
            fill={s.color} fontSize={9.5} fontWeight={700}
            textAnchor={s.anchor}
            fontFamily="Plus Jakarta Sans, sans-serif"
          >
            {s.pctLabel}
          </text>
        </g>
      ))}
    </svg>
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
    if (period === 'Custom') return { start: customStart, end: customEnd }
    if (period === 'Weekly') return {
      start: toFirestoreDate(startOfWeek(anchor, { weekStartsOn: 1 })),
      end:   toFirestoreDate(endOfWeek(anchor,   { weekStartsOn: 1 }))
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
      const txs = await getTransactions(user.uid, householdId, start, end)
      setTransactions(txs)
    } finally { setLoading(false) }
  }

  const fmt          = n => fmtCurrency(n, currency)
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
    if (period === 'Annually') return format(anchor,'yyyy')
    if (period === 'Monthly')  return format(anchor,'MMMM yyyy')
    return `${customStart} → ${customEnd}`
  }

  return (
    <div className="screen stats-screen">

      {/* Period tabs */}
      <div className="stats-header">
        <div className="stats-period-tabs">
          {PERIOD_OPTIONS.map(p => (
            <button
              key={p}
              className={`stats-period-tab ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
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
            <MonthNavigator date={anchor} onChange={setAnchor} />
          )}
        </div>
      </div>

      {/* Income / Expense tabs with totals */}
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

      <div className="scroll-area">
        {loading ? (
          <div className="load-row"><span className="spinner" /></div>
        ) : breakdown.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 40 }}>
            <span className="icon">📊</span>
            <p>No {txType} data for {periodLabel()}.</p>
          </div>
        ) : (
          <>
            {/* Pie chart */}
            <div className="stats-pie-section">
              <PieChart data={breakdown} colors={COLORS} />
            </div>

            {/* Category list */}
            <div className="stats-cat-list">
              {breakdown.map((cat, i) => {
                const catDef = categories.find(c => c.name === cat.name)
                const icon   = catDef?.icon || ''
                return (
                  <button
                    key={cat.name}
                    className="stats-cat-item"
                    onClick={() => { setDrillCat(cat.name); setDrillSub(null) }}
                  >
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
                <TransactionItem
                  key={tx.id} tx={tx} categories={categories}
                  onClick={t => { setDrillCat(null); setDrillSub(null); setEditTx(t) }}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {editTx && (
        <AddTransaction
          tx={editTx}
          onClose={() => setEditTx(null)}
          onSaved={() => { setEditTx(null); load() }}
        />
      )}
    </div>
  )
}
