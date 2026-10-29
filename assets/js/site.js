const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// Theme change hooks (OS setting or an explicit data-theme)
const themeHooks = [];
const onTheme = fn => themeHooks.push(fn);
const runTheme = () => themeHooks.forEach(fn => fn());
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', runTheme);
new MutationObserver(runTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// Round sprite shared by the 3D scenes
function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
}
function makeRenderer(box) {
  try {
    if (!window.THREE) throw new Error('three.js did not load');
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setClearColor(0x000000, 0);
    box.prepend(r.domElement);
    return r;
  } catch (err) { box.classList.add('no-webgl'); return null; }
}

// Highlight the nav link for the section in view
const navLinks = [...document.querySelectorAll('nav ul a')];
const spy = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
  });
}, { rootMargin: '-45% 0px -50% 0px' });
document.querySelectorAll('section.band').forEach(s => spy.observe(s));

// Card tilt + glare (mouse only)
if (!reduceMotion) {
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.style.transform = `rotateX(${(0.5 - py) * 8}deg) rotateY(${(px - 0.5) * 10}deg) translateY(-4px)`;
      card.style.setProperty('--gx', px * 100 + '%');
      card.style.setProperty('--gy', py * 100 + '%');
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  });
}

// Copy email
$('copy').addEventListener('click', e => {
  const btn = e.currentTarget, text = $('email').textContent;
  const done = () => { btn.textContent = 'Copied'; setTimeout(() => btn.textContent = 'Copy', 1600); };
  const select = () => { const r = document.createRange(); r.selectNodeContents($('email')); getSelection().removeAllRanges(); getSelection().addRange(r); btn.textContent = 'Selected'; };
  try { navigator.clipboard.writeText(text).then(done, select); } catch (err) { select(); }
});

// ---------- Hero: three.js data pipeline ----------
(function () {
  const box = $('scene');
  const renderer = makeRenderer(box);
  if (!renderer) return;

  const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  const world = new THREE.Group();
  scene.add(world);

  const SOURCES = [['Carrier APIs', V(-4.6, 1.95)], ['Street View', V(-4.6, 0.65)], ['Logistics feed', V(-4.6, -0.65)], ['Scanned docs', V(-4.6, -1.95)]];
  const SINKS = [['Dashboards', V(4.7, 1.2)], ['ML models', V(4.7, -1.2)]];
  const ETL = V(-2, 0), CHECK = V(0.2, 0), WH = V(2.4, 0), QUAR = V(0.2, -2.4);

  const edgeMat = new THREE.LineBasicMaterial();
  const pathMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.8 });
  const fillMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 });
  const hotMat = new THREE.LineBasicMaterial();
  const ringMat = new THREE.MeshBasicMaterial();

  function node(geo, at, mat = edgeMat) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, fillMat), new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat));
    g.position.copy(at);
    world.add(g);
    return g;
  }
  SOURCES.forEach(([, p]) => node(new THREE.BoxGeometry(0.7, 0.45, 0.45), p));
  SINKS.forEach(([, p]) => node(new THREE.BoxGeometry(0.6, 0.6, 0.6), p));
  const etl = node(new THREE.OctahedronGeometry(0.55), ETL);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 8, 48), ringMat);
  ring.position.copy(CHECK); ring.rotation.y = Math.PI / 2; world.add(ring);
  for (let i = -1; i <= 1; i++) node(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 28), V(WH.x, i * 0.4));
  const bin = node(new THREE.BoxGeometry(0.9, 0.4, 0.7), QUAR, hotMat);

  const labels = [];
  function label(text, at) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 64;
    const tex = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.scale.set(2.8, 0.35, 1); s.position.copy(at); world.add(s);
    labels.push({ c, tex, text });
  }
  SOURCES.forEach(([t, p]) => label(t, V(p.x, p.y + 0.48)));
  SINKS.forEach(([t, p]) => label(t, V(p.x, p.y + 0.6)));
  label('ETL', V(ETL.x, 0.85)); label('checks', V(CHECK.x, 0.8)); label('warehouse', V(WH.x, 0.85)); label('quarantine', V(QUAR.x, QUAR.y - 0.45));

  const good = SOURCES.map(([, s]) => SINKS.map(([, k]) => new THREE.CatmullRomCurve3([s, V((s.x + ETL.x) / 2, s.y * 0.5), ETL, CHECK, WH, V((WH.x + k.x) / 2, k.y * 0.5), k])));
  const bad = SOURCES.map(([, s]) => new THREE.CatmullRomCurve3([s, V((s.x + ETL.x) / 2, s.y * 0.5), ETL, CHECK, V(CHECK.x + 0.15, -1.3), QUAR]));
  good.flat().forEach(c => world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.getPoints(90)), pathMat)));

  const M = 220, pos = new Float32Array(M * 3), col = new Float32Array(M * 3);
  const recGeo = new THREE.BufferGeometry();
  recGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  recGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  world.add(new THREE.Points(recGeo, new THREE.PointsMaterial({ size: 0.16, map: dotTexture(), vertexColors: true, transparent: true, alphaTest: 0.4 })));

  let pal = {}, badQueue = 0, delivered = 0, quarantined = 0, binPulse = 0;
  const recs = Array.from({ length: M }, () => ({}));
  function spawn(r, i, scatter) {
    const s = Math.floor(Math.random() * SOURCES.length);
    r.bad = badQueue > 0; if (r.bad) badQueue--;
    r.curve = r.bad ? bad[s] : good[s][Math.floor(Math.random() * SINKS.length)];
    r.len = r.curve.getLength();
    r.t = scatter ? Math.random() : 0;
    r.speed = 1.5 + Math.random() * 0.9;
    r.j = V((Math.random() - 0.5) * 0.22, (Math.random() - 0.5) * 0.22, (Math.random() - 0.5) * 0.3);
    if (pal.cool) (r.bad ? pal.accent : pal.cool).toArray(col, i * 3);
  }
  recs.forEach((r, i) => spawn(r, i, true));

  const okEl = $('ok'), badEl = $('bad');
  function step(dt) {
    recs.forEach((r, i) => {
      if (!reduceMotion) r.t += r.speed * dt / r.len;
      if (r.t >= 1) {
        if (r.bad) { quarantined++; binPulse = 1; } else delivered++;
        spawn(r, i, false);
        recGeo.attributes.color.needsUpdate = true;
      }
      const p = r.curve.getPointAt(Math.max(0, Math.min(r.t, 1)));
      const pinch = Math.sin(Math.PI * r.t);
      pos.set([p.x + r.j.x * pinch, p.y + r.j.y * pinch, p.z + r.j.z * pinch], i * 3);
    });
    recGeo.attributes.position.needsUpdate = true;
    okEl.textContent = delivered.toLocaleString();
    badEl.textContent = quarantined.toLocaleString();
  }

  function retheme() {
    const c = n => new THREE.Color(css(n) || '#888');
    pal = { accent: c('--accent'), cool: c('--cool') };
    edgeMat.color = c('--muted'); pathMat.color = c('--line'); fillMat.color = c('--surface'); hotMat.color = pal.accent; ringMat.color = pal.accent;
    recs.forEach((r, i) => (r.bad ? pal.accent : pal.cool).toArray(col, i * 3));
    recGeo.attributes.color.needsUpdate = true;
    labels.forEach(({ c: cv, tex, text }) => {
      const x = cv.getContext('2d');
      x.clearRect(0, 0, cv.width, cv.height);
      x.font = '500 30px "IBM Plex Mono", ui-monospace, Consolas, monospace';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = css('--fg');
      x.fillText(text, cv.width / 2, cv.height / 2);
      tex.needsUpdate = true;
    });
  }
  retheme();
  if (document.fonts) document.fonts.ready.then(retheme);
  onTheme(retheme);

  $('inject').addEventListener('click', () => { badQueue += 30; });

  let rotY = -0.35, rotX = 0.12, targetY = -0.35, targetX = 0.12, drag = null, lastDrag = -1e9;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    if (!drag) return;
    targetY = Math.max(-1, Math.min(1, targetY + (e.clientX - drag.x) * 0.008));
    targetX = Math.max(-0.3, Math.min(0.5, targetX + (e.clientY - drag.y) * 0.004));
    drag = { x: e.clientX, y: e.clientY }; lastDrag = performance.now();
  });
  ['pointerup', 'pointercancel'].forEach(t => el.addEventListener(t, () => { drag = null; }));

  function resize() {
    const w = box.clientWidth, h = box.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const d = Math.max(13.5, 12.4 / (0.65 * camera.aspect));
    camera.position.set(0, d * 0.16, d);
    camera.lookAt(0, -0.15, 0);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(box);
  resize();

  let visible = true, last = performance.now();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(box);
  (function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
    if (!visible) return;
    if (!drag && !reduceMotion && now - lastDrag > 2500) targetY += (-0.35 + 0.3 * Math.sin(now * 0.00025) - targetY) * 0.02;
    rotY += (targetY - rotY) * 0.08; rotX += (targetX - rotX) * 0.08;
    world.rotation.set(rotX, rotY, 0);
    if (!reduceMotion) { etl.rotation.y += dt * 0.8; ring.rotation.x += dt * 0.6; }
    binPulse = Math.max(0, binPulse - dt * 3);
    bin.scale.setScalar(1 + binPulse * 0.15);
    step(dt);
    renderer.render(scene, camera);
  })(performance.now());
})();

