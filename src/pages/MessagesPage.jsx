import { useState, useEffect, useRef } from 'react'
import {
  collection, query, where, orderBy, onSnapshot, addDoc,
  serverTimestamp, getDocs, limit, doc, updateDoc, or
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { Search, Send, MessageCircle, Loader2, ArrowLeft, Users, Plus, X, Check, Settings, UserMinus, UserPlus } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

export default function MessagesPage() {
  const { user, profile } = useAuth()
  const [conversations, setConvos] = useState([])
  const [activeConvo, setActiveConvo] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [showGroupSettings, setShowGroupSettings] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid),
      orderBy('lastMessageAt', 'desc')
    )
    return onSnapshot(q,
      snap => { setConvos(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) },
      err => { setError(err.message); setLoading(false) }
    )
  }, [user])

  useEffect(() => {
    if (!activeConvo) return
    const q = query(collection(db, 'conversations', activeConvo.id, 'messages'), orderBy('createdAt', 'asc'), limit(100))
    return onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    })
  }, [activeConvo])

  async function searchUsers(e) {
    e.preventDefault()
    if (!searchQ.trim()) return
    const q = query(collection(db, 'users'), where('username', '>=', searchQ.toLowerCase()), where('username', '<=', searchQ.toLowerCase() + '￿'), limit(8))
    const snap = await getDocs(q)
    setSearchResults(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.id !== user.uid))
  }

  async function startConvo(otherUser) {
    const existing = conversations.find(c => !c.isGroup && c.participants.includes(user.uid) && c.participants.includes(otherUser.id))
    if (existing) { setActiveConvo(existing); setSearchQ(''); setSearchResults([]); return }
    const ref = await addDoc(collection(db, 'conversations'), {
      participants: [user.uid, otherUser.id],
      participantProfiles: {
        [user.uid]: { displayName: profile?.displayName, avatar: profile?.avatar, username: profile?.username },
        [otherUser.id]: { displayName: otherUser.displayName, avatar: otherUser.avatar, username: otherUser.username },
      },
      isGroup: false,
      lastMessage: '',
      lastMessageAt: serverTimestamp(),
    })
    setActiveConvo({ id: ref.id, participants: [user.uid, otherUser.id], participantProfiles: {
      [user.uid]: { displayName: profile?.displayName, avatar: profile?.avatar, username: profile?.username },
      [otherUser.id]: { displayName: otherUser.displayName, avatar: otherUser.avatar, username: otherUser.username },
    }, isGroup: false })
    setSearchQ(''); setSearchResults([])
  }

  async function sendMessage(e) {
    e.preventDefault()
    if (!text.trim() || !activeConvo) return
    const msg = text.trim()
    setText('')
    await addDoc(collection(db, 'conversations', activeConvo.id, 'messages'), {
      text: msg, senderId: user.uid, senderName: profile?.displayName, createdAt: serverTimestamp(),
    })
    await updateDoc(doc(db, 'conversations', activeConvo.id), { lastMessage: msg, lastMessageAt: serverTimestamp() })
  }

  const otherProfile = (convo) => {
    if (convo.isGroup) return null
    const otherId = convo.participants.find(p => p !== user?.uid)
    return convo.participantProfiles?.[otherId]
  }

  const convoName = (convo) => {
    if (convo.isGroup) return convo.groupName || 'Group'
    return otherProfile(convo)?.displayName || 'Unknown'
  }

  const convoAvatar = (convo) => {
    if (convo.isGroup) return null
    const op = otherProfile(convo)
    return op?.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${op?.username}`
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className={`${activeConvo ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-64 border-r border-slate-700/50`}>
        <div className="p-4 border-b border-slate-700/50">
          <div className="flex items-center justify-between mb-3">
            <h1 className="font-semibold text-white flex items-center gap-2">
              <MessageCircle size={18} className="text-sky-400" /> Messages
            </h1>
            <button onClick={() => setShowGroupModal(true)} className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition" title="New group">
              <Users size={16} />
            </button>
          </div>
          <form onSubmit={searchUsers} className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search users…"
              className="w-full bg-slate-800 border border-slate-700 rounded-full pl-8 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition" />
          </form>
          {searchResults.map(u => (
            <button key={u.id} onClick={() => startConvo(u)} className="flex items-center gap-2 w-full p-2 mt-1 rounded-xl hover:bg-slate-800 transition text-left">
              <img src={u.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
              <div>
                <p className="text-sm font-medium text-white">{u.displayName}</p>
                <p className="text-xs text-slate-500">@{u.username}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto anchor-scrollbar">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-sky-400" size={20} /></div>
          ) : error ? (
            <div className="m-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs">
              <p className="font-semibold mb-1">Failed to load messages</p>
              <p className="opacity-80">{error}</p>
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-center text-slate-500 text-sm py-8">No conversations yet.</p>
          ) : conversations.map(c => (
            <button key={c.id} onClick={() => setActiveConvo(c)}
              className={`flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-800 transition text-left ${activeConvo?.id === c.id ? 'bg-slate-800' : ''}`}>
              {c.isGroup ? (
                <div className="w-10 h-10 rounded-full bg-sky-500/20 border border-sky-500/40 flex items-center justify-center shrink-0">
                  <Users size={16} className="text-sky-400" />
                </div>
              ) : (
                <img src={convoAvatar(c)} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{convoName(c)}</p>
                <p className="text-xs text-slate-500 truncate">{c.lastMessage || 'No messages yet'}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat window */}
      {activeConvo ? (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-3">
            <button onClick={() => setActiveConvo(null)} className="md:hidden p-1 text-slate-400 hover:text-white"><ArrowLeft size={20} /></button>
            {activeConvo.isGroup ? (
              <div className="w-9 h-9 rounded-full bg-sky-500/20 border border-sky-500/40 flex items-center justify-center">
                <Users size={16} className="text-sky-400" />
              </div>
            ) : (
              <img src={convoAvatar(activeConvo)} alt="" className="w-9 h-9 rounded-full object-cover" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">{convoName(activeConvo)}</p>
              {activeConvo.isGroup && (
                <p className="text-xs text-slate-500">{activeConvo.participants.length} members</p>
              )}
            </div>
            {activeConvo.isGroup && (
              <button onClick={() => setShowGroupSettings(true)} className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition">
                <Settings size={17} />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto anchor-scrollbar p-4 space-y-3">
            {messages.map(m => {
              const isMe = m.senderId === user.uid
              return (
                <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {activeConvo.isGroup && !isMe && (
                    <p className="text-[10px] text-slate-500 mb-0.5 px-1">{m.senderName}</p>
                  )}
                  <div className={`max-w-xs px-4 py-2 rounded-2xl text-sm ${isMe ? 'bg-sky-500 text-white rounded-br-sm' : 'bg-slate-700 text-slate-100 rounded-bl-sm'}`}>
                    {m.text}
                    <div className={`text-[10px] mt-1 ${isMe ? 'text-sky-200' : 'text-slate-400'}`}>
                      {m.createdAt?.toDate ? formatDistanceToNow(m.createdAt.toDate(), { addSuffix: true }) : ''}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={sendMessage} className="p-4 border-t border-slate-700/50 flex gap-2 items-end">
            <textarea value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e) } }}
              placeholder="Type a message…" rows={3}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition resize-none" />
            <button type="submit" disabled={!text.trim()}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-sky-500 hover:bg-sky-400 text-white transition disabled:opacity-40">
              <Send size={16} />
            </button>
          </form>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-slate-500">
          <div className="text-center">
            <MessageCircle size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Select a conversation</p>
            <p className="text-sm mt-1">or search for someone to message</p>
          </div>
        </div>
      )}

      {/* Group creation modal */}
      {showGroupModal && (
        <GroupModal user={user} profile={profile} conversations={conversations} onClose={() => setShowGroupModal(false)}
          onCreated={convo => { setActiveConvo(convo); setShowGroupModal(false) }} />
      )}

      {/* Group settings modal */}
      {showGroupSettings && activeConvo?.isGroup && (
        <GroupSettingsModal
          convo={activeConvo}
          currentUserId={user.uid}
          onClose={() => setShowGroupSettings(false)}
          onUpdate={updated => {
            setActiveConvo(updated)
            setShowGroupSettings(false)
          }}
        />
      )}
    </div>
  )
}

function GroupModal({ user, profile, onClose, onCreated }) {
  const [groupName, setGroupName] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState([])
  const [creating, setCreating] = useState(false)

  async function search(e) {
    e.preventDefault()
    if (!searchQ.trim()) return
    const q = query(collection(db, 'users'), where('username', '>=', searchQ.toLowerCase()), where('username', '<=', searchQ.toLowerCase() + '￿'), limit(8))
    const snap = await getDocs(q)
    setResults(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.id !== user.uid))
  }

  function toggle(u) {
    setSelected(s => s.find(x => x.id === u.id) ? s.filter(x => x.id !== u.id) : [...s, u])
  }

  async function create() {
    if (!groupName.trim()) return toast.error('Enter a group name')
    if (selected.length < 2) return toast.error('Add at least 2 people')
    setCreating(true)
    const participants = [user.uid, ...selected.map(u => u.id)]
    const participantProfiles = {
      [user.uid]: { displayName: profile?.displayName, avatar: profile?.avatar, username: profile?.username },
      ...Object.fromEntries(selected.map(u => [u.id, { displayName: u.displayName, avatar: u.avatar, username: u.username }]))
    }
    const ref = await addDoc(collection(db, 'conversations'), {
      participants, participantProfiles,
      isGroup: true,
      groupName: groupName.trim(),
      lastMessage: '',
      lastMessageAt: serverTimestamp(),
    })
    onCreated({ id: ref.id, participants, participantProfiles, isGroup: true, groupName: groupName.trim() })
    setCreating(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-[#1e293b] rounded-2xl border border-slate-700 w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white flex items-center gap-2"><Users size={18} className="text-sky-400" /> New Group</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Group name"
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500" />

        <form onSubmit={search} className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search users to add…"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500" />
        </form>

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selected.map(u => (
              <span key={u.id} className="flex items-center gap-1 bg-sky-500/20 text-sky-400 text-xs px-2 py-1 rounded-full">
                {u.displayName} <button onClick={() => toggle(u)}><X size={10} /></button>
              </span>
            ))}
          </div>
        )}

        <div className="space-y-1 max-h-48 overflow-y-auto anchor-scrollbar">
          {results.map(u => (
            <button key={u.id} onClick={() => toggle(u)}
              className="flex items-center gap-2 w-full p-2 rounded-xl hover:bg-slate-800 transition text-left">
              <img src={u.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{u.displayName}</p>
                <p className="text-xs text-slate-500">@{u.username}</p>
              </div>
              {selected.find(x => x.id === u.id) && <Check size={14} className="text-sky-400" />}
            </button>
          ))}
        </div>

        <button onClick={create} disabled={creating}
          className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl font-semibold text-sm transition disabled:opacity-50">
          {creating ? 'Creating…' : `Create Group (${selected.length + 1} members)`}
        </button>
      </div>
    </div>
  )
}

function GroupSettingsModal({ convo, currentUserId, onClose, onUpdate }) {
  const [searchQ, setSearchQ] = useState('')
  const [results, setResults] = useState([])
  const [saving, setSaving] = useState(false)

  const members = Object.entries(convo.participantProfiles || {})

  async function search(e) {
    e.preventDefault()
    if (!searchQ.trim()) return
    const q = query(collection(db, 'users'), where('username', '>=', searchQ.toLowerCase()), where('username', '<=', searchQ.toLowerCase() + '￿'), limit(8))
    const snap = await getDocs(q)
    setResults(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => !convo.participants.includes(u.id)))
  }

  async function addMember(u) {
    setSaving(true)
    const newParticipants = [...convo.participants, u.id]
    const newProfiles = { ...convo.participantProfiles, [u.id]: { displayName: u.displayName, avatar: u.avatar, username: u.username } }
    await updateDoc(doc(db, 'conversations', convo.id), { participants: newParticipants, participantProfiles: newProfiles })
    toast.success(`Added ${u.displayName}`)
    setResults(r => r.filter(x => x.id !== u.id))
    onUpdate({ ...convo, participants: newParticipants, participantProfiles: newProfiles })
    setSaving(false)
  }

  async function removeMember(uid) {
    if (uid === currentUserId && !confirm('Leave this group?')) return
    if (uid !== currentUserId && !confirm('Remove this member?')) return
    setSaving(true)
    const newParticipants = convo.participants.filter(p => p !== uid)
    const newProfiles = { ...convo.participantProfiles }
    delete newProfiles[uid]
    await updateDoc(doc(db, 'conversations', convo.id), { participants: newParticipants, participantProfiles: newProfiles })
    toast.success(uid === currentUserId ? 'You left the group' : 'Member removed')
    onUpdate({ ...convo, participants: newParticipants, participantProfiles: newProfiles })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-[#1e293b] rounded-2xl border border-slate-700 w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white flex items-center gap-2"><Settings size={16} className="text-sky-400" /> Manage Group</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        {/* Current members */}
        <div>
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">Members ({members.length})</p>
          <div className="space-y-1 max-h-48 overflow-y-auto anchor-scrollbar">
            {members.map(([uid, p]) => (
              <div key={uid} className="flex items-center gap-2 p-2 rounded-xl">
                <img src={p.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${p.username}`} alt="" className="w-8 h-8 rounded-full object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{p.displayName}</p>
                  <p className="text-xs text-slate-500">@{p.username}</p>
                </div>
                <button
                  onClick={() => removeMember(uid)}
                  disabled={saving}
                  className="p-1.5 rounded-full text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition"
                  title={uid === currentUserId ? 'Leave group' : 'Remove'}
                >
                  <UserMinus size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Add members */}
        <div>
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">Add Member</p>
          <form onSubmit={search} className="relative mb-2">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search by username…"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500" />
          </form>
          <div className="space-y-1 max-h-36 overflow-y-auto anchor-scrollbar">
            {results.map(u => (
              <div key={u.id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-slate-800">
                <img src={u.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${u.username}`} alt="" className="w-8 h-8 rounded-full object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{u.displayName}</p>
                  <p className="text-xs text-slate-500">@{u.username}</p>
                </div>
                <button onClick={() => addMember(u)} disabled={saving} className="p-1.5 rounded-full text-slate-500 hover:text-sky-400 hover:bg-sky-400/10 transition">
                  <UserPlus size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
