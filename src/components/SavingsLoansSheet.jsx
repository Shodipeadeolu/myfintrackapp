import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import {
  getSavingsAccounts, addSavingsAccount, updateSavingsAccount, deleteSavingsAccount,
  getSavingsTransactions, addSavingsTransaction,
  getLoans, addLoan, updateLoan, deleteLoan,
  getLoanPayments, addLoanPayment
} from '../firebase/savingsLoans'
import { addTransaction } from '../firebase/service'
import { fmtCurrency, toFirestoreDate } from '../utils/helpers'
import './SavingsLoansSheet.css'

const CURRENCY_SYMBOLS = {
  NGN:'₦',USD:'$',EUR:'€',GBP:'£',GHS:'₵',KES:'KSh',ZAR:'R',
  EGP:'E£',AED:'AED',CAD:'CA$',AUD:'A$',JPY:'¥',INR:'₹',
}
const getSym = c => CURRENCY_SYMBOLS[c] || c

const ACCOUNT_ICONS = ['🏦','💰','🏠','🚗','✈️','🎓','👶','💍','🌍','📦','🌱','🏋️']
const LOAN_ICONS    = ['🚗','🏠','🎓','💼','🏥','💳','🏦','📱']
const LOAN_COLORS   = ['#4d96ff','#ff6b6b','#ffd93d','#6bcb77','#ff922b','#cc5de8','#20c997','#f06595']

// Payoff date calc
function calcPayoff(remaining, monthlyPayment, annualRate) {
  if (!monthlyPayment || monthlyPayment <= 0) return null
  if (!annualRate || annualRate <= 0) {
    const months = Math.ceil(remaining / monthlyPayment)
    const d = new Date(); d.setMonth(d.getMonth() + months)
    return { months, date: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) }
  }
  const r = (annualRate / 100) / 12
  let bal = remaining, months = 0
  while (bal > 0 && months < 600) {
    bal = bal * (1 + r) - monthlyPayment
    months++
  }
  if (months >= 600) return null
  const d = new Date(); d.setMonth(d.getMonth() + months)
  return { months, date: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) }
}

