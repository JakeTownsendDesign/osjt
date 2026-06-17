import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { UserProvider, useUser } from './context/UserContext'
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

function ProtectedRoute({ children }) {
  const { user } = useUser()
  if (user === undefined) return null
  if (!user) return <Navigate to="/login" replace />
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />
  return children
}

function AuthRoute({ children }) {
  const { user } = useUser()
  if (user === undefined) return null
  if (user && user.emailVerified) return <Navigate to="/" replace />
  return children
}

function LoggedInRoute({ children }) {
  const { user } = useUser()
  if (user === undefined) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.emailVerified) return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/signup"       element={<AuthRoute><SignUp /></AuthRoute>} />
      <Route path="/login"        element={<AuthRoute><Login /></AuthRoute>} />
      <Route path="/verify-email" element={<LoggedInRoute><VerifyEmail /></LoggedInRoute>} />
      <Route path="/"             element={<ProtectedRoute><AppLayout><Home /></AppLayout></ProtectedRoute>} />
      <Route path="/explore"      element={<ProtectedRoute><AppLayout><Explore /></AppLayout></ProtectedRoute>} />
      <Route path="/profile"      element={<ProtectedRoute><AppLayout><Profile /></AppLayout></ProtectedRoute>} />
      <Route path="/seed"         element={<ProtectedRoute><AppLayout><Seed /></AppLayout></ProtectedRoute>} />
      <Route path="/users/:uid"   element={<ProtectedRoute><AppLayout><UserProfile /></AppLayout></ProtectedRoute>} />
      <Route path="/create-album"    element={<ProtectedRoute><AppLayout><CreateAlbum /></AppLayout></ProtectedRoute>} />
      <Route path="/albums/:albumId" element={<ProtectedRoute><AppLayout><AlbumView /></AppLayout></ProtectedRoute>} />
      <Route path="*"             element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <UserProvider>
        <AppRoutes />
      </UserProvider>
    </BrowserRouter>
  )
}
