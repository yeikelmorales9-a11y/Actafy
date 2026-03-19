import { useState } from 'react'
import { AuthProvider, useAuth } from './components/AuthContext'
import AuthScreen, { ResetPasswordForm } from './components/AuthScreen'
import ActaEditor from './components/ActaEditor'
import Settings from './components/Settings'
import HistorialActas from './components/HistorialActas'

function AppInner() {
  const { user, logout, passwordRecovery, loading } = useAuth()
  const [view, setView]       = useState('historial')
  const [editActa, setEditActa] = useState(null)

  // Pantalla de carga mientras Supabase verifica la sesión
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--sub)', fontSize: 13 }}>
        Cargando…
      </div>
    )
  }

  // El usuario llegó desde el email de recuperación
  if (passwordRecovery) return <ResetPasswordForm />

  if (!user) return <AuthScreen />

  const goHistorial = () => setView('historial')

  const handleNew = () => {
    setEditActa(null)
    setView('editor')
  }

  const handleEdit = (actaData) => {
    setEditActa(actaData)
    setView('editor')
  }

  if (view === 'settings') return <Settings onBack={goHistorial} />

  if (view === 'editor') return (
    <ActaEditor
      key={editActa?.id || 'new'}
      initialForm={editActa?.form}
      actaId={editActa?.id}
      onBack={goHistorial}
      onNew={handleNew}
      onSettings={() => setView('settings')}
      onLogout={logout}
    />
  )

  return (
    <HistorialActas
      onNew={handleNew}
      onEdit={handleEdit}
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
