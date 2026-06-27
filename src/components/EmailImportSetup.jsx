import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import {
  getEmailImportConfig, saveEmailImportConfig,
  addPendingImport, markEmailsScanned, getScannedEmailIds,
} from '../firebase/emailImport'
import {
  requestGmailToken, getStoredToken, clearGmailToken,
  verifyGmailConnection, fetchEmailsFromSender, fetchEmailContent,
} from '../utils/gmailService'
import { parseEmail } from '../utils/emailParser'
import './EmailImportSetup.css'

const CLIENT_ID = import.meta.env.VITE_GMAIL_CLIENT_ID

export default function EmailImportSetup({ onClose, onNewImports }) {
  const { user, householdId, categories } = useApp()
  const [config, setConfig]         = useState(null)
  const [loading, setLoading]       = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [scanning, setScanning]     = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newBankName, setNewBankName] = useState('')
  const [newBankEmail, setNewBankEmail] = useState('')
  const [gmailEmail, setGmailEmail] = useState(null)

  useEffect(() => { if (user) loadConfig() }, [user])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const cfg = await getEmailImportConfig(user.uid) || { banks: [], connected: false }
      setConfig(cfg)
      const token = getStoredToken()
      if (token && cfg.connected) {
        try { setGmailEmail(await verifyGmailConnection(token)) } catch {}
      }
    } finally { setLoading(false) }
  }

  const handleConnect = async () => {
    if (!CLIENT_ID) return
    setConnecting(true); setScanResult(null)
    try {
      const token = await requestGmailToken(CLIENT_ID)
      const email = await verifyGmailConnection(token)
      setGmailEmail(email)
      const updated = { ...config, connected: true, connectedEmail: email }
      await saveEmailImportConfig(user.uid, updated)
      setConfig(updated)
    } catch (err) {
      const msg = err?.message || ''
      const isPopup = msg.includes('popup') || msg.includes('blocked') || msg.includes('disallowed')
      setScanResult({ error: isPopup
        ? 'Popup was blocked. Click the address bar icon to allow popups for this site, then try again.'
        : `Could not connect to Gmail (${msg || 'unknown error'}). Make sure popups are allowed.`
      })
    } finally { setConnecting(false) }
  }

  const handleDisconnect = async () => {
    clearGmailToken(); setGmailEmail(null)
    const updated = { ...config, connected: false }
    await saveEmailImportConfig(user.uid, updated)
    setConfig(updated)
  }

  const handleAddBank = async () => {
    if (!newBankName.trim() || !newBankEmail.trim()) return
    const bank = { name: newBankName.trim(), email: newBankEmail.trim().toLowerCase() }
    const updated = { ...config, banks: [...(config.banks || []), bank] }
    await saveEmailImportConfig(user.uid, updated)
    setConfig(updated)
    setNewBankName(''); setNewBankEmail(''); setShowAddForm(false)
  }

  const handleRemoveBank = async (idx) => {
    const banks = (config.banks || []).filter((_, i) => i !== idx)
    const updated = { ...config, banks }
    await saveEmailImportConfig(user.uid, updated)
    setConfig(updated)
  }

  const handleScan = async () => {
    let token = getStoredToken()
    if (!token) {
      try { token = await requestGmailToken(CLIENT_ID) } catch {
        setScanResult({ error: 'Gmail reconnect required — tap Connect above.' }); return
      }
    }
    if (!config?.banks?.length) {
      setScanResult({ error: 'Add at least one bank email address first.' }); return
    }
    setScanning(true); setScanResult(null)
    try {
      const scannedIds = await getScannedEmailIds(user.uid)
      const seen = new Set(scannedIds)
      const lastScanEpoch = config.lastScanAt ? new Date(config.lastScanAt).getTime() : null
      let totalNew = 0
      const newIds = []

      for (const bank of config.banks) {
        const msgs = await fetchEmailsFromSender(token, bank.email, 50, lastScanEpoch)
        const fresh = msgs.filter(m => !seen.has(m.id))
        for (const msg of fresh.slice(0, 30)) {
          try {
            const full = await fetchEmailContent(token, msg.id)
            const parsed = parseEmail(full, categories)
            if (parsed.amount) {
              await addPendingImport(user.uid, householdId, { bankName: bank.name, emailId: msg.id, ...parsed })
              totalNew++
            }
            newIds.push(msg.id)
          } catch {}
        }
      }

      if (newIds.length) await markEmailsScanned(user.uid, newIds)
      const now = new Date().toISOString()
      await saveEmailImportConfig(user.uid, { ...config, lastScanAt: now })
      setConfig(c => ({ ...c, lastScanAt: now }))
      setScanResult({ count: totalNew })
      if (totalNew > 0 && onNewImports) onNewImports(totalNew)
    } catch (e) {
      if (e.message === 'TOKEN_EXPIRED') {
        clearGmailToken(); setGmailEmail(null)
        setScanResult({ error: 'Session expired — tap Connect to reconnect Gmail.' })
      } else {
        setScanResult({ error: 'Scan failed. Check your internet connection.' })
      }
    } finally { setScanning(false) }
  }

  const lastScanLabel = config?.lastScanAt
    ? new Date(config.lastScanAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Never'

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">Email Import</span>
          <span style={{ width: 40 }} />
        </div>
        <div className="sheet-body">
          {loading ? <div className="load-row"><span className="spinner" /></div> : (<>

            {!CLIENT_ID && (
              <div className="eis-setup-note" style={{ marginBottom: 20 }}>
                ⚙️ <strong>Setup required:</strong> Ask your developer to add <code>VITE_GMAIL_CLIENT_ID</code> to the app environment. See Google Cloud Console → APIs &amp; Services → Credentials.
              </div>
            )}

            <div className="eis-section">
              <div className="eis-section-title">Gmail Connection</div>
              <div className="eis-connect-card">
                <div className="eis-connect-icon">📧</div>
                <div className="eis-connect-info">
                  <div className="eis-connect-status">{gmailEmail ? 'Connected' : 'Not connected'}</div>
                  {gmailEmail && <div className="eis-connect-email">{gmailEmail}</div>}
                  {!gmailEmail && <div className="eis-connect-email">Grant read-only access to your inbox</div>}
                </div>
                {gmailEmail ? (
                  <button className="eis-connect-btn disconnect" onClick={handleDisconnect}>Disconnect</button>
                ) : (
                  <button className="eis-connect-btn" onClick={handleConnect} disabled={connecting || !CLIENT_ID}>
                    {connecting ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Connect'}
                  </button>
                )}
              </div>
            </div>

            <div className="eis-section">
              <div className="eis-section-title">Bank Notification Emails</div>
              <div className="eis-bank-list">
                {(config?.banks || []).map((bank, idx) => (
                  <div key={idx} className="eis-bank-row">
                    <div className="eis-bank-info">
                      <div className="eis-bank-name">🏦 {bank.name}</div>
                      <div className="eis-bank-email">{bank.email}</div>
                    </div>
                    <button className="eis-bank-remove" onClick={() => handleRemoveBank(idx)}>×</button>
                  </div>
                ))}
                {showAddForm ? (
                  <div className="eis-add-form">
                    <input placeholder="Bank name (e.g. GTBank)" value={newBankName} onChange={e => setNewBankName(e.target.value)} />
                    <input placeholder="Sender email (e.g. noreply@gtbank.com)" value={newBankEmail} onChange={e => setNewBankEmail(e.target.value.replace(/[<>\s]/g, ''))} />
                    <div className="eis-add-form-actions">
                      <button className="eis-form-cancel" onClick={() => { setShowAddForm(false); setNewBankName(''); setNewBankEmail('') }}>Cancel</button>
                      <button className="eis-form-save" onClick={handleAddBank} disabled={!newBankName.trim() || !newBankEmail.trim()}>Add Bank</button>
                    </div>
                  </div>
                ) : (
                  <button className="eis-add-bank" onClick={() => setShowAddForm(true)}>+ Add Bank</button>
                )}
              </div>
            </div>

            <div className="eis-section">
              <div className="eis-section-title">Scan</div>
              <div className="eis-scan-card">
                <div className="eis-scan-row">
                  <div className="eis-scan-info">
                    <div className="eis-scan-label">Scan for new transactions</div>
                    <div className="eis-scan-meta">Last scan: {lastScanLabel}</div>
                  </div>
                  <button className="eis-scan-btn" onClick={handleScan}
                    disabled={scanning || !gmailEmail || !(config?.banks?.length)}>
                    {scanning
                      ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Scanning…</>
                      : '⚡ Scan now'}
                  </button>
                </div>
                {scanResult && (
                  <div className={`eis-result-bar ${scanResult.error ? 'error' : scanResult.count > 0 ? 'success' : 'info'}`}>
                    {scanResult.error || (scanResult.count > 0
                      ? `✓ ${scanResult.count} new transaction${scanResult.count !== 1 ? 's' : ''} queued for review`
                      : 'No new transactions found since last scan.')}
                  </div>
                )}
              </div>
            </div>

          </>)}
        </div>
      </div>
    </>
  )
}
