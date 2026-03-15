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
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [theme, setTheme] = useState(() => localStorage.getItem('ft-theme') || 'light')
  const [categories, setCategories] = useState([])
  const [household, setHousehold] = useState(null)
  const [pendingInvites, setPendingInvites] = useState([])
  const [dataLoading, setDataLoading] = useState(false)

  // Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('ft-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light')

  // Auth listener — set authLoading false as soon as we know who the user is,
  // then load their data in the background (no full-screen spinner for data)
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        loadUserData(u) // intentionally not awaited
      } else {
        setProfile(null)
        setCategories([])
        setHousehold(null)
        setPendingInvites([])
      }
      setAuthLoading(false)
    })
  }, [])

  const loadUserData = async (u, overrideHouseholdId) => {
    setDataLoading(true)
    try {
      // Profile
      let prof = await getUserProfile(u.uid)
      if (!prof) {
        prof = { displayName: u.displayName || '', email: u.email, createdAt: new Date().toISOString() }
        await setUserProfile(u.uid, prof)
      }
      setProfile(prof)

      // Use override (e.g. right after creating/joining a household) or profile value
      const hhId = overrideHouseholdId !== undefined ? overrideHouseholdId : (prof.householdId || null)

      // Household
      let hh = null
      if (hhId) {
        hh = await getHousehold(hhId)
        setHousehold(hh)
      } else {
        setHousehold(null)
      }

      // Categories
      const cats = await getCategories(u.uid, hhId)
      if (cats.length === 0 && !hhId) {
        await seedDefaultCategories(u.uid)
        const freshCats = await getCategories(u.uid, null)
        setCategories(freshCats)
      } else {
        setCategories(cats)
      }

      // Pending invites
      if (u.email) {
        const invites = await getHouseholdInvites(u.email)
        setPendingInvites(invites)
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
