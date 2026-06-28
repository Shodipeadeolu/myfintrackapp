import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getTransactions, moveToTrash } from '../firebase/service'
import { fmtCurrency, fmtCurrencyCompact, toFirestoreDate } from '../utils/helpers'
import { fmtSec } from '../utils/secCurrency'
import { startOfMonth, endOfMonth } from 'date-fns'
import MonthNavigator from '../components/MonthNavigator'
import TransactionItem from '../components/TransactionItem'
import AddTransaction from '../components/AddTransaction'
import './Transactions.css'

export default function Transactions() {
  const {
    user, householdId, categories, reloadTrigger, triggerReload, currency,
    secEnabled, secCurrency, secRate
  } = useApp()
  const [month, setMonth]               = useState(new Date())
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading]           = useState(true)
  const [filter, setFilter]             = useState('all')
  const [search, setSearch]             = useState('')
  const [editTx, setEditTx]             = useState(null)
  const [selectMode, setSelectMode]     = useState(false)
  const [selected, setSelected]         = useState(new Set())
  const [deleting, setDeleting]         = useState(false)
  const [deleteError, setDeleteError]   = useState('')

  useEffect(() => { if (user) load() }, [user, month, householdId, reloadTrigger])

  const load = async () => {
    if (!user) return
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

  const totalIncome   = transactions.filter(t => t.type === 'income').reduce((a,t)  => a+t.amount, 0)
  const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((a,t) => a+t.amount, 0)

  const fmt  = n => fmtCurrency(n, currency)
  const fmtC = n => fmtCurrencyCompact(n, currency)
  const sec  = n => fmtSec(n, secEnabled, secRate, secCurrency)

  const grouped     = filtered.reduce((acc, tx) => { if (!acc[tx.date]) acc[tx.date] = []; acc[tx.date].push(tx); return acc }, {})
  const sortedDates = Object.keys(grouped).sort((a,b) => b.localeCompare(a))

  const toggleSelect = (id) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()) }

  const handleDeleteSelected = async () => {
    if (!selected.size || deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      await moveToTrash(user.uid, householdId, [...selected])
      triggerReload()
      load()
      exitSelectMode()
    } catch (e) {
      setDeleteError(e.message || 'Could not move to trash. Please try again.')
    } finally { setDeleting(false) }
  }

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

      {/* 3 summary cards with secondary currency */}
      <div className="txns-summary">
        <div className="txns-stat-card">
          <div className="txns-stat-label">Total</div>
          <div className="txns-stat-val neutral">{transactions.length}</div>
        </div>
        <div className="txns-stat-card income-bg">
          <div className="txns-stat-label">Total Income</div>
          <div className="txns-stat-val income">+{fmtC(totalIncome)}</div>
          {sec(totalIncome) && <div className="txns-stat-sec">{sec(totalIncome)}</div>}
        </div>
        <div className="txns-stat-card expense-bg">
          <div className="txns-stat-label">Total Expenses</div>
          <div className="txns-stat-val expense">-{fmtC(totalExpenses)}</div>
          {sec(totalExpenses) && <div className="txns-stat-sec">{sec(totalExpenses)}</div>}
        </div>
      </div>

      <div className="txns-filters">
        <div className="search-row">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input placeholder="Search transactions..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')} className="clear-search">✕</button>}
          </div>
          <button className="export-btn" onClick={exportCSV}>↓ Export</button>
          <button
            className={`select-btn${selectMode ? ' active' : ''}`}
            onClick={() => { selectMode ? exitSelectMode() : setSelectMode(true) }}>
            {selectMode ? 'Cancel' : 'Select'}
          </button>
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
                <TransactionItem
                  key={tx.id} tx={tx} categories={categories}
                  selectMode={selectMode}
                  selected={selected.has(tx.id)}
                  onClick={selectMode ? () => toggleSelect(tx.id) : setEditTx}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {editTx && (
        <AddTransaction tx={editTx} onClose={() => setEditTx(null)}
          onSaved={() => { setEditTx(null); load() }} />
      )}

      {selectMode && (
        <div className="txns-select-bar">
          {deleteError ? (
            <span className="txns-select-err">{deleteError}</span>
          ) : (
            <span className="txns-select-count">{selected.size} selected</span>
          )}
          <button
            className="txns-delete-btn"
            disabled={selected.size === 0 || deleting}
            onClick={handleDeleteSelected}>
            {deleting ? 'Moving…' : `Move to Trash (${selected.size})`}
          </button>
        </div>
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
