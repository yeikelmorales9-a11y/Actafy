import { useState } from 'react'
import { AuthProvider, useAuth } from './components/AuthContext'
import AuthScreen from './components/AuthScreen'
import ActaEditor from './components/ActaEditor'
import Settings from './components/Settings'

function AppInner() {
  const { user, logout } = useAuth()
  const [view, setView] = useState('acta') // 'acta' | 'settings'

  if (!user) return <AuthScreen />

  if (view === 'settings') return <Settings onBack={() => setView('acta')} />

  return (
    <ActaEditor
      onSettings={() => setView('settings')}
      onLogout={logout}
    />
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
