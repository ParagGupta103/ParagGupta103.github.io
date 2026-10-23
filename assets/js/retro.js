// Scroll-driven decoration for the 90s skin: gears that turn with the page, data packets that flow along pipe dividers, and a ticker under the hero.
// Everything here is decorative (aria-hidden) and reads its colours from the page, so it works with the light and dark themes.
(function () {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';

  // One shared gradient for every gear, so each gear can use url(#retro-grad)
  const defs = document.createElement('div');
  defs.innerHTML = '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs><linearGradient id="retro-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff3ea5"/><stop offset=".5" stop-color="#ffd23f"/><stop offset="1" stop-color="#3a86ff"/></linearGradient></defs></svg>';
  document.body.append(defs.firstChild);

  // Gear outline with teeth: four points per tooth (inner, outer, outer, inner)
  function gearPath(teeth, ro, ri) {
    const pts = [], step = Math.PI * 2 / teeth, q = step / 4;
    for (let i = 0; i < teeth; i++) {
      const a = i * step;
      [[ri, a], [ro, a + q], [ro, a + 2 * q], [ri, a + 3 * q]].forEach(([r, t]) => {
        pts.push((r * Math.cos(t)).toFixed(2) + ',' + (r * Math.sin(t)).toFixed(2));
      });
    }
    return 'M' + pts.join(' L') + ' Z';
  }
  function gear(teeth, cls) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<svg class="${cls}" viewBox="-56 -56 112 112" aria-hidden="true" focusable="false"><path d="${gearPath(teeth, 50, 40)}" fill="url(#retro-grad)" stroke="#05042a" stroke-width="2"/><circle r="14" fill="#05042a"/><circle r="6" fill="#3ee6c4"/></svg>`;
    const svg = wrap.firstElementChild;
    document.body.append(svg);
    return svg;
  }
  const gears = [
    { el: gear(9, 'gear-deco a'), dir: 1 },
    { el: gear(12, 'gear-deco b'), dir: -1 },
  ];

  // Pipe dividers: a tube between sections with packets that travel as you scroll
  const PACKETS = [
    { label: 'CSV', offset: 0 }, { label: 'JSON', offset: 0.17 }, { label: 'PARQUET', offset: 0.34 },
    { label: 'ROW', offset: 0.51, bad: true }, { label: 'API', offset: 0.68 }, { label: 'BATCH', offset: 0.85 },
  ];
  const packets = [];
  const sections = [...document.querySelectorAll('main > section.band')];
  sections.slice(1).forEach(section => {
    const line = document.createElement('div');
    line.className = 'pipe-line';
    line.setAttribute('aria-hidden', 'true');
    line.innerHTML = '<div class="tube"></div>';
    PACKETS.forEach(k => {
      const pk = document.createElement('span');
      pk.className = 'pk' + (k.bad ? ' bad' : '');
      pk.textContent = k.label;
      line.append(pk);
      packets.push({ el: pk, offset: k.offset, line });
    });
    section.before(line);
  });

  // Ticker under the hero, repeating the tools from the page
  const TICKER = 'ETL ✦ dbt ✦ Airflow ✦ BigQuery ✦ Snowflake ✦ Looker ✦ Vertex AI ✦ Terraform ✦ ';
  const hero = document.querySelector('header.hero');
  if (hero) {
    const marquee = document.createElement('div');
    marquee.className = 'marquee';
    marquee.setAttribute('aria-hidden', 'true');
    marquee.innerHTML = `<div class="marquee-track">${TICKER.repeat(4)}</div>`;
    hero.after(marquee);
  }

  // Scroll progress from 0 at the top to 1 at the bottom of the page
  function update() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? window.scrollY / max : 0;
    gears.forEach(g => { g.el.style.transform = `rotate(${g.dir * window.scrollY * 0.15}deg)`; });
    packets.forEach(k => {
      const x = (p * 1.4 + k.offset) % 1;
      k.el.style.left = (x * 100) + '%';
    });
  }

  if (reduceMotion) {
    update();
    return;
  }
  let frame = 0;
  function onScroll() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; update(); });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
})();
