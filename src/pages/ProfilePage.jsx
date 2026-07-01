import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  collection, query, where, orderBy, getDocs, limit,
  doc, getDoc, updateDoc, arrayUnion, arrayRemove,
  addDoc, serverTimestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import { uploadImage, uploadMedia } from '../lib/cloudinary'
import { useAuth } from '../context/AuthContext'
import PostCard from '../components/PostCard'
import {
  ArrowLeft, Camera, MapPin, Calendar, Edit3, Loader2, X, Crown,
  Music, Play, Pause, BarChart2, Users, UserMinus, UserPlus, Check
} from 'lucide-react'
import OwnerBadge from '../components/OwnerBadge'
import { format, formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

function isOnline(lastSeen) {
  if (!lastSeen) return false
  const t = lastSeen?.toDate?.() ?? new Date(lastSeen)
  return Date.now() - t.getTime() < 5 * 60 * 1000
}

export default function ProfilePage() {
  const { username } = useParams()
  const navigate = useNavigate()
  const { user, profile: myProfile, setProfile } = useAuth()
  const [profile, setLocalProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('posts')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [followed, setFollowed] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameForm, setRenameForm] = useState({ displayName: '', username: '' })

  // Modals
  const [showFollowModal, setShowFollowModal] = useState(null) // 'followers' | 'following'
  const [showCloseFriends, setShowCloseFriends] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [followUsers, setFollowUsers] = useState([])

  // Profile music
  const [musicPlaying, setMusicPlaying] = useState(false)
  const musicAudio = useRef(null)

  // Creator stats
  const [stats, setStats] = useState(null)

  const isMe = myProfile?.username === username
  const amOwner = myProfile?.role === 'owner'

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        let p = null
        const q = query(collection(db, 'users'), where('username', '==', username), limit(1))
        const snap = await getDocs(q)

        if (!snap.empty) {
          p = { id: snap.docs[0].id, ...snap.docs[0].data() }
        } else {
          const nameQ = query(collection(db, 'users'), where('displayNameLower', '==', username.toLowerCase()), limit(1))
          const nameSnap = await getDocs(nameQ)
          if (!nameSnap.empty) {
            p = { id: nameSnap.docs[0].id, ...nameSnap.docs[0].data() }
          } else {
            const nameQ2 = query(collection(db, 'users'), where('displayName', '==', username), limit(1))
            const nameSnap2 = await getDocs(nameQ2)
            if (!nameSnap2.empty) p = { id: nameSnap2.docs[0].id, ...nameSnap2.docs[0].data() }
          }
        }

        if (!p && isMe && user) {
          const ownSnap = await getDoc(doc(db, 'users', user.uid))
          if (ownSnap.exists()) p = { id: ownSnap.id, ...ownSnap.data() }
        }

        if (!p) { setLoading(false); return }

        setLocalProfile(p)
        setFollowed(myProfile?.following?.includes(p.id))

        const postsQ = query(
          collection(db, 'posts'),
          where('authorId', '==', p.id),
          orderBy('createdAt', 'desc'),
          limit(30)
        )
        const postsSnap = await getDocs(postsQ)
        setPosts(postsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch (err) {
        console.error('Profile load error:', err.message)
      }
      setLoading(false)
    }
    load()
  }, [username, myProfile?.following])

  async function loadStats(profileId, postsArr) {
    const totalLikes = postsArr.reduce((acc, p) => acc + (p.likes?.length ?? 0), 0)
    const totalViews = postsArr.reduce((acc, p) => acc + (p.views ?? 0), 0)
    const totalComments = postsArr.reduce((acc, p) => acc + (p.commentCount ?? 0), 0)
    setStats({ totalLikes, totalViews, totalComments, posts: postsArr.length })
  }

  async function openFollowModal(type) {
    const ids = type === 'followers' ? (profile.followers ?? []) : (profile.following ?? [])
    if (ids.length === 0) { setFollowUsers([]); setShowFollowModal(type); return }
    const chunks = []
    for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10))
    const users = []
    for (const chunk of chunks) {
      const snap = await getDocs(query(collection(db, 'users'), where('__name__', 'in', chunk)))
      snap.docs.forEach(d => users.push({ id: d.id, ...d.data() }))
    }
    setFollowUsers(users)
    setShowFollowModal(type)
  }

  async function toggleFollow() {
    if (!user) return toast.error('Sign in to follow')
    const myRef = doc(db, 'users', user.uid)
    const theirRef = doc(db, 'users', profile.id)
    if (followed) {
      await updateDoc(myRef, { following: arrayRemove(profile.id) })
      await updateDoc(theirRef, { followers: arrayRemove(user.uid) })
      setFollowed(false)
      toast('Unfollowed')
    } else {
      await updateDoc(myRef, { following: arrayUnion(profile.id) })
      await updateDoc(theirRef, { followers: arrayUnion(user.uid) })
      await addDoc(collection(db, 'notifications'), {
        type: 'follow', to: profile.id, from: user.uid,
        fromName: myProfile?.displayName, fromAvatar: myProfile?.avatar,
        read: false, createdAt: serverTimestamp(),
      })
      setFollowed(true)
      toast.success(`Following @${profile.username}`)
    }
  }

  async function toggleCloseFriend(uid) {
    const ref = doc(db, 'users', user.uid)
    const isFriend = myProfile?.closeFriends?.includes(uid)
    if (isFriend) {
      await updateDoc(ref, { closeFriends: arrayRemove(uid) })
      setProfile(p => ({ ...p, closeFriends: (p.closeFriends ?? []).filter(id => id !== uid) }))
      toast('Removed from Close Friends')
    } else {
      await updateDoc(ref, { closeFriends: arrayUnion(uid) })
      setProfile(p => ({ ...p, closeFriends: [...(p.closeFriends ?? []), uid] }))
      toast.success('Added to Close Friends!')
    }
  }

  async function saveEdit() {
    setSavingEdit(true)
    try {
      if (amOwner && !isMe && editForm.avatarFile) {
        const avatar = await uploadImage(editForm.avatarFile)
        await updateDoc(doc(db, 'users', profile.id), { avatar })
        setLocalProfile(prev => ({ ...prev, avatar }))
        setEditForm({})
        toast.success('Avatar updated!')
        setSavingEdit(false)
        return
      }
      const ref = doc(db, 'users', user.uid)
      const updates = {
        displayName: editForm.displayName || myProfile.displayName,
        bio: editForm.bio ?? myProfile.bio,
        location: editForm.location ?? myProfile.location ?? '',
        bannerColor: editForm.bannerColor ?? myProfile.bannerColor ?? '',
      }
      if (editForm.avatarFile) updates.avatar = await uploadImage(editForm.avatarFile)
      if (editForm.bannerFile) updates.banner = await uploadImage(editForm.bannerFile)
      if (editForm.musicFile) {
        const r = await uploadMedia(editForm.musicFile)
        updates.profileMusic = r.url
        updates.profileMusicName = editForm.musicFile.name.replace(/\.[^.]+$/, '')
      }
      await updateDoc(ref, updates)
      setProfile(prev => ({ ...prev, ...updates }))
      setLocalProfile(prev => ({ ...prev, ...updates }))
      setEditing(false)
      toast.success('Profile updated!')
    } catch (err) {
      toast.error(err.message)
    }
    setSavingEdit(false)
  }

  async function saveRename() {
    setSavingEdit(true)
    try {
      const updates = {}
      if (renameForm.displayName.trim()) {
        updates.displayName = renameForm.displayName.trim()
        updates.displayNameLower = renameForm.displayName.trim().toLowerCase()
      }
      if (renameForm.username.trim()) updates.username = renameForm.username.trim().toLowerCase().replace(/\s+/g, '_')
      await updateDoc(doc(db, 'users', profile.id), updates)
      setLocalProfile(prev => ({ ...prev, ...updates }))
      setRenaming(false)
      toast.success('Profile renamed!')
      if (updates.username) navigate(`/profile/${updates.username}`, { replace: true })
    } catch (err) {
      toast.error(err.message)
    }
    setSavingEdit(false)
  }

  function toggleMusic() {
    if (!profile?.profileMusic) return
    if (musicPlaying) {
      musicAudio.current?.pause()
      setMusicPlaying(false)
    } else {
      if (!musicAudio.current) musicAudio.current = new Audio(profile.profileMusic)
      musicAudio.current.src = profile.profileMusic
      musicAudio.current.play().catch(() => {})
      musicAudio.current.onended = () => setMusicPlaying(false)
      setMusicPlaying(true)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="animate-spin text-sky-400" size={28} />
    </div>
  )
  if (!profile) return <div className="text-center py-20 text-slate-500">User not found.</div>

  const joinDate = profile.createdAt?.toDate ? format(profile.createdAt.toDate(), 'MMMM yyyy') : ''
  const likedPosts = posts.filter(p => p.likes?.includes(profile.id))
  const online = isOnline(profile.lastSeen)
  const isCloseFriend = myProfile?.closeFriends?.includes(profile.id)

  // Banner style
  let bannerStyle = {}
  if (profile.banner) {
    bannerStyle = { backgroundImage: `url(${profile.banner})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  } else if (profile.bannerColor) {
    bannerStyle = { background: profile.bannerColor }
  } else if (profile.role === 'owner') {
    bannerStyle = { background: 'linear-gradient(135deg, #b45309, #d97706, #92400e)' }
  } else {
    bannerStyle = { background: 'linear-gradient(135deg, #0369a1, #1d4ed8, #3730a3)' }
  }

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 bg-[#0f172a]/90 backdrop-blur border-b border-slate-700/50 px-4 py-3 flex items-center gap-3 z-10">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="font-semibold text-white text-sm leading-tight">{profile.displayName}</h1>
          <p className="text-xs text-slate-500">{posts.length} posts</p>
        </div>
      </div>

      {/* Banner */}
      <div className="h-36 relative" style={bannerStyle}>
        {!profile.banner && (
          <div className="absolute inset-0 opacity-20"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.15\'%3E%3Cpath d=\'M30 30 L25 20 L35 20 Z\'/%3E%3C/g%3E%3C/svg%3E")', backgroundSize: '30px' }}
          />
        )}
        {profile.role === 'owner' && !profile.banner && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 text-amber-200 text-xs font-semibold opacity-80">
            <Crown size={14} /> ANCHOR OWNER
          </div>
        )}
        {/* Banner upload overlay — not for fans */}
        {editing && isMe && myProfile?.role !== 'fan' && (
          <label className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer">
            <div className="flex flex-col items-center gap-1 text-white">
              <Camera size={20} />
              <span className="text-xs">Change banner</span>
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={e => {
              const f = e.target.files[0]
              if (f) setEditForm(ef => ({ ...ef, bannerFile: f }))
            }} />
          </label>
        )}
        {editing && isMe && editForm.bannerFile && (
          <div className="absolute top-2 right-2 bg-green-500/80 text-white text-xs px-2 py-1 rounded-full">
            Banner selected ✓
          </div>
        )}
      </div>

      {/* Avatar + actions */}
      <div className="px-4 pb-4">
        <div className="flex items-end justify-between -mt-12 mb-4">
          <div className="relative">
            <img
              src={editForm.avatarPreview || profile.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${profile.username}`}
              alt=""
              className="w-24 h-24 rounded-full object-cover border-4 border-[#0f172a]"
            />
            {/* Online dot */}
            {online && (
              <div className="absolute bottom-2 right-2 w-4 h-4 bg-green-400 rounded-full border-2 border-[#0f172a]" title="Online" />
            )}
            {(editing || (amOwner && !isMe)) && (
              <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full cursor-pointer">
                <Camera size={20} className="text-white" />
                <input type="file" accept="image/*" className="hidden" onChange={e => {
                  const f = e.target.files[0]
                  if (f) setEditForm(ef => ({ ...ef, avatarFile: f, avatarPreview: URL.createObjectURL(f) }))
                }} />
              </label>
            )}
          </div>

          <div className="flex gap-2 flex-wrap justify-end">
            {amOwner && !isMe && editForm.avatarFile && (
              <button onClick={saveEdit} disabled={savingEdit} className="px-4 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold transition disabled:opacity-50">
                {savingEdit ? '…' : 'Save Avatar'}
              </button>
            )}
            {amOwner && !isMe && !editForm.avatarFile && (
              <button onClick={() => { setRenaming(r => !r); setRenameForm({ displayName: profile.displayName, username: profile.username }) }} className="px-4 py-1.5 rounded-full border border-amber-500/60 text-amber-400 text-sm font-semibold hover:bg-amber-500/10 transition">
                Rename
              </button>
            )}
            {isMe ? (
              editing ? (
                <div className="flex gap-2">
                  <button onClick={() => { setEditing(false); setEditForm({}) }} className="px-4 py-1.5 rounded-full border border-slate-600 text-slate-300 text-sm hover:bg-slate-800 transition">
                    <X size={14} />
                  </button>
                  <button onClick={saveEdit} disabled={savingEdit} className="px-4 py-1.5 rounded-full bg-white text-black text-sm font-semibold hover:bg-slate-200 transition disabled:opacity-50">
                    {savingEdit ? '…' : 'Save'}
                  </button>
                </div>
              ) : (
                <button onClick={() => { setEditing(true); setEditForm({ displayName: profile.displayName, bio: profile.bio, location: profile.location, bannerColor: profile.bannerColor }) }} className="px-4 py-1.5 rounded-full border border-slate-600 text-slate-300 text-sm font-medium hover:bg-slate-800 transition flex items-center gap-1.5">
                  <Edit3 size={14} /> Edit Profile
                </button>
              )
            ) : (
              <div className="flex gap-2">
                {followed && myProfile?.role !== 'fan' && (
                  <button
                    onClick={() => toggleCloseFriend(profile.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${isCloseFriend ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'border border-slate-600 text-slate-400 hover:text-green-400 hover:border-green-500/50'}`}
                  >
                    {isCloseFriend ? '⭐ Close Friend' : '+ Close Friend'}
                  </button>
                )}
                <button
                  onClick={toggleFollow}
                  className={`px-5 py-1.5 rounded-full text-sm font-semibold transition ${
                    followed
                      ? 'border border-slate-600 text-white hover:border-red-500 hover:text-red-400'
                      : 'bg-white text-black hover:bg-slate-200'
                  }`}
                >
                  {followed ? 'Following' : 'Follow'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Owner rename form */}
        {renaming && (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
            <p className="text-xs text-amber-400 font-semibold">Rename Profile</p>
            <input value={renameForm.displayName} onChange={e => setRenameForm(f => ({ ...f, displayName: e.target.value }))} placeholder="Display name" className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400" />
            <input value={renameForm.username} onChange={e => setRenameForm(f => ({ ...f, username: e.target.value }))} placeholder="Username" className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400" />
            <div className="flex gap-2">
              <button onClick={saveRename} disabled={savingEdit} className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50">{savingEdit ? '…' : 'Save'}</button>
              <button onClick={() => setRenaming(false)} className="px-4 py-1.5 border border-slate-600 text-slate-300 rounded-xl text-sm hover:bg-slate-800 transition">Cancel</button>
            </div>
          </div>
        )}

        {/* Info */}
        {editing ? (
          <div className="space-y-2">
            <input value={editForm.displayName || ''} onChange={e => setEditForm(ef => ({ ...ef, displayName: e.target.value }))} placeholder="Display name" className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500" />
            <textarea value={editForm.bio || ''} onChange={e => setEditForm(ef => ({ ...ef, bio: e.target.value }))} placeholder="Bio" rows={3} className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500 resize-none" />
            <input value={editForm.location || ''} onChange={e => setEditForm(ef => ({ ...ef, location: e.target.value }))} placeholder="Location" className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500" />

            {/* Banner color picker — not for fans */}
            {myProfile?.role !== 'fan' && (
              <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-xl">
                <span className="text-xs text-slate-400">Banner color</span>
                <input type="color" value={editForm.bannerColor || '#0369a1'} onChange={e => setEditForm(ef => ({ ...ef, bannerColor: e.target.value }))} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
                <span className="text-xs text-slate-500">{editForm.bannerColor || 'default'}</span>
                {editForm.bannerColor && (
                  <button type="button" onClick={() => setEditForm(ef => ({ ...ef, bannerColor: '' }))} className="text-xs text-slate-500 hover:text-white ml-auto">Reset</button>
                )}
              </div>
            )}

            {/* Profile music — not for fans */}
            {myProfile?.role !== 'fan' && (
              <label className="flex items-center gap-3 p-3 bg-slate-800 rounded-xl cursor-pointer hover:bg-slate-700 transition">
                <Music size={16} className="text-sky-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-300">{editForm.musicFile ? editForm.musicFile.name : (profile.profileMusicName || 'Add profile music')}</p>
                  <p className="text-[10px] text-slate-500">Upload an audio file</p>
                </div>
                <input type="file" accept="audio/*" className="hidden" onChange={e => {
                  const f = e.target.files[0]
                  if (f) setEditForm(ef => ({ ...ef, musicFile: f }))
                }} />
              </label>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-white">{profile.displayName}</h2>
              {profile.role === 'owner' && <OwnerBadge size="lg" />}
              {online && <span className="text-xs text-green-400 flex items-center gap-1">● Online</span>}
            </div>
            <p className="text-sm text-slate-400">@{profile.username}</p>
            {profile.bio && <p className="text-sm text-slate-300 mt-2 leading-relaxed">{profile.bio}</p>}
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              {profile.location && (
                <span className="flex items-center gap-1 text-xs text-slate-500"><MapPin size={12} />{profile.location}</span>
              )}
              {joinDate && (
                <span className="flex items-center gap-1 text-xs text-slate-500"><Calendar size={12} />Joined {joinDate}</span>
              )}
            </div>

            {/* Profile music player — not for fans */}
            {profile.profileMusic && profile.role !== 'fan' && (
              <button
                onClick={toggleMusic}
                className="mt-3 flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-xl hover:bg-slate-700 transition w-fit"
              >
                {musicPlaying ? <Pause size={14} className="text-sky-400" /> : <Play size={14} className="text-sky-400" />}
                <Music size={13} className="text-sky-400" />
                <span className="text-xs text-slate-300">{profile.profileMusicName || 'Profile music'}</span>
                {musicPlaying && (
                  <span className="flex gap-0.5 items-end h-3">
                    {[1,2,3].map(i => (
                      <span key={i} className="w-0.5 bg-sky-400 rounded-sm animate-pulse" style={{ height: `${Math.random() * 8 + 4}px`, animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </span>
                )}
              </button>
            )}

            <div className="flex items-center gap-5 mt-3 flex-wrap">
              {myProfile?.role !== 'fan' ? (
                <>
                  <button onClick={() => openFollowModal('following')} className="text-sm hover:underline">
                    <span className="font-bold text-white">{profile.following?.length ?? 0}</span>
                    <span className="text-slate-500 ml-1">Following</span>
                  </button>
                  <button onClick={() => openFollowModal('followers')} className="text-sm hover:underline">
                    <span className="font-bold text-white">{profile.followers?.length ?? 0}</span>
                    <span className="text-slate-500 ml-1">Followers</span>
                  </button>
                </>
              ) : (
                <>
                  <span className="text-sm">
                    <span className="font-bold text-white">{profile.following?.length ?? 0}</span>
                    <span className="text-slate-500 ml-1">Following</span>
                  </span>
                  <span className="text-sm">
                    <span className="font-bold text-white">{profile.followers?.length ?? 0}</span>
                    <span className="text-slate-500 ml-1">Followers</span>
                  </span>
                </>
              )}
              {isMe && myProfile?.role !== 'fan' && (
                <>
                  <button onClick={() => setShowCloseFriends(true)} className="text-sm hover:underline">
                    <span className="font-bold text-white">{myProfile?.closeFriends?.length ?? 0}</span>
                    <span className="text-slate-500 ml-1">Close Friends</span>
                  </button>
                  <button onClick={() => { loadStats(profile.id, posts); setShowStats(true) }} className="flex items-center gap-1 text-sm text-slate-500 hover:text-white transition">
                    <BarChart2 size={14} /> Stats
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700/50">
        {['posts', 'likes'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium capitalize border-b-2 transition ${
              tab === t ? 'border-sky-500 text-white' : 'border-transparent text-slate-500 hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      {(tab === 'posts' ? posts : likedPosts).map(p => (
        <PostCard key={p.id} post={p} onDelete={id => setPosts(ps => ps.filter(p => p.id !== id))} />
      ))}

      {/* Follow list modal */}
      {showFollowModal && (
        <Modal title={showFollowModal === 'followers' ? 'Followers' : 'Following'} onClose={() => setShowFollowModal(null)}>
          {followUsers.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-4">No users yet</p>
          ) : (
            <div className="space-y-3">
              {followUsers.map(u => (
                <div key={u.id} className="flex items-center gap-3">
                  <img src={u.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${u.username}`} alt="" className="w-10 h-10 rounded-full object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{u.displayName}</p>
                    <p className="text-xs text-slate-400">@{u.username}</p>
                  </div>
                  {isOnline(u.lastSeen) && <span className="text-xs text-green-400">●</span>}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Close friends modal */}
      {showCloseFriends && isMe && (
        <Modal title={`Close Friends (${myProfile?.closeFriends?.length ?? 0})`} onClose={() => setShowCloseFriends(false)}>
          <p className="text-xs text-slate-500 mb-3">Posts marked "Close Friends" are only visible to these people.</p>
          {(myProfile?.following ?? []).length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-4">Follow people to add close friends</p>
          ) : (
            <div className="space-y-2">
              {/* Show people you follow */}
              <CloseFriendsList followingIds={myProfile?.following ?? []} closeFriends={myProfile?.closeFriends ?? []} onToggle={toggleCloseFriend} />
            </div>
          )}
        </Modal>
      )}

      {/* Creator stats modal */}
      {showStats && stats && (
        <Modal title="Creator Stats" onClose={() => setShowStats(false)}>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total Likes', value: stats.totalLikes, emoji: '❤️' },
              { label: 'Total Views', value: stats.totalViews, emoji: '👁' },
              { label: 'Comments', value: stats.totalComments, emoji: '💬' },
              { label: 'Posts', value: stats.posts, emoji: '📝' },
              { label: 'Followers', value: profile.followers?.length ?? 0, emoji: '👥' },
              { label: 'Following', value: profile.following?.length ?? 0, emoji: '🔗' },
            ].map(s => (
              <div key={s.label} className="bg-slate-800 rounded-xl p-4 text-center">
                <p className="text-2xl mb-1">{s.emoji}</p>
                <p className="text-xl font-bold text-white">{s.value.toLocaleString()}</p>
                <p className="text-xs text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1e293b] rounded-2xl w-full max-w-sm max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50 shrink-0">
          <h3 className="font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white transition">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto anchor-scrollbar flex-1 p-5">
          {children}
        </div>
      </div>
    </div>
  )
}

function CloseFriendsList({ followingIds, closeFriends, onToggle }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (followingIds.length === 0) { setLoading(false); return }
      const chunks = []
      for (let i = 0; i < followingIds.length; i += 10) chunks.push(followingIds.slice(i, i + 10))
      const result = []
      for (const chunk of chunks) {
        const snap = await getDocs(query(collection(db, 'users'), where('__name__', 'in', chunk)))
        snap.docs.forEach(d => result.push({ id: d.id, ...d.data() }))
      }
      setUsers(result)
      setLoading(false)
    }
    load()
  }, [followingIds.join(',')])

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="animate-spin text-sky-400" size={20} /></div>
  if (users.length === 0) return <p className="text-slate-500 text-sm text-center">No one to add</p>

  return (
    <div className="space-y-2">
      {users.map(u => {
        const isFriend = closeFriends.includes(u.id)
        return (
          <div key={u.id} className="flex items-center gap-3">
            <img src={u.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${u.username}`} alt="" className="w-10 h-10 rounded-full object-cover" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{u.displayName}</p>
              <p className="text-xs text-slate-400">@{u.username}</p>
            </div>
            <button
              onClick={() => onToggle(u.id)}
              className={`p-2 rounded-full transition ${isFriend ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400 hover:text-white'}`}
            >
              {isFriend ? <Check size={16} /> : <UserPlus size={16} />}
            </button>
          </div>
        )
      })}
    </div>
  )
}
