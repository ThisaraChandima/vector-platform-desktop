# Vector Platform - Desktop App

Vector is a comprehensive desktop platform built for capstone students and faculty administrators. It allows students to collaborate in teams, manage tasks, participate in open-source AI-analyzed meetings, and work in a secure integrated coding environment. 

This desktop app is built using **React, Vite, Tailwind CSS, and Electron**.

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/en/) (v18 or higher recommended)
- `npm` (comes with Node.js)
- Git

## Installation

1. Clone or download the repository to your local machine.
2. Navigate to the project directory in your terminal:
   ```bash
   cd vector-platform-desktop
   ```
3. Install the required dependencies:
   ```bash
   npm install
   ```

## Environment Variables

The application relies on Supabase for real-time signaling and backend communication. Create a `.env` file in the root directory (if not already present) and add your keys:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Running the App for Development

To start the app locally and see live code changes:

```bash
npm run dev:electron
```
This single command will:
1. Start the Vite development server for the React UI.
2. Launch the Electron desktop window.
3. Automatically reload the window when you save changes to the React code.

## Building for Production

When you are ready to distribute the app, you can compile it into standalone installers (`.dmg` for macOS, `.exe` for Windows).

To build installers for **both Mac and Windows**:
```bash
npm run build:all
```

To build for your current operating system only:
```bash
npm run build
```

Once the build is complete, you will find the compiled installers in the `release/` folder.

## Troubleshooting

### macOS App Won't Open (Security Error)
When running the built `.dmg` on macOS, Apple's Gatekeeper might block it because it is not signed with an Apple Developer certificate.

To bypass this error after copying the app to your Applications folder, run this in your terminal:
```bash
xattr -cr /Applications/vector-platform-desktop.app
```
Then, double-click the app in the Applications folder to open it.

### WebRTC / Meeting Issues
The platform uses an open-source, peer-to-peer meeting system (MiroTalk) embedded securely inside the application. No login is required. If the meeting does not connect, ensure that your firewall allows WebRTC connections.

---

## System Architecture & Details

The **Vector Platform** is an intelligent, integrated capstone management desktop application designed for university students and faculty. It streamlines team collaboration, coding environments, and project evaluation using AI.

### 1. Core Technology Stack
- **Frontend Framework:** React 18
- **Build Tool:** Vite
- **Desktop Wrapper:** Electron (provides native system capabilities, like audio extraction)
- **Styling:** Tailwind CSS (with highly customized UI, glassmorphism, and dynamic animations)
- **Database / Realtime:** Supabase (PostgreSQL + WebSockets)
- **External Backend API:** Hosted on Vercel (`vector-platform-two.vercel.app`)

### 2. Main System Modules

#### A. Authentication & Roles
- **Student Role:** Has access to a specific team environment, coding sandbox, task board, and team meetings.
- **Admin/Faculty Role:** Has a birds-eye view of all students, can trigger AI team formation, view meeting transcripts/summaries, and monitor anti-cheat logs.

#### B. Intelligent Dashboards
- **Student Dashboard (`StudentDashboard.jsx`):** 
  - Displays a personalized greeting.
  - Lists the team's current tasks and progress.
  - Subscribes to real-time `Supabase` channels to detect if teammates start a meeting.
- **Admin Dashboard (`AdminDashboard.jsx`):** 
  - Displays system-wide metrics (Total Students, Flagged Teams).
  - Triggers the **AI Team Formation** algorithm to optimally group students based on complementary skills and schedules.
  - Displays flagged issues, such as cheating attempts or toxic behavior detected during meetings.

#### C. Live Collaboration (Meetings)
- **Video Conferencing:** Powered by an open-source `MiroTalk` iframe embed. This requires zero logins and utilizes peer-to-peer WebRTC for highly reliable, fast video streaming.
- **AI Audio Analysis:** While the meeting runs, the Electron app securely records the student's local microphone using `navigator.mediaDevices.getUserMedia()`. 
- **Transcription & Summarization:** When the meeting ends, the audio blob is transcribed via Electron's native APIs and then sent to the Vercel backend, where AI analyzes the participation level, leadership qualities, and flags any concerning interactions.

#### D. Integrated Coding Environment
- **Student Editor (`StudentEditor.jsx`):** 
  - A secure, built-in code editor that allows students to write and execute code inside the platform.
  - It features **Anti-Cheat Monitoring** that logs copy-paste events and suspicious window switching, reporting these directly to the Faculty dashboard.

### 3. Data Flow & Communication

1. **Local State to Database:** Most data operations (fetching students, updating tasks) go through REST calls to the Vercel backend API (`/api/students`, `/api/tasks`), which acts as the middle layer.
2. **Direct Database (Supabase):** The app uses `src/lib/db.js` to directly interface with Supabase for specific reads/writes, ensuring rapid data retrieval.
3. **Real-time Signaling:** Supabase Broadcast channels are used for instant state updates without refreshing. For example, if Student A starts a meeting, a broadcast is sent to `meeting-status-${team.id}`, and Student B's dashboard immediately pops up a "Live Session in Progress" banner.
