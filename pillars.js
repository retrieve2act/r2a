// Small looping sketches on the three method cards: building the graph, retrieving from it,
// and gating the reference into the policy. Schematic, drawn on a 320 x 200 grid.
(() => {
  const css = getComputedStyle(document.documentElement);
  const C = (n) => css.getPropertyValue(n).trim();
  const COL = {
    teal: C("--teal"), tealSoft: C("--teal-soft"), coral: C("--coral"), lav: C("--lav") || "#7c6ad6",
    policy: C("--policy"), exec: C("--exec"), demo: C("--demo"), ink: C("--ink"), muted: C("--muted"), rule: C("--rule"),
  };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const back = (x) => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- a small motion primitive graph, shared by the first two sketches ----------
  const DEMOS = 4, PER = 10;
  const nodes = [];
  for (let d = 0; d < DEMOS; d++) {
    for (let i = 0; i < PER; i++) {
      const x = 34 + i * 28;
      const y = 48 + d * 34 + Math.sin(i * 0.72 + d * 1.3) * 16 + (d % 2 ? 6 : -4) * Math.cos(i * 0.4);
      nodes.push({ d, i, x, y });
    }
  }
  const id = (d, i) => d * PER + i;
  const temporal = [];
  for (let d = 0; d < DEMOS; d++) for (let i = 0; i < PER; i++) for (const k of [2, 4]) if (i + k < PER) temporal.push([id(d, i), id(d, i + k), k]);
  const RAD = 36;
  const spatial = [];
  for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
    const A = nodes[a], B = nodes[b];
    if (A.d !== B.d && Math.hypot(A.x - B.x, A.y - B.y) < RAD) spatial.push([a, b]);
  }
  const adj = nodes.map(() => []);
  for (const n of nodes) {
    if (n.i + 1 < PER) { adj[id(n.d, n.i)].push(id(n.d, n.i + 1)); adj[id(n.d, n.i + 1)].push(id(n.d, n.i)); }
  }
  for (const [a, b] of temporal) { adj[a].push(b); adj[b].push(a); }
  for (const [a, b] of spatial) { adj[a].push(b); adj[b].push(a); }

  function dot(g, x, y, r, fill, stroke) {
    g.beginPath(); g.arc(x, y, Math.max(0, r), 0, 7);
    g.fillStyle = fill; g.fill();
    if (stroke) { g.lineWidth = 1.2; g.strokeStyle = stroke; g.stroke(); }
  }
  function label(g, txt, x, y, col, size = 12, italic = true) {
    g.font = `${italic ? "italic " : ""}600 ${size}px "STIX Two Text", serif`;
    g.fillStyle = col;
    g.fillText(txt, x, y);
  }
  function demoPath(g, d, upto) {
    g.beginPath();
    let started = false;
    for (let i = 0; i < PER - 1; i++) {
      const a = nodes[id(d, i)], b = nodes[id(d, i + 1)];
      const f = clamp(upto * (PER - 1) - i);
      if (f <= 0) break;
      if (!started) { g.moveTo(a.x, a.y); started = true; }
      g.lineTo(lerp(a.x, b.x, f), lerp(a.y, b.y, f));
    }
    g.stroke();
  }
  function arc(g, a, b, k, f) {
    // temporal skip edge as an arc over the demo line, grown to fraction f
    const mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 9 - k * 3;
    g.beginPath();
    g.moveTo(a.x, a.y);
    const steps = 16;
    for (let s = 1; s <= Math.round(steps * f); s++) {
      const t = s / steps;
      const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * mx + t * t * b.x;
      const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * my + t * t * b.y;
      g.lineTo(x, y);
    }
    g.stroke();
  }

  // ---------- 1. Graph-Index ----------
  // Three demonstrations unroll into segment nodes (real simulator frames). Temporal edges run
  // forward inside a demo; spatial edges join similar gripper states across demos, also across
  // tasks; then a message walks the graph over both kinds. Drawn on a 660 x 256 grid.
  const INDEX_T = 11;
  const thumbs = new Image();
  thumbs.src = "assets/nodes.jpg";
  const TR = 22;
  const ROWS = [
    { y: 62, col: "#029a9f", name: "demo 1", task: "task A" },
    { y: 142, col: "#2f9e62", name: "demo 2", task: "task A" },
    { y: 222, col: "#d49a16", name: "demo 3", task: "task B" },
  ];
  const WIG = [[0, -6, 4, -4, 6, -2], [4, -3, 5, -5, 2, 5], [-4, 4, -6, 3, -3, 4]];
  const GN = [];
  ROWS.forEach((r, ri) => { for (let i = 0; i < 6; i++) GN.push({ x: 128 + i * 98, y: r.y + WIG[ri][i], img: ri * 6 + i, col: r.col, ri, i }); });
  const nid = (r, i) => r * 6 + i;
  const TEMP = [];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) TEMP.push([nid(r, i), nid(r, i + 1)]);
  const SKIP = [];
  for (let i = 0; i < 4; i += 1) { SKIP.push([nid(0, i), nid(0, i + 2), -1]); SKIP.push([nid(2, i), nid(2, i + 2), 1]); }
  const SAME = [[nid(0, 0), nid(1, 0)], [nid(0, 1), nid(1, 1)], [nid(0, 2), nid(1, 3)], [nid(0, 3), nid(1, 3)], [nid(0, 4), nid(1, 4)], [nid(0, 5), nid(1, 5)], [nid(0, 1), nid(1, 2)]];
  const CROSS = [[nid(1, 1), nid(2, 1)], [nid(1, 2), nid(2, 2)], [nid(1, 4), nid(2, 3)]];
  const WALK = [[nid(0, 0), nid(0, 1), "t"], [nid(0, 1), nid(1, 1), "s"], [nid(1, 1), nid(1, 2), "t"], [nid(1, 2), nid(2, 2), "x"], [nid(2, 2), nid(2, 3), "t"], [nid(2, 3), nid(1, 4), "x"], [nid(1, 4), nid(1, 5), "t"]];
  const popAt = (j) => 0.2 + GN[j].ri * 0.55 + GN[j].i * 0.18;
  function edgeEnds(a, b) {
    const an = Math.atan2(b.y - a.y, b.x - a.x);
    return [a.x + TR * Math.cos(an), a.y + TR * Math.sin(an), b.x - TR * Math.cos(an), b.y - TR * Math.sin(an), an];
  }
  function tEdge(g, a, b, f, w, col) {
    const [x0, y0, x1, y1, an] = edgeEnds(a, b);
    g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(lerp(x0, x1, f), lerp(y0, y1, f)); g.stroke();
    if (f > 0.9) {
      g.fillStyle = col; g.beginPath(); g.moveTo(x1, y1);
      g.lineTo(x1 - 8 * Math.cos(an - 0.45), y1 - 8 * Math.sin(an - 0.45)); g.lineTo(x1 - 8 * Math.cos(an + 0.45), y1 - 8 * Math.sin(an + 0.45)); g.fill();
    }
  }
  function sEdge(g, a, b, f, w, col, curved) {
    g.strokeStyle = col; g.lineWidth = w; g.setLineDash([5, 4]); g.beginPath();
    if (curved) {
      // a long link that bows out to the left of the middle row
      const cx = Math.min(a.x, b.x) - 70, cy = (a.y + b.y) / 2;
      for (let s = 0; s <= Math.round(24 * f); s++) {
        const t = 0.08 + (s / 24) * 0.84;
        const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cx + t * t * b.x, y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cy + t * t * b.y;
        s ? g.lineTo(x, y) : g.moveTo(x, y);
      }
    } else {
      const [x0, y0, x1, y1] = edgeEnds(a, b);
      g.moveTo(x0, y0); g.lineTo(lerp(x0, x1, f), lerp(y0, y1, f));
    }
    g.stroke(); g.setLineDash([]);
  }
  function skipArc(g, a, b, side, f) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + side * 26;
    g.beginPath();
    for (let s = 0; s <= Math.round(20 * f); s++) {
      const t = 0.14 + (s / 20) * 0.72;
      const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * mx + t * t * b.x, y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * my + t * t * b.y;
      s ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
  function thumbNode(g, n, s, glow, glowCol) {
    if (s <= 0) return;
    const r = Math.max(0, TR * back(s));
    if (glow > 0) { g.fillStyle = glowCol.replace("A", (0.28 * glow).toFixed(3)); g.beginPath(); g.arc(n.x, n.y, r + 8, 0, 7); g.fill(); }
    g.save(); g.shadowColor = "rgba(40,30,90,0.2)"; g.shadowBlur = 7; g.shadowOffsetY = 2;
    g.fillStyle = "#fff"; g.beginPath(); g.arc(n.x, n.y, r, 0, 7); g.fill(); g.restore();
    g.save(); g.beginPath(); g.arc(n.x, n.y, Math.max(0, r - 2), 0, 7); g.clip();
    if (thumbs.complete && thumbs.naturalWidth) g.drawImage(thumbs, n.img * 112, 0, 112, 112, n.x - r, n.y - r, 2 * r, 2 * r);
    g.restore();
    g.lineWidth = 2.8; g.strokeStyle = n.col; g.beginPath(); g.arc(n.x, n.y, r, 0, 7); g.stroke();
  }
  function pill(g, txt, x, y, col, a) {
    g.globalAlpha *= a;
    g.font = '700 11px Inter, sans-serif';
    const w = g.measureText(txt).width;
    g.fillStyle = "rgba(255,255,255,0.95)"; g.strokeStyle = col; g.lineWidth = 1.2;
    g.beginPath(); g.roundRect(x - w / 2 - 9, y - 13, w + 18, 20, 10); g.fill(); g.stroke();
    g.fillStyle = col; g.fillText(txt, x - w / 2, y + 1);
  }
  function drawIndex(g, t) {
    const fade = 1 - seg(t, 10.4, 11);
    g.globalAlpha = fade;
    g.lineCap = g.lineJoin = "round";
    const sk = seg(t, 2.0, 2.8);
    if (sk > 0) { g.lineWidth = 1.3; SKIP.forEach(([a, b, side]) => { g.strokeStyle = GN[a].col + "66"; skipArc(g, GN[a], GN[b], side, sk); }); }
    const sp = seg(t, 3.2, 4.3), cx = seg(t, 4.9, 5.9);
    SAME.forEach(([a, b], j) => { const f = ease(clamp(sp * 1.5 - j * 0.07)); if (f > 0) sEdge(g, GN[a], GN[b], f, 1.8, "rgba(124,106,214,0.8)"); });
    CROSS.forEach(([a, b, c], j) => { const f = ease(clamp(cx * 1.4 - j * 0.12)); if (f > 0) sEdge(g, GN[a], GN[b], f, 2, "rgba(214,80,150,0.8)", c); });
    TEMP.forEach(([a, b]) => { const f = ease(seg(t, popAt(b) - 0.15, popAt(b) + 0.1)); if (f > 0) tEdge(g, GN[a], GN[b], f, 2.2, GN[a].col); });
    // the walk
    let cur = null;
    WALK.forEach(([a, b, k], j) => {
      const t0 = 6.4 + j * 0.5, f = seg(t, t0, t0 + 0.45);
      if (f <= 0) return;
      const A = GN[a], B = GN[b];
      if (k === "t") tEdge(g, A, B, 1, 4, "#fb6544"); else sEdge(g, A, B, 1, 3.4, "#fb6544");
      if (f < 1) { cur = [A, B, k]; const [x0, y0, x1, y1] = edgeEnds(A, B), e = ease(f); dot(g, lerp(x0, x1, e), lerp(y0, y1, e), 5, "#fb6544", "#fff"); }
    });
    const walked = new Set();
    WALK.forEach(([a, b], j) => { if (t > 6.4) walked.add(a); if (t > 6.4 + j * 0.5 + 0.45) walked.add(b); });
    const gs = seg(t, 3.2, 3.7) * (1 - seg(t, 4.4, 4.8)), gx = seg(t, 4.9, 5.4) * (1 - seg(t, 6.0, 6.4));
    const lit = new Set(SAME.flat()), litx = new Set(CROSS.flatMap((e) => e.slice(0, 2)));
    GN.forEach((n, j) => thumbNode(g, n, seg(t, popAt(j), popAt(j) + 0.35),
      litx.has(j) && gx > 0 ? gx : lit.has(j) ? gs : 0, litx.has(j) && gx > 0 ? "rgba(214,80,150,A)" : "rgba(124,106,214,A)"));
    if (t < 10) walked.forEach((j) => { g.lineWidth = 3; g.strokeStyle = "#fb6544"; g.beginPath(); g.arc(GN[j].x, GN[j].y, TR + 4, 0, 7); g.stroke(); });
    // row names
    ROWS.forEach((r, ri) => {
      g.globalAlpha = fade * seg(t, 0.2 + ri * 0.55, 0.6 + ri * 0.55);
      g.font = '700 11px Inter, sans-serif'; g.fillStyle = r.col; g.fillText(r.name, 14, r.y);
      g.font = '500 10px Inter, sans-serif'; g.fillStyle = COL.muted; g.fillText(r.task, 14, r.y + 14);
    });
    g.globalAlpha = fade;
    // what is being drawn
    const caps = [
      [0.3, 2.9, "temporal edges: same demo, a few steps ahead (Δ = 2, 4, 6, 8)", "#029a9f"],
      [3.2, 4.8, "spatial edges: similar gripper state in another demo", "#7c6ad6"],
      [4.9, 6.3, "spatial edges also cross tasks", "#d6509a"],
    ];
    caps.forEach(([a, b, txt, col]) => { const k = seg(t, a, a + 0.3) * (1 - seg(t, b - 0.3, b)); if (k > 0) { g.save(); pill(g, txt, 360, 17, col, k); g.restore(); } });
    if (cur) {
      const [A, B, k] = cur;
      const txt = k === "t" ? "temporal" : k === "s" ? "spatial" : "spatial, cross-task";
      g.save(); pill(g, txt, (A.x + B.x) / 2 + (k === "t" ? 0 : 58), (A.y + B.y) / 2 + (k === "t" ? -30 : 4), "#fb6544", 1); g.restore();
    }
    g.globalAlpha = 1;
  }

  // ---------- 2. R2A-Retriever ----------
  const RET_T = 7.8;
  const Q = { x: 150, y: 106 };
  const seeds = nodes.map((n, j) => [Math.hypot(n.x - Q.x, n.y - Q.y), j]).sort((a, b) => a[0] - b[0]).slice(0, 3).map((x) => x[1]);
  const layers = [];
  {
    const seen = new Set(seeds);
    let front = seeds.slice();
    for (let l = 0; l < 3; l++) {
      const msgs = [], nxt = [];
      for (const u of front) for (const v of adj[u]) { msgs.push([u, v]); if (!seen.has(v)) { seen.add(v); nxt.push(v); } }
      layers.push(msgs);
      front = nxt;
    }
  }
  // relevance after the wave: reached early, close to the query, and pointing the same way
  const reach = nodes.map(() => 9);
  seeds.forEach((s) => (reach[s] = 0));
  layers.forEach((m, l) => m.forEach(([, v]) => (reach[v] = Math.min(reach[v], l + 1))));
  const score = nodes.map((n, j) => (n.i < PER - 3 ? -reach[j] - Math.hypot(n.x - Q.x, n.y - Q.y) / 40 : -99));
  const topk = score.map((s, j) => [s, j]).sort((a, b) => b[0] - a[0]).slice(0, 5).map((x) => x[1]);
  const wts = (() => { const e = topk.map((j) => Math.exp(score[j] * 1.4)); const z = e.reduce((a, b) => a + b); return e.map((x) => x / z); })();
  const ref = [0, 1, 2, 3].map((s) => {
    let x = 0, y = 0;
    topk.forEach((j, k) => { const n = nodes[j], f = nodes[id(n.d, n.i + s)]; x += wts[k] * (f.x - n.x); y += wts[k] * (f.y - n.y); });
    return { x: Q.x + x, y: Q.y + y };
  });

  function drawRetrieve(g, t) {
    const fade = 1 - seg(t, 7.2, 7.8);
    g.globalAlpha = fade;
    g.lineCap = g.lineJoin = "round";
    const pick = seg(t, 3.7, 4.4);
    const dim = 1 - 0.55 * pick;
    // the graph at rest
    g.lineWidth = 0.9; g.strokeStyle = `rgba(124,106,214,${0.28 * dim})`; g.setLineDash([2, 3]);
    for (const [a, b] of spatial) { g.beginPath(); g.moveTo(nodes[a].x, nodes[a].y); g.lineTo(nodes[b].x, nodes[b].y); g.stroke(); }
    g.setLineDash([]);
    g.lineWidth = 1.8; g.strokeStyle = `rgba(2,154,159,${0.5 * dim})`;
    for (let d = 0; d < DEMOS; d++) demoPath(g, d, 1);
    // heat left by the messages
    const heat = nodes.map(() => 0);
    seeds.forEach((s) => (heat[s] = seg(t, 0.6, 1.0)));
    layers.forEach((m, l) => { const f = seg(t, 1.0 + l * 0.9 + 0.6, 1.0 + l * 0.9 + 0.9); m.forEach(([, v]) => (heat[v] = Math.max(heat[v], f * (1 - l * 0.22)))); });
    nodes.forEach((n, j) => {
      const h = heat[j] * (1 - 0.7 * pick * (topk.includes(j) ? 0 : 1));
      if (h > 0.02) {
        const gr = g.createRadialGradient(n.x, n.y, 0, n.x, n.y, 12);
        gr.addColorStop(0, `rgba(251,101,68,${0.55 * h})`); gr.addColorStop(1, "rgba(251,101,68,0)");
        g.fillStyle = gr; g.beginPath(); g.arc(n.x, n.y, 12, 0, 7); g.fill();
      }
      dot(g, n.x, n.y, 3, h > 0.3 ? "#ffd9cd" : "#fff", `rgba(2,154,159,${dim})`);
    });
    // messages in flight
    layers.forEach((m, l) => {
      const f = seg(t, 1.0 + l * 0.9, 1.0 + l * 0.9 + 0.8);
      if (f <= 0 || f >= 1) return;
      const e = ease(f);
      m.forEach(([u, v]) => {
        const a = nodes[u], b = nodes[v];
        const x = lerp(a.x, b.x, e), y = lerp(a.y, b.y, e);
        g.strokeStyle = "rgba(251,101,68,0.35)"; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(x, y); g.stroke();
        dot(g, x, y, 2.2, COL.coral);
      });
    });
    // the query and its link into the graph
    const q = seg(t, 0, 0.6);
    for (let r = 0; r < 2; r++) {
      const f = ((t * 0.9 + r * 0.5) % 1);
      g.strokeStyle = `rgba(251,101,68,${(1 - f) * 0.6 * (1 - pick)})`; g.lineWidth = 1.4;
      g.beginPath(); g.arc(Q.x, Q.y, 5 + f * 22, 0, 7); g.stroke();
    }
    if (q > 0) {
      g.setLineDash([3, 3]); g.strokeStyle = "rgba(251,101,68,0.7)"; g.lineWidth = 1;
      seeds.forEach((s) => { g.beginPath(); g.moveTo(Q.x, Q.y); g.lineTo(lerp(Q.x, nodes[s].x, q), lerp(Q.y, nodes[s].y, q)); g.stroke(); });
      g.setLineDash([]);
    }
    // top-K with their weights
    if (pick > 0) {
      topk.forEach((j, k) => {
        const n = nodes[j];
        g.strokeStyle = COL.demo; g.lineWidth = 2;
        g.beginPath(); g.arc(n.x, n.y, Math.max(0, 6.5 * back(pick)), 0, 7); g.stroke();

      });
    }
    // their futures, fused into the reference
    const fu = seg(t, 4.6, 5.6), fz = seg(t, 5.5, 6.5);
    if (fu > 0) {
      topk.forEach((j) => {
        const n = nodes[j];
        g.strokeStyle = `rgba(31,95,168,${0.5 * (1 - fz * 0.6)})`; g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(n.x, n.y);
        for (let s = 1; s <= 3; s++) {
          const f = clamp(fu * 3 - (s - 1)); if (f <= 0) break;
          const a = nodes[id(n.d, n.i + s - 1)], b = nodes[id(n.d, n.i + s)];
          g.lineTo(lerp(a.x, b.x, f), lerp(a.y, b.y, f));
        }
        g.stroke();
      });
    }
    if (fz > 0) {
      g.strokeStyle = COL.demo; g.lineWidth = 4;
      g.beginPath(); g.moveTo(ref[0].x, ref[0].y);
      for (let s = 1; s < ref.length; s++) {
        const f = clamp(fz * 3 - (s - 1)); if (f <= 0) break;
        g.lineTo(lerp(ref[s - 1].x, ref[s].x, f), lerp(ref[s - 1].y, ref[s].y, f));
      }
      g.stroke();
      if (fz >= 1) {
        const a = ref[ref.length - 2], b = ref[ref.length - 1], an = Math.atan2(b.y - a.y, b.x - a.x);
        g.fillStyle = COL.demo; g.beginPath(); g.moveTo(b.x + 5 * Math.cos(an), b.y + 5 * Math.sin(an));
        g.lineTo(b.x - 7 * Math.cos(an - 0.5), b.y - 7 * Math.sin(an - 0.5)); g.lineTo(b.x - 7 * Math.cos(an + 0.5), b.y - 7 * Math.sin(an + 0.5)); g.fill();
        label(g, "A", b.x + 8, b.y - 4, COL.demo, 13); label(g, "ref", b.x + 17, b.y - 10, COL.demo, 8);
      }
    }
    // the query stays on top of the rings and the reference line, with a halo behind its label
    dot(g, Q.x, Q.y, 5.5 * back(q), COL.coral, "#fff");
    g.font = 'italic 600 13px "STIX Two Text", serif';
    g.lineWidth = 4; g.strokeStyle = "#fff"; g.strokeText("Q", Q.x - 20, Q.y - 9);
    label(g, "Q", Q.x - 20, Q.y - 9, COL.coral, 13);
    g.font = 'italic 600 8px "STIX Two Text", serif';
    g.lineWidth = 3; g.strokeText("t", Q.x - 11, Q.y - 5);
    label(g, "t", Q.x - 11, Q.y - 5, COL.coral, 8);
    g.globalAlpha = fade;
    g.font = '500 10px Inter, sans-serif'; g.fillStyle = COL.muted;
    const stage = t < 1 ? "query" : t < 3.7 ? `message passing, layer ${Math.min(3, 1 + Math.floor((t - 1) / 0.9))}` : t < 4.6 ? "top-K by relevance" : "fuse future motion";
    g.fillText(stage, 12, 192);
    if (pick > 0) {
      g.globalAlpha = fade * pick;
      g.font = '600 9px "JetBrains Mono", monospace';
      let x = 318;
      for (let k = topk.length - 1; k >= 0; k--) {
        const txt = wts[k].toFixed(2), w = g.measureText(txt).width;
        x -= w + 6; g.fillStyle = COL.demo; g.fillText(txt, x, 192);
        g.fillStyle = "rgba(31,95,168,0.25)"; g.fillRect(x, 181 - 26 * wts[k], w, 26 * wts[k]);
      }
      label(g, "\u03b1", x - 12, 192, COL.demo, 12);
      g.globalAlpha = fade;
    }
    g.globalAlpha = 1;
  }

  // ---------- 3. Harmonize ----------
  const HARM_T = 7.4;
  const O = { x: 26, y: 150 };
  const N = 9;
  const pi = [], rf = [];
  for (let i = 0; i < N; i++) {
    pi.push({ x: O.x + i * 17, y: O.y - i * 4 + i * i * 0.9 });   // drifts off, the OOD failure
    rf.push({ x: O.x + i * 16, y: O.y - i * 12 + i * i * 0.35 }); // what the demos did from here
  }
  const DIMS = ["x", "y", "z", "rx", "ry", "rz"];
  const S = [0.62, 0.84, 0.47, 0.18, 0.12, 0.26];
  function chunk(g, pts, col, f, w) {
    const n = pts.length - 1, upto = f * n;
    g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
    let last = pts[0], prev = pts[0];
    for (let i = 1; i <= n; i++) {
      const k = clamp(upto - (i - 1)); if (k <= 0) break;
      prev = last; last = { x: lerp(pts[i - 1].x, pts[i].x, k), y: lerp(pts[i - 1].y, pts[i].y, k) };
      g.lineTo(last.x, last.y);
    }
    g.stroke();
    for (let i = 1; i < Math.floor(upto) + 1 && i <= n; i++) dot(g, pts[i].x, pts[i].y, 1.9, col);
    if (f > 0.05) {
      const an = Math.atan2(last.y - prev.y, last.x - prev.x);
      g.fillStyle = col; g.beginPath(); g.moveTo(last.x + 4 * Math.cos(an), last.y + 4 * Math.sin(an));
      g.lineTo(last.x - 7 * Math.cos(an - 0.5), last.y - 7 * Math.sin(an - 0.5)); g.lineTo(last.x - 7 * Math.cos(an + 0.5), last.y - 7 * Math.sin(an + 0.5)); g.fill();
    }
    return last;
  }
  function drawHarm(g, t) {
    const fade = 1 - seg(t, 6.8, 7.4);
    g.globalAlpha = fade;
    g.lineCap = g.lineJoin = "round";
    const fp = ease(seg(t, 0.1, 1.2)), fr = ease(seg(t, 0.8, 1.9)), gs = seg(t, 2.0, 3.2), mx = ease(seg(t, 3.1, 4.8));
    // disagreement, the thing the gate looks at
    if (gs > 0) {
      g.strokeStyle = `rgba(124,106,214,${0.35 * (1 - mx)})`; g.lineWidth = 1; g.setLineDash([2, 3]);
      for (let i = 2; i < N; i += 2) { g.beginPath(); g.moveTo(pi[i].x, pi[i].y); g.lineTo(rf[i].x, rf[i].y); g.stroke(); }
      g.setLineDash([]);
    }
    const lp = chunk(g, pi, mx > 0 ? "rgba(192,57,43,0.45)" : COL.policy, fp, 2.4);
    const lr = chunk(g, rf, mx > 0 ? "rgba(31,95,168,0.45)" : COL.demo, fr, 2.4);
    if (fp > 0.9) { label(g, "A", lp.x + 6, lp.y + 12, COL.policy, 13); label(g, "π", lp.x + 15, lp.y + 6, COL.policy, 9); }
    if (fr > 0.9) { label(g, "A", lr.x + 6, lr.y + 2, COL.demo, 13); label(g, "ref", lr.x + 15, lr.y - 4, COL.demo, 8); }
    if (mx > 0) {
      const ex = pi.map((p, i) => ({ x: p.x + S[0] * mx * (rf[i].x - p.x), y: p.y + S[1] * mx * (rf[i].y - p.y) }));
      const le = chunk(g, ex, COL.exec, 1, 3.6);
      if (mx > 0.95) { label(g, "A", le.x + 7, le.y + 4, COL.exec, 13); label(g, "exec", le.x + 16, le.y - 2, COL.exec, 8); }
    }
    dot(g, O.x, O.y, 4.5, "#fff", COL.ink);
    // the gate, one bar per pose dimension, the gripper passes through
    const bx0 = 214, bw = 10, gap = 3, base = 150, H = 92;
    g.fillStyle = "rgba(255,255,255,0.8)"; g.strokeStyle = COL.rule; g.lineWidth = 1;
    g.beginPath(); g.roundRect(bx0 - 10, base - H - 26, 7 * (bw + gap) + 16, H + 56, 8); g.fill(); g.stroke();
    label(g, "S", bx0 - 2, base - H - 11, COL.ink, 12); label(g, "t", bx0 + 6, base - H - 7, COL.ink, 8);
    DIMS.forEach((d, j) => {
      const x = bx0 + j * (bw + gap);
      const v = S[j] * back(clamp(gs * 1.3 - j * 0.06)) * (1 + 0.04 * Math.sin(t * 4 + j) * seg(t, 3.2, 3.6));
      g.fillStyle = "#ece8f7"; g.fillRect(x, base - H, bw, H);
      const gr = g.createLinearGradient(0, base, 0, base - H);
      gr.addColorStop(0, "#9be3c0"); gr.addColorStop(1, COL.exec);
      g.fillStyle = gr; g.fillRect(x, base - H * v, bw, H * v);
      g.font = '500 7.5px "JetBrains Mono", monospace'; g.fillStyle = COL.muted;
      g.fillText(d, x + bw / 2 - g.measureText(d).width / 2, base + 11);
    });
    const gx = bx0 + 6 * (bw + gap);
    g.strokeStyle = COL.muted; g.setLineDash([2, 2]); g.strokeRect(gx + 0.5, base - H + 0.5, bw - 1, H - 1); g.setLineDash([]);
    g.font = '500 7.5px "JetBrains Mono", monospace'; g.fillStyle = COL.muted; g.fillText("g", gx + 3, base + 11);
    g.save(); g.translate(gx + bw / 2 + 3, base - 8); g.rotate(-Math.PI / 2); g.font = '500 7.5px Inter, sans-serif'; g.fillText("from π", 0, 0); g.restore();
    g.globalAlpha = 1;
  }

  // ---------- run ----------
  const SK = { index: [drawIndex, INDEX_T, 9.6, 660, 256], retrieve: [drawRetrieve, RET_T, 6.8, 320, 200], harm: [drawHarm, HARM_T, 6.2, 320, 200] };
  const items = [...document.querySelectorAll(".pill-cv")].map((cv) => ({ cv, g: cv.getContext("2d"), sk: SK[cv.dataset.anim], vis: false, t0: 0 }));
  function size(it) {
    const r = it.cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    it.cv.width = Math.round(r.width * dpr); it.cv.height = Math.round(r.height * dpr);
    const [, , , LW, LH] = it.sk;
    it.k = Math.min(it.cv.width / LW, it.cv.height / LH);
    it.ox = (it.cv.width - LW * it.k) / 2; it.oy = (it.cv.height - LH * it.k) / 2;
  }
  function paint(it, t) {
    const g = it.g;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, it.cv.width, it.cv.height);
    g.setTransform(it.k, 0, 0, it.k, it.ox, it.oy);
    it.sk[0](g, t);
  }
  items.forEach((it) => {
    size(it);
    new ResizeObserver(() => { size(it); if (reduce) paint(it, it.sk[2]); }).observe(it.cv);
    new IntersectionObserver((es) => { it.vis = es.some((e) => e.isIntersecting); }).observe(it.cv);
    it.cv.parentElement.addEventListener("mouseenter", () => { it.t0 = performance.now(); });
    if (reduce) paint(it, it.sk[2]);
  });
  if (reduce) return;
  function loop(now) {
    items.forEach((it) => {
      if (!it.vis) return;
      if (!it.t0) it.t0 = now;
      paint(it, ((now - it.t0) / 1000) % it.sk[1]);
    });
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
