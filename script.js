/* ===================== Multiplayer Globals ===================== */
let localColor  = '#fff';
let remoteColor = '#fff';
let localWins   = 0, remoteWins = 0;

const mp = {
  active:false,
  isHost:false,
  conn:null,
  remote:{
    connected:false,
    x:0, y:0, vy:0, hp:0
  }
};

/* ===================== Const & Helpers ===================== */
const TILE = 60, COLS = 7;
const GRAV = .014;
const DIG_CD = 120, HORIZ_CD = 100;
const BREAK_MS = 180;
const HP_MAX = 100, HP_DRAIN = .03, HEART_RATE = .022;
const FALL_WAIT = [4500, 4500], FALL_STEP = 80, SHAKE = 2.5;

const IRON_CHUNK_MIN_DEPTH = 35;
const IRON_CHUNK_INTERVAL = 55;
const IRON_CHUNK_MIN_GAP_BETWEEN = 15;
const IRON_CHUNK_HEIGHT_MIN = 1, IRON_CHUNK_HEIGHT_MAX = 2;

const SOUL_BLOCK_MAX_HP = 5;
const SOUL_BLOCK_MIN_DEPTH = 10;
const MILESTONE_INTERVAL = 100;

const BLOCK_TYPES = {
    EMPTY: { id: 0, color: null, breakable: false, fallable: false, isGap: true },
    SOLID: { id: 1, color: '#4b2d7d', breakable: true, fallable: true, hp: 1 },
    HP:    { id: 2, color: '#ff5c93', breakable: false, fallable: false, isHeart: true, glow: true },
    STONE: { id: 3, color: '#555555', breakable: true, fallable: true, hp: 1, cracks: false },
    RED:   { id: 4, color: '#C0392B', breakable: true, fallable: true, hp: 1 },
    BLUE:  { id: 5, color: '#2980B9', breakable: true, fallable: true, hp: 1 },
    WHITE: { id: 6, color: '#ECF0F1', breakable: true, fallable: true, hp: 1, glow: true },
    IRON:  { id: 7, color: '#7F8C8D', breakable: false, fallable: false, hp: Infinity },
    SOUL:  { id: 8, color: '#7D3C98', breakable: true, fallable: true, hp: SOUL_BLOCK_MAX_HP, cracks: true }
};
const BLOCK_INFO = {};
for (const key in BLOCK_TYPES) { BLOCK_INFO[BLOCK_TYPES[key].id] = JSON.parse(JSON.stringify(BLOCK_TYPES[key])); }

let graphicsSettings = { bloom: true, particles: true };

