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

/* ===================== State ===================== */
let rows = [], depth = 0, hearts = 0, nextMS = 100;
let player, breaking = [], fallers = [], dust = [], digLock = 0, camY = 0;
let msState = null, msStart = 0, wallRows = [];

/* ===================== Input ===================== */
const key = {};
const norm = k => k.length===1 ? k.toLowerCase() : k;
window.addEventListener('keydown', e => key[norm(e.key)] = true);
window.addEventListener('keyup',   e => key[norm(e.key)] = false);
document.querySelectorAll('.pbtn').forEach(btn => {
  const k = btn.dataset.k;
  ['touchstart','mousedown'].forEach(ev => btn.addEventListener(ev, e => { key[k]=true; e.preventDefault() }));
  ['touchend','mouseup','mouseleave','touchcancel'].forEach(ev => btn.addEventListener(ev, e => { key[k]=false; e.preventDefault() }));
});

/* ===================== Random Gen ===================== */
const makeRow = i =>
  i===1
    ? Array(COLS).fill(T.SOLID)
    : Array.from({length:COLS},()=>Math.random()<HEART_RATE?T.HP:T.SOLID);

function resetWorld(){
  rows = [Array(COLS).fill(T.EMPTY)];
  for (let i=1; i<120; i++) rows.push(makeRow(i));
  player = { x:COLS>>1, y:0, vy:0, hp:HP_MAX, lives:3 };
  depth = hearts = 0; nextMS = 100;
  breaking.length = fallers.length = dust.length = 0;
  camY = 0; msState = null; wallRows = [];
}
resetWorld();
const ensureRow = i => { while (i >= rows.length) rows.push(makeRow(i)); };

/* ===================== Main loop ===================== */
let last=0;
requestAnimationFrame(function loop(ts){
  const dt = ts - last || 16;
  last = ts;
  handleInput(ts);
  update(ts);
  render(ts);
  requestAnimationFrame(loop);
});

/* ===================== Input Handler ===================== */
function handleInput(ts) {
  if (breaking.length > 0 || ts < digLock || msState) return;

  const L = key['a']      || key.ArrowLeft;
  const R = key['d']      || key.ArrowRight;
  const U = key['w']      || key.ArrowUp;
  const D = key['s']      || key.ArrowDown;

  if (U && (L||R) && onGround()) {
    const dir = L ? -1 : 1;
    const tx = player.x + dir, ty = player.y - 1;
    ensureRow(ty);
    if (rows[player.y][tx] !== T.EMPTY && rows[ty][tx] === T.EMPTY) {
      player.x = tx;
      player.y = ty;
      digLock = ts + 150;
    }
    return;
  }

  let dx = 0, dy = 0;
  if (D)         dy = 1;
  else if (L)    dx = -1;
  else if (R)    dx = 1;
  if (!dx && !dy) return;

  const tx = clamp(player.x + dx, 0, COLS - 1);
  const ty = Math.max(player.y + dy, 0);
  ensureRow(ty);
  const tile = rows[ty][tx];

  const crack = cb => {
    breaking.push({ x: tx, y: ty, st: ts, cb });
    rows[ty][tx] = T.EMPTY;
    digLock = ts + BREAK_MS;
  };

  if (tile === T.SOLID) {
    crack(() => step(tx, ty, dy === 1));
  } else {
    step(tx, ty, dy === 1 && tile !== T.HP);
    digLock = ts + (dy === 1 ? DIG_CD : HORIZ_CD);
  }
}

/* ===================== Sand Physics ===================== */
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
}

/* ===================== Helpers ===================== */
const onGround = ()=> { ensureRow(player.y+1); return rows[player.y+1][player.x]!==T.EMPTY && player.vy>=0; };
const solid = (x,y)=> (rows[y] && rows[y][x]!==T.EMPTY) || fallers.some(f=>f.x===x&&f.y===y);
const spawnDustRow = y => {
  for(let x=0;x<COLS;x++) for(let i=0;i<3;i++)
    dust.push({ x:x*TILE+TILE/2, y:y*TILE+TILE/2, vx:rnd(-1,1), vy:rnd(-4,-1), life:40 });
};

