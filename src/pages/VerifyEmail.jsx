import { useState } from 'react'
import { sendEmailVerification, reload, signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { useNavigate } from 'react-router-dom'
import styles from './Auth.module.css'
import vStyles from './VerifyEmail.module.css'

export default function VerifyEmail() {
  const navigate = useNavigate()
  const user = auth.currentUser

  const [resent, setResent] = useState(false)
  const [resending, setResending] = useState(false)
  const [checking, setChecking] = useState(false)
  const [notYet, setNotYet] = useState(false)
  const [error, setError] = useState('')

  async function handleResend() {
    setResending(true)
    setError('')
    setResent(false)
    try {
      await sendEmailVerification(user)
      setResent(true)
    } catch (err) {
      if (err.code === 'auth/too-many-requests') {
        setError('Too many attempts — wait a few minutes before resending.')
      } else {
        setError('Could not send email. Please try again.')
      }
    } finally {
      setResending(false)
    }
  }

  async function handleCheckVerified() {
    setChecking(true)
    setNotYet(false)
    setError('')
    try {
      await reload(user)
      if (auth.currentUser?.emailVerified) {
        navigate('/', { replace: true })
      } else {
        setNotYet(true)
      }
    } catch {
      setError('Could not check status — please try again.')
    } finally {
      setChecking(false)
    }
  }

  async function handleSignOut() {
    await signOut(auth)
    navigate('/login', { replace: true })
  }

  return (
    <div className={styles.screen}>
      <div className={styles.logo} />
      <h1 className={styles.title}>Check your email</h1>
      <p className={styles.subtitle}>
        We sent a verification link to{' '}
        <strong className={vStyles.email}>{user?.email}</strong>.
        Click the link to activate your account.
      </p>

      <div className={styles.form}>
        <button
          className={styles.primaryButton}
          onClick={handleCheckVerified}
          disabled={checking}
        >
          {checking ? 'Checking…' : "I've verified my email"}
        </button>

        {notYet && (
          <p className={vStyles.notYet}>
            Your email hasn't been verified yet. Check your inbox (and spam folder) and click the link.
          </p>
        )}

        <div className={vStyles.divider} />

        <p className={vStyles.resendRow}>
          Didn't get it?{' '}
          <button
            className={vStyles.resendLink}
            onClick={handleResend}
            disabled={resending}
          >
            {resending ? 'Sending…' : 'Resend verification email'}
          </button>
        </p>

        {resent && <p className={vStyles.resendConfirm}>Email resent — check your inbox.</p>}
        {error && <p className={styles.error}>{error}</p>}

        <button className={vStyles.signOutBtn} onClick={handleSignOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}