let gameSeed = Date.now();
function seededRandom() {
    var t = gameSeed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
window.setGameSeed = (seed) => { gameSeed = seed; };

const rnd = (a,b)=>a + seededRandom()*(b-a);
const rndInt = (a,b)=> Math.floor(rnd(a,b+1));
const clamp = (v,a,b)=>v<a?a:v>b?b:v;

/* ===================== Audio ===================== */
const sounds = {
    dig: new Audio('sounds/dig.wav'),
    death: new Audio('sounds/death.wav'),
    respawn: new Audio('sounds/respawn.wav'),
    jump: new Audio('sounds/jump.wav'),
    land: new Audio('sounds/land.wav'),
};
sounds.dig.volume = 0.7;
sounds.land.volume = 0.6;

function playSound(name) {
    if (sounds[name]) {
        sounds[name].currentTime = 0;
        sounds[name].play().catch(e => {});
    }
}

/* ===================== Game State, DOM Elements, State Variables ===================== */
const GAME_STATE = { LANDING: 'LANDING', PLAYING: 'PLAYING', PAUSED: 'PAUSED', GRAPHICS_MENU: 'GRAPHICS_MENU', GAME_OVER: 'GAME_OVER' };
let currentGameState = GAME_STATE.LANDING;
const cv = document.getElementById('game'); const ctx = cv.getContext('2d');
const landingPage = document.getElementById('landing-page'); const restartPage = document.getElementById('restart-page');
const pauseMenu = document.getElementById('pause-menu'); const graphicsSettingsMenu = document.getElementById('graphics-settings-menu');
const gameGrid = document.getElementById('grid'); const singlePlayerBtn = document.getElementById('singlePlayerBtn');
const retryBtn = document.getElementById('retryBtn'); const mainMenuBtn = document.getElementById('mainMenuBtn');
const finalScoreEl = document.getElementById('finalScore'); const resumeBtn = document.getElementById('resumeBtn');
const pauseRestartBtn = document.getElementById('pauseRestartBtn'); const pauseGraphicsSettingsBtn = document.getElementById('pauseGraphicsSettingsBtn');
const pauseMainMenuBtn = document.getElementById('pauseMainMenuBtn'); const bloomToggle = document.getElementById('bloomToggle');
const particlesToggle = document.getElementById('particlesToggle'); const backToPauseMenuBtn = document.getElementById('backToPauseMenuBtn');
const hpBar = document.getElementById('hpBar'); const pauseGameBtn = document.getElementById('pauseGameBtn');
const livesEl= document.getElementById('lives'); const depthEl= document.getElementById('depth'); const scoreEl= document.getElementById('score');
const mpRematchPage = document.getElementById('mp-rematch-page');

function fit(){ cv.width = cv.clientWidth; cv.height = cv.clientHeight; }
fit(); window.addEventListener('resize',fit);
let rows = [], digCount = 0, hearts = 0, depthOffset = 0;
let player, breaking = [], fallers = [], dust = [], digLock = 0, camY = 0;
let msState = null, msStart = 0, msProgress = 0, msShards = [];
let lastPauseTime = 0; let nextMilestonePhysicalY = MILESTONE_INTERVAL;
let lastIronChunkEndRow = -Infinity;

/* ===================== Input ===================== */
const key = {}; const norm = k => k.length===1 ? k.toLowerCase() : k;
window.addEventListener('keydown', e => {
    const k = norm(e.key); key[k] = true;
    if (k === 'escape' || k === 'p') {
        if (currentGameState === GAME_STATE.PLAYING) togglePause();
        else if (currentGameState === GAME_STATE.PAUSED) resumeGame();
        else if (currentGameState === GAME_STATE.GRAPHICS_MENU) showPauseMenu();
    }
});
window.addEventListener('keyup', e => key[norm(e.key)] = false);
document.querySelectorAll('.pbtn').forEach(btn => {
  const k = btn.dataset.k;
  ['touchstart','mousedown'].forEach(ev => btn.addEventListener(ev, e => { key[k]=true; e.preventDefault() }));
  ['touchend','mouseup','mouseleave','touchcancel'].forEach(ev => btn.addEventListener(ev, e => { key[k]=false; e.preventDefault() }));
});

/* ===================== UI Management ===================== */
function updateUIVisibility() {
    landingPage.style.display = currentGameState === GAME_STATE.LANDING ? 'flex' : 'none';
    restartPage.style.display = (currentGameState === GAME_STATE.GAME_OVER && !mp.active) ? 'flex' : 'none';
    mpRematchPage.style.display = (currentGameState === GAME_STATE.GAME_OVER && mp.active) ? 'flex' : 'none';
    pauseMenu.style.display = currentGameState === GAME_STATE.PAUSED ? 'flex' : 'none';
    graphicsSettingsMenu.style.display = currentGameState === GAME_STATE.GRAPHICS_MENU ? 'flex' : 'none';
    gameGrid.style.display = (currentGameState === GAME_STATE.PLAYING || currentGameState === GAME_STATE.PAUSED || currentGameState === GAME_STATE.GRAPHICS_MENU) ? 'grid' : 'none';
    if (currentGameState === GAME_STATE.PLAYING || currentGameState === GAME_STATE.PAUSED || currentGameState === GAME_STATE.GRAPHICS_MENU) {
        if (gameGrid.style.display !== 'grid') gameGrid.style.display = 'grid'; fit();
    }
}
function showLandingPage() { currentGameState = GAME_STATE.LANDING; updateUIVisibility(); }
function startGameFlow(event) {
    if (mp.active && window.disconnectMultiplayer) {
        window.disconnectMultiplayer();
    }

    const button = event.target;
    button.classList.add('breaking');
    setTimeout(() => {
        currentGameState = GAME_STATE.PLAYING;
        updateUIVisibility();
        startGame();
        button.classList.remove('breaking');
    }, 400);
}
function showRestartPage() { currentGameState = GAME_STATE.GAME_OVER; updateUIVisibility(); finalScoreEl.textContent = `Score: ${calcScore()}`; }
function togglePause() {
    if (currentGameState === GAME_STATE.PLAYING && !player.deathAnim) {
        currentGameState = GAME_STATE.PAUSED; lastPauseTime = performance.now(); updateUIVisibility();
    }
}
function resumeGame() {
    if (currentGameState === GAME_STATE.PAUSED) {
        currentGameState = GAME_STATE.PLAYING; const pauseDuration = performance.now() - lastPauseTime;
        digLock += pauseDuration;
        fallers.forEach(f => { if(f.wait) f.drop += pauseDuration; f.last += pauseDuration });
        breaking.forEach(b => b.st += pauseDuration);
        if(msState) msStart += pauseDuration;
        if(player.invincibleUntil > lastPauseTime) player.invincibleUntil += pauseDuration;
        if(player.deathAnim) player.deathAnim.startTime += pauseDuration;
        updateUIVisibility();
    }
}
function showGraphicsMenuFromPause() {
    currentGameState = GAME_STATE.GRAPHICS_MENU; bloomToggle.checked = graphicsSettings.bloom; particlesToggle.checked = graphicsSettings.particles; updateUIVisibility();
}
function showPauseMenu() { currentGameState = GAME_STATE.PAUSED; updateUIVisibility(); }
singlePlayerBtn.addEventListener('click', startGameFlow);
retryBtn.addEventListener('click', () => { currentGameState = GAME_STATE.PLAYING; updateUIVisibility(); startGame(); });
mainMenuBtn.addEventListener('click', showLandingPage);
resumeBtn.addEventListener('click', resumeGame);
pauseGameBtn.addEventListener('click', togglePause);
pauseRestartBtn.addEventListener('click', () => { currentGameState = GAME_STATE.PLAYING; updateUIVisibility(); startGame(); });
pauseGraphicsSettingsBtn.addEventListener('click', showGraphicsMenuFromPause);
pauseMainMenuBtn.addEventListener('click', showLandingPage);
bloomToggle.addEventListener('change', () => graphicsSettings.bloom = bloomToggle.checked);
particlesToggle.addEventListener('change', () => graphicsSettings.particles = particlesToggle.checked);
backToPauseMenuBtn.addEventListener('click', showPauseMenu);

/* ===================== Block Helpers ===================== */
function getBlock(x, y) { return (y < 0 || y >= rows.length || !rows[y] || x < 0 || x >= COLS) ? null : rows[y][x]; }
function getBlockInfo(x, y) { const b = getBlock(x,y); return b ? BLOCK_INFO[b.typeId] : BLOCK_INFO[BLOCK_TYPES.EMPTY.id]; }
function setBlock(x, y, typeId, hp) {
    if (y >= 0 && y < rows.length && rows[y] && x >= 0 && x < COLS) {
        rows[y][x] = { typeId: typeId };
        if (hp !== undefined) rows[y][x].hp = hp;
        else if (BLOCK_INFO[typeId] && BLOCK_INFO[typeId].hp !== Infinity && BLOCK_INFO[typeId].hp !== undefined) rows[y][x].hp = BLOCK_INFO[typeId].hp;
    }
}

/* ===================== Random Gen ===================== */
const makeRow = (rowIndex) => {
    if (rowIndex === 0) return Array(COLS).fill(null).map(() => ({ typeId: BLOCK_TYPES.EMPTY.id }));
    if (rowIndex === 1) return Array(COLS).fill(null).map(() => ({ typeId: BLOCK_TYPES.SOLID.id, hp: 1 }));

    const newRow = Array(COLS).fill(null);
    let lastTypeId = null;
    const baseBlock = { typeId: BLOCK_TYPES.SOLID.id, hp: 1 };
    const currentDepth = rowIndex + depthOffset;

    for (let x = 0; x < COLS; x++) {
        const rand = seededRandom();
        const blockAbove = getBlock(x, rowIndex - 1);
        const continueVerticalCluster = blockAbove && blockAbove.typeId !== baseBlock.typeId && blockAbove.typeId !== BLOCK_TYPES.HP.id && blockAbove.typeId !== BLOCK_TYPES.SOUL.id && seededRandom() < 0.6;
        if (continueVerticalCluster && BLOCK_INFO[blockAbove.typeId].breakable) {
            newRow[x] = { typeId: blockAbove.typeId, hp: BLOCK_INFO[blockAbove.typeId].hp };
        } else if (lastTypeId && lastTypeId !== baseBlock.typeId && lastTypeId !== BLOCK_TYPES.HP.id && lastTypeId !== BLOCK_TYPES.SOUL.id && seededRandom() < 0.5) {
            newRow[x] = { typeId: lastTypeId, hp: BLOCK_INFO[lastTypeId].hp };
        } else {
            if (rand < HEART_RATE && currentDepth > 5) {
                newRow[x] = { typeId: BLOCK_TYPES.HP.id };
            } else if (rand < (HEART_RATE + 0.04 + currentDepth * 0.00025) && currentDepth > SOUL_BLOCK_MIN_DEPTH) {
                newRow[x] = { typeId: BLOCK_TYPES.SOUL.id, hp: BLOCK_TYPES.SOUL.hp };
            } else {
                const blockTypeRand = seededRandom();
                if (blockTypeRand < 0.45) newRow[x] = { ...baseBlock };
                else if (blockTypeRand < 0.65) newRow[x] = { typeId: BLOCK_TYPES.RED.id, hp: 1 };
                else if (blockTypeRand < 0.85) newRow[x] = { typeId: BLOCK_TYPES.BLUE.id, hp: 1 };
                else newRow[x] = { typeId: BLOCK_TYPES.WHITE.id, hp: 1 };
            }
        }
        lastTypeId = newRow[x] ? newRow[x].typeId : null;
        if (newRow[x] && newRow[x].typeId === BLOCK_TYPES.SOUL.id) {
            newRow[x].hp = BLOCK_TYPES.SOUL.hp;
        }
    }
    if (!newRow.some(b => b && BLOCK_INFO[b.typeId].breakable)) {
        newRow[rndInt(0, COLS - 1)] = { ...baseBlock };
    }
    return newRow;
};
function placeIronChunk(yStart) {
    const isDeep = yStart >= 200;
    const chunkWidth = isDeep ? 3 : 2;
    const chunkHeight = rndInt(IRON_CHUNK_HEIGHT_MIN, IRON_CHUNK_HEIGHT_MAX);
    const startCol = rndInt(0, COLS - chunkWidth);
    for (let r = 0; r < chunkHeight; r++) {
        const currentY = yStart + r;
        ensureRow(currentY);
        if (rows[currentY]) {
            for(let c = 0; c < chunkWidth; c++) setBlock(startCol + c, currentY, BLOCK_TYPES.IRON.id);
        }
    }
    for (let r = 0; r < chunkHeight; r++) {
        const currentY = yStart + r;
        if (!rows[currentY]) continue;
        let breakablePathExists = false;
        let pathColumns = [];
        for (let c = 0; c < COLS; c++) {
            if (getBlock(c, currentY)?.typeId !== BLOCK_TYPES.IRON.id) {
                pathColumns.push(c);
                if (getBlockInfo(c, currentY).breakable) breakablePathExists = true;
            }
        }
        if (!breakablePathExists && pathColumns.length > 0) {
            const randomPathCol = pathColumns[rndInt(0, pathColumns.length - 1)];
            setBlock(randomPathCol, currentY, BLOCK_TYPES.SOLID.id, 1);
        }
    }
    lastIronChunkEndRow = yStart + chunkHeight - 1;
}
function resetWorld(){
  rows = [];
  lastIronChunkEndRow = -IRON_CHUNK_MIN_GAP_BETWEEN -1;
  player = { x:COLS>>1, y:0, vy:0, hp:HP_MAX, lives:3, invincibleUntil: 0, deathAnim: null, freezeUntil: 0 };
  digCount = 0; hearts = 0; depthOffset = 0;
  nextMilestonePhysicalY = MILESTONE_INTERVAL;
  breaking.length = fallers.length = dust.length = 0;
  camY = 0;
  msState = null;
}
function startGame() {
    if (!mp.active) {
        window.setGameSeed(Date.now());
    }
    resetWorld();
    for (let i = 0; i < 120; i++) ensureRow(i);
    updateHUD();
}
const ensureRow = (rowIndex) => {
    while (rowIndex >= rows.length) {
        let newRowInternalIndex = rows.length; rows.push(makeRow(newRowInternalIndex));
        const totalDepth = newRowInternalIndex + depthOffset;
        if (totalDepth >= IRON_CHUNK_MIN_DEPTH && totalDepth < nextMilestonePhysicalY && newRowInternalIndex > lastIronChunkEndRow + IRON_CHUNK_MIN_GAP_BETWEEN && (totalDepth % IRON_CHUNK_INTERVAL === 0 || (totalDepth % IRON_CHUNK_INTERVAL > 0 && seededRandom() < 0.05))) {
            placeIronChunk(newRowInternalIndex);
        }
    }
};

/* ===================== Main loop ===================== */
let last=0;
requestAnimationFrame(function loop(ts){
  const dt = ts - last || 16; last = ts;
  if (currentGameState === GAME_STATE.PLAYING) {
    if (!msState && !player.deathAnim && ts > player.freezeUntil) handleInput(ts);
    update(ts, dt);
    render(ts);
  }
  else if (currentGameState === GAME_STATE.PAUSED || currentGameState === GAME_STATE.GRAPHICS_MENU) { render(ts); }
  requestAnimationFrame(loop);
});

/* ===================== Chain block breaking ===================== */
function findConnectedBlocks(startX, startY) {
    const startBlock = getBlock(startX, startY);
    if (!startBlock || !BLOCK_INFO[startBlock.typeId].breakable || BLOCK_INFO[startBlock.typeId].cracks || startBlock.typeId === BLOCK_TYPES.HP.id) return [];
    const targetTypeId = startBlock.typeId;
    const blocksFound = [];
    const queue = [[startX, startY]];
    const visited = new Set([`${startX},${startY}`]);
    blocksFound.push({x: startX, y: startY});
    while (queue.length > 0) {
        const [x, y] = queue.shift();
        [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dy]) => {
            const nx = x + dx; const ny = y + dy;
            if (nx >= 0 && nx < COLS && ny >= 0 && !visited.has(`${nx},${ny}`)) {
                visited.add(`${nx},${ny}`);
                const neighbor = getBlock(nx, ny);
                if (neighbor && neighbor.typeId === targetTypeId) {
                    queue.push([nx, ny]);
                    blocksFound.push({x: nx, y: ny});
                }
            }
        });
    }
    return blocksFound;
}

