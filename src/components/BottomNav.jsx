import { NavLink, useNavigate } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import styles from './BottomNav.module.css'

export default function BottomNav() {
  const navigate = useNavigate()
  const { profile } = useUser()

  const initials = profile?.displayName
    ? profile.displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <nav className={styles.nav}>
      <NavLink to="/" end className={({ isActive }) => `${styles.tab} ${isActive ? styles.active : ''}`}>
        <HomeIcon />
        <span>Home</span>
      </NavLink>

      <NavLink to="/explore" className={({ isActive }) => `${styles.tab} ${isActive ? styles.active : ''}`}>
        <ExploreIcon />
        <span>Explore</span>
      </NavLink>

      <button className={styles.createBtn} onClick={() => navigate('/create-album')} aria-label="Create">
        <span className={styles.plus}>+</span>
      </button>

      <NavLink to="/profile" className={({ isActive }) => `${styles.tab} ${isActive ? styles.active : ''}`}>
        {({ isActive }) => (
          <>
            <span className={`${styles.avatar} ${isActive ? styles.avatarActive : ''}`} style={{ background: profile?.avatarColor || '#b9b9c0' }}>
              {profile?.avatarURL
                ? <img src={profile.avatarURL} alt="" className={styles.avatarImg} />
                : initials}
            </span>
            <span>Profile</span>
          </>
        )}
      </NavLink>
    </nav>
  )
}

function HomeIcon() {
  return (
    <svg width="18" height="16" viewBox="0 0 18 16" fill="none">
      <rect x="0" y="0" width="18" height="12" rx="3" fill="currentColor" />
      <rect x="2" y="13" width="6" height="3" rx="1.5" fill="currentColor" />
      <rect x="10" y="13" width="6" height="3" rx="1.5" fill="currentColor" />
    </svg>
  )
}

function ExploreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="2" />
      <circle cx="9" cy="9" r="3" fill="currentColor" />
    </svg>
  )
}
