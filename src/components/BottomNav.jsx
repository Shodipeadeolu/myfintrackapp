import './BottomNav.css'

const tabs = [
  { id: 'home', icon: '⊞', label: 'Home' },
  { id: 'transactions', icon: '↕', label: 'Activity' },
  { id: 'stats', icon: '◎', label: 'Stats' },
  { id: 'profile', icon: '○', label: 'Profile' },
]

export default function BottomNav({ active, onChange }) {
  return (
    <nav className="bottom-nav">
      {tabs.map(t => (
        <button
          key={t.id}
          className={`nav-item ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <span className="nav-icon">{t.icon}</span>
          <span className="nav-label">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
