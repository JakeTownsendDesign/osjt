import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import { useUser } from '../context/UserContext'
import styles from './UserProfile.module.css'

export default function UserProfile() {
  const { uid: paramUid } = useParams()
  const navigate = useNavigate()
  const { profile: contextProfile } = useUser()
  const currentUid = auth.currentUser?.uid

  // /profile has no :uid param → it's the current user's own profile
  const targetUid = paramUid || currentUid
  const isOwn = targetUid === currentUid

  const [profile, setProfile] = useState(null)
  const [albums, setAlbums] = useState([])
  const [followingCount, setFollowingCount] = useState(0)
  const [followerCount, setFollowerCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setNotFound(false)
      const snap = await getDoc(doc(db, 'users', targetUid))
      if (!snap.exists()) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setProfile(snap.data())

      const q = query(collection(db, 'albums'), where('createdBy', '==', targetUid))
      const albumSnap = await getDocs(q)
      setAlbums(albumSnap.docs.map((d) => ({ id: d.id, ...d.data() })))

      // Follow stats: following = this user follows others, followers = others follow this user
      const [followingSnap, followersSnap] = await Promise.all([
        getDocs(query(collection(db, 'follows'), where('followerId', '==', targetUid))),
        getDocs(query(collection(db, 'follows'), where('followeeId', '==', targetUid))),
      ])
      setFollowingCount(followingSnap.size)
      setFollowerCount(followersSnap.size)
      setIsFollowing(followersSnap.docs.some((d) => d.data().followerId === currentUid))

      setLoading(false)
    }
    load()
  }, [targetUid, contextProfile, currentUid]) // re-run when own profile changes (after editing)

  async function toggleFollow() {
    if (followBusy || isOwn) return
    setFollowBusy(true)
    const followId = `${currentUid}__${targetUid}`
    const wasFollowing = isFollowing

    // Optimistic update
    setIsFollowing(!wasFollowing)
    setFollowerCount((c) => c + (wasFollowing ? -1 : 1))

    try {
      if (wasFollowing) {
        await deleteDoc(doc(db, 'follows', followId))
      } else {
        await setDoc(doc(db, 'follows', followId), {
          followerId: currentUid,
          followeeId: targetUid,
          createdAt: serverTimestamp(),
        })
      }
    } catch {
      // Revert on failure
      setIsFollowing(wasFollowing)
      setFollowerCount((c) => c + (wasFollowing ? 1 : -1))
    } finally {
      setFollowBusy(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.screen}>
        <p className={styles.loadingText}>Loading…</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className={styles.screen}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>‹ Back</button>
        <p className={styles.notFound}>User not found.</p>
      </div>
    )
  }

  const initials = profile.displayName
    ? profile.displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        {!isOwn && (
          <button className={styles.backBtn} onClick={() => navigate(-1)}>‹ Back</button>
        )}
      </header>

      <div className={styles.profileSection}>
        <div className={styles.avatarWrap} style={{ background: profile.avatarColor || '#b9b9c0' }}>
          {profile.avatarURL
            ? <img src={profile.avatarURL} alt={profile.displayName} className={styles.avatarImg} />
            : <span className={styles.avatarInitials}>{initials}</span>
          }
        </div>
        <h1 className={styles.displayName}>{profile.displayName}</h1>
        <p className={styles.username}>@{profile.username}</p>
        {profile.bio ? <p className={styles.bio}>{profile.bio}</p> : null}

        <div className={styles.statsRow}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{followerCount}</span>
            <span className={styles.statLabel}>follower{followerCount === 1 ? '' : 's'}</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statValue}>{followingCount}</span>
            <span className={styles.statLabel}>following</span>
          </div>
        </div>

        {isOwn ? (
          <Link to="/profile/edit" className={styles.editBtn}>Edit profile</Link>
        ) : (
          <button
            className={`${styles.followBtn} ${isFollowing ? styles.followingBtn : ''}`}
            onClick={toggleFollow}
            disabled={followBusy}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </button>
        )}
      </div>

      <div className={styles.albumsSection}>
        <h2 className={styles.sectionTitle}>Albums</h2>
        {albums.length === 0
          ? <p className={styles.emptyText}>No albums yet.</p>
          : (
            <div className={styles.albumGrid}>
              {albums.map((album) => (
                <AlbumTile key={album.id} album={album} />
              ))}
            </div>
          )
        }
      </div>

    </div>
  )
}

function AlbumTile({ album }) {
  const colors = album.thumbnailColors?.length >= 4
    ? album.thumbnailColors
    : ['#e8dccb', '#d9c7b0', '#cbb89e', '#e2d2bc']
  const urls = album.thumbnailURLs || []

  return (
    <Link to={`/albums/${album.id}`} className={styles.albumTile} style={{ textDecoration: 'none' }}>
      <div className={styles.tileThumbRow}>
        {colors.slice(0, 4).map((c, i) => (
          <div key={i} className={styles.tileThumb} style={{ background: c }}>
            {urls[i] && <img src={urls[i]} alt="" className={styles.tileThumbImg} />}
          </div>
        ))}
      </div>
      <p className={styles.tileTitle}>{album.title}</p>
      <p className={styles.tileMeta}>{album.photoCount} / {album.maxPhotos} photos</p>
    </Link>
  )
}
