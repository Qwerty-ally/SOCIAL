import { useState, useEffect, useRef } from 'react'
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, Timestamp, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { uploadMedia } from '../lib/cloudinary'
import { Plus, X, Loader2, ChevronLeft, ChevronRight, Music, Volume2, VolumeX } from 'lucide-react'
import toast from 'react-hot-toast'

export default function StoriesBar() {
  const { user, profile } = useAuth()
  const [grouped, setGrouped] = useState([])
  const [viewing, setViewing] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    if (!user) return
    const cutoff = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
    const q = query(collection(db, 'stories'), where('createdAt', '>', cutoff), orderBy('createdAt', 'asc'))
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const map = {}
      all.forEach(s => {
        if (!map[s.authorId]) map[s.authorId] = []
        map[s.authorId].push(s)
      })
      setGrouped(Object.values(map))
    }, () => {})
  }, [user])

  async function addStory(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const result = await uploadMedia(file)
      await addDoc(collection(db, 'stories'), {
        authorId: user.uid,
        authorName: profile.displayName,
        authorUsername: profile.username,
        authorAvatar: profile.avatar || '',
        mediaUrl: result.url,
        mediaType: result.type,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)),
      })
      toast.success('Story posted!')
    } catch (err) {
      toast.error(err.message)
    }
    setUploading(false)
    e.target.value = ''
  }

  if (!user) return null

  return (
    <>
      <div className="flex gap-3 px-4 py-3 border-b border-slate-700/50 overflow-x-auto anchor-scrollbar">
        {/* Add story button */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-14 h-14 rounded-full bg-slate-800 border-2 border-dashed border-slate-600 hover:border-sky-500 flex items-center justify-center transition"
          >
            {uploading ? <Loader2 size={18} className="animate-spin text-sky-400" /> : <Plus size={20} className="text-slate-400" />}
          </button>
          <p className="text-[10px] text-slate-500">Add</p>
          {/* Accept images, videos, and audio */}
          <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={addStory} />
        </div>

        {grouped.map((userStories, i) => {
          const s = userStories[userStories.length - 1]
          return (
            <div key={i} onClick={() => setViewing({ groups: grouped, gi: i, si: 0 })} className="flex flex-col items-center gap-1 shrink-0 cursor-pointer">
              <div className="w-14 h-14 rounded-full p-0.5 bg-gradient-to-tr from-sky-500 to-indigo-500">
                <img
                  src={s.authorAvatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${s.authorUsername}`}
                  alt=""
                  className="w-full h-full rounded-full object-cover border-2 border-[#0f172a]"
                />
              </div>
              <p className="text-[10px] text-slate-400 truncate w-14 text-center">{s.authorName}</p>
            </div>
          )
        })}
      </div>

      {viewing && (
        <StoryViewer
          groups={viewing.groups}
          gi={viewing.gi}
          si={viewing.si}
          onClose={() => setViewing(null)}
          currentUserId={user?.uid}
        />
      )}
    </>
  )
}

function StoryViewer({ groups, gi: initGi, si: initSi, onClose, currentUserId }) {
  const [gi, setGi] = useState(initGi)
  const [si, setSi] = useState(initSi)
  const [imageIndex, setImageIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [audioMuted, setAudioMuted] = useState(false)
  const timerRef = useRef(null)
  const DURATION = 6000

  const stories = groups[gi]
  const story = stories?.[si]
  const images = story?.mediaUrls?.length > 0 ? story.mediaUrls : (story?.mediaUrl ? [story.mediaUrl] : [])
  const currentImage = images[imageIndex] ?? null
  const isAudio = story?.mediaType === 'audio'
  const isVideo = story?.mediaType === 'video'
  const isSharedPost = !!story?.sharedPostId

  // Reset image index when story changes
  useEffect(() => { setImageIndex(0) }, [gi, si])

  useEffect(() => {
    setProgress(0)
    const start = Date.now()
    timerRef.current = setInterval(() => {
      const p = Math.min(100, ((Date.now() - start) / DURATION) * 100)
      setProgress(p)
      if (p >= 100) advance()
    }, 50)
    return () => clearInterval(timerRef.current)
  }, [gi, si])

  function advance() {
    clearInterval(timerRef.current)
    // If multi-image, go to next image first
    if (images.length > 1 && imageIndex < images.length - 1) {
      setImageIndex(i => i + 1)
      setProgress(0)
      const start = Date.now()
      timerRef.current = setInterval(() => {
        const p = Math.min(100, ((Date.now() - start) / DURATION) * 100)
        setProgress(p)
        if (p >= 100) {
          clearInterval(timerRef.current)
          advanceStory()
        }
      }, 50)
      return
    }
    advanceStory()
  }

  function advanceStory() {
    clearInterval(timerRef.current)
    if (si < stories.length - 1) setSi(s => s + 1)
    else if (gi < groups.length - 1) { setGi(g => g + 1); setSi(0) }
    else onClose()
  }

  function prev() {
    clearInterval(timerRef.current)
    if (imageIndex > 0) { setImageIndex(i => i - 1); return }
    if (si > 0) setSi(s => s - 1)
    else if (gi > 0) { setGi(g => g - 1); setSi(0) }
  }

  if (!story) return null

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      <div className="relative w-full max-w-sm h-full max-h-[100dvh] overflow-hidden">

        {/* Background / media */}
        {isVideo && story.mediaUrl ? (
          <video src={story.mediaUrl} autoPlay loop playsInline className="absolute inset-0 w-full h-full object-cover" />
        ) : currentImage ? (
          <>
            {/* Blurred bg — eliminates black bars on non-portrait images */}
            <img src={currentImage} alt="" className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-60" aria-hidden="true" />
            <img src={currentImage} alt="" className="absolute inset-0 w-full h-full object-contain" />
          </>
        ) : (
          /* No visual media — gradient background */
          <div className="absolute inset-0 bg-gradient-to-br from-sky-900 via-indigo-900 to-slate-900" />
        )}

        {/* Audio player (for audio stories) */}
        {isAudio && story.mediaUrl && (
          <div className="absolute inset-0 flex items-center justify-center z-10 px-6">
            <div className="w-full bg-[#1e293b]/90 backdrop-blur-md rounded-2xl p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-sky-500/20 flex items-center justify-center mx-auto mb-4">
                <Music size={28} className="text-sky-400" />
              </div>
              <p className="text-white text-sm font-semibold mb-4">{story.authorName}'s audio</p>
              <audio
                autoPlay
                controls
                muted={audioMuted}
                src={story.mediaUrl}
                className="w-full"
                style={{ colorScheme: 'dark' }}
              />
            </div>
          </div>
        )}

        {/* Gradient scrims for readability */}
        <div className="absolute top-0 left-0 right-0 h-36 bg-gradient-to-b from-black/70 to-transparent pointer-events-none z-10" />
        <div className="absolute bottom-0 left-0 right-0 h-36 bg-gradient-to-t from-black/70 to-transparent pointer-events-none z-10" />

        {/* Text content (text-only or shared post with no image) */}
        {story.text && !currentImage && !isAudio && (
          <div className="absolute inset-0 flex items-center justify-center z-10 px-8">
            <p className="text-white text-xl font-bold text-center leading-relaxed drop-shadow-lg">
              "{story.text}"
            </p>
          </div>
        )}

        {/* Shared post card */}
        {isSharedPost && (
          <div className="absolute bottom-10 left-4 right-4 z-20 bg-black/60 backdrop-blur-md rounded-2xl p-4">
            <p className="text-white/50 text-[11px] uppercase tracking-wider mb-1">Shared post</p>
            <p className="text-white text-sm font-semibold">{story.sharedFromUser}</p>
            {story.text && currentImage && (
              <p className="text-white/75 text-sm mt-1 line-clamp-2">{story.text}</p>
            )}
          </div>
        )}

        {/* Multi-image indicator */}
        {images.length > 1 && (
          <div className="absolute top-16 right-3 z-20 bg-black/60 backdrop-blur-sm rounded-full px-2.5 py-1 text-white text-xs font-semibold">
            {imageIndex + 1}/{images.length}
          </div>
        )}

        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 z-30 flex gap-1 p-2">
          {stories.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-none"
                style={{ width: i < si ? '100%' : i === si ? `${progress}%` : '0%' }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-4 left-0 right-0 z-30 flex items-center gap-2 px-3 pt-4">
          <img src={story.authorAvatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${story.authorUsername}`} alt="" className="w-8 h-8 rounded-full object-cover border border-white/30" />
          <span className="text-white text-sm font-semibold">{story.authorName}</span>
          <span className="text-white/60 text-xs ml-auto">
            {story.createdAt?.toDate ? new Date(story.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
          {story.authorId === currentUserId && (
            <button
              onClick={async () => { await deleteDoc(doc(db, 'stories', story.id)); advance() }}
              className="text-red-400 hover:text-red-300 ml-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-black/40"
            >
              Delete
            </button>
          )}
          <button onClick={onClose} className="text-white/80 hover:text-white ml-1"><X size={20} /></button>
        </div>

        {/* Tap zones */}
        <div className="absolute inset-0 z-20 flex">
          <div className="w-1/3 h-full" onClick={prev} />
          <div className="w-2/3 h-full" onClick={advance} />
        </div>
      </div>
    </div>
  )
}
