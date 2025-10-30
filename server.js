const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

let clients = []; // Store connected clients
let game = {
    state: 'WAITING', // WAITING, IN_PROGRESS, FINISHED
    players: [], // { ws, id, name, totalPayoff, signal }
    playerCount: 0,
    totalRounds: 0,
    currentRound: 0,
    trueValue_V: 0,
    roundBids: [],
    roundWinnerInfo: null,
    log: []
};

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

function logAndBroadcast(message) {
    console.log(message);
    game.log.push(message);
    broadcast({ type: 'log', message });
}

wss.on('connection', ws => {
    const clientId = clients.length + 1;
    ws.clientId = clientId;
    clients.push(ws);
    console.log(`Client ${clientId} connected`);

    // Send current game state to the new client
    ws.send(JSON.stringify({ type: 'gameState', game }));

    ws.on('message', message => {
        const data = JSON.parse(message);
        console.log(`Received message from client ${ws.clientId}:`, data);

        switch (data.type) {
            case 'joinGame':
                handleJoinGame(ws, data.name);
                break;
            // More cases will be added here for other game actions
        }
    });

    ws.on('close', () => {
        console.log(`Client ${ws.clientId} disconnected`);
        clients = clients.filter(client => client !== ws);
        // Handle player disconnection during a game
        const playerIndex = game.players.findIndex(p => p.ws === ws);
        if (playerIndex > -1) {
            const disconnectedPlayer = game.players[playerIndex];
            game.players.splice(playerIndex, 1);
            logAndBroadcast(`${disconnectedPlayer.name} has left the game.`);
            broadcast({ type: 'playerUpdate', players: game.players });
        }
    });
});

function handleJoinGame(ws, name) {
    if (game.state !== 'WAITING') {
        ws.send(JSON.stringify({ type: 'error', message: 'Game is already in progress.' }));
        return;
    }
    if (game.players.some(p => p.ws === ws)) {
        ws.send(JSON.stringify({ type: 'error', message: 'You have already joined.' }));
        return;
    }

    const player = {
        ws: ws,
        id: game.players.length + 1,
        name: name || `Player ${game.players.length + 1}`,
        totalPayoff: 0,
        signal: 0
    };
    game.players.push(player);
    ws.playerId = player.id;

    logAndBroadcast(`${player.name} has joined the game.`);
    broadcast({ type: 'playerUpdate', players: game.players });
}


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
