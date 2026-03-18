import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getTransactions } from '../firebase/service'
import { getBudgets, addBudget, updateBudget, deleteBudget } from '../firebase/budgets'
import { fmtCurrency, toFirestoreDate } from '../utils/helpers'
import { startOfMonth, endOfMonth } from 'date-fns'
import MonthNavigator from '../components/MonthNavigator'
import CategoryPicker from '../components/CategoryPicker'
import './Budgets.css'

export default function Budgets() {
  const { user, householdId, categories, canWrite, reloadTrigger, currency } = useApp()
  const [month, setMonth]     = useState(new Date())
  const [budgets, setBudgets] = useState([])
  const [spending, setSpending] = useState({})
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
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
      txs.filter(t => t.type === 'expense').forEach(t => {
        map[t.category] = (map[t.category] || 0) + t.amount
      })
      setSpending(map)
    } finally { setLoading(false) }
  }

  const fmt = (n) => fmtCurrency(n, currency)

  const totalBudgeted = budgets.reduce((a, b) => a + b.amount, 0)
  const totalSpent    = budgets.reduce((a, b) => a + (spending[b.category] || 0), 0)
  const totalLeft     = totalBudgeted - totalSpent
  const overallPct    = totalBudgeted > 0 ? Math.min((totalSpent / totalBudgeted) * 100, 100) : 0

  const sorted = [...budgets].sort((a, b) => {
    const aSpent = spending[a.category] || 0
    const bSpent = spending[b.category] || 0
    const aOver = aSpent > a.amount, bOver = bSpent > b.amount
    if (aOver !== bOver) return aOver ? -1 : 1
    return (bSpent / b.amount) - (aSpent / a.amount)
  })

  const handleSaved = () => { setShowAdd(false); setEditBudget(null); load() }

  return (
    <div className="screen">
      <div className="budgets-header">
        <h2 className="page-title">Budgets</h2>
        <MonthNavigator date={month} onChange={setMonth} />
      </div>

      <div className="scroll-area">
        {loading ? (
          <div className="load-row"><span className="spinner" /></div>
        ) : (
          <>
            {/* Summary card */}
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
                  <span className="bsc-pct">Overall Progress</span>
                  <span className="bsc-remaining">{Math.round(overallPct)}%</span>
                </div>
              </div>
            )}

            {/* Budget cards */}
            {sorted.length === 0 ? (
              <div className="empty-state" style={{ marginTop: 60 }}>
                <span className="icon">🎯</span>
                <p>No budgets yet.<br />Tap + to set a spending limit.</p>
              </div>
            ) : (
              <div className="budget-list">
                {sorted.map(budget => {
                  const spent     = spending[budget.category] || 0
                  const rawPct    = budget.amount > 0 ? (spent / budget.amount) * 100 : 0
                  const pct       = Math.min(rawPct, 100)
                  const over      = spent > budget.amount
                  const remaining = budget.amount - spent
                  const cat       = categories.find(c => c.name === budget.category)
                  const icon      = cat?.icon || '📦'
                  const status    = over ? 'danger' : rawPct >= 80 ? 'warn' : 'good'

                  return (
                    <button
                      key={budget.id}
                      className="budget-card"
                      onClick={() => canWrite && setEditBudget(budget)}
                    >
                      <div className="bc-top">
                        <div className="bc-left">
                          <span className="bc-icon">{icon}</span>
                          <div>
                            <div className="bc-name">{budget.category}</div>
                            {budget.note && <div className="bc-note">{budget.note}</div>}
                          </div>
                        </div>
                        <div className="bc-right">
                          <div className={`bc-spent ${over ? 'over' : ''}`}>{fmt(spent)}</div>
                          <div className="bc-limit">of {fmt(budget.amount)}</div>
                        </div>
                      </div>

                      <div className="bc-track">
                        <div className={`bc-fill ${status}`} style={{ width: `${pct}%` }} />
                      </div>

                      <div className="bc-bottom">
                        <span className={`bc-badge ${status}`}>
                          {over
                            ? `↘ Over by ${fmt(Math.abs(remaining))}`
                            : rawPct >= 80
                              ? `⚠ ${fmt(remaining)} left`
                              : `↗ ${fmt(remaining)} left`
                          }
                        </span>
                        <span className="bc-pct">{Math.round(rawPct)}%</span>
                      </div>

                      {/* Warning message */}
                      {rawPct >= 80 && !over && (
                        <div className="bc-warning warn">⚠ Approaching budget limit</div>
                      )}
                      {over && (
                        <div className="bc-warning danger">⚠ Budget exceeded — consider adjusting spending</div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {canWrite && (
              <div className="budget-add-wrap">
                <button className="budget-add-btn" onClick={() => setShowAdd(true)}>
                  + Add Budget
                </button>
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

function BudgetSheet({ budget, categories, existingCategories, onClose, onSaved, onDeleted, user, householdId, currency }) {
  const editing = !!budget
  const [category, setCategory] = useState(budget?.category || '')
  const [amount, setAmount]     = useState(budget?.amount ? String(budget.amount) : '')
  const [note, setNote]         = useState(budget?.note || '')
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr]           = useState('')
  const [showCatPicker, setShowCatPicker] = useState(false)

  const availableCats = categories.filter(
    c => !existingCategories.includes(c.name) || c.name === budget?.category
  )
  const selectedCat = categories.find(c => c.name === category)
  const sym = new Intl.NumberFormat('en', { style: 'currency', currency: currency || 'USD' })
    .format(0).replace(/[\d.,\s]/g, '').trim() || '$'

  const handleSave = async () => {
    if (!category) return setErr('Select a category')
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) return setErr('Enter a valid amount')
    setErr(''); setSaving(true)
    try {
      const data = { category, amount: amt, note: note.trim() }
      editing ? await updateBudget(budget.id, data) : await addBudget(user.uid, householdId, data)
      onSaved()
    } catch { setErr('Save failed. Try again.') } finally { setSaving(false) }
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
            ? <button className="btn btn-ghost danger-ghost" onClick={handleDelete} disabled={deleting}>
                {deleting ? '…' : '🗑'}
              </button>
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