export default function SavingsLoansSheet({ onClose }) {
  const { user, householdId, currency, canWrite, categories } = useApp()
  const [tab, setTab]                   = useState('savings')
  const [savingsAccounts, setSavings]   = useState([])
  const [loans, setLoans]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [activeAccount, setActiveAccount] = useState(null) // savings account detail
  const [activeLoan, setActiveLoan]     = useState(null)   // loan detail
  const [showAddSavings, setShowAddSavings] = useState(false)
  const [showAddLoan, setShowAddLoan]   = useState(false)
  const [editSavings, setEditSavings]   = useState(null)
  const [editLoan, setEditLoan]         = useState(null)

  const fmt = n => fmtCurrency(n, currency)
  const sym = getSym(currency)

  useEffect(() => { load() }, [user, householdId])

  const load = async () => {
    setLoading(true)
    try {
      const [sa, lo] = await Promise.all([
        getSavingsAccounts(user.uid, householdId),
        getLoans(user.uid, householdId)
      ])
      setSavings(sa)
      setLoans(lo)
    } finally { setLoading(false) }
  }

  const totalSavings = savingsAccounts.reduce((a, s) => a + (s.balance || 0), 0)
  const totalDebt    = loans.reduce((a, l) => a + (l.remainingBalance || 0), 0)

  // ── Main sheet ───────────────────────────────────────────────
  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet savings-sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">Savings & Loans</span>
          <span style={{ width: 40 }} />
        </div>

        {/* Tabs */}
        <div className="sl-tabs">
          <button className={`sl-tab ${tab === 'savings' ? 'active' : ''}`} onClick={() => setTab('savings')}>
            💰 Savings
          </button>
          <button className={`sl-tab ${tab === 'loans' ? 'active loans-active' : ''}`} onClick={() => setTab('loans')}>
            🏦 Loans
          </button>
        </div>

        <div className="sheet-body sl-body">
          {loading ? (
            <div className="load-row"><span className="spinner" /></div>
          ) : tab === 'savings' ? (
            <SavingsTab
              accounts={savingsAccounts} totalSavings={totalSavings}
              fmt={fmt} sym={sym} canWrite={canWrite}
              onAdd={() => setShowAddSavings(true)}
              onEdit={a => setEditSavings(a)}
              onSelect={a => setActiveAccount(a)}
              user={user} householdId={householdId}
              currency={currency} categories={categories}
              reload={load}
            />
          ) : (
            <LoansTab
              loans={loans} totalDebt={totalDebt}
              fmt={fmt} sym={sym} canWrite={canWrite}
              onAdd={() => setShowAddLoan(true)}
              onEdit={l => setEditLoan(l)}
              onSelect={l => setActiveLoan(l)}
              currency={currency}
              reload={load}
            />
          )}
        </div>
      </div>

      {/* Savings account detail */}
      {activeAccount && (
        <AccountDetail
          account={activeAccount}
          fmt={fmt} sym={sym} canWrite={canWrite}
          user={user} householdId={householdId}
          currency={currency} categories={categories}
          onClose={() => { setActiveAccount(null); load() }}
          onEdit={() => { setEditSavings(activeAccount); setActiveAccount(null) }}
        />
      )}

      {/* Loan detail */}
      {activeLoan && (
        <LoanDetail
          loan={activeLoan}
          fmt={fmt} sym={sym} canWrite={canWrite}
          user={user} householdId={householdId}
          currency={currency}
          onClose={() => { setActiveLoan(null); load() }}
          onEdit={() => { setEditLoan(activeLoan); setActiveLoan(null) }}
        />
      )}

      {/* Add/Edit forms */}
      {(showAddSavings || editSavings) && (
        <SavingsForm
          account={editSavings}
          sym={sym} user={user} householdId={householdId}
          onClose={() => { setShowAddSavings(false); setEditSavings(null) }}
          onSaved={() => { setShowAddSavings(false); setEditSavings(null); load() }}
        />
      )}
      {(showAddLoan || editLoan) && (
        <LoanForm
          loan={editLoan}
          sym={sym} user={user} householdId={householdId}
          onClose={() => { setShowAddLoan(false); setEditLoan(null) }}
          onSaved={() => { setShowAddLoan(false); setEditLoan(null); load() }}
        />
      )}
    </>
  )
}

