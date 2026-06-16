import { useState } from 'react'
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from 'firebase/auth'
import { auth } from '../firebase'
import { Link, useNavigate } from 'react-router-dom'
import styles from './Auth.module.css'

export default function SignUp() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', username: '', password: '' })
  const [emailExists, setEmailExists] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { user } = await createUserWithEmailAndPassword(auth, form.email, form.password)
      await updateProfile(user, { displayName: form.username })
      await sendEmailVerification(user)
      navigate('/verify-email')
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setEmailExists(true)
      } else {
        setError(friendlyError(err.code))
      }
    } finally {
      setLoading(false)
    }
  }

  if (emailExists) {
    return (
      <div className={styles.screen}>
        <div className={styles.logo} />
        <h1 className={styles.title}>Account already exists</h1>
        <p className={styles.subtitle}>
          An account with <strong>{form.email}</strong> is already registered. Would you like to log in instead?
        </p>
        <div className={styles.form}>
          <Link to="/login" className={styles.primaryButton} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Go to login
          </Link>
          <button className={styles.ghostButton} onClick={() => setEmailExists(false)}>
            Back to sign up
          </button>
        </div>
      </div>
    )
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
          <label className={styles.label}>Username</label>
          <input
            className={styles.input}
            type="text"
            name="username"
            placeholder="@username"
            value={form.username}
            onChange={handleChange}
            required
            autoComplete="username"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Password</label>
          <input
            className={styles.input}
            type="password"
            name="password"
            placeholder="••••••••"
            value={form.password}
            onChange={handleChange}
            required
            autoComplete="new-password"
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.primaryButton} type="submit" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className={styles.switchRow}>
        Already have an account?{' '}
        <Link to="/login" className={styles.switchLink}>Log in</Link>
      </p>
    </div>
  )
}

function friendlyError(code) {
  switch (code) {
    case 'auth/invalid-email': return 'Please enter a valid email.'
    case 'auth/weak-password': return 'Password must be at least 6 characters.'
    default: return 'Something went wrong. Please try again.'
  }
}
