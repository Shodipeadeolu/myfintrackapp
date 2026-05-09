import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { addTransaction, updateTransaction, deleteTransaction } from '../firebase/service'
import { toFirestoreDate, fmtCurrency } from '../utils/helpers'
import CategoryPicker from './CategoryPicker'
import Toast from './Toast'
import './AddTransaction.css'

const CURRENCY_SYMBOLS = {
  NGN:'₦', USD:'$', EUR:'€', GBP:'£', GHS:'₵', KES:'KSh', ZAR:'R',
  EGP:'E£', AED:'AED', SAR:'SAR', CAD:'CA$', AUD:'A$', JPY:'¥', CNY:'¥',
  INR:'₹', BRL:'R$', MXN:'MX$', SGD:'S$', CHF:'CHF', HKD:'HK$', PHP:'₱',
  IDR:'Rp', MYR:'RM', THB:'฿', TRY:'₺', RUB:'₽', PLN:'zł', ILS:'₪',
  KRW:'₩', VND:'₫',
}
const getSym = (c) => CURRENCY_SYMBOLS[c] || c

// All 4 transaction types
const TX_TYPES = [
  { key: 'expense', label: '↑ Expense',  color: 'active-expense'  },
  { key: 'income',  label: '↓ Income',   color: 'active-income'   },
  { key: 'savings', label: '💰 Savings', color: 'active-savings'  },
  { key: 'loans',   label: '🏦 Loans',   color: 'active-loans'    },
]

