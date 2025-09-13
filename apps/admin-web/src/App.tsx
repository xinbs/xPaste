import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import UserManagement from './pages/UserManagement'
import DeviceManagement from './pages/DeviceManagement'
import ClipboardManagement from './pages/ClipboardManagement'
import SystemMonitoring from './pages/SystemMonitoring'
import Layout from './components/Layout'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import './App.css'

const queryClient = new QueryClient()

function AppContent() {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Login />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/users" element={<UserManagement />} />
        <Route path="/devices" element={<DeviceManagement />} />
        <Route path="/clipboard" element={<ClipboardManagement />} />
        <Route path="/monitoring" element={<SystemMonitoring />} />
      </Routes>
    </Layout>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <AppContent />
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App