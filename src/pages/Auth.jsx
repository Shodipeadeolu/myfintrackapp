import { useState } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile
} from 'firebase/auth'
import { auth, googleProvider } from '../firebase/config'
import './Auth.css'

export default function Auth() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    setErr('')
    if (!email || !password) return setErr('Fill in all fields.')
    setLoading(true)
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password)
      } else {
        if (!name.trim()) return setErr('Enter your name.')
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        await updateProfile(cred.user, { displayName: name.trim() })
      }
    } catch (e) {
      const map = {
        'auth/user-not-found': 'No account with that email.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/email-already-in-use': 'Email already in use.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/invalid-credential': 'Invalid email or password.',
      }
      setErr(map[e.code] || 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const googleSignIn = async () => {
    setErr('')
    setLoading(true)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user') {
        setErr('Google sign-in failed. Try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-top">
        <div className="auth-logo">💸</div>
        <h1 className="auth-title">FinTrack</h1>
        <p className="auth-sub">Your personal finance, sorted.</p>
      </div>

      <div className="auth-card">
        <div className="seg-control auth-toggle">
          <button className={`seg-btn ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setErr('') }}>
            Sign In
          </button>
          <button className={`seg-btn ${mode === 'signup' ? 'active' : ''}`} onClick={() => { setMode('signup'); setErr('') }}>
            Create Account
          </button>
        </div>

        {mode === 'signup' && (
          <div className="field">
            <label>Your Name</label>
            <input
              type="text"
              placeholder="Ada Lovelace"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>
        )}

        <div className="field">
          <label>Email</label>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoFocus={mode === 'login'}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
        </div>

        <div className="field">
          <label>Password</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
        </div>

        {err && <p className="auth-err">{err}</p>}

        <button className="btn btn-primary btn-full" onClick={submit} disabled={loading}>
          {loading ? <span className="spinner" style={{ borderTopColor: '#fff' }} /> : (mode === 'login' ? 'Sign In' : 'Create Account')}
        </button>

        <div className="auth-divider"><span>or</span></div>

        <button className="google-btn" onClick={googleSignIn} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
            <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.548 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
      </div>
    </div>
  )
}