/* ===================== Input Handler ===================== */
function handleInput(ts) {
    if (ts < digLock || breaking.length > 0) return;

    const L = key['a'] || key.ArrowLeft;
    const R = key['d'] || key.ArrowRight;
    const U = key['w'] || key.ArrowUp;
    const D = key['s'] || key.ArrowDown;
    const grounded = onGround();
     
    let dx = 0;
    if (L) dx = -1;
    else if (R) dx = 1;

    if (U && dx !== 0 && grounded) {
        const nextX = player.x + dx;
        const currentY = Math.round(player.y);

        const wallBlockInfo = getBlockInfo(nextX, currentY);
        const spaceAboveWallInfo = getBlockInfo(nextX, currentY - 1);
        const spaceAbovePlayerInfo = getBlockInfo(player.x, currentY - 1);

        if (!wallBlockInfo.isGap && spaceAboveWallInfo.isGap && spaceAbovePlayerInfo.isGap) {
            player.x = nextX;
            player.y -= 1;
            player.vy = 0;
            digLock = ts + HORIZ_CD * 1.5;
            playSound('jump');
            return;
        }
    }

    let dy = 0;
    if (D) dy = 1;

    if (!dx && !dy) return;

    const tx = clamp(player.x + dx, 0, COLS - 1);
    const ty = Math.max(0, player.y + dy);
    ensureRow(ty);

    const isBlockedByFaller = fallers.some(f => f.x === tx && Math.round(f.y) === ty);
    if (isBlockedByFaller) return;
     
    const fallerIndex = fallers.findIndex(f => f.x === tx && Math.round(f.y) === ty);
    let targetBlock = (fallerIndex > -1) ? fallers[fallerIndex] : getBlock(tx, ty);
     
    if (fallerIndex > -1) {
        targetBlock = {typeId: fallers[fallerIndex].typeId, hp: fallers[fallerIndex].hp};
    } else {
        targetBlock = getBlock(tx, ty);
    }

    const targetBlockInfo = targetBlock ? BLOCK_INFO[targetBlock.typeId] : BLOCK_INFO[BLOCK_TYPES.EMPTY.id];
    if (targetBlockInfo.isGap) {
        if(dx) player.x = tx;
        if(dy) player.y = ty;
        digLock = ts + (dy === 1 ? DIG_CD * 0.2 : HORIZ_CD);
        return;
    }

    if (targetBlockInfo.breakable) {
        if (dy === 1 && player.vy > 0.5) player.vy *= 0.5;
        if (fallerIndex > -1) fallers.splice(fallerIndex, 1);
        if (targetBlockInfo.cracks) {
            targetBlock.hp--;
            digLock = ts + BREAK_MS * 0.8;
            breaking.push({ x: tx, y: ty, st: ts, type: 'hit' });
            if (graphicsSettings.particles) spawnDigParticles(tx, ty, targetBlockInfo.color || '#888', targetBlock.hp / targetBlockInfo.hp);
            playSound('dig');
            if (targetBlock.hp <= 0) {
                setBlock(tx, ty, BLOCK_TYPES.EMPTY.id);
                digCount++;
                if (ty > 0) queueFall(tx, ty - 1, getBlock(tx, ty - 1)?.typeId);
                if (dx) player.x = tx; if (dy) player.y = ty;
            } else {
                const blockToUpdate = getBlock(tx, ty);
                if(blockToUpdate) blockToUpdate.hp = targetBlock.hp;
            }
        } else {
            const connectedBlocks = findConnectedBlocks(tx, ty);
            if (connectedBlocks.length >= 3) {
                if (dy === 1) {
                    const boost = Math.min(0.7, connectedBlocks.length * 0.04);
                    player.vy += boost;
                }
                connectedBlocks.forEach(({x, y}, index) => {
                    const blockInfo = getBlockInfo(x,y);
                    breaking.push({ x: x, y: y, st: ts + index * 20, type: 'standard' });
                    setBlock(x, y, BLOCK_TYPES.EMPTY.id);
                    if (graphicsSettings.particles) setTimeout(()=>spawnDigParticles(x, y, blockInfo.color || '#888'), index*20);
                    digCount++;
                    if (y > 0) queueFall(x, y - 1, getBlock(x, y-1)?.typeId);
                });
                playSound('dig');
            } else {
                breaking.push({ x: tx, y: ty, st: ts, type: 'standard' });
                setBlock(tx, ty, BLOCK_TYPES.EMPTY.id);
                if (graphicsSettings.particles) spawnDigParticles(tx, ty, targetBlockInfo.color || '#888');
                digCount++;
                if (ty > 0) queueFall(tx, ty - 1, getBlock(tx, ty - 1)?.typeId);
                playSound('dig');
            }
            digLock = ts + BREAK_MS;
            if (dx) player.x = tx; if (dy) player.y = ty;
        }
    } else if (targetBlockInfo.id === BLOCK_TYPES.HP.id) {
        player.hp = Math.min(HP_MAX, player.hp + 30);
        hearts++;
        setBlock(tx, ty, BLOCK_TYPES.EMPTY.id);
        if (dx) player.x = tx; if (dy) player.y = ty;
        digLock = ts + (dy === 1 ? DIG_CD : HORIZ_CD);
        playSound('respawn');
    }
}

