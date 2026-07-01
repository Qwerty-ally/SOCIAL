import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, orderBy, getDocs, doc, deleteDoc, updateDoc, limit } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { ArrowLeft, Loader2, Trash2, Search, Crown, Users, Star, Shield } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

export default function AdminPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (profile?.role !== 'owner') { navigate('/'); return }
    loadUsers()
  }, [profile])

  async function loadUsers() {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'users'), orderBy('lastSeen', 'desc'), limit(200)))
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch {
      // fallback without ordering (if no index)
      const snap = await getDocs(collection(db, 'users'))
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }
    setLoading(false)
  }

  async function deleteUser(u) {
    if (!confirm(`Delete ${u.displayName}'s account? This removes their profile from the platform.`)) return
    try {
      await deleteDoc(doc(db, 'users', u.id))
      setUsers(prev => prev.filter(x => x.id !== u.id))
      toast.success(`${u.displayName}'s account deleted`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const now = Date.now()
  const isOnline = (u) => {
    if (!u.lastSeen) return false
    const seen = u.lastSeen?.toDate?.() ?? new Date(u.lastSeen)
    return now - seen.getTime() < 5 * 60 * 1000
  }

  const filtered = users.filter(u => {
    if (filter !== 'all' && u.role !== filter) return false
    if (search && !u.displayName?.toLowerCase().includes(search.toLowerCase()) && !u.username?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const counts = {
    all: users.length,
    owner: users.filter(u => u.role === 'owner').length,
    member: users.filter(u => u.role === 'member').length,
    fan: users.filter(u => u.role === 'fan').length,
  }

  const online = users.filter(isOnline).length

  if (profile?.role !== 'owner') return null

  return (
    <div>
      <div className="sticky top-0 bg-[#0f172a]/90 backdrop-blur border-b border-slate-700/50 px-4 py-3 flex items-center gap-3 z-10">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="font-semibold text-white">Admin Panel</h1>
          <p className="text-xs text-slate-500">{users.length} users · <span className="text-green-400">{online} online</span></p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'All', value: counts.all, color: 'text-white', icon: <Users size={14} /> },
            { label: 'Owners', value: counts.owner, color: 'text-amber-400', icon: <Crown size={14} /> },
            { label: 'Members', value: counts.member, color: 'text-sky-400', icon: <Shield size={14} /> },
            { label: 'Fans', value: counts.fan, color: 'text-purple-400', icon: <Star size={14} /> },
          ].map(s => (
            <div key={s.label} className="bg-[#1e293b] rounded-xl p-3 text-center">
              <div className={`flex items-center justify-center gap-1 mb-1 ${s.color}`}>{s.icon}</div>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search users…"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
          />
        </div>

        {/* Role filter tabs */}
        <div className="flex gap-2">
          {['all', 'owner', 'member', 'fan'].map(r => (
            <button
              key={r}
              onClick={() => setFilter(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition ${filter === r ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              {r} ({counts[r] ?? 0})
            </button>
          ))}
        </div>

        {/* User list */}
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-sky-400" size={24} /></div>
        ) : (
          <div className="space-y-2">
            {filtered.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-3 bg-[#1e293b] rounded-xl hover:bg-[#243044] transition">
                <div className="relative">
                  <img
                    src={u.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${u.username}`}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  {isOnline(u) && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-[#1e293b]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-white truncate">{u.displayName}</span>
                    <RoleBadge role={u.role} />
                  </div>
                  <p className="text-xs text-slate-400">@{u.username}</p>
                  {u.lastSeen && (
                    <p className="text-xs text-slate-600 mt-0.5">
                      {isOnline(u) ? '🟢 Online now' : `Last seen ${formatDistanceToNow(u.lastSeen?.toDate?.() ?? new Date(u.lastSeen), { addSuffix: true })}`}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {u.role !== 'owner' && (
                    <button
                      onClick={() => deleteUser(u)}
                      className="p-2 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition"
                      title="Delete account"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-slate-500 py-8">No users found</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function RoleBadge({ role }) {
  if (role === 'owner') return <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-full">OWNER</span>
  if (role === 'fan') return <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] font-bold rounded-full">FAN</span>
  return <span className="px-1.5 py-0.5 bg-sky-500/20 text-sky-400 text-[10px] font-bold rounded-full">MEMBER</span>
}