export default function AddTransaction({ tx, onClose, onSaved }) {
  const { user, householdId, categories, canWrite, currency } = useApp()
  const editing = !!tx

  const [type, setType]               = useState(tx?.type || 'expense')
  const [amount, setAmount]           = useState(tx?.amount ? String(tx.amount) : '')
  const [category, setCategory]       = useState(tx?.category || '')
  const [subcategory, setSubcategory] = useState(tx?.subcategory || '')
  const [date, setDate]               = useState(tx?.date || toFirestoreDate(new Date()))
  const [note, setNote]               = useState(tx?.note || '')
  const [saving, setSaving]           = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [showCatPicker, setShowCatPicker] = useState(false)
  const [showSubPicker, setShowSubPicker] = useState(false)
  const [err, setErr]                 = useState('')
  const [toast, setToast]             = useState(null)

  // Filter categories by type — savings/loans use their own type, 
  // but fall back to showing all if no categories exist for that type
  const filteredCats = categories.filter(c =>
    c.type === type ||
    // savings and loans may share categories with expense/income
    (['savings','loans'].includes(type) && (c.type === 'expense' || c.type === 'income' || c.type === type))
  )
  const selectedCat = categories.find(c => c.name === category)
  const subcats     = selectedCat?.subcategories || []

  // Only clear category when user actively switches type
  const prevType = useRef(type)
  useEffect(() => {
    if (prevType.current !== type) {
      setCategory('')
      setSubcategory('')
    }
    prevType.current = type
  }, [type])

  const handleCatSelect = (cat) => {
    setCategory(cat.name); setSubcategory(''); setShowCatPicker(false)
  }

  const handleSave = async () => {
    if (!amount || isNaN(parseFloat(amount))) return setErr('Enter a valid amount')
    if (!category) return setErr('Pick a category')
    if (!date) return setErr('Pick a date')
    setErr(''); setSaving(true)
    try {
      const data = { type, amount: parseFloat(amount), category, subcategory, date, note: note.trim() }
      if (editing) {
        await updateTransaction(tx.id, data)
        setToast({ msg: 'Transaction updated', type: 'success' })
      } else {
        await addTransaction(user.uid, householdId, data)
        setToast({ msg: 'Transaction saved!', type: 'success' })
      }
      setTimeout(() => onSaved(), 800)
    } catch {
      setErr('Save failed. Try again.')
      setSaving(false)
    }
  }

  const handleDuplicate = async () => {
    if (!amount || isNaN(parseFloat(amount))) return setErr('Enter a valid amount')
    if (!category) return setErr('Pick a category')
    setErr(''); setDuplicating(true)
    try {
      await addTransaction(user.uid, householdId, {
        type, amount: parseFloat(amount), category, subcategory,
        date: toFirestoreDate(new Date()), note: note.trim()
      })
      setToast({ msg: "Duplicated with today's date!", type: 'success' })
      setTimeout(() => onSaved(), 800)
    } catch {
      setErr('Duplicate failed.')
      setDuplicating(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this transaction?')) return
    setDeleting(true)
    try {
      await deleteTransaction(tx.id)
      onSaved()
    } catch {
      setErr('Delete failed.')
      setDeleting(false)
    }
  }

  return (
    <>
      {toast && <Toast message={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">{editing ? 'Edit Transaction' : 'New Transaction'}</span>
          {editing && canWrite
            ? <button className="btn btn-ghost danger-ghost" onClick={handleDelete} disabled={deleting}>
                {deleting ? '...' : '🗑'}
              </button>
            : <span style={{ width: 40 }} />
          }
        </div>

        <div className="sheet-body">
          {/* 4-type toggle */}
          <div className="type-toggle">
            {TX_TYPES.map(({ key, label, color }) => (
              <button
                key={key}
                className={`type-btn ${type === key ? color : ''}`}
                onClick={() => setType(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="amount-field">
            <span className="currency-sym">{getSym(currency || 'USD')}</span>
            <input
              type="text" inputMode="decimal" placeholder="0.00"
              value={amount ? parseFloat(amount.replace(/,/g,'')).toLocaleString('en-US', {maximumFractionDigits:2}) : ''}
              onChange={e => {
                // Strip commas, keep only digits and one decimal point
                const raw = e.target.value.replace(/,/g, '').replace(/[^0-9.]/g, '')
                const parts = raw.split('.')
                const clean = parts.length > 1 ? parts[0] + '.' + parts[1] : parts[0]
                setAmount(clean)
              }}
              className="amount-input" autoFocus={!editing}
            />
          </div>

          <div className="field">
            <label>Category</label>
            <button className="picker-btn" onClick={() => setShowCatPicker(true)}>
              <span>{selectedCat ? `${selectedCat.icon} ${selectedCat.name}` : 'Select category'}</span>
              <span className="picker-arrow">›</span>
            </button>
          </div>

          {subcats.length > 0 && (
            <div className="field">
              <label>Subcategory</label>
              <button className="picker-btn" onClick={() => setShowSubPicker(true)}>
                <span>{subcategory || 'Select subcategory'}</span>
                <span className="picker-arrow">›</span>
              </button>
            </div>
          )}

          <div className="field">
            <label>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <div className="field">
            <label>Note (optional)</label>
            <input
              type="text" placeholder="What was this for?"
              value={note} onChange={e => setNote(e.target.value)}
            />
          </div>

          {err && <p className="form-err">{err}</p>}

          {canWrite && (
            <>
              <button
                className="btn btn-primary btn-full save-btn"
                onClick={handleSave} disabled={saving || duplicating}
              >
                {saving ? <span className="spinner" /> : editing ? 'Save Changes' : 'Add Transaction'}
              </button>
              {editing && (
                <button
                  className="btn btn-secondary btn-full duplicate-btn"
                  onClick={handleDuplicate} disabled={saving || duplicating}
                >
                  {duplicating ? <span className="spinner" /> : <><span>⧉</span> Duplicate with Today's Date</>}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {showCatPicker && (
        <CategoryPicker
          categories={filteredCats} selected={category}
          onSelect={handleCatSelect}
          onClose={() => setShowCatPicker(false)}
          title="Pick Category"
        />
      )}
      {showSubPicker && (
        <CategoryPicker
          categories={subcats.map(s => ({ name: s, icon: '·' }))}
          selected={subcategory}
          onSelect={c => { setSubcategory(c.name); setShowSubPicker(false) }}
          onClose={() => setShowSubPicker(false)}
          title="Pick Subcategory"
        />
      )}
    </>
  )
}
