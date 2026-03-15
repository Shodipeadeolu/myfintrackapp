import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { getTransactions } from '../firebase/service'
import { fmtCurrency, toFirestoreDate } from '../utils/helpers'
import { startOfMonth, endOfMonth } from 'date-fns'
import MonthNavigator from '../components/MonthNavigator'
import TransactionItem from '../components/TransactionItem'
import AddTransaction from '../components/AddTransaction'
import InviteBanner from '../components/InviteBanner'
import './Home.css'

export default function Home({ onNavigate }) {
  const { user, householdId, categories, pendingInvites, handleAcceptInvite, theme, toggleTheme, household, dataLoading } = useApp()
  const [month, setMonth] = useState(new Date())
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editTx, setEditTx] = useState(null)

  // Track previous householdId so we only reload when it actually changes
  const prevHouseholdId = useRef(undefined)

  useEffect(() => {
    // Skip if user not ready or householdId hasn't actually changed
    if (!user) return
    if (prevHouseholdId.current === householdId) return
    prevHouseholdId.current = householdId
    load()
  }, [month, householdId, user])

  const load = async () => {
    if (!user) return
    setLoading(true)
    try {
      const start = toFirestoreDate(startOfMonth(month))
      const end = toFirestoreDate(endOfMonth(month))
      const txs = await getTransactions(user.uid, householdId, start, end)
      setTransactions(txs)
    } catch (e) {
      console.error('Home load error:', e)
    } finally {
      setLoading(false)
    }
  }

  // Reload when month changes
  useEffect(() => {
    if (!user) return
    load()
  }, [month])

  const income = transactions.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0)
  const expenses = transactions.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0)
  const balance = income - expenses
  const recent = transactions.slice(0, 5)

  const handleSaved = () => {
    setShowAdd(false)
    setEditTx(null)
    load()
  }

  return (
    <div className="screen">
      <div className="scroll-area">
        {/* Header */}
        <div className="home-header">
          <div>
            <div className="home-greeting">Good {getGreeting()}</div>
            {household && <div className="home-household">🏠 {household.name}</div>}
          </div>
          <button className="theme-btn" onClick={toggleTheme}>{theme === 'light' ? '🌙' : '☀️'}</button>
        </div>

        {/* Invite banners */}
        {pendingInvites.map(invite => (
          <InviteBanner key={invite.id} invite={invite} onAccept={handleAcceptInvite} />
        ))}

        {/* Balance card */}
        <div className="balance-card">
          <div className="balance-nav">
            <MonthNavigator date={month} onChange={setMonth} />
          </div>
          <div className="balance-label">Net Balance</div>
          <div className={`balance-amount ${balance < 0 ? 'negative' : ''}`}>
            {fmtCurrency(balance)}
          </div>
          <div className="summary-row">
            <div className="summary-item income">
              <span className="summary-icon">↓</span>
              <div>
                <div className="summary-label">Income</div>
                <div className="summary-value">{fmtCurrency(income)}</div>
              </div>
            </div>
            <div className="summary-divider" />
            <div className="summary-item expense">
              <span className="summary-icon">↑</span>
              <div>
                <div className="summary-label">Expenses</div>
                <div className="summary-value">{fmtCurrency(expenses)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="quick-actions">
          <button className="qa-btn" onClick={() => setShowAdd(true)}>
            <span className="qa-icon">＋</span>
            <span>Add</span>
          </button>
          <button className="qa-btn" onClick={() => onNavigate('budgets')}>
            <span className="qa-icon">🎯</span>
            <span>Budgets</span>
          </button>
          <button className="qa-btn" onClick={() => onNavigate('stats')}>
            <span className="qa-icon">◎</span>
            <span>Stats</span>
          </button>
          <button className="qa-btn" onClick={() => onNavigate('transactions')}>
            <span className="qa-icon">↕</span>
            <span>All</span>
          </button>
        </div>

        {/* Recent transactions */}
        <div className="section">
          <div className="section-header">
            <h3>Recent</h3>
            {transactions.length > 5 && (
              <button className="see-all" onClick={() => onNavigate('transactions')}>See all</button>
            )}
          </div>
          {loading || dataLoading ? (
            <div className="load-row"><span className="spinner" /></div>
          ) : recent.length === 0 ? (
            <div className="empty-state">
              <span className="icon">💸</span>
              <p>No transactions this month.<br />Tap + to add one.</p>
            </div>
          ) : (
            recent.map(tx => (
              <TransactionItem
                key={tx.id}
                tx={tx}
                categories={categories}
                onClick={setEditTx}
              />
            ))
          )}
        </div>
      </div>

      {(showAdd || editTx) && (
        <AddTransaction
          tx={editTx}
          onClose={() => { setShowAdd(false); setEditTx(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
