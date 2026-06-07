// --- Game Variables & State ---
let scene, camera, renderer;
let car, road, roadMaterial;
let obstacles = [];

// Normalized lowercase keys for input (WASD + Arrows)
let keys = { 
    arrowleft: false, a: false, 
    arrowright: false, d: false, 
    arrowup: false, w: false 
};

let speed = 0;
const maxSpeed = 1.5;
const acceleration = 0.02;
const friction = 0.01;
let score = 0;
let isGameOver = false;

const roadWidth = 10;
const trackLength = 100;

// Reusable Materials
const carShinyMaterial = new THREE.MeshPhongMaterial({
    color: 0x00aaff, // Polished electric blue
    shininess: 120,
    reflectivity: 0.9
});

// --- 1. Initialize Scene ---
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a0033); // Cyberpunk dark purple sky
    scene.fog = new THREE.FogExp2(0x1a0033, 0.015);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Position camera behind and slightly above where the car sits
    camera.position.set(0, 3, 7);
    camera.lookAt(0, 1, -5);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 10, 5);
    scene.add(directionalLight);

    createRoad();
    createPlayerCar();
    spawnObstacles();

    // Event Listeners
    window.addEventListener('keydown', (e) => handleInput(e, true));
    window.addEventListener('keyup', (e) => handleInput(e, false));
    window.addEventListener('resize', onWindowResize);

    animate();
}

// --- 2. Create Elements ---
function createRoad() {
    // Generate a procedural striped texture for the road
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Road base asphalt
    ctx.fillStyle = '#222233';
    ctx.fillRect(0, 0, 256, 256);
    // Side lines
    ctx.fillStyle = '#00ffcc';
    ctx.fillRect(0, 0, 15, 256);
    ctx.fillRect(241, 0, 15, 256);
    // Center dashed line
    ctx.fillStyle = '#ff0055';
    for (let i = 0; i < 256; i += 64) {
        ctx.fillRect(123, i + 16, 10, 32);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 10); // Repeat down the length of the track
    roadMaterial = texture;

    const roadGeo = new THREE.PlaneGeometry(roadWidth, trackLength);
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 });
    
    road = new THREE.Mesh(roadGeo, mat);
    road.rotation.x = -Math.PI / 2; // Lay flat
    road.position.z = -trackLength / 2 + 5; // Extend forward into the horizon
    scene.add(road);
}

function createPlayerCar() {
    car = new THREE.Group();

    // 1. The Main Body (The 'Chassis')
    const bodyGeo = new THREE.BoxGeometry(1.7, 0.5, 3.2); 
    const body = new THREE.Mesh(bodyGeo, carShinyMaterial);
    body.position.y = 0.5; // Lift it off the ground
    car.add(body);

    // 2. The Cabin (Gloss black windows)
    const cabinGeo = new THREE.BoxGeometry(1.3, 0.5, 1.8);
    const cabinMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 200, reflectivity: 1 }); 
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 1.0, -0.3); 
    car.add(cabin);

    // 3. The Wheels & Rims
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }); 
    const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16); 
    const rimMat = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, shininess: 100 });
    const rimGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.32, 8); 

    // Helper to generate a horizontal wheel
    const makeWheel = (x, y, z) => {
        const tireGroup = new THREE.Group();
        
        const tire = new THREE.Mesh(wheelGeometry, wheelMaterial);
        tireGroup.add(tire);
        
        const rim = new THREE.Mesh(rimGeometry, rimMat);
        tireGroup.add(rim);

        tireGroup.rotation.z = Math.PI / 2; // Lay horizontal
        tireGroup.position.set(x, y, z);
        car.add(tireGroup);
        return tireGroup; 
    };

    // Store wheel groups into userData so the animation loop can reach them
    car.userData.wheels = [
        makeWheel(1.0, 0.4, 1.2),  // Front Right
        makeWheel(-1.0, 0.4, 1.2), // Front Left
        makeWheel(1.0, 0.4, -1.2), // Back Right
        makeWheel(-1.0, 0.4, -1.2) // Back Left
    ];

    car.position.set(0, 0, 0);
    scene.add(car);
}

