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
    jon: new Image(),
    marty: new Image(),
    win: new Image(),
    l: new Image()
};
// Load character images — backgrounds already stripped server-side by process_sprites.js
const ts = Date.now(); // cache buster
['mo', 'andrew', 'hatem', 'max', 'jon', 'marty', 'win', 'l'].forEach(char => {
    charImages[char].src = `assets/${char}.png?v=${ts}`;
});

let roundActive = true;
let roundWinnerMsg = '';
let score = {};
let gameTime = 0;
let showHitboxes = false; // press H to toggle debug overlay

document.addEventListener('keydown', e => {
    if (e.key === 'h' || e.key === 'H') showHitboxes = !showHitboxes;
});

/**
 * Per-character hitbox data (all values in pixels, within the 90×180 bounding box).
 *
 * hurtbox  — the vulnerable body region (what can be HIT)
 *   hx/hy  — offset from player top-left corner
 *   hw/hh  — width / height
 *
 * attackbox — the striking region when kicking (coords when facing RIGHT)
 *   ax/ay  — offset from player top-left corner
 *   aw/ah  — width / height
 *   When facing LEFT the ax is mirrored: p.x + (p.width - ax - aw)
 */
const CHAR_HITBOXES = {
//         hurtbox                  attackbox (foot / weapon, facing right)
    mo:     { hx:15, hy: 5,  hw:60, hh:168, ax:58, ay:148, aw:42, ah:36 }, // stocky, full-height
    andrew: { hx:18, hy: 3,  hw:54, hh:170, ax:58, ay:152, aw:38, ah:30 }, // average nerd
    hatem:  { hx:26, hy: 2,  hw:38, hh:175, ax:57, ay:155, aw:35, ah:28 }, // very tall & lanky
    max:    { hx:12, hy: 8,  hw:66, hh:162, ax:60, ay:143, aw:40, ah:36 }, // relaxed wide stance
    jon:    { hx:16, hy: 5,  hw:58, hh:168, ax:58, ay:148, aw:38, ah:32 }, // average
    marty:  { hx:10, hy:10,  hw:70, hh:158, ax:60, ay:142, aw:40, ah:34 }, // hoodie adds width
    win:    { hx:14, hy:22,  hw:62, hh:146, ax:58, ay:138, aw:44, ah:38 }, // short+stocky, body starts lower
    l:      { hx:24, hy: 2,  hw:42, hh:176, ax:48, ay:145, aw:65, ah:28 }, // lanky body, wide keyboard reach
};

// Helper: resolve character hitbox rects in world space
function getHurtbox(p) {
    const hb = (p.character && CHAR_HITBOXES[p.character]) || { hx:15, hy:5, hw:60, hh:168 };
    return { x: p.x + hb.hx, y: p.y + hb.hy, w: hb.hw, h: hb.hh };
}

function getAttackbox(p) {
    const hb = (p.character && CHAR_HITBOXES[p.character]) || { ax:58, ay:148, aw:42, ah:36 };
    // Mirror horizontally when facing left
    const ax = p.direction === 1 ? p.x + hb.ax : p.x + (p.width - hb.ax - hb.aw);
    return { x: ax, y: p.y + hb.ay, w: hb.aw, h: hb.ah };
}