// ---------- Journey: globe ----------
const STOPS = [
  { city: 'New Delhi', lat: 28.61, lon: 77.21, dist: 5.4 },
  { city: 'Rutherford', lat: 40.83, lon: -74.10, dist: 3.5 },
  { city: 'Provo', lat: 40.23, lon: -111.66, dist: 3.8 },
  { city: 'New Brunswick', lat: 40.49, lon: -74.45, dist: 3.0 },
  { city: 'Carson', lat: 33.83, lon: -118.28, dist: 3.8 },
];
const Journey = (function () {
  const cards = [...document.querySelectorAll('.stop')];
  const rad = d => d * Math.PI / 180;
  const unit = s => { const p = rad(s.lat), l = rad(s.lon); return [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)]; };
  const angle = (a, b) => { const u = unit(a), v = unit(b); return Math.acos(Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])); };
  const legKm = STOPS.map((s, i) => i ? angle(STOPS[i - 1], s) * 6371 : 0);
  let active = 0, gl = null;

  function set(i) {
    active = Math.max(0, Math.min(STOPS.length - 1, i));
    cards.forEach((c, k) => c.classList.toggle('active', k === active));
    const km = legKm.slice(0, active + 1).reduce((a, b) => a + b, 0);
    $('g-stop').textContent = `Stop ${active + 1} of ${STOPS.length} · ${STOPS[active].city}`;
    $('g-km').textContent = `${Math.round(km).toLocaleString()} km so far`;
    $('g-prev').disabled = active === 0;
    $('g-next').disabled = active === STOPS.length - 1;
    if (gl) gl.label.textContent = `${STOPS[active].city} · ${cards[active].querySelector('.when').textContent}`;
  }
  function go(i) { cards[Math.max(0, Math.min(cards.length - 1, i))].scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }); set(i); }

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) set(cards.indexOf(e.target)); });
  }, { rootMargin: '-48% 0px -48% 0px' });
  cards.forEach((c, i) => {
    io.observe(c);
    c.addEventListener('click', e => { if (!e.target.closest('a')) go(i); });
    c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(i); } });
  });
  $('g-prev').addEventListener('click', () => go(active - 1));
  $('g-next').addEventListener('click', () => go(active + 1));

  // three.js globe, built only when it nears the viewport so the first paint stays light
  const box = $('globe');
  function initGlobe() {
    const renderer = makeRenderer(box);
    if (!renderer) return;
    const R = 1.5, ARC_N = 80;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    const globe = new THREE.Group(); scene.add(globe);
    const toVec = (lat, lon, r) => { const u = unit({ lat, lon }); return new THREE.Vector3(u[0] * r, u[1] * r, u[2] * r); };

    const sphereMat = new THREE.MeshBasicMaterial();
    globe.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.99, 64, 48), sphereMat));

    // Land dots: Fibonacci sphere sampled against a 1° land mask (rows from 90°N, cols from 180°W)
    const mask = atob('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADf//8AAf///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB////D//////n/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/gf/x////////wAAAAAbgAAB4AAAAAAPwAAAAAAAAAAAAAAAAAAAAAAAAAAAf//8A///////+AAAAB/ngAAAAAAAAAAH8AAAAAAAAAAAAAAAAAAAAAAAAcH3Hv/5////////8AAAAA/gAAAAAAAAAAAAD4AAAAAAAAAAAAAAAAAAAAAAcIAAQP/AH///////+AAAAAPCAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAADwDAc+f+AP///////4AAAAAAAAAAAAAB4AAAAB/8AAAAAAAAAAAAAAAAAAAAAH9wc374AAAf/////8AAAAAAAAAAAAH4AAAA////AAAB/gAAAAAAAAAAAAAAAAwAAA/QAAAH/////8AAAAAAAAAAAAOAAAAP///wAAAAAAAAAAAAAAAAAAAAP8AYe+c3AAAD/////4AAAAAAAAAAAA4AAAH////++HgAOAAAAAAAAAAAAAAAfv+4+w/4gAAB/////wAAAAAAAAAAADwAHgH///////4AfgAAAAAgAAAAAAAAPf/4O4//9AAB/////wAAAAAAAAAAADwAPb////////4m//gAAAAAAAf+AAAAAA/+A8f//4AB////8gAAAAAAA/gAAAAAfv/////////////8AAAAAB///+H//H/+PeDwf+AA3////AAAAAAA//4AAAA8fv///////////////P8gAf////////A4CPz4H8AAP///wAAAAAAD///wADH/n3/////////////////8AD////////////34Z/wA///4AAAAAAAP///+M////n/////////////////+4E/////////////gD/8Af//gAAAAAAAf//5+P////f/////////////////fw/////////////6AD8YAf/wAAf8AAAA/8f+D///////////////////////AgEf///////////zw7/AAP/gAAP4AAAB/4/+f//////////////////////8AMAf//////////+DIA/gAH/gAAAAAAAH/z/////////////////////////+AAH///////////8AwgOAAD+AAAAAAAA//H/////////////////////////6AAP///////////wAA/AAAB+AAAAAAAB/+H//////////////////////nP+AAAH//z////////wAA/wAAAOAAAAAAAB//D/////////////////////+A/4AAAA/zAD///////gAA/4wAAAAAAAAAAB//Ab///////////////////+eDgAAAAABwAA///////4AA/94AAAAAAAAAYA5+A///////////////////4AAHAAAAAADcAAD//////4AAf/8AAAAAAAAA8AC+C///////////////////wAAfgAAAAAMAAAA///////wAf/8AAAAAAAAA4AO8H///////////////////AAA/gAAAABgAAAA///////8A///AAAAAAAAA8ANwH//////////////////8AAB/AAAAAEAAAAAf///////z///4AAAAAAAHOAEDv//////////////////+AAA+AAAAAAAAAABH///////x///8AAAAAAAHHAf/////////////////////6AA8AAAAAAAAAAAD///////x///8AAAAAAAGPz//////////////////////6AAwAAAAAAAAAAAD///////9///6AAAAAAAAPj//////////////////////6AAQAAAAAAAAAAAC///////////MAAAAAAAAYf//////////////////////7AAAAAAAAAAAAAABv////////+MNAAAAAAAAD///////////////////////zAAAAAAAAAAAAAAAH////////7gfgAAAAAAAf///////////////////////yAAAAAAAAAAAAAAAL/////////gCgAAAAAAAH///////////////////////iAAAAAAAAAAAAAAAP/////////pAAAAAAAAAD/////uP/x//////////////DAAAAAAAAAAAAAAAP/////////+AAAAAAAAAB//v//Gf/B/////////////+AAAAAAAAAAAAAAAAP////////8wAAAAAAAAAB//H/+AP+P/////////////8CAAAAAAAAAAAAAAAP////////wAAAAAAAAADj/jz/8AD/H/////////////4HgAAAAAAAAAAAAAAP////////gAAAAAAAAAH/4Bw/8AA/B////////////+APAAAAAAAAAAAAAAAP////////gAAAAAAAAAH/wA8f8Ph/g////////////8AAAAAAAAAAAAAAAAAP///////8AAAAAAAAAAH/gMHfJ///x///////////v4AMAAAAAAAAAAAAAAAP///////8AAAAAAAAAAH/AMCOP///h//////////+JwAMAAAAAAAAAAAAAAAH///////4AAAAAAAAAAH/AAAHH///g//////////8BwAIAAAAAAAAAAAAAAAH///////wAAAAAAAAAAH+AAYGH///w//////////+w4A4AAAAAAAAAAAAAAAD///////wAAAAAAAAAAAgf+ACBs//////////////g4D4AAAAAAAAAAAAAAAB///////wAAAAAAAAAAAj/+AAAA//////////////AYf4AAAAAAAAAAAAAAAA///////gAAAAAAAAAAB//8AAAA//////////////Ah2AAAAAAAAAAAAAAAAAP/////+AAAAAAAAAAAD//+AAAB//////////////gDwAAAAAAAAAAAAAAAAAH/////8AAAAAAAAAAAH///4GAB//////////////gDAAAAAAAAAAAAAAAAAAG/////4AAAAAAAAAAAP///8P4h//////////////wCAAAAAAAAAAAAAAAAAACf////4AAAAAAAAAAAP////v////////////////gAAAAAAAAAAAAAAAAAAABP//hgYAAAAAAAAAAAP//////3//P///////////wAAAAAAAAAAAAAAAAAAAAv//AAYAAAAAAAAAAAf//////9//H///////////wAAAAAAAAAAAAAAAAAAAB3/+AAcAAAAAAAAAAB///////4//h///////////gAAAAAAAAAAAAAAAAAAAAR/+AANAAAAAAAAAAD///////8//wH//////////AAAAAAAAAAAAAAAAAAAAAJ/+AAEAAAAAAAAAAH///////+f/0B/////////+AAAAAAAAAAAAAAAAAAAAAI/8AAAAAAAAAAAAAH///////+f/44Af///////+QAAAAAAAAAAAAAAAAAAAAAf8AAAAAAAAAAAAAP////////H//+AP///////4gAAAAAAAAAAAAAAAAAAAAAP8AAuAAAAAAAAAAP////////H///AD///v///ggAAAAAAAAAAAAAAAAAAAAAH+AABgAAAAAAAAAf////////n//+AD//4P//YAAAAAAAAAAAAAAAAAAAAAAAP+A4AYAAAAAAAAAP////////j//+AAf/4H/+AAAAAAAAAAAAAAAAgAAAAAAAH/B4ABwAAAAAAAAP////////h//8AAf/gD/8YAAAAAAAAAAAAAAAAAAAAAAAD/nwAD9AAAAAAAAP////////x//4AAf/AD/8QAAAAAAAAAAAAAAAAAAAAAAAAf/wAAAAAAAAAAAP////////4//gAAf+AD/+AAwAAAAAAAAAAAAAAAAAAAAAAH/wAAAAAAAAAAAf////////4f+AAAf8AD//AAwAAAAAAAAAAAAAAAAAAAAAAAH/AAAAAAAAAAAf////////8f8AAAPwAAP/gAwAAAAAAAAAAAAAAAAAAAAAAAD/gAAAAAAAAAAf////////+fgAAAPwAAP/gAwAAAAAAAAAAAAAAAAAAAAAAAA/AAAAAAAAAAAf/////////eAAAAHwAAP/gAMAAAAAAAAAAAAAAAAAAAAAAAAHgAAAAAAAAAAf/////////gAAAAHwAAM/gACAAAAAAAAAAAAAAAAAAAAAAAADABAAAAAAAAAP/////////gYAAADwAAEfgAJAAAAAAAAAAAAAAAAAAAAAAAADgPfKAAAAAAAH/////////34AAADwAAIOABAAAAAAAAAAAAAAAAAAAAAAAAAAyPf+AAAAAAAD//////////4AAADoAAIEACBAAAAAAAAAAAAAAAAAAAAAAAAA8///AAAAAAAB//////////wAAABIAAMAAAFAAAAAAAAAAAAAAAAAAAAAAAAAE///gAAAAAAB//////////wAAAAMAAEAAALgAAAAAAAAAAAAAAAAAAAAAAAAAf//wAAAAAAAf/////////gAAAAMAADAAMCAAAAAAAAAAAAAAAAAAAAAAAAAA////gAAAAAAP/B///////gAAAAAAADgAOAAAAAAAAAAAAAAAAAAAAAAAAAAAf///wAAAAAACAA///////AAAAAAAAxgA+AAAAAAAAAAAAAAAAAAAAAAAAAAAf///4AAAAAAAAAD/////+AAAAAAAAZgB4AAAAAAAAAAAAAAAAAAAAAAAAAAB////4AAAAAAAAAD/////8AAAAAAAAMwH8AAAAAAAAAAAAAAAAAAAAAAAAAAB////8AAAAAAAAAH/////4AAAAAAAAHQf8AIAAAAAAAAAAAAAAAAAAAAAAAAD////8AAAAAAAAAH/////gAAAAAAAAHgf88IAAAAAAAAAAAAAAAAAAAAAAAAD////+AAAAAAAAAH/////AAAAAAAAADwf8AAgAAAAAAAAAAAAAAAAAAAAAAAH/////4AAAAAAAAH/////AAAAAAAAABwP5wBwAAAAAAAAAAAAAAAAAAAAAAAH/////6AAAAAAAAD////+AAAAAAAAAB8P5wATwAAAAAAAAAAAAAAAAAAAAAAD//////4AAAAAAAB////8AAAAAAAAAA8AxQif+AAAAAAAAAAAAAAAAAAAAAAH//////8AAAAAAAB////4AAAAAAAAAAcAAIAD/gAAAAAAAAAAAAAAAAAAAAAH///////gAAAAAAA////4AAAAAAAAAAMAAIAI/ywAAAAAAAAAAAAAAAAAAAAH///////gAAAAAAA////4AAAAAAAAAADgAAAI/8BAAAAAAAAAAAAAAAAAAAAD///////gAAAAAAAf///4AAAAAAAAAAB+AAAA/4AIAAAAAAAAAAAAAAAAAAAB///////gAAAAAAAf///4AAAAAAAAAAAAmogAOMAAAAAAAAAAAAAAAAAAAAAB///////AAAAAAAAf///8AAAAAAAAAAAABCAAAGADAAAAAAAAAAAAAAAAAAAA///////AAAAAAAAf///8AAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAf/////+AAAAAAAAP///8AAAAAAAAAAAAAAAgCAAAAAAAAAAAAAAAAAAAAAAAf/////8AAAAAAAAf///+AQAAAAAAAAAAAAB+CAAAAAAAAAAAAAAAAAAAAAAAP/////4AAAAAAAAf///+AQAAAAAAAAAAAAD8DAAAAAAAAAAAAAAAAAAAAAAAP/////4AAAAAAAA////+AwAAAAAAAAAAAA38DgAAAAAAAAAAAAAAAAAAAAAAH/////4AAAAAAAA////8BwAAAAAAAAAAAD/8DgAAAAAAAAAAAAAAAAAAAAAAB/////4AAAAAAAA////8PwAAAAAAAAAAAD//HwAABABAAAAAAAAAAAAAAAAAAf////4AAAAAAAA////wPgAAAAAAAAAAAP//3wAAAACAAAAAAAAAAAAAAAAAAP////wAAAAAAAA////APgAAAAAAAAAAAP///wAAAAAAAAAAAAAAAAAAAAAAAP////wAAAAAAAAf//+APgAAAAAAAAAAAf///4AAAAAAAAAAAAAAAAAAAAAAAP////wAAAAAAAAf//+APgAAAAAAAAAAD////+AAIAAAAAAAAAAAAAAAAAAAAP////gAAAAAAAAP//+AfAAAAAAAAAAAf////+AAEAAAAAAAAAAAAAAAAAAAAP////AAAAAAAAAP///AfAAAAAAAAAAA//////AAAAAAAAAAAAAAAAAAAAAAAP///4AAAAAAAAAP//+APAAAAAAAAAAA//////gAAAAAAAAAAAAAAAAAAAAAAf///gAAAAAAAAAH//+AOAAAAAAAAAAB//////wAAAAAAAAAAAAAAAAAAAAAAf///AAAAAAAAAAH//4AEAAAAAAAAAAA//////4AAAAAAAAAAAAAAAAAAAAAAf//+AAAAAAAAAAH//4AAAAAAAAAAAAB//////4AAAAAAAAAAAAAAAAAAAAAAf//+AAAAAAAAAAH//4AAAAAAAAAAAAA//////4AAAAAAAAAAAAAAAAAAAAAAf//+AAAAAAAAAAD//wAAAAAAAAAAAAAf/////8AAAAAAAAAAAAAAAAAAAAAAf//8AAAAAAAAAAB//gAAAAAAAAAAAAAf/////4AAAAAAAAAAAAAAAAAAAAAA///8AAAAAAAAAAB//gAAAAAAAAAAAAAf/////4AAAAAAAAAAAAAAAAAAAAAA///4AAAAAAAAAAA//AAAAAAAAAAAAAAP/////4AAAAAAAAAAAAAAAAAAAAAAf//wAAAAAAAAAAA/+AAAAAAAAAAAAAAP/AP//wAAAAAAAAAAAAAAAAAAAAAA///gAAAAAAAAAAA/4AAAAAAAAAAAAAAf8AG//gAAAAAAAAAAAAAAAAAAAAAA//3AAAAAAAAAAAAYAAAAAAAAAAAAAAAOAAF//gAAAAAAAAAAAAAAAAAAAAAB//4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//AAABAAAAAAAAAAAAAAAAAAB//4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/AAAAgAAAAAAAAAAAAAAAAAD//4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/AAAAQAAAAAAAAAAAAAAAAAB//gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABYAAAAcAAAAAAAAAAAAAAAAAB/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAD/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAD/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcAAADQAAAAAAAAAAAAAAAAAD/4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcAAAHAAAAAAAAAAAAAAAAAAB/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAOAAAAAAAAAAAAAAAAAAD/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAH+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4AAAAAAAAAAAAAAAAAAH+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAH/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP8AAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH4BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAH4AAAAAAB4HgAD8AAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAA//AAAD//////////wAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAf///4Af///////////AAAAAAAAAAAAAAAAAAAAAAAz4AAAAAAAAAAAAAAAPz////8B/////////////wAAAAAAAAAAAAAAAAAAAAA78AAAAAAAAAAA8/8///////wf/////////////+AAAAAAAAAAAAAAAAAAAAH9+AAAAAAAAZ////////////w////////////////4AAAAAAAAAAAAAAAAAAAB+AAAAAAAB//////////////////////////////4AAAAAAAAABmAAB8f+HB/+AAAAAAAP//////////////////////////////gAAAAAAAAP/c/oAf/////4AAAAAAAP/////////////////////////////8AAAAAAAD/////////////gAAAAAAB//////////////////////////////wAAAAAAAD////////////wAAAAAAP///////////////////////////////wAAAAAD/////////////4AAAAAAD////////////////////////////////wAAAADh/////////////AAAAB8A/////////////////////////////////+AAAAA4Af///////////gAAAH+AA///////////////////////////////+AAAAAAAAH///////////+A/A/wAA///////////////////////////////8AAAAAAAf//////////////gAAAf////////////////////////////////+AAAAAAAH///////////////h////////////////////////////////////wAAAAAAP/////////////////////////////////////////////////////gA+/gAAH/////////////////////////////////////////////////////8/////v//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////');
    const isLand = (lat, lon) => {
      const r = Math.min(179, Math.max(0, Math.floor(90 - lat))), c = Math.min(359, Math.max(0, Math.floor(lon + 180)));
      const i = r * 360 + c;
      return (mask.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
    };
    const dots = [], N = innerWidth < 700 ? 14000 : 26000, ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - 2 * (i + 0.5) / N, lat = Math.asin(y) * 180 / Math.PI;
      const lon = ((i * ga * 180 / Math.PI) % 360) - 180;
      if (isLand(lat, lon)) dots.push(toVec(lat, lon, R));
    }
    const dotMat = new THREE.PointsMaterial({ size: 0.036, map: dotTexture(), transparent: true, alphaTest: 0.4 });
    globe.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(dots), dotMat));

    // Pins, halo, arcs, traveller
    const pins = STOPS.map(s => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshBasicMaterial());
      m.position.copy(toVec(s.lat, s.lon, R * 1.004)); globe.add(m); return m;
    });
    const haloMat = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.08, 40), haloMat);
    globe.add(halo);
    const arcMat = new THREE.LineBasicMaterial();
    const arcs = STOPS.slice(1).map((b, i) => {
      const a = STOPS[i], u = new THREE.Vector3(...unit(a)), v = new THREE.Vector3(...unit(b));
      const th = u.angleTo(v), lift = 0.04 + 0.55 * th / Math.PI, pts = [];
      for (let k = 0; k <= ARC_N; k++) {
        const t = k / ARC_N;
        const p = u.clone().multiplyScalar(Math.sin((1 - t) * th)).add(v.clone().multiplyScalar(Math.sin(t * th))).divideScalar(Math.sin(th));
        pts.push(p.normalize().multiplyScalar(R * (1.004 + lift * Math.sin(Math.PI * t))));
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), arcMat);
      line.geometry.setDrawRange(0, 0); globe.add(line);
      return { line, pts, prog: 0 };
    });
    const traveller = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), new THREE.MeshBasicMaterial());
    traveller.visible = false; globe.add(traveller);

    const label = $('g-label');
    gl = { label };
    let pal = {};
    function retheme() {
      const c = n => new THREE.Color(css(n) || '#888');
      pal = { accent: c('--accent'), cool: c('--cool'), muted: c('--muted') };
      sphereMat.color = c('--bg'); dotMat.color = c('--muted'); arcMat.color = pal.accent; haloMat.color = pal.accent;
      traveller.material.color = pal.accent;
    }
    retheme(); onTheme(retheme);

    let ry = -rad(STOPS[0].lon), rx = rad(STOPS[0].lat) * 0.85, dist = STOPS[0].dist;
    function resize() {
      const w = box.clientWidth, h = box.clientHeight;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(box); resize();

    let visible = true, last = performance.now();
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(box);
    const tmp = new THREE.Vector3();
    (function loop(now) {
      requestAnimationFrame(loop);
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
      if (!visible) return;
      const s = STOPS[active], k = reduceMotion ? 1 : 1 - Math.pow(0.05, dt);
      let d = -rad(s.lon) - ry; d = Math.atan2(Math.sin(d), Math.cos(d));
      ry += d * k; rx += (rad(s.lat) * 0.85 - rx) * k;
      const aspectBoost = camera.aspect < 1 ? 1 / camera.aspect : 1;
      dist += (s.dist * Math.min(aspectBoost, 1.35) - dist) * k;
      globe.rotation.set(rx, ry, 0);
      camera.position.set(0, 0, dist); camera.lookAt(0, 0, 0);

      const zoom = Math.max(0.3, (dist - R) / (5.4 - R));
      dotMat.size = 0.036 * (0.45 + 0.55 * zoom);
      pins.forEach((p, i) => {
        p.scale.setScalar(zoom);
        p.material.color = i === active ? pal.accent : i < active ? pal.cool : pal.muted;
      });
      halo.position.copy(pins[active].position);
      halo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pins[active].position.clone().normalize());
      const pulse = reduceMotion ? 0.5 : (now / 1400) % 1;
      halo.scale.setScalar(zoom * (1 + pulse * 1.6)); haloMat.opacity = 1 - pulse;

      traveller.visible = false;
      arcs.forEach((a, i) => {
        const target = i < active ? 1 : 0;
        a.prog = reduceMotion ? target : Math.max(0, Math.min(1, a.prog + Math.sign(target - a.prog) * dt * 0.9));
        const n = Math.round(a.prog * ARC_N);
        a.line.geometry.setDrawRange(0, n + 1);
        if (a.prog > 0 && a.prog < 1) { traveller.visible = true; traveller.position.copy(a.pts[n]); traveller.scale.setScalar(zoom); }
      });

      pins[active].getWorldPosition(tmp).project(camera);
      label.hidden = false;
      label.style.transform = `translate(${(tmp.x + 1) / 2 * box.clientWidth}px, ${(1 - tmp.y) / 2 * box.clientHeight}px)`;
      renderer.render(scene, camera);
    })(performance.now());
    set(active);
  }
  const nearGlobe = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    nearGlobe.disconnect();
    initGlobe();
  }, { rootMargin: '300px 0px' });
  nearGlobe.observe(box);
  set(0);
  return { go, find: q => STOPS.findIndex(s => s.city.toLowerCase().startsWith(q.toLowerCase())) };
})();

