const db = firebase.firestore();

// =========================
// DOM ELEMENTS
// =========================
const multiMenu = document.getElementById('multiMenu');
const createSection = document.getElementById('createSection');
const joinSection = document.getElementById('joinSection');
const lobbyInfo = document.getElementById('lobbyInfo');
const lobbyCodeDisplay = document.getElementById('lobbyCodeDisplay');
const playerListDiv = document.getElementById('playerList');
const startGameBtn = document.getElementById('startGameBtn');
const inviteLink = document.getElementById('inviteLink');
const inviteContainer = document.getElementById('inviteContainer');
const inviteBtn = document.getElementById('inviteBtn');

const createName = document.getElementById('createName');
const joinName = document.getElementById('joinName');
const joinCodeInput = document.getElementById('joinCode');
const createLobbyBtn = document.getElementById('createLobbyBtn');
const joinLobbyBtn = document.getElementById('joinLobbyBtn');
const showCreate = document.getElementById('showCreate');
const showJoin = document.getElementById('showJoin');

const backFromCreate = document.getElementById('backFromCreate');
const backFromJoin = document.getElementById('backFromJoin');
const backFromLobby = document.getElementById('backFromLobby');

// =========================
// GLOBAL STATE
// =========================
let playerId = Math.random().toString(36).substring(2, 9);
let lobbyCode = null;
let ownerId = null;
let isReady = false;
let playerName = ''; // ✅ global name

// Create player count display (TOP)
const playerCountDisplay = document.createElement('p');
playerCountDisplay.id = 'playerCountDisplay';
lobbyInfo.insertBefore(playerCountDisplay, playerListDiv);

// Ready button (MIDDLE)
const readyBtn = document.createElement('button');
readyBtn.id = 'readyBtn';
readyBtn.textContent = 'All Feathers Set';
readyBtn.style.display = 'none';
lobbyInfo.insertBefore(readyBtn, startGameBtn);

// =========================
// HELPER FUNCTIONS
// =========================
function generateLobbyCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function goBackToMenu(fromSection) {
  fromSection.classList.add('hidden');
  multiMenu.classList.remove('hidden');
}

// =========================
// BUTTON EVENTS
// =========================
showCreate.onclick = () => {
  multiMenu.classList.add('hidden');
  createSection.classList.remove('hidden');
};

showJoin.onclick = () => {
  multiMenu.classList.add('hidden');
  joinSection.classList.remove('hidden');
};

backFromCreate.onclick = () => goBackToMenu(createSection);
backFromJoin.onclick = () => goBackToMenu(joinSection);

backFromLobby.onclick = async () => {
  // Remove this player from lobby
  if (lobbyCode) {
    try {
      await db.collection('lobbies').doc(lobbyCode)
        .collection('players').doc(playerId).delete();
    } catch (err) {
      console.warn('Player removal failed:', err);
    }
  }
  lobbyInfo.classList.add('hidden');
  inviteContainer.classList.add('hidden');
  multiMenu.classList.remove('hidden');
};

// =========================
// CREATE LOBBY
// =========================
createLobbyBtn.onclick = async () => {
  playerName = createName.value.trim();
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
    const inviteURL = `${location.origin}${location.pathname}?join=${lobbyCode}`;
    inviteLink.textContent = inviteURL;
    inviteContainer.classList.remove('hidden');

    inviteBtn.onclick = async () => {
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Join my Feather Dash lobby!',
            text: 'Click to join the race:',
            url: inviteURL
          });
        } catch (err) {
          console.warn('Share cancelled or failed:', err);
        }
      } else {
        try {
          await navigator.clipboard.writeText(inviteURL);
          alert('Invite link copied to clipboard!');
        } catch (err) {
          console.error('Clipboard failed:', err);
          alert('Could not copy link. Please copy manually:\n' + inviteURL);
        }
      }
    };
  } catch (err) {
    console.error('❌ Create Lobby Error:', err);
    alert('Failed to create lobby.');
  }
  
};

// =========================
// JOIN LOBBY
// =========================
joinLobbyBtn.onclick = async () => {
  playerName = joinName.value.trim();
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
  startGameBtn.classList.add('hidden');
  startGameBtn.style.display = 'none';
  readyBtn.style.display = 'inline-block';

  createSection.classList.add('hidden');
  joinSection.classList.add('hidden');
  multiMenu.classList.add('hidden');
  lobbyInfo.classList.remove('hidden');

  lobbyCodeDisplay.textContent = lobbyCode;
  const lobbyRef = db.collection('lobbies').doc(lobbyCode);

  // Verify owner
  lobbyRef.get().then((doc) => {
    if (doc.exists) {
      ownerId = doc.data().owner;

      if (playerId === ownerId) {
        startGameBtn.classList.remove('hidden');
        startGameBtn.style.display = 'inline-block';
        startGameBtn.disabled = true;
        startGameBtn.textContent = 'Assembling Wings...';
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
    playerCountDisplay.textContent = `Flyers: ${totalPlayers}/10`;

    // Host can start only if all ready
    if (playerId === ownerId) {
      if (readyPlayers === totalPlayers && totalPlayers > 0) {
        startGameBtn.disabled = false;
        startGameBtn.textContent = 'Take Flight!';
      } else {
        startGameBtn.disabled = true;
        startGameBtn.textContent = `Assembling Wings... (${readyPlayers}/${totalPlayers})`;
      }
    }
  });

  // Listen for game start
  lobbyRef.onSnapshot((doc) => {
    if (doc.exists && doc.data().started) {
      window.location.href = `sky-race.html?lobby=${lobbyCode}&player=${playerId}&name=${encodeURIComponent(playerName)}`;
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

  readyBtn.textContent = isReady ? 'Clip Wings' : 'All Feathers Set';
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
// AUTO-FILL JOIN CODE IF ?join=xxx
// =========================
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const joinCode = params.get('join');

  if (joinCode) {
    multiMenu.classList.add('hidden');
    joinSection.classList.remove('hidden');
    joinCodeInput.value = joinCode.toUpperCase();
  }
});
