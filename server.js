// server.js
const fs = require('fs');
const axios = require('axios');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));

// -------- CONFIG --------
const dataFile = './data.json';
const MAX_MESSAGES = 100;

let settings = {
  PUBLIC_PASSWORD: '12345678',
  ADMIN_PASSWORD: '1381@',
};

let chatHistory = [];
let onlineUsers = {}; // { username: { id, ip } }
let mutedUsers = {};  // { username: timestamp }

// -------- Load saved data --------
if (fs.existsSync(dataFile)) {
  try {
    const raw = fs.readFileSync(dataFile);
    const json = JSON.parse(raw);
    settings.PUBLIC_PASSWORD = json.publicPassword || settings.PUBLIC_PASSWORD;
    settings.ADMIN_PASSWORD = json.adminPassword || settings.ADMIN_PASSWORD;
    chatHistory = json.chatHistory || [];
  } catch (e) {
    console.log("Error reading data.json:", e.message);
  }
}

// -------- Save function --------
function saveData() {
  const toSave = {
    publicPassword: settings.PUBLIC_PASSWORD,
    adminPassword: settings.ADMIN_PASSWORD,
    chatHistory
  };
  fs.writeFileSync(dataFile, JSON.stringify(toSave, null, 2));
}

// -------- Socket.IO --------
io.on('connection', (socket) => {

  // ---------- LOGIN ----------
  socket.on('login', ({ username, password }) => {
    let role = null;

    if (username === 'poorya' && password === settings.ADMIN_PASSWORD) {
      socket.username = username;
      socket.isAdmin = true;
      role = 'admin';
    } else if (password === settings.PUBLIC_PASSWORD) {
      socket.username = username;
      socket.isAdmin = false;
      role = 'user';
    } else {
      socket.emit('loginError');
      return;
    }

    onlineUsers[socket.username] = { id: socket.id, ip: socket.handshake.address };

    // Send online users
    io.emit('users', Object.keys(onlineUsers));

    // Send login success
    socket.emit('loginSuccess', { role });

    // Send chat history to newly connected user
    chatHistory.forEach(msg => socket.emit('chat', msg));
  });

  // ---------- CHAT ----------
  socket.on('chat', (msg) => {
    if (!socket.username) return; // only logged-in users
    const muteUntil = mutedUsers[socket.username];
    if (muteUntil && Date.now() < muteUntil) return;

    const messageData = { user: socket.username, msg };
    chatHistory.push(messageData);
    if (chatHistory.length > MAX_MESSAGES) chatHistory.shift();

    saveData(); // save message

    io.emit('chat', messageData);
  });

  // ---------- ADMIN ACTIONS ----------
  socket.on('adminAction', (data) => {
    if (!socket.isAdmin) return;

    if (data.type === 'kick') {
      const userObj = onlineUsers[data.user];
      if (userObj && userObj.id) io.to(userObj.id).disconnectSockets(true);
    }

    if (data.type === 'mute') {
      mutedUsers[data.user] = Date.now() + (data.minutes || 1) * 60000;
    }

    if (data.type === 'broadcast') {
      const messageData = { user: 'ADMIN', msg: data.msg };
      chatHistory.push(messageData);
      if (chatHistory.length > MAX_MESSAGES) chatHistory.shift();
      saveData();
      io.emit('chat', messageData);
    }

    if (data.type === 'changePasswords') {
      if (data.newAdmin) settings.ADMIN_PASSWORD = data.newAdmin;
      if (data.newPublic) settings.PUBLIC_PASSWORD = data.newPublic;
      saveData();
    }

    if (data.type === 'changeChatColor') {
      io.emit('changeChatColor', data.color);
    }

    if (data.type === 'getIPs') {
      const ips = Object.keys(onlineUsers).map(u => ({
        username: u,
        ip: onlineUsers[u].ip
      }));
      socket.emit('userIPs', ips);
    }
  });

  // ---------- DISCONNECT ----------
  socket.on('disconnect', () => {
    if (socket.username) {
      delete onlineUsers[socket.username];
      io.emit('users', Object.keys(onlineUsers));
    }
  });

});

// ---------- MARKET DATA ----------
async function fetchMarketData() {
  try {
    const res = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    const btcPrice = res.data.bitcoin.usd;
    io.emit('marketData', { btc: btcPrice });
  } catch (e) {
    console.log("Market API error:", e.message);
  }
}

setInterval(fetchMarketData, 30000);
fetchMarketData();

// ---------- START SERVER ----------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