// ---------- Demo: MotoLens ----------
(function () {
  const ANSWER = 'Dodge Caliber Wagon 2012';
  const OPTIONS = ['Dodge Caliber Wagon 2012', 'Dodge Caliber Wagon 2007', 'Jeep Compass SUV 2012', 'Dodge Journey SUV 2012'];
  const opts = $('ml-opts'), photo = $('ml-photo'), tag = $('ml-tag'), result = $('ml-result');

  function deal() {
    opts.innerHTML = ''; result.hidden = true;
    tag.textContent = 'ResNet-50 · 196 classes · ready';
    $('ml-conf').style.width = '0%'; $('ml-chance').style.width = '0%';
    [...OPTIONS].sort(() => Math.random() - 0.5).forEach(name => {
      const b = document.createElement('button');
      b.className = 'opt'; b.type = 'button'; b.textContent = name;
      b.addEventListener('click', () => pick(b));
      opts.append(b);
    });
  }
  function pick(choice) {
    const buttons = [...opts.children];
    buttons.forEach(b => { b.disabled = true; if (b !== choice) b.classList.add('dim'); });
    tag.textContent = 'running inference…';
    photo.classList.add('scanning');
    setTimeout(() => {
      photo.classList.remove('scanning');
      tag.textContent = `${ANSWER} · 15.32%`;
      buttons.forEach(b => {
        if (b.textContent === ANSWER) b.classList.replace('dim', 'right') || b.classList.add('right');
      });
      const right = choice.textContent === ANSWER;
      if (!right) choice.classList.replace('dim', 'wrong') || choice.classList.add('wrong');
      $('ml-verdict').textContent = right ? 'You matched the model.'
        : choice.textContent.includes('2007') ? 'So close. Same car, wrong year. The model got it.'
        : 'The model got this one.';
      result.hidden = false;
      requestAnimationFrame(() => { $('ml-conf').style.width = '15.32%'; $('ml-chance').style.width = '0.51%'; });
    }, reduceMotion ? 0 : 1300);
  }
  $('ml-again').addEventListener('click', deal);
  deal();
})();

