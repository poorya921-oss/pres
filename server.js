const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));

// --- SETTINGS ---
let settings;
try {
  settings = JSON.parse(fs.readFileSync('./settings.json'));
} catch (err) {
  console.log("Settings file missing or invalid. Using defaults.");
  settings = {
    PUBLIC_PASSWORD: "12345678",
    ADMIN_USERNAME: "poorya",
    ADMIN_PASSWORD: "1381@",
    chatBgColor: "#f0f2f5",
    adminPanelBg: "#f5f5f5"
  };
}

let onlineUsers = {};
let mutedUsers = {}; // username: timestamp
let chatHistory = []; // آرایه پیام‌ها
const MAX_MESSAGES = 100; // حداکثر پیام

io.on('connection', (socket) => {

  // ارسال تنظیمات فعلی به کاربر تازه
  socket.emit('changeChatColor', settings.chatBgColor);
  socket.emit('changePanelBg', settings.adminPanelBg);

  socket.on('login', ({ username, password }) => {
    if (username === settings.ADMIN_USERNAME && password === settings.ADMIN_PASSWORD) {
      socket.username = username;
      socket.isAdmin = true;
      onlineUsers[username] = socket.id;
      io.emit('users', Object.keys(onlineUsers));
      socket.emit('loginSuccess', { role: 'admin' });
    } else if (password === settings.PUBLIC_PASSWORD) {
      socket.username = username;
      socket.isAdmin = false;
      onlineUsers[username] = socket.id;
      io.emit('users', Object.keys(onlineUsers));
      socket.emit('loginSuccess', { role: 'user' });
    } else {
      socket.emit('loginError');
    }


  });

// ارسال تاریخچه پیام‌ها به کاربر تازه
chatHistory.forEach(message => {
  socket.emit('chat', message);
});


  socket.on('chat', (msg) => {
  const muteUntil = mutedUsers[socket.username];
  if (muteUntil && Date.now() < muteUntil) return;

  const messageData = { user: socket.username, msg };
  
  // اضافه کردن پیام به تاریخچه
  chatHistory.push(messageData);

  // اگر تعداد پیام‌ها بیشتر از MAX_MESSAGES شد، پیام‌های قدیمی حذف شود
  if (chatHistory.length > MAX_MESSAGES) {
    chatHistory.shift(); // حذف اولین پیام (قدیمی‌ترین)
  }

  // ارسال پیام به همه
  io.emit('chat', messageData);
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

    // تغییر رمزها
    if (data.type === 'changePasswords') {
      if (data.newAdmin) {
        settings.ADMIN_PASSWORD = data.newAdmin;
      }
      if (data.newPublic) {
        settings.PUBLIC_PASSWORD = data.newPublic;
      }
      try {
        fs.writeFileSync('./settings.json', JSON.stringify(settings, null, 2));
      } catch (err) {
        console.log("Failed to save passwords:", err.message);
      }
    }

    // تغییر رنگ چت
    if (data.type === 'changeChatColor') {
      settings.chatBgColor = data.color;
      io.emit('changeChatColor', data.color);
      try { fs.writeFileSync('./settings.json', JSON.stringify(settings, null, 2)); } catch {}
    }

    // تغییر رنگ پنل ادمین
    if (data.type === 'changePanelBg') {
      settings.adminPanelBg = data.color;
      io.emit('changePanelBg', data.color);
      try { fs.writeFileSync('./settings.json', JSON.stringify(settings, null, 2)); } catch {}
    }

  });

  socket.on('disconnect', () => {
    delete onlineUsers[socket.username];
    io.emit('users', Object.keys(onlineUsers));
  });

});

// --- MARKET DATA ---
async function fetchMarketData() {
  try {
    const btcRes = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'
    );
    const btcPrice = btcRes.data?.bitcoin?.usd ?? "N/A";

    io.emit('marketData', {
      gold: "N/A", // چون Gold API نداریم
      btc: btcPrice
    });
  } catch (err) {
    console.log("Market API error:", err.message);
  }
}
fetchMarketData();
setInterval(fetchMarketData, 30000);

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
