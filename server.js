const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);

    socket.on('createRoom', ({ nickname, maxPlayers, roundTime }) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomId] = {
            id: roomId,
            hostId: socket.id,
            players: [],
            maxPlayers: parseInt(maxPlayers, 10) || 3,
            roundTime: parseInt(roundTime, 10) || 30,
            gameState: 'waiting',
            currentRound: 0,
            gameData: {}
        };
        socket.join(roomId);
        const player = { id: socket.id, nickname, score: 0 };
        rooms[roomId].players.push(player);

        socket.emit('roomCreated', { roomId, players: rooms[roomId].players });
        console.log(`Room ${roomId} created by ${nickname}`);
    });

    socket.on('joinRoom', ({ roomId, nickname }) => {
        const room = rooms[roomId];
        if (!room) {
            socket.emit('error', '房间不存在');
            return;
        }
        if (room.players.length >= room.maxPlayers) {
            socket.emit('error', '房间已满');
            return;
        }
        if (room.gameState !== 'waiting') {
            socket.emit('error', '游戏已经开始');
            return;
        }

        socket.join(roomId);
        const player = { id: socket.id, nickname, score: 0 };
        room.players.push(player);

        socket.emit('joinedRoom', { roomId, players: room.players, hostId: room.hostId });
        io.to(roomId).emit('playerUpdate', room.players);
        console.log(`${nickname} joined room ${roomId}`);
    });

    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.hostId !== socket.id) return;
        
        room.gameState = 'playing';
        room.currentRound = 0;
        room.totalRounds = room.players.length; // As per rule
        io.to(roomId).emit('gameStarted', { totalRounds: room.totalRounds });
        startNewRound(roomId);
    });

    socket.on('submitBid', ({ roomId, bid }) => {
        const room = rooms[roomId];
        const roundData = room.gameData[room.currentRound];
        if (!room || !roundData || roundData.bids[socket.id]) return;

        roundData.bids[socket.id] = parseFloat(bid);
        const player = room.players.find(p => p.id === socket.id);
        io.to(roomId).emit('playerBid', socket.id); // Notify others that this player has bid

        const allBidsIn = room.players.every(p => roundData.bids[p.id] !== undefined);
        if (allBidsIn) {
            if (roundData.timer) clearTimeout(roundData.timer);
            endRound(roomId);
        }
    });

    socket.on('disconnect', () => {
        console.log(`A user disconnected: ${socket.id}`);
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex > -1) {
                room.players.splice(playerIndex, 1);
                if (room.players.length === 0) {
                    delete rooms[roomId];
                    console.log(`Room ${roomId} closed.`);
                } else {
                    if (room.hostId === socket.id) {
                        room.hostId = room.players[0].id; // New host
                    }
                    io.to(roomId).emit('playerUpdate', room.players);
                    io.to(roomId).emit('hostUpdate', room.hostId);
                }
                break;
            }
        }
    });
});

function startNewRound(roomId) {
    const room = rooms[roomId];
    if (!room || room.currentRound >= room.totalRounds) {
        endGame(roomId);
        return;
    }

    room.currentRound++;
    
    // Game Logic from image
    const V = 50 + Math.random() * 100; // V ~ Uniform[50, 150]
    const signals = {};
    room.players.forEach(player => {
        const epsilon = -20 + Math.random() * 40; // e_i ~ Uniform[-20, 20]
        signals[player.id] = V + epsilon;
    });

    room.gameData[room.currentRound] = {
        V,
        signals,
        bids: {},
    };

    io.to(roomId).emit('newRound', {
        round: room.currentRound,
        totalRounds: room.totalRounds,
        roundTime: room.roundTime
    });

    // Send private signals
    room.players.forEach(player => {
        io.to(player.id).emit('privateSignal', { signal: signals[player.id] });
    });

    // End round after time limit
    room.gameData[room.currentRound].timer = setTimeout(() => {
        endRound(roomId);
    }, room.roundTime * 1000);
}

function endRound(roomId) {
    const room = rooms[roomId];
    if (!room || room.gameState === 'ended') return;

    const roundData = room.gameData[room.currentRound];
    
    // Fill in bids for players who didn't bid
    room.players.forEach(player => {
        if (roundData.bids[player.id] === undefined) {
            roundData.bids[player.id] = 0; // Default bid is 0
        }
    });

    const allBids = Object.entries(roundData.bids).map(([playerId, bid]) => ({ playerId, bid }));
    allBids.sort((a, b) => b.bid - a.bid);

    let winnerInfo = { winner: null, payment: 0, payoff: 0 };

    if (allBids.length > 0) {
        const highestBid = allBids[0].bid;
        const highestBidders = allBids.filter(b => b.bid === highestBid);
        
        // Randomly select one winner if there's a tie
        const winner = highestBidders[Math.floor(Math.random() * highestBidders.length)];
        
        let payment = 0;
        if (allBids.length > 1) {
            // If winner is not the only bidder, payment is the second highest bid.
            // If there's a tie for highest bid, payment is that highest bid.
            payment = allBids[1].bid;
        }

        const payoff = roundData.V - payment;
        winnerInfo = { winner, payment, payoff };
        
        const winnerPlayer = room.players.find(p => p.id === winner.playerId);
        if (winnerPlayer) {
            winnerPlayer.score += payoff;
        }
    }
    
    const roundResult = {
        V: roundData.V,
        bids: allBids,
        winnerInfo,
        players: room.players // with updated scores
    };

    io.to(roomId).emit('roundResult', roundResult);

    // Wait a bit before starting next round
    setTimeout(() => {
        startNewRound(roomId);
    }, 15000); // 15 seconds for result display
}


function endGame(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    room.gameState = 'ended';

    const finalResults = {
        players: room.players.sort((a,b) => b.score - a.score),
        history: room.gameData
    };
    io.to(roomId).emit('gameEnded', finalResults);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});