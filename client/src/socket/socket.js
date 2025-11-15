// client/src/socket/socket.js
// Improved Socket.io client manager + React hook
// - Matches server ack-style handlers (accepts { username } payload on user_join)
// - Uses lazy init, avoids duplicate listeners
// - Exposes initSocket/getSocket and a useSocket hook
// - sendMessage/sendPrivateMessage return Promises that resolve when server acks

import { io } from 'socket.io-client'
import { useEffect, useRef, useState } from 'react'

const DEFAULT_SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000'

let socketInstance = null

export function initSocket({ serverUrl = DEFAULT_SERVER, username } = {}) {
  if (socketInstance) return socketInstance

  socketInstance = io(serverUrl, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  })

  // When the socket connects, let the server know who we are (with ack)
  socketInstance.on('connect', () => {
    if (username) {
      // Server expects an object payload { username } and may ack
      socketInstance.emit('user_join', { username }, (ack) => {
        // optional: handle ack (ack === { ok: true, id: ... })
        // console.debug('user_join ack', ack)
      })
    }
  })

  // Basic error logging
  socketInstance.on('connect_error', (err) => {
    console.error('Socket connect_error', err)
  })

  return socketInstance
}

export function getSocket() {
  if (!socketInstance) throw new Error('Socket not initialized. Call initSocket({ username }) first.')
  return socketInstance
}

// Helper that returns a Promise for emits that support an ack callback
function emitWithAck(socket, event, payload, timeout = 5000) {
  return new Promise((resolve, reject) => {
    let called = false
    function onAck(response) {
      called = true
      resolve(response)
    }
    try {
      socket.timeout(timeout).emit(event, payload, (err, res) => {
        // If server uses the socket.io timeout transport, it may call the callback differently.
        // We handle both common callback styles:
        if (err) {
          reject(err)
        } else {
          resolve(res || true)
        }
      })
    } catch (e) {
      // Fallback: use classic emit with ack if available
      try {
        socket.emit(event, payload, onAck)
        // fallback timeout
        setTimeout(() => {
          if (!called) resolve({ ok: false, error: 'ack timeout' })
        }, timeout)
      } catch (err) {
        reject(err)
      }
    }
  })
}

// React hook that wires up socket events and exposes actions/state
export function useSocket({ serverUrl = DEFAULT_SERVER, username } = {}) {
  const [isConnected, setIsConnected] = useState(false)
  const [messages, setMessages] = useState([])
  const [lastMessage, setLastMessage] = useState(null)
  const [users, setUsers] = useState([])
  const [typingUsers, setTypingUsers] = useState([])
  const socketRef = useRef(null)

  useEffect(() => {
    // Initialize socket with optional username
    const s = initSocket({ serverUrl, username })
    socketRef.current = s

    // Connect if not connected
    if (!s.connected) s.connect()

    // Handlers
    function handleConnect() {
      setIsConnected(true)
    }
    function handleDisconnect() {
      setIsConnected(false)
    }
    function handleReceiveMessage(message) {
      setLastMessage(message)
      setMessages((prev) => [...prev, message])
    }
    function handlePrivateMessage(message) {
      setLastMessage(message)
      setMessages((prev) => [...prev, { ...message, private: true }])
    }
    function handleUserList(list) {
      setUsers(list)
    }
    function handleUserJoined(payload) {
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          system: true,
          text: `${payload.username} joined`,
          timestamp: new Date().toISOString(),
        },
      ])
    }
    function handleUserLeft(payload) {
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          system: true,
          text: `${payload.username} left`,
          timestamp: new Date().toISOString(),
        },
      ])
    }
    function handleTypingUsers(list) {
      setTypingUsers(list)
    }

    // Register listeners
    s.on('connect', handleConnect)
    s.on('disconnect', handleDisconnect)
    s.on('receive_message', handleReceiveMessage)
    s.on('private_message', handlePrivateMessage)
    s.on('user_list', handleUserList)
    s.on('user_joined', handleUserJoined)
    s.on('user_left', handleUserLeft)
    s.on('typing_users', handleTypingUsers)

    // Try to load initial messages via HTTP (best-effort)
    fetch((import.meta.env.VITE_SERVER_URL || DEFAULT_SERVER) + '/api/messages')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMessages(data)
        }
      })
      .catch(() => {
        // ignore
      })

    // Cleanup on unmount
    return () => {
      try {
        s.off('connect', handleConnect)
        s.off('disconnect', handleDisconnect)
        s.off('receive_message', handleReceiveMessage)
        s.off('private_message', handlePrivateMessage)
        s.off('user_list', handleUserList)
        s.off('user_joined', handleUserJoined)
        s.off('user_left', handleUserLeft)
        s.off('typing_users', handleTypingUsers)
      } catch (e) {
        // ignore
      }
      // do not fully close the socket here if you expect it to persist across pages.
      // If you want to disconnect when the hook unmounts, uncomment next line:
      // s.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl, username]) // re-run if serverUrl or username changes

  // Actions
  const connect = (name) => {
    const s = socketRef.current || initSocket({ serverUrl, username: name })
    if (!s.connected) s.connect()
    if (name) s.emit('user_join', { username: name })
  }

  const disconnect = () => {
    const s = socketRef.current
    if (s && s.connected) s.disconnect()
  }

  // send message with ack; resolves ack object or throws on error
  const sendMessage = async (text, room = null) => {
    const s = socketRef.current
    if (!s) throw new Error('Socket not initialized')
    const payload = { text, room }
    return emitWithAck(s, 'send_message', payload)
  }

  const sendPrivateMessage = async (toSocketId, text) => {
    const s = socketRef.current
    if (!s) throw new Error('Socket not initialized')
    const payload = { to: toSocketId, text }
    return emitWithAck(s, 'private_message', payload)
  }

  const setTyping = (isTyping, room = null) => {
    const s = socketRef.current
    if (!s) return
    s.emit('typing', { isTyping, room })
  }

  return {
    socket: socketRef.current,
    isConnected,
    lastMessage,
    messages,
    users,
    typingUsers,
    connect,
    disconnect,
    sendMessage,
    sendPrivateMessage,
    setTyping,
  }
}

export default initSocket