import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { getTransactions } from '../firebase/service'
import { fmtCurrency, toFirestoreDate } from '../utils/helpers'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import MonthNavigator from '../components/MonthNavigator'
import TransactionItem from '../components/TransactionItem'
import AddTransaction from '../components/AddTransaction'
import InviteBanner from '../components/InviteBanner'
import './Home.css'

export default function Home({ onNavigate }) {
  const { user, profile, householdId, categories, pendingInvites, handleAcceptInvite, theme, toggleTheme, household, dataLoading, reloadTrigger, currency } = useApp()
  const [month, setMonth]           = useState(new Date())
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading]       = useState(false)
  const [showAdd, setShowAdd]       = useState(false)
  const [editTx, setEditTx]         = useState(null)
  const prevHouseholdId             = useRef(undefined)

  useEffect(() => {
    if (!user) return
    if (prevHouseholdId.current === householdId) return
    prevHouseholdId.current = householdId
    load()
  }, [householdId, user])

  useEffect(() => { if (!user) return; load() }, [month, reloadTrigger])

  const load = async () => {
    if (!user) return
    setLoading(true)
    try {
      const txs = await getTransactions(user.uid, householdId,
        toFirestoreDate(startOfMonth(month)),
        toFirestoreDate(endOfMonth(month))
      )
      setTransactions(txs)
    } catch (e) { console.error('Home load error:', e) }
    finally { setLoading(false) }
  }

  const income   = transactions.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0)
  const expenses = transactions.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0)
  const balance  = income - expenses
  const savings  = balance > 0 ? balance : 0
  const recent   = transactions.slice(0, 5)
  const fmt      = n => fmtCurrency(n, currency)

  const handleSaved = () => { setShowAdd(false); setEditTx(null); load() }

  return (
    <div className="screen">
      <div className="scroll-area">
        {/* Header */}
        <div className="home-header">
          <div>
            <div className="home-greeting">Welcome back, {firstName(profile, user)}!</div>
            <div className="home-subtitle">Here's what's happening with your finances today.</div>
          </div>
          <button className="theme-btn" onClick={toggleTheme}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>

        {pendingInvites.map(invite => (
          <InviteBanner key={invite.id} invite={invite} onAccept={handleAcceptInvite} />
        ))}

        {/* Total Balance card — green gradient */}
        <div className="balance-card">
          <div className="balance-nav-row">
            <MonthNavigator date={month} onChange={setMonth} />
          </div>
          <div className="balance-label">Total Balance</div>
          <div className={`balance-amount ${balance < 0 ? 'negative' : ''}`}>{fmt(balance)}</div>
          <div className="balance-change">
            <span className={balance >= 0 ? 'change-up' : 'change-down'}>
              {balance >= 0 ? '↗' : '↘'} {fmt(Math.abs(expenses))}
            </span>
            <span className="change-label"> expenses this month</span>
          </div>
        </div>

        {/* 3 stat cards */}
        <div className="home-stat-cards">
          <div className="stat-card income-card">
            <div className="stat-card-icon income-icon">↗</div>
            <div className="stat-card-label">Income</div>
            <div className="stat-card-value income-val">{fmt(income)}</div>
          </div>
          <div className="stat-card expense-card">
            <div className="stat-card-icon expense-icon">↘</div>
            <div className="stat-card-label">Expenses</div>
            <div className="stat-card-value expense-val">{fmt(expenses)}</div>
          </div>
          <div className="stat-card savings-card">
            <div className="stat-card-icon savings-icon">🐖</div>
            <div className="stat-card-label">Savings</div>
            <div className="stat-card-value savings-val">{fmt(savings)}</div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="quick-actions">
          <button className="qa-btn" onClick={() => setShowAdd(true)}>
            <span className="qa-icon">＋</span><span>Add</span>
          </button>
          <button className="qa-btn" onClick={() => onNavigate('budgets')}>
            <span className="qa-icon">🎯</span><span>Budgets</span>
          </button>
          <button className="qa-btn" onClick={() => onNavigate('stats')}>
            <span className="qa-icon">◎</span><span>Stats</span>
          </button>
          <button className="qa-btn" onClick={() => onNavigate('transactions')}>
            <span className="qa-icon">↕</span><span>All</span>
          </button>
        </div>

        {/* Recent Transactions */}
        <div className="home-section">
          <div className="home-section-header">
            <span className="home-section-title">Recent Transactions</span>
            {transactions.length > 5 && (
              <button className="view-all-btn" onClick={() => onNavigate('transactions')}>View All</button>
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
            <div className="recent-list">
              {recent.map(tx => (
                <TransactionItem key={tx.id} tx={tx} categories={categories} onClick={setEditTx} />
              ))}
            </div>
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

function firstName(profile, user) {
  const name = profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'there'
  return name.split(' ')[0]
}
