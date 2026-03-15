import './FAB.css'

export default function FAB({ onClick }) {
  return (
    <button className="fab" onClick={onClick} aria-label="Add transaction">
      <span className="fab-icon">+</span>
    </button>
  )
}
