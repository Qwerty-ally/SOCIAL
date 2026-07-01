import { useState, useEffect, useRef } from 'react'
import { collection, addDoc, serverTimestamp, onSnapshot, updateDoc, doc, setDoc, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Video, VideoOff, Mic, MicOff, PhoneOff, Users, Radio, UserMinus, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import StreamChat from '../components/StreamChat'

const ICE = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302', 'stun:stun3.l.google.com:19302', 'stun:stun4.l.google.com:19302'] },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
}

export default function GoLivePage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [phase, setPhase] = useState('setup')
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [viewerCount, setViewerCount] = useState(0)
  const [activeStreamId, setActiveStreamId] = useState(null)
  const [stageGuests, setStageGuests] = useState([]) // [{ uid, name, avatar, stream }]
  const [invitedUids, setInvitedUids] = useState(new Set())
  const videoRef = useRef(null)
  const localStream = useRef(null)
  const streamId = useRef(null)
  const peerConns = useRef({})
  const stagePCs = useRef({})
  const guestStreams = useRef({})
  const unsubs = useRef([])

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 7680 }, height: { ideal: 4320 }, frameRate: { ideal: 60 } },
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 },
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
      const existing = await getDocs(query(collection(db, 'streams'), where('hostId', '==', user.uid)))
      await Promise.all(existing.docs.filter(d => d.data().active).map(d => updateDoc(d.ref, { active: false })))

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
      setActiveStreamId(ref.id)
      setPhase('live')
      toast.success('You are live!')

      // Viewer join listener
      const viewerUnsub = onSnapshot(collection(db, 'streams', ref.id, 'viewers'), snap => {
        const count = snap.docs.length
        setViewerCount(count)
        updateDoc(doc(db, 'streams', ref.id), { viewerCount: count })
        snap.docChanges().forEach(change => {
          if (change.type === 'added') connectViewer(ref.id, change.doc.id)
        })
      })
      unsubs.current.push(viewerUnsub)

      // Stage invites listener
      const stageUnsub = onSnapshot(collection(db, 'streams', ref.id, 'stageInvites'), snap => {
        snap.docChanges().forEach(change => {
          const guestUid = change.doc.id
          const data = change.doc.data()
          if (data.status === 'accepted' && data.offer && !stagePCs.current[guestUid]) {
            connectStageGuest(ref.id, guestUid, data)
          } else if (data.status === 'declined') {
            toast(`${data.viewerName} declined your stage invite`)
            setInvitedUids(prev => { const s = new Set(prev); s.delete(guestUid); return s })
          }
        })
      })
      unsubs.current.push(stageUnsub)

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
        pc.getSenders().forEach(sender => {
          const params = sender.getParameters()
          if (!params.encodings || params.encodings.length === 0) return
          if (sender.track?.kind === 'video') params.encodings[0].maxBitrate = 20_000_000
          if (sender.track?.kind === 'audio') params.encodings[0].maxBitrate = 320_000
          sender.setParameters(params).catch(() => {})
        })
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

  async function inviteToStage(uid, name, avatar) {
    if (invitedUids.has(uid) || stageGuests.some(g => g.uid === uid)) {
      return toast.error(`${name} is already on stage or has been invited`)
    }
    try {
      await setDoc(doc(db, 'streams', streamId.current, 'stageInvites', uid), {
        status: 'pending',
        viewerName: name,
        viewerAvatar: avatar || '',
        invitedAt: serverTimestamp(),
      })
      setInvitedUids(prev => new Set([...prev, uid]))
      toast.success(`Stage invite sent to ${name}`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function connectStageGuest(sid, guestUid, inviteData) {
    const pc = new RTCPeerConnection(ICE)
    stagePCs.current[guestUid] = pc

    const remoteStream = new MediaStream()

    pc.ontrack = e => {
      e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t))
      guestStreams.current[guestUid] = remoteStream
      setStageGuests(prev => prev.map(g => g.uid === guestUid ? { ...g, stream: remoteStream } : g))
    }

    pc.onicecandidate = async e => {
      if (e.candidate) {
        await addDoc(collection(db, 'streams', sid, 'stageInvites', guestUid, 'hostCandidates'), e.candidate.toJSON())
      }
    }

    // Add guest to list with null stream (connecting placeholder)
    setStageGuests(prev => [...prev.filter(g => g.uid !== guestUid), { uid: guestUid, name: inviteData.viewerName, avatar: inviteData.viewerAvatar, stream: null }])

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(inviteData.offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await updateDoc(doc(db, 'streams', sid, 'stageInvites', guestUid), {
        answer: { type: answer.type, sdp: answer.sdp },
        status: 'connected',
      })
    } catch (err) {
      toast.error(`Failed to connect ${inviteData.viewerName} to stage`)
      removeStageGuest(guestUid)
      return
    }

    // Listen for guest ICE candidates
    const cUnsub = onSnapshot(collection(db, 'streams', sid, 'stageInvites', guestUid, 'guestCandidates'), snap => {
      snap.docChanges().forEach(c => {
        if (c.type === 'added') pc.addIceCandidate(new RTCIceCandidate(c.doc.data())).catch(() => {})
      })
    })
    unsubs.current.push(cUnsub)
  }

  async function removeFromStage(guestUid) {
    try {
      await updateDoc(doc(db, 'streams', streamId.current, 'stageInvites', guestUid), { status: 'removed' })
    } catch {}
    removeStageGuest(guestUid)
  }

  function removeStageGuest(guestUid) {
    stagePCs.current[guestUid]?.close()
    delete stagePCs.current[guestUid]
    delete guestStreams.current[guestUid]
    setStageGuests(prev => prev.filter(g => g.uid !== guestUid))
    setInvitedUids(prev => { const s = new Set(prev); s.delete(guestUid); return s })
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
    Object.values(stagePCs.current).forEach(pc => pc.close())
    stagePCs.current = {}
    guestStreams.current = {}
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

  const stagedUids = new Set([...invitedUids, ...stageGuests.map(g => g.uid)])

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

        {/* Stage guests strip */}
        {stageGuests.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Mic size={11} className="text-sky-400" /> On Stage ({stageGuests.length})
            </p>
            <div className="flex gap-3 flex-wrap">
              {stageGuests.map(g => (
                <div key={g.uid} className="relative">
                  <div className="w-44 h-32 bg-black rounded-xl overflow-hidden">
                    {g.stream ? (
                      <video
                        ref={el => { if (el && g.stream) el.srcObject = g.stream }}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                        <Loader2 size={20} className="animate-spin text-sky-400" />
                        <p className="text-slate-500 text-xs">Connecting…</p>
                      </div>
                    )}
                  </div>
                  <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded-full">
                    <img src={g.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${g.uid}`} alt="" className="w-4 h-4 rounded-full object-cover" />
                    <span className="text-white text-xs font-medium truncate max-w-20">{g.name}</span>
                  </div>
                  <button
                    onClick={() => removeFromStage(g.uid)}
                    className="absolute top-2 right-2 bg-red-500 hover:bg-red-400 text-white rounded-full p-1 transition"
                    title="Remove from stage"
                  >
                    <UserMinus size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Chat */}
      {phase === 'live' && activeStreamId && (
        <div className="w-full lg:w-80 h-64 lg:h-auto">
          <StreamChat
            streamId={activeStreamId}
            isHost={true}
            onInviteToStage={inviteToStage}
            stagedUids={stagedUids}
          />
        </div>
      )}
    </div>
  )
}
