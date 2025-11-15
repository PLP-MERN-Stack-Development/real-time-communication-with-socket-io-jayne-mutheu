import React, { useState, useEffect } from 'react'
import Login from './pages/Login'
import Chat from './pages/Chat'

export default function App() {
  const [username, setUsername] = useState(() => localStorage.getItem('username') || '')

  useEffect(() => {
    if (username) localStorage.setItem('username', username)
  }, [username])

  return username ? <Chat username={username} onLogout={() => { localStorage.removeItem('username'); setUsername('') }} /> : <Login onLogin={(name) => setUsername(name)} />
}