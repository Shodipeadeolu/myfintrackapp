import { useApp } from '../context/AppContext'
import { fmtCurrency } from '../utils/helpers'
import './TransactionItem.css'

const SYMS = {
  NGN:'₦', USD:'$', EUR:'€', GBP:'£', GHS:'₵', KES:'KSh', ZAR:'R',
  EGP:'E£', AED:'AED', SAR:'SAR', CAD:'CA$', AUD:'A$', JPY:'¥', CNY:'¥',
  INR:'₹', BRL:'R$', SGD:'S$', CHF:'CHF', HKD:'HK$', PHP:'₱',
  IDR:'Rp', MYR:'RM', THB:'฿', TRY:'₺', RUB:'₽', PLN:'zł', ILS:'₪',
  KRW:'₩', VND:'₫',
}
const getSym = (c) => SYMS[c] || c

function fmtSec(amount, secRate, secCurrency) {
  if (!secRate || secRate <= 0) return null
  const converted = amount / secRate
  const sym = getSym(secCurrency)
  return `${sym}${converted.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export default function TransactionItem({ tx, categories, onClick }) {
  const { currency, secEnabled, secCurrency, secRate } = useApp()
  const cat  = categories.find(c => c.name === tx.category)
  const icon = cat?.icon || (tx.type === 'income' ? '💰' : '📦')

  const primaryAmt = fmtCurrency(tx.amount, currency)
  const secAmt     = secEnabled ? fmtSec(tx.amount, secRate, secCurrency) : null

  return (
    <button className="tx-item" onClick={() => onClick && onClick(tx)}>
      <div className={`tx-badge ${tx.type}`}>
        <span className="tx-badge-arrow">{tx.type === 'income' ? '↙' : '↗'}</span>
      </div>
      <div className="tx-info">
        <div className="tx-name">{tx.note || tx.category}</div>
        <div className="tx-meta">
          <span className="tx-cat">{icon} {tx.category}</span>
          {tx.subcategory && <><span className="tx-dot">·</span><span className="tx-sub">{tx.subcategory}</span></>}
          <span className="tx-dot">·</span>
          <span className="tx-date">{tx.date}</span>
        </div>
      </div>
      <div className="tx-amounts">
        <div className={`tx-amount ${tx.type}`}>
          {tx.type === 'income' ? '+' : ''}{primaryAmt}
        </div>
        {secAmt && (
          <div className="tx-amount-sec">≈ {secAmt}</div>
        )}
      </div>
    </button>
  )
}
