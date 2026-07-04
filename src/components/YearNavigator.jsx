import { addYears, subYears } from 'date-fns'
import './MonthNavigator.css'

export default function YearNavigator({ date, onChange, allowFuture = false }) {
  return (
    <div className="month-nav">
      <button className="month-btn" onClick={() => onChange(subYears(date, 1))}>‹</button>
      <span className="month-label">{date.getFullYear()}</span>
      <button
        className="month-btn"
        onClick={() => onChange(addYears(date, 1))}
        disabled={!allowFuture && addYears(date, 1) > new Date()}
      >›</button>
    </div>
  )
}
