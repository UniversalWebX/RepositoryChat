const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));
app.use(express.json());

const USERS_FILE = path.join(__dirname, 'users.json');
let users = {};

if (fs.existsSync(USERS_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
} else {
    fs.writeFileSync(USERS_FILE, JSON.stringify({}));
}

app.post('/signup', (req, res) => {
    const { username, password } = req.body;
    if (users[username]) {
        return res.json({ success: false, message: 'User already exists' });
    }
    users[username] = { password, isAdmin: Object.keys(users).length === 0 }; // First user is admin
    fs.writeFileSync(USERS_FILE, JSON.stringify(users));
    res.json({ success: true, message: 'Signed up successfully' });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (users[username] && users[username].password === password) {
        res.json({ success: true, message: 'Logged in successfully' });
    } else {
        res.json({ success: false, message: 'Invalid credentials' });
    }
});

const rooms = {}; // { room: { users: [], messages: [] } }

io.on('connection', (socket) => {
    socket.on('join', (data) => {
        const { username, room } = data;
        if (!rooms[room]) {
            rooms[room] = { users: [], messages: [] };
        }
        if (!rooms[room].users.includes(username)) {
            rooms[room].users.push(username);
        }
        socket.join(room);
        socket.username = username;
        socket.currentRoom = room;
        io.to(room).emit('user joined', { username });
        // Send existing messages
        socket.emit('load messages', { messages: rooms[room].messages });
    });

    socket.on('leave', (data) => {
        const { username, room } = data;
        if (rooms[room]) {
            rooms[room].users = rooms[room].users.filter(u => u !== username);
            io.to(room).emit('user left', { username });
        }
    });

    socket.on('message', (data) => {
        const { username, room, message } = data;
        if (rooms[room]) {
            const msgData = { username, message, timestamp: Date.now() };
            rooms[room].messages.push(msgData);
            io.to(room).emit('message', msgData);
        }
    });

    socket.on('create-group', (data) => {
        const { username, groupName } = data;
        const room = `group_${groupName.toLowerCase().replace(/\s+/g, '_')}`;
        if (!rooms[room]) {
            rooms[room] = { users: [username], messages: [] };
            io.emit('group created', { room, displayName: groupName });
        }
    });

    socket.on('disconnect', () => {
        if (socket.username && socket.currentRoom) {
            socket.emit('leave', { username: socket.username, room: socket.currentRoom });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
