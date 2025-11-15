import React, { useEffect, useState, useRef } from 'react'
import { initSocket, getSocket } from '../socket/socket.js'
import MessageList from '../components/MessageList.jsx'
import MessageInput from '../components/MessageInput.jsx'

export default function Chat({ username, onLogout }) {
  const [socketConnected, setSocketConnected] = useState(false)
  const [users, setUsers] = useState([])
  const [messages, setMessages] = useState([])
  const [typingUsers, setTypingUsers] = useState([])
  const [selectedPrivate, setSelectedPrivate] = useState(null)
  const socketRef = useRef(null)

  useEffect(() => {
    const s = initSocket(username)
    socketRef.current = s
    s.connect()

    function addMessage(m) {
      setMessages(prev => {
        const out = [...prev, m]
        return out.slice(-500)
      })
    }

    s.on('connect', () => setSocketConnected(true))
    s.on('disconnect', () => setSocketConnected(false))

    s.on('user_list', (list) => setUsers(list))
    s.on('user_joined', (payload) => {
      addMessage({ id: `sys-${Date.now()}`, text: `${payload.username} joined`, sender: 'System', timestamp: new Date().toISOString(), system: true })
    })
    s.on('user_left', (payload) => {
      addMessage({ id: `sys-${Date.now()}`, text: `${payload.username} left`, sender: 'System', timestamp: new Date().toISOString(), system: true })
    })

    s.on('receive_message', (message) => addMessage(message))
    s.on('private_message', (message) => addMessage({ ...message, private: true }))
    s.on('typing_users', (list) => setTypingUsers(list))

    // load initial messages (optional)
    fetch((import.meta.env.VITE_SERVER_URL || 'http://localhost:5000') + '/api/messages')
      .then((r) => r.json())
      .then((data) => setMessages(data || []))
      .catch(() => {})

    return () => {
      try {
        s.off('connect')
        s.off('disconnect')
        s.off('user_list')
        s.off('user_joined')
        s.off('user_left')
        s.off('receive_message')
        s.off('private_message')
        s.off('typing_users')
      } catch (e) {}
      s.disconnect()
    }
  }, [username])

  function sendMessage(text) {
    const s = getSocket()
    if (selectedPrivate) {
      s.emit('private_message', { to: selectedPrivate, text }, (ack) => {
        // optional ack handling
      })
    } else {
      s.emit('send_message', { text }, (ack) => {
        // optional ack handling
      })
    }
  }

  function sendTyping(isTyping) {
    const s = getSocket()
    s.emit('typing', { isTyping })
  }

  return (
    <div className="chat-root">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <strong>{username}</strong>
            <div className={`status ${socketConnected ? 'online' : 'offline'}`}>{socketConnected ? 'Online' : 'Offline'}</div>
          </div>
          <button className="btn small" onClick={onLogout}>Logout</button>
        </div>

        <h4>Users</h4>
        <ul className="user-list">
          {users.map(u => (
            <li key={u.id} className={u.id === selectedPrivate ? 'selected' : ''}>
              <button className="link-btn" onClick={() => setSelectedPrivate(u.id === selectedPrivate ? null : u.id)}>
                <span className="user-name">{u.username}</span>
                {u.id === selectedPrivate && <span className="badge">Private</span>}
              </button>
            </li>
          ))}
        </ul>

        <div className="typing">
          {typingUsers.length > 0 && <em>{typingUsers.join(', ')} typing...</em>}
        </div>
      </aside>

      <main className="main">
        <MessageList messages={messages} currentUser={username} selectedPrivate={selectedPrivate} />
        <MessageInput onSend={sendMessage} onTyping={sendTyping} />
      </main>
    </div>
  )
}