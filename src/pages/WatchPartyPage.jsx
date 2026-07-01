import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  doc, getDoc, addDoc, setDoc, onSnapshot, collection, serverTimestamp,
  query, orderBy, limit, updateDoc
} from 'firebase/firestore'
import { db } from '../firebase'
import { uploadMedia } from '../lib/cloudinary'
import { useAuth } from '../context/AuthContext'
import {
  ArrowLeft, Play, Pause, Users, Upload, Loader2, Send, MessageCircle
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function WatchPartyPage() {
  const { partyId } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [party, setParty] = useState(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(!partyId)
  const [uploading, setUploading] = useState(false)
  const [messages, setMessages] = useState([])
  const [chatText, setChatText] = useState('')
  const videoRef = useRef(null)
  const isHost = party?.hostId === user?.uid
  const syncRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!partyId) return
    const unsub = onSnapshot(doc(db, 'watchParties', partyId), snap => {
      if (!snap.exists()) { navigate('/'); return }
      const data = { id: snap.id, ...snap.data() }
      setParty(data)
      setLoading(false)

      if (!isHost && videoRef.current) {
        const vid = videoRef.current
        const diff = Math.abs(vid.currentTime - data.currentTime)
        if (diff > 2) vid.currentTime = data.currentTime
        if (data.isPlaying && vid.paused) vid.play().catch(() => {})
        if (!data.isPlaying && !vid.paused) vid.pause()
      }
    })
    return () => unsub()
  }, [partyId])

  useEffect(() => {
    if (!partyId) return
    const q = query(collection(db, 'watchParties', partyId, 'chat'), orderBy('createdAt', 'asc'), limit(150))
    return onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    })
  }, [partyId])

  async function createParty(videoFile) {
    setUploading(true)
    try {
      const result = await uploadMedia(videoFile)
      const ref = await addDoc(collection(db, 'watchParties'), {
        hostId: user.uid,
        hostName: profile.displayName,
        hostAvatar: profile.avatar || '',
        videoUrl: result.url,
        isPlaying: false,
        currentTime: 0,
        createdAt: serverTimestamp(),
      })
      navigate(`/watch-party/${ref.id}`, { replace: true })
    } catch (err) {
      toast.error(err.message)
    }
    setUploading(false)
  }

  function onHostTimeUpdate() {
    if (!isHost || !videoRef.current || !partyId) return
    clearTimeout(syncRef.current)
    syncRef.current = setTimeout(() => {
      updateDoc(doc(db, 'watchParties', partyId), {
        currentTime: videoRef.current?.currentTime ?? 0,
        isPlaying: !videoRef.current?.paused,
      }).catch(() => {})
    }, 1500)
  }

  async function hostTogglePlay() {
    if (!isHost || !videoRef.current) return
    const vid = videoRef.current
    if (vid.paused) { vid.play(); await updateDoc(doc(db, 'watchParties', partyId), { isPlaying: true, currentTime: vid.currentTime }) }
    else { vid.pause(); await updateDoc(doc(db, 'watchParties', partyId), { isPlaying: false, currentTime: vid.currentTime }) }
  }

  async function sendChat(e) {
    e.preventDefault()
    if (!chatText.trim() || !partyId) return
    const msg = chatText.trim()
    setChatText('')
    await addDoc(collection(db, 'watchParties', partyId, 'chat'), {
      uid: user.uid, displayName: profile?.displayName, avatar: profile?.avatar || '',
      text: msg, createdAt: serverTimestamp(),
    })
  }

  if (creating || !partyId) {
    return <CreateParty onUpload={createParty} uploading={uploading} onCancel={() => navigate(-1)} />
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="animate-spin text-sky-400" size={28} />
    </div>
  )

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4 h-[calc(100dvh-4rem)]">
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition">
            <ArrowLeft size={20} />
          </button>
          {party && (
            <div className="flex items-center gap-2">
              <img src={party.hostAvatar} alt="" className="w-8 h-8 rounded-full object-cover" />
              <div>
                <p className="text-sm font-semibold text-white">{party.hostName}'s Watch Party</p>
                <p className="text-xs text-slate-400 flex items-center gap-1"><Users size={10} /> {isHost ? 'You are the host' : 'Watching together'}</p>
              </div>
            </div>
          )}
        </div>

        <div className="relative bg-black rounded-2xl overflow-hidden flex-1 min-h-0">
          <video
            ref={videoRef}
            src={party?.videoUrl}
            className="w-full h-full object-contain"
            onTimeUpdate={onHostTimeUpdate}
            onPlay={onHostTimeUpdate}
            onPause={onHostTimeUpdate}
            onSeeked={onHostTimeUpdate}
            controls={isHost}
            playsInline
          />
          {!isHost && party && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2">
              {party.isPlaying ? <Play size={12} className="fill-white" /> : <Pause size={12} className="fill-white" />}
              {party.isPlaying ? 'Playing' : 'Paused'} by host
            </div>
          )}
        </div>

        {isHost && (
          <div className="flex justify-center gap-4 mt-3">
            <button
              onClick={hostTogglePlay}
              className="px-6 py-2.5 bg-sky-500 hover:bg-sky-400 text-white rounded-full text-sm font-semibold transition flex items-center gap-2"
            >
              {party?.isPlaying ? <><Pause size={16} /> Pause for all</> : <><Play size={16} /> Play for all</>}
            </button>
          </div>
        )}
      </div>

      {/* Chat */}
      <div className="w-full lg:w-80 h-64 lg:h-auto flex flex-col bg-[#0f172a] rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-700/50 flex items-center gap-2 shrink-0">
          <MessageCircle size={14} className="text-sky-400" />
          <span className="text-sm font-semibold text-white">Watch Party Chat</span>
        </div>
        <div className="flex-1 overflow-y-auto anchor-scrollbar px-3 py-2 space-y-2 min-h-0">
          {messages.map(m => (
            <div key={m.id} className="flex gap-2 items-start">
              <img src={m.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${m.uid}`} alt="" className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5" />
              <div>
                <span className="text-[11px] font-semibold text-sky-400 mr-1">{m.displayName}</span>
                <span className="text-[13px] text-slate-200 break-words">{m.text}</span>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={sendChat} className="flex gap-2 p-2 border-t border-slate-700/50 shrink-0">
          <input
            value={chatText}
            onChange={e => setChatText(e.target.value)}
            placeholder="Say something…"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-full px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
          />
          <button type="submit" disabled={!chatText.trim()} className="w-8 h-8 flex items-center justify-center rounded-full bg-sky-500 hover:bg-sky-400 text-white transition disabled:opacity-40">
            <Send size={13} />
          </button>
        </form>
      </div>
    </div>
  )
}

function CreateParty({ onUpload, uploading, onCancel }) {
  const fileRef = useRef(null)

  function pick(e) {
    const f = e.target.files[0]
    if (!f) return
    if (f.size > 500 * 1024 * 1024) return toast.error('Video must be under 500MB')
    onUpload(f)
  }

  return (
    <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <div className="text-center">
        <div className="w-20 h-20 bg-sky-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Users size={36} className="text-sky-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Start a Watch Party</h2>
        <p className="text-slate-400 text-sm">Upload a video and watch it together in sync with friends</p>
      </div>

      <input type="file" ref={fileRef} accept="video/*" onChange={pick} className="hidden" />

      <button
        onClick={() => fileRef.current.click()}
        disabled={uploading}
        className="px-8 py-3 bg-sky-500 hover:bg-sky-400 text-white rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50"
      >
        {uploading ? <><Loader2 size={18} className="animate-spin" /> Uploading…</> : <><Upload size={18} /> Choose Video</>}
      </button>
      <button onClick={onCancel} className="text-slate-500 hover:text-white text-sm transition">Cancel</button>
    </div>
  )
}
