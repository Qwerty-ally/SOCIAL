import { useState, useEffect, useRef } from 'react'
import { collection, addDoc, serverTimestamp, onSnapshot, updateDoc, doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Video, VideoOff, Mic, MicOff, PhoneOff, Users, Radio } from 'lucide-react'
import toast from 'react-hot-toast'
import StreamChat from '../components/StreamChat'

const ICE = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] }

export default function GoLivePage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [phase, setPhase] = useState('setup')
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [viewerCount, setViewerCount] = useState(0)
  const videoRef = useRef(null)
  const localStream = useRef(null)
  const streamId = useRef(null)
  const peerConns = useRef({})
  const unsubs = useRef([])

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: true,
      })
      .then(stream => {
        localStream.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(err => toast.error('Camera error: ' + err.message))
    return stopAll
  }, [])

  async function startLive() {
    if (!localStream.current) return toast.error('Camera not ready')
    try {
      const ref = await addDoc(collection(db, 'streams'), {
        hostId: user.uid,
        hostName: profile.displayName,
        hostUsername: profile.username,
        hostAvatar: profile.avatar || '',
        active: true,
        viewerCount: 0,
        startedAt: serverTimestamp(),
      })
      streamId.current = ref.id
      setPhase('live')
      toast.success('You are live!')

      const unsub = onSnapshot(collection(db, 'streams', ref.id, 'viewers'), snap => {
        const count = snap.docs.length
        setViewerCount(count)
        updateDoc(doc(db, 'streams', ref.id), { viewerCount: count })
        snap.docChanges().forEach(change => {
          if (change.type === 'added') connectViewer(ref.id, change.doc.id)
        })
      })
      unsubs.current.push(unsub)
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function connectViewer(sid, viewerId) {
    if (peerConns.current[viewerId]) return
    const pc = new RTCPeerConnection(ICE)
    peerConns.current[viewerId] = pc

    localStream.current.getTracks().forEach(t => pc.addTrack(t, localStream.current))

    pc.onicecandidate = async e => {
      if (e.candidate) {
        await addDoc(collection(db, 'streams', sid, 'viewers', viewerId, 'hostCandidates'), e.candidate.toJSON())
      }
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await updateDoc(doc(db, 'streams', sid, 'viewers', viewerId), { offer: { type: offer.type, sdp: offer.sdp } })

    const unsub = onSnapshot(doc(db, 'streams', sid, 'viewers', viewerId), async snap => {
      const data = snap.data()
      if (data?.answer && !pc.remoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer))
      }
    })
    unsubs.current.push(unsub)

    const unsub2 = onSnapshot(collection(db, 'streams', sid, 'viewers', viewerId, 'viewerCandidates'), snap => {
      snap.docChanges().forEach(c => {
        if (c.type === 'added') pc.addIceCandidate(new RTCIceCandidate(c.doc.data()))
      })
    })
    unsubs.current.push(unsub2)
  }

  async function endLive() {
    stopAll()
    if (streamId.current) await updateDoc(doc(db, 'streams', streamId.current), { active: false })
    toast('Stream ended')
    navigate('/')
  }

  function stopAll() {
    unsubs.current.forEach(u => u())
    unsubs.current = []
    Object.values(peerConns.current).forEach(pc => pc.close())
    peerConns.current = {}
    localStream.current?.getTracks().forEach(t => t.stop())
  }

  function toggleMic() {
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = !micOn })
    setMicOn(m => !m)
  }

  function toggleCam() {
    localStream.current?.getVideoTracks().forEach(t => { t.enabled = !camOn })
    setCamOn(c => !c)
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4 h-[calc(100dvh-4rem)]">
      {/* Video + controls */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <Radio size={20} className="text-red-400" />
          <h1 className="text-white font-bold text-lg">Go Live</h1>
        </div>

        <div className="relative bg-black rounded-2xl overflow-hidden aspect-video w-full">
          <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          {!camOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
              <VideoOff size={48} className="text-slate-600" />
            </div>
          )}
          {phase === 'live' && (
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />LIVE
              </span>
              <span className="bg-black/60 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                <Users size={10} />{viewerCount}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-4 mt-4">
          <button onClick={toggleMic} className={`p-3.5 rounded-full transition ${micOn ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-red-500 text-white'}`}>
            {micOn ? <Mic size={20} /> : <MicOff size={20} />}
          </button>

          {phase === 'setup' ? (
            <button onClick={startLive} className="px-8 py-3 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl transition shadow-lg shadow-red-500/30">
              Go Live
            </button>
          ) : (
            <button onClick={endLive} className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition flex items-center gap-2">
              <PhoneOff size={18} /> End Stream
            </button>
          )}

          <button onClick={toggleCam} className={`p-3.5 rounded-full transition ${camOn ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-red-500 text-white'}`}>
            {camOn ? <Video size={20} /> : <VideoOff size={20} />}
          </button>
        </div>
      </div>

      {/* Chat — only visible during live */}
      {phase === 'live' && streamId.current && (
        <div className="w-full lg:w-80 h-64 lg:h-auto">
          <StreamChat streamId={streamId.current} />
        </div>
      )}
    </div>
  )
}
