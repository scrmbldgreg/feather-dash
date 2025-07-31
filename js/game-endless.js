// =========================
// DOM Elements
// =========================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const webcam = document.getElementById('webcam');
const scoreDisplay = document.getElementById('scoreDisplay');
const prepCountdownEl = document.getElementById('prepCountdown');
const bgm = document.getElementById('bgm');
bgm.volume = 0.3;

// =========================
// Game State
// =========================
let bird = { x: 150, y: window.innerHeight / 2, velocity: -2 };
let gravity = 0.5;
let score = 0;
let gameOver = false;
let gameStarted = false;
let assetsLoaded = false;
let webcamReady = false;

let pipes = [];
const pipeGapRatio = 0.4;
let pipeSpeed = 5;
let pipeSpawnInterval = 150;
let frameCount = 0;
const pipeScale = 0.6;
const birdWidth = 80;
const birdHeight = 80;
const groundHeight = 160;
let stopped = false;

// =========================
// Assets
// =========================
const groundImg = document.getElementById('ground');
const birdImg = document.getElementById('bird1');
const pipeTipImg = document.getElementById('pipeTip');
const pipeBodyImg = document.getElementById('pipeBody');

// =========================
// Clouds
// =========================
const cloudImages = [
  document.getElementById('cloud1'),
  document.getElementById('cloud2'),
  document.getElementById('cloud3'),
  document.getElementById('cloud4'),
  document.getElementById('cloud5'),
  document.getElementById('cloud6'),
  document.getElementById('cloud7'),
  document.getElementById('cloud8'),
];

let clouds = [];
const cloudCount = 6;
const cloudSpeed = 0.5;

function spawnClouds() {
  clouds = [];
  for (let i = 0; i < cloudCount; i++) {
    const img = cloudImages[Math.floor(Math.random() * cloudImages.length)];
    clouds.push({
      img,
      x: Math.random() * canvas.width,
      y: Math.random() * (canvas.height / 2),
      speed: cloudSpeed + Math.random() * 0.5,
      scale: 0.5 + Math.random() * 0.5,
    });
  }
}

// =========================
// Prep Countdown
// =========================
function startPreparationCountdown() {
  let prepCountdown = 5;
  prepCountdownEl.textContent = prepCountdown;
  prepCountdownEl.classList.add('show');

  const countdownAudio = new Audio('assets/countdown.mp3'); // <-- your file
  countdownAudio.currentTime = 0;
  countdownAudio.play().catch(() => {}); // play the 5s countdown audio once

  const countdownInterval = setInterval(() => {
    if (prepCountdown > 1) {
      prepCountdown--;
      prepCountdownEl.textContent = prepCountdown;
    } else {
      clearInterval(countdownInterval);
      prepCountdownEl.textContent = 'GO!';

      setTimeout(() => {
        prepCountdownEl.classList.remove('show');
        prepCountdownEl.classList.add('hide');
        startGame();
      }, 1000);
    }
  }, 1000);
}




// =========================
// Preload Assets
// =========================
function preloadAssets() {
  const assets = [groundImg, birdImg, pipeTipImg, pipeBodyImg];
  let loadedCount = 0;

  assets.forEach((img) => {
    if (img.complete) {
      loadedCount++;
      if (loadedCount === assets.length) markAssetsLoaded();
    } else {
      img.onload = () => {
        loadedCount++;
        if (loadedCount === assets.length) markAssetsLoaded();
      };
    }
  });
}

function markAssetsLoaded() {
  assetsLoaded = true;
  tryStartGame();
}
preloadAssets();

// =========================
// Webcam Setup
// =========================
navigator.mediaDevices
  .getUserMedia({ video: true })
  .then((stream) => {
    webcam.srcObject = stream;
    webcam.addEventListener('canplay', () => {
      webcamReady = true;
      tryStartGame();
    });
  })
  .catch((err) => {
    console.error('❌ Webcam error:', err);
    alert('Webcam access is required to play!');
  });

// =========================
// Motion Detection
// =========================
const motionCanvas = document.getElementById('motionCanvas');
const motionCtx = motionCanvas.getContext('2d');

