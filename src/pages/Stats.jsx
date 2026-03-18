import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getTransactions } from '../firebase/service'
import { groupByCategory, get6MonthTrend, fmtCurrency, toFirestoreDate } from '../utils/helpers'
import { startOfMonth, endOfMonth, startOfYear, endOfYear, startOfWeek, endOfWeek, format } from 'date-fns'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import MonthNavigator from '../components/MonthNavigator'
import TransactionItem from '../components/TransactionItem'
import AddTransaction from '../components/AddTransaction'
import './Stats.css'

const PERIOD_OPTIONS = ['Weekly', 'Monthly', 'Annually', 'Custom']

// Vibrant palette matching reference screenshot
const COLORS = [
  '#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff922b',
  '#cc5de8','#20c997','#f06595','#74c0fc','#a9e34b'
]

// Gradient color stops for percent badge
const BADGE_COLORS = [
  '#ef4444','#f97316','#eab308','#84cc16','#22c55e',
  '#06b6d4','#3b82f6','#8b5cf6','#ec4899','#14b8a6'
]

export default function Stats() {
  const { user, householdId, categories, reloadTrigger, currency } = useApp()
  const [period, setPeriod]           = useState('Monthly')
  const [anchor, setAnchor]           = useState(new Date())
  const [customStart, setCustomStart] = useState(toFirestoreDate(startOfMonth(new Date())))
  const [customEnd, setCustomEnd]     = useState(toFirestoreDate(endOfMonth(new Date())))
  const [txType, setTxType]           = useState('expense')
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading]         = useState(true)
  const [drillCat, setDrillCat]       = useState(null)
  const [drillSub, setDrillSub]       = useState(null)
  const [editTx, setEditTx]           = useState(null)

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

  const fmt = n => fmtCurrency(n, currency)
  const breakdown = groupByCategory(transactions, txType)
  const total     = transactions.filter(t => t.type === txType).reduce((a, t) => a + t.amount, 0)

  const catTxs = drillCat ? transactions.filter(t => t.type === txType && t.category === drillCat) : []

  const subBreakdown = (() => {
    if (!drillCat) return []
    const map = {}
    catTxs.forEach(t => { const k = t.subcategory?.trim() || '(no subcategory)'; map[k] = (map[k]||0) + t.amount })
    const sub = Object.values(map).reduce((a,b) => a+b, 0)
    return Object.entries(map).sort((a,b) => b[1]-a[1])
      .map(([name, amount]) => ({ name, amount, pct: sub ? Math.round((amount/sub)*100) : 0 }))
  })()

  const subTxs = drillSub
    ? (drillSub === '__all__' ? catTxs : catTxs.filter(t => (t.subcategory?.trim()||'(no subcategory)') === drillSub))
    : []

  const periodLabel = () => {
    if (period === 'Weekly') return `Week of ${format(startOfWeek(anchor,{weekStartsOn:1}),'MMM d')}`
    if (period === 'Annually') return format(anchor,'yyyy')
    if (period === 'Monthly')  return format(anchor,'MMMM yyyy')
    return `${customStart} → ${customEnd}`
  }

  // Income / Expense tab label with total
  const incomeTotal  = transactions.filter(t => t.type === 'income').reduce((a,t) => a+t.amount, 0)
  const expenseTotal = transactions.filter(t => t.type === 'expense').reduce((a,t) => a+t.amount, 0)

  return (
    <div className="screen stats-screen">
      {/* Header */}
      <div className="stats-header">
        <div className="stats-period-tabs">
          {PERIOD_OPTIONS.map(p => (
            <button key={p} className={`stats-period-tab ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
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

      {/* Income / Expense toggle with totals */}
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
        ) : (
          <>
            {/* Pie chart section */}
            {breakdown.length > 0 ? (
              <div className="stats-pie-section">
                <div className="pie-container">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={breakdown}
                        cx="50%" cy="50%"
                        outerRadius={110}
                        innerRadius={0}
                        paddingAngle={1}
                        dataKey="amount"
                        label={({ name, pct, cx, cy, midAngle, outerRadius }) => {
                          const RADIAN = Math.PI / 180
                          const r = outerRadius + 22
                          const x = cx + r * Math.cos(-midAngle * RADIAN)
                          const y = cy + r * Math.sin(-midAngle * RADIAN)
                          const shortName = name.length > 10 ? name.slice(0,10)+'…' : name
                          return pct >= 3 ? (
                            <text x={x} y={y} fill="#f0f4ff" textAnchor={x > cx ? 'start' : 'end'}
                              dominantBaseline="central" fontSize={11} fontWeight={600}>
                              {shortName}{'\n'}{pct}%
                            </text>
                          ) : null
                        }}
                        labelLine={{ stroke: 'rgba(240,244,255,0.3)', strokeWidth: 1 }}
                      >
                        {breakdown.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={v => fmt(v)}
                        contentStyle={{ background: '#1e2535', border: '1px solid #2a3347', borderRadius: 10, fontSize: 12, color: '#f0f4ff' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="empty-state" style={{ marginTop: 40 }}>
                <span className="icon">📊</span>
                <p>No {txType} data for {periodLabel()}.</p>
              </div>
            )}

            {/* Top Categories list */}
            {breakdown.length > 0 && (
              <div className="stats-cat-section">
                <div className="stats-cat-title">Top Categories</div>
                {breakdown.map((cat, i) => (
                  <button
                    key={cat.name}
                    className="stats-cat-row"
                    onClick={() => { setDrillCat(cat.name); setDrillSub(null) }}
                  >
                    <div className="scr-left">
                      <div className="scr-dot" style={{ background: COLORS[i % COLORS.length] }} />
                      <div className="scr-info">
                        <div className="scr-name">{cat.name}</div>
                        <div className="scr-amount">{fmt(cat.amount)}</div>
                        <div className="scr-bar-track">
                          <div className="scr-bar-fill" style={{ width: `${cat.pct}%`, background: COLORS[i % COLORS.length] }} />
                        </div>
                      </div>
                    </div>
                    <div className="scr-right">
                      <div className="scr-amount-big">{fmt(cat.amount)}</div>
                      <div className="scr-pct">{cat.pct}%</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Drill level 1: subcategories */}
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
              <div className="drill-total">{fmt(catTxs.reduce((a,t)=>a+t.amount,0))} · {catTxs.length} transactions</div>
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

      {/* Drill level 2: transactions */}
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
              <div className="drill-total">{fmt(subTxs.reduce((a,t)=>a+t.amount,0))} · {subTxs.length} transactions</div>
              {subTxs.map(tx => (
                <TransactionItem key={tx.id} tx={tx} categories={categories}
                  onClick={t => { setDrillCat(null); setDrillSub(null); setEditTx(t) }} />
              ))}
            </div>
          </div>
        </>
      )}

      {editTx && (
        <AddTransaction tx={editTx} onClose={() => setEditTx(null)} onSaved={() => { setEditTx(null); load() }} />
      )}
    </div>
  )
}
