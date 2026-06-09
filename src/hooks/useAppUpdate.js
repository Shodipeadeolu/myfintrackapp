import { useState, useEffect, useCallback } from 'react'

export const APP_VERSION = '2.3.0'
export const APP_NAME    = 'HHFinance'
export const APP_FULL    = 'Household Finance'

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
    setChecking(true)
    try {
      const res = await fetch('/myfintrackapp/?_=' + Date.now(), {
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
        if (localStorage.getItem('ft-auto-update') !== 'false') window.location.reload(true)
      } else {
        setUpdateAvailable(false)
      }
    } catch (e) { console.warn('Update check failed:', e) }
    finally { setChecking(false) }
  }, [])

  useEffect(() => {
    const t = setTimeout(checkForUpdates, 10_000)
    const i = setInterval(checkForUpdates, 30 * 60 * 1000)
    return () => { clearTimeout(t); clearInterval(i) }
  }, [])

  const applyUpdate    = () => window.location.reload(true)
  const toggleAutoUpdate = (val) => {
    setAutoUpdateState(val)
    localStorage.setItem('ft-auto-update', val ? 'true' : 'false')
  }

  const fmtLastChecked = lastChecked
    ? new Date(lastChecked).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })
    : 'Never'

  return { updateAvailable, autoUpdate, toggleAutoUpdate, checkForUpdates, applyUpdate, checking, lastChecked: fmtLastChecked, version: APP_VERSION }
}
