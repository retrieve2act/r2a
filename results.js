// Numbers from Tables 1 to 5 and Figure 4 of the submission.
(() => {
  const CATS = ["Camera", "Robot", "Language", "Light", "Background", "Noise", "Layout"];
  const T1 = {
    baselines: [
      ["OpenVLA", 0.8, 3.5, 23.0, 8.1, 34.8, 15.2, 28.5, 16.3],
      ["OpenVLA-OFT", 56.4, 31.9, 79.5, 88.7, 93.3, 75.8, 74.2, 71.4],
      ["NORA", 2.2, 37.0, 65.1, 45.7, 58.6, 12.8, 62.1, 40.5],
      ["WorldVLA", 0.1, 27.9, 41.6, 43.7, 17.1, 10.9, 38.0, 25.6],
      ["UniVLA", 1.8, 46.2, 69.6, 69.0, 81.0, 21.2, 31.9, 45.8],
      ["π0", 13.8, 6.0, 58.8, 85.5, 81.4, 79.0, 68.9, 56.2],
      ["π0-FAST", 65.1, 21.6, 61.0, 73.2, 73.2, 74.4, 68.8, 62.5],
      ["RIPT-VLA", 55.2, 31.2, 77.6, 88.4, 91.6, 73.5, 74.2, 70.2],
      ["VLA-JEPA", 63.3, 67.1, 85.4, 95.6, 93.6, 66.3, 85.1, 79.5],
    ],
    pairs: {
      "GR00T N1.7": [[65.2, 45.8, 83.9, 95.5, 94.3, 83.1, 71.8, 77.1], [80.5, 94.9, 86.6, 97.1, 94.2, 91.1, 78.3, 89.0]],
      "StableVLA": [[75.3, 50.6, 70.8, 95.8, 89.9, 85.9, 78.5, 78.1], [85.7, 98.6, 75.0, 98.5, 96.8, 92.3, 79.7, 89.5]],
      "π0.5": [[72.0, 75.3, 85.8, 97.1, 95.6, 88.6, 87.0, 85.9], [78.7, 97.2, 86.6, 96.3, 97.1, 89.2, 87.7, 90.4]],
    },
  };
  const T2 = [[57.5, 34.2, 71.7, 55.5, 67.0, 60.9, 51.1, 56.8], [59.3, 75.9, 74.3, 65.4, 68.6, 64.5, 55.7, 66.2]];
  const T3 = {
    "GR00T N1.7": [
      ["GR00T N1.7", 44.0, 60.0, 82.0, 89.0, 84.0, 51.0, 59.0, 67.0],
      ["+ VLS", 38.1, 30.9, 66.8, 77.9, 73.2, 50.2, 64.1, 57.3],
      ["+ SDN", 41.1, 34.1, 81.2, 87.0, 86.5, 89.3, 74.1, 70.5],
      ["+ ICL", 50.8, 60.1, 89.3, 81.0, 91.3, 77.5, 71.8, 74.5],
      ["+ R2A", 58.9, 87.5, 84.6, 94.5, 88.9, 78.6, 81.4, 82.1],
    ],
    "π0.5": [
      ["π0.5", 50.6, 73.3, 88.8, 95.6, 93.4, 75.5, 89.1, 80.9],
      ["+ VLS", 45.7, 44.3, 79.4, 80.3, 72.3, 56.8, 75.6, 64.9],
      ["+ SDN", 48.9, 73.5, 90.6, 95.6, 92.7, 95.8, 89.7, 83.8],
      ["+ ICL", 45.1, 79.1, 91.9, 89.1, 79.2, 78.9, 80.7, 77.7],
      ["+ R2A", 55.1, 96.9, 91.9, 95.6, 95.2, 78.0, 91.3, 86.3],
    ],
  };
  const T5 = [
    ["GR00T N1.7", 77.1, "base"],
    ["w/o GNN retrieval", 63.8, "abl"],
    ["w/o harmonization", 1.2, "abl"],
    ["w/o ranking loss", 80.7, "abl"],
    ["R2A", 89.0, "ours"],
    ["w/o ISR (robot init.)", 49.9, "abl"],
    ["R2A (robot init.)", 87.5, "ours"],
  ];
  const LAT = [["GR00T N1.7", 138, 67.0], ["R2A", 159, 82.1], ["SDN", 245, 70.5], ["VLS", 807, 57.1]];

  const $ = (id) => document.getElementById(id);
  const fmt = (v) => v.toFixed(1);
  const dcls = (d) => (d >= 0 ? "up" : "dn");
  const dtxt = (d) => (d >= 0 ? "+" : "−") + Math.abs(d).toFixed(1);

  // One row of paired bars: grey base on top, purple ours below.
  function pairRow(label, base, ours, avg) {
    const r = document.createElement("div");
    r.className = "brow" + (avg ? " avg" : "");
    r.innerHTML = `<div class="lab">${label}</div>
      <div class="track"><div class="b base"><span>${fmt(base)}</span></div><div class="b ours"><span>${fmt(ours)}</span></div></div>
      <div class="delta ${dcls(ours - base)}">${dtxt(ours - base)}</div>`;
    return r;
  }
  // Bars grow once the row is on screen, and again whenever the data change.
  function grow(host, widths) {
    const bars = host.querySelectorAll(".b");
    requestAnimationFrame(() => bars.forEach((b, i) => { b.style.width = `calc(${widths[i]}% * 0.86)`; }));
  }
  function whenVisible(host, fn) {
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { fn(); io.disconnect(); }
    }, { threshold: 0.2 });
    io.observe(host);
  }

  function tabs(host, names, onPick) {
    host.innerHTML = "";
    names.forEach((n, i) => {
      const b = document.createElement("button");
      b.className = "tab" + (i === 0 ? " on" : "");
      b.textContent = n;
      b.onclick = () => {
        host.querySelectorAll(".tab").forEach((t) => t.classList.remove("on"));
        b.classList.add("on");
        onPick(n);
      };
      host.appendChild(b);
    });
  }

  // Table 1
  let seen1 = false;
  function draw1(model) {
    const host = $("t1-bars");
    const [b, o] = T1.pairs[model];
    host.innerHTML = "";
    const w = [];
    CATS.forEach((c, i) => { host.appendChild(pairRow(c, b[i], o[i])); w.push(b[i], o[i]); });
    host.appendChild(pairRow("Average", b[7], o[7], true)); w.push(b[7], o[7]);
    if (seen1) grow(host, w); else whenVisible(host, () => { seen1 = true; grow(host, w); });
  }
  tabs($("t1-tabs"), Object.keys(T1.pairs), draw1);
  draw1("GR00T N1.7");

  function cell(v, base) {
    if (base === undefined) return `<td>${fmt(v)}</td>`;
    const d = v - base;
    return `<td>${fmt(v)}<sub class="${dcls(d)}">${dtxt(d)}</sub></td>`;
  }
  const head = `<thead><tr><th>Model</th>${CATS.map((c) => `<th>${c}</th>`).join("")}<th>Avg.</th></tr></thead>`;
  let rows = T1.baselines.map((r) => `<tr><td>${r[0]}</td>${r.slice(1).map((v) => cell(v)).join("")}</tr>`).join("");
  for (const [m, [b, o]] of Object.entries(T1.pairs)) {
    rows += `<tr class="grp"><td>${m}</td>${b.map((v) => cell(v)).join("")}</tr>`;
    rows += `<tr class="ours"><td>+ R2A</td>${o.map((v, i) => cell(v, b[i])).join("")}</tr>`;
  }
  $("t1-table").innerHTML = `<table>${head}<tbody>${rows}</tbody></table>`;

  // Table 2
  {
    const host = $("t2-bars");
    const w = [];
    CATS.forEach((c, i) => { host.appendChild(pairRow(c, T2[0][i], T2[1][i])); w.push(T2[0][i], T2[1][i]); });
    host.appendChild(pairRow("Average", T2[0][7], T2[1][7], true)); w.push(T2[0][7], T2[1][7]);
    whenVisible(host, () => grow(host, w));
  }

  // Table 3: one bar per method, averages only
  let seen3 = false;
  function draw3(model) {
    const host = $("t3-bars");
    host.innerHTML = "";
    const rowsM = T3[model];
    const base = rowsM[0][8];
    const w = [];
    rowsM.forEach((r, i) => {
      const ours = r[0] === "+ R2A";
      const d = document.createElement("div");
      d.className = "brow" + (ours ? " avg" : "");
      d.innerHTML = `<div class="lab">${r[0]}</div><div class="track"><div class="b ${ours ? "ours" : "base"}" style="top:7px"><span>${fmt(r[8])}</span></div></div>
        <div class="delta ${i === 0 ? "" : dcls(r[8] - base)}">${i === 0 ? "" : dtxt(r[8] - base)}</div>`;
      host.appendChild(d);
      w.push(r[8]);
    });
    if (seen3) grow(host, w); else whenVisible(host, () => { seen3 = true; grow(host, w); });
  }
  tabs($("t3-tabs"), Object.keys(T3), draw3);
  draw3("GR00T N1.7");
  {
    let body = "";
    for (const [m, rs] of Object.entries(T3)) {
      rs.forEach((r, i) => {
        const cls = r[0] === "+ R2A" ? "ours" : i === 0 ? "grp" : "";
        body += `<tr class="${cls}"><td>${r[0]}</td>${r.slice(1).map((v, j) => cell(v, r[0] === "+ R2A" ? rs[0][j + 1] : undefined)).join("")}</tr>`;
      });
    }
    $("t3-table").innerHTML = `<table>${head.replace("Model", "Method")}<tbody>${body}</tbody></table>`;
  }

  // Table 5 as columns; the hatched cap is what each variant loses against R2A
  {
    const host = $("t5-bars");
    const groups = [
      ["All perturbations", [["GR00T N1.7", 77.1, "base"], ["w/o harmon­ization", 1.2], ["w/o GNN retrieval", 63.8], ["w/o ranking loss", 80.7], ["R2A", 89.0, "ours"]], 89.0],
      ["Robot init.", [["w/o ISR", 49.9], ["R2A", 87.5, "ours"]], 87.5],
    ];
    let cols = "", labs = "", heads = "";
    groups.forEach(([g, items, ref], gi) => {
      if (gi) { cols += '<div class="vabl-sep"></div>'; labs += '<div class="vabl-sep"></div>'; }
      items.forEach(([n, v, k]) => {
        const lost = !k && v < ref;
        cols += `<div class="vc${k ? " " + k : ""}" style="--h:${v}%;--r:${ref}%">
          ${lost ? `<div class="vc-lost"></div><div class="vc-d">${dtxt(v - ref)}</div>` : ""}
          <div class="vc-bar"><span class="vc-val">${fmt(v)}</span></div></div>`;
        labs += `<div class="${k === "ours" ? "ours" : ""}">${n}</div>`;
      });
      heads += `<span style="flex:${items.length}">${g}</span>`;
    });
    const grid = [25, 50, 75, 100].map((y) => `<div class="vabl-grid" style="bottom:${y}%"><span>${y}</span></div>`).join("");
    host.className = "vabl";
    host.innerHTML = `<div class="vabl-plot">${grid}${cols}</div><div class="vabl-labs">${labs}</div><div class="vabl-groups">${heads}</div>
      <div class="abl-key"><span><i class="k-lost"></i>lost against R2A</span></div>`;
    whenVisible(host, () => host.classList.add("go"));
  }

  // Figure 4: success against inference time per step, log time axis
  {
    const host = $("lat-bars");
    const W = 460, H = 300, L = 46, R = 16, T = 18, B = 40;
    const X = (ms) => L + ((Math.log10(ms) - 2) / 1) * (W - L - R);
    const Y = (sr) => T + (1 - (sr - 50) / 45) * (H - T - B);
    const pts = LAT.map(([n, ms, sr]) => ({ n, ms, sr, x: X(ms), y: Y(sr), ours: n === "R2A" }));
    const g0 = pts.find((p) => p.n === "GR00T N1.7"), us = pts.find((p) => p.ours);
    let svg = `<svg viewBox="0 0 ${W} ${H}" class="lat-svg" role="img" aria-label="Success rate against inference time per step">
      <defs>
        <linearGradient id="lat-good" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6a4fd4" stop-opacity=".12"/><stop offset=".6" stop-color="#6a4fd4" stop-opacity=".03"/><stop offset="1" stop-color="#6a4fd4" stop-opacity="0"/></linearGradient>
        <radialGradient id="lat-glow"><stop offset="0" stop-color="#6a4fd4" stop-opacity=".4"/><stop offset="1" stop-color="#6a4fd4" stop-opacity="0"/></radialGradient>
        <marker id="lat-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#fb6544"/></marker>
      </defs>
      <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="url(#lat-good)" rx="6"/>`;
    [100, 200, 300, 500, 1000].forEach((ms) => {
      svg += `<line x1="${X(ms)}" x2="${X(ms)}" y1="${T}" y2="${H - B}" class="lat-grid"/><text x="${X(ms)}" y="${H - B + 16}" class="lat-tick" text-anchor="middle">${ms}</text>`;
    });
    [50, 60, 70, 80, 90].forEach((sr) => {
      svg += `<line x1="${L}" x2="${W - R}" y1="${Y(sr)}" y2="${Y(sr)}" class="lat-grid"/><text x="${L - 8}" y="${Y(sr) + 4}" class="lat-tick" text-anchor="end">${sr}</text>`;
    });
    svg += `<text x="${(L + W - R) / 2}" y="${H - 6}" class="lat-ax" text-anchor="middle">inference time per step, ms (log)</text>
      <text transform="translate(12 ${(T + H - B) / 2}) rotate(-90)" class="lat-ax" text-anchor="middle">success, %</text>
      <text x="${L + 10}" y="${T + 16}" class="lat-corner">faster and better</text>
      <path d="M${g0.x + 6} ${g0.y - 8} Q ${g0.x - 22} ${(g0.y + us.y) / 2} ${us.x - 7} ${us.y + 9}" class="lat-arrow" marker-end="url(#lat-arr)"/>
      <text x="${us.x + 14}" y="${us.y + 22}" class="lat-note">+21 ms, +15.1 points</text>`;
    pts.forEach((p, i) => {
      svg += `<g class="lat-pt${p.ours ? " ours" : ""}" style="--x:${p.x}px;--y:${p.y}px;transition-delay:${0.15 + i * 0.12}s">
        ${p.ours ? `<circle r="26" fill="url(#lat-glow)"/><circle r="9" class="ring"/>` : ""}
        <circle r="${p.ours ? 8 : 6}" class="dot"/>
        <text x="${p.ours ? 14 : p.ms > 500 ? -10 : 10}" y="${p.ours ? -10 : -9}" class="lat-name" text-anchor="${p.ms > 500 ? "end" : "start"}">${p.n}</text>
        <text x="${p.ours ? 14 : p.ms > 500 ? -10 : 10}" y="${p.ours ? 4 : 5}" class="lat-val" text-anchor="${p.ms > 500 ? "end" : "start"}">${p.ms} ms · ${fmt(p.sr)}%</text>
      </g>`;
    });
    host.innerHTML = svg + "</svg>";
    whenVisible(host, () => host.classList.add("go"));
  }
})();
