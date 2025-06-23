
document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    console.log('test');

    function updateDOM(selector, updates) {
        console.log('test');
        updates.forEach(member => {
            const row = document.querySelector(`${selector}[data-name="${member.name.replace(/[^a-zA-Z0-9]/g, '')}"]`);
            if (row) {
                // Update status
                const statusCell = row.querySelector('.status');
                if (statusCell) statusCell.textContent = member.status;

                // Update timer
                const timerCell = row.querySelector('.timer');
                if (timerCell) {
                    if (['Hospital', 'Jail'].includes(member.status) && member.statusUntil) {
                        const countdown = timerCell.querySelector('.countdown');
                        if (countdown) {
                            countdown.dataset.until = member.statusUntil;
                        } else {
                            timerCell.innerHTML = `<span class="countdown" data-until="${member.statusUntil}"></span>`;
                        }
                    } else {
                        timerCell.textContent = '-';
                    }
                }
            }
        });
    }

    socket.on('factionStatusUpdate', ({ updates, lastUpdated }) => {
        updateDOM('tr', updates);
        document.getElementById('updateTime').textContent = new Date(lastUpdated * 1000).toLocaleTimeString();
    });


    socket.on('enemyStatusUpdate', ({ updates, lastUpdated }) => {
        updates.forEach(member => {
            const safeId = member.name.replace(/[^a-zA-Z0-9]/g, '');
            const row = document.querySelector(`tr[data-name="${safeId}"]`);
            if (!row) return;

            const claimedByCell = row.querySelector('.claimed-by');
            const claimCell = row.querySelector('.claim-action');

            // Clear claim if status changed
            if (claimedByCell && claimedByCell.textContent !== '-' && member.status !== 'Hospital') {
                claimedByCell.textContent = '-';
                if (claimCell) {
                    claimCell.innerHTML = `
                    <form method="POST" action="/auth/claim">
                        <input type="hidden" name="name" value="${member.name}">
                        <button type="submit">Claim</button>
                    </form>
                `;
                }
            }
        });

        updateDOM('tr', updates);
        document.getElementById('updateTime').textContent = new Date(lastUpdated * 1000).toLocaleTimeString();
    });

    socket.on('claimUpdate', ({ name, claimedBy, status, statusUntil }) => {
        const safeId = name.replace(/[^a-zA-Z0-9]/g, '');
        console.log('aapje');
        const row = document.querySelector(`tr[data-name="${safeId}"]`);
        console.log('Received claimUpdate');
        if (!row) return;

        // Update claim cell
        const claimCell = row.querySelector('.claim-action');
        const claimedByCell = row.querySelector('.claimed-by');
        console.log('aapje2');
        if (claimCell) {
            if (claimedBy) {
                claimCell.innerHTML = `
			<form method="POST" action="/auth/cancel-claim">
                        <input type="hidden" name="name" value="${name}">
                        <button type="submit">Cancel</button>
                    </form>
                `;
                if (claimedByCell) claimedByCell.textContent = claimedBy;
            } else {
                claimCell.innerHTML = `
                    <form method="POST" action="/auth/claim">
                        <input type="hidden" name="name" value="${name}">
                        <button type="submit">Claim</button>
                    </form>
                `;
                if (claimedByCell) claimedByCell.textContent = '-';
            }
        }

        // Update status cell
        const statusCell = row.querySelector('.status');
        if (statusCell && status) {
            statusCell.textContent = status;
        }

        // Update timer cell
        const timerCell = row.querySelector('.timer');
        if (timerCell) {
            if (['Hospital', 'Jail'].includes(status) && statusUntil) {
                timerCell.innerHTML = `<span class="countdown" data-until="${statusUntil}"></span>`;
            } else {
                timerCell.textContent = '-';
            }
        }
    });

    function updateCountdowns() {
        const now = Math.floor(Date.now() / 1000);
        document.querySelectorAll('.countdown').forEach(el => {
            const until = parseInt(el.dataset.until, 10);
            const secondsLeft = Math.max(0, until - now);

            const hours = Math.floor(secondsLeft / 3600);
            const minutes = Math.floor((secondsLeft % 3600) / 60);
            const seconds = secondsLeft % 60;

            el.textContent = `${hours}h ${minutes}m ${seconds}s`;

            // If timer just hit 0, refresh enemy data
            if (secondsLeft === 0 && el.closest('tr')?.parentElement?.parentElement?.parentElement?.previousElementSibling?.textContent.includes('Enemy Faction')) {
                fetch('/auth/fetch-enemy-live', { method: 'POST' });
            }
        });
    }

    function updateFactionData() {
        fetch('/auth/fetch-faction-live', { method: 'POST' });
        fetch('/auth/fetch-enemy-live', { method: 'POST' });
        const now = new Date();
        document.getElementById('updateTime').textContent = now.toLocaleTimeString();
    }

    setInterval(updateFactionData, 10000);
    setInterval(updateCountdowns, 1000);
    updateCountdowns();
});
