const socket = io();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const players = {};
const playerListDiv = document.getElementById('players-list');

// Load Assets
const bgImg = new Image();
bgImg.src = 'assets/background.png';

const charImages = {
    mo: new Image(),
    andrew: new Image(),
    hatem: new Image(),
    max: new Image(),
    jon: new Image()
};
function floodFillTransparent(imgData, startX, startY, tolerance) {
    const w = imgData.width;
    const h = imgData.height;
    const data = imgData.data;
    const startIdx = (startY * w + startX) * 4;
    const startR = data[startIdx], startG = data[startIdx + 1], startB = data[startIdx + 2];

    // Ignore already transparent
    if (data[startIdx + 3] === 0) return;

    const visited = new Uint8Array(w * h);
    const stack = [[startX, startY]];
    visited[startY * w + startX] = 1;

    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const idx = (y * w + x) * 4;
        data[idx + 3] = 0; // Make transparent

        const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
        for (let [nx, ny] of neighbors) {
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                if (!visited[ny * w + nx]) {
                    visited[ny * w + nx] = 1;
                    const nIdx = (ny * w + nx) * 4;
                    const r = data[nIdx], g = data[nIdx + 1], b = data[nIdx + 2];

                    if (Math.abs(r - startR) <= tolerance &&
                        Math.abs(g - startG) <= tolerance &&
                        Math.abs(b - startB) <= tolerance) {
                        stack.push([nx, ny]);
                    }
                }
            }
        }
    }
}

['mo', 'andrew', 'hatem', 'max', 'jon'].forEach(char => {
    charImages[char].onload = function () {
        if (!this.processed) {
            this.processed = true;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.naturalWidth;
            tempCanvas.height = this.naturalHeight;
            if (tempCanvas.width > 0) {
                const tCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
                tCtx.drawImage(this, 0, 0);
                const imgData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

                // Flood fill from all 4 corners with tolerance 30
                floodFillTransparent(imgData, 0, 0, 30);
                floodFillTransparent(imgData, tempCanvas.width - 1, 0, 30);
                floodFillTransparent(imgData, 0, tempCanvas.height - 1, 30);
                floodFillTransparent(imgData, tempCanvas.width - 1, tempCanvas.height - 1, 30);

                tCtx.putImageData(imgData, 0, 0);
                this.src = tempCanvas.toDataURL();
            }
        }
    };
    charImages[char].crossOrigin = "Anonymous";
    charImages[char].src = `assets/${char}.png?v=${new Date().getTime()}`;
});

let roundActive = true;
let roundWinnerMsg = '';
let score = {};

socket.emit('register', { type: 'host' });

socket.on('controller_connected', (data) => {
    const floorY = canvas.height - 120; // Another 10% up
    players[data.playerId] = {
        id: data.playerId,
        name: data.name || `P${data.playerId}`,
        character: null,
        x: Math.random() * (canvas.width - 100),
        y: floorY - 180,
        vx: 0,
        vy: 0,
        width: 90, // Enlarge characters
        height: 180,
        isGrounded: true,
        isDiving: false,
        hasDoubleJumped: false,
        isKicking: false,
        isDead: false,
        direction: 1 // 1 for right, -1 for left
    };
    score[data.playerId] = 0;
    updatePlayerList();
});

socket.on('player_selected_character', (data) => {
    if (players[data.playerId]) {
        players[data.playerId].character = data.character;
        updatePlayerList();
    }
});

socket.on('controller_disconnected', (data) => {
    delete players[data.playerId];
    delete score[data.playerId];
    updatePlayerList();
});

socket.on('player_action', (data) => {
    const p = players[data.playerId];
    if (!p || p.isDead || !roundActive) return;

    if (data.action === 'dive_start') {
        if (p.isGrounded) {
            p.vy = -18; // Jump straight up
            p.isGrounded = false;
            p.isDiving = true;
            p.hasDoubleJumped = false;
        } else if (!p.hasDoubleJumped && !p.isKicking) {
            p.vy = -15; // Double jump
            p.hasDoubleJumped = true;
            p.isDiving = true;
        }
    } else if (data.action === 'dive_end') {
        p.isDiving = false;
    } else if (data.action === 'kick') {
        if (!p.isGrounded && !p.isKicking) {
            // Kick mechanics: diagonal down forward
            p.isKicking = true;
            // Face the closest living opponent
            let closestDist = Infinity;
            let dir = p.direction;
            for (let id in players) {
                if (id != p.id && !players[id].isDead) {
                    let dist = players[id].x - p.x;
                    if (Math.abs(dist) < closestDist) {
                        closestDist = Math.abs(dist);
                        dir = dist > 0 ? 1 : -1;
                    }
                }
            }
            p.direction = dir;
            p.vx = p.direction * 12;
            p.vy = 12; // Fast fall
        } else if (p.isGrounded && !p.isKicking) {
            // Kick on ground = hop backward
            p.vy = -10;
            p.vx = -p.direction * 8;
            p.isGrounded = false;
        }
    }
});

function updatePlayerList() {
    let html = 'Connected: ';
    for (let id in players) {
        const char = players[id].character || 'Picking...';
        html += `<span style="margin-right: 20px;">${players[id].name} (${char}) Score: ${score[id]}</span>`;
    }
    playerListDiv.innerHTML = html;
}

