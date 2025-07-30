// =========================
// Firebase Init
// =========================
const db = firebase.firestore();

// =========================
// URL Params
// =========================
const urlParams = new URLSearchParams(window.location.search);
let lobbyCode = urlParams.get('lobby');
let playerId = urlParams.get('player') || Math.random().toString(36).substring(2, 9);
let playerName = decodeURIComponent(urlParams.get('name') || '');

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

// =========================
// Game State
// =========================
let bird = { x: 100, y: 300, velocity: 0 };
let gravity = 0.25;
let score = 0;
let timer = 90;
let gameOver = false;
let gameStarted = false;
let players = {};
let assetsLoaded = false;
let webcamReady = false;
let lobbyReady = false;

let pipes = [];
const pipeWidthRatio = 0.08;
const pipeGapRatio = 0.4;
let pipeSpeed = 3;
let pipeSpawnInterval = 150;
let frameCount = 0;
const pipeScale = 0.6;
const birdScale = 2.5;

let stunned = false;
let stunDuration = 1500;

// Firestore update throttle
let lastWriteTime = 0;
const writeInterval = 200;

let stopped = false;

// =========================
// Assets
// =========================
const groundImg = document.getElementById('ground');
const bird1Img = document.getElementById('bird1');
const bird2Img = document.getElementById('bird2');
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
const cloudCount = 6;
const cloudSpeed = 0.5;

function spawnClouds() {
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
  const assets = [groundImg, bird1Img, bird2Img, pipeTipImg, pipeBodyImg];
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
// Firestore Lobby Handling
// =========================
async function joinLobby() {
  const lobbyRef = db.collection('lobbies').doc(lobbyCode);

  try {
    const lobbyDoc = await lobbyRef.get();
    if (!lobbyDoc.exists) {
      alert('❌ Lobby does not exist!');
      return;
    }

    await lobbyRef.collection('players').doc(playerId).set({
      name: playerName,
      color: 'yellow',
      x: bird.x,
      y: bird.y,
      score: 0,
    });

    lobbyRef.collection('players').onSnapshot((snapshot) => {
      players = {};
      snapshot.forEach((doc) => {
        players[doc.id] = doc.data();
      });

      if (players[playerId]?.name) {
        playerName = players[playerId].name;
      }

      updateLeaderboard();
    });

    lobbyReady = true;
    tryStartGame();
  } catch (err) {
    console.error('❌ Lobby error:', err);
  }
}
joinLobby();

// =========================
// Controls
// =========================
function flap() {
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
  if (assetsLoaded && webcamReady && lobbyReady) {
    spawnClouds(); // 🌥️ spawn clouds once
    startPreparationCountdown();
  }
}

function startGame() {
  gameStarted = true;
  startTimer();
  console.log("🎮 Game started");
  
  // 🎵 Play BGM
  const bgm = document.getElementById('bgm');
  bgm.volume = 0.5;
  bgm.play().catch(err => console.warn("Audio autoplay blocked:", err));

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
    const pipeWidth = canvas.width * pipeWidthRatio * pipeScale;
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

  // Clamp
  bird.x = Math.max(birdWidth / 2, Math.min(canvas.width - birdWidth / 2, bird.x));
  bird.y = Math.max(birdHeight / 2, Math.min(groundY - birdHeight / 2, bird.y));

  // Firestore Updates
  const now = Date.now();
  if (now - lastWriteTime >= writeInterval) {
    lastWriteTime = now;
    db.collection('lobbies')
      .doc(lobbyCode)
      .collection('players')
      .doc(playerId)
      .update({ x: bird.x, y: bird.y, score: score });
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
  // 1️⃣ Clear and draw sky first
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#70c5ce'; 
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2️⃣ Clouds (draw after background)
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

  // 3️⃣ Pipes, Birds, Ground
  drawPipes();

  for (const [id, p] of Object.entries(players)) {
    const img = id === playerId ? bird1Img : bird2Img;
    if (id !== playerId) ctx.globalAlpha = 0.5;
    drawImageProportional(img, p.x, p.y, 40 * birdScale, 30 * birdScale);
    ctx.globalAlpha = 1.0;

    if (id !== playerId) {
      ctx.fillStyle = 'white';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(p.name || 'Unknown', p.x, p.y - 40);
    }
  }

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

        // === Determine Winner ===
        let winner = null;
        let highestScore = -Infinity;

        Object.entries(players).forEach(([id, p]) => {
          if (p.score > highestScore) {
            highestScore = p.score;
            winner = p.name || `Player ${id.substring(0, 4)}`;
          }
        });

        // ✅ Call the popup
        showWinnerOverlay(winner, highestScore);
      }
    }
  }, 1000);
}

// =========================
// Winner Overlay
// =========================
function showWinnerOverlay(winner, score) {
  
  console.log("🎉 Showing winner overlay:", winner, score); // Debug

  
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
      <h1 style="font-size:48px;margin-bottom:20px;">Time is up!</h1>
      <p style="font-size:28px;margin-bottom:10px;">Winner: ${winner}</p>
      <p style="font-size:22px;margin-bottom:30px;">Score: ${score}</p>
      <button id="exitBtn">Exit</button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('exitBtn').onclick = () => {
    window.location.href = 'index.html';
  };

  // Auto-return after 10s
  setTimeout(() => {
    if (document.body.contains(overlay)) {
      window.location.href = 'index.html';
    }
  }, 10000);
}


// =========================
// Reset Game
// =========================
function resetGame() {
  // Reset local state
  bird = { x: 100, y: 300, velocity: 0 };
  pipes = [];
  score = 0;
  timer = 90;
  gameOver = false;
  stopped = false;
  scoreDisplay.textContent = `Score: 0`;
  gameTimerEl.textContent = timer;

  // Update Firestore
  db.collection('lobbies').doc(lobbyCode).collection('players').doc(playerId).update({
    x: bird.x,
    y: bird.y,
    score: 0,
  });

  // Restart game
  startPreparationCountdown();
}

// =========================
// Leaderboard
// =========================
function updateLeaderboard() {
  const leaderboardList = document.getElementById('leaderboardList');
  leaderboardList.innerHTML = '';

  Object.entries(players)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 3)
    .forEach(([id, p]) => {
      const li = document.createElement('li');
      li.textContent = `${p.name || ''}: ${p.score}`;
      leaderboardList.appendChild(li);
    });
}