/* ===================== Updates ===================== */
function update(ts){
  /* breaking animation */
  breaking = breaking.filter(b => ts - b.st < BREAK_MS || (b.cb(),false));

  /* milestone sequence */
  if (msState==='spin' && ts-msStart>400) msState='crumble';
  if (msState==='crumble'){
    const p = Math.min(1, (ts-msStart-400)/CRUMBLE_MS);
    const gone = Math.floor(p * wallRows.length);
    for(let i=0;i<gone;i++){
      const y = wallRows[i];
      if (rows[y][0]!==T.EMPTY){
        rows[y].fill(T.EMPTY);
        spawnDustRow(y);
      }
    }
    if (p>=1) finishMilestone();
  }

  /* normal gameplay */
  if (!msState){
    player.vy += GRAV;
    while (player.vy > 0){
      if (!solid(player.x,player.y+1)) player.y++;
      else { player.vy=0; break; }
      player.vy--;
    }
    while (player.vy < 0){
      if (!solid(player.x,player.y-1)) player.y--;
      else { player.vy=0; break; }
      player.vy++;
    }
    player.hp -= HP_DRAIN;
    if (player.hp <= 0 || (solid(player.x,player.y) && rows[player.y][player.x]!==T.HP)){
      loseLife(ts);
    }
    updateFallers(ts);
  }

  /* camera */
  camY += ((player.y+1)*TILE - camY - cv.height*0.3)*0.15;
  ensureRow(player.y + 120);

  /* dust update */
  dust = dust.filter(d=>--d.life>0).map(d=>(d.x+=d.vx,d.y+=d.vy,d.vy+=.25,d));
}

/* ===================== Life / Game Over ===================== */
const hpBar = document.getElementById('hpBar'),
      livesEl= document.getElementById('lives'),
      depthEl= document.getElementById('depth'),
      scoreEl= document.getElementById('score');

function updateHUD(){
  if (!hpBar || !livesEl || !depthEl || !scoreEl) return;
  hpBar.style.width = (player.hp/HP_MAX*100)+'%';
  livesEl.innerHTML = '';
  for(let i=0;i<player.lives;i++) livesEl.innerHTML += '<span></span>';
  depthEl.textContent = depth+' m';
  scoreEl.textContent = calcScore();
}

function loseLife(tsNow){
  player.lives--;
  updateHUD();
  render(tsNow);
  if (player.lives < 0){
    alert(`Game over – Score ${calcScore()}`);
    location.reload();
    return;
  }
  let ry = player.y;
  while(solid(player.x,ry) && ry>0) ry--;
  player.y = ry; player.vy = 0; player.hp = HP_MAX;
}

/* ===================== Falling blocks ===================== */
const queueFall = (x,y)=>{
  if (msState||y<0||!rows[y]) return;
  const t = rows[y][x];
  if (t===T.EMPTY||t===T.HP) return;
  if (fallers.some(f=>f.x===x&&f.y===y)) return;
  fallers.push({ x, y, wait:true, drop: performance.now()+rnd(...FALL_WAIT), last:0 });
};

const updateFallers = now => {
  fallers = fallers.filter(f=>{
    if (f.wait){
      if (now < f.drop) return true;
      f.wait = false;
    }
    if (now - f.last < FALL_STEP) return true;
    const ny = f.y+1;
    ensureRow(ny);

    // Check for player collision *before* moving the block
    if (player.x===f.x && player.y===ny) {
        loseLife(now);
    }

    if (!solid(f.x,ny)){
      rows[ny][f.x] = rows[f.y][f.x];
      rows[f.y][f.x] = T.EMPTY;
      f.y = ny; f.last = now;
      queueFall(f.x, f.y-1);
      return true;
    }
    // Block has landed
    queueFall(f.x-1, f.y);
    queueFall(f.x+1, f.y);
    return false;
  });
};

