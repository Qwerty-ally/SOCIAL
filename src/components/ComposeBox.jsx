import { useState, useRef } from 'react'
import { addDoc, collection, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore'
import { db } from '../firebase'
import { uploadMedia } from '../lib/cloudinary'
import { useAuth } from '../context/AuthContext'
import { Image, Video, X, Tag, Loader2, Music } from 'lucide-react'
import toast from 'react-hot-toast'

const MAX_CHARS = 280
const MAX_IMAGE_MB = 10
const MAX_VIDEO_MB = 100
const MAX_AUDIO_MB = 50
const MAX_IMAGES = 4

export default function ComposeBox({ onPost, replyTo = null, autoFocus = false }) {
  const { user, profile } = useAuth()
  const [content, setContent] = useState('')
  const [images, setImages] = useState([]) // [{ file, preview }]
  const [videoFile, setVideoFile] = useState(null)
  const [videoPreview, setVideoPreview] = useState(null)
  const [audioFile, setAudioFile] = useState(null)
  const [tagInput, setTagInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const imageRef = useRef(null)
  const videoRef = useRef(null)
  const audioRef = useRef(null)

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
    setAudioFile(file)
    e.target.value = ''
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

      // Upload audio
      let audioUrl = null
      if (audioFile) {
        const result = await uploadMedia(audioFile)
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

        {/* Audio indicator */}
        {audioFile && (
          <div className="mt-2 flex items-center gap-2 bg-slate-800 rounded-xl px-3 py-2">
            <Music size={14} className="text-sky-400 shrink-0" />
            <span className="text-xs text-slate-300 truncate flex-1">{audioFile.name}</span>
            <button type="button" onClick={() => setAudioFile(null)} className="text-slate-500 hover:text-white">
              <X size={13} />
            </button>
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
