import { useEffect, useState } from 'react'
import {
  collection, query, where, getDocs,
  doc, setDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import { useNavigate } from 'react-router-dom'
import styles from './CreateAlbum.module.css'

const MIN_PHOTOS = 10
const MAX_PHOTOS = 200
const DEFAULT_PHOTOS = 100
const STEP = 10

export default function CreateAlbum() {
  const navigate = useNavigate()
  const user = auth.currentUser

  const [slotUsed, setSlotUsed] = useState(null) // null = loading, false = available, true = used
  const [existingAlbum, setExistingAlbum] = useState(null) // the album that used the slot

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [maxPhotos, setMaxPhotos] = useState(DEFAULT_PHOTOS)

  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  // ── Check monthly slot ──
  useEffect(() => {
    async function checkSlot() {
      const startOfMonth = Timestamp.fromDate(
        new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      )
      const q = query(
        collection(db, 'albums'),
        where('createdBy', '==', user.uid),
        where('createdAt', '>=', startOfMonth)
      )
      const snap = await getDocs(q)
      if (snap.size > 0) {
        setSlotUsed(true)
        setExistingAlbum(snap.docs[0].data())
      } else {
        setSlotUsed(false)
      }
    }
    checkSlot()
  }, [user])

  // ── Stepper ──
  function decrement() { setMaxPhotos((v) => Math.max(MIN_PHOTOS, v - STEP)) }
  function increment() { setMaxPhotos((v) => Math.min(MAX_PHOTOS, v + STEP)) }

  // ── Validate + submit ──
  function validate() {
    const e = {}
    if (!title.trim()) e.title = 'Album title is required.'
    if (!description.trim()) e.description = 'Theme / description is required.'
    return e
  }

  async function handleCreate() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    try {
      const id = `album-${user.uid}-${Date.now()}`
      await setDoc(doc(db, 'albums', id), {
        title: title.trim(),
        description: description.trim(),
        maxPhotos,
        photoCount: 0,
        contributorCount: 0,
        likeCount: 0,
        commentCount: 0,
        score: 0,
        thumbnailColors: [],
        status: 'open',
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      navigate('/')
    } catch (err) {
      setErrors({ submit: 'Something went wrong. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  // ── Loading ──
  if (slotUsed === null) {
    return (
      <div className={styles.screen}>
        <NavBar onCancel={() => navigate(-1)} onCreate={null} saving={false} />
        <p className={styles.loadingText}>Checking your album slot…</p>
      </div>
    )
  }

  // ── Slot already used ──
  if (slotUsed) {
    const monthName = new Date().toLocaleString('default', { month: 'long' })
    return (
      <div className={styles.screen}>
        <NavBar onCancel={() => navigate(-1)} onCreate={null} saving={false} />
        <div className={styles.slotUsedContainer}>
          <div className={styles.slotUsedIcon}>📅</div>
          <h2 className={styles.slotUsedTitle}>Album slot used for {monthName}</h2>
          <p className={styles.slotUsedSub}>
            You can create one album per calendar month. Your slot resets on the 1st of next month.
          </p>
          {existingAlbum && (
            <div className={styles.existingAlbum}>
              <p className={styles.existingLabel}>This month's album</p>
              <p className={styles.existingTitle}>{existingAlbum.title}</p>
              <p className={styles.existingDesc}>{existingAlbum.description}</p>
            </div>
          )}
          <button className={styles.doneBtn} onClick={() => navigate(-1)}>Got it</button>
        </div>
      </div>
    )
  }

  // ── Create form ──
  return (
    <div className={styles.screen}>
      <NavBar
        onCancel={() => navigate(-1)}
        onCreate={handleCreate}
        saving={saving}
        disabled={saving}
      />

      {/* Monthly slot banner */}
      <div className={styles.slotBanner}>
        <div className={styles.slotBadge}>1</div>
        <p className={styles.slotBannerText}>You can create 1 album this month</p>
      </div>

      <div className={styles.form}>
        {/* Title */}
        <div className={styles.field}>
          <label className={styles.label}>ALBUM TITLE</label>
          <input
            className={`${styles.input} ${errors.title ? styles.inputError : ''}`}
            placeholder="e.g. Spain Holidays 2026"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setErrors((er) => ({ ...er, title: null })) }}
            maxLength={80}
          />
          {errors.title && <p className={styles.fieldError}>{errors.title}</p>}
        </div>

        {/* Description */}
        <div className={styles.field}>
          <label className={styles.label}>THEME / DESCRIPTION</label>
          <input
            className={`${styles.input} ${errors.description ? styles.inputError : ''}`}
            placeholder="What's this album about?"
            value={description}
            onChange={(e) => { setDescription(e.target.value); setErrors((er) => ({ ...er, description: null })) }}
            maxLength={200}
          />
          {errors.description && <p className={styles.fieldError}>{errors.description}</p>}
        </div>

        {/* Max photos stepper */}
        <div className={styles.field}>
          <label className={styles.label}>MAXIMUM PHOTOS</label>
          <div className={styles.stepperRow}>
            <span className={styles.stepperValue}>{maxPhotos}</span>
            <div className={styles.stepperBtns}>
              <button
                className={styles.stepperBtn}
                onClick={decrement}
                disabled={maxPhotos <= MIN_PHOTOS}
                aria-label="Decrease"
              >−</button>
              <button
                className={styles.stepperBtn}
                onClick={increment}
                disabled={maxPhotos >= MAX_PHOTOS}
                aria-label="Increase"
              >+</button>
            </div>
          </div>
          <p className={styles.stepperHint}>Max 200. This can't be changed after creating.</p>
        </div>

        {/* Public album (locked in MVP) */}
        <div className={styles.publicRow}>
          <div className={styles.publicIcon}>◷</div>
          <div className={styles.publicText}>
            <p className={styles.publicTitle}>Public album</p>
            <p className={styles.publicSub}>Anyone can view and contribute</p>
          </div>
          <span className={styles.mvpBadge}>MVP</span>
        </div>

        {errors.submit && <p className={styles.submitError}>{errors.submit}</p>}
      </div>
    </div>
  )
}

function NavBar({ onCancel, onCreate, saving, disabled }) {
  return (
    <header className={styles.navBar}>
      <button className={styles.cancelBtn} onClick={onCancel} type="button">Cancel</button>
      <h1 className={styles.navTitle}>New Album</h1>
      <button
        className={styles.createBtn}
        onClick={onCreate}
        disabled={disabled || !onCreate}
        type="button"
      >
        {saving ? '…' : 'Create'}
      </button>
    </header>
  )
}
