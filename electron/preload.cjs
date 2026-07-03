const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
  transcribeAudio: (arrayBuffer) => ipcRenderer.invoke('transcribe-audio', arrayBuffer),
  analyzeMeeting: (data) => ipcRenderer.invoke('analyze-meeting', data),
});
