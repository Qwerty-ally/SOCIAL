import { Link, useLocation, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNotifCount } from '../hooks/useNotifCount'
import {
  Anchor, Home, Search, Bell, User, PlusSquare, MessageCircle,
  Compass, LogOut, Bookmark, TrendingUp, Crown
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function Sidebar() {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const unread = useNotifCount()

  const links = [
    { to: '/',             icon: <Home size={22} />,        label: 'Home' },
    { to: '/explore',      icon: <Compass size={22} />,     label: 'Explore' },
    { to: '/trending',     icon: <TrendingUp size={22} />,  label: 'Trending' },
    { to: '/notifications',icon: <Bell size={22} />,        label: 'Notifications', badge: unread },
    { to: '/messages',     icon: <MessageCircle size={22} />,label: 'Messages' },
    { to: '/bookmarks',    icon: <Bookmark size={22} />,    label: 'Bookmarks' },
    { to: `/profile/${profile?.username}`, icon: <User size={22} />, label: 'Profile' },
  ]

  async function logout() {
    await signOut(auth)
    toast('Signed out')
    navigate('/')
  }

  return (
    <aside className="hidden md:flex flex-col justify-between w-64 shrink-0 h-screen sticky top-0 border-r border-slate-700/60 px-4 py-6">
      {/* Logo */}
      <div>
        <Link to="/" className="flex items-center gap-2 mb-8 px-2">
          <div className="w-9 h-9 rounded-xl bg-sky-500 flex items-center justify-center shadow shadow-sky-500/40">
            <Anchor size={20} className="text-white" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">ANCHOR</span>
        </Link>

        <nav className="space-y-1">
          {links.map(({ to, icon, label, badge }) => {
            const active = pathname === to
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-sky-500/20 text-sky-400'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span className="relative">
                  {icon}
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                {label}
              </Link>
            )
          })}
        </nav>

        {/* New Post button */}
        <Link
          to="/compose"
          className="mt-4 flex items-center justify-center gap-2 w-full py-3 bg-sky-500 hover:bg-sky-400 text-white rounded-xl font-semibold text-sm transition shadow shadow-sky-500/30"
        >
          <PlusSquare size={18} />
          New Post
        </Link>
      </div>

      {/* Profile footer */}
      {profile && (
        <div className="flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-slate-800 cursor-pointer group">
          <img src={profile.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-white truncate">{profile.displayName}</p>
              {profile.role === 'owner' && <Crown size={12} className="text-amber-400 shrink-0" />}
            </div>
            <p className="text-xs text-slate-400 truncate">@{profile.username}</p>
          </div>
          <button onClick={logout} className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition">
            <LogOut size={16} />
          </button>
        </div>
      )}
    </aside>
  )
}
