import { useState, useEffect } from 'react'
import { collection, query, where, orderBy, getDocs, limit } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import PostCard from '../components/PostCard'
import { Bookmark, Loader2 } from 'lucide-react'

export default function BookmarksPage() {
  const { user } = useAuth()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'posts'),
      where('bookmarks', 'array-contains', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    )
    getDocs(q)
      .then(snap => {
        setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      })
      .catch(err => {
        console.error('Bookmarks error:', err)
        setError(err.message)
        setLoading(false)
      })
  }, [user])

  return (
    <div>
      <div className="sticky top-0 bg-[#0f172a]/90 backdrop-blur border-b border-slate-700/50 px-4 py-3 z-10">
        <h1 className="font-semibold text-white flex items-center gap-2">
          <Bookmark size={18} className="text-sky-400" /> Bookmarks
        </h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-sky-400" size={28} />
        </div>
      ) : error ? (
        <div className="m-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          <p className="font-semibold mb-1">Failed to load bookmarks</p>
          <p className="text-xs opacity-80 mb-2">{error}</p>
          <p className="text-xs text-red-300">
            Fix: Firebase Console → Firestore → Indexes → Add index:<br />
            Collection: <strong>posts</strong> | Fields: <strong>bookmarks (Arrays), createdAt (Desc)</strong>
          </p>
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <Bookmark size={32} className="mx-auto mb-3 opacity-30" />
          <p>No bookmarks yet.</p>
          <p className="text-sm mt-1">Save posts by tapping the bookmark icon.</p>
        </div>
      ) : (
        posts.map(p => (
          <PostCard key={p.id} post={p} onDelete={id => setPosts(ps => ps.filter(p => p.id !== id))} />
        ))
      )}
    </div>
  )
}
