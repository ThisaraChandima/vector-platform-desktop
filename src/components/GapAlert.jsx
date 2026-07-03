import React from 'react';

export default function GapAlert({ gaps }) {
  if (!gaps || gaps.length === 0) return null;

  return (
    <div className="border-l-4 border-rose-500 bg-rose-500/10 p-4 rounded-r-md">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-rose-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-rose-500">Critical Skill Gaps Detected</h3>
          <div className="mt-2 text-sm text-rose-400">
            <ul className="list-disc pl-5 space-y-1">
              {gaps.map((gap, idx) => (
                <li key={idx}>Missing proficient <strong>{gap}</strong> engineer</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