// ---------- Demo tabs ----------
const Demos = (function () {
  const tabs = [...document.querySelectorAll('#demo-tabs [role=tab]')];
  function show(name) {
    tabs.forEach(t => {
      const on = t.dataset.demo === name;
      t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
      $('panel-' + t.dataset.demo).hidden = !on;
    });
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t.dataset.demo));
    t.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      n.focus(); show(n.dataset.demo);
    });
  });
  document.querySelectorAll('a[data-demo]').forEach(a => a.addEventListener('click', () => show(a.dataset.demo)));
  return { show, names: tabs.map(t => t.dataset.demo) };
})();

// ---------- Demo: data warehouse DAG (simulated) ----------
(function () {
  const TASKS = ['extract_prices', 'load_raw', 'dbt_run', 'dbt_test', 'publish'];
  const list = $('dag'), log = $('dag-log'), hist = $('dag-hist'), btn = $('dag-run');
  const nodes = TASKS.map(t => {
    const li = document.createElement('li'); li.className = 'task';
    li.innerHTML = `<code>${t}</code><span class="st"></span><span class="dur"></span>`;
    list.append(li); return li;
  });
  const setS = (i, s, dur) => { nodes[i].dataset.s = s; nodes[i].querySelector('.st').textContent = s.replace('_', ' '); nodes[i].querySelector('.dur').textContent = dur || ''; };
  let runNo = 0, busy = false, instant = false;
  const wait = ms => new Promise(r => setTimeout(r, instant || reduceMotion ? 0 : ms));
  const secs = () => (1 + Math.random() * 5).toFixed(1) + 's';
  function say(text, cls) {
    const d = document.createElement('div');
    const t = document.createElement('span'); t.className = 't'; t.textContent = new Date().toTimeString().slice(0, 8) + '  ';
    const m = document.createElement('span'); if (cls) m.className = cls; m.textContent = text;
    d.append(t, m); log.append(d); log.scrollTop = log.scrollHeight;
  }
  async function step(i, lines, fail) {
    setS(i, 'running'); await wait(800);
    lines.forEach(([text, cls]) => say(text, cls));
    setS(i, fail ? 'failed' : 'success', secs());
  }

  async function run(quick) {
    if (busy) return;
    busy = true; instant = !!quick; btn.disabled = true;
    const bad = $('dag-bad').checked, rows = 503 * 21, nulls = bad ? 37 + Math.floor(Math.random() * 40) : 0;
    runNo++; log.innerHTML = '';
    nodes.forEach((_, i) => setS(i, 'queued'));
    say(`run #${runNo} triggered · ds=${new Date().toISOString().slice(0, 10)}`);
    await step(0, [[`extract_prices: 503 tickers × 21 trading days → ${rows.toLocaleString()} rows`]]);
    await step(1, [[`load_raw: COPY INTO raw.prices (Snowflake) → ${rows.toLocaleString()} rows`], [`load_raw: bq load raw.prices (BigQuery) → ${rows.toLocaleString()} rows`]]);
    await step(2, [['dbt run: 4 models OK · stg_prices, int_daily_returns, fct_daily_prices, dim_ticker', 'ok']]);
    await step(3, [
      ['PASS unique_stg_prices_ticker_date', 'ok'],
      bad ? [`FAIL not_null_stg_prices_close · ${nulls} rows`, 'bad'] : ['PASS not_null_stg_prices_close', 'ok'],
      ['PASS accepted_range_stg_prices_close_positive', 'ok'],
      ['PASS relationships_fct_daily_prices_ticker', 'ok'],
    ], bad);
    if (bad) {
      setS(4, 'upstream_failed');
      say('publish: skipped (upstream_failed). Dashboards keep yesterday\'s numbers.', 'bad');
    } else {
      await step(4, [['publish: fct_daily_prices is live · dashboards refreshed', 'ok']]);
    }
    const sq = document.createElement('i');
    if (bad) sq.className = 'f';
    sq.title = `run #${runNo}: ${bad ? 'failed' : 'success'}`;
    hist.append(sq);
    if (hist.children.length > 13) hist.children[1].remove();
    busy = false; btn.disabled = false;
  }
  btn.addEventListener('click', () => run(false));
  run(true);
})();

