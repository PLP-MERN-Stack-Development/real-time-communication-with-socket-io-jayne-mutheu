import React, { useEffect, useRef } from 'react'

export default function MessageList({ messages, currentUser, selectedPrivate }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, selectedPrivate])

  return (
    <div className="messages">
      <ul>
        {messages
          .filter((m) => {
            if (m.system) return !selectedPrivate
            if (!selectedPrivate) return !m.private
            if (!m.private) return false
            return m.senderId === selectedPrivate || m.recipientId === selectedPrivate || m.sender === currentUser
          })
          .map((m) => (
            <li key={m.id} className={`message ${m.sender === currentUser ? 'mine' : ''} ${m.system ? 'system' : ''}`}>
              <div className="meta">
                <strong>{m.system ? '' : m.sender}</strong>
                <span className="time">{m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : ''}</span>
              </div>
              <div className="text">{m.text || m.message}</div>
            </li>
          ))}
      </ul>
      <div ref={endRef} />
    </div>
  )
}