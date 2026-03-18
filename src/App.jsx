import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import ProtectedRoute from './components/ProtectedRoute'
import Auth from './pages/Auth'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Connect from './pages/Connect'
import Session from './pages/Session'
import Audit from './pages/Audit'
import Directory from './pages/Directory'
import AgentProfile from './pages/AgentProfile'

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/connect" element={<Connect />} />
        <Route path="/directory" element={<Directory />} />
        <Route path="/agent/:id" element={<AgentProfile />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/register" element={<ProtectedRoute><Register /></ProtectedRoute>} />
        <Route path="/session/:id" element={<ProtectedRoute><Session /></ProtectedRoute>} />
        <Route path="/audit/:id" element={<ProtectedRoute><Audit /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
