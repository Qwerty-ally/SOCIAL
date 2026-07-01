import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  doc, addDoc, onSnapshot, collection, serverTimestamp,
  query, orderBy, limit, updateDoc, deleteField
} from 'firebase/firestore'
import { db } from '../firebase'
import { uploadMedia } from '../lib/cloudinary'
import { useAuth } from '../context/AuthContext'
import {
  ArrowLeft, Play, Pause, Users, Upload, Loader2, Send,
  MessageCircle, Radio, Clock, X, Calendar
} from 'lucide-react'
import toast from 'react-hot-toast'

function useCountdownTo(isoString) {
  const [secsLeft, setSecsLeft] = useState(null)
  useEffect(() => {
    if (!isoString) { setSecsLeft(null); return }
    const tick = () => setSecsLeft(Math.max(0, Math.floor((new Date(isoString).getTime() - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [isoString])
  return secsLeft
}

function fmtCountdown(secs) {
  if (secs === null || secs === undefined) return null
  if (secs <= 0) return 'Starting now…'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return [h > 0 ? `${h}h` : null, `${String(m).padStart(2, '0')}m`, `${String(s).padStart(2, '0')}s`].filter(Boolean).join(' ')
}

export default function WatchPartyPage() {
  const { partyId } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [party, setParty] = useState(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState([])
  const [chatText, setChatText] = useState('')
  const [uploadingMain, setUploadingMain] = useState(false)
  const [scheduleInput, setScheduleInput] = useState('')
  const [showSchedulePicker, setShowSchedulePicker] = useState(false)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const videoRef = useRef(null)
  const syncRef = useRef(null)
  const bottomRef = useRef(null)
  const mainFileRef = useRef(null)
  const wentLiveRef = useRef(false)

  const isHost = party?.hostId === user?.uid
  const isStartingSoon = party?.status === 'starting-soon'
  const secsLeft = useCountdownTo(party?.scheduledStartAt)

  // Sync viewer video to host
  useEffect(() => {
    if (!partyId) return
    const unsub = onSnapshot(doc(db, 'watchParties', partyId), snap => {
      if (!snap.exists()) { navigate('/'); return }
      const data = { id: snap.id, ...snap.data() }
      setParty(data)
      setLoading(false)
      if (data.status === 'live' && !isHost && videoRef.current) {
        const vid = videoRef.current
        if (Math.abs(vid.currentTime - data.currentTime) > 2) vid.currentTime = data.currentTime
        if (data.isPlaying && vid.paused) vid.play().catch(() => {})
        if (!data.isPlaying && !vid.paused) vid.pause()
      }
    })
    return () => unsub()
  }, [partyId])

  // Host: auto-start when scheduled time arrives
  useEffect(() => {
    if (!isHost || !party?.scheduledStartAt || !isStartingSoon || !party?.videoUrl) return
    if (secsLeft !== null && secsLeft <= 0 && !wentLiveRef.current) {
      wentLiveRef.current = true
      goLive()
    }
  }, [secsLeft, isHost, party?.scheduledStartAt, isStartingSoon, party?.videoUrl])

  useEffect(() => {
    if (!partyId) return
    const q = query(collection(db, 'watchParties', partyId, 'chat'), orderBy('createdAt', 'asc'), limit(150))
    return onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    })
  }, [partyId])

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
    if (vid.paused) {
      vid.play()
      await updateDoc(doc(db, 'watchParties', partyId), { isPlaying: true, currentTime: vid.currentTime })
    } else {
      vid.pause()
      await updateDoc(doc(db, 'watchParties', partyId), { isPlaying: false, currentTime: vid.currentTime })
    }
  }

  async function uploadMainVideo(file) {
    if (!file) return
    if (file.size > 500 * 1024 * 1024) return toast.error('Video must be under 500MB')
    setUploadingMain(true)
    try {
      const result = await uploadMedia(file)
      await updateDoc(doc(db, 'watchParties', partyId), { videoUrl: result.url })
      toast.success('Main video ready!')
    } catch (err) {
      toast.error(err.message)
    }
    setUploadingMain(false)
  }

  async function goLive() {
    if (!party?.videoUrl) return toast.error('Upload the main video first')
    await updateDoc(doc(db, 'watchParties', partyId), {
      status: 'live',
      isPlaying: true,
      currentTime: 0,
      scheduledStartAt: deleteField(),
    })
    if (videoRef.current) { videoRef.current.currentTime = 0; videoRef.current.play().catch(() => {}) }
  }

  async function saveSchedule() {
    if (!scheduleInput) return toast.error('Pick a date and time')
    const dt = new Date(scheduleInput)
    if (dt <= new Date()) return toast.error('Schedule must be in the future')
    setSavingSchedule(true)
    await updateDoc(doc(db, 'watchParties', partyId), { scheduledStartAt: dt.toISOString() })
    setSavingSchedule(false)
    setShowSchedulePicker(false)
    toast.success('Schedule saved!')
  }

  async function clearSchedule() {
    await updateDoc(doc(db, 'watchParties', partyId), { scheduledStartAt: deleteField() })
    setShowSchedulePicker(false)
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

  if (!partyId) return <CreateParty navigate={navigate} user={user} profile={profile} />

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="animate-spin text-sky-400" size={28} />
    </div>
  )

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4 h-[calc(100dvh-4rem)]">
      {/* Video + controls */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition">
            <ArrowLeft size={20} />
          </button>
          {party && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <img src={party.hostAvatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{party.hostName}'s Watch Party</p>
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Users size={10} /> {isHost ? 'You are the host' : 'Watching together'}
                </p>
              </div>
              {isStartingSoon && (
                <span className="ml-auto shrink-0 text-xs font-semibold bg-amber-500/20 text-amber-400 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Starting Soon
                </span>
              )}
            </div>
          )}
        </div>

        {/* Video area */}
        <div className="relative bg-black rounded-2xl overflow-hidden flex-1 min-h-0">
          {isStartingSoon ? (
            party?.startingSoonUrl ? (
              <video src={party.startingSoonUrl} className="w-full h-full object-contain" autoPlay loop playsInline />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center">
                  <Radio size={32} className="text-amber-400 animate-pulse" />
                </div>
                <p className="text-white text-xl font-bold">Starting Soon</p>
                <p className="text-slate-400 text-sm">Hang tight, the host is getting ready…</p>
              </div>
            )
          ) : (
            <>
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
            </>
          )}

          {/* Countdown overlay — visible to everyone during starting-soon */}
          {isStartingSoon && party?.scheduledStartAt && secsLeft !== null && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-sm text-white px-4 py-2 rounded-full flex items-center gap-2 text-sm font-semibold">
              <Clock size={13} className="text-amber-400" />
              <span className="text-amber-400">Starts in</span>
              {fmtCountdown(secsLeft)}
            </div>
          )}
        </div>

        {/* Host controls */}
        {isHost && isStartingSoon && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center justify-center gap-3">
              {/* Main video */}
              <input ref={mainFileRef} type="file" accept="video/*" className="hidden" onChange={e => uploadMainVideo(e.target.files[0])} />
              {party?.videoUrl ? (
                <div className="flex items-center gap-2 text-sm text-green-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-green-400" /> Main video ready
                </div>
              ) : (
                <button
                  onClick={() => mainFileRef.current.click()}
                  disabled={uploadingMain}
                  className="px-5 py-2.5 border border-slate-600 hover:bg-slate-800 text-slate-300 rounded-full text-sm font-medium transition flex items-center gap-2 disabled:opacity-50"
                >
                  {uploadingMain ? <><Loader2 size={15} className="animate-spin" /> Uploading…</> : <><Upload size={15} /> Upload Main Video</>}
                </button>
              )}

              {/* Schedule button */}
              <button
                onClick={() => setShowSchedulePicker(v => !v)}
                className={`px-5 py-2.5 rounded-full text-sm font-medium transition flex items-center gap-2 border ${
                  party?.scheduledStartAt
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                    : 'border-slate-600 hover:bg-slate-800 text-slate-300'
                }`}
              >
                <Calendar size={15} />
                {party?.scheduledStartAt ? `Starts in ${fmtCountdown(secsLeft)}` : 'Set Start Time'}
              </button>

              {/* Go Live NOW */}
              <button
                onClick={goLive}
                disabled={!party?.videoUrl}
                className="px-6 py-2.5 bg-red-500 hover:bg-red-400 disabled:opacity-40 text-white rounded-full text-sm font-bold transition flex items-center gap-2"
              >
                <Radio size={15} /> Go Live Now
              </button>
            </div>

            {/* Schedule picker */}
            {showSchedulePicker && (
              <div className="bg-[#1e293b] border border-slate-700 rounded-2xl p-4 max-w-sm mx-auto space-y-3">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-amber-400" />
                  <p className="text-sm font-semibold text-white flex-1">Schedule Start Time</p>
                  <button onClick={() => setShowSchedulePicker(false)} className="text-slate-500 hover:text-white">
                    <X size={14} />
                  </button>
                </div>
                <p className="text-xs text-slate-500">Set a time and your main video will start automatically. You can still go live early with "Go Live Now".</p>
                <input
                  type="datetime-local"
                  value={scheduleInput}
                  onChange={e => setScheduleInput(e.target.value)}
                  min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition"
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveSchedule}
                    disabled={savingSchedule || !scheduleInput}
                    className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition"
                  >
                    {savingSchedule ? 'Saving…' : 'Set Time'}
                  </button>
                  {party?.scheduledStartAt && (
                    <button onClick={clearSchedule} className="px-4 py-2 border border-slate-600 text-slate-400 hover:text-white rounded-xl text-sm transition">
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Host play controls (live mode) */}
        {isHost && !isStartingSoon && (
          <div className="mt-3 flex justify-center">
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
          {messages.length === 0 && (
            <p className="text-center text-slate-600 text-xs py-4">No messages yet. Say something!</p>
          )}
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

function CreateParty({ navigate, user, profile }) {
  const [startingSoonFile, setStartingSoonFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const startingSoonRef = useRef(null)

  async function create() {
    setUploading(true)
    try {
      let startingSoonUrl = ''
      if (startingSoonFile) {
        const result = await uploadMedia(startingSoonFile)
        startingSoonUrl = result.url
      }
      const ref = await addDoc(collection(db, 'watchParties'), {
        hostId: user.uid,
        hostName: profile.displayName,
        hostAvatar: profile.avatar || '',
        startingSoonUrl,
        videoUrl: '',
        status: 'starting-soon',
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

  return (
    <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-6 max-w-sm mx-auto">
      <div className="text-center">
        <div className="w-20 h-20 bg-sky-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Users size={36} className="text-sky-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Start a Watch Party</h2>
        <p className="text-slate-400 text-sm">Upload a looping "Starting Soon" screen while people join, then upload and schedule your main video.</p>
      </div>

      <div className="w-full">
        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">
          Starting Soon Screen <span className="normal-case font-normal">(optional)</span>
        </p>
        <input ref={startingSoonRef} type="file" accept="video/*" className="hidden" onChange={e => setStartingSoonFile(e.target.files[0] || null)} />
        <button
          onClick={() => startingSoonRef.current.click()}
          className={`w-full py-3 rounded-xl border-2 border-dashed text-sm font-medium transition flex items-center justify-center gap-2 ${
            startingSoonFile ? 'border-sky-500 text-sky-400 bg-sky-500/10' : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
          }`}
        >
          {startingSoonFile
            ? <><span className="w-2 h-2 rounded-full bg-sky-400" />{startingSoonFile.name}</>
            : <><Upload size={15} /> Choose Starting Soon Video</>}
        </button>
        {startingSoonFile && (
          <button onClick={() => setStartingSoonFile(null)} className="mt-1 text-xs text-slate-500 hover:text-slate-300 transition">Remove</button>
        )}
      </div>

      <div className="w-full border-t border-slate-700/50 pt-2 text-center text-xs text-slate-500">
        After creating, upload the main video and set a scheduled start time
      </div>

      <button
        onClick={create}
        disabled={uploading}
        className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition"
      >
        {uploading
          ? <><Loader2 size={18} className="animate-spin" /> {startingSoonFile ? 'Uploading…' : 'Creating…'}</>
          : 'Create Watch Party'}
      </button>
      <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-white text-sm transition">Cancel</button>
    </div>
  )
}
