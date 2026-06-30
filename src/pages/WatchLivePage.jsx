import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc, setDoc, onSnapshot, addDoc, collection, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { Users, ArrowLeft, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import StreamChat from '../components/StreamChat'

const ICE = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] }

export default function WatchLivePage() {
  const { streamId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [streamData, setStreamData] = useState(null)
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const videoRef = useRef(null)
  const pc = useRef(null)
  const unsubs = useRef([])

  useEffect(() => {
    join()
    return cleanup
  }, [streamId])

  async function join() {
    try {
      const snap = await getDoc(doc(db, 'streams', streamId))
      if (!snap.exists() || !snap.data().active) {
        toast.error('Stream not found or has ended')
        navigate('/')
        return
      }
      setStreamData(snap.data())
      setLoading(false)

      pc.current = new RTCPeerConnection(ICE)
      const remoteStream = new MediaStream()

      pc.current.ontrack = e => {
        e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t))
        if (videoRef.current) videoRef.current.srcObject = remoteStream
        setConnected(true)
      }

      pc.current.onicecandidate = async e => {
        if (e.candidate) {
          await addDoc(collection(db, 'streams', streamId, 'viewers', user.uid, 'viewerCandidates'), e.candidate.toJSON())
        }
      }

      // Signal to host that we joined
      await setDoc(doc(db, 'streams', streamId, 'viewers', user.uid), { joinedAt: new Date().toISOString() })

      // Wait for host's offer
      const unsub = onSnapshot(doc(db, 'streams', streamId, 'viewers', user.uid), async snap => {
        const data = snap.data()
        if (data?.offer && !pc.current.remoteDescription) {
          await pc.current.setRemoteDescription(new RTCSessionDescription(data.offer))
          const answer = await pc.current.createAnswer()
          await pc.current.setLocalDescription(answer)
          await updateDoc(doc(db, 'streams', streamId, 'viewers', user.uid), {
            answer: { type: answer.type, sdp: answer.sdp }
          })
        }
      })
      unsubs.current.push(unsub)

      // Listen for host ICE candidates
      const unsub2 = onSnapshot(collection(db, 'streams', streamId, 'viewers', user.uid, 'hostCandidates'), snap => {
        snap.docChanges().forEach(c => {
          if (c.type === 'added') pc.current?.addIceCandidate(new RTCIceCandidate(c.doc.data()))
        })
      })
      unsubs.current.push(unsub2)

      // Listen for stream ending
      const unsub3 = onSnapshot(doc(db, 'streams', streamId), snap => {
        if (snap.exists()) setStreamData(snap.data())
        if (!snap.data()?.active) {
          toast('Stream ended')
          navigate('/')
        }
      })
      unsubs.current.push(unsub3)

    } catch (err) {
      console.error(err)
      toast.error('Failed to join stream')
      setLoading(false)
    }
  }

  function cleanup() {
    unsubs.current.forEach(u => u())
    unsubs.current = []
    pc.current?.close()
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="animate-spin text-sky-400" size={28} />
    </div>
  )

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4 h-[calc(100dvh-4rem)]">
      {/* Video */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition">
            <ArrowLeft size={20} />
          </button>
          {streamData && (
            <Link to={`/profile/${streamData.hostUsername}`} className="flex items-center gap-2 hover:opacity-80 transition">
              <img src={streamData.hostAvatar} alt="" className="w-9 h-9 rounded-full object-cover" />
              <div>
                <p className="text-white font-semibold text-sm">{streamData.hostName}</p>
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <Users size={10} /> {streamData.viewerCount ?? 0} watching
                </div>
              </div>
            </Link>
          )}
          <span className="ml-1 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />LIVE
          </span>
        </div>

        <div className="relative bg-black rounded-2xl overflow-hidden aspect-video w-full">
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
          {!connected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 className="animate-spin text-sky-400" size={32} />
              <p className="text-slate-400 text-sm">Connecting to stream…</p>
            </div>
          )}
        </div>
      </div>

      {/* Chat */}
      <div className="w-full lg:w-80 h-64 lg:h-auto">
        <StreamChat streamId={streamId} />
      </div>
    </div>
  )
}
