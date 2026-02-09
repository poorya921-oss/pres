// server.js
const fs = require('fs');

let settings = JSON.parse(fs.readFileSync('./settings.json'));
const axios = require('axios');
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
let PUBLIC_PASSWORD = settings.PUBLIC_PASSWORD;
let ADMIN_USERNAME = settings.ADMIN_USERNAME;
let ADMIN_PASSWORD = settings.ADMIN_PASSWORD;

let onlineUsers = {};
let mutedUsers = {}; // username: timestamp

// CONFIG اضافی برای ذخیره تنظیمات ادمین
let serverSettings = {
  chatBgColor: "#f0f2f5",   // رنگ پیش‌فرض چت
  adminPanelBg: "#f5f5f5"   // رنگ پنل ادمین
};


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
  socket.emit('changeChatColor', settings.chatBgColor);  

// وقتی کاربر تازه وصل شد، رنگ‌ها را بفرست
socket.emit('changeChatColor', serverSettings.chatBgColor);
socket.emit('changePanelBg', serverSettings.adminPanelBg);


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

if (data.type === 'changeChatColor') {
  serverSettings.chatBgColor = data.color;  // ذخیره رنگ
  io.emit('changeChatColor', data.color);
}

if (data.type === 'changePanelBg') {
  serverSettings.adminPanelBg = data.color;
  io.emit('changePanelBg', data.color);
}


    if (data.type === 'mute') {
      mutedUsers[data.user] = Date.now() + data.minutes * 60000;
    }

    if (data.type === 'broadcast') {
      io.emit('chat', { user: 'ADMIN', msg: data.msg });
    }

    if (data.type === 'changePasswords') {

  if (data.newAdmin) {
    settings.ADMIN_PASSWORD = data.newAdmin;
    ADMIN_PASSWORD = data.newAdmin;
  }

  if (data.newPublic) {
    settings.PUBLIC_PASSWORD = data.newPublic;
    PUBLIC_PASSWORD = data.newPublic;
  }

  fs.writeFileSync('./settings.json', JSON.stringify(settings, null, 2));
}

    if (data.type === 'changeChatColor') {
  settings.chatBgColor = data.color;
  fs.writeFileSync('./settings.json', JSON.stringify(settings, null, 2));
  io.emit('changeChatColor', data.color);
}

  });

  socket.on('disconnect', () => {
    delete onlineUsers[socket.username];
    io.emit('users', Object.keys(onlineUsers));
  });
});
const PORT = process.env.PORT || 3000;

server.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);

async function fetchMarketData() {
  try {
    // --- بیت‌کوین از Coingecko ---
    const btcRes = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'
    );
    const btcPrice = btcRes.data?.bitcoin?.usd ?? "N/A";

    // --- طلا از یک API رایگان (مثال) ---
    // در صورت نیاز می‌توان API دیگری جایگزین کرد
    let goldPrice = "N/A";
    try {
      const goldRes = await axios.get(
  'https://api.coingecko.com/api/v3/simple/price?ids=gold&vs_currencies=usd'
);
const goldPrice = goldRes.data?.gold?.usd ?? "N/A";

      // نرخ XAU بر حسب دلار
      if (goldRes.data && goldRes.data.rates && goldRes.data.rates.XAU) {
        goldPrice = (1 / goldRes.data.rates.XAU).toFixed(2);
      }
    } catch (err) {
      console.log("Gold API error:", err.message);
    }

    // --- ارسال داده به کلاینت‌ها ---
    io.emit('marketData', {
      gold: goldPrice,
      btc: btcPrice
    });

    console.log(`Market data sent: BTC=${btcPrice}, Gold=${goldPrice}`);

  } catch (error) {
    console.log("Market API error:", error.message);
  }
}

// اجرای اولیه و هر 30 ثانیه
fetchMarketData();
setInterval(fetchMarketData, 30000);
