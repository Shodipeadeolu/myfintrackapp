import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getPendingImports, updatePendingImport, dismissPendingImport } from '../firebase/emailImport'
import { addTransaction } from '../firebase/service'
import { fmtCurrency } from '../utils/helpers'
import './PendingImports.css'

export default function PendingImports({ onClose, onAccepted }) {
  const { user, householdId, categories, currency, triggerReload } = useApp()
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [expanded, setExpanded]   = useState(null)
  const [saving, setSaving]       = useState(null)
  const [bulkSaving, setBulkSaving] = useState(false)

  useEffect(() => { if (user) load() }, [user])

  const load = async () => {
    setLoading(true)
    try {
      const raw = await getPendingImports(user.uid, householdId)
      setItems(raw.map(item => ({
        ...item,
        editAmount:   String(item.amount || ''),
        editType:     item.type || 'expense',
        editCategory: item.category || '',
        editNote:     item.description || '',
        editDate:     item.date || new Date().toISOString().split('T')[0],
      })))
    } finally { setLoading(false) }
  }

  const updateField = (id, field, value) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it))
  }

  const handleAccept = async (item) => {
    const amt = parseFloat(item.editAmount.replace(/,/g, ''))
    if (!amt || amt <= 0) return
    setSaving(item.id)
    try {
      await addTransaction(user.uid, householdId, {
        type:        item.editType,
        amount:      amt,
        category:    item.editCategory,
        subcategory: '',
        date:        item.editDate,
        note:        item.editNote.trim(),
      })
      await updatePendingImport(item.id, { status: 'accepted' })
      setItems(prev => prev.filter(it => it.id !== item.id))
      setExpanded(null)
      triggerReload()
      if (onAccepted) onAccepted()
    } finally { setSaving(null) }
  }

  const handleDismiss = async (id) => {
    setSaving(id)
    try {
      await dismissPendingImport(id)
      setItems(prev => prev.filter(it => it.id !== id))
      setExpanded(null)
    } finally { setSaving(null) }
  }

  const handleBulkAccept = async () => {
    setBulkSaving(true)
    try {
      for (const item of items) {
        const amt = parseFloat(item.editAmount.replace(/,/g, ''))
        if (!amt || amt <= 0 || !item.editCategory) continue
        await addTransaction(user.uid, householdId, {
          type: item.editType, amount: amt,
          category: item.editCategory, subcategory: '',
          date: item.editDate, note: item.editNote.trim(),
        })
        await updatePendingImport(item.id, { status: 'accepted' })
      }
      setItems([])
      triggerReload()
      if (onAccepted) onAccepted()
    } finally { setBulkSaving(false) }
  }

  const expenseCats = categories.filter(c => c.type === 'expense')
  const incomeCats  = categories.filter(c => c.type === 'income')

  const fmt = n => fmtCurrency(n, currency)

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">Pending Imports</span>
          <span style={{ width: 40 }} />
        </div>
        <div className="sheet-body">
          {loading ? (
            <div className="load-row"><span className="spinner" /></div>
          ) : items.length === 0 ? (
            <div className="pi-empty">
              <div className="pi-empty-icon">✅</div>
              <div className="pi-empty-text">No pending imports — you're all caught up!</div>
            </div>
          ) : (<>
            <div className="pi-bulk-bar">
              <div className="pi-bulk-count">{items.length} transaction{items.length !== 1 ? 's' : ''} to review</div>
              <button className="pi-bulk-accept" onClick={handleBulkAccept} disabled={bulkSaving}>
                {bulkSaving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : `Accept all`}
              </button>
            </div>
            <div className="pi-list">
              {items.map(item => {
                const isOpen = expanded === item.id
                const cats = item.editType === 'income' ? incomeCats : expenseCats
                return (
                  <div key={item.id} className={`pi-item ${isOpen ? 'expanded' : ''}`}>
                    <button className="pi-item-header" onClick={() => setExpanded(isOpen ? null : item.id)}>
                      <div className={`pi-type-dot ${item.editType}`} />
                      <div className="pi-item-info">
                        <div className="pi-item-desc">{item.editNote || item.subject || 'Bank transaction'}</div>
                        <div className="pi-item-meta">
                          {item.bankName} · {item.editDate}
                          {item.editCategory ? ` · ${item.editCategory}` : ''}
                        </div>
                      </div>
                      <div className={`pi-item-amount ${item.editType}`}>
                        {item.editType === 'expense' ? '−' : '+'}{fmt(parseFloat(item.editAmount) || 0)}
                      </div>
                      <span className="pi-item-chevron">▾</span>
                    </button>

                    {isOpen && (
                      <div className="pi-edit-area">
                        <div className="pi-field">
                          <div className="pi-field-label">Type</div>
                          <div className="pi-type-row">
                            {['expense', 'income'].map(t => (
                              <button key={t} className={`pi-type-btn ${item.editType === t ? `active ${t}` : ''}`}
                                onClick={() => updateField(item.id, 'editType', t)}>
                                {t === 'expense' ? '↘ Expense' : '↗ Income'}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="pi-field">
                          <div className="pi-field-label">Amount</div>
                          <input className="pi-input" type="text" inputMode="decimal"
                            value={item.editAmount}
                            onChange={e => updateField(item.id, 'editAmount', e.target.value.replace(/[^0-9.]/g, ''))} />
                        </div>

                        <div className="pi-field">
                          <div className="pi-field-label">Category</div>
                          <div className="pi-cat-list">
                            {cats.map(c => (
                              <button key={c.name} className={`pi-cat-chip ${item.editCategory === c.name ? 'active' : ''}`}
                                onClick={() => updateField(item.id, 'editCategory', c.name)}>
                                {c.icon} {c.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="pi-field">
                          <div className="pi-field-label">Note</div>
                          <input className="pi-input" type="text" placeholder="Optional note"
                            value={item.editNote}
                            onChange={e => updateField(item.id, 'editNote', e.target.value)} />
                        </div>

                        <div className="pi-field">
                          <div className="pi-field-label">Date</div>
                          <input className="pi-input" type="date"
                            value={item.editDate}
                            onChange={e => updateField(item.id, 'editDate', e.target.value)} />
                        </div>

                        <div className="pi-item-actions">
                          <button className="pi-accept-btn" onClick={() => handleAccept(item)}
                            disabled={saving === item.id || !item.editCategory}>
                            {saving === item.id
                              ? <span className="spinner" style={{ width: 14, height: 14 }} />
                              : '✓ Accept'}
                          </button>
                          <button className="pi-dismiss-btn" onClick={() => handleDismiss(item.id)}
                            disabled={saving === item.id}>
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>)}
        </div>
      </div>
    </>
  )
}
