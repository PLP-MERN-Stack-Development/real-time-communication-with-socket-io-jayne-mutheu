/**
 * server.js - Main server file for Socket.io chat application
 *
 * Improvements:
 * - Uses socket.data to store per-socket metadata
 * - Uses Map for users
 * - Adds room join/leave support
 * - Adds validation and message ack callbacks
 * - Adds basic HTTP rate limiting and helmet security headers
 * - Configurable max stored messages via environment variable
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Load environment variables
dotenv.config();

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const PORT = process.env.PORT || 5000;
const MAX_STORED_MESSAGES = Number(process.env.MAX_STORED_MESSAGES) || 200;
const MAX_MESSAGE_LENGTH = Number(process.env.MAX_MESSAGE_LENGTH) || 1000;

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json({ limit: '50kb' })); // limit body size
app.use(express.static(path.join(__dirname, 'public')));

// Basic rate limiter for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
});
app.use('/api/', apiLimiter);

// In-memory stores (for demo/assignment; replace with DB for production)
const users = new Map(); // socketId -> { id, username }
const messages = []; // recent messages
const typingUsers = new Map(); // socketId -> username

// Helper to broadcast user list
function broadcastUserList() {
  io.emit('user_list', Array.from(users.values()));
}

// Helper to broadcast typing users
function broadcastTypingUsers() {
  io.emit('typing_users', Array.from(typingUsers.values()));
}

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // When a client provides username and optionally a room to join
  // callback (ack) used to acknowledge
  socket.on('user_join', (payload = {}, callback) => {
    try {
      const username = String(payload.username || 'Anonymous').trim().slice(0, 50);
      if (!username) {
        if (typeof callback === 'function') callback({ ok: false, error: 'Invalid username' });
        return;
      }

      // store username in socket.data
      socket.data.username = username;
      users.set(socket.id, { id: socket.id, username });

      // Optionally join a room
      if (payload.room) {
        const room = String(payload.room);
        socket.join(room);
        socket.data.room = room;
        socket.to(room).emit('user_joined_room', { username, id: socket.id, room });
      }

      // Broadcast globally the updated user list and join event
      broadcastUserList();
      io.emit('user_joined', { username, id: socket.id });

      console.log(`${username} joined (socket=${socket.id})`);
      if (typeof callback === 'function') callback({ ok: true, id: socket.id });
    } catch (err) {
      console.error('user_join error', err);
      if (typeof callback === 'function') callback({ ok: false, error: 'Server error' });
    }
  });

  // Join a room explicitly
  socket.on('join_room', (room, callback) => {
    try {
      if (!room || typeof room !== 'string') {
        if (typeof callback === 'function') callback({ ok: false, error: 'Invalid room' });
        return;
      }
      socket.join(room);
      socket.data.room = room;
      const username = socket.data.username || 'Anonymous';
      socket.to(room).emit('user_joined_room', { username, id: socket.id, room });
      if (typeof callback === 'function') callback({ ok: true });
    } catch (err) {
      console.error('join_room error', err);
      if (typeof callback === 'function') callback({ ok: false, error: 'Server error' });
    }
  });

  // Leave a room
  socket.on('leave_room', (room, callback) => {
    try {
      if (!room || typeof room !== 'string') {
        if (typeof callback === 'function') callback({ ok: false, error: 'Invalid room' });
        return;
      }
      socket.leave(room);
      delete socket.data.room;
      const username = socket.data.username || 'Anonymous';
      socket.to(room).emit('user_left_room', { username, id: socket.id, room });
      if (typeof callback === 'function') callback({ ok: true });
    } catch (err) {
      console.error('leave_room error', err);
      if (typeof callback === 'function') callback({ ok: false, error: 'Server error' });
    }
  });

  // Handle chat messages (global or room if provided)
  // messageData: { text, room? }
  // ack callback: (ack) => {}
  socket.on('send_message', (messageData = {}, ack) => {
    try {
      const text = String(messageData.text || '').trim();
      if (!text) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Empty message' });
        return;
      }
      if (text.length > MAX_MESSAGE_LENGTH) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Message too long' });
        return;
      }

      const sender = socket.data.username || 'Anonymous';
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const timestamp = new Date().toISOString();
      const room = messageData.room || socket.data.room || null;

      const message = {
        id,
        text,
        sender,
        senderId: socket.id,
        timestamp,
        room,
        isPrivate: false,
      };

      // store message
      messages.push(message);
      if (messages.length > MAX_STORED_MESSAGES) messages.shift();

      // emit to room or globally
      if (room) {
        io.to(room).emit('receive_message', message);
      } else {
        io.emit('receive_message', message);
      }

      // acknowledge delivery
      if (typeof ack === 'function') ack({ ok: true, messageId: id, timestamp });
    } catch (err) {
      console.error('send_message error', err);
      if (typeof ack === 'function') ack({ ok: false, error: 'Server error' });
    }
  });

  // Private messages: { to: targetSocketId, text }
  socket.on('private_message', (payload = {}, ack) => {
    try {
      const to = String(payload.to || '').trim();
      const text = String(payload.text || '').trim();
      if (!to || !text) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Invalid payload' });
        return;
      }
      if (!users.has(to)) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Recipient not connected' });
        return;
      }
      const sender = socket.data.username || 'Anonymous';
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const timestamp = new Date().toISOString();
      const message = {
        id,
        text,
        sender,
        senderId: socket.id,
        recipientId: to,
        timestamp,
        isPrivate: true,
      };

      // send to recipient and to sender (so both have the message)
      io.to(to).emit('private_message', message);
      socket.emit('private_message', message);

      if (typeof ack === 'function') ack({ ok: true, messageId: id, timestamp });
    } catch (err) {
      console.error('private_message error', err);
      if (typeof ack === 'function') ack({ ok: false, error: 'Server error' });
    }
  });

  // Typing indicator: { isTyping, room? }
  socket.on('typing', (payload = {}) => {
    try {
      const isTyping = !!payload.isTyping;
      const room = payload.room || socket.data.room || null;
      const username = socket.data.username || 'Anonymous';

      if (isTyping) {
        typingUsers.set(socket.id, username);
      } else {
        typingUsers.delete(socket.id);
      }

      if (room) {
        // send typing users in that room only
        const roomSockets = Array.from(io.sockets.adapter.rooms.get(room) || []);
        const typingInRoom = roomSockets
          .filter((id) => typingUsers.has(id))
          .map((id) => typingUsers.get(id));
        io.to(room).emit('typing_users', typingInRoom);
      } else {
        broadcastTypingUsers();
      }
    } catch (err) {
      console.error('typing error', err);
    }
  });

  // Read receipt for a message: { messageId, room? }
  socket.on('read_message', (payload = {}) => {
    try {
      const messageId = payload.messageId;
      const readerId = socket.id;
      const username = socket.data.username || 'Anonymous';
      if (!messageId) return;
      // broadcast read receipt for that message (could be room scoped)
      const room = payload.room || socket.data.room || null;
      const receipt = { messageId, readerId, username, timestamp: new Date().toISOString() };
      if (room) {
        io.to(room).emit('message_read', receipt);
      } else {
        io.emit('message_read', receipt);
      }
    } catch (err) {
      console.error('read_message error', err);
    }
  });

  // Handle disconnect
  socket.on('disconnect', (reason) => {
    try {
      const meta = users.get(socket.id);
      if (meta) {
        const { username } = meta;
        io.emit('user_left', { username, id: socket.id, reason });
        console.log(`${username} disconnected (socket=${socket.id}) reason=${reason}`);
      } else {
        console.log(`Socket disconnected: ${socket.id} reason=${reason}`);
      }

      users.delete(socket.id);
      typingUsers.delete(socket.id);
      broadcastUserList();
      broadcastTypingUsers();
    } catch (err) {
      console.error('disconnect handler error', err);
    }
  });
});

// API routes
app.get('/api/messages', (req, res) => {
  res.json(messages);
});

app.get('/api/users', (req, res) => {
  res.json(Array.from(users.values()));
});

// Root route
app.get('/', (req, res) => {
  res.send('Socket.io Chat Server is running');
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };