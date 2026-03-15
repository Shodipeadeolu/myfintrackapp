import './CategoryPicker.css'

export default function CategoryPicker({ categories, selected, onSelect, onClose, title }) {
  return (
    <>
      <div className="sheet-overlay" style={{ zIndex: 110 }} onClick={onClose} />
      <div className="sheet" style={{ zIndex: 111 }}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">{title || 'Select'}</span>
          <span style={{ width: 40 }} />
        </div>
        <div className="sheet-body">
          {categories.length === 0 ? (
            <div className="empty-state">
              <span className="icon">📂</span>
              <p>No categories yet.<br />Add some in Profile → Types.</p>
            </div>
          ) : (
            <div className="cat-grid">
              {categories.map(cat => (
                <button
                  key={cat.name || cat.id}
                  className={`cat-tile ${selected === cat.name ? 'selected' : ''}`}
                  onClick={() => onSelect(cat)}
                >
                  <span className="cat-tile-icon">{cat.icon || '·'}</span>
                  <span className="cat-tile-name">{cat.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
