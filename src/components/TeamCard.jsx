import React from 'react';
import { Link } from 'react-router-dom';
import GapAlert from './GapAlert';

export default function TeamCard({ team, onOverride }) {
  const isFlagged = team.status === 'flagged';
  const formationScore = team.formationScore || 0;
  
  let scoreColor = 'text-emerald-400';
  if (formationScore < 80) scoreColor = 'text-yellow-400';
  if (formationScore < 60) scoreColor = 'text-rose-400';

  return (
    <div className={`bg-slate-800 rounded-xl border ${isFlagged ? 'border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.1)]' : 'border-slate-700'} p-6 flex flex-col h-full transition-all`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-xl font-bold text-white">Team {team.id.substring(0, 6).toUpperCase()}</h3>
            {isFlagged && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-500/20 text-rose-400 border border-rose-500/20">
                Flagged
              </span>
            )}
          </div>
          <p className="text-slate-400 text-sm">
            {team.members?.length || 0} Members • Schedule Overlap: {team.scheduleOverlapScore}
          </p>
        </div>
        <div className="text-right">
          <div className={`text-3xl font-bold ${scoreColor}`}>{formationScore}</div>
          <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Formation Score</div>
        </div>
      </div>

      <div className="mb-4">
        <GapAlert gaps={team.skillGaps} />
      </div>

      <div className="flex-grow">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Roster</h4>
        <div className="space-y-3">
          {team.members?.map(member => (
            <div key={member.id} className="flex justify-between items-center p-2 rounded-lg bg-slate-900/50 border border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                  {member.name.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-200">{member.name}</div>
                  <div className="text-xs text-slate-500">
                    {team.roles?.leader === member.id && <span className="text-yellow-500 mr-1">👑 Leader</span>}
                    {Object.entries(team.roles || {})
                      .filter(([r, id]) => id === member.id && r !== 'leader')
                      .map(([r]) => r).join(', ')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {team.aiEvaluationLog?.length > 0 && (
        <div className="mt-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700 text-sm text-slate-300">
          <span className="font-semibold text-indigo-400 mb-1 block">AI Analysis:</span>
          {team.aiEvaluationLog[team.aiEvaluationLog.length - 1].reason}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2">
        {onOverride && (
          <button 
            onClick={() => onOverride(team)}
            className="w-full py-2 px-4 border border-indigo-500/50 rounded-lg text-indigo-400 hover:bg-indigo-500/10 transition-colors text-sm font-medium"
          >
            Override / Adjust Team
          </button>
        )}
      </div>
    </div>
  );
}
