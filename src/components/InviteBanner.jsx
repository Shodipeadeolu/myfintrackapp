import { useState } from 'react'
import { declineInvite } from '../firebase/service'
import './InviteBanner.css'

export default function InviteBanner({ invite, onAccept }) {
  const [loading, setLoading] = useState(false)

  const accept = async () => {
    setLoading(true)
    await onAccept(invite)
    setLoading(false)
  }

  const decline = async () => {
    await declineInvite(invite.id)
    window.location.reload()
  }

  return (
    <div className="invite-banner">
      <div className="invite-text">
        <strong>{invite.inviterName}</strong> invited you to join <strong>{invite.householdName}</strong>
        <span className="invite-role"> · {invite.role}</span>
      </div>
      <div className="invite-actions">
        <button className="invite-btn decline" onClick={decline}>Decline</button>
        <button className="invite-btn accept" onClick={accept} disabled={loading}>
          {loading ? '...' : 'Accept'}
        </button>
      </div>
    </div>
  )
}
