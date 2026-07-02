import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc, setDoc, onSnapshot, addDoc, collection, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { Users, ArrowLeft, Loader2, Mic, Video, PhoneOff } from 'lucide-react'
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

export default function WatchLivePage() {
  const { streamId } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [streamData, setStreamData] = useState(null)
  const [connected, setConnected] = useState(false)
  const [viewerList, setViewerList] = useState([])
  const [showViewers, setShowViewers] = useState(false)
  const [loading, setLoading] = useState(true)
  const [stageStatus, setStageStatus] = useState(null) // null | 'invited' | 'connecting' | 'on-stage'
  const [stageFeeds, setStageFeeds] = useState([]) // [{uid, name, avatar, stream}]
  const [ownerStagedUids, setOwnerStagedUids] = useState(new Set())
  const videoRef = useRef(null)
  const pc = useRef(null)
  const stageStream = useRef(null)
  const stagePc = useRef(null)
  const stageFeedPCs = useRef({})
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
      const streamInfo = snap.data()
      if (streamInfo?.blockedUsers?.includes(user.uid)) {
        toast.error('You have been removed from this stream')
        navigate('/')
        return
      }
      setStreamData(streamInfo)
      setLoading(false)

      // Main viewer connection (receive host stream)
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

      await setDoc(doc(db, 'streams', streamId, 'viewers', user.uid), {
        joinedAt: new Date().toISOString(),
        displayName: profile?.displayName || 'Viewer',
        username: profile?.username || '',
        avatar: profile?.avatar || '',
      })

      // Listen to all viewers for the "who's watching" list
      const viewersUnsub = onSnapshot(collection(db, 'streams', streamId, 'viewers'), snap => {
        setViewerList(snap.docs.map(d => ({ uid: d.id, ...d.data() })))
      })
      unsubs.current.push(viewersUnsub)

      // Owner: track who is already on/invited to stage
      if (profile?.role === 'owner') {
        const stageInvitesUnsub = onSnapshot(collection(db, 'streams', streamId, 'stageInvites'), snap => {
          const active = new Set(
            snap.docs.filter(d => ['pending', 'accepted', 'connected'].includes(d.data().status)).map(d => d.id)
          )
          setOwnerStagedUids(active)
        })
        unsubs.current.push(stageInvitesUnsub)
      }

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

      const unsub2 = onSnapshot(collection(db, 'streams', streamId, 'viewers', user.uid, 'hostCandidates'), snap => {
        snap.docChanges().forEach(c => {
          if (c.type === 'added') pc.current?.addIceCandidate(new RTCIceCandidate(c.doc.data()))
        })
      })
      unsubs.current.push(unsub2)

      const unsub3 = onSnapshot(doc(db, 'streams', streamId), snap => {
        if (snap.exists()) setStreamData(snap.data())
        const data = snap.data()
        if (!data?.active) {
          toast('Stream ended')
          navigate('/')
        } else if (data?.blockedUsers?.includes(user.uid)) {
          toast.error('You have been removed from this stream')
          navigate('/')
        }
      })
      unsubs.current.push(unsub3)

      // Stage invite listener
      const stageUnsub = onSnapshot(doc(db, 'streams', streamId, 'stageInvites', user.uid), async snap => {
        if (!snap.exists()) return
        const data = snap.data()
        if (data.status === 'pending') {
          setStageStatus('invited')
        } else if ((data.status === 'connected') && data.answer && stagePc.current && !stagePc.current.remoteDescription) {
          await stagePc.current.setRemoteDescription(new RTCSessionDescription(data.answer))
          setStageStatus('on-stage')
        } else if (data.status === 'removed') {
          stageStream.current?.getTracks().forEach(t => t.stop())
          stageStream.current = null
          stagePc.current?.close()
          stagePc.current = null
          Object.values(stageFeedPCs.current).forEach(p => p.close())
          stageFeedPCs.current = {}
          setStageFeeds([])
          setStageStatus(null)
          toast('You have been removed from the stage')
        }
      })
      unsubs.current.push(stageUnsub)

    } catch (err) {
      console.error(err)
      toast.error('Failed to join stream')
      setLoading(false)
    }
  }

  async function ownerInviteToStage(uid, name, avatar) {
    if (ownerStagedUids.has(uid)) {
      return toast.error(`${name} is already on stage or has been invited`)
    }
    try {
      await setDoc(doc(db, 'streams', streamId, 'stageInvites', uid), {
        status: 'pending',
        viewerName: name,
        viewerAvatar: avatar || '',
        invitedAt: serverTimestamp(),
      })
      toast.success(`Stage invite sent to ${name}`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function connectStageFeed(fromUid, feedData) {
    if (!feedData.offer || stageFeedPCs.current[fromUid]) return

    const feedPc = new RTCPeerConnection(ICE)
    stageFeedPCs.current[fromUid] = feedPc

    const remoteStream = new MediaStream()

    feedPc.ontrack = e => {
      e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t))
      setStageFeeds(prev => prev.some(f => f.uid === fromUid) ? prev : [
        ...prev, { uid: fromUid, name: feedData.fromName, avatar: feedData.fromAvatar, stream: remoteStream }
      ])
    }

    feedPc.onicecandidate = async e => {
      if (e.candidate) {
        await addDoc(collection(db, 'streams', streamId, 'stageInvites', user.uid, 'stageFeeds', fromUid, 'guestCandidates'), e.candidate.toJSON())
      }
    }

    try {
      await feedPc.setRemoteDescription(new RTCSessionDescription(feedData.offer))
      const answer = await feedPc.createAnswer()
      await feedPc.setLocalDescription(answer)
      await updateDoc(doc(db, 'streams', streamId, 'stageInvites', user.uid, 'stageFeeds', fromUid), {
        answer: { type: answer.type, sdp: answer.sdp }
      })

      const cUnsub = onSnapshot(collection(db, 'streams', streamId, 'stageInvites', user.uid, 'stageFeeds', fromUid, 'hostCandidates'), snap => {
        snap.docChanges().forEach(c => {
          if (c.type === 'added') feedPc.addIceCandidate(new RTCIceCandidate(c.doc.data())).catch(() => {})
        })
      })
      unsubs.current.push(cUnsub)
    } catch {
      feedPc.close()
      delete stageFeedPCs.current[fromUid]
    }
  }

  async function acceptInvite() {
    try {
      setStageStatus('connecting')
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      stageStream.current = stream

      const spc = new RTCPeerConnection(ICE)
      stagePc.current = spc

      stream.getTracks().forEach(t => spc.addTrack(t, stream))

      spc.onicecandidate = async e => {
        if (e.candidate) {
          await addDoc(collection(db, 'streams', streamId, 'stageInvites', user.uid, 'guestCandidates'), e.candidate.toJSON())
        }
      }

      // Listen for host ICE candidates for the stage connection
      const cUnsub = onSnapshot(collection(db, 'streams', streamId, 'stageInvites', user.uid, 'hostCandidates'), snap => {
        snap.docChanges().forEach(c => {
          if (c.type === 'added') stagePc.current?.addIceCandidate(new RTCIceCandidate(c.doc.data())).catch(() => {})
        })
      })
      unsubs.current.push(cUnsub)

      // Listen for other stage guests' streams relayed by host
      const feedsUnsub = onSnapshot(collection(db, 'streams', streamId, 'stageInvites', user.uid, 'stageFeeds'), snap => {
        snap.docChanges().forEach(change => {
          if (change.type === 'added') {
            connectStageFeed(change.doc.id, change.doc.data())
          }
        })
      })
      unsubs.current.push(feedsUnsub)

      const offer = await spc.createOffer()
      await spc.setLocalDescription(offer)

      await updateDoc(doc(db, 'streams', streamId, 'stageInvites', user.uid), {
        status: 'accepted',
        offer: { type: offer.type, sdp: offer.sdp },
      })
    } catch (err) {
      toast.error('Could not access camera/mic: ' + err.message)
      setStageStatus(null)
      stageStream.current?.getTracks().forEach(t => t.stop())
      stageStream.current = null
      stagePc.current?.close()
      stagePc.current = null
    }
  }

  async function declineInvite() {
    setStageStatus(null)
    try {
      await updateDoc(doc(db, 'streams', streamId, 'stageInvites', user.uid), { status: 'declined' })
    } catch {}
  }

  async function leaveStage() {
    stageStream.current?.getTracks().forEach(t => t.stop())
    stageStream.current = null
    stagePc.current?.close()
    stagePc.current = null
    Object.values(stageFeedPCs.current).forEach(p => p.close())
    stageFeedPCs.current = {}
    setStageFeeds([])
    setStageStatus(null)
    try {
      await updateDoc(doc(db, 'streams', streamId, 'stageInvites', user.uid), { status: 'removed' })
    } catch {}
  }

  function cleanup() {
    unsubs.current.forEach(u => u())
    unsubs.current = []
    pc.current?.close()
    stageStream.current?.getTracks().forEach(t => t.stop())
    stageStream.current = null
    stagePc.current?.close()
    stagePc.current = null
    Object.values(stageFeedPCs.current).forEach(p => p.close())
    stageFeedPCs.current = {}
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
                <div
                  className="relative flex items-center gap-1 text-xs text-slate-400 cursor-pointer select-none"
                  onMouseEnter={() => setShowViewers(true)}
                  onMouseLeave={() => setShowViewers(false)}
                >
                  <Users size={10} /> {streamData.viewerCount ?? 0} watching
                  {showViewers && viewerList.length > 0 && (
                    <div className="absolute left-0 top-full mt-1.5 bg-[#1e293b] border border-slate-700 rounded-xl shadow-2xl z-30 py-1.5 min-w-44 max-h-64 overflow-y-auto anchor-scrollbar">
                      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider px-3 pb-1.5">Watching now</p>
                      {viewerList.map(v => (
                        <div key={v.uid} className="flex items-center gap-2 px-3 py-1.5">
                          <img src={v.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${v.uid}`} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                          <span className="text-sm text-white truncate">{v.displayName || 'Viewer'}</span>
                        </div>
                      ))}
                    </div>
                  )}
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

          {/* Self-view PiP when on stage */}
          {stageStatus === 'on-stage' && (
            <div className="absolute bottom-3 right-3 z-10">
              <div className="relative w-32 h-24 rounded-xl overflow-hidden border-2 border-sky-500 shadow-lg shadow-sky-500/30">
                <video
                  ref={el => { if (el && stageStream.current) el.srcObject = stageStream.current }}
                  autoPlay playsInline muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-1 left-1 bg-sky-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">LIVE</div>
              </div>
              <button
                onClick={leaveStage}
                className="mt-1.5 w-full py-1.5 bg-red-500 hover:bg-red-400 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1"
              >
                <PhoneOff size={11} /> Leave Stage
              </button>
            </div>
          )}

          {/* Other stage guests' video feeds */}
          {stageStatus === 'on-stage' && stageFeeds.length > 0 && (
            <div className="absolute bottom-3 right-36 z-10 flex flex-col gap-2">
              {stageFeeds.map(f => (
                <div key={f.uid} className="relative w-32 h-24 rounded-xl overflow-hidden border-2 border-purple-500/80 shadow-lg">
                  <video
                    ref={el => { if (el && f.stream) el.srcObject = f.stream }}
                    autoPlay playsInline
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1 left-0 right-0 text-center px-1">
                    <span className="text-[9px] text-white font-bold bg-black/60 px-1.5 py-0.5 rounded-full">{f.name || 'Guest'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Connecting to stage indicator */}
          {stageStatus === 'connecting' && (
            <div className="absolute bottom-3 right-3 z-10 bg-[#1e293b]/90 backdrop-blur-md rounded-xl px-3 py-2 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-sky-400" />
              <span className="text-white text-xs font-medium">Joining stage…</span>
            </div>
          )}
        </div>
      </div>

      {/* Chat */}
      <div className="w-full lg:w-80 h-64 lg:h-auto">
        <StreamChat
          streamId={streamId}
          isOwner={profile?.role === 'owner'}
          onInviteToStage={profile?.role === 'owner' ? ownerInviteToStage : undefined}
          stagedUids={profile?.role === 'owner' ? ownerStagedUids : undefined}
        />
      </div>

      {/* Stage invite dialog */}
      {stageStatus === 'invited' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="bg-[#1e293b] border border-slate-700 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-sky-500/20 border border-sky-500/40 flex items-center justify-center mx-auto mb-4">
              <Mic size={28} className="text-sky-400" />
            </div>
            <h2 className="text-white font-bold text-lg mb-1">Stage Invite</h2>
            <p className="text-slate-400 text-sm mb-2">
              <span className="text-white font-semibold">{streamData?.hostName}</span> wants you to join the stage with your camera and microphone.
            </p>
            <p className="text-slate-500 text-xs mb-6">Your video and audio will be shared with everyone watching this stream.</p>
            <div className="flex gap-3">
              <button
                onClick={declineInvite}
                className="flex-1 py-2.5 border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 rounded-xl text-sm font-semibold transition"
              >
                Decline
              </button>
              <button
                onClick={acceptInvite}
                className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
              >
                <Video size={15} /> Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
