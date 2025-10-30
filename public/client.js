document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // Screen elements
    const screens = {
        entry: document.getElementById('entry-screen'),
        waiting: document.getElementById('waiting-room'),
        game: document.getElementById('game-screen'),
        result: document.getElementById('result-screen'),
        final: document.getElementById('final-screen'),
    };

    // Input elements
    const nicknameInput = document.getElementById('nickname-input');
    const createRoomBtn = document.getElementById('create-room-btn');
    const joinRoomBtn = document.getElementById('join-room-btn');
    const roomIdInput = document.getElementById('room-id-input');
    const maxPlayersInput = document.getElementById('max-players-input');
    const roundTimeInput = document.getElementById('round-time-input');
    const startGameBtn = document.getElementById('start-game-btn');
    const bidInput = document.getElementById('bid-input');
    const submitBidBtn = document.getElementById('submit-bid-btn');
    
    // Display elements
    const roomIdDisplay = document.getElementById('room-id-display');
    const roundDisplay = document.getElementById('round-display');
    const playerList = document.getElementById('player-list');
    const hostNicknameDisplay = document.getElementById('host-nickname');
    const currentPlayersDisplay = document.getElementById('current-players');
    const maxPlayersDisplay = document.getElementById('max-players-display');
    const privateSignalDisplay = document.getElementById('private-signal');
    const myScoreDisplay = document.getElementById('my-score');
    const timerDisplay = document.getElementById('timer');
    const gamePlayerList = document.getElementById('game-player-list');
    const bidStatus = document.getElementById('bid-status');
    const resultTitle = document.getElementById('result-title');
    const resultDetails = document.getElementById('result-details');
    const nextRoundTimerDisplay = document.getElementById('next-round-timer');
    const finalRanking = document.getElementById('final-ranking');
    const gameHistoryContainer = document.getElementById('game-history-table-container');

    let myNickname = '';
    let myRoomId = '';
    let myPlayerId = '';
    let roundTimerInterval;
    let nextRoundTimerInterval;

    function showScreen(screenName) {
        Object.values(screens).forEach(s => s.classList.add('hidden'));
        if (screens[screenName]) {
            screens[screenName].classList.remove('hidden');
        }
        document.getElementById('room-info').classList.toggle('hidden', screenName === 'entry');
    }

    function updatePlayerList(players, hostId) {
        playerList.innerHTML = '';
        gamePlayerList.innerHTML = '';
        players.forEach(p => {
            const isHost = p.id === hostId;
            const hostTag = isHost ? ' (房主)' : '';
            if (isHost) hostNicknameDisplay.textContent = p.nickname;
            
            const li = document.createElement('li');
            li.textContent = `${p.nickname}${hostTag}`;
            playerList.appendChild(li);

            const gameLi = document.createElement('li');
            gameLi.dataset.playerId = p.id;
            gameLi.innerHTML = `<span>${p.nickname} (分数: ${p.score.toFixed(2)})</span><span class="status">等待出价...</span>`;
            gamePlayerList.appendChild(gameLi);
        });
        currentPlayersDisplay.textContent = players.length;
    }

    // Event Listeners
    createRoomBtn.addEventListener('click', () => {
        myNickname = nicknameInput.value.trim();
        if (!myNickname) {
            alert('请输入昵称!');
            return;
        }
        const maxPlayers = maxPlayersInput.value;
        const roundTime = roundTimeInput.value;
        socket.emit('createRoom', { nickname: myNickname, maxPlayers, roundTime });
    });

    joinRoomBtn.addEventListener('click', () => {
        myNickname = nicknameInput.value.trim();
        const roomId = roomIdInput.value.trim().toUpperCase();
        if (!myNickname || !roomId) {
            alert('请输入昵称和房间号!');
            return;
        }
        socket.emit('joinRoom', { roomId, nickname: myNickname });
    });
    
    startGameBtn.addEventListener('click', () => {
        socket.emit('startGame', myRoomId);
    });

    submitBidBtn.addEventListener('click', () => {
        const bid = bidInput.value;
        if (bid === '' || parseFloat(bid) < 0 || parseFloat(bid) > 190) {
            alert('请输入一个在 0 到 190 之间的有效出价。');
            return;
        }
        socket.emit('submitBid', { roomId: myRoomId, bid });
        bidInput.disabled = true;
        submitBidBtn.disabled = true;
        bidStatus.textContent = `你已出价: ${bid}`;
    });

    // Socket.IO Handlers
    socket.on('connect', () => {
        myPlayerId = socket.id;
    });

    socket.on('roomCreated', ({ roomId, players }) => {
        myRoomId = roomId;
        roomIdDisplay.textContent = roomId;
        maxPlayersDisplay.textContent = maxPlayersInput.value;
        showScreen('waiting');
        updatePlayerList(players, myPlayerId);
        startGameBtn.classList.remove('hidden');
    });

    socket.on('joinedRoom', ({ roomId, players, hostId }) => {
        myRoomId = roomId;
        roomIdDisplay.textContent = roomId;
        const host = players.find(p => p.id === hostId);
        maxPlayersDisplay.textContent = host ? '?' : players.length; // Placeholder until settings are broadcast
        showScreen('waiting');
        updatePlayerList(players, hostId);
    });
    
    socket.on('playerUpdate', (players) => {
        const hostId = document.getElementById('start-game-btn').classList.contains('hidden') ? null : myPlayerId;
        updatePlayerList(players, hostId || players.find(p=>p.nickname === hostNicknameDisplay.textContent)?.id);
    });

    socket.on('hostUpdate', (hostId) => {
        const host = playerList.querySelector(`li[data-player-id="${hostId}"]`);
        if(host) hostNicknameDisplay.textContent = host.textContent.replace(' (房主)', '');
        if (hostId === myPlayerId) {
            startGameBtn.classList.remove('hidden');
        } else {
            startGameBtn.classList.add('hidden');
        }
    });

    socket.on('error', (message) => {
        alert(`错误: ${message}`);
    });
    
    socket.on('gameStarted', ({ totalRounds }) => {
        maxPlayersDisplay.textContent = totalRounds;
    });

    socket.on('newRound', ({ round, totalRounds, roundTime }) => {
        showScreen('game');
        roundDisplay.textContent = `${round} / ${totalRounds}`;
        bidInput.value = '';
        bidInput.disabled = false;
        submitBidBtn.disabled = false;
        bidStatus.textContent = '';
        privateSignalDisplay.textContent = '-';

        gamePlayerList.querySelectorAll('.status').forEach(s => {
            s.textContent = '等待出价...';
            s.classList.remove('bid-submitted');
        });

        clearInterval(roundTimerInterval);
        let timeLeft = roundTime;
        timerDisplay.textContent = timeLeft;
        roundTimerInterval = setInterval(() => {
            timeLeft--;
            timerDisplay.textContent = timeLeft;
            if (timeLeft <= 0) {
                clearInterval(roundTimerInterval);
            }
        }, 1000);
    });

    socket.on('privateSignal', ({ signal }) => {
        privateSignalDisplay.textContent = signal.toFixed(2);
    });

    socket.on('playerBid', (playerId) => {
        const playerLi = gamePlayerList.querySelector(`li[data-player-id="${playerId}"] .status`);
        if (playerLi) {
            playerLi.textContent = '已出价';
            playerLi.classList.add('bid-submitted');
        }
    });

    socket.on('roundResult', (result) => {
        clearInterval(roundTimerInterval);
        showScreen('result');
        
        const { V, bids, winnerInfo, players } = result;
        const winner = players.find(p => p.id === winnerInfo.winner?.playerId);

        resultTitle.textContent = `第 ${roundDisplay.textContent.split(' / ')[0]} 轮结果`;

        let detailsHtml = `<p><strong>真实价值 (V):</strong> ${V.toFixed(2)}</p>`;
        if (winner) {
            detailsHtml += `
                <p><strong>获胜者:</strong> ${winner.nickname}</p>
                <p><strong>支付价格 (第二高价 b(2)):</strong> ${winnerInfo.payment.toFixed(2)}</p>
                <p><strong>获胜者本轮收益 (V - b(2)):</strong> ${winnerInfo.payoff.toFixed(2)}</p>
            `;
        } else {
            detailsHtml += `<p>无人获胜。</p>`;
        }
        
        detailsHtml += '<h4>所有出价:</h4><table><tr><th>玩家</th><th>出价</th></tr>';
        bids.forEach(bid => {
            const player = players.find(p => p.id === bid.playerId);
            detailsHtml += `<tr><td>${player.nickname}</td><td>${bid.bid.toFixed(2)}</td></tr>`;
        });
        detailsHtml += '</table>';
        
        resultDetails.innerHTML = detailsHtml;

        // Update my score display
        const me = players.find(p => p.id === myPlayerId);
        if (me) myScoreDisplay.textContent = me.score.toFixed(2);

        // Countdown for next round
        clearInterval(nextRoundTimerInterval);
        let nextRoundTime = 15;
        nextRoundTimerDisplay.textContent = nextRoundTime;
        nextRoundTimerInterval = setInterval(() => {
            nextRoundTime--;
            nextRoundTimerDisplay.textContent = nextRoundTime;
            if (nextRoundTime <= 0) {
                clearInterval(nextRoundTimerInterval);
            }
        }, 1000);
    });

    socket.on('gameEnded', (results) => {
        clearInterval(nextRoundTimerInterval);
        showScreen('final');

        finalRanking.innerHTML = '';
        results.players.forEach(p => {
            const li = document.createElement('li');
            li.textContent = `${p.nickname}: ${p.score.toFixed(2)}`;
            finalRanking.appendChild(li);
        });

        let historyTable = '<table><thead><tr><th>轮次</th><th>真实价值 (V)</th>';
        const playerNicknames = results.players.map(p => p.nickname);
        playerNicknames.forEach(nick => historyTable += `<th>${nick} (出价)</th><th>${nick} (信号)</th>`);
        historyTable += '<th>获胜者</th><th>支付价格</th></tr></thead><tbody>';

        Object.keys(results.history).forEach(roundNum => {
            const round = results.history[roundNum];
            const winner = results.players.find(p => p.id === Object.values(round.bids).sort((a,b)=>b-a)[0]?.playerId);
            const winnerBidInfo = round.bids.find(b => b.playerId === winner?.id);
            const winnerNickname = winner ? winner.nickname : "N/A";

            let payment = "N/A";
            if(round.bids.length > 1) {
                payment = round.bids.sort((a,b) => b.bid - a.bid)[1].bid.toFixed(2);
            } else if (round.bids.length === 1) {
                 payment = round.bids[0].bid.toFixed(2);
            }
            
            historyTable += `<tr><td>${roundNum}</td><td>${round.V.toFixed(2)}</td>`;
            results.players.forEach(p => {
                 const bidInfo = round.bids.find(b => b.playerId === p.id);
                 const bidValue = bidInfo ? bidInfo.bid.toFixed(2) : '0.00';
                 const signalValue = round.signals[p.id] ? round.signals[p.id].toFixed(2) : 'N/A';
                 historyTable += `<td>${bidValue}</td><td>${signalValue}</td>`;
            });
            historyTable += `<td>${winnerNickname}</td><td>${payment}</td></tr>`;
        });
        historyTable += '</tbody></table>';
        gameHistoryContainer.innerHTML = historyTable;
    });

    showScreen('entry');
});