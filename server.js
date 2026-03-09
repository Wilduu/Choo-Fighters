const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Simple player management
const players = {};
let nextPlayerId = 1;

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);

    // Expect a client type: 'host' or 'controller'
    socket.on('register', (data) => {
        if (data.type === 'host') {
            socket.join('host_room');
            console.log('Host registered');
        } else if (data.type === 'controller') {
            const playerId = nextPlayerId++;
            players[socket.id] = { id: playerId, character: null, name: data.name || `P${playerId}` };
            console.log(`Controller registered as Player ${playerId} (${players[socket.id].name})`);
            socket.emit('assigned_player_id', playerId);
            io.to('host_room').emit('controller_connected', { socketId: socket.id, playerId, name: players[socket.id].name });
        }
    });

    socket.on('character_select', (character) => {
        if (players[socket.id]) {
            players[socket.id].character = character;
            console.log(`Player ${players[socket.id].id} selected ${character}`);
            io.to('host_room').emit('player_selected_character', {
                playerId: players[socket.id].id,
                character
            });
        }
    });

    socket.on('action', (actionType) => {
        if (players[socket.id]) {
            io.to('host_room').emit('player_action', {
                playerId: players[socket.id].id,
                action: actionType // 'dive' or 'kick'
            });
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        if (players[socket.id]) {
            const playerId = players[socket.id].id;
            io.to('host_room').emit('controller_disconnected', { playerId });
            delete players[socket.id];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Host Display: http://localhost:${PORT}`);
    console.log(`Controller: http://<your-local-ip>:${PORT}/controller.html`);
});
