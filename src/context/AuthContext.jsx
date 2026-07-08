import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc, onSnapshot, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const profileUnsubRef = useRef(null)

  useEffect(() => {
    const authUnsub = onAuthStateChanged(auth, async (firebaseUser) => {
      // Tear down any previous profile listener
      if (profileUnsubRef.current) { profileUnsubRef.current(); profileUnsubRef.current = null }

      setUser(firebaseUser)

      if (firebaseUser) {
        const ref = doc(db, 'users', firebaseUser.uid)

        try {
          const snap = await getDoc(ref)
          if (snap.exists() && snap.data().banned) {
            await signOut(auth)
            setLoading(false)
            return
          }
          if (!snap.exists()) {
            const username = firebaseUser.email
              ?.split('@')[0]
              ?.toLowerCase()
              .replace(/[^a-z0-9_]/g, '_') || firebaseUser.uid.slice(0, 8)
            await setDoc(ref, {
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || username,
              username,
              email: firebaseUser.email || '',
              bio: '',
              avatar: `https://api.dicebear.com/9.x/thumbs/svg?seed=${username}`,
              role: 'member',
              followers: [],
              following: [],
              closeFriends: [],
              postCount: 0,
              lastSeen: serverTimestamp(),
              createdAt: serverTimestamp(),
            })
          } else {
            updateDoc(ref, { lastSeen: serverTimestamp() }).catch(() => {})
          }
        } catch (err) {
          console.error('Profile init error:', err.message)
        }

        // Real-time listener — keeps profile.following and all fields in sync
        profileUnsubRef.current = onSnapshot(ref, snap => {
          if (snap.exists()) {
            const data = snap.data()
            if (data.banned) {
              signOut(auth)
              return
            }
            setProfile({ id: snap.id, ...data })
          }
          setLoading(false)
        }, () => setLoading(false))
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
      authUnsub()
      if (profileUnsubRef.current) profileUnsubRef.current()
    }
  }, [])

  // Keep lastSeen fresh
  useEffect(() => {
    if (!user) return
    const ref = doc(db, 'users', user.uid)
    const interval = setInterval(() => {
      updateDoc(ref, { lastSeen: serverTimestamp() }).catch(() => {})
    }, 60_000)
    return () => clearInterval(interval)
  }, [user])

  return (
    <AuthContext.Provider value={{ user, profile, setProfile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
