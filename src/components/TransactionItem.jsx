import { useApp } from '../context/AppContext'
import { fmtCurrency, fmtDate } from '../utils/helpers'
import './TransactionItem.css'

export default function TransactionItem({ tx, categories, onClick }) {
  const { currency } = useApp()
  const cat  = categories.find(c => c.name === tx.category)
  const icon = cat?.icon || (tx.type === 'income' ? '💰' : '📦')

  return (
    <button className="tx-item" onClick={() => onClick && onClick(tx)}>
      <div className={`tx-badge ${tx.type}`}>
        <span className="tx-badge-arrow">{tx.type === 'income' ? '↙' : '↗'}</span>
      </div>
      <div className="tx-info">
        <div className="tx-name">{tx.note || tx.category}</div>
        <div className="tx-meta">
          <span className="tx-cat">{icon} {tx.category}</span>
          {tx.subcategory && <span className="tx-dot">·</span>}
          {tx.subcategory && <span className="tx-sub">{tx.subcategory}</span>}
          <span className="tx-dot">·</span>
          <span className="tx-date">{fmtDate(tx.date)}</span>
        </div>
      </div>
      <div className={`tx-amount ${tx.type}`}>
        {tx.type === 'income' ? '+' : ''}{fmtCurrency(tx.amount, currency)}
      </div>
    </button>
  )
}