// ---------- Demo: NYC taxi (illustrative pickup curves) ----------
(function () {
  // [name, col, row, zone type, relative size]
  const ZONES = [
    ['Harlem', 2, 1, 'res', 0.5],
    ['Upper West', 1, 2, 'res', 0.8], ['Upper East', 2, 2, 'res', 0.9], ['LaGuardia', 4, 2, 'air', 0.7],
    ['Midtown W', 1, 3, 'biz', 1], ['Midtown E', 2, 3, 'biz', 1], ['Queens', 3, 3, 'res', 0.45],
    ['Chelsea', 1, 4, 'night', 0.75], ['Gramercy', 2, 4, 'biz', 0.6],
    ['Village', 1, 5, 'night', 0.8], ['East Village', 2, 5, 'night', 0.75],
    ['SoHo', 1, 6, 'night', 0.55], ['Lower East', 2, 6, 'night', 0.6], ['Brooklyn', 3, 6, 'res', 0.55],
    ['FiDi', 1, 7, 'biz', 0.6], ['JFK', 4, 7, 'air', 0.85],
  ];
  const bump = (h, mu, sd) => { const d = Math.min(Math.abs(h - mu), 24 - Math.abs(h - mu)); return Math.exp(-d * d / (2 * sd * sd)); };
  const PROFILE = {
    biz: h => 0.12 + 0.6 * bump(h, 8.5, 1.5) + 0.9 * bump(h, 18, 2),
    res: h => 0.1 + 0.9 * bump(h, 8, 1.5) + 0.4 * bump(h, 19, 2.5),
    night: h => 0.08 + 0.4 * bump(h, 18, 2) + 0.95 * bump(h, 23, 2.5),
    air: h => 0.12 + 0.5 * bump(h, 9, 2) + 0.8 * bump(h, 17, 3),
  };
  const pickups = (z, h) => Math.round(z[4] * PROFILE[z[3]](h) * 1200);
  const max = Math.max(...ZONES.flatMap(z => [...Array(24).keys()].map(h => pickups(z, h))));
  const totals = [...Array(24).keys()].map(h => ZONES.reduce((a, z) => a + pickups(z, h), 0));
  const fmtH = h => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

  const tiles = ZONES.map(z => {
    const t = document.createElement('div'); t.className = 'tile';
    t.style.gridColumn = z[1]; t.style.gridRow = z[2];
    t.innerHTML = `<span>${z[0]}</span><b></b>`;
    $('tiles').append(t); return t;
  });
  const bars = totals.map(v => {
    const i = document.createElement('i'); i.style.height = (v / Math.max(...totals) * 100) + '%';
    $('spark').append(i); return i;
  });
  const slider = $('taxi-hr');

  function render() {
    const h = +slider.value;
    $('taxi-hr-o').textContent = fmtH(h);
    let top = ZONES[0];
    ZONES.forEach((z, i) => {
      const n = pickups(z, h), v = n / max;
      if (n > pickups(top, h)) top = z;
      tiles[i].style.background = `color-mix(in srgb, var(--accent) ${Math.round(5 + v * 85)}%, var(--bg))`;
      tiles[i].classList.toggle('hot', v > 0.72);
      tiles[i].querySelector('b').textContent = n.toLocaleString();
    });
    bars.forEach((b, i) => b.classList.toggle('on', i === h));
    $('taxi-total').textContent = totals[h].toLocaleString();
    $('taxi-top').textContent = top[0];
    $('tiles').setAttribute('aria-label', `Pickups by zone at ${fmtH(h)}. Busiest: ${top[0]}.`);
    $('sql').innerHTML = `<b>SELECT</b> pickup_zone, <b>COUNT</b>(*) <b>AS</b> trips\n<b>FROM</b> fact_trips\n<b>WHERE</b> pickup_hour = ${h}\n<b>GROUP BY</b> pickup_zone;`;
  }
  slider.addEventListener('input', render);

  let timer = null;
  const play = $('taxi-play');
  play.addEventListener('click', () => {
    if (timer) { clearInterval(timer); timer = null; play.textContent = '▶ Play day'; return; }
    play.textContent = '❚❚ Pause';
    timer = setInterval(() => { slider.value = (+slider.value + 1) % 24; render(); }, reduceMotion ? 1200 : 650);
  });

  $('q-run').addEventListener('click', () => {
    const bf = $('q-bf'), af = $('q-af');
    [bf, af].forEach(f => { f.style.transition = 'none'; f.style.width = '0%'; });
    void bf.offsetWidth;
    if (reduceMotion) { bf.style.width = '100%'; af.style.width = '6.7%'; return; }
    bf.style.transition = 'width 3s linear'; af.style.transition = 'width .2s linear';
    bf.style.width = '100%'; af.style.width = '6.7%';
    const t0 = performance.now();
    (function tick(now) {
      const e = Math.max(0, now - t0) / 1000 * 4;
      $('q-before').textContent = Math.min(12, e).toFixed(1) + ' s';
      $('q-after').textContent = Math.min(0.8, e).toFixed(1) + ' s';
      if (e < 12) requestAnimationFrame(tick);
    })(t0);
  });
  render();
})();

