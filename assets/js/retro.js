// Retro layer for the 90s skin: boot screen, Start-menu taskbar, scroll-driven gears, pipe dividers with a quarantine check,
// the hero ticker, and a Save As dialog for the resume. Each part checks for its own elements, so the case-study pages load this file too.
(function () {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const byId = id => document.getElementById(id);

  // ---------- Boot screen: once per browser session, never for reduced motion; any key or click skips it ----------
  (function boot() {
    let seen = true;
    try { seen = sessionStorage.getItem('pg-booted') === '1'; sessionStorage.setItem('pg-booted', '1'); } catch (e) {}
    if (seen || reduceMotion) return;
    const LINES = [
      ['PARAG-BIOS v26.10   (C) 1998-2026', ''],
      ["CPU: Rutgers CS '26", 'OK'],
      ['Memory test: 640K', 'OK'],
      ['Detecting pipelines: Airflow, dbt, BigQuery', 'OK'],
      ['Loading globe: 5 stops', 'OK'],
      ['Mounting C:\\PROJECTS', 'OK'],
      ['Starting Parag OS...', ''],
    ];
    const el = document.createElement('div');
    el.className = 'boot';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<p class="boot-logo">Parag OS 98</p><button class="boot-skip" type="button" tabindex="-1">Skip ▸</button>';
    document.body.append(el);
    const skip = el.querySelector('.boot-skip');
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      el.classList.add('done');
      document.removeEventListener('keydown', finish);
      setTimeout(() => el.remove(), 400);
    }
    LINES.forEach(([text, status], i) => setTimeout(() => {
      if (done) return;
      const p = document.createElement('p');
      p.textContent = text;
      if (status) {
        const s = document.createElement('span');
        s.className = 'ok';
        s.textContent = ' .... ' + status;
        p.append(s);
      }
      el.insertBefore(p, skip);
    }, 150 + i * 190));
    setTimeout(finish, 150 + LINES.length * 190 + 600);
    el.addEventListener('click', finish);
    document.addEventListener('keydown', finish);
  })();

  // ---------- Taskbar: Start menu and clock ----------
  (function taskbar() {
    const btn = byId('start-btn'), menu = byId('start-menu');
    if (!btn || !menu) return;
    const items = () => [...menu.querySelectorAll('a, button')];
    function setOpen(open, refocus) {
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', open);
      if (open) items()[0].focus();
      else if (refocus) btn.focus();
    }
    btn.addEventListener('click', () => setOpen(menu.hidden));
    menu.addEventListener('click', e => { if (e.target.closest('a, button')) setOpen(false); });
    document.addEventListener('click', e => {
      if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', e => {
      if (menu.hidden) return;
      if (e.key === 'Escape') { setOpen(false, true); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const list = items(), i = list.indexOf(document.activeElement);
      list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length].focus();
    });

    const clock = byId('clock');
    if (clock) {
      const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
      tick();
      setInterval(tick, 15000);
    }
  })();

  // ---------- Gears and pipes ----------
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

  // Pipe dividers: packets travel as you scroll; the NULL packet fails the test gate and drops into quarantine
  const GATE = 0.62;
  const PACKETS = [
    { label: 'CSV', offset: 0 }, { label: 'JSON', offset: 0.17 }, { label: 'PARQUET', offset: 0.34 },
    { label: 'NULL', offset: 0.5, bad: true }, { label: 'API', offset: 0.68 }, { label: 'BATCH', offset: 0.85 },
  ];
  const packets = [];
  const sections = [...document.querySelectorAll('main > section.band')];
  sections.slice(1).forEach(section => {
    const line = document.createElement('div');
    line.className = 'pipe-line';
    line.setAttribute('aria-hidden', 'true');
    line.innerHTML = `<div class="tube"></div><span class="gate" style="left:${GATE * 100}%"></span><span class="bin" style="left:${GATE * 100}%"><i>quarantine</i></span>`;
    PACKETS.forEach(k => {
      const pk = document.createElement('span');
      pk.className = 'pk' + (k.bad ? ' bad' : '');
      pk.textContent = k.label;
      line.append(pk);
      packets.push({ el: pk, offset: k.offset, bad: !!k.bad });
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
      const caught = k.bad && x >= GATE;
      k.el.classList.toggle('caught', caught);
      k.el.style.left = ((caught ? GATE : x) * 100) + '%';
    });
  }
  update();
  if (!reduceMotion) {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; update(); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
  }

  // ---------- Resume: a Save As dialog in front of every resume link (plain clicks only) ----------
  (function resumeDialog() {
    if (!('HTMLDialogElement' in window)) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'save-dlg';
    dlg.setAttribute('aria-labelledby', 'save-title');
    dlg.innerHTML = `
      <div class="dlg-bar"><span id="save-title">Save As</span><button type="button" class="dlg-x" aria-label="Close">×</button></div>
      <div class="dlg-body">
        <div class="dlg-file">
          <svg width="32" height="40" viewBox="0 0 32 40" aria-hidden="true" focusable="false"><path d="M2 2h20l8 8v28H2z" fill="#fff" stroke="#000" stroke-width="2"/><path d="M22 2v8h8" fill="#c0c0c0" stroke="#000" stroke-width="2"/><rect x="6" y="18" width="20" height="3" fill="#000080"/><rect x="6" y="24" width="16" height="3" fill="#808080"/><rect x="6" y="30" width="18" height="3" fill="#808080"/></svg>
          <div><b>Parag_Gupta_Resume.pdf</b><span>PDF document</span></div>
        </div>
        <p>What would you like to do with this file?</p>
        <div class="dlg-btns">
          <a class="btn" data-open target="_blank" rel="noopener">Open</a>
          <a class="btn primary" data-save download="Parag_Gupta_Resume.pdf">Save</a>
          <button type="button" class="btn" data-cancel>Cancel</button>
        </div>
      </div>`;
    document.body.append(dlg);
    const open = dlg.querySelector('[data-open]'), save = dlg.querySelector('[data-save]');
    document.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('a[href$="resume.pdf"]');
      if (!a || dlg.contains(a) || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      open.href = save.href = a.getAttribute('href');
      dlg.showModal();
    });
    dlg.addEventListener('click', e => {
      if (e.target === dlg || e.target.closest('[data-cancel], .dlg-x, [data-open], [data-save]')) dlg.close();
    });
  })();
})();
