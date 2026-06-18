import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'

const UserContext = createContext(null)

export const DAILY_CONTRIB_LIMIT = 3

export function todayKey() {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD (local-ish, UTC date)
}

// How many contributions the user has left today, derived from the live profile.
export function remainingContributions(profile) {
  const dc = profile?.dailyContrib
  if (!dc || dc.date !== todayKey()) return DAILY_CONTRIB_LIMIT
  return Math.max(0, DAILY_CONTRIB_LIMIT - (dc.count || 0))
}

export function UserProvider({ children }) {
  // undefined = loading, null = logged out, object = logged in
  const [user, setUser] = useState(undefined)
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    let unsubProfile = null

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ?? null)

      // Tear down any previous profile listener
      if (unsubProfile) { unsubProfile(); unsubProfile = null }

      if (firebaseUser) {
        // Real-time listener — loaded once, kept fresh everywhere with no
        // per-component reads (daily contribution count, avatar, etc.)
        unsubProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), (snap) => {
          setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null)
        })
      } else {
        setProfile(null)
      }
    })

    return () => {
      if (unsubProfile) unsubProfile()
      unsubAuth()
    }
  }, [])

  return (
    <UserContext.Provider value={{ user, profile, setProfile }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
