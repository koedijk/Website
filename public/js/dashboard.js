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
  updateClock();
}, 1000);

window.onload = () => {
  updateTimers();
  updateClock();
};