/* ===================== Game Logic ===================== */
const onGround = ()=> {
    ensureRow(Math.ceil(player.y+1));
    const blockBelowInfo = getBlockInfo(player.x, Math.ceil(player.y+1));
    return blockBelowInfo && !blockBelowInfo.isGap && player.vy>=0 && !fallers.some(f => f.x === player.x && Math.round(f.y) === Math.ceil(player.y+1));
};
const isSolidOrNonFalling = (x,y) => {
    const gridY = Math.floor(y); const block = getBlock(x,gridY); const blockInfo = block ? BLOCK_INFO[block.typeId] : BLOCK_INFO[BLOCK_TYPES.EMPTY.id];
    if (blockInfo.isGap) { if (fallers.some(f=>f.x===x && Math.round(f.y)===gridY)) return true; return false; } return true;
};
function spawnDigParticles(tileX, tileY, blockColor, intensity = 1) { if (!graphicsSettings.particles) return; const numParticles = rndInt(8, 15) * intensity; const centerX = tileX * TILE + TILE/2; const centerY = tileY * TILE + TILE/2; for (let i = 0; i < numParticles; i++) { dust.push({ x: centerX + rnd(-TILE/4, TILE/4), y: centerY + rnd(-TILE/4, TILE/4), vx: rnd(-2, 2), vy: rnd(-2.5, 1), life: rndInt(25, 45), size: rnd(2,6), color: blockColor, alpha: 0.9 }); } }

