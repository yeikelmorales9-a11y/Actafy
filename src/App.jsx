import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './components/AuthContext'
import AuthScreen, { ResetPasswordForm } from './components/AuthScreen'
import ActaEditor from './components/ActaEditor'
import Settings from './components/Settings'
import HistorialActas from './components/HistorialActas'
import ActafyLogo from './components/ActafyLogo'
import LandingPage from './components/LandingPage'
import { countActas } from './lib/actasDB'

const PLAN_LIMIT   = { gratis: 5 }   // pro y empresarial = sin límite
const PRO_PRICE    = 2990000          // $29,900 COP en centavos
const WOMPI_PUBKEY = import.meta.env.VITE_WOMPI_PUBLIC_KEY || ''

// Genera la URL de checkout de Wompi
function wompiURL(userId) {
  const ref      = `actafy-pro-${userId}`
  const redirect = encodeURIComponent(`${window.location.origin}?payment=success`)
  return (
    `https://checkout.wompi.co/p/` +
    `?public-key=${WOMPI_PUBKEY}` +
    `&currency=COP` +
    `&amount-in-cents=${PRO_PRICE}` +
    `&reference=${ref}` +
    `&redirect-url=${redirect}`
  )
}

function UpgradeModal({ used, limit, onClose, userId }) {
  const hasWompi = !!WOMPI_PUBKEY

  const handlePay = () => {
    if (!hasWompi) {
      alert('Pagos aún no configurados. Escríbenos por WhatsApp para actualizar tu plan.')
      return
    }
    window.location.href = wompiURL(userId)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 18, padding: '40px 32px',
        maxWidth: 440, width: '100%', textAlign: 'center',
        boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
      }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🚀</div>
        <h2 style={{ margin: '0 0 8px', color: '#17365D', fontSize: 22, fontWeight: 800 }}>
          Límite del plan Gratis
        </h2>
        <p style={{ color: '#555', margin: '0 0 6px', lineHeight: 1.6, fontSize: 14 }}>
          Has usado <strong>{used} de {limit} actas</strong> del plan Gratis.
        </p>
        <p style={{ color: '#555', margin: '0 0 24px', lineHeight: 1.6, fontSize: 14 }}>
          Actualiza a <strong>Pro</strong> y crea actas ilimitadas, con logo y exportación completa.
        </p>

        {/* Precio destacado */}
        <div style={{
          background: 'linear-gradient(135deg,#1B3A5C,#2780C0)',
          borderRadius: 12, padding: '18px 24px', marginBottom: 20, color: '#fff',
        }}>
          <div style={{ fontSize: 28, fontWeight: 900 }}>$29.900</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>COP / mes · Cancela cuando quieras</div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
            ✅ Actas ilimitadas &nbsp;·&nbsp; ✅ PDF, Excel y Word &nbsp;·&nbsp; ✅ Logo incluido
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={onClose} style={{
            padding: '11px 22px', borderRadius: 8, border: '1px solid #ddd',
            background: '#f5f5f5', cursor: 'pointer', fontWeight: 600, fontSize: 14,
          }}>
            Ahora no
          </button>
          <button onClick={handlePay} style={{
            padding: '11px 26px', borderRadius: 8, border: 'none',
            background: 'linear-gradient(135deg,#1e5aab,#42ABDE)',
            color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 15,
            boxShadow: '0 4px 14px rgba(66,171,222,0.4)',
          }}>
            Pagar con Wompi →
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#aaa', marginTop: 14 }}>
          🔒 Pago seguro procesado por Wompi · PSE, tarjeta y Nequi
        </p>
      </div>
    </div>
  )
}

