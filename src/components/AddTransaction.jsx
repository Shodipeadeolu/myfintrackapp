import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { addTransaction, updateTransaction, deleteTransaction } from '../firebase/service'
import { toFirestoreDate } from '../utils/helpers'
import CategoryPicker from './CategoryPicker'
import './AddTransaction.css'

export default function AddTransaction({ tx, onClose, onSaved }) {
  const { user, householdId, categories, canWrite } = useApp()
  const editing = !!tx

  const [type, setType] = useState(tx?.type || 'expense')
  const [amount, setAmount] = useState(tx?.amount ? String(tx.amount) : '')
  const [category, setCategory] = useState(tx?.category || '')
  const [subcategory, setSubcategory] = useState(tx?.subcategory || '')
  const [date, setDate] = useState(tx?.date || toFirestoreDate(new Date()))
  const [note, setNote] = useState(tx?.note || '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showCatPicker, setShowCatPicker] = useState(false)
  const [showSubPicker, setShowSubPicker] = useState(false)
  const [err, setErr] = useState('')

  const filteredCats = categories.filter(c => c.type === type)
  const selectedCat = categories.find(c => c.name === category)
  const subcats = selectedCat?.subcategories || []

  useEffect(() => {
    setCategory('')
    setSubcategory('')
  }, [type])

  const handleCatSelect = (cat) => {
    setCategory(cat.name)
    setSubcategory('')
    setShowCatPicker(false)
  }

  const handleSave = async () => {
    if (!amount || isNaN(parseFloat(amount))) return setErr('Enter a valid amount')
    if (!category) return setErr('Pick a category')
    if (!date) return setErr('Pick a date')
    setErr('')
    setSaving(true)
    try {
      const data = {
        type, amount: parseFloat(amount),
        category, subcategory, date, note: note.trim()
      }
      if (editing) {
        await updateTransaction(tx.id, data)
      } else {
        await addTransaction(user.uid, householdId, data)
      }
      onSaved()
    } catch (e) {
      setErr('Save failed. Try again.')
    } finally {
      setSaving(false)
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
          <span className="sheet-title">{editing ? 'Edit Transaction' : 'New Transaction'}</span>
          {editing && canWrite
            ? <button className="btn btn-ghost danger-ghost" onClick={handleDelete} disabled={deleting}>
                {deleting ? '...' : '🗑'}
              </button>
            : <span style={{ width: 40 }} />
          }
        </div>

        <div className="sheet-body">
          {/* Type toggle */}
          <div className="type-toggle">
            {['expense', 'income'].map(t => (
              <button
                key={t}
                className={`type-btn ${type === t ? 'active-' + t : ''}`}
                onClick={() => setType(t)}
              >
                {t === 'expense' ? '↑ Expense' : '↓ Income'}
              </button>
            ))}
          </div>

          {/* Amount */}
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

          {/* Category */}
          <div className="field">
            <label>Category</label>
            <button
              className="picker-btn"
              onClick={() => setShowCatPicker(true)}
            >
              <span>{selectedCat ? `${selectedCat.icon} ${selectedCat.name}` : 'Select category'}</span>
              <span className="picker-arrow">›</span>
            </button>
          </div>

          {/* Subcategory */}
          {subcats.length > 0 && (
            <div className="field">
              <label>Subcategory</label>
              <button
                className="picker-btn"
                onClick={() => setShowSubPicker(true)}
              >
                <span>{subcategory || 'Select subcategory'}</span>
                <span className="picker-arrow">›</span>
              </button>
            </div>
          )}

          {/* Date */}
          <div className="field">
            <label>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          {/* Note */}
          <div className="field">
            <label>Note (optional)</label>
            <input
              type="text"
              placeholder="What was this for?"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>

          {err && <p className="form-err">{err}</p>}

          {canWrite && (
            <button
              className={`btn btn-primary btn-full save-btn`}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <span className="spinner" /> : (editing ? 'Save Changes' : 'Add Transaction')}
            </button>
          )}
        </div>
      </div>

      {/* Category picker */}
      {showCatPicker && (
        <CategoryPicker
          categories={filteredCats}
          selected={category}
          onSelect={handleCatSelect}
          onClose={() => setShowCatPicker(false)}
          title="Pick Category"
        />
      )}

      {/* Subcategory picker */}
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
