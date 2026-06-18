import { useEffect, useRef, useState } from 'react'
import {
  collection, query, where, getDocs,
  doc, setDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import { useNavigate, Link } from 'react-router-dom'
import { uploadImage, validateImage } from '../lib/upload'
import styles from './CreateAlbum.module.css'

const MIN_PHOTOS = 10
const MAX_PHOTOS = 200
const DEFAULT_PHOTOS = 100
const STEP = 10
const MAX_STARTER_PHOTOS = 3

export default function CreateAlbum() {
  const navigate = useNavigate()
  const user = auth.currentUser
  const photoInputRef = useRef(null)

  const [slotUsed, setSlotUsed] = useState(null)
  const [existingAlbum, setExistingAlbum] = useState(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [maxPhotos, setMaxPhotos] = useState(DEFAULT_PHOTOS)
  const [photos, setPhotos] = useState([]) // [{ file, preview }]

  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  // ── Check monthly slot ──
  useEffect(() => {
    async function checkSlot() {
      try {
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
      } catch {
        setSlotUsed(false) // assume available if check fails
      }
    }
    checkSlot()
  }, [user])

  function decrement() { setMaxPhotos((v) => Math.max(MIN_PHOTOS, v - STEP)) }
  function increment() { setMaxPhotos((v) => Math.min(MAX_PHOTOS, v + STEP)) }

  function handleAddPhotos(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // allow re-selecting the same file
    for (const file of files) {
      if (photos.length >= MAX_STARTER_PHOTOS) break
      const err = validateImage(file)
      if (err) { setErrors((er) => ({ ...er, photos: err })); continue }
      setPhotos((prev) => prev.length < MAX_STARTER_PHOTOS
        ? [...prev, { file, preview: URL.createObjectURL(file) }]
        : prev)
    }
    setErrors((er) => ({ ...er, photos: null }))
  }

  function removePhoto(index) {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  function validate() {
    const e = {}
    if (!title.trim()) e.title = 'Album title is required.'
    if (!description.trim()) e.description = 'Theme / description is required.'
    if (photos.length < 1) e.photos = 'Add at least one photo to start your album.'
    return e
  }

  async function handleCreate() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    try {
      const id = `album-${user.uid}-${Date.now()}`

      // 1. Upload the starter photos
      const uploaded = []
      for (let i = 0; i < photos.length; i++) {
        const postId = `post-${id}-${i}`
        const imageURL = await uploadImage(photos[i].file, `posts/${id}/${postId}`)
        uploaded.push({ postId, imageURL })
      }

      const photoCount = uploaded.length
      const thumbnailURLs = uploaded.slice(0, 4).map((u) => u.imageURL)

      // 2. Create the album with accurate counts
      await setDoc(doc(db, 'albums', id), {
        title: title.trim(),
        description: description.trim(),
        maxPhotos,
        photoCount,
        contributorCount: 1,
        likeCount: 0,
        commentCount: 0,
        score: photoCount * 3,
        thumbnailColors: [],
        thumbnailURLs,
        status: photoCount >= maxPhotos ? 'complete' : 'open',
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      // 3. Create the post docs
      for (const u of uploaded) {
        await setDoc(doc(db, 'posts', u.postId), {
          albumId: id,
          createdBy: user.uid,
          imageURL: u.imageURL,
          placeholderColor: '#e8dccb',
          caption: '',
          likeCount: 0,
          createdAt: serverTimestamp(),
        })
      }

      navigate(`/albums/${id}`)
    } catch (err) {
      setErrors({ submit: err.message || 'Something went wrong. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  // ── Loading ──
  if (slotUsed === null) {
    return (
      <div className={styles.screen}>
        <header className={styles.header}>
          <h1 className={styles.pageTitle}>New Album</h1>
        </header>
        <p className={styles.loadingText}>Checking your album slot…</p>
      </div>
    )
  }

  // ── Slot already used ──
  if (slotUsed) {
    const monthName = new Date().toLocaleString('default', { month: 'long' })
    return (
      <div className={styles.screen}>
        <header className={styles.header}>
          <h1 className={styles.pageTitle}>New Album</h1>
        </header>
        <div className={styles.slotUsedContainer}>
          <div className={styles.slotUsedIcon}>📅</div>
          <h2 className={styles.slotUsedTitle}>Slot used for {monthName}</h2>
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
          <button className={styles.submitBtn} onClick={() => navigate(-1)}>Got it</button>
        </div>
      </div>
    )
  }

  // ── Create form ──
  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>New Album</h1>
        <p className={styles.pageSubtitle}>
          You have <strong>1 album slot</strong> this month. It resets on the 1st.
        </p>
      </header>

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
            autoFocus
          />
          {errors.title && <p className={styles.fieldError}>{errors.title}</p>}
        </div>

        {/* Description */}
        <div className={styles.field}>
          <label className={styles.label}>THEME / DESCRIPTION</label>
          <textarea
            className={`${styles.textarea} ${errors.description ? styles.inputError : ''}`}
            placeholder="What's this album about?"
            value={description}
            onChange={(e) => { setDescription(e.target.value); setErrors((er) => ({ ...er, description: null })) }}
            maxLength={200}
            rows={3}
          />
          {errors.description && <p className={styles.fieldError}>{errors.description}</p>}
        </div>

        {/* Max photos stepper */}
        <div className={styles.field}>
          <label className={styles.label}>MAXIMUM PHOTOS</label>
          <div className={styles.stepperRow}>
            <span className={styles.stepperValue}>{maxPhotos}</span>
            <div className={styles.stepperBtns}>
              <button className={styles.stepperBtn} onClick={decrement} disabled={maxPhotos <= MIN_PHOTOS} aria-label="Decrease">−</button>
              <button className={styles.stepperBtn} onClick={increment} disabled={maxPhotos >= MAX_PHOTOS} aria-label="Increase">+</button>
            </div>
          </div>
          <p className={styles.hint}>Max 200. This can't be changed after creating.</p>
        </div>

        {/* Starter photos */}
        <div className={styles.field}>
          <label className={styles.label}>PHOTOS ({photos.length}/{MAX_STARTER_PHOTOS})</label>
          <div className={styles.photoRow}>
            {photos.map((p, i) => (
              <div key={i} className={styles.photoThumb}>
                <img src={p.preview} alt="" className={styles.photoThumbImg} />
                <button type="button" className={styles.photoRemove} onClick={() => removePhoto(i)} aria-label="Remove">×</button>
              </div>
            ))}
            {photos.length < MAX_STARTER_PHOTOS && (
              <button type="button" className={styles.photoAdd} onClick={() => photoInputRef.current?.click()}>
                +
              </button>
            )}
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleAddPhotos}
          />
          <p className={styles.hint}>Add 1–3 photos to start your album. At least one is required.</p>
          {errors.photos && <p className={styles.fieldError}>{errors.photos}</p>}
        </div>

        {/* Public album row */}
        <div className={styles.publicRow}>
          <div className={styles.publicIcon}>◷</div>
          <div className={styles.publicText}>
            <p className={styles.publicTitle}>Public album</p>
            <p className={styles.publicSub}>Anyone can view and contribute</p>
          </div>
          <span className={styles.mvpBadge}>MVP</span>
        </div>

        {errors.submit && <p className={styles.submitError}>{errors.submit}</p>}

        <button className={styles.submitBtn} onClick={handleCreate} disabled={saving}>
          {saving ? 'Creating…' : 'Create album'}
        </button>

        <Link to="/" className={styles.cancelLink}>Cancel</Link>
      </div>
    </div>
  )
}
