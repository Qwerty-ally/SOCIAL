import { useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'

const BG_PRESETS = [
  'linear-gradient(135deg, #0c4a6e, #1e1b4b, #0f172a)',
  'linear-gradient(135deg, #7c2d12, #9f1239, #581c87)',
  'linear-gradient(135deg, #052e16, #064e3b, #0f766e)',
  'linear-gradient(135deg, #450a0a, #991b1b, #78350f)',
  'linear-gradient(135deg, #1e1b4b, #4338ca, #0ea5e9)',
  'linear-gradient(135deg, #1a0533, #6b21a8, #db2777)',
  '#000000',
  '#0f172a',
  '#1c0a00',
  '#0a001f',
]

const TEXT_PRESETS = [
  '#ffffff', '#fef3c7', '#7dd3fc', '#fbbf24',
  '#fb7185', '#4ade80', '#fb923c', '#c084fc',
]

export default function StoryComposer({ post, onClose }) {
  const { user, profile } = useAuth()
  const [bg, setBg] = useState(BG_PRESETS[0])
  const [textColor, setTextColor] = useState('#ffffff')
  const [posting, setPosting] = useState(false)

  const hasMedia = !!(post.mediaUrl || post.imageUrl || post.mediaUrls?.length > 0)
  const preview = post.content?.slice(0, 150) + (post.content?.length > 150 ? '…' : '')

  async function submit() {
    setPosting(true)
    try {
      await addDoc(collection(db, 'stories'), {
        authorId: user.uid,
        authorName: profile?.displayName || profile?.username,
        authorUsername: profile?.username,
        authorAvatar: profile?.avatar || '',
        mediaUrl: post.mediaUrl || post.imageUrl || null,
        mediaUrls: post.mediaUrls || null,
        mediaType: post.mediaType || (post.mediaUrl ? 'image' : null),
        text: post.content,
        sharedPostId: post.id,
        sharedFromUser: post.authorName,
        bgStyle: hasMedia ? null : bg,
        textColor: hasMedia ? null : textColor,
        createdAt: serverTimestamp(),
      })
      toast.success('Shared to your story!')
      onClose()
    } catch (err) {
      toast.error(err.message)
    }
    setPosting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#1e293b] border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-sm p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-base">Share to Story</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition">
            <X size={18} />
          </button>
        </div>

        {/* Preview */}
        {!hasMedia && (
          <div
            className="relative w-full h-48 rounded-2xl overflow-hidden flex items-center justify-center mb-4"
            style={{ background: bg }}
          >
            <p
              className="text-lg font-bold text-center leading-relaxed px-6 drop-shadow-lg"
              style={{ color: textColor }}
            >
              "{preview}"
            </p>
          </div>
        )}

        {hasMedia && post.mediaUrl && (
          <div className="rounded-xl overflow-hidden mb-4 h-32 bg-black">
            <img src={post.mediaUrl || post.mediaUrls?.[0]} alt="" className="w-full h-full object-cover opacity-80" />
          </div>
        )}

        {/* Color pickers — only for text-only stories */}
        {!hasMedia && (
          <>
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Background</p>
            <div className="flex gap-2 flex-wrap mb-4">
              {BG_PRESETS.map((b, i) => (
                <button
                  key={i}
                  onClick={() => setBg(b)}
                  className="w-8 h-8 rounded-full transition"
                  style={{
                    background: b,
                    outline: bg === b ? '2px solid white' : '2px solid transparent',
                    outlineOffset: '2px',
                  }}
                />
              ))}
            </div>

            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Text Color</p>
            <div className="flex gap-2 flex-wrap mb-4">
              {TEXT_PRESETS.map((c, i) => (
                <button
                  key={i}
                  onClick={() => setTextColor(c)}
                  className="w-8 h-8 rounded-full transition"
                  style={{
                    background: c,
                    outline: textColor === c ? '2px solid #94a3b8' : '2px solid transparent',
                    outlineOffset: '2px',
                  }}
                />
              ))}
            </div>
          </>
        )}

        <button
          onClick={submit}
          disabled={posting}
          className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl transition disabled:opacity-50"
        >
          {posting ? 'Posting…' : 'Post to Story'}
        </button>
      </div>
    </div>
  )
}
