import { useState, useEffect, useRef } from 'react'
import {
  collection, query, where, orderBy, onSnapshot, addDoc,
  serverTimestamp, getDocs, limit, doc, updateDoc, or
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { Search, Send, MessageCircle, Loader2, ArrowLeft } from 'lucide-react'
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
  const bottomRef = useRef(null)

  // Load conversations
  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid),
      orderBy('lastMessageAt', 'desc')
    )
    return onSnapshot(q,
      snap => {
        setConvos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      err => {
        console.error('Messages error:', err)
        setError(err.message)
        setLoading(false)
      }
    )
  }, [user])

  // Load messages for active convo
  useEffect(() => {
    if (!activeConvo) return
    const q = query(
      collection(db, 'conversations', activeConvo.id, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    )
    return onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    })
  }, [activeConvo])

  async function searchUsers(e) {
    e.preventDefault()
    if (!searchQ.trim()) return
    const q = query(
      collection(db, 'users'),
      where('username', '>=', searchQ.toLowerCase()),
      where('username', '<=', searchQ.toLowerCase() + ''),
      limit(8)
    )
    const snap = await getDocs(q)
    setSearchResults(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.id !== user.uid))
  }

  async function startConvo(otherUser) {
    const existing = conversations.find(c =>
      c.participants.includes(user.uid) && c.participants.includes(otherUser.id)
    )
    if (existing) {
      setActiveConvo(existing)
      setSearchQ('')
      setSearchResults([])
      return
    }
    const ref = await addDoc(collection(db, 'conversations'), {
      participants: [user.uid, otherUser.id],
      participantProfiles: {
        [user.uid]: { displayName: profile?.displayName, avatar: profile?.avatar, username: profile?.username },
        [otherUser.id]: { displayName: otherUser.displayName, avatar: otherUser.avatar, username: otherUser.username },
      },
      lastMessage: '',
      lastMessageAt: serverTimestamp(),
    })
    setActiveConvo({ id: ref.id, participants: [user.uid, otherUser.id], participantProfiles: {
      [user.uid]: { displayName: profile?.displayName, avatar: profile?.avatar, username: profile?.username },
      [otherUser.id]: { displayName: otherUser.displayName, avatar: otherUser.avatar, username: otherUser.username },
    } })
    setSearchQ('')
    setSearchResults([])
  }

  async function sendMessage(e) {
    e.preventDefault()
    if (!text.trim() || !activeConvo) return
    const msg = text.trim()
    setText('')
    await addDoc(collection(db, 'conversations', activeConvo.id, 'messages'), {
      text: msg,
      senderId: user.uid,
      senderName: profile?.displayName,
      createdAt: serverTimestamp(),
    })
    await updateDoc(doc(db, 'conversations', activeConvo.id), {
      lastMessage: msg,
      lastMessageAt: serverTimestamp(),
    })
  }

  const otherProfile = (convo) => {
    const otherId = convo.participants.find(p => p !== user?.uid)
    return convo.participantProfiles?.[otherId]
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className={`${activeConvo ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-64 border-r border-slate-700/50`}>
        <div className="p-4 border-b border-slate-700/50">
          <h1 className="font-semibold text-white mb-3 flex items-center gap-2">
            <MessageCircle size={18} className="text-sky-400" /> Messages
          </h1>
          <form onSubmit={searchUsers} className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search users to message…"
              className="w-full bg-slate-800 border border-slate-700 rounded-full pl-8 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
            />
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
              <p className="opacity-80 mb-2">{error}</p>
              <p className="text-red-300">Fix: Firebase Console → Firestore → Indexes → Add index:<br/>
                Collection: <strong>conversations</strong><br/>
                Fields: <strong>participants (Arrays), lastMessageAt (Desc)</strong>
              </p>
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-center text-slate-500 text-sm py-8">No conversations yet.<br />Search for someone above!</p>
          ) : (
            conversations.map(c => {
              const other = otherProfile(c)
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveConvo(c)}
                  className={`flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-800 transition text-left ${activeConvo?.id === c.id ? 'bg-slate-800' : ''}`}
                >
                  <img src={other?.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${other?.username}`} alt="" className="w-10 h-10 rounded-full object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{other?.displayName}</p>
                    <p className="text-xs text-slate-500 truncate">{c.lastMessage || 'No messages yet'}</p>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Chat window */}
      {activeConvo ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat header */}
          <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-3">
            <button onClick={() => setActiveConvo(null)} className="md:hidden p-1 text-slate-400 hover:text-white">
              <ArrowLeft size={20} />
            </button>
            {(() => {
              const other = otherProfile(activeConvo)
              return (
                <>
                  <img src={other?.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                  <div>
                    <p className="text-sm font-semibold text-white">{other?.displayName}</p>
                    <p className="text-xs text-slate-500">@{other?.username}</p>
                  </div>
                </>
              )
            })()}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto anchor-scrollbar p-4 space-y-3">
            {messages.map(m => {
              const isMe = m.senderId === user.uid
              return (
                <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs px-4 py-2 rounded-2xl text-sm ${
                    isMe ? 'bg-sky-500 text-white rounded-br-sm' : 'bg-slate-700 text-slate-100 rounded-bl-sm'
                  }`}>
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

          {/* Input */}
          <form onSubmit={sendMessage} className="p-4 border-t border-slate-700/50 flex gap-2 items-end">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e) } }}
              placeholder="Type a message…"
              rows={3}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition resize-none"
            />
            <button
              type="submit"
              disabled={!text.trim()}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-sky-500 hover:bg-sky-400 text-white transition disabled:opacity-40"
            >
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
    </div>
  )
}
