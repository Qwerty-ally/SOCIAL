import { useState, useEffect } from 'react'
import { collection, query, orderBy, getDocs, limit, where } from 'firebase/firestore'
import { db } from '../firebase'
import PostCard from '../components/PostCard'
import { Link } from 'react-router-dom'
import { Search, Loader2, Hash } from 'lucide-react'

const TRENDING_TAGS = ['anchor', 'global', 'news', 'vibes', 'art', 'music', 'tech', 'gaming', 'food', 'travel']

export default function ExplorePage() {
  const [searchQ, setSearchQ] = useState('')
  const [results, setResults] = useState([])
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(40))
    getDocs(q).then(snap => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
  }, [])

  async function search(e) {
    e.preventDefault()
    if (!searchQ.trim()) return
    setSearching(true)

    // Search users by username
    const usersQ = query(
      collection(db, 'users'),
      where('username', '>=', searchQ.toLowerCase()),
      where('username', '<=', searchQ.toLowerCase() + ''),
      limit(5)
    )
    const usersSnap = await getDocs(usersQ)
    const byUsername = usersSnap.docs.map(d => ({ id: d.id, ...d.data(), _type: 'user' }))

    // Search users by display name (case-insensitive)
    const namesQ = query(
      collection(db, 'users'),
      where('displayNameLower', '>=', searchQ.toLowerCase()),
      where('displayNameLower', '<=', searchQ.toLowerCase() + ''),
      limit(5)
    )
    const namesSnap = await getDocs(namesQ)
    const byName = namesSnap.docs.map(d => ({ id: d.id, ...d.data(), _type: 'user' }))
    const seen = new Set(byUsername.map(u => u.id))
    const users = [...byUsername, ...byName.filter(u => !seen.has(u.id))]

    // Search posts by tag
    const tag = searchQ.replace('#', '').toLowerCase()
    const postsQ = query(
      collection(db, 'posts'),
      where('tags', 'array-contains', tag),
      orderBy('createdAt', 'desc'),
      limit(20)
    )
    const postsSnap = await getDocs(postsQ)
    const tagged = postsSnap.docs.map(d => ({ id: d.id, ...d.data(), _type: 'post' }))

    setResults([...users, ...tagged])
    setSearching(false)
  }

  const userResults = results.filter(r => r._type === 'user')
  const postResults = results.filter(r => r._type === 'post')

  return (
    <div>
      <div className="sticky top-0 bg-[#0f172a]/90 backdrop-blur border-b border-slate-700/50 px-4 py-3 z-10">
        <form onSubmit={search} className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search users or #tags…"
            className="w-full bg-slate-800 border border-slate-700 rounded-full pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
          />
        </form>
      </div>

      {results.length > 0 ? (
        <div>
          {userResults.length > 0 && (
            <div>
              <p className="px-4 py-2 text-xs text-slate-500 font-semibold uppercase tracking-wider">Users</p>
              {userResults.map(u => (
                <Link key={u.id} to={`/profile/${u.username}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800 transition">
                  <img src={u.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                  <div>
                    <p className="text-sm font-semibold text-white">{u.displayName}</p>
                    <p className="text-xs text-slate-500">@{u.username}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
          {postResults.length > 0 && (
            <div>
              <p className="px-4 py-2 text-xs text-slate-500 font-semibold uppercase tracking-wider border-t border-slate-700/50">Posts</p>
              {postResults.map(p => <PostCard key={p.id} post={p} />)}
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* Trending tags */}
          <div className="p-4 border-b border-slate-700/50">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-3">Trending Tags</p>
            <div className="flex flex-wrap gap-2">
              {TRENDING_TAGS.map(tag => (
                <button
                  key={tag}
                  onClick={() => { setSearchQ(tag); }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-sky-500/20 border border-slate-700 hover:border-sky-500/50 rounded-full text-sm text-slate-300 hover:text-sky-400 transition"
                >
                  <Hash size={12} />#{tag}
                </button>
              ))}
            </div>
          </div>

          {/* Recent posts */}
          <p className="px-4 py-2 text-xs text-slate-500 font-semibold uppercase tracking-wider">Recent Posts</p>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-sky-400" size={24} /></div>
          ) : (
            posts.map(p => <PostCard key={p.id} post={p} />)
          )}
        </div>
      )}
    </div>
  )
}
