import { useState, useEffect } from 'react'
import { collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import ComposeBox from '../components/ComposeBox'
import PostCard from '../components/PostCard'
import { Loader2, Users, Zap, AlertCircle } from 'lucide-react'

export default function HomePage() {
  const { profile } = useAuth()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('for-you')

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
