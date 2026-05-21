import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import {
  getSavingsAccounts, addSavingsAccount, updateSavingsAccount, deleteSavingsAccount,
  getSavingsTxs, addSavingsTx
} from '../firebase/savingsLoans'
import { fmtCurrency, fmtCurrencyCompact, toFirestoreDate } from '../utils/helpers'
import { fmtSec } from '../utils/secCurrency'
import Toast from './Toast'
import './SavingsSheet.css'

const CURRENCY_SYMBOLS = {
  NGN:'₦',USD:'$',EUR:'€',GBP:'£',GHS:'₵',KES:'KSh',ZAR:'R',
  AED:'AED',CAD:'CA$',AUD:'A$',JPY:'¥',INR:'₹',SGD:'S$',
}
const getSym = c => CURRENCY_SYMBOLS[c] || c

export default function SavingsSheet({ onClose }) {
  const { user, householdId, currency, secEnabled, secCurrency, secRate } = useApp()
  const [accounts, setAccounts]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [view, setView]             = useState('list')      // list | detail | create
  const [selectedAcc, setSelectedAcc] = useState(null)
  const [accTxs, setAccTxs]         = useState([])
  const [txLoading, setTxLoading]   = useState(false)
  const [toast, setToast]           = useState(null)

  // Create account form
  const [newName, setNewName]       = useState('')
  const [newNote, setNewNote]       = useState('')
  const [creating, setCreating]     = useState(false)

  // Transaction form
  const [txSubtype, setTxSubtype]   = useState('deposit')
  const [txAmount, setTxAmount]     = useState('')
  const [txNote, setTxNote]         = useState('')
  const [txDate, setTxDate]         = useState(toFirestoreDate(new Date()))
  const [txSaving, setTxSaving]     = useState(false)
  const [txErr, setTxErr]           = useState('')
  const [showTxForm, setShowTxForm] = useState(false)

  useEffect(() => { loadAccounts() }, [])

  const loadAccounts = async () => {
    setLoading(true)
    try {
      const accs = await getSavingsAccounts(user.uid, householdId)
      // Fetch balances for each account
      const withBalances = await Promise.all(accs.map(async acc => {
        const txs = await getSavingsTxs(acc.id)
        const balance = txs.reduce((a, t) => t.subtype === 'withdraw' ? a - t.amount : a + t.amount, 0)
        return { ...acc, balance, txCount: txs.length }
      }))
      setAccounts(withBalances)
    } finally { setLoading(false) }
  }

  const openDetail = async (acc) => {
    setSelectedAcc(acc)
    setView('detail')
    setTxLoading(true)
    try {
      const txs = await getSavingsTxs(acc.id)
      setAccTxs(txs.sort((a, b) => (b.date||'').localeCompare(a.date||'')))
    } finally { setTxLoading(false) }
  }

  const handleCreateAccount = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await addSavingsAccount(user.uid, householdId, {
        name: newName.trim(), note: newNote.trim(), balance: 0
      })
      setNewName(''); setNewNote('')
      setToast({ msg: 'Savings account created!', type: 'success' })
      await loadAccounts()
      setView('list')
    } finally { setCreating(false) }
  }

  const handleDeleteAccount = async () => {
    if (!window.confirm(`Delete "${selectedAcc.name}"? This cannot be undone.`)) return
    await deleteSavingsAccount(selectedAcc.id)
    setToast({ msg: 'Account deleted', type: 'success' })
    setView('list')
    await loadAccounts()
  }

  const accountBalance = accTxs.reduce((a, t) => t.subtype === 'withdraw' ? a - t.amount : a + t.amount, 0)

  const handleAddTx = async () => {
    const amt = parseFloat(txAmount.replace(/,/g, ''))
    if (!amt || amt <= 0) return setTxErr('Enter a valid amount')
    if (txSubtype === 'withdraw' && amt > accountBalance) {
      return setTxErr(`Cannot withdraw more than balance (${fmt(accountBalance)})`)
    }
    setTxErr(''); setTxSaving(true)
    try {
      await addSavingsTx(selectedAcc.id, user.uid, {
        subtype: txSubtype, amount: amt, note: txNote.trim(), date: txDate
      })
      setToast({ msg: txSubtype === 'deposit' ? '💰 Deposited!' : '↑ Withdrawn!', type: 'success' })
      setTxAmount(''); setTxNote(''); setShowTxForm(false)
      // Reload txs
      const txs = await getSavingsTxs(selectedAcc.id)
      setAccTxs(txs.sort((a, b) => (b.date||'').localeCompare(a.date||'')))
      // Update account balance in list
      await loadAccounts()
    } catch { setTxErr('Save failed.') }
    finally { setTxSaving(false) }
  }

  const fmt  = n => fmtCurrency(n, currency)
  const fmtC = n => fmtCurrencyCompact(n, currency)
  const sec  = n => fmtSec(n, secEnabled, secRate, secCurrency)
  const sym  = getSym(currency)

  const totalSavings = accounts.reduce((a, acc) => a + (acc.balance || 0), 0)

  return (
    <>
      {toast && <Toast message={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet sheet-tall">
        <div className="sheet-handle" />

        {/* ── LIST VIEW ── */}
        {view === 'list' && (
          <>
            <div className="sheet-header">
              <button className="btn btn-ghost" onClick={onClose}>✕</button>
              <span className="sheet-title">💰 Savings</span>
              <button className="btn btn-ghost" onClick={() => setView('create')}>＋ New</button>
            </div>
            <div className="sheet-body">
              {/* Total across all accounts */}
              <div className="sv-total-card">
                <div className="sv-total-label">Total Savings</div>
                <div className="sv-total-amount">{fmt(totalSavings)}</div>
                {sec(totalSavings) && <div className="sv-total-sec">{sec(totalSavings)}</div>}
              </div>

              {loading ? (
                <div className="load-row"><span className="spinner" /></div>
              ) : accounts.length === 0 ? (
                <div className="empty-state">
                  <span className="icon">💰</span>
                  <p>No savings accounts yet.<br />Tap + New to create one.</p>
                </div>
              ) : (
                <div className="sv-account-list">
                  {accounts.map(acc => (
                    <button key={acc.id} className="sv-account-card" onClick={() => openDetail(acc)}>
                      <div className="sv-acc-left">
                        <div className="sv-acc-icon">💰</div>
                        <div>
                          <div className="sv-acc-name">{acc.name}</div>
                          {acc.note && <div className="sv-acc-note">{acc.note}</div>}
                          <div className="sv-acc-count">{acc.txCount} transactions</div>
                        </div>
                      </div>
                      <div className="sv-acc-right">
                        <div className="sv-acc-balance">{fmt(acc.balance)}</div>
                        {sec(acc.balance) && <div className="sv-acc-sec">{sec(acc.balance)}</div>}
                        <span className="sv-acc-arrow">›</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── CREATE VIEW ── */}
        {view === 'create' && (
          <>
            <div className="sheet-header">
              <button className="btn btn-ghost" onClick={() => setView('list')}>← Back</button>
              <span className="sheet-title">New Savings Account</span>
              <span style={{ width: 40 }} />
            </div>
            <div className="sheet-body">
              <div className="field">
                <label>Account Name</label>
                <input type="text" placeholder="e.g. Emergency Fund, School Fees"
                  value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
              </div>
              <div className="field">
                <label>Note (optional)</label>
                <input type="text" placeholder="What is this savings for?"
                  value={newNote} onChange={e => setNewNote(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-full save-btn"
                onClick={handleCreateAccount} disabled={creating || !newName.trim()}>
                {creating ? <span className="spinner" /> : 'Create Account'}
              </button>
            </div>
          </>
        )}

        {/* ── DETAIL VIEW ── */}
        {view === 'detail' && selectedAcc && (
          <>
            <div className="sheet-header">
              <button className="btn btn-ghost" onClick={() => { setView('list'); setShowTxForm(false) }}>← Back</button>
              <span className="sheet-title">{selectedAcc.name}</span>
              <button className="btn btn-ghost danger-ghost" onClick={handleDeleteAccount}>🗑</button>
            </div>
            <div className="sheet-body">
              {/* Account balance card */}
              <div className="sv-detail-card">
                <div className="sv-detail-label">Balance</div>
                <div className="sv-detail-amount">{fmt(accountBalance)}</div>
                {sec(accountBalance) && <div className="sv-detail-sec">{sec(accountBalance)}</div>}
                <div className="sv-detail-stats">
                  <div>
                    <div className="sv-detail-stat-label">Total Deposited</div>
                    <div className="sv-detail-stat-val deposit">
                      {fmtC(accTxs.filter(t => t.subtype !== 'withdraw').reduce((a,t) => a+t.amount, 0))}
                    </div>
                  </div>
                  <div className="sv-detail-divider" />
                  <div>
                    <div className="sv-detail-stat-label">Total Withdrawn</div>
                    <div className="sv-detail-stat-val withdraw">
                      {fmtC(accTxs.filter(t => t.subtype === 'withdraw').reduce((a,t) => a+t.amount, 0))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="sv-action-row">
                <button className="sv-action-btn deposit"
                  onClick={() => { setTxSubtype('deposit'); setShowTxForm(true) }}>
                  ↓ Deposit
                </button>
                <button className="sv-action-btn withdraw"
                  onClick={() => { setTxSubtype('withdraw'); setShowTxForm(true) }}>
                  ↑ Withdraw
                </button>
              </div>

              {/* Transaction form */}
              {showTxForm && (
                <div className="sv-tx-form">
                  <div className="sv-tx-form-title">
                    {txSubtype === 'deposit' ? '↓ Deposit to' : '↑ Withdraw from'} {selectedAcc.name}
                  </div>
                  <div className="amount-field">
                    <span className="currency-sym">{sym}</span>
                    <input type="text" inputMode="decimal" placeholder="0.00"
                      value={txAmount ? parseFloat(txAmount.replace(/,/g,'')).toLocaleString('en-US',{maximumFractionDigits:2}) : ''}
                      onChange={e => {
                        const raw = e.target.value.replace(/,/g,'').replace(/[^0-9.]/g,'')
                        setTxAmount(raw)
                      }}
                      className="amount-input" autoFocus />
                  </div>
                  <div className="field" style={{ marginTop: 12 }}>
                    <label>Date</label>
                    <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Note (optional)</label>
                    <input type="text" placeholder="What is this for?"
                      value={txNote} onChange={e => setTxNote(e.target.value)} />
                  </div>
                  {txErr && <p className="form-err">{txErr}</p>}
                  <div className="sv-tx-form-btns">
                    <button className="btn btn-secondary" onClick={() => { setShowTxForm(false); setTxErr('') }}>Cancel</button>
                    <button className={`btn ${txSubtype === 'deposit' ? 'btn-deposit' : 'btn-withdraw'}`}
                      onClick={handleAddTx} disabled={txSaving}>
                      {txSaving ? <span className="spinner" /> : txSubtype === 'deposit' ? 'Deposit' : 'Withdraw'}
                    </button>
                  </div>
                </div>
              )}

              {/* Transaction history */}
              <div className="sv-history-title">History ({accTxs.length})</div>
              {txLoading ? (
                <div className="load-row"><span className="spinner" /></div>
              ) : accTxs.length === 0 ? (
                <div className="empty-state">
                  <span className="icon">💰</span>
                  <p>No transactions yet.</p>
                </div>
              ) : (
                accTxs.map(tx => (
                  <div key={tx.id} className="sv-tx-row">
                    <div className={`sv-tx-badge ${tx.subtype}`}>
                      {tx.subtype === 'deposit' ? '↓' : '↑'}
                    </div>
                    <div className="sv-tx-info">
                      <div className="sv-tx-label">
                        {tx.subtype === 'deposit' ? 'Deposit' : 'Withdrawal'}
                        {tx.note ? ` · ${tx.note}` : ''}
                      </div>
                      <div className="sv-tx-date">{tx.date}</div>
                    </div>
                    <div className={`sv-tx-amount ${tx.subtype}`}>
                      {tx.subtype === 'deposit' ? '+' : '-'}{fmt(tx.amount)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
