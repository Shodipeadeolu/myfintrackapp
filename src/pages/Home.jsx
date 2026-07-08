import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getTransactions } from '../firebase/service'
import { getSavingsAccounts, getSavingsTxs, getLoanAccounts, getLoanTxs } from '../firebase/savingsLoans'
import { fmtCurrency, fmtCurrencyCompact, toFirestoreDate } from '../utils/helpers'
import { fmtSec } from '../utils/secCurrency'
import { calcCashBalance, calcSavingsLoansCashEffect } from '../utils/balanceCalc'
import { startOfMonth, endOfMonth } from 'date-fns'
import MonthNavigator from '../components/MonthNavigator'
import TransactionItem from '../components/TransactionItem'
import AddTransaction from '../components/AddTransaction'
import DailySummary from '../components/DailySummary'
import './Home.css'

function firstName(profile, user) {
  const name = profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'there'
  return name.split(' ')[0]
}

export default function Home({ onNavigate }) {
  const {
    user, profile, householdId, categories,
    theme, toggleTheme, dataLoading,
    reloadTrigger, currency,
    balanceRollover,
    secEnabled, secCurrency, secRate
  } = useApp()

  const [month, setMonth]               = useState(new Date())
  const [transactions, setTransactions] = useState([])
  const [prevBalance, setPrevBalance]   = useState(0)
  const [savLoanMonthEffect, setSavLoanMonthEffect] = useState(0)
  const [loading, setLoading]           = useState(false)
  const [showAdd, setShowAdd]           = useState(false)
  const [editTx, setEditTx]             = useState(null)

  useEffect(() => {
    if (!user) return
    load()
  }, [user, month, householdId, reloadTrigger])

  const load = async () => {
    if (!user) return
    setLoading(true)
    try {
      const monthStart = toFirestoreDate(startOfMonth(month))
      const monthEnd   = toFirestoreDate(endOfMonth(month))
      const prevEnd     = toFirestoreDate(new Date(month.getFullYear(), month.getMonth(), 0))

      const [txs, prevTxs, savAccs, loanAccs] = await Promise.all([
        getTransactions(user.uid, householdId, monthStart, monthEnd),
        balanceRollover
          ? getTransactions(user.uid, householdId, '2000-01-01', prevEnd)
          : Promise.resolve([]),
        getSavingsAccounts(user.uid, householdId),
        getLoanAccounts(user.uid, householdId)
      ])
      const [savTxsByAcc, loanTxsByAcc] = await Promise.all([
        Promise.all(savAccs.map(acc => getSavingsTxs(acc.id))),
        Promise.all(loanAccs.map(acc => getLoanTxs(acc.id)))
      ])
      const allSavTxs  = savTxsByAcc.flat()
      const allLoanTxs = loanTxsByAcc.flat()

      setTransactions(txs)
      setSavLoanMonthEffect(calcSavingsLoansCashEffect(
        allSavTxs.filter(t => t.date >= monthStart && t.date <= monthEnd),
        allLoanTxs.filter(t => t.date >= monthStart && t.date <= monthEnd)
      ))
      setPrevBalance(balanceRollover
        ? calcCashBalance(prevTxs) + calcSavingsLoansCashEffect(
            allSavTxs.filter(t => t.date <= prevEnd),
            allLoanTxs.filter(t => t.date <= prevEnd)
          )
        : 0)
    } catch (e) { console.error('Home load error:', e) }
    finally { setLoading(false) }
  }

  // Cash balance = income - expense + savings effects + loan effects
  // (dedicated savings/loan account transactions move cash but are never counted as income/expense)
  const monthCashEffect = calcCashBalance(transactions) + savLoanMonthEffect
  const balance  = prevBalance + monthCashEffect

  // For stat cards — just expense and income for the month display
  const income   = transactions.filter(t => t.type === 'income').reduce((a,t)  => a+t.amount, 0)
  const expenses = transactions.filter(t => t.type === 'expense').reduce((a,t) => a+t.amount, 0)
  const savings  = transactions.filter(t => t.type === 'savings' && t.subtype !== 'withdraw').reduce((a,t) => a+t.amount, 0)

  const recent = [...transactions]
    .sort((a, b) => (b.date||'').localeCompare(a.date||''))
    .slice(0, 5)

  const fmt  = n => fmtCurrency(n, currency)
  const fmtC = n => fmtCurrencyCompact(n, currency)
  const sec  = n => fmtSec(n, secEnabled, secRate, secCurrency)

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

        {/* Balance card */}
        <div className="balance-card">
          <div className="balance-nav-row">
            <MonthNavigator date={month} onChange={setMonth} allowFuture />
          </div>
          <div className="balance-label-row">
            <div className="balance-label">TOTAL BALANCE</div>
            {balanceRollover && <div className="rollover-badge">↩ Rollover On</div>}
          </div>
          <div className={`balance-amount ${balance < 0 ? 'negative' : ''}`}>{fmt(balance)}</div>
          {sec(balance) && <div className="balance-sec">{sec(balance)}</div>}
          <div className="balance-change">
            <span className={balance >= 0 ? 'change-up' : 'change-down'}>
              {balance >= 0 ? '↗' : '↘'} {fmtC(Math.abs(expenses))}
            </span>
            <span className="change-label"> expenses this month</span>
          </div>
        </div>


        {/* 3 stat cards */}
        <div className="home-stat-cards">
          {[
            { label: 'Income',   val: income,   cls: 'income-card',  valCls: 'income-val',  icon: '↗', iconCls: 'income-icon'  },
            { label: 'Expenses', val: expenses, cls: 'expense-card', valCls: 'expense-val', icon: '↘', iconCls: 'expense-icon' },
            { label: 'Saved',    val: savings,  cls: 'savings-card', valCls: 'savings-val', icon: '💰',iconCls: 'savings-icon' },
          ].map(({ label, val, cls, valCls, icon, iconCls }) => (
            <div key={label} className={`stat-card ${cls}`}>
              <div className={`stat-card-icon ${iconCls}`}>{icon}</div>
              <div className="stat-card-label">{label}</div>
              <div className={`stat-card-value ${valCls}`}>{fmtC(val)}</div>
              {sec(val) && <div className="stat-card-sec">{sec(val)}</div>}
            </div>
          ))}
        </div>

        {/* Daily Summary */}
        {!loading && (
          <DailySummary monthTransactions={transactions} onNavigate={onNavigate} />
        )}

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
