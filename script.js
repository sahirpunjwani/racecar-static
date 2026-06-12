const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const FPS = 60, STEP = 1 / FPS;
const WIDTH = canvas.width, HEIGHT = canvas.height;
let ROAD_W = 3000; 
const SEGMENT_L = 200, CAM_DEPTH = 0.84, CAMERA_H = 1000, DRAW_DISTANCE = 240;
const MAX_SPEED = 14000, ACCEL = MAX_SPEED / 4.5, BREAKING = -MAX_SPEED, DECEL = -MAX_SPEED / 10, OFF_ROAD_DECEL = -MAX_SPEED / 2;

const keys = { left: false, right: false, up: false, down: false, space: false };
let playerNeonColor = '#00ffff', selectedGameMode = 'free'; 

// Sub-Oscillator Audio Synthesizer Registers
let audioCtx = null, hornOsc1 = null, hornOsc2 = null, hornGain = null;

let segments = [], trackLength = 0, cars = [], rivalRacers = []; 
let playerX = 0.5, position = 0, speed = 0, score = 0, gameActive = false;
let carRotation = 0, carLean = 0, crashSpin = 0, crashTimer = 0, screenShake = 0, particles = [];

// DOM Interface Interceptors
document.getElementById('engage-btn').addEventListener('click', launchGameFromMenu);
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('exit-btn').addEventListener('click', exitToMainMenu);

const freeModeCard = document.getElementById('mode-free');
const careerModeCard = document.getElementById('mode-career');
const manualContent = document.getElementById('manual-content');

freeModeCard.addEventListener('click', () => {
    freeModeCard.classList.add('active'); careerModeCard.classList.remove('active');
    selectedGameMode = 'free';
    manualContent.innerHTML = `<div class="info-block"><span class="badge oncoming">WARNING</span><p>Left double-lane configurations feature inverted velocity oncoming entities.</p></div>`;
});

careerModeCard.addEventListener('click', () => {
    careerModeCard.classList.add('active'); freeModeCard.classList.remove('active');
    selectedGameMode = 'career';
    manualContent.innerHTML = `<div class="info-block"><span class="badge career-info">CAREER MODE</span><p>3-Lane hyper-grid. Complete elimination of civilian traffic markers.</p></div>`;
});

const colorDots = document.querySelectorAll('.color-dot');
colorDots.forEach(dot => {
    dot.addEventListener('click', (e) => {
        colorDots.forEach(d => d.classList.remove('active'));
        e.target.classList.add('active');
        playerNeonColor = e.target.getAttribute('data-color');
        document.querySelector('.preview-car .wing').style.borderColor = playerNeonColor;
        document.querySelector('.preview-car .cabin').style.borderColor = playerNeonColor;
        document.querySelector('.platform-light').style.background = playerNeonColor;
    });
});

window.addEventListener('keydown', e => handleKey(e, true));
window.addEventListener('keyup', e => handleKey(e, false));

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        hornGain = audioCtx.createGain(); hornGain.gain.setValueAtTime(0, audioCtx.currentTime); hornGain.connect(audioCtx.destination);
        hornOsc1 = audioCtx.createOscillator(); hornOsc1.type = 'sawtooth'; hornOsc1.frequency.setValueAtTime(440, audioCtx.currentTime); hornOsc1.connect(hornGain); hornOsc1.start();
        hornOsc2 = audioCtx.createOscillator(); hornOsc2.type = 'triangle'; hornOsc2.frequency.setValueAtTime(446, audioCtx.currentTime); hornOsc2.connect(hornGain); hornOsc2.start();
    }
}
function setHorn(on) { if (hornGain && gameActive) hornGain.gain.setTargetAtTime(on ? 0.12 : 0, audioCtx.currentTime, 0.02); }

function handleKey(e, isDown) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = isDown;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = isDown;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = isDown;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = isDown;
    if (e.code === 'Space') { keys.space = isDown; initAudio(); setHorn(isDown); if (gameActive) e.preventDefault(); }
}

