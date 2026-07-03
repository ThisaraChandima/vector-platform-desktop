'use client';
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function NavBar({ role, user }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    document.cookie = 'auth_user=; path=/; max-age=0';
    localStorage.removeItem('auth_user');
    navigate('/login');
  };

  return (
    <nav className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-xl font-bold text-white tracking-tight">Vector</span>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            {role && (
              <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-sm font-medium border border-slate-700">
                Role: <span className="text-indigo-400 capitalize">{role}</span>
              </span>
            )}
            {user && (
              <span className="text-slate-400 text-sm">
                {user.name}
              </span>
            )}
            <button 
              onClick={handleLogout}
              className="text-sm text-slate-500 hover:text-rose-400 transition-colors flex items-center gap-1 ml-4"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              Log out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
