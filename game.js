(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = 480, H = 720;
  canvas.width = W; canvas.height = H;

  const ROAD_L = 130, ROAD_R = 350;
  const FEET_Y = 650, HEAD_H = 92, Z0 = 520;

  const DIFF = {
    easy:   { spawn: 80, minSpawn: 45, fall: 100, scroll: 3.5, speed: 5.0, aim: 0.35, burst: false },
    medium: { spawn: 55, minSpawn: 30, fall: 80,  scroll: 4.2, speed: 5.6, aim: 0.50, burst: false },
    hard:   { spawn: 34, minSpawn: 16, fall: 62,  scroll: 5.0, speed: 6.2, aim: 0.65, burst: true  }
  };

  const menuEl = document.getElementById('menu');
  const overEl = document.getElementById('over');
  const touchEl = document.getElementById('touch');
  touchEl.classList.add('active');

  // ---------- helpers ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function getBest(d) { try { return +localStorage.getItem('daab-best-' + d) || 0; } catch (e) { return 0; } }
  function setBest(d, v) { try { localStorage.setItem('daab-best-' + d, v); } catch (e) {} }
  function refreshBest() {
    ['easy', 'medium', 'hard'].forEach(d => {
      const b = getBest(d);
      document.getElementById('best-' + d).textContent = b ? 'Best: ' + b + ' m' : '';
    });
  }

  // ---------- sound ----------
  let audio;
  function beep(freq, dur, type = 'sine', vol = 0.12, slide = 0) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.value = freq;
      if (slide) o.frequency.linearRampToValueAtTime(freq + slide, audio.currentTime + dur);
      g.gain.value = vol;
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
      o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + dur);
    } catch (e) {}
  }

  // ---------- state ----------
  let state = 'menu'; // menu | play | over
  let diffName = 'easy', D = DIFF.easy;
  let player, coconuts = [], particles = [], trees = [], frames = 0, dist = 0, spawnTimer = 0, roadOffset = 0, shake = 0;
  const keys = { left: false, right: false };
  let pointerX = null;

  function initTrees() {
    trees = [];
    for (let i = 0; i < 7; i++) {
      trees.push({ side: -1, y: i * 130 - 120, jx: rand(-12, 12), s: rand(0.9, 1.15) });
      trees.push({ side: 1, y: i * 130 - 55, jx: rand(-12, 12), s: rand(0.9, 1.15) });
    }
  }

  function startGame(d) {
    diffName = d; D = DIFF[d];
    player = { x: (ROAD_L + ROAD_R) / 2, phase: 0, dead: false, hitBy: null };
    coconuts = []; particles = [];
    frames = 0; dist = 0; spawnTimer = 40; roadOffset = 0; shake = 0;
    pointerX = null;
    initTrees();
    menuEl.classList.add('hidden');
    overEl.classList.add('hidden');
    state = 'play';
  }

  function spawnCoconut() {
    const aimed = Math.random() < D.aim;
    let x, landY;
    if (aimed) {
      x = clamp(player.x + rand(-35, 35), ROAD_L + 18, ROAD_R - 18);
      landY = FEET_Y + rand(-25, 25);
    } else {
      x = rand(ROAD_L + 18, ROAD_R - 18);
      landY = rand(300, FEET_Y + 20);
    }
    coconuts.push({
      x, gy: landY - D.scroll * D.fall, z: Z0, vz: Z0 / D.fall,
      landed: false, t: 0, rot: rand(0, 6.28)
    });
  }

  function splat(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      particles.push({ x, y, vx: rand(-3, 3), vy: rand(-5, -1), life: rand(20, 40), c: color });
    }
  }

  function die(c) {
    player.dead = true; player.hitBy = c;
    c.hit = true; c.landed = true;
    shake = 14;
    splat(player.x, FEET_Y - HEAD_H, 18, '#fff3c4');
    beep(160, 0.35, 'sawtooth', 0.2, -100);
    state = 'over';
    const score = Math.floor(dist);
    const prev = getBest(diffName);
    if (score > prev) setBest(diffName, score);
    document.getElementById('final-score').textContent = 'Distance: ' + score + ' m';
    document.getElementById('final-best').textContent =
      score > prev ? '🏆 New best!' : 'Best: ' + prev + ' m';
    refreshBest();
    setTimeout(() => { if (state === 'over') overEl.classList.remove('hidden'); }, 800);
  }

  // ---------- update ----------
  function update() {
    if (state === 'menu') return;
    const alive = state === 'play';

    if (alive) {
      frames++;
      dist += D.scroll / 10;
      roadOffset = (roadOffset + D.scroll) % 60;

      // movement
      let move = 0;
      if (keys.left) move -= D.speed;
      if (keys.right) move += D.speed;
      if (pointerX !== null) {
        const dx = pointerX - player.x;
        move = clamp(dx, -D.speed * 1.5, D.speed * 1.5);
        if (Math.abs(dx) < 2) move = 0;
      }
      player.x = clamp(player.x + move, ROAD_L + 24, ROAD_R - 24);
      player.phase += 0.25;

      // spawning
      spawnTimer--;
      if (spawnTimer <= 0) {
        const interval = Math.max(D.minSpawn, D.spawn - Math.floor(frames / 300) * 3);
        spawnTimer = interval + rand(-5, 8);
        spawnCoconut();
        if (D.burst && Math.random() < 0.35) spawnCoconut();
      }
    }

    // trees keep scrolling in both states for a lively feel
    const sc = alive ? D.scroll : 0;
    trees.forEach(t => { t.y += sc; if (t.y > H + 140) { t.y -= 910; t.jx = rand(-12, 12); } });

    // coconuts
    for (const c of coconuts) {
      if (!c.landed) {
        c.z -= c.vz; c.gy += sc;
        if (alive && c.z <= HEAD_H + 14 && c.z >= HEAD_H - 40 &&
            Math.abs(c.x - player.x) < 26 && Math.abs(c.gy - FEET_Y) < 26) {
          die(c);
          continue;
        }
        if (c.z <= 0) {
          c.landed = true; c.z = 0;
          splat(c.x, c.gy, 8, '#f4ecd0');
          beep(220, 0.12, 'triangle', 0.08, -60);
        }
      } else {
        c.gy += sc; c.t++;
      }
    }
    coconuts = coconuts.filter(c => c.gy < H + 60);

    // particles
    particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.life--; });
    particles = particles.filter(p => p.life > 0);
    if (shake > 0) shake *= 0.88;
  }

  // ---------- drawing ----------
  function drawBackground() {
    // grass
    ctx.fillStyle = '#4c9a43'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#58a84d';
    for (let i = 0; i < 12; i++) {
      const y = ((i * 70 + roadOffset * 2) % (H + 70)) - 35;
      ctx.fillRect(0, y, ROAD_L - 30, 22);
      ctx.fillRect(ROAD_R + 30, y, W - ROAD_R - 30, 22);
    }
    // sand borders
    ctx.fillStyle = '#e3cf94';
    ctx.fillRect(ROAD_L - 30, 0, 30, H);
    ctx.fillRect(ROAD_R, 0, 30, H);
    // road
    ctx.fillStyle = '#b98f58'; ctx.fillRect(ROAD_L, 0, ROAD_R - ROAD_L, H);
    ctx.fillStyle = '#a8804c';
    for (let i = -1; i < 14; i++) {
      const y = i * 60 + roadOffset;
      ctx.fillRect((ROAD_L + ROAD_R) / 2 - 3, y, 6, 28);
    }
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    ctx.fillRect(ROAD_L, 0, 4, H); ctx.fillRect(ROAD_R - 4, 0, 4, H);
  }

  function drawPalm(x, baseY, s) {
    ctx.save(); ctx.translate(x, baseY); ctx.scale(s, s);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath(); ctx.ellipse(0, 4, 38, 10, 0, 0, 6.28); ctx.fill();
    // trunk
    ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 15; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(10, -80, 0, -150); ctx.stroke();
    ctx.strokeStyle = '#936339'; ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath(); ctx.moveTo(-8, -i * 24 - 8); ctx.lineTo(8, -i * 24 - 12); ctx.stroke();
    }
    // fronds
    ctx.translate(0, -150);
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI + (i / 6) * Math.PI;
      ctx.save(); ctx.rotate(a + Math.PI / 2 * 0);
      ctx.fillStyle = i % 2 ? '#2f8a3a' : '#3aa047';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(28, -22, 62, 8);
      ctx.quadraticCurveTo(28, -2, 0, 0);
      ctx.fill();
      ctx.restore();
    }
    // coconuts
    ctx.fillStyle = '#5b3a1e';
    [[-7, 8], [6, 10], [0, 16]].forEach(([cx, cy]) => {
      ctx.beginPath(); ctx.arc(cx, cy, 8, 0, 6.28); ctx.fill();
    });
    ctx.restore();
  }

  function drawCoconut(c) {
    const f = 1 - c.z / Z0;
    // ground shadow / warning
    if (!c.landed) {
      ctx.fillStyle = 'rgba(180,0,0,' + (0.12 + 0.32 * f) + ')';
      ctx.beginPath(); ctx.ellipse(c.x, c.gy, 8 + 20 * f, 4 + 9 * f, 0, 0, 6.28); ctx.fill();
    }
    if (c.hit) return; // drawn on player's head
    if (!c.landed) {
      const y = c.gy - c.z;
      ctx.save(); ctx.translate(c.x, y); ctx.rotate(c.rot + c.z * 0.02);
      ctx.fillStyle = '#5b3a1e';
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#7b5230';
      ctx.beginPath(); ctx.arc(-4, -4, 5, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#2d1a0a';
      [[-3, 3], [3, 3], [0, 8]].forEach(([a, b]) => { ctx.beginPath(); ctx.arc(a, b - 1, 1.6, 0, 6.28); ctx.fill(); });
      ctx.restore();
    } else {
      // cracked halves
      const open = Math.min(c.t / 8, 1) * 7;
      ctx.fillStyle = '#5b3a1e';
      ctx.beginPath(); ctx.arc(c.x - open, c.gy - 6, 10, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.arc(c.x + open, c.gy - 4, 10, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#f7f2dc';
      ctx.beginPath(); ctx.ellipse(c.x - open, c.gy - 6, 9, 3, 0, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.ellipse(c.x + open, c.gy - 4, 9, 3, 0, 0, 6.28); ctx.fill();
    }
  }

  // Cartoon runner, seen from BEHIND (no face ever drawn).
  // Origin (0,0) = centre of the head.
  function drawPlayer() {
    const p = player;
    ctx.save();
    ctx.translate(p.x, FEET_Y - HEAD_H);
    const swing = p.dead ? 0 : Math.sin(p.phase);
    const bob = p.dead ? 0 : Math.abs(Math.sin(p.phase)) * -3;
    ctx.translate(0, bob);

    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(0, HEAD_H - bob, 26, 8, 0, 0, 6.28); ctx.fill();

    // legs
    ctx.fillStyle = '#3b3f4a';
    ctx.fillRect(-14, 60, 11, 26 + swing * 8);
    ctx.fillRect(3, 60, 11, 26 - swing * 8);
    ctx.fillStyle = '#1d1d1d';
    ctx.fillRect(-16, 84 + swing * 8, 15, 8);
    ctx.fillRect(1, 84 - swing * 8, 15, 8);

    // arms (behind torso edges)
    ctx.fillStyle = '#6cc3e6';
    ctx.save(); ctx.translate(-25, 24); ctx.rotate(swing * 0.5);
    ctx.fillRect(-6, 0, 12, 28);
    ctx.fillStyle = '#c99a78'; ctx.beginPath(); ctx.arc(0, 30, 6, 0, 6.28); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#6cc3e6';
    ctx.save(); ctx.translate(25, 24); ctx.rotate(-swing * 0.5);
    ctx.fillRect(-6, 0, 12, 28);
    ctx.fillStyle = '#c99a78'; ctx.beginPath(); ctx.arc(0, 30, 6, 0, 6.28); ctx.fill();
    ctx.restore();

    // torso: light-blue patterned shirt
    ctx.fillStyle = '#7fd0ee';
    ctx.beginPath();
    ctx.moveTo(-22, 20); ctx.lineTo(22, 20); ctx.lineTo(24, 66); ctx.lineTo(-24, 66); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5db3d6';
    for (let y = 28; y < 64; y += 9) for (let x = -16; x <= 16; x += 11) {
      ctx.fillRect(x + ((y / 9) % 2 ? 4 : 0), y, 2, 2);
    }
    // shoulder seam + collar
    ctx.strokeStyle = '#5db3d6'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-22, 26); ctx.quadraticCurveTo(0, 32, 22, 26); ctx.stroke();
    ctx.fillStyle = '#8fdcf6';
    ctx.beginPath(); ctx.moveTo(-14, 16); ctx.lineTo(14, 16); ctx.lineTo(10, 26); ctx.lineTo(-10, 26); ctx.closePath(); ctx.fill();

    // neck
    ctx.fillStyle = '#c99a78';
    ctx.fillRect(-8, 12, 16, 8);

    // beard peeking at the sides of the jaw
    ctx.fillStyle = '#1e1411';
    ctx.beginPath(); ctx.ellipse(-14, 11, 6, 8, 0.3, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.ellipse(14, 11, 6, 8, -0.3, 0, 6.28); ctx.fill();

    // ears
    ctx.fillStyle = '#c99a78';
    ctx.beginPath(); ctx.ellipse(-18, 2, 4, 6, 0, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.ellipse(18, 2, 4, 6, 0, 0, 6.28); ctx.fill();

    // glasses arms going over the ears (only thing hinting at glasses from behind)
    ctx.strokeStyle = '#4a3a2c'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-17, -4); ctx.lineTo(-24, -8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(17, -4); ctx.lineTo(24, -8); ctx.stroke();

    // head (back of the head: dark hair)
    ctx.fillStyle = '#2a1b15';
    ctx.beginPath(); ctx.arc(0, 0, 19, 0, 6.28); ctx.fill();
    // thin-hair bald patch on top
    ctx.fillStyle = '#b98767';
    ctx.beginPath(); ctx.ellipse(-3, -9, 9, 6, -0.2, 0, 6.28); ctx.fill();
    ctx.fillStyle = 'rgba(42,27,21,.35)';
    ctx.beginPath(); ctx.ellipse(-3, -9, 9, 6, -0.2, 0, 6.28); ctx.fill();

    ctx.restore();

    // coconut stuck on the head after a hit + stars
    if (p.dead) {
      const hx = p.x, hy = FEET_Y - HEAD_H;
      ctx.fillStyle = '#5b3a1e';
      ctx.beginPath(); ctx.arc(hx + 4, hy - 20, 13, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#7b5230';
      ctx.beginPath(); ctx.arc(hx, hy - 24, 5, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#ffd24a'; ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
      const a = frames * 0.0 + performance.now() / 200;
      for (let i = 0; i < 3; i++) {
        ctx.fillText('★', hx + Math.cos(a + i * 2.1) * 26, hy - 38 + Math.sin(a + i * 2.1) * 8);
      }
    }
  }

  function drawHUD() {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(10, 10, 170, 40);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(Math.floor(dist) + ' m', 20, 37);
    ctx.font = '13px system-ui, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(diffName.toUpperCase(), 170, 36);
  }

  function draw() {
    ctx.save();
    if (shake > 0.5) ctx.translate(rand(-shake, shake), rand(-shake, shake));
    drawBackground();

    if (state === 'menu') {
      ctx.restore();
      // demo palms behind menu
      return;
    }

    // draw everything depth-sorted by y: trees, coconuts, player
    const items = [];
    trees.forEach(t => items.push({ y: t.y, f: () => drawPalm(t.side < 0 ? 52 + t.jx : W - 52 + t.jx, t.y, t.s) }));
    coconuts.forEach(c => items.push({ y: c.landed ? c.gy - 1 : c.gy - 1, f: () => drawCoconut(c) }));
    items.push({ y: FEET_Y, f: drawPlayer });
    items.sort((a, b) => a.y - b.y);
    items.forEach(i => i.f());

    // falling coconuts above everything (so they always look like they come from the sky)
    particles.forEach(p => {
      ctx.fillStyle = p.c; ctx.globalAlpha = clamp(p.life / 25, 0, 1);
      ctx.fillRect(p.x, p.y, 4, 4);
    });
    ctx.globalAlpha = 1;

    drawHUD();
    ctx.restore();
  }

  // ---------- loop ----------
  let last = performance.now(), acc = 0;
  function loop(now) {
    acc += Math.min(now - last, 100); last = now;
    while (acc >= 1000 / 60) { update(); acc -= 1000 / 60; }
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- input ----------
  addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
    if ((e.key === 'Enter' || e.key === ' ') && state === 'over') startGame(diffName);
  });
  addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  });

  function toGameX(e) {
    const r = canvas.getBoundingClientRect();
    return (e.clientX - r.left) / r.width * W;
  }
  canvas.addEventListener('pointerdown', e => { if (state === 'play') pointerX = toGameX(e); });
  canvas.addEventListener('pointermove', e => { if (state === 'play' && pointerX !== null) pointerX = toGameX(e); });
  addEventListener('pointerup', () => { pointerX = null; });
  addEventListener('pointercancel', () => { pointerX = null; });

  function holdBtn(id, key) {
    const b = document.getElementById(id);
    b.addEventListener('pointerdown', e => { e.preventDefault(); keys[key] = true; });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
      b.addEventListener(ev, () => { keys[key] = false; }));
  }
  holdBtn('left', 'left'); holdBtn('right', 'right');

  document.querySelectorAll('[data-diff]').forEach(b =>
    b.addEventListener('click', () => { beep(500, 0.08, 'square', 0.06); startGame(b.dataset.diff); }));
  document.getElementById('again').addEventListener('click', () => startGame(diffName));
  document.getElementById('tomenu').addEventListener('click', () => {
    overEl.classList.add('hidden'); menuEl.classList.remove('hidden'); state = 'menu'; refreshBest();
  });

  initTrees();
  refreshBest();
  requestAnimationFrame(loop);
})();
