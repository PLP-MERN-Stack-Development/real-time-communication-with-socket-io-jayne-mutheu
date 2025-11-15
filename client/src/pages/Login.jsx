import React, { useState } from 'react'

export default function Login({ onLogin }) {
  const [name, setName] = useState('')

  function submit(e) {
    e && e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onLogin(trimmed)
  }

  return (
    <div className="centered">
      <form className="login-card" onSubmit={submit}>
        <h2>Welcome to Socket Chat</h2>
        <input
          maxLength={50}
          placeholder="Enter a display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn">Join Chat</button>
      </form>
    </div>
  )
}