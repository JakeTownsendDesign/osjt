import { useEffect, useState, useCallback } from 'react'
import {
  collection, query, where, getDocs, doc, getDoc,
  setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useUser } from '../context/UserContext'
import { useNavigate, Link } from 'react-router-dom'
import styles from './Home.module.css'

// Firestore `in` queries accept at most 10 values — split larger lists.
function chunk(arr, size = 10) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function initialsOf(name) {
  return name ? name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) : '?'
}

function timeAgo(seconds) {
  if (!seconds) return ''
  const diff = Date.now() / 1000 - seconds
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return `${Math.floor(diff / 604800)}w ago`
}

export default function Home() {
  const navigate = useNavigate()
  const { user, profile } = useUser()
  const uid = user?.uid

  const [events, setEvents] = useState([])
  const [usersById, setUsersById] = useState({})
  const [albumsById, setAlbumsById] = useState({})
  const [following, setFollowing] = useState(new Set()) // uids the current user follows
  const [toggling, setToggling] = useState(new Set())   // uids with an in-flight follow toggle
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!uid) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      try {
        // 1. Who do I follow?
        const followSnap = await getDocs(
          query(collection(db, 'follows'), where('followerId', '==', uid))
        )
        const followeeIds = followSnap.docs.map((d) => d.data().followeeId)
        if (!cancelled) setFollowing(new Set(followeeIds))

        if (followeeIds.length === 0) {
          if (!cancelled) { setEvents([]); setLoading(false) }
          return
        }

        // 2. Albums owned by people I follow → "new album" events + the set of
        //    albums whose posts/comments are worth surfacing.
        const albumSnaps = await Promise.all(
          chunk(followeeIds).map((c) =>
            getDocs(query(collection(db, 'albums'), where('createdBy', 'in', c)))
          )
        )
        const albums = albumSnaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })))
        const albumsMap = Object.fromEntries(albums.map((a) => [a.id, a]))
        const albumIds = albums.map((a) => a.id)

        // 3 + 4. Posts and comments on those albums, fetched in parallel.
        const [postSnaps, commentSnaps] = await Promise.all([
          Promise.all(chunk(albumIds).map((c) =>
            getDocs(query(collection(db, 'posts'), where('albumId', 'in', c))))),
          Promise.all(chunk(albumIds).map((c) =>
            getDocs(query(collection(db, 'comments'), where('albumId', 'in', c))))),
        ])
        const posts = postSnaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })))
        const comments = commentSnaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })))

        // 5. Merge into a single timeline. Skip the current user's own posts and
        //    comments — the feed is about the people in their network.
        const evs = []
        for (const a of albums) {
          evs.push({ key: `album-${a.id}`, type: 'album', actor: a.createdBy, albumId: a.id, seconds: a.createdAt?.seconds ?? 0 })
        }
        for (const p of posts) {
          if (p.createdBy === uid) continue
          evs.push({ key: `post-${p.id}`, type: 'post', actor: p.createdBy, albumId: p.albumId, post: p, seconds: p.createdAt?.seconds ?? 0 })
        }
        for (const c of comments) {
          if (c.createdBy === uid) continue
          evs.push({ key: `comment-${c.id}`, type: 'comment', actor: c.createdBy, albumId: c.albumId, comment: c, seconds: c.createdAt?.seconds ?? 0 })
        }
        evs.sort((a, b) => b.seconds - a.seconds)
        const trimmed = evs.slice(0, 40)

        // 6. Batch-fetch the profile of every actor we're about to render.
        const uids = [...new Set(trimmed.map((e) => e.actor).filter(Boolean))]
        const userDocs = await Promise.all(uids.map((u) => getDoc(doc(db, 'users', u))))
        const uMap = {}
        userDocs.forEach((s) => { if (s.exists()) uMap[s.id] = { id: s.id, ...s.data() } })

        if (!cancelled) {
          setAlbumsById(albumsMap)
          setUsersById(uMap)
          setEvents(trimmed)
        }
      } catch {
        if (!cancelled) setError('Could not load your feed. Please try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [uid])

  const toggleFollow = useCallback(async (targetUid) => {
    if (!uid || targetUid === uid || toggling.has(targetUid)) return
    setToggling((s) => new Set([...s, targetUid]))

    const followId = `${uid}__${targetUid}`
    const isFollowing = following.has(targetUid)

    // Optimistic update
    setFollowing((prev) => {
      const next = new Set(prev)
      isFollowing ? next.delete(targetUid) : next.add(targetUid)
      return next
    })

    try {
      if (isFollowing) {
        await deleteDoc(doc(db, 'follows', followId))
      } else {
        await setDoc(doc(db, 'follows', followId), {
          followerId: uid,
          followeeId: targetUid,
          createdAt: serverTimestamp(),
        })
      }
    } catch {
      // Revert on error
      setFollowing((prev) => {
        const next = new Set(prev)
        isFollowing ? next.add(targetUid) : next.delete(targetUid)
        return next
      })
    } finally {
      setToggling((s) => { const n = new Set(s); n.delete(targetUid); return n })
    }
  }, [uid, following, toggling])

  const initials = initialsOf(profile?.displayName || user?.displayName)

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.appTitle}>Daily Album</h1>
        <button className={styles.avatar} onClick={() => navigate('/profile')} aria-label="Profile">
          {profile?.avatarURL
            ? <img src={profile.avatarURL} alt="" className={styles.avatarImg} />
            : initials}
        </button>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Your feed</h2>

        {loading && <p className={styles.loadingText}>Loading your feed…</p>}

        {!loading && error && <p className={styles.emptyText}>{error}</p>}

        {!loading && !error && following.size === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Your feed is empty</p>
            <p className={styles.emptyText}>
              Follow people to see new albums, photos and comments from your network.{' '}
              <Link to="/explore" className={styles.exploreLink}>Find people to follow →</Link>
            </p>
          </div>
        )}

        {!loading && !error && following.size > 0 && events.length === 0 && (
          <p className={styles.emptyText}>
            No recent activity from the people you follow yet.
          </p>
        )}

        <div className={styles.feed}>
          {events.map((ev) => (
            <FeedItem
              key={ev.key}
              event={ev}
              actor={usersById[ev.actor]}
              album={albumsById[ev.albumId]}
              isSelf={ev.actor === uid}
              isFollowing={following.has(ev.actor)}
              isToggling={toggling.has(ev.actor)}
              onToggleFollow={() => toggleFollow(ev.actor)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

// ─── Feed item ──────────────────────────────────────────────────────────────

function FeedItem({ event, actor, album, isSelf, isFollowing, isToggling, onToggleFollow }) {
  const profilePath = isSelf ? '/profile' : `/users/${event.actor}`
  const username = actor?.username || 'someone'
  // Follow affordance only on the poster / commenter, and only when relevant.
  const showFollow = !isSelf && !isFollowing && (event.type === 'post' || event.type === 'comment')

  const verb = event.type === 'album'
    ? 'created a new album'
    : event.type === 'post'
      ? 'added a photo'
      : 'left a comment'

  return (
    <article className={styles.feedItem}>
      <div className={styles.itemHeader}>
        <Link to={profilePath} className={styles.actorLink}>
          <div className={styles.actorAvatar} style={{ background: actor?.avatarColor || '#b9b9c0' }}>
            {actor?.avatarURL
              ? <img src={actor.avatarURL} alt="" className={styles.actorAvatarImg} />
              : initialsOf(actor?.displayName)}
          </div>
        </Link>
        <div className={styles.itemHeaderText}>
          <p className={styles.itemAction}>
            <Link to={profilePath} className={styles.actorName}>@{username}</Link>{' '}
            <span className={styles.actionVerb}>{verb}</span>
          </p>
          <span className={styles.itemTime}>{timeAgo(event.seconds)}</span>
        </div>
        {showFollow && (
          <button
            className={styles.followBtn}
            onClick={onToggleFollow}
            disabled={isToggling}
          >
            {isToggling ? '…' : 'Follow'}
          </button>
        )}
      </div>

      {event.type === 'album' && album && <AlbumBody album={album} />}
      {event.type === 'post' && <PostBody album={album} post={event.post} />}
      {event.type === 'comment' && <CommentBody album={album} comment={event.comment} />}
    </article>
  )
}

function AlbumBody({ album }) {
  const colors = album.thumbnailColors?.length >= 4
    ? album.thumbnailColors
    : ['#e8dccb', '#d9c7b0', '#cbb89e', '#e2d2bc']
  const urls = album.thumbnailURLs || []

  return (
    <Link to={`/albums/${album.id}`} className={styles.albumBody}>
      <div className={styles.thumbnailRow}>
        {colors.slice(0, 4).map((c, i) => (
          <div key={i} className={styles.thumbnail} style={{ background: c }}>
            {urls[i] && <img src={urls[i]} alt="" className={styles.thumbnailImg} />}
          </div>
        ))}
      </div>
      <div className={styles.albumInfo}>
        <p className={styles.albumTitle}>{album.title}</p>
        {album.description && <p className={styles.albumDesc}>{album.description}</p>}
      </div>
    </Link>
  )
}

function PostBody({ album, post }) {
  return (
    <Link to={album ? `/albums/${album.id}` : '#'} className={styles.postBody}>
      <div className={styles.postImageWrap} style={{ background: post.placeholderColor || '#e8dccb' }}>
        {post.imageURL && <img src={post.imageURL} alt="" className={styles.postImage} />}
      </div>
      <div className={styles.albumInfo}>
        {post.caption && <p className={styles.postCaption}>{post.caption}</p>}
        {album && <p className={styles.contextLine}>in {album.title}</p>}
      </div>
    </Link>
  )
}

function CommentBody({ album, comment }) {
  return (
    <Link to={album ? `/albums/${album.id}` : '#'} className={styles.commentBody}>
      <p className={styles.commentText}>“{comment.text}”</p>
      {album && <p className={styles.contextLine}>on {album.title}</p>}
    </Link>
  )
}
