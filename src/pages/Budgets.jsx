import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getTransactions } from '../firebase/service'
import { getBudgets, addBudget, updateBudget, deleteBudget, getBudgetOverrides, setBudgetOverride, deleteBudgetOverride } from '../firebase/budgets'
import { fmtCurrency, fmtCurrencyCompact, toFirestoreDate } from '../utils/helpers'
import { fmtSec } from '../utils/secCurrency'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import MonthNavigator from '../components/MonthNavigator'
import TransactionItem from '../components/TransactionItem'
import AddTransaction from '../components/AddTransaction'
import CategoryPicker from '../components/CategoryPicker'
import './Budgets.css'

const CURRENCY_SYMBOLS = {
  NGN:'₦',USD:'$',EUR:'€',GBP:'£',GHS:'₵',KES:'KSh',ZAR:'R',EGP:'E£',
  AED:'AED',SAR:'SAR',CAD:'CA$',AUD:'A$',JPY:'¥',CNY:'¥',INR:'₹',
  BRL:'R$',MXN:'MX$',SGD:'S$',CHF:'CHF',HKD:'HK$',PHP:'₱',IDR:'Rp',
  MYR:'RM',THB:'฿',TRY:'₺',RUB:'₽',PLN:'zł',ILS:'₪',KRW:'₩',VND:'₫'
}
const DOT_COLORS = ['#7c3aed','#e8421a','#00c48c','#4a80e8','#f5a623','#ef4444','#06b6d4','#ec4899']

