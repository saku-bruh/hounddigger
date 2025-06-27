(() => {
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

  const lobby        = document.getElementById('mp-lobby');
  const hostBtn      = document.getElementById('hostBtn');
  const joinBtn      = document.getElementById('joinBtn');
  const readyBtn     = document.getElementById('readyBtn');
  const backBtn      = document.getElementById('lobbyBackBtn');
  const joinInput    = document.getElementById('joinCode');
  const readyTxt     = document.getElementById('readyStatus');
  const joinPane     = document.getElementById('joinPane');
  const readyPane    = document.getElementById('readyPane');
  const hostInfoDiv  = document.getElementById('host-info');
  const hostCodeEl   = document.getElementById('hostCode');
  const copyCodeBtn  = document.getElementById('copyCodeBtn');
  const clearCodeBtn = document.getElementById('clearCodeBtn');
  const pasteCodeBtn = document.getElementById('pasteCodeBtn');

  const rematchPage       = document.getElementById('mp-rematch-page');
  const rematchBtn        = document.getElementById('rematchBtn');
  const quitBtn           = document.getElementById('quitBtn');
  const mpFinalScoreEl    = document.getElementById('mp-final-score');
  const rematchStatusEl   = document.getElementById('rematch-status');
  
  joinInput.value = '';

  let peer;
  let bothReady = false;
  let localRematchReady  = false;
  let remoteRematchReady = false;

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

  document.getElementById('multiplayerBtn').onclick = () => {
    readyBtn.disabled       = false;
    readyTxt.textContent    = 'Waiting…';
    readyPane.style.display = 'none';
    hostBtn.style.display   = 'block';
    hostInfoDiv.style.display = 'none';
    copyCodeBtn.textContent = 'Copy';
    hostCodeEl.textContent  = '';
    joinPane.style.display  = 'flex';
    mp.localReady  = false;
    mp.remoteReady = false;
    bothReady = false;
    lobby.style.display       = 'flex';
    landingPage.style.display = 'none';
  };

  backBtn.onclick = () => {
    window.disconnectMultiplayer();
    lobby.style.display = 'none';
    hostInfoDiv.style.display = 'none';
    copyCodeBtn.textContent = 'Copy';
    showLandingPage();
  };

  hostBtn.onclick = () => {
    mp.isHost = true;
    peer = new Peer(undefined, peerOptions);
    peer.on('open', id => {
        hostCodeEl.textContent = id;
        hostCodeEl.dataset.code = id;
        hostInfoDiv.style.display = 'flex';
    });
    peer.on('connection', c => { mp.conn = c; setupConn(); });

    hostBtn.style.display   = 'none';
    joinPane.style.display  = 'none';
    readyPane.style.display = 'block';
  };

  copyCodeBtn.onclick = () => {
    const code = hostCodeEl.dataset.code;
    if (!code) return;

    navigator.clipboard.writeText(code).then(() => {
        copyCodeBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyCodeBtn.textContent = 'Copy';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy code: ', err);
        alert('Failed to copy. Please select the code and copy it manually.');
    });
  };

  clearCodeBtn.onclick = () => {
    joinInput.value = '';
    joinInput.focus();
  };
  
  pasteCodeBtn.onclick = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          joinInput.value = text.trim();
        }
      } catch (err) {
        console.error('Failed to read clipboard contents: ', err);
        alert('Could not paste from clipboard. Please paste it manually.');
      }
  };

  joinBtn.onclick = () => {
    const code = joinInput.value.trim();
    if (!code) return alert('Enter a code first');
    mp.isHost = false;
    peer = new Peer(undefined, peerOptions);
    peer.on('open', () => {
      mp.conn = peer.connect(code, { reliable: true });
      mp.conn.on('open', setupConn);
    });

    hostBtn.style.display  = 'none';
    hostInfoDiv.style.display = 'none';
    joinPane.style.display  = 'none';
    readyPane.style.display = 'block';
  };

  readyBtn.onclick = () => {
    readyBtn.disabled      = true;
    readyTxt.textContent = 'Waiting for other player…';
    mp.localReady = true;
    if (mp.conn && mp.conn.open) mp.conn.send({ t: 'r' });
    checkStart();
  };

  function setupConn() {
    mp.active            = true;
    mp.remote.connected  = true;
    readyTxt.textContent = 'Opponent connected! Ready up!';

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
        case 'life_lost':
            if (mp.isHost) {
                localWins++;
                if (mp.conn && mp.conn.open) {
                    mp.conn.send({t:'w', local:localWins, remote:remoteWins});
                }
            }
            break;
        case 'milestone_crossed':
            if (!mp.isHost) {
                startMilestone(performance.now());
            }
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
          showMpRematchPage(calcScore(), true);
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

  function checkStart() {
    if (!bothReady && mp.localReady && mp.remoteReady) {
      bothReady = true;
      localWins = 0;
      remoteWins = 0;
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

  function showMpRematchPage(finalScore, didWin) {
    currentGameState = GAME_STATE.GAME_OVER;
    
    const titleEl = document.getElementById('mp-game-over-title');
    if (titleEl) {
        if (didWin) {
            titleEl.textContent = "You Win!";
            titleEl.style.color = '#82ffa0';
        } else {
            titleEl.textContent = "You Lose!";
            titleEl.style.color = '#ff5c93';
        }
    }

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
      localWins = 0;
      remoteWins = 0;
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