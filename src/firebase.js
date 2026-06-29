import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyDUjEN5TurFBrQJDpAi_ODEqkv-uP3EXgs",
  authDomain: "anchor-social-a1367.firebaseapp.com",
  projectId: "anchor-social-a1367",
  storageBucket: "anchor-social-a1367.firebasestorage.app",
  messagingSenderId: "581919128369",
  appId: "1:581919128369:web:1c61bb3784bd1e7b198e10",
  measurementId: "G-QEC3EYZRFM"
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
export default app
