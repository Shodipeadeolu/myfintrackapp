import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { addCategory, updateCategory, deleteCategory } from '../firebase/service'
import './CategoryManager.css'

const ICONS = ['🍔','🚗','🏠','💊','🎬','🛍️','📦','💼','📊','💰','✈️','🎓','🐾','🏋️','☕','🎮','🎵','💻','📱','🌿','🎁','🔧','💇','🚿','🏦','📰','🎨','⚡','🌊','🏔️']

export default function CategoryManager({ onClose }) {
  const { user, householdId, categories, refreshCategories, canWrite } = useApp()
  const [view, setView]         = useState('list')
  const [editing, setEditing]   = useState(null)
  const [name, setName]         = useState('')
  const [icon, setIcon]         = useState('📦')
  const [type, setType]         = useState('expense')
  const [subcats, setSubcats]   = useState([])
  const [subInput, setSubInput] = useState('')
  const [editingSubIdx, setEditingSubIdx] = useState(null) // index of subcat being edited
  const [editingSubVal, setEditingSubVal] = useState('')
  const [saving, setSaving]     = useState(false)
  const [filter, setFilter]     = useState('all')

  const openAdd = () => {
    setEditing(null); setName(''); setIcon('📦'); setType('expense'); setSubcats([])
    setEditingSubIdx(null); setView('add')
  }

  const openEdit = (cat) => {
    setEditing(cat); setName(cat.name); setIcon(cat.icon); setType(cat.type)
    setSubcats(cat.subcategories || []); setEditingSubIdx(null); setView('edit')
  }

  const addSub = () => {
    const v = subInput.trim()
    if (v && !subcats.includes(v)) { setSubcats([...subcats, v]); setSubInput('') }
  }

  const removeSub = (i) => setSubcats(subcats.filter((_, idx) => idx !== i))

  const startEditSub = (i) => {
    setEditingSubIdx(i)
    setEditingSubVal(subcats[i])
  }

  const saveSubEdit = () => {
    const val = editingSubVal.trim()
    if (!val) return
    const updated = [...subcats]
    updated[editingSubIdx] = val
    setSubcats(updated)
    setEditingSubIdx(null)
    setEditingSubVal('')
  }

  const cancelSubEdit = () => { setEditingSubIdx(null); setEditingSubVal('') }

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const data = { name: name.trim(), icon, type, subcategories: subcats }
      editing ? await updateCategory(editing.id, data) : await addCategory(user.uid, householdId, data)
      await refreshCategories()
      setView('list')
    } finally { setSaving(false) }
  }

  const del = async (cat) => {
    if (!window.confirm(`Delete "${cat.name}"?`)) return
    await deleteCategory(cat.id)
    await refreshCategories()
  }

  const filtered = categories.filter(c => filter === 'all' || c.type === filter)

  if (view !== 'list') {
    return (
      <>
        <div className="sheet-overlay" onClick={() => setView('list')} />
        <div className="sheet">
          <div className="sheet-handle" />
          <div className="sheet-header">
            <button className="btn btn-ghost" onClick={() => setView('list')}>← Back</button>
            <span className="sheet-title">{view === 'edit' ? 'Edit Type' : 'New Type'}</span>
            <span style={{ width: 56 }} />
          </div>
          <div className="sheet-body">
            <div className="field">
              <label>Type</label>
              <div className="seg-control">
                <button className={`seg-btn ${type === 'expense' ? 'active' : ''}`} onClick={() => setType('expense')}>Expense</button>
                <button className={`seg-btn ${type === 'income'  ? 'active' : ''}`} onClick={() => setType('income')}>Income</button>
              </div>
            </div>
            <div className="field">
              <label>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Groceries" autoFocus />
            </div>
            <div className="field">
              <label>Icon</label>
              <div className="icon-grid">
                {ICONS.map(ic => (
                  <button key={ic} className={`icon-btn ${icon === ic ? 'selected' : ''}`} onClick={() => setIcon(ic)}>
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            {/* Subcategories with inline edit */}
            <div className="field">
              <label>Subcategories</label>
              <div className="sub-input-row">
                <input
                  value={subInput}
                  onChange={e => setSubInput(e.target.value)}
                  placeholder="Add subcategory"
                  onKeyDown={e => e.key === 'Enter' && addSub()}
                />
                <button className="btn btn-secondary" onClick={addSub}>Add</button>
              </div>
              <div className="subcats-list">
                {subcats.map((s, i) => (
                  <div key={i} className="subcat-chip-wrap">
                    {editingSubIdx === i ? (
                      <div className="subcat-edit-row">
                        <input
                          className="subcat-edit-input"
                          value={editingSubVal}
                          onChange={e => setEditingSubVal(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveSubEdit(); if (e.key === 'Escape') cancelSubEdit() }}
                          autoFocus
                        />
                        <button className="subcat-save-btn" onClick={saveSubEdit}>✓</button>
                        <button className="subcat-cancel-btn" onClick={cancelSubEdit}>✕</button>
                      </div>
                    ) : (
                      <div className="subcat-chip">
                        <span onClick={() => startEditSub(i)} className="subcat-chip-label">{s}</span>
                        <button className="subcat-edit-ico" onClick={() => startEditSub(i)} title="Edit">✎</button>
                        <button onClick={() => removeSub(i)}>✕</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {subcats.length > 0 && (
                <p className="subcat-hint">Tap a subcategory name or ✎ to edit it</p>
              )}
            </div>

            {canWrite && (
              <button className="btn btn-primary btn-full" onClick={save} disabled={saving}>
                {saving ? <span className="spinner" /> : 'Save'}
              </button>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">Transaction Types</span>
          {canWrite && <button className="btn btn-ghost add-ghost" onClick={openAdd}>＋ New</button>}
        </div>
        <div className="sheet-body">
          <div className="seg-control" style={{ marginBottom: 16 }}>
            {['all','expense','income'].map(f => (
              <button key={f} className={`seg-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <div className="empty-state"><span className="icon">📂</span><p>No categories yet.</p></div>
          ) : (
            filtered.map(cat => (
              <div key={cat.id} className="cat-manage-row">
                <div className="cat-manage-info" onClick={() => openEdit(cat)}>
                  <span className="cat-manage-icon">{cat.icon}</span>
                  <div>
                    <div className="cat-manage-name">{cat.name}</div>
                    <div className="cat-manage-meta">
                      <span className={`badge badge-${cat.type}`}>{cat.type}</span>
                      {cat.subcategories?.length > 0 && (
                        <span className="sub-count"> · {cat.subcategories.length} subs</span>
                      )}
                    </div>
                  </div>
                </div>
                {canWrite && (
                  <button className="btn btn-ghost" onClick={() => del(cat)}>🗑</button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
