import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  doc, getDoc, collection, query, orderBy, onSnapshot, limit
} from 'firebase/firestore'
import { db } from '../firebase'
import PostCard from '../components/PostCard'
import ComposeBox from '../components/ComposeBox'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { formatDistanceToNow } from 'date-fns'
import { Heart, Trash2 } from 'lucide-react'
import {
  arrayUnion, arrayRemove, updateDoc, deleteDoc, addDoc,
  serverTimestamp, increment
} from 'firebase/firestore'
import toast from 'react-hot-toast'

export default function PostPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [post, setPost] = useState(null)
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDoc(doc(db, 'posts', id)).then(snap => {
      if (snap.exists()) setPost({ id: snap.id, ...snap.data() })
      setLoading(false)
    })
  }, [id])

  useEffect(() => {
    const q = query(
      collection(db, 'posts', id, 'comments'),
      orderBy('createdAt', 'asc'),
      limit(100)
    )
    return onSnapshot(q, snap => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [id])

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="animate-spin text-sky-400" size={28} />
    </div>
  )
  if (!post) return <div className="text-center py-20 text-slate-500">Post not found.</div>

  return (
    <div>
      <div className="sticky top-0 bg-[#0f172a]/90 backdrop-blur border-b border-slate-700/50 px-4 py-3 flex items-center gap-3 z-10">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-semibold text-white">Post</h1>
      </div>

      <PostCard post={post} onDelete={() => navigate('/')} />

      <div className="border-b border-slate-700/50">
        <ComposeBox replyTo={post} onPost={() => {}} autoFocus />
      </div>

      <div>
        <div className="px-4 py-2 text-xs text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-700/50">
          {comments.length} {comments.length === 1 ? 'Reply' : 'Replies'}
        </div>
        {comments.map(c => (
          <Comment key={c.id} comment={c} postId={id} user={user} profile={profile} />
        ))}
      </div>
    </div>
  )
}

function Comment({ comment, postId, user, profile }) {
  const [liked, setLiked] = useState(comment.likes?.includes(user?.uid))
  const [likeCount, setLikeCount] = useState(comment.likes?.length ?? 0)

  const timeAgo = comment.createdAt?.toDate
    ? formatDistanceToNow(comment.createdAt.toDate(), { addSuffix: true })
    : 'just now'

  async function toggleLike() {
    if (!user) return toast.error('Sign in to like')
    const ref = doc(db, 'posts', postId, 'comments', comment.id)
    if (liked) {
      await updateDoc(ref, { likes: arrayRemove(user.uid) })
      setLikeCount(c => c - 1)
    } else {
      await updateDoc(ref, { likes: arrayUnion(user.uid) })
      setLikeCount(c => c + 1)
    }
    setLiked(!liked)
  }

  async function deleteComment() {
    if (!confirm('Delete reply?')) return
    await deleteDoc(doc(db, 'posts', postId, 'comments', comment.id))
    await updateDoc(doc(db, 'posts', postId), { commentCount: increment(-1) })
    toast.success('Reply deleted')
  }

  return (
    <div className="flex gap-3 px-4 py-4 border-b border-slate-700/30 animate-fade-in">
      <img
        src={comment.authorAvatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${comment.authorUsername}`}
        alt=""
        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-white">{comment.authorName}</span>
          <span className="text-xs text-slate-500">@{comment.authorUsername}</span>
          <span className="text-xs text-slate-600">·</span>
          <span className="text-xs text-slate-500">{timeAgo}</span>
          {user?.uid === comment.authorId && (
            <button onClick={deleteComment} className="ml-auto text-slate-600 hover:text-red-400 transition">
              <Trash2 size={14} />
            </button>
          )}
        </div>
        <p className="text-sm text-slate-200 mt-1 leading-relaxed">{comment.content}</p>
        {comment.imageUrl && (
          <img src={comment.imageUrl} alt="" className="mt-2 rounded-xl max-h-48 object-cover border border-slate-700" />
        )}
        <button onClick={toggleLike} className={`flex items-center gap-1 mt-2 text-sm transition ${liked ? 'text-red-400' : 'text-slate-500 hover:text-red-400'}`}>
          <Heart size={15} className={liked ? 'fill-red-400' : ''} />
          {likeCount > 0 && <span>{likeCount}</span>}
        </button>
      </div>
    </div>
  )
}
