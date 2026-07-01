import { useEffect, useState } from 'react'
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'
import { Heart, UserPlus, MessageCircle, Bell, Loader2, Users, Check, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

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
        // Auto-mark as read — skip collab-request (they need explicit accept/decline)
        snap.docs
          .filter(d => !d.data().read && d.data().type !== 'collab-request')
          .forEach(d => updateDoc(doc(db, 'notifications', d.id), { read: true }))
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
        notifs.map(n =>
          n.type === 'collab-request'
            ? <CollabRequestItem key={n.id} n={n} />
            : <NotifItem key={n.id} n={n} />
        )
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

function CollabRequestItem({ n }) {
  const { user } = useAuth()
  const [acting, setActing] = useState(false)
  const timeAgo = n.createdAt?.toDate
    ? formatDistanceToNow(n.createdAt.toDate(), { addSuffix: true })
    : ''

  async function respond(accept) {
    if (acting) return
    setActing(true)
    try {
      const postRef = doc(db, 'posts', n.postId)
      const postSnap = await getDoc(postRef)
      if (!postSnap.exists()) {
        await updateDoc(doc(db, 'notifications', n.id), { status: 'declined', read: true })
        toast.error('Post no longer exists')
        setActing(false)
        return
      }
      const postData = postSnap.data()
      const me = (postData.pendingCoAuthors || []).find(a => a.id === user.uid)
      const newPending = (postData.pendingCoAuthors || []).filter(a => a.id !== user.uid)

      if (accept && me) {
        await updateDoc(postRef, {
          pendingCoAuthors: newPending,
          coAuthors: [...(postData.coAuthors || []), me],
          collabPending: newPending.length > 0,
        })
        await updateDoc(doc(db, 'notifications', n.id), { status: 'accepted', read: true })
        toast.success('Collab accepted! You\'re now a co-author.')
      } else {
        await updateDoc(postRef, {
          pendingCoAuthors: newPending,
          collabPending: newPending.length > 0,
        })
        await updateDoc(doc(db, 'notifications', n.id), { status: 'declined', read: true })
        toast('Collab declined')
      }
    } catch (err) {
      toast.error(err.message)
    }
    setActing(false)
  }

  const avatar = n.fromAvatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${n.fromName}`

  if (n.status === 'accepted') {
    return (
      <div className="flex items-start gap-3 px-4 py-4 border-b border-slate-700/30 bg-green-500/5">
        <div className="relative shrink-0">
          <img src={avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#1e293b] flex items-center justify-center">
            <Users size={11} className="text-sky-400" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-200">
            <span className="font-semibold text-white">{n.fromName}</span> invited you to collab on a post
          </p>
          <p className="text-xs text-green-400 mt-0.5 flex items-center gap-1"><Check size={10} /> You accepted</p>
          <p className="text-xs text-slate-500 mt-0.5">{timeAgo}</p>
        </div>
      </div>
    )
  }

  if (n.status === 'declined') {
    return (
      <div className="flex items-start gap-3 px-4 py-4 border-b border-slate-700/30 opacity-50">
        <div className="relative shrink-0">
          <img src={avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#1e293b] flex items-center justify-center">
            <Users size={11} className="text-sky-400" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-200">
            <span className="font-semibold text-white">{n.fromName}</span> invited you to collab on a post
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Declined · {timeAgo}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`px-4 py-4 border-b border-slate-700/30 ${!n.read ? 'bg-sky-500/5' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <img src={avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#1e293b] flex items-center justify-center">
            <Users size={11} className="text-sky-400" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-200">
            <span className="font-semibold text-white">{n.fromName}</span> wants to collab on a post with you
          </p>
          {n.postPreview && (
            <p className="text-xs text-slate-500 mt-1 italic line-clamp-2">"{n.postPreview}"</p>
          )}
          <p className="text-xs text-slate-500 mt-0.5">{timeAgo}</p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => respond(true)}
              disabled={acting}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-sky-500 hover:bg-sky-400 text-white rounded-full text-xs font-semibold transition disabled:opacity-50"
            >
              <Check size={12} /> Accept
            </button>
            <button
              onClick={() => respond(false)}
              disabled={acting}
              className="flex items-center gap-1.5 px-4 py-1.5 border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 rounded-full text-xs font-semibold transition disabled:opacity-50"
            >
              <X size={12} /> Decline
            </button>
          </div>
        </div>
        {!n.read && <div className="w-2 h-2 rounded-full bg-sky-400 flex-shrink-0 mt-1" />}
      </div>
    </div>
  )
}
