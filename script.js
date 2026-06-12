const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const FPS = 60;
const STEP = 1 / FPS;
const WIDTH = canvas.width;
const HEIGHT = canvas.height;
let ROAD_W = 3000; 
const SEGMENT_L = 200; 
const CAM_DEPTH = 0.84; 
const CAMERA_H = 1000;
const DRAW_DISTANCE = 240;
const MAX_SPEED = 14000; 
const ACCEL = MAX_SPEED / 4.5;
const BREAKING = -MAX_SPEED;
const DECEL = -MAX_SPEED / 10;
const OFF_ROAD_DECEL = -MAX_SPEED / 2;

const keys = { left: false, right: false, up: false, down: false, space: false };

let playerNeonColor = '#00ffff'; 
let selectedGameMode = 'free'; // Options: 'free' or 'career'

// Audio Context Setup
let audioCtx = null, hornOsc1 = null, hornOsc2 = null, hornGain = null;

// Track & Entity Arrays
let segments = [];
let trackLength = 0;
let cars = [];
let rivalRacers = []; // Tracks structural career opponents

// Engine Variables
let playerX = 0.5; 
let position = 0; 
let speed = 0;
let score = 0;
let gameActive = false;

// Visual Transform Vectors
let carRotation = 0, carLean = 0, crashSpin = 0, crashTimer = 0, screenShake = 0, particles = [];

// Menu Hooks
document.getElementById('engage-btn').addEventListener('click', launchGameFromMenu);
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('exit-btn').addEventListener('click', exitToMainMenu);

// Mode Toggle Selectors
const freeModeCard = document.getElementById('mode-free');
const careerModeCard = document.getElementById('mode-career');
const manualContent = document.getElementById('manual-content');

freeModeCard.addEventListener('click', () => {
    freeModeCard.classList.add('active');
    careerModeCard.classList.remove('active');
    selectedGameMode = 'free';
    manualContent.innerHTML = `<div class="info-block"><span class="badge oncoming">WARNING</span><p>Left 2 lanes feature oncoming high-speed traffic.</p></div>`;
});

careerModeCard.addEventListener('click', () => {
    careerModeCard.classList.add('active');
    freeModeCard.classList.remove('active');
    selectedGameMode = 'career';
    manualContent.innerHTML = `<div class="info-block"><span class="badge career-info">CAREER MODE</span><p>3 Lanes (All North). Beat elite random speed rivals to win!</p></div>`;
});

// Showroom Color Selection Loop Logic
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
function setHorn(on) { if (hornGain && gameActive) hornGain.gain.setTargetAtTime(on ? 0.15 : 0, audioCtx.currentTime, 0.02); }

function handleKey(e, isDown) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = isDown;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = isDown;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = isDown;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = isDown;
    if (e.code === 'Space') { keys.space = isDown; initAudio(); setHorn(isDown); if (gameActive) e.preventDefault(); }
}

function launchGameFromMenu() {
    document.getElementById('homepage').classList.add('fade-out');
    setTimeout(() => {
        document.getElementById('game-container').classList.remove('hidden');
        startGame();
    }, 400);
}

function exitToMainMenu() {
    gameActive = false; setHorn(false);
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('game-container').classList.add('hidden');
    document.getElementById('homepage').classList.remove('fade-out');
}

function project(p, cameraX, cameraY, cameraZ, pr) {
    const worldX = p.world.x - cameraX; const worldY = p.world.y - cameraY; const worldZ = p.world.z - cameraZ;
    pr.scale = CAM_DEPTH / worldZ;
    pr.screen.x = Math.round((WIDTH / 2) + (pr.scale * worldX * WIDTH / 2));
    pr.screen.y = Math.round((HEIGHT / 2) - (pr.scale * worldY * HEIGHT / 2));
    pr.screen.w = Math.round(pr.scale * ROAD_W * WIDTH / 2);
}

function findSegment(z) { return segments[Math.floor(z / SEGMENT_L) % segments.length]; }

