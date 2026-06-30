import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  doc, updateDoc, arrayUnion, arrayRemove, deleteDoc,
  addDoc, collection, serverTimestamp, increment,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { formatDistanceToNow } from 'date-fns'
import {
  Heart, MessageCircle, Repeat2, Bookmark, Share2, MoreHorizontal,
  Trash2, Flag, Link2
} from 'lucide-react'
import toast from 'react-hot-toast'
import OwnerBadge from './OwnerBadge'

export default function PostCard({ post, onDelete }) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [showMenu, setShowMenu] = useState(false)
  const [liked, setLiked] = useState(post.likes?.includes(user?.uid))
  const [likeCount, setLikeCount] = useState(post.likes?.length ?? 0)
  const [reposted, setReposted] = useState(post.reposts?.includes(user?.uid))
  const [repostCount, setRepostCount] = useState(post.reposts?.length ?? 0)
  const [bookmarked, setBookmarked] = useState(post.bookmarks?.includes(user?.uid))
  const heartRef = useRef(null)

  const timeAgo = post.createdAt?.toDate
    ? formatDistanceToNow(post.createdAt.toDate(), { addSuffix: true })
    : 'just now'

  async function toggleLike(e) {
    e.stopPropagation()
    if (!user) return toast.error('Sign in to like')
    const ref = doc(db, 'posts', post.id)
    if (liked) {
      await updateDoc(ref, { likes: arrayRemove(user.uid) })
      setLikeCount(c => c - 1)
    } else {
      await updateDoc(ref, { likes: arrayUnion(user.uid) })
      setLikeCount(c => c + 1)
      if (post.authorId !== user.uid) {
        await addDoc(collection(db, 'notifications'), {
          type: 'like', to: post.authorId, from: user.uid,
          fromName: profile?.displayName, fromAvatar: profile?.avatar,
          postId: post.id, read: false, createdAt: serverTimestamp(),
        })
      }
      heartRef.current?.classList.remove('animate-heart')
      void heartRef.current?.offsetWidth
      heartRef.current?.classList.add('animate-heart')
    }
    setLiked(!liked)
  }

  async function toggleRepost(e) {
    e.stopPropagation()
    if (!user) return toast.error('Sign in to repost')
    const ref = doc(db, 'posts', post.id)
    if (reposted) {
      await updateDoc(ref, { reposts: arrayRemove(user.uid) })
      setRepostCount(c => c - 1)
    } else {
      await updateDoc(ref, { reposts: arrayUnion(user.uid) })
      setRepostCount(c => c + 1)
    }
    setReposted(!reposted)
  }

  async function toggleBookmark(e) {
    e.stopPropagation()
    if (!user) return toast.error('Sign in to bookmark')
    const ref = doc(db, 'posts', post.id)
    if (bookmarked) {
      await updateDoc(ref, { bookmarks: arrayRemove(user.uid) })
      toast('Removed from bookmarks')
    } else {
      await updateDoc(ref, { bookmarks: arrayUnion(user.uid) })
      toast.success('Bookmarked!')
    }
    setBookmarked(!bookmarked)
  }

  async function deletePost(e) {
    e.stopPropagation()
    if (!confirm('Delete this post?')) return
    await deleteDoc(doc(db, 'posts', post.id))
    onDelete?.(post.id)
    toast.success('Post deleted')
    setShowMenu(false)
  }

  function copyLink(e) {
    e.stopPropagation()
    navigator.clipboard.writeText(`${window.location.origin}/post/${post.id}`)
    toast.success('Link copied!')
    setShowMenu(false)
  }

  function goToPost(e) {
    if (e.target.closest('a, button')) return
    navigate(`/post/${post.id}`)
  }

  return (
    <article
      onClick={goToPost}
      className="bg-[#1e293b] border-b border-slate-700/50 px-4 py-4 hover:bg-[#243044] transition cursor-pointer animate-fade-in"
    >
      {/* Repost indicator */}
      {post.isRepost && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2 ml-10">
          <Repeat2 size={14} /><span>{post.repostedByName} reposted</span>
        </div>
      )}

      <div className="flex gap-3">
        {/* Avatar */}
        <Link to={`/profile/${post.authorUsername}`} onClick={e => e.stopPropagation()}>
          <img
            src={post.authorAvatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${post.authorUsername}`}
            alt=""
            className="w-11 h-11 rounded-full object-cover flex-shrink-0 hover:opacity-90 transition ring-2 ring-transparent hover:ring-sky-500"
          />
        </Link>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link
              to={`/profile/${post.authorUsername}`}
              onClick={e => e.stopPropagation()}
              className="font-semibold text-white text-sm hover:text-sky-400 transition"
            >
              {post.authorName}
            </Link>
            {post.authorRole === 'owner' && <OwnerBadge />}
            <span className="text-slate-500 text-sm">@{post.authorUsername}</span>
            <span className="text-slate-600 text-sm">·</span>
            <span className="text-slate-500 text-xs">{timeAgo}</span>

            {/* More menu */}
            <div className="ml-auto relative" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 rounded-full text-slate-500 hover:text-white hover:bg-slate-700 transition"
              >
                <MoreHorizontal size={16} />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-8 bg-[#1e293b] border border-slate-700 rounded-xl shadow-xl z-20 min-w-[160px] py-1">
                  <MenuItem icon={<Link2 size={14} />} label="Copy link" onClick={copyLink} />
                  {(user?.uid === post.authorId || profile?.role === 'owner')
                    ? <MenuItem icon={<Trash2 size={14} />} label="Delete" onClick={deletePost} className="text-red-400" />
                    : <MenuItem icon={<Flag size={14} />} label="Report" onClick={() => { toast('Reported'); setShowMenu(false) }} />
                  }
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <p className="mt-1.5 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{post.content}</p>

          {/* Media */}
          {post.mediaUrls?.length > 0 ? (
            <div className={`mt-3 grid gap-1 rounded-xl overflow-hidden ${post.mediaUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`} onClick={e => e.stopPropagation()}>
              {post.mediaUrls.map((url, i) => (
                <img key={i} src={url} alt="" className="w-full object-cover max-h-64" />
              ))}
            </div>
          ) : (post.mediaUrl || post.imageUrl) ? (
            post.mediaType === 'video' ? (
              <video src={post.mediaUrl} controls onClick={e => e.stopPropagation()} className="mt-3 rounded-xl max-h-80 w-full border border-slate-700 bg-black" />
            ) : (
              <img src={post.mediaUrl || post.imageUrl} alt="" className="mt-3 rounded-xl max-h-80 w-full object-cover border border-slate-700" />
            )
          ) : null}

          {/* Audio */}
          {post.audioUrl && (
            <audio controls onClick={e => e.stopPropagation()} className="mt-3 w-full h-10 rounded-xl">
              <source src={post.audioUrl} />
            </audio>
          )}

          {/* Tags */}
          {post.tags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {post.tags.map(t => (
                <Link
                  key={t}
                  to={`/explore?tag=${t}`}
                  onClick={e => e.stopPropagation()}
                  className="text-xs text-sky-400 hover:text-sky-300 hover:underline"
                >
                  #{t}
                </Link>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="mt-3 flex items-center gap-5">
            <ActionBtn
              icon={<MessageCircle size={17} />}
              count={post.commentCount ?? 0}
              onClick={e => { e.stopPropagation(); navigate(`/post/${post.id}`) }}
              label="Comment"
            />
            <ActionBtn
              icon={<Repeat2 size={17} />}
              count={repostCount}
              onClick={toggleRepost}
              active={reposted}
              activeColor="text-green-400"
              label="Repost"
            />
            <ActionBtn
              ref={heartRef}
              icon={<Heart size={17} className={liked ? 'fill-red-400 text-red-400' : ''} />}
              count={likeCount}
              onClick={toggleLike}
              active={liked}
              activeColor="text-red-400"
              label="Like"
            />
            <button
              onClick={toggleBookmark}
              className={`p-1.5 rounded-full transition ${bookmarked ? 'text-sky-400' : 'text-slate-500 hover:text-sky-400 hover:bg-sky-400/10'}`}
              aria-label="Bookmark"
            >
              <Bookmark size={17} className={bookmarked ? 'fill-sky-400' : ''} />
            </button>
            <button
              onClick={copyLink}
              className="p-1.5 rounded-full text-slate-500 hover:text-white hover:bg-slate-700 transition"
              aria-label="Share"
            >
              <Share2 size={17} />
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

function MenuItem({ icon, label, onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-slate-700 transition ${className || 'text-slate-300'}`}
    >
      {icon}{label}
    </button>
  )
}

function ActionBtn({ icon, count, onClick, active, activeColor, label, ref }) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      aria-label={label}
      className={`flex items-center gap-1.5 text-sm transition group ${
        active ? activeColor : 'text-slate-500'
      }`}
    >
      <span className={`p-1.5 rounded-full transition group-hover:bg-slate-700`}>{icon}</span>
      <span>{count > 0 ? count : ''}</span>
    </button>
  )
}
