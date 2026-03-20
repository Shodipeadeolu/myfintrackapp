import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProvider } from './context/AppContext'
import App from './App'
import { registerSW } from 'virtual:pwa-register'

// Register service worker — fires updateAvailable when a new build is detected
registerSW({
  immediate: true,
  onNeedRefresh() {
    // Dispatch a custom event — useAppUpdate hook listens for SW updates via navigator.serviceWorker
    window.dispatchEvent(new Event('sw-update-available'))
  },
  onOfflineReady() {
    console.log('FinTrack is ready to work offline')
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>
)
