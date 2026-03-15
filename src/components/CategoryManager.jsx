import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { addCategory, updateCategory, deleteCategory } from '../firebase/service'
import './CategoryManager.css'

const ICONS = ['🍔','🚗','🏠','💊','🎬','🛍️','📦','💼','📊','💰','✈️','🎓','🐾','🏋️','☕','🎮','🎵','💻','📱','🌿','🎁','🔧','💇','🚿','🏦','📰','🎨','⚡','🌊','🏔️']

export default function CategoryManager({ onClose }) {
  const { user, householdId, categories, refreshCategories, canWrite } = useApp()
  const [view, setView] = useState('list') // 'list' | 'add' | 'edit'
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('📦')
  const [type, setType] = useState('expense')
  const [subcats, setSubcats] = useState([])
  const [subInput, setSubInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('all')

  const openAdd = () => {
    setEditing(null); setName(''); setIcon('📦'); setType('expense'); setSubcats([])
    setView('add')
  }

  const openEdit = (cat) => {
    setEditing(cat); setName(cat.name); setIcon(cat.icon); setType(cat.type)
    setSubcats(cat.subcategories || [])
    setView('edit')
  }

  const addSub = () => {
    const v = subInput.trim()
    if (v && !subcats.includes(v)) { setSubcats([...subcats, v]); setSubInput('') }
  }

  const removeSub = (s) => setSubcats(subcats.filter(x => x !== s))

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const data = { name: name.trim(), icon, type, subcategories: subcats }
      if (editing) {
        await updateCategory(editing.id, data)
      } else {
        await addCategory(user.uid, householdId, data)
      }
      await refreshCategories()
      setView('list')
    } finally {
      setSaving(false)
    }
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
                <button className={`seg-btn ${type === 'income' ? 'active' : ''}`} onClick={() => setType('income')}>Income</button>
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
                {subcats.map(s => (
                  <div key={s} className="subcat-chip">
                    <span>{s}</span>
                    <button onClick={() => removeSub(s)}>✕</button>
                  </div>
                ))}
              </div>
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
            {['all', 'expense', 'income'].map(f => (
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
