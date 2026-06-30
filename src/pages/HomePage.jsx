import { useState, useEffect } from 'react'
import { collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import ComposeBox from '../components/ComposeBox'
import PostCard from '../components/PostCard'
import StoriesBar from '../components/StoriesBar'
import { Loader2, Users, Zap, AlertCircle, Radio } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function HomePage() {
  const { profile } = useAuth()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('for-you')
  const [liveStreams, setLiveStreams] = useState([])

  useEffect(() => {
    const q = query(collection(db, 'streams'), where('active', '==', true), limit(10))
    return onSnapshot(q, snap => setLiveStreams(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)

    let q
    if (tab === 'following' && profile?.following?.length > 0) {
      q = query(
        collection(db, 'posts'),
        where('authorId', 'in', profile.following.slice(0, 10)),
        orderBy('createdAt', 'desc'),
        limit(30)
      )
    } else {
      q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(40))
    }

    const unsub = onSnapshot(q,
      snap => {
        setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      err => {
        console.error('Feed error:', err)
        setError(err.message)
        setLoading(false)
      }
    )
    return unsub
  }, [tab, profile?.following])

  return (
    <div>
      <div className="sticky top-0 z-10 bg-[#0f172a]/90 backdrop-blur border-b border-slate-700/50">
        <div className="flex">
          <TabBtn label="For You" icon={<Zap size={15} />} active={tab === 'for-you'} onClick={() => setTab('for-you')} />
          <TabBtn label="Following" icon={<Users size={15} />} active={tab === 'following'} onClick={() => setTab('following')} />
        </div>
      </div>

      <StoriesBar />

      {liveStreams.length > 0 && (
        <div className="px-4 py-3 border-b border-slate-700/50">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Radio size={11} className="text-red-400" /> Live Now
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1 anchor-scrollbar">
            {liveStreams.map(s => (
              <Link key={s.id} to={`/watch/${s.id}`} className="flex flex-col items-center gap-1.5 shrink-0">
                <div className="relative">
                  <img src={s.hostAvatar} alt="" className="w-14 h-14 rounded-full object-cover ring-2 ring-red-500" />
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">LIVE</span>
                </div>
                <p className="text-xs text-slate-300 font-medium truncate w-16 text-center">{s.hostName}</p>
                <p className="text-[10px] text-slate-500 flex items-center gap-0.5"><Users size={9} />{s.viewerCount ?? 0}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      <ComposeBox onPost={() => {}} />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-sky-400" size={28} />
        </div>
      ) : error ? (
        <div className="mx-4 mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-1">Firestore error</p>
            <p className="text-xs opacity-80">{error}</p>
            <p className="text-xs mt-2 text-red-300">
              Most likely cause: Firestore rules not published yet. Go to Firebase Console → Firestore → Rules → Publish.
            </p>
          </div>
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-2xl mb-2">🪝</p>
          <p className="font-medium">Nothing here yet.</p>
          <p className="text-sm mt-1">Be the first to drop your anchor!</p>
        </div>
      ) : (
        posts.map(p => (
          <PostCard key={p.id} post={p} onDelete={id => setPosts(ps => ps.filter(p => p.id !== id))} />
        ))
      )}
    </div>
  )
}

function TabBtn({ label, icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm font-medium border-b-2 transition ${
        active ? 'border-sky-500 text-white' : 'border-transparent text-slate-500 hover:text-white'
      }`}
    >
      {icon}{label}
    </button>
  )
}
