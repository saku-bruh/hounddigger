/* ===================== Const & Helpers ===================== */
const TILE = 60, COLS = 7;
const GRAV = .03;
const DIG_CD = 100, HORIZ_CD = 100;
const BREAK_MS = 120;
const HP_MAX = 100, HP_DRAIN = .03, HEART_RATE = .01;
const CRUMBLE_MS = 1000, FALL_WAIT = [1500,2000], FALL_STEP = 90, SHAKE = 3;
const T = { EMPTY:0, SOLID:1, HP:2, STONE:3 };
const rnd = (a,b)=>a + Math.random()*(b-a);
const clamp = (v,a,b)=>v<a?a:v>b?b:v;

/* ===================== Canvas ===================== */
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
function fit(){ cv.width = cv.clientWidth; cv.height = cv.clientHeight; }
fit(); window.addEventListener('resize',fit);

/* ===================== DOM Elements ===================== */
const titleScreen = document.getElementById('title-screen');
const pauseScreen = document.getElementById('pause-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const startButton = document.getElementById('start-button');
const resumeButton = document.getElementById('resume-button');
const restartButtonPause = document.getElementById('restart-button-pause');
const restartButtonGameOver = document.getElementById('restart-button-gameover');
const finalScoreEl = document.getElementById('final-score');
const pauseGameButton = document.getElementById('pause-game-button');
const exitToMenuPauseButton = document.getElementById('exit-to-menu-pause');
const exitToMenuGameOverButton = document.getElementById('exit-to-menu-gameover');

const hpBar = document.getElementById('hpBar'),
      livesEl= document.getElementById('lives'),
      depthEl= document.getElementById('depth'),
      scoreEl= document.getElementById('score');

/* ===================== Game State ===================== */
let gameState = "title";
let rows = [], depth = 0, hearts = 0, nextMS = 100;
let player, breaking = [], fallers = [], dust = [], digLock = 0, camY = 0;
let msState = null, msStart = 0, wallRows = [];
let pauseStartTime = 0;

/* ===================== Input ===================== */
const key = {};
const norm = k => k.length===1 ? k.toLowerCase() : k;

document.querySelectorAll('.pbtn').forEach(btn => {
  const k = btn.dataset.k;
  ['touchstart','mousedown'].forEach(ev => btn.addEventListener(ev, e => {
    if (gameState === "playing") key[k]=true;
    e.preventDefault();
  }));
  ['touchend','mouseup','mouseleave','touchcancel'].forEach(ev => btn.addEventListener(ev, e => {
    key[k]=false;
    e.preventDefault();
  }));
});

/* ===================== Random Gen / World Setup ===================== */
const makeRow = i =>
  i===1
    ? Array(COLS).fill(T.SOLID)
    : Array.from({length:COLS},()=>Math.random()<HEART_RATE?T.HP:T.SOLID);

const ensureRow = i => { while (i >= rows.length) rows.push(makeRow(i)); };

function resetWorld(){
  rows = [Array(COLS).fill(T.EMPTY)];
  for (let i=1; i<120; i++) rows.push(makeRow(i));

  player = { x:COLS>>1, y:0, vy:0, hp:HP_MAX, lives:3 };
  depth = hearts = 0; nextMS = 100;
  breaking.length = fallers.length = dust.length = 0;
  digLock = 0; camY = 0; msState = null; wallRows = [];

  for (const k_iter in key) {
    if (key.hasOwnProperty(k_iter)) {
        key[k_iter] = false;
    }
  }
  updateHUD();
}

/* ===================== Core Game Logic ===================== */
function step(x,y,countDepth){
  if (rows[y][x] === T.HP){
    player.hp = Math.min(HP_MAX, player.hp + 30);
    hearts++;
    countDepth = false;
  }
  rows[y][x] = T.EMPTY;
  player.x = x; player.y = y;
  if (rows[y-1] && rows[y-1][x]!==T.HP) queueFall(x,y-1);
  if (countDepth){
    depth++;
    if (depth >= nextMS) startMilestone();
  }
  updateHUD();
}

const onGround = ()=> { ensureRow(player.y+1); return rows[player.y+1][player.x]!==T.EMPTY && player.vy>=0; };
const solid = (x,y)=> (rows[y] && rows[y][x]!==T.EMPTY) || fallers.some(f=>f.x===x&&Math.floor(f.y)===y);

const spawnDustRow = y => {
  for(let x=0;x<COLS;x++) for(let i=0;i<3;i++)
    dust.push({ x:x*TILE+TILE/2, y:y*TILE+TILE/2, vx:rnd(-1,1), vy:rnd(-4,-1), life:40 });
};

function loseLife(tsNow){
  if (gameState === "gameover" || gameState !== "playing") return;

  player.lives--;
  updateHUD();

  if (player.lives < 0){
    enterGameOverState();
    return;
  }
  let ry = player.y;
  while(ry > 0 && solid(player.x,ry)) ry--;
  player.y = Math.max(0, ry);
  player.vy = 0; player.hp = HP_MAX;
  digLock = tsNow + 500;
  updateHUD();
}

function enterGameOverState() {
  gameState = "gameover";
  finalScoreEl.textContent = `Score: ${calcScore()}`;
  gameOverScreen.style.display = "flex";
  if (pauseGameButton) pauseGameButton.style.display = 'none';
}

/* ===================== Falling blocks ===================== */
const queueFall = (x,y)=>{
  if (msState||y<0||!rows[y]) return;
  const t = rows[y][x];
  if (t===T.EMPTY||t===T.HP) return;
  if (fallers.some(f=>f.x===x&&f.y===y)) return;
  fallers.push({ x, y, type: t, wait:true, drop: performance.now()+rnd(...FALL_WAIT), last:0 });
  rows[y][x] = T.EMPTY;
};

const updateFallers = now => {
  fallers = fallers.filter(f=>{
    if (f.wait){
      if (now < f.drop) return true;
      f.wait = false;
      f.last = now;
    }
    if (now - f.last < FALL_STEP) return true;

    const ny = Math.floor(f.y+1);
    ensureRow(ny);

    if (player.x===f.x && player.y===ny) {
        if (gameState === "playing") loseLife(now);
    }

    if (!solid(f.x,ny)){
      f.y += 1;
      f.last = now;
      if (rows[f.y-1] && rows[f.y-1][f.x] !== T.HP) queueFall(f.x, f.y-1);
      return true;
    }
    rows[f.y][f.x] = f.type;
    queueFall(f.x-1, f.y);
    queueFall(f.x+1, f.y);
    queueFall(f.x, f.y-1);
    return false;
  });
};

/* ===================== Milestones ===================== */
function startMilestone(){
  msState='spin'; msStart=performance.now(); nextMS += 100;
  const yNow = player.y; wallRows = [];
  for(let y=0;y<rows.length;y++){
    if (rows[y]) {
      if (y !== yNow) rows[y].fill(T.STONE);
      wallRows.push(y);
    }
  }
  spawnDustRow(yNow);
  if (rows[yNow]) rows[yNow].fill(T.EMPTY);
  player.y = 0; player.vy = 0;
  camY = 0;
}

function finishMilestone(){
  msState = null;
  for(let y=0; y < rows.length; y++) {
    if (wallRows.includes(y) && rows[y]) {
        if (y === 0) rows[y].fill(T.EMPTY);
        else rows[y] = makeRow(y);
    }
  }
  player.y = 0; camY = 0; wallRows = [];
}

/* ===================== HUD & Score ===================== */
function calcScore(){ return depth*10 + hearts*100; }

function updateHUD(){
  if (!hpBar || !livesEl || !depthEl || !scoreEl || !player) return;
  hpBar.style.width = (player.hp/HP_MAX*100)+'%';
  livesEl.innerHTML = '';
  for(let i=0;i<player.lives;i++) livesEl.innerHTML += '<span></span>';
  depthEl.textContent = depth+' m';
  scoreEl.textContent = calcScore();
}

/* ===================== Main Game Loop ===================== */
let lastTimestamp = 0;
function loop(ts){
  const dt = ts - lastTimestamp;
  lastTimestamp = ts;

  if (gameState === "playing") {
    handleInput(ts);
    update(ts, dt);
  }

  render(ts);
  requestAnimationFrame(loop);
}

/* ===================== Input Handler ===================== */
function handleInput(ts) {
  if (breaking.length > 0 || ts < digLock || msState) return;

  const L = key['a'] || key.ArrowLeft;
  const R = key['d'] || key.ArrowRight;
  const U = key['w'] || key.ArrowUp;
  const D = key['s'] || key.ArrowDown;

  if (U && (L||R) && onGround()) {
    const dir = L ? -1 : 1;
    const tx = player.x + dir, ty = player.y - 1;
    ensureRow(ty);
    ensureRow(player.y);
    if (rows[player.y] && rows[player.y][tx] !== T.EMPTY && rows[ty] && rows[ty][tx] === T.EMPTY) {
      player.x = tx;
      player.y = ty;
      digLock = ts + 150;
    }
    return;
  }

  let dx = 0, dy = 0;
  if (U)       dy = -1;
  else if (D)  dy = 1;
  else if (L)  dx = -1;
  else if (R)  dx = 1;

  if (!dx && !dy) return;

  const tx = clamp(player.x + dx, 0, COLS - 1);
  const ty = Math.max(0, player.y + dy);
  ensureRow(ty);

  const tile = rows[ty][tx];
  if (tile === T.EMPTY && !(dx === 0 && dy === -1)) return;

  const crack = cb => {
    breaking.push({ x: tx, y: ty, st: ts, cb });
    digLock = ts + BREAK_MS;
  };

  if (tile === T.SOLID) {
    crack(() => {
        rows[ty][tx] = T.EMPTY;
        step(tx, ty, dy === 1);
    });
  } else if (tile === T.HP || (dx === 0 && dy === -1 && tile === T.EMPTY)) {
    step(tx, ty, dy === 1 && tile !== T.HP);
    digLock = ts + (dy === 1 ? DIG_CD : HORIZ_CD);
  } else if (tile !== T.EMPTY) {
     step(tx, ty, dy === 1 && tile !== T.HP);
     digLock = ts + (dy === 1 ? DIG_CD : HORIZ_CD);
  }
}

/* ===================== Update Function ===================== */
function update(ts, dt){
  breaking = breaking.filter(b => {
    if (ts - b.st < BREAK_MS) return true;
    b.cb();
    return false;
  });

  if (msState==='spin' && ts-msStart>400) msState='crumble';
  if (msState==='crumble'){
    const p = Math.min(1, (ts-msStart-400)/CRUMBLE_MS);
    const gone = Math.floor(p * wallRows.length);
    for(let i=0;i<gone;i++){
      const y = wallRows[i];
      if (rows[y] && rows[y][0]!==T.EMPTY){
        for(let x=0; x<COLS; x++) if(rows[y][x] !== T.HP) rows[y][x] = T.EMPTY;
        spawnDustRow(y);
      }
    }
    if (p>=1) finishMilestone();
  }

  if (!msState){
    player.vy += GRAV;
    let moveY = player.vy;
    while (moveY > 0.01) {
        if (!solid(player.x, Math.floor(player.y + 1))) {
            player.y++;
            moveY--;
        } else {
            player.vy = 0; break;
        }
    }
    while (moveY < -0.01) {
        if (player.y > 0 && !solid(player.x, Math.floor(player.y -1))) {
            player.y--;
            moveY++;
        } else {
            player.vy = 0; break;
        }
    }
    player.y = Math.max(0, player.y);

    player.hp -= HP_DRAIN;
    if (player.hp <= 0 || (solid(player.x,player.y) && rows[player.y][player.x]!==T.HP && rows[player.y][player.x]!==T.EMPTY)){
        loseLife(ts);
    }
    updateFallers(ts);
    fallers.forEach(f => {
        if (f.x === player.x && Math.floor(f.y) === player.y) {
            if (gameState === "playing") loseLife(ts);
        }
    });
  }

  camY += ((player.y+1)*TILE - camY - cv.height*0.3)*0.15;
  ensureRow(Math.floor(player.y + cv.height/TILE + 5));

  dust = dust.filter(d=>--d.life>0).map(d=>(d.x+=d.vx,d.y+=d.vy,d.vy+=.25,d));
}

/* ===================== Renderer ===================== */
function render(ts){
  if (!ctx) return;
  ctx.clearRect(0,0,cv.width,cv.height);

  if (gameState === "title" || gameState === "gameover") {
    // ctx.filter = 'blur(3px)';
  } else {
    ctx.filter = 'none';
  }

  ctx.save();
  ctx.translate((cv.width - COLS*TILE)/2, -camY);

  const startY = Math.max(0, Math.floor(camY/TILE)-2),
        endY   = Math.min(rows.length - 1, Math.floor((camY+cv.height)/TILE)+2);

  for (let y=startY; y<=endY; y++){
    if (!rows[y]) continue;
    for (let x=0; x<COLS; x++){
      const t = rows[y][x];
      if (t === T.EMPTY) continue;

      let sc=1, ox=0, oy=0;
      const br = breaking.find(b=>b.x===x&&b.y===y);

      if (br && gameState === "playing"){
        const p = (ts - br.st)/BREAK_MS;
        sc = 1 - Math.sin(p * Math.PI / 2);
        ox = rnd(-SHAKE*p, SHAKE*p);
        oy = rnd(-SHAKE*p, SHAKE*p);
      }

      ctx.save();
      ctx.translate(x*TILE + TILE/2 + ox, y*TILE + TILE/2 + oy);
      ctx.scale(sc, sc);

      if (t===T.SOLID)      ctx.fillStyle = '#4b2d7d';
      else if (t===T.STONE) ctx.fillStyle = '#555';
      else if (t===T.HP)    ctx.fillStyle = '#ff5c93';

      if (t !== T.HP) {
         ctx.fillRect(-TILE/2, -TILE/2, TILE, TILE);
      } else {
        ctx.beginPath();
        const s = TILE/60;
        ctx.moveTo(0, -12 * s);
        ctx.bezierCurveTo(12*s, -24*s, 36*s, -6*s, 0, 24*s);
        ctx.bezierCurveTo(-36*s, -6*s, -12*s, -24*s, 0, -12*s);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  fallers.forEach(f => {
    if (f.y < startY -1 || f.y > endY + 1) return;

    let sc=1, ox=0, oy=0;
    if (f.wait && gameState === "playing"){
      const a = SHAKE * Math.max(0, 1 - (f.drop - ts)/FALL_WAIT[1]);
      ox = rnd(-a,a); oy = rnd(-a,a);
    }
    ctx.save();
    ctx.translate(f.x*TILE + TILE/2 + ox, f.y*TILE + TILE/2 + oy);
    ctx.scale(sc,sc);

    if (f.type ===T.SOLID) ctx.fillStyle = '#4b2d7d';
    else if (f.type ===T.STONE) ctx.fillStyle = '#555';

    if (f.type !== T.HP) {
        ctx.fillRect(-TILE/2, -TILE/2, TILE, TILE);
    }
    ctx.restore();
  });

  if (gameState === "playing" || gameState === "paused") {
    ctx.fillStyle = '#c8b27d';
    dust.forEach(d=>{
      ctx.globalAlpha = Math.max(0, d.life/40);
      ctx.fillRect(d.x-3, d.y-3, 6, 6);
    });
    ctx.globalAlpha = 1;
  }

  if (player && (gameState === "playing" || gameState === "paused")) {
    ctx.save();
    const R = 20 * (TILE/60);
    const px = player.x*TILE + TILE/2,
          py = player.y*TILE + TILE - R;
    if (msState==='spin' && gameState === "playing"){
      ctx.translate(px,py);
      ctx.rotate(((ts - msStart)/400) * 4 * Math.PI);
      ctx.translate(-px,-py);
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px, py - R/2, R, 0, 2*Math.PI);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/* ===================== UI Event Listeners & Control ===================== */

function goToMainMenu() {
  pauseScreen.style.display = 'none';
  gameOverScreen.style.display = 'none';
  titleScreen.style.display = 'flex';
  if (pauseGameButton) pauseGameButton.style.display = 'none';
  gameState = "title";
  // resetWorld() is not called here, as startGame() will handle it for a New Game.
  // The HUD will retain old values, which is fine for a title screen.
}

function togglePause() {
  if (gameState === "playing") {
    gameState = "paused";
    pauseStartTime = performance.now();
    pauseScreen.style.display = 'flex';
    for (const k_iter in key) { if (key.hasOwnProperty(k_iter)) key[k_iter] = false; }
    if (pauseGameButton) pauseGameButton.innerHTML = '▶';
  } else if (gameState === "paused") {
    const pauseDuration = performance.now() - pauseStartTime;
    msStart += pauseDuration;
    fallers.forEach(f => {
      if (f.wait) f.drop += pauseDuration;
      f.last += pauseDuration;
    });
    breaking.forEach(b => {
      b.st += pauseDuration;
    });
    if (digLock > (performance.now() - pauseDuration)) {
        digLock += pauseDuration;
    }

    pauseScreen.style.display = 'none';
    gameState = "playing";
    lastTimestamp = performance.now();
    if (pauseGameButton) pauseGameButton.innerHTML = '❚❚';
  }
}

function startGame() {
  titleScreen.style.display = 'none';
  gameOverScreen.style.display = 'none';
  pauseScreen.style.display = 'none';
  resetWorld();
  gameState = "playing";
  lastTimestamp = performance.now();
  updateHUD();
  if (pauseGameButton) {
      pauseGameButton.style.display = 'block';
      pauseGameButton.innerHTML = '❚❚';
  }
}

startButton.addEventListener('click', startGame);

restartButtonPause.addEventListener('click', () => {
  startGame();
});

restartButtonGameOver.addEventListener('click', () => {
  startGame();
});

resumeButton.addEventListener('click', () => {
  if (gameState !== "paused") return;
  togglePause();
});

if (exitToMenuPauseButton) {
  exitToMenuPauseButton.addEventListener('click', goToMainMenu);
}
if (exitToMenuGameOverButton) {
  exitToMenuGameOverButton.addEventListener('click', goToMainMenu);
}


window.addEventListener('keydown', e => {
  const SrtNormKey = norm(e.key);
  if (SrtNormKey === 'escape' || SrtNormKey === 'p') {
    if (gameState === "playing" || gameState === "paused") {
        togglePause();
    }
  }
  if (gameState === "playing") {
    key[SrtNormKey] = true;
  }
});

window.addEventListener('keyup', e => {
  key[norm(e.key)] = false;
});

if (pauseGameButton) {
  pauseGameButton.addEventListener('click', () => {
      if (gameState === "playing" || gameState === "paused") {
          togglePause();
      }
  });
}

/* ===================== Initial Game Setup ===================== */
resetWorld();
gameState = "title";
titleScreen.style.display = "flex";
pauseScreen.style.display = "none";
gameOverScreen.style.display = "none";
if (pauseGameButton) pauseGameButton.style.display = 'none';
updateHUD();

lastTimestamp = performance.now();
requestAnimationFrame(loop);