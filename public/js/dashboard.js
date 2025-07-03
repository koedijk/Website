const socket = io();

socket.on('claimUpdate', ({ tornid, claimedBy }) => {
  const row = document.querySelector(`[data-tornid="${tornid}"]`);
  if (!row) return;
  const claimedByEl = row.querySelector('.claimed-by');
  const buttonEl = row.querySelector('.claim-btn');
  claimedByEl.textContent = claimedBy || '--';
  if (buttonEl) {
    buttonEl.classList.remove('cancel');
    buttonEl.disabled = false;
    if (claimedBy === window.currentUserName) {
      buttonEl.textContent = 'Cancel';
      buttonEl.classList.add('cancel');
    } else if (claimedBy) {
      buttonEl.textContent = 'Claimed';
      buttonEl.disabled = true;
    } else {
      buttonEl.textContent = 'Claim';
    }
  }
});

document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('claim-btn')) {
    const button = e.target;
    const tornid = button.getAttribute('data-tornid');

    try {
      const response = await fetch('/auth/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tornid })
      });

      const result = await response.json();

      if (response.ok) {
        const row = document.querySelector(`[data-tornid="${tornid}"]`);
        const claimedByEl = row.querySelector('.claimed-by');

        if (result.claimedBy) {
          claimedByEl.textContent = result.claimedBy;
          button.textContent = 'Cancel';
        } else {
          claimedByEl.textContent = '--';
          button.textContent = 'Claim';
        }
      } else {
        alert(result.error || 'Failed to claim');
      }
    } catch (err) {
      console.error('Claim request failed:', err);
      alert('Error claiming enemy');
    }
  }
});

async function fetchAndUpdateEnemyStatus() {
  const currentUserName = window.currentUserName;

  try {
    const response = await fetch('/auth/enemy-status');
    const data = await response.json();
    const members = data.enemyMembers;

    members.forEach(member => {
    const now = Math.floor(Date.now() / 1000);
      const row = document.querySelector(`[data-tornid="${member.tornid}"]`);
      if (!row) return;

      const statusEl = row.querySelector('.status');
      const timerEl = row.querySelector('.timer');
      const claimedByEl = row.querySelector('.claimed-by');
      const buttonEl = row.querySelector('.claim-btn');

      // Update status
      if (statusEl && statusEl.textContent !== member.status) {
        statusEl.textContent = member.status;
        statusEl.className = 'status';
        if (member.status === 'Okay') {
          statusEl.classList.add('status-okay');
        } else if (member.status.includes('Hospital')) {
          statusEl.classList.add('status-hospital');
        } else {
          statusEl.classList.add('status-other');
        }
      }

      // Update timer
      if (timerEl && parseInt(timerEl.getAttribute('data-until'), 10) !== member.statusUntil) {
        timerEl.setAttribute('data-until', member.statusUntil);
      }

      // Update claimedBy
      if (claimedByEl && claimedByEl.textContent !== (member.claimedBy || '--')) {
        claimedByEl.textContent = member.claimedBy || '--';
      }

      // Update claim button
    const isTooEarly = member.statusUntil && (member.statusUntil - now > 300);
    const isTraveling = member.statusState === 'Traveling';
    const isUnavailable = isTooEarly || isTraveling;
      if (buttonEl) {
        buttonEl.classList.remove('cancel');
        buttonEl.style.display = (isUnavailable || (member.claimedBy && member.claimedBy !== currentUserName)) ? 'none' : '';
        if (member.claimedBy === currentUserName) {
          buttonEl.textContent = 'Cancel';
          buttonEl.classList.add('cancel');
        } else if (member.claimedBy) {
          buttonEl.textContent = 'Claimed';
          buttonEl.disabled = true;
        } else {
          buttonEl.textContent = 'Claim';
        }
      }
    });

    updateTimers();
  } catch (error) {
    console.error('[Polling] Failed to fetch enemy status:', error);
  }
}


function updateTimers() {
  const timers = document.querySelectorAll('.timer');
  const now = Math.floor(Date.now() / 1000);

  timers.forEach(timer => {
    const until = parseInt(timer.getAttribute('data-until'), 10);
    if (!until || isNaN(until)) {
      timer.textContent = '--';
      return;
    }

    let secondsLeft = until - now;
    if (secondsLeft <= 0) {
      timer.textContent = 'Expired';
      return;
    }

    const hours = Math.floor(secondsLeft / 3600);
    const minutes = Math.floor((secondsLeft % 3600) / 60);
    const seconds = secondsLeft % 60;

    timer.textContent = `${hours}h ${minutes}m ${seconds}s`;
  });
}

function updateClock() {
  const now = new Date();
  const formatted = now.toLocaleTimeString();
  const updateTimeEl = document.getElementById('updateTime');
  if (updateTimeEl) {
    updateTimeEl.textContent = formatted;
  }
}

setInterval(() => {
  updateTimers();
  //updateClock();
}, 1000);

setInterval(() => {
  fetchAndUpdateEnemyStatus();
  updateClock();
} , 10000); // every 10 seconds


window.onload = () => {
  updateTimers();
  fetchAndUpdateEnemyStatus();
  updateClock();
};

