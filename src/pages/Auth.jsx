import { useState } from 'react'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '../firebase/config'
import { setUserProfile } from '../firebase/service'
import { APP_NAME, APP_FULL } from '../hooks/useAppUpdate'
import './Auth.css'

export default function Auth() {
  const [mode, setMode]         = useState('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [err, setErr]           = useState('')

  const handleSubmit = async () => {
    setErr(''); setLoading(true)
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password)
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() })
        await setUserProfile(cred.user.uid, { displayName: name.trim(), email })
      }
    } catch (e) {
      setErr(e.message?.replace('Firebase: ', '').replace(/\(auth.*\)/, '') || 'Something went wrong')
    } finally { setLoading(false) }
  }

  const handleGoogle = async () => {
    setErr(''); setLoading(true)
    try {
      const provider = new GoogleAuthProvider()
      const cred = await signInWithPopup(auth, provider)
      await setUserProfile(cred.user.uid, { displayName: cred.user.displayName, email: cred.user.email })
    } catch (e) {
      setErr(e.message?.replace('Firebase: ', '') || 'Google sign-in failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        {/* App branding */}
        <div className="auth-brand">
          <div className="auth-logo">🏠</div>
          <h1 className="auth-app-name">{APP_NAME}</h1>
          <p className="auth-app-full">{APP_FULL}</p>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>Sign In</button>
          <button className={`auth-tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => setMode('signup')}>Create Account</button>
        </div>

        {mode === 'signup' && (
          <div className="field">
            <label>Your Name</label>
            <input type="text" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
          </div>
        )}

        <div className="field">
          <label>Email</label>
          <input type="email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} />
        </div>

        <div className="field">
          <label>Password</label>
          <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
        </div>

        {err && <p className="auth-err">{err}</p>}

        <button className="btn btn-primary btn-full" onClick={handleSubmit} disabled={loading}>
          {loading ? <span className="spinner" /> : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>

        <div className="auth-divider"><span>or</span></div>

        <button className="btn btn-secondary btn-full google-btn" onClick={handleGoogle} disabled={loading}>
          <span className="google-icon">G</span> Continue with Google
        </button>
      </div>
    </div>
  )
}