function update(ts, dt){
  breaking = breaking.filter(b => ts - b.st < (b.type === 'hit' ? BREAK_MS / 2 : BREAK_MS));

  if (msState) {
      const duration = ts - msStart;
      if (msState === 'FADING_IN') {
          msProgress = Math.min(1, duration / 500);
          if (msProgress >= 1) {
              msState = 'BREAKING';
              msStart = ts;
              finishMilestone();
              msShards = [];
              const shardW = TILE * 1.5; const shardH = TILE * 1.5;
              for(let y = -shardH; y < cv.height + shardH; y+=shardH) {
                  for(let x = -shardW; x < cv.width + shardW; x+=shardH) {
                      msShards.push({ x: x + shardW/2, y: y + shardH/2, w: shardW, h: shardH, vx: rnd(-8, 8), vy: rnd(-15, 5), rot: 0, vRot: rnd(-0.2, 0.2) });
                  }
              }
          }
      } else if (msState === 'BREAKING') {
          msProgress = Math.min(1, duration / 1000);
          msShards.forEach(s => { s.x += s.vx; s.y += s.vy; s.vy += 0.5; s.rot += s.vRot; });
          if (msProgress >= 1) {
              msState = null;
              msShards = [];
          }
      }
  } else if (player.deathAnim) {
      const deathDuration = ts - player.deathAnim.startTime;
      if (player.deathAnim.phase === 'lifting') {
          player.y -= 0.03;
          if (deathDuration > 1500) {
              player.deathAnim.phase = 'flash';
              player.deathAnim.flashProgress = 0;
          }
      } else if (player.deathAnim.phase === 'flash') {
          player.deathAnim.flashProgress = Math.min(1, (deathDuration - 1500) / 400);
          if (player.deathAnim.flashProgress >= 1) {
              player.deathAnim.phase = 'dropping';
          }
      } else if (player.deathAnim.phase === 'dropping') {
          player.vy += GRAV;
          player.y += player.vy;
          if (onGround()) {
              player.vy = 0;
              player.y = Math.round(player.y);
              player.deathAnim = null;
              playSound('land');
          }
      }
  } else {
    if (ts < player.freezeUntil) {
        player.vy = 0;
    } else {
        let effectiveGrav = GRAV;
        if (player.vy > 1.2) effectiveGrav = GRAV * 0.5;
        let oldVy = player.vy;
        player.vy += effectiveGrav;
        let totalVerticalMovement = player.vy;
        const direction = Math.sign(totalVerticalMovement);
        while (Math.abs(totalVerticalMovement) > 0.0001) {
            let step = Math.min(Math.abs(totalVerticalMovement), 0.999);
            let checkY;
            let proposedPlayerY = player.y + (direction * step);
            if (direction > 0) checkY = Math.floor(proposedPlayerY + 1.0); else checkY = Math.floor(proposedPlayerY);
            const block = getBlock(player.x, checkY);
            if (block && block.typeId === BLOCK_TYPES.HP.id) {
                player.hp = Math.min(HP_MAX, player.hp + 30);
                hearts++;
                setBlock(player.x, checkY, BLOCK_TYPES.EMPTY.id);
                playSound('respawn');
            }
            if (isSolidOrNonFalling(player.x, checkY)) {
                if (direction > 0 && oldVy > 0.3) playSound('land');
                if (direction > 0) player.y = checkY - 1.0; else player.y = checkY + 1.0;
                player.vy = 0; totalVerticalMovement = 0;
            } else {
                player.y += (direction * step);
                totalVerticalMovement = direction * Math.max(0, direction * totalVerticalMovement - step);
            }
        }
    }
    const currentDepth = Math.floor(player.y) + depthOffset;
    if (currentDepth >= nextMilestonePhysicalY) {
        startMilestone(ts);
    }
    player.hp -= HP_DRAIN; const currentBlock = getBlock(player.x, Math.round(player.y)); const currentBlockInfo = currentBlock ? BLOCK_INFO[currentBlock.typeId] : null;
    if (player.hp <= 0 || (player.vy === 0 && currentBlockInfo && !currentBlockInfo.isGap && !currentBlockInfo.isHeart)){
         if(ts > player.invincibleUntil) loseLife(ts);
    }
    if (ts > player.freezeUntil) {
        updateFallers(ts);
    }
  }
  camY += ((player.y+0.5)*TILE - camY - cv.height*0.4)*0.1; ensureRow(Math.floor((camY+cv.height)/TILE) + 30);
  dust = dust.filter(d=> { d.life--; if (d.life <=0) return false; d.x+=d.vx; d.y+=d.vy; d.vy+=0.1; if(d.alpha) d.alpha = Math.max(0, d.alpha - 0.02); return true; });
  updateHUD();

  if (mp.active && mp.conn && mp.conn.open){
    mp.conn.send({
      t:'s',
      x:player.x, y:player.y, vy:player.vy,
      hp:player.hp, depth:depthOffset
    });
  }
}
function updateHUD(){
  if (!hpBar || !livesEl || !depthEl || !scoreEl) return; hpBar.style.width = clamp(player.hp/HP_MAX*100, 0, 100)+'%';
  livesEl.innerHTML = ''; for(let i=0;i<player.lives;i++) livesEl.innerHTML += '<span></span>';
  depthEl.textContent = Math.max(0, Math.floor(player.y + depthOffset)) +' m';
  scoreEl.textContent = calcScore();

  const winsDisplay = document.getElementById('mp-wins-display');
  if (mp.active) {
      winsDisplay.style.display = 'block';
      const winsCounter = document.getElementById('wins-counter');
      winsCounter.textContent = `You: ${localWins} | Opponent: ${remoteWins}`;
  } else {
      if(winsDisplay) winsDisplay.style.display = 'none';
  }
}

