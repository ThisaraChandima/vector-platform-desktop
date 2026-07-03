'use client';
import { useState, useRef, useEffect, Suspense } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import NavBar from '@/components/NavBar';
import { createClient } from '@supabase/supabase-js';
import { JitsiMeeting } from '@jitsi/react-sdk';

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
  const authUser = localStorage.getItem('auth_user') || 'Current User';

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const localStreamRef = useRef(null);

  // Set up local recording for AI analysis
  useEffect(() => {
    let mounted = true;
    const initLocalRecording = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!mounted) return;
        localStreamRef.current = stream;
        
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.start(1000);
        setIsRecording(true);
        toast.success("AI is securely analyzing your participation.");
      } catch (e) {
        console.error("Failed to access mic for AI recording", e);
        if (mounted) {
          toast.error("Please allow microphone access for AI analysis to work.");
        }
      }
    };
    initLocalRecording();

    return () => {
      mounted = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const endMeeting = async (endForAll = false) => {
    if (mediaRecorderRef.current && isRecording && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }

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
      if (audioChunksRef.current.length === 0) {
        setIsProcessing(false);
        if (isHost || !endForAll) navigate('/student');
        return;
      }

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
        if (isHost || !endForAll) navigate('/student');
      }
    }, 500);
  };

  const roomName = `VectorPlatform-Team-${teamId}`;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans">
      <NavBar role="student" user={{ name: authUser }} />
      
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white">Live: {meetingName}</h1>
            <div className="flex items-center gap-3 mt-2">
              <p className="text-slate-400">N-Way Video Space for Team {teamId.substring(0,6).toUpperCase()}</p>
            </div>
          </div>
          
          <div className="flex gap-3">
            <button 
              onClick={() => {
                endMeeting(isHost);
              }}
              disabled={isProcessing}
              className="px-6 py-2 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-xl transition-all shadow-[0_0_15px_rgba(225,29,72,0.4)] flex items-center gap-2"
            >
              {isProcessing ? 'Processing AI...' : (isHost ? 'End Meeting' : 'Leave Meeting')}
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
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden relative shadow-2xl flex flex-col min-h-[600px]">
            <JitsiMeeting
              domain="meet.jit.si"
              roomName={roomName}
              configOverwrite={{
                startWithAudioMuted: false,
                startWithVideoMuted: false,
                disableModeratorIndicator: true,
                startScreenSharing: true,
                enableEmailInStats: false
              }}
              interfaceConfigOverwrite={{
                DISABLE_JOIN_LEAVE_NOTIFICATIONS: true
              }}
              userInfo={{
                displayName: authUser
              }}
              getIFrameRef={(iframeRef) => {
                iframeRef.style.height = '100%';
                iframeRef.style.width = '100%';
              }}
            />
          </div>

          {/* AI Side Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col justify-center items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mb-6">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              AI Engine Active
            </h2>
            
            <div className="my-8 relative">
              <div className="w-24 h-24 rounded-full border-4 border-slate-800 flex items-center justify-center bg-slate-900 relative z-10">
                <svg className={`w-10 h-10 ${isRecording ? 'text-rose-500 animate-pulse' : 'text-slate-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              {isRecording && (
                <>
                  <div className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping z-0" style={{ animationDuration: '2s' }}></div>
                  <div className="absolute -inset-4 rounded-full border border-rose-500/30 animate-pulse z-0" style={{ animationDuration: '3s' }}></div>
                </>
              )}
            </div>

            <h3 className="text-white font-semibold mb-1">
              {isProcessing ? 'Processing...' : (isRecording ? 'Recording in Progress' : 'Not Recording')}
            </h3>
            <p className="text-slate-400 text-sm">
              Speak normally. Your participation is being analyzed to generate a summary for the faculty dashboard.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function Meeting() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Loading meeting room...</div>}>
      <MeetingContent />
    </Suspense>
  );
}