function buildTrack() {
    segments = [];
    cars = [];
    rivalRacers = [];

    // Tweak core architecture dimensions depending on mode selected
    if (selectedGameMode === 'career') {
        ROAD_W = 2200; // Snug profile for 3 clean northbound lanes
        document.getElementById('mode-display').innerText = "CAREER RACE";
    } else {
        ROAD_W = 3000; // Restored 4-lane wide layout
        document.getElementById('mode-display').innerText = "FREE RIDE";
    }

    function addFloor(num, curve, hill) {
        for (let n = 0; n < num; n++) {
            let colors = (Math.floor(segments.length / 3) % 2) ? 
                { road: '#121218', grass: '#040307', rumble: '#ff0055', lane: '#ffffff', barrier: '#00ffff' } : 
                { road: '#0d0d12', grass: '#020205', rumble: '#1d001d', lane: '#0d0d12', barrier: '#ff0055' };
            
            // Alter visual highway lines if playing 3-lane career mode
            if (selectedGameMode === 'career') {
                colors.barrier = '#121218'; // Turn off center guard divider
            }

            segments.push({
                index: segments.length, world: { x: 0, y: lastY(), z: segments.length * SEGMENT_L }, curve: curve, hill: hill, color: colors
            });
        }
    }
    function lastY() { return segments.length === 0 ? 0 : segments[segments.length - 1].world.y; }
    
    addFloor(100, 0, 0); addFloor(120, 2, 10); addFloor(100, -1.5, -5); addFloor(140, -3.5, 6); addFloor(100, 0, 0); addFloor(150, 4, -12); addFloor(100, 0, 0);
    trackLength = segments.length * SEGMENT_L;

    // SCENARIO 1: FREE RIDE MODE DATA INJECTION (Your original 4-lane configuration)
    if (selectedGameMode === 'free') {
        let totalCars = 30;
        const lanePositions = [-0.75, -0.25, 0.25, 0.75];
        for (let i = 0; i < totalCars; i++) {
            let isSouthbound = Math.random() > 0.5; 
            let laneIdx = isSouthbound ? (Math.random() > 0.5 ? 0 : 1) : (Math.random() > 0.5 ? 2 : 3);
            let spawnPos = Math.random() * trackLength;
            if (!isSouthbound && spawnPos < 2000) spawnPos += 2000; 

            cars.push({
                position: spawnPos, targetLaneX: lanePositions[laneIdx], x: lanePositions[laneIdx], lane: laneIdx,
                heading: isSouthbound ? 'south' : 'north', baseSpeed: isSouthbound ? (MAX_SPEED * 0.25) : (MAX_SPEED * 0.35 + Math.random() * 2000),
                speed: isSouthbound ? (MAX_SPEED * 0.25) : (MAX_SPEED * 0.35 + Math.random() * 2000), color: isSouthbound ? '#ff3366' : '#ffff00', width: 0.25, isEvading: false, evadeTimer: 0
            });
        }
    } 
    // SCENARIO 2: CAREER RIVAL GRIDS MODE DATA INJECTION (3 lanes, all North)
    else {
        // Build regular background civilian traffic flow arrays first
        let totalTraffic = 20;
        const careerLanes = [-0.6, 0, 0.6]; // 3 lanes perfectly aligned horizontally
        for (let i = 0; i < totalTraffic; i++) {
            let laneIdx = Math.floor(Math.random() * 3);
            cars.push({
                position: 3000 + Math.random() * (trackLength - 4000), targetLaneX: careerLanes[laneIdx], x: careerLanes[laneIdx], lane: laneIdx,
                heading: 'north', baseSpeed: MAX_SPEED * 0.25 + Math.random() * 1500, speed: MAX_SPEED * 0.25 + Math.random() * 1500,
                color: '#8a88af', width: 0.25, isEvading: false, evadeTimer: 0
            });
        }

        // --- IQ 300 CAREER MODE RANDOM SELECTOR ENGINE ---
        // Profile pool of 3 elite structural racers
        const profiles = [
            { name: 'BLAZE', color: '#ff0033', speed: MAX_SPEED * 0.88 },
            { name: 'VIPER', color: '#00ff66', speed: MAX_SPEED * 0.85 },
            { name: 'SHADOW', color: '#aa00ff', speed: MAX_SPEED * 0.92 }
        ];
        
        // Randomly pick count: 1 rival or 2 rivals
        let opponentCount = Math.random() > 0.5 ? 1 : 2;
        // Shuffle profile selection
        let shuffledProfiles = profiles.sort(() => 0.5 - Math.random());

        for (let i = 0; i < opponentCount; i++) {
            let choice = shuffledProfiles[i];
            let assignLane = i === 0 ? 0 : 2; // Separate their initial layouts to side lanes
            rivalRacers.push({
                name: choice.name, x: careerLanes[assignLane], position: 1000 + (i * 400), 
                speed: choice.speed, color: choice.color, width: 0.26, lane: assignLane
            });
        }
    }
}

