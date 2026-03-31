import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../firebase/config'
import {
  getUserProfile, setUserProfile,
  getCategories, seedDefaultCategories,
  getHousehold, getHouseholdInvites,
  acceptInvite
} from '../firebase/service'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [user, setUser]               = useState(null)
  const [profile, setProfile]         = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [reloadTrigger, setReloadTrigger] = useState(0)
  const [theme, setTheme]             = useState(() => localStorage.getItem('ft-theme') || 'dark')
  const [currency, setCurrencyState]  = useState(() => localStorage.getItem('ft-currency') || 'USD')
  const [balanceRollover, setBalanceRolloverState] = useState(
    () => localStorage.getItem('ft-balance-rollover') === 'true'
  )
  const [categories, setCategories]   = useState([])
  const [household, setHousehold]     = useState(null)
  const [pendingInvites, setPendingInvites] = useState([])

  // Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('ft-theme', theme)
  }, [theme])
  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light')

  // Currency — persist to localStorage + Firestore profile
  const setCurrency = async (code, uid) => {
    setCurrencyState(code)
    localStorage.setItem('ft-currency', code)
    if (uid) await setUserProfile(uid, { currency: code })
  }

  const setBalanceRollover = async (val) => {
    setBalanceRolloverState(val)
    localStorage.setItem('ft-balance-rollover', val ? 'true' : 'false')
    if (user) await setUserProfile(user.uid, { balanceRollover: val })
  }

  // Auth
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      if (u) {
        loadUserData(u)
      } else {
        setProfile(null); setCategories([]); setHousehold(null); setPendingInvites([])
      }
      setAuthLoading(false)
    })
  }, [])

  const loadUserData = async (u, overrideHouseholdId) => {
    setDataLoading(true)
    try {
      let prof = await getUserProfile(u.uid)
      if (!prof) {
        prof = { displayName: u.displayName || '', email: u.email, createdAt: new Date().toISOString() }
        await setUserProfile(u.uid, prof)
      }

      // Load saved currency from profile
      if (prof.currency) {
        setCurrencyState(prof.currency)
        localStorage.setItem('ft-currency', prof.currency)
      }
      // Load balance rollover setting from profile
      if (prof.balanceRollover !== undefined) {
        setBalanceRolloverState(prof.balanceRollover)
        localStorage.setItem('ft-balance-rollover', prof.balanceRollover ? 'true' : 'false')
      }

      const hhId = overrideHouseholdId !== undefined
        ? overrideHouseholdId
        : (prof.householdId || null)

      const mergedProf = { ...prof, householdId: hhId || undefined }
      setProfile(mergedProf)

      const [hh, cats, invites] = await Promise.all([
        hhId ? getHousehold(hhId) : Promise.resolve(null),
        getCategories(u.uid, hhId),
        u.email ? getHouseholdInvites(u.email) : Promise.resolve([])
      ])

      setHousehold(hh)
      setPendingInvites(invites)

      if (cats.length === 0 && !hhId) {
        await seedDefaultCategories(u.uid)
        const fresh = await getCategories(u.uid, null)
        setCategories(fresh)
      } else {
        setCategories(cats)
      }
    } catch (e) {
      console.error('loadUserData error', e)
    } finally {
      setDataLoading(false)
    }
  }

  const refreshCategories = useCallback(async () => {
    if (!user) return
    const cats = await getCategories(user.uid, profile?.householdId || null)
    setCategories(cats)
  }, [user, profile])

  const refreshHousehold = useCallback(async () => {
    if (!user || !profile?.householdId) return
    const hh = await getHousehold(profile.householdId)
    setHousehold(hh)
  }, [user, profile])

  const handleAcceptInvite = async (invite) => {
    await acceptInvite(invite.id, invite, user.uid)
    await setUserProfile(user.uid, { householdId: invite.householdId })
    setPendingInvites(prev => prev.filter(i => i.id !== invite.id))
    await loadUserData(user, invite.householdId)
  }

  const logout = () => signOut(auth)

  const householdId = profile?.householdId || null
  const userRole = household
    ? (household.members.find(m => m.userId === user?.uid)?.role || 'view-only')
    : 'owner'
  const canWrite = ['owner', 'all-access', 'record-edit'].includes(userRole)

  return (
    <AppContext.Provider value={{
      user, profile, authLoading, dataLoading,
      reloadTrigger,
      triggerReload: () => setReloadTrigger(n => n + 1),
      theme, toggleTheme,
      currency,
      setCurrency: (code) => setCurrency(code, user?.uid),
      balanceRollover,
      setBalanceRollover,
      categories, setCategories, refreshCategories,
      household, householdId, userRole, canWrite, refreshHousehold,
      pendingInvites, handleAcceptInvite,
      logout,
      reloadUser: (overrideHouseholdId) => user && loadUserData(user, overrideHouseholdId)
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
