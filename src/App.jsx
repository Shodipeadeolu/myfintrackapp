import { useState, useRef } from 'react'
import { useApp } from './context/AppContext'
import BottomNav from './components/BottomNav'
import FAB from './components/FAB'
import Home from './pages/Home'
import Transactions from './pages/Transactions'
import Stats from './pages/Stats'
import Budgets from './pages/Budgets'
import Profile from './pages/Profile'
import Auth from './pages/Auth'
import AddTransaction from './components/AddTransaction'
import './styles/global.css'
import './App.css'

export default function App() {
  const { user, authLoading } = useApp()
  const [tab, setTab] = useState('home')
  const [profileTab, setProfileTab] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addKey, setAddKey] = useState(0)

  // Touch swipe between tabs
  const touchStart = useRef(null)
  const TABS = ['home', 'transactions', 'budgets', 'stats', 'profile']

  const handleTouchStart = (e) => {
    touchStart.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e) => {
    if (touchStart.current === null) return
    const diff = touchStart.current - e.changedTouches[0].clientX
    if (Math.abs(diff) < 60) return
    const idx = TABS.indexOf(tab)
    if (diff > 0 && idx < TABS.length - 1) setTab(TABS[idx + 1])
    if (diff < 0 && idx > 0) setTab(TABS[idx - 1])
    touchStart.current = null
  }

  const navigate = (newTab, subTab) => {
    setTab(newTab)
    if (subTab) setProfileTab(subTab)
  }

  const openAdd = () => {
    setAddKey(k => k + 1)
    setShowAdd(true)
  }

  if (authLoading) {
    return (
      <div className="splash">
        <div className="splash-logo">💸</div>
        <div className="splash-name">FinTrack</div>
        <div className="spinner" style={{ marginTop: 24 }} />
      </div>
    )
  }

  if (!user) return <Auth />

  return (
    <div
      className="app-root"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="page-container">
        {tab === 'home'         && <Home onNavigate={navigate} />}
        {tab === 'transactions' && <Transactions />}
        {tab === 'budgets'      && <Budgets />}
        {tab === 'stats'        && <Stats />}
        {tab === 'profile'      && <Profile initialTab={profileTab} />}
      </div>

      <BottomNav active={tab} onChange={setTab} />
      <FAB onClick={openAdd} />

      {showAdd && (
        <AddTransaction
          key={addKey}
          onClose={() => setShowAdd(false)}
          onSaved={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}