// ---------- Playground: pixel sprites ----------
(function () {
  const SPRITES = {
    heart: ['.aa...aa..', 'aaaa.aaaa.', 'aaaaaaaaa.', 'aaaaaaaaa.', 'aaaaaaaaa.', '.aaaaaaa..', '..aaaaa...', '...aaa....', '....a.....', '..........'],
    knight: ['...##.....', '..####....', '.##c###...', '.#######..', '....####..', '...#####..', '..######..', '...####...', '..######..', '.########.'],
    apple: ['.....c....', '....c.....', '..aa.aa...', '.aaaaaaa..', '.aaaaaa...', '.aaaaaa...', '.aaaaaaa..', '..aaaaaa..', '...aa.aa..', '..........'],
    calendar: ['..#....#..', '##########', '#aaaaaaaa#', '#........#', '#.#.#.#..#', '#........#', '#.#.c.#..#', '#........#', '##########', '..........'],
    book: ['.########.', '#cccccccc#', '#c######c#', '#cccccccc#', '#c####ccc#', '#cccccccc#', '#cccccccc#', '#cccccccc#', '##########', '.#########'],
    bubble: ['.########.', '#........#', '#.##.##..#', '#........#', '#.#####..#', '#........#', '.########.', '..#.......', '.#........', '#.........'],
  };
  const SIDE = [
    { repo: '8-Bit-Habit', title: '8-Bit Habit', sprite: 'heart', text: 'A habit tracker that plays like an RPG: pick a class, level up and take on quests, with an AI character powered by OpenAI.', meta: ['Next.js', 'MongoDB', 'Auth0', '2025'] },
    { repo: 'chess-app', title: 'Chess Tutor', sprite: 'knight', text: 'A React chessboard on its way to a tutor that teaches tactics and analyzes your games against a computer.', meta: ['TypeScript', 'React', 'in progress'] },
    { repo: 'AppleWebsite', title: 'Apple Clone', sprite: 'apple', text: 'A recreation of an Apple product page with GSAP scroll animations and a three.js model via react-three-fiber.', meta: ['React', 'GSAP', 'three.js', '2025'] },
    { repo: 'DayGrid', title: 'DayGrid', sprite: 'calendar', text: 'A calendar app with a to-do list built in.', meta: ['React', 'Vite', '2026'] },
    { repo: 'Online-Bookstore', title: 'Bookstore API', sprite: 'book', text: 'A .NET bookstore backend on MongoDB, organized around repositories, services and DTOs.', meta: ['C#', '.NET', 'MongoDB', '2026'] },
    { repo: 'DocumentRAG', title: 'DocumentRAG', sprite: 'bubble', text: 'A Python chatbot that answers questions over your own documents.', meta: ['Python', 'RAG', '2025'] },
  ];
  const grid = $('pixel-grid'), canvases = [];
  SIDE.forEach(p => {
    const card = document.createElement('article'); card.className = 'px-card';
    const cv = document.createElement('canvas'); cv.width = cv.height = 10; cv.dataset.sprite = p.sprite;
    const body = document.createElement('div');
    body.innerHTML = `<h3>${p.title}</h3><p>${p.text}</p><div class="meta">${p.meta.map(m => `<span>${m}</span>`).join('')}<a href="https://github.com/ParagGupta103/${p.repo}" target="_blank" rel="noopener">repo ↗</a></div>`;
    card.append(cv, body); grid.append(card); canvases.push(cv);
  });
  function paint() {
    const pal = { '#': css('--fg'), a: css('--accent'), c: css('--cool'), m: css('--muted') };
    canvases.forEach(cv => {
      const g = cv.getContext('2d'); g.clearRect(0, 0, 10, 10);
      SPRITES[cv.dataset.sprite].forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
    });
  }
  paint(); onTheme(paint);
})();

