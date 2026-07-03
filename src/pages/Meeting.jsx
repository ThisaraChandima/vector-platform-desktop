'use client';
import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import NavBar from '@/components/NavBar';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://example.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'dummy-key';
const supabase = createClient(supabaseUrl, supabaseKey);

// ICE server configuration with multiple STUN servers and free TURN relays
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10
};

function MeetingContent() {
  const params = useParams();
  const teamId = params.id;
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const meetingName = searchParams.get('name') || 'Team Meeting';
  const isHost = searchParams.get('host') === 'true';

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  
  const [remoteStreams, setRemoteStreams] = useState({});
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // connecting | waiting | connected | failed
  const [channelReady, setChannelReady] = useState(false);

  const localVideoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const localStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioDestRef = useRef(null);
  
  const myUserId = useRef(Math.random().toString(36).substring(7)).current;
  const channelRef = useRef(null);
  const peersRef = useRef({});
  const heartbeatRef = useRef(null);
  const activeRef = useRef(true);

  const startRecording = (mixedStream) => {
    try {
      const mediaRecorder = new MediaRecorder(mixedStream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      toast.success("AI is now securely analyzing your participation.");
    } catch (e) {
      console.error("Failed to access mic for AI recording", e);
      toast.error("Please allow microphone access for AI analysis to work.");
    }
  };

  // Create or retrieve a peer connection for a given remote user
  const createPeer = useCallback((targetUserId, stream, channel) => {
    // If we already have a healthy connection to this peer, reuse it
    if (peersRef.current[targetUserId]) {
      const existing = peersRef.current[targetUserId];
      if (existing.connectionState !== 'failed' && existing.connectionState !== 'closed') {
        return existing;
      }
      // Close the broken one
      existing.close();
      delete peersRef.current[targetUserId];
    }
    
    console.log(`[WebRTC] Creating peer connection for ${targetUserId}`);
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Add all local tracks to the connection
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    // Send ICE candidates IMMEDIATELY (no batching)
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`[WebRTC] Sending ICE candidate to ${targetUserId}`);
        channel.send({
          type: 'broadcast',
          event: 'signal',
          payload: { target: targetUserId, sender: myUserId, candidate: event.candidate.toJSON() }
        });
      }
    };

    // Handle incoming remote tracks
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received remote track from ${targetUserId}`);
      const rStream = event.streams[0];
      setRemoteStreams(prev => ({ ...prev, [targetUserId]: rStream }));
      setConnectionStatus('connected');
      
      // Mix remote audio into the recording destination
      if (audioContextRef.current && audioDestRef.current && rStream.getAudioTracks().length > 0) {
        try {
          const remoteSource = audioContextRef.current.createMediaStreamSource(rStream);
          remoteSource.connect(audioDestRef.current);
        } catch (e) {
          console.warn('[WebRTC] Could not mix remote audio:', e);
        }
      }
    };
    
    // Monitor connection state changes
    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state for ${targetUserId}: ${pc.iceConnectionState}`);
      
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setConnectionStatus('connected');
      } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        console.warn(`[WebRTC] Connection ${pc.iceConnectionState} for ${targetUserId}`);
        setRemoteStreams(prev => {
          const newStreams = { ...prev };
          delete newStreams[targetUserId];
          return newStreams;
        });
        pc.close();
        delete peersRef.current[targetUserId];
        
        // Check if we have any remaining connections
        if (Object.keys(peersRef.current).length === 0) {
          setConnectionStatus('waiting');
        }
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state for ${targetUserId}: ${pc.connectionState}`);
    };

    peersRef.current[targetUserId] = pc;
    return pc;
  }, [myUserId]);

  useEffect(() => {
    activeRef.current = true;
    
    const initWebRTC = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!activeRef.current) return;
        
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Setup audio mixing for recording
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioCtx;
        const dest = audioCtx.createMediaStreamDestination();
        audioDestRef.current = dest;

        if (stream.getAudioTracks().length > 0) {
          const localSource = audioCtx.createMediaStreamSource(stream);
          localSource.connect(dest);
        }

        startRecording(dest.stream);

        // Connect to Supabase channel for signaling
        const channel = supabase.channel(`meeting-${teamId}`, {
          config: { broadcast: { self: false } }
        });
        channelRef.current = channel;

        // --- SIGNALING HANDLERS ---

        // When another user announces themselves
        channel.on('broadcast', { event: 'user-joined' }, async (msg) => {
          const { sender } = msg.payload;
          if (sender === myUserId) return;
          
          console.log(`[Signal] User joined: ${sender}`);
          setConnectionStatus('connecting');
          
          // GLARE FIX: Only the user with the LOWER ID creates the offer.
          // This prevents both sides from creating offers simultaneously.
          if (myUserId < sender) {
            console.log(`[Signal] I am initiator (${myUserId} < ${sender}), creating offer`);
            const pc = createPeer(sender, stream, channel);
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              channel.send({
                type: 'broadcast',
                event: 'signal',
                payload: { target: sender, sender: myUserId, offer: pc.localDescription.toJSON() }
              });
              console.log(`[Signal] Sent offer to ${sender}`);
            } catch (e) {
              console.error(`[Signal] Failed to create offer for ${sender}:`, e);
            }
          } else {
            console.log(`[Signal] I am responder (${myUserId} > ${sender}), waiting for offer`);
          }
        });

        // Handle signaling messages (offers, answers, ICE candidates)
        channel.on('broadcast', { event: 'signal' }, async (msg) => {
          const { target, sender, offer, answer, candidate } = msg.payload;
          if (target !== myUserId) return; // Not for us

          console.log(`[Signal] Received ${offer ? 'offer' : answer ? 'answer' : 'candidate'} from ${sender}`);

          const pc = createPeer(sender, stream, channel);

          try {
            if (offer) {
              // We received an offer
              if (pc.signalingState === 'have-local-offer') {
                // GLARE: Both sides sent offers. The side with the higher ID rolls back.
                if (myUserId > sender) {
                  console.log(`[Signal] Glare detected! Rolling back my offer and accepting theirs.`);
                  await pc.setLocalDescription({ type: 'rollback' });
                } else {
                  console.log(`[Signal] Glare detected! Ignoring their offer (I have priority).`);
                  return;
                }
              }
              await pc.setRemoteDescription(new RTCSessionDescription(offer));
              const ans = await pc.createAnswer();
              await pc.setLocalDescription(ans);
              channel.send({
                type: 'broadcast',
                event: 'signal',
                payload: { target: sender, sender: myUserId, answer: pc.localDescription.toJSON() }
              });
              console.log(`[Signal] Sent answer to ${sender}`);
            } else if (answer) {
              if (pc.signalingState === 'have-local-offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
                console.log(`[Signal] Set remote answer from ${sender}`);
              }
            } else if (candidate) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
              } catch (iceErr) {
                console.warn(`[Signal] ICE candidate error (will retry):`, iceErr.message);
              }
            }
          } catch (e) {
            console.error(`[Signal] Error handling signal from ${sender}:`, e);
          }
        });

        // Handle meeting-ended broadcast
        channel.on('broadcast', { event: 'meeting-ended' }, () => {
          if (!isHost && activeRef.current) {
            toast('Host ended the meeting. Processing audio...', { icon: 'ℹ️' });
            endMeeting(false);
          }
        });

        // Subscribe to channel and start heartbeat
        channel.subscribe((status) => {
          console.log(`[Supabase] Channel status: ${status}`);
          if (status === 'SUBSCRIBED') {
            setChannelReady(true);
            setConnectionStatus('waiting');
            
            // Broadcast our presence immediately
            channel.send({
              type: 'broadcast',
              event: 'user-joined',
              payload: { sender: myUserId }
            });

            // HEARTBEAT: Re-broadcast every 3 seconds for 60 seconds
            // This ensures late joiners discover us
            let heartbeatCount = 0;
            heartbeatRef.current = setInterval(() => {
              heartbeatCount++;
              if (heartbeatCount > 20) { // Stop after 60 seconds (20 * 3s)
                clearInterval(heartbeatRef.current);
                return;
              }
              channel.send({
                type: 'broadcast',
                event: 'user-joined',
                payload: { sender: myUserId }
              });
            }, 3000);
          } else if (status === 'CHANNEL_ERROR') {
            console.error('[Supabase] Channel error');
            setConnectionStatus('failed');
            toast.error('Failed to connect to meeting server. Please try again.');
          }
        });

      } catch (err) {
        console.error("Media access error", err);
        toast.error("Could not access camera/microphone. Please check permissions.");
        setConnectionStatus('failed');
      }
    };

    initWebRTC();

    return () => {
      activeRef.current = false;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      Object.values(peersRef.current).forEach(pc => pc.close());
      peersRef.current = {};
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [teamId, createPeer]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  // Force reconnect: close all peers and re-announce
  const reconnect = () => {
    console.log('[WebRTC] Manual reconnect triggered');
    Object.values(peersRef.current).forEach(pc => pc.close());
    peersRef.current = {};
    setRemoteStreams({});
    setConnectionStatus('waiting');
    
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'user-joined',
        payload: { sender: myUserId }
      });
      toast.success('Reconnecting... waiting for teammates.');
    }
  };

  const endMeeting = async (endForAll = false) => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }
    Object.values(peersRef.current).forEach(pc => pc.close());
    peersRef.current = {};

    if (endForAll) {
      try {
        await fetch(`https://vector-platform-two.vercel.app/api/meetings/active?teamId=${teamId}`, { method: 'DELETE' });
        const channel = supabase.channel(`meeting-status-${teamId}`);
        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
             await channel.send({ type: 'broadcast', event: 'meeting-ended', payload: {} });
             supabase.removeChannel(channel);
          }
        });
      } catch (e) {}
    }

    setIsProcessing(true);
    
    setTimeout(async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const arrayBuffer = await audioBlob.arrayBuffer();

      try {
        toast.loading("Uploading meeting audio to AI...", { id: 'transcribe' });
        
        // Use Electron API if available, fallback to mock/web api if not
        let transcribeData;
        if (window.electronAPI) {
          transcribeData = await window.electronAPI.transcribeAudio(arrayBuffer);
        } else {
          toast.error("Running outside Electron. Transcription unavailable.");
          throw new Error("Not in Electron");
        }
        
        if (!transcribeData.success) throw new Error(transcribeData.error || "Transcription failed");
        
        toast.success("Upload complete! Analyzing secretly...", { id: 'transcribe' });

        // Let the web backend analyze AND save it
        const analyzeRes = await fetch('https://vector-platform-two.vercel.app/api/meetings/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId, transcript: transcribeData.text }),
        });
        const analyzeData = await analyzeRes.json();
        if (analyzeData.success) {
          toast.success("AI Analysis Complete!");
          setIsCompleted(true);
        } else {
          throw new Error(analyzeData.error || "Analysis failed");
        }
      } catch (error) {
        console.error(error);
        toast.error(`Error processing meeting: ${error.message}`, { id: 'transcribe' });
      } finally {
        setIsProcessing(false);
      }
    }, 500);
  };

  // Utility to render video components reliably
  const VideoPlayer = ({ stream, isLocal }) => {
    const videoRef = useRef(null);
    useEffect(() => {
      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.warn('Autoplay prevented:', e));
      }
    }, [stream]);

    return (
      <div className="relative w-full h-full bg-slate-800 rounded-xl overflow-hidden border border-slate-700 shadow-xl">
        <video 
          ref={videoRef}
          autoPlay 
          playsInline 
          muted={isLocal}
          className={`w-full h-full object-cover ${isLocal && isVideoOff ? 'opacity-0' : 'opacity-100'}`}
        />
        {isLocal && isVideoOff && (
          <div className="absolute inset-0 flex items-center justify-center text-rose-500 bg-slate-900">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3l18 18" /></svg>
          </div>
        )}
        <div className="absolute bottom-3 left-3 text-xs font-bold text-white bg-black/60 backdrop-blur px-3 py-1 rounded-full flex items-center gap-2 border border-white/10">
          {isLocal ? 'You' : 'Teammate'} 
          {isLocal && isMuted && <span className="text-rose-400 text-[10px] uppercase">(Muted)</span>}
        </div>
      </div>
    );
  };

  const remoteStreamEntries = Object.entries(remoteStreams);
  const totalParticipants = 1 + remoteStreamEntries.length;
  
  // Calculate grid layout dynamically based on participant count
  let gridClass = "grid-cols-1";
  if (totalParticipants === 2) gridClass = "grid-cols-1 md:grid-cols-2";
  else if (totalParticipants === 3 || totalParticipants === 4) gridClass = "grid-cols-2";
  else if (totalParticipants > 4) gridClass = "grid-cols-2 md:grid-cols-3";

  // Connection status display
  const statusConfig = {
    connecting: { text: 'Connecting to meeting server...', color: 'text-amber-400', dot: 'bg-amber-400 animate-pulse' },
    waiting: { text: 'Waiting for teammates to join...', color: 'text-blue-400', dot: 'bg-blue-400 animate-pulse' },
    connected: { text: `Connected • ${remoteStreamEntries.length} teammate${remoteStreamEntries.length !== 1 ? 's' : ''}`, color: 'text-emerald-400', dot: 'bg-emerald-400' },
    failed: { text: 'Connection failed', color: 'text-rose-400', dot: 'bg-rose-400' },
  };
  const currentStatus = statusConfig[connectionStatus] || statusConfig.connecting;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans">
      <NavBar role="student" user={{ name: 'Current User' }} />
      
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white">Live: {meetingName}</h1>
            <div className="flex items-center gap-3 mt-2">
              <p className="text-slate-400">N-Way Video Space for Team {teamId.substring(0,6).toUpperCase()}</p>
              <span className="text-slate-600">•</span>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${currentStatus.dot}`}></div>
                <span className={`text-sm font-medium ${currentStatus.color}`}>{currentStatus.text}</span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-3">
            {(connectionStatus === 'waiting' || connectionStatus === 'failed') && (
              <button 
                onClick={reconnect}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Reconnect
              </button>
            )}
            <button 
              onClick={() => {
                if (isRecording) endMeeting(isHost);
                else {
                  if (isHost) {
                    const channel = supabase.channel(`meeting-status-${teamId}`);
                    channel.subscribe(async (status) => {
                      if (status === 'SUBSCRIBED') {
                         await channel.send({ type: 'broadcast', event: 'meeting-ended', payload: {} });
                         supabase.removeChannel(channel);
                      }
                    });
                    navigate('/student');
                  } else {
                    navigate('/student');
                  }
                }
              }}
              disabled={isProcessing}
              className="px-6 py-2 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-xl transition-all shadow-[0_0_15px_rgba(225,29,72,0.4)] flex items-center gap-2"
            >
              {isProcessing ? 'Processing...' : (isHost ? 'End Meeting' : 'Leave Meeting')}
            </button>
            
            {isCompleted && (
              <button disabled className="px-6 py-2 bg-emerald-600 text-white font-medium rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 opacity-50 cursor-not-allowed">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                Completed
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Video Area */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden relative shadow-2xl flex flex-col p-4">
            
            <div className={`flex-1 grid ${gridClass} gap-4 w-full h-full min-h-[450px]`}>
              {/* Local User */}
              <VideoPlayer stream={localStreamRef.current} isLocal={true} />
              
              {/* Remote Users */}
              {remoteStreamEntries.map(([id, stream]) => (
                <VideoPlayer key={id} stream={stream} isLocal={false} />
              ))}
            </div>

            {/* Controls Overlay */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur px-6 py-3 rounded-2xl border border-white/10 z-20">
              <button 
                onClick={toggleMute}
                className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition-colors ${isMuted ? 'bg-rose-600 hover:bg-rose-500' : 'bg-slate-700 hover:bg-slate-600'}`}
              >
                {isMuted ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3l18 18" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                )}
              </button>
              <button 
                onClick={toggleVideo}
                className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition-colors ${isVideoOff ? 'bg-rose-600 hover:bg-rose-500' : 'bg-slate-700 hover:bg-slate-600'}`}
              >
                {isVideoOff ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3l18 18" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                )}
              </button>
              <button 
                onClick={() => endMeeting(isHost)}
                className="w-12 h-12 rounded-full bg-rose-600 hover:bg-rose-500 flex items-center justify-center text-white transition-colors shadow-[0_0_15px_rgba(225,29,72,0.4)]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* AI Analysis Sidebar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col h-[500px] overflow-hidden">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              AI Engine Active
            </h3>
            
            <div className="flex-1 flex flex-col justify-center items-center text-center space-y-6">
              {isProcessing ? (
                <div className="p-6 bg-indigo-900/20 border border-indigo-500/30 rounded-xl w-full">
                  <div className="w-8 h-8 mx-auto mb-4 rounded-full border-4 border-indigo-400 border-t-transparent animate-spin"></div>
                  <h4 className="text-indigo-300 font-bold mb-2">Processing Audio</h4>
                  <p className="text-slate-400 text-sm">Your meeting audio is being securely sent to the AI for analysis. Please wait.</p>
                </div>
              ) : isCompleted ? (
                <div className="p-6 bg-emerald-900/20 border border-emerald-500/30 rounded-xl w-full">
                  <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <h4 className="text-emerald-400 font-bold mb-2">Analysis Complete!</h4>
                  <p className="text-slate-400 text-sm">Your meeting has been processed. You can safely leave.</p>
                </div>
              ) : isRecording ? (
                <div className="p-6 w-full">
                  <div className="w-20 h-20 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto mb-6 relative">
                    <div className="absolute inset-0 rounded-full border-4 border-rose-500/30 animate-ping"></div>
                    <svg className="w-10 h-10 text-rose-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  </div>
                  <h4 className="text-white font-bold mb-2">Recording in Progress</h4>
                  <p className="text-slate-400 text-sm">Speak normally. Your participation is being analyzed.</p>
                </div>
              ) : (
                <div className="text-slate-500">
                  <p>Initializing...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function MeetingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Loading meeting...</div>}>
      <MeetingContent />
    </Suspense>
  );
}
