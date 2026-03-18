import { useApp } from '../context/AppContext'
import { fmtCurrency, fmtDate } from '../utils/helpers'
import './TransactionItem.css'

export default function TransactionItem({ tx, categories, onClick }) {
  const { currency } = useApp()
  const cat  = categories.find(c => c.name === tx.category)
  const icon = cat?.icon || (tx.type === 'income' ? '💰' : '📦')

  return (
    <button className="tx-item" onClick={() => onClick && onClick(tx)}>
      <div className={`tx-icon-wrap ${tx.type}`}>
        <div className="tx-icon">{icon}</div>
        <div className={`tx-arrow ${tx.type}`}>
          {tx.type === 'income' ? '↙' : '↗'}
        </div>
      </div>
      <div className="tx-info">
        <div className="tx-category">{tx.category}</div>
        {tx.subcategory && <div className="tx-sub">{tx.subcategory}</div>}
        {tx.note && <div className="tx-note">{tx.note}</div>}
        <div className="tx-date">{fmtDate(tx.date)}</div>
      </div>
      <div className={`tx-amount ${tx.type}`}>
        {tx.type === 'income' ? '+' : '-'}{fmtCurrency(tx.amount, currency)}
      </div>
    </button>
  )
}
