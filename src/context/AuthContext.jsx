import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        try {
          const ref = doc(db, 'users', firebaseUser.uid)
          const snap = await getDoc(ref)

          if (snap.exists()) {
            setProfile({ id: snap.id, ...snap.data() })
          } else {
            // User doc missing (rules were off during signup) — create it now
            const username = firebaseUser.email
              ?.split('@')[0]
              ?.toLowerCase()
              .replace(/[^a-z0-9_]/g, '_') || firebaseUser.uid.slice(0, 8)

            const defaultProfile = {
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || username,
              username,
              email: firebaseUser.email || '',
              bio: '',
              avatar: `https://api.dicebear.com/9.x/thumbs/svg?seed=${username}`,
              role: 'member',
              followers: [],
              following: [],
              postCount: 0,
              createdAt: serverTimestamp(),
            }
            await setDoc(ref, defaultProfile)
            setProfile({ id: firebaseUser.uid, ...defaultProfile })
          }
        } catch (err) {
          console.error('Profile load error:', err.message)
          // Fallback so app doesn't break — Firestore rules might still be unpublished
          const username = firebaseUser.email?.split('@')[0]?.toLowerCase() || 'user'
          setProfile({
            id: firebaseUser.uid,
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName || username,
            username,
            avatar: `https://api.dicebear.com/9.x/thumbs/svg?seed=${username}`,
            role: 'member',
            followers: [],
            following: [],
          })
        }
      } else {
        setProfile(null)
      }
      setLoading(false)
    })
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, setProfile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
