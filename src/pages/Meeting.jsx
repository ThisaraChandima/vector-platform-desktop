'use client';
import { useState, useRef, useEffect, Suspense } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import NavBar from '@/components/NavBar';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://example.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'dummy-key';
const supabase = createClient(supabaseUrl, supabaseKey);

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

  const localVideoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const localStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioDestRef = useRef(null);
  
  const myUserId = useRef(Math.random().toString(36).substring(7)).current;
  const channelRef = useRef(null);
  const peersRef = useRef({});

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

  useEffect(() => {
    let active = true;
    
    const initWebRTC = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!active) return;
        
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Setup audio mixing
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

        const createPeer = (targetUserId, initiator = false) => {
          if (peersRef.current[targetUserId]) return peersRef.current[targetUserId];
          
          const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
          });

          stream.getTracks().forEach(track => pc.addTrack(track, stream));

          let iceBuffer = [];
          let iceTimeout = null;

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              iceBuffer.push(event.candidate);
              if (!iceTimeout) {
                iceTimeout = setTimeout(() => {
                  channel.send({
                    type: 'broadcast',
                    event: 'signal',
                    payload: { target: targetUserId, sender: myUserId, candidates: iceBuffer }
                  });
                  iceBuffer = [];
                  iceTimeout = null;
                }, 300);
              }
            }
          };

          pc.ontrack = (event) => {
            const rStream = event.streams[0];
            setRemoteStreams(prev => ({ ...prev, [targetUserId]: rStream }));
            
            // Mix remote audio into the recording destination
            if (audioContextRef.current && audioDestRef.current && rStream.getAudioTracks().length > 0) {
              const remoteSource = audioContextRef.current.createMediaStreamSource(rStream);
              remoteSource.connect(audioDestRef.current);
            }
          };
          
          pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
               setRemoteStreams(prev => {
                 const newStreams = { ...prev };
                 delete newStreams[targetUserId];
                 return newStreams;
               });
               delete peersRef.current[targetUserId];
            }
          };

          peersRef.current[targetUserId] = pc;
          return pc;
        };

        channel.on('broadcast', { event: 'user-joined' }, async (msg) => {
          const { sender } = msg.payload;
          const pc = createPeer(sender, true);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          channel.send({
            type: 'broadcast',
            event: 'signal',
            payload: { target: sender, sender: myUserId, offer }
          });
        });

        channel.on('broadcast', { event: 'signal' }, async (msg) => {
          const { target, sender, offer, answer, candidate, candidates } = msg.payload;
          if (target !== myUserId) return;

          const pc = createPeer(sender);

          if (offer) {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            channel.send({
              type: 'broadcast',
              event: 'signal',
              payload: { target: sender, sender: myUserId, answer: ans }
            });
          } else if (answer) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          } else if (candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
              console.error(e);
            }
          } else if (candidates) {
            for (let c of candidates) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(c));
              } catch (e) {
                console.error(e);
              }
            }
          }
        });

        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            channel.send({
              type: 'broadcast',
              event: 'user-joined',
              payload: { sender: myUserId }
            });
          }
        });

        channel.on('broadcast', { event: 'meeting-ended' }, () => {
          if (!isHost && active) {
             toast('Host ended the meeting. Processing audio...', { icon: 'ℹ️' });
             endMeeting(false);
          }
        });

      } catch (err) {
        console.error("Media access error", err);
        toast.error("Could not access camera/microphone");
      }
    };

    initWebRTC();

    return () => {
      active = false;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      Object.values(peersRef.current).forEach(pc => pc.close());
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [teamId]);

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
        await fetch(`/api/meetings/active?teamId=${teamId}`, { method: 'DELETE' });
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
        const analyzeRes = await fetch('/api/meetings/analyze', {
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

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans">
      <NavBar role="student" user={{ name: 'Current User' }} />
      
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white">Live: {meetingName}</h1>
            <p className="text-slate-400 mt-1">N-Way Video Space for Team {teamId.substring(0,6).toUpperCase()}</p>
          </div>
          
          <div className="flex gap-4">
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
