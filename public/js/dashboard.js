document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

function updateDOM(selector, updates) {
  updates.forEach(member => {
    const safeName = member.name.replace(/[^a-zA-Z0-9]/g, '');
    const row = document.querySelector(`${selector}[data-name="${safeName}"]`);
    if (!row) return;

    // ✅ Update status cell (2nd <td>)
    const statusCell = row.children[1];
    if (statusCell) {
      statusCell.textContent = member.statusState || '-';
      statusCell.className =
        member.statusState === 'Okay'
          ? 'status-okay'
          : member.statusState === 'Hospital'
          ? 'status-hospital'
          : 'status-other';
    }

    // ✅ Update timer cell
    const timerCell = row.querySelector('.timer');
    if (timerCell) {
      if (['Hospital', 'Jail'].includes(member.statusState) && member.statusUntil) {
        timerCell.innerHTML = `<span class="countdown" data-until="${member.statusUntil}"></span>`;
      } else {
        timerCell.innerHTML = '';
        timerCell.textContent = '-';
      }
    }
  });
}


  socket.on('enemyStatusUpdate', ({ updates, lastUpdated }) => {
    updateDOM('tr', updates);
    document.getElementById('updateTime').textContent = new Date(lastUpdated * 1000).toLocaleTimeString();
  });

  socket.on('claimUpdate', ({ name, claimedBy, status, statusUntil }) => {
    const safeId = name.replace(/[^a-zA-Z0-9]/g, '');
    const row = document.querySelector(`tr[data-name="${safeId}"]`);
    if (!row) return;

    const claimCell = row.querySelector('.claim-action');
    const claimedByCell = row.querySelector('.claimed-by');
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

    const statusCell = row.querySelector('.status');
    if (statusCell && status) {
      statusCell.textContent = status;
    }

    const timerCell = row.querySelector('.timer');
    if (timerCell) {
      if (['Hospital', 'Jail'].includes(status) && statusUntil) {
        timerCell.innerHTML = `<span class="countdown" data-until="${statusUntil}"></span>`;
      } else {
        timerCell.innerHTML = '';
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

      if (secondsLeft === 0 && el.closest('tr')?.parentElement?.parentElement?.parentElement?.previousElementSibling?.textContent.includes('Enemy Faction')) {
        fetch('/auth/fetch-enemy-live', { method: 'POST' });
      }
    });
  }

  function updateFactionData() {
    fetch('/auth/fetch-enemy-live', { method: 'POST' })
      .then(res => res.json())
      .then(({ updates, lastUpdated }) => {
        updateDOM('tr', updates);
        document.getElementById('updateTime').textContent = new Date(lastUpdated * 1000).toLocaleTimeString();
      })
      .catch(err => console.error('Failed to fetch enemy data:', err));
  }

  setInterval(updateFactionData, 10000);
  setInterval(updateCountdowns, 1000);
  updateCountdowns();
});


document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('table').forEach(table => {
    const tbody = table.querySelector('tbody');
    const originalRows = Array.from(tbody.querySelectorAll('tr'));
    table.dataset.originalOrder = JSON.stringify(originalRows.map(row => row.outerHTML));
  });

  document.querySelectorAll('th[data-sort]').forEach(header => {
    header.classList.add('sortable');
    header.dataset.sortState = 'none';

    header.addEventListener('click', () => {
      const table = header.closest('table');
      const tbody = table.querySelector('tbody');
      const index = Array.from(header.parentNode.children).indexOf(header);

      // Determine next sort state
      const currentState = header.dataset.sortState;
      //const nextState = currentState === 'none' ? 'asc' : currentState === 'asc' ? 'desc' : 'none';
      const nextState = currentState === 'none' ? 'desc' : currentState === 'desc' ? 'asc' : 'none';

      // Reset all headers except the one clicked
      header.parentNode.querySelectorAll('th').forEach(th => {
        if (th !== header) {
          th.classList.remove('asc', 'desc');
          th.dataset.sortState = 'none';
        }
      });

      // Apply new sort state
      header.dataset.sortState = nextState;
      header.classList.remove('asc', 'desc');
      if (nextState !== 'none') header.classList.add(nextState);

      if (nextState === 'none') {
        // Restore original order
        const originalHTML = JSON.parse(table.dataset.originalOrder);
        tbody.innerHTML = originalHTML.join('');
      } else {
        // Sort rows
        const rows = Array.from(tbody.querySelectorAll('tr'));
        rows.sort((a, b) => {
          const cellA = a.children[index].textContent.trim().toLowerCase();
          const cellB = b.children[index].textContent.trim().toLowerCase();
          return nextState === 'asc'
            ? cellA.localeCompare(cellB, undefined, { numeric: true })
            : cellB.localeCompare(cellA, undefined, { numeric: true });
        });
        rows.forEach(row => tbody.appendChild(row));
      }
    });
  });
});

