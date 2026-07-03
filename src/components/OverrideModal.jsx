'use client';
import React, { useState } from 'react';

export default function OverrideModal({ team, students, onClose, onSave }) {
  const [selectedStudent, setSelectedStudent] = useState('');
  
  // All students not in a team, or in this team already
  const availableStudents = students.filter(s => s.teamId === null || s.teamId === team.id);
  
  const handleSwap = () => {
    onSave(team.id, selectedStudent);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-2">Override Team Assignment</h3>
        <p className="text-sm text-slate-400 mb-6">Modify Team {team.id.substring(0,6).toUpperCase()}</p>
        
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Add or Swap Student</label>
            <select 
              value={selectedStudent}
              onChange={(e) => setSelectedStudent(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-sm focus:border-indigo-500 outline-none"
            >
              <option value="">Select student...</option>
              {availableStudents.map(s => (
                <option key={s.id} value={s.id}>{s.name} {s.teamId === team.id ? '(Currently on team)' : '(Unassigned)'}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="flex gap-3 justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSwap}
            disabled={!selectedStudent}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
}
