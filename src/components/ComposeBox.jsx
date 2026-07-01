import { useState, useRef, useEffect } from 'react'
import { addDoc, collection, serverTimestamp, doc, updateDoc, increment, getDocs, query, where, limit } from 'firebase/firestore'
import { db } from '../firebase'
import { uploadMedia } from '../lib/cloudinary'
import { useAuth } from '../context/AuthContext'
import {
  Image, Video, X, Tag, Loader2, Music, Play, Pause,
  Calendar, Clock, MapPin, Timer, Users, UserPlus, Search, FileText
} from 'lucide-react'
import toast from 'react-hot-toast'

const MAX_CHARS = 280
const MAX_IMAGE_MB = 10
const MAX_VIDEO_MB = 100
const MAX_AUDIO_MB = 50
const MAX_IMAGES = 4

function formatTime(s) {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

async function trimAudioFile(file, startSec, endSec) {
  const ctx = new AudioContext()
  const buf = await ctx.decodeAudioData(await file.arrayBuffer())
  const sr = buf.sampleRate
  const s0 = Math.floor(startSec * sr)
  const s1 = Math.floor(endSec * sr)
  const len = s1 - s0
  const out = ctx.createBuffer(buf.numberOfChannels, len, sr)
  for (let c = 0; c < buf.numberOfChannels; c++) {
    out.getChannelData(c).set(buf.getChannelData(c).subarray(s0, s1))
  }
  const numCh = out.numberOfChannels
  const pcmLen = len * numCh * 2
  const ab = new ArrayBuffer(44 + pcmLen)
  const view = new DataView(ab)
  const write = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }
  write(0, 'RIFF'); view.setUint32(4, 36 + pcmLen, true); write(8, 'WAVE')
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, numCh, true); view.setUint32(24, sr, true)
  view.setUint32(28, sr * numCh * 2, true); view.setUint16(32, numCh * 2, true)
  view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, pcmLen, true)
  let offset = 44
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, out.getChannelData(c)[i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  await ctx.close()
  return new File([ab], 'clip.wav', { type: 'audio/wav' })
}

export default function ComposeBox({ onPost, replyTo = null, autoFocus = false }) {
  const { user, profile } = useAuth()
  const [content, setContent] = useState('')
  const [images, setImages] = useState([])
  const [videoFile, setVideoFile] = useState(null)
  const [videoPreview, setVideoPreview] = useState(null)
  const [audioFile, setAudioFile] = useState(null)
  const [audioDuration, setAudioDuration] = useState(0)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [previewing, setPreviewing] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Extra post types
  const [postType, setPostType] = useState('normal') // normal | event | countdown | scheduled
  const [eventTitle, setEventTitle] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventLocation, setEventLocation] = useState('')
  const [countdownLabel, setCountdownLabel] = useState('')
  const [countdownTo, setCountdownTo] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [closeFriendsOnly, setCloseFriendsOnly] = useState(false)

  // Collab
  const [collabSearch, setCollabSearch] = useState('')
  const [collabResults, setCollabResults] = useState([])
  const [coAuthors, setCoAuthors] = useState([])
  const [showCollabSearch, setShowCollabSearch] = useState(false)

  // Drafts
  const [drafts, setDrafts] = useState([])
  const [showDrafts, setShowDrafts] = useState(false)

  // @mention autocomplete
  const [mentionQuery, setMentionQuery] = useState(null)
  const [mentionResults, setMentionResults] = useState([])
  const [mentionPos, setMentionPos] = useState(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (mentionQuery === null) { setMentionResults([]); return }
    const id = setTimeout(async () => {
      const q = mentionQuery.toLowerCase()
      const snap = await getDocs(query(
        collection(db, 'users'),
        where('username', '>=', q),
        where('username', '<=', q + '￿'),
        limit(5)
      ))
      setMentionResults(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.id !== user?.uid))
    }, 150)
    return () => clearTimeout(id)
  }, [mentionQuery])

  // Close mention dropdown on outside click
  useEffect(() => {
    if (!mentionResults.length) return
    function handler(e) {
      if (!e.target.closest('[data-mention-dropdown]') && !e.target.closest('textarea')) {
        setMentionResults([])
        setMentionQuery(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [mentionResults.length])

  // Load drafts from localStorage on mount
  useEffect(() => {
    if (!user?.uid) return
    const raw = localStorage.getItem(`anchor_drafts_${user.uid}`)
    if (raw) setDrafts(JSON.parse(raw))
  }, [user?.uid])

  function draftTimeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime()
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  }

  function saveDraft() {
    if (!content.trim() && postType === 'normal') return toast.error('Nothing to save as draft')
    const draft = {
      id: Date.now().toString(),
      content,
      postType,
      eventTitle,
      eventDate,
      eventLocation,
      countdownLabel,
      countdownTo,
      savedAt: new Date().toISOString(),
    }
    const updated = [draft, ...drafts].slice(0, 10)
    setDrafts(updated)
    localStorage.setItem(`anchor_drafts_${user.uid}`, JSON.stringify(updated))
    toast.success('Draft saved!')
  }

  function loadDraft(draft) {
    setContent(draft.content || '')
    setPostType(draft.postType || 'normal')
    setEventTitle(draft.eventTitle || '')
    setEventDate(draft.eventDate || '')
    setEventLocation(draft.eventLocation || '')
    setCountdownLabel(draft.countdownLabel || '')
    setCountdownTo(draft.countdownTo || '')
    setShowDrafts(false)
    toast.success('Draft loaded')
  }

  function deleteDraft(id, e) {
    e.stopPropagation()
    const updated = drafts.filter(d => d.id !== id)
    setDrafts(updated)
    localStorage.setItem(`anchor_drafts_${user.uid}`, JSON.stringify(updated))
  }

  const imageRef = useRef(null)
  const videoRef = useRef(null)
  const audioRef = useRef(null)
  const previewAudioRef = useRef(null)

  const remaining = MAX_CHARS - content.length
  const canPost = content.trim().length > 0 || images.length > 0 || videoFile || audioFile

  function pickImages(e) {
    const files = Array.from(e.target.files)
    const valid = files.filter(f => {
      if (f.size > MAX_IMAGE_MB * 1024 * 1024) { toast.error(`${f.name} is over ${MAX_IMAGE_MB}MB`); return false }
      return true
    })
    const slots = MAX_IMAGES - images.length
    const picked = valid.slice(0, slots)
    if (valid.length > slots) toast.error(`Max ${MAX_IMAGES} photos`)
    setImages(prev => [...prev, ...picked.map(f => ({ file: f, preview: URL.createObjectURL(f) }))])
    e.target.value = ''
  }

  function removeImage(i) { setImages(prev => prev.filter((_, idx) => idx !== i)) }

  function pickVideo(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) return toast.error(`Video must be under ${MAX_VIDEO_MB}MB`)
    setVideoFile(file)
    setVideoPreview(URL.createObjectURL(file))
  }

  function pickAudio(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > MAX_AUDIO_MB * 1024 * 1024) return toast.error(`Audio must be under ${MAX_AUDIO_MB}MB`)
    const url = URL.createObjectURL(file)
    const tmp = new Audio(url)
    tmp.onloadedmetadata = () => {
      const dur = tmp.duration
      setAudioDuration(dur)
      setTrimStart(0)
      setTrimEnd(dur)
    }
    setAudioFile(file)
    e.target.value = ''
  }

  function previewClip() {
    if (!audioFile) return
    if (previewing && previewAudioRef.current) {
      previewAudioRef.current.pause()
      setPreviewing(false)
      return
    }
    const url = URL.createObjectURL(audioFile)
    const a = new Audio(url)
    previewAudioRef.current = a
    a.currentTime = trimStart
    a.play()
    setPreviewing(true)
    const stop = () => setPreviewing(false)
    a.addEventListener('ended', stop)
    setTimeout(() => { a.pause(); setPreviewing(false) }, (trimEnd - trimStart) * 1000)
  }

  function clearVideo() {
    setVideoFile(null)
    setVideoPreview(null)
    if (videoRef.current) videoRef.current.value = ''
  }

  async function searchCollab(q) {
    setCollabSearch(q)
    if (q.length < 2) { setCollabResults([]); return }
    const snap = await getDocs(query(
      collection(db, 'users'),
      where('username', '>=', q.toLowerCase()),
      where('username', '<=', q.toLowerCase() + '￿'),
      limit(8)
    ))
    const alreadyAdded = new Set(coAuthors.map(a => a.id))
    setCollabResults(
      snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.id !== user.uid && !alreadyAdded.has(u.id))
    )
  }

  function addCoAuthor(u) {
    if (coAuthors.length >= 5) return toast.error('Max 5 collaborators')
    setCoAuthors(prev => [...prev, u])
    setCollabResults([])
    setCollabSearch('')
  }

  function removeCoAuthor(id) {
    setCoAuthors(prev => prev.filter(a => a.id !== id))
  }

  function handleContentChange(e) {
    const val = e.target.value
    setContent(val)
    const pos = e.target.selectionStart
    const before = val.slice(0, pos)
    const match = before.match(/@(\w*)$/)
    if (match) {
      setMentionQuery(match[1])
      const rect = textareaRef.current?.getBoundingClientRect()
      if (rect) setMentionPos({ top: rect.bottom + 6, left: rect.left, width: rect.width })
    } else {
      setMentionQuery(null)
      setMentionResults([])
    }
  }

  function insertMention(username) {
    const pos = textareaRef.current?.selectionStart ?? content.length
    const before = content.slice(0, pos)
    const after = content.slice(pos)
    const newBefore = before.replace(/@(\w*)$/, `@${username} `)
    setContent(newBefore + after)
    setMentionResults([])
    setMentionQuery(null)
    setTimeout(() => {
      textareaRef.current?.focus()
      const newPos = newBefore.length
      textareaRef.current?.setSelectionRange(newPos, newPos)
    }, 0)
  }

  function parseTags(text) {
    const inline = [...text.matchAll(/#(\w+)/g)].map(m => m[1].toLowerCase())
    const extra = tagInput.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    return [...new Set([...inline, ...extra])]
  }

  async function submit(e) {
    e.preventDefault()
    if (!canPost || !user) return
    if (remaining < 0) return toast.error('Post is too long')
    setLoading(true)
    setUploading(true)

    try {
      const mediaUrls = images.length > 0
        ? await Promise.all(images.map(img => uploadMedia(img.file).then(r => r.url)))
        : []

      let mediaUrl = null
      let mediaType = null
      if (videoFile) {
        const result = await uploadMedia(videoFile)
        mediaUrl = result.url
        mediaType = 'video'
      } else if (mediaUrls.length > 0) {
        mediaUrl = mediaUrls[0]
        mediaType = 'image'
      }

      let audioUrl = null
      if (audioFile) {
        const isFullClip = trimStart === 0 && Math.abs(trimEnd - audioDuration) < 0.5
        const fileToUpload = isFullClip ? audioFile : await trimAudioFile(audioFile, trimStart, trimEnd)
        const result = await uploadMedia(fileToUpload)
        audioUrl = result.url
      }

      setUploading(false)

      // Close-friends visibility
      let visibleTo = null
      if (closeFriendsOnly && !replyTo) {
        visibleTo = [user.uid, ...(profile?.closeFriends ?? [])]
      }

      const data = {
        content: content.trim(),
        mediaUrl,
        mediaType,
        imageUrl: mediaType === 'image' ? mediaUrl : null,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : null,
        audioUrl,
        tags: parseTags(content),
        authorId: user.uid,
        authorName: profile?.displayName || user.displayName || 'Unknown',
        authorUsername: profile?.username || user.email?.split('@')[0] || 'unknown',
        authorAvatar: profile?.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${user.uid}`,
        authorRole: profile?.role || 'member',
        likes: [],
        reposts: [],
        bookmarks: [],
        rsvps: [],
        views: 0,
        commentCount: 0,
        closeFriendsOnly: closeFriendsOnly && !replyTo,
        ...(visibleTo ? { visibleTo } : {}),
        createdAt: serverTimestamp(),
      }

      // Post type extras
      if (postType === 'event' && eventTitle) {
        data.postType = 'event'
        data.eventTitle = eventTitle
        data.eventDate = eventDate || null
        data.eventLocation = eventLocation || null
      } else if (postType === 'countdown' && countdownTo) {
        data.postType = 'countdown'
        data.countdownTo = new Date(countdownTo).toISOString()
        data.countdownLabel = countdownLabel || 'Countdown'
      } else if (postType === 'scheduled' && scheduledAt) {
        data.postType = 'scheduled'
        data.publishAt = new Date(scheduledAt).toISOString()
      }

      // Collab authors — use pending approval flow
      const hasPendingCollab = coAuthors.length > 0 && !replyTo
      if (hasPendingCollab) {
        data.pendingCoAuthors = coAuthors.map(a => ({
          id: a.id, displayName: a.displayName, username: a.username,
          avatar: a.avatar || '', role: a.role || 'member',
        }))
        data.coAuthors = []
        data.collabPending = true
      }

      if (replyTo) {
        data.replyTo = replyTo.id
        data.replyToAuthor = replyTo.authorUsername
        await addDoc(collection(db, 'posts', replyTo.id, 'comments'), data)
        await updateDoc(doc(db, 'posts', replyTo.id), { commentCount: increment(1) })
        toast.success('Reply posted!')
      } else {
        const postRef = await addDoc(collection(db, 'posts'), data)
        if (hasPendingCollab) {
          await Promise.all(coAuthors.map(a =>
            addDoc(collection(db, 'notifications'), {
              type: 'collab-request',
              to: a.id,
              from: user.uid,
              fromName: profile?.displayName || 'Someone',
              fromAvatar: profile?.avatar || '',
              postId: postRef.id,
              postPreview: content.trim().slice(0, 100),
              status: 'pending',
              read: false,
              createdAt: serverTimestamp(),
            })
          ))
          toast.success('Collab requests sent! Post goes live once everyone accepts.')
        } else {
          toast.success(postType === 'scheduled' ? 'Post scheduled!' : 'Posted!')
        }
      }

      setContent(''); setImages([]); clearVideo(); setAudioFile(null); setTagInput('')
      setPostType('normal'); setEventTitle(''); setEventDate(''); setEventLocation('')
      setCountdownLabel(''); setCountdownTo(''); setScheduledAt('')
      setCoAuthors([]); setShowCollabSearch(false); setCloseFriendsOnly(false)
      onPost?.()
    } catch (err) {
      setUploading(false)
      toast.error(err.message)
    }
    setLoading(false)
  }

  if (!user) return null

  return (
    <>
    <form onSubmit={submit} className="flex gap-3 p-4 border-b border-slate-700/50">
      <img
        src={profile?.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=user`}
        alt=""
        className="w-11 h-11 rounded-full object-cover flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        {replyTo && (
          <p className="text-xs text-slate-500 mb-1.5">
            Replying to <span className="text-sky-400">@{replyTo.authorUsername}</span>
          </p>
        )}

        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onKeyDown={e => { if (e.key === 'Escape') { setMentionResults([]); setMentionQuery(null) } }}
          placeholder={replyTo ? 'Post your reply…' : "What's happening in ANCHOR?"}
          autoFocus={autoFocus}
          rows={3}
          className="w-full bg-transparent text-white placeholder-slate-500 text-sm resize-none focus:outline-none leading-relaxed"
          maxLength={MAX_CHARS + 50}
        />

        {/* Image grid */}
        {images.length > 0 && (
          <div className={`mt-2 grid gap-1 rounded-xl overflow-hidden ${images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {images.map((img, i) => (
              <div key={i} className="relative">
                <img src={img.preview} alt="" className="w-full object-cover max-h-48 rounded-lg" />
                <button type="button" onClick={() => removeImage(i)} className="absolute top-1.5 right-1.5 bg-black/70 rounded-full p-1 text-white hover:bg-black">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Video preview */}
        {videoPreview && (
          <div className="relative mt-2 inline-block max-w-full">
            <video src={videoPreview} controls className="rounded-xl max-h-52 max-w-full border border-slate-700" />
            <button type="button" onClick={clearVideo} className="absolute top-1.5 right-1.5 bg-black/70 rounded-full p-1 text-white hover:bg-black">
              <X size={14} />
            </button>
            <span className="absolute bottom-1.5 left-1.5 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-full font-medium">VIDEO</span>
          </div>
        )}

        {/* Audio trimmer */}
        {audioFile && (
          <div className="mt-2 bg-slate-800 rounded-xl px-3 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <Music size={14} className="text-sky-400 shrink-0" />
              <span className="text-xs text-slate-300 truncate flex-1">{audioFile.name}</span>
              <button type="button" onClick={previewClip} className="text-sky-400 hover:text-sky-300">
                {previewing ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button type="button" onClick={() => { setAudioFile(null); setPreviewing(false) }} className="text-slate-500 hover:text-white">
                <X size={13} />
              </button>
            </div>
            {audioDuration > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 w-10">Start</span>
                  <input type="range" min={0} max={audioDuration} step={0.1} value={trimStart}
                    onChange={e => setTrimStart(Math.min(+e.target.value, trimEnd - 0.5))}
                    className="flex-1 accent-sky-500 h-1" />
                  <span className="text-[10px] text-slate-400 w-10 text-right">{formatTime(trimStart)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 w-10">End</span>
                  <input type="range" min={0} max={audioDuration} step={0.1} value={trimEnd}
                    onChange={e => setTrimEnd(Math.max(+e.target.value, trimStart + 0.5))}
                    className="flex-1 accent-sky-500 h-1" />
                  <span className="text-[10px] text-slate-400 w-10 text-right">{formatTime(trimEnd)}</span>
                </div>
                <p className="text-[10px] text-slate-500 text-right">Clip: {formatTime(trimEnd - trimStart)}</p>
              </div>
            )}
          </div>
        )}

        {/* Post type extras */}
        {postType === 'event' && (
          <div className="mt-2 bg-slate-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Calendar size={13} className="text-sky-400" />
              <span className="text-xs font-semibold text-slate-300">Event Details</span>
              <button type="button" onClick={() => setPostType('normal')} className="ml-auto text-slate-500 hover:text-white"><X size={13} /></button>
            </div>
            <input value={eventTitle} onChange={e => setEventTitle(e.target.value)} placeholder="Event title *" className="w-full bg-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />
            <input type="datetime-local" value={eventDate} onChange={e => setEventDate(e.target.value)} className="w-full bg-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500" />
            <input value={eventLocation} onChange={e => setEventLocation(e.target.value)} placeholder="Location (optional)" className="w-full bg-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />
          </div>
        )}

        {postType === 'countdown' && (
          <div className="mt-2 bg-slate-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Timer size={13} className="text-sky-400" />
              <span className="text-xs font-semibold text-slate-300">Countdown</span>
              <button type="button" onClick={() => setPostType('normal')} className="ml-auto text-slate-500 hover:text-white"><X size={13} /></button>
            </div>
            <input value={countdownLabel} onChange={e => setCountdownLabel(e.target.value)} placeholder="Label (e.g. Album drops in…)" className="w-full bg-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />
            <input type="datetime-local" value={countdownTo} onChange={e => setCountdownTo(e.target.value)} className="w-full bg-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500" />
          </div>
        )}

        {postType === 'scheduled' && (
          <div className="mt-2 bg-slate-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={13} className="text-sky-400" />
              <span className="text-xs font-semibold text-slate-300">Schedule Post</span>
              <button type="button" onClick={() => setPostType('normal')} className="ml-auto text-slate-500 hover:text-white"><X size={13} /></button>
            </div>
            <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} min={new Date().toISOString().slice(0,16)} className="w-full bg-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500" />
          </div>
        )}

        {/* Collab search */}
        {showCollabSearch && (
          <div className="mt-2 bg-slate-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <UserPlus size={13} className="text-sky-400" />
              <span className="text-xs font-semibold text-slate-300">Collab with <span className="font-normal text-slate-500">({coAuthors.length}/5)</span></span>
              <button type="button" onClick={() => { setShowCollabSearch(false); setCoAuthors([]) }} className="ml-auto text-slate-500 hover:text-white"><X size={13} /></button>
            </div>

            {/* Added co-authors */}
            {coAuthors.map(a => (
              <div key={a.id} className="flex items-center gap-2 p-2 bg-sky-500/10 rounded-lg">
                <img src={a.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${a.username}`} alt="" className="w-7 h-7 rounded-full object-cover" />
                <span className="text-sm text-white flex-1">{a.displayName}</span>
                <span className="text-xs text-slate-500">@{a.username}</span>
                <button type="button" onClick={() => removeCoAuthor(a.id)} className="text-slate-500 hover:text-white ml-1"><X size={12} /></button>
              </div>
            ))}

            {/* Search for more (up to 5) */}
            {coAuthors.length < 5 && (
              <>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    value={collabSearch}
                    onChange={e => searchCollab(e.target.value)}
                    placeholder="Search username to add…"
                    className="w-full bg-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                {collabResults.length > 0 && (
                  <div className="space-y-1">
                    {collabResults.map(u => (
                      <button key={u.id} type="button" onClick={() => addCoAuthor(u)}
                        className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-slate-700 transition text-left">
                        <img src={u.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${u.username}`} alt="" className="w-7 h-7 rounded-full object-cover" />
                        <div>
                          <p className="text-sm text-white">{u.displayName}</p>
                          <p className="text-xs text-slate-500">@{u.username}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tag input */}
        <div className="flex items-center gap-2 mt-2">
          <Tag size={13} className="text-slate-500" />
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            placeholder="Extra tags (comma-separated)"
            className="text-xs bg-transparent text-slate-400 placeholder-slate-600 focus:outline-none flex-1"
          />
        </div>

        {/* Close friends toggle (only for original posts, not replies, not fans) */}
        {!replyTo && profile?.role !== 'fan' && profile?.closeFriends?.length > 0 && (
          <button
            type="button"
            onClick={() => setCloseFriendsOnly(v => !v)}
            className={`mt-2 flex items-center gap-1.5 text-xs px-3 py-1 rounded-full transition ${closeFriendsOnly ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'text-slate-500 hover:text-green-400'}`}
          >
            <Users size={11} /> {closeFriendsOnly ? 'Close Friends only ✓' : 'Close Friends only'}
          </button>
        )}

        {/* Drafts panel */}
        {showDrafts && !replyTo && (
          <div className="mt-2 mb-1 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
            {drafts.length === 0 ? (
              <p className="text-xs text-slate-500 px-4 py-3 text-center">No saved drafts</p>
            ) : (
              <div className="divide-y divide-slate-800 max-h-48 overflow-y-auto anchor-scrollbar">
                {drafts.map(d => (
                  <div
                    key={d.id}
                    onClick={() => loadDraft(d)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800 cursor-pointer group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate">
                        {d.content || (d.postType === 'event' ? `Event: ${d.eventTitle}` : d.postType === 'countdown' ? `Countdown: ${d.countdownLabel}` : 'Empty draft')}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5 capitalize">
                        {d.postType !== 'normal' ? `${d.postType} · ` : ''}{draftTimeAgo(d.savedAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={e => deleteDraft(d.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-full text-slate-600 hover:text-red-400 transition"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1 flex-wrap">
            <input type="file" ref={imageRef} accept="image/*" multiple onChange={pickImages} className="hidden" />
            <input type="file" ref={videoRef} accept="video/*" onChange={pickVideo} className="hidden" />
            <input type="file" ref={audioRef} accept="audio/*" onChange={pickAudio} className="hidden" />

            {!(profile?.role === 'fan' && replyTo) && (
              <>
                <ToolBtn icon={<Image size={18} />} onClick={() => imageRef.current.click()} label="Photos" disabled={!!videoFile || images.length >= MAX_IMAGES} />
                <ToolBtn icon={<Video size={18} />} onClick={() => videoRef.current.click()} label="Video" disabled={images.length > 0 || !!videoFile} />
                <ToolBtn icon={<Music size={18} />} onClick={() => audioRef.current.click()} label="Audio" disabled={!!audioFile} />
              </>
            )}

            {/* Extra post type buttons (only on non-reply posts for non-fans) */}
            {!replyTo && profile?.role !== 'fan' && (
              <>
                <ToolBtn icon={<Calendar size={18} />} onClick={() => setPostType(t => t === 'event' ? 'normal' : 'event')} label="Event" active={postType === 'event'} />
                <ToolBtn icon={<Timer size={18} />} onClick={() => setPostType(t => t === 'countdown' ? 'normal' : 'countdown')} label="Countdown" active={postType === 'countdown'} />
                <ToolBtn icon={<Clock size={18} />} onClick={() => setPostType(t => t === 'scheduled' ? 'normal' : 'scheduled')} label="Schedule" active={postType === 'scheduled'} />
                <ToolBtn icon={<UserPlus size={18} />} onClick={() => setShowCollabSearch(v => !v)} label="Collab" active={showCollabSearch || coAuthors.length > 0} />
              </>
            )}

            {/* Drafts toggle */}
            {!replyTo && (
              <button
                type="button"
                onClick={() => setShowDrafts(v => !v)}
                className={`relative flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition ${showDrafts ? 'text-sky-400 bg-sky-500/10' : 'text-slate-500 hover:text-white'}`}
              >
                <FileText size={14} />
                Drafts
                {drafts.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-sky-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold leading-none">
                    {drafts.length}
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {uploading && (
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <Loader2 size={12} className="animate-spin" /> Uploading…
              </span>
            )}
            <span className={`text-xs font-mono ${remaining < 20 ? (remaining < 0 ? 'text-red-400' : 'text-yellow-400') : 'text-slate-500'}`}>
              {remaining}
            </span>
            {!replyTo && (
              <button
                type="button"
                onClick={saveDraft}
                disabled={!canPost}
                className="px-3 py-2 border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 rounded-full text-sm font-medium transition disabled:opacity-40"
              >
                Save draft
              </button>
            )}
            <button
              type="submit"
              disabled={loading || !canPost || remaining < 0}
              className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-full text-sm font-semibold transition disabled:opacity-40 shadow shadow-sky-500/30"
            >
              {loading ? '…' : replyTo ? 'Reply' : postType === 'scheduled' ? 'Schedule' : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </form>

    {/* @mention dropdown — fixed so it's never clipped by overflow */}
    {mentionResults.length > 0 && mentionPos && (
      <div
        data-mention-dropdown="true"
        style={{ position: 'fixed', top: mentionPos.top, left: mentionPos.left, width: mentionPos.width, zIndex: 9999 }}
        className="bg-[#1e293b] border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
      >
        {mentionResults.map(u => (
          <button
            key={u.id}
            type="button"
            onMouseDown={e => { e.preventDefault(); insertMention(u.username) }}
            className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-slate-800 transition text-left"
          >
            <img src={u.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${u.username}`} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
            <div>
              <p className="text-sm text-white">{u.displayName}</p>
              <p className="text-xs text-slate-500">@{u.username}</p>
            </div>
          </button>
        ))}
      </div>
    )}
  </>
  )
}

function ToolBtn({ icon, onClick, label, disabled, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className={`p-2 rounded-full transition disabled:opacity-30 disabled:cursor-not-allowed ${active ? 'text-sky-400 bg-sky-400/10' : 'text-sky-400 hover:bg-sky-400/10'}`}
    >
      {icon}
    </button>
  )
}