/* ===================== Milestones ===================== */
function startMilestone(){
  msState='spin'; msStart=performance.now(); nextMS += 100;
  const yNow = player.y; wallRows = [];
  for(let y=0;y<rows.length;y++){
    if (rows[y]) { // Ensure row exists
        rows[y].fill(T.STONE);
        wallRows.push(y);
    }
  }
  spawnDustRow(yNow);
  if (rows[yNow]) rows[yNow].fill(T.EMPTY); // Ensure player's current row is clear
  player.y = 0; player.vy = 0; // Move player to top
}
function finishMilestone(){
  msState = null;
  for(let y=1; y<rows.length; y++) {
    if (rows[y]) rows[y] = makeRow(y);
  }
  if (rows[0]) rows[0].fill(T.EMPTY);
  player.y = 0; camY = 0; wallRows = [];
  resetWorld();
}

/* ===================== Renderer ===================== */
function calcScore(){ return depth*10 + hearts*100; }
function render(ts){
  if (!ctx) return;
  ctx.clearRect(0,0,cv.width,cv.height);
  ctx.save();
  ctx.translate((cv.width - COLS*TILE)/2, -camY);

  /* visible rows */
  const startY = Math.max(0, Math.floor(camY/TILE)-2),
        endY   = Math.min(rows.length - 1, Math.floor((camY+cv.height)/TILE)+2);

  /* tiles */
  for (let y=startY; y<=endY; y++){
    if (!rows[y]) continue;
    for (let x=0; x<COLS; x++){
      const t = rows[y][x];
      if (t === T.EMPTY && t !== T.HP) continue;

      let sc=1, ox=0, oy=0;
      const br = breaking.find(b=>b.x===x&&b.y===y),
            fl = fallers.find(f=>f.x===x&&f.y===y&&f.wait);
      if (br){
        const p = (ts - br.st)/BREAK_MS;
        sc = 1 - p;
      }
      if (fl){
        const a = SHAKE * Math.max(0, 1 - (fl.drop - ts)/FALL_WAIT[1]);
        ox = rnd(-a,a); oy = rnd(-a,a);
      }

      ctx.save();
      ctx.translate(x*TILE + TILE/2 + ox, y*TILE + TILE/2 + oy);
      ctx.scale(sc, sc);

      if (t===T.SOLID)      ctx.fillStyle = '#4b2d7d';
      else if (t===T.STONE) ctx.fillStyle = '#555';
      if (t !== T.HP) {
         if (t===T.SOLID || t===T.STONE) {
            ctx.fillRect(-TILE/2, -TILE/2, TILE, TILE);
         }
      }


      if (t===T.HP){
        ctx.fillStyle = '#ff5c93';
        ctx.beginPath();
        ctx.moveTo(0, -12 * (TILE/60));
        ctx.bezierCurveTo(12*(TILE/60), -24*(TILE/60), 36*(TILE/60), -6*(TILE/60), 0, 24*(TILE/60));
        ctx.bezierCurveTo(-36*(TILE/60), -6*(TILE/60), -12*(TILE/60), -24*(TILE/60), 0, -12*(TILE/60));
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /* dust */
  ctx.fillStyle = '#c8b27d';
  dust.forEach(d=>{
    ctx.globalAlpha = d.life/40;
    ctx.fillRect(d.x-3, d.y-3, 6, 6);
  });
  ctx.globalAlpha = 1;

  /* player */
  ctx.save();
  const R = 20 * (TILE/60);
  const px = player.x*TILE + TILE/2,
        py = player.y*TILE + TILE - R;
  if (msState==='spin'){
    ctx.translate(px,py);
    ctx.rotate(((ts - msStart)/400) * 4 * Math.PI);
    ctx.translate(-px,-py);
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(px, py, R, 0, 2*Math.PI);
  ctx.fill();
  ctx.restore();

  ctx.restore();
  updateHUD();
}