import { useState } from 'react'
import './SecondaryCurrencySheet.css'

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar',        sym: '$'   },
  { code: 'EUR', name: 'Euro',             sym: '€'   },
  { code: 'GBP', name: 'British Pound',    sym: '£'   },
  { code: 'CAD', name: 'Canadian Dollar',  sym: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar',sym: 'A$'  },
  { code: 'GHS', name: 'Ghanaian Cedi',    sym: '₵'   },
  { code: 'KES', name: 'Kenyan Shilling',  sym: 'KSh' },
  { code: 'ZAR', name: 'South African Rand',sym:'R'   },
  { code: 'AED', name: 'UAE Dirham',       sym: 'AED' },
  { code: 'CNY', name: 'Chinese Yuan',     sym: '¥'   },
  { code: 'JPY', name: 'Japanese Yen',     sym: '¥'   },
  { code: 'INR', name: 'Indian Rupee',     sym: '₹'   },
  { code: 'SAR', name: 'Saudi Riyal',      sym: 'SAR' },
  { code: 'CHF', name: 'Swiss Franc',      sym: 'CHF' },
  { code: 'SGD', name: 'Singapore Dollar', sym: 'S$'  },
]

const SYMS = Object.fromEntries(CURRENCIES.map(c => [c.code, c.sym]))
export const getSym = (code) => SYMS[code] || code

export default function SecondaryCurrencySheet({
  onClose, secEnabled, toggleSec,
  secCurrency, setSecCurrency,
  secRate, setSecRate,
  primaryCurrency,
}) {
  const [localCurrency, setLocalCurrency] = useState(secCurrency)
  const [localRate, setLocalRate]         = useState(secRate > 0 ? String(secRate) : '')
  const [saved, setSaved]                 = useState(false)

  const primarySym = getSym(primaryCurrency)
  const secSym     = getSym(localCurrency)

  const handleSave = () => {
    const r = parseFloat(localRate)
    if (!r || r <= 0) return
    setSecCurrency(localCurrency)
    setSecRate(r)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  // Live preview
  const previewAmount = 100000
  const rate = parseFloat(localRate)
  const previewConverted = rate > 0 ? (previewAmount / rate).toFixed(2) : null

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">Secondary Currency</span>
          <span style={{ width: 40 }} />
        </div>
        <div className="sheet-body">

          {/* Enable toggle */}
          <div className="sec-toggle-row">
            <div>
              <div className="sec-toggle-label">Enable Secondary Currency</div>
              <div className="sec-toggle-desc">Show converted amounts alongside {primaryCurrency}</div>
            </div>
            <button
              className={`profile-toggle ${secEnabled ? 'on' : 'off'}`}
              onClick={() => toggleSec(!secEnabled)}
            >
              <div className="profile-toggle-knob" />
            </button>
          </div>

          {/* Currency picker */}
          <div className="field" style={{ marginTop: 16 }}>
            <label>Secondary Currency</label>
            <div className="sec-currency-grid">
              {CURRENCIES.map(c => (
                <button
                  key={c.code}
                  className={`sec-currency-chip ${localCurrency === c.code ? 'selected' : ''}`}
                  onClick={() => setLocalCurrency(c.code)}
                >
                  <span className="sec-chip-sym">{c.sym}</span>
                  <span className="sec-chip-code">{c.code}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Exchange rate */}
          <div className="field">
            <label>Exchange Rate</label>
            <div className="sec-rate-hint">
              How many {primaryCurrency} equals 1 {localCurrency}?
            </div>
            <div className="amount-field" style={{ marginTop: 8 }}>
              <span className="currency-sym">1 {secSym} =</span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="e.g. 1600"
                value={localRate}
                onChange={e => setLocalRate(e.target.value)}
                className="amount-input"
                style={{ fontSize: 18 }}
              />
              <span style={{ fontSize: 14, color: 'var(--text-muted)', paddingRight: 12 }}>
                {primarySym}
              </span>
            </div>
          </div>

          {/* Live preview */}
          {previewConverted && (
            <div className="sec-preview">
              <div className="sec-preview-label">Preview</div>
              <div className="sec-preview-row">
                <span className="sec-preview-from">
                  {primarySym}{previewAmount.toLocaleString()}
                </span>
                <span className="sec-preview-arrow">→</span>
                <span className="sec-preview-to">
                  {secSym}{parseFloat(previewConverted).toLocaleString()}
                </span>
              </div>
              <div className="sec-preview-note">
                Rate: 1 {localCurrency} = {primarySym}{parseFloat(localRate).toLocaleString()} {primaryCurrency}
              </div>
            </div>
          )}

          <button
            className="btn btn-primary btn-full save-btn"
            onClick={handleSave}
            disabled={!localRate || parseFloat(localRate) <= 0}
          >
            {saved ? '✓ Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>
    </>
  )
}
