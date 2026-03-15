import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getTransactions } from '../firebase/service'
import { toFirestoreDate } from '../utils/helpers'
import { startOfMonth, endOfMonth } from 'date-fns'
import MonthNavigator from '../components/MonthNavigator'
import TransactionItem from '../components/TransactionItem'
import AddTransaction from '../components/AddTransaction'
import './Transactions.css'

export default function Transactions() {
  const { user, householdId, categories, reloadTrigger } = useApp()
  const [month, setMonth] = useState(new Date())
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [editTx, setEditTx] = useState(null)

  useEffect(() => { load() }, [month, householdId, reloadTrigger])

  const load = async () => {
    setLoading(true)
    try {
      const start = toFirestoreDate(startOfMonth(month))
      const end = toFirestoreDate(endOfMonth(month))
      const txs = await getTransactions(user.uid, householdId, start, end)
      setTransactions(txs)
    } finally {
      setLoading(false)
    }
  }

  const filtered = transactions
    .filter(t => filter === 'all' || t.type === filter)
    .filter(t => !search || [t.category, t.subcategory, t.note]
      .some(f => f?.toLowerCase().includes(search.toLowerCase())))

  const grouped = filtered.reduce((acc, tx) => {
    const key = tx.date
    if (!acc[key]) acc[key] = []
    acc[key].push(tx)
    return acc
  }, {})

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="screen">
      <div className="txns-header">
        <h2 className="page-title">Activity</h2>
        <MonthNavigator date={month} onChange={setMonth} />
      </div>

      <div className="txns-filters">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            placeholder="Search transactions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button onClick={() => setSearch('')} className="clear-search">✕</button>}
        </div>
        <div className="seg-control">
          {['all', 'expense', 'income'].map(f => (
            <button
              key={f}
              className={`seg-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-area">
        {loading ? (
          <div className="load-row"><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <span className="icon">🔍</span>
            <p>No transactions found.</p>
          </div>
        ) : (
          sortedDates.map(date => (
            <div key={date} className="date-group">
              <div className="date-label">{formatGroupDate(date)}</div>
              {grouped[date].map(tx => (
                <TransactionItem
                  key={tx.id}
                  tx={tx}
                  categories={categories}
                  onClick={setEditTx}
                />
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
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    if (d.toDateString() === today.toDateString()) return 'Today'
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  } catch { return dateStr }
}