let lastFrame = null;
let motionThreshold = 1000;
let cooldown = false;
let cooldownTime = 200;

function detectMotion() {
  if (!webcamReady || !gameStarted || webcam.videoWidth === 0) {
    requestAnimationFrame(detectMotion);
    return;
  }

  motionCanvas.width = webcam.videoWidth / 6;
  motionCanvas.height = webcam.videoHeight / 6;

  motionCtx.drawImage(webcam, 0, 0, motionCanvas.width, motionCanvas.height);
  const frame = motionCtx.getImageData(0, 0, motionCanvas.width, motionCanvas.height);

  if (lastFrame) {
    let motionScore = 0;
    for (let i = 0; i < frame.data.length; i += 4) {
      const avg = (frame.data[i] + frame.data[i + 1] + frame.data[i + 2]) / 3;
      const prevAvg = (lastFrame.data[i] + lastFrame.data[i + 1] + lastFrame.data[i + 2]) / 3;
      if (Math.abs(avg - prevAvg) > 20) motionScore++;
    }

    if (motionScore > motionThreshold && !cooldown) {
      flap();
      cooldown = true;
      setTimeout(() => (cooldown = false), cooldownTime);
    }
  }

  lastFrame = frame;
  requestAnimationFrame(detectMotion);
}
detectMotion();

// =========================
// Controls
// =========================
function flap() {
  if (!gameStarted || gameOver) return;
  bird.velocity = -8;
}
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') flap();
});

// =========================
// Game Logic
// =========================
function tryStartGame() {
  if (gameStarted) return;
  if (assetsLoaded && webcamReady) {
    spawnClouds();
    startPreparationCountdown();
  }
}

function startGame() {
  gameStarted = true;
  bgm.currentTime = 0;
  bgm.play().catch(() => console.log('Autoplay blocked'));

  const gapHeight = canvas.height * pipeGapRatio;
  const topHeight = Math.random() * (canvas.height - gapHeight - groundHeight);
  pipes.push({ x: canvas.width, topHeight, gapHeight, scored: false });

  gameLoop();
}

function gameLoop() {
  if (gameOver) return;
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

function update() {
  bird.velocity += gravity;
  bird.y += bird.velocity;
  const groundY = canvas.height - groundHeight;

  // Floor collision = Game Over
  if (bird.y + birdHeight / 2 >= groundY) {
    bird.y = groundY - birdHeight / 2;
    endGame();
    return;
  }

  // Pipe spawning
  if (!stopped) {
    frameCount++;
    if (frameCount % pipeSpawnInterval === 0) {
      const gapHeight = canvas.height * pipeGapRatio;
      const topHeight = Math.random() * (canvas.height - gapHeight - groundHeight);
      pipes.push({ x: canvas.width, topHeight, gapHeight, scored: false });
    }

    pipes.forEach((pipe) => {
      pipe.x -= pipeSpeed;

      if (!pipe.scored && bird.x > pipe.x + pipeBodyImg.naturalWidth * pipeScale) {
        score++;
        scoreDisplay.textContent = `Score: ${score}`;
        pipe.scored = true;
        pipeSpeed = 3 + Math.floor(score / 5);
      }
    });

    pipes = pipes.filter((pipe) => pipe.x + pipeBodyImg.naturalWidth * pipeScale > 0);
  }

  // Pipe collision detection
  const birdRect = {
    left: bird.x - birdWidth / 2,
    right: bird.x + birdWidth / 2,
    top: bird.y - birdHeight / 2,
    bottom: bird.y + birdHeight / 2,
  };

  for (let pipe of pipes) {
    const pipeWidth = pipeBodyImg.naturalWidth * pipeScale;
    const pipeLeft = pipe.x;
    const pipeRight = pipe.x + pipeWidth;

    const topRect = { left: pipeLeft, right: pipeRight, top: 0, bottom: pipe.topHeight };
    const bottomRect = {
      left: pipeLeft,
      right: pipeRight,
      top: pipe.topHeight + pipe.gapHeight,
      bottom: groundY,
    };

    if (intersects(birdRect, topRect) || intersects(birdRect, bottomRect)) {
      endGame();
      return;
    }
  }
}

function intersects(a, b) {
  return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
}

// =========================
// Draw
// =========================
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#70c5ce';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  clouds.forEach((cloud) => {
    cloud.x -= cloud.speed;
    if (cloud.x + cloud.img.naturalWidth * cloud.scale < 0) {
      cloud.x = canvas.width;
      cloud.y = Math.random() * (canvas.height / 2);
      cloud.img = cloudImages[Math.floor(Math.random() * cloudImages.length)];
    }
    const w = cloud.img.naturalWidth * cloud.scale;
    const h = cloud.img.naturalHeight * cloud.scale;
    ctx.drawImage(cloud.img, cloud.x, cloud.y, w, h);
  });

  drawPipes();
  ctx.drawImage(birdImg, bird.x - birdWidth / 2, bird.y - birdHeight / 2, birdWidth, birdHeight);
  drawGround();
}

