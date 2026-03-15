import { useState, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { parseTransactionXLSX } from '../utils/helpers'
import { batchAddTransactions, addCategory, getCategories } from '../firebase/service'
import './ImportSheet.css'

export default function ImportSheet({ onClose }) {
  const { user, householdId, categories, refreshCategories } = useApp()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('idle') // idle | parsing | importing | done | error
  const [msg, setMsg] = useState('')
  const fileRef = useRef()

  const handleFile = async (f) => {
    setFile(f)
    setStatus('parsing')
    try {
      const result = await parseTransactionXLSX(f)
      setPreview(result)
      setStatus('idle')
    } catch (e) {
      setStatus('error')
      setMsg('Could not read file. Make sure it\'s a valid XLSX file.')
    }
  }

  const handleImport = async () => {
    if (!preview) return
    setStatus('importing')
    setProgress(0)
    try {
      // Batch-add all new categories in one pass
      const existingNames = new Set(categories.map(c => c.name))
      const newCats = Object.entries(preview.categoryMap).filter(([name]) => !existingNames.has(name))

      if (newCats.length > 0) {
        setMsg(`Adding ${newCats.length} new categories…`)
        // Add categories in parallel instead of sequentially
        await Promise.all(
          newCats.map(([catName, catData]) =>
            addCategory(user.uid, householdId, {
              name: catName,
              icon: '📦',
              type: catData.type,
              subcategories: catData.subcategories
            })
          )
        )
        await refreshCategories()
      }

      setMsg('')
      const count = await batchAddTransactions(
        user.uid, householdId,
        preview.transactions,
        (pct) => setProgress(pct)
      )
      setStatus('done')
      setMsg(`✅ Imported ${count} transactions successfully!`)
    } catch (e) {
      console.error('Import error', e)
      setStatus('error')
      setMsg('Import failed: ' + (e.message || 'Please try again.'))
    }
  }

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">Import Transactions</span>
          <span style={{ width: 40 }} />
        </div>
        <div className="sheet-body">
          {status !== 'done' ? (
            <>
              <div className="import-info">
                <p>Upload an <strong>XLSX file</strong> with columns like: Date, Description, Amount, Category, Subcategory.</p>
                <p style={{ marginTop: 8 }}>Duplicates are automatically skipped. Transfers and balance rows are excluded.</p>
              </div>

              <button
                className="drop-zone"
                onClick={() => fileRef.current?.click()}
              >
                <span className="drop-icon">📂</span>
                <span className="drop-label">
                  {file ? file.name : 'Tap to choose XLSX file'}
                </span>
                {file && <span className="drop-sub">Tap to change</span>}
              </button>

              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={e => e.target.files[0] && handleFile(e.target.files[0])}
              />

              {status === 'parsing' && (
                <div className="import-loading">
                  <span className="spinner" /> Reading file…
                </div>
              )}

              {preview && status !== 'parsing' && (
                <div className="import-preview">
                  <div className="preview-stat">
                    <span className="preview-num">{preview.transactions.length}</span>
                    <span className="preview-lbl">transactions found</span>
                  </div>
                  <div className="preview-stat">
                    <span className="preview-num">{Object.keys(preview.categoryMap).length}</span>
                    <span className="preview-lbl">categories detected</span>
                  </div>
                </div>
              )}

              {status === 'importing' && (
                <div className="progress-wrap">
                  {msg && <div className="progress-step">{msg}</div>}
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="progress-label">{progress}% complete</div>
                </div>
              )}

              {status === 'error' && (
                <div className="import-err-wrap">
                  <p className="import-err">{msg}</p>
                  <button className="btn btn-ghost" onClick={() => { setStatus('idle'); setMsg('') }}>
                    Try Again
                  </button>
                </div>
              )}

              <button
                className="btn btn-primary btn-full"
                onClick={handleImport}
                disabled={!preview || status === 'importing' || status === 'parsing'}
                style={{ marginTop: 16 }}
              >
                {status === 'importing' ? 'Importing…' : 'Import'}
              </button>
            </>
          ) : (
            <div className="import-done">
              <div className="done-icon">✅</div>
              <div className="done-msg">{msg}</div>
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
