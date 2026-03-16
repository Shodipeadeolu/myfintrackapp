import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import {
  createHousehold, removeMember, updateMemberRole,
  setUserProfile, getHousehold,
  setHouseholdInviteCode, joinHouseholdByCode
} from '../firebase/service'
import { ROLES } from '../utils/helpers'
import './HouseholdManager.css'

const ROLE_LABELS = {
  'all-access':  { label: 'All Access',    desc: 'Can do everything except manage members', icon: '⚡' },
  'record-edit': { label: 'Record & Edit', desc: 'Add and edit transactions only',           icon: '✏️' },
  'view-only':   { label: 'View Only',     desc: 'Can only view, cannot add or edit',        icon: '👁' },
}

export default function HouseholdManager({ onClose }) {
  const { user, profile, household, userRole, refreshHousehold, reloadUser } = useApp()
  const [view, setView]                     = useState(household ? 'manage' : 'entry')
  const [localHousehold, setLocalHousehold] = useState(household)
  const [houseName, setHouseName]           = useState('')
  const [joinCode, setJoinCode]             = useState('')
  const [selectedRole, setSelectedRole]     = useState('record-edit')
  const [loading, setLoading]               = useState(false)
  const [msg, setMsg]                       = useState({ text: '', type: 'info' })
  const [codeCopied, setCodeCopied]         = useState(false)

  useEffect(() => {
    if (household) {
      setLocalHousehold(household)
      if (['entry','create','join'].includes(view)) setView('manage')
    }
  }, [household])

  const isOwner = userRole === 'owner'
  const hh = localHousehold

  const refreshLocal = async (id) => {
    const fresh = await getHousehold(id)
    setLocalHousehold(fresh)
    refreshHousehold()
  }

  // ── Create household ────────────────────────────────────────
  const createHH = async () => {
    if (!houseName.trim()) return
    setLoading(true); setMsg({ text: '', type: 'info' })
    try {
      const id = await createHousehold(user.uid, houseName.trim())
      await setUserProfile(user.uid, { householdId: id })
      await refreshLocal(id)
      setView('manage')
      reloadUser(id)
    } catch (e) {
      setMsg({ text: 'Failed: ' + (e?.message || 'Try again.'), type: 'error' })
    } finally { setLoading(false) }
  }

  // ── Join by code ────────────────────────────────────────────
  const joinByCode = async () => {
    if (joinCode.trim().length < 6) return
    setLoading(true); setMsg({ text: '', type: 'info' })
    try {
      const joined = await joinHouseholdByCode(joinCode.trim(), user.uid)
      await setUserProfile(user.uid, { householdId: joined.id })
      await refreshLocal(joined.id)
      setView('manage')
      reloadUser(joined.id)
    } catch (e) {
      setMsg({ text: e?.message || 'Invalid code. Try again.', type: 'error' })
    } finally { setLoading(false) }
  }

  // ── Generate new code with selected role ────────────────────
  const generateCode = async () => {
    if (!hh?.id) return
    setLoading(true)
    try {
      await setHouseholdInviteCode(hh.id, selectedRole)
      await refreshLocal(hh.id)
    } catch (e) {
      setMsg({ text: 'Failed to generate code.', type: 'error' })
    } finally { setLoading(false) }
  }

  // ── Copy code ───────────────────────────────────────────────
  const copyCode = () => {
    const text = hh?.inviteCode
      ? `Join my household "${hh.name}" on FinTrack! Use code: ${hh.inviteCode}`
      : ''
    navigator.clipboard?.writeText(text).catch(() => {})
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }

  const kickMember = async (memberId) => {
    if (!window.confirm('Remove this member?')) return
    try {
      await removeMember(hh.id, memberId)
      await refreshLocal(hh.id)
    } catch { setMsg({ text: 'Failed to remove member.', type: 'error' }) }
  }

  const changeRole = async (memberId, role) => {
    try {
      await updateMemberRole(hh.id, memberId, role)
      await refreshLocal(hh.id)
    } catch { setMsg({ text: 'Failed to update role.', type: 'error' }) }
  }

  const leaveHH = async () => {
    if (!window.confirm("Leave this household?")) return
    try {
      await removeMember(hh.id, user.uid)
      await setUserProfile(user.uid, { householdId: null })
      await reloadUser(null)
      onClose()
    } catch { setMsg({ text: 'Failed to leave.', type: 'error' }) }
  }

  // ── Entry ───────────────────────────────────────────────────
  if (view === 'entry') return (
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
          <div className="hh-entry-options">
            <button className="hh-option-card" onClick={() => setView('create')}>
              <div className="hh-option-icon">🏠</div>
              <div className="hh-option-label">Create a Household</div>
              <div className="hh-option-desc">Start a new household and invite your family</div>
            </button>
            <button className="hh-option-card" onClick={() => setView('join')}>
              <div className="hh-option-icon">🔑</div>
              <div className="hh-option-label">Join with a Code</div>
              <div className="hh-option-desc">Enter a 6-character code from your household owner</div>
            </button>
          </div>
        </div>
      </div>
    </>
  )

  // ── Create ──────────────────────────────────────────────────
  if (view === 'create') return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={() => setView('entry')}>‹ Back</button>
          <span className="sheet-title">Create Household</span>
          <span style={{ width: 40 }} />
        </div>
        <div className="sheet-body">
          <div className="hh-intro">
            <div className="hh-big-icon">🏠</div>
            <p>Create a household to share finances with family or housemates.</p>
          </div>
          <div className="field">
            <label>Household Name</label>
            <input value={houseName} onChange={e => setHouseName(e.target.value)}
              placeholder="e.g. The Shodipe Family" autoFocus
              onKeyDown={e => e.key === 'Enter' && createHH()} />
          </div>
          {msg.text && <p className={msg.type === 'error' ? 'form-err' : 'hh-msg'}>{msg.text}</p>}
          <button className="btn btn-primary btn-full" onClick={createHH} disabled={loading || !houseName.trim()}>
            {loading ? <span className="spinner" /> : 'Create Household'}
          </button>
        </div>
      </div>
    </>
  )

  // ── Join ────────────────────────────────────────────────────
  if (view === 'join') return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={() => setView('entry')}>‹ Back</button>
          <span className="sheet-title">Join a Household</span>
          <span style={{ width: 40 }} />
        </div>
        <div className="sheet-body">
          <div className="hh-intro">
            <div className="hh-big-icon">🔑</div>
            <p>Enter the 6-character code from your household owner.</p>
          </div>
          <div className="field">
            <label>Invite Code</label>
            <input value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6))}
              placeholder="e.g. UDACBM" className="code-input" autoFocus
              onKeyDown={e => e.key === 'Enter' && joinByCode()} />
          </div>
          {msg.text && <p className={msg.type === 'error' ? 'form-err' : 'hh-msg'}>{msg.text}</p>}
          <button className="btn btn-primary btn-full" onClick={joinByCode} disabled={loading || joinCode.length < 6}>
            {loading ? <span className="spinner" /> : 'Join Household'}
          </button>
        </div>
      </div>
    </>
  )

  // ── Loading guard ───────────────────────────────────────────
  if (!hh) return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">Household</span>
          <span style={{ width: 40 }} />
        </div>
        <div className="sheet-body"><div className="load-row"><span className="spinner" /></div></div>
      </div>
    </>
  )

  // ── Manage ──────────────────────────────────────────────────
  const members = hh.members || []
  const currentCodeRole = hh.inviteCodeRole || 'record-edit'

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

          {/* ── Invite code card (owner only) ────────────────── */}
          {isOwner && (
            <div className="invite-code-card">
              <div className="invite-code-label">Invite Code</div>

              {hh.inviteCode ? (
                <>
                  <div className="invite-code-display">
                    {hh.inviteCode.split('').map((ch, i) => (
                      <span key={i} className="code-char">{ch}</span>
                    ))}
                  </div>
                  <div className="code-role-tag">
                    {ROLE_LABELS[currentCodeRole]?.icon} {ROLE_LABELS[currentCodeRole]?.label}
                    <span className="code-role-desc"> · {ROLE_LABELS[currentCodeRole]?.desc}</span>
                  </div>
                  <p className="invite-code-hint">
                    Share this code — anyone who uses it joins as <strong>{ROLE_LABELS[currentCodeRole]?.label}</strong>
                  </p>
                  <div className="invite-code-actions">
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={copyCode}>
                      {codeCopied ? '✓ Copied!' : '📋 Copy Code'}
                    </button>
                  </div>
                </>
              ) : (
                <p className="invite-code-hint" style={{ marginTop: 4 }}>
                  Generate a code to invite members
                </p>
              )}

              {/* Role selector + generate */}
              <div className="code-gen-section">
                <div className="code-gen-label">
                  {hh.inviteCode ? 'Generate new code with role:' : 'Select role for new code:'}
                </div>
                <div className="role-picker">
                  {ROLES.map(r => (
                    <button
                      key={r.value}
                      className={`role-chip ${selectedRole === r.value ? 'active' : ''}`}
                      onClick={() => setSelectedRole(r.value)}
                    >
                      {ROLE_LABELS[r.value]?.icon} {r.label}
                    </button>
                  ))}
                </div>
                <div className="role-chip-desc">{ROLE_LABELS[selectedRole]?.desc}</div>
                <button
                  className="btn btn-secondary btn-full"
                  onClick={generateCode}
                  disabled={loading}
                  style={{ marginTop: 10 }}
                >
                  {loading
                    ? <span className="spinner" style={{ width: 14, height: 14 }} />
                    : hh.inviteCode ? '↻ Generate New Code' : '+ Generate Invite Code'
                  }
                </button>
              </div>
            </div>
          )}

          {/* ── Members list ─────────────────────────────────── */}
          <div className="hh-section-title" style={{ marginTop: 20 }}>
            Members ({members.length})
          </div>
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
                <div className="member-role-tag">{ROLE_LABELS[m.role]?.label || m.role}</div>
              </div>
              {isOwner && m.userId !== user.uid && (
                <div className="member-actions">
                  <select value={m.role} onChange={e => changeRole(m.userId, e.target.value)} className="role-select">
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <button className="btn btn-ghost" onClick={() => kickMember(m.userId)}>🗑</button>
                </div>
              )}
            </div>
          ))}

          {msg.text && (
            <p className={msg.type === 'error' ? 'form-err' : 'hh-msg'} style={{ marginTop: 12 }}>
              {msg.text}
            </p>
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
