import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import {
  getEmailImportConfig, saveEmailImportConfig, getOrCreateImportCode,
} from '../firebase/emailImport'
import './EmailImportSetup.css'

const FUNCTION_URL = 'https://us-central1-myfintrack-44d97.cloudfunctions.net/emailImport'

function buildScript(importCode, banks) {
  const senders = banks.length
    ? banks.map(b => `'${b.email}'`).join(',\n  ')
    : "'no-reply@your-bank.com'"
  return `// ═══════════════════════════════════════════════
// HHFinance Auto-Import Script
// Runs every 5 min and sends bank emails to your app
// ═══════════════════════════════════════════════

var USER_CODE   = '${importCode}'
var WEBHOOK_URL = '${FUNCTION_URL}'
var SENDERS     = [
  ${senders}
]

function importBankEmails() {
  var props     = PropertiesService.getUserProperties()
  var processed = new Set(JSON.parse(props.getProperty('hhf_done') || '[]'))
  var newIds    = []
  var query     = 'from:(' + SENDERS.join(' OR ') + ')'

  GmailApp.search(query, 0, 100).forEach(function(thread) {
    thread.getMessages().forEach(function(msg) {
      var id = msg.getId()
      if (processed.has(id)) return
      try {
        UrlFetchApp.fetch(WEBHOOK_URL, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({
            userCode: USER_CODE,
            subject:  msg.getSubject(),
            body:     msg.getPlainBody().substring(0, 600),
            date:     msg.getDate().toISOString(),
            from:     msg.getFrom()
          }),
          muteHttpExceptions: true
        })
        newIds.push(id)
      } catch(e) { Logger.log(e) }
    })
  })

  if (newIds.length) {
    var all = Array.from(processed).concat(newIds)
    props.setProperty('hhf_done', JSON.stringify(all.slice(-500)))
  }
}`
}

export default function EmailImportSetup({ onClose, onNewImports }) {
  const { user, householdId } = useApp()
  const [config, setConfig]       = useState(null)
  const [importCode, setImportCode] = useState('')
  const [loading, setLoading]     = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newBankName, setNewBankName] = useState('')
  const [newBankEmail, setNewBankEmail] = useState('')
  const [copied, setCopied]       = useState('')

  useEffect(() => { if (user) loadConfig() }, [user])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const [cfg, code] = await Promise.all([
        getEmailImportConfig(user.uid).then(c => c || { banks: [] }),
        getOrCreateImportCode(user.uid),
      ])
      setConfig(cfg)
      setImportCode(code)
    } finally { setLoading(false) }
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

  const copyText = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(''), 2000)
    })
  }

  const script = importCode ? buildScript(importCode, config?.banks || []) : ''

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

            {/* Step 1 — Import code */}
            <div className="eis-section">
              <div className="eis-section-title">Step 1 — Your Import Code</div>
              <div className="eis-code-card">
                <span className="eis-code">{importCode}</span>
                <button className="eis-copy-btn" onClick={() => copyText(importCode, 'code')}>
                  {copied === 'code' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className="eis-hint">This code links your Gmail script to your account. Keep it private.</div>
            </div>

            {/* Step 2 — Bank senders */}
            <div className="eis-section">
              <div className="eis-section-title">Step 2 — Add Your Bank Emails</div>
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
                    <input placeholder="Bank name (e.g. Opay)" value={newBankName}
                      onChange={e => setNewBankName(e.target.value)} />
                    <input placeholder="Sender email (e.g. no-reply@opay-nigeria.com)" value={newBankEmail}
                      onChange={e => setNewBankEmail(e.target.value.replace(/[<>\s]/g, ''))} />
                    <div className="eis-add-form-actions">
                      <button className="eis-form-cancel" onClick={() => { setShowAddForm(false); setNewBankName(''); setNewBankEmail('') }}>Cancel</button>
                      <button className="eis-form-save" onClick={handleAddBank}
                        disabled={!newBankName.trim() || !newBankEmail.trim()}>Add Bank</button>
                    </div>
                  </div>
                ) : (
                  <button className="eis-add-bank" onClick={() => setShowAddForm(true)}>+ Add Bank</button>
                )}
              </div>
            </div>

            {/* Step 3 — Script */}
            <div className="eis-section">
              <div className="eis-section-title">Step 3 — Copy Your Script</div>
              <div className="eis-script-card">
                <div className="eis-script-header">
                  <span className="eis-script-label">Auto-generated script</span>
                  <button className="eis-copy-btn" onClick={() => copyText(script, 'script')}>
                    {copied === 'script' ? '✓ Copied!' : 'Copy Script'}
                  </button>
                </div>
                <pre className="eis-script-body">{script}</pre>
              </div>
            </div>

            {/* Step 4 — Instructions */}
            <div className="eis-section">
              <div className="eis-section-title">Step 4 — Set Up in Google</div>
              <div className="eis-steps">
                {[
                  { n: 1, text: 'Go to script.google.com and sign in with your Gmail account' },
                  { n: 2, text: 'Click "+ New project"' },
                  { n: 3, text: 'Delete all default code, then paste the copied script' },
                  { n: 4, text: 'Click Save (Ctrl+S), rename to "HHFinance Import" when asked' },
                  { n: 5, text: 'Click Run → select "importBankEmails" → grant Gmail permission when prompted' },
                  { n: 6, text: 'Click the clock icon (Triggers) on the left → Add Trigger → set Timer to "Every 5 minutes" → Save' },
                ].map(({ n, text }) => (
                  <div key={n} className="eis-step-row">
                    <div className="eis-step-num">{n}</div>
                    <div className="eis-step-text">{text}</div>
                  </div>
                ))}
              </div>
              <div className="eis-hint" style={{ marginTop: 12 }}>
                After setup, bank emails will automatically appear in your Pending Imports within 5 minutes.
              </div>
            </div>

          </>)}
        </div>
      </div>
    </>
  )
}
