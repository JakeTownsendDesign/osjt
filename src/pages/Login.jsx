import { useState } from 'react'
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../firebase'
import { Link, useNavigate } from 'react-router-dom'
import styles from './Auth.module.css'

export default function Login() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
    setResetSent(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, form.email, form.password)
      navigate('/')
    } catch (err) {
      setError(friendlyError(err.code))
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword() {
    if (!form.email) {
      setError('Enter your email above first.')
      return
    }
    setResetLoading(true)
    try {
      await sendPasswordResetEmail(auth, form.email)
      setResetSent(true)
      setError('')
    } catch {
      // Keep vague to avoid email enumeration
      setResetSent(true)
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.logo} />
      <h1 className={styles.title}>Daily Album</h1>
      <p className={styles.subtitle}>One photo a day. Shared albums, together.</p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label}>Email</label>
          <input
            className={styles.input}
            type="email"
            name="email"
            placeholder="you@email.com"
            value={form.email}
            onChange={handleChange}
            required
            autoComplete="email"
          />
        </div>

        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label className={styles.label}>Password</label>
            <button
              type="button"
              className={styles.forgotLink}
              onClick={handleResetPassword}
              disabled={resetLoading}
            >
              {resetLoading ? 'Sending…' : 'Forgot password?'}
            </button>
          </div>
          <input
            className={styles.input}
            type="password"
            name="password"
            placeholder="••••••••"
            value={form.password}
            onChange={handleChange}
            required
            autoComplete="current-password"
          />
        </div>

        {resetSent && (
          <p className={styles.resetConfirm}>
            If that email is registered, a reset link is on its way.
          </p>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.primaryButton} type="submit" disabled={loading}>
          {loading ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className={styles.switchRow}>
        Don't have an account?{' '}
        <Link to="/signup" className={styles.switchLink}>Sign up</Link>
      </p>
    </div>
  )
}

function friendlyError(code) {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'Incorrect email or password.'
    case 'auth/invalid-email': return 'Please enter a valid email.'
    case 'auth/too-many-requests': return 'Too many attempts. Please try again later.'
    default: return 'Something went wrong. Please try again.'
  }
}
