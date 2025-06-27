(() => {
  // Peer configuration (STUN/TURN)
  const peerOptions = {
    config: {
      iceServers: [
        { urls: "stun:stun.relay.metered.ca:80" },
        { urls: "turn:global.relay.metered.ca:80", username: "aa4c11e375ec6112aaec44e8", credential: "L6YD9q3C07uyeaBB" },
        { urls: "turn:global.relay.metered.ca:80?transport=tcp", username: "aa4c11e375ec6112aaec44e8", credential: "L6YD9q3C07uyeaBB" },
        { urls: "turn:global.relay.metered.ca:443", username: "aa4c11e375ec6112aaec44e8", credential: "L6YD9q3C07uyeaBB" },
        { urls: "turns:global.relay.metered.ca:443?transport=tcp", username: "aa4c11e375ec6112aaec44e8", credential: "L6YD9q3C07uyeaBB" }
      ]
    },
    debug: 2
  };

  // DOM handles --------------------------------------------------
  const lobby      = document.getElementById('mp-lobby');
  const hostBtn    = document.getElementById('hostBtn');
  const joinBtn    = document.getElementById('joinBtn');
  const readyBtn   = document.getElementById('readyBtn');
  const backBtn    = document.getElementById('lobbyBackBtn');
  const hostCodeEl = document.getElementById('hostCode');
  const joinInput  = document.getElementById('joinCode');
  const readyTxt   = document.getElementById('readyStatus');
  const hostPane   = document.getElementById('hostPane');
  const joinPane   = document.getElementById('joinPane');
  const readyPane  = document.getElementById('readyPane');

  // --- NEW DOM HANDLES FOR REMATCH ---
  const rematchPage     = document.getElementById('mp-rematch-page');
  const rematchBtn      = document.getElementById('rematchBtn');
  const quitBtn         = document.getElementById('quitBtn');
  const mpFinalScoreEl  = document.getElementById('mp-final-score');
  const rematchStatusEl = document.getElementById('rematch-status');

  let peer;
  let bothReady = false;
  // --- NEW STATE FOR REMATCH ---
  let localRematchReady  = false;
  let remoteRematchReady = false;

  // --- FUNCTION TO CLEAN UP MP SESSION ---
  window.disconnectMultiplayer = () => {
    if (mp.conn) {
      mp.conn.send({ t: 'leave' });
      mp.conn.close();
    }
    if (peer) peer.destroy();
    Object.assign(mp, { active: false, conn: null, isHost: false, localReady: false, remoteReady: false, remote: { connected: false } });
    localColor = '#fff';
    remoteColor = '#fff';
    console.log("Multiplayer session disconnected.");
  };

  // --------------------------------------------------------------
  // Landing → open lobby
  document.getElementById('multiplayerBtn').onclick = () => {
    // Reset lobby state when opening it
    readyBtn.disabled     = false;
    readyTxt.textContent  = 'Waiting…';
    readyPane.style.display = 'none';
    hostPane.style.display  = 'block';
    hostBtn.style.display   = 'block';
    hostCodeEl.textContent  = '';
    joinPane.style.display  = 'block';
    mp.localReady  = false;
    mp.remoteReady = false;
    bothReady = false;
    lobby.style.display    = 'flex';
    landingPage.style.display = 'none';
  };

  // Lobby back / reset ------------------------------------------
  backBtn.onclick = () => {
    window.disconnectMultiplayer();
    lobby.style.display = 'none';
    showLandingPage();
  };

  // --------------------------- HOST -----------------------------
  hostBtn.onclick = () => {
    mp.isHost = true;
    peer = new Peer(undefined, peerOptions);
    peer.on('open', id => { hostCodeEl.textContent = `Share code: ${id}`; });
    peer.on('connection', c => { mp.conn = c; setupConn(); });

    // UI visibility fixes
    hostBtn.style.display   = 'none';
    joinPane.style.display  = 'none';
    readyPane.style.display = 'block';
  };

  // --------------------------- GUEST ----------------------------
  joinBtn.onclick = () => {
    const code = joinInput.value.trim();
    if (!code) return alert('Enter a code first');
    mp.isHost = false;
    peer = new Peer(undefined, peerOptions);
    peer.on('open', () => {
      mp.conn = peer.connect(code, { reliable: true });
      mp.conn.on('open', setupConn);
    });

    hostPane.style.display  = 'none';
    joinPane.style.display  = 'none';
    readyPane.style.display = 'block';
  };

  // Ready pane ---------------------------------------------------
  readyBtn.onclick = () => {
    readyBtn.disabled    = true;
    readyTxt.textContent = 'Waiting for other player…';
    mp.localReady = true;
    if (mp.conn && mp.conn.open) mp.conn.send({ t: 'r' });
    checkStart();
  };

  // --------------------------------------------------------------
  function setupConn() {
    mp.active             = true;
    mp.remote.connected   = true;
    readyTxt.textContent  = 'Opponent connected! Ready up!';

    mp.conn.on('data', msg => {
      switch (msg.t) {
        case 'r':
          mp.remoteReady = true;
          readyTxt.textContent = 'Opponent is Ready!';
          checkStart();
          break;
        case 's':
          Object.assign(mp.remote, msg);
          break;
        case 'w':
          localWins = msg.remote; remoteWins = msg.local;
          break;
        case 'go':
          if (!mp.isHost) {
            window.setGameSeed(msg.seed);
            lobby.style.display = 'none';
            currentGameState = GAME_STATE.PLAYING;
            updateUIVisibility();
            startGame();
          }
          break;
        case 'gg':
          currentGameState = GAME_STATE.GAME_OVER;
          showMpRematchPage(calcScore());
          updateUIVisibility();
          break;
        case 'rematch_r':
          remoteRematchReady = true;
          rematchStatusEl.textContent = 'Opponent wants to play again!';
          checkRematch();
          break;
        case 'restart':
          rematchPage.style.display = 'none';
          window.setGameSeed(msg.seed);
          currentGameState = GAME_STATE.PLAYING;
          updateUIVisibility();
          startGame();
          break;
        case 'quit':
          alert('Opponent has quit.');
          window.disconnectMultiplayer();
          rematchPage.style.display = 'none';
          showLandingPage();
          break;
        case 'leave':
          alert('Opponent left the lobby.');
          window.disconnectMultiplayer();
          lobby.style.display = 'none';
          showLandingPage();
          break;
      }
    });

    mp.conn.on('close', () => {
      alert('Connection to opponent lost.');
      window.disconnectMultiplayer();
      rematchPage.style.display = 'none';
      lobby.style.display = 'none';
      gameGrid.style.display = 'none';
      showLandingPage();
    });
  }

  // --------------------------------------------------------------
  function checkStart() {
    if (!bothReady && mp.localReady && mp.remoteReady) {
      bothReady = true;
      if (mp.isHost) {
        const seed = Date.now();
        window.setGameSeed(seed);
        lobby.style.display = 'none';
        localColor = '#2980B9'; remoteColor = '#C0392B';
        currentGameState = GAME_STATE.PLAYING;
        updateUIVisibility();
        startGame();
        if (mp.conn.open) mp.conn.send({ t: 'go', seed });
      } else {
        localColor = '#C0392B'; remoteColor = '#2980B9';
      }
    }
  }

  // --- FUNCTIONS FOR REMATCH ---
  function showMpRematchPage(finalScore) {
    currentGameState       = GAME_STATE.GAME_OVER;
    mpFinalScoreEl.textContent = `Final Score: ${finalScore}`;
    localRematchReady      = false;
    remoteRematchReady     = false;
    rematchBtn.disabled    = false;
    rematchStatusEl.textContent = 'Waiting for opponent...';
    updateUIVisibility();
  }
  window.showMpRematchPage = showMpRematchPage;

  rematchBtn.onclick = () => {
    rematchBtn.disabled = true;
    rematchStatusEl.textContent = 'Waiting for opponent...';
    localRematchReady = true;
    if (mp.conn && mp.conn.open) mp.conn.send({ t: 'rematch_r' });
    checkRematch();
  };

  quitBtn.onclick = () => {
    if (mp.conn && mp.conn.open) mp.conn.send({ t: 'quit' });
    window.disconnectMultiplayer();
    rematchPage.style.display = 'none';
    showLandingPage();
  };

  function checkRematch() {
    if (localRematchReady && remoteRematchReady) {
      if (mp.isHost) {
        const newSeed = Date.now();
        window.setGameSeed(newSeed);
        if (mp.conn.open) mp.conn.send({ t: 'restart', seed: newSeed });
        rematchPage.style.display = 'none';
        currentGameState = GAME_STATE.PLAYING;
        updateUIVisibility();
        startGame();
      }
    }
  }
})();
