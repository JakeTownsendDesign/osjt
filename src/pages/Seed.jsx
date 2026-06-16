import { useState } from 'react'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { Link } from 'react-router-dom'
import styles from './Auth.module.css'
import seedStyles from './Seed.module.css'

const SEED_USERS = [
  { id: 'user-alice', displayName: 'Alice Johnson', username: 'alice',   avatarColor: '#ff5c39', bio: 'Lover of golden hour and espresso.' },
  { id: 'user-bob',   displayName: 'Bob Smith',     username: 'bobsmith', avatarColor: '#4a90d9', bio: 'Street photographer based in London.' },
  { id: 'user-carol', displayName: 'Carol White',   username: 'carol_w',  avatarColor: '#50c878', bio: 'Chasing light around the world.' },
  { id: 'user-dave',  displayName: 'Dave Lee',      username: 'davelee',  avatarColor: '#9b59b6', bio: '' },
  { id: 'user-emma',  displayName: 'Emma Davis',    username: 'emmad',    avatarColor: '#e67e22', bio: 'Coffee, cameras, and coastlines.' },
]

const SEED_ALBUMS = [
  {
    id: 'spain-2026',
    title: 'Spain Holidays 2026',
    description: 'Two weeks chasing sun, sea and sangria across the coast.',
    maxPhotos: 100, photoCount: 37, contributorCount: 6,
    likeCount: 142, commentCount: 38,
    thumbnailColors: ['#e8dccb', '#d9c7b0', '#cbb89e', '#e2d2bc'],
  },
  {
    id: 'sunday-coffee',
    title: 'Sunday Morning Coffee',
    description: 'One perfect cup, from wherever you are in the world.',
    maxPhotos: 200, photoCount: 82, contributorCount: 23,
    likeCount: 310, commentCount: 91,
    thumbnailColors: ['#c8d8e8', '#b0c4d9', '#9eb3cb', '#c2d0df'],
  },
  {
    id: 'golden-hour',
    title: 'Golden Hour',
    description: 'That magic light just before sunset.',
    maxPhotos: 50, photoCount: 12, contributorCount: 4,
    likeCount: 57, commentCount: 14,
    thumbnailColors: ['#f5e6c8', '#f0d9a8', '#e8c98a', '#f2ddb0'],
  },
]