// ---------- Terminal ----------
(function () {
  const wrap = $('term'), out = $('term-out'), input = $('term-in');
  const hist = []; let hi = 0, opener = null;

  const FILES = {
    motolens: 'MotoLens: "Shazam for cars". PyTorch ResNet-50 behind FastAPI with a React front end.\n196 car classes, about 10,000 training images. Try: open motolens',
    'stock-warehouse': 'Stock Market Data Warehouse: Airflow → Snowflake + BigQuery, dbt models with data-quality checks.\nCut compute costs by 40%.',
    'nyc-taxi': 'NYC Taxi Analytics: TLC trip records → fact/dimension model on GCP → Looker Studio heat maps.\nBigQuery query time: 12 s → 0.8 s.',
    apollo: 'Apollo Tyres · New Delhi · May–Jul 2024\nRAG pipeline on AWS Bedrock over 500+ scanned docs. Neptune query latency -20%.',
    newmark: 'Newmark Group · Rutherford, NJ · Sep–Dec 2024\nPython → Parquet → Looker pipelines. 15+ hours a week of manual entry gone.',
    tarifflo: 'Tarifflo · Provo, UT · May–Aug 2025\nGCP ETL for real-time logistics, latency -30%. Full HTS model at 98% accuracy.',
    collab: 'Collaborative Solutions · New Brunswick, NJ · Jan–May 2026\nStreet View imagery for 500+ rail crossings, YOLOv5 clutter detection at 85% precision.',
    kw: 'KW International · Carson, CA · Aug 2026–now\nShipping quotes across FedEx, UPS, USPS and DHL APIs, 10+ hours a week saved.',
  };
  const PROJECTS = ['motolens', 'stock-warehouse', 'nyc-taxi'], JOBS = ['apollo', 'newmark', 'tarifflo', 'collab', 'kw'];
  const SECTIONS = ['skills', 'journey', 'demos', 'projects', 'playground', 'contact'];
  const LINKS = { github: 'https://github.com/ParagGupta103', linkedin: 'https://linkedin.com/in/parag3105', motolens: 'https://paraggupta103.github.io/MotoLens/' };

  function line(text, cls) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = text;
    out.append(d); out.scrollTop = out.scrollHeight;
    return d;
  }
  function link(label, href) {
    const d = document.createElement('div'), a = document.createElement('a');
    a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = label;
    d.append(a); out.append(d); out.scrollTop = out.scrollHeight;
  }
  const jump = (id, then) => { close(); setTimeout(() => { $(id).scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }); if (then) then(); }, 80); };

  const CMDS = {
    help() {
      line([
        'help                 this list',
        'whoami               the short version',
        'ls [projects|jobs]   list sections, projects or jobs',
        'cat <name>           read one (try: cat motolens)',
        'cd <section>         jump to a section',
        'fly <city>           spin the globe (try: fly provo)',
        'demo <name>          ' + Demos.names.join(' | '),
        'resume               open my resume',
        'skills               the toolkit',
        'open <site>          github | linkedin | motolens',
        'theme <mode>         dark | light | system',
        'clear · history · exit',
      ].join('\n'));
      line('A few commands are not listed.', 'dim');
    },
    whoami() { line('Parag Gupta. Data engineer, Rutgers CS \'26 (Honors College).\nData & Automation Analyst at KW International, Carson, CA.\nPipelines, cloud, and the occasional car-recognizing neural net.'); },
    ls(a) {
      if (a[0] === 'projects') return line(PROJECTS.join('    '));
      if (a[0] === 'jobs') return line(JOBS.join('    '));
      line(SECTIONS.map(s => s + '/').join('    ') + '\n' + 'projects: ' + PROJECTS.join(' ') + '\njobs: ' + JOBS.join(' '));
    },
    cat(a) {
      if (!a[0]) return line('usage: cat <name>. Try: ls', 'dim');
      const f = FILES[a[0].toLowerCase()];
      f ? line(f) : line(`cat: ${a[0]}: no such file. Try: ls`, 'hot');
    },
    cd(a) {
      const s = (a[0] || '').replace(/\/$/, '').toLowerCase();
      if (s === '' || s === '~' || s === '..') return jump('top');
      SECTIONS.includes(s) ? jump(s) : line(`cd: ${a[0]}: no such section`, 'hot');
    },
    fly(a) {
      const i = Journey.find(a.join(' ') || '');
      if (!a[0] || i < 0) return line('usage: fly <city>. Stops: ' + STOPS.map(s => s.city.toLowerCase()).join(', '), 'dim');
      line(`Wheels up for ${STOPS[i].city}…`);
      setTimeout(() => jump('journey', () => setTimeout(() => Journey.go(i), 450)), 300);
    },
    demo(a) {
      const n = (a[0] || '').toLowerCase();
      if (!Demos.names.includes(n)) return line('usage: demo ' + Demos.names.join(' | '), 'dim');
      Demos.show(n); line(`Opening the ${n} demo…`);
      setTimeout(() => jump('demos'), 300);
    },
    resume() { line('Opening in a new tab:', 'dim'); link('resume.pdf', 'resume.pdf'); },
    skills() { line('languages  Python, Java, C++, SQL\ncloud      AWS Bedrock, Neptune · GCP BigQuery, Vertex AI, Looker\ndata       Airflow, dbt, Snowflake, PostgreSQL, MongoDB\ninfra      Docker, Kubernetes, Terraform, GitLab\ntesting    pytest, Selenium, Playwright, Postman'); },
    contact() { line('paragguptaus@gmail.com'); link('linkedin.com/in/parag3105', LINKS.linkedin); },
    open(a) {
      const u = LINKS[(a[0] || '').toLowerCase()];
      u ? (line('Opening in a new tab:', 'dim'), link(u, u)) : line('usage: open github | linkedin | motolens', 'dim');
    },
    theme(a) {
      const m = (a[0] || '').toLowerCase(), root = document.documentElement;
      if (m === 'dark' || m === 'light') { root.setAttribute('data-theme', m); line(`Theme set to ${m}.`); }
      else if (m === 'system') { root.removeAttribute('data-theme'); line('Theme follows your system.'); }
      else line('usage: theme dark | light | system', 'dim');
    },
    history() { line(hist.map((h, i) => `${String(i + 1).padStart(3)}  ${h}`).join('\n') || '(empty)'); },
    clear() { out.innerHTML = ''; },
    exit() { close(); },
    sudo(a) {
      if (a.join(' ').toLowerCase() === 'hire parag') {
        const steps = ['[sudo] password for recruiter: ********', 'Checking references… ok', 'Reviewing 5 internships… ok', 'Running pytest on candidate… 100% passed', 'Access granted. Finish the job at paragguptaus@gmail.com'];
        steps.forEach((s, i) => setTimeout(() => line(s, i === steps.length - 1 ? 'hot' : ''), reduceMotion ? 0 : i * 450));
      } else line('recruiter is not in the sudoers file. Try: sudo hire parag', 'hot');
    },
    rm() { line('Nice try.', 'hot'); },
    echo(a) { line(a.join(' ')); },
    ['hire-me']() { CMDS.sudo(['hire', 'parag']); },
  };

  function run(raw) {
    const text = raw.trim();
    const echo = line(''); echo.className = 'cmd';
    const p = document.createElement('span'); p.textContent = '~$ ';
    echo.append(p, document.createTextNode(text));
    if (!text) return;
    hist.push(text); hi = hist.length;
    const [cmd, ...args] = text.split(/\s+/);
    const fn = CMDS[cmd.toLowerCase()];
    fn ? fn(args) : line(`command not found: ${cmd}. Type help.`, 'hot');
  }

  function open() {
    opener = document.activeElement;
    wrap.hidden = false;
    if (!out.childElementCount) { line('Welcome to parag@portfolio.'); line('Type help to see what you can do. Tab completes, ↑ recalls.', 'dim'); }
    input.focus();
  }
  function close() {
    if (wrap.hidden) return;
    wrap.hidden = true;
    if (opener && opener.focus) opener.focus();
  }

  $('term-form').addEventListener('submit', e => { e.preventDefault(); run(input.value); input.value = ''; });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp' && hi > 0) { e.preventDefault(); input.value = hist[--hi]; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(hist.length, hi + 1); input.value = hist[hi] || ''; }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const parts = input.value.split(' '), last = parts[parts.length - 1].toLowerCase();
      const pool = parts.length === 1 ? Object.keys(CMDS)
        : parts[0] === 'cat' ? Object.keys(FILES)
        : parts[0] === 'cd' ? SECTIONS
        : parts[0] === 'fly' ? STOPS.map(s => s.city.toLowerCase())
        : parts[0] === 'open' ? Object.keys(LINKS)
        : parts[0] === 'theme' ? ['dark', 'light', 'system']
        : parts[0] === 'demo' ? Demos.names : [];
      const hits = pool.filter(x => x.startsWith(last));
      if (hits.length === 1) { parts[parts.length - 1] = hits[0]; input.value = parts.join(' ') + ' '; }
      else if (hits.length > 1) line(hits.join('    '), 'dim');
    }
  });
  $('term-close').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  document.querySelectorAll('[data-term]').forEach(b => b.addEventListener('click', open));
  document.addEventListener('keydown', e => {
    const typing = e.target.closest && e.target.closest('input, textarea, [contenteditable]');
    if (e.key === '`' && wrap.hidden && !typing) { e.preventDefault(); open(); }
    else if (e.key === 'Escape' && !wrap.hidden) close();
  });
})();
