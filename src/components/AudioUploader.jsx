'use client';
import React, { useState, useRef } from 'react';
import { toast } from 'react-hot-toast';

export default function AudioUploader({ teamId, onAnalysisComplete }) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const url = URL.createObjectURL(audioBlob);
        setAudioURL(url);
        audioChunksRef.current = [];
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      toast.error('Microphone access denied or unavailable.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      // In a real app we would transcribe the audio here.
      // For this prototype, we'll simulate a transcript generation or allow manual input.
      setTranscript("Meeting started. Everyone present. Let's discuss the architecture. I think we should use Next.js. Yes, I agree, it fits well. What about the database? We can stick to JSON files for the prototype. Sounds good.");
    }
  };

  const submitAnalysis = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/meetings/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, transcript, audioFilename: 'meeting_audio.wav' })
      });
      const data = await res.json();
      if (data.success) {
        onAnalysisComplete(data.data);
      } else {
        toast.error('Analysis failed: ' + data.error);
      }
    } catch (err) {
      toast.error('Request failed');
    }
    setIsProcessing(false);
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Meeting Audio Analysis</h3>
      
      <div className="flex gap-4 mb-6">
        {!isRecording ? (
          <button onClick={startRecording} className="px-4 py-2 bg-rose-500/20 text-rose-400 border border-rose-500/50 rounded-lg font-medium flex items-center gap-2 hover:bg-rose-500/30 transition-colors">
            <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse"></div>
            Start Recording
          </button>
        ) : (
          <button onClick={stopRecording} className="px-4 py-2 bg-slate-700 text-white rounded-lg font-medium flex items-center gap-2 hover:bg-slate-600 transition-colors">
            <div className="w-3 h-3 rounded-sm bg-rose-500"></div>
            Stop Recording
          </button>
        )}
      </div>

      {audioURL && (
        <div className="mb-6">
          <audio src={audioURL} controls className="w-full h-10 rounded" />
        </div>
      )}

      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-400 mb-2">Transcript (Auto-generated or Manual)</label>
        <textarea 
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          className="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-300 focus:outline-none focus:border-indigo-500"
          placeholder="Meeting transcript will appear here..."
        />
      </div>

      <button 
        onClick={submitAnalysis} 
        disabled={!transcript || isProcessing}
        className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
      >
        {isProcessing ? 'Analyzing with AI...' : 'Run AI Soft-Skill Analysis'}
      </button>
    </div>
  );
}
