import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import './CurrencyPicker.css'

const ALL_CURRENCIES = [
  { code: 'NGN', name: 'Nigerian Naira',        symbol: '₦' },
  { code: 'USD', name: 'US Dollar',             symbol: '$' },
  { code: 'EUR', name: 'Euro',                  symbol: '€' },
  { code: 'GBP', name: 'British Pound',         symbol: '£' },
  { code: 'GHS', name: 'Ghanaian Cedi',         symbol: '₵' },
  { code: 'KES', name: 'Kenyan Shilling',       symbol: 'KSh' },
  { code: 'ZAR', name: 'South African Rand',    symbol: 'R' },
  { code: 'EGP', name: 'Egyptian Pound',        symbol: 'E£' },
  { code: 'UGX', name: 'Ugandan Shilling',      symbol: 'USh' },
  { code: 'TZS', name: 'Tanzanian Shilling',    symbol: 'TSh' },
  { code: 'ETB', name: 'Ethiopian Birr',        symbol: 'Br' },
  { code: 'XOF', name: 'West African CFA',      symbol: 'CFA' },
  { code: 'MAD', name: 'Moroccan Dirham',       symbol: 'MAD' },
  { code: 'CAD', name: 'Canadian Dollar',       symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar',     symbol: 'A$' },
  { code: 'JPY', name: 'Japanese Yen',          symbol: '¥' },
  { code: 'CNY', name: 'Chinese Yuan',          symbol: '¥' },
  { code: 'INR', name: 'Indian Rupee',          symbol: '₹' },
  { code: 'AED', name: 'UAE Dirham',            symbol: 'AED' },
  { code: 'SAR', name: 'Saudi Riyal',           symbol: 'SAR' },
  { code: 'BRL', name: 'Brazilian Real',        symbol: 'R$' },
  { code: 'MXN', name: 'Mexican Peso',          symbol: 'MX$' },
  { code: 'SGD', name: 'Singapore Dollar',      symbol: 'S$' },
  { code: 'CHF', name: 'Swiss Franc',           symbol: 'CHF' },
  { code: 'NOK', name: 'Norwegian Krone',       symbol: 'kr' },
  { code: 'SEK', name: 'Swedish Krona',         symbol: 'kr' },
  { code: 'DKK', name: 'Danish Krone',          symbol: 'kr' },
  { code: 'NZD', name: 'New Zealand Dollar',    symbol: 'NZ$' },
  { code: 'HKD', name: 'Hong Kong Dollar',      symbol: 'HK$' },
  { code: 'PKR', name: 'Pakistani Rupee',       symbol: '₨' },
  { code: 'BDT', name: 'Bangladeshi Taka',      symbol: '৳' },
  { code: 'PHP', name: 'Philippine Peso',       symbol: '₱' },
  { code: 'IDR', name: 'Indonesian Rupiah',     symbol: 'Rp' },
  { code: 'MYR', name: 'Malaysian Ringgit',     symbol: 'RM' },
  { code: 'THB', name: 'Thai Baht',             symbol: '฿' },
  { code: 'TRY', name: 'Turkish Lira',          symbol: '₺' },
  { code: 'RUB', name: 'Russian Ruble',         symbol: '₽' },
  { code: 'PLN', name: 'Polish Zloty',          symbol: 'zł' },
  { code: 'CZK', name: 'Czech Koruna',          symbol: 'Kč' },
  { code: 'HUF', name: 'Hungarian Forint',      symbol: 'Ft' },
  { code: 'ILS', name: 'Israeli Shekel',        symbol: '₪' },
  { code: 'CLP', name: 'Chilean Peso',          symbol: 'CLP' },
  { code: 'COP', name: 'Colombian Peso',        symbol: 'COP' },
  { code: 'PEN', name: 'Peruvian Sol',          symbol: 'S/' },
  { code: 'ARS', name: 'Argentine Peso',        symbol: 'ARS' },
  { code: 'VND', name: 'Vietnamese Dong',       symbol: '₫' },
  { code: 'KRW', name: 'South Korean Won',      symbol: '₩' },
]

export default function CurrencyPicker({ onClose }) {
  const { currency, setCurrency } = useApp()
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return q
      ? ALL_CURRENCIES.filter(c =>
          c.code.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.symbol.toLowerCase().includes(q)
        )
      : ALL_CURRENCIES
  }, [search])

  const handleSelect = async (code) => {
    setSaving(code)
    await setCurrency(code)
    setSaving(null)
    onClose()
  }

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet sheet-tall">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">Currency</span>
          <span style={{ width: 40 }} />
        </div>
        <div className="currency-search-wrap">
          <span className="currency-search-icon">🔍</span>
          <input
            className="currency-search"
            placeholder="Search currency..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          {search && <button className="currency-clear" onClick={() => setSearch('')}>✕</button>}
        </div>
        <div className="currency-list">
          {filtered.map(c => (
            <button
              key={c.code}
              className={`currency-row ${currency === c.code ? 'active' : ''}`}
              onClick={() => handleSelect(c.code)}
              disabled={saving !== null}
            >
              <span className="currency-symbol">{c.symbol}</span>
              <div className="currency-info">
                <span className="currency-name">{c.name}</span>
                <span className="currency-code">{c.code}</span>
              </div>
              {currency === c.code && <span className="currency-check">✓</span>}
              {saving === c.code && <span className="spinner" style={{ width: 16, height: 16 }} />}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="empty-state" style={{ padding: '40px 0' }}>
              <span className="icon">💱</span>
              <p>No currency found for "{search}"</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
