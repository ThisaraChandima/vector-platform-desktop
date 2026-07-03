import React, { useState, useEffect } from 'react';

export default function StudentStep({ student, team }) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!team) return;
    fetch('/api/meetings')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const teamMeetings = data.data.filter(m => m.teamId === team.id);
          setMeetings(teamMeetings);
        }
        setLoading(false);
      });
  }, [team]);

  if (!team) return null;
  if (loading) return <div className="text-slate-400">Loading meeting insights...</div>;
  if (meetings.length === 0) return <div className="text-slate-400">No meeting transcripts available yet.</div>;

  // Get the latest meeting
  const latestMeeting = meetings.sort((a, b) => new Date(b.analyzedAt) - new Date(a.analyzedAt))[0];
  const aiData = latestMeeting.aiAnalysis;
  const myLeadership = aiData?.leadershipScores?.[student.name] || 0;
  const myCommunication = aiData?.communicationScores?.[student.name] || 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[60px] rounded-full pointer-events-none"></div>
      
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
          <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3l18 18" /></svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Student Step: Meeting Insights</h2>
          <p className="text-slate-400 text-sm">AI Analysis of your recent participation</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
            <h3 className="text-slate-300 text-sm font-semibold uppercase tracking-wider mb-3">Your Performance</h3>
            
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Leadership Role</span>
                <span className="text-indigo-400 font-bold">{myLeadership}/10</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2">
                <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${(myLeadership / 10) * 100}%` }}></div>
              </div>
              {myLeadership >= 8 && <p className="text-xs text-emerald-400 mt-2">🌟 Excellent leadership demonstrated</p>}
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Communication</span>
                <span className="text-emerald-400 font-bold">{myCommunication}/10</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2">
                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${(myCommunication / 10) * 100}%` }}></div>
              </div>
            </div>
          </div>
          
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
            <h3 className="text-slate-300 text-sm font-semibold uppercase tracking-wider mb-2">AI Summary</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              {aiData?.participationSummary || "No summary available."}
            </p>
          </div>
          
          {aiData?.workingEnvLogs && aiData.workingEnvLogs.length > 0 && (
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 mt-4 max-h-64 flex flex-col">
              <h3 className="text-slate-300 text-sm font-semibold uppercase tracking-wider mb-2">Editor Activity Logs</h3>
              <div className="overflow-y-auto space-y-2 flex-1 pr-2 custom-scrollbar">
                {aiData.workingEnvLogs.slice(0, 10).map((log, i) => (
                  <div key={i} className="text-xs p-2 bg-slate-900 rounded border border-slate-800/50">
                    <span className="text-slate-500 font-mono block mb-1">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className={`font-semibold ${log.flagged ? 'text-rose-400' : 'text-slate-300'}`}>[{log.type}]</span>{' '}
                    <span className="text-slate-400">{log.details}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <div className="bg-slate-950 rounded-xl border border-slate-800 h-full flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
              <h3 className="text-slate-300 text-sm font-semibold uppercase tracking-wider">Raw Transcript (Excerpt)</h3>
              <span className="text-xs px-2 py-1 bg-rose-500/20 text-rose-400 rounded-full border border-rose-500/30">Auto-Generated</span>
            </div>
            <div className="p-4 flex-1 overflow-y-auto font-mono text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">
              {latestMeeting.transcript}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