function launchGameFromMenu() {
    document.getElementById('homepage').classList.add('fade-out');
    setTimeout(() => { document.getElementById('game-container').classList.remove('hidden'); startGame(); }, 400);
}

function exitToMainMenu() {
    gameActive = false; setHorn(false);
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('game-container').classList.add('hidden');
    document.getElementById('homepage').classList.remove('fade-out');
}

function project(p, cameraX, cameraY, cameraZ, pr) {
    const worldX = p.world.x - cameraX, worldY = p.world.y - cameraY, worldZ = p.world.z - cameraZ;
    pr.scale = CAM_DEPTH / worldZ;
    pr.screen.x = Math.round((WIDTH / 2) + (pr.scale * worldX * WIDTH / 2));
    pr.screen.y = Math.round((HEIGHT / 2) - (pr.scale * worldY * HEIGHT / 2));
    pr.screen.w = Math.round(pr.scale * ROAD_W * WIDTH / 2);
}

function findSegment(z) { return segments[Math.floor(z / SEGMENT_L) % segments.length]; }

function buildTrack() {
    segments = []; cars = []; rivalRacers = [];
    ROAD_W = (selectedGameMode === 'career') ? 2200 : 3000;
    document.getElementById('mode-display').innerText = (selectedGameMode === 'career') ? "CAREER APEX" : "FREE RIDE";

    function addFloor(num, curve, hill) {
        for (let n = 0; n < num; n++) {
            let colors = (Math.floor(segments.length / 3) % 2) ? 
                { road: '#121218', grass: '#040307', rumble: '#ff0055', lane: '#ffffff', barrier: '#00ffff' } : 
                { road: '#0d0d12', grass: '#020205', rumble: '#1d001d', lane: '#0d0d12', barrier: '#ff0055' };
            if (selectedGameMode === 'career') colors.barrier = '#0d0d12';
            segments.push({ index: segments.length, world: { x: 0, y: lastY(), z: segments.length * SEGMENT_L }, curve: curve, hill: hill, color: colors });
        }
    }
    function lastY() { return segments.length === 0 ? 0 : segments[segments.length - 1].world.y; }
    
    addFloor(100, 0, 0); addFloor(120, 1.8, 8); addFloor(100, -1.2, -4); addFloor(140, -3, 5); addFloor(100, 0, 0); addFloor(150, 3.5, -10); addFloor(100, 0, 0);
    trackLength = segments.length * SEGMENT_L;

    if (selectedGameMode === 'free') {
        let totalCars = 25; const lanePositions = [-0.75, -0.25, 0.25, 0.75];
        for (let i = 0; i < totalCars; i++) {
            let isSouthbound = Math.random() > 0.5;
            let laneIdx = isSouthbound ? (Math.random() > 0.5 ? 0 : 1) : (Math.random() > 0.5 ? 2 : 3);
            cars.push({
                position: 2500 + Math.random() * (trackLength - 3500), targetLaneX: lanePositions[laneIdx], x: lanePositions[laneIdx], lane: laneIdx, heading: isSouthbound ? 'south' : 'north',
                baseSpeed: isSouthbound ? (MAX_SPEED * 0.25) : (MAX_SPEED * 0.35 + Math.random() * 1500), speed: isSouthbound ? (MAX_SPEED * 0.25) : (MAX_SPEED * 0.35 + Math.random() * 1500),
                color: isSouthbound ? '#ff3366' : '#ffff00', width: 0.25, isEvading: false, evadeTimer: 0
            });
        }
    } else {
        cars = []; const careerLanes = [-0.6, 0, 0.6];
        const profiles = [
            { name: 'BLAZE', color: '#ff0033', speed: MAX_SPEED * 0.85 }, 
            { name: 'VIPER', color: '#00ff66', speed: MAX_SPEED * 0.82 }, 
            { name: 'SHADOW', color: '#aa00ff', speed: MAX_SPEED * 0.88 }
        ];
        let count = Math.random() > 0.5 ? 1 : 2; let shuf = profiles.sort(() => 0.5 - Math.random());
        for (let i = 0; i < count; i++) {
            let ch = shuf[i], lIdx = (i === 0) ? 0 : 2;
            rivalRacers.push({ 
                name: ch.name, x: careerLanes[lIdx], position: 1500 + (i * 600), speed: ch.speed, color: ch.color, width: 0.26, lane: lIdx,
                isCrashing: false, crashTimer: 0
            });
        }
    }
}

