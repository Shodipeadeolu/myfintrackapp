import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getTrashItems, restoreFromTrash, purgeTrashItems } from '../firebase/service'
import { fmtCurrency } from '../utils/helpers'
import './TrashSheet.css'

const TRASH_TTL = 30

function daysUntilExpiry(deletedAtStr) {
  const deleted = new Date(deletedAtStr)
  const now     = new Date()
  const elapsed = Math.floor((now - deleted) / 86400000)
  return Math.max(0, TRASH_TTL - elapsed)
}

function fmtDeletedDate(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return iso.slice(0, 10) }
}

export default function TrashSheet({ onClose }) {
  const { user, householdId, categories, triggerReload, currency } = useApp()
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [busy, setBusy]         = useState(false)

  const fmt = n => fmtCurrency(n, currency)

  useEffect(() => { if (user) load() }, [user, householdId])

  const load = async () => {
    setLoading(true)
    try { setItems(await getTrashItems(user.uid, householdId)) }
    finally { setLoading(false) }
  }

  const toggle = (id) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const toggleAll = () =>
    setSelected(selected.size === items.length ? new Set() : new Set(items.map(i => i.id)))

  const handleRestore = async () => {
    if (!selected.size || busy) return
    setBusy(true)
    try {
      const toRestore = items.filter(i => selected.has(i.id))
      await restoreFromTrash(user.uid, householdId, toRestore)
      triggerReload()
      setSelected(new Set())
      await load()
    } finally { setBusy(false) }
  }

  const handlePurge = async () => {
    if (!selected.size || busy) return
    setBusy(true)
    try {
      await purgeTrashItems([...selected])
      setSelected(new Set())
      await load()
    } finally { setBusy(false) }
  }

  const handleEmptyAll = async () => {
    if (!items.length || busy) return
    setBusy(true)
    try {
      await purgeTrashItems(items.map(i => i.id))
      setItems([])
      setSelected(new Set())
    } finally { setBusy(false) }
  }

  const TYPE_COLOR = { income: 'var(--green)', expense: 'var(--red)', savings: 'var(--amber)', loans: 'var(--blue)' }
  const TYPE_PREFIX = { income: '+', expense: '-', savings: '', loans: '' }

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet tr-sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">Trash</span>
          {items.length > 0 ? (
            <button className="tr-empty-all" onClick={handleEmptyAll} disabled={busy}>
              Empty
            </button>
          ) : <span style={{ width: 40 }} />}
        </div>

        <div className="sheet-body">
          {loading ? (
            <div className="load-row"><span className="spinner" /></div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <span className="icon">🗑️</span>
              <p>Your trash is empty.</p>
            </div>
          ) : (
            <>
              <div className="tr-info">
                Items are permanently deleted after {TRASH_TTL} days.
              </div>

              {/* Select all row */}
              <div className="tr-controls">
                <label className="tr-select-all">
                  <input type="checkbox"
                    checked={selected.size === items.length && items.length > 0}
                    onChange={toggleAll} />
                  <span>Select all ({items.length})</span>
                </label>
              </div>

              <div className="tr-list">
                {items.map(item => {
                  const cat    = categories.find(c => c.name === item.category)
                  const icon   = cat?.icon || '📦'
                  const expiry = daysUntilExpiry(item.deletedAt)
                  const color  = TYPE_COLOR[item.type] || 'var(--text-primary)'
                  const prefix = TYPE_PREFIX[item.type] ?? ''

                  return (
                    <div key={item.id}
                      className={`tr-row${selected.has(item.id) ? ' tr-selected' : ''}`}
                      onClick={() => toggle(item.id)}>
                      <div className={`tr-dot${selected.has(item.id) ? ' checked' : ''}`} />
                      <div className="tr-info-col">
                        <div className="tr-name">{item.note || item.category}</div>
                        <div className="tr-meta">
                          {icon} {item.category}
                          {item.subcategory ? ` · ${item.subcategory}` : ''}
                          {' · '}{item.date}
                        </div>
                        <div className="tr-deleted">
                          Deleted {fmtDeletedDate(item.deletedAt)}
                          {' · '}
                          <span className={expiry <= 3 ? 'tr-expiry-urgent' : 'tr-expiry'}>
                            {expiry === 0 ? 'Expires today' : `${expiry}d left`}
                          </span>
                        </div>
                      </div>
                      <div className="tr-amount" style={{ color }}>
                        {prefix}{fmt(item.amount)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {selected.size > 0 && (
          <div className="tr-action-bar">
            <button className="tr-restore-btn" onClick={handleRestore} disabled={busy}>
              {busy ? '…' : `Restore (${selected.size})`}
            </button>
            <button className="tr-purge-btn" onClick={handlePurge} disabled={busy}>
              {busy ? '…' : 'Delete permanently'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