// ── Savings tab ──────────────────────────────────────────────────
function SavingsTab({ accounts, totalSavings, fmt, sym, canWrite, onAdd, onEdit, onSelect, reload }) {
  return (
    <div className="sl-tab-content">
      {/* Total */}
      <div className="sl-summary-card savings-summary">
        <div className="sl-sum-label">Total Savings</div>
        <div className="sl-sum-value">{fmt(totalSavings)}</div>
        <div className="sl-sum-sub">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</div>
      </div>

      {accounts.length === 0 ? (
        <div className="empty-state">
          <span className="icon">💰</span>
          <p>No savings accounts yet.<br />Tap + to create one.</p>
        </div>
      ) : (
        <div className="sl-list">
          {accounts.map(a => {
            const pct = a.target > 0 ? Math.min((a.balance / a.target) * 100, 100) : null
            return (
              <button key={a.id} className="sl-card" onClick={() => onSelect(a)}>
                <div className="sl-card-left">
                  <div className="sl-card-icon" style={{ background: a.color + '22' }}>
                    {a.icon || '💰'}
                  </div>
                  <div>
                    <div className="sl-card-name">{a.name}</div>
                    {a.target > 0 && (
                      <div className="sl-card-sub">Goal: {fmt(a.target)}</div>
                    )}
                  </div>
                </div>
                <div className="sl-card-right">
                  <div className="sl-card-balance savings">{fmt(a.balance)}</div>
                  {pct !== null && <div className="sl-card-pct">{Math.round(pct)}%</div>}
                </div>
                {pct !== null && (
                  <div className="sl-card-bar-row">
                    <div className="sl-card-bar-track">
                      <div className="sl-card-bar-fill savings" style={{ width: `${pct}%`, background: a.color || 'var(--green)' }} />
                    </div>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {canWrite && (
        <button className="sl-add-btn" onClick={onAdd}>
          + New Savings Account
        </button>
      )}
    </div>
  )
}

// ── Loans tab ───────────────────────────────────────────────────
function LoansTab({ loans, totalDebt, fmt, sym, canWrite, onAdd, onSelect }) {
  return (
    <div className="sl-tab-content">
      <div className="sl-summary-card loans-summary">
        <div className="sl-sum-label">Total Outstanding</div>
        <div className="sl-sum-value debt">{fmt(totalDebt)}</div>
        <div className="sl-sum-sub">{loans.length} loan{loans.length !== 1 ? 's' : ''}</div>
      </div>

      {loans.length === 0 ? (
        <div className="empty-state">
          <span className="icon">🏦</span>
          <p>No loans tracked yet.<br />Tap + to add one.</p>
        </div>
      ) : (
        <div className="sl-list">
          {loans.map((l, i) => {
            const paidPct = l.principal > 0
              ? Math.min(((l.principal - l.remainingBalance) / l.principal) * 100, 100)
              : 0
            const payoff = calcPayoff(l.remainingBalance, l.monthlyPayment, l.interestRate)
            const color  = LOAN_COLORS[i % LOAN_COLORS.length]
            return (
              <button key={l.id} className="sl-card" onClick={() => onSelect(l)}>
                <div className="sl-card-left">
                  <div className="sl-card-icon" style={{ background: color + '22' }}>
                    {l.icon || '🏦'}
                  </div>
                  <div>
                    <div className="sl-card-name">{l.name}</div>
                    <div className="sl-card-sub">
                      {l.interestRate ? `${l.interestRate}% p.a.` : 'No interest'}
                      {payoff ? ` · Payoff ${payoff.date}` : ''}
                    </div>
                  </div>
                </div>
                <div className="sl-card-right">
                  <div className="sl-card-balance debt">{fmt(l.remainingBalance)}</div>
                  <div className="sl-card-pct">{Math.round(paidPct)}% paid</div>
                </div>
                <div className="sl-card-bar-row">
                  <div className="sl-card-bar-track">
                    <div className="sl-card-bar-fill" style={{ width: `${paidPct}%`, background: color }} />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {canWrite && (
        <button className="sl-add-btn" onClick={onAdd}>+ Add Loan</button>
      )}
    </div>
  )
}

// ── Account detail (deposit / withdraw) ─────────────────────────
function AccountDetail({ account, fmt, sym, canWrite, user, householdId, currency, categories, onClose, onEdit }) {
  const [txns, setTxns]       = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode]       = useState(null) // 'deposit' | 'withdraw'
  const [amount, setAmount]   = useState('')
  const [note, setNote]       = useState('')
  const [date, setDate]       = useState(toFirestoreDate(new Date()))
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState('')

  const fmt2 = n => fmtCurrency(n, currency)

  useEffect(() => {
    getSavingsTransactions(account.id).then(t => { setTxns(t); setLoading(false) })
  }, [account.id])

  const handleMove = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return setErr('Enter a valid amount')
    if (mode === 'withdraw' && amt > account.balance) return setErr('Insufficient balance')
    setErr(''); setSaving(true)
    try {
      const delta     = mode === 'deposit' ? amt : -amt
      const newBal    = (account.balance || 0) + delta

      // 1. Update savings account balance
      await updateSavingsAccount(account.id, { balance: newBal })

      // 2. Record savings transaction
      await addSavingsTransaction(account.id, {
        type: mode, amount: amt,
        note: note.trim() || (mode === 'deposit' ? 'Deposit' : 'Withdrawal'),
        date
      })

      // 3. Mirror as a regular transaction
      const savingsCat = categories.find(c =>
        c.name.toLowerCase().includes('saving') || c.name.toLowerCase().includes('investment')
      )
      await addTransaction(user.uid, householdId, {
        type:     mode === 'deposit' ? 'expense' : 'income', // deposit = money leaving wallet
        amount:   amt,
        category: savingsCat?.name || 'Savings',
        subcategory: account.name,
        note:     note.trim() || `${mode === 'deposit' ? 'Saved to' : 'Withdrew from'} ${account.name}`,
        date
      })

      onClose()
    } catch (e) {
      setErr('Failed. Try again.')
      setSaving(false)
    }
  }

  const pct = account.target > 0
    ? Math.min((account.balance / account.target) * 100, 100)
    : null

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>‹ Back</button>
          <span className="sheet-title">{account.name}</span>
          {canWrite && <button className="btn btn-ghost" onClick={onEdit}>✎</button>}
        </div>
        <div className="sheet-body">
          {/* Balance hero */}
          <div className="acct-hero" style={{ background: (account.color || '#00c48c') + '22' }}>
            <div className="acct-hero-icon">{account.icon || '💰'}</div>
            <div className="acct-hero-balance">{fmt2(account.balance)}</div>
            <div className="acct-hero-label">Current Balance</div>
            {account.target > 0 && (
              <>
                <div className="acct-hero-goal">Goal: {fmt2(account.target)}</div>
                <div className="acct-bar-track">
                  <div className="acct-bar-fill" style={{ width: `${pct}%`, background: account.color || 'var(--green)' }} />
                </div>
                <div className="acct-bar-pct">{Math.round(pct)}% of goal reached</div>
              </>
            )}
          </div>

          {/* Action buttons */}
          {canWrite && !mode && (
            <div className="acct-actions">
              <button className="acct-action-btn deposit" onClick={() => setMode('deposit')}>
                ↓ Deposit
              </button>
              <button className="acct-action-btn withdraw" onClick={() => setMode('withdraw')}>
                ↑ Withdraw
              </button>
            </div>
          )}

          {/* Deposit / Withdraw form */}
          {mode && (
            <div className="acct-form">
              <div className="acct-form-title">
                {mode === 'deposit' ? '↓ Deposit to' : '↑ Withdraw from'} {account.name}
              </div>
              <div className="amount-field">
                <span className="currency-sym">{sym}</span>
                <input type="number" inputMode="decimal" placeholder="0.00"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  className="amount-input" autoFocus />
              </div>
              <div className="field" style={{ marginTop: 12 }}>
                <label>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="field">
                <label>Note (optional)</label>
                <input type="text" placeholder="e.g. Monthly savings"
                  value={note} onChange={e => setNote(e.target.value)} />
              </div>
              {err && <p className="form-err">{err}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setMode(null); setAmount(''); setErr('') }}>
                  Cancel
                </button>
                <button className={`btn btn-full ${mode === 'deposit' ? 'btn-primary' : 'btn-withdraw'}`}
                  style={{ flex: 2 }} onClick={handleMove} disabled={saving}>
                  {saving ? <span className="spinner" /> : mode === 'deposit' ? 'Deposit' : 'Withdraw'}
                </button>
              </div>
            </div>
          )}

          {/* Transaction history */}
          <div className="acct-history-title">History</div>
          {loading ? (
            <div className="load-row"><span className="spinner" /></div>
          ) : txns.length === 0 ? (
            <p className="acct-empty">No transactions yet.</p>
          ) : (
            txns.map(t => (
              <div key={t.id} className={`acct-txn ${t.type}`}>
                <div className="acct-txn-info">
                  <div className="acct-txn-note">{t.note}</div>
                  <div className="acct-txn-date">{t.date}</div>
                </div>
                <div className={`acct-txn-amt ${t.type}`}>
                  {t.type === 'deposit' ? '+' : '-'}{fmt2(t.amount)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}

// ── Loan detail (record payment) ────────────────────────────────
function LoanDetail({ loan, fmt, sym, canWrite, user, householdId, currency, onClose, onEdit }) {
  const [payments, setPayments] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [amount, setAmount]     = useState('')
  const [note, setNote]         = useState('')
  const [date, setDate]         = useState(toFirestoreDate(new Date()))
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState('')

  const fmt2   = n => fmtCurrency(n, currency)
  const paidPct = loan.principal > 0
    ? Math.min(((loan.principal - loan.remainingBalance) / loan.principal) * 100, 100) : 0
  const payoff = calcPayoff(loan.remainingBalance, loan.monthlyPayment, loan.interestRate)

  useEffect(() => {
    getLoanPayments(loan.id).then(p => { setPayments(p); setLoading(false) })
  }, [loan.id])

  const handlePayment = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return setErr('Enter a valid amount')
    if (amt > loan.remainingBalance) return setErr(`Max payment is ${fmt2(loan.remainingBalance)}`)
    setErr(''); setSaving(true)
    try {
      const newBal = loan.remainingBalance - amt
      await updateLoan(loan.id, { remainingBalance: newBal })
      await addLoanPayment(loan.id, { amount: amt, note: note.trim() || 'Payment', date })
      await addTransaction(user.uid, householdId, {
        type: 'expense', amount: amt,
        category: 'Loan Payment',
        subcategory: loan.name,
        note: note.trim() || `Payment — ${loan.name}`,
        date
      })
      onClose()
    } catch (e) {
      setErr('Failed. Try again.')
      setSaving(false)
    }
  }

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>‹ Back</button>
          <span className="sheet-title">{loan.name}</span>
          {canWrite && <button className="btn btn-ghost" onClick={onEdit}>✎</button>}
        </div>
        <div className="sheet-body">
          {/* Loan hero */}
          <div className="acct-hero loan-hero">
            <div className="acct-hero-icon">{loan.icon || '🏦'}</div>
            <div className="acct-hero-balance debt">{fmt2(loan.remainingBalance)}</div>
            <div className="acct-hero-label">Remaining Balance</div>
            <div className="loan-stats-row">
              <div className="loan-stat">
                <div className="loan-stat-label">Principal</div>
                <div className="loan-stat-val">{fmt2(loan.principal)}</div>
              </div>
              <div className="loan-stat">
                <div className="loan-stat-label">Rate</div>
                <div className="loan-stat-val">{loan.interestRate ? `${loan.interestRate}%` : '—'}</div>
              </div>
              <div className="loan-stat">
                <div className="loan-stat-label">Monthly</div>
                <div className="loan-stat-val">{loan.monthlyPayment ? fmt2(loan.monthlyPayment) : '—'}</div>
              </div>
              <div className="loan-stat">
                <div className="loan-stat-label">Payoff</div>
                <div className="loan-stat-val">{payoff ? payoff.date : '—'}</div>
              </div>
            </div>
            <div className="acct-bar-track">
              <div className="acct-bar-fill loan-fill" style={{ width: `${paidPct}%` }} />
            </div>
            <div className="acct-bar-pct">{Math.round(paidPct)}% paid off</div>
          </div>

          {/* Record payment */}
          {canWrite && !showForm && (
            <button className="btn btn-primary btn-full" onClick={() => setShowForm(true)}>
              Record Payment
            </button>
          )}

          {showForm && (
            <div className="acct-form">
              <div className="acct-form-title">Record Payment</div>
              <div className="amount-field">
                <span className="currency-sym">{sym}</span>
                <input type="number" inputMode="decimal" placeholder="0.00"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  className="amount-input" autoFocus />
              </div>
              <div className="field" style={{ marginTop: 12 }}>
                <label>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="field">
                <label>Note (optional)</label>
                <input type="text" placeholder="e.g. April payment"
                  value={note} onChange={e => setNote(e.target.value)} />
              </div>
              {err && <p className="form-err">{err}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={handlePayment} disabled={saving}>
                  {saving ? <span className="spinner" /> : 'Record Payment'}
                </button>
              </div>
            </div>
          )}

          <div className="acct-history-title">Payment History</div>
          {loading ? (
            <div className="load-row"><span className="spinner" /></div>
          ) : payments.length === 0 ? (
            <p className="acct-empty">No payments recorded yet.</p>
          ) : (
            payments.map(p => (
              <div key={p.id} className="acct-txn deposit">
                <div className="acct-txn-info">
                  <div className="acct-txn-note">{p.note}</div>
                  <div className="acct-txn-date">{p.date}</div>
                </div>
                <div className="acct-txn-amt deposit">-{fmt2(p.amount)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}

// ── Add/Edit Savings Account form ───────────────────────────────
function SavingsForm({ account, sym, user, householdId, onClose, onSaved }) {
  const editing = !!account
  const [name, setName]     = useState(account?.name || '')
  const [icon, setIcon]     = useState(account?.icon || '💰')
  const [color, setColor]   = useState(account?.color || '#00c48c')
  const [target, setTarget] = useState(account?.target ? String(account.target) : '')
  const [note, setNote]     = useState(account?.note || '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr]       = useState('')

  const COLORS = ['#00c48c','#4d96ff','#ff922b','#cc5de8','#ff6b6b','#ffd93d','#20c997','#f06595']

  const handleSave = async () => {
    if (!name.trim()) return setErr('Enter a name')
    setSaving(true)
    try {
      const data = { name: name.trim(), icon, color, note: note.trim(),
        target: target ? parseFloat(target) : 0 }
      editing
        ? await updateSavingsAccount(account.id, data)
        : await addSavingsAccount(user.uid, householdId, data)
      onSaved()
    } catch { setErr('Save failed.') } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${account.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try { await deleteSavingsAccount(account.id); onSaved() }
    catch { setErr('Delete failed.') } finally { setDeleting(false) }
  }

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">{editing ? 'Edit Account' : 'New Savings Account'}</span>
          {editing
            ? <button className="btn btn-ghost danger-ghost" onClick={handleDelete} disabled={deleting}>🗑</button>
            : <span style={{ width: 40 }} />
          }
        </div>
        <div className="sheet-body">
          <div className="field"><label>Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Emergency Fund" autoFocus />
          </div>
          <div className="field"><label>Icon</label>
            <div className="icon-grid">
              {ACCOUNT_ICONS.map(ic => (
                <button key={ic} className={`icon-btn ${icon === ic ? 'selected' : ''}`} onClick={() => setIcon(ic)}>{ic}</button>
              ))}
            </div>
          </div>
          <div className="field"><label>Colour</label>
            <div className="color-row">
              {COLORS.map(c => (
                <button key={c} className={`color-dot ${color === c ? 'selected' : ''}`}
                  style={{ background: c }} onClick={() => setColor(c)} />
              ))}
            </div>
          </div>
          <div className="field"><label>Savings Goal (optional)</label>
            <div className="amount-field">
              <span className="currency-sym">{sym}</span>
              <input type="number" inputMode="decimal" placeholder="0.00"
                value={target} onChange={e => setTarget(e.target.value)} className="amount-input" />
            </div>
          </div>
          <div className="field"><label>Note (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="What is this account for?" />
          </div>
          {err && <p className="form-err">{err}</p>}
          <button className="btn btn-primary btn-full save-btn" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" /> : editing ? 'Save Changes' : 'Create Account'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Add/Edit Loan form ──────────────────────────────────────────
function LoanForm({ loan, sym, user, householdId, onClose, onSaved }) {
  const editing = !!loan
  const [name, setName]             = useState(loan?.name || '')
  const [icon, setIcon]             = useState(loan?.icon || '🏦')
  const [principal, setPrincipal]   = useState(loan?.principal ? String(loan.principal) : '')
  const [remaining, setRemaining]   = useState(loan?.remainingBalance ? String(loan.remainingBalance) : '')
  const [rate, setRate]             = useState(loan?.interestRate ? String(loan.interestRate) : '')
  const [monthly, setMonthly]       = useState(loan?.monthlyPayment ? String(loan.monthlyPayment) : '')
  const [startDate, setStartDate]   = useState(loan?.startDate || toFirestoreDate(new Date()))
  const [note, setNote]             = useState(loan?.note || '')
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [err, setErr]               = useState('')

  const payoff = calcPayoff(parseFloat(remaining) || 0, parseFloat(monthly) || 0, parseFloat(rate) || 0)

  const handleSave = async () => {
    if (!name.trim()) return setErr('Enter a loan name')
    const p = parseFloat(principal)
    if (!p || p <= 0) return setErr('Enter the principal amount')
    const r = parseFloat(remaining) || p
    setSaving(true)
    try {
      const data = {
        name: name.trim(), icon, note: note.trim(),
        principal: p,
        remainingBalance: editing ? (parseFloat(remaining) || loan.remainingBalance) : p,
        interestRate: parseFloat(rate) || 0,
        monthlyPayment: parseFloat(monthly) || 0,
        startDate
      }
      editing ? await updateLoan(loan.id, data) : await addLoan(user.uid, householdId, data)
      onSaved()
    } catch { setErr('Save failed.') } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${loan.name}"?`)) return
    setDeleting(true)
    try { await deleteLoan(loan.id); onSaved() }
    catch { setErr('Delete failed.') } finally { setDeleting(false) }
  }

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">{editing ? 'Edit Loan' : 'Add Loan'}</span>
          {editing
            ? <button className="btn btn-ghost danger-ghost" onClick={handleDelete} disabled={deleting}>🗑</button>
            : <span style={{ width: 40 }} />
          }
        </div>
        <div className="sheet-body">
          <div className="field"><label>Loan Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Car Loan" autoFocus />
          </div>
          <div className="field"><label>Icon</label>
            <div className="icon-grid">
              {LOAN_ICONS.map(ic => (
                <button key={ic} className={`icon-btn ${icon === ic ? 'selected' : ''}`} onClick={() => setIcon(ic)}>{ic}</button>
              ))}
            </div>
          </div>
          <div className="field"><label>Principal Amount</label>
            <div className="amount-field">
              <span className="currency-sym">{sym}</span>
              <input type="number" inputMode="decimal" placeholder="0.00"
                value={principal} onChange={e => { setPrincipal(e.target.value); if (!editing) setRemaining(e.target.value) }}
                className="amount-input" />
            </div>
          </div>
          {editing && (
            <div className="field"><label>Remaining Balance</label>
              <div className="amount-field">
                <span className="currency-sym">{sym}</span>
                <input type="number" inputMode="decimal" placeholder="0.00"
                  value={remaining} onChange={e => setRemaining(e.target.value)} className="amount-input" />
              </div>
            </div>
          )}
          <div className="field"><label>Annual Interest Rate (%)</label>
            <input type="number" inputMode="decimal" placeholder="e.g. 12.5"
              value={rate} onChange={e => setRate(e.target.value)} />
          </div>
          <div className="field"><label>Monthly Payment</label>
            <div className="amount-field">
              <span className="currency-sym">{sym}</span>
              <input type="number" inputMode="decimal" placeholder="0.00"
                value={monthly} onChange={e => setMonthly(e.target.value)} className="amount-input" />
            </div>
          </div>
          {payoff && (
            <div className="loan-payoff-preview">
              🎯 Estimated payoff: <strong>{payoff.date}</strong> ({payoff.months} month{payoff.months !== 1 ? 's' : ''})
            </div>
          )}
          <div className="field"><label>Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="field"><label>Note (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. GTBank car loan" />
          </div>
          {err && <p className="form-err">{err}</p>}
          <button className="btn btn-primary btn-full save-btn" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" /> : editing ? 'Save Changes' : 'Add Loan'}
          </button>
        </div>
      </div>
    </>
  )
}
