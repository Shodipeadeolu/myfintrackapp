import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getTransactions, addTransaction } from '../firebase/service'
import { fmtCurrency, fmtCurrencyCompact, toFirestoreDate } from '../utils/helpers'
import { fmtSec } from '../utils/secCurrency'
import { calcSavingsBalance } from '../utils/balanceCalc'
import TransactionItem from './TransactionItem'
import Toast from './Toast'
import './SavingsSheet.css'

const CURRENCY_SYMBOLS = {
  NGN:'₦',USD:'$',EUR:'€',GBP:'£',GHS:'₵',KES:'KSh',ZAR:'R',EGP:'E£',
  AED:'AED',SAR:'SAR',CAD:'CA$',AUD:'A$',JPY:'¥',INR:'₹',BRL:'R$',SGD:'S$',
}
const getSym = c => CURRENCY_SYMBOLS[c] || c

export default function SavingsSheet({ onClose, onSaved }) {
  const { user, householdId, currency, categories, secEnabled, secCurrency, secRate } = useApp()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading]           = useState(true)
  const [subtype, setSubtype]           = useState('deposit') // deposit | withdraw
  const [amount, setAmount]             = useState('')
  const [category, setCategory]         = useState('Savings')
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
      // Fetch all savings transactions (all time for balance)
      const txs = await getTransactions(user.uid, householdId, '2000-01-01', '2099-12-31')
      setTransactions(txs.filter(t => t.type === 'savings'))
    } finally { setLoading(false) }
  }

  const fmt  = n => fmtCurrency(n, currency)
  const fmtC = n => fmtCurrencyCompact(n, currency)
  const sec  = n => fmtSec(n, secEnabled, secRate, secCurrency)

  const balance    = calcSavingsBalance(transactions)
  const totalIn    = transactions.filter(t => t.subtype !== 'withdraw').reduce((a,t) => a+t.amount, 0)
  const totalOut   = transactions.filter(t => t.subtype === 'withdraw').reduce((a,t) => a+t.amount, 0)

  const handleSave = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return setErr('Enter a valid amount')
    if (subtype === 'withdraw' && amt > balance) return setErr(`Can't withdraw more than savings balance (${fmt(balance)})`)
    setErr(''); setSaving(true)
    try {
      await addTransaction(user.uid, householdId, {
        type: 'savings',
        subtype,
        amount: amt,
        category: category || 'Savings',
        note: note.trim(),
        date,
      })
      setToast({ msg: subtype === 'deposit' ? 'Deposited to savings!' : 'Withdrawn from savings!', type: 'success' })
      setAmount(''); setNote('')
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
          <span className="sheet-title">💰 Savings</span>
          <button className="btn btn-ghost" onClick={() => setShowAdd(v => !v)}>
            {showAdd ? '✕' : '＋'}
          </button>
        </div>

        <div className="sheet-body">
          {/* Balance card */}
          <div className="sv-balance-card">
            <div className="sv-balance-label">Savings Balance</div>
            <div className="sv-balance-amount">{fmt(balance)}</div>
            {sec(balance) && <div className="sv-balance-sec">{sec(balance)}</div>}
            <div className="sv-balance-stats">
              <div className="sv-stat">
                <div className="sv-stat-label">Total Deposited</div>
                <div className="sv-stat-value deposit">{fmtC(totalIn)}</div>
              </div>
              <div className="sv-stat-divider" />
              <div className="sv-stat">
                <div className="sv-stat-label">Total Withdrawn</div>
                <div className="sv-stat-value withdraw">{fmtC(totalOut)}</div>
              </div>
            </div>
          </div>

          {/* Add transaction form */}
          {showAdd && (
            <div className="sv-add-form">
              <div className="sv-type-toggle">
                <button
                  className={`sv-type-btn ${subtype === 'deposit' ? 'active-deposit' : ''}`}
                  onClick={() => setSubtype('deposit')}
                >↓ Deposit</button>
                <button
                  className={`sv-type-btn ${subtype === 'withdraw' ? 'active-withdraw' : ''}`}
                  onClick={() => setSubtype('withdraw')}
                >↑ Withdraw</button>
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
                <label>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>

              <div className="field">
                <label>Note (optional)</label>
                <input type="text" placeholder="e.g. Emergency fund"
                  value={note} onChange={e => setNote(e.target.value)} />
              </div>

              {err && <p className="form-err">{err}</p>}

              <button className="btn btn-primary btn-full save-btn" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner" /> : subtype === 'deposit' ? 'Deposit' : 'Withdraw'}
              </button>
            </div>
          )}

          {/* Transaction history */}
          <div className="sv-history-title">
            History ({transactions.length})
          </div>
          {loading ? (
            <div className="load-row"><span className="spinner" /></div>
          ) : transactions.length === 0 ? (
            <div className="empty-state">
              <span className="icon">💰</span>
              <p>No savings transactions yet.<br />Tap + to make a deposit.</p>
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
