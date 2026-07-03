'use client';
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import NavBar from '@/components/NavBar';
import TaskBoard from '@/components/TaskBoard';
import VotePanel from '@/components/VotePanel';
import { toast } from 'react-hot-toast';

function StudentTasksContent() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const studentId = searchParams.get('id');

  const [student, setStudent] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [votes, setVotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    if (!studentId) return;
    setIsLoading(true);
    try {
      const stRes = await fetch('/api/students/' + studentId);
      const stData = await stRes.json();
      setStudent(stData.data);

      if (stData.data?.teamId) {
        // fetch team members
        const tmRes = await fetch('/api/teams?populate=true');
        const tmData = await tmRes.json();
        const team = tmData.data.find(t => t.id === stData.data.teamId);
        if (team) setTeamMembers(team.members);

        // fetch tasks
        const tkRes = await fetch(`/api/tasks?teamId=${stData.data.teamId}`);
        const tkData = await tkRes.json();
        setTasks(tkData.data || []);

        // fetch votes
        const vtRes = await fetch(`/api/votes?teamId=${stData.data.teamId}`);
        const vtData = await vtRes.json();
        setVotes(vtData.data || []);
      }
    } catch (err) {
      console.error(err);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (studentId) {
      fetchData();
    } else {
      navigate('/student', { replace: true });
    }
  }, [studentId, navigate]);

  const handleAssign = async (taskId, assigneeId) => {
    try {
      const res = await fetch('/api/tasks/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, studentId: assigneeId })
      });
      const data = await res.json();
      
      if (!data.success) {
        if (data.data?.suggestVote) {
          if (confirm(`Capacity error: ${data.error}\n\nWould you like to initiate a democratic vote to reassign this task?`)) {
            await fetch('/api/votes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'create',
                teamId: student.teamId,
                type: 'task-reassign',
                targetTaskId: taskId,
                voterId: studentId,
                toStudentId: assigneeId,
                reason: 'Team is at capacity, proposing forced reassignment.'
              })
            });
            toast.success('Vote session created.');
          }
        } else {
          toast.error(`Assignment failed: ${data.error}\nRedirected to: ${data.data?.redirectReason || 'None'}`, { duration: 5000 });
        }
      } else {
        toast.success('Task claimed successfully!');
      }
      await fetchData();
    } catch (err) {
      toast.error('Error assigning task');
    }
  };

  const handleTransfer = async (taskId, fromId, toId, reason) => {
    try {
      const res = await fetch('/api/tasks/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, fromStudentId: fromId, toStudentId: toId, reason })
      });
      const data = await res.json();
      if (!data.success) {
        toast.error('Transfer failed: ' + data.error);
      } else {
        toast.success('Task transferred successfully!');
      }
      await fetchData();
    } catch (err) {
      toast.error('Error transferring task');
    }
  };

  const handleVote = async (voteId, vote) => {
    try {
      await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cast', voteId, voterId: studentId, vote })
      });
      toast.success('Vote cast successfully!');
      await fetchData();
    } catch (err) {
      toast.error('Error casting vote');
    }
  };

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex justify-center items-center text-white">Loading...</div>;
  if (!student) return null;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <NavBar role="student" user={student} />
      
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <header>
          <h1 className="text-3xl font-bold text-white tracking-tight">Task Board</h1>
          <p className="text-slate-400 mt-1">Manage team capacity and assignments.</p>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          <div className="xl:col-span-3">
            <TaskBoard 
              tasks={tasks} 
              students={teamMembers} 
              currentUserId={student.id} 
              onAssign={handleAssign}
              onTransfer={handleTransfer}
            />
          </div>
          
          <div className="xl:col-span-1 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white mb-4">Active Votes</h2>
              {votes.filter(v => v.result === null).length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
                  <p className="text-sm text-slate-500">No active votes.</p>
                </div>
              ) : (
                <VotePanel votes={votes.filter(v => v.result === null)} currentUserId={student.id} onVote={handleVote} />
              )}
            </div>

            <div>
              <h2 className="text-lg font-bold text-white mb-4">Past Decisions</h2>
              {votes.filter(v => v.result !== null).length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
                  <p className="text-sm text-slate-500">No past decisions.</p>
                </div>
              ) : (
                <VotePanel votes={votes.filter(v => v.result !== null)} currentUserId={student.id} onVote={handleVote} />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function StudentTasks() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950"></div>}>
      <StudentTasksContent />
    </Suspense>
  );
}
