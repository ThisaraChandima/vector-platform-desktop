'use client';
import React from 'react';

export default function VotePanel({ votes, currentUserId, onVote }) {
  if (!votes || votes.length === 0) return null;

  return (
    <div className="space-y-4">
      {votes.map((voteSession) => {
        const hasVoted = voteSession.votes[currentUserId] !== undefined;
        const yesCount = Object.values(voteSession.votes).filter(v => v === 'yes').length;
        const noCount = Object.values(voteSession.votes).filter(v => v === 'no').length;
        const totalVotes = Object.keys(voteSession.votes).length;

        return (
          <div key={voteSession.id} className="bg-slate-800 rounded-xl border border-indigo-500/30 p-5 shadow-lg relative overflow-hidden">
            {voteSession.result !== null && (
              <div className={`absolute top-0 right-0 text-[10px] font-bold px-2 py-1 rounded-bl-lg uppercase tracking-wide text-white ${voteSession.result === 'passed' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                {voteSession.result}
              </div>
            )}
            
            <div className="flex items-center gap-3 mb-2">
              <span className="px-2 py-1 bg-indigo-500/20 text-indigo-300 text-xs font-semibold rounded uppercase tracking-wider border border-indigo-500/30">
                {voteSession.type.replace('-', ' ')}
              </span>
              <span className="text-slate-400 text-sm">{new Date(voteSession.createdAt).toLocaleString()}</span>
            </div>
            
            <p className="text-slate-200 text-sm mb-4">
              <span className="font-semibold">Reason:</span> {voteSession.reason}
            </p>

            <div className="flex items-center justify-between mt-4 border-t border-slate-700/50 pt-4">
              <div className="flex gap-4 text-sm font-medium">
                <span className="text-emerald-400">Yes: {yesCount}</span>
                <span className="text-rose-400">No: {noCount}</span>
              </div>
              
              {voteSession.result === null && !hasVoted && (
                <div className="flex gap-2">
                  <button 
                    onClick={() => onVote(voteSession.id, 'no')}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-rose-500/20 hover:text-rose-400 rounded-md text-slate-300 text-sm font-medium transition-colors"
                  >
                    Vote No
                  </button>
                  <button 
                    onClick={() => onVote(voteSession.id, 'yes')}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-md text-white text-sm font-medium transition-colors"
                  >
                    Vote Yes
                  </button>
                </div>
              )}
              
              {voteSession.result === null && hasVoted && (
                <span className="text-slate-400 text-sm italic">You voted {voteSession.votes[currentUserId]}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
