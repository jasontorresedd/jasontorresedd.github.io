/* Mobile Data Log — dashboard
   Reads the two CSV logs, builds a month-by-month model, and renders every panel.
   Plain JS, no dependencies. Chart colors come from CSS tokens, so they follow the theme. */
(() => {
  "use strict";

  /* =====================================================================
     Configuration — edit here as the log grows
     ===================================================================== */
  const FILES = { usage: "mobile-data-usage-gb.csv", status: "mobile-data-usage-actown.csv" };
  const FIRST_YEAR = 2016;
  const IMAGE_DIR = "/sec-col/devices/";
  const MB_PER_GB = 1000;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const CARRIERS = { sprint: "Sprint", verizon: "Verizon" };

  // Display names and network generation per device code. A new device only needs a row here
  // (and a column of data); anything missing falls back to the name in the CSV.
  const DEVICE_META = {
    P1: { model: "iPhone 6s", net: "LTE", img: "iphone-6s.svg" },
    P2: { model: "iPhone 7", net: "LTE", img: "iphone-7.svg" },
    P3: { model: "iPhone XS", net: "LTE", img: "iphone-xs.svg" },
    P4: { model: "iPhone 13 Pro", net: "5G", img: "iphone-13-pro.svg" },
    P5: { model: "iPhone 16 Pro Max", net: "5G", img: "iphone-16-pro-max.svg" },
    T1: { model: "iPad Pro 11″", net: "LTE", img: "ipad-pro-11.svg" },
    T2: { model: "iPad Air 10.9″ (5th gen)", net: "5G", img: "ipad-air.svg" },
    T3: { model: "iPad Pro 12.9″ (6th gen)", net: "5G", img: "ipad-pro-129.svg" },
    "P-hotspot": { model: "iPhone hotspot" },
    "T-hotspot": { model: "iPad hotspot" },
  };
  const NET_LABEL = { LTE: "Unlimited 4G/LTE", "5G": "Unlimited 5G" };

  // Anomalous stretches of the log (inclusive, YYYY-MM).
  const PERIODS = [
    { id: "covid", from: "2020-03", to: "2021-08", label: "COVID-19 work from home", short: "COVID-19" },
    { id: "bug", from: "2024-01", to: "2024-04", label: "iOS and iPadOS data bug", short: "iOS bug" },
  ];

  // My notes: numbered markers on the timeline. Add, remove or rewrite freely.
  const NOTES = [
    { month: "2018-12", title: "Sprint to Verizon", text: "Moved to Verizon and upgraded to an iPhone XS (P3)." },
    { month: "2019-02", title: "Added an iPad to my plan", text: "Added an iPad Pro 11″ (T1) with a dedicated data line." },
    { month: "2019-07", title: "iPad hotspot on", text: "Began to use an iPad hotspot for my Mac on-the-go." },
    { month: "2019-10", title: "iPhone hotspot on", text: "Began to use my iPhone hotspot when my iPad was unavailable." },
    { month: "2021-10", title: "First 5G iPhone", text: "Switched to an iPhone 13 Pro (P4) and began to take advantage of unlimited 5G data." },
    { month: "2024-02", title: "The iOS bug months", text: "An iOS and iPadOS bug inflated the counters from January to April 2024." },
    { month: "2025-01", title: "Next big iPhone upgrade", text: "Switched to an iPhone 16 Pro Max (P5), taking over as my main device." },
    { month: "2025-07", title: "Cancelled iPad data service", text: "After being laid off I no longer needed it for daily use." },
  ];

  const SEASONS = [
    { name: "Winter", months: [11, 0, 1] },
    { name: "Spring", months: [2, 3, 4] },
    { name: "Summer", months: [5, 6, 7] },
    { name: "Fall", months: [8, 9, 10] },
  ];

  const CLASSES = [
    { key: "phone", kind: "phone", hotspot: false, label: "iPhone", plural: "iPhones" },
    { key: "phoneHs", kind: "phone", hotspot: true, label: "iPhone hotspot", plural: "iPhone hotspot" },
    { key: "tablet", kind: "tablet", hotspot: false, label: "iPad", plural: "iPads" },
    { key: "tabletHs", kind: "tablet", hotspot: true, label: "iPad hotspot", plural: "iPad hotspot" },
  ];
  const CLASS = Object.fromEntries(CLASSES.map((c) => [c.key, c]));
  const ALL_KEYS = CLASSES.map((c) => c.key);

  /* =====================================================================
     Small helpers
     ===================================================================== */
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const R = (v) => Math.round(v * 10) / 10;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const seq = (a, b) => {
    const o = [];
    for (let i = a; i <= b; i++) o.push(i);
    return o;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const attrs = (o) =>
    Object.keys(o)
      .filter((k) => o[k] != null && o[k] !== false)
      .map((k) => ` ${k}="${esc(o[k])}"`)
      .join("");
  const tag = (n, o, inner) => (inner == null ? `<${n}${attrs(o)}/>` : `<${n}${attrs(o)}>${inner}</${n}>`);
  const keyToIdx = (key) => {
    const [y, m] = key.split("-").map(Number);
    return (y - FIRST_YEAR) * 12 + m - 1;
  };
  const stampOf = (i) => "M" + String(i + 1).padStart(3, "0");
  const labelOf = (i) => `${MONTHS[((i % 12) + 12) % 12]} ${FIRST_YEAR + Math.floor(i / 12)}`;
  const textW = (s, px = 13) => String(s).length * px * 0.52;
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const words = (n) => ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] || String(n);

  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem("mobile-data-log:" + k);
        return v == null ? d : v;
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem("mobile-data-log:" + k, v);
      } catch (e) {
        /* storage unavailable */
      }
    },
  };

  /* Numbers: GB with one decimal, MB (no decimal) below 1 GB, thousands comma, never TB. */
  function fmtParts(gb) {
    if (gb == null || isNaN(gb)) return { num: "—", unit: "" };
    if (gb < 1 && Math.round(gb * MB_PER_GB) < MB_PER_GB) return { num: String(Math.round(gb * MB_PER_GB)), unit: "MB" };
    return { num: gb.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }), unit: "GB" };
  }
  const fmt = (gb) => {
    const p = fmtParts(gb);
    return p.unit ? `${p.num} ${p.unit}` : p.num;
  };
  const numHTML = (gb, cls = "") => {
    const p = fmtParts(gb);
    return `<span class="num ${cls}">${p.num}</span>${p.unit ? `<span class="unit">${p.unit}</span>` : ""}`;
  };
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  const carrierName = (c) => `<span class="car-name c-${esc(c)}">${esc(CARRIERS[c] || c)}</span>`;
  const swatch = (c, hs, sm) => `<span class="swatch${sm ? " sm" : ""} ${hs ? "hatch" : "solid"} c-${esc(c)}${isGhost(c) ? " ghost" : ""}" aria-hidden="true"></span>`;

  /* DeviceGlyph — reference implementation from the style guide, plus optional x/y for nesting in a chart. */
  function glyph(o) {
    const s = o.size || 24,
      k = o.kind,
      hs = !!o.hotspot;
    const ink = o.state === "retired" ? "var(--ink-faint)" : "var(--ink)";
    const W = k === "phone" ? 16 : 30,
      H = k === "phone" ? 24 : 22,
      pr = hs ? 7 : 0,
      pt = hs ? 5 : 0,
      vw = W + pr,
      vh = H + pt,
      f = s / 24;
    const b = k === "phone" ? '<rect x="1" y="' + (pt + 1) + '" width="14" height="22" rx="4" style="fill:none;stroke:' + ink + '" stroke-width="1.5"/>' + '<line x1="6" x2="10" y1="' + (pt + 3.5) + '" y2="' + (pt + 3.5) + '" style="stroke:' + ink + '" stroke-width="1.5" stroke-linecap="round"/>' : '<rect x="1" y="' + (pt + 1) + '" width="28" height="20" rx="3" style="fill:none;stroke:' + ink + '" stroke-width="1.5"/>' + '<circle cx="4" cy="' + (pt + 11) + '" r="1" style="fill:' + ink + '"/>';
    const cx = k === "phone" ? 8 : 16,
      cy = pt + 1 + (k === "phone" ? 11 : 10);
    const num = !hs && s >= 20 && o.n != null ? '<text x="' + cx + '" y="' + (cy + 3.6) + '" text-anchor="middle" style="fill:' + ink + ';font-family:var(--font-mono);font-size:10px;font-weight:500">' + o.n + "</text>" : "";
    const arcs = hs ? '<path d="M' + (W - 2) + " " + (pt - 1) + "A4 4 0 0 1 " + (W + 2) + " " + (pt + 3) + "M" + (W - 2) + " " + (pt - 4) + "A7 7 0 0 1 " + (W + 5) + " " + (pt + 3) + '" style="fill:none;stroke:' + ink + '" stroke-width="1.5" stroke-linecap="round"/>' : "";
    const code = (k === "phone" ? "P" : "T") + (hs ? "-hotspot" : o.n == null ? "" : o.n);
    const pos = o.x != null ? ' x="' + R(o.x) + '" y="' + R(o.y) + '"' : "";
    return '<svg class="glyph" role="img" aria-label="' + code + '"' + pos + ' width="' + R(vw * f) + '" height="' + R(vh * f) + '" viewBox="0 0 ' + vw + " " + vh + '">' + b + num + arcs + "</svg>";
  }
  const glyphSize = (kind, hs, s) => {
    const f = s / 24;
    return { w: ((kind === "phone" ? 16 : 30) + (hs ? 7 : 0)) * f, h: ((kind === "phone" ? 24 : 22) + (hs ? 5 : 0)) * f };
  };
  const classGlyph = (key, size = 16) => glyph({ kind: CLASS[key].kind, hotspot: CLASS[key].hotspot, size });
  const seriesGlyph = (s, size) => glyph({ kind: s.kind, n: s.n, hotspot: s.hotspot, size, state: s.active ? "active" : "retired" });

  /* Device mark at 40px+: glyph, or the device image when the reader picked Images. */
  function deviceMark(s) {
    if (state.devices === "images" && s.img && !s.hotspot) {
      return `<span class="dev-frame${s.active ? "" : " retired"}"><img src="${IMAGE_DIR + s.img}" alt="${esc(s.model)}" loading="lazy"></span>`;
    }
    return `<span class="mark-slot">${seriesGlyph(s, 40)}</span>`;
  }
  function deviceId(s, opts = {}) {
    const net = s.net ? `<span class="net" title="${esc(NET_LABEL[s.net] || s.net)}">${esc(s.net)}</span>` : "";
    return `<div class="dev-id">${deviceMark(s)}<div class="txt"><span class="code${s.active ? "" : " retired-code"}">${esc(s.code)}${net}</span><span class="model">${esc(s.model)}</span>${opts.sub ? `<span class="sub tick muted">${opts.sub}</span>` : ""}</div></div>`;
  }

  /* =====================================================================
     State
     ===================================================================== */
  const pickStored = (k, ok, d) => {
    const v = store.get(k, d);
    return ok.includes(v) ? v : d;
  };
  const state = {
    carrier: pickStored("carrier", ["sprint", "both", "verizon"], "both"),
    devices: pickStored("devices", ["glyphs", "images"], "glyphs"),
    view: "timeline",
    display: "chart",
    projection: false,
    series: { phone: true, phoneHs: false, tablet: true, tabletHs: false },
    range: { mode: "full", from: null, to: null },
    exclude: { covid: false, bug: true },
    notes: { periods: true, mine: true },
    years: [],
  };
  let DATA = null;

  /* =====================================================================
     Data: parse the two CSV logs into one month model
     ===================================================================== */
  function parseRows(text) {
    return text
      .replace(/^﻿/, "")
      .split(/\r?\n/)
      .filter((l) => l.trim() !== "")
      .map((l) => l.split(",").map((c) => c.trim().replace(/^﻿/, "")));
  }
  function parseHeader(h) {
    const m = /^(\d{4})-([A-Za-z]{3})/.exec(h || "");
    if (!m) return -1;
    const mo = MONTHS.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
    return mo < 0 ? -1 : (+m[1] - FIRST_YEAR) * 12 + mo;
  }

  function build(usageText, statusText) {
    const issues = [];
    const U = parseRows(usageText),
      St = parseRows(statusText);
    const uCols = U[0].map(parseHeader),
      sCols = St[0].map(parseHeader);
    const carrierAt = [];
    uCols.forEach((i, c) => {
      if (i >= 0) carrierAt[i] = (U[1][c] || "").toLowerCase();
    });
    const statusRows = {};
    St.slice(2).forEach((r) => {
      if (r[0]) statusRows[r[0]] = r;
    });

    const readNum = (raw, where) => {
      if (raw == null || raw === "") return null;
      if (/^-?\d*\.?\d+$/.test(raw)) return parseFloat(raw);
      const fixed = raw.replace(/\.{2,}/g, ".");
      if (/^-?\d*\.?\d+$/.test(fixed)) {
        issues.push(`${where}: the cell reads “${raw}”; it is shown as ${parseFloat(fixed)}.`);
        return parseFloat(fixed);
      }
      issues.push(`${where}: could not read “${raw}”; treated as a gap.`);
      return null;
    };

    const raw = U.slice(2)
      .filter((r) => r[0])
      .map((r) => {
        const id = r[0],
          vals = [],
          st = [];
        uCols.forEach((i, c) => {
          if (i >= 0) vals[i] = readNum(r[c], `${id} · ${stampOf(i)} ${labelOf(i)}`);
        });
        const sr = statusRows[id];
        if (sr)
          sCols.forEach((i, c) => {
            if (i >= 0 && sr[c] !== "" && sr[c] != null) st[i] = Math.round(parseFloat(sr[c]));
          });
        else issues.push(`${id} has no row in the ownership file, so its service dates come from the usage file.`);
        return { id, gbName: r[1] || "", stName: sr ? sr[1] : "", vals, st };
      });

    // The log ends at the last month with real (non-zero) use, never later than the current month.
    const now = new Date();
    const nowIdx = (now.getFullYear() - FIRST_YEAR) * 12 + now.getMonth();
    let last = -1;
    raw.forEach((s) =>
      s.vals.forEach((v, i) => {
        if (v > 0 && i <= nowIdx && i > last) last = i;
      }),
    );
    const N = last + 1;

    const months = seq(0, N - 1).map((i) => ({
      i,
      y: FIRST_YEAR + Math.floor(i / 12),
      m: i % 12,
      stamp: stampOf(i),
      label: labelOf(i),
      carrier: carrierAt[i] || "unknown",
      periods: PERIODS.filter((p) => i >= keyToIdx(p.from) && i <= keyToIdx(p.to)).map((p) => p.id),
    }));

    const series = raw
      .map((s) => {
        const hotspot = /hotspot/i.test(s.id);
        const kind = /^T/i.test(s.id) ? "tablet" : "phone";
        const n = hotspot ? null : parseInt(s.id.replace(/\D/g, ""), 10);
        const meta = DEVICE_META[s.id] || {};
        const values = months.map((_, i) => (s.vals[i] == null ? null : s.vals[i]));
        const hasStatus = s.st.length > 0;
        const status = months.map((_, i) => (s.st[i] == null ? 0 : s.st[i]));
        // Device: 0 = not owned, 1 = owned with hotspot on, 2 = owned with hotspot off.
        // Hotspot row: 1 = on, 2 = available but off, 0 = no device to tether from.
        const live = (i) => (hasStatus ? (hotspot ? status[i] === 1 : status[i] > 0) : values[i] != null);
        let first = -1,
          lastI = -1;
        months.forEach((_, i) => {
          if (live(i) || (!hotspot && values[i] != null)) {
            if (first < 0) first = i;
            lastI = i;
          }
        });
        if (hotspot)
          months.forEach((_, i) => {
            if (values[i] != null) {
              if (first < 0 || i < first) first = i;
              if (i > lastI) lastI = i;
            }
          });
        const active = hotspot ? status[N - 1] === 1 : lastI === N - 1;
        return {
          id: s.id,
          code: s.id,
          kind,
          hotspot,
          n,
          values,
          status,
          live,
          first,
          last: lastI,
          active,
          model: meta.model || (s.stName || s.gbName).replace(/-/g, " "),
          net: meta.net || null,
          img: meta.img || null,
        };
      })
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "phone" ? -1 : 1) || a.hotspot - b.hotspot || (a.n || 0) - (b.n || 0));

    const cls = {},
      service = {},
      members = {};
    CLASSES.forEach((c) => {
      const mem = series.filter((s) => s.kind === c.kind && s.hotspot === c.hotspot);
      members[c.key] = mem;
      cls[c.key] = months.map((_, i) => {
        let sum = null;
        mem.forEach((s) => {
          if (s.values[i] != null) sum = (sum || 0) + s.values[i];
        });
        return sum == null ? null : Math.round(sum * 1e4) / 1e4;
      });
      service[c.key] = months.map((_, i) => mem.some((s) => s.live(i)));
    });

    const carriers = [];
    months.forEach((m) => {
      if (!carriers.includes(m.carrier)) carriers.push(m.carrier);
    });
    const years = [...new Set(months.map((m) => m.y))];
    return { months, series, cls, service, members, issues, N, carriers, years };
  }

  // The CSVs stay on this computer; the published page always uses the built-in copy.
  const isLocal = () => location.protocol === "file:" || ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

  async function load() {
    if (!isLocal()) return { usage: EMBEDDED.usage, status: EMBEDDED.status };
    try {
      const [u, s] = await Promise.all(
        [FILES.usage, FILES.status].map((f) =>
          fetch(f, { cache: "no-cache" }).then((r) => {
            if (!r.ok) throw new Error(f);
            return r.text();
          }),
        ),
      );
      return { usage: u, status: s };
    } catch (e) {
      return { usage: EMBEDDED.usage, status: EMBEDDED.status };
    }
  }

  /* =====================================================================
     Scope: which months every summary covers
     ===================================================================== */
  const inPeriod = (i, id) => DATA.months[i].periods.includes(id);
  const isExcluded = (i) => i < DATA.N && DATA.months[i].periods.some((p) => state.exclude[p]);
  const carrierOk = (i) => state.carrier === "both" || DATA.months[i].carrier === state.carrier;
  const isGhost = (c) => state.carrier !== "both" && c !== state.carrier;
  const visKeys = () => ALL_KEYS.filter((k) => state.series[k]);

  function rangeBounds() {
    if (state.range.mode === "full") return [0, DATA.N - 1];
    const a = clamp((state.range.from - FIRST_YEAR) * 12, 0, DATA.N - 1);
    const b = clamp((state.range.to - FIRST_YEAR) * 12 + 11, 0, DATA.N - 1);
    return [Math.min(a, b), Math.max(a, b)];
  }
  const rangeIdx = () => seq(...rangeBounds());
  const scopeAll = () => rangeIdx().filter((i) => !isExcluded(i)); // carrier-agnostic, for ghosting
  const scope = () => scopeAll().filter(carrierOk);

  function monthTotal(i, keys = ALL_KEYS) {
    let s = null;
    keys.forEach((k) => {
      const v = DATA.cls[k][i];
      if (v != null) s = (s || 0) + v;
    });
    return s;
  }
  function agg(idxs, fn) {
    const r = { total: 0, months: 0, by: {} };
    idxs.forEach((i) => {
      const v = fn(i);
      if (v == null) return;
      const c = DATA.months[i].carrier;
      r.total += v;
      r.months++;
      r.by[c] = r.by[c] || { total: 0, months: 0 };
      r.by[c].total += v;
      r.by[c].months++;
    });
    return r;
  }
  const pick = (a) => (state.carrier === "both" ? a : a.by[state.carrier] || { total: 0, months: 0 });
  const mean = (a) => (a.months ? a.total / a.months : null);
  const parts = (a, denom, hs) => DATA.carriers.map((c) => ({ carrier: c, gb: a.by[c] && denom ? a.by[c].total / denom : 0, hs }));

  function barHTML(ps, max, vertical) {
    const segs = ps
      .filter((p) => p.gb > 0)
      .map((p) => {
        const size = max ? ((p.gb / max) * 100).toFixed(3) + "%" : "0";
        return `<span class="bar-seg ${p.hs ? "hatch" : "solid"} c-${p.carrier}${isGhost(p.carrier) ? " ghost" : ""}" style="${vertical ? "height" : "width"}:${size}"></span>`;
      })
      .join("");
    return vertical ? segs : `<span class="bar" aria-hidden="true">${segs}</span>`;
  }

  /* =====================================================================
     Header + status line + tiles
     ===================================================================== */
  function scopeLabel() {
    const idx = scope();
    const who = state.carrier === "both" ? "Both carriers" : `${carrierName(state.carrier)} only`;
    const tot = idx.reduce((a, i) => a + (monthTotal(i) || 0), 0);
    const span = idx.length ? `${DATA.months[idx[0]].stamp}–${DATA.months[idx[idx.length - 1]].stamp}` : "no months";
    const ex = PERIODS.filter((p) => state.exclude[p.id]).map((p) => `${p.short} excluded`);
    return [who, `${fmt(tot)}`, plural(idx.length, "month"), span, ...ex].join(" · ");
  }

  function renderStatus() {
    $("#status-line").innerHTML = scopeLabel();
  }

  function renderTiles() {
    const idx = scope();
    const total = agg(idx, (i) => monthTotal(i));
    const hs = agg(idx, (i) => monthTotal(i, ["phoneHs", "tabletHs"]));
    let best = null;
    idx.forEach((i) => {
      const v = monthTotal(i);
      if (v != null && (!best || v > best.v)) best = { i, v };
    });
    const span = idx.length ? `${DATA.months[idx[0]].stamp}–${DATA.months[idx[idx.length - 1]].stamp}` : "—";
    const carSw = state.carrier === "both" ? "" : swatch(state.carrier, false, true) + " ";
    const tile = (label, gb, src) => `<article class="tile span-3"><p class="label">${label}</p><p class="tile-fig">${numHTML(gb, "figure")}</p><p class="tick tile-src">${src}</p></article>`;
    const bm = best ? DATA.months[best.i] : null;
    const bestNote = bm && bm.periods.length ? ` · ${PERIODS.find((p) => p.id === bm.periods[0]).short}` : "";
    $("#tiles").innerHTML = [tile("Total data", total.total, `${carSw}${span} · ${plural(total.months, "month")}`), tile("Average month", mean(total), `${carSw}all devices and hotspots`), tile("Busiest month", best ? best.v : null, bm ? `${swatch(bm.carrier, false, true)} ${bm.stamp} · ${bm.label}${bestNote}` : "—"), tile("Hotspot data", hs.total, `${swatch(state.carrier === "sprint" ? "sprint" : "verizon", true, true)} ${pct(hs.total, total.total)}% of all data · P-hotspot + T-hotspot`)].join("");
  }

  /* =====================================================================
     Primary window
     ===================================================================== */
  const TOP = { notes: 11, periodText: 33, bracket: 38, ribbon: 46, laneP: 56, laneT: 74, plot: 100 };
  let chart = null;

  function niceScale(max, target = 5) {
    if (!(max > 0)) max = 1;
    const raw = max / target,
      p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((s) => s * p).find((s) => s >= raw - 1e-9);
    const top = Math.ceil(max / step - 1e-9) * step;
    const ticks = [];
    for (let v = 0; v <= top + step / 1e6; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    return { top, step, ticks };
  }
  const tickText = (v) => (Number.isInteger(v) ? String(v) : String(v.toFixed(v < 1 ? 2 : 1)).replace(/0$/, ""));

  function runs(idxs, keyFn) {
    const out = [];
    idxs.forEach((i, k) => {
      const v = keyFn(i);
      const lastRun = out[out.length - 1];
      if (lastRun && lastRun.v === v && lastRun.k1 === k - 1) lastRun.k1 = k;
      else out.push({ v, k0: k, k1: k });
    });
    return out;
  }
  function kRange(idxs, pred) {
    let a = -1,
      b = -1;
    idxs.forEach((i, k) => {
      if (pred(i)) {
        if (a < 0) a = k;
        b = k;
      }
    });
    return a < 0 ? null : [a, b];
  }

  /* Lines split by carrier; each carrier run starts at the previous point so the line stays joined. */
  function linePaths(pts, clsFor, markers) {
    let out = "",
      prev = null,
      cur = null,
      runLen = 0;
    const flush = () => {
      if (!cur) return;
      out += tag("path", { d: cur.d, class: clsFor(cur.car) });
      cur = null;
    };
    const dot = (p) => tag("circle", { cx: p.x, cy: p.y, r: 2.5, class: `sv-pt c-${p.car}${isGhost(p.car) ? " ghost" : ""}` });
    pts.forEach((p, k) => {
      if (!p) {
        if (prev && runLen === 1) out += dot(prev);
        flush();
        prev = null;
        runLen = 0;
        return;
      }
      if (!cur || cur.car !== p.car) {
        flush();
        cur = { car: p.car, d: prev ? `M${prev.x},${prev.y}L${p.x},${p.y}` : `M${p.x},${p.y}` };
      } else cur.d += `L${p.x},${p.y}`;
      prev = p;
      runLen++;
      if (k === pts.length - 1 && runLen === 1) out += dot(p);
    });
    flush();
    if (markers) {
      const step = markers.step;
      pts.forEach((p, k) => {
        if (!p || k % step) return;
        out += tag("rect", { x: R(p.x - 3), y: R(p.y - 2.25), width: 6, height: 4.5, rx: 1, class: `sv-marker c-${p.car}${isGhost(p.car) ? " ghost" : ""}` });
      });
    }
    return out;
  }

  /* Direct labels in the right margin, nudged apart so they never overlap. */
  function placeLabels(items, top, bottom, gap = 18) {
    items.sort((a, b) => a.y - b.y);
    items.forEach((it) => {
      it.ly = it.y;
    });
    for (let j = 1; j < items.length; j++) if (items[j].ly - items[j - 1].ly < gap) items[j].ly = items[j - 1].ly + gap;
    const over = items.length ? items[items.length - 1].ly - bottom : 0;
    if (over > 0)
      items.forEach((it) => {
        it.ly -= over;
      });
    for (let j = 0; j < items.length; j++) if (items[j].ly < top + j * gap) items[j].ly = top + j * gap;
    return items;
  }

  function classLabel(key, x, ly, px, py) {
    const c = CLASS[key],
      g = glyphSize(c.kind, c.hotspot, 16);
    let s = "";
    if (px != null && (Math.abs(ly - py) > 3 || x - px > 14)) s += tag("path", { d: `M${R(px + 4)},${R(py)}L${R(x - 4)},${R(ly)}`, class: "sv-leader" });
    s += glyph({ kind: c.kind, hotspot: c.hotspot, size: 16, x, y: ly - g.h / 2 - 1 });
    s += tag("text", { x: R(x + g.w + 5), y: R(ly + 4), class: "sv-label" }, esc(c.label));
    return s;
  }

  const DEFS = `<defs>
    <pattern id="sl-hatch-sprint" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" class="sv-pattern-sprint"/></pattern>
    <pattern id="sl-hatch-verizon" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" class="sv-pattern-verizon"/></pattern>
  </defs>`;

  /* Shared frame for the time-based views: grid, years, carrier ribbon, device lanes, periods, switch. */
  function timeFrame(W, H, idxs) {
    const m = { l: 56, r: 132, t: TOP.plot, b: 46 };
    const pw = W - m.l - m.r,
      ph = H - m.t - m.b,
      n = idxs.length,
      bw = pw / n;
    return { W, H, m, pw, ph, n, bw, plotB: m.t + ph, x: (k) => m.l + (k + 0.5) * bw, xl: (k) => m.l + k * bw };
  }

  function timeChrome(F, S, y, idxs, M = DATA.months) {
    const x0 = F.m.l,
      x1 = F.m.l + F.pw;
    let back = "",
      front = "";

    // Period bands and brackets
    PERIODS.forEach((p) => {
      const ks = kRange(idxs, (i) => M[i].periods.includes(p.id));
      if (!ks) return;
      const excl = state.exclude[p.id];
      if (!state.notes.periods && !excl) return;
      const a = F.xl(ks[0]),
        b = F.xl(ks[1] + 1);
      back += tag("rect", { x: R(a), y: F.m.t, width: R(b - a), height: F.ph, class: excl ? "sv-band excluded" : "sv-band" });
      front += tag("path", { d: `M${R(a)},${TOP.bracket + 4}V${TOP.bracket}H${R(b)}V${TOP.bracket + 4}`, class: "sv-bracket" });
      const full = p.label + (excl ? " · excluded" : ""),
        short = p.short + (excl ? " · excluded" : "");
      const txt = textW(full) <= b - a + 40 ? full : short;
      const anchorEnd = a + textW(txt) > x1 + F.m.r - 8;
      front += tag("text", { x: R(anchorEnd ? b : a), y: TOP.periodText, class: "sv-ann", "text-anchor": anchorEnd ? "end" : null }, esc(txt));
    });

    // Grid and y ticks
    S.ticks.forEach((v, j) => {
      const yy = R(y(v));
      if (v > 0) back += tag("line", { x1: x0, x2: x1, y1: yy, y2: yy, class: "sv-grid" });
      back += tag("text", { x: x0 - 8, y: yy + 4, class: "sv-tick", "text-anchor": "end" }, tickText(v) + (j === S.ticks.length - 1 ? " GB" : ""));
    });

    // Year rules and labels, month ticks when zoomed in
    idxs.forEach((i, k) => {
      if (k > 0 && M[i].m === 0) {
        const xx = R(F.xl(k));
        back += tag("line", { x1: xx, x2: xx, y1: TOP.ribbon, y2: F.plotB, class: "sv-year" });
      }
    });
    const showMonths = F.bw >= 14;
    if (showMonths)
      idxs.forEach((i, k) => {
        back += tag("text", { x: R(F.x(k)), y: F.plotB + 16, class: "sv-tick", "text-anchor": "middle" }, F.bw >= 28 ? MONTHS[M[i].m] : MONTHS[M[i].m][0]);
      });
    runs(idxs, (i) => M[i].y).forEach((r) => {
      const a = F.xl(r.k0),
        b = F.xl(r.k1 + 1);
      if (b - a < 28) return;
      back += tag("text", { x: R((a + b) / 2), y: F.plotB + (showMonths ? 34 : 20), class: "sv-tick strong", "text-anchor": "middle" }, r.v);
    });

    // Carrier ribbon
    runs(idxs, (i) => M[i].carrier).forEach((r) => {
      const a = F.xl(r.k0),
        b = F.xl(r.k1 + 1);
      front += tag("rect", { x: R(a), y: TOP.ribbon, width: R(b - a), height: 5, class: `sv-fill c-${r.v}${isGhost(r.v) ? " ghost" : ""}` });
    });

    // Device lanes: one per class, one outlined span per device, code inside
    [
      ["phone", TOP.laneP],
      ["tablet", TOP.laneT],
    ].forEach(([kind, ly]) => {
      const g = glyphSize(kind, false, 16);
      front += glyph({ kind, size: 16, x: x0 - 8 - g.w, y: ly + 7 - g.h / 2 });
      DATA.series
        .filter((s) => s.kind === kind && !s.hotspot)
        .forEach((s) => {
          const ks = kRange(idxs, (i) => s.live(i) || s.values[i] != null);
          if (!ks) return;
          const a = F.xl(ks[0]) + 1,
            w = F.xl(ks[1] + 1) - 1 - a;
          front += tag("rect", { x: R(a), y: ly, width: R(Math.max(w, 1)), height: 14, rx: kind === "phone" ? 4 : 2, class: `sv-lane${s.active ? "" : " retired"}` });
          const t = w >= 24 ? s.code : w >= 12 ? String(s.n) : "";
          if (t) front += tag("text", { x: R(a + w / 2), y: ly + 10.5, "text-anchor": "middle", class: `sv-lane-text${s.active ? "" : " retired"}` }, esc(t));
        });
    });

    // Carrier switch: dashed rule + note naming the month stamp (always visible)
    idxs.forEach((i, k) => {
      if (k === 0 || M[i].carrier === M[idxs[k - 1]].carrier) return;
      const xx = R(F.xl(k));
      front += tag("line", { x1: xx, x2: xx, y1: TOP.ribbon - 3, y2: F.plotB, class: "sv-switch" });
      const txt = `Switched to ${CARRIERS[M[i].carrier] || M[i].carrier} · ${M[i].stamp} · ${M[i].label}`;
      const end = xx + 6 + textW(txt) > x1;
      front += tag("text", { x: end ? xx - 6 : xx + 6, y: F.m.t + 16, class: "sv-ann halo", "text-anchor": end ? "end" : null }, esc(txt));
    });

    back += tag("line", { x1: x0, x2: x1, y1: F.plotB, y2: F.plotB, class: "sv-axis" });
    return { back, front };
  }

  function noteMarks(F, idxs, xAtIdx) {
    if (!state.notes.mine) return "";
    const a = idxs[0],
      b = idxs[idxs.length - 1];
    let out = "",
      lastX = -Infinity;
    NOTES.map((n, j) => ({ j, i: keyToIdx(n.month) }))
      .filter((o) => o.i >= a && o.i <= b)
      .sort((p, q) => p.i - q.i)
      .forEach((o) => {
        const tx = xAtIdx(o.i),
          cx = Math.max(tx, lastX + 19);
        lastX = cx;
        const n = NOTES[o.j];
        out += tag("line", { x1: R(tx), x2: R(tx), y1: F.m.t, y2: F.plotB, class: "sv-note-guide" });
        out += `<g class="sv-note" data-note="${o.j}" tabindex="0" role="button" aria-label="Note ${o.j + 1}, ${esc(labelOf(o.i))}: ${esc(n.title)}">` + tag("path", { d: `M${R(cx)},${TOP.notes + 8}L${R(tx)},${TOP.ribbon - 3}`, class: "sv-note-lead" }) + tag("circle", { cx: R(cx), cy: TOP.notes, r: 8 }) + tag("text", { x: R(cx), y: TOP.notes + 3.5, "text-anchor": "middle" }, o.j + 1) + "</g>";
      });
    return out;
  }

  function missingDots(F, idxs, keys) {
    let out = "";
    idxs.forEach((i, k) => {
      if (isExcluded(i)) return;
      if (keys.every((key) => DATA.cls[key][i] == null) && keys.some((key) => DATA.service[key][i])) {
        out += tag("circle", { cx: R(F.x(k)), cy: F.plotB, r: 2, class: "sv-missing" });
      }
    });
    return out;
  }

  function drawTimeline(W, H) {
    const idxs = rangeIdx(),
      F = timeFrame(W, H, idxs),
      keys = visKeys();
    const val = (key, i) => (isExcluded(i) ? null : DATA.cls[key][i]);
    let max = 0;
    keys.forEach((key) =>
      idxs.forEach((i) => {
        const v = val(key, i);
        if (v > max) max = v;
      }),
    );
    const S = niceScale(max),
      y = (v) => F.m.t + F.ph - (v / S.top) * F.ph;
    const ch = timeChrome(F, S, y, idxs);
    let lines = "",
      labels = [];
    const mStep = Math.max(1, Math.ceil(9 / F.bw));
    keys.forEach((key) => {
      const c = CLASS[key];
      const pts = idxs.map((i, k) => {
        const v = val(key, i);
        return v == null ? null : { x: R(F.x(k)), y: R(y(v)), car: DATA.months[i].carrier };
      });
      lines += linePaths(pts, (car) => `sv-line c-${car}${c.hotspot ? " hs" : ""}${isGhost(car) ? " ghost" : ""}`, c.kind === "tablet" ? { step: mStep } : null);
      for (let k = pts.length - 1; k >= 0; k--)
        if (pts[k]) {
          labels.push({ key, y: pts[k].y, px: pts[k].x, py: pts[k].y });
          break;
        }
    });
    const lx = F.m.l + F.pw + 12;
    const lab = placeLabels(labels, F.m.t, F.plotB)
      .map((l) => classLabel(l.key, lx, l.ly, l.px, l.py))
      .join("");
    const svg = ch.back + missingDots(F, idxs, keys) + lines + ch.front + lab + noteMarks(F, idxs, (i) => F.x(i - idxs[0]));

    chart = {
      n: idxs.length,
      inPlot: (px, py) => px >= F.m.l && px <= F.m.l + F.pw && py >= TOP.ribbon - 4 && py <= F.plotB + 40,
      kAt: (px) => clamp(Math.floor((px - F.m.l) / F.bw), 0, idxs.length - 1),
      xAt: (k) => F.x(k),
      hover: (k) => {
        const i = idxs[k];
        let s = tag("line", { x1: R(F.x(k)), x2: R(F.x(k)), y1: TOP.ribbon, y2: F.plotB, class: "sv-cross" });
        keys.forEach((key) => {
          const v = val(key, i);
          if (v != null) s += tag("circle", { cx: R(F.x(k)), cy: R(y(v)), r: 4, class: `sv-dot c-${DATA.months[i].carrier}${isGhost(DATA.months[i].carrier) ? " ghost" : ""}` });
        });
        return s;
      },
      tip: (k) => monthTip(idxs[k], keys),
    };
    return svg;
  }

  /* ----- Projection: a straight-line trend over the last 12 logged months, extended 6 months ----- */
  const PROJ = { fit: 12, ahead: 6, keys: ["phone", "tablet"] };
  // Student's t for an 80% two-sided prediction range, by degrees of freedom (n − 2).
  const T80 = [null, 3.078, 1.886, 1.638, 1.533, 1.476, 1.44, 1.415, 1.397, 1.383, 1.372];

  const futureMonth = (i) => ({ i, y: FIRST_YEAR + Math.floor(i / 12), m: i % 12, stamp: stampOf(i), label: labelOf(i), carrier: DATA.months[DATA.N - 1].carrier, periods: [], projected: true });

  function projectionModel() {
    // The last 12 months not removed by an Anomalies switch.
    const base = [];
    for (let i = DATA.N - 1; i >= 0 && base.length < PROJ.fit; i--) if (!isExcluded(i)) base.unshift(i);
    const future = seq(DATA.N, DATA.N + PROJ.ahead - 1);
    const fits = {};
    PROJ.keys.forEach((key) => {
      const pts = base.filter((i) => DATA.cls[key][i] != null).map((i) => [i, DATA.cls[key][i]]);
      const n = pts.length;
      if (n < 3) return;
      const mx = pts.reduce((a, p) => a + p[0], 0) / n,
        my = pts.reduce((a, p) => a + p[1], 0) / n;
      const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0),
        sxy = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
      const slope = sxx ? sxy / sxx : 0,
        icpt = my - slope * mx;
      const s = Math.sqrt(pts.reduce((a, p) => a + (p[1] - (icpt + slope * p[0])) ** 2, 0) / (n - 2));
      const t = T80[n - 2] || 1.3;
      const at = (i) => {
        const yhat = icpt + slope * i,
          half = t * s * Math.sqrt(1 + 1 / n + (sxx ? (i - mx) ** 2 / sxx : 0));
        return { v: Math.max(0, yhat), lo: Math.max(0, yhat - half), hi: Math.max(0, yhat + half), line: yhat };
      };
      fits[key] = { slope, n, at, from: pts[0][0], to: pts[n - 1][0] };
    });
    return { base, future, fits };
  }

  const projKeys = () => PROJ.keys.filter((k) => state.series[k]);

  function drawProjection(W, H) {
    const P = projectionModel(),
      keys = projKeys().filter((k) => P.fits[k]);
    const last = DATA.N - 1,
      car = DATA.months[last].carrier;
    const idxs = seq(P.base[0], last + PROJ.ahead),
      M = DATA.months.concat(P.future.map(futureMonth));
    const F = timeFrame(W, H, idxs),
      kOf = (i) => i - idxs[0];
    const val = (key, i) => (i > last || isExcluded(i) ? null : DATA.cls[key][i]);
    let max = 0;
    keys.forEach((key) => {
      idxs.forEach((i) => {
        const v = val(key, i);
        if (v > max) max = v;
      });
      P.future.forEach((i) => {
        max = Math.max(max, P.fits[key].at(i).hi);
      });
    });
    const S = niceScale(max),
      y = (v) => F.m.t + F.ph - (v / S.top) * F.ph;
    const ch = timeChrome(F, S, y, idxs, M);
    const ghost = isGhost(car) ? " ghost" : "";

    // Projected zone, its boundary, and the fitted window
    const zx = F.xl(kOf(DATA.N)),
      zr = F.m.l + F.pw;
    let zone = tag("rect", { x: R(zx), y: F.m.t, width: R(zr - zx), height: F.ph, class: "sv-band proj" });
    let front = tag("line", { x1: R(zx), x2: R(zx), y1: TOP.ribbon - 3, y2: F.plotB, class: "sv-switch" });
    front += tag("path", { d: `M${R(zx)},${TOP.bracket + 4}V${TOP.bracket}H${R(zr)}V${TOP.bracket + 4}`, class: "sv-bracket" });
    front += tag("text", { x: R(zr), y: TOP.periodText, class: "sv-ann", "text-anchor": "end" }, "Projected · 80% range");
    const fa = F.xl(kOf(P.base[0])),
      fb = F.xl(kOf(P.base[P.base.length - 1]) + 1);
    front += tag("path", { d: `M${R(fa)},${TOP.bracket + 4}V${TOP.bracket}H${R(fb)}V${TOP.bracket + 4}`, class: "sv-bracket" });
    front += tag("text", { x: R(fa), y: TOP.periodText, class: "sv-ann" }, `Trend fitted to ${plural(P.base.length, "month")}`);

    let bands = "",
      lines = "",
      labels = [];
    const mStep = Math.max(1, Math.ceil(9 / F.bw));
    keys.forEach((key) => {
      const c = CLASS[key],
        fit = P.fits[key];
      // Actual months
      const pts = idxs.map((i, k) => {
        const v = val(key, i);
        return v == null ? null : { x: R(F.x(k)), y: R(y(v)), car: DATA.months[i].carrier };
      });
      lines += linePaths(pts, (cr) => `sv-line c-${cr}${isGhost(cr) ? " ghost" : ""}`, c.kind === "tablet" ? { step: mStep } : null);
      // Fitted trend across the window it was fitted to
      const t0 = fit.at(fit.from).line,
        t1 = fit.at(fit.to).line;
      lines += tag("line", { x1: R(F.x(kOf(fit.from))), y1: R(y(Math.max(0, t0))), x2: R(F.x(kOf(fit.to))), y2: R(y(Math.max(0, t1))), class: `sv-trend c-${car}${ghost}` });
      // Projected band, line and hollow points, anchored on the last actual month
      let ak = -1;
      for (let k = kOf(last); k >= 0; k--)
        if (pts[k]) {
          ak = k;
          break;
        }
      const anchor = ak >= 0 ? { x: F.x(ak), v: val(key, idxs[ak]) } : null;
      const fut = P.future.map((i) => ({ x: F.x(kOf(i)), ...fit.at(i) }));
      const top = (anchor ? [`${R(anchor.x)},${R(y(anchor.v))}`] : []).concat(fut.map((p) => `${R(p.x)},${R(y(p.hi))}`));
      const bot = fut
        .slice()
        .reverse()
        .map((p) => `${R(p.x)},${R(y(p.lo))}`);
      bands += tag("polygon", { points: top.concat(bot).join(" "), class: `sv-proj-band c-${car}${ghost}` });
      const d = (anchor ? `M${R(anchor.x)},${R(y(anchor.v))}L` : "M") + fut.map((p) => `${R(p.x)},${R(y(p.v))}`).join("L");
      lines += tag("path", { d, class: `sv-line proj c-${car}${ghost}` });
      fut.forEach((p) => {
        lines += c.kind === "tablet" ? tag("rect", { x: R(p.x - 3), y: R(y(p.v) - 2.25), width: 6, height: 4.5, rx: 1, class: `sv-proj-pt c-${car}${ghost}` }) : tag("circle", { cx: R(p.x), cy: R(y(p.v)), r: 3, class: `sv-proj-pt c-${car}${ghost}` });
      });
      const lp = fut[fut.length - 1];
      labels.push({ key, y: R(y(lp.v)), px: lp.x, py: R(y(lp.v)) });
    });
    const lx = F.m.l + F.pw + 12;
    const lab = placeLabels(labels, F.m.t, F.plotB)
      .map((l) => classLabel(l.key, lx, l.ly, l.px, l.py))
      .join("");
    const svg =
      ch.back +
      zone +
      bands +
      missingDots(
        F,
        idxs.filter((i) => i <= last),
        keys,
      ) +
      lines +
      ch.front +
      front +
      lab +
      noteMarks(
        F,
        idxs.filter((i) => i <= last),
        (i) => F.x(kOf(i)),
      );

    chart = {
      n: idxs.length,
      inPlot: (px, py) => px >= F.m.l && px <= F.m.l + F.pw && py >= TOP.ribbon - 4 && py <= F.plotB + 40,
      kAt: (px) => clamp(Math.floor((px - F.m.l) / F.bw), 0, idxs.length - 1),
      xAt: (k) => F.x(k),
      hover: (k) => {
        const i = idxs[k];
        let s = tag("line", { x1: R(F.x(k)), x2: R(F.x(k)), y1: TOP.ribbon, y2: F.plotB, class: "sv-cross" });
        keys.forEach((key) => {
          const v = i > last ? P.fits[key].at(i).v : val(key, i);
          const cr = i > last ? car : DATA.months[i].carrier;
          if (v != null) s += tag("circle", { cx: R(F.x(k)), cy: R(y(v)), r: 4, class: `sv-dot c-${cr}${isGhost(cr) ? " ghost" : ""}` });
        });
        return s;
      },
      tip: (k) => (idxs[k] > last ? projTip(idxs[k], keys, P) : monthTip(idxs[k], keys)),
    };
    return svg;
  }

  function projTip(i, keys, P) {
    const mo = futureMonth(i);
    let h = `<div class="tt-head"><span class="tick">${mo.stamp} · ${mo.label}</span><span class="label">Projected</span></div><table class="tt-rows">`;
    let tot = 0;
    keys.forEach((key) => {
      const p = P.fits[key].at(i),
        mem = DATA.members[key],
        s = mem.find((d) => d.active) || mem[mem.length - 1];
      h += `<tr><td>${seriesGlyph(s, 16)}</td><td><span class="code">${esc(s.code)}</span> ${esc(s.model)}<span class="tt-tag body-small"><br>80% range ${fmt(p.lo)} – ${fmt(p.hi)}</span></td><td class="tick">${fmt(p.v)}</td></tr>`;
      tot += p.v;
    });
    h += `</table><div class="tt-total"><span class="label">Projected total</span><span class="tick">${fmt(tot)}</span></div>`;
    return h;
  }

  function projNote() {
    const P = projectionModel();
    const span = `${stampOf(P.base[0])}–${stampOf(P.base[P.base.length - 1])}`;
    const trends = projKeys()
      .filter((k) => P.fits[k])
      .map((k) => {
        const b = P.fits[k].slope;
        return `${CLASS[k].label} ${b >= 0 ? "+" : "−"}${fmt(Math.abs(b))} a month`;
      });
    return `How this is projected: a straight-line trend is fitted to each class’s last ${plural(P.base.length, "logged month")} (${span}) and extended ${PROJ.ahead} months. The shaded band is the 80% prediction range. ${trends.length ? `Trend: ${trends.join("; ")}. ` : ""}Hotspots are not projected, and months removed by the Anomalies switches are skipped. A new device or plan can change use in ways a trend cannot see.`;
  }

  function drawStack(W, H) {
    const idxs = rangeIdx(),
      F = timeFrame(W, H, idxs),
      keys = visKeys();
    let max = 0;
    idxs.forEach((i) => {
      if (!isExcluded(i)) {
        const v = monthTotal(i, keys);
        if (v > max) max = v;
      }
    });
    const S = niceScale(max),
      y = (v) => F.m.t + F.ph - (v / S.top) * F.ph;
    const ch = timeChrome(F, S, y, idxs);
    const gx = Math.min(2, F.bw * 0.25),
      bwid = F.bw - gx;
    let bars = "",
      lastK = -1;
    idxs.forEach((i, k) => {
      if (isExcluded(i)) return;
      const car = DATA.months[i].carrier,
        ghost = isGhost(car);
      let base = 0,
        prevKind = null;
      keys.forEach((key) => {
        const v = DATA.cls[key][i];
        if (!v) return;
        const c = CLASS[key];
        const gap = prevKind == null ? 0 : prevKind !== c.kind ? 2 : 1;
        const yt = y(base + v),
          yb = y(base) - gap;
        base += v;
        prevKind = c.kind;
        lastK = k;
        if (yb - yt <= 0.3) return;
        const a = { x: R(F.xl(k) + gx / 2), y: R(yt), width: R(bwid), height: R(yb - yt) };
        if (ghost) bars += tag("rect", { ...a, class: "sv-ghost" + (c.hotspot ? " hs" : "") });
        else if (c.hotspot) bars += tag("rect", { ...a, class: "sv-base" }) + tag("rect", { ...a, class: `sv-hatch c-${car}` });
        else bars += tag("rect", { ...a, class: `sv-fill c-${car}` });
      });
    });
    // Direct labels for the last bar's segments
    let labels = [];
    if (lastK >= 0) {
      const i = idxs[lastK];
      let base = 0;
      keys.forEach((key) => {
        const v = DATA.cls[key][i];
        if (!v) return;
        labels.push({ key, y: y(base + v / 2), px: F.xl(lastK) + F.bw, py: y(base + v / 2) });
        base += v;
      });
    }
    const lx = F.m.l + F.pw + 12;
    const lab = placeLabels(labels, F.m.t, F.plotB)
      .map((l) => classLabel(l.key, lx, l.ly, l.px, l.py))
      .join("");
    const svg = ch.back + missingDots(F, idxs, keys) + bars + ch.front + lab + noteMarks(F, idxs, (i) => F.x(i - idxs[0]));

    chart = {
      n: idxs.length,
      inPlot: (px, py) => px >= F.m.l && px <= F.m.l + F.pw && py >= TOP.ribbon - 4 && py <= F.plotB + 40,
      kAt: (px) => clamp(Math.floor((px - F.m.l) / F.bw), 0, idxs.length - 1),
      xAt: (k) => F.x(k),
      hover: (k) => {
        const v = isExcluded(idxs[k]) ? null : monthTotal(idxs[k], keys);
        let s = tag("rect", { x: R(F.xl(k)), y: TOP.ribbon, width: R(F.bw), height: F.plotB - TOP.ribbon, style: "fill:var(--focus);opacity:.12" });
        if (v != null) s += tag("line", { x1: R(F.xl(k)), x2: R(F.xl(k + 1)), y1: R(y(v)) - 1, y2: R(y(v)) - 1, class: "sv-cross", style: "stroke-width:2" });
        return s;
      },
      tip: (k) => monthTip(idxs[k], keys),
    };
    return svg;
  }

  function drawYears(W, H) {
    const keys = visKeys(),
      years = DATA.years;
    const sel = state.years.filter((yr) => years.includes(yr)).sort();
    const m = { l: 56, r: 72, t: 28, b: 40 },
      pw = W - m.l - m.r,
      ph = H - m.t - m.b,
      bw = pw / 12,
      plotB = m.t + ph;
    const x = (k) => m.l + (k + 0.5) * bw;
    const idxOf = (yr, mo) => (yr - FIRST_YEAR) * 12 + mo;
    const val = (yr, mo) => {
      const i = idxOf(yr, mo);
      if (i < 0 || i >= DATA.N || isExcluded(i)) return null;
      return monthTotal(i, keys);
    };
    let max = 0;
    years.forEach((yr) => {
      for (let mo = 0; mo < 12; mo++) {
        const v = val(yr, mo);
        if (v > max) max = v;
      }
    });
    const S = niceScale(max),
      y = (v) => m.t + ph - (v / S.top) * ph;
    let out = "";
    S.ticks.forEach((v, j) => {
      const yy = R(y(v));
      if (v > 0) out += tag("line", { x1: m.l, x2: m.l + pw, y1: yy, y2: yy, class: "sv-grid" });
      out += tag("text", { x: m.l - 8, y: yy + 4, class: "sv-tick", "text-anchor": "end" }, tickText(v) + (j === S.ticks.length - 1 ? " GB" : ""));
    });
    MONTHS.forEach((mn, k) => {
      out += tag("text", { x: R(x(k)), y: plotB + 18, class: "sv-tick", "text-anchor": "middle" }, mn);
    });
    SEASONS.forEach((s) => {
      if (s.name === "Winter") return;
      const k = s.months[0];
      out += tag("line", { x1: R(m.l + k * bw), x2: R(m.l + k * bw), y1: m.t, y2: plotB, class: "sv-grid" });
    });
    SEASONS.forEach((s) => {
      const ks = s.name === "Winter" ? [0, 1] : s.months;
      out += tag("text", { x: R(m.l + (ks[0] + ks.length / 2) * bw), y: m.t - 10, class: "sv-ann", "text-anchor": "middle", style: "font-size:12px" }, s.name);
    });
    out += tag("line", { x1: m.l, x2: m.l + pw, y1: plotB, y2: plotB, class: "sv-axis" });
    const ptsFor = (yr) =>
      MONTHS.map((_, k) => {
        const v = val(yr, k),
          i = idxOf(yr, k);
        return v == null ? null : { x: R(x(k)), y: R(y(v)), car: DATA.months[i].carrier };
      });
    years
      .filter((yr) => !sel.includes(yr))
      .forEach((yr) => {
        out += linePaths(ptsFor(yr), () => "sv-line ctx");
      });
    const labels = [];
    sel.forEach((yr) => {
      const pts = ptsFor(yr);
      out += linePaths(pts, (car) => `sv-line c-${car}${isGhost(car) ? " ghost" : ""}`);
      for (let k = 11; k >= 0; k--)
        if (pts[k]) {
          labels.push({ yr, y: pts[k].y, px: pts[k].x, k });
          break;
        }
    });
    // Year labels: those ending in December sit in the margin; partial years sit at their last point.
    const groups = {};
    labels.forEach((l) => {
      (groups[l.k] = groups[l.k] || []).push(l);
    });
    Object.values(groups).forEach((g) =>
      placeLabels(g, m.t, plotB, 14).forEach((l) => {
        if (Math.abs(l.ly - l.y) > 3) out += tag("path", { d: `M${R(l.px + 3)},${R(l.y)}L${R(l.px + 8)},${R(l.ly)}`, class: "sv-leader" });
        out += tag("text", { x: R(l.px + 10), y: R(l.ly + 4), class: "sv-label year halo" }, l.yr);
      }),
    );

    chart = {
      n: 12,
      inPlot: (px, py) => px >= m.l && px <= m.l + pw && py >= m.t - 20 && py <= plotB + 30,
      kAt: (px) => clamp(Math.floor((px - m.l) / bw), 0, 11),
      xAt: (k) => x(k),
      hover: (k) => {
        let s = tag("line", { x1: R(x(k)), x2: R(x(k)), y1: m.t, y2: plotB, class: "sv-cross" });
        sel.forEach((yr) => {
          const v = val(yr, k);
          if (v != null) {
            const car = DATA.months[idxOf(yr, k)].carrier;
            s += tag("circle", { cx: R(x(k)), cy: R(y(v)), r: 4, class: `sv-dot c-${car}${isGhost(car) ? " ghost" : ""}` });
          }
        });
        return s;
      },
      tip: (k) => {
        const list = (sel.length ? sel : years).slice().reverse();
        let h = `<div class="tt-head"><strong>${MONTHS[k]}</strong><span class="tick">${keys.length === 4 ? "all series" : keys.map((kk) => CLASS[kk].label).join(" + ")}</span></div><table class="tt-rows">`;
        list.forEach((yr) => {
          const i = idxOf(yr, k);
          if (i >= DATA.N) return;
          const mo = DATA.months[i];
          const tagTxt = mo.periods.length ? ` <span class="tt-tag">${PERIODS.find((p) => p.id === mo.periods[0]).short}</span>` : "";
          h += `<tr><td class="tick">${yr}</td><td>${carrierName(mo.carrier)}<span class="tick muted"> ${mo.stamp}</span>${tagTxt}</td><td class="tick">${isExcluded(i) ? "excluded" : fmt(val(yr, k))}</td></tr>`;
        });
        return h + "</table>";
      },
    };
    return out;
  }

  function monthTip(i, keys) {
    const mo = DATA.months[i];
    let h = `<div class="tt-head"><span class="tick">${mo.stamp} · ${mo.label}</span>${carrierName(mo.carrier)}</div>`;
    mo.periods.forEach((pid) => {
      const p = PERIODS.find((x) => x.id === pid);
      h += `<div class="tt-tag body-small">${esc(p.label)}${state.exclude[pid] ? " · excluded" : ""}</div>`;
    });
    let tot = null;
    h += '<table class="tt-rows">';
    keys.forEach((key) => {
      const c = CLASS[key],
        v = DATA.cls[key][i];
      const mem = DATA.members[key].filter((s) => s.values[i] != null || s.live(i));
      if (!mem.length) return;
      const g = c.hotspot ? classGlyph(key) : seriesGlyph(mem[0], 16);
      const name = c.hotspot ? `<span class="code">${c.kind === "phone" ? "P" : "T"}-hotspot</span>` : mem.map((s) => `<span class="code">${esc(s.code)}</span> ${esc(s.model)}`).join(", ");
      h += `<tr><td>${g}</td><td>${name}</td><td class="tick">${isExcluded(i) ? "excluded" : fmt(v)}</td></tr>`;
      if (v != null) tot = (tot || 0) + v;
    });
    h += "</table>";
    h += `<div class="tt-total"><span class="label">Month total</span><span class="tick">${isExcluded(i) ? "excluded" : fmt(tot)}</span></div>`;
    return h;
  }

  function carrierKey(mode) {
    const sw = (c, hs) => (mode === "line" ? `<svg width="30" height="10" aria-hidden="true"><line x1="2" x2="28" y1="5" y2="5" class="sv-line c-${c}${hs ? " hs" : ""}${isGhost(c) ? " ghost" : ""}"/></svg>` : `<span class="swatch ${hs ? "hatch" : "solid"} c-${c}${isGhost(c) ? " ghost" : ""}"></span>`);
    let h = `<table class="carrier-key" aria-label="Carrier and mode key"><thead><tr><th></th><th>On-device</th><th>Hotspot</th></tr></thead><tbody>`;
    DATA.carriers.forEach((c) => {
      h += `<tr><th scope="row">${carrierName(c)}</th><td>${sw(c, false)}</td><td>${sw(c, true)}</td></tr>`;
    });
    h += "</tbody></table>";
    return h;
  }

  const VIEW_TEXT = {
    timeline: {
      title: "Monthly use by device class",
      sub: "One line per class. Solid lines are on-device data, dashed lines are hotspot tethering, and small squares mark the iPad lines. The lanes above the plot name the device in service.",
      help: "Lines read left to right, one point per month.",
    },
    stack: {
      title: "Monthly use, stacked",
      sub: "Each bar is one month. iPhone data sits at the bottom with its hatched hotspot on top, then the iPad block. Bar height is the month total for the series you keep switched on.",
      help: "Use the presets to stack iPhones only or iPads only.",
    },
    years: {
      title: "The years laid over each other",
      sub: "Each line is one calendar year of monthly totals for the series you keep switched on. Picked years are drawn in their carrier color and labelled; every other year stays in the background for context.",
      help: "Pick the years to compare below.",
    },
    projection: {
      title: "Six-month projection",
      sub: "The last 12 logged months of iPhone and iPad use, then where a straight-line trend through them points for the next six months. Hollow points mark projected months; the shaded band is the likely range.",
      help: "Projection uses the Timeline view. Pick Stacked or Years to leave it.",
    },
  };

  function renderPrimary() {
    const well = $("#chart-well");
    const v = VIEW_TEXT[state.projection ? "projection" : state.view];
    $("#primary-title").textContent = v.title;
    $("#primary-sub").textContent = v.sub;
    $("#view-help").textContent = v.help;
    $("#carrier-key").innerHTML = carrierKey(state.view === "stack" ? "fill" : "line");
    $("#proj-note").hidden = !state.projection;
    if (state.projection) $("#proj-note").textContent = projNote();
    renderNotesList();
    if (state.display === "table") {
      renderTable();
      return;
    }
    const W = well.clientWidth;
    if (W < 300) return;
    const H = clamp(Math.round(W * 0.52), 400, 500);
    hideTip();
    if (!(state.projection ? projKeys() : visKeys()).length) {
      chart = null;
      well.innerHTML = `<p class="chart-empty body-small">${state.projection ? "Switch on iPhones or iPads to draw the projection." : "Switch on at least one series to draw the chart."}</p>`;
      well.style.height = H + "px";
      return;
    }
    const body = state.projection ? drawProjection(W, H) : state.view === "stack" ? drawStack(W, H) : state.view === "years" ? drawYears(W, H) : drawTimeline(W, H);
    const label = state.projection ? `Six-month projection of iPhone and iPad use after ${DATA.months[DATA.N - 1].label}` : state.view === "years" ? "Monthly totals by calendar month, one line per year" : `Monthly data use, ${DATA.months[rangeBounds()[0]].label} to ${DATA.months[rangeBounds()[1]].label}`;
    well.style.height = "";
    well.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" tabindex="0" role="group" aria-label="${esc(label)}. Use the left and right arrow keys to read each month; the Table button shows the same data.">${DEFS}${body}<g class="hover-layer"></g></svg>`;
  }

  function renderNotesList() {
    const list = $("#notes-list");
    if (!state.notes.mine || state.display === "table") {
      list.innerHTML = "";
      return;
    }
    const [a, b] = state.projection ? [projectionModel().base[0], DATA.N - 1] : state.view === "years" ? [0, DATA.N - 1] : rangeBounds();
    list.innerHTML = NOTES.map((n, j) => ({ n, j, i: keyToIdx(n.month) }))
      .filter((o) => o.i >= a && o.i <= b)
      .map((o) => `<li><span class="n">${o.j + 1}</span><span class="tick">${stampOf(o.i)} · ${labelOf(o.i)}</span><span><strong>${esc(o.n.title)}.</strong> ${esc(o.n.text)}</span></li>`)
      .join("");
  }

  function renderTable() {
    const keys = ALL_KEYS;
    let idxs = rangeIdx();
    if (state.view === "years" && state.years.length) idxs = seq(0, DATA.N - 1).filter((i) => state.years.includes(DATA.months[i].y));
    const cell = (key, i) => {
      const v = DATA.cls[key][i];
      const mem = DATA.members[key].filter((s) => s.values[i] != null);
      const code = !CLASS[key].hotspot && mem.length ? `<span class="code">${mem.map((s) => s.code).join("+")}</span>` : "";
      return `<td class="num">${v == null ? '<span class="muted">—</span>' : code + fmt(v)}</td>`;
    };
    let h = `<div class="table-wrap"><table class="data-table"><caption class="sr-only">Monthly data use by class, ordered by month stamp</caption><thead><tr><th>Stamp</th><th>Month</th><th>Carrier</th>${keys.map((k) => `<th class="num">${CLASS[k].label}</th>`).join("")}<th class="num">Total</th></tr></thead><tbody>`;
    idxs.forEach((i) => {
      const mo = DATA.months[i],
        ex = isExcluded(i);
      const note = mo.periods.length ? ` <span class="muted body-small">${PERIODS.find((p) => p.id === mo.periods[0]).short}${ex ? ", excluded" : ""}</span>` : "";
      h += `<tr class="${ex ? "excluded-row" : isGhost(mo.carrier) ? "ghost-row" : ""}"><td class="tick">${mo.stamp}</td><td>${mo.label}${note}</td><td>${carrierName(mo.carrier)}</td>${keys.map((k) => cell(k, i)).join("")}<td class="num">${fmt(monthTotal(i))}</td></tr>`;
    });
    h += "</tbody></table></div>";
    $("#chart-table").innerHTML = h;
  }

  /* ----- Hover, focus and keyboard on the primary chart ----- */
  const tipEl = () => $("#tooltip");
  function placeTip(html, cx, cy) {
    const t = tipEl();
    t.innerHTML = html;
    t.hidden = false;
    const w = t.offsetWidth,
      h = t.offsetHeight;
    let left = cx + 18;
    if (left + w > window.innerWidth - 8) left = cx - 18 - w;
    const top = clamp(cy - h / 2, 8, window.innerHeight - h - 8);
    t.style.left = Math.max(8, left) + "px";
    t.style.top = top + "px";
  }
  function hideTip() {
    const t = tipEl();
    if (t) t.hidden = true;
    const hl = $("#chart-well .hover-layer");
    if (hl) hl.innerHTML = "";
  }
  let hoverK = null;
  function setHover(k, cx, cy) {
    if (!chart) return;
    hoverK = k;
    const hl = $("#chart-well .hover-layer");
    if (hl) hl.innerHTML = chart.hover(k);
    placeTip(chart.tip(k), cx, cy);
  }
  function noteTip(j) {
    const n = NOTES[j],
      i = keyToIdx(n.month);
    return `<div class="tt-head"><span class="tick">Note ${j + 1} · ${stampOf(i)} · ${labelOf(i)}</span></div><p class="tt-title">${esc(n.title)}</p><p class="body-small">${esc(n.text)}</p>`;
  }

  function bindChart() {
    const well = $("#chart-well");
    well.addEventListener("pointermove", (e) => {
      const svg = well.querySelector("svg");
      if (!chart || !svg) return;
      const note = e.target.closest && e.target.closest(".sv-note");
      if (note) {
        $("#chart-well .hover-layer").innerHTML = "";
        placeTip(noteTip(+note.dataset.note), e.clientX, e.clientY);
        return;
      }
      const r = svg.getBoundingClientRect(),
        px = e.clientX - r.left,
        py = e.clientY - r.top;
      if (!chart.inPlot(px, py)) {
        hideTip();
        return;
      }
      setHover(chart.kAt(px), e.clientX, e.clientY);
    });
    well.addEventListener("pointerleave", hideTip);
    well.addEventListener("focusin", (e) => {
      const note = e.target.closest(".sv-note");
      if (note) {
        const b = note.getBoundingClientRect();
        placeTip(noteTip(+note.dataset.note), b.right, b.bottom + 40);
      }
    });
    well.addEventListener("focusout", hideTip);
    well.addEventListener("keydown", (e) => {
      const svg = well.querySelector("svg");
      if (!chart || e.target !== svg) return;
      let k = hoverK == null ? chart.n - 1 : clamp(hoverK, 0, chart.n - 1);
      if (e.key === "ArrowLeft") k--;
      else if (e.key === "ArrowRight") k++;
      else if (e.key === "Home") k = 0;
      else if (e.key === "End") k = chart.n - 1;
      else if (e.key === "Escape") {
        hideTip();
        return;
      } else if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      k = clamp(k, 0, chart.n - 1);
      const r = svg.getBoundingClientRect();
      setHover(k, r.left + chart.xAt(k), r.top + r.height / 2);
    });
  }

  /* =====================================================================
     Roster
     ===================================================================== */
  function renderRoster() {
    const N = DATA.N,
      M = DATA.months;
    const P = (i) => ((i / N) * 100).toFixed(3) + "%";
    const W = (n) => ((n / N) * 100).toFixed(3) + "%";
    const [ra, rb] = rangeBounds();
    const yearsBg = DATA.years
      .map((yr) => {
        const i = (yr - FIRST_YEAR) * 12;
        return i > 0 ? `<span class="roster-year" style="left:${P(i)}"></span>` : "";
      })
      .join("");
    const switchIdx = M.findIndex((m, i) => i > 0 && m.carrier !== M[i - 1].carrier);
    const sw = switchIdx > 0 ? `<span class="roster-switch" style="left:${P(switchIdx)}" title="Carrier switch · ${M[switchIdx].stamp}"></span>` : "";
    const dim = (ra > 0 ? `<span class="roster-dim" style="left:0;width:${P(ra)}"></span>` : "") + (rb < N - 1 ? `<span class="roster-dim" style="left:${P(rb + 1)};right:0"></span>` : "");
    const segRuns = (pred) => {
      const out = [];
      for (let i = 0; i < N; i++) {
        if (!pred(i)) continue;
        const lastRun = out[out.length - 1];
        if (lastRun && lastRun.b === i - 1 && lastRun.car === M[i].carrier) lastRun.b = i;
        else out.push({ a: i, b: i, car: M[i].carrier });
      }
      return out;
    };
    const spanHTML = (r, hs, title) => `<span class="roster-span ${hs ? "hatch" : "solid"} c-${r.car}${isGhost(r.car) ? " ghost" : ""}" style="left:${P(r.a)};width:${W(r.b - r.a + 1)}" title="${esc(title)}"></span>`;

    let h = `<div class="roster" role="table" aria-label="Device roster">`;
    h += `<div class="roster-row axis" role="row"><span class="label" role="columnheader">Device</span><div class="roster-track" role="columnheader">${DATA.years
      .map((yr) => {
        const i = (yr - FIRST_YEAR) * 12;
        return `<span class="roster-year-label tick" style="left:${P(i)}">${i / N > 0.97 ? "" : yr}</span>`;
      })
      .join("")}</div><span class="label roster-meta" role="columnheader">In service</span></div>`;
    let prevKind = null;
    DATA.series.forEach((s) => {
      const gapCls = prevKind && prevKind !== s.kind ? " class-gap" : "";
      prevKind = s.kind;
      let track = yearsBg + sw;
      let meta;
      if (s.hotspot) {
        segRuns((i) => s.status[i] === 2).forEach((r) => {
          track += `<span class="roster-span off" style="left:${P(r.a)};width:${W(r.b - r.a + 1)}" title="Hotspot available but off · ${M[r.a].stamp}–${M[r.b].stamp}"></span>`;
        });
        segRuns((i) => s.status[i] === 1).forEach((r) => {
          track += spanHTML(r, true, `${s.code} on · ${M[r.a].stamp} ${M[r.a].label} – ${M[r.b].stamp} ${M[r.b].label}`);
        });
        const on = s.status.filter((v) => v === 1).length;
        meta = `on ${on} mo · ${s.active ? "active" : "inactive"}`;
      } else {
        segRuns((i) => s.live(i) || s.values[i] != null).forEach((r) => {
          track += spanHTML(r, false, `${s.code} · ${CARRIERS[r.car] || r.car} · ${M[r.a].stamp} ${M[r.a].label} – ${M[r.b].stamp} ${M[r.b].label}`);
        });
        const n = s.first >= 0 ? s.last - s.first + 1 : 0;
        meta = s.first >= 0 ? `${M[s.first].stamp}–${s.active ? "present" : M[s.last].stamp} · ${n} mo` : "—";
      }
      const sub = s.first >= 0 ? (s.hotspot ? "per class, not per device" : `${M[s.first].label} – ${s.active ? "present" : M[s.last].label}`) : "";
      h += `<div class="roster-row${gapCls}" role="row"><div role="rowheader">${deviceId(s, { sub })}</div><div class="roster-track" role="cell">${track}${dim}</div><span class="tick roster-meta" role="cell">${meta}</span></div>`;
    });
    h += "</div>";
    h += `<p class="roster-key body-small"><span>${DATA.carriers.map((c) => swatch(c, false)).join("")} Device in service</span><span>${DATA.carriers.map((c) => swatch(c, true)).join("")} Hotspot on</span><span><span class="off-sw"></span> Hotspot available but off</span><span><span style="display:inline-block;height:12px;border-left:1px dashed var(--ink-muted)"></span> Carrier switch</span></p>`;
    $("#roster").innerHTML = h;
  }

  /* =====================================================================
     Data boxes
     ===================================================================== */
  const boxHead = (title, sub) => `<header><h3 class="panel-title">${title}</h3>${sub ? `<p class="body-small">${sub}</p>` : ""}</header>`;
  const coverage = () => {
    const ex = PERIODS.filter((p) => state.exclude[p.id]).map((p) => p.short);
    return (state.carrier === "both" ? "Both carriers" : `${CARRIERS[state.carrier]} months only`) + (ex.length ? `, ${ex.join(" and ")} excluded` : "");
  };

  function yearRows() {
    const all = scopeAll();
    return [...new Set(all.map((i) => DATA.months[i].y))].map((yr) => ({ yr, ids: all.filter((i) => DATA.months[i].y === yr) }));
  }

  function renderYearBox() {
    const rows = yearRows().map((r) => ({ ...r, a: agg(r.ids, (i) => monthTotal(i)) }));
    const max = Math.max(...rows.map((r) => mean(r.a) || 0));
    const { marksFor, foot } = exclusionNotes();
    let h = boxHead("Average use by year", "Average month across all devices and hotspots.");
    h += `<table class="box-table"><thead><tr><th>Year</th><th>Average month</th><th class="num">Per month</th><th class="num">Months</th><th class="num">Year total</th></tr></thead><tbody>`;
    rows.forEach((r) => {
      const p = pick(r.a),
        none = !p.months;
      h += `<tr class="${none ? "is-ghost" : ""}"><th class="yr" scope="row">${r.yr}</th><td class="bar-cell">${barHTML(parts(r.a, r.a.months), max)}</td><td class="num">${numHTML(mean(p))}</td><td class="num">${p.months}${p.months && p.months < 12 ? `<span class="sub">partial${marksFor(r.yr)}</span>` : ""}</td><td class="num">${numHTML(none ? null : p.total)}</td></tr>`;
    });
    h += "</tbody></table>" + foot();
    $("#box-year").innerHTML = h;
  }

  /* Footnote marks for months removed by the Anomalies switches: * for the first, † for the second. */
  function exclusionNotes() {
    const MARKS = ["*", "†"];
    const excluded = PERIODS.filter((p) => state.exclude[p.id]).map((p, j) => ({ p, mark: MARKS[j] || "‡" }));
    const marksFor = (yr) =>
      excluded
        .filter((o) => seq(keyToIdx(o.p.from), keyToIdx(o.p.to)).some((i) => FIRST_YEAR + Math.floor(i / 12) === yr))
        .map((o) => o.mark)
        .join("");
    const foot = () => {
      const lines = excluded.map((o) => `${o.mark} ${o.p.label} months excluded (${labelOf(keyToIdx(o.p.from))} – ${labelOf(keyToIdx(o.p.to))}).`);
      if (state.carrier !== "both") lines.push(`${CARRIERS[state.carrier]} months only.`);
      return lines.length ? `<p class="box-foot tick">${lines.map(esc).join("<br>")}</p>` : "";
    };
    return { marksFor, foot };
  }

  function renderTypeBox() {
    const rows = yearRows();
    const cells = rows.map((r) => ALL_KEYS.map((key) => agg(r.ids, (i) => DATA.cls[key][i])));
    let max = 0;
    cells.forEach((row) =>
      row.forEach((a) => {
        const v = mean(a);
        if (v > max) max = v;
      }),
    );
    const { marksFor, foot } = exclusionNotes();
    let h = boxHead("Average use by month and device type each year", "Average month for each class, counting only months it was in service.");
    h += `<table class="box-table"><thead><tr><th>Year</th>${CLASSES.map((c) => `<th class="num"><span title="${esc(c.label)}">${classGlyph(c.key)}</span> ${c.hotspot ? "Hotspot" : c.plural}</th>`).join("")}</tr></thead><tbody>`;
    rows.forEach((r, j) => {
      h += `<tr><th class="yr" scope="row">${r.yr}${marksFor(r.yr)}</th>`;
      cells[j].forEach((a, c) => {
        const p = pick(a);
        h += `<td class="num"><div class="cell-stack">${a.months ? `<span class="nowrap">${numHTML(mean(p))}</span>` : '<span class="muted">—</span>'}${a.months ? barHTML(parts(a, a.months, CLASSES[c].hotspot), max) : ""}</div></td>`;
      });
      h += "</tr>";
    });
    h += "</tbody></table>" + foot();
    $("#box-type").innerHTML = h;
  }

  function renderSeasonBox() {
    const all = scopeAll();
    const byMonth = MONTHS.map((_, mo) =>
      agg(
        all.filter((i) => DATA.months[i].m === mo),
        (i) => monthTotal(i),
      ),
    );
    const max = Math.max(...byMonth.map((a) => mean(a) || 0));
    const sel = byMonth.map((a) => mean(pick(a)));
    const topMo = sel.reduce((b, v, j) => (v != null && (b < 0 || v > sel[b]) ? j : b), -1);
    let h = boxHead("Most active seasons", `Average month for each calendar month and season, all devices and hotspots. ${coverage()}.`);
    h += `<div class="colchart" role="img" aria-label="Average use by calendar month: ${MONTHS.map((mn, j) => `${mn} ${fmt(sel[j])}`).join(", ")}">`;
    byMonth.forEach((a, j) => {
      h += `<div class="col${j === topMo ? " top" : ""}"><span class="tick col-val">${sel[j] == null ? "—" : fmtParts(sel[j]).num}</span><div class="col-track"><div class="col-bar" style="height:${max ? ((mean(a) / max) * 100).toFixed(2) : 0}%">${barHTML(
        parts(a, a.months).map((p) => ({ ...p, gb: a.months ? (p.gb / (mean(a) || 1)) * 100 : 0 })),
        100,
        true,
      )}</div></div><span class="tick col-lab">${MONTHS[j]}</span></div>`;
    });
    h += "</div>";
    const seasons = SEASONS.map((s) => ({
      s,
      a: agg(
        all.filter((i) => s.months.includes(DATA.months[i].m)),
        (i) => monthTotal(i),
      ),
    })).map((o) => ({ ...o, v: mean(pick(o.a)) }));
    const ranked = seasons.filter((o) => o.v != null).sort((p, q) => q.v - p.v);
    h += '<div class="seasons">';
    seasons.forEach((o) => {
      const top = ranked[0] === o,
        quiet = ranked[ranked.length - 1] === o && ranked.length > 1;
      h += `<div class="season${top ? " top" : ""}"><span class="label">${o.s.name}</span><span class="tick muted">${o.s.months.map((mm) => MONTHS[mm]).join(" · ")}</span><span class="figure-small">${numHTML(o.v)}</span><span class="rank${quiet ? " quiet" : ""}">${top ? "Most active" : quiet ? "Quietest" : "&nbsp;"}</span></div>`;
    });
    h += '</div><p class="box-foot tick">GB per month. Numbers above the columns are the calendar-month averages.</p>';
    $("#box-season").innerHTML = h;
  }

  function contextRows() {
    const base = rangeIdx(); // the anomaly switches do not apply here: this box is the comparison
    const normal = base.filter((i) => !DATA.months[i].periods.length);
    const rows = [
      { group: "Periods · all series" },
      { label: "Normal months", sub: "outside the periods below", a: agg(normal, (i) => monthTotal(i)) },
      ...PERIODS.map((p) => ({
        label: p.label,
        sub: `${stampOf(keyToIdx(p.from))}–${stampOf(keyToIdx(p.to))}`,
        a: agg(
          base.filter((i) => inPeriod(i, p.id)),
          (i) => monthTotal(i),
        ),
      })),
      { group: "Network generation · on-device, normal months" },
    ];
    ["phone", "tablet"].forEach((kind) =>
      ["LTE", "5G"].forEach((net) => {
        const devs = DATA.series.filter((s) => s.kind === kind && !s.hotspot && s.net === net);
        if (!devs.length) return;
        const a = { total: 0, months: 0, by: {} };
        devs.forEach((s) =>
          normal.forEach((i) => {
            const v = s.values[i];
            if (v == null) return;
            const c = DATA.months[i].carrier;
            a.total += v;
            a.months++;
            a.by[c] = a.by[c] || { total: 0, months: 0 };
            a.by[c].total += v;
            a.by[c].months++;
          }),
        );
        rows.push({ label: `${kind === "phone" ? "iPhone" : "iPad"} · ${NET_LABEL[net]}`, sub: devs.map((s) => s.code).join(", "), a, devs });
      }),
    );
    return rows;
  }

  function renderContextBox() {
    const rows = contextRows();
    const max = Math.max(...rows.filter((r) => r.a).map((r) => mean(r.a) || 0));
    let h = boxHead("Normal, anomalous, LTE and 5G", `Average month in each context. The anomaly switches do not apply here, since this box is the comparison. ${state.carrier === "both" ? "Both carriers" : CARRIERS[state.carrier] + " months only"}.`);
    h += '<table class="box-table"><tbody>';
    rows.forEach((r) => {
      if (r.group) {
        h += `<tr class="group"><th colspan="3">${r.group}</th></tr>`;
        return;
      }
      const p = pick(r.a);
      const marks = r.devs ? r.devs.map((s) => seriesGlyph(s, 16)).join(" ") + " " : "";
      h += `<tr class="${p.months ? "" : "is-ghost"}"><th scope="row" class="ctx-label">${esc(r.label)}<span class="sub">${marks}${esc(r.sub)} · ${plural(p.months, r.devs ? "device-month" : "month")}</span></th><td class="bar-cell">${barHTML(parts(r.a, r.a.months), max)}</td><td class="num">${numHTML(mean(p))}</td></tr>`;
    });
    h += "</tbody></table>";
    $("#box-context").innerHTML = h;
  }

  function renderDeviceBox() {
    const all = scopeAll();
    const rows = DATA.series.map((s) => ({ s, a: agg(all, (i) => s.values[i]) }));
    const max = Math.max(...rows.map((r) => r.a.total));
    let h = boxHead("Total data per device", `Everything each device and hotspot carried. ${coverage()}.`);
    h += `<table class="box-table"><thead><tr><th>Device</th><th class="num">Total</th><th class="num">Per month</th></tr></thead><tbody>`;
    rows.forEach((r) => {
      const p = pick(r.a);
      const sub = `${plural(p.months, "month")}`;
      h += `<tr class="${p.months || !r.a.months ? "" : "is-ghost"}"><td>${deviceId(r.s, { sub })}<div style="margin-top:6px">${barHTML(parts(r.a, 1, r.s.hotspot), max)}</div></td><td class="num">${numHTML(r.a.months ? p.total : null)}</td><td class="num">${numHTML(mean(p))}</td></tr>`;
    });
    h += "</tbody></table>";
    $("#box-device").innerHTML = h;
  }

  function renderProviderBox() {
    const all = scopeAll();
    const grand = agg(all, (i) => monthTotal(i)).total;
    const cards = DATA.carriers.map((c) => {
      const ids = all.filter((i) => DATA.months[i].carrier === c);
      const tot = agg(ids, (i) => monthTotal(i)),
        dev = agg(ids, (i) => monthTotal(i, ["phone", "tablet"])),
        hs = agg(ids, (i) => monthTotal(i, ["phoneHs", "tabletHs"]));
      const devs = DATA.series.filter((s) => !s.hotspot && ids.some((i) => s.values[i] != null));
      return { c, ids, tot, dev, hs, devs };
    });
    const max = Math.max(...cards.map((o) => o.tot.total));
    let h = boxHead(
      "Total data per service provider",
      `What each carrier delivered. ${
        PERIODS.filter((p) => state.exclude[p.id])
          .map((p) => p.short + " excluded")
          .join(", ") || "Every logged month in the selected time span"
      }.`,
    );
    h += '<div class="providers">';
    cards.forEach((o) => {
      const span = o.ids.length ? `${DATA.months[o.ids[0]].stamp}–${DATA.months[o.ids[o.ids.length - 1]].stamp}` : "—";
      h += `<div class="provider${isGhost(o.c) ? " is-ghost" : ""}"><h4>${swatch(o.c, false)} ${carrierName(o.c)}</h4>
        <p class="figure-small">${numHTML(o.ids.length ? o.tot.total : null)}</p>
        <p class="tick muted">${span} · ${plural(o.ids.length, "month")} · ${pct(o.tot.total, grand)}% of all data</p>
        <div style="width:${max ? ((o.tot.total / max) * 100).toFixed(2) : 0}%">${barHTML(
          [
            { carrier: o.c, gb: o.dev.total },
            { carrier: o.c, gb: o.hs.total, hs: true },
          ],
          o.tot.total || 1,
        )}</div>
        <dl><dt>Average month</dt><dd>${fmt(mean(o.tot))}</dd><dt>On-device</dt><dd>${fmt(o.dev.total)}</dd><dt>Hotspot</dt><dd>${fmt(o.hs.total)}</dd></dl>
        <ul class="devs body-small" aria-label="Devices on ${esc(CARRIERS[o.c] || o.c)}">${o.devs.map((s) => `<li><span class="slot">${seriesGlyph(s, 16)}</span><span class="code">${s.code}</span><span class="muted">—</span>${esc(s.model)}</li>`).join("") || '<li class="muted">No devices in this span</li>'}</ul>
      </div>`;
    });
    h += "</div>";
    $("#box-provider").innerHTML = h;
  }

  /* =====================================================================
     Story text — computed from the data so it stays true as the log grows
     ===================================================================== */
  function renderStory() {
    const M = DATA.months,
      N = DATA.N;
    const allTotal = seq(0, N - 1).reduce((a, i) => a + (monthTotal(i) || 0), 0);
    const devices = DATA.series.filter((s) => !s.hotspot);
    $("#brand-span").textContent = `M001–${stampOf(N - 1)}`;
    $("#eyebrow").textContent = `Mobile data dashboard · ${M[0].label} – ${M[N - 1].label}`;
    $("#lede").textContent = `Since ${M[0].label} I have logged how much mobile data I use, every month. ${N} months, ${words(devices.length)} devices, ${words(DATA.carriers.length)} carriers and ${fmt(allTotal)} later, this dashboard tells the story of my montly log. You may pick a carrier at the top or see both together. Use the controls beside the chart to split, stack or overlay the years.`;

    // Roster
    const phones = devices.filter((s) => s.kind === "phone"),
      pads = devices.filter((s) => s.kind === "tablet");
    const padCars = [
      ...new Set(
        pads.flatMap((s) =>
          seq(0, N - 1)
            .filter((i) => s.values[i] != null)
            .map((i) => M[i].carrier),
        ),
      ),
    ];
    const sw = M.findIndex((m, i) => i > 0 && m.carrier !== M[i - 1].carrier);
    const active = devices.filter((s) => s.active).map((s) => s.code);
    let t = `${words(phones.length)[0].toUpperCase() + words(phones.length).slice(1)} iPhones and ${words(pads.length)} iPads.`;
    if (sw > 0) t += ` The plan was on ${CARRIERS[M[0].carrier]} until ${M[sw - 1].label} and on ${CARRIERS[M[sw].carrier]} from ${M[sw].stamp}.`;
    if (padCars.length === 1) t += ` Every iPad has only ever been on ${CARRIERS[padCars[0]]}.`;
    if (active.length) t += ` ${active.join(" and ")} ${active.length === 1 ? "is" : "are"} in service today.`;
    $("#txt-roster").textContent = t;

    // Years
    const yr = yearRows()
      .map((r) => ({ ...r, v: mean(pick(agg(r.ids, (i) => monthTotal(i)))), full: r.ids.length === 12 }))
      .filter((r) => r.v != null);
    const full = yr.filter((r) => r.full);
    t = "";
    if (full.length >= 2) {
      const a = full[0],
        b = full[full.length - 1];
      t += `My average month went from ${fmt(a.v)} in ${a.yr} to ${fmt(b.v)} in ${b.yr}${a.v > 0 ? `, about ${(b.v / a.v).toFixed(1)} times as much` : ""}.`;
    }
    if (yr.length) {
      const top = yr.slice().sort((p, q) => q.v - p.v)[0];
      t += ` The busiest year was ${top.yr} at ${fmt(top.v)} a month.`;
      if (top.ids.some((i) => inPeriod(i, "bug"))) t += " That year owes its height to the iOS bug; switch on “Exclude iOS bug” to see the real shape.";
    }
    $("#txt-years").textContent = t.trim();

    // When
    const all = scopeAll();
    const seasons = SEASONS.map((s) => ({
      name: s.name,
      v: mean(
        pick(
          agg(
            all.filter((i) => s.months.includes(M[i].m)),
            (i) => monthTotal(i),
          ),
        ),
      ),
    }))
      .filter((o) => o.v != null)
      .sort((p, q) => q.v - p.v);
    const ctx = contextRows();
    const normal = ctx.find((r) => r.label === "Normal months"),
      covid = ctx.find((r) => r.label === PERIODS[0].label);
    t = "";
    if (seasons.length > 1) t += `${seasons[0].name} is my busiest season at ${fmt(seasons[0].v)} a month; ${seasons[seasons.length - 1].name.toLowerCase()} is the quietest at ${fmt(seasons[seasons.length - 1].v)}.`;
    if (normal && covid && pick(covid.a).months && pick(normal.a).months) {
      const n = mean(pick(normal.a)),
        c = mean(pick(covid.a));
      t += ` Working from home during COVID-19, I used ${fmt(c)} a month against ${fmt(n)} in normal months.`;
    }
    const lte = ctx.find((r) => r.devs && r.devs[0].kind === "phone" && r.devs[0].net === "LTE"),
      g5 = ctx.find((r) => r.devs && r.devs[0].kind === "phone" && r.devs[0].net === "5G");
    if (lte && g5 && pick(lte.a).months && pick(g5.a).months) t += ` On-device, my 5G iPhones averaged ${fmt(mean(pick(g5.a)))} a month against ${fmt(mean(pick(lte.a)))} on the 4G/LTE ones.`;
    $("#txt-when").textContent = t.trim();

    // Where
    const totals = DATA.series
      .filter((s) => !s.hotspot)
      .map((s) => ({ s, a: pick(agg(all, (i) => s.values[i])) }))
      .sort((p, q) => q.a.total - p.a.total);
    const grand = pick(agg(all, (i) => monthTotal(i))).total;
    const hsTot = pick(agg(all, (i) => monthTotal(i, ["phoneHs", "tabletHs"]))).total;
    t = "";
    if (totals.length && totals[0].a.total > 0) t += `The ${totals[0].s.model} (${totals[0].s.code}) carried the most: ${fmt(totals[0].a.total)} over ${plural(totals[0].a.months, "month")}.`;
    if (state.carrier === "both") {
      const by = agg(all, (i) => monthTotal(i)).by;
      const lead = Object.keys(by).sort((p, q) => by[q].total - by[p].total)[0];
      if (lead) t += ` ${CARRIERS[lead]} delivered ${pct(by[lead].total, grand)}% of everything logged.`;
    }
    if (grand > 0) t += ` Hotspot tethering accounts for ${pct(hsTot, grand)}% of the total.`;
    $("#txt-where").textContent = t.trim();
  }

  function renderMethod() {
    const M = DATA.months,
      N = DATA.N;
    const items = [`Months are the unit. Each month has a stamp, from M001 (${M[0].label}) to ${stampOf(N - 1)} (${M[N - 1].label}). Columns after the last month with real use are ignored until they hold data.`, `Data is in gigabytes with one decimal. Anything under 1 GB is shown in megabytes, with 1 GB = ${MB_PER_GB.toLocaleString("en-US")} MB.`, "Hue means carrier, and nothing else on the page uses it. Shape and serial (P for iPhone, T for iPad) mean device. Solid fill or a solid line is on-device data; hatch or a dashed line is hotspot tethering.", "Hotspot is logged per class, all iPhones or all iPads, never per device.", "A blank cell is a gap, not a zero. A logged 0.0 is a real zero.", `Anomalous periods: ${PERIODS.map((p) => `${p.label} (${labelOf(keyToIdx(p.from))} – ${labelOf(keyToIdx(p.to))})`).join("; ")}. The Anomalies switches remove them from every chart and summary.`, "Choosing a carrier ghosts the other carrier’s marks instead of hiding them, and the axes never rescale, so you keep your place.", "Every chart has a table view. Press the Table button above the chart, or focus the chart and use the arrow keys."];
    $("#method-list").innerHTML = items.map((s) => `<li>${esc(s)}</li>`).join("");
  }

  /* =====================================================================
     Controls
     ===================================================================== */
  function syncControls() {
    $$("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === state.view)));
    $$("[data-display]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.display === state.display)));
    $$("[data-range]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.range === state.range.mode)));
    $$("[data-series]").forEach((i) => {
      i.checked = state.series[i.dataset.series];
    });
    $$("[data-devices]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.devices === state.devices)));
    $$("[data-carrier]").forEach((b) => {
      const on = b.dataset.carrier === state.carrier;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    $("#range-from").disabled = $("#range-to").disabled = state.range.mode === "full";
    $("#ctl-range").hidden = state.view === "years";
    $("#ctl-years").hidden = state.view !== "years";
    $$("#year-chips .chip").forEach((b) => b.setAttribute("aria-pressed", String(state.years.includes(+b.dataset.year))));
    $("#chart-well").hidden = state.display === "table";
    $("#chart-table").hidden = state.display !== "table";
    // Projection: chart only, Timeline only, iPhone and iPad only, no time-span picking
    $("#proj-toggle").setAttribute("aria-pressed", String(state.projection));
    $('[data-display="table"]').disabled = state.projection;
    $("#ctl-range").disabled = state.projection;
    $$('[data-series="phoneHs"], [data-series="tabletHs"], [data-preset="hotspot"]').forEach((el) => {
      el.disabled = state.projection;
    });
  }

  function renderAll() {
    syncControls();
    renderStatus();
    renderTiles();
    renderPrimary();
    renderRoster();
    renderYearBox();
    renderTypeBox();
    renderSeasonBox();
    renderContextBox();
    renderDeviceBox();
    renderProviderBox();
    renderStory();
  }

  function spreadYears() {
    const full = DATA.years.filter((yr) => DATA.months.filter((m) => m.y === yr).length === 12);
    const L = full.length;
    if (L <= 4) return full.slice();
    return [...new Set([0, 1, 2, 3].map((j) => full[Math.round((j * (L - 1)) / 3)]))];
  }

  function bindControls() {
    // Year selects and chips
    const opts = DATA.years.map((yr) => `<option value="${yr}">${yr}</option>`).join("");
    $("#range-from").innerHTML = opts;
    $("#range-to").innerHTML = opts;
    state.range.from = DATA.years[Math.max(0, DATA.years.length - 3)];
    state.range.to = DATA.years[DATA.years.length - 1];
    $("#range-from").value = state.range.from;
    $("#range-to").value = state.range.to;
    $("#year-chips").innerHTML = DATA.years.map((yr) => `<button type="button" class="chip" data-year="${yr}" aria-pressed="false">${yr}</button>`).join("");
    state.years = spreadYears();

    $$("[data-glyph]").forEach((el) => {
      el.innerHTML = classGlyph(el.dataset.glyph, 16);
    });
    $$("[data-period-span]").forEach((el) => {
      const p = PERIODS.find((x) => x.id === el.dataset.periodSpan);
      el.textContent = `${MONTHS[keyToIdx(p.from) % 12]} ${p.from.slice(2, 4)}–${MONTHS[keyToIdx(p.to) % 12]} ${p.to.slice(2, 4)}`;
    });

    $$("[data-view]").forEach((b) =>
      b.addEventListener("click", () => {
        state.view = b.dataset.view;
        if (state.view !== "timeline") state.projection = false;
        syncControls();
        renderPrimary();
      }),
    );
    $("#proj-toggle").addEventListener("click", () => {
      state.projection = !state.projection;
      if (state.projection) {
        state.view = "timeline";
        state.display = "chart";
      }
      syncControls();
      renderPrimary();
    });
    $$("[data-display]").forEach((b) =>
      b.addEventListener("click", () => {
        state.display = b.dataset.display;
        syncControls();
        renderPrimary();
      }),
    );
    $$("[data-series]").forEach((i) =>
      i.addEventListener("change", () => {
        state.series[i.dataset.series] = i.checked;
        renderPrimary();
      }),
    );
    const PRESETS = { phone: ["phone", "phoneHs"], tablet: ["tablet", "tabletHs"], hotspot: ["phoneHs", "tabletHs"], all: ALL_KEYS };
    $$("[data-preset]").forEach((b) =>
      b.addEventListener("click", () => {
        ALL_KEYS.forEach((k) => {
          state.series[k] = PRESETS[b.dataset.preset].includes(k);
        });
        syncControls();
        renderPrimary();
      }),
    );
    $$("[data-range]").forEach((b) =>
      b.addEventListener("click", () => {
        state.range.mode = b.dataset.range;
        renderAll();
      }),
    );
    ["#range-from", "#range-to"].forEach((id) =>
      $(id).addEventListener("change", () => {
        state.range.from = +$("#range-from").value;
        state.range.to = +$("#range-to").value;
        if (state.range.from > state.range.to) {
          [state.range.from, state.range.to] = [state.range.to, state.range.from];
          $("#range-from").value = state.range.from;
          $("#range-to").value = state.range.to;
        }
        renderAll();
      }),
    );
    $("#year-chips").addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      const yr = +b.dataset.year;
      state.years = state.years.includes(yr) ? state.years.filter((y) => y !== yr) : [...state.years, yr];
      syncControls();
      renderPrimary();
    });
    $$("[data-years]").forEach((b) =>
      b.addEventListener("click", () => {
        const v = b.dataset.years;
        state.years = v === "all" ? DATA.years.slice() : v === "none" ? [] : v === "recent" ? DATA.years.slice(-3) : spreadYears();
        syncControls();
        renderPrimary();
      }),
    );
    $$("[data-exclude]").forEach((i) =>
      i.addEventListener("change", () => {
        state.exclude[i.dataset.exclude] = i.checked;
        renderAll();
      }),
    );
    $$("[data-notes]").forEach((i) =>
      i.addEventListener("change", () => {
        state.notes[i.dataset.notes] = i.checked;
        renderPrimary();
      }),
    );

    // Header: devices
    $$("[data-devices]").forEach((b) =>
      b.addEventListener("click", () => {
        state.devices = b.dataset.devices;
        store.set("devices", state.devices);
        renderAll();
      }),
    );

    // Header: carrier radiogroup (one tab stop, arrow keys move the selection)
    const order = ["sprint", "both", "verizon"];
    const setCarrier = (c) => {
      state.carrier = c;
      store.set("carrier", c);
      renderAll();
      $(`[data-carrier="${c}"]`).focus();
    };
    $$("[data-carrier]").forEach((b) => {
      b.addEventListener("click", () => setCarrier(b.dataset.carrier));
      b.addEventListener("keydown", (e) => {
        const j = order.indexOf(state.carrier);
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          setCarrier(order[Math.min(order.length - 1, j + 1)]);
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          setCarrier(order[Math.max(0, j - 1)]);
        }
      });
    });

    // Header: theme
    const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    const current = () => document.documentElement.getAttribute("data-theme") || (prefersLight ? "light" : "dark");
    const syncTheme = () => $$("[data-theme-set]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeSet === current())));
    $$("[data-theme-set]").forEach((b) =>
      b.addEventListener("click", () => {
        document.documentElement.setAttribute("data-theme", b.dataset.themeSet);
        store.set("theme", b.dataset.themeSet);
        syncTheme();
      }),
    );
    syncTheme();

    // Re-draw the chart when its well changes width (window resize, tablet rotation)
    let lastW = 0,
      raf = 0;
    new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w === lastW) return;
      lastW = w;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(renderPrimary);
    }).observe($("#chart-well"));
  }

  /* =====================================================================
     Embedded copy of the CSV files, used only when they cannot be fetched
     (for example when the page is opened from disk). Regenerate when the CSVs change.
     ===================================================================== */
  const EMBEDDED = {
    usage: `,,2016-Jan,2016-Feb,2016-Mar,2016-Apr,2016-May,2016-Jun,2016-Jul,2016-Aug,2016-Sept,2016-Oct,2016-Nov,2016-Dec,2017-Jan,2017-Feb,2017-Mar,2017-Apr,2017-May,2017-Jun,2017-Jul,2017-Aug,2017-Sept,2017-Oct,2017-Nov,2017-Dec,2018-Jan,2018-Feb,2018-Mar,2018-Apr,2018-May,2018-Jun,2018-Jul,2018-Aug,2018-Sept,2018-Oct,2018-Nov,2018-Dec,2019-Jan,2019-Feb,2019-Mar,2019-Apr,2019-May,2019-Jun,2019-Jul,2019-Aug,2019-Sept,2019-Oct,2019-Nov,2019-Dec,2020-Jan,2020-Feb,2020-Mar,2020-Apr,2020-May,2020-Jun,2020-Jul,2020-Aug,2020-Sept,2020-Oct,2020-Nov,2020-Dec,2021-Jan,2021-Feb,2021-Mar,2021-Apr,2021-May,2021-Jun,2021-Jul,2021-Aug,2021-Sept,2021-Oct,2021-Nov,2021-Dec,2022-Jan,2022-Feb,2022-Mar,2022-Apr,2022-May,2022-Jun,2022-Jul,2022-Aug,2022-Sept,2022-Oct,2022-Nov,2022-Dec,2023-Jan,2023-Feb,2023-Mar,2023-Apr,2023-May,2023-Jun,2023-Jul,2023-Aug,2023-Sept,2023-Oct,2023-Nov,2023-Dec,2024-Jan,2024-Feb,2024-Mar,2024-Apr,2024-May,2024-Jun,2024-Jul,2024-Aug,2024-Sept,2024-Oct,2024-Nov,2024-Dec,2025-Jan,2025-Feb,2025-Mar,2025-Apr,2025-May,2025-Jun,2025-Jul,2025-Aug,2025-Sept,2025-Oct,2025-Nov,2025-Dec,2026-Jan,2026-Feb,2026-Mar,2026-Apr,2026-May,2026-Jun,2026-Jul,2026-Aug,2026-Sept,2026-Oct,2026-Nov,2026-Dec,2027-Jan,2027-Feb,2027-Mar,2027-Apr,2027-May,2027-Jun,2027-Jul,2027-Aug,2027-Sept,2027-Oct,2027-Nov,2027-Dec
Device-ID,Carrier,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon
P1,iPhone-6s,0.00,9.00,5.00,4.60,3.60,5.40,8.90,3.10,1.40,2.10,3.20,6.20,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
P2,iPhone-7,,,,,,,,,,,,,2.40,3.70,3.90,5.00,5.30,5.90,4.90,5.50,8.10,4.80,3.90,6.20,4.00,4.10,3.70,5.00,5.30,5.90,4.90,5.50,8.10,7.60,8.30,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
P3,iPhone-XS,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,10.10,12.30,10.20,8.10,10.10,8.70,10.00,9.80,10.20,10.80,9.30,17.60,12.50,12.50,12.70,13.60,10.70,2.10,2.40,10.20,3.40,1.60,8.20,12.80,5.20,5.00,3.20,3.60,6.20,7.00,8.20,1.80,5.90,10.30,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
P4,iPhone-13-Pro,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,4.80,14.60,12.20,16.10,12.70,10.50,16.70,20.20,16.40,15.80,9.10,21.40,18.50,18.40,14.50,9.90,14.30,13.50,15.30,16.80,23.30,12.40,19.60,16.60,24.00,18.20,0.00,106.00,78.40,60.20,14.00,11.70,20.60,9.46,13.20,14.60,19.40,17.80,18.50,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
P5,iPhone-16-Pro-Max,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,29.30,23.50,28.30,27.00,30.30,27.60,23.00,29.00,25.50,25.70,30.20,17.00,17.90,8.27,14.80,12.60,28.40,20.00,15.40,7.42,21.40,25.90,,,,,,,,,,,,,,
P-hotspot,iPhone-Hotspot,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,0.08,4.00,0.00,0.70,1.10,3.00,0.04,0.00,0.00,4.20,0.00,0.00,4.80,7.80,1.10,0.47,0.20,0.33,0.95,0.70,0.00,0.12,0.35,0.20,0.43,0.70,0.20,1.40,3.70,1.70,2.10,0.90,3.90,1.70,0.20,2.50,0.00,0.80,0.40,0.00,0.30,0.13,1.60,3.50,4.40,1.70,0.00,0.40,2.40,2.21,0.00,90.90,63.80,49.30,141.00,0.00,8.80,0.00,0.00,0.73,0.70,0.00,2.29,0.10,0.80,1.00,0.94,0.00,0.00,0.00,0.00,2.99,0.00,3.04,0.00,0.00,1.22,3.43,0.00,0.60,3.67,0.85,0.90,10.00,4.45,,,,,,,,,,,,,,
T1,iPad-Pro-11,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,4.30,7.30,6.40,4.40,8.30,8.20,12.80,7.40,5.10,6.10,12.50,5.70,9.60,5.40,0.01,0.30,0.20,7.90,0.20,0.80,0.50,1.00,5.50,3.40,3.60,1.20,4.20,6.50,3.50,5.40,0.57,0.53,1.80,1.50,0.80,1.20,1.90,0.70,1.30,4.70,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
T2,iPad-Air,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,0.00,2.00,5.60,6.40,1.00,2.70,3.50,1.10,2.20,1.40,1.40,2.20,2.30,5.50,4.00,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
T3,iPad-Pro-12.9,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,4.00,6.11,5.48,0.00,3.49,3.42,2.26,3.36,6.00,3.81,1.65,3.54,3.24,7.69,9.34,20.00,3.65,6.19,4.60,4.86,4.94,4.23,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,,,,,,,,,,,,
T-hotspot,iPad-Hotspot,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,3.70,9.00,4.90,2.60,1.80,3.60,0.00,3.50,2.70,0.00,0.00,0.00,5.60,0.00,0.80,0.50,1.00,5.50,0.63,3.50,0.98,3.10,4.80,3.20,0.25,0.39,0.53,1.80,1.50,0.80,0.00,0.22,0.00,0.00,0.08,0.00,0.80,1.00,0.00,0.00,0.20,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.40,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,5.28,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,,,,,,,,,,,,`,
    status: `,,2016-Jan,2016-Feb,2016-Mar,2016-Apr,2016-May,2016-Jun,2016-Jul,2016-Aug,2016-Sept,2016-Oct,2016-Nov,2016-Dec,2017-Jan,2017-Feb,2017-Mar,2017-Apr,2017-May,2017-Jun,2017-Jul,2017-Aug,2017-Sept,2017-Oct,2017-Nov,2017-Dec,2018-Jan,2018-Feb,2018-Mar,2018-Apr,2018-May,2018-Jun,2018-Jul,2018-Aug,2018-Sept,2018-Oct,2018-Nov,2018-Dec,2019-Jan,2019-Feb,2019-Mar,2019-Apr,2019-May,2019-Jun,2019-Jul,2019-Aug,2019-Sept,2019-Oct,2019-Nov,2019-Dec,2020-Jan,2020-Feb,2020-Mar,2020-Apr,2020-May,2020-Jun,2020-Jul,2020-Aug,2020-Sept,2020-Oct,2020-Nov,2020-Dec,2021-Jan,2021-Feb,2021-Mar,2021-Apr,2021-May,2021-Jun,2021-Jul,2021-Aug,2021-Sept,2021-Oct,2021-Nov,2021-Dec,2022-Jan,2022-Feb,2022-Mar,2022-Apr,2022-May,2022-Jun,2022-Jul,2022-Aug,2022-Sept,2022-Oct,2022-Nov,2022-Dec,2023-Jan,2023-Feb,2023-Mar,2023-Apr,2023-May,2023-Jun,2023-Jul,2023-Aug,2023-Sept,2023-Oct,2023-Nov,2023-Dec,2024-Jan,2024-Feb,2024-Mar,2024-Apr,2024-May,2024-Jun,2024-Jul,2024-Aug,2024-Sept,2024-Oct,2024-Nov,2024-Dec,2025-Jan,2025-Feb,2025-Mar,2025-Apr,2025-May,2025-Jun,2025-Jul,2025-Aug,2025-Sept,2025-Oct,2025-Nov,2025-Dec,2026-Jan,2026-Feb,2026-Mar,2026-Apr,2026-May,2026-Jun,2026-Jul,2026-Aug,2026-Sept,2026-Oct,2026-Nov,2026-Dec,2027-Jan,2027-Feb,2027-Mar,2027-Apr,2027-May,2027-Jun,2027-Jul,2027-Aug,2027-Sept,2027-Oct,2027-Nov,2027-Dec
Device-ID,Carrier,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Sprint,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon,Verizon
P1,iPhone-6s,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,,,,,,,,,,,,
P2,iPhone-7,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,,,,,,,,,,,,
P3,iPhone-XS,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,,,,,,,,,,,,
P4,iPhone-13-Pro,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,,,,,,,,,,,,
P5,iPhone-16-Pro-Max,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,,,,,,,,,,,,
P-hotspot,iPhone-Hotspot,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,,,,,,,,,,,,
T1,iPad-Pro-11,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,2.00,2.00,2.00,2.00,2.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,,,,,,,,,,,,
T2,iPad-Air-10.9-Gen5,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,2.00,1.00,1.00,1.00,2.00,1.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,,,,,,,,,,,,
T3,iPad-Pro-12.9-Gen6,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,,,,,,,,,,,,
T-hotspot,iPad-Hotspot,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,2.00,2.00,2.00,2.00,2.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,2.00,1.00,1.00,1.00,2.00,1.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,2.00,,,,,,,,,,,,`,
  };

  /* =====================================================================
     Start
     ===================================================================== */
  async function start() {
    const src = await load();
    DATA = build(src.usage, src.status);
    bindControls();
    bindChart();
    renderMethod();
    renderAll();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
