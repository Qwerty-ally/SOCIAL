import { useEffect, useState } from 'react'
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'
import { Heart, UserPlus, MessageCircle, Bell, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const icons = {
  like: <Heart size={16} className="text-red-400" />,
  follow: <UserPlus size={16} className="text-sky-400" />,
  comment: <MessageCircle size={16} className="text-green-400" />,
  reply: <MessageCircle size={16} className="text-purple-400" />,
}

export default function NotificationsPage() {
  const { user } = useAuth()
  const [notifs, setNotifs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'notifications'),
      where('to', '==', user.uid),
      orderBy('createdAt', 'desc')
    )
    return onSnapshot(q,
      snap => {
        setNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
        snap.docs.filter(d => !d.data().read).forEach(d => {
          updateDoc(doc(db, 'notifications', d.id), { read: true })
        })
      },
      err => {
        console.error('Notifications error:', err)
        setError(err.message)
        setLoading(false)
      }
    )
  }, [user])

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="animate-spin text-sky-400" size={28} />
    </div>
  )

  if (error) return (
    <div className="m-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
      <p className="font-semibold mb-1">Failed to load notifications</p>
      <p className="text-xs opacity-80 mb-2">{error}</p>
      <p className="text-xs text-red-300">Fix: Go to Firebase Console → Firestore → Indexes → Add index:<br/>
        Collection: <strong>notifications</strong> | Fields: <strong>to (Asc), createdAt (Desc)</strong>
      </p>
    </div>
  )

  return (
    <div>
      <div className="sticky top-0 bg-[#0f172a]/90 backdrop-blur border-b border-slate-700/50 px-4 py-3 z-10">
        <h1 className="font-semibold text-white flex items-center gap-2">
          <Bell size={18} className="text-sky-400" /> Notifications
        </h1>
      </div>

      {notifs.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <Bell size={32} className="mx-auto mb-3 opacity-30" />
          <p>No notifications yet.</p>
        </div>
      ) : (
        notifs.map(n => <NotifItem key={n.id} n={n} />)
      )}
    </div>
  )
}

function NotifItem({ n }) {
  const timeAgo = n.createdAt?.toDate
    ? formatDistanceToNow(n.createdAt.toDate(), { addSuffix: true })
    : ''

  const message = {
    like: 'liked your post',
    follow: 'followed you',
    comment: 'replied to your post',
    reply: 'replied to your comment',
  }[n.type] ?? 'interacted with you'

  return (
    <Link
      to={n.postId ? `/post/${n.postId}` : `/profile/${n.fromName}`}
      className={`flex items-center gap-3 px-4 py-4 border-b border-slate-700/30 hover:bg-slate-800/50 transition ${!n.read ? 'bg-sky-500/5' : ''}`}
    >
      <div className="relative">
        <img
          src={n.fromAvatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${n.fromName}`}
          alt=""
          className="w-10 h-10 rounded-full object-cover"
        />
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#1e293b] flex items-center justify-center">
          {icons[n.type]}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200">
          <span className="font-semibold text-white">{n.fromName}</span>
          {' '}{message}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">{timeAgo}</p>
      </div>
      {!n.read && <div className="w-2 h-2 rounded-full bg-sky-400 flex-shrink-0" />}
    </Link>
  )
}
