'use client';
import React, { useState, useEffect } from 'react';
import NavBar from '@/components/NavBar';
import TeamCard from '@/components/TeamCard';
import StudentProfileCard from '@/components/StudentProfileCard';
import OverrideModal from '@/components/OverrideModal';
import { toast } from 'react-hot-toast';

export default function AdminDashboard() {
  const [students, setStudents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isForming, setIsForming] = useState(false);
  const [overrideTeam, setOverrideTeam] = useState(null);
  const [antiCheatLogs, setAntiCheatLogs] = useState([]);
  const [meetings, setMeetings] = useState([]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [stRes, tmRes, logsRes, meetRes] = await Promise.all([
        fetch('/api/students'),
        fetch('/api/teams?populate=true'),
        fetch('/api/logs'),
        fetch('/api/meetings')
      ]);
      const stData = await stRes.json();
      const tmData = await tmRes.json();
      const logsData = await logsRes.json();
      const meetData = await meetRes.json();
      
      setStudents(stData.data || []);
      setTeams(tmData.data || []);
      if (logsData.success) {
        setAntiCheatLogs(logsData.logs || []);
      }
      if (meetData.success) {
        setMeetings(meetData.data || []);
      }
    } catch (err) {
      console.error(err);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleFormTeams = async () => {
    setIsForming(true);
    try {
      const res = await fetch('/api/teams/form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamSize: 4 })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('AI Teams formed successfully!');
        await fetchData(); // refresh data
      } else {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error('Failed to form teams');
    }
    setIsForming(false);
  };

  const handleOverrideSave = async (teamId, newStudentId) => {
    // In a real app we would hit a specific /api/teams/override endpoint.
    // For this prototype, we'll just alert and close to show the flow.
    toast.success(`Override saved: Student ${newStudentId} moved to Team ${teamId}`);
    setOverrideTeam(null);
    await fetchData();
  };

  const flaggedTeams = teams.filter(t => t.status === 'flagged');

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <NavBar role="admin" user={{ name: 'Prof. Smith' }} />
      
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
        {/* Header Stats */}
        <section>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Faculty Dashboard</h1>
              <p className="text-slate-400 mt-1">Monitor capstone projects, evaluate teams, and manage students.</p>
            </div>
            <button 
              onClick={handleFormTeams}
              disabled={true} // Disabled as requested
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-medium rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
            >
              {isForming ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Running AI Formation...
                </>
              ) : (
                'Form AI Teams (Disabled)'
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="text-slate-400 text-sm font-medium mb-1">Total Students</div>
              <div className="text-3xl font-bold text-white">{students.length}</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="text-slate-400 text-sm font-medium mb-1">Teams Formed</div>
              <div className="text-3xl font-bold text-white">{teams.length}</div>
            </div>
            <div className="bg-slate-900 border border-rose-500/30 rounded-xl p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/10 rounded-bl-full"></div>
              <div className="text-rose-400 text-sm font-medium mb-1">Flagged Teams</div>
              <div className="text-3xl font-bold text-rose-500">{flaggedTeams.length}</div>
            </div>
            <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-bl-full"></div>
              <div className="text-emerald-400 text-sm font-medium mb-1">Avg Formation Score</div>
              <div className="text-3xl font-bold text-emerald-500">
                {teams.length > 0 ? Math.round(teams.reduce((s,t) => s + (t.formationScore || 0), 0) / teams.length) : 0}
              </div>
            </div>
          </div>
        </section>

        {/* Flagged Alerts Table */}
        {flaggedTeams.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className="w-2 h-6 bg-rose-500 rounded-full inline-block"></span>
              Attention Required
            </h2>
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800 text-slate-400">
                  <tr>
                    <th className="px-6 py-3 font-medium">Team ID</th>
                    <th className="px-6 py-3 font-medium">Issue</th>
                    <th className="px-6 py-3 font-medium">AI Recommendation</th>
                    <th className="px-6 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {flaggedTeams.map(team => (
                    <tr key={team.id} className="hover:bg-slate-800/50">
                      <td className="px-6 py-4 font-medium text-white">{team.id.substring(0,6).toUpperCase()}</td>
                      <td className="px-6 py-4 text-rose-400">
                        {team.skillGaps?.length > 0 ? `Skill Gaps: ${team.skillGaps.join(', ')}` : 'Schedule Conflict'}
                      </td>
                      <td className="px-6 py-4">
                        {team.aiEvaluationLog?.[0]?.reason || 'Review required'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => setOverrideTeam(team)}
                          className="text-indigo-400 hover:text-indigo-300 font-medium"
                        >
                          Override
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Anti-Cheat Logs Section */}
        {antiCheatLogs.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className="w-2 h-6 bg-amber-500 rounded-full inline-block"></span>
              Anti-Cheat & Activity Logs
            </h2>
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800 text-slate-400">
                  <tr>
                    <th className="px-6 py-3 font-medium">Time</th>
                    <th className="px-6 py-3 font-medium">Student</th>
                    <th className="px-6 py-3 font-medium">Flag/Event</th>
                    <th className="px-6 py-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {antiCheatLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-800/50">
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-400">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 font-medium text-white">{log.studentId}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${log.flagged ? 'bg-rose-500/20 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'}`}>
                          {log.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-400 max-w-xs truncate" title={log.pastedTextPreview}>
                        {log.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Meeting Summaries Section */}
        {meetings.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className="w-2 h-6 bg-cyan-500 rounded-full inline-block"></span>
              AI Meeting Summaries & Transcripts
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {meetings.map(meeting => (
                <div key={meeting.id} className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col h-full max-h-[400px]">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-white">Team {meeting.teamId?.substring(0,6).toUpperCase()}</h3>
                    <span className="text-xs text-slate-500">{new Date(meeting.analyzedAt).toLocaleDateString()}</span>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 mb-4">
                    <p className="text-emerald-400 text-xs font-semibold mb-1 uppercase tracking-wider">AI Summary</p>
                    <p className="text-slate-300 text-sm mb-4">
                      {meeting.aiAnalysis?.participationSummary || 'No summary available.'}
                    </p>
                    
                    {meeting.transcript && (
                      <div className="mt-4">
                        <p className="text-indigo-400 text-xs font-semibold mb-1 uppercase tracking-wider">Raw Transcript</p>
                        <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-400 font-mono overflow-y-auto max-h-32">
                          {meeting.transcript.substring(0, 500)}{meeting.transcript.length > 500 ? '...' : ''}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {meeting.aiAnalysis?.flaggedIssues?.length > 0 && (
                    <div className="mb-4 text-xs text-rose-400 bg-rose-500/10 p-2 rounded">
                      <strong>Flags:</strong> {meeting.aiAnalysis.flaggedIssues.join(', ')}
                    </div>
                  )}

                  <button 
                    onClick={() => {
                      const prompt = `Here is the raw transcript from the meeting for Team ${meeting.teamId}. Please analyze who contributed what, ignoring the lack of speaker attribution by deducing turns based on context:\n\n"""\n${meeting.transcript}\n"""\n\nPlease output leadership scores (0-10) and communication scores (0-10) for each participant.`;
                      navigator.clipboard.writeText(prompt);
                      toast.success("Prompt copied to clipboard!");
                    }}
                    className="w-full py-2 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/50 text-indigo-300 rounded-lg text-sm font-medium transition-colors"
                  >
                    Copy AI Prompt (Manual Review)
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Formed Teams */}
        {teams.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className="w-2 h-6 bg-indigo-500 rounded-full inline-block"></span>
              All Teams
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {teams.map(team => (
                <TeamCard key={team.id} team={team} onOverride={setOverrideTeam} />
              ))}
            </div>
          </section>
        )}

        {/* Student Roster */}
        <section>
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-2 h-6 bg-emerald-500 rounded-full inline-block"></span>
            Student Roster
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {students.map(student => (
              <StudentProfileCard key={student.id} student={student} />
            ))}
          </div>
        </section>
      </main>

      {overrideTeam && (
        <OverrideModal 
          team={overrideTeam} 
          students={students} 
          onClose={() => setOverrideTeam(null)} 
          onSave={handleOverrideSave} 
        />
      )}
    </div>
  );
}
