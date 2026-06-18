import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import CommentSection from '../components/CommentSection'
import {
  doc, getDoc, collection, query, where,
  getDocs, setDoc, deleteDoc, updateDoc, increment, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import { useUser, remainingContributions } from '../context/UserContext'
import { uploadImage, validateImage, nextDailyContrib } from '../lib/upload'
import styles from './AlbumView.module.css'

export default function AlbumView() {
  const { albumId } = useParams()
  const navigate = useNavigate()
  const user = auth.currentUser
  const { profile, setProfile } = useUser()

  const [album, setAlbum] = useState(null)
  const [posts, setPosts] = useState([])
  const [contributors, setContributors] = useState({}) // uid → profile
  const [likedPostIds, setLikedPostIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notFound, setNotFound] = useState(false)

  // Upload / daily-limit state
  const [showUpload, setShowUpload] = useState(false)
  const [showLimitModal, setShowLimitModal] = useState(false)
  const uploadFileRef = useRef(null)
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadPreview, setUploadPreview] = useState(null)
  const [uploadCaption, setUploadCaption] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [uploading, setUploading] = useState(false)

  // Menu state
  const [showAlbumMenu, setShowAlbumMenu] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // Post options
  const [activePost, setActivePost] = useState(null) // post being actioned

  // Expanded photo (id of the post shown at 3x3)
  const [expandedId, setExpandedId] = useState(null)

  function toggleExpand(id) {
    const run = () => setExpandedId((prev) => (prev === id ? null : id))
    // Smooth grid reflow via the View Transitions API where supported
    if (document.startViewTransition) {
      document.startViewTransition(run)
    } else {
      run()
    }
  }

  const isCreator = album?.createdBy === user?.uid

  // ── Load ──
  useEffect(() => {
    async function load() {
      try {
        // Album
        const albumSnap = await getDoc(doc(db, 'albums', albumId))
        if (!albumSnap.exists()) { setNotFound(true); setLoading(false); return }
        const albumData = { id: albumSnap.id, ...albumSnap.data() }
        setAlbum(albumData)
        setEditTitle(albumData.title)
        setEditDesc(albumData.description)

        // Posts — filter only, no orderBy (avoids composite index requirement)
        // Sort chronologically client-side using the createdAt timestamp seconds
        const postSnap = await getDocs(
          query(collection(db, 'posts'), where('albumId', '==', albumId))
        )
        const postList = postSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
        setPosts(postList)

        // Contributor profiles (unique posters)
        const uids = [...new Set(postList.map((p) => p.createdBy).filter(Boolean))]
        if (uids.length > 0) {
          const userDocs = await Promise.all(uids.map((uid) => getDoc(doc(db, 'users', uid))))
          const map = {}
          userDocs.forEach((s) => { if (s.exists()) map[s.id] = s.data() })
          setContributors(map)
        }

        // Which posts has the current user liked? — single field filter, no index needed
        const likeSnap = await getDocs(
          query(collection(db, 'likes'), where('userId', '==', user.uid))
        )
        const likedInThisAlbum = likeSnap.docs
          .filter((d) => d.data().albumId === albumId)
          .map((d) => d.data().postId)
        setLikedPostIds(new Set(likedInThisAlbum))

      } catch (err) {
        console.error('AlbumView load error:', err)
        setLoadError(`Failed to load album: ${err.code || err.message}`)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [albumId, user])

  // ── Like toggle ──
  const toggleLike = useCallback(async (post) => {
    const likeId = `${post.id}__${user.uid}`
    const isLiked = likedPostIds.has(post.id)

    // Optimistic
    setLikedPostIds((prev) => {
      const next = new Set(prev)
      isLiked ? next.delete(post.id) : next.add(post.id)
      return next
    })
    setPosts((prev) => prev.map((p) => p.id === post.id
      ? { ...p, likeCount: (p.likeCount || 0) + (isLiked ? -1 : 1) }
      : p
    ))

    try {
      if (isLiked) {
        await deleteDoc(doc(db, 'likes', likeId))
        await updateDoc(doc(db, 'posts', post.id), { likeCount: increment(-1) })
      } else {
        await setDoc(doc(db, 'likes', likeId), {
          postId: post.id,
          userId: user.uid,
          albumId,
          createdAt: serverTimestamp(),
        })
        await updateDoc(doc(db, 'posts', post.id), { likeCount: increment(1) })
      }
    } catch {
      // Revert
      setLikedPostIds((prev) => {
        const next = new Set(prev)
        isLiked ? next.add(post.id) : next.delete(post.id)
        return next
      })
      setPosts((prev) => prev.map((p) => p.id === post.id
        ? { ...p, likeCount: (p.likeCount || 0) + (isLiked ? 1 : -1) }
        : p
      ))
    }
  }, [likedPostIds, user, albumId])

  // ── Delete post ──
  async function handleDeletePost(post) {
    if (!window.confirm('Remove this photo from the album?')) return
    setActivePost(null)
    setPosts((prev) => prev.filter((p) => p.id !== post.id))
    try {
      await deleteDoc(doc(db, 'posts', post.id))
      await updateDoc(doc(db, 'albums', albumId), {
        photoCount: increment(-1),
        updatedAt: serverTimestamp(),
      })
      setAlbum((a) => ({ ...a, photoCount: Math.max(0, (a.photoCount || 1) - 1) }))
    } catch {
      // Revert
      setPosts((prev) => [...prev, post].sort((a, b) => a.createdAt?.seconds - b.createdAt?.seconds))
    }
  }

  // ── Report post ──
  async function handleReportPost(post) {
    setActivePost(null)
    await setDoc(doc(db, 'reports', `${post.id}__${user.uid}`), {
      postId: post.id,
      albumId,
      reportedBy: user.uid,
      createdAt: serverTimestamp(),
    })
    alert('Report submitted. Thank you.')
  }

  // ── Contribute photo ──
  function openUpload() {
    setUploadError('')
    setUploadFile(null)
    setUploadPreview(null)
    setUploadCaption('')
    setShowUpload(true)
  }

  function handleUploadFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const err = validateImage(file)
    if (err) { setUploadError(err); return }
    setUploadError('')
    setUploadFile(file)
    setUploadPreview(URL.createObjectURL(file))
  }

  async function submitUpload() {
    if (!uploadFile || uploading) return
    // Re-check the limit at submit time using the live profile
    if (remainingContributions(profile) <= 0) {
      setShowUpload(false)
      setShowLimitModal(true)
      return
    }
    setUploading(true)
    setUploadError('')
    try {
      const postId = `post-${albumId}-${user.uid}-${Date.now()}`
      const imageURL = await uploadImage(uploadFile, `posts/${albumId}/${postId}`)

      // Album counter update
      const albumUpdate = {
        photoCount: increment(1),
        score: increment(3),
        updatedAt: serverTimestamp(),
      }
      const currentThumbs = album.thumbnailURLs || []
      if (currentThumbs.length < 4) {
        albumUpdate.thumbnailURLs = [...currentThumbs, imageURL]
      }
      // Auto-lock when the album reaches capacity (ALBUM-03)
      const willBeComplete = (album.photoCount || 0) + 1 >= album.maxPhotos
      if (willBeComplete) albumUpdate.status = 'complete'

      // The daily counter and the post MUST be written in the same atomic batch
      // so the security rules' getAfter() can verify the increment is within limit.
      const dc = nextDailyContrib(profile)
      const batch = writeBatch(db)
      batch.set(doc(db, 'posts', postId), {
        albumId,
        createdBy: user.uid,
        imageURL,
        placeholderColor: '#e8dccb',
        caption: uploadCaption.trim(),
        likeCount: 0,
        createdAt: serverTimestamp(),
      })
      batch.update(doc(db, 'albums', albumId), albumUpdate)
      batch.set(doc(db, 'users', user.uid), { dailyContrib: dc }, { merge: true })
      await batch.commit()

      setProfile((p) => ({ ...(p || {}), dailyContrib: dc }))

      // 4. Reflect locally
      const newPost = {
        id: postId, albumId, createdBy: user.uid, imageURL,
        placeholderColor: '#e8dccb', caption: uploadCaption.trim(),
        likeCount: 0, createdAt: { seconds: Math.floor(Date.now() / 1000) },
      }
      setPosts((prev) => [...prev, newPost])
      setAlbum((a) => ({
        ...a,
        photoCount: (a.photoCount || 0) + 1,
        thumbnailURLs: currentThumbs.length < 4 ? [...currentThumbs, imageURL] : currentThumbs,
        status: willBeComplete ? 'complete' : a.status,
      }))
      if (!contributors[user.uid] && profile) {
        setContributors((m) => ({ ...m, [user.uid]: profile }))
      }
      setShowUpload(false)
    } catch (err) {
      setUploadError(err.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  // ── Report album ──
  async function handleReportAlbum() {
    setShowAlbumMenu(false)
    await setDoc(doc(db, 'reports', `album-${albumId}__${user.uid}`), {
      albumId,
      reportedBy: user.uid,
      type: 'album',
      createdAt: serverTimestamp(),
    })
    alert('Report submitted. Thank you.')
  }

  // ── Edit album ──
  async function handleSaveEdit(e) {
    e.preventDefault()
    if (!editTitle.trim()) return
    setEditSaving(true)
    try {
      await updateDoc(doc(db, 'albums', albumId), {
        title: editTitle.trim(),
        description: editDesc.trim(),
        updatedAt: serverTimestamp(),
      })
      setAlbum((a) => ({ ...a, title: editTitle.trim(), description: editDesc.trim() }))
      setShowEditModal(false)
    } finally {
      setEditSaving(false)
    }
  }

  if (loading) return <div className={styles.screen}><p className={styles.loading}>Loading…</p></div>
  if (loadError) return (
    <div className={styles.screen}>
      <button className={styles.backBtn} onClick={() => navigate(-1)} style={{ margin: '56px 20px 0' }}>‹</button>
      <p className={styles.loading} style={{ color: '#e53935' }}>{loadError}</p>
    </div>
  )
  if (notFound) return (
    <div className={styles.screen}>
      <button className={styles.backBtn} onClick={() => navigate(-1)}>‹ Back</button>
      <p className={styles.loading}>Album not found.</p>
    </div>
  )

  const remaining = album.maxPhotos - (album.photoCount || 0)
  const progress = album.maxPhotos > 0 ? Math.min((album.photoCount || 0) / album.maxPhotos, 1) : 0
  const contributorList = Object.values(contributors).slice(0, 5)
  const dailyRemaining = remainingContributions(profile)
  const atDailyLimit = dailyRemaining <= 0

  return (
    <div className={styles.screen}>
      {/* 2-col layout: left = album content, right = comments (desktop only) */}
      <div className={styles.layout}>
      <div className={styles.albumColumn}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>‹</button>
        <button className={styles.menuBtn} onClick={() => setShowAlbumMenu(true)}>•••</button>
      </header>

      {/* Title + description + submit CTA */}
      <div className={styles.titleSection}>
        <div className={styles.titleRow}>
          <h1 className={styles.albumTitle}>{album.title}</h1>
          {album.status === 'complete' ? (
            <span className={styles.completeTag}>Complete 🎉</span>
          ) : (
            // Owner does not see the submit button (they add photos at creation)
            !isCreator && (
              <button
                className={`${styles.submitBtn} ${atDailyLimit ? styles.submitBtnDisabled : ''}`}
                onClick={() => (atDailyLimit ? setShowLimitModal(true) : openUpload())}
              >
                + Submit photo
              </button>
            )
          )}
        </div>
        <p className={styles.albumDesc}>{album.description}</p>
      </div>

      {/* Stats card */}
      <div className={styles.statsCard}>
        <div className={styles.statsRow}>
          <span className={styles.photoCount}>{album.photoCount} of {album.maxPhotos} photos</span>
          <span className={styles.remaining}>{remaining} left</span>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progress * 100}%` }} />
        </div>
        <div className={styles.contributorRow}>
          <div className={styles.avatarStack}>
            {contributorList.map((c, i) => (
              <div
                key={i}
                className={styles.stackAvatar}
                style={{ background: c.avatarColor || '#b9b9c0', marginLeft: i > 0 ? -8 : 0, zIndex: contributorList.length - i }}
              >
                {c.avatarURL
                  ? <img src={c.avatarURL} alt="" className={styles.stackAvatarImg} />
                  : (c.displayName?.[0] || '?')
                }
              </div>
            ))}
          </div>
          <span className={styles.contributorCount}>{album.contributorCount} contributor{album.contributorCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Photo grid */}
      <div className={styles.grid}>
        {posts.length === 0 && (
          <p className={styles.emptyGrid}>No photos yet — be the first to add one!</p>
        )}
        {posts.map((post) => (
          <PhotoTile
            key={post.id}
            post={post}
            poster={contributors[post.createdBy]}
            isLiked={likedPostIds.has(post.id)}
            isCreator={isCreator}
            expanded={expandedId === post.id}
            onToggleExpand={() => toggleExpand(post.id)}
            onLike={() => toggleLike(post)}
            onOptions={() => setActivePost(post)}
          />
        ))}
      </div>


      </div>{/* end albumColumn */}

      {/* Comment panel — right on desktop, below on mobile/tablet */}
      <div className={styles.commentColumn}>
        <CommentSection albumId={albumId} isAlbumCreator={isCreator} />
      </div>

      </div>{/* end layout */}

      {/* Album menu sheet — owner sees manage actions, others see report */}
      {showAlbumMenu && (
        <BottomSheet onClose={() => setShowAlbumMenu(false)}>
          {isCreator ? (
            <>
              <button className={styles.sheetBtn} onClick={() => { setShowAlbumMenu(false); setShowEditModal(true) }}>
                Edit title &amp; description
              </button>
              <button className={`${styles.sheetBtn} ${styles.sheetBtnDestructive}`} onClick={() => setShowAlbumMenu(false)}>
                Delete album
              </button>
            </>
          ) : (
            <button className={`${styles.sheetBtn} ${styles.sheetBtnDestructive}`} onClick={handleReportAlbum}>
              Report album
            </button>
          )}
        </BottomSheet>
      )}

      {/* Post options sheet */}
      {activePost && (
        <BottomSheet onClose={() => setActivePost(null)}>
          <button className={styles.sheetBtn} onClick={() => { toggleLike(activePost); setActivePost(null) }}>
            {likedPostIds.has(activePost.id) ? 'Unlike photo' : 'Like photo'}
          </button>
          {(isCreator || activePost.createdBy === user.uid) && (
            <button className={`${styles.sheetBtn} ${styles.sheetBtnDestructive}`} onClick={() => handleDeletePost(activePost)}>
              {activePost.createdBy === user.uid && !isCreator ? 'Remove my photo' : 'Remove from album'}
            </button>
          )}
          {activePost.createdBy !== user.uid && (
            <button className={`${styles.sheetBtn} ${styles.sheetBtnDestructive}`} onClick={() => handleReportPost(activePost)}>
              Report photo
            </button>
          )}
        </BottomSheet>
      )}

      {/* Edit modal */}
      {showEditModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Edit album</h2>
            <form onSubmit={handleSaveEdit} className={styles.modalForm}>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>Title</label>
                <input
                  className={styles.modalInput}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={80}
                  required
                />
              </div>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>Description</label>
                <textarea
                  className={styles.modalTextarea}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  maxLength={200}
                  rows={3}
                />
              </div>
              <button className={styles.modalSaveBtn} type="submit" disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" className={styles.modalCancelBtn} onClick={() => setShowEditModal(false)}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Upload photo modal */}
      {showUpload && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Submit a photo</h2>

            <div className={styles.modalForm}>
              <p className={styles.uploadHint}>
                {dailyRemaining} of 3 daily contribution{dailyRemaining === 1 ? '' : 's'} left
              </p>

              <button
                type="button"
                className={styles.uploadDrop}
                onClick={() => uploadFileRef.current?.click()}
              >
                {uploadPreview
                  ? <img src={uploadPreview} alt="Preview" className={styles.uploadPreview} />
                  : <span className={styles.uploadDropText}>+ Choose a photo</span>}
              </button>
              <input
                ref={uploadFileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleUploadFile}
              />

              <textarea
                className={styles.modalTextarea}
                placeholder="Add a caption… (optional)"
                value={uploadCaption}
                onChange={(e) => setUploadCaption(e.target.value)}
                maxLength={200}
                rows={2}
              />

              {uploadError && <p className={styles.uploadError}>{uploadError}</p>}

              <button className={styles.modalSaveBtn} onClick={submitUpload} disabled={!uploadFile || uploading}>
                {uploading ? 'Uploading…' : 'Share photo'}
              </button>
              <button type="button" className={styles.modalCancelBtn} onClick={() => setShowUpload(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Daily limit modal */}
      {showLimitModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.limitIcon}>📸</div>
            <h2 className={styles.modalTitle}>Daily limit reached</h2>
            <p className={styles.limitText}>Come back tomorrow to share more.</p>
            <button className={styles.modalSaveBtn} onClick={() => setShowLimitModal(false)}>
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Photo tile ──
function PhotoTile({ post, poster, isLiked, isCreator, expanded, onToggleExpand, onLike, onOptions }) {
  const initials = poster?.displayName
    ? poster.displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <div
      className={`${styles.tile} ${expanded ? styles.tileExpanded : ''}`}
      style={{ viewTransitionName: `tile-${post.id}` }}
      onClick={onToggleExpand}
    >
      <div className={styles.tileImageWrap}>
        {post.imageURL
          ? <img src={post.imageURL} alt={post.caption || ''} className={styles.tileImg} />
          : <div className={styles.tilePlaceholder} style={{ background: post.placeholderColor || '#e8dccb' }} />
        }

        {/* Contributor details + actions overlaid on the bottom when expanded */}
        {expanded && (
          <div className={styles.tileDetails}>
            <div className={styles.detailsInfo}>
              <Link
                to={post.createdBy === auth.currentUser?.uid ? '/profile' : `/users/${post.createdBy}`}
                className={styles.detailsUser}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.detailsAvatar} style={{ background: poster?.avatarColor || '#b9b9c0' }}>
                  {poster?.avatarURL
                    ? <img src={poster.avatarURL} alt="" className={styles.detailsAvatarImg} />
                    : initials}
                </div>
                <span className={styles.detailsUsername}>@{poster?.username || 'unknown'}</span>
              </Link>
              {post.caption && <p className={styles.detailsCaption}>{post.caption}</p>}
            </div>

            <div className={styles.detailsActions}>
              <button
                className={`${styles.tileLikeBtn} ${isLiked ? styles.tileLikeBtnActive : ''}`}
                onClick={(e) => { e.stopPropagation(); onLike() }}
                aria-label={isLiked ? 'Unlike' : 'Like'}
              >
                {isLiked ? '❤️' : '🤍'}
                {post.likeCount > 0 && <span className={styles.tileLikeCount}>{post.likeCount}</span>}
              </button>
              <button
                className={styles.tileMenuBtn}
                onClick={(e) => { e.stopPropagation(); onOptions() }}
                aria-label="Options"
              >···</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Bottom sheet ──
function BottomSheet({ children, onClose }) {
  return (
    <div className={styles.sheetOverlay} onClick={onClose}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.sheetHandle} />
        {children}
        <button className={`${styles.sheetBtn} ${styles.sheetBtnCancel}`} onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