function loseLife(tsNow){
    player.lives--;

    if (mp.active && mp.conn && mp.conn.open) {
        if (mp.isHost) {
            remoteWins++;
            mp.conn.send({t:'w', local:localWins, remote:remoteWins});
        } else {
            mp.conn.send({ t: 'life_lost' });
        }
    }

    playSound('death');
    updateHUD();
    if (player.lives <= 0){
        if (mp.active && mp.conn && mp.conn.open) {
            currentGameState = GAME_STATE.GAME_OVER;
            mp.conn.send({t: 'gg'});
            window.showMpRematchPage(calcScore(), false);
        } else {
            showRestartPage();
        }
        return;
    }
    const deathX = player.x;
    const deathY = Math.round(player.y);
    setBlock(deathX, deathY, BLOCK_TYPES.EMPTY.id);
    player.y = deathY;
    player.vy = 0;
    player.hp = HP_MAX;
    player.invincibleUntil = tsNow + 4000;
    player.deathAnim = { startTime: tsNow, phase: 'lifting', flashProgress: 0 };
    playSound('respawn');
    fallers = fallers.filter(f => !(f.x === deathX && (Math.round(f.y) === deathY || Math.round(f.y) === deathY + 1)));
}

const queueFall = (x,y, typeIdToFall)=>{
  if (msState || y<0||!rows[y] || player.deathAnim) return;
  const block = getBlock(x,y); if (!block || block.typeId !== typeIdToFall) return;
  const blockInfo = BLOCK_INFO[block.typeId]; if (!blockInfo.fallable || blockInfo.isGap || fallers.some(f=>f.x===x&&f.y===y)) return;
  setBlock(x, y, BLOCK_TYPES.EMPTY.id); fallers.push({ x, y, typeId: block.typeId, hp: block.hp, wait:true, drop: performance.now()+rnd(...FALL_WAIT), last:performance.now() });
};
const updateFallers = now => {
    if (player.deathAnim || msState) return;
    for (let i = fallers.length - 1; i >= 0; i--) {
        let f = fallers[i];
        if (f.wait && currentGameState === GAME_STATE.PLAYING) {
            if (now < f.drop) continue;
            if (!getBlockInfo(f.x, Math.round(f.y) + 1).isGap) {
                setBlock(f.x, Math.round(f.y), f.typeId, f.hp);
                fallers.splice(i, 1);
                continue;
            }
            f.wait = false;
            f.last = now;
        }
        if (now - f.last < FALL_STEP) continue;
        const ny = Math.round(f.y + 1);
        ensureRow(ny);
        if (player.x === f.x && Math.abs(player.y - f.y) < 1) {
            if (now > player.invincibleUntil) {
                loseLife(now);
                setBlock(f.x, Math.round(f.y), f.typeId, f.hp);
                if (graphicsSettings.particles) spawnDigParticles(f.x, Math.round(f.y), BLOCK_INFO[f.typeId].color, 0.5);
                fallers.splice(i, 1);
                triggerNeighborFalls(f.x, Math.round(f.y));
            } else {
                if (graphicsSettings.particles) spawnDigParticles(f.x, Math.round(f.y), BLOCK_INFO[f.typeId].color, 1.5);
                fallers.splice(i, 1);
                triggerNeighborFalls(f.x, Math.round(f.y));
            }
            continue;
        }
        const blockBelowInfo = getBlockInfo(f.x, ny);
        const anotherFallerAtTarget = fallers.some(of => of !== f && of.x === f.x && Math.round(of.y) === ny);
        if (blockBelowInfo && blockBelowInfo.isGap && !anotherFallerAtTarget) {
            f.y += 1;
            f.last = now;
        } else {
            setBlock(f.x, Math.round(f.y), f.typeId, f.hp);
            spawnDigParticles(f.x, Math.round(f.y), BLOCK_INFO[f.typeId].color, 0.5);
            playSound('land');
            fallers.splice(i, 1);
            triggerNeighborFalls(f.x, Math.round(f.y));
        }
    }
};
function triggerNeighborFalls(landedX, landedY) { if (landedY > 0) { const bA = getBlock(landedX, landedY - 1); if (bA && BLOCK_INFO[bA.typeId].fallable) queueFall(landedX, landedY - 1, bA.typeId); } }
function startMilestone(ts){
  if (msState) return;
  msState = 'FADING_IN';
  msStart = ts;
  msProgress = 0;
  player.vy = 0;
}
window.startMilestone = startMilestone;

