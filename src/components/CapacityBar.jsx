import React from 'react';

export default function CapacityBar({ used, max }) {
  const percentage = Math.min(100, (used / max) * 100);
  
  let color = 'bg-emerald-500';
  if (percentage >= 100) color = 'bg-rose-500';
  else if (percentage >= 75) color = 'bg-yellow-500';

  return (
    <div className="w-full relative group">
      <div className="flex justify-between items-center text-xs mb-1.5">
        <span className="text-slate-400 font-medium tracking-wide uppercase text-[10px]">Workload Capacity</span>
        <span className={`font-bold ${percentage >= 100 ? 'text-rose-400' : 'text-slate-200'}`}>
          {used}<span className="text-slate-500 font-medium mx-0.5">/</span>{max} hrs
        </span>
      </div>
      <div className="w-full bg-slate-900/80 rounded-full h-2.5 border border-slate-800 shadow-inner overflow-hidden relative">
        <div
          className={`${color} h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden`}
          style={{ width: `${percentage}%` }}
        >
          {/* Subtle shine effect */}
          <div className="absolute top-0 left-0 right-0 bottom-0 bg-gradient-to-b from-white/20 to-transparent"></div>
          {percentage > 0 && percentage < 100 && (
            <div className="absolute top-0 right-0 bottom-0 w-4 bg-gradient-to-r from-transparent to-white/30 animate-pulse"></div>
          )}
        </div>
      </div>
      {percentage >= 100 && (
        <p className="text-[10px] text-rose-400/80 mt-1.5 font-medium animate-pulse">Over Capacity Warning</p>
      )}
    </div>
  );
}
