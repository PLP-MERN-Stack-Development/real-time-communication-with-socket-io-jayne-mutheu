import React, { useState, useEffect, useRef } from 'react'

export default function MessageInput({ onSend, onTyping }) {
  const [text, setText] = useState('')
  const typingTimeout = useRef(null)

  function submit(e) {
    e && e.preventDefault()
    const t = text.trim()
    if (!t) return
    onSend(t)
    setText('')
    onTyping(false)
  }

  useEffect(() => {
    return () => {
      clearTimeout(typingTimeout.current)
    }
  }, [])

  function handleChange(e) {
    setText(e.target.value)
    onTyping(true)
    clearTimeout(typingTimeout.current)
    typingTimeout.current = setTimeout(() => {
      onTyping(false)
    }, 800)
  }

  return (
    <form className="message-input" onSubmit={submit}>
      <input
        value={text}
        onChange={handleChange}
        placeholder="Type a message and press Enter..."
        autoFocus
      />
      <button type="submit" className="btn">Send</button>
    </form>
  )
}