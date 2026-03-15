import { useState } from 'react'
import { useApp } from '../context/AppContext'
import CategoryManager from '../components/CategoryManager'
import HouseholdManager from '../components/HouseholdManager'
import ImportSheet from '../components/ImportSheet'
import './Profile.css'

export default function Profile({ initialTab }) {
  const { user, profile, household, userRole, logout } = useApp()
  const [activeSheet, setActiveSheet] = useState(initialTab || null)

  const initials = (profile?.displayName || user?.email || 'U')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  const menuItems = [
    { id: 'types', icon: '⊞', label: 'Transaction Types', desc: 'Manage categories & subcategories' },
    { id: 'household', icon: '🏠', label: 'Household', desc: household ? household.name : 'Create or join a household' },
    { id: 'import', icon: '📥', label: 'Import Transactions', desc: 'Upload an XLSX file' },
  ]

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="profile-header">
          <div className="avatar">{initials}</div>
          <div className="profile-info">
            <div className="profile-name">{profile?.displayName || 'You'}</div>
            <div className="profile-email">{user?.email}</div>
            {household && (
              <div className="profile-badge">
                {userRole === 'owner' ? '👑 Owner' : `🏠 ${userRole}`}
              </div>
            )}
          </div>
        </div>

        <div className="menu-section">
          {menuItems.map(item => (
            <button key={item.id} className="menu-row" onClick={() => setActiveSheet(item.id)}>
              <div className="menu-icon-wrap">{item.icon}</div>
              <div className="menu-text">
                <div className="menu-label">{item.label}</div>
                <div className="menu-desc">{item.desc}</div>
              </div>
              <span className="menu-arrow">›</span>
            </button>
          ))}
        </div>

        <div className="menu-section">
          <button className="menu-row danger-row" onClick={logout}>
            <div className="menu-icon-wrap">🚪</div>
            <div className="menu-text">
              <div className="menu-label">Sign Out</div>
            </div>
          </button>
        </div>

        <div className="profile-footer">
          <p>FinTrack · Built with ♥</p>
          <p>v2.0.0</p>
        </div>
      </div>

      {activeSheet === 'types' && (
        <CategoryManager onClose={() => setActiveSheet(null)} />
      )}
      {activeSheet === 'household' && (
        <HouseholdManager onClose={() => setActiveSheet(null)} />
      )}
      {activeSheet === 'import' && (
        <ImportSheet onClose={() => setActiveSheet(null)} />
      )}
    </div>
  )
}
