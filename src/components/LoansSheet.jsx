import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getTransactions, addTransaction } from '../firebase/service'
import { fmtCurrency, fmtCurrencyCompact, toFirestoreDate } from '../utils/helpers'
import { fmtSec } from '../utils/secCurrency'
import { calcLoanBalance } from '../utils/balanceCalc'
import TransactionItem from './TransactionItem'
import Toast from './Toast'
import './LoansSheet.css'

const CURRENCY_SYMBOLS = {
  NGN:'₦',USD:'$',EUR:'€',GBP:'£',GHS:'₵',KES:'KSh',ZAR:'R',EGP:'E£',
  AED:'AED',SAR:'SAR',CAD:'CA$',AUD:'A$',JPY:'¥',INR:'₹',BRL:'R$',SGD:'S$',
}
const getSym = c => CURRENCY_SYMBOLS[c] || c

export default function LoansSheet({ onClose, onSaved }) {
  const { user, householdId, currency, categories, secEnabled, secCurrency, secRate } = useApp()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading]           = useState(true)
  const [subtype, setSubtype]           = useState('borrow')
  const [amount, setAmount]             = useState('')
  const [lender, setLender]             = useState('')
  const [note, setNote]                 = useState('')
  const [date, setDate]                 = useState(toFirestoreDate(new Date()))
  const [saving, setSaving]             = useState(false)
  const [err, setErr]                   = useState('')
  const [toast, setToast]               = useState(null)
  const [showAdd, setShowAdd]           = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const txs = await getTransactions(user.uid, householdId, '2000-01-01', '2099-12-31')
      setTransactions(txs.filter(t => t.type === 'loans'))
    } finally { setLoading(false) }
  }

  const fmt  = n => fmtCurrency(n, currency)
  const fmtC = n => fmtCurrencyCompact(n, currency)
  const sec  = n => fmtSec(n, secEnabled, secRate, secCurrency)

  const balance     = calcLoanBalance(transactions)
  const totalBorrowed = transactions.filter(t => t.subtype !== 'repay').reduce((a,t) => a+t.amount, 0)
  const totalRepaid   = transactions.filter(t => t.subtype === 'repay').reduce((a,t) => a+t.amount, 0)

  const handleSave = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return setErr('Enter a valid amount')
    if (subtype === 'repay' && amt > balance) return setErr(`Can't repay more than outstanding balance (${fmt(balance)})`)
    setErr(''); setSaving(true)
    try {
      await addTransaction(user.uid, householdId, {
        type: 'loans',
        subtype,
        amount: amt,
        category: lender.trim() || 'Loans',
        note: note.trim(),
        date,
      })
      setToast({ msg: subtype === 'borrow' ? 'Loan recorded!' : 'Repayment recorded!', type: 'success' })
      setAmount(''); setNote(''); setLender('')
      await load()
      setTimeout(() => onSaved(), 600)
    } catch {
      setErr('Save failed.')
    } finally { setSaving(false) }
  }

  return (
    <>
      {toast && <Toast message={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet sheet-tall">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">🏦 Loans</span>
          <button className="btn btn-ghost" onClick={() => setShowAdd(v => !v)}>
            {showAdd ? '✕' : '＋'}
          </button>
        </div>

        <div className="sheet-body">
          {/* Balance card */}
          <div className="ln-balance-card">
            <div className="ln-balance-label">Outstanding Balance</div>
            <div className="ln-balance-amount">{fmt(balance)}</div>
            {sec(balance) && <div className="ln-balance-sec">{sec(balance)}</div>}
            {balance > 0 && (
              <div className="ln-balance-warning">You owe this amount</div>
            )}
            {balance === 0 && totalBorrowed > 0 && (
              <div className="ln-balance-clear">✓ All loans repaid!</div>
            )}
            <div className="ln-balance-stats">
              <div className="ln-stat">
                <div className="ln-stat-label">Total Borrowed</div>
                <div className="ln-stat-value borrow">{fmtC(totalBorrowed)}</div>
              </div>
              <div className="ln-stat-divider" />
              <div className="ln-stat">
                <div className="ln-stat-label">Total Repaid</div>
                <div className="ln-stat-value repay">{fmtC(totalRepaid)}</div>
              </div>
            </div>
          </div>

          {/* Add form */}
          {showAdd && (
            <div className="ln-add-form">
              <div className="ln-type-toggle">
                <button
                  className={`ln-type-btn ${subtype === 'borrow' ? 'active-borrow' : ''}`}
                  onClick={() => setSubtype('borrow')}
                >↓ Borrow</button>
                <button
                  className={`ln-type-btn ${subtype === 'repay' ? 'active-repay' : ''}`}
                  onClick={() => setSubtype('repay')}
                >↑ Repay</button>
              </div>

              <div className="amount-field">
                <span className="currency-sym">{getSym(currency)}</span>
                <input
                  type="text" inputMode="decimal" placeholder="0.00"
                  value={amount ? parseFloat(amount.replace(/,/g,'')).toLocaleString('en-US', {maximumFractionDigits:2}) : ''}
                  onChange={e => {
                    const raw = e.target.value.replace(/,/g, '').replace(/[^0-9.]/g, '')
                    const parts = raw.split('.')
                    setAmount(parts.length > 1 ? parts[0] + '.' + parts[1] : parts[0])
                  }}
                  className="amount-input" autoFocus
                />
              </div>

              <div className="field">
                <label>{subtype === 'borrow' ? 'Lender / Source' : 'Repaying to'}</label>
                <input type="text" placeholder="e.g. John, Bank, GTBank"
                  value={lender} onChange={e => setLender(e.target.value)} />
              </div>

              <div className="field">
                <label>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>

              <div className="field">
                <label>Note (optional)</label>
                <input type="text" placeholder="What's this for?"
                  value={note} onChange={e => setNote(e.target.value)} />
              </div>

              {err && <p className="form-err">{err}</p>}

              <button className="btn btn-primary btn-full save-btn" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner" /> : subtype === 'borrow' ? 'Record Loan' : 'Record Repayment'}
              </button>
            </div>
          )}

          {/* History */}
          <div className="ln-history-title">
            History ({transactions.length})
          </div>
          {loading ? (
            <div className="load-row"><span className="spinner" /></div>
          ) : transactions.length === 0 ? (
            <div className="empty-state">
              <span className="icon">🏦</span>
              <p>No loan transactions yet.<br />Tap + to record a loan.</p>
            </div>
          ) : (
            [...transactions]
              .sort((a,b) => b.date?.localeCompare?.(a.date) || 0)
              .map(tx => (
                <TransactionItem key={tx.id} tx={tx} categories={categories} onClick={() => {}} />
              ))
          )}
        </div>
      </div>
    </>
  )
}
