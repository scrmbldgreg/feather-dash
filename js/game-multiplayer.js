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

console.log("🎮 Game Loaded with Params:", { lobbyCode, playerId, playerName });

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
const leaderboardList = document.getElementById('leaderboardList');

// =========================
// Game State
// =========================
let bird = { x: 150, y: window.innerHeight / 2, velocity: -2 };
let gravity = 0.5;
let score = 0;
let timer = 45; // 45 seconds for multiplayer
let gameOver = false;
let gameStarted = false;
let players = {};
let assetsLoaded = false;
let webcamReady = false;
let lobbyReady = false;

let pipes = [];
const pipeWidthRatio = 0.08;
const pipeGapRatio = 0.4;
let pipeSpeed = 5;
let pipeSpawnInterval = 150;
let frameCount = 0;
const pipeScale = 0.6;

let stunned = false;
let stopped = false;
let stunDuration = 1500;

// Firestore update throttle
let lastWriteTime = 0;
const writeInterval = 200;

// =========================
// Assets
// =========================
const groundImg = document.getElementById('ground');
const bird1Img = document.getElementById('bird1');
const bird2Img = document.getElementById('bird2');
const pipeTipImg = document.getElementById('pipeTip');
const pipeBodyImg = document.getElementById('pipeBody');

const birdWidth = 80;
const birdHeight = 80;
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
  const assets = [groundImg, bird1Img, bird2Img, pipeTipImg, pipeBodyImg];
  let loadedCount = 0;

  assets.forEach((img) => {
    if (!img) return console.error("❌ Missing asset element:", img);
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
  console.log("✅ Assets Loaded");
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
      console.log("✅ Webcam Ready");
      tryStartGame();
    });
  })
  .catch((err) => {
    console.error('❌ Webcam error:', err);
    alert('Webcam access is required to play!');
  });

// =========================
// Firestore Lobby Handling
// =========================
async function joinLobby() {
  if (!lobbyCode) {
    alert('No lobby code found in URL!');
    return;
  }

  const lobbyRef = db.collection('lobbies').doc(lobbyCode);

  try {
    const lobbyDoc = await lobbyRef.get();
    if (!lobbyDoc.exists) {
      alert('❌ Lobby does not exist!');
      return;
    }

    // Add or merge player
    await lobbyRef.collection('players').doc(playerId).set({
      name: playerName || `Player-${playerId}`,
      color: 'yellow',
      x: bird.x,
      y: bird.y,
      score: 0,
    }, { merge: true });

    // Listen to players
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
    console.log("✅ Lobby Ready");
    tryStartGame();
  } catch (err) {
    console.error('❌ Lobby error:', err);
  }
}
joinLobby();

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
  if (!gameStarted) return;
  bird.velocity = -8;
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
    console.log("✅ All Ready, starting prep countdown...");
    spawnClouds();
    startPreparationCountdown();
  }
}

function startGame() {
  gameStarted = true;
  startTimer();
  console.log("🎮 Game started");

  const bgm = document.getElementById('bgm');
  bgm.volume = 0.3;
  bgm.play().catch(err => console.warn("Audio autoplay blocked:", err));

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
        scoreDisplay.textContent = `Beak Points: ${score}`;
        pipe.scored = true;
        pipeSpeed = 3 + Math.floor(score / 5);
      }
    });

    pipes = pipes.filter((pipe) => pipe.x + canvas.width * pipeWidthRatio > 0);
  }

  // Pipe collision
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#70c5ce';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Clouds
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

  // Pipes
  drawPipes();

for (const [id, p] of Object.entries(players)) {
  const img = id === playerId ? bird1Img : bird2Img;

  // Own bird = full opacity, others = 50% opacity
  ctx.globalAlpha = id === playerId ? 1.0 : 0.5;
  ctx.drawImage(img, p.x - birdWidth / 2, p.y - birdHeight / 2, birdWidth, birdHeight);
  ctx.globalAlpha = 1.0;

  if (id !== playerId) {
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    
    // Show name
    ctx.fillText(p.name || 'Unknown', p.x, p.y - birdHeight / 2 - 20);

    // Show x/y below the name
    ctx.globalAlpha = 0.7; // slightly faded
    ctx.fillText(`(${Math.round(p.x)}, ${Math.round(p.y)})`, p.x, p.y - birdHeight / 2);
    ctx.globalAlpha = 1.0;
  }
}


  // Ground
  drawGround();
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

const volumeBtn = document.getElementById('volumeBtn');
let volumeLevels = [0.25, 0.5, 0.75, 1, 0]; // 0 = mute
let volumeIcons = ['🔉', '🔉', '🔊', '🔊', '🔇']; // simple icon cycle
let currentVolumeIndex = 0; // start at 25% volume

volumeBtn.addEventListener('click', () => {
  currentVolumeIndex = (currentVolumeIndex + 1) % volumeLevels.length;
  const newVolume = volumeLevels[currentVolumeIndex];
  bgm.volume = newVolume;

  // Update button icon
  volumeBtn.textContent = volumeIcons[currentVolumeIndex];
});


// =========================
// Timer & Leaderboard
// =========================
function startTimer() {
  const interval = setInterval(() => {
    if (!gameOver && gameStarted) {
      timer--;
      gameTimerEl.textContent = timer;

      if (timer <= 0) {
        clearInterval(interval);
        gameOver = true;

        let winner = null;
        let highestScore = -Infinity;

        Object.entries(players).forEach(([id, p]) => {
          if (p.score > highestScore) {
            highestScore = p.score;
            winner = p.name || `Player ${id.substring(0, 4)}`;
          }
        });

        showWinnerOverlay(winner, highestScore);
      }
    }
  }, 1000);
}

function updateLeaderboard() {
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

// =========================
// Winner Overlay
// =========================
function showWinnerOverlay(winner, score) {
  console.log("🎉 Showing winner overlay:", winner, score);

  // Remove existing overlay if present
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
      <h1 style="font-size:48px;margin-bottom:20px;">Sky Champion: ${winner}</h1>
      <p style="font-size:28px;margin-bottom:30px;">Beak Points: ${score}</p>
      <div style="display:flex; justify-content:center; gap:20px;">
        <button id="playAgain" class="cta-button">Fly Again</button>
        <button id="exitBtn" class="cta-button">Fly Home</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Exit button → Home page
  document.getElementById('exitBtn').onclick = () => {
    window.location.href = 'index.html';
  };
  // Fly Again → Reset player state & go to lobby
document.getElementById('playAgain').onclick = async () => {
  const lobbyRef = db.collection('lobbies').doc(lobbyCode);
  const playerRef = lobbyRef.collection('players').doc(playerId);

  await playerRef.update({
    score: 0,
    ready: false,
    x: 100,
    y: 300
  });

  // Optional: Mark rematch requested (if you want other players to know)
  await lobbyRef.update({ rematchRequested: Date.now() });

  // 🔹 Go back to the lobby page (host will still see this lobby)
  window.location.href = 'gather-flock.html';
};

  // Auto return to lobby after 10s if user does nothing
  setTimeout(() => {
    if (document.body.contains(overlay)) {
      window.location.href = `gather-flock.html`;
    }
  }, 10000);
}
