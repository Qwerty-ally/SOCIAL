import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useNotifCount } from '../hooks/useNotifCount'
import { Home, Compass, Bell, MessageCircle, User } from 'lucide-react'

export default function MobileNav() {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const unread = useNotifCount()

  const links = [
    { to: '/',              icon: <Home size={22} /> },
    { to: '/explore',       icon: <Compass size={22} /> },
    { to: '/notifications', icon: <Bell size={22} />, badge: unread },
    { to: '/messages',      icon: <MessageCircle size={22} /> },
    { to: `/profile/${profile?.username}`, icon: <User size={22} /> },
  ]

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-[#1e293b]/95 backdrop-blur border-t border-slate-700/60 flex z-50">
      {links.map(({ to, icon, badge }) => {
        const active = pathname === to
        return (
          <Link
            key={to}
            to={to}
            className={`flex-1 flex items-center justify-center py-3 relative transition ${
              active ? 'text-sky-400' : 'text-slate-500'
            }`}
          >
            {icon}
            {badge > 0 && (
              <span className="absolute top-2 right-[calc(50%-16px)] min-w-[16px] h-4 px-0.5 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
