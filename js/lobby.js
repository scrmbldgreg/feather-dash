const db = firebase.firestore();

// DOM elements
const mainMenu = document.getElementById('mainMenu');
const multiMenu = document.getElementById('multiMenu');
const createSection = document.getElementById('createSection');
const joinSection = document.getElementById('joinSection');
const lobbyInfo = document.getElementById('lobbyInfo');
const lobbyCodeDisplay = document.getElementById('lobbyCodeDisplay');
const playerListDiv = document.getElementById('playerList');
const startGameBtn = document.getElementById('startGameBtn');
const inviteLink = document.getElementById('inviteLink');

const createName = document.getElementById('createName');
const joinName = document.getElementById('joinName');
const joinCodeInput = document.getElementById('joinCode');
const createLobbyBtn = document.getElementById('createLobbyBtn');
const joinLobbyBtn = document.getElementById('joinLobbyBtn');
const showCreate = document.getElementById('showCreate');
const showJoin = document.getElementById('showJoin');

let playerId = Math.random().toString(36).substring(2, 9);
let lobbyCode = null;
let ownerId = null;
let isReady = false;
let playerName = ''; // ✅ global playerName, filled on create/join

// Create player count display (TOP)
const playerCountDisplay = document.createElement('p');
playerCountDisplay.id = 'playerCountDisplay';
lobbyInfo.insertBefore(playerCountDisplay, playerListDiv);

// Ready button (MIDDLE)
const readyBtn = document.createElement('button');
readyBtn.id = 'readyBtn';
readyBtn.textContent = 'Ready';
readyBtn.style.display = 'none';
lobbyInfo.insertBefore(readyBtn, startGameBtn);

// Ensure Start Game (BOTTOM)
startGameBtn.classList.add('hidden');

// Generate random lobby code
function generateLobbyCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// Show create/join
showCreate.onclick = () => {
  multiMenu.classList.add('hidden');
  createSection.classList.remove('hidden');
};
showJoin.onclick = () => {
  multiMenu.classList.add('hidden');
  joinSection.classList.remove('hidden');
};

// =========================
// CREATE LOBBY
// =========================
createLobbyBtn.onclick = async () => {
  playerName = createName.value.trim(); // ✅ assign global
  if (!playerName) return alert('Enter your name!');

  lobbyCode = generateLobbyCode();
  const lobbyRef = db.collection('lobbies').doc(lobbyCode);

  try {
    await lobbyRef.set({
      owner: playerId,
      started: false,
      createdAt: Date.now(),
    });

    ownerId = playerId;

    await lobbyRef.collection('players').doc(playerId).set({
      name: playerName,
      color: 'orange',
      ready: false,
      x: 100,
      y: 300,
      score: 0,
    });

    showLobby();
    inviteLink.textContent = `Invite Link: ${window.location.origin}${window.location.pathname}?join=${lobbyCode}`;
    inviteLink.classList.remove('hidden');
  } catch (err) {
    console.error('❌ Create Lobby Error:', err);
    alert('Failed to create lobby.');
  }
};

// =========================
// JOIN LOBBY
// =========================
joinLobbyBtn.onclick = async () => {
  playerName = joinName.value.trim(); // ✅ assign global
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!playerName || !code) return alert('Enter name and lobby code!');

  lobbyCode = code;
  const lobbyRef = db.collection('lobbies').doc(lobbyCode);

  try {
    const lobbyDoc = await lobbyRef.get();
    if (!lobbyDoc.exists) {
      alert('Lobby does not exist!');
      return;
    }

    ownerId = lobbyDoc.data().owner;

    // Limit lobby to 10 players
    const playersSnapshot = await lobbyRef.collection('players').get();
    if (playersSnapshot.size >= 10) {
      alert('Lobby is full (10 players max)!');
      return;
    }

    await lobbyRef.collection('players').doc(playerId).set({
      name: playerName,
      color: 'white',
      ready: false,
      x: 100,
      y: 300,
      score: 0,
    });

    showLobby();
  } catch (err) {
    console.error('❌ Join Lobby Error:', err);
    alert('Failed to join lobby.');
  }
};

// =========================
// SHOW LOBBY
// =========================
function showLobby() {
  // Hide start until verified host
  startGameBtn.classList.add('hidden');
  startGameBtn.style.display = 'none';
  readyBtn.style.display = 'inline-block';

  createSection.classList.add('hidden');
  joinSection.classList.add('hidden');
  mainMenu.classList.add('hidden');
  multiMenu.classList.add('hidden');
  lobbyInfo.classList.remove('hidden');

  lobbyCodeDisplay.textContent = lobbyCode;
  const lobbyRef = db.collection('lobbies').doc(lobbyCode);

  // Verify owner
  lobbyRef.get().then((doc) => {
    if (doc.exists) {
      ownerId = doc.data().owner;

      if (playerId === ownerId) {
        // Host sees Start at bottom
        startGameBtn.classList.remove('hidden');
        startGameBtn.style.display = 'inline-block';
        startGameBtn.disabled = true;
        startGameBtn.textContent = 'Waiting for Players...';
      }
    }
  });

  // Player list & count (TOP)
  lobbyRef.collection('players').onSnapshot((snapshot) => {
    playerListDiv.innerHTML = '';

    let totalPlayers = snapshot.size;
    let readyPlayers = 0;

    snapshot.forEach((doc) => {
      const player = doc.data();
      if (player.ready) readyPlayers++;

      const div = document.createElement('div');
      div.textContent = player.name || '(Unnamed)';
      div.style.color = doc.id === ownerId ? 'orange' : 'white';
      div.style.fontStyle = player.ready ? 'normal' : 'italic';
      div.style.fontWeight = player.ready ? 'bold' : 'normal';

      playerListDiv.appendChild(div);
    });

    // Update player count
    playerCountDisplay.textContent = `Players: ${totalPlayers}/10`;

    // Host can start only if all ready
    if (playerId === ownerId) {
      if (readyPlayers === totalPlayers && totalPlayers > 0) {
        startGameBtn.disabled = false;
        startGameBtn.textContent = 'Start Game';
      } else {
        startGameBtn.disabled = true;
        startGameBtn.textContent = `Waiting for Players (${readyPlayers}/${totalPlayers})`;
      }
    }
  });

  // Listen for game start
  lobbyRef.onSnapshot((doc) => {
    if (doc.exists && doc.data().started) {
      window.location.href = `game.html?lobby=${lobbyCode}&player=${playerId}&name=${encodeURIComponent(playerName)}`;
    }
  });
}

// =========================
// READY BUTTON TOGGLE
// =========================
readyBtn.onclick = async () => {
  const lobbyRef = db.collection('lobbies').doc(lobbyCode);
  const playerRef = lobbyRef.collection('players').doc(playerId);

  isReady = !isReady;
  await playerRef.update({ ready: isReady });

  readyBtn.textContent = isReady ? 'Cancel' : 'Ready';
};

// =========================
// START GAME (for host)
// =========================
startGameBtn.onclick = async () => {
  if (playerId !== ownerId) return;
  const lobbyRef = db.collection('lobbies').doc(lobbyCode);
  await lobbyRef.update({ started: true });
  window.location.href = `game.html?lobby=${lobbyCode}&player=${playerId}&name=${encodeURIComponent(playerName)}`;
};

// =========================
// REMOVE AUTO-FILL
// =========================
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const joinCode = params.get('join');

  if (joinCode) {
    mainMenu.classList.add('hidden');
    multiMenu.classList.add('hidden');
    joinSection.classList.remove('hidden');
    joinCodeInput.value = joinCode.toUpperCase();
  }
});
