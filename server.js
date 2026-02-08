// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));

// --- CONFIG ---
let PUBLIC_PASSWORD = '12345678';
let ADMIN_USERNAME = 'poorya';
let ADMIN_PASSWORD = '1381@';

let onlineUsers = {};
let mutedUsers = {}; // username: timestamp

io.on('connection', (socket) => {
  socket.on('login', ({ username, password }) => {
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      socket.username = username;
      socket.isAdmin = true;
      onlineUsers[username] = socket.id;
      io.emit('users', Object.keys(onlineUsers));
      socket.emit('loginSuccess', { role: 'admin' });
    } else if (password === PUBLIC_PASSWORD) {
      socket.username = username;
      socket.isAdmin = false;
      onlineUsers[username] = socket.id;
      io.emit('users', Object.keys(onlineUsers));
      socket.emit('loginSuccess', { role: 'user' });
    } else {
      socket.emit('loginError');
    }
  });

  socket.on('chat', (msg) => {
    const muteUntil = mutedUsers[socket.username];
    if (muteUntil && Date.now() < muteUntil) return;
    io.emit('chat', { user: socket.username, msg });
  });

  socket.on('adminAction', (data) => {
    if (!socket.isAdmin) return;

    if (data.type === 'kick') {
      const id = onlineUsers[data.user];
      if (id) io.to(id).disconnectSockets(true);
    }

    if (data.type === 'mute') {
      mutedUsers[data.user] = Date.now() + data.minutes * 60000;
    }

    if (data.type === 'broadcast') {
      io.emit('chat', { user: 'ADMIN', msg: data.msg });
    }

    if (data.type === 'changePasswords') {
      if (data.newAdmin) ADMIN_PASSWORD = data.newAdmin;
      if (data.newPublic) PUBLIC_PASSWORD = data.newPublic;
    }
  });

  socket.on('disconnect', () => {
    delete onlineUsers[socket.username];
    io.emit('users', Object.keys(onlineUsers));
  });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));