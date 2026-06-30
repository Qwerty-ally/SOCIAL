import { useState, useRef, useEffect } from 'react'
import { addDoc, collection, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore'
import { db } from '../firebase'
import { uploadMedia } from '../lib/cloudinary'
import { useAuth } from '../context/AuthContext'
import { Image, Video, X, Tag, Loader2, Music, Play, Pause } from 'lucide-react'
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
  // Encode to WAV
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
  const [images, setImages] = useState([]) // [{ file, preview }]
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

  function removeImage(i) {
    setImages(prev => prev.filter((_, idx) => idx !== i))
  }

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
      // Upload images
      const mediaUrls = images.length > 0
        ? await Promise.all(images.map(img => uploadMedia(img.file).then(r => r.url)))
        : []

      // Upload video
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

      // Upload audio (trimmed if needed)
      let audioUrl = null
      if (audioFile) {
        const isFullClip = trimStart === 0 && Math.abs(trimEnd - audioDuration) < 0.5
        const fileToUpload = isFullClip ? audioFile : await trimAudioFile(audioFile, trimStart, trimEnd)
        const result = await uploadMedia(fileToUpload)
        audioUrl = result.url
      }

      setUploading(false)

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
        commentCount: 0,
        createdAt: serverTimestamp(),
      }

      if (replyTo) {
        data.replyTo = replyTo.id
        data.replyToAuthor = replyTo.authorUsername
        await addDoc(collection(db, 'posts', replyTo.id, 'comments'), data)
        await updateDoc(doc(db, 'posts', replyTo.id), { commentCount: increment(1) })
      } else {
        await addDoc(collection(db, 'posts'), data)
      }

      setContent('')
      setImages([])
      clearVideo()
      setAudioFile(null)
      setTagInput('')
      onPost?.()
      toast.success(replyTo ? 'Reply posted!' : 'Posted!')
    } catch (err) {
      setUploading(false)
      toast.error(err.message)
    }
    setLoading(false)
  }

  if (!user) return null

  return (
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
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={replyTo ? 'Post your reply…' : "What's happening in ANCHOR?"}
          autoFocus={autoFocus}
          rows={3}
          className="w-full bg-transparent text-white placeholder-slate-500 text-sm resize-none focus:outline-none leading-relaxed"
          maxLength={MAX_CHARS + 50}
        />

        {/* Image grid preview */}
        {images.length > 0 && (
          <div className={`mt-2 grid gap-1 rounded-xl overflow-hidden ${images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {images.map((img, i) => (
              <div key={i} className="relative">
                <img src={img.preview} alt="" className="w-full object-cover max-h-48 rounded-lg" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute top-1.5 right-1.5 bg-black/70 rounded-full p-1 text-white hover:bg-black"
                >
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
                  <input
                    type="range" min={0} max={audioDuration} step={0.1}
                    value={trimStart}
                    onChange={e => setTrimStart(Math.min(+e.target.value, trimEnd - 0.5))}
                    className="flex-1 accent-sky-500 h-1"
                  />
                  <span className="text-[10px] text-slate-400 w-10 text-right">{formatTime(trimStart)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 w-10">End</span>
                  <input
                    type="range" min={0} max={audioDuration} step={0.1}
                    value={trimEnd}
                    onChange={e => setTrimEnd(Math.max(+e.target.value, trimStart + 0.5))}
                    className="flex-1 accent-sky-500 h-1"
                  />
                  <span className="text-[10px] text-slate-400 w-10 text-right">{formatTime(trimEnd)}</span>
                </div>
                <p className="text-[10px] text-slate-500 text-right">Clip: {formatTime(trimEnd - trimStart)}</p>
              </div>
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

        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1">
            <input type="file" ref={imageRef} accept="image/*" multiple onChange={pickImages} className="hidden" />
            <input type="file" ref={videoRef} accept="video/*" onChange={pickVideo} className="hidden" />
            <input type="file" ref={audioRef} accept="audio/*" onChange={pickAudio} className="hidden" />
            <ToolBtn icon={<Image size={18} />} onClick={() => imageRef.current.click()} label="Photos" disabled={!!videoFile || images.length >= MAX_IMAGES} />
            <ToolBtn icon={<Video size={18} />} onClick={() => videoRef.current.click()} label="Video" disabled={images.length > 0 || !!videoFile} />
            <ToolBtn icon={<Music size={18} />} onClick={() => audioRef.current.click()} label="Audio" disabled={!!audioFile} />
          </div>

          <div className="flex items-center gap-3">
            {uploading && (
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <Loader2 size={12} className="animate-spin" /> Uploading…
              </span>
            )}
            <span className={`text-xs font-mono ${remaining < 20 ? (remaining < 0 ? 'text-red-400' : 'text-yellow-400') : 'text-slate-500'}`}>
              {remaining}
            </span>
            <button
              type="submit"
              disabled={loading || !canPost || remaining < 0}
              className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-full text-sm font-semibold transition disabled:opacity-40 shadow shadow-sky-500/30"
            >
              {loading ? '…' : replyTo ? 'Reply' : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}

function ToolBtn({ icon, onClick, label, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className="p-2 rounded-full text-sky-400 hover:bg-sky-400/10 transition disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {icon}
    </button>
  )
}
