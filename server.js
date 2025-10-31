const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

let game = {
    state: 'WAITING', // WAITING, IN_PROGRESS, ROUND_OVER, RESALE, FINISHED
    players: [], // { ws, id, name, isHost, totalPayoff, signal, currentBid }
    hostWs: null,
    totalRounds: 0,
    currentRound: 0,
    trueValue_V: 0,
    roundBids: [],
    roundWinnerInfo: null,
    log: [],
    readyForNextRound: new Set()
};

function broadcast(data, clients = wss.clients) {
    const jsonData = JSON.stringify(data);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(jsonData);
        }
    });
}

function logAndBroadcast(message) {
    const logMessage = `[Round ${game.currentRound}] ${message}`;
    console.log(logMessage);
    game.log.push(logMessage);
    broadcast({ type: 'log', message: logMessage });
}

function getSanitizedPlayers() {
    return game.players.map(({ ws, signal, ...rest }) => rest);
}

wss.on('connection', ws => {
    console.log('Client connected');

    ws.on('message', message => {
        try {
            const data = JSON.parse(message);
            console.log('Received:', data);
            handleMessage(ws, data);
        } catch (error) {
            console.error('Failed to parse message or handle it:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        handleDisconnect(ws);
    });

    // Send current game state to the new client
    ws.send(JSON.stringify({ type: 'gameState', game: { ...game, players: getSanitizedPlayers() } }));
});

function handleMessage(ws, data) {
    const player = game.players.find(p => p.ws === ws);

    switch (data.type) {
        case 'joinGame':
            handleJoinGame(ws, data.name);
            break;
        case 'startGame':
            if (player && player.isHost) handleStartGame();
            break;
        case 'submitBid':
            if (player) handleSubmitBid(player, data.bid);
            break;
        case 'requestNextRound':
            if (player) handleRequestNextRound(player);
            break;
        // Resale logic would be added here
    }
}

function handleJoinGame(ws, name) {
    // Allow joining as a player (provide a name or empty -> server assigns default)
    // Or join as a spectator by providing an empty name. Spectators are not counted as players.
    if (game.state !== 'WAITING') {
        ws.send(JSON.stringify({ type: 'error', message: 'Game is already in progress.' }));
        return;
    }

    // if name is falsy (empty string, null, undefined) -> treat as spectator
    if (!name) {
        ws.isSpectator = true;
        ws.send(JSON.stringify({ type: 'assignSpectator' }));
        logAndBroadcast('A spectator has joined.');
        // send updated public game state (players only)
        ws.send(JSON.stringify({ type: 'gameState', game: { ...game, players: getSanitizedPlayers() } }));
        return;
    }

    if (game.players.some(p => p.ws === ws)) {
        ws.send(JSON.stringify({ type: 'error', message: 'You have already joined.' }));
        return;
    }
    if (game.players.length >= 12) {
        ws.send(JSON.stringify({ type: 'error', message: 'The game is full.' }));
        return;
    }

    const isHost = game.players.length === 0;
    const newPlayer = {
        ws,
        id: game.players.length + 1,
        name: name || `Player ${game.players.length + 1}`,
        isHost,
        totalPayoff: 0,
        signal: 0,
        currentBid: null
    };
    game.players.push(newPlayer);
    if (isHost) game.hostWs = ws;

    ws.send(JSON.stringify({ type: 'assignPlayer', player: { id: newPlayer.id, name: newPlayer.name, isHost: newPlayer.isHost } }));
    
    logAndBroadcast(`${newPlayer.name} has joined the lobby.`);
    broadcast({ type: 'playerUpdate', players: getSanitizedPlayers() });
}

function handleStartGame() {
    if (game.state !== 'WAITING' || game.players.length < 2 || game.players.length > 12) {
        logAndBroadcast('Cannot start game. Need 2-12 players.');
        return;
    }

    game.state = 'IN_PROGRESS';
    game.totalRounds = game.players.length;
    game.currentRound = 0;
    
    logAndBroadcast(`Game starting with ${game.players.length} players!`);
    broadcast({ type: 'gameStart', game: { ...game, players: getSanitizedPlayers() } });

    setTimeout(startNextRound, 1000);
}

function startNextRound() {
    game.currentRound++;
    if (game.currentRound > game.totalRounds) {
        endGame();
        return;
    }

    game.state = 'IN_PROGRESS';
    game.trueValue_V = Math.random() * 100 + 50; // Uniform[50, 150]
    game.roundBids = [];
    game.readyForNextRound.clear();
    
    logAndBroadcast(`Starting Round ${game.currentRound} of ${game.totalRounds}.`);

    // Broadcast public newRound to everyone (no private signals or true value included)
    const { trueValue_V: _, ...publicGameData } = game;
    broadcast({ type: 'newRound', game: { ...publicGameData, players: getSanitizedPlayers() } });

    // Then send private signals individually to each player
    game.players.forEach(p => {
        const error = Math.random() * 40 - 20; // Uniform[-20, 20]
        p.signal = game.trueValue_V + error;
        p.currentBid = null;

        const payload = {
            type: 'privateSignal',
            playerId: p.id,
            privateSignal: p.signal
        };
        if (p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify(payload));
        }
    });
}

function handleSubmitBid(player, bid) {
    if (game.state !== 'IN_PROGRESS' || player.currentBid !== null) {
        return; // Ignore late or duplicate bids
    }
    player.currentBid = bid;
    game.roundBids.push({ playerId: player.id, bid });
    
    logAndBroadcast(`${player.name} has submitted their bid.`);

    if (game.roundBids.length === game.players.length) {
        processBids();
    }
}

function processBids() {
    game.state = 'ROUND_OVER';
    game.roundBids.sort((a, b) => b.bid - a.bid);

    const highestBid = game.roundBids[0].bid;
    const topBidders = game.roundBids.filter(b => b.bid === highestBid);

    let winner;
    if (topBidders.length > 1) {
        // Tie for the highest bid, pick a random winner from the top bidders
        const winnerIndex = Math.floor(Math.random() * topBidders.length);
        const winnerId = topBidders[winnerIndex].playerId;
        winner = game.players.find(p => p.id === winnerId);
    } else {
        // Single highest bidder
        const winnerId = topBidders[0].playerId;
        winner = game.players.find(p => p.id === winnerId);
    }
    
    let payment;
    let resultMessage = `All bids are in. True Value (V) was ${game.trueValue_V.toFixed(2)}.<br>`;
    resultMessage += `Bids (sorted): ${game.roundBids.map(b => b.bid.toFixed(2)).join(', ')}.<br>`;

    if (topBidders.length > 1) {
        // Rule for ties: winner pays their own (highest) bid
        payment = highestBid;
        resultMessage += `Tie for highest bid at ${highestBid.toFixed(2)}! Randomly selected winner.<br>`;
        resultMessage += `<strong>${winner.name} wins the round!</strong> They pay their own bid price: ${payment.toFixed(2)}.<br>`;
    } else {
        // Standard 2nd price rule: winner pays the second highest bid
        const secondHighestBid = game.roundBids.length > 1 ? game.roundBids[1].bid : 0;
        payment = secondHighestBid;
        resultMessage += `<strong>${winner.name} wins the round!</strong> They pay the second-highest price: ${payment.toFixed(2)}.<br>`;
    }
    
    const winnerPayoff = game.trueValue_V - payment;
    winner.totalPayoff += winnerPayoff;
    
    game.roundWinnerInfo = { winner, payment, winnerPayoff };

    resultMessage += `Winner's payoff for this round: ${game.trueValue_V.toFixed(2)} (V) - ${payment.toFixed(2)} (p) = ${winnerPayoff.toFixed(2)}.`;
    
    logAndBroadcast(`Round ${game.currentRound} ended. Winner: ${winner.name}.`);

    broadcast({
        type: 'roundResult',
        result: {
            message: resultMessage,
            trueValue: game.trueValue_V,
            bids: game.roundBids,
            winnerId: winner.id,
            updatedPayoffs: getSanitizedPlayers().map(p => ({ id: p.id, name: p.name, totalPayoff: p.totalPayoff }))
        }
    });
    
    // For now, we skip resale and go to next round button
    setTimeout(() => {
        broadcast({ type: 'showNextRoundButton' });
    }, 1000);
}

function handleRequestNextRound(player) {
    if (game.state !== 'ROUND_OVER' || game.readyForNextRound.has(player.id)) {
        return;
    }
    game.readyForNextRound.add(player.id);
    logAndBroadcast(`${player.name} is ready for the next round.`);

    if (game.readyForNextRound.size === game.players.length) {
        logAndBroadcast('All players are ready. Starting next round...');
        setTimeout(startNextRound, 1000);
    }
}

function endGame() {
    game.state = 'FINISHED';
    logAndBroadcast('The game has ended! Calculating final scores...');
    
    const finalGameState = {
        ...game,
        players: getSanitizedPlayers().sort((a, b) => b.totalPayoff - a.totalPayoff)
    };

    broadcast({ type: 'gameOver', game: finalGameState });
}

function handleDisconnect(ws) {
    const playerIndex = game.players.findIndex(p => p.ws === ws);
    if (playerIndex === -1) return;

    const disconnectedPlayer = game.players[playerIndex];
    game.players.splice(playerIndex, 1);

    logAndBroadcast(`${disconnectedPlayer.name} has disconnected.`);
    
    if (game.state === 'WAITING') {
        if (disconnectedPlayer.isHost && game.players.length > 0) {
            game.players[0].isHost = true;
            game.hostWs = game.players[0].ws;
            logAndBroadcast(`${game.players[0].name} is the new host.`);
        }
        broadcast({ type: 'playerUpdate', players: getSanitizedPlayers() });
    } else {
        // In-game disconnect, could end game or continue, for now we just announce
        // A more robust solution would handle this more gracefully
        if (game.players.length < 2) {
            logAndBroadcast('Not enough players to continue. The game has ended.');
            endGame();
        }
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
