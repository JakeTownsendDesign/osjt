import { NavLink, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import styles from './SideNav.module.css'

export default function SideNav() {
  const navigate = useNavigate()
  const user = auth.currentUser

  const initials = user?.displayName
    ? user.displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  async function handleSignOut() {
    await signOut(auth)
    navigate('/login')
  }

  return (
    <nav className={styles.sideNav}>
      {/* Logo */}
      <div className={styles.logo}>
        <div className={styles.logoMark} />
        <span className={styles.logoText}>Daily Album</span>
      </div>

      {/* Nav links */}
      <div className={styles.links}>
        <NavLink to="/" end className={({ isActive }) => `${styles.link} ${isActive ? styles.linkActive : ''}`}>
          <HomeIcon />
          <span className={styles.linkLabel}>Home</span>
        </NavLink>

        <NavLink to="/explore" className={({ isActive }) => `${styles.link} ${isActive ? styles.linkActive : ''}`}>
          <ExploreIcon />
          <span className={styles.linkLabel}>Explore</span>
        </NavLink>

        <button className={styles.createLink} onClick={() => navigate('/create-album')}>
          <span className={styles.createIcon}>+</span>
          <span className={styles.linkLabel}>Create</span>
        </button>

        <NavLink to="/profile" className={({ isActive }) => `${styles.link} ${isActive ? styles.linkActive : ''}`}>
          <ProfileIcon />
          <span className={styles.linkLabel}>Profile</span>
        </NavLink>
      </div>

      {/* User footer */}
      <div className={styles.footer}>
        <button className={styles.avatarBtn} onClick={() => navigate('/profile')}>
          <div className={styles.avatar}>
            {user?.photoURL
              ? <img src={user.photoURL} alt="" className={styles.avatarImg} />
              : initials
            }
          </div>
          <div className={styles.userInfo}>
            <p className={styles.userName}>{user?.displayName || 'You'}</p>
            <p className={styles.userEmail}>{user?.email}</p>
          </div>
        </button>
      </div>
    </nav>
  )
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 9.5L10 3l7 6.5V18a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M7 19v-7h6v7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ExploreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="10" cy="10" r="3" fill="currentColor" />
    </svg>
  )
}

function ProfileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="7" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path d="M2 19c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}
