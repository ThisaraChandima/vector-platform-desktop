import React from 'react';
import CapacityBar from './CapacityBar';

export default function StudentProfileCard({ student }) {
  const { profile, capacityTokens, peerValidationScore, inflationFlag } = student;
  
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 flex flex-col h-full shadow-lg relative overflow-hidden group hover:border-indigo-500/50 transition-colors">
      {inflationFlag && (
        <div className="absolute top-0 right-0 bg-rose-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg uppercase tracking-wide">
          Flagged: Inflation
        </div>
      )}
      
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{student.name}</h3>
          <p className="text-indigo-400 text-sm font-medium uppercase tracking-wider">{profile?.desiredRole}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white">
            {peerValidationScore ? peerValidationScore.toFixed(1) : '-'}
            <span className="text-sm text-slate-500 font-normal">/10</span>
          </div>
          <div className="text-xs text-slate-400">Peer Score</div>
        </div>
      </div>

      <div className="mb-6 flex-grow">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Tech Skills</h4>
        <div className="flex flex-wrap gap-2">
          {Object.entries(profile?.technicalSkills || {}).map(([skill, val]) => (
            val > 0 && (
              <span key={skill} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {skill}: {val}
              </span>
            )
          ))}
        </div>
      </div>

      <div className="mt-auto pt-4 border-t border-slate-700/50">
        <CapacityBar used={capacityTokens.currentActiveHours} max={capacityTokens.maxWeeklyHours} />
      </div>
    </div>
  );
}
