const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    pingInterval: 10000, // ping every 10 seconds
    pingTimeout: 5000,   // wait 5 seconds for a pong response
});

let players = {};
const levelsData = [
    { 
        seed: crypto.randomBytes(32).toString('hex'),
        level: 0,
        name: 'Start',
        width: 10000,
        height: 10000,
        playersVisible: true,
        exits: [{ x: 500, y: 500, targetLevel: 2 }] // Example exit position to level 2
    },
    { 
        seed: crypto.randomBytes(32).toString('hex'),
        level: 1,
        name: 'The Lobby',
        width: 10000,
        height: 10000,
        playersVisible: true,
        exits: [{ x: 500, y: 500, targetLevel: 2 }] // Example exit position to level 2
    },
    { 
        seed: crypto.randomBytes(32).toString('hex'),
        level: 2,
        name: 'Level 2',
        width: 10000,
        height: 10000,
        playersVisible: true,
        exits: [{ x: 10000, y: 10000, targetLevel: 1 }] // Example exit position to level 1
    }
];

app.use(express.static(__dirname + '/public'));

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    socket.emit('levelInfo', levelsData);

    // Send initial player positions to the newly connected player
    socket.emit('updatePlayers', players);

    socket.on('newPlayer', (player) => {
        players[socket.id] = player;
        io.emit('updatePlayers', players);
    });

    socket.on('movePlayer', (player) => {
        if (players[socket.id]) {
            players[socket.id].x = player.x;
            players[socket.id].y = player.y;
            // console.log(player.x)
            // console.log(player.y)
            if (player.x > levelsData[0].width/2) { player.x = levelsData[0].width/2; console.log("x: " +player.x) }
            if (player.x < -levelsData[0].width/2) { player.x = -levelsData[0].width/2; console.log("x: "+player.x) }
            if (player.y > levelsData[0].height/2) {player.y= levelsData[0].height/2; console.log("y: "+player.y) }
            if (player.y < -levelsData[0].height/2) {player.y = -levelsData[0].height/2; console.log("y: "+player.y) }
            io.emit('updatePlayerPosition', { id: socket.id, x: player.x, y: player.y });
        }
    });

    // Handle voice data from client
    socket.on('voiceData', (data) => {
        // Broadcast voice data to nearby players
        const { playerId, voiceData } = data;
        io.emit('voiceData', { playerId, voiceData });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('updatePlayers', players);
        console.log('A user disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
