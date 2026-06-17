import { useEffect, useState, useCallback } from 'react'
import {
  collection, query, orderBy, limit, getDocs,
  doc, getDoc, setDoc, deleteDoc, serverTimestamp, where,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import { Link } from 'react-router-dom'
import styles from './Explore.module.css'

const TABS = ['Popular', 'People', 'Places']

export default function Explore() {
  const [activeTab, setActiveTab] = useState('Popular')

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.title}>Explore</h1>
      </header>

      {/* Tab bar */}
      <div className={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
        <div
          className={styles.tabIndicator}
          style={{ left: `${TABS.indexOf(activeTab) * (100 / TABS.length)}%`, width: `${100 / TABS.length}%` }}
        />
      </div>

      {/* Tab content */}
      <div className={styles.content}>
        {activeTab === 'Popular' && <PopularTab />}
        {activeTab === 'People'  && <PeopleTab />}
        {activeTab === 'Places'  && <PlacesTab />}
      </div>

    </div>
  )
}

// ─── Popular ──────────────────────────────────────────────────────────────────

function PopularTab() {
  const [albums, setAlbums] = useState([])
  const [posters, setPosters] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const q = query(collection(db, 'albums'), orderBy('score', 'desc'), limit(20))
        const snap = await getDocs(q)
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setAlbums(list)

        const uids = [...new Set(list.map((a) => a.createdBy).filter(Boolean))]
        const userDocs = await Promise.all(uids.map((uid) => getDoc(doc(db, 'users', uid))))
        const map = {}
        userDocs.forEach((s) => { if (s.exists()) map[s.id] = s.data() })
        setPosters(map)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <p className={styles.loadingText}>Loading…</p>

  if (albums.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>Nothing here yet</p>
        <p className={styles.emptySubtitle}>Seed some example data at <Link to="/seed" className={styles.emptyLink}>/seed</Link> to see popular albums.</p>
      </div>
    )
  }

  return (
    <div className={styles.popularList}>
      {albums.map((album, i) => (
        <PopularCard key={album.id} album={album} rank={i + 1} poster={posters[album.createdBy]} />
      ))}
    </div>
  )
}

function PopularCard({ album, rank, poster }) {
  const colors = album.thumbnailColors?.length >= 4
    ? album.thumbnailColors
    : ['#e8dccb', '#d9c7b0', '#cbb89e', '#e2d2bc']

  const currentUser = auth.currentUser
  const isOwn = album.createdBy === currentUser?.uid
  const profilePath = isOwn ? '/profile' : `/users/${album.createdBy}`

  const posterInitials = poster?.displayName
    ? poster.displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <div className={styles.popularCard}>
      {/* Rank + poster */}
      <div className={styles.cardHeader}>
        <span className={styles.rank}>#{rank}</span>
        <Link to={profilePath} className={styles.posterRow}>
          <div className={styles.posterAvatar} style={{ background: poster?.avatarColor || '#b9b9c0' }}>
            {poster?.avatarURL
              ? <img src={poster.avatarURL} alt="" className={styles.posterAvatarImg} />
              : posterInitials
            }
          </div>
          <span className={styles.posterUsername}>@{poster?.username || 'unknown'}</span>
        </Link>
      </div>

      {/* Thumbnails */}
      <div className={styles.thumbRow}>
        {colors.slice(0, 4).map((c, i) => (
          <div key={i} className={styles.thumb} style={{ background: c }} />
        ))}
      </div>

      {/* Info */}
      <div className={styles.cardBody}>
        <p className={styles.cardTitle}>{album.title}</p>
        <p className={styles.cardDesc}>{album.description}</p>
        <div className={styles.statsRow}>
          <Stat icon="📷" value={album.photoCount} label="photos" />
          <Stat icon="❤️" value={album.likeCount ?? 0} label="likes" />
          <Stat icon="💬" value={album.commentCount ?? 0} label="comments" />
          <Stat icon="👥" value={album.contributorCount ?? 0} label="contributors" />
        </div>
      </div>
    </div>
  )
}

function Stat({ icon, value, label }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statIcon}>{icon}</span>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  )
}

// ─── People ───────────────────────────────────────────────────────────────────

function PeopleTab() {
  const currentUser = auth.currentUser
  const [users, setUsers] = useState([])
  const [following, setFollowing] = useState(new Set()) // set of uids current user follows
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(new Set()) // uids with in-flight follow toggle

  useEffect(() => {
    async function load() {
      try {
        // Fetch all users except self
        const snap = await getDocs(collection(db, 'users'))
        const list = snap.docs
          .filter((d) => d.id !== currentUser?.uid)
          .map((d) => ({ id: d.id, ...d.data() }))
        setUsers(list)

        // Fetch who current user already follows
        const followSnap = await getDocs(
          query(collection(db, 'follows'), where('followerId', '==', currentUser?.uid))
        )
        setFollowing(new Set(followSnap.docs.map((d) => d.data().followeeId)))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentUser])

  const toggleFollow = useCallback(async (targetUid) => {
    if (toggling.has(targetUid)) return
    setToggling((s) => new Set([...s, targetUid]))

    const followId = `${currentUser.uid}__${targetUid}`
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
          followerId: currentUser.uid,
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
  }, [currentUser, following, toggling])

  if (loading) return <p className={styles.loadingText}>Loading…</p>

  if (users.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No other users yet</p>
        <p className={styles.emptySubtitle}>Seed some example users at <Link to="/seed" className={styles.emptyLink}>/seed</Link>.</p>
      </div>
    )
  }

  return (
    <div className={styles.peopleList}>
      {users.map((user) => (
        <PersonRow
          key={user.id}
          user={user}
          isFollowing={following.has(user.id)}
          isToggling={toggling.has(user.id)}
          onToggle={() => toggleFollow(user.id)}
        />
      ))}
    </div>
  )
}

function PersonRow({ user, isFollowing, isToggling, onToggle }) {
  const initials = user.displayName
    ? user.displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <div className={styles.personRow}>
      <Link to={`/users/${user.id}`} className={styles.personInfo}>
        <div className={styles.personAvatar} style={{ background: user.avatarColor || '#b9b9c0' }}>
          {user.avatarURL
            ? <img src={user.avatarURL} alt="" className={styles.personAvatarImg} />
            : initials
          }
        </div>
        <div className={styles.personText}>
          <p className={styles.personName}>{user.displayName}</p>
          <p className={styles.personUsername}>@{user.username}</p>
          {user.bio ? <p className={styles.personBio}>{user.bio}</p> : null}
        </div>
      </Link>
      <button
        className={`${styles.followBtn} ${isFollowing ? styles.followingBtn : ''}`}
        onClick={onToggle}
        disabled={isToggling}
      >
        {isToggling ? '…' : isFollowing ? 'Following' : 'Follow'}
      </button>
    </div>
  )
}

// ─── Places ───────────────────────────────────────────────────────────────────

function PlacesTab() {
  return (
    <div className={styles.placesContainer}>
      <div className={styles.placesIcon}>🗺️</div>
      <h2 className={styles.placesTitle}>Places is coming soon</h2>
      <p className={styles.placesSubtitle}>
        An interactive map where you can tap anywhere in the world to discover albums and photos posted nearby.
      </p>
    </div>
  )
}
