import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  doc, getDoc, setDoc, collection, query,
  where, getDocs, serverTimestamp, deleteDoc,
} from 'firebase/firestore'
import {
  updateProfile, verifyBeforeUpdateEmail, EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, db, storage } from '../firebase'
import { signOut } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import styles from './Profile.module.css'

// ─── Username helpers ────────────────────────────────────────────────────────
function sanitiseUsername(v) {
  return v.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24)
}

async function isUsernameAvailable(username, currentUid) {
  const snap = await getDoc(doc(db, 'usernames', username))
  if (!snap.exists()) return true
  return snap.data().uid === currentUid // they already own it
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function Profile() {
  const navigate = useNavigate()
  const user = auth.currentUser
  const fileInputRef = useRef(null)

  // Firestore user data
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Editable field state
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState(user?.email || '')
  const [bio, setBio] = useState('')
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [avatarFile, setAvatarFile] = useState(null)

  // Username validation
  const [usernameStatus, setUsernameStatus] = useState(null) // null | 'checking' | 'available' | 'taken' | 'invalid'
  const usernameCheckTimer = useRef(null)

  // Save state
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [verificationEmailSent, setVerificationEmailSent] = useState(false)

  // Re-auth modal (needed for email change)
  const [showReauth, setShowReauth] = useState(false)
  const [reauthPassword, setReauthPassword] = useState('')
  const [reauthError, setReauthError] = useState('')
  const [pendingSave, setPendingSave] = useState(false)

  // User's own albums
  const [albums, setAlbums] = useState([])

  // ── Load profile ──
  useEffect(() => {
    if (!user) return
    async function load() {
      const snap = await getDoc(doc(db, 'users', user.uid))
      if (snap.exists()) {
        const data = snap.data()
        setProfile(data)
        setUsername(data.username || '')
        setBio(data.bio || '')
        setAvatarPreview(data.avatarURL || null)
      } else {
        // First visit — profile doc doesn't exist yet
        const fallback = {
          displayName: user.displayName || '',
          username: '',
          bio: '',
          avatarURL: user.photoURL || null,
          avatarColor: '#f6339a',
          usernameChanged: false,
        }
        setProfile(fallback)
        setAvatarPreview(user.photoURL || null)
      }
      setLoading(false)
    }

    async function loadAlbums() {
      const q = query(collection(db, 'albums'), where('createdBy', '==', user.uid))
      const snap = await getDocs(q)
      setAlbums(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    }

    load()
    loadAlbums()
  }, [user])

  // ── Username check (debounced) ──
  const checkUsername = useCallback((value) => {
    clearTimeout(usernameCheckTimer.current)
    const clean = sanitiseUsername(value)
    if (!clean || clean === profile?.username) {
      setUsernameStatus(null)
      return
    }
    if (clean.length < 3) {
      setUsernameStatus('invalid')
      return
    }
    setUsernameStatus('checking')
    usernameCheckTimer.current = setTimeout(async () => {
      const available = await isUsernameAvailable(clean, user.uid)
      setUsernameStatus(available ? 'available' : 'taken')
    }, 500)
  }, [profile, user])

  function handleUsernameChange(e) {
    const clean = sanitiseUsername(e.target.value)
    setUsername(clean)
    checkUsername(clean)
    setSaveSuccess(false)
  }

  // ── Avatar picker ──
  function handleAvatarClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setSaveError('Please select an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setSaveError('Image must be under 5 MB.')
      return
    }

    setSaveError('')
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    setSaveSuccess(false)
  }

  // ── Save ──
  const emailChanged = email !== user?.email

  async function handleSave() {
    if (usernameStatus === 'taken' || usernameStatus === 'invalid') return
    if (emailChanged) {
      setShowReauth(true)
      setPendingSave(true)
      return
    }
    await doSave()
  }

  async function doSave(providedPassword) {
    setSaving(true)
    setSaveError('')
    setSaveSuccess(false)
    try {
      let avatarURL = profile?.avatarURL || null

      // 1. Upload new avatar if selected
      if (avatarFile) {
        if (!storage.app.options.storageBucket) {
          throw new Error('STORAGE_NOT_CONFIGURED')
        }
        const storageRef = ref(storage, `avatars/${user.uid}`)
        await uploadBytes(storageRef, avatarFile)
        avatarURL = await getDownloadURL(storageRef)
      }

      // 2. Re-auth + send verification to new email
      if (emailChanged && providedPassword) {
        const credential = EmailAuthProvider.credential(user.email, providedPassword)
        await reauthenticateWithCredential(user, credential)
        await verifyBeforeUpdateEmail(user, email)
        // Reset field back to current email — it won't change until the link is clicked
        setEmail(user.email)
        setVerificationEmailSent(email) // store the new address for the confirmation message
      }

      // 3. Handle username change
      const usernameChanged = username !== profile?.username
      let newUsernameChanged = profile?.usernameChanged || false

      if (usernameChanged && username) {
        // Release old username reservation
        if (profile?.username) {
          await deleteDoc(doc(db, 'usernames', profile.username))
        }
        // Reserve new username
        await setDoc(doc(db, 'usernames', username), { uid: user.uid })
        newUsernameChanged = true
      }

      // 4. Update Firestore user doc
      await setDoc(doc(db, 'users', user.uid), {
        displayName: user.displayName || '',
        username: username || '',
        bio,
        avatarURL,
        avatarColor: profile?.avatarColor || '#f6339a',
        usernameChanged: newUsernameChanged,
        updatedAt: serverTimestamp(),
      }, { merge: true })

      // 5. Update Firebase Auth profile
      await updateProfile(user, {
        displayName: user.displayName,
        photoURL: avatarURL,
      })

      // Update local state
      setProfile((p) => ({ ...p, username, bio, avatarURL, usernameChanged: newUsernameChanged }))
      setAvatarFile(null)
      setUsernameStatus(null)
      setSaveSuccess(true)
    } catch (err) {
      setSaveError(friendlyError(err.code, err.message) || err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleReauth(e) {
    e.preventDefault()
    setReauthError('')
    try {
      const credential = EmailAuthProvider.credential(user.email, reauthPassword)
      await reauthenticateWithCredential(user, credential)
      setShowReauth(false)
      setPendingSave(false)
      setReauthPassword('')
      await doSave(reauthPassword)
    } catch {
      setReauthError('Incorrect password.')
    }
  }

  const isDirty = avatarFile || bio !== (profile?.bio || '') ||
    username !== (profile?.username || '') || emailChanged

  const canSave = isDirty && usernameStatus !== 'taken' && usernameStatus !== 'invalid' && usernameStatus !== 'checking'
  const usernameIsLocked = profile?.usernameChanged && username === profile?.username

  // ── Render ──
  if (loading) {
    return (
      <div className={styles.screen}>
        <p className={styles.loadingText}>Loading…</p>
      </div>
    )
  }

  const initials = (user?.displayName || username || '?')
    .split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className={styles.screen}>
      {/* Header */}
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>Profile</h1>
        <button
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={!canSave || saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>

      {/* Avatar */}
      <div className={styles.avatarSection}>
        <button className={styles.avatarWrap} onClick={handleAvatarClick} aria-label="Change photo">
          {avatarPreview
            ? <img src={avatarPreview} alt="Profile" className={styles.avatarImg} />
            : (
              <div className={styles.avatarPlaceholder} style={{ background: profile?.avatarColor || '#f6339a' }}>
                {initials}
              </div>
            )
          }
          <div className={styles.avatarBadge}>
            <CameraIcon />
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <p className={styles.changePhotoLabel}>Change photo</p>
      </div>

      {/* Fields */}
      <div className={styles.fields}>

        <div className={styles.field}>
          <label className={styles.label}>Username</label>
          <div className={styles.inputWrap}>
            <span className={styles.atSign}>@</span>
            <input
              className={`${styles.inputWithAt} ${usernameStatus === 'taken' || usernameStatus === 'invalid' ? styles.inputError : ''}`}
              value={username}
              onChange={handleUsernameChange}
              placeholder="yourhandle"
              disabled={usernameIsLocked}
              maxLength={24}
            />
            {usernameStatus === 'checking' && <span className={styles.statusIcon}>⏳</span>}
            {usernameStatus === 'available' && <span className={`${styles.statusIcon} ${styles.ok}`}>✓</span>}
            {usernameStatus === 'taken' && <span className={`${styles.statusIcon} ${styles.err}`}>✗</span>}
          </div>
          {usernameIsLocked && (
            <p className={styles.fieldHint}>Username can only be changed once and has already been set.</p>
          )}
          {usernameStatus === 'taken' && <p className={styles.fieldError}>That username is already taken.</p>}
          {usernameStatus === 'invalid' && <p className={styles.fieldError}>Must be at least 3 characters (letters, numbers, underscores).</p>}
          {usernameStatus === 'available' && <p className={styles.fieldHintGreen}>Username is available!</p>}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Email</label>
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setSaveSuccess(false); setVerificationEmailSent(false) }}
            placeholder="you@email.com"
            autoComplete="email"
          />
          {emailChanged && !verificationEmailSent && (
            <p className={styles.fieldHint}>You'll need to confirm your current password. A verification link will be sent to the new address — your email won't change until you click it.</p>
          )}
          {verificationEmailSent && (
            <p className={styles.fieldHintGreen}>Verification link sent to <strong>{verificationEmailSent}</strong>. Click it to confirm the change.</p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Bio</label>
          <textarea
            className={styles.textarea}
            value={bio}
            onChange={(e) => { setBio(e.target.value); setSaveSuccess(false) }}
            placeholder="Tell people a little about yourself…"
            maxLength={200}
            rows={3}
          />
          <p className={styles.charCount}>{bio.length} / 200</p>
        </div>

        {saveError && <p className={styles.saveError}>{saveError}</p>}
        {saveSuccess && <p className={styles.saveSuccess}>Profile saved!</p>}

        <button
          className={styles.primaryButton}
          onClick={handleSave}
          disabled={!canSave || saving}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>

        <button className={styles.signOutLink} onClick={() => signOut(auth).then(() => navigate('/login'))}>
          Sign out
        </button>
      </div>

      {/* Albums */}
      <div className={styles.albumsSection}>
        <h2 className={styles.sectionTitle}>Your albums</h2>
        {albums.length === 0
          ? <p className={styles.emptyAlbums}>You haven't created any albums yet.</p>
          : (
            <div className={styles.albumGrid}>
              {albums.map((album) => (
                <AlbumTile key={album.id} album={album} />
              ))}
            </div>
          )
        }
      </div>

      {/* Re-auth modal */}
      {showReauth && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Confirm your password</h2>
            <p className={styles.modalSub}>We'll send a verification link to <strong>{email}</strong>. Your email won't change until you click it.</p>
            <form onSubmit={handleReauth} className={styles.modalForm}>
              <input
                className={styles.input}
                type="password"
                placeholder="Current password"
                value={reauthPassword}
                onChange={(e) => setReauthPassword(e.target.value)}
                autoFocus
                required
              />
              {reauthError && <p className={styles.saveError}>{reauthError}</p>}
              <button className={styles.primaryButton} type="submit">Confirm</button>
              <button type="button" className={styles.signOutLink} onClick={() => { setShowReauth(false); setPendingSave(false) }}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

// ── Album tile ──
function AlbumTile({ album }) {
  const colors = album.thumbnailColors?.length >= 4
    ? album.thumbnailColors
    : ['#e8dccb', '#d9c7b0', '#cbb89e', '#e2d2bc']

  return (
    <Link to={`/albums/${album.id}`} className={styles.albumTile} style={{ textDecoration: 'none' }}>
      <div className={styles.tileThumbRow}>
        {colors.slice(0, 4).map((c, i) => (
          <div key={i} className={styles.tileThumb} style={{ background: c }} />
        ))}
      </div>
      <p className={styles.tileTitle}>{album.title}</p>
      <p className={styles.tileMeta}>{album.photoCount} / {album.maxPhotos} photos</p>
    </Link>
  )
}

// ── Icons ──
function CameraIcon() {
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
      <path d="M5 1l1-1h2l1 1h3a1 1 0 011 1v8a1 1 0 01-1 1H1a1 1 0 01-1-1V2a1 1 0 011-1h4z" fill="white" />
      <circle cx="7" cy="6.5" r="2" fill="#f6339a" />
    </svg>
  )
}

function friendlyError(code, message) {
  switch (code) {
    case 'auth/wrong-password': return 'Incorrect password.'
    case 'auth/email-already-in-use': return 'That email is already linked to another account.'
    case 'auth/invalid-email': return 'Please enter a valid email address.'
    case 'auth/requires-recent-login': return 'Please re-authenticate to make this change.'
    case 'storage/unauthorized':
      return 'Photo upload failed: storage permission denied. Make sure Firebase Storage rules allow authenticated writes to avatars/{uid}.'
    case 'storage/unknown':
    case 'storage/bucket-not-found':
      return 'Photo upload failed: Firebase Storage is not set up. Create a Storage bucket in the Firebase Console and configure your rules.'
    default:
      if (message === 'STORAGE_NOT_CONFIGURED') {
        return 'Photo upload failed: VITE_FIREBASE_STORAGE_BUCKET is missing from your .env file.'
      }
      return null
  }
}
