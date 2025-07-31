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
const gameTimerEl = document.getElementById('timer');
const scoreDisplay = document.getElementById('scoreDisplay');
const prepCountdownEl = document.getElementById('prepCountdown');
const bgm = document.getElementById('bgm'); // Background Music
bgm.volume = 0.3;

// =========================
// Game State
// =========================
let bird = { x: 150, y: window.innerHeight / 2, velocity: -2 }; // Center start
let gravity = 0.5; // Adjusted for solo mode
let score = 0;
let timer = 60;
let gameOver = false;
let gameStarted = false;
let assetsLoaded = false;
let webcamReady = false;

let pipes = [];
const pipeWidthRatio = 0.08;
const pipeGapRatio = 0.4;
let pipeSpeed = 5;
let pipeSpawnInterval = 150;
let frameCount = 0;
const pipeScale = 0.6;
// The bird scale was directly applied in drawImageProportional, so birdWidth and birdHeight are the actual draw sizes.
const birdWidth = 80; // Adjusted to be closer to multiplayer's effective bird size
const birdHeight = 80; // Adjusted to be closer to multiplayer's effective bird size

const groundHeight = 160;
let stopped = false;

// =========================
// Assets
// =========================
const groundImg = document.getElementById('ground');
const birdImg = document.getElementById('bird1'); // Only bird1Img is needed for solo
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
  clouds = []; // Clear existing clouds
  for (let i = 0; i < cloudCount; i++) {
    const img = cloudImages[Math.floor(Math.random() * cloudImages.length)];
    clouds.push({
      img: img,
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
  // In solo, we don't need to precompute birdDrawWidth/Height as we use fixed birdWidth/Height for drawing directly.
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
const motionCanvas = document.getElementById('motionCanvas'); // Assuming this exists in solo.html
const motionCtx = motionCanvas.getContext('2d'); // Assuming this exists in solo.html

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
function flap() { // Renamed from flapInternal to flap for consistency with multiplayer
  if (!gameStarted) return;
  bird.velocity = -8;
  console.log("🐤 Flap triggered! Velocity:", bird.velocity);
}
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') flap();
});

// =========================
// Start Game Logic
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
  bgm.play().catch(() => console.log('Autoplay blocked')); // Added catch for autoplay issues
  startTimer();
  console.log("🎮 Game started");

  // Spawn the first pipe immediately
  const gapHeight = canvas.height * pipeGapRatio;
  const topHeight = Math.random() * (canvas.height - gapHeight - groundHeight);
  pipes.push({ x: canvas.width, topHeight, gapHeight, scored: false });

  gameLoop();
}

// =========================
// Game Loop
// =========================
function gameLoop() {
  if (gameOver) return;
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

// =========================
// Update Game
// =========================
function update() {
  // Bird physics
  bird.velocity += gravity;
  bird.y += bird.velocity;

  const groundY = canvas.height - groundHeight;

  // Ceiling collision
  if (bird.y - birdHeight / 2 <= 0) {
    bird.y = birdHeight / 2;
    bird.velocity = 0;
  }

  // Floor collision
  if (bird.y + birdHeight / 2 >= groundY) {
    bird.y = groundY - birdHeight / 2;
    bird.velocity = 0;
    freezePipesTemporarily();
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

      if (!pipe.scored && bird.x > pipe.x + canvas.width * pipeWidthRatio) {
        score++;
        scoreDisplay.textContent = `Score: ${score}`;
        pipe.scored = true;
        pipeSpeed = 3 + Math.floor(score / 5);
      }
    });

    pipes = pipes.filter((pipe) => pipe.x + canvas.width * pipeWidthRatio > 0);
  }

  // Pipe collision detection
  const birdLeft = bird.x - birdWidth / 2;
  const birdRight = bird.x + birdWidth / 2;
  const birdTop = bird.y - birdHeight / 2;
  const birdBottom = bird.y + birdHeight / 2;

  for (let pipe of pipes) {
    const pipeWidth = pipeBodyImg.naturalWidth * pipeScale; // Use actual image width for calculation
    const pipeLeft = pipe.x;
    const pipeRight = pipe.x + pipeWidth;

    const topPipeBottom = pipe.topHeight;
    const bottomPipeTop = pipe.topHeight + pipe.gapHeight;

    const topRect = { left: pipeLeft, right: pipeRight, top: 0, bottom: topPipeBottom };
    const bottomRect = { left: pipeLeft, right: pipeRight, top: bottomPipeTop, bottom: groundY };

    if (birdRight > topRect.left && birdLeft < topRect.right && birdBottom > topRect.top && birdTop < topRect.bottom) {
      resolveCollision(topRect);
      freezePipesTemporarily();
    }

    if (birdRight > bottomRect.left && birdLeft < bottomRect.right && birdBottom > bottomRect.top && birdTop < bottomRect.bottom) {
      resolveCollision(bottomRect);
      freezePipesTemporarily();
    }
  }

  // Clamp bird position (optional, but good for preventing bird from going off-screen)
  bird.x = Math.max(birdWidth / 2, Math.min(canvas.width - birdWidth / 2, bird.x));
  bird.y = Math.max(birdHeight / 2, Math.min(groundY - birdHeight / 2, bird.y));
}

