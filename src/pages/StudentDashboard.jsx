'use client';
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import NavBar from '@/components/NavBar';
import { Link } from 'react-router-dom';
import StudentProfileCard from '@/components/StudentProfileCard';
import TeamCard from '@/components/TeamCard';
import StudentStep from '@/components/StudentStep';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://example.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'dummy-key';
const supabase = createClient(supabaseUrl, supabaseKey);

function StudentDashboardContent() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const studentId = searchParams.get('id');

  const [student, setStudent] = useState(null);
  const [team, setTeam] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [liveMeeting, setLiveMeeting] = useState(null);
  const [showMeetingPrompt, setShowMeetingPrompt] = useState(false);
  const [meetingNameInput, setMeetingNameInput] = useState('Weekly Sync');

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        // Fetch all students to find the first one if no id is provided
        const stRes = await fetch('https://vector-platform-two.vercel.app/api/students');
        const stData = await stRes.json();
        
        let currentStudent = null;
        let resolvedId = studentId;

        // Try getting from localStorage if not in URL
        if (!resolvedId) {
          resolvedId = localStorage.getItem('auth_user');
        }

        if (resolvedId && resolvedId.startsWith('student')) {
          const num = parseInt(resolvedId.replace('student', ''), 10) - 1;
          currentStudent = stData.data[num];
        } else if (resolvedId) {
          currentStudent = stData.data.find(s => s.id === resolvedId);
        } else {
          currentStudent = stData.data[0];
          if (currentStudent) {
            navigate(`/student?id=${currentStudent.id}`, { replace: true });
          }
        }
        
        setStudent(currentStudent);

        if (currentStudent && currentStudent.teamId) {
          const tmRes = await fetch('https://vector-platform-two.vercel.app/api/teams?populate=true');
          const tmData = await tmRes.json();
          const currentTeam = tmData.data.find(t => t.id === currentStudent.teamId);
          setTeam(currentTeam);
          
          const tkRes = await fetch(`https://vector-platform-two.vercel.app/api/tasks?teamId=${currentStudent.teamId}`);
          const tkData = await tkRes.json();
          setTasks(tkData.data || []);
        }
      } catch (err) {
        console.error(err);
      }
      setIsLoading(false);
    }
    fetchData();
  }, [studentId, navigate]);

  useEffect(() => {
    if (!team) return;
    
    // Poll for active meetings as a fallback
    const checkActiveMeetings = async () => {
      try {
        const res = await fetch(`https://vector-platform-two.vercel.app/api/meetings/active?teamId=${team.id}`);
        const data = await res.json();
        // Only update if we don't already have one set by realtime
        setLiveMeeting(prev => {
          if (data.success && data.meetings && data.meetings.length > 0) {
            return data.meetings[0].name || 'Team Meeting';
          }
          return prev; // keep realtime state if API fails
        });
      } catch (err) {
        console.error("Failed to fetch active meetings", err);
      }
    };

    checkActiveMeetings(); // initial check
    const intervalId = setInterval(checkActiveMeetings, 5000);

    // Supabase Realtime for instant, bulletproof updates across browsers
    const channel = supabase.channel(`meeting-status-${team.id}`, {
      config: { broadcast: { self: false } }
    });
    
    channel.on('broadcast', { event: 'meeting-started' }, (msg) => {
      setLiveMeeting(msg.payload.name);
    });

    channel.on('broadcast', { event: 'meeting-ended' }, () => {
      setLiveMeeting(null);
    });

    channel.subscribe();

    return () => {
      clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [team]);

  const handleStartMeeting = () => {
    setShowMeetingPrompt(true);
  };

  const handleConfirmMeeting = async () => {
    setShowMeetingPrompt(false);
    if (meetingNameInput.trim()) {
      // Register meeting as active via API and Realtime
      try {
        await fetch('https://vector-platform-two.vercel.app/api/meetings/active', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId: team.id, name: meetingNameInput })
        });
        
        // Broadcast to all other team members instantly
        const channel = supabase.channel(`meeting-status-${team.id}`);
        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
             await channel.send({ type: 'broadcast', event: 'meeting-started', payload: { name: meetingNameInput } });
             supabase.removeChannel(channel);
          }
        });
      } catch (err) {
        console.error(err);
      }
      navigate(`/meeting/${team.id}?name=${encodeURIComponent(meetingNameInput)}&host=true`);
    }
  };

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex justify-center items-center text-white">Loading...</div>;
  if (!student) return <div className="min-h-screen bg-slate-950 flex justify-center items-center text-white">Student not found</div>;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <NavBar role="student" user={student} />
      
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900/40 via-slate-900 to-slate-950 border border-slate-800/80 shadow-2xl p-8 lg:p-10 mb-8">
          {/* Decorative blurs */}
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-indigo-500/20 blur-[100px] rounded-full pointer-events-none"></div>
          <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-rose-500/10 blur-[80px] rounded-full pointer-events-none"></div>
          
          <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-300 text-xs font-semibold tracking-wider uppercase mb-5">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
                Capstone Portal
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400 tracking-tight mb-4">
                Welcome back,<br />{student.name}
              </h1>
              <p className="text-slate-400 text-lg">
                Manage your tasks, collaborate with your team, and write code in the secure work environment.
              </p>
            </div>
            
            <div className="flex flex-wrap gap-3 w-full lg:w-auto">
              {!student.onboardingComplete && (
                <Link to={`/student/onboarding?id=${student.id}`} className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-xl shadow-[0_0_20px_rgba(225,29,72,0.3)] transition-all flex-1 text-center">
                  Complete Onboarding
                </Link>
              )}
              {student.teamId && (
                <>
                  <Link to={`/student/tasks?id=${student.id}`} className="px-5 py-2.5 bg-slate-800/80 backdrop-blur border border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 flex-1 lg:flex-none">
                    <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                    Task Board
                  </Link>
                  <Link to={`/student/editor?id=${student.id}`} className="px-5 py-2.5 bg-indigo-600/10 backdrop-blur border border-indigo-500/30 hover:bg-indigo-600/20 text-indigo-300 font-medium rounded-xl transition-all flex items-center justify-center gap-2 flex-1 lg:flex-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                    Work Environment
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Prominent Live Meeting Banner */}
        {team && (
          <section className="mb-8">
            {liveMeeting ? (
              <div className="relative overflow-hidden bg-slate-900 border border-emerald-500/30 rounded-2xl p-8 shadow-[0_0_30px_rgba(16,185,129,0.15)] flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[60px] rounded-full pointer-events-none"></div>
                
                <div className="flex items-center gap-5 z-10">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/40 relative">
                    <div className="absolute inset-0 rounded-full border-2 border-emerald-500 animate-ping opacity-30"></div>
                    <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span className="text-emerald-400 font-bold text-sm tracking-wider uppercase">Live Session in Progress</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white">{liveMeeting}</h2>
                    <p className="text-slate-400 mt-1">Your team is waiting for you in the virtual war room.</p>
                  </div>
                </div>
                
                <Link to={`/meeting/${student.teamId}?name=${encodeURIComponent(liveMeeting)}`} className="z-10 w-full md:w-auto px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all transform hover:scale-105 flex items-center justify-center gap-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
                  Join Meeting Now
                </Link>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                    <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" /></svg>
                  </div>
                  <div>
                    <h3 className="text-white font-bold">No Active Meetings</h3>
                    <p className="text-slate-400 text-sm">Need to discuss a task? Start a quick sync with your team.</p>
                  </div>
                </div>
                <button onClick={handleStartMeeting} className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                  Create Meeting
                </button>
              </div>
            )}
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <h2 className="text-xl font-bold text-white mb-4">Your Profile</h2>
            <StudentProfileCard student={student} />
          </div>
          
          <div className="lg:col-span-2">
            <h2 className="text-xl font-bold text-white mb-4">Your Team</h2>
            {team ? (
              <TeamCard team={team} />
            ) : (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-12 text-center h-[350px] flex flex-col items-center justify-center">
                <svg className="w-16 h-16 text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <h3 className="text-lg font-medium text-slate-300">No Team Assigned Yet</h3>
                <p className="text-slate-500 mt-2 max-w-md">Complete your onboarding profile if you haven't already. The faculty admin will form teams soon.</p>
              </div>
            )}
          </div>
        </div>

        {team && (
          <section>
            <h2 className="text-xl font-bold text-white mb-4">Team Progress Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="text-slate-400 text-sm font-medium mb-1">Total Tasks</div>
                <div className="text-3xl font-bold text-white">{tasks.length}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="text-slate-400 text-sm font-medium mb-1">In Progress</div>
                <div className="text-3xl font-bold text-indigo-400">{tasks.filter(t => t.status === 'in-progress' || t.assignedTo).length}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="text-slate-400 text-sm font-medium mb-1">Completed</div>
                <div className="text-3xl font-bold text-emerald-400">{tasks.filter(t => t.status === 'completed').length}</div>
              </div>
            </div>
          </section>
        )}

        {team && student && (
          <section>
            <StudentStep student={student} team={team} />
          </section>
        )}
        
      </main>

      {showMeetingPrompt && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-white mb-2">Create New Meeting</h3>
            <p className="text-slate-400 text-sm mb-4">Enter a name for this meeting (e.g., 'Sprint Planning')</p>
            <input
              type="text"
              value={meetingNameInput}
              onChange={(e) => setMeetingNameInput(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 mb-6"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleConfirmMeeting()}
            />
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowMeetingPrompt(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmMeeting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors shadow-lg"
              >
                Start Meeting
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StudentDashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950"></div>}>
      <StudentDashboardContent />
    </Suspense>
  );
}
