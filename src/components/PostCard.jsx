import { useState, useRef, useEffect, Fragment } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  doc, updateDoc, arrayUnion, arrayRemove, deleteDoc,
  addDoc, collection, serverTimestamp, increment,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Heart, MessageCircle, Repeat2, Bookmark, Share2, MoreHorizontal,
  Trash2, Flag, Link2, Eye, BookImage, MapPin, Calendar, Clock,
  CheckCircle2, Users, Edit3
} from 'lucide-react'
import toast from 'react-hot-toast'
import OwnerBadge from './OwnerBadge'
import StoryComposer from './StoryComposer'

function renderContent(text) {
  if (!text) return null
  return text.split(/(@\w+)/g).map((part, i) => {
    if (/^@\w+$/.test(part)) {
      return (
        <Link key={i} to={`/profile/${part.slice(1)}`} onClick={e => e.stopPropagation()} className="text-sky-400 hover:underline">
          {part}
        </Link>
      )
    }
    return <span key={i}>{part}</span>
  })
}

function useCountdown(to) {
  const [diff, setDiff] = useState(null)
  useEffect(() => {
    if (!to) return
    const target = to?.toDate ? to.toDate().getTime() : new Date(to).getTime()
    function tick() {
      const rem = target - Date.now()
      setDiff(rem)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [to])
  return diff
}

function CountdownDisplay({ to, label }) {
  const diff = useCountdown(to)
  const [tick, setTick] = useState(false)

  useEffect(() => {
    setTick(true)
    const t = setTimeout(() => setTick(false), 200)
    return () => clearTimeout(t)
  }, [diff])

  if (diff === null) return null

  if (diff <= 0) {
    return (
      <div className="mt-3 rounded-xl border border-slate-700 p-4 bg-[#1e293b] text-center">
        <p className="text-slate-400 text-xs mb-1">{label || 'Countdown'}</p>
        <p className="text-green-400 font-bold text-lg">Time's up! 🎉</p>
      </div>
    )
  }

  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)

  return (
    <div className="mt-3 rounded-xl border border-slate-700 p-4 bg-[#1e293b]">
      <p className="text-slate-400 text-xs text-center mb-3">{label || 'Countdown'}</p>
      <div className="flex justify-center gap-3">
        {[['d', d], ['h', h], ['m', m], ['s', s]].map(([unit, val]) => (
          <div key={unit} className="text-center">
            <div className={`text-2xl font-bold text-white font-mono min-w-[2.5rem] ${unit === 's' && tick ? 'animate-tick' : ''}`}>
              {String(val).padStart(2, '0')}
            </div>
            <div className="text-[10px] text-slate-500 uppercase">{unit}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PostCard({ post, onDelete }) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [showMenu, setShowMenu] = useState(false)
  const [liked, setLiked] = useState(post.likes?.includes(user?.uid))
  const [likeCount, setLikeCount] = useState(post.likes?.length ?? 0)
  const [reposted, setReposted] = useState(post.reposts?.includes(user?.uid))
  const [repostCount, setRepostCount] = useState(post.reposts?.length ?? 0)
  const [bookmarked, setBookmarked] = useState(post.bookmarks?.includes(user?.uid))
  const [views, setViews] = useState(post.views ?? 0)
  const [rsvped, setRsvped] = useState(post.rsvps?.includes(user?.uid))
  const [rsvpCount, setRsvpCount] = useState(post.rsvps?.length ?? 0)
  const [editingCountdown, setEditingCountdown] = useState(false)
  const [editLabel, setEditLabel] = useState('')
  const [editTo, setEditTo] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editingPost, setEditingPost] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [savingPostEdit, setSavingPostEdit] = useState(false)
  const [showStoryComposer, setShowStoryComposer] = useState(false)
  const heartRef = useRef(null)

  const timeAgo = post.createdAt?.toDate
    ? formatDistanceToNow(post.createdAt.toDate(), { addSuffix: true })
    : 'just now'

  // Track view once per session
  useEffect(() => {
    if (!post.id || !user) return
    const key = `viewed_${post.id}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
    updateDoc(doc(db, 'posts', post.id), { views: increment(1) }).catch(() => {})
    setViews(v => v + 1)
  }, [post.id, user])

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

  async function toggleRsvp(e) {
    e.stopPropagation()
    if (!user) return toast.error('Sign in to RSVP')
    const ref = doc(db, 'posts', post.id)
    if (rsvped) {
      await updateDoc(ref, { rsvps: arrayRemove(user.uid) })
      setRsvpCount(c => c - 1)
    } else {
      await updateDoc(ref, { rsvps: arrayUnion(user.uid) })
      setRsvpCount(c => c + 1)
    }
    setRsvped(!rsvped)
  }

  function shareToStory(e) {
    e.stopPropagation()
    if (!user) return
    setShowMenu(false)
    setShowStoryComposer(true)
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
    navigator.clipboard.writeText(`${window.location.origin}/SOCIAL/post/${post.id}`)
    toast.success('Link copied!')
    setShowMenu(false)
  }

  function openPostEdit(e) {
    e.stopPropagation()
    setEditContent(post.content || '')
    setEditingPost(true)
    setShowMenu(false)
  }

  async function savePostEdit(e) {
    e.stopPropagation()
    if (!editContent.trim()) return toast.error('Post cannot be empty')
    setSavingPostEdit(true)
    try {
      await updateDoc(doc(db, 'posts', post.id), {
        content: editContent.trim(),
        editedAt: serverTimestamp(),
      })
      setEditingPost(false)
      toast.success('Post updated!')
    } catch (err) {
      toast.error(err.message)
    }
    setSavingPostEdit(false)
  }

  function openCountdownEdit(e) {
    e.stopPropagation()
    const raw = post.countdownTo?.toDate ? post.countdownTo.toDate() : new Date(post.countdownTo)
    const localVal = new Date(raw.getTime() - raw.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setEditLabel(post.countdownLabel || '')
    setEditTo(localVal)
    setEditingCountdown(true)
    setShowMenu(false)
  }

  async function saveCountdown(e) {
    e.stopPropagation()
    if (!editTo) return
    setSavingEdit(true)
    try {
      await updateDoc(doc(db, 'posts', post.id), {
        countdownTo: new Date(editTo).toISOString(),
        countdownLabel: editLabel || 'Countdown',
      })
      setEditingCountdown(false)
      toast.success('Countdown updated!')
    } catch (err) {
      toast.error(err.message)
    }
    setSavingEdit(false)
  }

  function goToPost(e) {
    if (e.target.closest('a, button')) return
    navigate(`/post/${post.id}`)
  }

  const canDelete = user?.uid === post.authorId || profile?.role === 'owner'

  return (
    <>
    <article
      onClick={goToPost}
      className={`bg-[#1e293b] border-b border-slate-700/50 px-4 py-4 hover:bg-[#243044] transition cursor-pointer animate-fade-in relative${showMenu ? ' z-10' : ''}`}
    >
      {/* Repost indicator */}
      {post.isRepost && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2 ml-10">
          <Repeat2 size={14} /><span>{post.repostedByName} reposted</span>
        </div>
      )}

      {/* Close friends badge */}
      {post.closeFriendsOnly && (
        <div className="flex items-center gap-1 text-[11px] text-green-400 mb-2 ml-10">
          <Users size={11} /> Close Friends only
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

            {/* Co-authors */}
            {(post.coAuthors?.length > 0 || post.coAuthorUsername) && (
              (post.coAuthors || [{ username: post.coAuthorUsername, displayName: post.coAuthorName, avatar: post.coAuthorAvatar }])
                .map(ca => (
                  <Fragment key={ca.username || ca.id}>
                    <span className="text-slate-500 text-xs">+</span>
                    <Link
                      to={`/profile/${ca.username}`}
                      onClick={e => e.stopPropagation()}
                      className="font-semibold text-white text-sm hover:text-sky-400 transition flex items-center gap-1"
                    >
                      <img
                        src={ca.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${ca.username}`}
                        alt=""
                        className="w-4 h-4 rounded-full object-cover"
                      />
                      {ca.displayName}
                    </Link>
                  </Fragment>
                ))
            )}

            <span className="text-slate-500 text-sm">@{post.authorUsername}</span>
            <span className="text-slate-600 text-sm">·</span>
            <span className="text-slate-500 text-xs">{timeAgo}</span>
            {post.postType === 'scheduled' && (
              <span className="text-xs text-amber-400 flex items-center gap-0.5"><Clock size={10} /> Scheduled</span>
            )}

            {/* More menu */}
            <div className="ml-auto relative" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 rounded-full text-slate-500 hover:text-white hover:bg-slate-700 transition"
              >
                <MoreHorizontal size={16} />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-8 bg-[#1e293b] border border-slate-700 rounded-xl shadow-xl z-50 min-w-[160px] py-1">
                  <MenuItem icon={<Link2 size={14} />} label="Copy link" onClick={copyLink} />
                  {profile?.role !== 'fan' && (
                    <MenuItem icon={<BookImage size={14} />} label="Share to story" onClick={shareToStory} />
                  )}
                  {user?.uid === post.authorId && (
                    <MenuItem icon={<Edit3 size={14} />} label="Edit post" onClick={openPostEdit} />
                  )}
                  {post.postType === 'countdown' && user?.uid === post.authorId && (
                    <MenuItem icon={<Edit3 size={14} />} label="Edit countdown" onClick={openCountdownEdit} />
                  )}
                  {canDelete
                    ? <MenuItem icon={<Trash2 size={14} />} label="Delete" onClick={deletePost} className="text-red-400" />
                    : <MenuItem icon={<Flag size={14} />} label="Report" onClick={() => { toast('Reported'); setShowMenu(false) }} />
                  }
                </div>
              )}
            </div>
          </div>

          {/* Pending collab badge (author-only) */}
          {post.collabPending && user?.uid === post.authorId && (
            <div className="mt-1.5 mb-1 flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1 w-fit">
              <Users size={11} /> Waiting for co-author approval
            </div>
          )}

          {/* Content */}
          {editingPost ? (
            <div className="mt-1.5" onClick={e => e.stopPropagation()}>
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                rows={Math.max(3, editContent.split('\n').length)}
                autoFocus
                className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setEditingPost(false)}
                  className="flex-1 py-1.5 border border-slate-600 text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={savePostEdit}
                  disabled={savingPostEdit || !editContent.trim()}
                  className="flex-1 py-1.5 bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
                >
                  {savingPostEdit ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
              {renderContent(post.content)}
              {post.editedAt && <span className="text-[10px] text-slate-500 ml-1">(edited)</span>}
            </p>
          )}

          {/* Event card */}
          {post.postType === 'event' && post.eventTitle && (
            <div className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
              <p className="text-sm font-bold text-white mb-2">{post.eventTitle}</p>
              <div className="space-y-1.5">
                {post.eventDate && (
                  <p className="text-xs text-slate-400 flex items-center gap-2">
                    <Calendar size={12} className="text-sky-400 shrink-0" />
                    {format(new Date(post.eventDate), 'PPP p')}
                  </p>
                )}
                {post.eventLocation && (
                  <p className="text-xs text-slate-400 flex items-center gap-2">
                    <MapPin size={12} className="text-sky-400 shrink-0" />
                    {post.eventLocation}
                  </p>
                )}
              </div>
              {profile?.role !== 'fan' ? (
                <button
                  onClick={toggleRsvp}
                  className={`mt-3 px-4 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 ${
                    rsvped
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-sky-500 hover:bg-sky-400 text-white'
                  }`}
                >
                  {rsvped ? <><CheckCircle2 size={13} /> Going ({rsvpCount})</> : <>RSVP · {rsvpCount} going</>}
                </button>
              ) : rsvpCount > 0 && (
                <p className="mt-2 text-xs text-slate-500">{rsvpCount} going</p>
              )}
            </div>
          )}

          {/* Countdown card */}
          {post.postType === 'countdown' && post.countdownTo && (
            editingCountdown ? (
              <div className="mt-3 rounded-xl border border-sky-500/40 bg-[#1e293b] p-4 space-y-2" onClick={e => e.stopPropagation()}>
                <p className="text-xs text-sky-400 font-semibold mb-1">Edit Countdown</p>
                <input
                  value={editLabel}
                  onChange={e => setEditLabel(e.target.value)}
                  placeholder="Label (e.g. Album drops in…)"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <input
                  type="datetime-local"
                  value={editTo}
                  onChange={e => setEditTo(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setEditingCountdown(false)}
                    className="flex-1 py-1.5 border border-slate-600 text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-700 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveCountdown}
                    disabled={savingEdit || !editTo}
                    className="flex-1 py-1.5 bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
                  >
                    {savingEdit ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <CountdownDisplay to={post.countdownTo} label={post.countdownLabel} />
            )
          )}

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
            {views > 0 && profile?.role !== 'fan' && (
              <span className="flex items-center gap-1 text-xs text-slate-600 ml-auto">
                <Eye size={13} />{views}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>

    {showStoryComposer && (
      <StoryComposer post={post} onClose={() => setShowStoryComposer(false)} />
    )}
    </>
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
      <span className="p-1.5 rounded-full transition group-hover:bg-slate-700">{icon}</span>
      <span>{count > 0 ? count : ''}</span>
    </button>
  )
}