function freezePipesTemporarily() {
  stopped = true;
  setTimeout(() => {
    stopped = false;
  }, 250);
}

function resolveCollision(rect) {
  const birdLeft = bird.x - birdWidth / 2;
  const birdRight = bird.x + birdWidth / 2;
  const birdTop = bird.y - birdHeight / 2;
  const birdBottom = bird.y + birdHeight / 2;

  const overlapLeft = birdRight - rect.left;
  const overlapRight = rect.right - birdLeft;
  const overlapTop = birdBottom - rect.top;
  const overlapBottom = rect.bottom - birdTop;

  const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

  if (minOverlap === overlapLeft) {
    bird.x -= overlapLeft;
    bird.velocity = 0;
  } else if (minOverlap === overlapRight) {
    bird.x += overlapRight;
    bird.velocity = 0;
  } else if (minOverlap === overlapTop) {
    bird.y -= overlapTop;
    bird.velocity = 0;
  } else if (minOverlap === overlapBottom) {
    bird.y += overlapBottom;
    bird.velocity = 0;
  }
}

// =========================
// Draw
// =========================
function draw() {
  // 1️⃣ Clear and draw sky
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#70c5ce';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2️⃣ Clouds
  clouds.forEach(cloud => {
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

  // 3️⃣ Pipes
  drawPipes();

  // 4️⃣ Draw bird
  ctx.drawImage(birdImg, bird.x - birdWidth / 2, bird.y - birdHeight / 2, birdWidth, birdHeight);


  // 5️⃣ Ground
  drawGround();
}

// This function is no longer strictly needed as bird is drawn directly with fixed birdWidth/Height
// but kept for consistency if other elements might use it.
function drawImageProportional(img, x, y, maxWidth, maxHeight) {
  const ratio = Math.min(maxWidth / img.naturalWidth, maxHeight / img.naturalHeight);
  const width = img.naturalWidth * ratio;
  const height = img.naturalHeight * ratio;
  ctx.drawImage(img, x - width / 2, y - height / 2, width, height);
}


function drawPipes() {
  const pipeWidth = pipeBodyImg.naturalWidth * pipeScale;
  const pipeTipHeight = pipeTipImg.naturalHeight * pipeScale;

  pipes.forEach((pipe) => {
    const gapHeight = pipe.gapHeight;

    // Top Pipe
    ctx.drawImage(pipeBodyImg, pipe.x, 0, pipeWidth, pipe.topHeight);
    ctx.drawImage(pipeTipImg, pipe.x, pipe.topHeight - pipeTipHeight, pipeWidth, pipeTipHeight);

    // Bottom Pipe
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

// =========================
// Timer
// =========================
function startTimer() {
  const interval = setInterval(() => {
    if (!gameOver && gameStarted) {
      timer--;
      gameTimerEl.textContent = timer;

      if (timer <= 0) {
        clearInterval(interval);
        gameOver = true;
        showWinnerOverlay(score);
      }
    }
  }, 1000);
}

// =========================
// Winner Overlay
// =========================
function showWinnerOverlay(finalScore) {
  bgm.pause(); // Stop music

  // Remove any existing overlay first
  const existing = document.getElementById('winnerOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'winnerOverlay';
  overlay.style = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.85);display:flex;
    justify-content:center;align-items:center;
    z-index:9999;
  `;

  overlay.innerHTML = `
    <div class="lobby-container" style="text-align:center;color:white;">
      <h1 style="font-size:48px;margin-bottom:20px;">Game Over!</h1>
      <p style="font-size:28px;margin-bottom:30px;">Score: ${score}</p>
      <div style="display:flex; justify-content:center; gap:20px;">
        <button id="playAgain" class="cta-button">Play Again</button>
        <button id="exitBtn" class="cta-button">Exit</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('playAgain').onclick = () => {
    // A simple page reload for "Play Again" in solo mode
    window.location.reload();
  };
  document.getElementById('exitBtn').onclick = () => {
    window.location.href = 'index.html';
  };
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
// Reset Game
// =========================
function resetGame() {
  bird = { x: 150, y: window.innerHeight / 2, velocity: 0 };
  pipes = [];
  score = 0;
  timer = 30;
  gameOver = false;
  stopped = false;
  scoreDisplay.textContent = `Score: 0`;
  gameTimerEl.textContent = timer;

  // Reset clouds
  spawnClouds();

  // Restart game
  bgm.currentTime = 0;
  bgm.play().catch(() => console.log('Autoplay blocked'));
  startPreparationCountdown();
}

// Export flap function for motion-solo.js (if still used externally)
window.flap = flap;