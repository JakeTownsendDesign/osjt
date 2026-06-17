import SideNav from './SideNav'
import BottomNav from './BottomNav'
import styles from './AppLayout.module.css'

export default function AppLayout({ children }) {
  return (
    <div className={styles.layout}>
      <SideNav />
      <main className={styles.main}>
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