function updateStoneTypeForNewLevel(level) {
    const base = 85;
    const offset = ((level * 37) % 40) - 20;
    const newColorValue = clamp(base + offset, 50, 120);
    BLOCK_INFO[BLOCK_TYPES.STONE.id].color = '#' + newColorValue.toString(16).repeat(3);
}
function finishMilestone() {
    depthOffset = nextMilestonePhysicalY;
    nextMilestonePhysicalY += MILESTONE_INTERVAL;
    const milestoneLevel = (depthOffset / MILESTONE_INTERVAL) + 1;
    updateStoneTypeForNewLevel(milestoneLevel);

    if (mp.active && mp.isHost && mp.conn && mp.conn.open){
      const hostWon = player.y >= mp.remote.y;
      if (hostWon) localWins++; else remoteWins++;
      mp.conn.send({t:'w', local:localWins, remote:remoteWins});
      mp.conn.send({t:'milestone_crossed'});
    }

    player.y = 0;
    player.vy = 0;
    camY = 0;
    rows = [];
    fallers = [];
    breaking = [];
    lastIronChunkEndRow = -IRON_CHUNK_MIN_GAP_BETWEEN -1;
    ensureRow(120);
}
function calcScore(){ return digCount*10 + hearts*100; }
const crackPatterns = [
    (ctx) => { ctx.moveTo(-TILE*0.2, -TILE*0.3); ctx.lineTo(TILE*0.1, TILE*0.25); ctx.moveTo(TILE*0.3, -TILE*0.1); ctx.lineTo(-TILE*0.15, -TILE*0.2); },
    (ctx) => { ctx.moveTo(-TILE*0.3, -TILE*0.2); ctx.lineTo(TILE*0.3, TILE*0.1); ctx.moveTo(TILE*0.2, -TILE*0.3); ctx.lineTo(-TILE*0.1, TILE*0.3); ctx.moveTo(-TILE*0.35, TILE*0.15); ctx.lineTo(-TILE*0.05, -TILE*0.05); },
];
function render(ts){
  if (!ctx) return;
  ctx.fillStyle = '#0a0625';
  ctx.fillRect(0,0,cv.width,cv.height);

  if (msState !== 'FADING_IN') {
    if (graphicsSettings.bloom) {
        ctx.save(); ctx.filter = 'blur(3px) brightness(120%)'; ctx.globalAlpha = 0.5; const preStartY = Math.max(0, Math.floor(camY/TILE)-2); const preEndY = Math.min(rows.length - 1, Math.floor((camY+cv.height)/TILE)+2);
        ctx.save(); ctx.translate(Math.floor((cv.width - COLS*TILE)/2), -Math.floor(camY));
        for (let y=preStartY; y<=preEndY; y++){ if (!rows[y]) continue; for (let x=0; x<COLS; x++){ const b = getBlock(x,y); if (!b || b.typeId === BLOCK_TYPES.EMPTY.id) continue; const bd = BLOCK_INFO[b.typeId]; if (!bd || !bd.glow) continue;
            ctx.fillStyle = bd.color; if (bd.isHeart) { ctx.beginPath(); ctx.arc(x*TILE + TILE/2, y*TILE + TILE/2, TILE/2.5, 0, Math.PI*2); ctx.fill(); } else { ctx.fillRect(x*TILE, y*TILE, TILE, TILE); }
        }} ctx.restore(); ctx.restore();
    }
    ctx.save(); ctx.translate(Math.floor((cv.width - COLS*TILE)/2), -Math.floor(camY)); const startY = Math.max(0, Math.floor(camY/TILE)-2), endY = Math.min(rows.length - 1, Math.floor((camY+cv.height)/TILE)+2);
    for (let y=startY; y<=endY; y++){ if (!rows[y]) continue; for (let x=0; x<COLS; x++){ const blk = getBlock(x,y); if (!blk || blk.typeId === BLOCK_TYPES.EMPTY.id) continue; const blkDef = BLOCK_INFO[blk.typeId]; if (!blkDef) continue;
      let sc=1, ox=0, oy=0; const brAnim = breaking.find(b=>b.x===x&&b.y===y);
      const fl = fallers.find(f => f.x === x && Math.round(f.y) === y && f.wait);
      if (brAnim) { const p = (ts - brAnim.st) / (brAnim.type === 'hit' ? BREAK_MS/2 : BREAK_MS); if (brAnim.type === 'standard') sc = 1 - p*p; else if (brAnim.type === 'hit') sc = 1 + Math.sin(p * Math.PI * 4) * 0.1; }
      if (fl && currentGameState === GAME_STATE.PLAYING) { const a = SHAKE * Math.max(0, 1 - (fl.drop - ts)/FALL_WAIT[1]); ox = rnd(-a,a); oy = rnd(-a,a); }
      ctx.save(); ctx.translate(x*TILE + TILE/2 + ox, y*TILE + TILE/2 + oy); ctx.scale(sc, sc);
      if (blkDef.isHeart){ ctx.fillStyle = blkDef.color; ctx.beginPath(); ctx.moveTo(0, -12 * (TILE/60)); ctx.bezierCurveTo(12*(TILE/60), -24*(TILE/60), 36*(TILE/60), -6*(TILE/60), 0, 24*(TILE/60)); ctx.bezierCurveTo(-36*(TILE/60), -6*(TILE/60), -12*(TILE/60), -24*(TILE/60), 0, -12*(TILE/60)); ctx.fill(); }
      else { ctx.fillStyle = blkDef.color; ctx.fillRect(-TILE/2, -TILE/2, TILE, TILE);
        if (blkDef.cracks && blk.hp < blkDef.hp) { const dmg = blkDef.hp - blk.hp; const crkStg = Math.min(dmg - 1, crackPatterns.length - 1);
            if (crkStg >= 0) { ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = Math.max(1, 2 * (TILE/60)); ctx.beginPath(); crackPatterns[crkStg](ctx); ctx.stroke(); } }
      } ctx.restore();
    }}
    fallers.forEach(f => { const bd = BLOCK_INFO[f.typeId]; if (!bd) return; let sc=1, ox=0, oy=0;
      if (f.wait && currentGameState === GAME_STATE.PLAYING){ const a = SHAKE * Math.max(0, 1 - (f.drop - ts)/FALL_WAIT[1]); ox = rnd(-a,a); oy = rnd(-a,a); }
      ctx.save(); ctx.translate(f.x*TILE + TILE/2 + ox, f.y*TILE + TILE/2 + oy); ctx.scale(sc, sc);
      if (bd.isHeart){ } else { ctx.fillStyle = bd.color; ctx.fillRect(-TILE/2, -TILE/2, TILE, TILE);
        if (bd.cracks && f.hp < bd.hp) { const dmg = bd.hp - f.hp; const crkStg = Math.min(dmg - 1, crackPatterns.length - 1);
            if (crkStg >= 0) { ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = Math.max(1, 2 * (TILE/60)); ctx.beginPath(); crackPatterns[crkStg](ctx); ctx.stroke(); } }
      } ctx.restore();
    });
    dust.forEach(d=>{ ctx.globalAlpha = d.alpha !== undefined ? d.alpha : d.life/40; ctx.fillStyle = d.color || '#c8b27d'; const sz = d.size || 6; ctx.fillRect(d.x-sz/2, d.y-sz/2, sz, sz); }); ctx.globalAlpha = 1;

    ctx.save();
    const R = 20 * (TILE/60);
    const px = player.x*TILE + TILE/2, py = player.y*TILE + TILE/2 + TILE/6;
    let drawLocal = true;
    if (ts < player.invincibleUntil) {
        if ((ts - (player.invincibleUntil - 4000)) % 150 > 75) drawLocal = false;
    }
    if (drawLocal) { ctx.fillStyle = localColor; ctx.beginPath(); ctx.arc(px, py, R, 0, 2*Math.PI); ctx.fill(); }

    if (mp.remote.connected) {
        const rx = mp.remote.x*TILE + TILE/2, ry = mp.remote.y*TILE + TILE/2 + TILE/6;
        ctx.fillStyle = remoteColor;
        ctx.beginPath(); ctx.arc(rx, ry, R, 0, 2*Math.PI); ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }

  if (msState) {
      ctx.save();
      if (msState === 'FADING_IN') {
          ctx.globalAlpha = msProgress;
          ctx.fillStyle = BLOCK_INFO[BLOCK_TYPES.STONE.id].color;
          ctx.fillRect(0, 0, cv.width, cv.height);
      } else if (msState === 'BREAKING') {
          ctx.fillStyle = BLOCK_INFO[BLOCK_TYPES.STONE.id].color;
          msShards.forEach(s => {
              ctx.save();
              ctx.translate(s.x, s.y);
              ctx.rotate(s.rot);
              ctx.globalAlpha = 1 - msProgress;
              ctx.fillRect(-s.w/2, -s.h/2, s.w, s.h);
              ctx.restore();
          });
      }
      ctx.restore();
  }

  if (player.deathAnim && player.deathAnim.phase === 'flash') {
      ctx.save();
      const flashAlpha = Math.sin(player.deathAnim.flashProgress * Math.PI);
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.restore();
  }
}

updateUIVisibility();

function applyMobileZoom() {
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  
  if (isMobile) {
    const targetWidth = 1600;
    const zoomLevel = window.innerWidth / targetWidth;
    document.body.style.zoom = zoomLevel;
  } else {
    document.body.style.zoom = 1;
  }
}

window.addEventListener('load', applyMobileZoom);
window.addEventListener('resize', applyMobileZoom);