function checkCollisions() {
    if (!roundActive) return;

    let activePlayers = Object.values(players).filter(p => !p.isDead && p.character);
    if (activePlayers.length < 2) return; // Need at least 2 fighters

    for (let i = 0; i < activePlayers.length; i++) {
        for (let j = 0; j < activePlayers.length; j++) {
            if (i === j) continue;
            let p1 = activePlayers[i]; // Attacker
            let p2 = activePlayers[j]; // Defender

            if (p1.isKicking) {
                // p1's hurtbox (foot area)
                let footX = p1.direction === 1 ? p1.x + p1.width : p1.x;
                let footY = p1.y + p1.height;

                // Increase foot hitbox size slightly, center it horizontally
                let hitRect = {
                    x: footX - 25,
                    y: footY - 20,
                    w: 50,
                    h: 40
                };

                // Tighten p2 body rect (characters are drawn large but collision should be core body)
                let bodyRect = {
                    x: p2.x + 20,
                    y: p2.y + 20,
                    w: p2.width - 40,
                    h: p2.height - 20
                };

                // Simple AABB collision
                if (hitRect.x < bodyRect.x + bodyRect.w &&
                    hitRect.x + hitRect.w > bodyRect.x &&
                    hitRect.y < bodyRect.y + bodyRect.h &&
                    hitRect.y + hitRect.h > bodyRect.y) {

                    // Hit!
                    p2.isDead = true;
                    console.log(`P${p1.id} kicked P${p2.id}`);
                }
            }
        }
    }

    let survivingPlayers = Object.values(players).filter(p => !p.isDead && p.character);
    if (survivingPlayers.length <= 1 && Object.keys(players).length > 1) {
        // Round over!
        roundActive = false;
        let winner = survivingPlayers[0];
        if (winner) {
            score[winner.id]++;
            updatePlayerList();
            roundWinnerMsg = `${winner.name} Wins the Round!`;
        } else {
            roundWinnerMsg = `Draw!`;
        }

        setTimeout(resetRound, 3000);
    }
}

function resetRound() {
    const floorY = canvas.height - 120;
    for (let id in players) {
        let p = players[id];
        p.x = Math.random() * (canvas.width - p.width);
        p.y = floorY - p.height;
        p.vx = 0,
            p.vy = 0;
        p.isGrounded = true;
        p.isDiving = false;
        p.hasDoubleJumped = false;
        p.isKicking = false;
        p.isDead = false;
        p.direction = (p.x < canvas.width / 2) ? 1 : -1;
    }
    roundWinnerMsg = '';
    roundActive = true;
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Background
    if (bgImg.complete) {
        ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
    }

    for (let id in players) {
        let p = players[id];
        if (!p.character) continue; // Don't act if still in select screen

        // Apply physics
        if (!p.isGrounded) {
            p.vy += 0.8; // Gravity
        }

        p.x += p.vx;
        p.y += p.vy;

        // Floor collision
        const floorY = canvas.height - 120;
        if (p.y >= floorY - p.height) {
            p.y = floorY - p.height;
            if (!p.isDead) {
                p.isGrounded = true;
                p.hasDoubleJumped = false;
                p.vy = 0;
                p.vx = 0;
                if (p.isKicking) {
                    p.isKicking = false; // Landed the kick
                }
            }
        }

        // Walls bounds
        if (p.x < 0) { p.x = 0; p.vx = 0; }
        if (p.x > canvas.width - p.width) { p.x = canvas.width - p.width; p.vx = 0; }

        if (p.isDead) {
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = 'red';
        }

        // Draw Player Sprite
        let img = charImages[p.character];
        if (img && img.complete) {
            ctx.save();
            ctx.translate(p.x + p.width / 2, p.y + p.height / 2);
            // Flip image if facing left
            if (p.direction === -1) {
                ctx.scale(-1, 1);
            }
            // Rotate slightly if kicking
            if (p.isKicking) {
                ctx.rotate(45 * Math.PI / 180);
            } else if (p.isDead) {
                ctx.rotate(90 * Math.PI / 180);
                p.y += 5; // sink into ground
            }

            let scaleRatio = p.height / img.height;
            let drawWidth = img.width * scaleRatio;
            let drawHeight = img.height * scaleRatio;

            ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
            ctx.restore();
        }

        ctx.globalAlpha = 1.0;

        // Draw Player Indicator (Name only)
        if (!p.isDead) {
            // Shadow
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 20px "Courier New"';
            ctx.textAlign = 'center';
            ctx.fillText(p.name, p.x + p.width / 2 + 2, p.y - 11);

            // Text
            ctx.fillStyle = '#4ade80';
            ctx.fillText(p.name, p.x + p.width / 2, p.y - 13);
        }
    }

    checkCollisions();

    // Draw Round Msg
    if (!roundActive && roundWinnerMsg) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, canvas.height / 2 - 40, canvas.width, 80);
        ctx.fillStyle = '#22c55e';
        ctx.font = '40px "Courier New"';
        ctx.textAlign = 'center';
        ctx.fillText(roundWinnerMsg, canvas.width / 2, canvas.height / 2 + 10);
    } else if (Object.keys(players).length < 2) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(100, canvas.height / 2 - 40, 600, 80);
        ctx.fillStyle = 'white';
        ctx.font = '24px "Courier New"';
        ctx.textAlign = 'center';
        ctx.fillText("Waiting for at least 2 players to select character...", canvas.width / 2, canvas.height / 2 + 8);
    }

    requestAnimationFrame(gameLoop);
}

// Ensure images load before full loop or handle dynamically inline
gameLoop();
