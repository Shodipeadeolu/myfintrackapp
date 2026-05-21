import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import {
  getLoanAccounts, addLoanAccount, deleteLoanAccount,
  getLoanTxs, addLoanTx
} from '../firebase/savingsLoans'
import { fmtCurrency, fmtCurrencyCompact, toFirestoreDate } from '../utils/helpers'
import { fmtSec } from '../utils/secCurrency'
import Toast from './Toast'
import './LoansSheet.css'

const CURRENCY_SYMBOLS = {
  NGN:'₦',USD:'$',EUR:'€',GBP:'£',GHS:'₵',KES:'KSh',ZAR:'R',
  AED:'AED',CAD:'CA$',AUD:'A$',JPY:'¥',INR:'₹',SGD:'S$',
}
const getSym = c => CURRENCY_SYMBOLS[c] || c

export default function LoansSheet({ onClose }) {
  const { user, householdId, currency, secEnabled, secCurrency, secRate } = useApp()
  const [accounts, setAccounts]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [view, setView]               = useState('list')
  const [selectedAcc, setSelectedAcc] = useState(null)
  const [accTxs, setAccTxs]           = useState([])
  const [txLoading, setTxLoading]     = useState(false)
  const [toast, setToast]             = useState(null)

  // Create form
  const [newName, setNewName]         = useState('')
  const [newLender, setNewLender]     = useState('')
  const [newNote, setNewNote]         = useState('')
  const [creating, setCreating]       = useState(false)

  // Transaction form
  const [txSubtype, setTxSubtype]     = useState('borrow')
  const [txAmount, setTxAmount]       = useState('')
  const [txNote, setTxNote]           = useState('')
  const [txDate, setTxDate]           = useState(toFirestoreDate(new Date()))
  const [txSaving, setTxSaving]       = useState(false)
  const [txErr, setTxErr]             = useState('')
  const [showTxForm, setShowTxForm]   = useState(false)

  useEffect(() => { loadAccounts() }, [])

  const loadAccounts = async () => {
    setLoading(true)
    try {
      const accs = await getLoanAccounts(user.uid, householdId)
      const withBalances = await Promise.all(accs.map(async acc => {
        const txs = await getLoanTxs(acc.id)
        const balance = txs.reduce((a, t) => t.subtype === 'repay' ? a - t.amount : a + t.amount, 0)
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
      const txs = await getLoanTxs(acc.id)
      setAccTxs(txs.sort((a, b) => (b.date||'').localeCompare(a.date||'')))
    } finally { setTxLoading(false) }
  }

  const handleCreateAccount = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await addLoanAccount(user.uid, householdId, {
        name: newName.trim(), lender: newLender.trim(), note: newNote.trim()
      })
      setNewName(''); setNewLender(''); setNewNote('')
      setToast({ msg: 'Loan account created!', type: 'success' })
      await loadAccounts()
      setView('list')
    } finally { setCreating(false) }
  }

  const handleDeleteAccount = async () => {
    if (!window.confirm(`Delete "${selectedAcc.name}"?`)) return
    await deleteLoanAccount(selectedAcc.id)
    setToast({ msg: 'Loan account deleted', type: 'success' })
    setView('list')
    await loadAccounts()
  }

  const outstandingBalance = accTxs.reduce((a, t) => t.subtype === 'repay' ? a - t.amount : a + t.amount, 0)
  const totalBorrowed      = accTxs.filter(t => t.subtype !== 'repay').reduce((a,t) => a+t.amount, 0)
  const totalRepaid        = accTxs.filter(t => t.subtype === 'repay').reduce((a,t)  => a+t.amount, 0)

  const handleAddTx = async () => {
    const amt = parseFloat(txAmount.replace(/,/g,''))
    if (!amt || amt <= 0) return setTxErr('Enter a valid amount')
    if (txSubtype === 'repay' && amt > outstandingBalance) {
      return setTxErr(`Cannot repay more than outstanding balance (${fmt(outstandingBalance)})`)
    }
    setTxErr(''); setTxSaving(true)
    try {
      await addLoanTx(selectedAcc.id, user.uid, {
        subtype: txSubtype, amount: amt, note: txNote.trim(), date: txDate
      })
      setToast({ msg: txSubtype === 'borrow' ? '🏦 Loan recorded!' : '✓ Repayment recorded!', type: 'success' })
      setTxAmount(''); setTxNote(''); setShowTxForm(false)
      const txs = await getLoanTxs(selectedAcc.id)
      setAccTxs(txs.sort((a, b) => (b.date||'').localeCompare(a.date||'')))
      await loadAccounts()
    } catch { setTxErr('Save failed.') }
    finally { setTxSaving(false) }
  }

  const fmt  = n => fmtCurrency(n, currency)
  const fmtC = n => fmtCurrencyCompact(n, currency)
  const sec  = n => fmtSec(n, secEnabled, secRate, secCurrency)
  const sym  = getSym(currency)

  const totalOutstanding = accounts.reduce((a, acc) => a + (acc.balance || 0), 0)

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
              <span className="sheet-title">🏦 Loans</span>
              <button className="btn btn-ghost" onClick={() => setView('create')}>＋ New</button>
            </div>
            <div className="sheet-body">
              <div className="ln-total-card">
                <div className="ln-total-label">Total Outstanding</div>
                <div className="ln-total-amount">{fmt(totalOutstanding)}</div>
                {sec(totalOutstanding) && <div className="ln-total-sec">{sec(totalOutstanding)}</div>}
                {totalOutstanding === 0 && accounts.length > 0 && (
                  <div className="ln-clear-badge">✓ All loans cleared!</div>
                )}
              </div>

              {loading ? (
                <div className="load-row"><span className="spinner" /></div>
              ) : accounts.length === 0 ? (
                <div className="empty-state">
                  <span className="icon">🏦</span>
                  <p>No loan accounts yet.<br />Tap + New to add one.</p>
                </div>
              ) : (
                <div className="ln-account-list">
                  {accounts.map(acc => (
                    <button key={acc.id} className="ln-account-card" onClick={() => openDetail(acc)}>
                      <div className="ln-acc-left">
                        <div className="ln-acc-icon">🏦</div>
                        <div>
                          <div className="ln-acc-name">{acc.name}</div>
                          {acc.lender && <div className="ln-acc-lender">From: {acc.lender}</div>}
                          {acc.note   && <div className="ln-acc-note">{acc.note}</div>}
                          <div className="ln-acc-count">{acc.txCount} transactions</div>
                        </div>
                      </div>
                      <div className="ln-acc-right">
                        <div className={`ln-acc-balance ${acc.balance <= 0 ? 'cleared' : ''}`}>
                          {acc.balance <= 0 ? '✓ Cleared' : fmt(acc.balance)}
                        </div>
                        {acc.balance > 0 && sec(acc.balance) && <div className="ln-acc-sec">{sec(acc.balance)}</div>}
                        <div className="ln-acc-label">{acc.balance > 0 ? 'outstanding' : ''}</div>
                        <span className="ln-acc-arrow">›</span>
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
              <span className="sheet-title">New Loan</span>
              <span style={{ width: 40 }} />
            </div>
            <div className="sheet-body">
              <div className="field">
                <label>Loan Name</label>
                <input type="text" placeholder="e.g. GTBank Loan, Car Loan"
                  value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
              </div>
              <div className="field">
                <label>Lender / Source (optional)</label>
                <input type="text" placeholder="e.g. John, GTBank, FMFB"
                  value={newLender} onChange={e => setNewLender(e.target.value)} />
              </div>
              <div className="field">
                <label>Note (optional)</label>
                <input type="text" placeholder="What is this loan for?"
                  value={newNote} onChange={e => setNewNote(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-full save-btn"
                onClick={handleCreateAccount} disabled={creating || !newName.trim()}>
                {creating ? <span className="spinner" /> : 'Create Loan Account'}
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
              <div className="ln-detail-card">
                <div className="ln-detail-label">Outstanding Balance</div>
                <div className="ln-detail-amount">{fmt(outstandingBalance)}</div>
                {sec(outstandingBalance) && <div className="ln-detail-sec">{sec(outstandingBalance)}</div>}
                {outstandingBalance <= 0 && totalBorrowed > 0 && (
                  <div className="ln-detail-cleared">✓ Fully repaid!</div>
                )}
                <div className="ln-detail-stats">
                  <div>
                    <div className="ln-detail-stat-label">Borrowed</div>
                    <div className="ln-detail-stat-val borrow">{fmtC(totalBorrowed)}</div>
                  </div>
                  <div className="ln-detail-divider" />
                  <div>
                    <div className="ln-detail-stat-label">Repaid</div>
                    <div className="ln-detail-stat-val repay">{fmtC(totalRepaid)}</div>
                  </div>
                </div>
              </div>

              <div className="ln-action-row">
                <button className="ln-action-btn borrow"
                  onClick={() => { setTxSubtype('borrow'); setShowTxForm(true) }}>
                  ↓ Borrow
                </button>
                <button className="ln-action-btn repay"
                  onClick={() => { setTxSubtype('repay'); setShowTxForm(true) }}>
                  ↑ Repay
                </button>
              </div>

              {showTxForm && (
                <div className="ln-tx-form">
                  <div className="ln-tx-form-title">
                    {txSubtype === 'borrow' ? '↓ Record borrowing for' : '↑ Record repayment for'} {selectedAcc.name}
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
                    <input type="text" placeholder="e.g. Monthly instalment"
                      value={txNote} onChange={e => setTxNote(e.target.value)} />
                  </div>
                  {txErr && <p className="form-err">{txErr}</p>}
                  <div className="ln-tx-form-btns">
                    <button className="btn btn-secondary" onClick={() => { setShowTxForm(false); setTxErr('') }}>Cancel</button>
                    <button className={`btn ${txSubtype === 'borrow' ? 'btn-borrow' : 'btn-repay'}`}
                      onClick={handleAddTx} disabled={txSaving}>
                      {txSaving ? <span className="spinner" /> : txSubtype === 'borrow' ? 'Record Loan' : 'Record Repayment'}
                    </button>
                  </div>
                </div>
              )}

              <div className="ln-history-title">History ({accTxs.length})</div>
              {txLoading ? (
                <div className="load-row"><span className="spinner" /></div>
              ) : accTxs.length === 0 ? (
                <div className="empty-state"><span className="icon">🏦</span><p>No transactions yet.</p></div>
              ) : (
                accTxs.map(tx => (
                  <div key={tx.id} className="ln-tx-row">
                    <div className={`ln-tx-badge ${tx.subtype}`}>
                      {tx.subtype === 'borrow' ? '↓' : '↑'}
                    </div>
                    <div className="ln-tx-info">
                      <div className="ln-tx-label">
                        {tx.subtype === 'borrow' ? 'Borrowed' : 'Repayment'}
                        {tx.note ? ` · ${tx.note}` : ''}
                      </div>
                      <div className="ln-tx-date">{tx.date}</div>
                    </div>
                    <div className={`ln-tx-amount ${tx.subtype}`}>
                      {tx.subtype === 'borrow' ? '+' : '-'}{fmt(tx.amount)}
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
