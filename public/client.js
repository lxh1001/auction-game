document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const setupSection = document.getElementById('setup-section');
    const gameSection = document.getElementById('game-section');
    const playerCountInput = document.getElementById('player-count');
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
    let playerCount = 0;
    let totalRounds = 0;
    let currentRound = 0;
    let players = [];
    let trueValue_V = 0;
    let roundBids = [];
    let roundWinnerInfo = null;

    // Event Listeners
    startGameBtn.addEventListener('click', startGame);
    submitBidsBtn.addEventListener('click', submitBids);
    nextRoundBtn.addEventListener('click', startNextRound);
    resaleYesBtn.addEventListener('click', handleResaleYes);
    resaleNoBtn.addEventListener('click', handleResaleNo);
    submitResaleBidsBtn.addEventListener('click', submitResaleBids);

    function log(message) {
        const p = document.createElement('p');
        p.innerHTML = `[轮次 ${currentRound}] ${message}`;
        gameLog.appendChild(p);
        gameLog.scrollTop = gameLog.scrollHeight;
    }

    function startGame() {
        playerCount = parseInt(playerCountInput.value);
        if (playerCount < 2 || playerCount > 10) {
            alert('参与者人数必须在 2 到 10 之间。');
            return;
        }
        totalRounds = playerCount;
        currentRound = 0;
        
        players = [];
        for (let i = 1; i <= playerCount; i++) {
            players.push({ id: i, name: `参与者 ${i}`, totalPayoff: 0, signal: 0 });
        }

        setupSection.classList.add('hidden');
        gameSection.classList.remove('hidden');
        finalResultSection.classList.add('hidden');
        gameLog.innerHTML = '';

        startNextRound();
    }

    function startNextRound() {
        currentRound++;
        if (currentRound > totalRounds) {
            endGame();
            return;
        }

        // Generate new true value and signals
        trueValue_V = Math.random() * 100 + 50; // Uniform[50, 150]
        players.forEach(p => {
            const error = Math.random() * 40 - 20; // Uniform[-20, 20]
            p.signal = trueValue_V + error;
        });

        updateUIForNewRound();
        log(`新一轮开始。`);
    }

    function updateUIForNewRound() {
        currentRoundSpan.textContent = currentRound;
        totalRoundsSpan.textContent = totalRounds;
        trueValueSpan.textContent = '?';

        playersSection.innerHTML = '';
        players.forEach(p => {
            const card = document.createElement('div');
            card.className = 'player-card';
            card.innerHTML = `
                <h3>${p.name}</h3>
                <p><strong>总收益:</strong> ${p.totalPayoff.toFixed(2)}</p>
                <p><strong>本轮私有信号 (s<sub>${p.id}</sub>):</strong> ${p.signal.toFixed(2)}</p>
                <input type="number" id="bid-player-${p.id}" class="bid-input" placeholder="输入你的出价 (0-190)" min="0" max="190">
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

    function submitBids() {
        roundBids = [];
        let allBidsValid = true;
        for (let i = 1; i <= playerCount; i++) {
            const bidInput = document.getElementById(`bid-player-${i}`);
            const bidValue = parseFloat(bidInput.value);
            if (isNaN(bidValue) || bidValue < 0 || bidValue > 190) {
                alert(`参与者 ${i} 的出价无效。请输入 0 到 190 之间的数字。`);
                allBidsValid = false;
                break;
            }
            roundBids.push({ playerId: i, bid: bidValue });
        }

        if (allBidsValid) {
            submitBidsBtn.disabled = true;
            processBids();
        }
    }

    function processBids() {
        roundBids.sort((a, b) => b.bid - a.bid);

        const highestBid = roundBids[0].bid;
        const secondHighestBid = roundBids[1].bid;
        const topBidders = roundBids.filter(b => b.bid === highestBid);

        let winner;
        if (topBidders.length > 1) {
            // Tie for the highest bid
            const winnerIndex = Math.floor(Math.random() * topBidders.length);
            winner = players.find(p => p.id === topBidders[winnerIndex].playerId);
        } else {
            // Clear winner
            winner = players.find(p => p.id === topBidders[0].playerId);
        }
        
        const payment = secondHighestBid;
        const winnerPayoff = trueValue_V - payment;
        winner.totalPayoff += winnerPayoff;
        
        roundWinnerInfo = { winner, payment, winnerPayoff };

        let resultMessage = `本轮最高出价为 ${highestBid.toFixed(2)}，第二高出价为 ${secondHighestBid.toFixed(2)}。<br>`;
        if (topBidders.length > 1) {
            resultMessage += `出现并列最高出价，随机选择获胜者。<br>`;
        }
        resultMessage += `<strong>获胜者是 ${winner.name}</strong>，支付价格 ${payment.toFixed(2)}。<br>`;
        resultMessage += `获胜者本轮收益: ${trueValue_V.toFixed(2)} (V) - ${payment.toFixed(2)} (b(2)) = ${winnerPayoff.toFixed(2)}。`;
        
        log(`出价结束。获胜者: ${winner.name}, 支付: ${payment.toFixed(2)}, 收益: ${winnerPayoff.toFixed(2)}.`);

        resultText.innerHTML = resultMessage;
        roundResultSection.classList.remove('hidden');
        resaleWinnerName.textContent = winner.name;
        resaleSection.classList.remove('hidden');
        submitBidsBtn.classList.add('hidden');
    }

    function handleResaleYes() {
        log(`${roundWinnerInfo.winner.name} 选择进行转售。`);
        resaleSection.classList.add('hidden');
        resaleBiddingSection.classList.remove('hidden');
        
        resalePlayersSection.innerHTML = '';
        const resaleBidders = players.filter(p => p.id !== roundWinnerInfo.winner.id);
        resaleBidders.forEach(p => {
            const card = document.createElement('div');
            card.className = 'player-card';
            card.innerHTML = `
                <h3>${p.name}</h3>
                <p><strong>总收益:</strong> ${p.totalPayoff.toFixed(2)}</p>
                <input type="number" id="resale-bid-player-${p.id}" class="resale-bid-input" placeholder="输入转售出价" min="0">
            `;
            resalePlayersSection.appendChild(card);
        });
    }

    function handleResaleNo() {
        log(`${roundWinnerInfo.winner.name} 选择不进行转售。`);
        resaleSection.classList.add('hidden');
        showNextRoundButton();
    }

    function submitResaleBids() {
        const resaleBidders = players.filter(p => p.id !== roundWinnerInfo.winner.id);
        let resaleBids = [];
        let allBidsValid = true;

        resaleBidders.forEach(p => {
            const bidInput = document.getElementById(`resale-bid-player-${p.id}`);
            const bidValue = parseFloat(bidInput.value);
            if (isNaN(bidValue) || bidValue < 0) {
                alert(`${p.name} 的出价无效。`);
                allBidsValid = false;
            }
            resaleBids.push({ playerId: p.id, bid: bidValue });
        });

        if (!allBidsValid) return;

        resaleBids.sort((a, b) => b.bid - a.bid);

        let resaleResultMessage = '';
        if (resaleBids.length < 2 || resaleBids[0].bid <= 0) {
            resaleResultMessage = '转售失败，没有有效的出价。原获胜者保留物品。';
            log('转售失败，没有有效出价。');
        } else {
            const resaleHighestBid = resaleBids[0].bid;
            const resaleSecondHighestBid = resaleBids.length > 1 ? resaleBids[1].bid : 0;
            const resaleWinnerId = resaleBids[0].playerId;
            const resaleWinner = players.find(p => p.id === resaleWinnerId);
            const payment = resaleSecondHighestBid;

            // Original winner becomes seller
            const seller = roundWinnerInfo.winner;
            seller.totalPayoff -= roundWinnerInfo.winnerPayoff; // Reverse original payoff
            seller.totalPayoff += (payment - roundWinnerInfo.payment); // Seller's new payoff

            // New winner's payoff
            const newWinnerPayoff = trueValue_V - payment;
            resaleWinner.totalPayoff += newWinnerPayoff;

            resaleResultMessage = `转售成功！<br>
                新获胜者是 <strong>${resaleWinner.name}</strong>，支付价格 ${payment.toFixed(2)}。<br>
                新获胜者收益: ${trueValue_V.toFixed(2)} (V) - ${payment.toFixed(2)} = ${newWinnerPayoff.toFixed(2)}。<br>
                原获胜者 (${seller.name}) 作为卖家，获得 ${payment.toFixed(2)}，其本轮最终收益为 ${payment.toFixed(2)} - ${roundWinnerInfo.payment.toFixed(2)} = ${(payment - roundWinnerInfo.payment).toFixed(2)}。`;
            
            log(`转售成功。新获胜者: ${resaleWinner.name}, 支付: ${payment.toFixed(2)}。卖家(${seller.name})收益: ${(payment - roundWinnerInfo.payment).toFixed(2)}.`);
        }

        resaleResultText.innerHTML = resaleResultMessage;
        resaleBiddingSection.classList.add('hidden');
        resaleResultSection.classList.remove('hidden');
        showNextRoundButton();
    }

    function showNextRoundButton() {
        updatePlayerDisplays();
        if (currentRound < totalRounds) {
            nextRoundBtn.textContent = '进入下一轮';
        } else {
            nextRoundBtn.textContent = '查看最终结果';
        }
        nextRoundBtn.classList.remove('hidden');
    }
    
    function updatePlayerDisplays() {
        players.forEach(p => {
            const card = playersSection.querySelector(`#bid-player-${p.id}`).closest('.player-card');
            if (card) {
                card.querySelector('p:nth-of-type(1)').innerHTML = `<strong>总收益:</strong> ${p.totalPayoff.toFixed(2)}`;
            }
        });
    }

    function endGame() {
        gameSection.classList.add('hidden');
        finalResultSection.classList.remove('hidden');
        trueValueSpan.textContent = `${trueValue_V.toFixed(2)} (游戏结束)`;

        players.sort((a, b) => b.totalPayoff - a.totalPayoff);

        let summary = '<h3>最终排名:</h3><ol>';
        players.forEach(p => {
            summary += `<li>${p.name}: ${p.totalPayoff.toFixed(2)}</li>`;
        });
        summary += '</ol>';
        finalSummary.innerHTML = summary;
        
        log('游戏结束。');
    }
});
