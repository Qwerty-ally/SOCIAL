import { useState, useEffect, useRef } from 'react'
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { uploadMedia } from '../lib/cloudinary'
import { Plus, X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
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
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={addStory} />
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
        />
      )}
    </>
  )
}

function StoryViewer({ groups, gi: initGi, si: initSi, onClose }) {
  const [gi, setGi] = useState(initGi)
  const [si, setSi] = useState(initSi)
  const [progress, setProgress] = useState(0)
  const timerRef = useRef(null)
  const DURATION = 5000

  const stories = groups[gi]
  const story = stories?.[si]

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
    if (si < stories.length - 1) {
      setSi(s => s + 1)
    } else if (gi < groups.length - 1) {
      setGi(g => g + 1)
      setSi(0)
    } else {
      onClose()
    }
  }

  function prev() {
    clearInterval(timerRef.current)
    if (si > 0) setSi(s => s - 1)
    else if (gi > 0) { setGi(g => g - 1); setSi(0) }
  }

  if (!story) return null

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      <div className="relative w-full max-w-sm h-full max-h-[100dvh] bg-black">
        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 p-2">
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
        <div className="absolute top-4 left-0 right-0 z-10 flex items-center gap-2 px-3 pt-4">
          <img src={story.authorAvatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${story.authorUsername}`} alt="" className="w-8 h-8 rounded-full object-cover border border-white/30" />
          <span className="text-white text-sm font-semibold">{story.authorName}</span>
          <span className="text-white/60 text-xs ml-auto">
            {story.createdAt?.toDate ? new Date(story.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
          <button onClick={onClose} className="text-white/80 hover:text-white ml-1"><X size={20} /></button>
        </div>

        {/* Media */}
        {story.mediaType === 'video' ? (
          <video src={story.mediaUrl} autoPlay muted loop className="w-full h-full object-cover" />
        ) : (
          <img src={story.mediaUrl} alt="" className="w-full h-full object-cover" />
        )}

        {/* Tap zones */}
        <div className="absolute inset-0 flex">
          <div className="w-1/3 h-full" onClick={prev} />
          <div className="w-2/3 h-full" onClick={advance} />
        </div>
      </div>
    </div>
  )
}
