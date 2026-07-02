import { useState, useEffect, useRef } from 'react'
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { Send, MessageCircle, Ban, Mic } from 'lucide-react'
import toast from 'react-hot-toast'

export default function StreamChat({ streamId, isHost, isOwner, onInviteToStage, stagedUids, onUserBlocked }) {
  const { user, profile } = useAuth()
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!streamId) return
    const q = query(collection(db, 'streams', streamId, 'chat'), orderBy('createdAt', 'asc'), limit(200))
    return onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }, () => {})
  }, [streamId])

  async function send(e) {
    e.preventDefault()
    if (!text.trim() || !user || !streamId) return
    const msg = text.trim()
    setText('')
    await addDoc(collection(db, 'streams', streamId, 'chat'), {
      uid: user.uid,
      displayName: profile?.displayName || profile?.username || 'Viewer',
      username: profile?.username || '',
      avatar: profile?.avatar || '',
      text: msg,
      createdAt: serverTimestamp(),
    })
  }

  async function blockUser(uid, displayName) {
    if (!confirm(`Block ${displayName} from this stream?`)) return
    await updateDoc(doc(db, 'streams', streamId), { blockedUsers: arrayUnion(uid) })
    toast.success(`${displayName} has been blocked`)
    onUserBlocked?.(uid)
  }

  return (
    <div className="flex flex-col h-full bg-[#0f172a] rounded-2xl border border-slate-700/50 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-700/50 flex items-center gap-2 shrink-0">
        <MessageCircle size={14} className="text-sky-400" />
        <span className="text-sm font-semibold text-white">Live Chat</span>
      </div>

      <div className="flex-1 overflow-y-auto anchor-scrollbar px-3 py-2 space-y-2 min-h-0">
        {messages.length === 0 && (
          <p className="text-center text-slate-600 text-xs py-4">No messages yet. Say something!</p>
        )}
        {messages.map(m => (
          <div key={m.id} className="flex gap-2 items-start group">
            <img
              src={m.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${m.username}`}
              alt=""
              className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-semibold text-sky-400 mr-1.5">{m.displayName || m.username || 'Viewer'}</span>
              <span className="text-[13px] text-slate-200 break-words">{m.text}</span>
            </div>
            {(isHost || isOwner) && m.uid !== user?.uid && (
              <div className="md:opacity-0 md:group-hover:opacity-100 flex items-center gap-0.5 transition shrink-0">
                {onInviteToStage && (
                  <button
                    onClick={() => onInviteToStage(m.uid, m.displayName || m.username, m.avatar)}
                    disabled={stagedUids?.has(m.uid)}
                    className="p-1 rounded-full text-slate-600 hover:text-sky-400 hover:bg-sky-400/10 transition disabled:opacity-30 disabled:cursor-not-allowed"
                    title={stagedUids?.has(m.uid) ? 'Already on stage' : 'Invite to stage'}
                  >
                    <Mic size={12} />
                  </button>
                )}
                {isHost && (
                  <button
                    onClick={() => blockUser(m.uid, m.displayName)}
                    className="p-1 rounded-full text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition"
                    title="Block from stream"
                  >
                    <Ban size={12} />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex gap-2 p-2 border-t border-slate-700/50 shrink-0">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Say something…"
          maxLength={200}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-full px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-sky-500 hover:bg-sky-400 text-white transition disabled:opacity-40"
        >
          <Send size={13} />
        </button>
      </form>
    </div>
  )
}
