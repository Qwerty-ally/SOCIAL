import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Sidebar from './components/Sidebar'
import MobileNav from './components/MobileNav'
import AuthPage from './pages/AuthPage'
import HomePage from './pages/HomePage'
import PostPage from './pages/PostPage'
import ProfilePage from './pages/ProfilePage'
import ExplorePage from './pages/ExplorePage'
import NotificationsPage from './pages/NotificationsPage'
import MessagesPage from './pages/MessagesPage'
import BookmarksPage from './pages/BookmarksPage'
import TrendingPage from './pages/TrendingPage'
import ComposePage from './pages/ComposePage'
import { Loader2 } from 'lucide-react'

function Layout({ children }) {
  return (
    <div className="min-h-screen flex max-w-5xl mx-auto">
      <Sidebar />
      <main className="flex-1 min-w-0 border-x border-slate-700/50 pb-16 md:pb-0">
        {children}
      </main>
<MobileNav />
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="animate-spin text-sky-400" size={32} />
    </div>
  )
  if (!user) return <Navigate to="/auth" replace />
  return children
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a]">
      <Loader2 className="animate-spin text-sky-400" size={36} />
    </div>
  )

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
      <Route path="/" element={<ProtectedRoute><Layout><HomePage /></Layout></ProtectedRoute>} />
      <Route path="/explore" element={<ProtectedRoute><Layout><ExplorePage /></Layout></ProtectedRoute>} />
      <Route path="/trending" element={<ProtectedRoute><Layout><TrendingPage /></Layout></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><Layout><NotificationsPage /></Layout></ProtectedRoute>} />
      <Route path="/messages" element={<ProtectedRoute><Layout><MessagesPage /></Layout></ProtectedRoute>} />
      <Route path="/bookmarks" element={<ProtectedRoute><Layout><BookmarksPage /></Layout></ProtectedRoute>} />
      <Route path="/compose" element={<ProtectedRoute><Layout><ComposePage /></Layout></ProtectedRoute>} />
      <Route path="/post/:id" element={<ProtectedRoute><Layout><PostPage /></Layout></ProtectedRoute>} />
      <Route path="/profile/:username" element={<ProtectedRoute><Layout><ProfilePage /></Layout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
