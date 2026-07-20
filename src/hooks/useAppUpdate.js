import { useState, useEffect, useCallback } from 'react'

export const APP_VERSION = '2.3.0'
export const APP_NAME    = 'HHFinance'
export const APP_FULL    = 'Household Finance'

// Navigate to the same path with a unique query param so the CDN treats it
// as a new URL and returns the latest index.html instead of a cached copy.
// reload(true) is deprecated and ignored by all modern browsers.
function forceReload() {
  const url = new URL(window.location.href)
  url.searchParams.set('_v', Date.now())
  window.location.replace(url.toString())
}

export function useAppUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [autoUpdate, setAutoUpdateState]      = useState(
    () => localStorage.getItem('ft-auto-update') !== 'false'
  )
  const [checking, setChecking]   = useState(false)
  const [lastChecked, setLastChecked] = useState(
    () => localStorage.getItem('ft-last-update-check') || null
  )

  const checkForUpdates = useCallback(async () => {
    // Avoid re-checking if we just force-reloaded (prevents infinite loop)
    if (sessionStorage.getItem('ft-reloading') === '1') {
      sessionStorage.removeItem('ft-reloading')
      return
    }
    setChecking(true)
    try {
      const res = await fetch(import.meta.env.BASE_URL + '?_=' + Date.now(), {
        cache: 'no-store', headers: { 'Cache-Control': 'no-cache' }
      })
      const html = await res.text()
      const match = html.match(/\/assets\/index-([^"]+)\.js/)
      const remoteHash = match ? match[1] : null
      const scripts = Array.from(document.querySelectorAll('script[src]'))
      const main = scripts.find(s => s.src.includes('/assets/index-'))
      const localMatch = main?.src.match(/\/assets\/index-([^.]+)\.js/)
      const localHash = localMatch ? localMatch[1] : null
      const now = new Date().toISOString()
      localStorage.setItem('ft-last-update-check', now)
      setLastChecked(now)
      if (remoteHash && localHash && remoteHash !== localHash) {
        setUpdateAvailable(true)
        if (localStorage.getItem('ft-auto-update') !== 'false') {
          sessionStorage.setItem('ft-reloading', '1')
          forceReload()
        }
      } else {
        setUpdateAvailable(false)
      }
    } catch (e) { console.warn('Update check failed:', e) }
    finally { setChecking(false) }
  }, [])

  // Poll every 5 minutes and check immediately on the initial 10-second delay
  useEffect(() => {
    const t = setTimeout(checkForUpdates, 10_000)
    const i = setInterval(checkForUpdates, 5 * 60 * 1000)
    return () => { clearTimeout(t); clearInterval(i) }
  }, [])

  // Also check whenever the user switches back to this tab
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') checkForUpdates() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [checkForUpdates])

  const applyUpdate = () => {
    sessionStorage.setItem('ft-reloading', '1')
    forceReload()
  }
  const toggleAutoUpdate = (val) => {
    setAutoUpdateState(val)
    localStorage.setItem('ft-auto-update', val ? 'true' : 'false')
  }

  const fmtLastChecked = lastChecked
    ? new Date(lastChecked).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })
    : 'Never'

  return { updateAvailable, autoUpdate, toggleAutoUpdate, checkForUpdates, applyUpdate, checking, lastChecked: fmtLastChecked, version: APP_VERSION }
}
