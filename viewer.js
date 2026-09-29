// Replays a logged R2A rollout (data/<story>/, written by _build/export_story.py): the frames,
// the task's motion primitive graph projected into the camera, and at every retrieval check the
// query, a message wave over the graph's edges, the top-8 segments and the three action chunks.
(() => {
  const STORIES = [
    { tag: "cam_soup", label: "Camera moved: soup", shift: "camera moved", same: "same camera and scene" },
    { tag: "cam_book", label: "Camera moved: book", shift: "camera moved", same: "same camera and scene" },
    { tag: "noise_book", label: "Blurred camera", shift: "camera image blurred", same: "same blur and scene" },
    { tag: "init_box", label: "Arm starts displaced", shift: "arm starts displaced", same: "same displaced start" },
    { tag: "light_mug", label: "Dim light", shift: "light dimmed", same: "same light and scene" },
  ];
  let SHIFT = STORIES[0];
  const $ = (id) => document.getElementById(id);
  const cv = $("v-canvas");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const bcv = $("v-base");
  const bctx = bcv.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Brighter than the paper colors: they sit on a dark simulator frame.
  const COL = { teal: "#22c6c9", coral: "#ff6a47", policy: "#ff5446", ref: "#4f9dff", exec: "#2ed47c", white: "#ffffff" };
  const DUR = { query: 850, hop0: 800, hop1: 800, hop2: 800, topk: 1100, harm: 1400, end: 5400 };
  const QUICK = 0.28;              // retrieval stages of a check shown in brief
  const STEP_MS = 70;              // one simulator step while executing
  const HIST = 16;                 // steps of history the query carries
  const ORDER = ["query", "hop0", "hop1", "hop2", "topk", "harm", "exec"];
  const TEX = {
    query: "Q_t=\\mathrm{Enc}\\big(\\mathbf{A}^{\\pi,\\mathrm{pose}}_t\\,\\|\\,x_{t-H:t}\\,\\|\\,\\mathbf{A}^{\\mathrm{exec}}_{t-H:t}\\big)",
    mp: "m^{(l)}_{u\\to v}=\\mathrm{Msg}^{(l)}\\big(h^{(l-1)}_u,\\,h^{(l-1)}_v,\\,Q_t\\big)",
    topk: "\\mathbf{A}^{\\mathrm{ref}}_t=\\sum_{v\\in\\mathcal{V}_K}\\alpha_v\\,\\mathbf{A}^{\\mathrm{demo}}_v",
    harm: "\\mathbf{A}^{\\mathrm{exec}}_t=\\mathbf{A}^{\\pi}_t+S_t\\odot\\big(\\mathbf{A}^{\\mathrm{ref}}_t-\\mathbf{A}^{\\pi}_t\\big)",
  };
  const PHASE_TEXT = {
    query: "Kinematic query", hop0: "Message passing, layer 1", hop1: "Message passing, layer 2",
    hop2: "Message passing, layer 3", topk: "Top-8 retrieval", harm: "Harmonize", exec: "Executing", end: "",
  };

  let D = null, imgO = null, imgB = null, gLayer = null;
  let heat = null;
  let st = { c: 0, ph: "query", t: 0, step: 0, bstep: 0 };
  let playing = !reduce, speed = 1, everyCheck = false, showGraph = true, visible = false;
  let dpr = 1, W = 0, k = 1;
  let dim = 0;                     // current darkening of the frame, eases toward its target
  let last = 0, token = 0;

  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const P = (uv) => [uv[0] * k, uv[1] * k];

  function detailed(c) { return everyCheck || c < 2 || c % 4 === 0; }
  function dur(ph) {
    if (ph === "exec" || ph === "end") return DUR[ph] || 0;
    return DUR[ph] * (detailed(st.c) ? 1 : QUICK);
  }

  // ---------- loading ----------
  function loadImg(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }
  async function load(tag) {
    const my = ++token;
    $("v-phase").textContent = "Loading";
    const [d, o, b] = await Promise.all([
      fetch(`data/${tag}/story.json`).then((r) => r.json()), loadImg(`data/${tag}/ours.jpg`), loadImg(`data/${tag}/base.jpg`),
    ]);
    if (my !== token) return;
    D = d; imgO = o; imgB = b;
    SHIFT = STORIES.find((x) => x.tag === tag);
    heat = new Float32Array(D.nodes.uv.length);
    $("v-cat").textContent = D.category + ", " + SHIFT.shift;
    $("v-instr").textContent = "“" + D.instruction + "”";
    $("v-scrub").max = D.ours.n - 1;
    buildCands();
    buildGates();
    resize();
    jump(0, "query");
  }

  // ---------- layout ----------
  function resize() {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width * dpr));
    cv.width = cv.height = W;
    k = W / 256;
    const br = bcv.getBoundingClientRect();
    bcv.width = bcv.height = Math.max(1, Math.round(br.width * dpr));
    if (D) buildGraphLayer();
    draw();
  }
  function buildGraphLayer() {
    gLayer = document.createElement("canvas");
    gLayer.width = gLayer.height = W;
    const g = gLayer.getContext("2d");
    const uv = D.nodes.uv, dm = D.nodes.demo;
    g.lineCap = "round";
    // cross-demo (spatial) edges
    g.strokeStyle = "rgba(190, 225, 230, 0.07)";
    g.lineWidth = 0.8 * dpr;
    g.beginPath();
    for (const [a, b] of D.spatial) { const p = P(uv[a]), q = P(uv[b]); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); }
    g.stroke();
    // temporal edges: each demonstration as a polyline through its nodes
    g.strokeStyle = "rgba(34, 198, 201, 0.30)";
    g.lineWidth = 1 * dpr;
    g.beginPath();
    for (let i = 0; i < uv.length; i++) {
      const p = P(uv[i]);
      if (i === 0 || dm[i] !== dm[i - 1]) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
    }
    g.stroke();
    g.fillStyle = "rgba(120, 235, 235, 0.75)";
    for (let i = 0; i < uv.length; i++) {
      const p = P(uv[i]);
      g.fillRect(p[0] - 0.8 * dpr, p[1] - 0.8 * dpr, 1.6 * dpr, 1.6 * dpr);
    }
  }

  // ---------- side panel ----------
  function buildCands() {
    const host = $("v-cands");
    host.innerHTML = "";
    for (let i = 0; i < 8; i++) {
      const r = document.createElement("div");
      r.className = "cand";
      r.innerHTML = `<span class="nm"></span><span class="wb"><i></i></span><span class="wv"></span>`;
      host.appendChild(r);
    }
  }
  function buildGates() {
    const host = $("v-gates");
    host.innerHTML = "";
    ["x", "y", "z", "roll", "pitch", "yaw"].forEach((n) => {
      const g = document.createElement("div");
      g.className = "gate";
      g.innerHTML = `<b>0.00</b><div class="col"><i></i></div><span>${n}</span>`;
      host.appendChild(g);
    });
  }
  function showCands(lit) {
    const ck = D.checks[st.c];
    const order = ck.cands.map((c, i) => [c.w, i]).sort((a, b) => b[0] - a[0]);
    const maxw = order[0][0];
    $("v-cands").querySelectorAll(".cand").forEach((row, j) => {
      const c = ck.cands[order[j][1]];
      row.querySelector(".nm").textContent = `demo ${c.demo} · ${c.lo}–${c.hi}`;
      row.querySelector(".wv").textContent = c.w.toFixed(2);
      row.querySelector(".wb i").style.width = lit ? `${(100 * c.w) / maxw}%` : "0%";
      row.classList.toggle("lit", lit);
      row.classList.toggle("top", j === 0);
    });
    $("v-ck").textContent = `check ${st.c + 1} of ${D.checks.length}`;
  }
  function showGates(on) {
    const g = D.checks[st.c].gate;
    $("v-gates").querySelectorAll(".gate").forEach((el, i) => {
      el.querySelector("i").style.height = on ? `${Math.max(3, Math.min(100, g[i] * 200))}%` : "0%";
      el.querySelector("b").textContent = on ? g[i].toFixed(2) : "\u2013";
    });
  }
  function tex(key) {
    const host = $("v-tex");
    if (!key) { host.textContent = ""; return; }
    if (window.katex) window.katex.render(TEX[key], host, { throwOnError: false, displayMode: true });
    else host.textContent = TEX[key];
  }
  function panel() {
    const ph = st.ph;
    const grp = ph.startsWith("hop") ? "mp" : ph;
    document.querySelectorAll("#v-steps li").forEach((li) => {
      const idx = ["query", "mp", "topk", "harm", "exec"];
      li.classList.toggle("on", li.dataset.k === grp);
      li.classList.toggle("done", idx.indexOf(li.dataset.k) < idx.indexOf(grp));
    });
    if (ph.startsWith("hop")) $("v-hop").textContent = `layer ${+ph[3] + 1} of 3`;
    tex(grp === "exec" || grp === "end" ? "harm" : grp);
    showCands(["topk", "harm", "exec"].includes(ph));
    showGates(["harm", "exec"].includes(ph));
    const p = D.checks[st.c].phase;
    $("v-p").textContent = p.toFixed(2);
    $("v-pbar").style.width = `${p * 100}%`;
    const el = $("v-phase");
    el.textContent = ph === "end" ? (D.ours.success ? `Task complete in ${D.ours.steps} steps` : "Timed out") : PHASE_TEXT[ph];
    el.classList.toggle("exec", ph === "exec" || ph === "end");
    $("v-end").classList.toggle("show", ph === "end");
    if (ph === "end") {
      $("v-end").innerHTML = `<span style="background:rgba(46,212,124,.9)">R2A: success, ${D.ours.steps} steps</span>` +
        `<span style="background:rgba(255,84,70,.9)">Alone: ${D.base.success ? "success" : "fails, times out at " + D.base.steps}</span>`;
    }
  }

  // ---------- state machine ----------
  function jump(step, ph) {
    let c = 0;
    for (let i = 0; i < D.checks.length; i++) if (D.checks[i].step <= step) c = i;
    st = { c, ph: ph || "exec", t: 0, step, bstep: step };
    heat.fill(0);
    panel();
    draw();
  }
  function nextPhase() {
    if (st.ph === "end") { jump(0, "query"); return; }
    if (st.ph === "exec") {
      if (st.c + 1 < D.checks.length) { st.c += 1; st.step = D.checks[st.c].step; st.ph = "query"; }
      else st.ph = "end";
    } else {
      st.ph = ORDER[ORDER.indexOf(st.ph) + 1];
      if (st.ph === "exec") st.t = 0;
    }
    st.t = 0;
    if (st.ph === "query") heat.fill(0);
    panel();
  }
  function execTarget() {
    return st.c + 1 < D.checks.length ? D.checks[st.c + 1].step : D.ours.n - 1;
  }
  function tick(dt) {
    st.t += dt * speed;
    if (st.ph === "exec") {
      const target = execTarget();
      while (st.t >= STEP_MS && st.step < target) { st.t -= STEP_MS; st.step++; }
      st.bstep = st.step;
      if (st.step >= target) nextPhase();
    } else if (st.ph === "end") {
      st.bstep = Math.min(D.base.n - 1, st.step + Math.floor(st.t / STEP_MS) * 8);
      if (st.t >= DUR.end) nextPhase();
    } else if (st.t >= dur(st.ph)) {
      if (st.ph.startsWith("hop")) spreadHeat(+st.ph[3]);
      nextPhase();
    }
    for (let i = 0; i < heat.length; i++) heat[i] *= st.ph === "exec" ? 0.94 : 0.995;
    $("v-scrub").value = st.step;
    $("v-step").textContent = `step ${st.step}`;
  }
  function spreadHeat(h) {
    const hop = D.checks[st.c].hops[h];
    for (const [, v] of hop) heat[v] = Math.min(1, heat[v] + 0.55);
  }

  // ---------- drawing ----------
  function poly(pts, color, width, alpha, dash) {
    if (pts.length < 2) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineJoin = ctx.lineCap = "round";
    ctx.setLineDash(dash ? dash.map((d) => d * dpr) : []);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = width + 2.5 * dpr;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
  }
  function arrowChunk(uvs, color, frac, alpha, width) {
    // an action chunk as dots joined by a line, drawn up to frac of its length, arrow at the tip
    const pts = uvs.map(P);
    const n = pts.length - 1;
    const upto = frac * n;
    const shown = [];
    for (let i = 0; i <= Math.floor(upto); i++) shown.push(pts[i]);
    if (upto < n) {
      const i = Math.floor(upto), f = upto - i;
      shown.push([lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)]);
    }
    poly(shown, color, width, alpha);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let i = 1; i < shown.length - 1; i++) { ctx.beginPath(); ctx.arc(shown[i][0], shown[i][1], 2.2 * dpr, 0, 7); ctx.fill(); }
    const a = shown[shown.length - 2], b = shown[shown.length - 1];
    if (a && b) {
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = 9 * dpr;
      ctx.beginPath();
      ctx.moveTo(b[0], b[1]);
      ctx.lineTo(b[0] - L * Math.cos(ang - 0.45), b[1] - L * Math.sin(ang - 0.45));
      ctx.lineTo(b[0] - L * Math.cos(ang + 0.45), b[1] - L * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  function frame(c2d, img, size, cols, step, w) {
    const sx = (step % cols) * size, sy = Math.floor(step / cols) * size;
    c2d.imageSmoothingEnabled = true;
    c2d.imageSmoothingQuality = "high";
    c2d.drawImage(img, sx, sy, size, size, 0, 0, w, w);
  }

  function draw() {
    if (!D || !W) return;
    const ck = D.checks[st.c];
    const ph = st.ph;
    const pt = clamp01(st.t / Math.max(1, dur(ph)));
    const inRetrieval = !["exec", "end"].includes(ph);

    frame(ctx, imgO, D.ours.size, D.ours.cols, Math.min(st.step, D.ours.n - 1), W);
    dim = lerp(dim, inRetrieval ? 0.5 : 0.12, 0.12);
    ctx.fillStyle = `rgba(6, 10, 14, ${dim})`;
    ctx.fillRect(0, 0, W, W);

    if (showGraph && gLayer) {
      ctx.globalAlpha = inRetrieval ? 0.95 : 0.45;
      ctx.drawImage(gLayer, 0, 0);
      ctx.globalAlpha = 1;
    }

    // relevance glow left behind by the messages
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const uv = D.nodes.uv;
    for (let i = 0; i < heat.length; i++) {
      const h = heat[i];
      if (h < 0.04) continue;
      const p = P(uv[i]);
      ctx.fillStyle = `rgba(255, 106, 71, ${0.55 * h})`;
      ctx.beginPath();
      ctx.arc(p[0], p[1], (1.4 + 3.2 * h) * dpr, 0, 7);
      ctx.fill();
    }
    ctx.restore();

    // GR00T alone, faint and dashed
    const bpath = D.base.path.slice(0, Math.min(st.bstep, D.base.n - 1) + 1).map(P);
    poly(bpath, COL.policy, 1.6 * dpr, 0.55, [5, 5]);
    // R2A rollout so far, and the query's history window
    const opath = D.ours.path.slice(0, st.step + 1).map(P);
    poly(opath, COL.exec, 2.4 * dpr, 0.95);
    if (inRetrieval) {
      const h0 = Math.max(0, ck.step - HIST);
      poly(D.ours.path.slice(h0, ck.step + 1).map(P), COL.coral, 3.4 * dpr, ph === "query" ? 1 : 0.6);
    }

    // messages in flight
    if (ph.startsWith("hop")) {
      const hop = ck.hops[+ph[3]];
      const e = ease(pt);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 1 * dpr;
      for (const [u, v] of hop) {
        const a = P(uv[u]), b = P(uv[v]);
        const x = lerp(a[0], b[0], e), y = lerp(a[1], b[1], e);
        ctx.strokeStyle = `rgba(255, 140, 110, ${0.22 * (1 - pt * 0.5)})`;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = "rgba(255, 175, 140, 0.95)";
        ctx.beginPath(); ctx.arc(x, y, 1.9 * dpr, 0, 7); ctx.fill();
      }
      ctx.restore();
    }

    // the top-8 segments, width by softmax weight
    const showCand = ["topk", "harm", "exec"].includes(ph) && ph !== "exec" || (ph === "exec" && st.t < 500 * speed);
    if (["topk", "harm"].includes(ph) || (ph === "exec" && detailed(st.c))) {
      const fade = ph === "exec" ? clamp01(1 - (st.step - ck.step) / 5) : 1;
      const grow = ph === "topk" ? ease(pt) : 1;
      const maxw = Math.max(...ck.cands.map((c) => c.w));
      const order = ck.cands.map((c, i) => i).sort((a, b) => ck.cands[a].w - ck.cands[b].w);
      const now = P(ck.now);
      for (const i of order) {
        const c = ck.cands[i];
        if (!c.nodes.length) continue;
        const pts = c.nodes.map((n) => P(uv[n]));
        const top = c.w === maxw;
        if (ph === "topk") {
          ctx.save();
          ctx.globalAlpha = 0.5 * grow * fade;
          ctx.setLineDash([3 * dpr, 4 * dpr]);
          ctx.strokeStyle = COL.ref;
          ctx.lineWidth = 1 * dpr;
          ctx.beginPath(); ctx.moveTo(now[0], now[1]); ctx.lineTo(pts[0][0], pts[0][1]); ctx.stroke();
          ctx.restore();
        }
        const cut = Math.max(2, Math.round(pts.length * grow));
        poly(pts.slice(0, cut), COL.ref, (1.5 + 7 * (c.w / maxw)) * dpr * (top ? 1.1 : 0.7), (top ? 1 : 0.55) * fade);
        if (top && ph !== "exec") {
          const p = pts[pts.length - 1];
          ctx.save();
          ctx.globalAlpha = grow;
          ctx.font = `600 ${12 * dpr}px Inter, sans-serif`;
          ctx.fillStyle = "#fff";
          ctx.strokeStyle = "rgba(0,0,0,0.7)";
          ctx.lineWidth = 3 * dpr;
          const txt = `demo ${c.demo}, frames ${c.lo}–${c.hi}`;
          ctx.strokeText(txt, p[0] + 8 * dpr, p[1] - 6 * dpr);
          ctx.fillText(txt, p[0] + 8 * dpr, p[1] - 6 * dpr);
          ctx.restore();
        }
      }
    }

    // the three chunks: policy and reference draw in, then the executed one slides from policy to its place
    if (ph === "harm" || ph === "exec") {
      const a = ph === "harm" ? pt : 1;
      const fade = ph === "exec" ? clamp01(1 - (st.step - ck.step) / 8) : 1;
      if (fade > 0) {
        const W2 = 2.6 * dpr;
        arrowChunk(ck.chunk.a_ref, COL.ref, clamp01(a / 0.35), fade, W2);
        arrowChunk(ck.chunk.a_policy, COL.policy, clamp01(a / 0.35), fade, W2);
        const m = ease(clamp01((a - 0.4) / 0.5));
        if (a > 0.4) {
          const mix = ck.chunk.a_policy.map((p, i) => [lerp(p[0], ck.chunk.a_exec[i][0], m), lerp(p[1], ck.chunk.a_exec[i][1], m)]);
          arrowChunk(mix, COL.exec, 1, fade, 3.4 * dpr);
        }
      }
    }

    // the query forming at the gripper
    const g = P(D.ours.path[Math.min(st.step, D.ours.n - 1)]);
    if (ph === "query") {
      for (let r = 0; r < 3; r++) {
        const f = (pt * 1.4 + r / 3) % 1;
        ctx.strokeStyle = `rgba(255, 106, 71, ${1 - f})`;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath(); ctx.arc(g[0], g[1], (6 + 42 * f) * dpr, 0, 7); ctx.stroke();
      }
      ctx.save();
      ctx.font = `italic 600 ${17 * dpr}px "STIX Two Text", serif`;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = 3 * dpr;
      ctx.globalAlpha = clamp01(pt * 3);
      ctx.strokeText("Q", g[0] + 14 * dpr, g[1] + 22 * dpr);
      ctx.fillText("Q", g[0] + 14 * dpr, g[1] + 22 * dpr);
      ctx.font = `italic ${11 * dpr}px "STIX Two Text", serif`;
      ctx.strokeText("t", g[0] + 27 * dpr, g[1] + 26 * dpr);
      ctx.fillText("t", g[0] + 27 * dpr, g[1] + 26 * dpr);
      ctx.restore();
    }
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.arc(g[0], g[1], 4.5 * dpr, 0, 7); ctx.fill(); ctx.stroke();

    // the inset: the same scene without R2A
    const bw = bcv.width;
    frame(bctx, imgB, D.base.size, D.base.cols, Math.min(st.bstep, D.base.n - 1), bw);
    const bk = bw / 256;
    bctx.save();
    bctx.lineJoin = bctx.lineCap = "round";
    bctx.strokeStyle = COL.policy;
    bctx.lineWidth = 1.6 * dpr;
    bctx.beginPath();
    D.base.path.slice(0, Math.min(st.bstep, D.base.n - 1) + 1).forEach((p, i) =>
      i ? bctx.lineTo(p[0] * bk, p[1] * bk) : bctx.moveTo(p[0] * bk, p[1] * bk));
    bctx.stroke();
    bctx.restore();
    const dead = ph === "end" && !D.base.success && st.bstep >= D.base.n - 1;
    $("v-inset").classList.toggle("dead", dead);
    $("v-base-state").textContent = dead ? `never finishes, times out at ${D.base.steps}`
      : `step ${st.bstep}, ${SHIFT.same}`;
  }

  function loop(ts) {
    const dt = last ? Math.min(64, ts - last) : 16;
    last = ts;
    if (D && playing && visible) tick(dt);
    if (D && visible) draw();
    requestAnimationFrame(loop);
  }

  // ---------- controls ----------
  function setPlaying(p) {
    playing = p;
    const b = $("v-play");
    b.classList.toggle("on", p);
    b.querySelector("span").textContent = p ? "Pause" : "Play";
    $("v-play-ico").innerHTML = p ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>' : '<path d="M7 5l12 7-12 7z"/>';
  }
  $("v-play").onclick = () => setPlaying(!playing);
  $("v-next").onclick = () => {
    setPlaying(false);
    if (st.ph === "exec") { st.step = execTarget(); st.bstep = st.step; }
    if (st.ph.startsWith("hop")) spreadHeat(+st.ph[3]);
    nextPhase();
    st.t = st.ph === "exec" ? 0 : dur(st.ph) * 0.999;
    draw();
  };
  $("v-speed").querySelectorAll("button").forEach((b) => {
    b.onclick = () => {
      speed = +b.dataset.s;
      $("v-speed").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    };
  });
  $("v-scrub").addEventListener("input", (e) => { if (D) jump(+e.target.value, "exec"); });
  $("v-detail").classList.toggle("on", everyCheck);
  $("v-detail").onclick = (e) => { everyCheck = !everyCheck; e.currentTarget.classList.toggle("on", everyCheck); };
  $("v-graph").onclick = (e) => { showGraph = !showGraph; e.currentTarget.classList.toggle("on", showGraph); };
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && visible && !/INPUT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) {
      e.preventDefault();
      setPlaying(!playing);
    }
  });

  const tabs = $("v-tabs");
  STORIES.forEach((s, i) => {
    const b = document.createElement("button");
    b.className = "tab" + (i === 0 ? " on" : "");
    b.textContent = s.label;
    b.onclick = () => {
      tabs.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t === b));
      load(s.tag);
    };
    tabs.appendChild(b);
  });

  new ResizeObserver(() => resize()).observe(cv);
  new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); }, { threshold: 0.15 }).observe(cv);
  window.addEventListener("load", () => { if (D) panel(); });
  setPlaying(playing);
  load(STORIES[0].tag);
  requestAnimationFrame(loop);
})();
