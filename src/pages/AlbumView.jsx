import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import CommentSection from '../components/CommentSection'
import {
  doc, getDoc, collection, query, where,
  getDocs, setDoc, deleteDoc, updateDoc, increment, serverTimestamp,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import styles from './AlbumView.module.css'

export default function AlbumView() {
  const { albumId } = useParams()
  const navigate = useNavigate()
  const user = auth.currentUser

  const [album, setAlbum] = useState(null)
  const [posts, setPosts] = useState([])
  const [contributors, setContributors] = useState({}) // uid → profile
  const [likedPostIds, setLikedPostIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notFound, setNotFound] = useState(false)

  // Menu state
  const [showAlbumMenu, setShowAlbumMenu] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // Post options
  const [activePost, setActivePost] = useState(null) // post being actioned

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

  return (
    <div className={styles.screen}>
      {/* 2-col layout: left = album content, right = comments (desktop only) */}
      <div className={styles.layout}>
      <div className={styles.albumColumn}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>‹</button>
        {isCreator && (
          <button className={styles.menuBtn} onClick={() => setShowAlbumMenu(true)}>•••</button>
        )}
      </header>

      {/* Title + description + submit CTA */}
      <div className={styles.titleSection}>
        <div className={styles.titleRow}>
          <h1 className={styles.albumTitle}>{album.title}</h1>
          {album.status !== 'complete' && (
            <Link to={`/upload?albumId=${albumId}`} className={styles.submitBtn}>
              + Submit photo
            </Link>
          )}
          {album.status === 'complete' && (
            <span className={styles.completeTag}>Complete 🎉</span>
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

      {/* Album creator menu sheet */}
      {showAlbumMenu && (
        <BottomSheet onClose={() => setShowAlbumMenu(false)}>
          <button className={styles.sheetBtn} onClick={() => { setShowAlbumMenu(false); setShowEditModal(true) }}>
            Edit title &amp; description
          </button>
          <button className={`${styles.sheetBtn} ${styles.sheetBtnDestructive}`} onClick={() => setShowAlbumMenu(false)}>
            Delete album
          </button>
        </BottomSheet>
      )}

      {/* Post options sheet */}
      {activePost && (
        <BottomSheet onClose={() => setActivePost(null)}>
          <button className={styles.sheetBtn} onClick={() => { toggleLike(activePost); setActivePost(null) }}>
            {likedPostIds.has(activePost.id) ? 'Unlike photo' : 'Like photo'}
          </button>
          {isCreator && (
            <button className={`${styles.sheetBtn} ${styles.sheetBtnDestructive}`} onClick={() => handleDeletePost(activePost)}>
              Remove from album
            </button>
          )}
          <button className={`${styles.sheetBtn} ${styles.sheetBtnDestructive}`} onClick={() => handleReportPost(activePost)}>
            Report photo
          </button>
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
    </div>
  )
}

// ── Photo tile ──
function PhotoTile({ post, poster, isLiked, isCreator, onLike, onOptions }) {
  return (
    <div className={styles.tile}>
      {post.imageURL
        ? <img src={post.imageURL} alt={post.caption || ''} className={styles.tileImg} />
        : <div className={styles.tilePlaceholder} style={{ background: post.placeholderColor || '#e8dccb' }} />
      }
      <div className={styles.tileOverlay}>
        <button className={styles.tileMenuBtn} onClick={onOptions} aria-label="Options">···</button>
        <button
          className={`${styles.tileLikeBtn} ${isLiked ? styles.tileLikeBtnActive : ''}`}
          onClick={onLike}
          aria-label={isLiked ? 'Unlike' : 'Like'}
        >
          {isLiked ? '❤️' : '🤍'}
          {post.likeCount > 0 && <span className={styles.tileLikeCount}>{post.likeCount}</span>}
        </button>
      </div>
      {post.caption && <p className={styles.tileCaption}>{post.caption}</p>}
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
