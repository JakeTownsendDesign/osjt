import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import styles from './UserProfile.module.css'

export default function UserProfile() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      const snap = await getDoc(doc(db, 'users', uid))
      if (!snap.exists()) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setProfile(snap.data())

      const q = query(collection(db, 'albums'), where('createdBy', '==', uid))
      const albumSnap = await getDocs(q)
      setAlbums(albumSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }
    load()
  }, [uid])

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
        <button className={styles.backBtn} onClick={() => navigate(-1)}>‹ Back</button>
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

  return (
    <div className={styles.albumTile}>
      <div className={styles.tileThumbRow}>
        {colors.slice(0, 4).map((c, i) => (
          <div key={i} className={styles.tileThumb} style={{ background: c }} />
        ))}
      </div>
      <p className={styles.tileTitle}>{album.title}</p>
      <p className={styles.tileMeta}>{album.photoCount} / {album.maxPhotos} photos</p>
    </div>
  )
}
