import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  collection, query, where, getDocs,
  doc, setDoc, deleteDoc, updateDoc, increment, serverTimestamp, getDoc,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import styles from './CommentSection.module.css'

function timeAgo(ts) {
  if (!ts?.seconds) return ''
  const secs = Math.floor(Date.now() / 1000 - ts.seconds)
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`
  return `${Math.floor(secs / 86400)}d`
}

export default function CommentSection({ albumId, isAlbumCreator }) {
  const user = auth.currentUser

  const [topLevel, setTopLevel]       = useState([])   // top-level comments
  const [repliesMap, setRepliesMap]   = useState({})   // parentId → reply[]
  const [commentUsers, setCommentUsers] = useState({}) // uid → profile
  const [likedIds, setLikedIds]       = useState(new Set())
  const [loading, setLoading]         = useState(true)

  // Compose state
  const [newText, setNewText]         = useState('')
  const [replyTo, setReplyTo]         = useState(null) // commentId being replied to
  const [replyText, setReplyText]     = useState('')
  const [submitting, setSubmitting]   = useState(false)

  const bottomRef = useRef(null)
  const replyInputRef = useRef(null)

  // ── Load ──
  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(
          query(collection(db, 'comments'), where('albumId', '==', albumId))
        )
        const all = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))

        setTopLevel(all.filter((c) => !c.parentId))
        const rm = {}
        all.filter((c) => c.parentId).forEach((r) => {
          rm[r.parentId] = [...(rm[r.parentId] || []), r]
        })
        setRepliesMap(rm)

        // Fetch user profiles for all commenters
        const uids = [...new Set(all.map((c) => c.createdBy).filter(Boolean))]
        if (uids.length > 0) {
          const userDocs = await Promise.all(uids.map((uid) => getDoc(doc(db, 'users', uid))))
          const map = {}
          userDocs.forEach((s) => { if (s.exists()) map[s.id] = s.data() })
          setCommentUsers(map)
        }

        // Which comments has current user liked?
        const likeSnap = await getDocs(
          query(collection(db, 'commentLikes'), where('userId', '==', user.uid))
        )
        setLikedIds(new Set(
          likeSnap.docs
            .filter((d) => d.data().albumId === albumId)
            .map((d) => d.data().commentId)
        ))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [albumId, user])

  // Focus reply input when replyTo changes
  useEffect(() => {
    if (replyTo) replyInputRef.current?.focus()
  }, [replyTo])

  // ── Add comment ──
  async function submitComment(text, parentId = null) {
    const trimmed = text.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    try {
      const id = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const newComment = {
        id,
        albumId,
        parentId: parentId || null,
        text: trimmed,
        createdBy: user.uid,
        likeCount: 0,
        createdAt: { seconds: Math.floor(Date.now() / 1000) }, // optimistic
      }
      await setDoc(doc(db, 'comments', id), {
        albumId,
        parentId: parentId || null,
        text: trimmed,
        createdBy: user.uid,
        likeCount: 0,
        createdAt: serverTimestamp(),
      })

      // Ensure current user's profile is in the map
      if (!commentUsers[user.uid]) {
        const snap = await getDoc(doc(db, 'users', user.uid))
        if (snap.exists()) setCommentUsers((m) => ({ ...m, [user.uid]: snap.data() }))
      }

      if (!parentId) {
        setTopLevel((prev) => [...prev, newComment])
        setNewText('')
      } else {
        setRepliesMap((prev) => ({
          ...prev,
          [parentId]: [...(prev[parentId] || []), newComment],
        }))
        setReplyText('')
        setReplyTo(null)
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ── Delete comment ──
  async function deleteComment(comment) {
    // Delete the comment
    await deleteDoc(doc(db, 'comments', comment.id))
    if (!comment.parentId) {
      // Also delete all replies
      setTopLevel((prev) => prev.filter((c) => c.id !== comment.id))
      setRepliesMap((prev) => { const next = { ...prev }; delete next[comment.id]; return next })
      // Delete replies from Firestore (fire-and-forget)
      getDocs(query(collection(db, 'comments'), where('parentId', '==', comment.id)))
        .then((snap) => Promise.all(snap.docs.map((d) => deleteDoc(d.ref))))
    } else {
      setRepliesMap((prev) => ({
        ...prev,
        [comment.parentId]: (prev[comment.parentId] || []).filter((r) => r.id !== comment.id),
      }))
    }
  }

  // ── Like comment ──
  const toggleLike = useCallback(async (comment) => {
    const likeId = `${comment.id}__${user.uid}`
    const isLiked = likedIds.has(comment.id)
    const delta = isLiked ? -1 : 1

    // Optimistic
    setLikedIds((prev) => {
      const next = new Set(prev)
      isLiked ? next.delete(comment.id) : next.add(comment.id)
      return next
    })
    const updateCount = (list) => list.map((c) =>
      c.id === comment.id ? { ...c, likeCount: (c.likeCount || 0) + delta } : c
    )
    if (!comment.parentId) {
      setTopLevel((prev) => updateCount(prev))
    } else {
      setRepliesMap((prev) => ({
        ...prev,
        [comment.parentId]: updateCount(prev[comment.parentId] || []),
      }))
    }

    try {
      if (isLiked) {
        await deleteDoc(doc(db, 'commentLikes', likeId))
        await updateDoc(doc(db, 'comments', comment.id), { likeCount: increment(-1) })
      } else {
        await setDoc(doc(db, 'commentLikes', likeId), {
          commentId: comment.id,
          userId: user.uid,
          albumId,
          createdAt: serverTimestamp(),
        })
        await updateDoc(doc(db, 'comments', comment.id), { likeCount: increment(1) })
      }
    } catch {
      // Revert
      setLikedIds((prev) => {
        const next = new Set(prev)
        isLiked ? next.add(comment.id) : next.delete(comment.id)
        return next
      })
      const revert = (list) => list.map((c) =>
        c.id === comment.id ? { ...c, likeCount: (c.likeCount || 0) - delta } : c
      )
      if (!comment.parentId) setTopLevel((prev) => revert(prev))
      else setRepliesMap((prev) => ({ ...prev, [comment.parentId]: revert(prev[comment.parentId] || []) }))
    }
  }, [likedIds, user, albumId])

  const totalCount = topLevel.length + Object.values(repliesMap).reduce((s, r) => s + r.length, 0)

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>
        Comments {totalCount > 0 && <span className={styles.count}>{totalCount}</span>}
      </h2>

      {/* New comment input */}
      <div className={styles.composeRow}>
        <UserAvatar uid={user.uid} profile={commentUsers[user.uid]} size={32} />
        <div className={styles.composeBox}>
          <textarea
            className={styles.composeInput}
            placeholder="Add a comment…"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(newText) } }}
            rows={1}
            maxLength={500}
          />
          {newText.trim() && (
            <button
              className={styles.postBtn}
              onClick={() => submitComment(newText)}
              disabled={submitting}
            >
              {submitting ? '…' : 'Post'}
            </button>
          )}
        </div>
      </div>

      {/* Comment list */}
      {loading && <p className={styles.empty}>Loading comments…</p>}
      {!loading && topLevel.length === 0 && (
        <p className={styles.empty}>No comments yet. Be the first!</p>
      )}

      <div className={styles.list}>
        {topLevel.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            profile={commentUsers[comment.createdBy]}
            isLiked={likedIds.has(comment.id)}
            canDelete={isAlbumCreator || comment.createdBy === user.uid}
            onLike={() => toggleLike(comment)}
            onDelete={() => deleteComment(comment)}
            onReply={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
            isReplying={replyTo === comment.id}
          >
            {/* Replies */}
            {(repliesMap[comment.id] || []).map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                profile={commentUsers[reply.createdBy]}
                isLiked={likedIds.has(reply.id)}
                canDelete={isAlbumCreator || reply.createdBy === user.uid}
                onLike={() => toggleLike(reply)}
                onDelete={() => deleteComment(reply)}
                isReply
              />
            ))}

            {/* Reply compose */}
            {replyTo === comment.id && (
              <div className={styles.replyCompose}>
                <UserAvatar uid={user.uid} profile={commentUsers[user.uid]} size={24} />
                <div className={styles.composeBox}>
                  <textarea
                    ref={replyInputRef}
                    className={styles.composeInput}
                    placeholder={`Reply to @${commentUsers[comment.createdBy]?.username || 'user'}…`}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(replyText, comment.id) } }}
                    rows={1}
                    maxLength={500}
                  />
                  <div className={styles.replyBtns}>
                    <button className={styles.cancelReplyBtn} onClick={() => { setReplyTo(null); setReplyText('') }}>Cancel</button>
                    {replyText.trim() && (
                      <button className={styles.postBtn} onClick={() => submitComment(replyText, comment.id)} disabled={submitting}>
                        {submitting ? '…' : 'Reply'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CommentItem>
        ))}
      </div>

      <div ref={bottomRef} />
    </section>
  )
}

// ── Comment item ──
function CommentItem({ comment, profile, isLiked, canDelete, onLike, onDelete, onReply, isReplying, isReply, children }) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const initials = profile?.displayName
    ? profile.displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <div className={`${styles.comment} ${isReply ? styles.commentReply : ''}`}>
      <UserAvatar uid={comment.createdBy} profile={profile} size={isReply ? 24 : 32} />
      <div className={styles.commentBody}>
        <div className={styles.commentMeta}>
          <Link
            to={comment.createdBy === auth.currentUser?.uid ? '/profile' : `/users/${comment.createdBy}`}
            className={styles.commentAuthor}
          >
            {profile?.username ? `@${profile.username}` : profile?.displayName || 'Unknown'}
          </Link>
          <span className={styles.commentTime}>{timeAgo(comment.createdAt)}</span>
        </div>

        <p className={styles.commentText}>{comment.text}</p>

        <div className={styles.commentActions}>
          <button
            className={`${styles.actionBtn} ${isLiked ? styles.actionBtnLiked : ''}`}
            onClick={onLike}
          >
            {isLiked ? '❤️' : '🤍'} {comment.likeCount > 0 ? comment.likeCount : ''}
          </button>

          {!isReply && onReply && (
            <button className={`${styles.actionBtn} ${isReplying ? styles.actionBtnActive : ''}`} onClick={onReply}>
              Reply
            </button>
          )}

          {canDelete && !confirmDelete && (
            <button className={`${styles.actionBtn} ${styles.actionBtnDelete}`} onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
          {canDelete && confirmDelete && (
            <>
              <button className={`${styles.actionBtn} ${styles.actionBtnDeleteConfirm}`} onClick={() => { onDelete(); setConfirmDelete(false) }}>
                Confirm delete
              </button>
              <button className={styles.actionBtn} onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </>
          )}
        </div>

        {children}
      </div>
    </div>
  )
}

// ── Avatar helper ──
function UserAvatar({ profile, size }) {
  const initials = profile?.displayName
    ? profile.displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <div
      className={styles.avatar}
      style={{
        width: size,
        height: size,
        background: profile?.avatarColor || '#b9b9c0',
        fontSize: size < 30 ? 9 : 11,
        flexShrink: 0,
      }}
    >
      {profile?.avatarURL
        ? <img src={profile.avatarURL} alt="" className={styles.avatarImg} />
        : initials
      }
    </div>
  )
}
