'use client';
import React, { useState } from 'react';
import { toast } from 'react-hot-toast';

export default function TaskBoard({ tasks, students, currentUserId, onAssign, onTransfer }) {
  const [selectedTask, setSelectedTask] = useState(null);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAssign = async (taskId) => {
    setIsProcessing(true);
    await onAssign(taskId, currentUserId);
    setIsProcessing(false);
  };

  const handleTransfer = async () => {
    if (!transferTarget || !transferReason) {
      toast.error('Target student and reason are required');
      return;
    }
    setIsProcessing(true);
    await onTransfer(selectedTask.id, currentUserId, transferTarget, transferReason);
    setSelectedTask(null);
    setTransferTarget('');
    setTransferReason('');
    setIsProcessing(false);
  };

  const columns = {
    unassigned: tasks.filter(t => t.status === 'unassigned'),
    doing: tasks.filter(t => t.status === 'in-progress' || (!t.status && t.assignedTo)),
    done: tasks.filter(t => t.status === 'completed')
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* UNASSIGNED */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 h-[600px] flex flex-col">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center justify-between">
          Unassigned <span className="bg-slate-700 text-slate-300 py-0.5 px-2 rounded-full text-xs">{columns.unassigned.length}</span>
        </h3>
        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {columns.unassigned.map(task => (
            <div key={task.id} className="bg-slate-800 rounded-lg p-4 border border-slate-700 shadow-sm hover:border-indigo-500/30 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <h4 className="text-white font-medium text-sm">{task.title}</h4>
                <span className="bg-indigo-500/10 text-indigo-400 text-xs px-2 py-0.5 rounded border border-indigo-500/20">{task.estimatedHours}h</span>
              </div>
              <p className="text-slate-400 text-xs mb-4 line-clamp-2">{task.description}</p>
              <button 
                onClick={() => handleAssign(task.id)}
                disabled={isProcessing}
                className="w-full py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-xs font-medium rounded transition-colors border border-indigo-500/30"
              >
                Claim Task
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* DOING */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 h-[600px] flex flex-col">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center justify-between">
          In Progress <span className="bg-slate-700 text-slate-300 py-0.5 px-2 rounded-full text-xs">{columns.doing.length}</span>
        </h3>
        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {columns.doing.map(task => {
            const assignee = students.find(s => s.id === task.assignedTo);
            const isMine = task.assignedTo === currentUserId;
            
            return (
              <div key={task.id} className={`bg-slate-800 rounded-lg p-4 border ${isMine ? 'border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.1)]' : 'border-slate-700'} shadow-sm transition-colors`}>
                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-white font-medium text-sm">{task.title}</h4>
                  <span className="bg-indigo-500/10 text-indigo-400 text-xs px-2 py-0.5 rounded border border-indigo-500/20">{task.estimatedHours}h</span>
                </div>
                
                <div className="flex items-center gap-2 mb-4 mt-3">
                  <div className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center text-white text-[10px] font-bold">
                    {assignee?.name?.charAt(0) || '?'}
                  </div>
                  <span className={`text-xs ${isMine ? 'text-indigo-400 font-medium' : 'text-slate-400'}`}>
                    {isMine ? 'You' : assignee?.name || 'Unknown'}
                  </span>
                </div>

                {isMine && (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setSelectedTask(task)}
                      className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded transition-colors"
                    >
                      Transfer
                    </button>
                    {/* Fake complete button for prototype UI */}
                    <button 
                      className="flex-1 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 text-xs font-medium rounded transition-colors border border-emerald-500/30"
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* DONE (Empty for UI prototype unless seeded) */}
      <div className="bg-slate-800/20 rounded-xl p-4 border border-slate-700/50 h-[600px] flex flex-col">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center justify-between">
          Completed <span className="bg-slate-800 text-slate-400 py-0.5 px-2 rounded-full text-xs">{columns.done.length}</span>
        </h3>
        <div className="flex-1 overflow-y-auto space-y-3 pr-2 opacity-70">
          {columns.done.map(task => (
            <div key={task.id} className="bg-slate-900 rounded-lg p-4 border border-slate-800 shadow-sm">
              <h4 className="text-slate-400 font-medium text-sm line-through">{task.title}</h4>
            </div>
          ))}
        </div>
      </div>

      {/* Transfer Modal */}
      {selectedTask && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">Transfer Task</h3>
            <p className="text-sm text-slate-400 mb-6">You are transferring "{selectedTask.title}" ({selectedTask.estimatedHours}h)</p>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Transfer to</label>
                <select 
                  value={transferTarget}
                  onChange={(e) => setTransferTarget(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-sm focus:border-indigo-500 outline-none"
                >
                  <option value="">Select team member...</option>
                  {students.filter(s => s.id !== currentUserId).map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.capacityTokens.maxWeeklyHours - s.capacityTokens.currentActiveHours}h available)</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Reason for transfer</label>
                <textarea 
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="E.g., I'm over capacity with backend work..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-sm focus:border-indigo-500 outline-none h-24"
                />
              </div>
            </div>
            
            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setSelectedTask(null)}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleTransfer}
                disabled={isProcessing || !transferTarget || !transferReason}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isProcessing ? 'Processing...' : 'Transfer Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
