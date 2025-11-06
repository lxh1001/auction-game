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

    const finalResultSection = document.getElementById('final-result');
    const finalSummary = document.getElementById('final-summary');
    const gameLog = document.getElementById('game-log');

    // Game State
    let localPlayer = { id: null, name: null, isHost: false, isSpectator: false };
    let privateSignalForRound = null;

    // WebSocket Handlers
    ws.onopen = () => {
        console.log('已连接到服务器。');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('从服务器收到:', data);

        switch (data.type) {
            case 'gameState':
                syncGameState(data.game);
                break;
            case 'playerUpdate':
                updateLobby(data.players);
                break;
            case 'assignPlayer':
                localPlayer = { ...localPlayer, ...data.player, isSpectator: false };
                joinForm.classList.add('hidden');
                lobby.classList.remove('hidden');
                break;
            case 'assignSpectator':
                localPlayer.isSpectator = true;
                joinForm.classList.add('hidden');
                lobby.classList.remove('hidden');
                log('您是观众。');
                break;
            case 'gameStart':
                setupSection.classList.add('hidden');
                gameSection.classList.remove('hidden');
                updateGameInfo(data.game);
                break;
            case 'newRound':
                privateSignalForRound = null;
                handleNewRound(data.game);
                break;
            case 'privateSignal':
                if (data.playerId === localPlayer.id) {
                    privateSignalForRound = data.privateSignal;
                    const signalP = document.querySelector(`.player-card[data-player-id='${localPlayer.id}'] .private-signal`);
                    if (signalP) {
                        signalP.innerHTML = `<strong>本轮私有信号 (s<sub>${localPlayer.id}</sub>):</strong> ${privateSignalForRound.toFixed(2)}`;
                    }
                }
                break;
            case 'roundResult':
                handleRoundResult(data.result);
                break;
            case 'showNextRoundButton':
                if (!localPlayer.isSpectator) {
                    nextRoundBtn.classList.remove('hidden');
                }
                break;
            case 'gameOver':
                handleGameOver(data.game);
                break;
            case 'log':
                log(data.message);
                break;
            case 'error':
                alert(`错误: ${data.message}`);
                break;
        }
    };

    ws.onclose = () => {
        console.log('与服务器断开连接。');
        alert('与服务器断开连接。请刷新页面重试。');
    };

    // Event Listeners
    joinGameBtn.addEventListener('click', () => {
        const name = playerNameInput.value.trim();
        ws.send(JSON.stringify({ type: 'joinGame', name: name || null }));
    });

    startGameBtn.addEventListener('click', () => {
        ws.send(JSON.stringify({ type: 'startGame' }));
    });

    submitBidsBtn.addEventListener('click', () => {
        if (localPlayer.isSpectator) return;
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
        bidInput.disabled = true;
        log('您已提交出价，请等待其他玩家...');
    });
    
    nextRoundBtn.addEventListener('click', () => {
        ws.send(JSON.stringify({ type: 'requestNextRound' }));
        nextRoundBtn.classList.add('hidden');
        log('您已准备好下一轮。');
    });

    // UI Update Functions
    function log(message) {
        const p = document.createElement('p');
        p.innerHTML = message;
        gameLog.appendChild(p);
        gameLog.scrollTop = gameLog.scrollHeight;
    }

    function syncGameState(game) {
        if (game.state === 'WAITING') {
            updateLobby(game.players);
        } else {
            setupSection.classList.add('hidden');
            gameSection.classList.remove('hidden');
            updateGameInfo(game);
            handleNewRound(game);
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
        trueValueSpan.textContent = game.state === 'ROUND_OVER' || game.state === 'FINISHED' ? game.trueValue_V.toFixed(2) : '?';
    }

    function handleNewRound(game) {
        updateGameInfo(game);
        playersSection.innerHTML = '';
        
        if (localPlayer.isSpectator) {
            const spectatorView = document.createElement('div');
            spectatorView.innerHTML = '<p>您是观众，正在观看本轮拍卖。</p>';
            playersSection.appendChild(spectatorView);
        }

        game.players.forEach(p => {
            const card = document.createElement('div');
            card.className = 'player-card';
            card.dataset.playerId = p.id;
            let signalInfo = '';
            if (p.id === localPlayer.id) {
                const signalText = privateSignalForRound !== null ? privateSignalForRound.toFixed(2) : '等待信号...';
                signalInfo = `<p class="private-signal"><strong>本轮私有信号 (s<sub>${p.id}</sub>):</strong> ${signalText}</p>
                              <input type="number" id="bid-player-${p.id}" class="bid-input" placeholder="输入你的出价 (0-190)" min="0" max="190">`;
            } else {
                signalInfo = `<p class="private-signal"><strong>本轮私有信号 (s<sub>${p.id}</sub>):</strong> ???</p>`;
            }
            card.innerHTML = `
                <h3>${p.name}</h3>
                <p><strong>总收益:</strong> ${p.totalPayoff.toFixed(2)}</p>
                ${signalInfo}
            `;
            playersSection.appendChild(card);
        });

        if (!localPlayer.isSpectator) {
            submitBidsBtn.classList.remove('hidden');
            submitBidsBtn.disabled = false;
        } else {
            submitBidsBtn.classList.add('hidden');
        }
        
        roundResultSection.classList.add('hidden');
        nextRoundBtn.classList.add('hidden');
    }
    
    function handleRoundResult(result) {
        trueValueSpan.textContent = result.trueValue.toFixed(2);
        resultText.innerHTML = result.message;
        roundResultSection.classList.remove('hidden');
        submitBidsBtn.classList.add('hidden');
        
        result.updatedPayoffs.forEach(p => {
            const card = document.querySelector(`.player-card[data-player-id='${p.id}']`);
            if (card) {
                card.querySelector('p:nth-of-type(1)').innerHTML = `<strong>总收益:</strong> ${p.totalPayoff.toFixed(2)}`;
            }
        });
    }

    function handleGameOver(game) {
        gameSection.classList.add('hidden');
        finalResultSection.classList.remove('hidden');
        
        const finalPayoffs = game.players.sort((a, b) => b.totalPayoff - a.totalPayoff);

        let summary = '<h3>最终排名:</h3><ol>';
        finalPayoffs.forEach(p => {
            summary += `<li>${p.name}: ${p.totalPayoff.toFixed(2)}</li>`;
        });
        summary += '</ol>';
        finalSummary.innerHTML = summary;
    }
});
