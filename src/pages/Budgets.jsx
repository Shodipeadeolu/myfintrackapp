import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getTransactions } from '../firebase/service'
import { getBudgets, addBudget, updateBudget, deleteBudget } from '../firebase/budgets'
import { fmtCurrency, toFirestoreDate } from '../utils/helpers'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import MonthNavigator from '../components/MonthNavigator'
import CategoryPicker from '../components/CategoryPicker'
import TransactionItem from '../components/TransactionItem'
import './Budgets.css'

const DOT_COLORS = ['#7c3aed','#e8421a','#00c48c','#4a80e8','#f5a623','#ef4444','#06b6d4','#ec4899']

const CURRENCY_SYMBOLS = {
  NGN:'₦',USD:'$',EUR:'€',GBP:'£',GHS:'₵',KES:'KSh',ZAR:'R',
  AED:'AED',CAD:'CA$',AUD:'A$',JPY:'¥',INR:'₹',
}
const getSym = c => CURRENCY_SYMBOLS[c] || c

export default function Budgets() {
  const { user, householdId, categories, canWrite, reloadTrigger, currency } = useApp()
  const [month, setMonth]           = useState(new Date())
  const [budgets, setBudgets]       = useState([])
  const [spending, setSpending]     = useState({})
  const [catTxMap, setCatTxMap]     = useState({}) // { categoryName: [txns] }
  const [loading, setLoading]       = useState(true)
  const [showAdd, setShowAdd]       = useState(false)
  const [editBudget, setEditBudget] = useState(null)
  const [detailBudget, setDetailBudget] = useState(null) // for drill-down

  useEffect(() => { load() }, [month, householdId, reloadTrigger])

  const load = async () => {
    setLoading(true)
    try {
      const [buds, txs] = await Promise.all([
        getBudgets(user.uid, householdId),
        getTransactions(user.uid, householdId,
          toFirestoreDate(startOfMonth(month)),
          toFirestoreDate(endOfMonth(month))
        )
      ])
      setBudgets(buds)
      const map = {}, txMap = {}
      txs.filter(t => t.type === 'expense').forEach(t => {
        map[t.category] = (map[t.category] || 0) + t.amount
        if (!txMap[t.category]) txMap[t.category] = []
        txMap[t.category].push(t)
      })
      setSpending(map)
      setCatTxMap(txMap)
    } finally { setLoading(false) }
  }

  const fmt = n => fmtCurrency(n, currency)

  // For months other than the current, auto-apply repeating budgets
  const isCurrentMonth = month.getFullYear() === new Date().getFullYear() &&
    month.getMonth() === new Date().getMonth()

  // Budgets to display: stored budgets + repeating ones if no override exists
  const displayBudgets = isCurrentMonth
    ? budgets
    : budgets.filter(b => b.repeatMonthly)  // past/future months: only repeating ones

  const totalBudgeted = displayBudgets.reduce((a, b) => a + b.amount, 0)
  const totalSpent    = displayBudgets.reduce((a, b) => a + (spending[b.category] || 0), 0)
  const totalLeft     = totalBudgeted - totalSpent
  const overallPct    = totalBudgeted > 0 ? Math.min((totalSpent / totalBudgeted) * 100, 100) : 0

  const sorted = [...displayBudgets].sort((a, b) => {
    const aS = spending[a.category] || 0, bS = spending[b.category] || 0
    const aO = aS > a.amount, bO = bS > b.amount
    if (aO !== bO) return aO ? -1 : 1
    return (bS / b.amount) - (aS / a.amount)
  })

  const handleSaved = () => { setShowAdd(false); setEditBudget(null); load() }

  return (
    <div className="screen">
      <div className="budgets-header">
        <h2 className="page-title">Budget Overview</h2>
        <MonthNavigator date={month} onChange={setMonth} />
      </div>
      <div className="budgets-subtitle">Track and manage your monthly budgets</div>

      <div className="scroll-area">
        {loading ? (
          <div className="load-row"><span className="spinner" /></div>
        ) : (
          <>
            {/* Purple summary card */}
            {displayBudgets.length > 0 && (
              <div className="budget-summary-card">
                <div className="bsc-title">Total Monthly Budget</div>
                <div className="bsc-total">{fmt(totalBudgeted)}</div>
                <div className="bsc-subtitle">
                  {fmt(totalSpent)} spent · {totalLeft >= 0 ? fmt(totalLeft) + ' remaining' : fmt(Math.abs(totalLeft)) + ' over budget'}
                </div>
                <div className="bsc-track">
                  <div className="bsc-fill" style={{ width: `${overallPct}%` }} />
                </div>
                <div className="bsc-footer">
                  <span className="bsc-progress-label">Overall Progress</span>
                  <span className="bsc-pct">{Math.round(overallPct)}%</span>
                </div>
              </div>
            )}

            {/* Create button */}
            {canWrite && (
              <button className="budget-create-btn" onClick={() => setShowAdd(true)}>
                <span style={{ fontSize: 18 }}>＋</span> Create New Budget
              </button>
            )}

            {sorted.length === 0 ? (
              <div className="empty-state" style={{ marginTop: 40 }}>
                <span className="icon">🎯</span>
                <p>No budgets yet.<br />Tap + to set a spending limit.</p>
              </div>
            ) : (
              <div className="budget-grid">
                {sorted.map((budget, idx) => {
                  const spent     = spending[budget.category] || 0
                  const rawPct    = budget.amount > 0 ? (spent / budget.amount) * 100 : 0
                  const pct       = Math.min(rawPct, 100)
                  const over      = spent > budget.amount
                  const remaining = budget.amount - spent
                  const cat       = categories.find(c => c.name === budget.category)
                  const icon      = cat?.icon || '📦'
                  const status    = over ? 'danger' : rawPct >= 80 ? 'warn' : 'good'
                  const dotColor  = DOT_COLORS[idx % DOT_COLORS.length]

                  return (
                    <button
                      key={budget.id}
                      className="budget-card"
                      onClick={() => setDetailBudget({ budget, spent, remaining, rawPct, over, status, dotColor, icon })}
                    >
                      <div className="bc-card-header">
                        <div>
                          <div className="bc-card-name">{budget.category}</div>
                          <div className="bc-card-amounts">{fmt(spent)} of {fmt(budget.amount)}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                          <div className="bc-color-dot" style={{ background: dotColor }} />
                          {budget.repeatMonthly && (
                            <div className="repeat-badge">↻</div>
                          )}
                        </div>
                      </div>
                      <div className="bc-track">
                        <div className={`bc-fill ${status}`} style={{ width: `${pct}%`, background: dotColor }} />
                      </div>
                      <div className="bc-card-footer">
                        <span className={`bc-status ${status}`}>
                          {over ? '↘' : '↗'} {over ? `Over by ${fmt(Math.abs(remaining))}` : `${fmt(remaining)} left`}
                        </span>
                        <span className="bc-card-pct">{Math.round(rawPct)}%</span>
                      </div>
                      {rawPct >= 80 && !over && (
                        <div className="bc-warning-msg warn">⚠ Approaching budget limit</div>
                      )}
                      {over && (
                        <div className="bc-warning-msg danger">⊘ Budget exceeded</div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Budget detail sheet */}
      {detailBudget && (
        <BudgetDetail
          budget={detailBudget.budget}
          spent={detailBudget.spent}
          remaining={detailBudget.remaining}
          rawPct={detailBudget.rawPct}
          over={detailBudget.over}
          status={detailBudget.status}
          dotColor={detailBudget.dotColor}
          icon={detailBudget.icon}
          txns={catTxMap[detailBudget.budget.category] || []}
          categories={categories}
          fmt={fmt}
          canWrite={canWrite}
          month={month}
          onClose={() => setDetailBudget(null)}
          onEdit={() => {
            setEditBudget(detailBudget.budget)
            setDetailBudget(null)
          }}
        />
      )}

      {/* Add / Edit sheet */}
      {(showAdd || editBudget) && (
        <BudgetSheet
          budget={editBudget}
          categories={categories.filter(c => c.type === 'expense')}
          existingCategories={budgets.map(b => b.category)}
          onClose={() => { setShowAdd(false); setEditBudget(null) }}
          onSaved={handleSaved}
          onDeleted={handleSaved}
          user={user}
          householdId={householdId}
          currency={currency}
        />
      )}
    </div>
  )
}

// ── Budget Detail Sheet ────────────────────────────────────────
function BudgetDetail({ budget, spent, remaining, rawPct, over, status, dotColor, icon, txns, categories, fmt, canWrite, month, onClose, onEdit }) {
  const pct = Math.min(rawPct, 100)
  const monthLabel = format(month, 'MMMM yyyy')

  const dailyAvg = txns.length > 0
    ? spent / new Date().getDate()
    : 0
  const daysLeft = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() - new Date().getDate()
  const projected = spent + (dailyAvg * daysLeft)

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">{budget.category}</span>
          {canWrite && (
            <button className="btn btn-ghost" onClick={onEdit} style={{ fontSize: 16 }}>✎</button>
          )}
        </div>
        <div className="sheet-body">

          {/* Hero */}
          <div className="bd-hero" style={{ borderColor: dotColor + '40' }}>
            <div className="bd-hero-top">
              <div className="bd-icon" style={{ background: dotColor + '22' }}>{icon}</div>
              <div className="bd-month">{monthLabel}</div>
              {budget.repeatMonthly && <div className="bd-repeat-tag">↻ Monthly</div>}
            </div>

            {/* Budget vs Actual bar */}
            <div className="bd-bar-section">
              <div className="bd-bar-labels">
                <span className="bd-bar-lbl">Spent</span>
                <span className="bd-bar-lbl">Budget</span>
              </div>
              <div className="bd-bar-track">
                <div
                  className="bd-bar-fill"
                  style={{ width: `${pct}%`, background: dotColor, opacity: over ? 1 : 0.9 }}
                />
                {/* Budget line marker */}
                <div className="bd-bar-marker" />
              </div>
              <div className="bd-bar-values">
                <span className={`bd-val-spent ${over ? 'over' : ''}`}>{fmt(spent)}</span>
                <span className="bd-val-budget">{fmt(budget.amount)}</span>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="bd-stats-row">
            <div className="bd-stat">
              <div className="bd-stat-label">Budget</div>
              <div className="bd-stat-val">{fmt(budget.amount)}</div>
            </div>
            <div className="bd-stat">
              <div className="bd-stat-label">Actual</div>
              <div className={`bd-stat-val ${over ? 'over' : ''}`}>{fmt(spent)}</div>
            </div>
            <div className="bd-stat">
              <div className="bd-stat-label">{over ? 'Over by' : 'Balance'}</div>
              <div className={`bd-stat-val ${over ? 'over' : 'good'}`}>{fmt(Math.abs(remaining))}</div>
            </div>
            <div className="bd-stat">
              <div className="bd-stat-label">Used</div>
              <div className={`bd-stat-val ${rawPct >= 100 ? 'over' : rawPct >= 80 ? 'warn' : ''}`}>
                {Math.round(rawPct)}%
              </div>
            </div>
          </div>

          {/* Projection */}
          {dailyAvg > 0 && (
            <div className={`bd-projection ${projected > budget.amount ? 'danger' : 'safe'}`}>
              <span>📈 At current pace, projected spend: <strong>{fmt(projected)}</strong></span>
              {projected > budget.amount && (
                <span> — {fmt(projected - budget.amount)} over budget</span>
              )}
            </div>
          )}

          {/* Transactions */}
          <div className="bd-txn-header">
            <span className="bd-txn-title">Transactions ({txns.length})</span>
          </div>
          {txns.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <span className="icon" style={{ fontSize: 28 }}>🧾</span>
              <p>No transactions this month.</p>
            </div>
          ) : (
            txns
              .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
              .map(tx => (
                <TransactionItem
                  key={tx.id}
                  tx={tx}
                  categories={categories}
                  onClick={() => {}} // read-only view
                />
              ))
          )}
        </div>
      </div>
    </>
  )
}

// ── Add / Edit Budget Sheet ────────────────────────────────────
function BudgetSheet({ budget, categories, existingCategories, onClose, onSaved, onDeleted, user, householdId, currency }) {
  const editing = !!budget
  const [category, setCategory]       = useState(budget?.category || '')
  const [amount, setAmount]           = useState(budget?.amount ? String(budget.amount) : '')
  const [note, setNote]               = useState(budget?.note || '')
  const [repeatMonthly, setRepeat]    = useState(budget?.repeatMonthly ?? true) // default ON
  const [saving, setSaving]           = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [err, setErr]                 = useState('')
  const [showCatPicker, setShowCatPicker] = useState(false)

  const availableCats = categories.filter(
    c => !existingCategories.includes(c.name) || c.name === budget?.category
  )
  const selectedCat = categories.find(c => c.name === category)
  const sym = getSym(currency || 'USD')

  const handleSave = async () => {
    if (!category) return setErr('Select a category')
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) return setErr('Enter a valid amount')
    setErr(''); setSaving(true)
    try {
      const data = { category, amount: amt, note: note.trim(), repeatMonthly }
      editing ? await updateBudget(budget.id, data) : await addBudget(user.uid, householdId, data)
      onSaved()
    } catch { setErr('Save failed.') } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this budget?')) return
    setDeleting(true)
    try { await deleteBudget(budget.id); onDeleted() }
    catch { setErr('Delete failed.') } finally { setDeleting(false) }
  }

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">{editing ? 'Edit Budget' : 'New Budget'}</span>
          {editing
            ? <button className="btn btn-ghost danger-ghost" onClick={handleDelete} disabled={deleting}>{deleting ? '…' : '🗑'}</button>
            : <span style={{ width: 40 }} />
          }
        </div>
        <div className="sheet-body">
          <div className="field">
            <label>Category</label>
            <button className="picker-btn" onClick={() => setShowCatPicker(true)}>
              <span>{selectedCat ? `${selectedCat.icon} ${selectedCat.name}` : 'Select category'}</span>
              <span className="picker-arrow">›</span>
            </button>
          </div>
          <div className="field">
            <label>Monthly Limit</label>
            <div className="amount-field">
              <span className="currency-sym">{sym}</span>
              <input type="number" inputMode="decimal" placeholder="0.00"
                value={amount} onChange={e => setAmount(e.target.value)}
                className="amount-input" autoFocus={!editing} />
            </div>
          </div>
          <div className="field">
            <label>Note (optional)</label>
            <input type="text" placeholder="e.g. Groceries only"
              value={note} onChange={e => setNote(e.target.value)} />
          </div>

          {/* Repeat monthly toggle */}
          <div className="budget-repeat-row">
            <div className="budget-repeat-info">
              <div className="budget-repeat-label">↻ Repeat Monthly</div>
              <div className="budget-repeat-desc">
                Automatically apply this budget every month
              </div>
            </div>
            <button
              className={`profile-toggle ${repeatMonthly ? 'on' : 'off'}`}
              onClick={() => setRepeat(v => !v)}
            >
              <div className="profile-toggle-knob" />
            </button>
          </div>

          {err && <p className="form-err">{err}</p>}
          <button className="btn btn-primary btn-full save-btn" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" /> : editing ? 'Save Changes' : 'Add Budget'}
          </button>
        </div>
      </div>

      {showCatPicker && (
        <CategoryPicker
          categories={availableCats} selected={category}
          onSelect={c => { setCategory(c.name); setShowCatPicker(false) }}
          onClose={() => setShowCatPicker(false)} title="Pick Category"
        />
      )}
    </>
  )
}
