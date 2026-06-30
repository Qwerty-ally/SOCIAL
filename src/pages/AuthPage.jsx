import { useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { Anchor, Mail, Lock, User, Eye, EyeOff, Shield, Users, KeyRound, Crown } from 'lucide-react'
import toast from 'react-hot-toast'

// Change this to whatever secret you want
const OWNER_CODE = 'ANCHOR#OFFICIAL'

export default function AuthPage() {
  const [mode, setMode] = useState('login')
  const [role, setRole] = useState('member') // 'member' | 'owner'
  const [showPass, setShowPass] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', username: '', displayName: '', ownerCode: '' })

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'signup') {
        if (role === 'owner') {
          if (form.ownerCode !== OWNER_CODE) {
            toast.error('Invalid owner code.')
            setLoading(false)
            return
          }
        }

        const { user } = await createUserWithEmailAndPassword(auth, form.email, form.password)
        const isOwner = role === 'owner'
        const displayName = isOwner ? 'ANCHOR OFFICIAL' : (form.displayName || form.username)
        const username = isOwner ? 'anchor_official' : form.username.toLowerCase().replace(/\s+/g, '_')

        await updateProfile(user, { displayName })
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          username,
          displayName,
          displayNameLower: displayName.toLowerCase(),
          email: form.email,
          bio: isOwner ? 'The official ANCHOR account. Welcome to the global group.' : '',
          avatar: isOwner
            ? `https://api.dicebear.com/9.x/shapes/svg?seed=anchor&backgroundColor=0ea5e9`
            : `https://api.dicebear.com/9.x/thumbs/svg?seed=${form.username}`,
          role: isOwner ? 'owner' : 'member',
          followers: [],
          following: [],
          postCount: 0,
          createdAt: serverTimestamp(),
        })
        toast.success(isOwner ? 'Welcome, ANCHOR Owner!' : 'Welcome to ANCHOR!')
      } else {
        await signInWithEmailAndPassword(auth, form.email, form.password)
        toast.success('Signed in!')
      }
    } catch (err) {
      toast.error(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] px-4 py-10">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-500 mb-4 shadow-lg shadow-sky-500/30">
            <Anchor className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">ANCHOR</h1>
          <p className="text-slate-400 mt-1 text-sm">The global group — drop your anchor.</p>
        </div>

        {/* Card */}
        <div className="bg-[#1e293b] rounded-2xl shadow-xl border border-slate-700/50 p-8">
          {/* Sign in / Sign up tabs */}
          <div className="flex rounded-xl bg-slate-800 p-1 mb-6">
            {['login', 'signup'].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setRole('member') }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === m ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          {/* Role picker — only on sign up */}
          {mode === 'signup' && (
            <div className="mb-5">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">Account Type</p>
              <div className="grid grid-cols-2 gap-3">
                <RoleCard
                  selected={role === 'member'}
                  onClick={() => setRole('member')}
                  icon={<Users size={22} className="text-sky-400" />}
                  title="Member"
                  desc="Join the ANCHOR community as a regular member."
                  color="sky"
                />
                <RoleCard
                  selected={role === 'owner'}
                  onClick={() => setRole('owner')}
                  icon={<Crown size={22} className="text-amber-400" />}
                  title="Owner"
                  desc="Control the ANCHOR OFFICIAL account. Requires a secret code."
                  color="amber"
                />
              </div>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && role === 'member' && (
              <>
                <Field icon={<User size={16} />} name="displayName" placeholder="Display name" value={form.displayName} onChange={handle} />
                <Field icon={<span className="text-slate-400 text-xs font-bold">@</span>} name="username" placeholder="Username (no spaces)" value={form.username} onChange={handle} required />
              </>
            )}

            {mode === 'signup' && role === 'owner' && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 flex items-start gap-2">
                <Crown size={14} className="mt-0.5 shrink-0 text-amber-400" />
                <span>Your account will be set up as <strong>ANCHOR OFFICIAL</strong> with the username <strong>@anchor_official</strong>. Only one owner account should exist.</span>
              </div>
            )}

            <Field icon={<Mail size={16} />} type="email" name="email" placeholder="Email" value={form.email} onChange={handle} required />

            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Lock size={16} />
              </div>
              <input
                type={showPass ? 'text' : 'password'}
                name="password"
                placeholder="Password"
                value={form.password}
                onChange={handle}
                required
                className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
              />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Owner code field */}
            {mode === 'signup' && role === 'owner' && (
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400">
                  <KeyRound size={16} />
                </div>
                <input
                  type={showCode ? 'text' : 'password'}
                  name="ownerCode"
                  placeholder="Owner secret code"
                  value={form.ownerCode}
                  onChange={handle}
                  required
                  className="w-full bg-slate-800 border border-amber-500/50 rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition"
                />
                <button type="button" onClick={() => setShowCode(!showCode)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showCode ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 text-white rounded-xl font-semibold text-sm transition shadow-lg disabled:opacity-50 ${
                mode === 'signup' && role === 'owner'
                  ? 'bg-amber-500 hover:bg-amber-400 shadow-amber-500/30'
                  : 'bg-sky-500 hover:bg-sky-400 shadow-sky-500/30'
              }`}
            >
              {loading
                ? 'Loading…'
                : mode === 'login'
                  ? 'Sign In'
                  : role === 'owner'
                    ? 'Create Owner Account'
                    : 'Join ANCHOR'}
            </button>
          </form>
        </div>
        <p className="text-center text-slate-500 text-xs mt-4">By joining you agree to be excellent to each other.</p>
      </div>
    </div>
  )
}

function RoleCard({ selected, onClick, icon, title, desc, color }) {
  const ring = color === 'amber' ? 'border-amber-400 bg-amber-400/10' : 'border-sky-400 bg-sky-400/10'
  const base = 'border-slate-700 bg-slate-800/50 hover:border-slate-500'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-2 p-4 rounded-xl border text-center transition-all ${selected ? ring : base}`}
    >
      {icon}
      <span className="text-sm font-semibold text-white">{title}</span>
      <span className="text-[11px] text-slate-400 leading-tight">{desc}</span>
    </button>
  )
}

function Field({ icon, ...props }) {
  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 flex items-center">{icon}</div>
      <input
        {...props}
        className="w-full bg-slate-800 border border-slate-600 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
      />
    </div>
  )
}
