import { useState, useRef, useEffect } from 'react'
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
  const { user, authLoading, triggerReload, appUpdate } = useApp()
  const { updateAvailable, applyUpdate } = appUpdate
  const [tab, setTab] = useState('home')

  // Strip the cache-busting param left by forceReload() in useAppUpdate
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.has('_v')) {
      url.searchParams.delete('_v')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])
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
        <div className="splash-logo-wrap">💸</div>
        <div className="splash-name">FinTrack</div>
        <div className="splash-tagline">Your personal finance, sorted.</div>
        <div className="spinner" style={{ marginTop: 8 }} />
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
      {updateAvailable && (
        <div className="update-banner-global">
          <span className="update-banner-global-text">⚡ New version available</span>
          <button className="update-banner-global-btn" onClick={applyUpdate}>Refresh now</button>
        </div>
      )}
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
          onSaved={() => { setShowAdd(false); triggerReload() }}
        />
      )}
    </div>
  )
}
