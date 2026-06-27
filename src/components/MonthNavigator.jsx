import { addMonths, subMonths } from 'date-fns'
import { fmtMonthYear } from '../utils/helpers'
import './MonthNavigator.css'

export default function MonthNavigator({ date, onChange, allowFuture = false }) {
  return (
    <div className="month-nav">
      <button className="month-btn" onClick={() => onChange(subMonths(date, 1))}>‹</button>
      <span className="month-label">{fmtMonthYear(date)}</span>
      <button
        className="month-btn"
        onClick={() => onChange(addMonths(date, 1))}
        disabled={!allowFuture && addMonths(date, 1) > new Date()}
      >›</button>
    </div>
  )
}
