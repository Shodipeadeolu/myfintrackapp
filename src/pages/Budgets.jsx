import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getTransactions } from '../firebase/service'
import { getBudgets, addBudget, updateBudget, deleteBudget } from '../firebase/budgets'
import { fmtCurrency, toFirestoreDate } from '../utils/helpers'
import { startOfMonth, endOfMonth } from 'date-fns'
import MonthNavigator from '../components/MonthNavigator'
import CategoryPicker from '../components/CategoryPicker'
import './Budgets.css'

const DOT_COLORS = ['#7c3aed','#e8421a','#00c48c','#4a80e8','#f5a623','#ef4444','#06b6d4','#ec4899']

export default function Budgets() {
  const { user, householdId, categories, canWrite, reloadTrigger, currency } = useApp()
  const [month, setMonth]       = useState(new Date())
  const [budgets, setBudgets]   = useState([])
  const [spending, setSpending] = useState({})
  const [loading, setLoading]   = useState(true)
  const [showAdd, setShowAdd]   = useState(false)
  const [editBudget, setEditBudget] = useState(null)

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
      const map = {}
      txs.filter(t => t.type === 'expense').forEach(t => { map[t.category] = (map[t.category]||0) + t.amount })
      setSpending(map)
    } finally { setLoading(false) }
  }

  const fmt = n => fmtCurrency(n, currency)
  const totalBudgeted = budgets.reduce((a, b) => a + b.amount, 0)
  const totalSpent    = budgets.reduce((a, b) => a + (spending[b.category]||0), 0)
  const totalLeft     = totalBudgeted - totalSpent
  const overallPct    = totalBudgeted > 0 ? Math.min((totalSpent/totalBudgeted)*100, 100) : 0

  const sorted = [...budgets].sort((a, b) => {
    const aS = spending[a.category]||0, bS = spending[b.category]||0
    const aO = aS > a.amount, bO = bS > b.amount
    if (aO !== bO) return aO ? -1 : 1
    return (bS/b.amount) - (aS/a.amount)
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
            {budgets.length > 0 && (
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

            {/* Create new budget button */}
            {canWrite && (
              <button className="budget-create-btn" onClick={() => setShowAdd(true)}>
                <span style={{ fontSize: 18 }}>＋</span> Create New Budget
              </button>
            )}

            {/* 2-column grid */}
            {sorted.length === 0 ? (
              <div className="empty-state" style={{ marginTop: 40 }}>
                <span className="icon">🎯</span>
                <p>No budgets yet.<br />Tap + to set a spending limit.</p>
              </div>
            ) : (
              <div className="budget-grid">
                {sorted.map((budget, idx) => {
                  const spent     = spending[budget.category]||0
                  const rawPct    = budget.amount > 0 ? (spent/budget.amount)*100 : 0
                  const pct       = Math.min(rawPct, 100)
                  const over      = spent > budget.amount
                  const remaining = budget.amount - spent
                  const status    = over ? 'danger' : rawPct >= 80 ? 'warn' : 'good'
                  const dotColor  = DOT_COLORS[idx % DOT_COLORS.length]

                  return (
                    <button key={budget.id} className="budget-card" onClick={() => canWrite && setEditBudget(budget)}>
                      <div className="bc-card-header">
                        <div>
                          <div className="bc-card-name">{budget.category}</div>
                          <div className="bc-card-amounts">{fmt(spent)} of {fmt(budget.amount)}</div>
                        </div>
                        <div className="bc-color-dot" style={{ background: dotColor }} />
                      </div>

                      <div className="bc-track">
                        <div className={`bc-fill ${status}`} style={{ width: `${pct}%`, background: dotColor, opacity: over ? 1 : 0.85 }} />
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
                        <div className="bc-warning-msg danger">⊘ Budget exceeded — consider adjusting spending</div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {(showAdd || editBudget) && (
        <BudgetSheet
          budget={editBudget}
          categories={categories.filter(c => c.type === 'expense')}
          existingCategories={budgets.map(b => b.category)}
          onClose={() => { setShowAdd(false); setEditBudget(null) }}
          onSaved={handleSaved} onDeleted={handleSaved}
          user={user} householdId={householdId} currency={currency}
        />
      )}
    </div>
  )
}

function BudgetSheet({ budget, categories, existingCategories, onClose, onSaved, onDeleted, user, householdId, currency }) {
  const editing = !!budget
  const [category, setCategory] = useState(budget?.category||'')
  const [amount, setAmount]     = useState(budget?.amount ? String(budget.amount) : '')
  const [note, setNote]         = useState(budget?.note||'')
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr]           = useState('')
  const [showCatPicker, setShowCatPicker] = useState(false)

  const availableCats = categories.filter(c => !existingCategories.includes(c.name) || c.name === budget?.category)
  const selectedCat   = categories.find(c => c.name === category)
  const SYMS = {NGN:'₦',USD:'$',EUR:'€',GBP:'£',GHS:'₵',KES:'KSh',ZAR:'R',EGP:'E£',AED:'AED',SAR:'SAR',CAD:'CA$',AUD:'A$',JPY:'¥',CNY:'¥',INR:'₹',BRL:'R$',MXN:'MX$',SGD:'S$',CHF:'CHF',HKD:'HK$',PHP:'₱',IDR:'Rp',MYR:'RM',THB:'฿',TRY:'₺',RUB:'₽',PLN:'zł',ILS:'₪',KRW:'₩',VND:'₫'}
  const sym = SYMS[currency||'USD'] || (currency||'USD')

  const handleSave = async () => {
    if (!category) return setErr('Select a category')
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) return setErr('Enter a valid amount')
    setErr(''); setSaving(true)
    try {
      const data = { category, amount: amt, note: note.trim() }
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
              <input type="number" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} className="amount-input" autoFocus={!editing} />
            </div>
          </div>
          <div className="field">
            <label>Note (optional)</label>
            <input type="text" placeholder="e.g. Groceries only" value={note} onChange={e => setNote(e.target.value)} />
          </div>
          {err && <p className="form-err">{err}</p>}
          <button className="btn btn-primary btn-full save-btn" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" /> : editing ? 'Save Changes' : 'Add Budget'}
          </button>
        </div>
      </div>
      {showCatPicker && (
        <CategoryPicker categories={availableCats} selected={category}
          onSelect={c => { setCategory(c.name); setShowCatPicker(false) }}
          onClose={() => setShowCatPicker(false)} title="Pick Category" />
      )}
    </>
  )
}
