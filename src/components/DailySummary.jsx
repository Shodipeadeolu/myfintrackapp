import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getTransactions } from '../firebase/service'
import { getBudgets } from '../firebase/budgets'
import { fmtCurrency, fmtCurrencyCompact, toFirestoreDate } from '../utils/helpers'
import { startOfMonth, endOfMonth, startOfDay, endOfDay, getDaysInMonth, getDate } from 'date-fns'
import './DailySummary.css'

export default function DailySummary({ monthTransactions, onNavigate }) {
  const { user, householdId, currency } = useApp()
  const [todayTxs, setTodayTxs]     = useState([])
  const [yesterdayTxs, setYesterdayTxs] = useState([])
  const [budgets, setBudgets]       = useState([])
  const [dismissed, setDismissed]   = useState(() => {
    const d = localStorage.getItem('ft-alert-dismissed')
    return d === new Date().toDateString() // dismissed today
  })

  useEffect(() => {
    if (!user) return
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)

    Promise.all([
      getTransactions(user.uid, householdId,
        toFirestoreDate(today), toFirestoreDate(today)
      ),
      getTransactions(user.uid, householdId,
        toFirestoreDate(yesterday), toFirestoreDate(yesterday)
      ),
      getBudgets(user.uid, householdId)
    ]).then(([todayR, yestR, buds]) => {
      setTodayTxs(todayR)
      setYesterdayTxs(yestR)
      setBudgets(buds)
    }).catch(console.error)
  }, [user, householdId])

  const fmt  = n => fmtCurrency(n, currency)
  const fmtC = n => fmtCurrencyCompact(n, currency)

  // ── Today's stats ───────────────────────────────────────────
  const todaySpend     = todayTxs.filter(t => t.type === 'expense').reduce((a,t) => a+t.amount, 0)
  const todayIncome    = todayTxs.filter(t => t.type === 'income').reduce((a,t)  => a+t.amount, 0)
  const yesterdaySpend = yesterdayTxs.filter(t => t.type === 'expense').reduce((a,t) => a+t.amount, 0)
  const todayCount     = todayTxs.filter(t => t.type === 'expense').length

  // Day-over-day change
  const spendChange = yesterdaySpend > 0
    ? Math.round(((todaySpend - yesterdaySpend) / yesterdaySpend) * 100)
    : null

  // ── Monthly budget pace ──────────────────────────────────────
  const today         = new Date()
  const dayOfMonth    = getDate(today)
  const daysInMonth   = getDaysInMonth(today)
  const monthSpend    = monthTransactions.filter(t => t.type === 'expense').reduce((a,t) => a+t.amount, 0)
  const totalBudgeted = budgets.reduce((a, b) => a + b.amount, 0)
  const pctMonthDone  = Math.round((dayOfMonth / daysInMonth) * 100)
  const pctBudgetUsed = totalBudgeted > 0 ? Math.round((monthSpend / totalBudgeted) * 100) : null

  // Daily average and projection
  const dailyAvg      = dayOfMonth > 0 ? monthSpend / dayOfMonth : 0
  const projectedMonthSpend = dailyAvg * daysInMonth

  // ── Budget alerts ────────────────────────────────────────────
  const monthSpendByCategory = {}
  monthTransactions.filter(t => t.type === 'expense').forEach(t => {
    monthSpendByCategory[t.category] = (monthSpendByCategory[t.category] || 0) + t.amount
  })

  const alerts = budgets.map(b => {
    const spent = monthSpendByCategory[b.category] || 0
    const pct   = b.amount > 0 ? (spent / b.amount) * 100 : 0
    const daysLeft = daysInMonth - dayOfMonth
    const dailyBurn = dayOfMonth > 0 ? spent / dayOfMonth : 0
    const projectedTotal = dailyBurn * daysInMonth
    const willExceed = projectedTotal > b.amount
    const daysUntilExhaust = dailyBurn > 0
      ? Math.max(0, Math.floor((b.amount - spent) / dailyBurn))
      : null

    return { ...b, spent, pct, daysLeft, daysUntilExhaust, willExceed, projectedTotal }
  }).filter(b => b.pct >= 70) // only show when 70%+ used
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 2) // max 2 alerts

  const hasAlerts = alerts.length > 0 && !dismissed

  const dismissAlert = () => {
    localStorage.setItem('ft-alert-dismissed', new Date().toDateString())
    setDismissed(true)
  }

  return (
    <div className="daily-summary-wrap">

      {/* ── Daily Summary Card ──────────────────────────────── */}
      <div className="daily-card">
        <div className="daily-card-header">
          <span className="daily-card-title">Today</span>
          <span className="daily-card-date">
            {today.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </div>

        <div className="daily-stats-row">
          <div className="daily-stat">
            <div className="daily-stat-label">Spent today</div>
            <div className="daily-stat-value expense">{fmtC(todaySpend)}</div>
            {spendChange !== null && (
              <div className={`daily-stat-change ${spendChange <= 0 ? 'good' : 'bad'}`}>
                {spendChange <= 0 ? '↓' : '↑'} {Math.abs(spendChange)}% vs yesterday
              </div>
            )}
            {spendChange === null && todayCount === 0 && (
              <div className="daily-stat-change good">No expenses yet today</div>
            )}
          </div>

          <div className="daily-stat-divider" />

          <div className="daily-stat">
            <div className="daily-stat-label">Transactions</div>
            <div className="daily-stat-value neutral">{todayCount}</div>
            {todayIncome > 0 && (
              <div className="daily-stat-change good">+{fmtC(todayIncome)} income</div>
            )}
          </div>

          {pctBudgetUsed !== null && (
            <>
              <div className="daily-stat-divider" />
              <div className="daily-stat">
                <div className="daily-stat-label">Budget used</div>
                <div className={`daily-stat-value ${pctBudgetUsed > pctMonthDone + 15 ? 'expense' : pctBudgetUsed > pctMonthDone ? 'warn' : 'good'}`}>
                  {pctBudgetUsed}%
                </div>
                <div className="daily-stat-change neutral">{pctMonthDone}% of month done</div>
              </div>
            </>
          )}
        </div>

        {/* Monthly pace bar */}
        {totalBudgeted > 0 && (
          <div className="daily-pace">
            <div className="daily-pace-labels">
              <span>Monthly pace</span>
              <span>{fmtC(monthSpend)} of {fmtC(totalBudgeted)}</span>
            </div>
            <div className="daily-pace-track">
              {/* Month progress marker */}
              <div className="daily-pace-month-marker" style={{ left: `${pctMonthDone}%` }} />
              {/* Spend fill */}
              <div
                className={`daily-pace-fill ${pctBudgetUsed > pctMonthDone + 15 ? 'danger' : pctBudgetUsed > pctMonthDone ? 'warn' : 'good'}`}
                style={{ width: `${Math.min(pctBudgetUsed, 100)}%` }}
              />
            </div>
            <div className="daily-pace-legend">
              <span className="pace-legend-item">
                <span className="pace-dot spend" /> Spending
              </span>
              <span className="pace-legend-item">
                <span className="pace-dot marker" /> Month progress ({pctMonthDone}%)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Smart Alert Banners ─────────────────────────────── */}
      {hasAlerts && (
        <div className="alerts-wrap">
          <div className="alerts-header">
            <span className="alerts-title">⚠ Budget Alerts</span>
            <button className="alerts-dismiss" onClick={dismissAlert}>Dismiss</button>
          </div>
          {alerts.map(alert => (
            <button
              key={alert.id}
              className={`alert-banner ${alert.pct >= 100 ? 'danger' : alert.pct >= 85 ? 'warn' : 'caution'}`}
              onClick={() => onNavigate('budgets')}
            >
              <div className="alert-banner-left">
                <div className="alert-banner-cat">{alert.category}</div>
                <div className="alert-banner-msg">
                  {alert.pct >= 100
                    ? `Over budget by ${fmtC(alert.spent - alert.amount)}`
                    : alert.daysUntilExhaust !== null && alert.daysUntilExhaust <= 5
                      ? `Runs out in ~${alert.daysUntilExhaust} day${alert.daysUntilExhaust === 1 ? '' : 's'}`
                      : `${Math.round(alert.pct)}% used — ${fmtC(alert.amount - alert.spent)} left`
                  }
                </div>
              </div>
              <div className="alert-banner-right">
                <div className="alert-pct">{Math.round(alert.pct)}%</div>
                <div className="alert-bar-track">
                  <div className="alert-bar-fill" style={{ width: `${Math.min(alert.pct, 100)}%` }} />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
