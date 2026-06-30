import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  collection, query, where, orderBy, getDocs, limit,
  doc, getDoc, updateDoc, arrayUnion, arrayRemove,
  addDoc, serverTimestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import { uploadImage } from '../lib/cloudinary'
import { useAuth } from '../context/AuthContext'
import PostCard from '../components/PostCard'
import { ArrowLeft, Camera, MapPin, Calendar, Edit3, Loader2, Check, X, Crown } from 'lucide-react'
import OwnerBadge from '../components/OwnerBadge'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

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

  const isMe = myProfile?.username === username

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        // Try by username first
        let p = null
        const q = query(collection(db, 'users'), where('username', '==', username), limit(1))
        const snap = await getDocs(q)

        if (!snap.empty) {
          p = { id: snap.docs[0].id, ...snap.docs[0].data() }
        } else {
          // Try displayNameLower (case-insensitive)
          const nameQ = query(collection(db, 'users'), where('displayNameLower', '==', username.toLowerCase()), limit(1))
          const nameSnap = await getDocs(nameQ)
          if (!nameSnap.empty) {
            p = { id: nameSnap.docs[0].id, ...nameSnap.docs[0].data() }
          } else {
            // Fallback: match displayName directly
            const nameQ2 = query(collection(db, 'users'), where('displayName', '==', username), limit(1))
            const nameSnap2 = await getDocs(nameQ2)
            if (!nameSnap2.empty) p = { id: nameSnap2.docs[0].id, ...nameSnap2.docs[0].data() }
          }
        }

        if (!p && isMe && user) {
          // Fallback: load own profile by UID (username might differ in URL vs Firestore)
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

  async function saveEdit() {
    setSavingEdit(true)
    try {
      if (myProfile?.role === 'owner' && !isMe && editForm.avatarFile) {
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
      }
      if (editForm.avatarFile) {
        updates.avatar = await uploadImage(editForm.avatarFile)
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

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="animate-spin text-sky-400" size={28} />
    </div>
  )
  if (!profile) return <div className="text-center py-20 text-slate-500">User not found.</div>

  const joinDate = profile.createdAt?.toDate ? format(profile.createdAt.toDate(), 'MMMM yyyy') : ''

  const likedPosts = posts.filter(p => p.likes?.includes(profile.id))

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
      <div className={`h-32 relative ${profile.role === 'owner' ? 'bg-gradient-to-br from-amber-600 via-yellow-600 to-amber-800' : 'bg-gradient-to-br from-sky-600 via-blue-700 to-indigo-800'}`}>
        <div className="absolute inset-0 opacity-30"
          style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.15\'%3E%3Cpath d=\'M30 30 L25 20 L35 20 Z\'/%3E%3C/g%3E%3C/svg%3E")', backgroundSize: '30px' }}
        />
        {profile.role === 'owner' && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 text-amber-200 text-xs font-semibold opacity-80">
            <Crown size={14} /> ANCHOR OWNER
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
            {(editing || (myProfile?.role === 'owner' && !isMe)) && (
              <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full cursor-pointer">
                <Camera size={20} className="text-white" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files[0]
                    if (f) setEditForm(ef => ({ ...ef, avatarFile: f, avatarPreview: URL.createObjectURL(f) }))
                  }}
                />
              </label>
            )}
          </div>

          {myProfile?.role === 'owner' && !isMe && editForm.avatarFile && (
            <button onClick={saveEdit} disabled={savingEdit} className="px-4 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold transition disabled:opacity-50">
              {savingEdit ? '…' : 'Save Avatar'}
            </button>
          )}
          {myProfile?.role === 'owner' && !isMe && !editForm.avatarFile && (
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
              <button onClick={() => { setEditing(true); setEditForm({ displayName: profile.displayName, bio: profile.bio, location: profile.location }) }} className="px-4 py-1.5 rounded-full border border-slate-600 text-slate-300 text-sm font-medium hover:bg-slate-800 transition flex items-center gap-1.5">
                <Edit3 size={14} /> Edit Profile
              </button>
            )
          ) : (
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
          )}
        </div>

        {/* Owner rename form */}
        {renaming && (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
            <p className="text-xs text-amber-400 font-semibold">Rename Profile</p>
            <input
              value={renameForm.displayName}
              onChange={e => setRenameForm(f => ({ ...f, displayName: e.target.value }))}
              placeholder="Display name"
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
            />
            <input
              value={renameForm.username}
              onChange={e => setRenameForm(f => ({ ...f, username: e.target.value }))}
              placeholder="Username"
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
            />
            <div className="flex gap-2">
              <button onClick={saveRename} disabled={savingEdit} className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50">
                {savingEdit ? '…' : 'Save'}
              </button>
              <button onClick={() => setRenaming(false)} className="px-4 py-1.5 border border-slate-600 text-slate-300 rounded-xl text-sm hover:bg-slate-800 transition">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Info */}
        {editing ? (
          <div className="space-y-2">
            <input
              value={editForm.displayName || ''}
              onChange={e => setEditForm(ef => ({ ...ef, displayName: e.target.value }))}
              placeholder="Display name"
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
            />
            <textarea
              value={editForm.bio || ''}
              onChange={e => setEditForm(ef => ({ ...ef, bio: e.target.value }))}
              placeholder="Bio"
              rows={3}
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500 resize-none"
            />
            <input
              value={editForm.location || ''}
              onChange={e => setEditForm(ef => ({ ...ef, location: e.target.value }))}
              placeholder="Location"
              className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
            />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-white">{profile.displayName}</h2>
              {profile.role === 'owner' && <OwnerBadge size="lg" />}
            </div>
            <p className="text-sm text-slate-400">@{profile.username}</p>
            {profile.bio && <p className="text-sm text-slate-300 mt-2 leading-relaxed">{profile.bio}</p>}
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              {profile.location && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <MapPin size={12} />{profile.location}
                </span>
              )}
              {joinDate && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Calendar size={12} />Joined {joinDate}
                </span>
              )}
            </div>
            <div className="flex items-center gap-5 mt-3">
              <button onClick={() => {}} className="text-sm hover:underline">
                <span className="font-bold text-white">{profile.following?.length ?? 0}</span>
                <span className="text-slate-500 ml-1">Following</span>
              </button>
              <button className="text-sm hover:underline">
                <span className="font-bold text-white">{profile.followers?.length ?? 0}</span>
                <span className="text-slate-500 ml-1">Followers</span>
              </button>
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
    </div>
  )
}
