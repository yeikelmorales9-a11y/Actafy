import { createContext, useContext, useState, useCallback } from 'react'
import { loadDB, saveDB } from '../lib/helpers'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [db, setDb] = useState(() => loadDB())
  const [username, setUsername] = useState(null)

  const persist = useCallback((newDb) => {
    setDb(newDb)
    saveDB(newDb)
  }, [])

  const user = username ? db.users[username] : null

  const login = (u, p) => {
    const found = db.users[u]
    if (!found) return 'Usuario no encontrado'
    if (found.password !== p) return 'Contraseña incorrecta'
    setUsername(u)
    return null
  }

  const register = (u, p, nombre, nit) => {
    if (!u || !p || !nombre) return 'Usuario, contraseña y nombre son obligatorios'
    if (db.users[u]) return 'Ese usuario ya existe'
    const newDb = {
      ...db,
      users: {
        ...db.users,
        [u]: {
          password: p,
          nombre,
          nit: nit || '',
          representante: '',
          tel: '',
          direccion: '',
          ciudad: '',
          tipo: 'Obra civil',
          logo: null,
          clientes: [],
          catalogo: [],
          aiu: { admin: 10, imprevistos: 3, utilidad: 10 },
          iva: 19,
        },
      },
    }
    persist(newDb)
    setUsername(u)
    return null
  }

  const logout = () => setUsername(null)

  const updateUser = useCallback((data) => {
    if (!username) return
    const newDb = { ...db, users: { ...db.users, [username]: { ...db.users[username], ...data } } }
    persist(newDb)
  }, [db, username, persist])

  return (
    <AuthContext.Provider value={{ user, username, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
