const socket = io();

// ─── Character roster ───
const CHARACTERS = [
    { id: 'mo',     name: 'Mo',     desc: 'Egyptian · Hawaiian Shirt · Bald & Moustached' },
    { id: 'andrew', name: 'Andrew', desc: 'German · DJ & Coding Nerd · Glasses' },
    { id: 'hatem',  name: 'Hatem',  desc: 'Tunisian · Tall & Lanky · Dad Cap · Derbouka' },
    { id: 'max',    name: 'Max',    desc: 'Danish · Chronic Stoner · Nerd Glasses' },
    { id: 'jon',    name: 'Jon',    desc: 'French · White Shirt · Small Afro · Derbouka' },
    { id: 'marty',  name: 'Marty',  desc: 'American · Hoodie · Flip Flops · Pacifist' },
    { id: 'win',    name: 'Win',    desc: 'Indian · George Clooney · Suave as hell' },
    { id: 'l',      name: 'L',      desc: 'Indian · Snapback · Floating Split Keyboard · Hash Powers' },
];

let currentIndex = 0;
let playerName = '';
let touchStartX = 0;

// ─── DOM refs ───
const nameScreen  = document.getElementById('name-screen');
const charScreen  = document.getElementById('char-screen');
const fightScreen = document.getElementById('fight-screen');
const stage       = document.getElementById('carousel-stage');
const nameLabel   = document.getElementById('char-name-label');
const descLabel   = document.getElementById('char-desc-label');
const dotNav      = document.getElementById('dot-nav');

// ─── Build carousel slides ───
const slides = CHARACTERS.map((c, i) => {
    const el = document.createElement('div');
    el.className = 'char-slide';
    el.dataset.index = i;

    const img = document.createElement('img');
    img.src = `assets/${c.id}.png?v=${Date.now()}`;
    img.alt = c.name;
    img.draggable = false;
    el.appendChild(img);

    stage.appendChild(el);
    return el;
});

// ─── Build dot nav ───
const dots = CHARACTERS.map((_, i) => {
    const d = document.createElement('div');
    d.className = 'dot' + (i === 0 ? ' active' : '');
    d.addEventListener('click', () => goTo(i));
    dotNav.appendChild(d);
    return d;
});

// ─── Layout slides ───
function layoutSlides(idx, animate = true) {
    slides.forEach((slide, i) => {
        const offset = i - idx;
        if (!animate) slide.style.transition = 'none';
        else slide.style.transition = 'transform 0.35s cubic-bezier(.4,0,.2,1), opacity 0.35s';

        if (offset === 0) {
            slide.style.transform = 'translateX(0) scale(1)';
            slide.style.opacity = '1';
            slide.style.zIndex = '2';
        } else {
            const dir = offset > 0 ? 1 : -1;
            slide.style.transform = `translateX(${dir * 100}%) scale(0.82)`;
            slide.style.opacity = '0';
            slide.style.zIndex = '1';
        }
    });

    // Update info
    nameLabel.textContent = CHARACTERS[idx].name;
    descLabel.textContent = CHARACTERS[idx].desc;

    // Update dots
    dots.forEach((d, i) => d.classList.toggle('active', i === idx));
}

function goTo(idx) {
    currentIndex = (idx + CHARACTERS.length) % CHARACTERS.length;
    layoutSlides(currentIndex);
}

// Init
layoutSlides(0, false);

// ─── Arrow nav ───
document.getElementById('arrow-left').addEventListener('click', () => goTo(currentIndex - 1));
document.getElementById('arrow-right').addEventListener('click', () => goTo(currentIndex + 1));

// ─── Swipe gestures ───
stage.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
stage.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) goTo(currentIndex + (dx < 0 ? 1 : -1));
}, { passive: true });

// ─── Join button ───
document.getElementById('join-btn').addEventListener('click', () => {
    const val = document.getElementById('player-name-input').value.trim();
    if (!val) { document.getElementById('player-name-input').focus(); return; }
    playerName = val;
    nameScreen.style.display = 'none';
    charScreen.style.display = 'flex';
    socket.emit('register', { type: 'controller', name: playerName });
});

// Allow Enter key on name input
document.getElementById('player-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('join-btn').click();
});

// ─── Select character ───
document.getElementById('select-btn').addEventListener('click', () => {
    const chosen = CHARACTERS[currentIndex];
    socket.emit('character_select', chosen.id);

    // Show fight screen
    charScreen.style.display = 'none';
    fightScreen.style.display = 'flex';

    // Populate fight header
    document.getElementById('fight-player-name').textContent = playerName;
    document.getElementById('fight-char-name').textContent = chosen.name.toUpperCase();
    const heroImg = document.getElementById('fight-char-img');
    heroImg.src = `assets/${chosen.id}.png?v=${Date.now()}`;
});

// ─── Fight buttons ───
document.addEventListener('DOMContentLoaded', () => {
    // Prevent zoom
    document.addEventListener('touchmove', e => { if (e.scale !== 1) e.preventDefault(); }, { passive: false });

    const btnDive = document.getElementById('btn-dive');
    const btnKick = document.getElementById('btn-kick');

    const diveStart = e => { e.preventDefault(); socket.emit('action', 'dive_start'); };
    const diveEnd   = e => { e.preventDefault(); socket.emit('action', 'dive_end'); };
    const kickFire  = e => { e.preventDefault(); socket.emit('action', 'kick'); };

    btnDive.addEventListener('mousedown',  diveStart);
    btnDive.addEventListener('touchstart', diveStart, { passive: false });
    btnDive.addEventListener('mouseup',    diveEnd);
    btnDive.addEventListener('touchend',   diveEnd, { passive: false });

    btnKick.addEventListener('mousedown',  kickFire);
    btnKick.addEventListener('touchstart', kickFire, { passive: false });
});
