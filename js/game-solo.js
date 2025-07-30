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
let bird = { x: 150, y: window.innerHeight / 2, velocity: 0 }; // Center start
let gravity = 0.25;
let score = 0;
let timer = 30;
let gameOver = false;
let gameStarted = false;
let assetsLoaded = false;
let webcamReady = false;

let pipes = [];
const pipeWidthRatio = 0.08;
const pipeGapRatio = 0.4;
let pipeSpeed = 3;
let pipeSpawnInterval = 150;
let frameCount = 0;
const pipeScale = 0.6;
const birdScale = 2.5;
let stopped = false;

// =========================
// Assets
// =========================
const groundImg = document.getElementById('ground');
const birdImg = document.getElementById('bird1');
const pipeTipImg = document.getElementById('pipeTip');
const pipeBodyImg = document.getElementById('pipeBody');

const birdWidth = 40;
const birdHeight = 30;
const groundHeight = 160;

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
const cloudCount = 6;         // number of clouds on screen
const cloudSpeed = 0.5;       // slow movement for parallax

function spawnClouds() {
  clouds = [];
  for (let i = 0; i < cloudCount; i++) {
    const img = cloudImages[Math.floor(Math.random() * cloudImages.length)];
    clouds.push({
      img: img,
      x: Math.random() * canvas.width,
      y: Math.random() * (canvas.height / 2), // top half only
      speed: cloudSpeed + Math.random() * 0.5,
      scale: 0.5 + Math.random() * 0.5,
    });
  }
}

// =========================
// Prep Countdown
// =========================
function startPreparationCountdown() {
  let prepCountdown = 3;
  prepCountdownEl.textContent = prepCountdown;
  prepCountdownEl.classList.add('show');

  const countdownInterval = setInterval(() => {
    prepCountdown--;
    if (prepCountdown > 0) {
      prepCountdownEl.textContent = prepCountdown;
    } else {
      prepCountdownEl.textContent = 'GO!';
      clearInterval(countdownInterval);

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
// Controls
// =========================
function flapInternal() {
  if (!gameStarted) return;
  bird.velocity = -8;
}
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') flapInternal();
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
  bgm.play().catch(() => console.log('Autoplay blocked'));
  startTimer();
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
  bird.velocity += gravity;
  bird.y += bird.velocity;

  const groundY = canvas.height - groundHeight;

  // Ceiling
  if (bird.y - birdHeight / 2 <= 0) {
    bird.y = birdHeight / 2;
    bird.velocity = 0;
  }

  // Floor
  if (bird.y + birdHeight / 2 >= groundY) {
    bird.y = groundY - birdHeight / 2;
    bird.velocity = 0;
    freezePipesTemporarily();
  }

  // Pipes
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

  // Collisions
  const birdLeft = bird.x - birdWidth / 2;
  const birdRight = bird.x + birdWidth / 2;
  const birdTop = bird.y - birdHeight / 2;
  const birdBottom = bird.y + birdHeight / 2;

  for (let pipe of pipes) {
    const pipeWidth = canvas.width * pipeWidthRatio * pipeScale;
    const pipeLeft = pipe.x;
    const pipeRight = pipe.x + pipeWidth;
    const topPipeBottom = pipe.topHeight;
    const bottomPipeTop = pipe.topHeight + pipe.gapHeight;

    const topRect = { left: pipeLeft, right: pipeRight, top: 0, bottom: topPipeBottom };
    const bottomRect = { left: pipeLeft, right: pipeRight, top: bottomPipeTop, bottom: groundY };

    if (birdRight > topRect.left && birdLeft < topRect.right &&
        birdBottom > topRect.top && birdTop < topRect.bottom) {
      resolveCollision(topRect);
      freezePipesTemporarily();
    }
    if (birdRight > bottomRect.left && birdLeft < bottomRect.right &&
        birdBottom > bottomRect.top && birdTop < bottomRect.bottom) {
      resolveCollision(bottomRect);
      freezePipesTemporarily();
    }
  }
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
  if (minOverlap === overlapLeft) bird.x -= overlapLeft;
  else if (minOverlap === overlapRight) bird.x += overlapRight;
  else if (minOverlap === overlapTop) bird.y -= overlapTop;
  else if (minOverlap === overlapBottom) bird.y += overlapBottom;
  bird.velocity = 0;
}

// =========================
// Draw
// =========================
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Sky
  ctx.fillStyle = '#70c5ce';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // === Clouds ===
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

  drawPipes();
  drawImageProportional(birdImg, bird.x, bird.y, 40 * birdScale, 30 * birdScale);
  drawGround();
}

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
    ctx.drawImage(pipeBodyImg, pipe.x, 0, pipeWidth, pipe.topHeight);
    ctx.drawImage(pipeTipImg, pipe.x, pipe.topHeight - pipeTipHeight, pipeWidth, pipeTipHeight);
    const bottomY = pipe.topHeight + pipe.gapHeight;
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

  const overlay = document.createElement('div');
  overlay.style = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.85);display:flex;
    justify-content:center;align-items:center;
    z-index:2000;
  `;

  overlay.innerHTML = `
    <div class="lobby-container" style="text-align:center;color:white;">
      <h1 style="font-size:48px;margin-bottom:20px;">Time is up!</h1>
      <p style="font-size:28px;margin-bottom:30px;">Your Score: ${finalScore}</p>
      <button id="playAgain">Play Again</button>
      <button id="exitBtn">Exit</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('playAgain').onclick = () => {
    window.location.href = 'solo.html';
  };
  document.getElementById('exitBtn').onclick = () => {
    window.location.href = 'index.html';
  };
}

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
  bgm.play();
  startPreparationCountdown();
}

// ✅ Export flap function for motion-solo.js
window.flapInternal = flapInternal;