const RULES_SNIPPET = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}`

export default function Seed() {
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [log, setLog] = useState([])
  const [showRules, setShowRules] = useState(false)
  const [copied, setCopied] = useState(false)

  function addLog(msg, type = 'info') {
    setLog((l) => [...l, { msg, type }])
  }

  async function handleSeed() {
    setStatus('running')
    setLog([])

    const currentUser = auth.currentUser
    if (!currentUser) {
      addLog('Not logged in — please log in first.', 'error')
      setStatus('error')
      return
    }

    // ── 0. Pre-flight checks ───────────────────────────────────────────────
    addLog('Running pre-flight checks…')

    // Check Firebase config is loaded
    const projectId = db.app.options.projectId
    if (!projectId || projectId === 'undefined') {
      addLog('  ✗ VITE_FIREBASE_PROJECT_ID is missing from your .env file.', 'error')
      setStatus('error')
      return
    }
    addLog(`  ✓ Firebase project: ${projectId}`)
    addLog(`  ✓ Logged in as: ${currentUser.email} (${currentUser.uid})`)

    // Test Firestore read
    try {
      await getDoc(doc(db, '_ping', 'test'))
      addLog('  ✓ Firestore read: OK')
    } catch (err) {
      if (err.code === 'permission-denied') {
        addLog('  ✗ Firestore read: permission-denied', 'error')
        addLog('    → Your Firestore database exists but rules are blocking reads.', 'warn')
        addLog('    → Paste the rules below and click Publish in the Firebase Console.', 'warn')
      } else if (err.code === 'unavailable' || err.message?.includes('Could not reach')) {
        addLog('  ✗ Firestore unreachable — is the database created?', 'error')
        addLog('    → Go to Firebase Console → Firestore Database → Create database.', 'warn')
      } else {
        addLog(`  ✗ Firestore error: ${err.code} — ${err.message}`, 'error')
      }
      setStatus('error')
      return
    }

    // Test Firestore write
    try {
      await setDoc(doc(db, '_ping', 'test'), { ok: true })
      addLog('  ✓ Firestore write: OK')
    } catch (err) {
      if (err.code === 'permission-denied') {
        addLog('  ✗ Firestore write: permission-denied', 'error')
        addLog('    → Your rules allow reads but not writes. Update and republish.', 'warn')
      } else {
        addLog(`  ✗ Firestore write error: ${err.code} — ${err.message}`, 'error')
      }
      setStatus('error')
      return
    }

    addLog('Pre-flight passed — seeding data…')
    addLog('')

    let hasError = false

    // ── 1. Seed example users ──────────────────────────────────────────────
    addLog('Seeding example users…')
    for (const u of SEED_USERS) {
      try {
        await setDoc(doc(db, 'users', u.id), {
          displayName: u.displayName,
          username:    u.username,
          bio:         u.bio,
          avatarColor: u.avatarColor,
          avatarURL:   null,
          usernameChanged: false,
          createdAt: serverTimestamp(),
        })
        await setDoc(doc(db, 'usernames', u.username), { uid: u.id })
        addLog(`  ✓ ${u.displayName} (@${u.username})`)
      } catch (err) {
        addLog(`  ✗ ${u.displayName}: ${err.code || err.message}`, 'error')
        hasError = true
      }
    }

    // ── 2. Initialise the logged-in user's own Firestore doc ───────────────
    addLog('Initialising your profile…')
    try {
      const derivedUsername = (currentUser.displayName || 'user')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 24) || 'user'

      await setDoc(doc(db, 'users', currentUser.uid), {
        displayName:     currentUser.displayName || '',
        username:        derivedUsername,
        bio:             '',
        avatarColor:     '#ff5c39',
        avatarURL:       currentUser.photoURL || null,
        usernameChanged: false,
        createdAt:       serverTimestamp(),
      }, { merge: true })

      await setDoc(doc(db, 'usernames', derivedUsername), { uid: currentUser.uid }, { merge: true })
      addLog(`  ✓ Your account (@${derivedUsername})`)
    } catch (err) {
      addLog(`  ✗ Your profile: ${err.code || err.message}`, 'error')
      hasError = true
    }

    // ── 3. Seed albums (owned by current user so they show on your profile) ─
    addLog('Seeding albums…')
    for (const album of SEED_ALBUMS) {
      const { id, ...data } = album
      try {
        const score = (data.photoCount * 3) + (data.likeCount * 2) + data.commentCount
        await setDoc(doc(db, 'albums', id), {
          ...data,
          score,
          createdBy:  currentUser.uid,
          updatedAt:  serverTimestamp(),
        })
        addLog(`  ✓ ${album.title}`)
      } catch (err) {
        addLog(`  ✗ ${album.title}: ${err.code || err.message}`, 'error')
        hasError = true
      }
    }

    if (hasError) {
      addLog('⚠️  Some writes failed — see errors above. Likely a Firestore rules issue.', 'warn')
      setStatus('error')
    } else {
      addLog('All done!')
      setStatus('done')
    }
  }

  function copyRules() {
    navigator.clipboard.writeText(RULES_SNIPPET)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.screen}>
      <div className={styles.logo} />
      <h1 className={styles.title}>Seed Data</h1>
      <p className={styles.subtitle}>
        Populates Firestore with example albums, users, and username reservations. Run once in development.
      </p>

      <div className={styles.form}>
        {/* Firestore rules hint */}
        <div className={seedStyles.rulesBox}>
          <p className={seedStyles.rulesTitle}>Before you run</p>
          <p className={seedStyles.rulesText}>
            Make sure your Firestore security rules allow authenticated writes.{' '}
            <button className={seedStyles.rulesToggle} onClick={() => setShowRules((v) => !v)}>
              {showRules ? 'Hide rules ↑' : 'Show required rules ↓'}
            </button>
          </p>
          {showRules && (
            <div className={seedStyles.codeBlock}>
              <pre className={seedStyles.code}>{RULES_SNIPPET}</pre>
              <button className={seedStyles.copyBtn} onClick={copyRules}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <p className={seedStyles.rulesNote}>
                Paste this in the <strong>Firebase Console → Firestore → Rules</strong> tab, then publish.
              </p>
            </div>
          )}
        </div>

        {/* Run button */}
        {status !== 'done' && (
          <button
            className={styles.primaryButton}
            onClick={handleSeed}
            disabled={status === 'running'}
          >
            {status === 'running' ? 'Seeding…' : 'Run seed'}
          </button>
        )}

        {/* Log output */}
        {log.length > 0 && (
          <div className={seedStyles.logBox}>
            {log.map((entry, i) => (
              <p key={i} className={
                entry.type === 'error' ? seedStyles.logError
                : entry.type === 'warn' ? seedStyles.logWarn
                : seedStyles.logLine
              }>
                {entry.msg}
              </p>
            ))}
          </div>
        )}

        {status === 'error' && (
          <p className={seedStyles.logWarn}>
            Fix the errors above and run again — already-written docs will be safely overwritten.
          </p>
        )}

        {status === 'done' && (
          <>
            <p style={{ color: '#50c878', fontWeight: 600 }}>✓ Database seeded successfully.</p>
            <Link
              to="/"
              className={styles.primaryButton}
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              Go to Home
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
