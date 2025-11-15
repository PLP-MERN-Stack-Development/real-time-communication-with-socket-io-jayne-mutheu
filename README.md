# Real-Time Chat Application with Socket.io

A minimal, extensible real-time chat application built with:
- Server: Node.js + Express + Socket.io
- Client: React + Vite + socket.io-client

This README describes the project structure, how to run the app locally, environment variables, the socket event contract, common usage patterns, and suggestions for extending or deploying the app.

---

## Table of contents
- Project overview
- Features
- Project structure
- Requirements
- Environment variables
- Install & run (server & client)
- REST API endpoints
- Socket events (server ⇄ client contract)
- Client usage examples (init & hook)
- Dev & production notes
- Optional enhancements
- Troubleshooting
- License

---

## Project overview
This repository contains two parts:
- `server/` — an Express server exposing HTTP endpoints and a Socket.io server that handles real-time events (user presence, messaging, typing indicators, private messages, rooms, read receipts).
- `client/` — a React app (Vite) that connects to the Socket.io server, presents a UI for login, global chat, private messaging, typing indicators, and a user list.

The app uses an in-memory store for demo/demo-assignment purposes. Replace in-memory storage with a DB (e.g., MongoDB) for persistence in production.

---

## Features
- Real-time global chat
- Username-based authentication (simple)
- Presence: online user list, join/leave notifications
- Typing indicator
- Private (1:1) messaging
- Rooms (join/leave)
- Read receipts (message_read / read_message)
- HTTP endpoints to fetch recent messages and users

---

## Project structure
```
socketio-chat/
├── client/                 # React front-end (Vite)
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── socket/
│   ├── package.json
│   └── vite.config.js
├── server/                 # Node.js back-end
│   ├── config/
│   ├── controllers/
│   ├── socket/
│   ├── utils/
│   ├── server.js
│   └── package.json
└── README.md
```

---

## Requirements
- Node.js v18+ (recommended)
- npm or yarn
- Modern browser for client

---

## Environment variables

Server (`server/.env`):
```
PORT=5000
CLIENT_URL=http://localhost:5173
MAX_STORED_MESSAGES=200
MAX_MESSAGE_LENGTH=1000
NODE_ENV=development
JWT_SECRET=change_this_to_a_strong_secret   # optional - only if JWT auth added
```

Client (`client/.env` or client/.env.local`):
```
VITE_SERVER_URL=http://localhost:5000
```

---

## Install & run

1. Clone the repo and open two shells / terminals.

2. Server
```bash
cd server
npm install
# development
npm run dev   # (nodemon server.js)
# or production
npm start
```

3. Client
```bash
cd client
npm install
npm run dev   # (Vite dev server, default port 5173)
```

4. Open the client in your browser: http://localhost:5173 (or the Vite-provided URL). Connect with a display name and test in multiple tabs/devices.

---

## REST API endpoints (server)
- GET /api/messages — returns the recent in-memory messages array
- GET /api/users — returns the current connected users

These endpoints are lightweight helpers for client initial state hydration. In production, persist messages in DB and support pagination.

---

## Socket event contract (high-level)

Client → Server events
- `user_join` — payload: { username, room? } — (server may ack with { ok: true, id })
- `join_room` — payload: roomName (string) — ack: { ok: true | false }
- `leave_room` — payload: roomName (string) — ack: { ok: true | false }
- `send_message` — payload: { text, room? } — ack: { ok: true, messageId, timestamp } or error
- `private_message` — payload: { to: socketId, text } — ack: { ok: true, messageId, timestamp } or error
- `typing` — payload: { isTyping: boolean, room?: string }
- `read_message` — payload: { messageId, room?: string }

Server → Client events
- `user_list` — payload: Array<{ id, username }>
- `user_joined` — payload: { username, id }
- `user_left` — payload: { username, id, reason? }
- `user_joined_room` / `user_left_room` — payload: { username, id, room }
- `receive_message` — payload: { id, text, sender, senderId, timestamp, room?, isPrivate: false }
- `private_message` — payload: { id, text, sender, senderId, recipientId, timestamp, isPrivate: true }
- `typing_users` — payload: Array<username> (or per-room typing lists)
- `message_read` — payload: { messageId, readerId, username, timestamp }

Notes:
- Many server handlers support ack callbacks. The client should pass a callback to receive acknowledgment or use timeouts.
- Room-scoped emits use `io.to(room).emit(...)` on the server so clients in that room receive room events.

---

## Client usage examples

Minimal init (global):
```js
// client/src/socket/socket.js (example)
import { initSocket, getSocket } from './socket'

initSocket({ serverUrl: import.meta.env.VITE_SERVER_URL, username: 'Alice' })
const socket = getSocket()
socket.connect()

// send message with ack
socket.emit('send_message', { text: 'Hello world' }, (ack) => {
  if (ack && ack.ok) console.log('delivered', ack.messageId)
})
```

Using the provided React hook:
```jsx
import { useSocket } from './socket/socket'

function Chat({ username }) {
  const { messages, users, sendMessage, sendPrivateMessage, setTyping } = useSocket({ username })

  // send public message
  await sendMessage('Hello everyone!')

  // send private message by socket id
  await sendPrivateMessage('target-socket-id', 'Hey there!')

  // typing indicator
  setTyping(true)
}
```

---

## Development notes & recommendations
- In-memory stores (Map/array) are fine for demos but not for production. Add a DB (MongoDB + Mongoose, Postgres) and persist messages, users, rooms, and read receipts.
- For authentication, implement JWT login endpoints and validate the token during the socket handshake (or use cookie-based sessions).
- Limit message size and sanitize inputs both on server and client.
- Use namespaces or dedicated rooms to scale large deployments. Configure Redis adapter for Socket.io to scale across multiple server instances.
- Add proper CORS origins, rate limiting, and helmet headers (server side) — already included in the example server.

---

## Optional enhancements (priorities)
- Persist messages and implement pagination on /api/messages
- Upload and serve images/files (multer + storage like S3)
- Delivery and read receipts UI (client + server)
- Message reactions (emoji)
- Browser notifications (Notification API)
- End-to-end encryption (for private messages)
- Add automated tests and a CI workflow

---

## Troubleshooting
- Client can't connect:
  - Confirm VITE_SERVER_URL matches server listening address and port.
  - Check server console for CORS errors or socket connection errors.
  - If using Docker, ensure ports are exposed and host is reachable.
- Reconnection attempts exhausted:
  - Check server-side logs; increase reconnectionAttempts or enable `autoConnect: true` depending on your flow.
- Duplicate listeners / memory leak:
  - Ensure your React components unsubscribe socket events on unmount. Use `socket.off(...)` or component cleanup in useEffect.

---

## Security & production checklist
- Replace in-memory stores with persistent DB
- Use HTTPS / secure WebSocket (wss://) in production
- Use strong JWT secret and token expiration if you enable JWT
- Sanitize and validate all incoming event payloads server-side
- Deploy Socket.io with a horizontal scaling adapter (Redis) when running multiple server instances
- Enable proper logging and monitoring

---

## License
MIT

---

## Acknowledgements
This project was scaffolded to satisfy a Week 5 assignment on real-time communication with Socket.io. It follows Socket.io and React best-practices for an educational/demo-level chat app.