// Modal de éxito cuando regresa de Wompi
function PaymentSuccessModal({ onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 18, padding: '40px 32px',
        maxWidth: 400, width: '100%', textAlign: 'center',
        boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
      }}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>🎉</div>
        <h2 style={{ margin: '0 0 8px', color: '#17365D', fontSize: 22, fontWeight: 800 }}>
          ¡Pago recibido!
        </h2>
        <p style={{ color: '#555', lineHeight: 1.6, fontSize: 14, margin: '0 0 24px' }}>
          Tu plan <strong>Pro</strong> se está activando. En unos segundos tendrás actas ilimitadas.
        </p>
        <button onClick={onClose} style={{
          padding: '12px 28px', borderRadius: 8, border: 'none',
          background: 'linear-gradient(135deg,#1e5aab,#42ABDE)',
          color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 15,
        }}>
          Continuar →
        </button>
      </div>
    </div>
  )
}

function AppInner() {
  const { user, userId, logout, passwordRecovery, loading, refreshProfile } = useAuth()
  const [view, setView]               = useState('historial')
  const [editActa, setEditActa]       = useState(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [actasUsed, setActasUsed]     = useState(0)
  const [showPayOk, setShowPayOk]     = useState(false)
  // authMode: null = landing, 'login' | 'register' = formulario
  const [authMode, setAuthMode] = useState(null)

  // Detectar regreso desde Wompi con pago exitoso
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment') === 'success') {
      setShowPayOk(true)
      // Limpiar param de la URL sin recargar
      window.history.replaceState({}, '', window.location.pathname)
      // Refrescar perfil para obtener plan actualizado
      if (userId && refreshProfile) {
        setTimeout(() => refreshProfile(userId), 3000)
      }
    }
  }, [userId])

  // Pantalla de carga mientras Supabase verifica la sesión
  if (loading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        height: '100vh', gap: 20,
      }}>
        <ActafyLogo size={100} showText={true} showSub={false} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--sub)', fontSize: 13 }}>
          <span className="spinner" style={{ borderTopColor: '#42ABDE', borderColor: '#c8e4f4' }} />
          Cargando…
        </div>
      </div>
    )
  }

  // El usuario llegó desde el email de recuperación
  if (passwordRecovery) return <ResetPasswordForm />

  // Sin sesión: mostrar landing o formulario de auth
  if (!user) {
    if (!authMode) {
      return (
        <LandingPage
          onLogin={() => setAuthMode('login')}
          onRegister={() => setAuthMode('register')}
        />
      )
    }
    return <AuthScreen initialMode={authMode} onBack={() => setAuthMode(null)} />
  }

  const goHistorial = () => setView('historial')

  const handleNew = async () => {
    const plan  = user?.plan || 'gratis'
    const limit = PLAN_LIMIT[plan]          // undefined = sin límite
    if (limit !== undefined) {
      try {
        const count = await countActas(userId)
        if (count >= limit) {
          setActasUsed(count)
          setShowUpgrade(true)
          return
        }
      } catch { /* si falla el conteo, dejamos pasar */ }
    }
    setEditActa(null)
    setView('editor')
  }

  const handleEdit = (actaData) => {
    setEditActa(actaData)
    setView('editor')
  }

  const handleLogout = () => { logout(); setAuthMode(null) }

  if (view === 'settings') return <Settings onBack={goHistorial} />

  if (view === 'editor') return (
    <ActaEditor
      key={editActa?.id || 'new'}
      initialForm={editActa?.form}
      actaId={editActa?.id}
      onBack={goHistorial}
      onNew={handleNew}
      onSettings={() => setView('settings')}
      onLogout={handleLogout}
    />
  )

  const plan  = user?.plan || 'gratis'
  const limit = PLAN_LIMIT[plan]

  return (
    <>
      {showPayOk && (
        <PaymentSuccessModal onClose={() => setShowPayOk(false)} />
      )}
      {showUpgrade && (
        <UpgradeModal
          used={actasUsed}
          limit={PLAN_LIMIT.gratis}
          userId={userId}
          onClose={() => setShowUpgrade(false)}
        />
      )}
      <HistorialActas
        onNew={handleNew}
        onEdit={handleEdit}
        onSettings={() => setView('settings')}
        onLogout={handleLogout}
        planLimit={limit}
        userId={userId}
      />
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
