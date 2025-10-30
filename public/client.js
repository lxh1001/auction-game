document.addEventListener('DOMContentLoaded', () => {
    const ws = new WebSocket(`ws://${window.location.host}`);

    // DOM Elements
    const setupSection = document.getElementById('setup-section');
    const gameSection = document.getElementById('game-section');
    const joinForm = document.getElementById('join-form');
    const playerNameInput = document.getElementById('player-name');
    const joinGameBtn = document.getElementById('join-game-btn');
    const lobby = document.getElementById('lobby');
    const playerList = document.getElementById('player-list');
    const startGameBtn = document.getElementById('start-game-btn');

    const gameInfo = document.getElementById('game-info');
    const trueValueSpan = document.getElementById('true-value');
    const currentRoundSpan = document.getElementById('current-round');
    const totalRoundsSpan = document.getElementById('total-rounds');

    const playersSection = document.getElementById('players-section');
    const submitBidsBtn = document.getElementById('submit-bids-btn');

    const roundResultSection = document.getElementById('round-result');
    const resultText = document.getElementById('result-text');
    const nextRoundBtn = document.getElementById('next-round-btn');

    const resaleSection = document.getElementById('resale-section');
    const resaleWinnerName = document.querySelector('.resale-winner-name');
    const resaleYesBtn = document.getElementById('resale-yes-btn');
    const resaleNoBtn = document.getElementById('resale-no-btn');

    const resaleBiddingSection = document.getElementById('resale-bidding-section');
    const resalePlayersSection = document.getElementById('resale-players-section');
    const submitResaleBidsBtn = document.getElementById('submit-resale-bids-btn');
    const resaleResultSection = document.getElementById('resale-result');
    const resaleResultText = document.getElementById('resale-result-text');

    const finalResultSection = document.getElementById('final-result');
    const finalSummary = document.getElementById('final-summary');
    const gameLog = document.getElementById('game-log');

    // Game State
    let localPlayer = { id: null, name: null, isHost: false };

    // WebSocket Handlers
    ws.onopen = () => {
        console.log('Connected to the server.');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Received from server:', data);

        switch (data.type) {
            case 'gameState':
                syncGameState(data.game);
                break;
            case 'playerUpdate':
                updateLobby(data.players);
                break;
            case 'assignPlayer':
                localPlayer = { ...localPlayer, ...data.player };
                joinForm.classList.add('hidden');
                lobby.classList.remove('hidden');
                break;
            case 'gameStart':
                setupSection.classList.add('hidden');
                gameSection.classList.remove('hidden');
                updateGameInfo(data.game);
                break;
            case 'newRound':
                handleNewRound(data.game, data.privateSignal);
                break;
            case 'roundResult':
                handleRoundResult(data.result);
                break;
            case 'resalePhase':
                handleResalePhase(data.winnerName);
                break;
            case 'resaleResult':
                handleResaleResult(data.result);
                break;
            case 'gameOver':
                handleGameOver(data.game);
                break;
            case 'log':
                log(data.message);
                break;
            case 'error':
                alert(`Error: ${data.message}`);
                break;
        }
    };

    ws.onclose = () => {
        console.log('Disconnected from the server.');
        alert('与服务器断开连接。请刷新页面重试。');
    };

    // Event Listeners
    joinGameBtn.addEventListener('click', () => {
        const name = playerNameInput.value.trim();
        if (name) {
            ws.send(JSON.stringify({ type: 'joinGame', name }));
        } else {
            alert('请输入你的名字。');
        }
    });

    startGameBtn.addEventListener('click', () => {
        ws.send(JSON.stringify({ type: 'startGame' }));
    });

    submitBidsBtn.addEventListener('click', () => {
        const bidInput = document.getElementById(`bid-player-${localPlayer.id}`);
        if (!bidInput) {
            alert("错误：找不到您的出价输入框。");
            return;
        }
        const bidValue = parseFloat(bidInput.value);
        if (isNaN(bidValue) || bidValue < 0 || bidValue > 190) {
            alert('您的出价无效。请输入 0 到 190 之间的数字。');
            return;
        }
        ws.send(JSON.stringify({ type: 'submitBid', bid: bidValue }));
        submitBidsBtn.disabled = true;
        log('您已提交出价，请等待其他玩家...');
    });
    
    nextRoundBtn.addEventListener('click', () => {
        ws.send(JSON.stringify({ type: 'requestNextRound' }));
    });

    // UI Update Functions
    function log(message) {
        const p = document.createElement('p');
        p.innerHTML = message; // Server now includes round info
        gameLog.appendChild(p);
        gameLog.scrollTop = gameLog.scrollHeight;
    }

    function syncGameState(game) {
        if (game.state === 'WAITING') {
            updateLobby(game.players);
        } else {
            // Reconnect to a game in progress (simplified)
            setupSection.classList.add('hidden');
            gameSection.classList.remove('hidden');
            updateGameInfo(game);
            // More logic needed here to fully reconstruct the state for the rejoining player
        }
    }

    function updateLobby(players) {
        playerList.innerHTML = '';
        players.forEach(p => {
            const li = document.createElement('li');
            li.textContent = p.name + (p.isHost ? ' (房主)' : '');
            playerList.appendChild(li);
        });

        if (localPlayer.isHost) {
            startGameBtn.disabled = players.length < 2 || players.length > 12;
        }
    }
    
    function updateGameInfo(game) {
        currentRoundSpan.textContent = game.currentRound;
        totalRoundsSpan.textContent = game.totalRounds;
        trueValueSpan.textContent = game.state === 'FINISHED' ? game.trueValue_V.toFixed(2) : '?';
    }

    function handleNewRound(game, privateSignal) {
        updateGameInfo(game);
        playersSection.innerHTML = '';
        game.players.forEach(p => {
            const card = document.createElement('div');
            card.className = 'player-card';
            let signalInfo = '';
            if (p.id === localPlayer.id) {
                signalInfo = `<p><strong>本轮私有信号 (s<sub>${p.id}</sub>):</strong> ${privateSignal.toFixed(2)}</p>
                              <input type="number" id="bid-player-${p.id}" class="bid-input" placeholder="输入你的出价 (0-190)" min="0" max="190">`;
            } else {
                signalInfo = `<p><strong>本轮私有信号 (s<sub>${p.id}</sub>):</strong> ???</p>`;
            }
            card.innerHTML = `
                <h3>${p.name}</h3>
                <p><strong>总收益:</strong> ${p.totalPayoff.toFixed(2)}</p>
                ${signalInfo}
            `;
            playersSection.appendChild(card);
        });

        submitBidsBtn.classList.remove('hidden');
        submitBidsBtn.disabled = false;
        roundResultSection.classList.add('hidden');
        resaleSection.classList.add('hidden');
        resaleBiddingSection.classList.add('hidden');
        resaleResultSection.classList.add('hidden');
        nextRoundBtn.classList.add('hidden');
    }
    
    function handleRoundResult(result) {
        resultText.innerHTML = result.message;
        roundResultSection.classList.remove('hidden');
        submitBidsBtn.classList.add('hidden');
        
        // Update total payoffs displayed on cards
        result.updatedPayoffs.forEach(p => {
            const card = Array.from(playersSection.children).find(c => c.querySelector('h3').textContent === p.name);
            if (card) {
                card.querySelector('p:nth-of-type(1)').innerHTML = `<strong>总收益:</strong> ${p.totalPayoff.toFixed(2)}`;
            }
        });

        // The server will send a 'resalePhase' or 'showNextRoundButton' message next
    }

    function handleResalePhase(winnerName) {
        resaleWinnerName.textContent = winnerName;
        resaleSection.classList.remove('hidden');
        // Logic to show/hide buttons based on whether this client is the winner
        // This needs the server to tell the client if they won
    }

    function handleGameOver(game) {
        gameSection.classList.add('hidden');
        finalResultSection.classList.remove('hidden');
        trueValueSpan.textContent = `${game.trueValue_V.toFixed(2)} (上一轮的价值)`;

        let summary = '<h3>最终排名:</h3><ol>';
        game.players.sort((a, b) => b.totalPayoff - a.totalPayoff).forEach(p => {
            summary += `<li>${p.name}: ${p.totalPayoff.toFixed(2)}</li>`;
        });
        summary += '</ol>';
        finalSummary.innerHTML = summary;
    }
});
