import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  // undefined = loading, null = logged out, object = logged in
  const [user, setUser] = useState(undefined)
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser ?? null)
      if (firebaseUser) {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
        setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null)
      } else {
        setProfile(null)
      }
    })
    return unsub
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