function startGame() {
    initAudio(); document.getElementById('menu').classList.add('hidden'); buildTrack();
    position = 0; playerX = (selectedGameMode === 'career') ? 0 : 0.5;
    speed = 3000; score = 0; screenShake = 0; crashSpin = 0; crashTimer = 0; carRotation = 0; carLean = 0; particles = []; gameActive = true;
}

function triggerCrash() {
    screenShake = 45; crashTimer = 1.5; crashSpin = 24; speed = 0;
    setTimeout(() => { if(gameActive) document.getElementById('menu').classList.remove('hidden'); }, 800);
    for (let i = 0; i < 40; i++) {
        particles.push({ x: WIDTH / 2 + (Math.random() - 0.5) * 80, y: HEIGHT - 60 + (Math.random() - 0.5) * 40, vx: (Math.random() - 0.5) * 32, vy: (Math.random() - 0.5) * 24 - 4, alpha: 1.0, color: '#ff0055' });
    }
}

function update(dt) {
    if (!gameActive) return;
    if (screenShake > 0) screenShake -= dt * 50;
    if (screenShake < 0) screenShake = 0;

    if (crashTimer > 0) {
        crashTimer -= dt; carRotation += crashSpin * dt; speed = Math.max(0, speed - dt * 5500); position = (position + speed * dt) % trackLength;
        cars.forEach(c => c.position = (c.position + (c.heading === 'south' ? -c.speed : c.speed) * dt + trackLength) % trackLength);
        rivalRacers.forEach(r => {
            if (!r.isCrashing) r.position = (r.position + r.speed * dt) % trackLength;
        });
        updateParticles(dt); return;
    }

    if (speed > 100) score += (speed / 1000);
    document.getElementById('score-val').innerText = Math.floor(score).toString().padStart(5, '0');
    document.getElementById('speed-val').innerText = Math.round(speed / 100);

    position = (position + speed * dt) % trackLength;
    const currSeg = findSegment(position), speedPct = speed / MAX_SPEED;
    const steerLimit = 3.4 * (speedPct + 0.15);

    let targetRot = 0, targetLean = 0;
    if (keys.left) { playerX -= dt * steerLimit; targetRot = -0.18; targetLean = -12; }
    else if (keys.right) { playerX += dt * steerLimit; targetRot = 0.18; targetLean = 12; }

    carRotation += (targetRot - carRotation) * dt * 8; carLean += (targetLean - carLean) * dt * 8;
    playerX -= dt * speedPct * currSeg.curve * 1.2;
    if (!keys.left && !keys.right && speed > 0) playerX -= (playerX * dt * 1.5);

    if (keys.up) speed += ACCEL * dt; else if (keys.down) speed += BREAKING * dt; else speed += DECEL * dt;

    let bound = (selectedGameMode === 'career') ? 1.1 : 1.6;
    if (playerX < -bound) playerX = -bound; if (playerX > bound) playerX = bound;
    if (Math.abs(playerX) > (bound - 0.45)) { if (speed > 2000) speed += OFF_ROAD_DECEL * dt; }

    // --- CIVILIAN TRAFFIC UPDATES ---
    cars.forEach(c => {
        let oldSeg = findSegment(c.position);
        c.position = (c.position + (c.heading === 'south' ? -c.speed : c.speed) * dt + trackLength) % trackLength;
        
        if (c.heading === 'north') {
            // IQ1000 Distance Check: Calculate actual gap separation spacing
            let distanceAhead = c.position - position;
            if (distanceAhead < 0) distanceAhead += trackLength;

            // REAR PROXIMITY SMART BRAKING: If car gets stuck directly BEHIND the player car
            if (distanceAhead > (trackLength - 800) && distanceAhead < trackLength && Math.abs(playerX - c.x) < 0.4) {
                c.speed = Math.max(1000, speed - 1500); // Decelerate smoothly to match player speed
            } else {
                c.speed = c.baseSpeed; // Safe to cruise
            }

            if (keys.space && distanceAhead > 0 && distanceAhead < 3500 && Math.abs(playerX - c.x) < 0.35) {
                c.isEvading = true; c.evadeTimer = 2.0; c.targetLaneX = (c.lane === 2) ? 0.75 : 0.25;
            }
        }
        c.x += (c.isEvading ? (c.targetLaneX - c.x) * dt * 4 : ([-0.75, -0.25, 0.25, 0.75][c.lane] - c.x) * dt * 2.5);
        if (c.isEvading && (c.evadeTimer -= dt) <= 0) c.isEvading = false;

        // Clean Front Collision Intercept Execution
        if (oldSeg.index === currSeg.index && Math.abs(playerX - c.x) < (c.width + 0.16)) {
            let headOn = (c.heading === 'south'), distanceAhead = c.position - position; if (distanceAhead < 0) distanceAhead += trackLength;
            
            // Only crash if oncoming head-on OR if you hit a car cleanly from behind
            if (headOn || (distanceAhead < 400 && speed > c.speed)) {
                triggerCrash();
                c.position = headOn ? (c.position - 800 + trackLength) % trackLength : (c.position + 800) % trackLength;
            }
        }
    });

    // --- RIVAL AI MOVEMENT UPDATES WITH EQUAL DAMAGE ---
    rivalRacers.forEach(r => {
        let oldSeg = findSegment(r.position);
        
        if (!r.isCrashing) {
            r.position = (r.position + r.speed * dt) % trackLength;
        } else {
            r.speed = Math.max(0, r.speed - dt * 6000);
            r.position = (r.position + r.speed * dt) % trackLength;
            
            if (r.speed > 0 && Math.random() > 0.4) {
                let rSeg = findSegment(r.position);
                if (rSeg.p1) {
                    let rx = rSeg.p1.screen.x + (rSeg.p1.scale * r.x * ROAD_W * WIDTH / 2), ry = rSeg.p1.screen.y;
                    particles.push({ x: rx + (Math.random() - 0.5) * 30, y: ry - 20, vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 0.5) * 15 - 3, alpha: 1.0, color: r.color });
                }
            }
            if ((r.crashTimer -= dt) <= 0) { r.isCrashing = false; r.speed = MAX_SPEED * 0.5; }
        }
        
        // IQ1000 AI Lane-Evasion Logic: Swerve around the player instead of ramming from behind!
        let distanceAhead = r.position - position; if (distanceAhead < 0) distanceAhead += trackLength;
        
        if (distanceAhead > (trackLength - 1000) && distanceAhead < trackLength && Math.abs(playerX - r.x) < 0.4 && !r.isCrashing) {
            // Rival detects player chassis ahead! Trigger an emergency lateral lane change shift
            r.lane = (playerX > 0) ? 0 : 2; 
        }

        const careerLanes = [-0.6, 0, 0.6];
        if (!r.isCrashing) r.x += (careerLanes[r.lane] - r.x) * dt * 3;

        // Equal Damage Matrix Box Check
        if (oldSeg.index === currSeg.index && Math.abs(playerX - r.x) < (r.width + 0.15)) {
            let dist = (r.position - position + trackLength) % trackLength;
            if (dist < 400 && !r.isCrashing) {
                // Only trigger crash frames if player rams them from behind OR if they clip you head-on
                if (speed > r.speed || dist > (trackLength - 400)) {
                    r.isCrashing = true; r.crashTimer = 2.0;
                    triggerCrash(); 
                }
            }
        }
    });

    if (speed > MAX_SPEED) speed = MAX_SPEED; if (speed < 0) speed = 0;
    updateParticles(dt);
}

