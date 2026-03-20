import { useState, useEffect, useCallback } from 'react'

// Current app version — bump this string with every release
export const APP_VERSION = '2.1.0'

export function useAppUpdate() {
  const [registration, setRegistration] = useState(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [autoUpdate, setAutoUpdateState] = useState(
    () => localStorage.getItem('ft-auto-update') !== 'false' // default ON
  )
  const [checking, setChecking] = useState(false)
  const [lastChecked, setLastChecked] = useState(
    () => localStorage.getItem('ft-last-update-check') || null
  )

  // Listen for service worker updates
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const handleSWUpdate = (reg) => {
      if (reg.waiting) {
        setRegistration(reg)
        setUpdateAvailable(true)
        // If auto-update is on, apply immediately
        if (localStorage.getItem('ft-auto-update') !== 'false') {
          applyUpdate(reg)
        }
      }
    }

    // Check existing registrations
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg) {
        if (reg.waiting) handleSWUpdate(reg)
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              handleSWUpdate(reg)
            }
          })
        })
      }
    })

    // Listen for controller change (update applied)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })
  }, [])

  const applyUpdate = useCallback((reg) => {
    const sw = reg?.waiting || registration?.waiting
    if (sw) {
      sw.postMessage({ type: 'SKIP_WAITING' })
    } else {
      window.location.reload()
    }
  }, [registration])

  const checkForUpdates = useCallback(async () => {
    setChecking(true)
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration()
        if (reg) {
          await reg.update()
          if (reg.waiting) {
            setRegistration(reg)
            setUpdateAvailable(true)
          }
        }
      }
      const now = new Date().toISOString()
      localStorage.setItem('ft-last-update-check', now)
      setLastChecked(now)
    } catch (e) {
      console.error('Update check failed:', e)
    } finally {
      setChecking(false)
    }
  }, [])

  const toggleAutoUpdate = useCallback((val) => {
    setAutoUpdateState(val)
    localStorage.setItem('ft-auto-update', val ? 'true' : 'false')
  }, [])

  const fmtLastChecked = lastChecked
    ? new Date(lastChecked).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Never'

  return {
    updateAvailable,
    autoUpdate,
    toggleAutoUpdate,
    checkForUpdates,
    applyUpdate: () => applyUpdate(registration),
    checking,
    lastChecked: fmtLastChecked,
    version: APP_VERSION,
  }
}
