import { useState, useEffect, useCallback } from 'react'

export const APP_VERSION = '2.2.0'

// Checks for updates by fetching the deployed index.html and
// comparing its JS bundle hash against the currently loaded one.
// No service worker or extra packages needed.
export function useAppUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [autoUpdate, setAutoUpdateState] = useState(
    () => localStorage.getItem('ft-auto-update') !== 'false' // default ON
  )
  const [checking, setChecking] = useState(false)
  const [lastChecked, setLastChecked] = useState(
    () => localStorage.getItem('ft-last-update-check') || null
  )

  // Get the current page's script src hash as a fingerprint
  const getCurrentHash = () => {
    const scripts = Array.from(document.querySelectorAll('script[src]'))
    const main = scripts.find(s => s.src.includes('/assets/index-'))
    return main ? main.src : ''
  }

  const checkForUpdates = useCallback(async () => {
    setChecking(true)
    try {
      // Fetch the deployed index.html with cache-busting
      const res = await fetch('/myfintrackapp/?_=' + Date.now(), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      })
      const html = await res.text()

      // Extract the JS bundle filename from fetched HTML
      const match = html.match(/\/assets\/index-([^"]+)\.js/)
      const remoteHash = match ? match[1] : null

      // Extract hash from current page's script tag
      const localMatch = getCurrentHash().match(/\/assets\/index-([^.]+)\.js/)
      const localHash = localMatch ? localMatch[1] : null

      const now = new Date().toISOString()
      localStorage.setItem('ft-last-update-check', now)
      setLastChecked(now)

      if (remoteHash && localHash && remoteHash !== localHash) {
        setUpdateAvailable(true)
        // Auto-update: reload the page to get the new version
        if (localStorage.getItem('ft-auto-update') !== 'false') {
          window.location.reload(true)
        }
      } else {
        setUpdateAvailable(false)
      }
    } catch (e) {
      console.warn('Update check failed:', e)
    } finally {
      setChecking(false)
    }
  }, [])

  // Check on mount, and every 30 minutes while app is open
  useEffect(() => {
    // Delay initial check so it doesn't slow app startup
    const initialTimer = setTimeout(checkForUpdates, 10_000)
    const interval = setInterval(checkForUpdates, 30 * 60 * 1000)
    return () => { clearTimeout(initialTimer); clearInterval(interval) }
  }, [])

  const applyUpdate = () => window.location.reload(true)

  const toggleAutoUpdate = (val) => {
    setAutoUpdateState(val)
    localStorage.setItem('ft-auto-update', val ? 'true' : 'false')
  }

  const fmtLastChecked = lastChecked
    ? new Date(lastChecked).toLocaleString('en-US', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    : 'Never'

  return {
    updateAvailable,
    autoUpdate,
    toggleAutoUpdate,
    checkForUpdates,
    applyUpdate,
    checking,
    lastChecked: fmtLastChecked,
    version: APP_VERSION,
  }
}
