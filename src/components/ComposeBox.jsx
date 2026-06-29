import { useState, useRef } from 'react'
import { addDoc, collection, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore'
import { db } from '../firebase'
import { uploadMedia } from '../lib/cloudinary'
import { useAuth } from '../context/AuthContext'
import { Image, Video, X, Tag, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

const MAX_CHARS = 280
const MAX_IMAGE_MB = 10
const MAX_VIDEO_MB = 100

export default function ComposeBox({ onPost, replyTo = null, autoFocus = false }) {
  const { user, profile } = useAuth()
  const [content, setContent] = useState('')
  const [mediaFile, setMediaFile] = useState(null)
  const [mediaPreview, setMediaPreview] = useState(null)
  const [mediaType, setMediaType] = useState(null) // 'image' | 'video'
  const [tagInput, setTagInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const imageRef = useRef(null)
  const videoRef = useRef(null)

  const remaining = MAX_CHARS - content.length
  const canPost = content.trim().length > 0 || mediaFile

  function pickFile(e, type) {
    const file = e.target.files[0]
    if (!file) return

    const maxMB = type === 'video' ? MAX_VIDEO_MB : MAX_IMAGE_MB
    if (file.size > maxMB * 1024 * 1024) {
      toast.error(`${type === 'video' ? 'Video' : 'Image'} must be under ${maxMB} MB`)
      return
    }

    setMediaFile(file)
    setMediaType(type)
    setMediaPreview(URL.createObjectURL(file))
  }

  function clearMedia() {
    setMediaFile(null)
    setMediaPreview(null)
    setMediaType(null)
    if (imageRef.current) imageRef.current.value = ''
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

    try {
      let mediaUrl = null
      let uploadedType = null

      if (mediaFile) {
        setUploading(true)
        const result = await uploadMedia(mediaFile)
        mediaUrl = result.url
        uploadedType = result.type
        setUploading(false)
      }

      const data = {
        content: content.trim(),
        mediaUrl,
        mediaType: uploadedType,
        // keep imageUrl populated for backwards compat with existing posts
        imageUrl: uploadedType === 'image' ? mediaUrl : null,
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
      clearMedia()
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

        {/* Media preview */}
        {mediaPreview && (
          <div className="relative mt-2 inline-block max-w-full">
            {mediaType === 'video' ? (
              <video
                src={mediaPreview}
                controls
                className="rounded-xl max-h-52 max-w-full border border-slate-700"
              />
            ) : (
              <img src={mediaPreview} alt="" className="rounded-xl max-h-52 object-cover border border-slate-700" />
            )}
            <button
              type="button"
              onClick={clearMedia}
              className="absolute top-1.5 right-1.5 bg-black/70 rounded-full p-1 text-white hover:bg-black"
            >
              <X size={14} />
            </button>
            {mediaType === 'video' && (
              <span className="absolute bottom-1.5 left-1.5 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-full font-medium">
                VIDEO
              </span>
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
            <input type="file" ref={imageRef} accept="image/*" onChange={e => pickFile(e, 'image')} className="hidden" />
            <input type="file" ref={videoRef} accept="video/*" onChange={e => pickFile(e, 'video')} className="hidden" />
            <ToolBtn icon={<Image size={18} />} onClick={() => imageRef.current.click()} label="Image" disabled={!!mediaFile} />
            <ToolBtn icon={<Video size={18} />} onClick={() => videoRef.current.click()} label="Video" disabled={!!mediaFile} />
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
