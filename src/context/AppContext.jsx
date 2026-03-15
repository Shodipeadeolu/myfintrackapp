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
  const [theme, setTheme]             = useState(() => localStorage.getItem('ft-theme') || 'light')
  const [categories, setCategories]   = useState([])
  const [household, setHousehold]     = useState(null)
  const [pendingInvites, setPendingInvites] = useState([])

  // ── Theme ────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('ft-theme', theme)
  }, [theme])
  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light')

  // ── Auth listener ────────────────────────────────────────────
  // Flip authLoading immediately so the app shell renders without waiting
  // for Firestore. Data loads in the background.
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      if (u) {
        loadUserData(u) // not awaited — intentional
      } else {
        setProfile(null)
        setCategories([])
        setHousehold(null)
        setPendingInvites([])
      }
      setAuthLoading(false)
    })
  }, [])

  // ── Core data loader ─────────────────────────────────────────
  // overrideHouseholdId: pass after create/join/leave so we don't
  // rely on the just-written Firestore doc being immediately consistent.
  const loadUserData = async (u, overrideHouseholdId) => {
    setDataLoading(true)
    try {
      // 1. Profile — single doc read, fast
      let prof = await getUserProfile(u.uid)
      if (!prof) {
        prof = { displayName: u.displayName || '', email: u.email, createdAt: new Date().toISOString() }
        await setUserProfile(u.uid, prof)
      }

      // If an override was supplied (right after household create/leave),
      // inject it directly so we don't wait for Firestore propagation
      const hhId = overrideHouseholdId !== undefined
        ? overrideHouseholdId
        : (prof.householdId || null)

      // Merge the householdId into the profile we're about to set in state
      const mergedProf = hhId !== undefined ? { ...prof, householdId: hhId || undefined } : prof
      setProfile(mergedProf)

      // 2. Parallel fetch — household + categories + invites all at once
      const [hh, cats, invites] = await Promise.all([
        hhId ? getHousehold(hhId) : Promise.resolve(null),
        getCategories(u.uid, hhId),
        u.email ? getHouseholdInvites(u.email) : Promise.resolve([])
      ])

      setHousehold(hh)
      setPendingInvites(invites)

      // Seed default categories for brand-new solo users
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
