import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import SignUp from './pages/SignUp'
import Login from './pages/Login'
import VerifyEmail from './pages/VerifyEmail'
import Home from './pages/Home'
import Explore from './pages/Explore'
import Profile from './pages/Profile'
import Seed from './pages/Seed'
import UserProfile from './pages/UserProfile'
import CreateAlbum from './pages/CreateAlbum'
import AlbumView from './pages/AlbumView'
import AppLayout from './components/AppLayout'

// Logged in + email verified → allow through
// Logged in + unverified → send to /verify-email
// Not logged in → send to /login
function ProtectedRoute({ user, children }) {
  if (user === undefined) return null
  if (!user) return <Navigate to="/login" replace />
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />
  return children
}

// Logged in + unverified → allow (they need to reach /verify-email)
// Logged in + verified → send to /
// Not logged in → allow
function AuthRoute({ user, children }) {
  if (user === undefined) return null
  if (user && user.emailVerified) return <Navigate to="/" replace />
  return children
}

// Only for logged-in users regardless of verification status
function LoggedInRoute({ user, children }) {
  if (user === undefined) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.emailVerified) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u ?? null))
    return unsub
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/signup"       element={<AuthRoute user={user}><SignUp /></AuthRoute>} />
        <Route path="/login"        element={<AuthRoute user={user}><Login /></AuthRoute>} />
        <Route path="/verify-email" element={<LoggedInRoute user={user}><VerifyEmail /></LoggedInRoute>} />
        <Route path="/"             element={<ProtectedRoute user={user}><AppLayout><Home /></AppLayout></ProtectedRoute>} />
        <Route path="/explore"      element={<ProtectedRoute user={user}><AppLayout><Explore /></AppLayout></ProtectedRoute>} />
        <Route path="/profile"      element={<ProtectedRoute user={user}><AppLayout><Profile /></AppLayout></ProtectedRoute>} />
        <Route path="/seed"         element={<ProtectedRoute user={user}><AppLayout><Seed /></AppLayout></ProtectedRoute>} />
        <Route path="/users/:uid"   element={<ProtectedRoute user={user}><AppLayout><UserProfile /></AppLayout></ProtectedRoute>} />
        <Route path="/create-album"    element={<ProtectedRoute user={user}><AppLayout><CreateAlbum /></AppLayout></ProtectedRoute>} />
        <Route path="/albums/:albumId" element={<ProtectedRoute user={user}><AppLayout><AlbumView /></AppLayout></ProtectedRoute>} />
        <Route path="*"             element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