function startGame() {
    initAudio(); document.getElementById('menu').classList.add('hidden');
    buildTrack();
    position = 0; playerX = (selectedGameMode === 'career') ? 0 : 0.5; // Center start for 3-lanes
    speed = 3000; score = 0; screenShake = 0; crashSpin = 0; crashTimer = 0; carRotation = 0; carLean = 0;
    particles = []; gameActive = true;
}

function triggerCrash(isHeadOn) {
    screenShake = isHeadOn ? 45 : 20; crashTimer = 1.5; crashSpin = isHeadOn ? 24 : 12; speed = 0;
    setTimeout(() => { if(gameActive) document.getElementById('menu').classList.remove('hidden'); }, 800);
    for (let i = 0; i < 40; i++) {
        particles.push({
            x: WIDTH / 2 + (Math.random() - 0.5) * 80, y: HEIGHT - 60 + (Math.random() - 0.5) * 40,
            vx: (Math.random() - 0.5) * 32, vy: (Math.random() - 0.5) * 24 - 4, alpha: 1.0, color: '#ff0055'
        });
    }
}

function update(dt) {
    if (!gameActive) return;

    if (screenShake > 0) screenShake -= dt * 50;
    if (screenShake < 0) screenShake = 0;

    if (crashTimer > 0) {
        crashTimer -= dt; carRotation += crashSpin * dt; speed = Math.max(0, speed - dt * 5500); position = (position + speed * dt) % trackLength;
        cars.forEach(car => {
            if (car.heading === 'south') car.position = (car.position - car.speed * dt + trackLength) % trackLength;
            else car.position = (car.position + car.speed * dt) % trackLength;
        });
        rivalRacers.forEach(rival => rival.position = (rival.position + rival.speed * dt) % trackLength);
        updateParticles(dt); return;
    }

    if (speed > 100) score += (speed / 1000);
    document.getElementById('score-val').innerText = Math.floor(score).toString().padStart(5, '0');
    document.getElementById('speed-val').innerText = Math.round(speed / 100);

    position = (position + speed * dt) % trackLength;
    const currentSegment = findSegment(position);
    const speedPercent = speed / MAX_SPEED;

    const steeringSpeed = 3.4 * (speedPercent + 0.15);
    let targetRotation = 0, targetLean = 0;

    if (keys.left) { playerX -= dt * steeringSpeed; targetRotation = -0.18; targetLean = -12; } 
    else if (keys.right) { playerX += dt * steeringSpeed; targetRotation = 0.18; targetLean = 12; }

    carRotation += (targetRotation - carRotation) * dt * 8;
    carLean += (targetLean - carLean) * dt * 8;

    playerX = playerX - (dt * speedPercent * currentSegment.curve * 1.2);
    if (!keys.left && !keys.right && speed > 0) playerX -= (playerX * dt * 1.5);

    if (keys.up) speed += ACCEL * dt; else if (keys.down) speed += BREAKING * dt; else speed += DECEL * dt;

    // Bound limits adjust depending on structural track dimensions widths
    let edgeBound = (selectedGameMode === 'career') ? 1.1 : 1.6;
    if (playerX < -edgeBound) playerX = -edgeBound; if (playerX > edgeBound) playerX = edgeBound;
    if (Math.abs(playerX) > (edgeBound - 0.45)) { if (speed > 2000) speed += OFF_ROAD_DECEL * dt; }

    // --- PROCEDURAL REAR DETECTION AND CIVILIAN TRAFFIC HANDLING CONTROLLERS ---
    cars.forEach(car => {
        let oldSeg = findSegment(car.position);
        if (car.heading === 'south') car.position = (car.position - car.speed * dt + trackLength) % trackLength;
        else car.position = (car.position + car.speed * dt) % trackLength;
        let newSeg = findSegment(car.position);

        if (car.heading === 'north') {
            let relativeDist = position - car.position; if (relativeDist < 0) relativeDist += trackLength; 
            if (relativeDist > (trackLength - 1200) && relativeDist < trackLength && Math.abs(playerX - car.x) < 0.4) {
                car.speed = Math.max(1000, speed - 1500); 
                if (selectedGameMode === 'free') car.lane = (playerX > 0) ? 2 : 3;
            } else { car.speed = car.baseSpeed; }

            if (keys.space) {
                let distanceAhead = car.position - position; if (distanceAhead < 0) distanceAhead += trackLength;
                if (distanceAhead > 0 && distanceAhead < 3500 && Math.abs(playerX - car.x) < 0.35) {
                    car.isEvading = true; car.evadeTimer = 2.0; 
                    if (selectedGameMode === 'free') {
                        if (car.lane === 2) car.targetLaneX = 0.75; else if (car.lane === 3) car.targetLaneX = 0.25;
                    } else { // Career mode 3-lane dodge routing
                        if (car.lane === 1) car.targetLaneX = 0.6; else if (car.lane === 0) car.targetLaneX = 0;
                    }
                }
            }
        }

        if (car.isEvading) {
            car.x += (car.targetLaneX - car.x) * dt * 4; car.evadeTimer -= dt; if (car.evadeTimer <= 0) car.isEvading = false;
        } else {
            const defaultLanes = (selectedGameMode === 'career') ? [-0.6, 0, 0.6] : [-0.75, -0.25, 0.25, 0.75];
            car.targetLaneX = defaultLanes[car.lane]; car.x += (car.targetLaneX - car.x) * dt * 2.5;
        }

        // Collision Check Civil Base Block
        if (oldSeg.index === currentSegment.index && Math.abs(playerX - car.x) < (car.width + 0.16)) {
            let headOn = (car.heading === 'south');
            let distanceAhead = car.position - position; if (distanceAhead < 0) distanceAhead += trackLength;
            if (headOn || (distanceAhead < 400 || distanceAhead > (trackLength - 400))) {
                triggerCrash(headOn);
                car.position = headOn ? (car.position - 800 + trackLength) % trackLength : (car.position + 800) % trackLength;
            }
        }
    });

    // --- NEW: DYNAMIC ELITE RIVAL AI HANDLING SYSTEM ---
    rivalRacers.forEach(rival => {
        let oldSeg = findSegment(rival.position);
        rival.position = (rival.position + rival.speed * dt) % trackLength;
        
        // Smart Overtaking Logic: If an AI opponent gets blocked by civilian traffic, it shifts lanes
        cars.forEach(civil => {
            let distanceBetween = civil.position - rival.position;
            if (distanceBetween > 0 && distanceBetween < 800 && Math.abs(rival.x - civil.x) < 0.3) {
                // Change target lane index to dodge
                rival.lane = (rival.lane + 1) % 3;
            }
        });

        // Ease smoothly to position lane centers
        const careerLanes = [-0.6, 0, 0.6];
        rival.x += (careerLanes[rival.lane] - rival.x) * dt * 3;

        // Collision Check Against Rival Racers
        if (oldSeg.index === currentSegment.index && Math.abs(playerX - rival.x) < (rival.width + 0.16)) {
            triggerCrash(false);
            rival.position = (rival.position + 1000) % trackLength;
        }
    });

    if (speed > MAX_SPEED) speed = MAX_SPEED; if (speed < 0) speed = 0;
    updateParticles(dt);
}

