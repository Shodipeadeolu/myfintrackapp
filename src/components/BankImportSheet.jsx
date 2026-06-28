import { useState, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { parseStatementFile } from '../utils/bankStatementParser'
import { getCategoryMappings, matchCategory, extractKeywords, batchSaveMappings } from '../firebase/categoryMappings'
import { batchAddTransactions } from '../firebase/service'
import { fmtCurrency } from '../utils/helpers'
import './BankImportSheet.css'

let _nextId = 1
const uid = () => String(_nextId++)

export default function BankImportSheet({ onClose }) {
  const { user, householdId, categories, triggerReload, currency } = useApp()

  const [step, setStep]       = useState('upload')   // upload | parsing | review | importing | done
  const [file, setFile]       = useState(null)
  const [format, setFormat]   = useState('')
  const [items, setItems]     = useState([])         // ReviewItem[]
  const [mappings, setMappings] = useState([])
  const [progress, setProgress] = useState(0)
  const [importedCount, setImportedCount] = useState(0)
  const [error, setError]     = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFrom, setDateFrom]     = useState('')
  const [dateTo, setDateTo]         = useState('')
  const fileRef = useRef()

  const expenseCats = categories.filter(c => c.type === 'expense')
  const incomeCats  = categories.filter(c => c.type === 'income')
  const fmt = n => fmtCurrency(n, currency)

  // Load saved category mappings once
  useEffect(() => {
    if (user) {
      getCategoryMappings(user.uid, householdId).catch(() => []).then(setMappings)
    }
  }, [user, householdId])

  // ── File handling ─────────────────────────────────────────────

  const handleFile = async (f) => {
    if (!f) return
    setFile(f)
    setStep('parsing')
    setError('')

    try {
      const { transactions, format: fmt } = await parseStatementFile(f)
      setFormat(fmt)

      if (transactions.length === 0) {
        setError('No transactions found in this file. Make sure it\'s a bank statement with debit/credit columns.')
        setStep('upload')
        return
      }

      // Build review items with auto-categorization
      const reviewItems = transactions.map(tx => {
        const match   = matchCategory(tx.description + ' ' + tx.merchant, mappings)
        const guessed = match ? null : guessCategory(tx, categories)
        const suggestedCat = match?.category || guessed || ''

        return {
          id: uid(),
          date: tx.date,
          description: tx.description,
          merchant: tx.merchant,
          amount: tx.amount,
          type: tx.type,
          debit: tx.debit,
          credit: tx.credit,
          channel: tx.channel || '',
          // UI state
          included: true,
          category: suggestedCat,
          subcategory: '',
          note: tx.merchant || tx.description.split('|')[0].trim(),
          isSuggested: !!(match || guessed),
          suggestedCategory: suggestedCat || null,
        }
      })

      setItems(reviewItems)
      setStep('review')
    } catch (e) {
      setError(e.message || 'Could not parse this file.')
      setStep('upload')
    }
  }

  // ── Review helpers ────────────────────────────────────────────

  const updateItem = (id, patch) => {
    setItems(prev => {
      const target = prev.find(it => it.id === id)
      const withPatch = prev.map(it => it.id === id ? { ...it, ...patch } : it)

      // When user explicitly picks a category, propagate to same-merchant rows
      // that haven't been manually categorised yet (empty or still auto-suggested)
      if ('category' in patch && patch.category && target?.merchant && patch.isSuggested === false) {
        return withPatch.map(it =>
          it.id !== id && it.merchant === target.merchant && (!it.category || it.isSuggested)
            ? { ...it, category: patch.category, isSuggested: false }
            : it
        )
      }
      return withPatch
    })
  }

  const toggleAll = (checked) =>
    setItems(prev => prev.map(it => ({ ...it, included: checked })))

  const visibleItems = items.filter(it => {
    if (typeFilter !== 'all' && it.type !== typeFilter) return false
    if (dateFrom && it.date < dateFrom) return false
    if (dateTo   && it.date > dateTo)   return false
    return true
  })

  const included     = items.filter(it => it.included)
  const uncategorized = included.filter(it => !it.category)
  const autoMatched  = included.filter(it => it.isSuggested && it.category)

  // ── Import ────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!included.length) return
    setStep('importing')
    setProgress(0)

    try {
      const txs = included.map(it => ({
        type:        it.type,
        amount:      it.amount,
        category:    it.category || 'Miscellaneous',
        subcategory: it.subcategory || '',
        date:        it.date,
        note:        it.note.trim(),
      }))

      const count = await batchAddTransactions(
        user.uid, householdId, txs,
        pct => setProgress(pct)
      )

      // Learn from accepted categorizations
      const pairs = []
      included.forEach(it => {
        if (!it.category) return
        const keywords = extractKeywords(it.merchant)
        keywords.forEach(kw => pairs.push({ keyword: kw, category: it.category }))
      })
      if (pairs.length) {
        batchSaveMappings(user.uid, householdId, pairs).catch(() => {})
      }

      setImportedCount(count)
      setStep('done')
      triggerReload()
    } catch (e) {
      setError(e.message || 'Import failed. Please try again.')
      setStep('review')
    }
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet bi-sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">
            {step === 'review'   ? `Review Transactions`  :
             step === 'importing'? 'Importing…'           :
             step === 'done'     ? 'Import Complete'      :
             'Import Bank Statement'}
          </span>
          <span style={{ width: 40 }} />
        </div>

        <div className="sheet-body bi-body">

          {/* ── UPLOAD ────────────────────────────────────────── */}
          {(step === 'upload' || step === 'parsing') && (
            <>
              <div className="bi-info">
                <p>Upload your bank statement and we'll extract your transactions for review before saving.</p>
                <div className="bi-formats">
                  <span className="bi-badge">CSV</span>
                  <span className="bi-badge">XLSX</span>
                  <span className="bi-badge">PDF</span>
                </div>
              </div>

              <button className="drop-zone bi-drop" onClick={() => fileRef.current?.click()}>
                <span className="drop-icon">📂</span>
                <span className="drop-label">
                  {file ? file.name : 'Tap to choose your bank statement'}
                </span>
                {file && <span className="drop-sub">Tap to change file</span>}
              </button>

              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.pdf"
                style={{ display: 'none' }}
                onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />

              {step === 'parsing' && (
                <div className="import-loading">
                  <span className="spinner" /> Reading file…
                </div>
              )}

              {error && (
                <div className="bi-error">{error}</div>
              )}
            </>
          )}

          {/* ── REVIEW ────────────────────────────────────────── */}
          {step === 'review' && (
            <>
              {/* Summary bar */}
              <div className="bi-summary-row">
                <div className="bi-summary-stat">
                  <span className="bi-summary-num">{items.length}</span>
                  <span className="bi-summary-lbl">found</span>
                </div>
                <div className="bi-summary-stat">
                  <span className="bi-summary-num bi-green">{autoMatched.length}</span>
                  <span className="bi-summary-lbl">auto-categorized</span>
                </div>
                <div className="bi-summary-stat">
                  <span className="bi-summary-num bi-amber">{uncategorized.length}</span>
                  <span className="bi-summary-lbl">need category</span>
                </div>
              </div>

              {/* Format badge */}
              <div className="bi-format-badge">Detected: {format}</div>

              {/* Filters */}
              <div className="bi-filter-row">
                <div className="seg-control" style={{ flex: 1 }}>
                  {[['all','All'], ['expense','Expenses'], ['income','Income']].map(([v, l]) => (
                    <button key={v} className={`seg-btn ${typeFilter === v ? 'active' : ''}`}
                      onClick={() => setTypeFilter(v)}>{l}</button>
                  ))}
                </div>
                <label className="bi-select-all">
                  <input type="checkbox"
                    checked={items.length > 0 && items.every(it => it.included)}
                    onChange={e => toggleAll(e.target.checked)} />
                  <span>All</span>
                </label>
              </div>

              {/* Date range filter */}
              <div className="bi-date-row">
                <span className="bi-date-label">Date</span>
                <input type="date" className="bi-date-input" value={dateFrom}
                  max={dateTo || undefined}
                  onChange={e => setDateFrom(e.target.value)} />
                <span className="bi-date-sep">–</span>
                <input type="date" className="bi-date-input" value={dateTo}
                  min={dateFrom || undefined}
                  onChange={e => setDateTo(e.target.value)} />
                {(dateFrom || dateTo) && (
                  <button className="bi-date-clear"
                    onClick={() => { setDateFrom(''); setDateTo('') }}>✕</button>
                )}
              </div>

              {/* Showing count when filtered */}
              {(dateFrom || dateTo) && (
                <div className="bi-filter-count">
                  Showing {visibleItems.length} of {items.length} transactions
                </div>
              )}

              {/* Transaction list */}
              <div className="bi-list">
                {visibleItems.map(item => (
                  <ReviewRow
                    key={item.id}
                    item={item}
                    categories={item.type === 'expense' ? expenseCats : incomeCats}
                    fmt={fmt}
                    onChange={(patch) => updateItem(item.id, patch)}
                  />
                ))}
              </div>

              {error && <div className="bi-error" style={{ marginTop: 8 }}>{error}</div>}

              {/* Action bar */}
              <div className="bi-action-bar">
                <button className="btn btn-ghost bi-change-file"
                  onClick={() => { setStep('upload'); setItems([]); setFile(null) }}>
                  Change File
                </button>
                <button
                  className="btn btn-primary bi-import-btn"
                  onClick={handleImport}
                  disabled={included.length === 0}>
                  Import {included.length} transaction{included.length !== 1 ? 's' : ''}
                </button>
              </div>
            </>
          )}

          {/* ── IMPORTING ─────────────────────────────────────── */}
          {step === 'importing' && (
            <div className="bi-progress-wrap">
              <div className="bi-progress-label">Saving transactions…</div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="progress-label">{progress}% complete</div>
            </div>
          )}

          {/* ── DONE ──────────────────────────────────────────── */}
          {step === 'done' && (
            <div className="import-done">
              <div className="done-icon">✅</div>
              <div className="done-msg">{importedCount} transactions imported successfully!</div>
              <p className="bi-learn-note">Category suggestions will improve with each import.</p>
              <button className="btn btn-primary btn-full" onClick={onClose} style={{ marginTop: 24 }}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── ReviewRow ─────────────────────────────────────────────────────

function ReviewRow({ item, categories, fmt, onChange }) {
  const [open, setOpen] = useState(false)

  const catOptions  = categories.map(c => c.name)
  const selectedCat = categories.find(c => c.name === item.category)
  const subcats     = selectedCat?.subcategories || []

  return (
    <div className={`bi-row ${!item.included ? 'bi-row-dim' : ''} ${item.isSuggested && item.category ? 'bi-row-matched' : ''}`}>
      {/* Collapsed header */}
      <div className="bi-row-header">
        <input type="checkbox" className="bi-checkbox"
          checked={item.included}
          onChange={e => onChange({ included: e.target.checked })} />

        <span className={`bi-dot ${item.type}`} />

        <div className="bi-row-main" onClick={() => setOpen(o => !o)}>
          <div className="bi-row-merchant">{item.merchant || item.description}</div>
          <div className="bi-row-meta">
            {item.date}
            {item.channel ? ` · ${item.channel}` : ''}
          </div>
        </div>

        <div className="bi-row-right" onClick={() => setOpen(o => !o)}>
          <div className={`bi-row-amount ${item.type}`}>
            {item.type === 'expense' ? '−' : '+'}{fmt(item.amount)}
          </div>
          {item.category ? (
            <div className="bi-cat-chip">
              {item.isSuggested && <span className="bi-suggested-dot" title="Auto-suggested" />}
              {item.category}{item.subcategory ? ` · ${item.subcategory}` : ''}
            </div>
          ) : (
            <div className="bi-cat-chip bi-cat-empty">Set category</div>
          )}
        </div>

        <button className="bi-chevron" onClick={() => setOpen(o => !o)}>
          {open ? '▴' : '▾'}
        </button>
      </div>

      {/* Expanded edit area */}
      {open && (
        <div className="bi-edit-area">
          <div className="bi-field">
            <div className="bi-field-label">Category</div>
            <div className="bi-cat-grid">
              {catOptions.map(name => (
                <button key={name}
                  className={`bi-cat-btn ${item.category === name ? 'active' : ''}`}
                  onClick={() => onChange({ category: name, subcategory: '', isSuggested: false })}>
                  {name}
                </button>
              ))}
            </div>
          </div>

          {subcats.length > 0 && (
            <div className="bi-field">
              <div className="bi-field-label">Sub-category</div>
              <div className="bi-cat-grid">
                {subcats.map(s => (
                  <button key={s}
                    className={`bi-cat-btn ${item.subcategory === s ? 'active' : ''}`}
                    onClick={() => onChange({ subcategory: s })}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bi-field">
            <div className="bi-field-label">Note</div>
            <input className="pi-input" type="text" placeholder="Optional note"
              value={item.note}
              onChange={e => onChange({ note: e.target.value })} />
          </div>

          <div className="bi-field-row">
            <div className="bi-field" style={{ flex: 1 }}>
              <div className="bi-field-label">Date</div>
              <input className="pi-input" type="date"
                value={item.date}
                onChange={e => onChange({ date: e.target.value })} />
            </div>
            <div className="bi-field" style={{ flex: 1 }}>
              <div className="bi-field-label">Type</div>
              <div className="pi-type-row">
                {['expense', 'income'].map(t => (
                  <button key={t}
                    className={`pi-type-btn ${item.type === t ? `active ${t}` : ''}`}
                    onClick={() => onChange({ type: t })}>
                    {t === 'expense' ? '↘ Exp' : '↗ Inc'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bi-field">
            <div className="bi-field-label">Description</div>
            <div className="bi-desc-text">{item.description}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Category guesser (keyword hints without stored mappings) ──────

const GUESS_RULES = [
  { pattern: /electricity|power|prepaid|kWh/i,            category: 'Housing'        },
  { pattern: /airtime|data|mtn|airtel|glo|9mobile/i,      category: 'Utilities'      },
  { pattern: /netflix|spotify|showmax|dstv|gotv/i,        category: 'Entertainment'  },
  { pattern: /jumia|konga|amazon|shop|market|supermarket/i, category: 'Shopping'     },
  { pattern: /restaurant|catering|tastee|eatery|kitchen|food|bakery|cafe|pizza|chicken/i, category: 'Food' },
  { pattern: /pharmacy|medplus|health|hospital|clinic|doctor/i, category: 'Health'  },
  { pattern: /living faith|church|mosque|tithe|offering|donation/i, category: 'Giving' },
  { pattern: /fuel|transport|uber|bolt|ride|bus|taxi|vehicle/i, category: 'Transport' },
  { pattern: /salary|payroll|wage/i,                       category: 'Salary'        },
  { pattern: /refund|reversal|return/i,                    category: 'Other Income'  },
  { pattern: /stamp duty|vat|fee|charge/i,                 category: 'Miscellaneous' },
  { pattern: /piggyvest|cowrywise|investment|savings/i,    category: 'Savings'       },
]

function guessCategory(tx, categories) {
  const text = (tx.description + ' ' + (tx.merchant || '')).toLowerCase()

  for (const { pattern, category } of GUESS_RULES) {
    if (pattern.test(text)) {
      // Only suggest if the user actually has this category (exact name match)
      const match = categories.find(c => c.name.toLowerCase() === category.toLowerCase())
      if (match) return match.name
    }
  }

  return ''
}