function drawPipes() {
  const pipeWidth = pipeBodyImg.naturalWidth * pipeScale;
  const pipeTipHeight = pipeTipImg.naturalHeight * pipeScale;

  pipes.forEach((pipe) => {
    const gapHeight = pipe.gapHeight;

    ctx.drawImage(pipeBodyImg, pipe.x, 0, pipeWidth, pipe.topHeight);
    ctx.drawImage(pipeTipImg, pipe.x, pipe.topHeight - pipeTipHeight, pipeWidth, pipeTipHeight);

    const bottomY = pipe.topHeight + gapHeight;
    ctx.drawImage(pipeBodyImg, pipe.x, bottomY, pipeWidth, canvas.height - bottomY - groundHeight);
    ctx.drawImage(pipeTipImg, pipe.x, bottomY, pipeWidth, pipeTipHeight);
  });
}

function drawGround() {
  const groundRows = 3;
  const rowHeight = groundHeight / groundRows;
  const groundY = canvas.height - groundHeight;

  const pattern = ctx.createPattern(groundImg, 'repeat');
  ctx.fillStyle = pattern;

  for (let i = 0; i < groundRows; i++) {
    ctx.fillRect(0, groundY + i * rowHeight, canvas.width, rowHeight);
  }
}

const volumeBtn = document.getElementById('volumeBtn');
let volumeLevels = [0.25, 0.5, 0.75, 1, 0]; // 0 = mute
let volumeIcons = ['🔉', '🔉', '🔊', '🔊', '🔇']; // simple icon cycle
let currentVolumeIndex = 3; // start at 100% volume

volumeBtn.addEventListener('click', () => {
  currentVolumeIndex = (currentVolumeIndex + 1) % volumeLevels.length;
  const newVolume = volumeLevels[currentVolumeIndex];
  bgm.volume = newVolume;

  // Update button icon
  volumeBtn.textContent = volumeIcons[currentVolumeIndex];
});

// =========================
// Game Over
// =========================
function endGame() {
  gameOver = true;
  bgm.pause();
  showGameOverOverlay();
}

function showGameOverOverlay() {
  // Remove any existing overlay first
  const existing = document.getElementById('gameOverOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'gameOverOverlay';
  overlay.style = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.85);display:flex;
    justify-content:center;align-items:center;
    z-index:9999;
  `;

  overlay.innerHTML = `
    <div class="lobby-container" style="text-align:center;color:white;">
      <h1 style="font-size:48px;margin-bottom:20px;">Crash Landing</h1>
      <p style="font-size:28px;margin-bottom:30px;">Beak Points: ${score}</p>
      <div style="display:flex; justify-content:center; gap:20px;">
        <button id="playAgain" class="cta-button">Fly Again</button>
        <button id="exitBtn" class="cta-button">Fly Home</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('playAgain').onclick = () => window.location.reload();
  document.getElementById('exitBtn').onclick = () => (window.location.href = 'index.html');
}


// Export for motion detection
window.flapInternal = flap;
