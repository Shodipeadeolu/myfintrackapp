import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getTransactions } from '../firebase/service'
import { fmtCurrency, toFirestoreDate } from '../utils/helpers'
import { startOfMonth, endOfMonth } from 'date-fns'
import MonthNavigator from '../components/MonthNavigator'
import TransactionItem from '../components/TransactionItem'
import AddTransaction from '../components/AddTransaction'
import './Transactions.css'

export default function Transactions() {
  const { user, householdId, categories, reloadTrigger, currency } = useApp()
  const [month, setMonth]             = useState(new Date())
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState('all')
  const [search, setSearch]           = useState('')
  const [editTx, setEditTx]           = useState(null)

  useEffect(() => { load() }, [month, householdId, reloadTrigger])

  const load = async () => {
    setLoading(true)
    try {
      const txs = await getTransactions(user.uid, householdId,
        toFirestoreDate(startOfMonth(month)),
        toFirestoreDate(endOfMonth(month))
      )
      setTransactions(txs)
    } finally { setLoading(false) }
  }

  const filtered = transactions
    .filter(t => filter === 'all' || t.type === filter)
    .filter(t => !search || [t.category, t.subcategory, t.note]
      .some(f => f?.toLowerCase().includes(search.toLowerCase())))

  const totalIncome   = transactions.filter(t => t.type === 'income').reduce((a, t)  => a + t.amount, 0)
  const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0)
  const fmt = n => fmtCurrency(n, currency)

  const grouped    = filtered.reduce((acc, tx) => { if (!acc[tx.date]) acc[tx.date] = []; acc[tx.date].push(tx); return acc }, {})
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  const exportCSV = () => {
    const rows = [
      ['Date','Category','Subcategory','Note','Amount','Type'],
      ...filtered.map(t => [t.date, t.category, t.subcategory||'', t.note||'', t.amount, t.type])
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `fintrack-${month.toISOString().slice(0,7)}.csv`
    a.click()
  }

  return (
    <div className="screen">
      <div className="txns-header">
        <h2 className="page-title">All Transactions</h2>
        <MonthNavigator date={month} onChange={setMonth} />
      </div>
      <div className="txns-subtitle">View and manage all your financial transactions</div>

      {/* 3 summary cards */}
      <div className="txns-summary">
        <div className="txns-stat-card">
          <div className="txns-stat-label">Total</div>
          <div className="txns-stat-val neutral">{transactions.length}</div>
        </div>
        <div className="txns-stat-card income-bg">
          <div className="txns-stat-label">Total Income</div>
          <div className="txns-stat-val income">+{fmt(totalIncome)}</div>
        </div>
        <div className="txns-stat-card expense-bg">
          <div className="txns-stat-label">Total Expenses</div>
          <div className="txns-stat-val expense">-{fmt(totalExpenses)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="txns-filters">
        <div className="search-row">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input placeholder="Search transactions..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')} className="clear-search">✕</button>}
          </div>
          <button className="export-btn" onClick={exportCSV}>↓ Export</button>
        </div>
        <div className="seg-control">
          {[['all','All'],['income','Income'],['expense','Expenses']].map(([v,l]) => (
            <button key={v} className={`seg-btn ${filter === v ? 'active' : ''}`} onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="txns-list-header">All Transactions ({filtered.length})</div>
      )}

      <div className="scroll-area">
        {loading ? (
          <div className="load-row"><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><span className="icon">🔍</span><p>No transactions found.</p></div>
        ) : (
          sortedDates.map(date => (
            <div key={date} className="date-group">
              <div className="date-label">{formatGroupDate(date)}</div>
              {grouped[date].map(tx => (
                <TransactionItem key={tx.id} tx={tx} categories={categories} onClick={setEditTx} />
              ))}
            </div>
          ))
        )}
      </div>

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

function formatGroupDate(dateStr) {
  try {
    const d = new Date(dateStr + 'T12:00:00')
    const today = new Date(), yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    if (d.toDateString() === today.toDateString())     return 'Today'
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  } catch { return dateStr }
}
