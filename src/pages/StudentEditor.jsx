'use client';
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import NavBar from '@/components/NavBar';
import AntiCheatEditor from '@/components/AntiCheatEditor';

function StudentEditorContent() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const studentId = searchParams.get('id');

  const [student, setStudent] = useState(null);
  const [teamId, setTeamId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!studentId) {
        navigate('/student', { replace: true });
        return;
      }
      setIsLoading(true);
      try {
        const stRes = await fetch('https://vector-platform-two.vercel.app/api/students/' + studentId);
        const stData = await stRes.json();
        
        if (stData.success && stData.data) {
          setStudent(stData.data);
          setTeamId(stData.data.teamId);
        } else {
          navigate('/student', { replace: true });
        }
      } catch (err) {
        console.error(err);
      }
      setIsLoading(false);
    }
    fetchData();
  }, [studentId, navigate]);

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex justify-center items-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans">
      <NavBar role="student" user={student || { name: 'Loading...' }} />
      
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(`/student?id=${studentId}`)}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700"
            title="Back to Dashboard"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </button>
          <div>
            <h1 className="text-3xl font-bold text-white">Work Environment</h1>
            <p className="text-slate-400 mt-1">Live Team Collaboration. All code edits are synced with your team.</p>
          </div>
        </div>
        
        <div className="flex-1 h-[700px]">
          {teamId ? (
            <AntiCheatEditor studentId={student?.name || 'unknown'} teamId={teamId} taskId="task-demo-1" />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500">
              Loading team environment...
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function StudentEditor() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950"></div>}>
      <StudentEditorContent />
    </Suspense>
  );
}
