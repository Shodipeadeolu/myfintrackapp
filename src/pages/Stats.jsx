import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getTransactions } from '../firebase/service'
import { groupByCategory, get6MonthTrend, fmtCurrency, toFirestoreDate } from '../utils/helpers'
import { startOfMonth, endOfMonth, startOfYear, endOfYear, startOfWeek, endOfWeek, format } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import MonthNavigator from '../components/MonthNavigator'
import TransactionItem from '../components/TransactionItem'
import AddTransaction from '../components/AddTransaction'
import './Stats.css'

const PERIOD_OPTIONS = ['Weekly', 'Monthly', 'Annually', 'Custom']
const COLORS = ['#e8421a','#f07040','#f5a070','#fad0b8','#1a7a4a','#3aaa6a','#1a4fa8','#4a80e8','#c47b0a','#f0b030']

export default function Stats() {
  const { user, householdId, categories, reloadTrigger, currency } = useApp()
  const [period, setPeriod]           = useState('Monthly')
  const [anchor, setAnchor]           = useState(new Date())
  const [customStart, setCustomStart] = useState(toFirestoreDate(startOfMonth(new Date())))
  const [customEnd, setCustomEnd]     = useState(toFirestoreDate(endOfMonth(new Date())))
  const [txType, setTxType]           = useState('expense')
  const [transactions, setTransactions] = useState([])
  const [allTx, setAllTx]             = useState([])
  const [loading, setLoading]         = useState(true)

  // Drill state: null → category view → subcategory view → tx view
  const [drillCat, setDrillCat]       = useState(null)  // category name
  const [drillSub, setDrillSub]       = useState(null)  // subcategory name | '__all__'
  const [editTx, setEditTx]           = useState(null)

  useEffect(() => { load() }, [period, anchor, customStart, customEnd, householdId, reloadTrigger])

  const getRange = () => {
    if (period === 'Custom') return { start: customStart, end: customEnd }
    if (period === 'Weekly') {
      return {
        start: toFirestoreDate(startOfWeek(anchor, { weekStartsOn: 1 })),
        end:   toFirestoreDate(endOfWeek(anchor,   { weekStartsOn: 1 }))
      }
    }
    if (period === 'Annually')
      return { start: toFirestoreDate(startOfYear(anchor)), end: toFirestoreDate(endOfYear(anchor)) }
    return { start: toFirestoreDate(startOfMonth(anchor)), end: toFirestoreDate(endOfMonth(anchor)) }
  }

  const load = async () => {
    setLoading(true)
    try {
      const { start, end } = getRange()
      const [periodTxs, yearTxs] = await Promise.all([
        getTransactions(user.uid, householdId, start, end),
        getTransactions(user.uid, householdId,
          toFirestoreDate(new Date(new Date().getFullYear() - 1, new Date().getMonth() + 1, 1)),
          toFirestoreDate(new Date())
        )
      ])
      setTransactions(periodTxs)
      setAllTx(yearTxs)
    } finally {
      setLoading(false)
    }
  }

  const breakdown = groupByCategory(transactions, txType)
  const trend     = get6MonthTrend(allTx)
  const total     = transactions.filter(t => t.type === txType).reduce((a, t) => a + t.amount, 0)

  const periodLabel = () => {
    if (period === 'Weekly') return `Week of ${format(startOfWeek(anchor, { weekStartsOn: 1 }), 'MMM d')}`
    if (period === 'Annually') return format(anchor, 'yyyy')
    if (period === 'Monthly')  return format(anchor, 'MMMM yyyy')
    return `${customStart} → ${customEnd}`
  }

  // Transactions for the drilled category
  const catTxs = drillCat
    ? transactions.filter(t => t.type === txType && t.category === drillCat)
    : []

  // Build subcategory breakdown for the drilled category
  const subBreakdown = (() => {
    if (!drillCat) return []
    const map = {}
    catTxs.forEach(t => {
      const key = t.subcategory?.trim() || '(no subcategory)'
      map[key] = (map[key] || 0) + t.amount
    })
    const subTotal = Object.values(map).reduce((a, b) => a + b, 0)
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount, pct: subTotal ? Math.round((amount / subTotal) * 100) : 0 }))
  })()

  // Transactions for the drilled subcategory
  const subTxs = drillSub
    ? (drillSub === '__all__'
        ? catTxs
        : catTxs.filter(t => (t.subcategory?.trim() || '(no subcategory)') === drillSub))
    : []

  const closeDrill = () => { setDrillCat(null); setDrillSub(null) }
  const closeSub   = () => setDrillSub(null)

  const fmt = (n) => fmtCurrency(n, currency)

  return (
    <div className="screen">
      <div className="stats-header">
        <h2 className="page-title">Stats</h2>
        <div className="seg-control period-seg">
          {PERIOD_OPTIONS.map(p => (
            <button key={p} className={`seg-btn ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-area">
        <div className="stats-period-bar">
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

        <div className="type-seg-wrap">
          <div className="seg-control">
            <button className={`seg-btn ${txType === 'expense' ? 'active' : ''}`} onClick={() => setTxType('expense')}>Expenses</button>
            <button className={`seg-btn ${txType === 'income'  ? 'active' : ''}`} onClick={() => setTxType('income')}>Income</button>
          </div>
        </div>

        {loading ? (
          <div className="load-row"><span className="spinner" /></div>
        ) : (
          <>
            {breakdown.length > 0 && (
              <div className="stats-card">
                <div className="stats-total-label">Total {txType === 'expense' ? 'Spent' : 'Earned'}</div>
                <div className="stats-total">{fmt(total)}</div>
                <div className="pie-wrap">
                  <PieChart width={220} height={220}>
                    <Pie data={breakdown} cx={110} cy={110} innerRadius={65} outerRadius={100} paddingAngle={2} dataKey="amount">
                      {breakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                  <div className="pie-center">
                    <div className="pie-center-label">{breakdown.length} cats</div>
                  </div>
                </div>
              </div>
            )}

            {breakdown.length > 0 ? (
              <div className="stats-section">
                <div className="stats-section-title">By Category</div>
                {breakdown.map((cat, i) => (
                  <button key={cat.name} className="cat-row" onClick={() => { setDrillCat(cat.name); setDrillSub(null) }}>
                    <div className="cat-row-left">
                      <div className="cat-dot" style={{ background: COLORS[i % COLORS.length] }} />
                      <div>
                        <div className="cat-row-name">{cat.name}</div>
                        <div className="cat-row-amount">{fmt(cat.amount)}</div>
                      </div>
                    </div>
                    <div className="cat-row-right">
                      <div className="pct-badge" style={{ background: COLORS[i % COLORS.length] + '22', color: COLORS[i % COLORS.length] }}>
                        {cat.pct}%
                      </div>
                      <div className="cat-progress-bar">
                        <div className="cat-progress-fill" style={{ width: `${cat.pct}%`, background: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span className="icon">📊</span>
                <p>No {txType} data for {periodLabel()}.</p>
              </div>
            )}

            <div className="stats-section">
              <div className="stats-section-title">6-Month Trend</div>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={trend} barGap={4}>
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip
                      formatter={(v) => fmt(v)}
                      contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                    />
                    <Bar dataKey="income"  fill="var(--green)"  radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="chart-legend">
                  <span className="legend-dot" style={{ background: 'var(--green)' }} /> Income
                  <span className="legend-dot" style={{ background: 'var(--accent)', marginLeft: 12 }} /> Expense
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Level 1: Category drill-down → shows subcategories ── */}
      {drillCat && !drillSub && (
        <>
          <div className="sheet-overlay" onClick={closeDrill} />
          <div className="sheet">
            <div className="sheet-handle" />
            <div className="sheet-header">
              <button className="btn btn-ghost" onClick={closeDrill}>✕</button>
              <span className="sheet-title">{drillCat}</span>
              <span style={{ width: 40 }} />
            </div>
            <div className="sheet-body">
              <div className="drill-total">
                {fmt(catTxs.reduce((a, t) => a + t.amount, 0))} · {catTxs.length} transactions
              </div>

              {/* See all transactions shortcut */}
              <button className="drill-all-btn" onClick={() => setDrillSub('__all__')}>
                <span>All transactions</span>
                <span className="drill-all-count">{catTxs.length}</span>
              </button>

              {/* Subcategory breakdown */}
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
                        <div className="pct-badge" style={{ background: COLORS[i % COLORS.length] + '22', color: COLORS[i % COLORS.length] }}>
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

      {/* ── Level 2: Subcategory drill-down → shows transactions ── */}
      {drillCat && drillSub && (
        <>
          <div className="sheet-overlay" onClick={closeSub} />
          <div className="sheet">
            <div className="sheet-handle" />
            <div className="sheet-header">
              <button className="btn btn-ghost" onClick={closeSub}>‹ Back</button>
              <span className="sheet-title">
                {drillSub === '__all__' ? drillCat : drillSub}
              </span>
              <span style={{ width: 40 }} />
            </div>
            <div className="sheet-body">
              <div className="drill-total">
                {fmt(subTxs.reduce((a, t) => a + t.amount, 0))} · {subTxs.length} transactions
              </div>
              {subTxs.map(tx => (
                <TransactionItem
                  key={tx.id} tx={tx} categories={categories}
                  onClick={(t) => { closeDrill(); setEditTx(t) }}
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
