import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import {
  createHousehold, createInvite, removeMember,
  updateMemberRole, setUserProfile, getHousehold
} from '../firebase/service'
import { ROLES } from '../utils/helpers'
import './HouseholdManager.css'

export default function HouseholdManager({ onClose }) {
  const { user, profile, household, userRole, refreshHousehold, reloadUser } = useApp()
  const [view, setView]               = useState(household ? 'manage' : 'create')
  const [localHousehold, setLocalHousehold] = useState(household) // local copy so we don't depend on context timing
  const [houseName, setHouseName]     = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole]   = useState('record-edit')
  const [loading, setLoading]         = useState(false)
  const [msg, setMsg]                 = useState({ text: '', type: 'info' })

  // Sync localHousehold when context household updates
  useEffect(() => {
    if (household) {
      setLocalHousehold(household)
      if (view === 'create') setView('manage')
    }
  }, [household])

  const isOwner = userRole === 'owner'
  const hh = localHousehold // always use localHousehold — never household directly

  const createHH = async () => {
    if (!houseName.trim()) return
    setLoading(true)
    setMsg({ text: '', type: 'info' })
    try {
      const id = await createHousehold(user.uid, houseName.trim())
      await setUserProfile(user.uid, { householdId: id })
      // Fetch the household immediately into local state — don't wait for context
      const freshHH = await getHousehold(id)
      setLocalHousehold(freshHH)
      setView('manage')
      // Reload context in background
      reloadUser(id)
    } catch (e) {
      console.error('createHH error', e)
      setMsg({ text: 'Failed to create household: ' + (e?.message || 'Try again.'), type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return
    if (!hh?.id) {
      setMsg({ text: 'Household not ready yet. Please wait a moment and try again.', type: 'error' })
      return
    }
    setLoading(true)
    setMsg({ text: '', type: 'info' })
    try {
      await createInvite(
        hh.id, hh.name,
        profile?.displayName || user.email,
        inviteEmail.trim().toLowerCase(),
        inviteRole
      )
      setMsg({ text: `✅ Invite sent to ${inviteEmail}`, type: 'success' })
      setInviteEmail('')
    } catch (e) {
      console.error('sendInvite error', e)
      setMsg({ text: 'Failed to send invite: ' + (e?.message || 'Try again.'), type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const kickMember = async (memberId) => {
    if (!window.confirm('Remove this member?')) return
    try {
      await removeMember(hh.id, memberId)
      const fresh = await getHousehold(hh.id)
      setLocalHousehold(fresh)
      refreshHousehold()
    } catch (e) {
      setMsg({ text: 'Failed to remove member.', type: 'error' })
    }
  }

  const changeRole = async (memberId, role) => {
    try {
      await updateMemberRole(hh.id, memberId, role)
      const fresh = await getHousehold(hh.id)
      setLocalHousehold(fresh)
      refreshHousehold()
    } catch (e) {
      setMsg({ text: 'Failed to update role.', type: 'error' })
    }
  }

  const leaveHH = async () => {
    if (!window.confirm("Leave this household? Your data will remain but you'll lose shared access.")) return
    try {
      await removeMember(hh.id, user.uid)
      await setUserProfile(user.uid, { householdId: null })
      await reloadUser(null)
      onClose()
    } catch (e) {
      setMsg({ text: 'Failed to leave household.', type: 'error' })
    }
  }

  // ── Create view ───────────────────────────────────────────
  if (view === 'create') {
    return (
      <>
        <div className="sheet-overlay" onClick={onClose} />
        <div className="sheet">
          <div className="sheet-handle" />
          <div className="sheet-header">
            <button className="btn btn-ghost" onClick={onClose}>✕</button>
            <span className="sheet-title">Create Household</span>
            <span style={{ width: 40 }} />
          </div>
          <div className="sheet-body">
            <div className="hh-intro">
              <div className="hh-big-icon">🏠</div>
              <p>Create a household to share transactions and budgets with family or housemates.</p>
            </div>
            <div className="field">
              <label>Household Name</label>
              <input
                value={houseName}
                onChange={e => setHouseName(e.target.value)}
                placeholder="e.g. The Shodipe Family"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && createHH()}
              />
            </div>
            {msg.text && <p className={msg.type === 'error' ? 'form-err' : 'hh-msg'}>{msg.text}</p>}
            <button
              className="btn btn-primary btn-full"
              onClick={createHH}
              disabled={loading || !houseName.trim()}
            >
              {loading ? <span className="spinner" /> : 'Create Household'}
            </button>
          </div>
        </div>
      </>
    )
  }

  // ── Manage view — loading guard ────────────────────────────
  if (!hh) {
    return (
      <>
        <div className="sheet-overlay" onClick={onClose} />
        <div className="sheet">
          <div className="sheet-handle" />
          <div className="sheet-header">
            <button className="btn btn-ghost" onClick={onClose}>✕</button>
            <span className="sheet-title">Household</span>
            <span style={{ width: 40 }} />
          </div>
          <div className="sheet-body">
            <div className="load-row"><span className="spinner" /></div>
          </div>
        </div>
      </>
    )
  }

  // ── Manage view ────────────────────────────────────────────
  const members = hh.members || []

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">{hh.name}</span>
          <span style={{ width: 40 }} />
        </div>
        <div className="sheet-body">
          <div className="hh-section-title">Members ({members.length})</div>
          {members.map(m => (
            <div key={m.userId} className="member-row">
              <div className="member-avatar">
                {(m.userId === user.uid
                  ? (profile?.displayName || user.email || 'Y')
                  : (m.email || m.userId)
                ).charAt(0).toUpperCase()}
              </div>
              <div className="member-info">
                <div className="member-name">
                  {m.userId === user.uid
                    ? (profile?.displayName || 'You')
                    : (m.email || m.userId.slice(0, 16) + '…')}
                </div>
                <div className="member-role-tag">{m.role}</div>
              </div>
              {isOwner && m.userId !== user.uid && (
                <div className="member-actions">
                  <select
                    value={m.role}
                    onChange={e => changeRole(m.userId, e.target.value)}
                    className="role-select"
                  >
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <button className="btn btn-ghost" onClick={() => kickMember(m.userId)}>🗑</button>
                </div>
              )}
            </div>
          ))}

          {isOwner && (
            <>
              <div className="hh-section-title" style={{ marginTop: 20 }}>Invite Member</div>
              <div className="field">
                <label>Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="friend@email.com"
                  onKeyDown={e => e.key === 'Enter' && sendInvite()}
                />
              </div>
              <div className="field">
                <label>Permission Level</label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>
                  ))}
                </select>
              </div>
              {msg.text && (
                <p className={msg.type === 'error' ? 'form-err' : 'hh-msg'}>{msg.text}</p>
              )}
              <button
                className="btn btn-primary btn-full"
                onClick={sendInvite}
                disabled={loading || !inviteEmail.trim()}
              >
                {loading ? <span className="spinner" /> : 'Send Invite'}
              </button>
            </>
          )}

          {!isOwner && (
            <button className="btn btn-danger btn-full" style={{ marginTop: 24 }} onClick={leaveHH}>
              Leave Household
            </button>
          )}
        </div>
      </div>
    </>
  )
}
