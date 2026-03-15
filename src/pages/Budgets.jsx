import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { getTransactions } from '../firebase/service'
import { getBudgets, addBudget, updateBudget, deleteBudget } from '../firebase/budgets'
import { fmtCurrency, toFirestoreDate } from '../utils/helpers'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import MonthNavigator from '../components/MonthNavigator'
import CategoryPicker from '../components/CategoryPicker'
import './Budgets.css'

export default function Budgets() {
  const { user, householdId, categories, canWrite, reloadTrigger } = useApp()
  const [month, setMonth] = useState(new Date())
  const [budgets, setBudgets] = useState([])
  const [spending, setSpending] = useState({}) // { categoryName: totalSpent }
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editBudget, setEditBudget] = useState(null)

  useEffect(() => { load() }, [month, householdId])

  const load = async () => {
    setLoading(true)
    try {
      const [buds, txs] = await Promise.all([
        getBudgets(user.uid, householdId),
        getTransactions(
          user.uid, householdId,
          toFirestoreDate(startOfMonth(month)),
          toFirestoreDate(endOfMonth(month))
        )
      ])
      setBudgets(buds)

      // Build spending map
      const map = {}
      txs.filter(t => t.type === 'expense').forEach(t => {
        map[t.category] = (map[t.category] || 0) + t.amount
      })
      setSpending(map)
    } finally {
      setLoading(false)
    }
  }

  const totalBudgeted = budgets.reduce((a, b) => a + b.amount, 0)
  const totalSpent = budgets.reduce((a, b) => a + (spending[b.category] || 0), 0)
  const totalRemaining = totalBudgeted - totalSpent
  const overallPct = totalBudgeted > 0 ? Math.min((totalSpent / totalBudgeted) * 100, 100) : 0

  const handleSaved = () => {
    setShowAdd(false)
    setEditBudget(null)
    load()
  }

  // Sort: over-budget first, then by % used descending
  const sorted = [...budgets].sort((a, b) => {
    const aSpent = spending[a.category] || 0
    const bSpent = spending[b.category] || 0
    const aOver = aSpent > a.amount
    const bOver = bSpent > b.amount
    if (aOver !== bOver) return aOver ? -1 : 1
    return (bSpent / b.amount) - (aSpent / a.amount)
  })

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
                <div className="bsc-row">
                  <div className="bsc-item">
                    <div className="bsc-label">Budgeted</div>
                    <div className="bsc-value">{fmtCurrency(totalBudgeted)}</div>
                  </div>
                  <div className="bsc-item">
                    <div className="bsc-label">Spent</div>
                    <div className={`bsc-value ${totalSpent > totalBudgeted ? 'over' : ''}`}>
                      {fmtCurrency(totalSpent)}
                    </div>
                  </div>
                  <div className="bsc-item">
                    <div className="bsc-label">{totalRemaining < 0 ? 'Over by' : 'Left'}</div>
                    <div className={`bsc-value ${totalRemaining < 0 ? 'over' : 'under'}`}>
                      {fmtCurrency(Math.abs(totalRemaining))}
                    </div>
                  </div>
                </div>
                <div className="bsc-track">
                  <div
                    className={`bsc-fill ${overallPct >= 100 ? 'danger' : overallPct >= 80 ? 'warn' : 'good'}`}
                    style={{ width: `${overallPct}%` }}
                  />
                </div>
                <div className="bsc-pct">{Math.round(overallPct)}% of total budget used</div>
              </div>
            )}

            {/* Budget list */}
            {sorted.length === 0 ? (
              <div className="empty-state" style={{ marginTop: 60 }}>
                <span className="icon">🎯</span>
                <p>No budgets yet.<br />Tap + to set a spending limit.</p>
              </div>
            ) : (
              <div className="budget-list">
                {sorted.map(budget => {
                  const spent = spending[budget.category] || 0
                  const pct = budget.amount > 0 ? Math.min((spent / budget.amount) * 100, 100) : 0
                  const over = spent > budget.amount
                  const remaining = budget.amount - spent
                  const cat = categories.find(c => c.name === budget.category)
                  const icon = cat?.icon || '📦'
                  const status = over ? 'danger' : pct >= 80 ? 'warn' : 'good'

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
                          <div className={`bc-spent ${over ? 'over' : ''}`}>
                            {fmtCurrency(spent)}
                          </div>
                          <div className="bc-limit">of {fmtCurrency(budget.amount)}</div>
                        </div>
                      </div>

                      <div className="bc-track">
                        <div className={`bc-fill ${status}`} style={{ width: `${pct}%` }} />
                      </div>

                      <div className="bc-bottom">
                        <span className={`bc-badge ${status}`}>
                          {over
                            ? `Over by ${fmtCurrency(Math.abs(remaining))}`
                            : pct >= 80
                              ? `⚠ ${fmtCurrency(remaining)} left`
                              : `${fmtCurrency(remaining)} left`
                          }
                        </span>
                        <span className="bc-pct">{Math.round(pct)}%</span>
                      </div>
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
        />
      )}
    </div>
  )
}

// ─── Add / Edit Budget Sheet ───────────────────────────────────
function BudgetSheet({ budget, categories, existingCategories, onClose, onSaved, onDeleted, user, householdId }) {
  const editing = !!budget
  const [category, setCategory] = useState(budget?.category || '')
  const [amount, setAmount] = useState(budget?.amount ? String(budget.amount) : '')
  const [note, setNote] = useState(budget?.note || '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState('')
  const [showCatPicker, setShowCatPicker] = useState(false)

  // Filter out categories already budgeted (unless editing that one)
  const availableCats = categories.filter(
    c => !existingCategories.includes(c.name) || c.name === budget?.category
  )

  const selectedCat = categories.find(c => c.name === category)

  const handleSave = async () => {
    if (!category) return setErr('Select a category')
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) return setErr('Enter a valid amount')
    setErr('')
    setSaving(true)
    try {
      const data = { category, amount: amt, note: note.trim() }
      if (editing) {
        await updateBudget(budget.id, data)
      } else {
        await addBudget(user.uid, householdId, data)
      }
      onSaved()
    } catch (e) {
      setErr('Save failed. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this budget?')) return
    setDeleting(true)
    try {
      await deleteBudget(budget.id)
      onDeleted()
    } catch {
      setErr('Delete failed.')
    } finally {
      setDeleting(false)
    }
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
              <span className="currency-sym">$</span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="amount-input"
                autoFocus={!editing}
              />
            </div>
          </div>

          <div className="field">
            <label>Note (optional)</label>
            <input
              type="text"
              placeholder="e.g. Groceries only"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>

          {err && <p className="form-err">{err}</p>}

          <button
            className="btn btn-primary btn-full save-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <span className="spinner" /> : editing ? 'Save Changes' : 'Add Budget'}
          </button>
        </div>
      </div>

      {showCatPicker && (
        <CategoryPicker
          categories={availableCats}
          selected={category}
          onSelect={c => { setCategory(c.name); setShowCatPicker(false) }}
          onClose={() => setShowCatPicker(false)}
          title="Pick Category"
        />
      )}
    </>
  )
}
