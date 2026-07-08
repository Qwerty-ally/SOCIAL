import { useState, useEffect, useRef } from 'react'
import {
  collection, query, orderBy, limit, startAfter,
  getDocs, updateDoc, doc, serverTimestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Shield, Search, UserX, ExternalLink, ChevronDown, Crown, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_SIZE = 40

const ROLE_STYLE = {
  owner:  'text-amber-400 bg-amber-400/10',
  member: 'text-sky-400 bg-sky-400/10',
  fan:    'text-purple-400 bg-purple-400/10',
}

export default function MembersPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastDoc, setLastDoc] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(null)
  const [confirmKick, setConfirmKick] = useState(null)
  const [now, setNow] = useState(Date.now())
  const removeTimers = useRef({})

  const TEN_MIN = 10 * 60 * 1000

  function getBannedMs(bannedAt) {
    if (!bannedAt) return 0
    if (bannedAt instanceof Date) return bannedAt.getTime()
    if (typeof bannedAt.toDate === 'function') return bannedAt.toDate().getTime()
    if (bannedAt.seconds) return bannedAt.seconds * 1000
    return 0
  }

  function scheduleRemoval(uid, bannedAt) {
    if (removeTimers.current[uid]) return
    const ba = getBannedMs(bannedAt)
    if (!ba) return
    const remaining = TEN_MIN - (Date.now() - ba)
    if (remaining <= 0) return
    removeTimers.current[uid] = setTimeout(() => {
      setMembers(prev => prev.filter(m => m.id !== uid))
      delete removeTimers.current[uid]
    }, remaining)
  }

  useEffect(() => {
    if (profile && profile.role !== 'owner') navigate('/', { replace: true })
  }, [profile])

  useEffect(() => { fetchPage() }, [])

  // Re-check every 30 s so the hide happens within 30 s of the 10-min mark
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Schedule removal for any recently-banned members already in the list
  useEffect(() => {
    members.forEach(m => {
      if (m.banned && m.bannedAt) scheduleRemoval(m.id, m.bannedAt)
    })
  }, [members])

  async function fetchPage(after = null) {
    try {
      let q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE))
      if (after) q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), startAfter(after), limit(PAGE_SIZE))
      const snap = await getDocs(q)
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setMembers(prev => after ? [...prev, ...docs] : docs)
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null)
      setHasMore(snap.docs.length === PAGE_SIZE)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function kickMember(uid, name) {
    setBusy(uid)
    try {
      await updateDoc(doc(db, 'users', uid), { banned: true, bannedAt: serverTimestamp() })
      const localNow = new Date()
      setMembers(prev => prev.map(m => m.id === uid ? { ...m, banned: true, bannedAt: localNow } : m))
      toast.success(`${name} has been kicked`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(null)
      setConfirmKick(null)
    }
  }

  async function unbanMember(uid, name) {
    setBusy(uid)
    try {
      await updateDoc(doc(db, 'users', uid), { banned: false })
      setMembers(prev => prev.map(m => m.id === uid ? { ...m, banned: false } : m))
      toast.success(`${name} has been reinstated`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  const visible = members.filter(m => {
    if (!m.banned) return true
    const ba = getBannedMs(m.bannedAt)
    if (!ba) return true // no timestamp yet — keep showing
    return now - ba < TEN_MIN
  })

  const filtered = search.trim()
    ? visible.filter(m =>
        m.displayName?.toLowerCase().includes(search.toLowerCase()) ||
        m.username?.toLowerCase().includes(search.toLowerCase()) ||
        m.email?.toLowerCase().includes(search.toLowerCase())
      )
    : visible

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2.5 mb-6">
        <Shield size={20} className="text-amber-400 shrink-0" />
        <h1 className="text-xl font-bold text-white">Members</h1>
        <span className="text-slate-500 text-sm">{members.length}{hasMore ? '+' : ''} accounts</span>
      </div>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <input
          type="text"
          placeholder="Search name, username, or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-slate-800 text-white text-sm pl-9 pr-4 py-2.5 rounded-xl border border-slate-700 placeholder-slate-500 focus:outline-none focus:border-sky-500"
        />
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-16 text-sm">Loading…</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(member => (
            <div
              key={member.id}
              className={`flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border transition ${
                member.banned ? 'border-red-900/50 bg-red-950/10' : 'border-slate-700/50'
              }`}
            >
              <img
                src={member.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${member.username}`}
                alt=""
                className="w-10 h-10 rounded-full object-cover shrink-0"
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white truncate max-w-[140px]">
                    {member.displayName}
                  </span>
                  {member.role === 'owner' && <Crown size={11} className="text-amber-400 shrink-0" />}
                  <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${ROLE_STYLE[member.role] || ROLE_STYLE.member}`}>
                    {member.role || 'member'}
                  </span>
                  {member.banned && (
                    <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full text-red-400 bg-red-400/10">
                      banned
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 truncate">@{member.username}</p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => navigate(`/profile/${member.username}`)}
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
                  title="View profile"
                >
                  <ExternalLink size={14} />
                </button>

                {member.id !== profile?.id && (
                  member.banned ? (
                    <button
                      onClick={() => unbanMember(member.id, member.displayName)}
                      disabled={busy === member.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-green-400 hover:bg-green-400/10 transition disabled:opacity-40"
                    >
                      <RotateCcw size={12} />
                      Unban
                    </button>
                  ) : confirmKick === member.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setConfirmKick(null)}
                        className="px-2 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => kickMember(member.id, member.displayName)}
                        disabled={busy === member.id}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition disabled:opacity-40"
                      >
                        Confirm
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmKick(member.id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition"
                      title="Kick member"
                    >
                      <UserX size={14} />
                    </button>
                  )
                )}
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="text-center text-slate-500 py-12 text-sm">No members found</div>
          )}

          {!search && hasMore && (
            <button
              onClick={() => fetchPage(lastDoc)}
              className="w-full py-3 text-sm text-slate-400 hover:text-white flex items-center justify-center gap-1.5 transition"
            >
              <ChevronDown size={15} /> Load more
            </button>
          )}
        </div>
      )}
    </div>
  )
}