function spawnObstacles() {
    obstacles.forEach(obs => scene.remove(obs));
    obstacles = [];

    // Upgraded Core Materials for the Gate Components
    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0x222233, // Dark metallic graphite
        roughness: 0.5,
        metalness: 0.8
    });

    const neonMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff0055 // Saturated hot pink neon
    });

    const stripeMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffaa00 // Cyberpunk hazard yellow
    });

    // Component Geometries
    const pillarGeo = new THREE.BoxGeometry(0.2, 2.0, 0.4);   // Vertical pillars
    const barGeo = new THREE.BoxGeometry(1.8, 0.2, 0.4);      // Top crossbar frame
    const lightGeo = new THREE.BoxGeometry(1.6, 0.06, 0.42);  // Neon tube strip
    const stripeGeo = new THREE.BoxGeometry(0.22, 0.4, 0.42); // Base security bumper

    // Spacing 4 obstacle gates down the track
    for (let i = 0; i < 4; i++) {
        const gateGroup = new THREE.Group();

        // Left Pillar
        const leftPillar = new THREE.Mesh(pillarGeo, frameMaterial);
        leftPillar.position.set(-0.8, 1.0, 0);
        gateGroup.add(leftPillar);

        // Right Pillar
        const rightPillar = new THREE.Mesh(pillarGeo, frameMaterial);
        rightPillar.position.set(0.8, 1.0, 0);
        gateGroup.add(rightPillar);

        // Top Crossbar Frame
        const topBar = new THREE.Mesh(barGeo, frameMaterial);
        topBar.position.set(0, 2.0, 0);
        gateGroup.add(topBar);

        // Neon Light Accent
        const neonLight = new THREE.Mesh(lightGeo, neonMaterial);
        neonLight.position.set(0, 1.85, 0);
        gateGroup.add(neonLight);

        // Hazard Trim at the base of both pillars
        const leftStripe = new THREE.Mesh(stripeGeo, stripeMaterial);
        leftStripe.position.set(-0.8, 0.2, 0);
        gateGroup.add(leftStripe);

        const rightStripe = new THREE.Mesh(stripeGeo, stripeMaterial);
        rightStripe.position.set(0.8, 0.2, 0);
        gateGroup.add(rightStripe);

        gateGroup.userData = { rowIndex: i }; 
        
        resetObstacle(gateGroup);
        scene.add(gateGroup);
        obstacles.push(gateGroup);
    }
}

function resetObstacle(obs) {
    const lanes = [-3, 0, 3];
    
    obs.position.x = lanes[Math.floor(Math.random() * lanes.length)];
    obs.position.y = 0; // Sits flat flush on the asphalt
    
    // Forces obstacles to stay 30 units apart on Z-axis, stopping 3-lane blockades
    const index = obs.userData.rowIndex;
    obs.position.z = -60 - (index * 30); 
}

// --- 3. Game Loop & Logic ---
function handleInput(e, isPressed) {
    const keyName = e.key.toLowerCase();
    
    if (keyName in keys) {
        keys[keyName] = isPressed;
    }
    
    if (isGameOver && e.key === ' ') {
        resetGame();
    }
}

function resetGame() {
    isGameOver = false;
    speed = 0;
    score = 0;
    car.position.x = 0;
    document.getElementById('game-over').classList.add('hidden');
    obstacles.forEach(obs => resetObstacle(obs));
}

function animate() {
    requestAnimationFrame(animate);

    if (!isGameOver) {
        // 1. Acceleration (Up Arrow or W)
        if (keys.arrowup || keys.w) {
            speed = Math.min(speed + acceleration, maxSpeed);
        } else {
            speed = Math.max(speed - friction, 0);
        }

        // 2. Steering Left/Right (Arrows or A/D)
        if (keys.arrowleft || keys.a) {
            car.position.x -= 0.12;
            car.rotation.z = 0.05; // Subtle chassis tilt left
        } else if (keys.arrowright || keys.d) {
            car.position.x += 0.12;
            car.rotation.z = -0.05; // Subtle chassis tilt right
        } else {
            car.rotation.z = 0; 
        }
        
        // Clamp car to road boundaries
        car.position.x = Math.max(Math.min(car.position.x, 3.8), -3.8);

        // Spin Wheels forward relative to their local X axis orientation
        if (car.userData.wheels) {
            car.userData.wheels.forEach(wheelGroup => {
                wheelGroup.rotation.x += speed * 0.2; 
            });
        }

        // SCROLL THE WORLD: Offset road texture based on speed
        roadMaterial.offset.y += speed * 0.05;

        // MOVE OBSTACLES towards the player
        obstacles.forEach(obs => {
            obs.position.z += speed;

            // Box Collision Check (AABB)
            let carBox = new THREE.Box3().setFromObject(car);
            let obsBox = new THREE.Box3().setFromObject(obs);

            if (carBox.intersectsBox(obsBox)) {
                isGameOver = true;
                document.getElementById('game-over').classList.remove('hidden');
            }

            // Recycle obstacle if it goes behind the camera
            if (obs.position.z > 10) {
                resetObstacle(obs);
                score += 10;
            }
        });

        // Update UI
        document.getElementById('score').innerText = `Score: ${score}`;
        document.getElementById('speed').innerText = `Speed: ${Math.round(speed * 140)} km/h`;
    }

    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Start everything up
init();