function updateParticles(dt) { particles.forEach((p, i) => { p.x += p.vx; p.y += p.vy; p.alpha -= dt * 1.5; if (p.alpha <= 0) particles.splice(i, 1); }); }

function render() {
    ctx.save(); if (screenShake > 0) ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    let grad = ctx.createLinearGradient(0, 0, 0, HEIGHT / 2); grad.addColorStop(0, '#010004'); grad.addColorStop(0.6, '#140014'); grad.addColorStop(1, '#ff0055');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, WIDTH, HEIGHT / 2);

    const baseSeg = findSegment(position); let maxy = HEIGHT, x = 0, dx = 0;
    for (let n = 0; n < DRAW_DISTANCE; n++) {
        const seg = segments[(baseSeg.index + n) % segments.length], looped = seg.index < baseSeg.index;
        const camX = playerX * ROAD_W, camY = CAMERA_H + baseSeg.world.y, camZ = position - (looped ? trackLength : 0);
        seg.p1 = { world: { x: seg.world.x, y: seg.world.y, z: seg.world.z }, screen: {}, scale: 0 };
        project(seg.p1, camX - x, camY, camZ, seg.p1); x += dx; dx += seg.curve;
        if (seg.p1.screen.y >= maxy || seg.p1.screen.z <= CAM_DEPTH) continue;

        if (n > 0) {
            const p1 = segments[(baseSeg.index + n - 1) % segments.length].p1, p2 = seg.p1;
            if (p2.screen.y >= p1.screen.y) continue;
            drawPolygon(p1.screen.x, p1.screen.y, p1.screen.w * 2.5, p2.screen.x, p2.screen.y, p2.screen.w * 2.5, seg.color.grass);
            drawPolygon(p1.screen.x, p1.screen.y, p1.screen.w * 1.06, p2.screen.x, p2.screen.y, p2.screen.w * 1.06, seg.color.rumble);
            drawPolygon(p1.screen.x, p1.screen.y, p1.screen.w, p2.screen.x, p2.screen.y, p2.screen.w, seg.color.road);

            if (selectedGameMode === 'free') {
                drawPolygon(p1.screen.x, p1.screen.y, p1.screen.w * 0.015, p2.screen.x, p2.screen.y, p2.screen.w * 0.015, seg.color.barrier);
                if (seg.color.lane !== seg.color.road) {
                    let lw1 = p1.screen.w / 65, lw2 = p2.screen.w / 65;
                    drawPolygon(p1.screen.x - p1.screen.w * 0.5, p1.screen.y, lw1, p2.screen.x - p2.screen.w * 0.5, p2.screen.y, lw2, seg.color.lane);
                    drawPolygon(p1.screen.x + p1.screen.w * 0.5, p1.screen.y, lw1, p2.screen.x + p2.screen.w * 0.5, p2.screen.y, lw2, seg.color.lane);
                }
            } else if (seg.color.lane !== seg.color.road) {
                let lw1 = p1.screen.w / 70, lw2 = p2.screen.w / 70;
                drawPolygon(p1.screen.x - p1.screen.w * 0.33, p1.screen.y, lw1, p2.screen.x - p2.screen.w * 0.33, p2.screen.y, lw2, '#ffffff');
                drawPolygon(p1.screen.x + p1.screen.w * 0.33, p1.screen.y, lw1, p2.screen.x + p2.screen.w * 0.33, p2.screen.y, lw2, '#ffffff');
            }
            maxy = p1.screen.y;
        }
    }

    for (let n = DRAW_DISTANCE - 1; n > 0; n--) {
        const seg = segments[(baseSeg.index + n) % segments.length]; if (!seg.p1) continue;
        cars.forEach(c => {
            if (findSegment(c.position).index === seg.index) drawTrafficCar(seg.p1.screen.x + (seg.p1.scale * c.x * ROAD_W * WIDTH / 2), seg.p1.screen.y, seg.p1.scale, c.color, c.heading === 'south');
        });
        rivalRacers.forEach(r => {
            if (findSegment(r.position).index === seg.index) {
                let rx = seg.p1.screen.x + (seg.p1.scale * r.x * ROAD_W * WIDTH / 2), ry = seg.p1.screen.y;
                drawTrafficCar(rx, ry, seg.p1.scale, r.color, false);
                ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(10, Math.round(30 * seg.p1.scale))}px Orbitron`; ctx.textAlign = 'center';
                ctx.fillText(r.name, rx, ry - Math.round(240 * seg.p1.scale));
            }
        });
    }

    drawPlayerCar();
    particles.forEach(p => { ctx.save(); ctx.globalAlpha = p.alpha; ctx.fillStyle = p.color; ctx.shadowBlur = 10; ctx.shadowColor = p.color; ctx.fillRect(p.x, p.y, 7, 7); ctx.restore(); });
    ctx.restore();
}

function drawPolygon(x1, y1, w1, x2, y2, w2, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x1 - w1, y1); ctx.lineTo(x2 - w2, y2); ctx.lineTo(x2 + w2, y2); ctx.lineTo(x1 + w1, y1); ctx.closePath(); ctx.fill(); }
function drawTrafficCar(x, y, scale, color, oncoming) {
    const cw = Math.round(440 * scale * (WIDTH / 2)), ch = Math.round(220 * scale * (WIDTH / 2)); if (cw < 2) return;
    ctx.save(); ctx.translate(x, y - ch); ctx.shadowBlur = 12; ctx.shadowColor = color; ctx.fillStyle = '#09090e'; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, scale * 4);
    ctx.beginPath(); ctx.moveTo(-cw/2, ch); ctx.lineTo(-cw/3, ch*0.2); ctx.lineTo(cw/3, ch*0.2); ctx.lineTo(cw/2, ch); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = oncoming ? '#fff' : '#ff0033'; ctx.shadowColor = ctx.fillStyle;
    ctx.fillRect(-cw/2 + 3, ch - ch*0.3, cw*0.16, ch*0.15); ctx.fillRect(cw/2 - 3 - cw*0.16, ch - ch*0.3, cw*0.16, ch*0.15); ctx.restore();
}
function drawPlayerCar() {
    const cx = WIDTH / 2, cy = HEIGHT - 40; ctx.save(); ctx.translate(cx, cy - 20); ctx.rotate(carRotation);
    ctx.shadowBlur = 20; ctx.shadowColor = playerNeonColor; ctx.fillStyle = '#060810'; ctx.strokeStyle = playerNeonColor; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-55 + carLean, 20); ctx.lineTo(-70 + carLean, -2); ctx.lineTo(70 + carLean, -2); ctx.lineTo(55 + carLean, 20); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0f1322'; ctx.beginPath(); ctx.moveTo(-26, -2); ctx.lineTo(-16, -26); ctx.lineTo(16, -26); ctx.lineTo(26, -2); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (speed > 0 || crashTimer > 0) {
        ctx.shadowColor = '#ff007f'; ctx.fillStyle = '#ff007f';
        let th = crashTimer > 0 ? Math.random() * 6 : (12 + (speed / MAX_SPEED) * 24);
        ctx.fillRect(-38 + carLean, 20, 16, th); ctx.fillRect(22 + carLean, 20, 16, th);
    }
    ctx.restore();
}

let lastTime = performance.now();
function frame(now) { let dt = (now - lastTime) / 1000; if (dt > 0.5) dt = 0.5; lastTime = now; update(dt); render(); requestAnimationFrame(frame); }
buildTrack(); render(); requestAnimationFrame(frame);
