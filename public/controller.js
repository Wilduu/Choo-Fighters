const socket = io();

document.querySelectorAll('.char-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const char = e.target.getAttribute('data-char');
        socket.emit('character_select', char);
        document.getElementById('character-select').style.display = 'none';
        document.getElementById('controls').style.display = 'flex';
    });
});

let playerName = '';

document.getElementById('join-btn').addEventListener('click', () => {
    const nameInput = document.getElementById('player-name-input').value.trim();
    if (nameInput) {
        playerName = nameInput;
        document.getElementById('name-input-screen').style.display = 'none';
        document.getElementById('character-select').style.display = 'flex';
        socket.emit('register', { type: 'controller', name: playerName });
    } else {
        alert("Please enter a name");
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Socket registration is now handled by the join button

    // Prevent default touch behaviors like zooming
    document.addEventListener('touchmove', function (event) {
        if (event.scale !== 1) {
            event.preventDefault();
        }
    }, { passive: false });

    // Setup dive button interactions
    const btnDive = document.getElementById('btn-dive');
    const diveStart = (e) => { e.preventDefault(); socket.emit('action', 'dive_start'); };
    const diveEnd = (e) => { e.preventDefault(); socket.emit('action', 'dive_end'); };
    btnDive.addEventListener('mousedown', diveStart);
    btnDive.addEventListener('touchstart', diveStart);
    btnDive.addEventListener('mouseup', diveEnd);
    btnDive.addEventListener('touchend', diveEnd);

    // Setup kick button interactions
    const btnKick = document.getElementById('btn-kick');
    const kickStr = (e) => { e.preventDefault(); socket.emit('action', 'kick'); };
    btnKick.addEventListener('mousedown', kickStr);
    btnKick.addEventListener('touchstart', kickStr);
});