function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
}

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
        kickCooldown: 0,   // frames remaining before kick allowed again
        isDead: false,
        direction: 1,
        // Animation state
        landSquash: 0,
        kickWobble: 0,
        deathAngle: 0,
        prevGrounded: true
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
        if (!p.isGrounded && !p.isKicking && p.kickCooldown <= 0) {
            p.isKicking = true;
            p.kickCooldown = 45; // ~0.75s at 60fps
            // Face the closest living opponent
            let closestDist = Infinity, dir = p.direction;
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
            p.vy = 12;
        } else if (p.isGrounded && !p.isKicking && p.kickCooldown <= 0) {
            p.vy = -10;
            p.vx = -p.direction * 8;
            p.isGrounded = false;
            p.kickCooldown = 30; // shorter cooldown for ground hop
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
    if (activePlayers.length < 2) return;

    const kickers = activePlayers.filter(p => p.isKicking);

    // Check simultaneous kick: two kickers whose attackboxes overlap each other's hurtboxes
    for (let i = 0; i < kickers.length; i++) {
        for (let j = i + 1; j < kickers.length; j++) {
            const a = kickers[i], b = kickers[j];
            const aAtk = getAttackbox(a), bAtk = getAttackbox(b);
            const aHurt = getHurtbox(a), bHurt = getHurtbox(b);
            const aHitsB = aabb(aAtk, bHurt);
            const bHitsA = aabb(bAtk, aHurt);

            if (aHitsB && bHitsA) {
                // Both hit simultaneously — determine by Y position (lower Y = higher up = wins)
                const diff = Math.abs(a.y - b.y);
                const threshold = a.height * 0.05; // 5% of hitbox height

                if (diff <= threshold) {
                    // Too close to call — both bounce backwards
                    a.vx = -a.direction * 10; a.vy = -8; a.isKicking = false;
                    b.vx = -b.direction * 10; b.vy = -8; b.isKicking = false;
                    a.isGrounded = false; b.isGrounded = false;
                    console.log('Simultaneous kick — clash! Both bounce.');
                } else {
                    // Higher player (lower y) wins
                    const winner = a.y < b.y ? a : b;
                    const loser  = a.y < b.y ? b : a;
                    loser.isDead = true;
                    console.log(`${winner.name} kicked higher — ${loser.name} is out!`);
                }
                // Mark as resolved so they don't get processed again below
                a._clashed = true; b._clashed = true;
            }
        }
    }

    // Normal one-sided kick checks
    for (let i = 0; i < activePlayers.length; i++) {
        for (let j = 0; j < activePlayers.length; j++) {
            if (i === j) continue;
            const p1 = activePlayers[i], p2 = activePlayers[j];
            if (p1.isKicking && !p1._clashed && !p2._clashed) {
                if (aabb(getAttackbox(p1), getHurtbox(p2))) {
                    p2.isDead = true;
                    console.log(`${p1.name} kicked ${p2.name}`);
                }
            }
        }
    }

    // Clean up clash flags
    activePlayers.forEach(p => delete p._clashed);

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
    const pList = Object.values(players);
    const margin = 60;
    const slots = pList.map((_, i) => {
        // Distribute players evenly from left edge to right edge
        const t = pList.length === 1 ? 0.5 : i / (pList.length - 1);
        return margin + t * (canvas.width - margin * 2);
    });
    // Shuffle so it's not always the same player on the same side
    slots.sort(() => Math.random() - 0.5);

    pList.forEach((p, i) => {
        p.x = slots[i] - p.width / 2;
        p.y = floorY - p.height;
        p.vx = 0;
        p.vy = 0;
        p.isGrounded = true;
        p.isDiving = false;
        p.hasDoubleJumped = false;
        p.isKicking = false;
        p.isDead = false;
        p.kickCooldown = 0;
        p.landSquash = 0; p.kickWobble = 0; p.deathAngle = 0;
        p.direction = (p.x < canvas.width / 2) ? 1 : -1;
    });
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

        // --- Physics (only for characters that have been picked) ---
        if (p.character) {
            if (!p.isGrounded) p.vy += 0.8;
            p.x += p.vx;
            p.y += p.vy;

            // Tick cooldowns
            if (p.kickCooldown > 0) p.kickCooldown--;

            // Always face the nearest living opponent
            if (!p.isDead) {
                let nearestDist = Infinity, nearestDir = p.direction;
                for (let oid in players) {
                    const o = players[oid];
                    if (o.id !== p.id && !o.isDead && o.character) {
                        const dx = o.x - p.x;
                        if (Math.abs(dx) < nearestDist) {
                            nearestDist = Math.abs(dx);
                            nearestDir = dx > 0 ? 1 : -1;
                        }
                    }
                }
                // Only auto-face when not in the middle of a kick (kick direction is intentional)
                if (!p.isKicking) p.direction = nearestDir;
            }

            const floorY = canvas.height - 120;
            const wasGrounded = p.prevGrounded;
            if (p.y >= floorY - p.height) {
                p.y = floorY - p.height;
                if (!p.isDead) {
                    if (!wasGrounded) p.landSquash = 1; // trigger landing squash
                    p.isGrounded = true;
                    p.hasDoubleJumped = false;
                    p.vy = 0;
                    p.vx = 0;
                    if (p.isKicking) p.isKicking = false;
                }
            }
            p.prevGrounded = p.isGrounded;

            if (p.x < 0) { p.x = 0; p.vx = 0; }
            if (p.x > canvas.width - p.width) { p.x = canvas.width - p.width; p.vx = 0; }

            // Decay animation timers
            p.landSquash = Math.max(0, p.landSquash - 0.08);
            if (p.isKicking) p.kickWobble = Math.min(1, p.kickWobble + 0.2);
            else p.kickWobble = Math.max(0, p.kickWobble - 0.1);
            if (p.isDead) p.deathAngle += 0.08;
        }

        // --- Draw ---
        const img = p.character ? charImages[p.character] : null;
        ctx.save();
        ctx.globalAlpha = p.isDead ? Math.max(0, 1 - p.deathAngle * 0.7) : 1.0;

        // Resolve animated scale and rotation
        let drawScaleX = 1, drawScaleY = 1, drawRotation = 0;

        if (p.isDead) {
            // Death tumble: rotate and move toward ground
            drawRotation = p.deathAngle;

        } else if (p.isKicking) {
            // Kick: 45° tilt + slight wobble/squish
            const wobble = Math.sin(p.kickWobble * Math.PI * 4) * 0.08;
            drawRotation = Math.PI / 4 + wobble;
            drawScaleX = 0.9; drawScaleY = 1.1;

        } else if (!p.isGrounded) {
            // Airborne: stretch vertically, squish horizontally
            const strength = Math.min(1, Math.abs(p.vy) / 18);
            drawScaleX = 1 - strength * 0.15;
            drawScaleY = 1 + strength * 0.15;

        } else if (p.landSquash > 0) {
            // Landing squash: briefly wide and short
            const s = Math.sin(p.landSquash * Math.PI);
            drawScaleX = 1 + s * 0.25;
            drawScaleY = 1 - s * 0.15;

        } else {
            // Idle: gentle up-down bob using sin wave
            const bob = Math.sin(gameTime * 0.05 + p.id * 1.5) * 2;
            ctx.translate(0, bob);
        }

        const cx = p.x + p.width / 2;
        const cy = p.y + p.height / 2 + (p.isDead ? p.deathAngle * 4 : 0);
        ctx.translate(cx, cy);
        if (p.direction === -1) ctx.scale(-1, 1);
        ctx.rotate(drawRotation);
        ctx.scale(drawScaleX, drawScaleY);

        if (img && img.complete && img.naturalHeight > 0) {
            const scaleRatio = p.height / img.naturalHeight;
            const dw = img.naturalWidth  * scaleRatio;
            const dh = img.naturalHeight * scaleRatio;
            ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        } else if (!p.character) {
            // Ghost silhouette — waiting for character pick
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = '#4ade80';
            ctx.beginPath();
            ctx.ellipse(0, -p.height * 0.3, 22, 22, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(-18, -p.height * 0.1, 36, p.height * 0.5);
        } else {
            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
        }

        ctx.restore();
        ctx.globalAlpha = 1.0;

        // Name label (shadow + text, no box)
        if (!p.isDead || p.deathAngle < 1) {
            const nameX = p.x + p.width / 2;
            const nameY = p.y - 14;
            ctx.font = 'bold 18px "Courier New"';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#000';
            ctx.fillText(p.name, nameX + 2, nameY + 2);
            ctx.fillStyle = '#4ade80';
            ctx.fillText(p.name, nameX, nameY);
        }
    }

    checkCollisions();

    // ─── Debug hitbox overlay (press H to toggle) ───
    if (showHitboxes) {
        for (let id in players) {
            const p = players[id];
            if (!p.character) continue;

            // Hurtbox — semi-transparent green
            const hurt = getHurtbox(p);
            ctx.strokeStyle = 'rgba(74,222,128,0.9)';
            ctx.lineWidth = 2;
            ctx.strokeRect(hurt.x, hurt.y, hurt.w, hurt.h);
            ctx.fillStyle = 'rgba(74,222,128,0.12)';
            ctx.fillRect(hurt.x, hurt.y, hurt.w, hurt.h);

            // Attackbox — semi-transparent red (only when kicking)
            if (p.isKicking) {
                const atk = getAttackbox(p);
                ctx.strokeStyle = 'rgba(239,68,68,0.95)';
                ctx.lineWidth = 2;
                ctx.strokeRect(atk.x, atk.y, atk.w, atk.h);
                ctx.fillStyle = 'rgba(239,68,68,0.25)';
                ctx.fillRect(atk.x, atk.y, atk.w, atk.h);
            }
        }

        // Corner label
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(6, 6, 150, 22);
        ctx.fillStyle = '#4ade80';
        ctx.font = '13px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('H: hitboxes ON  [green=hurt, red=atk]', 10, 21);
    }

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

    gameTime++;
    requestAnimationFrame(gameLoop);
}

// Ensure images load before full loop or handle dynamically inline
gameLoop();
