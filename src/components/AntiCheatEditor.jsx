'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { toast } from 'react-hot-toast';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://example.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'dummy-key';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function AntiCheatEditor({ studentId, teamId, taskId }) {
  const [files, setFiles] = useState([
    { id: '1', name: 'index.js', content: '// Write your code or report here...\nfunction helloWorld() {\n  console.log("Hello, World!");\n}\n', language: 'javascript' },
    { id: '2', name: 'report.txt', content: 'My project report...\n\nWe implemented feature X...', language: 'plaintext' }
  ]);
  const [activeFileId, setActiveFileId] = useState('1');
  const [warnings, setWarnings] = useState(0);
  const [syncStatus, setSyncStatus] = useState('Connecting...');
  const [showFilePrompt, setShowFilePrompt] = useState(false);
  const [newFileNameInput, setNewFileNameInput] = useState('newfile.txt');
  
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const editTimeoutRef = useRef(null);
  const channelRef = useRef(null);
  const skipNextSyncRef = useRef(false);
  
  const decorationsCollectionRef = useRef(null);
  const remoteCursorsRef = useRef({});
  const activeFileIdRef = useRef(activeFileId);

  useEffect(() => { activeFileIdRef.current = activeFileId; }, [activeFileId]);

  const activeFile = files.find(f => f.id === activeFileId);

  const updateDecorations = useCallback(() => {
    if (!decorationsCollectionRef.current || !monacoRef.current) return;
    const newDecorations = Object.entries(remoteCursorsRef.current).map(([senderId, pos]) => {
      const safeSender = senderId.replace(/[^a-zA-Z0-9]/g, '');
      const className = safeSender.startsWith('student') ? `remote-cursor-${safeSender}` : 'remote-cursor-student1';
      return {
        range: new monacoRef.current.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
        options: {
          className: className,
          isWholeLine: false,
          stickiness: 1 // Tracked after edits
        }
      };
    });
    decorationsCollectionRef.current.set(newDecorations);
  }, []);

  // Clear remote cursors when switching files
  useEffect(() => {
    remoteCursorsRef.current = {};
    if (decorationsCollectionRef.current) decorationsCollectionRef.current.clear();
  }, [activeFileId]);

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    decorationsCollectionRef.current = editor.createDecorationsCollection([]);
    const editorDomNode = editor.getDomNode();
    if (editorDomNode) {
      editorDomNode.addEventListener('paste', handlePaste);
    }

    editor.onDidChangeCursorPosition((e) => {
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'cursor-update',
          payload: { fileId: activeFileIdRef.current, position: e.position, sender: studentId }
        });
      }
    });
  };

  useEffect(() => {
    if (!teamId) return;

    const channel = supabase.channel(`editor-${teamId}`, {
      config: { broadcast: { self: false } }
    });
    
    channelRef.current = channel;

    channel.on('broadcast', { event: 'file-update' }, (msg) => {
      const { id, content } = msg.payload;
      skipNextSyncRef.current = true;
      setFiles(prev => prev.map(f => f.id === id ? { ...f, content } : f));
    });

    channel.on('broadcast', { event: 'file-created' }, (msg) => {
      const { newFile } = msg.payload;
      setFiles(prev => {
        if (!prev.find(f => f.id === newFile.id)) return [...prev, newFile];
        return prev;
      });
    });

    channel.on('broadcast', { event: 'file-deleted' }, (msg) => {
      const { id } = msg.payload;
      setFiles(prev => prev.filter(f => f.id !== id));
      setActiveFileId(prevId => prevId === id ? null : prevId);
    });

    channel.on('broadcast', { event: 'cursor-update' }, (msg) => {
      const { fileId, position, sender } = msg.payload;
      if (fileId === activeFileIdRef.current && sender !== studentId) {
        remoteCursorsRef.current[sender] = position;
        updateDecorations();
      }
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setSyncStatus('Live Sync Active');
      } else {
        setSyncStatus('Sync Disconnected');
      }
    });

    return () => {
      if (editorRef.current) {
        const editorDomNode = editorRef.current.getDomNode();
        if (editorDomNode) {
          editorDomNode.removeEventListener('paste', handlePaste);
        }
      }
      if (editTimeoutRef.current) {
        clearTimeout(editTimeoutRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [teamId]);

  const logAction = async (type, details, flagged = false, preview = '') => {
    try {
      await fetch('https://vector-platform-two.vercel.app/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          studentId: studentId || 'unknown',
          taskId: taskId || 'unknown',
          details,
          flagged,
          pastedTextPreview: preview
        })
      });
    } catch (e) {
      console.error("Failed to log action", e);
    }
  };

  const handlePaste = (e) => {
    const pastedText = (e.clipboardData || window.clipboardData).getData('text');
    if (pastedText.length > 50) {
      setWarnings(prev => prev + 1);
      toast.error(`Warning: Large paste detected (${pastedText.length} chars). This has been logged for review.`);
      logAction('PASTE_DETECTED', `Pasted ${pastedText.length} characters in ${activeFile?.name}`, true, pastedText.substring(0, 100) + (pastedText.length > 100 ? '...' : ''));
    }
  };

  const handleChange = (value, event) => {
    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: value } : f));
    
    // Broadcast change
    if (channelRef.current && !skipNextSyncRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'file-update',
        payload: { id: activeFileId, content: value, sender: studentId }
      });
    }
    
    // Reset skip sync
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
    }
    
    if (event && event.changes && event.changes.length > 0) {
      const change = event.changes[0];
      if (editTimeoutRef.current) clearTimeout(editTimeoutRef.current);
      
      editTimeoutRef.current = setTimeout(() => {
        const linesEdited = change.range.startLineNumber === change.range.endLineNumber 
          ? `Line ${change.range.startLineNumber}` 
          : `Lines ${change.range.startLineNumber}-${change.range.endLineNumber}`;
        
        logAction(
          'CODE_EDITED', 
          `Edited ${linesEdited} in ${activeFile?.name}`, 
          false, 
          `Changes made around ${linesEdited}`
        );
      }, 2000);
    }
  };

  const handleManualSave = () => {
    toast.success('Files saved successfully!');
    logAction('FILES_SAVED', `Saved all files to workspace`, false, '');
  };

  const getLanguageFromFilename = (name) => {
    if (name.endsWith('.js') || name.endsWith('.jsx')) return 'javascript';
    if (name.endsWith('.ts') || name.endsWith('.tsx')) return 'typescript';
    if (name.endsWith('.css')) return 'css';
    if (name.endsWith('.html')) return 'html';
    if (name.endsWith('.json')) return 'json';
    if (name.endsWith('.md')) return 'markdown';
    return 'plaintext';
  };

  const getIconForFile = (name) => {
    if (name.endsWith('.js') || name.endsWith('.jsx')) return <svg className="w-4 h-4 text-[#efd81d]" viewBox="0 0 100 100" fill="currentColor"><path d="M10 20h80v60H10z"/><text x="25" y="65" fontSize="40" fill="black" fontWeight="bold">JS</text></svg>;
    if (name.endsWith('.css')) return <svg className="w-4 h-4 text-[#519aba]" viewBox="0 0 100 100" fill="currentColor"><path d="M10 20h80v60H10z"/><text x="20" y="65" fontSize="35" fill="white" fontWeight="bold">CSS</text></svg>;
    if (name.endsWith('.html')) return <svg className="w-4 h-4 text-[#e34c26]" viewBox="0 0 100 100" fill="currentColor"><path d="M10 20h80v60H10z"/><text x="20" y="65" fontSize="35" fill="white" fontWeight="bold">HTM</text></svg>;
    return <svg className="w-4 h-4 text-[#cccccc]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>;
  };

  const createNewFile = () => {
    setShowFilePrompt(true);
  };

  const handleConfirmCreateFile = () => {
    setShowFilePrompt(false);
    const filename = newFileNameInput.trim();
    if (filename) {
      const newFile = {
        id: crypto.randomUUID(),
        name: filename,
        content: '',
        language: getLanguageFromFilename(filename)
      };
      setFiles(prev => [...prev, newFile]);
      setActiveFileId(newFile.id);
      logAction('FILE_CREATED', `Created file ${filename}`, false, '');
      
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'file-created',
          payload: { newFile, sender: studentId }
        });
      }
    }
    setNewFileNameInput('newfile.txt');
  };

  const fileInputRef = useRef(null);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      const newFile = {
        id: crypto.randomUUID(),
        name: file.name,
        content: content,
        language: getLanguageFromFilename(file.name)
      };
      setFiles(prev => [...prev, newFile]);
      setActiveFileId(newFile.id);
      logAction('FILE_UPLOADED', `Uploaded file ${file.name}`, false, '');
      
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'file-created',
          payload: { newFile, sender: studentId }
        });
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const handleDeleteFile = (e, id, name) => {
    e.stopPropagation(); // prevent setting as active file
    if (window.confirm(`Are you sure you want to delete ${name}?`)) {
      setFiles(prev => prev.filter(f => f.id !== id));
      if (activeFileId === id) {
        setActiveFileId(null);
      }
      logAction('FILE_DELETED', `Deleted file ${name}`, false, '');
      
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'file-deleted',
          payload: { id, sender: studentId }
        });
      }
    }
  };

  return (
    <div className="w-full h-full flex border border-[#1e1e1e] rounded-xl overflow-hidden shadow-2xl bg-[#1e1e1e] text-[#cccccc] font-sans">
      {/* VS Code Activity Bar */}
      <div className="w-12 bg-[#333333] flex flex-col items-center py-4 gap-6 border-r border-[#252526] z-10">
        <svg className="w-6 h-6 text-white cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
        <svg className="w-6 h-6 text-[#858585] hover:text-white cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
      </div>

      {/* VS Code Sidebar */}
      <div className="w-64 bg-[#252526] flex flex-col border-r border-[#1e1e1e]">
        <div className="px-4 py-2 text-[11px] font-semibold text-[#cccccc] uppercase tracking-wider flex justify-between items-center group">
          <span>Explorer</span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={createNewFile} className="hover:bg-[#333] rounded p-0.5" title="New File">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="hover:bg-[#333] rounded p-0.5" title="Upload File">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
          </div>
        </div>
        <div className="px-2 py-1 overflow-y-auto">
          {files.map(f => (
            <div 
              key={f.id}
              onClick={() => setActiveFileId(f.id)}
              className={`flex justify-between items-center text-sm cursor-pointer px-2 py-1 mb-0.5 rounded-sm group ${activeFileId === f.id ? 'bg-[#37373d] text-white' : 'text-[#cccccc] hover:bg-[#2a2d2e]'}`}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                {getIconForFile(f.name)}
                <span className="truncate">{f.name}</span>
              </div>
              <button onClick={(e) => handleDeleteFile(e, f.id, f.name)} className="opacity-0 group-hover:opacity-100 hover:bg-[#4d4d50] p-0.5 rounded text-[#cccccc] hover:text-white" title="Delete File">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
        {/* Editor Tabs */}
        <div className="flex bg-[#252526] h-9 overflow-x-auto custom-scrollbar">
          {files.map(f => (
            <div 
              key={f.id}
              onClick={() => setActiveFileId(f.id)}
              className={`flex justify-between items-center px-3 text-sm min-w-[120px] max-w-[200px] cursor-pointer border-r border-[#1e1e1e] group ${activeFileId === f.id ? 'bg-[#1e1e1e] border-t-2 border-t-[#007acc] text-[#cccccc]' : 'bg-[#2d2d2d] text-[#858585] border-t-2 border-t-transparent hover:bg-[#2b2b2b]'}`}
            >
              <div className="flex items-center gap-2 overflow-hidden py-1">
                {getIconForFile(f.name)}
                <span className="truncate">{f.name}</span>
              </div>
              <button onClick={(e) => handleDeleteFile(e, f.id, f.name)} className="opacity-0 group-hover:opacity-100 hover:bg-[#4d4d50] ml-2 p-0.5 rounded text-inherit" title="Close File">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
          
          <div className="flex-1 flex justify-end items-center px-4 gap-4 text-xs font-mono bg-[#252526] border-b border-[#1e1e1e]">
            {warnings > 0 && (
              <span className="text-rose-400 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                Flags: {warnings}
              </span>
            )}
            <span className="text-emerald-400 flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              {syncStatus}
            </span>
          </div>
        </div>

        {/* Breadcrumbs & Actions */}
        <div className="flex items-center justify-between px-4 h-8 bg-[#1e1e1e] text-[13px] text-[#cccccc] shadow-[0_2px_4px_-2px_rgba(0,0,0,0.5)] z-10 border-b border-[#252526]">
          <div>
            vector-platform <span className="mx-1 text-[#858585]">&gt;</span> src <span className="mx-1 text-[#858585]">&gt;</span> {activeFile?.name}
          </div>
          <button 
            onClick={handleManualSave}
            className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded shadow transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
            Save Files
          </button>
        </div>

        {/* Editor Instance */}
        <div className="flex-1 min-h-[500px] relative">
          {activeFile ? (
            <Editor
              height="100%"
              path={activeFile.name}
              language={activeFile.language}
              theme="vs-dark"
              value={activeFile.content}
              onChange={handleChange}
              onMount={handleEditorDidMount}
              options={{
                minimap: { enabled: true, scale: 0.75 },
                fontSize: 14,
                fontFamily: "'Droid Sans Mono', 'monospace', monospace",
                padding: { top: 8 },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                cursorBlinking: "smooth",
                cursorSmoothCaretAnimation: "on",
                formatOnPaste: true,
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[#858585]">
              Select or create a file to start editing
            </div>
          )}
        </div>
      </div>

      {showFilePrompt && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1e1e1e] border border-[#333333] rounded-xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-white mb-2">Create New File</h3>
            <p className="text-[#858585] text-sm mb-4">Enter new file name (e.g., script.js, notes.txt):</p>
            <input
              type="text"
              value={newFileNameInput}
              onChange={(e) => setNewFileNameInput(e.target.value)}
              className="w-full bg-[#2d2d2d] border border-[#3c3c3c] rounded px-3 py-2 text-[#cccccc] focus:outline-none focus:border-[#007acc] mb-6"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleConfirmCreateFile()}
            />
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowFilePrompt(false)}
                className="px-4 py-2 bg-[#2d2d2d] hover:bg-[#3d3d3d] text-[#cccccc] rounded transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmCreateFile}
                className="px-4 py-2 bg-[#007acc] hover:bg-[#005c99] text-white rounded transition-colors shadow-lg"
              >
                Create File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

