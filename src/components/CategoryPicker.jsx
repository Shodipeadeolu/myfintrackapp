import { useState, useEffect } from 'react'
import './CategoryPicker.css'

// localStorage key for tracking usage frequency
const USAGE_KEY = 'ft-cat-usage'

function getUsage() {
  try { return JSON.parse(localStorage.getItem(USAGE_KEY) || '{}') }
  catch { return {} }
}

export function recordCategoryUsed(categoryName) {
  const usage = getUsage()
  usage[categoryName] = Date.now()
  localStorage.setItem(USAGE_KEY, JSON.stringify(usage))
}

export default function CategoryPicker({ categories, selected, onSelect, onClose, title = 'Pick Category' }) {
  const [search, setSearch] = useState('')
  const [usage, setUsage]   = useState({})

  useEffect(() => { setUsage(getUsage()) }, [])

  const filtered = categories
    .filter(c => !search || c.name?.toLowerCase().includes(search.toLowerCase()))
    // Sort by most recently used, then alphabetically for unused
    .sort((a, b) => {
      const ua = usage[a.name] || 0
      const ub = usage[b.name] || 0
      if (ua !== ub) return ub - ua        // most recently used first
      return (a.name || '').localeCompare(b.name || '')  // alpha fallback
    })

  const handleSelect = (cat) => {
    recordCategoryUsed(cat.name)
    onSelect(cat)
  }

  // Group: recently used vs never used
  const recentlyUsed = filtered.filter(c => usage[c.name])
  const neverUsed    = filtered.filter(c => !usage[c.name])
  const showGroups   = !search && recentlyUsed.length > 0 && neverUsed.length > 0

  const renderGrid = (cats) => (
    <div className="cat-picker-grid">
      {cats.map(cat => (
        <button
          key={cat.id || cat.name}
          className={`cat-picker-item ${selected === cat.name ? 'selected' : ''}`}
          onClick={() => handleSelect(cat)}
        >
          <span className="cat-picker-icon">{cat.icon || '📦'}</span>
          <span className="cat-picker-name">{cat.name}</span>
        </button>
      ))}
    </div>
  )

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">{title}</span>
          <span style={{ width: 40 }} />
        </div>
        <div className="cat-picker-search">
          <span className="cat-picker-search-icon">🔍</span>
          <input
            placeholder="Search categories..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          {search && <button className="cat-picker-clear" onClick={() => setSearch('')}>✕</button>}
        </div>
        <div className="sheet-body cat-picker-body">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <span className="icon">🔍</span>
              <p>No categories found.</p>
            </div>
          ) : showGroups ? (
            <>
              <div className="cat-picker-section-label">Recently Used</div>
              {renderGrid(recentlyUsed)}
              <div className="cat-picker-section-label" style={{ marginTop: 20 }}>All Categories</div>
              {renderGrid(neverUsed)}
            </>
          ) : (
            renderGrid(filtered)
          )}
        </div>
      </div>
    </>
  )
}
