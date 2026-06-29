import { useState, useEffect } from 'react'
import { collection, query, orderBy, getDocs, limit } from 'firebase/firestore'
import { db } from '../firebase'
import PostCard from '../components/PostCard'
import { TrendingUp, Loader2, Hash } from 'lucide-react'

export default function TrendingPage() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [tagCounts, setTagCounts] = useState([])
  const [filterTag, setFilterTag] = useState(null)

  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(100))
    getDocs(q).then(snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      // Count tags
      const counts = {}
      all.forEach(p => p.tags?.forEach(t => { counts[t] = (counts[t] ?? 0) + 1 }))
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12)
      setTagCounts(sorted)

      // Sort by like count for trending
      const sorted2 = [...all].sort((a, b) => (b.likes?.length ?? 0) - (a.likes?.length ?? 0))
      setPosts(sorted2)
      setLoading(false)
    })
  }, [])

  const displayed = filterTag ? posts.filter(p => p.tags?.includes(filterTag)) : posts

  return (
    <div>
      <div className="sticky top-0 bg-[#0f172a]/90 backdrop-blur border-b border-slate-700/50 px-4 py-3 z-10">
        <h1 className="font-semibold text-white flex items-center gap-2">
          <TrendingUp size={18} className="text-sky-400" /> Trending
        </h1>
      </div>

      {/* Tag chips */}
      <div className="p-4 border-b border-slate-700/50 flex flex-wrap gap-2">
        <button
          onClick={() => setFilterTag(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
            !filterTag ? 'bg-sky-500 border-sky-500 text-white' : 'border-slate-700 text-slate-400 hover:text-white'
          }`}
        >
          All
        </button>
        {tagCounts.map(([tag, count]) => (
          <button
            key={tag}
            onClick={() => setFilterTag(filterTag === tag ? null : tag)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              filterTag === tag ? 'bg-sky-500 border-sky-500 text-white' : 'border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <Hash size={10} />{tag}
            <span className={`ml-0.5 ${filterTag === tag ? 'text-sky-200' : 'text-slate-600'}`}>{count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-sky-400" size={28} />
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 text-slate-500">No posts with this tag yet.</div>
      ) : (
        displayed.slice(0, 30).map(p => <PostCard key={p.id} post={p} />)
      )}
    </div>
  )
}
