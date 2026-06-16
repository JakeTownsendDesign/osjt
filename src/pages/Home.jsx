import { useEffect, useState } from 'react'
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { signOut } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import styles from './Home.module.css'

export default function Home() {
  const navigate = useNavigate()
  const user = auth.currentUser
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAlbums() {
      try {
        const q = query(collection(db, 'albums'), orderBy('updatedAt', 'desc'), limit(10))
        const snap = await getDocs(q)
        setAlbums(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      } finally {
        setLoading(false)
      }
    }
    fetchAlbums()
  }, [])

  const initials = user?.displayName
    ? user.displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.appTitle}>Daily Album</h1>
        <button className={styles.avatar} onClick={() => navigate('/profile')} aria-label="Profile">
          {initials}
        </button>
      </header>

      <div className={styles.todayBanner}>
        <div className={styles.todayIcon}>
          <CameraIcon />
        </div>
        <div className={styles.todayText}>
          <p className={styles.todayTitle}>Today's photo awaits</p>
          <p className={styles.todaySubtitle}>You haven't posted yet today</p>
        </div>
        <span className={styles.todayArrow}>›</span>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Recently updated</h2>

        {loading && <p className={styles.loadingText}>Loading albums…</p>}

        {!loading && albums.length === 0 && (
          <p className={styles.emptyText}>No albums yet. <button className={styles.seedLink} onClick={() => navigate('/seed')}>Seed example data →</button></p>
        )}

        <div className={styles.albumList}>
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      </section>

      <BottomNav />
    </div>
  )
}

function AlbumCard({ album }) {
  const { title, description, photoCount, maxPhotos, contributorCount, thumbnailColors = [] } = album
  const progress = maxPhotos > 0 ? Math.min(photoCount / maxPhotos, 1) : 0
  const colors = thumbnailColors.length >= 4
    ? thumbnailColors
    : ['#e8dccb', '#d9c7b0', '#cbb89e', '#e2d2bc']

  return (
    <div className={styles.albumCard}>
      <div className={styles.thumbnailRow}>
        {colors.slice(0, 4).map((color, i) => (
          <div key={i} className={styles.thumbnail} style={{ background: color }} />
        ))}
      </div>
      <div className={styles.albumInfo}>
        <p className={styles.albumTitle}>{title}</p>
        <p className={styles.albumDesc}>{description}</p>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progress * 100}%` }} />
        </div>
        <div className={styles.albumMeta}>
          <span className={styles.metaBold}>{photoCount} of {maxPhotos} photos</span>
          <span className={styles.metaGray}>{contributorCount} contributor{contributorCount !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  )
}

function CameraIcon() {
  return (
    <svg width="22" height="18" viewBox="0 0 22 18" fill="none">
      <path d="M8 2l1.5-2h3L14 2h4a2 2 0 012 2v12a2 2 0 01-2 2H2a2 2 0 01-2-2V4a2 2 0 012-2h6z" fill="white" />
      <circle cx="11" cy="10" r="3.5" fill="#ff5c39" />
    </svg>
  )
}
