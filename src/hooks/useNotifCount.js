import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

export function useNotifCount() {
  const { user } = useAuth()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!user) return setCount(0)
    const q = query(
      collection(db, 'notifications'),
      where('to', '==', user.uid),
      where('read', '==', false)
    )
    return onSnapshot(q, snap => setCount(snap.size))
  }, [user])

  return count
}