function updateParticles(dt) {
    particles.forEach((p, i) => { p.x += p.vx; p.y += p.vy; p.alpha -= dt * 1.5; if (p.alpha <= 0) particles.splice(i, 1); });
}

function render() {
    ctx.save();
    if (screenShake > 0) ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    let gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT / 2);
    gradient.addColorStop(0, '#010004'); gradient.addColorStop(0.6, '#140014'); gradient.addColorStop(1, '#ff0055');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, WIDTH, HEIGHT / 2);

    const baseSegment = findSegment(position);
    let maxy = HEIGHT; let x = 0, dx = 0;

    for (let n = 0; n < DRAW_DISTANCE; n++) {
        const segment = segments[(baseSegment.index + n) % segments.length];
        const looped = segment.index < baseSegment.index;
        const cameraX = playerX * ROAD_W; const cameraY = CAMERA_H + baseSegment.world.y; const cameraZ = position - (looped ? trackLength : 0);

        segment.p1 = { world: { x: segment.world.x, y: segment.world.y, z: segment.world.z }, screen: {}, scale: 0 };
        project(segment.p1, cameraX - x, cameraY, cameraZ, segment.p1);
        x += dx; dx += segment.curve;

        if (segment.p1.screen.y >= maxy || segment.p1.screen.z <= CAM_DEPTH) continue;

        if (n > 0) {
            const prev = segments[(baseSegment.index + n - 1) % segments.length];
            const p1 = prev.p1; const p2 = segment.p1;
            if (p2.screen.y >= p1.screen.y) continue;

            drawPolygon(p1.screen.x, p1.screen.y, p1.screen.w * 2.5, p2.screen.x, p2.screen.y, p2.screen.w * 2.5, segment.color.grass);
            drawPolygon(p1.screen.x, p1.screen.y, p1.screen.w * 1.06, p2.screen.x, p2.screen.y, p2.screen.w * 1.06, segment.color.rumble);
            drawPolygon(p1.screen.x, p1.screen.y, p1.screen.w, p2.screen.x, p2.screen.y, p2.screen.w, segment.color.road);

            // Conditional Center Guard Separator Line Rendering
            if (selectedGameMode === 'free') {
                let railW1 = p1.screen.w * 0.015, railW2 = p2.screen.w * 0.015;
                drawPolygon(p1.screen.x, p1.screen.y, railW1, p2.screen.x, p2.screen.y, railW2, segment.color.barrier);

                if (segment.color.lane !== segment.color.road) {
                    let lanew1 = p1.screen.w / 65, lanew2 = p2.screen.w / 65;
                    drawPolygon(p1.screen.x - p1.screen.w * 0.5, p1.screen.y, lanew1, p2.screen.x - p2.screen.w * 0.5, p2.screen.y, lanew2, segment.color.lane);
                    drawPolygon(p1.screen.x + p1.screen.w * 0.5, p1.screen.y, lanew1, p2.screen.x + p2.screen.w * 0.5, p2.screen.y, lanew2, segment.color.lane);
                }
            } else {
                // Render 3 lanes markers instead (Two splitting white dashed strips inside road borders)
                if (segment.color.lane !== segment.color.road) {
                    let lanew1 = p1.screen.w / 70, lanew2 = p2.screen.w / 70;
                    drawPolygon(p1.screen.x - p1.screen.w * 0.33, p1.screen.y, lanew1, p2.screen.x - p2.screen.w * 0.33, p2.screen.y, lanew2, '#ffffff');
                    drawPolygon(p1.screen.x + p1.screen.w * 0.33, p1.screen.y, lanew1, p2.screen.x + p2.screen.w * 0.33, p2.screen.y, lanew2, '#ffffff');
                }
            }
            maxy = p1.screen.y;
        }
    }

    // Depth sorting loop for all cars + newly added rival positions arrays
    for (let n = DRAW_DISTANCE - 1; n > 0; n--) {
        const segment = segments[(baseSegment.index + n) % segments.length];
        if (!segment.p1) continue;

        // Render civilian regular entries
        cars.forEach(car => {
            let carSegment = findSegment(car.position);
            if (carSegment.index === segment.index) {
                const scale = segment.p1.scale;
                const carScaleX = segment.p1.screen.x + (scale * car.x * ROAD_W * WIDTH / 2);
                const carScaleY = segment.p1.screen.y;
                drawTrafficCar(carScaleX, carScaleY, scale, car.color, car.heading === 'south');
            }
        });

        // Render Elite Career Adversaries
        rivalRacers.forEach(rival => {
            let rivalSegment = findSegment(rival.position);
            if (rivalSegment.index === segment.index) {
                const scale = segment.p1.scale;
                const rScaleX = segment.p1.screen.x + (scale * rival.x * ROAD_W * WIDTH / 2);
                const rScaleY = segment.p1.screen.y;
                drawTrafficCar(rScaleX, rScaleY, scale, rival.color, false);
                
                // Overlay text badges directly on top of opponent roofs
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${Math.max(10, Math.round(30 * scale))}px Orbitron`;
                ctx.textAlign = 'center';
                ctx.fillText(rival.name, rScaleX, rScaleY - Math.round(240 * scale));
            }
        });
    }

    drawPlayerCar();

    particles.forEach(p => {
        ctx.save(); ctx.globalAlpha = p.alpha; ctx.fillStyle = p.color; ctx.shadowBlur = 10; ctx.shadowColor = p.color;
        ctx.fillRect(p.x, p.y, 7, 7); ctx.restore();
    });
    ctx.restore();
}

function drawPolygon(x1, y1, w1, x2, y2, w2, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x1 - w1, y1); ctx.lineTo(x2 - w2, y2); ctx.lineTo(x2 + w2, y2); ctx.lineTo(x1 + w1, y1); ctx.closePath(); ctx.fill();
}

function drawTrafficCar(x, y, scale, color, isOncoming) {
    const carW = Math.round(440 * scale * (WIDTH / 2)); const carH = Math.round(220 * scale * (WIDTH / 2));
    if (carW < 2) return;
    ctx.save(); ctx.translate(x, y - carH); ctx.shadowBlur = 12; ctx.shadowColor = color;
    ctx.fillStyle = '#09090e'; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, scale * 4);
    ctx.beginPath(); ctx.moveTo(-carW/2, carH); ctx.lineTo(-carW/3, carH*0.2); ctx.lineTo(carW/3, carH*0.2); ctx.lineTo(carW/2, carH); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = isOncoming ? '#ffffff' : '#ff0033'; ctx.shadowColor = ctx.fillStyle;
    ctx.fillRect(-carW/2 + 3, carH - carH*0.3, carW*0.16, carH*0.15); ctx.fillRect(carW/2 - 3 - carW*0.16, carH - carH*0.3, carW*0.16, carH*0.15);
    ctx.restore();
}

function drawPlayerCar() {
    const carX = WIDTH / 2; const carY = HEIGHT - 40;
    ctx.save(); ctx.translate(carX, carY - 20); ctx.rotate(carRotation);
    ctx.shadowBlur = 20; ctx.shadowColor = playerNeonColor; ctx.fillStyle = '#060810'; ctx.strokeStyle = playerNeonColor; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-55 + carLean, 20); ctx.lineTo(-70 + carLean, -2); ctx.lineTo(70 + carLean, -2); ctx.lineTo(55 + carLean, 20); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0f1322'; ctx.beginPath(); ctx.moveTo(-26, -2); ctx.lineTo(-16, -26); ctx.lineTo(16, -26); ctx.lineTo(26, -2); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (speed > 0 || crashTimer > 0) {
        ctx.shadowColor = '#ff007f'; ctx.fillStyle = '#ff007f';
        let tH = crashTimer > 0 ? Math.random() * 6 : (12 + (speed / MAX_SPEED) * 24);
        ctx.fillRect(-38 + carLean, 20, 16, tH); ctx.fillRect(22 + carLean, 20, 16, tH);
    }
    ctx.restore();
}

let lastTime = performance.now();
function frame(now) {
    let dt = (now - lastTime) / 1000; if (dt > 0.5) dt = 0.5; lastTime = now;
    update(dt); render(); requestAnimationFrame(frame);
}

buildTrack(); render(); requestAnimationFrame(frame);
