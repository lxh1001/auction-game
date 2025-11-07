const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 【修改处】启用反向代理信任
app.set('trust proxy', true);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

let game = {
    state: 'WAITING', // WAITING, IN_PROGRESS, ROUND_OVER, FINISHED
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
    // Prepend round number if the game is in progress
    const logMessage = game.currentRound > 0 ? `[第 ${game.currentRound} 轮] ${message}` : `[大厅] ${message}`;
    console.log(logMessage);
    game.log.push(logMessage);
    broadcast({ type: 'log', message: logMessage });
}

function getSanitizedPlayers() {
    return game.players.map(({ ws, signal, ...rest }) => rest);
}

wss.on('connection', ws => {
    console.log('客户端已连接');

    ws.on('message', message => {
        try {
            const data = JSON.parse(message);
            console.log('收到消息:', data);
            handleMessage(ws, data);
        } catch (error) {
            console.error('解析或处理消息失败:', error);
        }
    });

    ws.on('close', () => {
        console.log('客户端已断开');
        handleDisconnect(ws);
    });

    // 将当前游戏状态发送给新客户端
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
    }
}

function handleJoinGame(ws, name) {
    if (game.state !== 'WAITING') {
        ws.send(JSON.stringify({ type: 'error', message: '游戏已经开始，无法加入。' }));
        return;
    }

    if (!name) {
        ws.isSpectator = true;
        ws.send(JSON.stringify({ type: 'assignSpectator' }));
        logAndBroadcast('一位观众加入了。');
        ws.send(JSON.stringify({ type: 'gameState', game: { ...game, players: getSanitizedPlayers() } }));
        return;
    }

    if (game.players.some(p => p.ws === ws)) {
        ws.send(JSON.stringify({ type: 'error', message: '您已经加入了。' }));
        return;
    }
    if (game.players.length >= 12) {
        ws.send(JSON.stringify({ type: 'error', message: '游戏已满。' }));
        return;
    }

    const isHost = game.players.length === 0;
    const newPlayer = {
        ws,
        id: game.players.length + 1,
        name: name || `玩家 ${game.players.length + 1}`,
        isHost,
        totalPayoff: 0,
        signal: 0,
        currentBid: null
    };
    game.players.push(newPlayer);
    if (isHost) game.hostWs = ws;

    ws.send(JSON.stringify({ type: 'assignPlayer', player: { id: newPlayer.id, name: newPlayer.name, isHost: newPlayer.isHost } }));
    
    logAndBroadcast(`${newPlayer.name} 加入了大厅。`);
    broadcast({ type: 'playerUpdate', players: getSanitizedPlayers() });
}

function handleStartGame() {
    if (game.state !== 'WAITING' || game.players.length < 2 || game.players.length > 12) {
        logAndBroadcast('无法开始游戏。需要 2-12 名玩家。');
        return;
    }

    game.state = 'IN_PROGRESS';
    game.totalRounds = game.players.length;
    game.currentRound = 0;
    
    logAndBroadcast(`游戏开始！共有 ${game.players.length} 名玩家！`);
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
    
    logAndBroadcast(`开始第 ${game.currentRound} / ${game.totalRounds} 轮。`);

    const { trueValue_V: _, ...publicGameData } = game;
    broadcast({ type: 'newRound', game: { ...publicGameData, players: getSanitizedPlayers() } });

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
        return; // 忽略延迟或重复的出价
    }
    player.currentBid = bid;
    game.roundBids.push({ playerId: player.id, bid });
    
    logAndBroadcast(`${player.name} 已提交出价。`);

    if (game.roundBids.length === game.players.length) {
        processBids();
    }
}

function processBids() {
    game.state = 'ROUND_OVER';
    // 出价从高到低排序
    game.roundBids.sort((a, b) => b.bid - a.bid);

    const highestBid = game.roundBids[0].bid;
    const topBidders = game.roundBids.filter(b => b.bid === highestBid);

    // 无论是否平局，都从最高出价者中随机选出一位获胜者
    const winnerIndex = Math.floor(Math.random() * topBidders.length);
    const winnerId = topBidders[winnerIndex].playerId;
    const winner = game.players.find(p => p.id === winnerId);
    
    // 计算中位数价格
    const n = game.players.length;
    let payment;
    let paymentIndex;
    if (n % 2 === 1) { // 奇数个玩家
        paymentIndex = (n + 1) / 2;
    } else { // 偶数个玩家
        paymentIndex = n / 2 + 1;
    }
    // 从排序后的出价中找到中位数价格（数组索引需要-1）
    payment = game.roundBids[paymentIndex - 1].bid;

    // 构建中文结果信息
    let resultMessage = `所有出价已提交。物品真实价值 (V) 是 <strong>${game.trueValue_V.toFixed(2)}</strong>。<br>`;
    resultMessage += `所有出价 (从高到低): ${game.roundBids.map(b => b.bid.toFixed(2)).join(', ')}。<br>`;
    if (topBidders.length > 1) {
        resultMessage += `最高出价 ${highestBid.toFixed(2)} 出现平局！已随机选择获胜者。<br>`;
    }
    resultMessage += `<strong>${winner.name} 获胜!</strong> 支付价格为中位数价格: <strong>${payment.toFixed(2)}</strong>。<br>`;
    
    const winnerPayoff = game.trueValue_V - payment;
    winner.totalPayoff += winnerPayoff;
    
    game.roundWinnerInfo = { winner, payment, winnerPayoff };

    resultMessage += `获胜者本轮收益: ${game.trueValue_V.toFixed(2)} (V) - ${payment.toFixed(2)} (支付价) = <strong>${winnerPayoff.toFixed(2)}</strong>。`;
    
    logAndBroadcast(`第 ${game.currentRound} 轮结束。获胜者: ${winner.name}。`);

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
    
    // 显示进入下一轮的按钮
    setTimeout(() => {
        broadcast({ type: 'showNextRoundButton' });
    }, 1000);
}

function handleRequestNextRound(player) {
    if (game.state !== 'ROUND_OVER' || game.readyForNextRound.has(player.id)) {
        return;
    }
    game.readyForNextRound.add(player.id);
    logAndBroadcast(`${player.name} 已准备好进入下一轮。`);

    if (game.readyForNextRound.size === game.players.length) {
        logAndBroadcast('所有玩家已准备就绪，开始下一轮...');
        setTimeout(startNextRound, 1000);
    }
}

function endGame() {
    game.state = 'FINISHED';
    logAndBroadcast('游戏结束！正在计算最终分数...');
    
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

    logAndBroadcast(`${disconnectedPlayer.name} 已断开连接。`);
    
    if (game.state === 'WAITING') {
        if (disconnectedPlayer.isHost && game.players.length > 0) {
            game.players[0].isHost = true;
            game.hostWs = game.players[0].ws;
            logAndBroadcast(`${game.players[0].name} 成为了新的房主。`);
        }
        broadcast({ type: 'playerUpdate', players: getSanitizedPlayers() });
    } else {
        if (game.players.length < 2) {
            logAndBroadcast('玩家人数不足，游戏已结束。');
            endGame();
        }
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`服务器正在端口 ${PORT} 上运行`);
});
