import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import StudentSelect from './pages/StudentSelect';
import StudentDashboard from './pages/StudentDashboard';
import StudentTasks from './pages/StudentTasks';
import Meeting from './pages/Meeting';
import AdminDashboard from './pages/AdminDashboard';
import StudentEditor from './pages/StudentEditor';
import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <Router>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/select-student" element={<StudentSelect />} />
        <Route path="/student" element={<StudentDashboard />} />
        <Route path="/student/tasks" element={<StudentTasks />} />
        <Route path="/student/editor" element={<StudentEditor />} />
        <Route path="/meeting/:id" element={<Meeting />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;
