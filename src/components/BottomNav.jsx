import './BottomNav.css'

const HomeIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"
      stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinejoin="round"
      fill={active ? "currentColor" : "none"} fillOpacity={active ? "0.12" : "0"} />
    <path d="M9 21V12h6v9" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" />
  </svg>
)

const ActivityIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor"
      strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" />
    <circle cx="7" cy="6" r="1.5" fill="currentColor" />
    <circle cx="7" cy="12" r="1.5" fill="currentColor" />
    <circle cx="7" cy="18" r="1.5" fill="currentColor" />
  </svg>
)

const BudgetsIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="18" height="18" rx="3"
      stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"}
      fill={active ? "currentColor" : "none"} fillOpacity={active ? "0.1" : "0"} />
    <path d="M7 15v-4M12 15V9M17 15v-6" stroke="currentColor"
      strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" />
  </svg>
)

const StatsIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"}
      fill={active ? "currentColor" : "none"} fillOpacity={active ? "0.08" : "0"} />
    <path d="M12 12L12 6" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" />
    <path d="M12 12L16.5 14.5" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  </svg>
)

const ProfileIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"}
      fill={active ? "currentColor" : "none"} fillOpacity={active ? "0.12" : "0"} />
    <path d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6" stroke="currentColor"
      strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" />
  </svg>
)

const tabs = [
  { id: 'home',         label: 'Home',     Icon: HomeIcon },
  { id: 'transactions', label: 'Activity', Icon: ActivityIcon },
  { id: 'budgets',      label: 'Budgets',  Icon: BudgetsIcon },
  { id: 'stats',        label: 'Stats',    Icon: StatsIcon },
  { id: 'profile',      label: 'Profile',  Icon: ProfileIcon },
]

export default function BottomNav({ active, onChange }) {
  return (
    <nav className="bottom-nav">
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={`nav-item ${active === id ? 'active' : ''}`}
          onClick={() => onChange(id)}
        >
          <span className="nav-icon">
            <Icon active={active === id} />
          </span>
          <span className="nav-label">{label}</span>
        </button>
      ))}
    </nav>
  )
}
