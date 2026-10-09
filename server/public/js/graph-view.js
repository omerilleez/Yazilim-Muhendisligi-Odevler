// Basit kuvvet yönelimli graf çizimi (canvas, bağımlılıksız). Sürükleme, kaydırma ve yakınlaştırma destekler.
export function createGraphView(canvas, data, { onSelect, edgeTypes } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const colorOf = new Map(data.communities.map((c) => [c.id, c.color]));
  const nodes = data.nodes.map((n, i) => {
    const angle = (i / data.nodes.length) * Math.PI * 2;
    const ring = 120 + (n.community % 3) * 60;
    return { ...n, x: Math.cos(angle) * ring + (n.community * 37) % 90, y: Math.sin(angle) * ring, vx: 0, vy: 0, r: 7 + Math.sqrt(n.pagerank * 900) };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let edges = [];
  const setEdges = (types) => {
    edges = data.edges.filter((e) => types.has(e.type) && byId.has(e.source) && byId.has(e.target)).map((e) => ({ ...e, s: byId.get(e.source), t: byId.get(e.target) }));
  };
  setEdges(edgeTypes || new Set(['takip', 'guven', 'oy_benzerligi', 'yanit']));

  let view = { x: 0, y: 0, k: 1 };
  let selected = null;
  let hover = null;
  let drag = null;
  let alpha = 1;
  let width = 0;
  let height = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    draw();
  }

  function step() {
    if (alpha < 0.01) return;
    const repulse = 2600;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy || 0.01;
        if (d2 > 250000) continue;
        const f = (repulse / d2) * alpha;
        const d = Math.sqrt(d2);
        dx /= d; dy /= d;
        a.vx += dx * f; a.vy += dy * f;
        b.vx -= dx * f; b.vy -= dy * f;
      }
    }
    for (const e of edges) {
      const dx = e.t.x - e.s.x;
      const dy = e.t.y - e.s.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const target = e.s.community === e.t.community ? 70 : 150;
      const f = ((d - target) / d) * 0.02 * Math.min(2, e.weight) * alpha;
      e.s.vx += dx * f; e.s.vy += dy * f;
      e.t.vx -= dx * f; e.t.vy -= dy * f;
    }
    for (const n of nodes) {
      n.vx -= n.x * 0.004 * alpha;
      n.vy -= n.y * 0.004 * alpha;
      if (n === drag?.node) continue;
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += n.vx; n.y += n.vy;
    }
    alpha *= 0.985;
  }

  const EDGE_STYLE = {
    takip: { color: 'rgba(120,130,150,.35)', dash: [] },
    guven: { color: 'rgba(15,110,102,.55)', dash: [] },
    oy_benzerligi: { color: 'rgba(79,70,229,.35)', dash: [4, 4] },
    yanit: { color: 'rgba(217,119,6,.45)', dash: [2, 3] },
  };

  function draw() {
    const styles = getComputedStyle(document.documentElement);
    const text = styles.getPropertyValue('--text').trim() || '#111';
    const surface = styles.getPropertyValue('--surface').trim() || '#fff';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.translate(width / 2 + view.x, height / 2 + view.y);
    ctx.scale(view.k, view.k);
    const focus = selected || hover;
    const neighbors = new Set();
    if (focus) for (const e of edges) { if (e.s === focus) neighbors.add(e.t); if (e.t === focus) neighbors.add(e.s); }
    for (const e of edges) {
      const st = EDGE_STYLE[e.type] || EDGE_STYLE.takip;
      const active = focus && (e.s === focus || e.t === focus);
      ctx.globalAlpha = focus && !active ? 0.12 : 1;
      ctx.strokeStyle = st.color;
      ctx.setLineDash(st.dash);
      ctx.lineWidth = (0.6 + e.weight * 0.6) / view.k * (active ? 1.6 : 1);
      ctx.beginPath();
      ctx.moveTo(e.s.x, e.s.y);
      ctx.lineTo(e.t.x, e.t.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const n of nodes) {
      const dim = focus && n !== focus && !neighbors.has(n);
      ctx.globalAlpha = dim ? 0.25 : 1;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = colorOf.get(n.community) || '#94a3b8';
      ctx.fill();
      ctx.lineWidth = (n === selected ? 3 : 1.5) / view.k;
      ctx.strokeStyle = n === selected ? text : surface;
      ctx.stroke();
      if (n.expert.length) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 3.5, 0, Math.PI * 2);
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1.5 / view.k;
        ctx.stroke();
      }
      ctx.fillStyle = text;
      ctx.font = `${12 / Math.max(view.k, 0.6)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(n.nickname, n.x, n.y + n.r + 13 / Math.max(view.k, 0.6));
    }
    ctx.globalAlpha = 1;
  }

  const toWorld = (px, py) => ({ x: (px - width / 2 - view.x) / view.k, y: (py - height / 2 - view.y) / view.k });
  const pick = (px, py) => {
    const p = toWorld(px, py);
    let best = null;
    let bestD = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < n.r + 6 && d < bestD) { best = n; bestD = d; }
    }
    return best;
  };
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener('pointerdown', (e) => {
    const p = pos(e);
    const n = pick(p.x, p.y);
    canvas.setPointerCapture(e.pointerId);
    drag = n ? { node: n, moved: false } : { pan: true, x: p.x, y: p.y, vx: view.x, vy: view.y, moved: false };
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pos(e);
    if (!drag) {
      const h = pick(p.x, p.y);
      if (h !== hover) { hover = h; canvas.style.cursor = h ? 'pointer' : 'grab'; draw(); }
      return;
    }
    drag.moved = true;
    if (drag.node) {
      const w = toWorld(p.x, p.y);
      drag.node.x = w.x; drag.node.y = w.y; drag.node.vx = 0; drag.node.vy = 0;
      alpha = Math.max(alpha, 0.3);
    } else {
      view.x = drag.vx + (p.x - drag.x);
      view.y = drag.vy + (p.y - drag.y);
    }
    draw();
  });
  canvas.addEventListener('pointerup', (e) => {
    const p = pos(e);
    if (drag && !drag.moved) {
      selected = pick(p.x, p.y);
      onSelect?.(selected);
    }
    drag = null;
    canvas.style.cursor = 'grab';
    draw();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = pos(e);
    const before = toWorld(p.x, p.y);
    view.k = Math.min(3, Math.max(0.3, view.k * (e.deltaY < 0 ? 1.12 : 0.89)));
    view.x = p.x - width / 2 - before.x * view.k;
    view.y = p.y - height / 2 - before.y * view.k;
    draw();
  }, { passive: false });

  let raf;
  function loop() {
    if (alpha >= 0.01) {
      step();
      draw();
    }
    raf = requestAnimationFrame(loop);
  }
  // Grafı tuvale sığdır
  function fit() {
    if (!nodes.length || !width) return;
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const bw = Math.max(...xs) - Math.min(...xs) + 120;
    const bh = Math.max(...ys) - Math.min(...ys) + 120;
    view.k = Math.max(0.4, Math.min(2.2, Math.min(width / bw, height / bh)));
    view.x = -((Math.max(...xs) + Math.min(...xs)) / 2) * view.k;
    view.y = -((Math.max(...ys) + Math.min(...ys)) / 2) * view.k;
  }
  window.addEventListener('resize', resize);
  resize();
  for (let i = 0; i < 300; i++) step();
  fit();
  loop();

  return {
    setEdgeTypes(types) { setEdges(types); alpha = 0.6; },
    select(id) { selected = byId.get(id) || null; onSelect?.(selected); draw(); },
    fit() { fit(); draw(); },
    destroy() { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); },
  };
}