export default function Budgets() {
  const { user, householdId, categories, canWrite, reloadTrigger, currency, secEnabled, secCurrency, secRate } = useApp()
  const [month, setMonth]             = useState(new Date())
  const [budgets, setBudgets]         = useState([])
  const [overrides, setOverrides]     = useState([]) // monthly overrides
  const [allTxs, setAllTxs]           = useState([])
  const [spending, setSpending]       = useState({})
  const [loading, setLoading]         = useState(true)
  const [showAdd, setShowAdd]         = useState(false)
  const [editBudget, setEditBudget]   = useState(null)
  const [detailBudget, setDetailBudget] = useState(null)
  const [drillSubcat, setDrillSubcat] = useState(null)
  const [editTx, setEditTx]           = useState(null)
  // Month override sheet
  const [overrideBudget, setOverrideBudget] = useState(null)

  const monthKey = format(month, 'yyyy-MM')

  useEffect(() => { load() }, [month, householdId, reloadTrigger])

  const load = async () => {
    setLoading(true)
    try {
      const [buds, ovs, txs] = await Promise.all([
        getBudgets(user.uid, householdId),
        getBudgetOverrides(user.uid, householdId, monthKey),
        getTransactions(user.uid, householdId,
          toFirestoreDate(startOfMonth(month)),
          toFirestoreDate(endOfMonth(month))
        )
      ])
      setBudgets(buds)
      setOverrides(ovs)
      setAllTxs(txs)
      const map = {}
      txs.filter(t => t.type === 'expense').forEach(t => { map[t.category] = (map[t.category]||0) + t.amount })
      setSpending(map)
    } finally { setLoading(false) }
  }

  // Get effective amount for a budget this month (override takes priority)
  const effectiveAmount = (budget) => {
    const ov = overrides.find(o => o.budgetId === budget.id)
    return ov ? ov.amount : budget.amount
  }

  const hasOverride = (budget) => overrides.some(o => o.budgetId === budget.id)

  const fmt  = n => fmtCurrency(n, currency)
  const fmtC = n => fmtCurrencyCompact(n, currency)
  const sec  = n => fmtSec(n, secEnabled, secRate, secCurrency)

  const totalBudgeted = budgets.reduce((a, b) => a + effectiveAmount(b), 0)
  const totalSpent    = budgets.reduce((a, b) => a + (spending[b.category]||0), 0)
  const totalLeft     = totalBudgeted - totalSpent
  const overallPct    = totalBudgeted > 0 ? Math.min((totalSpent/totalBudgeted)*100, 100) : 0

  const sorted = [...budgets].sort((a, b) => {
    const aS = spending[a.category]||0, bS = spending[b.category]||0
    const aO = aS > effectiveAmount(a), bO = bS > effectiveAmount(b)
    if (aO !== bO) return aO ? -1 : 1
    return (bS/effectiveAmount(b)) - (aS/effectiveAmount(a))
  })

  const handleSaved = () => { setShowAdd(false); setEditBudget(null); load() }

  const detailTxs = detailBudget
    ? allTxs.filter(t => t.type === 'expense' && t.category === detailBudget.category)
    : []

  const detailBySubcat = detailTxs.reduce((acc, tx) => {
    const key = tx.subcategory?.trim() || '(no subcategory)'
    if (!acc[key]) acc[key] = { txs: [], total: 0 }
    acc[key].txs.push(tx)
    acc[key].total += tx.amount
    return acc
  }, {})
  const detailSubcats = Object.entries(detailBySubcat).sort((a,b) => b[1].total - a[1].total)
  const drillTxs = drillSubcat
    ? (detailBySubcat[drillSubcat]?.txs || []).sort((a,b) => (b.date||'').localeCompare(a.date||''))
    : []

  const budgetedCats     = new Set(budgets.map(b => b.category))
  const unbudgetedTxs    = allTxs.filter(t => t.type === 'expense' && !budgetedCats.has(t.category))
  const unbudgetedTotal  = unbudgetedTxs.reduce((a,t) => a+t.amount, 0)
  const unbudgetedByCat  = {}
  unbudgetedTxs.forEach(t => {
    if (!unbudgetedByCat[t.category]) unbudgetedByCat[t.category] = { amount:0, count:0 }
    unbudgetedByCat[t.category].amount += t.amount
    unbudgetedByCat[t.category].count  += 1
  })
  const [unbudgetedExpanded, setUnbudgetedExpanded] = useState(false)

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
            {budgets.length > 0 && (
              <div className="budget-summary-card">
                <div className="bsc-title">Total Monthly Budget</div>
                <div className="bsc-total">{fmt(totalBudgeted)}</div>
                {sec(totalBudgeted) && <div className="bsc-total-sec">{sec(totalBudgeted)}</div>}
                <div className="bsc-subtitle">
                  {fmt(totalSpent)} spent · {totalLeft >= 0 ? fmt(totalLeft)+' remaining' : fmt(Math.abs(totalLeft))+' over'}
                </div>
                {sec(totalSpent) && <div className="bsc-subtitle-sec">{sec(totalSpent)} spent</div>}
                <div className="bsc-track"><div className="bsc-fill" style={{ width:`${overallPct}%` }} /></div>
                <div className="bsc-footer">
                  <span className="bsc-progress-label">Overall Progress</span>
                  <span className="bsc-pct">{Math.round(overallPct)}%</span>
                </div>
              </div>
            )}

            {canWrite && (
              <button className="budget-create-btn" onClick={() => setShowAdd(true)}>
                <span style={{ fontSize:18 }}>＋</span> Create New Budget
              </button>
            )}

            {sorted.length === 0 ? (
              <div className="empty-state" style={{ marginTop:40 }}>
                <span className="icon">🎯</span>
                <p>No budgets yet.<br />Tap + to set a spending limit.</p>
              </div>
            ) : (
              <div className="budget-grid">
                {sorted.map((budget, idx) => {
                  const amt       = effectiveAmount(budget)
                  const spent     = spending[budget.category]||0
                  const rawPct    = amt > 0 ? (spent/amt)*100 : 0
                  const pct       = Math.min(rawPct, 100)
                  const over      = spent > amt
                  const remaining = amt - spent
                  const cat       = categories.find(c => c.name === budget.category)
                  const icon      = cat?.icon || '📦'
                  const status    = over ? 'danger' : rawPct >= 80 ? 'warn' : 'good'
                  const dotColor  = DOT_COLORS[idx % DOT_COLORS.length]
                  const overridden = hasOverride(budget)

                  return (
                    <div key={budget.id} className="budget-card">
                      {canWrite && (
                        <button className="bc-edit-btn"
                          onClick={e => { e.stopPropagation(); setEditBudget(budget) }}
                          title="Edit budget">✎</button>
                      )}
                      <button className="bc-card-inner" onClick={() => setDetailBudget(budget)}>
                        <div className="bc-card-header">
                          <div>
                            <div className="bc-card-name">
                              {icon} {budget.category}
                              {budget.recurring !== false && <span className="bc-recurring-badge">↻</span>}
                              {overridden && <span className="bc-override-badge">~{format(month,'MMM')}</span>}
                            </div>
                            <div className="bc-card-amounts">{fmt(spent)} of {fmt(amt)}</div>
                            {sec(spent) && <div className="bc-card-amounts-sec">{sec(spent)} of {sec(amt)}</div>}
                          </div>
                          <div className="bc-color-dot" style={{ background:dotColor }} />
                        </div>
                        <div className="bc-track">
                          <div className={`bc-fill ${status}`} style={{ width:`${pct}%`, background:dotColor, opacity:over?1:0.85 }} />
                        </div>
                        <div className="bc-card-footer">
                          <div className="bc-footer-left">
                            <span className={`bc-status ${status}`}>
                              {over ? '↘' : '↗'} {over ? `Over by ${fmtC(Math.abs(remaining))}` : `${fmtC(remaining)} left`}
                            </span>
                            {sec(Math.abs(remaining)) && <span className="bc-status-sec">{sec(Math.abs(remaining))}</span>}
                          </div>
                          <span className="bc-card-pct">{Math.round(rawPct)}%</span>
                        </div>
                        {rawPct >= 80 && !over && <div className="bc-warning-msg warn">⚠ Approaching budget limit</div>}
                        {over && <div className="bc-warning-msg danger">⊘ Budget exceeded</div>}
                      </button>

                      {/* Month override button */}
                      {canWrite && (
                        <button className="bc-month-btn"
                          onClick={e => { e.stopPropagation(); setOverrideBudget(budget) }}
                          title={`Adjust for ${format(month,'MMM yyyy')}`}>
                          📅 Adjust for {format(month,'MMM')}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Unbudgeted */}
            {unbudgetedTxs.length > 0 && (
              <div className="unbudgeted-card">
                <button className="unbudgeted-header" onClick={() => setUnbudgetedExpanded(v => !v)}>
                  <div className="unbudgeted-left">
                    <span className="unbudgeted-icon">⚠</span>
                    <div>
                      <div className="unbudgeted-title">Unbudgeted Spending</div>
                      <div className="unbudgeted-subtitle">
                        {Object.keys(unbudgetedByCat).length} categories · {unbudgetedTxs.length} transactions
                      </div>
                    </div>
                  </div>
                  <div className="unbudgeted-right">
                    <div className="unbudgeted-total">{fmtC(unbudgetedTotal)}</div>
                    {sec(unbudgetedTotal) && <div className="unbudgeted-sec">{sec(unbudgetedTotal)}</div>}
                    <span className="unbudgeted-chevron">{unbudgetedExpanded ? '▲' : '▼'}</span>
                  </div>
                </button>
                {unbudgetedExpanded && (
                  <div className="unbudgeted-body">
                    {Object.entries(unbudgetedByCat).sort((a,b) => b[1].amount-a[1].amount).map(([catName,data]) => {
                      const catDef = categories.find(c => c.name === catName)
                      const icon   = catDef?.icon || '📦'
                      const pct    = unbudgetedTotal > 0 ? Math.round((data.amount/unbudgetedTotal)*100) : 0
                      return (
                        <div key={catName} className="unbudgeted-cat-row">
                          <div className="unbudgeted-cat-info">
                            <span className="unbudgeted-cat-icon">{icon}</span>
                            <div>
                              <div className="unbudgeted-cat-name">{catName}</div>
                              <div className="unbudgeted-cat-count">{data.count} transaction{data.count!==1?'s':''}</div>
                            </div>
                          </div>
                          <div className="unbudgeted-cat-right">
                            <div className="unbudgeted-cat-amt">{fmt(data.amount)}</div>
                            {sec(data.amount) && <div className="unbudgeted-cat-sec">{sec(data.amount)}</div>}
                            <div className="unbudgeted-cat-pct">{pct}%</div>
                          </div>
                        </div>
                      )
                    })}
                    <div className="unbudgeted-txs-title">Recent Transactions</div>
                    {unbudgetedTxs.sort((a,b) => (b.date||'').localeCompare(a.date||'')).slice(0,5).map(tx => (
                      <button key={tx.id} className="unbudgeted-tx-row" onClick={() => setEditTx(tx)}>
                        <div className="unbudgeted-tx-info">
                          <div className="unbudgeted-tx-name">{tx.note || tx.category}</div>
                          <div className="unbudgeted-tx-meta">{tx.category} · {tx.date}</div>
                        </div>
                        <div className="unbudgeted-tx-amt">{fmt(tx.amount)}</div>
                      </button>
                    ))}
                    {unbudgetedTxs.length > 5 && <div className="unbudgeted-more">+{unbudgetedTxs.length-5} more</div>}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Budget detail sheet */}
      {detailBudget && !drillSubcat && (
        <>
          <div className="sheet-overlay" onClick={() => setDetailBudget(null)} />
          <div className="sheet">
            <div className="sheet-handle" />
            <div className="sheet-header">
              <button className="btn btn-ghost" onClick={() => { setDetailBudget(null); setDrillSubcat(null) }}>✕</button>
              <span className="sheet-title">{detailBudget.category}</span>
              {canWrite && <button className="btn btn-ghost" onClick={() => { setDetailBudget(null); setEditBudget(detailBudget) }}>✎ Edit</button>}
            </div>
            <div className="sheet-body">
              <div className="detail-budget-bar">
                <div className="detail-budget-nums">
                  <span className="detail-spent">{fmt(spending[detailBudget.category]||0)} spent</span>
                  <span className="detail-of"> of {fmt(effectiveAmount(detailBudget))}</span>
                </div>
                {hasOverride(detailBudget) && (
                  <div className="detail-override-note">
                    📅 Adjusted for {format(month,'MMMM')} · Base: {fmt(detailBudget.amount)}
                  </div>
                )}
                {sec(spending[detailBudget.category]||0) && <div className="detail-budget-sec">{sec(spending[detailBudget.category]||0)} spent</div>}
                <div className="detail-budget-track">
                  <div className="detail-budget-fill" style={{
                    width:`${Math.min(((spending[detailBudget.category]||0)/effectiveAmount(detailBudget))*100,100)}%`,
                    background:(spending[detailBudget.category]||0) > effectiveAmount(detailBudget) ? 'var(--red)' : 'var(--green)'
                  }} />
                </div>
              </div>
              {detailTxs.length === 0 ? (
                <div className="empty-state"><span className="icon">💸</span><p>No transactions this month.</p></div>
              ) : detailSubcats.length === 1 && detailSubcats[0][0] === '(no subcategory)' ? (
                <>
                  <div className="detail-tx-title">Transactions ({detailTxs.length})</div>
                  {detailTxs.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(tx => (
                    <TransactionItem key={tx.id} tx={tx} categories={categories} onClick={t => { setDetailBudget(null); setEditTx(t) }} />
                  ))}
                </>
              ) : (
                <>
                  <div className="detail-tx-title">By Subcategory ({detailTxs.length} transactions)</div>
                  {detailSubcats.map(([subcat, data]) => {
                    const pct = detailTxs.reduce((a,t)=>a+t.amount,0) > 0 ? Math.round((data.total/detailTxs.reduce((a,t)=>a+t.amount,0))*100) : 0
                    return (
                      <button key={subcat} className="detail-subcat-row" onClick={() => setDrillSubcat(subcat)}>
                        <div className="detail-subcat-left">
                          <div className="detail-subcat-name">{subcat}</div>
                          <div className="detail-subcat-count">{data.txs.length} transaction{data.txs.length!==1?'s':''}</div>
                        </div>
                        <div className="detail-subcat-right">
                          <div className="detail-subcat-amt">{fmt(data.total)}</div>
                          {sec(data.total) && <div className="detail-subcat-sec">{sec(data.total)}</div>}
                          <div className="detail-subcat-pct">{pct}%</div>
                        </div>
                        <span className="detail-subcat-arrow">›</span>
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Drill subcat sheet */}
      {detailBudget && drillSubcat && (
        <>
          <div className="sheet-overlay" onClick={() => setDrillSubcat(null)} />
          <div className="sheet">
            <div className="sheet-handle" />
            <div className="sheet-header">
              <button className="btn btn-ghost" onClick={() => setDrillSubcat(null)}>‹ Back</button>
              <span className="sheet-title">{drillSubcat}</span>
              <span style={{ width:40 }} />
            </div>
            <div className="sheet-body">
              <div className="detail-drill-summary">
                <span className="detail-drill-total">{fmt(drillTxs.reduce((a,t)=>a+t.amount,0))}</span>
                {sec(drillTxs.reduce((a,t)=>a+t.amount,0)) && <span className="detail-drill-sec"> · {sec(drillTxs.reduce((a,t)=>a+t.amount,0))}</span>}
                <span className="detail-drill-count"> · {drillTxs.length} transaction{drillTxs.length!==1?'s':''}</span>
              </div>
              {drillTxs.map(tx => (
                <TransactionItem key={tx.id} tx={tx} categories={categories}
                  onClick={t => { setDetailBudget(null); setDrillSubcat(null); setEditTx(t) }} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Month override sheet */}
      {overrideBudget && (
        <MonthOverrideSheet
          budget={overrideBudget}
          month={month}
          monthKey={monthKey}
          currentOverride={overrides.find(o => o.budgetId === overrideBudget.id)}
          currency={currency}
          user={user}
          householdId={householdId}
          onClose={() => setOverrideBudget(null)}
          onSaved={() => { setOverrideBudget(null); load() }}
        />
      )}

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

      {editTx && (
        <AddTransaction tx={editTx} onClose={() => setEditTx(null)}
          onSaved={() => { setEditTx(null); load() }} />
      )}
    </div>
  )
}

// ── Month Override Sheet ──────────────────────────────────────
function MonthOverrideSheet({ budget, month, monthKey, currentOverride, currency, user, householdId, onClose, onSaved }) {
  const sym = CURRENCY_SYMBOLS[currency||'USD'] || '$'
  const [amount, setAmount] = useState(currentOverride ? String(currentOverride.amount) : String(budget.amount))
  const [note, setNote]     = useState(currentOverride?.note || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  const handleSave = async () => {
    const amt = parseFloat(amount.replace(/,/g,''))
    if (!amt || amt <= 0) return setErr('Enter a valid amount')
    setErr(''); setSaving(true)
    try {
      await setBudgetOverride(user.uid, householdId, budget.id, monthKey, amt, note.trim())
      onSaved()
    } catch { setErr('Save failed.') } finally { setSaving(false) }
  }

  const handleRemove = async () => {
    if (!window.confirm('Remove the monthly adjustment and revert to base budget?')) return
    setSaving(true)
    try {
      await deleteBudgetOverride(user.uid, householdId, budget.id, monthKey)
      onSaved()
    } catch { setErr('Failed.') } finally { setSaving(false) }
  }

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">Adjust for {format(month,'MMMM yyyy')}</span>
          <span style={{ width:40 }} />
        </div>
        <div className="sheet-body">
          <div className="override-info">
            <div className="override-category">{budget.category}</div>
            <div className="override-base">Base budget: {sym}{parseFloat(budget.amount).toLocaleString()}</div>
            {currentOverride && <div className="override-active-badge">📅 Monthly adjustment active</div>}
          </div>

          <div className="field">
            <label>Budget for {format(month,'MMMM only')}</label>
            <div className="amount-field">
              <span className="currency-sym">{sym}</span>
              <input type="text" inputMode="decimal" placeholder="0.00"
                value={amount ? parseFloat(amount.replace(/,/g,'')).toLocaleString('en-US',{maximumFractionDigits:2}) : ''}
                onChange={e => setAmount(e.target.value.replace(/,/g,'').replace(/[^0-9.]/g,''))}
                className="amount-input" autoFocus />
            </div>
            <div className="field-hint">This overrides the base budget only for {format(month,'MMMM yyyy')}</div>
          </div>

          <div className="field">
            <label>Reason (optional)</label>
            <input type="text" placeholder="e.g. Holiday season, extra expenses"
              value={note} onChange={e => setNote(e.target.value)} />
          </div>

          {err && <p className="form-err">{err}</p>}

          <button className="btn btn-primary btn-full save-btn" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" /> : currentOverride ? 'Update Adjustment' : 'Set Monthly Budget'}
          </button>

          {currentOverride && (
            <button className="override-remove-btn" onClick={handleRemove} disabled={saving}>
              ↩ Revert to base budget ({sym}{parseFloat(budget.amount).toLocaleString()})
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// ── Budget Sheet (create/edit base budget) ────────────────────
function BudgetSheet({ budget, categories, existingCategories, onClose, onSaved, onDeleted, user, householdId, currency }) {
  const editing = !!budget
  const [category, setCategory] = useState(budget?.category||'')
  const [amount, setAmount]     = useState(budget?.amount ? String(budget.amount) : '')
  const [note, setNote]         = useState(budget?.note||'')
  const [recurring, setRecurring] = useState(budget?.recurring ?? true)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr]           = useState('')
  const [showCatPicker, setShowCatPicker] = useState(false)

  const availableCats = categories.filter(c => !existingCategories.includes(c.name) || c.name === budget?.category)
  const selectedCat   = categories.find(c => c.name === category)
  const sym = CURRENCY_SYMBOLS[currency||'USD'] || '$'

  const handleSave = async () => {
    if (!category) return setErr('Select a category')
    const amt = parseFloat(amount.replace(/,/g,''))
    if (!amount || isNaN(amt) || amt <= 0) return setErr('Enter a valid amount')
    setErr(''); setSaving(true)
    try {
      const data = { category, amount: amt, note: note.trim(), recurring }
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
          {editing ? <button className="btn btn-ghost danger-ghost" onClick={handleDelete} disabled={deleting}>{deleting ? '…' : '🗑'}</button>
                   : <span style={{ width:40 }} />}
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
            <label>Monthly Limit (Base)</label>
            <div className="amount-field">
              <span className="currency-sym">{sym}</span>
              <input type="text" inputMode="decimal" placeholder="0.00"
                value={amount ? parseFloat(amount.replace(/,/g,'')).toLocaleString('en-US',{maximumFractionDigits:2}) : ''}
                onChange={e => setAmount(e.target.value.replace(/,/g,'').replace(/[^0-9.]/g,''))}
                className="amount-input" autoFocus={!editing} />
            </div>
            <div className="field-hint">This is the default amount used every month unless you set a monthly adjustment</div>
          </div>
          <div className="field">
            <label>Note (optional)</label>
            <input type="text" placeholder="e.g. Groceries only" value={note} onChange={e => setNote(e.target.value)} />
          </div>
          <div className="budget-recurring-row">
            <div className="budget-recurring-info">
              <div className="budget-recurring-label">Repeat Every Month</div>
              <div className="budget-recurring-desc">Auto-carry this budget to the next month</div>
            </div>
            <button className={`profile-toggle ${recurring ? 'on' : 'off'}`} onClick={() => setRecurring(v => !v)}>
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
        <CategoryPicker categories={availableCats} selected={category}
          onSelect={c => { setCategory(c.name); setShowCatPicker(false) }}
          onClose={() => setShowCatPicker(false)} title="Pick Category" />
      )}
    </>
  )
}
