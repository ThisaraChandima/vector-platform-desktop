import { app, BrowserWindow, ipcMain, desktopCapturer, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import os from 'os';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Check if we are in development mode
  const isDev = !app.isPackaged;

  if (isDev) {
    // Load Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Load built index.html
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  // Check for updates (will be ignored if not packaged)
  autoUpdater.checkForUpdatesAndNotify();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Auto Updater Events
autoUpdater.on('update-available', () => {
  console.log('Update available.');
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: 'A new version of Vector Platform has been downloaded. Restart the application to apply the updates.',
    buttons: ['Restart', 'Later']
  }).then((returnValue) => {
    if (returnValue.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handler to get desktop audio sources
ipcMain.handle('get-desktop-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL()
  }));
});

// IPC handler to transcribe audio
ipcMain.handle('transcribe-audio', async (event, arrayBuffer) => {
  try {
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });
    
    const buffer = Buffer.from(arrayBuffer);
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `audio-${Date.now()}.webm`);
    await fs.writeFile(tempFilePath, buffer);

    const fsReadStream = createReadStream(tempFilePath);
    
    const transcription = await groq.audio.transcriptions.create({
      file: fsReadStream,
      model: 'whisper-large-v3',
      response_format: 'json',
      language: 'en',
      temperature: 0,
      prompt: 'This is a university capstone project meeting in English.'
    });

    await fs.unlink(tempFilePath);

    return { success: true, text: transcription.text };
  } catch (error) {
    console.error("Transcription error:", error);
    return { success: false, error: error.message };
  }
});

// IPC handler to analyze meeting transcript
ipcMain.handle('analyze-meeting', async (event, { teamId, transcript }) => {
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are an AI assistant that analyzes student meetings. Read the following meeting transcript and extract the key action items and team participation summary."
        },
        {
          role: "user",
          content: transcript || ""
        }
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      max_completion_tokens: 500,
    });
    
    return { success: true, analysis: completion.choices[0].message.content };
  } catch (error) {
    console.error("Analysis error:", error);
    return { success: false, error: error.message };
  }
});
