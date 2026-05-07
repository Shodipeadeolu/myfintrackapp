import { useApp } from '../context/AppContext'
import { fmtCurrency } from '../utils/helpers'
import { fmtSec } from '../utils/secCurrency'
import './TransactionItem.css'

const SYMS = {
  NGN:'₦',USD:'$',EUR:'€',GBP:'£',GHS:'₵',KES:'KSh',ZAR:'R',
  EGP:'E£',AED:'AED',SAR:'SAR',CAD:'CA$',AUD:'A$',JPY:'¥',CNY:'¥',
  INR:'₹',BRL:'R$',SGD:'S$',CHF:'CHF',HKD:'HK$',PHP:'₱',IDR:'Rp',
  MYR:'RM',THB:'฿',TRY:'₺',RUB:'₽',PLN:'zł',ILS:'₪',KRW:'₩',VND:'₫',
}

// Visual config per type
const TYPE_CONFIG = {
  income:  { arrow: '↙', badgeBg: 'rgba(0,196,140,0.15)',   arrowColor: 'var(--green)',  amtColor: 'var(--green)',  prefix: '+' },
  expense: { arrow: '↗', badgeBg: 'rgba(239,68,68,0.15)',   arrowColor: 'var(--red)',    amtColor: 'var(--text-primary)', prefix: '' },
  savings: { arrow: '🏦', badgeBg: 'rgba(245,166,35,0.12)', arrowColor: '#f5a623',       amtColor: '#f5a623',       prefix: '' },
  loans:   { arrow: '💳', badgeBg: 'rgba(74,128,232,0.12)', arrowColor: '#4a80e8',       amtColor: '#4a80e8',       prefix: '' },
}

export default function TransactionItem({ tx, categories, onClick }) {
  const { currency, secEnabled, secCurrency, secRate } = useApp()
  const cat    = categories.find(c => c.name === tx.category)
  const icon   = cat?.icon || '📦'
  const config = TYPE_CONFIG[tx.type] || TYPE_CONFIG.expense

  const primaryAmt = fmtCurrency(tx.amount, currency)
  const secAmt     = secEnabled ? fmtSec(tx.amount, secEnabled, secRate, secCurrency) : null

  return (
    <button className="tx-item" onClick={() => onClick && onClick(tx)}>
      <div className="tx-badge" style={{ background: config.badgeBg }}>
        <span className="tx-badge-arrow" style={{ color: config.arrowColor }}>
          {config.arrow}
        </span>
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
        <div className="tx-amount" style={{ color: config.amtColor }}>
          {config.prefix}{primaryAmt}
        </div>
        {secAmt && <div className="tx-amount-sec">{secAmt}</div>}
      </div>
    </button>
  )
}
