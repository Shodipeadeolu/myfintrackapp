import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../firebase/config'
import {
  getUserProfile, setUserProfile, getHousehold,
  getCategories, addCategory
} from '../firebase/service'

const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

export function AppProvider({ children }) {
  const [user, setUser]                     = useState(null)
  const [profile, setProfile]               = useState(null)
  const [household, setHousehold]           = useState(null)
  const [userRole, setUserRole]             = useState(null)
  const [categories, setCategories]         = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [authLoading, setAuthLoading]       = useState(true)
  const [dataLoading, setDataLoading]       = useState(false)
  const [reloadCounter, setReloadCounter]   = useState(0)

  // Theme
  const [theme, setTheme] = useState(() => localStorage.getItem('ft-theme') || 'dark')
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('ft-theme', theme)
  }, [theme])
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  // Primary currency
  const [currency, setCurrencyState] = useState(() => localStorage.getItem('ft-currency') || 'NGN')

  // Balance rollover
  const [balanceRollover, setBalanceRolloverState] = useState(
    () => localStorage.getItem('ft-balance-rollover') === 'true'
  )

  // Secondary currency
  const [secEnabled, setSecEnabledState] = useState(
    () => localStorage.getItem('ft-sec-currency-enabled') === 'true'
  )
  const [secCurrency, setSecCurrencyState] = useState(
    () => localStorage.getItem('ft-sec-currency') || 'USD'
  )
  const [secRate, setSecRateState] = useState(
    () => parseFloat(localStorage.getItem('ft-sec-rate') || '0') || 0
  )

  // Permissions
  const canWrite = !userRole || ['owner', 'all_access', 'record_edit'].includes(userRole)
  const householdId = household?.id || null

  // Trigger reload across pages
  const triggerReload = () => setReloadCounter(c => c + 1)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        setDataLoading(true)
        try {
          const prof = await getUserProfile(u.uid)
          setProfile(prof)

          if (prof?.currency)         { setCurrencyState(prof.currency);         localStorage.setItem('ft-currency', prof.currency) }
          if (prof?.balanceRollover !== undefined) { setBalanceRolloverState(prof.balanceRollover); localStorage.setItem('ft-balance-rollover', prof.balanceRollover ? 'true' : 'false') }
          if (prof?.secEnabled !== undefined) { setSecEnabledState(prof.secEnabled); localStorage.setItem('ft-sec-currency-enabled', prof.secEnabled ? 'true' : 'false') }
          if (prof?.secCurrency)      { setSecCurrencyState(prof.secCurrency);    localStorage.setItem('ft-sec-currency', prof.secCurrency) }
          if (prof?.secRate)          { setSecRateState(prof.secRate);             localStorage.setItem('ft-sec-rate', String(prof.secRate)) }

          if (prof?.householdId) {
            const hh = await getHousehold(prof.householdId)
            setHousehold(hh)
            const member = hh?.members?.find(m => m.userId === u.uid)
            setUserRole(member?.role || 'owner')
          }

          const cats = await getCategories(u.uid, prof?.householdId || null)
          setCategories(cats)
        } catch (e) { console.error('App load error:', e) }
        finally { setDataLoading(false) }
      } else {
        setProfile(null); setHousehold(null); setCategories([]); setPendingInvites([])
      }
      setAuthLoading(false)
    })
    return unsub
  }, [])

  const refreshCategories = async () => {
    if (!user) return
    const cats = await getCategories(user.uid, householdId)
    setCategories(cats)
  }

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

  const setSecEnabled = async (val) => {
    setSecEnabledState(val)
    localStorage.setItem('ft-sec-currency-enabled', val ? 'true' : 'false')
    if (user) await setUserProfile(user.uid, { secEnabled: val })
  }

  const setSecCurrency = async (code) => {
    setSecCurrencyState(code)
    localStorage.setItem('ft-sec-currency', code)
    if (user) await setUserProfile(user.uid, { secCurrency: code })
  }

  const setSecRate = async (rate) => {
    setSecRateState(rate)
    localStorage.setItem('ft-sec-rate', String(rate))
    if (user) await setUserProfile(user.uid, { secRate: rate })
  }

  // Convert primary amount to secondary
  const convertToSec = useCallback((amount) => {
    if (!secEnabled || !secRate || secRate <= 0) return null
    return amount / secRate
  }, [secEnabled, secRate])

  const handleAcceptInvite = async (invite) => {
    // handled externally
  }

  const logout = async () => {
    await signOut(auth)
    setUser(null); setProfile(null); setHousehold(null)
    setUserRole(null); setCategories([]); setPendingInvites([])
  }

  return (
    <AppContext.Provider value={{
      user, profile, household, userRole, householdId,
      authLoading, dataLoading, categories,
      pendingInvites, handleAcceptInvite,
      canWrite, theme, toggleTheme,
      currency, setCurrency: (code) => setCurrency(code, user?.uid),
      balanceRollover, setBalanceRollover,
      secEnabled, setSecEnabled,
      secCurrency, setSecCurrency,
      secRate, setSecRate, convertToSec,
      reloadTrigger: reloadCounter, triggerReload,
      refreshCategories, logout,
    }}>
      {children}
    </AppContext.Provider>
  )
}
