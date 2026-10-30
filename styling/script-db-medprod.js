/* ==========================================================================
   Course media production dashboard
   1. Constants            4. Chart engine (SVG + tables)
   2. Data + derivation    5. Cards
   3. Filters + grouping   6. Init
   The tracker CSV is embedded at the end of this file (CSV_TEXT) so the page
   works when opened straight from disk. To refresh the data, replace that block.
   ========================================================================== */
"use strict";

/* ==========================================================================
   1. Constants
   ========================================================================== */
const TERM_ORDER = { Spring: 0, Summer: 1, Fall: 2 };
const TERM_CODE = { Spring: "SP", Summer: "SU", Fall: "FA" };
const COLLEGES = ["CCAS", "ESIA", "GSEHD", "GWSB", "LAW"];
const COLLEGE_NAMES = {
  CCAS: "Columbian College of Arts and Sciences",
  ESIA: "Elliott School of International Affairs",
  GSEHD: "Graduate School of Education and Human Development",
  GWSB: "George Washington School of Business",
  LAW: "George Washington Law School",
};
const MPS = ["MP1", "MP2", "MP3", "MP4", "MP5", "MP6"];
const TARGET = { video: 30, podcast: 5 };
const WFH_AY = 2020;
const EVENTS = [
  { key: "A", term: "FA21", ay: 2021, label: "Fall 2021: new workflow, data capture and target dates" },
  { key: "B", term: "SP22", ay: 2021, label: "Spring 2022: video-time caps no longer communicated" },
  { key: "C", term: "FA24", ay: 2024, label: "Fall 2024: new manager; IDs take on media work; two MPs remain" },
];
const GAP = 2; // K3: surface gap between touching marks

// Column positions in the tracker (several headers repeat, so index by position)
const COL = {
  status: 0,
  level: 1,
  year: 2,
  term: 3,
  college: 4,
  program: 5,
  number: 6,
  course: 7,
  faculty: 8,
  pm: 9,
  videoMP: 10,
  work1: 11,
  work2: 12,
  id1: 13,
  id2: 14,
  start: 17,
  target: 18,
  end: 19,
  plusMinus: 20,
  p2Weeks: 21,
  location: 24,
  p3Work: 25,
  videoWork: 27,
  videoCount: 28,
  videoMin: 29,
  podWork: 32,
  podCount: 33,
  podMin: 34,
  scripts: 39,
  docs: 40,
  graphics: 41,
  anims: 42,
  costPeople: 43,
  rates: 47,
  p2Hours: 51,
  studioHours: 52,
  prodHours: 54,
  materials: 59,
};

// Colors are resolved from the CSS tokens at init (C6: one source of truth)
const C = {};
function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function loadColors() {
  ["--media-video", "--media-podcast", "--media-graphics", "--media-documents", "--media-animation", "--cost-1", "--cost-2", "--cost-3", "--cost-4", "--cost-5", "--mp-speed", "--n-1", "--n-5", "--n-6", "--n-7", "--n-8"].forEach((t) => {
    C[t.slice(2)] = token(t);
  });
}
function media() {
  return [
    { key: "video", label: "Video", color: C["media-video"] },
    { key: "podcast", label: "Podcasts", color: C["media-podcast"] },
    { key: "graphics", label: "Graphics", color: C["media-graphics"] },
    { key: "docs", label: "Documents", color: C["media-documents"] },
    { key: "anims", label: "Animations", color: C["media-animation"] },
  ];
}
// Phases are identified by position and label; neutral steps only (style guide §1)
function phases() {
  return [
    { key: "design", label: "Phase 2 · design", color: C["n-5"] },
    { key: "studio", label: "Phase 3 · recording", color: C["n-6"] },
    { key: "post", label: "Phase 3 · post-production", color: C["n-8"] },
  ];
}
function costParts() {
  return [
    { key: "materials", label: "Materials", color: C["cost-1"] },
    { key: "design", label: "Phase 2 · design", color: C["cost-2"] },
    { key: "rec", label: "Phase 3 · recording", color: C["cost-3"] },
    { key: "prod", label: "Phase 3 · production", color: C["cost-4"] },
  ];
}

/* ==========================================================================
   2. Data + derivation
   ========================================================================== */
function parseCSV(text) {
  const rows = [];
  let row = [],
    f = "",
    q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(f);
      f = "";
    } else if (c === "\n") {
      row.push(f);
      rows.push(row);
      row = [];
      f = "";
    } else if (c !== "\r") f += c;
  }
  if (f || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1);
}
const num = (s) => {
  const v = parseFloat(String(s).replace(/[$,\s]/g, ""));
  return isNaN(v) ? 0 : v;
};
const hms = (s) => {
  const [h, m, x] = String(s).split(":").map(Number);
  return (h || 0) + (m || 0) / 60 + (x || 0) / 3600;
};
const toDate = (s) => {
  if (!s || s === "none") return null;
  const [m, d, y] = s.split("/").map(Number);
  return new Date(2000 + y, m - 1, d);
};
const ayLabel = (ay) => `${ay}–${String(ay + 1).slice(2)}`;

function buildProjects(rows) {
  const recs = rows.map((r, i) => ({ r, i, ti: +r[COL.year] * 3 + TERM_ORDER[r[COL.term]] })).sort((a, b) => a.ti - b.ti || a.i - b.i);
  const lastRate = {}; // most recent hourly rate seen for each MP, in time order
  return recs.map(({ r, i, ti }) => {
    const people = r.slice(COL.costPeople, COL.costPeople + 4);
    const rates = r.slice(COL.rates, COL.rates + 4).map(num);
    let rateImputed = false;
    people.forEach((p, k) => {
      if (p === "none") return;
      if (rates[k] > 0) lastRate[p] = rates[k];
      else if (lastRate[p]) rateImputed = true;
    });
    const rateOf = (p) => (p === "none" ? 0 : lastRate[p] || 0);
    const [cpm, cvid, cw1, cw2] = people;

    const year = +r[COL.year],
      term = r[COL.term];
    const ay = term === "Fall" ? year : year - 1;
    const p3Work = hms(r[COL.p3Work]);
    const p2Hours = num(r[COL.p2Hours]);
    const studioHours = num(r[COL.studioHours]);

    // Cost rebuild — same formula as the tracker; fills blanks from SP24 onward
    const recordedProdHours = num(r[COL.prodHours]);
    const prodHours = recordedProdHours || Math.ceil(p3Work * 4) / 4;
    let workers = [cw1, cw2].filter((p) => p !== "none" && rateOf(p) > 0).map(rateOf);
    if (!workers.length) workers = [rateOf(cvid) || rateOf(cpm)];
    const cost = {
      design: p2Hours * rateOf(cpm),
      rec: studioHours * rateOf(cvid),
      prod: prodHours * (workers.reduce((a, b) => a + b, 0) / workers.length),
      materials: num(r[COL.materials]),
    };
    cost.total = cost.design + cost.rec + cost.prod + cost.materials;

    const start = toDate(r[COL.start]),
      target = toDate(r[COL.target]);
    let end = toDate(r[COL.end]);
    if (end < start) end = new Date(end.getFullYear() + 1, end.getMonth(), end.getDate()); // logged-year typo
    const videoMin = num(r[COL.videoMin]),
      podMin = num(r[COL.podMin]);
    const videoWork = hms(r[COL.videoWork]),
      podWork = hms(r[COL.podWork]);
    const vidMP = r[COL.videoMP],
      w1 = r[COL.work1];

    return {
      id: i,
      completed: r[COL.status] === "Completed",
      level: r[COL.level],
      year,
      term,
      ay,
      ayLabel: ayLabel(ay),
      termIdx: ti,
      termKey: TERM_CODE[term] + String(year).slice(2),
      termName: `${term} ${year}`,
      college: r[COL.college],
      program: r[COL.program],
      number: r[COL.number],
      course: r[COL.course],
      pm: r[COL.pm],
      videoMP: vidMP,
      work1: w1,
      work2: r[COL.work2],
      id1: r[COL.id1],
      id2: r[COL.id2],
      lead: vidMP !== "none" ? vidMP : w1 !== "none" ? w1 : r[COL.pm],
      start,
      target,
      end,
      days: Math.round((end - start) / 864e5),
      hasTarget: !!target,
      plusMinus: num(r[COL.plusMinus]),
      p2Weeks: num(r[COL.p2Weeks]),
      p2Hours,
      studioHours,
      p3Work,
      location: r[COL.location],
      videoCount: videoMin > 0 ? num(r[COL.videoCount]) : 0,
      videoMin,
      videoWork,
      podCount: podMin > 0 ? num(r[COL.podCount]) : 0,
      podMin,
      podWork,
      videoRatio: videoMin > 0 ? (videoWork * 60) / videoMin : null,
      podRatio: podMin > 0 ? (podWork * 60) / podMin : null,
      scripts: r[COL.scripts],
      docs: num(r[COL.docs]),
      graphics: num(r[COL.graphics]),
      anims: num(r[COL.anims]),
      hours: p2Hours + studioHours + p3Work,
      cost,
      estimated: rateImputed || (!recordedProdHours && p3Work > 0),
    };
  });
}

let ALL = []; // every tracker row
let BASE = []; // completed projects only

/* ==========================================================================
   3. Filters, grouping, aggregation
   ========================================================================== */
const FILTERS = { year: "all", college: "all", media: "all", cost: "all" };

function passes(p) {
  const f = FILTERS;
  if (f.year !== "all" && p.ay !== +f.year) return false;
  if (f.college !== "all" && p.college !== f.college) return false;
  if (f.media === "video" && !(p.videoMin > 0)) return false;
  if (f.media === "podcast" && !(p.podMin > 0)) return false;
  if (f.media === "both" && !(p.videoMin > 0 && p.podMin > 0)) return false;
  if (f.media === "extra" && !(p.docs + p.graphics + p.anims > 0)) return false;
  const c = p.cost.total;
  if (f.cost === "lt1k" && !(c < 1000)) return false;
  if (f.cost === "1to5k" && !(c >= 1000 && c <= 5000)) return false;
  if (f.cost === "gt5k" && !(c > 5000)) return false;
  return true;
}
const filtered = () => BASE.filter(passes);

const uniq = (a) => [...new Set(a)];
const sumBy = (list, f) => list.reduce((a, p) => a + f(p), 0);
function median(a) {
  const s = a.filter((v) => v != null && !isNaN(v)).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* Category universe for a dimension. Time axes keep every term/year in the
   (year-filtered) data so gaps stay visible when other filters thin the list. */
function groups(dim, list, opts = {}) {
  const universe = BASE.filter((p) => FILTERS.year === "all" || p.ay === +FILTERS.year);
  let keys;
  if (dim === "year") {
    keys = uniq(universe.map((p) => p.ay))
      .sort()
      .map((ay) => ({
        key: ay,
        label: ayLabel(ay),
        name: `Academic year ${ayLabel(ay)}`,
        ay,
        match: (p) => p.ay === ay,
      }));
  } else if (dim === "term") {
    const seen = new Map();
    universe.forEach((p) => seen.set(p.termIdx, p));
    keys = [...seen.keys()]
      .sort((a, b) => a - b)
      .map((ti) => {
        const p = seen.get(ti);
        return { key: p.termKey, label: p.termKey, name: p.termName, group: p.ayLabel, ay: p.ay, ti, match: (q) => q.termIdx === ti };
      });
    if (opts.fromTerm != null) keys = keys.filter((k) => k.ti >= opts.fromTerm);
  } else {
    keys = COLLEGES.map((c) => ({ key: c, label: c, name: COLLEGE_NAMES[c], match: (p) => p.college === c }));
  }
  return keys.map((k) => ({ ...k, items: list.filter(k.match) }));
}

function agg(list) {
  const n = list.length;
  const s = (f) => sumBy(list, f);
  const videoMin = s((p) => p.videoMin),
    podMin = s((p) => p.podMin);
  const videoWork = s((p) => (p.videoMin > 0 ? p.videoWork : 0));
  const podWork = s((p) => (p.podMin > 0 ? p.podWork : 0));
  const tgt = list.filter((p) => p.hasTarget);
  const vids = list.filter((p) => p.videoRatio != null),
    pods = list.filter((p) => p.podRatio != null);
  return {
    n,
    video: s((p) => p.videoCount),
    podcast: s((p) => p.podCount),
    graphics: s((p) => p.graphics),
    docs: s((p) => p.docs),
    anims: s((p) => p.anims),
    videoMin,
    podMin,
    finalMin: videoMin + podMin,
    videoRatio: videoMin ? (videoWork * 60) / videoMin : null,
    podRatio: podMin ? (podWork * 60) / podMin : null,
    vidN: vids.length,
    vidHit: vids.filter((p) => p.videoRatio <= TARGET.video).length,
    podN: pods.length,
    podHit: pods.filter((p) => p.podRatio <= TARGET.podcast).length,
    design: s((p) => p.p2Hours),
    studio: s((p) => p.studioHours),
    post: s((p) => p.p3Work),
    hours: s((p) => p.hours),
    p2Weeks: s((p) => p.p2Weeks),
    days: n ? s((p) => p.days) / n : null,
    targetN: tgt.length,
    onTarget: tgt.filter((p) => p.plusMinus <= 0).length,
    cost: {
      design: s((p) => p.cost.design),
      rec: s((p) => p.cost.rec),
      prod: s((p) => p.cost.prod),
      materials: s((p) => p.cost.materials),
      total: s((p) => p.cost.total),
    },
    estimated: list.filter((p) => p.estimated).length,
  };
}

/* WFH band and event markers for time axes */
function timeDecor(G, dim) {
  if (dim === "college") return {};
  const idx = G.map((g, i) => (g.ay === WFH_AY ? i : -1)).filter((i) => i >= 0);
  const bands = idx.length ? [{ from: idx[0], to: idx[idx.length - 1], label: "WFH" }] : [];
  const markers = [];
  EVENTS.forEach((e) => {
    const i = G.findIndex((g) => (dim === "term" ? g.key === e.term : g.ay === e.ay));
    if (i <= 0) return;
    const ex = markers.find((m) => m.i === i);
    if (ex) ex.label += " " + e.key;
    else markers.push({ i, label: e.key });
  });
  return { bands, markers };
}
function eventsFoot(G, dim) {
  if (dim === "college") return "";
  const parts = [];
  if (G.some((g) => g.ay === WFH_AY)) parts.push('<span class="key">WFH</span> work-from-home period');
  EVENTS.forEach((e) => {
    if (G.some((g) => (dim === "term" ? g.key === e.term : g.ay === e.ay))) parts.push(`<span class="key">${e.key}</span> ${e.label}`);
  });
  return parts.join(" &nbsp;·&nbsp; ");
}

/* ==========================================================================
   Formatting
   ========================================================================== */
const fmt = {
  int: (v) => (v == null ? "—" : Math.round(v).toLocaleString("en-US")),
  d1: (v) => (v == null ? "—" : (+v).toLocaleString("en-US", { maximumFractionDigits: 1 })),
  money: (v) => (v == null ? "—" : "$" + Math.round(v).toLocaleString("en-US")),
  moneyC(v) {
    if (v == null) return "—";
    const a = Math.abs(v);
    if (a >= 1e6) return "$" + trim(v / 1e6, 1) + "M";
    if (a >= 1e3) return "$" + trim(v / 1e3, a >= 1e4 ? 0 : 1) + "K";
    return "$" + trim(v, a < 10 ? 2 : 0);
  },
  numC(v) {
    if (v == null) return "—";
    const a = Math.abs(v);
    if (a >= 1e3) return trim(v / 1e3, a >= 1e4 ? 0 : 1) + "K";
    return trim(v, a < 10 ? 1 : 0);
  },
  hours: (v) => (v == null ? "—" : fmt.d1(v) + " h"),
  pct: (v) => (v == null ? "—" : Math.round(v * 100) + "%"),
  days: (v) => (v == null ? "—" : Math.round(v) + " d"),
  signed: (v) => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(Math.round(v)),
};
function trim(v, d) {
  return (+v.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d });
}
function delta(a, b) {
  if (a == null || b == null || !a) return "";
  const r = (b - a) / a;
  if (Math.abs(r) < 0.005) return "■ no change";
  return (r < 0 ? "▼ " : "▲ ") + Math.round(Math.abs(r) * 100) + "%";
}
// Signed percentage change for running text, e.g. "−58%"
function pctChange(a, b) {
  if (!a || b == null) return "—";
  const r = (b - a) / a;
  return (r < 0 ? "−" : "+") + Math.round(Math.abs(r) * 100) + "%";
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/* ==========================================================================
   4. Chart engine
   ========================================================================== */
const NS = "http://www.w3.org/2000/svg";
function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function text(parent, x, y, s, cls, anchor = "middle") {
  const t = el("text", { x, y, class: cls, "text-anchor": anchor }, parent);
  t.textContent = s;
  return t;
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
function linearTicks(min, max, count = 4) {
  if (max <= min) max = min + 1;
  const step = niceStep((max - min) / count);
  const lo = Math.floor(min / step) * step,
    hi = Math.ceil(max / step) * step;
  const t = [];
  for (let v = lo; v <= hi + step / 2; v += step) t.push(+v.toFixed(10));
  return t;
}
// K1: 4px rounded data end, square at the baseline
function barUp(x, y, w, h, r = 4) {
  if (h <= 0) return "";
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function barRight(x, y, w, h, r = 4) {
  if (w <= 0) return "";
  r = Math.min(r, w, h / 2);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}
const rectPath = (x, y, w, h) => (h > 0 && w > 0 ? `M${x},${y}h${w}v${h}h${-w}Z` : "");

/* Tooltip (K11, G5): hover, focus and tap all open it */
const tip = {
  node: null,
  show(html, x, y) {
    const n = this.node;
    n.innerHTML = html;
    n.hidden = false;
    this.move(x, y);
  },
  move(x, y) {
    const n = this.node;
    if (n.hidden) return;
    const r = n.getBoundingClientRect(),
      pad = 14;
    let left = x + pad,
      top = y + pad;
    if (left + r.width > innerWidth - 8) left = x - r.width - pad;
    if (top + r.height > innerHeight - 8) top = y - r.height - pad;
    n.style.left = Math.max(8, left) + "px";
    n.style.top = Math.max(8, top) + "px";
  },
  hide() {
    this.node.hidden = true;
  },
};
function tipHTML(title, sub, rows, note) {
  return `<div class="tooltip__title">${esc(title)}</div>` + (sub ? `<div class="tooltip__sub">${esc(sub)}</div>` : "") + rows.map((r) => `<div class="tooltip__row"><span class="tooltip__label">${r.color ? `<span class="swatch" style="background:${r.color}"></span>` : ""}${esc(r.label)}</span><span class="tooltip__value">${esc(r.value)}</span></div>`).join("") + (note ? `<div class="tooltip__note">${esc(note)}</div>` : "");
}
function bindTip(node, htmlFn, svg, col, focusable = true) {
  const on = () => {
    if (col) {
      svg.classList.add("is-hovering");
      col.classList.add("is-active");
    }
  };
  const off = () => {
    if (col) {
      svg.classList.remove("is-hovering");
      col.classList.remove("is-active");
    }
    tip.hide();
  };
  if (focusable) node.setAttribute("tabindex", "0");
  const plain = document.createElement("div");
  plain.innerHTML = htmlFn();
  node.setAttribute("aria-label", plain.innerText || plain.textContent);
  node.setAttribute("role", "img");
  node.addEventListener("pointerenter", (e) => {
    on();
    tip.show(htmlFn(), e.clientX, e.clientY);
  });
  node.addEventListener("pointermove", (e) => tip.move(e.clientX, e.clientY));
  node.addEventListener("pointerleave", off);
  node.addEventListener("focus", () => {
    const b = node.getBoundingClientRect();
    on();
    tip.show(htmlFn(), b.left + b.width / 2, b.top);
  });
  node.addEventListener("blur", off);
}

/* Spread direct labels so they don't collide */
function spreadLabels(items, minGap, lo, hi) {
  items.sort((a, b) => a.y - b.y);
  for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < minGap) items[i].y = items[i - 1].y + minGap;
  const over = items.length ? items[items.length - 1].y - hi : 0;
  if (over > 0)
    items.forEach((it) => {
      it.y -= over;
    });
  items.forEach((it) => {
    it.y = Math.max(lo, it.y);
  });
  return items;
}

function drawTimeFrame(svg, m, mg, band, ih, H) {
  (m.bands || []).forEach((b) => {
    const x0 = mg.l + b.from * band,
      x1 = mg.l + (b.to + 1) * band;
    el("rect", { x: x0, y: mg.t - 22, width: x1 - x0, height: ih + 22, class: "band" }, svg);
    text(svg, x0 + 6, mg.t - 8, b.label, "band-label", "start");
  });
  const cats = m.categories;
  for (let i = 1; i < cats.length; i++) {
    if (cats[i].group && cats[i].group !== cats[i - 1].group) {
      const x = mg.l + i * band;
      el("line", { x1: x, x2: x, y1: mg.t, y2: H - 4, class: "divider" }, svg);
    }
  }
  if (cats.some((c) => c.group)) {
    let s = 0;
    for (let i = 1; i <= cats.length; i++) {
      if (i === cats.length || cats[i].group !== cats[s].group) {
        const cx = mg.l + ((s + i) / 2) * band;
        if ((i - s) * band > 44) text(svg, cx, H - 8, cats[s].group, "tick group-label");
        s = i;
      }
    }
  }
  (m.markers || []).forEach((mk) => {
    const x = mg.l + mk.i * band;
    el("line", { x1: x, x2: x, y1: mg.t - 22, y2: mg.t + ih, class: "marker-line" }, svg);
    text(svg, x + 5, mg.t - 8, mk.label, "marker-label", "start");
  });
}
function xLabels(svg, cats, mg, band, ih) {
  const every = band >= 34 ? 1 : band >= 18 ? 2 : 0;
  if (!every) return;
  cats.forEach((c, i) => {
    if (i % every) return;
    text(svg, mg.l + band * (i + 0.5), mg.t + ih + 18, c.label, "tick");
  });
}

/* Vertical bars: stacked or grouped (single series = grouped with one) */
function barChart(host, m) {
  const W = Math.max(300, host.clientWidth),
    H = m.height || 300;
  const cats = m.categories,
    S = m.series,
    n = cats.length;
  const stacked = m.mode === "stack";
  const direct = S.length > 1 && S.length <= 4; // K8
  const timeTop = (m.markers && m.markers.length) || (m.bands && m.bands.length);
  const mg = { t: (timeTop ? 30 : 12) + (m.topLabel ? 18 : 0), r: direct ? 132 : 12, b: cats.some((c) => c.group) ? 48 : 30, l: 56 };
  const iw = W - mg.l - mg.r,
    ih = H - mg.t - mg.b,
    band = iw / n;
  const val = (s, i) => (s.values[i] == null ? 0 : s.values[i]);
  const totals = cats.map((_, i) => (stacked ? S.reduce((a, s) => a + val(s, i), 0) : Math.max(0, ...S.map((s) => val(s, i)))));
  const ticks = m.yMax ? linearTicks(0, m.yMax) : linearTicks(0, Math.max(...totals, ...(m.refLines || []).map((r) => r.value), 0) || 1);
  const yMax = ticks[ticks.length - 1];
  const y = (v) => mg.t + ih - (v / yMax) * ih;

  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: "chart-svg" });
  drawTimeFrame(svg, m, mg, band, ih, H);
  ticks.forEach((t) => {
    if (t) el("line", { x1: mg.l, x2: mg.l + iw, y1: y(t), y2: y(t), class: "grid" }, svg);
    text(svg, mg.l - 8, y(t) + 4, m.yFmt(t), "tick", "end");
  });

  const cols = cats.map((c, i) => {
    const g = el("g", { class: "col" }, svg);
    const cx = mg.l + band * (i + 0.5);
    if (stacked) {
      const bw = Math.min(24, band * 0.6);
      let base = 0,
        last = -1;
      S.forEach((s, k) => {
        if (val(s, i) > 0) last = k;
      });
      S.forEach((s, k) => {
        const v = val(s, i);
        if (v <= 0) return;
        const y0 = y(base) - (base > 0 ? GAP : 0),
          y1 = y(base + v);
        base += v;
        const h = y0 - y1;
        if (h < 0.75) return;
        el("path", { d: k === last ? barUp(cx - bw / 2, y1, bw, h) : rectPath(cx - bw / 2, y1, bw, h), class: "mark", fill: s.color }, g);
      });
    } else {
      const ns = S.length;
      const bw = Math.min(24, (band * 0.72 - GAP * (ns - 1)) / ns),
        tw = ns * bw + (ns - 1) * GAP;
      S.forEach((s, k) => {
        const v = s.values[i];
        if (v == null || v <= 0) return;
        el("path", { d: barUp(cx - tw / 2 + k * (bw + GAP), y(v), bw, y(0) - y(v)), class: "mark", fill: s.color }, g);
      });
    }
    if (m.topLabel) {
      const lab = m.topLabel(i);
      if (lab) text(svg, cx, y(totals[i]) - 8, lab, "value-label");
    }
    return g;
  });
  el("line", { x1: mg.l, x2: mg.l + iw, y1: y(0), y2: y(0), class: "axis" }, svg);
  xLabels(svg, cats, mg, band, ih);

  (m.refLines || []).forEach((r) => {
    if (r.value > yMax) return;
    el("line", { x1: mg.l, x2: mg.l + iw, y1: y(r.value), y2: y(r.value), class: "ref" }, svg);
    text(svg, mg.l + iw - 4, y(r.value) - 5, r.label, "ref-label", "end");
  });

  if (direct) {
    let li = -1;
    totals.forEach((t, i) => {
      if (t > 0) li = i;
    });
    if (li >= 0) {
      let base = 0;
      const items = [];
      S.forEach((s) => {
        const v = val(s, li);
        if (stacked) {
          if (v > 0) items.push({ s, y: y(base + v / 2) + 4 });
          base += v;
        } else if (v > 0) items.push({ s, y: y(v) + 4 });
      });
      spreadLabels(items, 15, mg.t + 4, mg.t + ih).forEach((it) => {
        text(svg, mg.l + iw + 10, it.y, it.s.label, "direct-label", "start");
      });
    }
  }

  cats.forEach((c, i) => {
    const hit = el("rect", { x: mg.l + i * band, y: mg.t - (timeTop ? 22 : 0), width: band, height: ih + (timeTop ? 22 : 0), class: "hit" }, svg);
    bindTip(hit, () => m.tooltip(i), svg, cols[i]);
  });
  host.appendChild(svg);
}

/* Strip / dot plot: one dot per course, categorical x, linear or log y */
function dotChart(host, m) {
  const W = Math.max(300, host.clientWidth),
    H = m.height || 300;
  const cats = m.categories,
    n = cats.length;
  const timeTop = (m.markers && m.markers.length) || (m.bands && m.bands.length);
  const mg = { t: (timeTop ? 30 : 12) + (m.topLabel ? 18 : 0) + (m.yTitle ? 14 : 0), r: m.trend ? 48 : 12, b: cats.some((c) => c.group) ? 48 : 30, l: 56 };
  const iw = W - mg.l - mg.r,
    ih = H - mg.t - mg.b,
    band = iw / n;
  const vals = m.points.map((p) => p.v).concat((m.refLines || []).map((r) => r.value));
  let y, ticks;
  if (m.log) {
    const pos = vals.filter((v) => v > 0);
    const lo = Math.pow(10, Math.floor(Math.log10(Math.min(...pos)))),
      hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...pos))));
    const L0 = Math.log10(lo),
      L1 = Math.log10(hi);
    y = (v) => mg.t + ih - ((Math.log10(v) - L0) / (L1 - L0)) * ih;
    ticks = [];
    for (let e = L0; e <= L1; e++)
      [1, 3].forEach((k) => {
        const t = k * Math.pow(10, e);
        if (t >= lo && t <= hi) ticks.push(t);
      });
  } else {
    ticks = linearTicks(Math.min(0, ...vals), Math.max(0, ...vals), 5);
    const a = ticks[0],
      b = ticks[ticks.length - 1];
    y = (v) => mg.t + ih - ((v - a) / (b - a)) * ih;
  }
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: "chart-svg" });
  drawTimeFrame(svg, m, mg, band, ih, H);
  ticks.forEach((t) => {
    el("line", { x1: mg.l, x2: mg.l + iw, y1: y(t), y2: y(t), class: t === 0 && !m.log ? "axis" : "grid" }, svg);
    text(svg, mg.l - 8, y(t) + 4, m.yFmt(t), "tick", "end");
  });
  if (m.yTitle) text(svg, mg.l - 48, 12, m.yTitle, "axis-title", "start");
  xLabels(svg, cats, mg, band, ih);

  const cols = cats.map(() => el("g", { class: "col" }, svg));
  // Column hit areas first (keyboard + summary), dots on top (pointer detail)
  cats.forEach((c, i) => {
    const hit = el("rect", { x: mg.l + i * band, y: mg.t, width: band, height: ih, class: "hit" }, svg);
    bindTip(hit, () => m.colTip(i), svg, cols[i]);
  });
  (m.refLines || []).forEach((r) => {
    el("line", { x1: mg.l, x2: mg.l + iw, y1: y(r.value), y2: y(r.value), class: "ref" }, svg);
    text(svg, mg.l + iw - 4, y(r.value) - 5, r.label, "ref-label", "end");
  });
  const perCat = cats.map(() => 0);
  const spread = Math.min(band * 0.55, 44);
  m.points.forEach((p) => {
    if (m.log && !(p.v > 0)) return;
    const j = perCat[p.ci]++;
    const off = (((j * 0.6180339) % 1) - 0.5) * spread;
    const cx = mg.l + band * (p.ci + 0.5) + off,
      cy = y(p.v);
    el("circle", { cx, cy, r: 4, class: "dot mark", fill: p.color || m.color }, cols[p.ci]);
    const h = el("circle", { cx, cy, r: 9, class: "hit" }, svg);
    bindTip(h, () => p.tip, svg, cols[p.ci], false);
  });
  // Trend line through per-column values (gaps where a column has none)
  if (m.trend) {
    const pts = m.trend.values.map((v, i) => (v > 0 ? [mg.l + band * (i + 0.5), y(v)] : null));
    const d = pts.reduce((acc, pt, i) => (pt ? acc + (pts[i - 1] ? "L" : "M") + pt[0] + " " + pt[1] : acc), "");
    el("path", { d, class: "trend-halo" }, svg);
    el("path", { d, class: "trend" }, svg);
    pts.forEach((pt) => pt && el("circle", { cx: pt[0], cy: pt[1], r: 3, class: "trend-node" }, svg));
    const last = pts.filter(Boolean).pop();
    if (last) text(svg, last[0] + 8, last[1] + 4, m.trend.label, "ref-label", "start");
  }
  if (m.topLabel)
    cats.forEach((c, i) => {
      const lab = m.topLabel(i);
      if (lab) text(svg, mg.l + band * (i + 0.5), mg.t - 8, lab, "value-label");
    });
  host.appendChild(svg);
}

/* Horizontal bars */
function hbarChart(host, m) {
  const rows = m.rows,
    rowH = m.rowH || 36;
  const W = Math.max(280, host.clientWidth),
    H = rows.length * rowH + 30;
  const mg = { t: 6, r: m.valueWidth || 96, b: 24, l: m.labelWidth || 120 };
  const iw = W - mg.l - mg.r;
  const maxV = Math.max(...rows.map((r) => r.value || 0), ...(m.refLines || []).map((r) => r.value), 0) || 1;
  const ticks = linearTicks(0, maxV, iw < 260 ? 2 : 4);
  const xMax = ticks[ticks.length - 1];
  const x = (v) => mg.l + (v / xMax) * iw;
  const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: "chart-svg" });
  ticks.forEach((t) => {
    el("line", { x1: x(t), x2: x(t), y1: mg.t, y2: H - mg.b, class: t ? "grid" : "axis" }, svg);
    text(svg, x(t), H - 6, m.xFmt(t), "tick");
  });
  const cols = rows.map((r, i) => {
    const g = el("g", { class: "col" }, svg);
    const yc = mg.t + rowH * (i + 0.5);
    text(svg, mg.l - 10, yc + 4, r.label, "tick group-label", "end");
    const th = Math.min(16, rowH - 12);
    if (r.value > 0) el("path", { d: barRight(x(0), yc - th / 2, x(r.value) - x(0), th), class: "mark", fill: r.color || m.color }, g);
    text(svg, x(r.value || 0) + 6, yc + 4, r.valueLabel != null ? r.valueLabel : m.xFmt(r.value), "value-label", "start");
    return g;
  });
  (m.refLines || []).forEach((r) => {
    el("line", { x1: x(r.value), x2: x(r.value), y1: mg.t, y2: H - mg.b, class: "ref" }, svg);
    text(svg, x(r.value) + 4, mg.t + 10, r.label, "ref-label", "start");
  });
  rows.forEach((r, i) => {
    const hit = el("rect", { x: 0, y: mg.t + rowH * i, width: W, height: rowH, class: "hit" }, svg);
    bindTip(hit, () => r.tip, svg, cols[i]);
  });
  host.appendChild(svg);
}

/* Tables */
function tableHTML(t) {
  const head = t.columns.map((c) => `<th scope="col" class="${c.num ? "num" : ""}">${esc(c.label)}</th>`).join("");
  const body = t.rows
    .map(
      (r) =>
        "<tr>" +
        r
          .map((v, i) => {
            const c = t.columns[i];
            return i === 0 ? `<th scope="row" class="code">${esc(v)}</th>` : `<td class="${c.num ? "num" : ""}">${esc(v)}</td>`;
          })
          .join("") +
        "</tr>",
    )
    .join("");
  return `<table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
// Standard table for a category × series model
function seriesTable(firstLabel, G, series, f, extra = []) {
  return {
    columns: [{ label: firstLabel }, { label: "Courses", num: true }, ...series.map((s) => ({ label: s.label, num: true })), ...extra.map((e) => ({ label: e.label, num: true }))],
    rows: G.map((g, i) => [g.label, g.items.length, ...series.map((s) => f(s.values[i])), ...extra.map((e) => e.value(i))]),
  };
}

/* ==========================================================================
   5. Cards
   ========================================================================== */
const ST = {
  main: { measure: "produced", dim: "year", metric: "items", basis: "total", phase: "all" },
  mix: { dim: "year" },
  length: { dim: "year" },
  phase: { phase: "all", dim: "year" },
  location: { dim: "year" },
  speed: { media: "video", dim: "year" },
  hit: { dim: "year" },
  college: { metric: "courses" },
  heat: { metric: "total" },
  costphase: { basis: "per", dim: "year" },
  costdots: { dim: "year" },
  explorer: { sort: "term", dir: 1 },
};
const DIM_OPTS = [
  ["year", "Year"],
  ["term", "Term"],
  ["college", "College"],
];
const TIME_OPTS = [
  ["year", "Year"],
  ["term", "Term"],
];
const PHASE_OPTS = [
  ["all", "All phases"],
  ["p2", "Design"],
  ["p3", "Development"],
];

const MAIN = {
  produced: {
    label: "Produced",
    metrics: [
      ["items", "Items"],
      ["minutes", "Final media time"],
    ],
    basis: [
      ["total", "Total"],
      ["per", "Per course"],
    ],
    defBasis: "total",
  },
  time: {
    label: "Time",
    metrics: [
      ["hours", "MP work hours"],
      ["days", "Days to deliver"],
      ["ratio", "Work per final minute"],
    ],
    basis: [
      ["total", "Total"],
      ["per", "Per course"],
    ],
    defBasis: "per",
  },
  cost: {
    label: "Cost",
    metrics: [["cost", "Time and materials"]],
    basis: [
      ["total", "Total"],
      ["per", "Per course"],
      ["permin", "Per final minute"],
    ],
    defBasis: "per",
  },
};

function firstLast(G, values) {
  const idx = values.map((v, i) => (v != null && G[i].items.length ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 2) return null;
  const a = idx[0],
    b = idx[idx.length - 1];
  return { a, b, va: values[a], vb: values[b], la: G[a].label, lb: G[b].label };
}
function changeSentence(what, G, values, f) {
  const fl = firstLast(G, values);
  if (!fl) return "";
  const d = delta(fl.va, fl.vb);
  return `<p class="big">${d || "—"}</p><p>${what} went from <strong>${f(fl.va)}</strong> in ${fl.la} to <strong>${f(fl.vb)}</strong> in ${fl.lb}.</p>`;
}
function shareSentence(what, G, values, f) {
  const tot = values.reduce((a, v) => a + (v || 0), 0);
  if (!tot) return "";
  let top = 0;
  values.forEach((v, i) => {
    if ((v || 0) > (values[top] || 0)) top = i;
  });
  return `<p class="big">${G[top].label} · ${fmt.pct(values[top] / tot)}</p><p>${G[top].name} accounts for the largest share of ${what}: <strong>${f(values[top])}</strong> of ${f(tot)}.</p>`;
}

/* ---------- Main card ---------- */
function buildMain() {
  const s = ST.main,
    def = MAIN[s.measure];
  const list = filtered(),
    G = groups(s.dim, list),
    A = G.map((g) => agg(g.items));
  const div = (v, a) => (s.basis === "per" ? (a.n ? v / a.n : null) : s.basis === "permin" ? (a.finalMin ? v / a.finalMin : null) : v);
  const per = s.basis === "per";
  let series,
    mode = "stack",
    yFmt,
    title,
    desc,
    refLines,
    valFmt,
    what,
    context = "";
  const phaseOn = s.measure === "cost" || (s.measure === "time" && s.metric === "hours");
  const basisOn = !(s.measure === "time" && s.metric !== "hours");

  if (s.measure === "produced" && s.metric === "items") {
    series = media().map((md) => ({ ...md, values: A.map((a) => div(a[md.key], a)) }));
    valFmt = per ? fmt.d1 : fmt.int;
    yFmt = fmt.numC;
    title = per ? "Media items per course" : "Media items produced";
    desc = "Videos, podcasts, graphics, documents and animations delivered.";
    what = per ? "Items per course" : "Items produced";
    context = `<p class="note">Videos and podcasts make up ${fmt.pct(
      sumBy(A, (a) => a.video + a.podcast) /
        Math.max(
          1,
          sumBy(A, (a) => a.video + a.podcast + a.graphics + a.docs + a.anims),
        ),
    )} of all items. Graphics, documents and animations were occasional extras.</p>`;
  } else if (s.measure === "produced") {
    series = [media()[0], media()[1]].map((md) => ({ ...md, values: A.map((a) => div(a[md.key === "video" ? "videoMin" : "podMin"] / 60, a)) }));
    valFmt = fmt.hours;
    yFmt = (v) => fmt.d1(v) + "h";
    title = per ? "Hours of final media per course" : "Hours of final media";
    desc = "Running time of finished video and podcast media.";
    what = per ? "Final media per course" : "Final media";
    const sh = A.map((a) => (a.finalMin ? a.podMin / a.finalMin : null));
    const fl = firstLast(G, sh);
    if (fl && s.dim !== "college") context = `<p class="note">Podcasts went from ${fmt.pct(fl.va)} of final minutes in ${fl.la} to ${fmt.pct(fl.vb)} in ${fl.lb}.</p>`;
  } else if (s.measure === "time" && s.metric === "hours") {
    const keep = s.phase === "p2" ? ["design"] : s.phase === "p3" ? ["studio", "post"] : ["design", "studio", "post"];
    series = phases()
      .filter((p) => keep.includes(p.key))
      .map((p) => ({ ...p, values: A.map((a) => div(a[p.key], a)) }));
    valFmt = fmt.hours;
    yFmt = (v) => fmt.numC(v) + "h";
    const ph = { all: "MP hours", p2: "Phase 2 design hours", p3: "Phase 3 production hours" }[s.phase];
    title = per ? `${ph} per course` : `Total ${ph.replace("MP hours", "MP hours")}`;
    desc = "Media producer time: design, studio recording and post-production.";
    what = per ? `${ph} per course` : ph;
    context = '<p class="note">Design hours and studio time were not tracked before Fall 2021. Phase 2 began with the new workflow (A).</p>';
  } else if (s.measure === "time" && s.metric === "days") {
    series = [{ key: "days", label: "Average days", color: C["n-7"], values: A.map((a) => a.days) }];
    mode = "group";
    valFmt = (v) => fmt.d1(v) + " days";
    yFmt = fmt.int;
    title = "Average days from start to delivery";
    desc = "Calendar days between project start and actual end date.";
    what = "Average days to deliver";
    context = '<p class="note">Before Fall 2021 there were no target dates and end dates were logged to the month, so early durations are approximate.</p>';
  } else if (s.measure === "time") {
    series = [
      { ...media()[0], label: "Video", values: A.map((a) => a.videoRatio) },
      { ...media()[1], label: "Podcasts", values: A.map((a) => a.podRatio) },
    ];
    mode = "group";
    valFmt = (v) => fmt.d1(v) + " min";
    yFmt = fmt.int;
    refLines = [
      { value: TARGET.video, label: "Video target 30" },
      { value: TARGET.podcast, label: "Podcast target 5" },
    ];
    title = "MP work minutes per final minute";
    desc = "Post-production work time divided by finished running time. Lower is faster.";
    what = "Video work per final minute";
    const tot = agg(list);
    context = `<p class="note">Across the selection, video took ${fmt.d1(tot.videoRatio)} work minutes per final minute (target 30) and podcasts took ${fmt.d1(tot.podRatio)} (target 5).</p>`;
  } else {
    const pick = (a) => (s.phase === "p2" ? a.cost.design : s.phase === "p3" ? a.cost.rec + a.cost.prod : a.cost.total);
    series = [{ key: "cost", label: "Cost", color: C["cost-3"], values: A.map((a) => div(pick(a), a)) }];
    mode = "group";
    valFmt = s.basis === "permin" ? (v) => fmt.moneyC(v) : fmt.money;
    yFmt = fmt.moneyC;
    const ph = { all: "Cost", p2: "Phase 2 design cost", p3: "Phase 3 production cost" }[s.phase];
    title = s.basis === "per" ? `${ph} per course` : s.basis === "permin" ? `${ph} per final media minute` : `Total ${ph.toLowerCase()}`;
    desc = s.phase === "all" ? "MP time × hourly rate, plus $100 materials per course." : "MP time × hourly rate for this phase.";
    what = title;
    const est = sumBy(A, (a) => a.estimated);
    context = est ? `<p class="note">${est} course${est > 1 ? "s" : ""} in this view (Spring 2024 onward) have costs rebuilt from recorded hours. See the Appendix.</p>` : "";
  }

  const totals = G.map((_, i) => (mode === "stack" ? series.reduce((a, x) => a + (x.values[i] || 0), 0) : series[0].values[i]));
  const takeaway =
    s.dim === "college"
      ? shareSentence(what.toLowerCase(), G, totals, valFmt)
      : changeSentence(
          what,
          G,
          totals.map((v, i) => (G[i].items.length ? v : null)),
          valFmt,
        );

  const decor = timeDecor(G, s.dim);
  const controls = [
    { key: "measure", label: "Show", primary: true, options: Object.entries(MAIN).map(([k, v]) => [k, v.label]), value: s.measure },
    { key: "dim", label: "View by", options: DIM_OPTS, value: s.dim },
  ];
  if (def.metrics.length > 1) controls.push({ key: "metric", label: "Measure", options: def.metrics, value: s.metric });
  if (basisOn) controls.push({ key: "basis", label: "Basis", options: def.basis, value: s.basis });
  if (phaseOn) controls.push({ key: "phase", label: "Phase", options: PHASE_OPTS, value: s.phase });

  return {
    kind: "bar",
    title,
    desc,
    controls,
    mode,
    series,
    yFmt,
    refLines,
    height: 340,
    categories: G,
    ...decor,
    legend: series.length > 1 ? series.map((x) => ({ label: x.label, color: x.color })).concat(refLines ? [{ label: "Target", line: true }] : []) : null,
    tooltip: (i) => {
      const a = A[i],
        g = G[i];
      if (!a.n) return tipHTML(g.name, "No courses in this selection", []);
      const rows = series.map((x) => ({ label: x.label, value: valFmt(x.values[i]), color: series.length > 1 ? x.color : null }));
      if (mode === "stack" && series.length > 1) rows.push({ label: "Total", value: valFmt(totals[i]) });
      if (s.metric === "days" && a.targetN) rows.push({ label: "On or before target", value: `${a.onTarget} of ${a.targetN}` });
      return tipHTML(g.name, `${a.n} course${a.n > 1 ? "s" : ""}`, rows, s.measure === "cost" && a.estimated ? `Includes ${a.estimated} rebuilt (est.) cost${a.estimated > 1 ? "s" : ""}` : "");
    },
    table: seriesTable(s.dim === "college" ? "College" : s.dim === "year" ? "Year" : "Term", G, series, (v) => (v == null ? "—" : valFmt(v)), mode === "stack" && series.length > 1 ? [{ label: "Total", value: (i) => valFmt(totals[i]) }] : []),
    foot: eventsFoot(G, s.dim),
    takeaway: takeaway + context,
    takeawayEl: "takeaway-main",
  };
}

/* ---------- Production ---------- */
function buildMix() {
  const s = ST.mix,
    G = groups(s.dim, filtered()),
    A = G.map((g) => agg(g.items));
  const series = [
    { ...media()[0], values: A.map((a) => (a.finalMin ? a.videoMin / a.finalMin : null)) },
    { ...media()[1], values: A.map((a) => (a.finalMin ? a.podMin / a.finalMin : null)) },
  ];
  const fl = firstLast(G, series[1].values);
  const tot = agg(G.flatMap((g) => g.items));
  let tk = "";
  if (fl) tk = `<p class="big">${fmt.pct(fl.va)} → ${fmt.pct(fl.vb)}</p><p>Podcasts went from <strong>${fmt.pct(fl.va)}</strong> of final media minutes in ${fl.la} to <strong>${fmt.pct(fl.vb)}</strong> in ${fl.lb}.</p>`;
  if (tot.videoRatio && tot.podRatio) tk += `<p>A finished podcast minute took <strong>${fmt.d1(tot.podRatio)}</strong> MP work minutes, against <strong>${fmt.d1(tot.videoRatio)}</strong> for video, about ${Math.round(tot.videoRatio / tot.podRatio)}× less effort.</p>`;
  return {
    kind: "bar",
    mode: "stack",
    series,
    categories: G,
    yMax: 1,
    yFmt: fmt.pct,
    height: 300,
    ...timeDecor(G, s.dim),
    controls: [{ key: "dim", label: "View by", options: TIME_OPTS, value: s.dim }],
    legend: series.map((x) => ({ label: x.label, color: x.color })),
    tooltip: (i) =>
      tipHTML(
        G[i].name,
        `${A[i].n} courses · ${fmt.int(A[i].finalMin)} final minutes`,
        A[i].finalMin
          ? [
              { label: "Video", value: `${fmt.pct(series[0].values[i])} · ${fmt.int(A[i].videoMin)} min`, color: series[0].color },
              { label: "Podcasts", value: `${fmt.pct(series[1].values[i])} · ${fmt.int(A[i].podMin)} min`, color: series[1].color },
            ]
          : [],
      ),
    table: seriesTable("Period", G, series, fmt.pct, [
      { label: "Video min", value: (i) => fmt.int(A[i].videoMin) },
      { label: "Podcast min", value: (i) => fmt.int(A[i].podMin) },
    ]),
    foot: eventsFoot(G, s.dim),
    takeaway: tk,
    takeawayEl: "takeaway-mix",
  };
}

function buildTypes() {
  const list = filtered(),
    a = agg(list);
  const rows = media().map((md) => ({
    label: md.label,
    value: a[md.key],
    color: md.color,
    tip: tipHTML(md.label, "", [
      { label: "Items", value: fmt.int(a[md.key]), color: md.color },
      { label: "Courses with any", value: fmt.int(list.filter((p) => (md.key === "video" ? p.videoCount : md.key === "podcast" ? p.podCount : p[md.key]) > 0).length) },
    ]),
  }));
  return {
    kind: "hbar",
    rows,
    xFmt: fmt.numC,
    labelWidth: 96,
    table: { columns: [{ label: "Media type" }, { label: "Items", num: true }], rows: rows.map((r) => [r.label, fmt.int(r.value)]) },
    foot: `${fmt.int(a.video + a.podcast + a.graphics + a.docs + a.anims)} items across ${a.n} courses.`,
  };
}

function buildLength() {
  const s = ST.length,
    G = groups(s.dim, filtered()),
    A = G.map((g) => agg(g.items));
  const series = [
    { ...media()[0], values: A.map((a) => (a.video ? a.videoMin / a.video : null)) },
    { ...media()[1], values: A.map((a) => (a.podcast ? a.podMin / a.podcast : null)) },
  ];
  return {
    kind: "bar",
    mode: "group",
    series,
    categories: G,
    yFmt: (v) => fmt.int(v) + "m",
    height: 260,
    ...timeDecor(G, s.dim),
    controls: [{ key: "dim", label: "View by", options: TIME_OPTS, value: s.dim }],
    legend: series.map((x) => ({ label: x.label, color: x.color })),
    tooltip: (i) =>
      tipHTML(G[i].name, `${A[i].n} courses`, [
        { label: `Video (${A[i].video})`, value: series[0].values[i] == null ? "—" : fmt.d1(series[0].values[i]) + " min", color: series[0].color },
        { label: `Podcasts (${A[i].podcast})`, value: series[1].values[i] == null ? "—" : fmt.d1(series[1].values[i]) + " min", color: series[1].color },
      ]),
    table: seriesTable("Period", G, series, (v) => (v == null ? "—" : fmt.d1(v) + " min")),
    foot: "One Spring 2023 course delivered 147 short podcast clips, which pulls that term's average podcast length down.",
  };
}

/* ---------- Phases ---------- */
function buildPhase() {
  const s = ST.phase,
    G = groups(s.dim, filtered()),
    A = G.map((g) => agg(g.items));
  const keep = s.phase === "p2" ? ["design"] : s.phase === "p3" ? ["studio", "post"] : ["design", "studio", "post"];
  const series = phases()
    .filter((p) => keep.includes(p.key))
    .map((p) => ({ ...p, values: A.map((a) => (a.n ? a[p.key] / a.n : null)) }));
  const totals = G.map((_, i) => series.reduce((a, x) => a + (x.values[i] || 0), 0));
  const studioShare = G.map((g) => (g.items.length ? g.items.filter((p) => /Studio/.test(p.location)).length / g.items.length : null));
  const topLabel = s.phase === "p2" ? (i) => (A[i].n && A[i].p2Weeks ? fmt.d1(A[i].p2Weeks / A[i].n) + " wk" : "") : null;

  // Takeaway: post-production per course, first → last; design share
  const post = A.map((a) => (a.n ? a.post / a.n : null));
  const fl = firstLast(G, post);
  const tot = agg(G.flatMap((g) => g.items));
  const since = agg(G.flatMap((g) => g.items).filter((p) => p.termIdx >= 2021 * 3 + 2));
  let tk = "";
  if (fl) tk += `<p class="big">${delta(fl.va, fl.vb)}</p><p>Post-production time per course went from <strong>${fmt.hours(fl.va)}</strong> in ${fl.la} to <strong>${fmt.hours(fl.vb)}</strong> in ${fl.lb}.</p>`;
  if (since.n && since.hours) tk += `<p>Since Fall 2021, Phase 2 design accounts for <strong>${fmt.pct(since.design / since.hours)}</strong> of MP hours. That time was spent planning media before any recording.</p>`;
  if (tot.n) tk += `<p class="note">${fmt.pct(tot.n ? G.flatMap((g) => g.items).filter((p) => /Studio/.test(p.location)).length / tot.n : 0)} of courses in the selection recorded in the studio.</p>`;

  return {
    kind: "bar",
    mode: "stack",
    series,
    categories: G,
    yFmt: (v) => fmt.numC(v) + "h",
    height: 320,
    topLabel,
    ...timeDecor(G, s.dim),
    controls: [
      { key: "phase", label: "Phase", options: PHASE_OPTS, value: s.phase, primary: true },
      { key: "dim", label: "View by", options: TIME_OPTS, value: s.dim },
    ],
    legend: series.length > 1 ? series.map((x) => ({ label: x.label, color: x.color })) : null,
    tooltip: (i) => {
      const a = A[i];
      if (!a.n) return tipHTML(G[i].name, "No courses", []);
      const rows = series.map((x) => ({ label: x.label, value: fmt.hours(x.values[i]), color: series.length > 1 ? x.color : null }));
      if (series.length > 1) rows.push({ label: "Total per course", value: fmt.hours(totals[i]) });
      if (s.phase === "p2") rows.push({ label: "Design weeks per course", value: fmt.d1(a.p2Weeks / a.n) });
      if (s.phase !== "p2") rows.push({ label: "Recorded in studio", value: fmt.pct(studioShare[i]) });
      return tipHTML(G[i].name, `${a.n} courses · averages per course`, rows);
    },
    table: seriesTable("Period", G, series, (v) => (v == null ? "—" : fmt.hours(v)), [{ label: "Studio share", value: (i) => fmt.pct(studioShare[i]) }]),
    foot: eventsFoot(G, s.dim),
    takeaway: tk,
    takeawayEl: "takeaway-phase",
  };
}

function buildLocation() {
  const s = ST.location,
    G = groups(s.dim, filtered());
  const cats = [
    { key: "Studio", label: "Studio", color: C["n-8"] },
    { key: "Studio, Remote", label: "Studio and remote", color: C["n-6"] },
    { key: "Remote", label: "Remote", color: C["n-5"] },
  ];
  const series = cats.map((c) => ({ ...c, values: G.map((g) => g.items.filter((p) => p.location === c.key).length) }));
  return {
    kind: "bar",
    mode: "stack",
    series,
    categories: G,
    yFmt: fmt.int,
    height: 260,
    ...timeDecor(G, s.dim),
    controls: [{ key: "dim", label: "View by", options: TIME_OPTS, value: s.dim }],
    legend: series.map((x) => ({ label: x.label, color: x.color })),
    tooltip: (i) =>
      tipHTML(
        G[i].name,
        `${G[i].items.length} courses`,
        series.map((x) => ({ label: x.label, value: fmt.int(x.values[i]), color: x.color })),
      ),
    table: seriesTable("Period", G, series, fmt.int),
  };
}

function buildScripts() {
  const list = filtered().filter((p) => p.videoRatio != null);
  const order = [
    ["Yes", "Complete"],
    ["Partial", "Partial"],
    ["None", "None provided"],
  ];
  const rows = order.map(([k, label]) => {
    const items = list.filter((p) => p.scripts === k);
    const med = median(items.map((p) => p.videoRatio));
    return {
      label,
      value: med,
      valueLabel: med == null ? "—" : `${fmt.d1(med)} · n=${items.length}`,
      color: C["media-video"],
      tip: tipHTML(`Scripts: ${label.toLowerCase()}`, `${items.length} video courses`, [
        { label: "Median work min / final min", value: fmt.d1(med) },
        { label: "At or under target 30", value: items.length ? fmt.pct(items.filter((p) => p.videoRatio <= 30).length / items.length) : "—" },
      ]),
    };
  });
  return {
    kind: "hbar",
    rows,
    xFmt: fmt.int,
    labelWidth: 112,
    valueWidth: 100,
    refLines: [{ value: TARGET.video, label: "Target 30" }],
    table: { columns: [{ label: "Scripts" }, { label: "Median", num: true }], rows: rows.map((r) => [r.label, r.valueLabel]) },
    foot: "Courses with no faculty scripts often had MPs or IDs write them, or used unscripted interviews.",
  };
}

/* ---------- Speed & deadlines ---------- */
function buildDeadline() {
  const list = filtered().filter((p) => p.hasTarget);
  const G = groups("term", filtered(), { fromTerm: 2021 * 3 + 2 });
  const points = [];
  G.forEach((g, ci) =>
    g.items
      .filter((p) => p.hasTarget)
      .forEach((p) =>
        points.push({
          ci,
          v: p.plusMinus,
          tip: tipHTML(`${p.program} ${p.number} · ${p.course}`, `${p.termName} · ${p.college}`, [
            { label: "Vs target", value: p.plusMinus <= 0 ? `${Math.abs(p.plusMinus)} days early` : `${p.plusMinus} days late` },
            { label: "Days start → delivery", value: fmt.int(p.days) },
            { label: "Lead MP · ID", value: `${p.lead} · ${p.id1}` },
          ]),
        }),
      ),
  );
  const rate = (i) => {
    const it = G[i].items.filter((p) => p.hasTarget);
    return it.length ? it.filter((p) => p.plusMinus <= 0).length / it.length : null;
  };
  const on = list.filter((p) => p.plusMinus <= 0).length;
  if (!points.length) return { empty: true };
  return {
    kind: "dot",
    categories: G,
    points,
    color: C["n-8"],
    yFmt: (v) => fmt.signed(v),
    height: 320,
    yTitle: "Days vs target (− early, + late)",
    ...timeDecor(G, "term"),
    topLabel: (i) => (rate(i) == null ? "" : fmt.pct(rate(i))),
    refLines: [{ value: 0, label: "Target date" }],
    colTip: (i) => {
      const it = G[i].items.filter((p) => p.hasTarget);
      return tipHTML(
        G[i].name,
        `${it.length} courses with a target date`,
        it.length
          ? [
              { label: "On or before target", value: `${it.filter((p) => p.plusMinus <= 0).length} of ${it.length}` },
              { label: "Median vs target", value: fmt.signed(median(it.map((p) => p.plusMinus))) + " d" },
            ]
          : [],
      );
    },
    table: {
      columns: [{ label: "Term" }, { label: "Courses", num: true }, { label: "On time", num: true }, { label: "Median ± days", num: true }, { label: "Range", num: true }],
      rows: G.map((g, i) => {
        const v = g.items.filter((p) => p.hasTarget).map((p) => p.plusMinus);
        return [g.label, v.length, rate(i) == null ? "—" : fmt.pct(rate(i)), v.length ? fmt.signed(median(v)) : "—", v.length ? `${fmt.signed(Math.min(...v))} to ${fmt.signed(Math.max(...v))}` : "—"];
      }),
    },
    foot: `${on} of ${list.length} courses (${fmt.pct(list.length ? on / list.length : 0)}) were delivered on or before their target date. ` + eventsFoot(G, "term"),
  };
}

function buildSpeed() {
  const s = ST.speed,
    G = groups(s.dim, filtered());
  const key = s.media === "video" ? "videoRatio" : "podRatio";
  const md = media()[s.media === "video" ? 0 : 1];
  const target = TARGET[s.media];
  const points = [];
  G.forEach((g, ci) =>
    g.items
      .filter((p) => p[key] != null && p[key] > 0)
      .forEach((p) =>
        points.push({
          ci,
          v: p[key],
          tip: tipHTML(`${p.program} ${p.number} · ${p.course}`, `${p.termName} · ${p.college}`, [
            { label: "Work min per final min", value: fmt.d1(p[key]), color: md.color },
            { label: s.media === "video" ? "Videos · final min" : "Podcasts · final min", value: s.media === "video" ? `${p.videoCount} · ${fmt.d1(p.videoMin)}` : `${p.podCount} · ${fmt.d1(p.podMin)}` },
            { label: "Lead MP", value: p.lead },
          ]),
        }),
      ),
  );
  const meds = G.map((g) => median(g.items.map((p) => p[key]).filter((v) => v > 0)));
  if (!points.length) return { empty: true, controls: speedControls(s) };
  return {
    kind: "dot",
    categories: G,
    points,
    color: md.color,
    log: true,
    height: 300,
    yFmt: (v) => fmt.int(v),
    ...timeDecor(G, s.dim),
    topLabel: (i) => (meds[i] == null ? "" : fmt.d1(meds[i])),
    refLines: [{ value: target, label: `Target ${target}` }],
    controls: speedControls(s),
    colTip: (i) => {
      const v = G[i].items.map((p) => p[key]).filter((x) => x > 0);
      return tipHTML(
        G[i].name,
        `${v.length} ${md.label.toLowerCase()} courses`,
        v.length
          ? [
              { label: "Median", value: fmt.d1(median(v)) },
              { label: `At or under ${target}`, value: `${v.filter((x) => x <= target).length} of ${v.length}` },
            ]
          : [],
      );
    },
    table: {
      columns: [{ label: "Period" }, { label: "Courses", num: true }, { label: "Median", num: true }, { label: "Fastest", num: true }, { label: "Slowest", num: true }],
      rows: G.map((g, i) => {
        const v = g.items.map((p) => p[key]).filter((x) => x > 0);
        return [g.label, v.length, fmt.d1(meds[i]), v.length ? fmt.d1(Math.min(...v)) : "—", v.length ? fmt.d1(Math.max(...v)) : "—"];
      }),
    },
  };
}
function speedControls(s) {
  return [
    {
      key: "media",
      label: "Media",
      options: [
        ["video", "Video"],
        ["podcast", "Podcasts"],
      ],
      value: s.media,
      primary: true,
    },
    { key: "dim", label: "View by", options: TIME_OPTS, value: s.dim },
  ];
}

function buildHit() {
  const s = ST.hit,
    G = groups(s.dim, filtered()),
    A = G.map((g) => agg(g.items));
  const series = [
    { ...media()[0], label: "Video ≤ 30", values: A.map((a) => (a.vidN ? a.vidHit / a.vidN : null)) },
    { ...media()[1], label: "Podcasts ≤ 5", values: A.map((a) => (a.podN ? a.podHit / a.podN : null)) },
  ];
  return {
    kind: "bar",
    mode: "group",
    series,
    categories: G,
    yMax: 1,
    yFmt: fmt.pct,
    height: 300,
    ...timeDecor(G, s.dim),
    controls: [{ key: "dim", label: "View by", options: TIME_OPTS, value: s.dim }],
    legend: series.map((x) => ({ label: x.label, color: x.color })),
    tooltip: (i) =>
      tipHTML(G[i].name, "", [
        { label: "Video at or under 30", value: A[i].vidN ? `${A[i].vidHit} of ${A[i].vidN} · ${fmt.pct(series[0].values[i])}` : "—", color: series[0].color },
        { label: "Podcasts at or under 5", value: A[i].podN ? `${A[i].podHit} of ${A[i].podN} · ${fmt.pct(series[1].values[i])}` : "—", color: series[1].color },
      ]),
    table: seriesTable("Period", G, series, (v) => (v == null ? "—" : fmt.pct(v))),
    foot: eventsFoot(G, s.dim),
  };
}

/* ---------- People & colleges ---------- */
const COLLEGE_METRICS = [
  ["courses", "Courses"],
  ["minutes", "Final media"],
  ["hours", "MP hours"],
  ["cost", "Cost"],
];
function buildCollege() {
  const s = ST.college,
    G = groups("college", filtered()),
    A = G.map((g) => agg(g.items));
  const pick = {
    courses: (a) => a.n,
    minutes: (a) => a.finalMin / 60,
    hours: (a) => a.hours,
    cost: (a) => a.cost.total,
  }[s.metric];
  const f = { courses: fmt.int, minutes: fmt.hours, hours: fmt.hours, cost: fmt.money }[s.metric];
  const fx = { courses: fmt.int, minutes: (v) => fmt.numC(v) + "h", hours: (v) => fmt.numC(v) + "h", cost: fmt.moneyC }[s.metric];
  const vals = A.map(pick),
    tot = vals.reduce((a, b) => a + b, 0);
  const rows = G.map((g, i) => ({
    label: g.label,
    value: vals[i],
    color: C["cost-3"],
    valueLabel: `${fx(vals[i])} · ${tot ? fmt.pct(vals[i] / tot) : "—"}`,
    tip: tipHTML(g.name, `${A[i].n} courses`, [
      { label: "Final media", value: fmt.hours(A[i].finalMin / 60) },
      { label: "MP hours", value: fmt.hours(A[i].hours) },
      { label: "Cost", value: fmt.money(A[i].cost.total) },
      { label: "Cost per course", value: A[i].n ? fmt.money(A[i].cost.total / A[i].n) : "—" },
    ]),
  }));
  return {
    kind: "hbar",
    rows,
    xFmt: fx,
    labelWidth: 64,
    valueWidth: 112,
    desc: { courses: "Courses completed for each college or school.", minutes: "Hours of finished video and podcast media.", hours: "All MP hours: design, recording and post-production.", cost: "Total time and materials cost." }[s.metric],
    controls: [{ key: "metric", label: "Measure", options: COLLEGE_METRICS, value: s.metric }],
    table: {
      columns: [{ label: "College" }, { label: "Courses", num: true }, { label: "Final media", num: true }, { label: "MP hours", num: true }, { label: "Cost", num: true }],
      rows: G.map((g, i) => [g.label, A[i].n, fmt.hours(A[i].finalMin / 60), fmt.hours(A[i].hours), fmt.money(A[i].cost.total)]),
    },
    foot: "CCAS: " + COLLEGE_NAMES.CCAS + " · ESIA: " + COLLEGE_NAMES.ESIA + " · GSEHD: " + COLLEGE_NAMES.GSEHD + " · GWSB: " + COLLEGE_NAMES.GWSB + " · LAW: " + COLLEGE_NAMES.LAW,
  };
}

function buildHeat() {
  const s = ST.heat,
    list = filtered();
  const Y = groups("year", list);
  const cell = (c, g) => {
    const it = g.items.filter((p) => p.college === c);
    if (!it.length) return null;
    const t = sumBy(it, (p) => p.cost.total);
    return s.metric === "total" ? t : t / it.length;
  };
  const vals = COLLEGES.flatMap((c) => Y.map((g) => cell(c, g))).filter((v) => v != null);
  const max = Math.max(1, ...vals);
  const ramp = [C["cost-1"], C["cost-2"], C["cost-3"], C["cost-4"], C["cost-5"]];
  const step = max / 5;
  const bin = (v) => ramp[Math.min(4, Math.floor(v / step))];
  const head = `<tr><th scope="col">College</th>${Y.map((g) => `<th scope="col" class="num">${g.label}</th>`).join("")}</tr>`;
  const body = COLLEGES.map(
    (c) =>
      `<tr><th scope="row" class="code">${c}</th>${Y.map((g) => {
        const v = cell(c, g);
        return `<td class="num">${v == null ? '<span class="est">—</span>' : `<span class="heat-cell">${fmt.moneyC(v)}<span class="swatch" style="background:${bin(v)}"></span></span>`}</td>`;
      }).join("")}</tr>`,
  ).join("");
  const legend = ramp.map((r, i) => `<span class="legend__item"><span class="swatch" style="background:${r}"></span>${fmt.moneyC(step * i)}–${fmt.moneyC(step * (i + 1))}</span>`).join("");
  return {
    kind: "html",
    desc: s.metric === "total" ? "Total cost by college and academic year. Brighter means more." : "Average cost per course by college and academic year. Brighter means more.",
    controls: [
      {
        key: "metric",
        label: "Measure",
        options: [
          ["total", "Total cost"],
          ["per", "Cost per course"],
        ],
        value: s.metric,
      },
    ],
    html: `<div class="heat-legend legend">${legend}</div><div class="table-wrap"><table class="data-table">${head}${body}</table></div>`,
  };
}

function buildMP() {
  const list = filtered(),
    Y = groups("year", list);
  const involved = (p, mp) => [p.pm, p.videoMP, p.work1, p.work2].includes(mp);
  const rows = MPS.map((mp) => {
    const all = list.filter((p) => involved(p, mp));
    const lead = list.filter((p) => p.lead === mp);
    return {
      mp,
      all,
      lead,
      byYear: Y.map((g) => g.items.filter((p) => involved(p, mp)).length),
      pm: list.filter((p) => p.pm === mp).length,
      leadHours: sumBy(lead, (p) => p.studioHours + p.p3Work),
      med: median(lead.map((p) => p.videoRatio)),
    };
  }).filter((r) => r.all.length);
  const max = Math.max(1, ...rows.map((r) => r.all.length));
  const head = `<tr><th scope="col">MP</th>${Y.map((g) => `<th scope="col" class="num">${g.label}</th>`).join("")}<th scope="col" class="num">Courses</th><th scope="col" class="num">As PM</th><th scope="col" class="num">As lead</th><th scope="col" class="num">Lead hours</th></tr>`;
  const body = rows.map((r) => `<tr><th scope="row" class="code">${r.mp}</th>${r.byYear.map((v) => `<td class="num">${v || '<span class="est">·</span>'}</td>`).join("")}<td class="num"><span class="cellbar"><i style="width:${Math.round((r.all.length / max) * 56)}px"></i>${r.all.length}</span></td><td class="num">${r.pm}</td><td class="num">${r.lead.length}</td><td class="num">${fmt.hours(r.leadHours)}</td></tr>`).join("");
  return {
    kind: "html",
    html: `<div class="table-wrap"><table class="data-table">${head}${body}</table></div>`,
    foot: "A course can count for several MPs. In 2024–25 only MP1 and MP3 remained, with IDs picking up some media work (C). One Fall 2024 course was managed by an ID.",
  };
}

function buildMPSpeed() {
  const list = filtered().filter((p) => p.videoRatio != null);
  const rows = MPS.map((mp) => {
    const it = list.filter((p) => p.lead === mp);
    return { mp, it, med: median(it.map((p) => p.videoRatio)) };
  })
    .filter((r) => r.it.length >= 3)
    .sort((a, b) => a.med - b.med);
  if (!rows.length) return { empty: true };
  return {
    kind: "hbar",
    labelWidth: 48,
    valueWidth: 72,
    xFmt: fmt.int,
    rows: rows.map((r, i) => ({
      label: r.mp,
      value: r.med,
      color: C["media-video"],
      valueLabel: fmt.d1(r.med) + (rows.length > 1 && i === 0 ? " ▲" : rows.length > 1 && i === rows.length - 1 ? " ▼" : ""),
      tip: tipHTML(r.mp, `${r.it.length} video courses as lead`, [
        { label: "Median work min / final min", value: fmt.d1(r.med) },
        { label: "At or under 30", value: `${r.it.filter((p) => p.videoRatio <= 30).length} of ${r.it.length}` },
        { label: "Final video minutes", value: fmt.int(sumBy(r.it, (p) => p.videoMin)) },
      ]),
    })),
    refLines: [{ value: TARGET.video, label: "30" }],
    table: { columns: [{ label: "MP" }, { label: "Courses", num: true }, { label: "Median", num: true }], rows: rows.map((r) => [r.mp, r.it.length, fmt.d1(r.med)]) },
    foot: rows.length > 1 ? `▲ Fastest: ${rows[0].mp} (${fmt.d1(rows[0].med)}). ▼ Slowest: ${rows[rows.length - 1].mp} (${fmt.d1(rows[rows.length - 1].med)}). Speed also reflects the courses each MP was assigned.` : "",
  };
}

/* ---------- Costs ---------- */
function buildCostPhase() {
  const s = ST.costphase,
    G = groups(s.dim, filtered()),
    A = G.map((g) => agg(g.items));
  const div = (v, a) => (s.basis === "per" ? (a.n ? v / a.n : null) : s.basis === "permin" ? (a.finalMin ? v / a.finalMin : null) : v);
  const series = costParts().map((c) => ({ ...c, values: A.map((a) => div(a.cost[c.key], a)) }));
  const totals = G.map((_, i) => series.reduce((a, x) => a + (x.values[i] || 0), 0));
  const f = s.basis === "permin" ? (v) => "$" + fmt.d1(v) : fmt.money;

  const per = A.map((a) => (a.n ? a.cost.total / a.n : null));
  const fl = firstLast(G, per);
  const tot = agg(G.flatMap((g) => g.items));
  const p3min = A.map((a) => (a.finalMin ? (a.cost.rec + a.cost.prod) / a.finalMin : null));
  const fl3 = firstLast(G, p3min);
  let tk = "";
  if (fl) tk += `<p class="big">${delta(fl.va, fl.vb)}</p><p>Cost per course went from <strong>${fmt.money(fl.va)}</strong> in ${fl.la} to <strong>${fmt.money(fl.vb)}</strong> in ${fl.lb}, even though hourly rates rose every year.</p>`;
  if (fl3) tk += `<p>Phase 3 production cost per final minute went from <strong>$${fmt.d1(fl3.va)}</strong> to <strong>$${fmt.d1(fl3.vb)}</strong>.</p>`;
  if (tot.n) tk += `<p class="note">Total for the selection: ${fmt.money(tot.cost.total)} across ${tot.n} courses. Design was ${fmt.pct(tot.cost.design / tot.cost.total)} of spending. More design time up front went with less spent on production.</p>`;

  return {
    kind: "bar",
    mode: "stack",
    series,
    categories: G,
    yFmt: s.basis === "permin" ? (v) => "$" + fmt.numC(v) : fmt.moneyC,
    height: 320,
    ...timeDecor(G, s.dim),
    desc: s.basis === "per" ? "Average cost per course, by phase." : s.basis === "permin" ? "Cost per minute of finished media, by phase." : "Total spending, by phase.",
    controls: [
      { key: "basis", label: "Basis", options: MAIN.cost.basis, value: s.basis, primary: true },
      { key: "dim", label: "View by", options: TIME_OPTS, value: s.dim },
    ],
    legend: series.map((x) => ({ label: x.label, color: x.color })),
    tooltip: (i) => {
      const a = A[i];
      if (!a.n) return tipHTML(G[i].name, "No courses", []);
      return tipHTML(
        G[i].name,
        `${a.n} courses`,
        series
          .slice()
          .reverse()
          .map((x) => ({ label: x.label, value: f(x.values[i]), color: x.color }))
          .concat([{ label: "Total", value: f(totals[i]) }]),
        a.estimated ? `${a.estimated} rebuilt (est.) cost${a.estimated > 1 ? "s" : ""}` : "",
      );
    },
    table: seriesTable("Period", G, series, (v) => (v == null ? "—" : f(v)), [{ label: "Total", value: (i) => f(totals[i]) }]),
    foot: eventsFoot(G, s.dim),
    takeaway: tk,
    takeawayEl: "takeaway-cost",
  };
}

function buildCostDots() {
  const s = ST.costdots,
    G = groups(s.dim, filtered());
  const points = [];
  G.forEach((g, ci) =>
    g.items.forEach((p) =>
      points.push({
        ci,
        v: p.cost.total,
        tip: tipHTML(`${p.program} ${p.number} · ${p.course}`, `${p.termName} · ${p.college}${p.estimated ? " · est." : ""}`, [
          { label: "Total", value: fmt.money(p.cost.total) },
          { label: "Phase 2 design", value: fmt.money(p.cost.design) },
          { label: "Phase 3 recording", value: fmt.money(p.cost.rec) },
          { label: "Phase 3 production", value: fmt.money(p.cost.prod) },
          { label: "MP hours", value: fmt.hours(p.hours) },
        ]),
      }),
    ),
  );
  const meds = G.map((g) => median(g.items.map((p) => p.cost.total)));
  const means = G.map((g) => (g.items.length ? sumBy(g.items, (p) => p.cost.total) / g.items.length : null));
  if (!points.length) return { empty: true };
  return {
    kind: "dot",
    categories: G,
    points,
    color: C["cost-3"],
    log: true,
    height: 320,
    trend: { values: means, label: "Mean" },
    yFmt: fmt.moneyC,
    ...timeDecor(G, s.dim),
    topLabel: (i) => (meds[i] == null ? "" : fmt.moneyC(meds[i])),
    controls: [{ key: "dim", label: "View by", options: DIM_OPTS, value: s.dim }],
    colTip: (i) => {
      const v = G[i].items.map((p) => p.cost.total);
      return tipHTML(
        G[i].name,
        `${v.length} courses`,
        v.length
          ? [
              { label: "Mean", value: fmt.money(means[i]) },
              { label: "Median", value: fmt.money(median(v)) },
              { label: "Lowest", value: fmt.money(Math.min(...v)) },
              { label: "Highest", value: fmt.money(Math.max(...v)) },
            ]
          : [],
      );
    },
    table: {
      columns: [{ label: "Period" }, { label: "Courses", num: true }, { label: "Mean", num: true }, { label: "Median", num: true }, { label: "Lowest", num: true }, { label: "Highest", num: true }],
      rows: G.map((g, i) => {
        const v = g.items.map((p) => p.cost.total);
        return [g.label, v.length, v.length ? fmt.money(means[i]) : "—", v.length ? fmt.money(meds[i]) : "—", v.length ? fmt.money(Math.min(...v)) : "—", v.length ? fmt.money(Math.max(...v)) : "—"];
      }),
    },
    foot: "The Spring 2023 high point is a 147-clip podcast course with an eight-week design phase. " + eventsFoot(G, s.dim),
  };
}

const EXPLORER_COLS = [
  { key: "term", label: "Term", v: (p) => p.termIdx, d: (p) => p.termKey, cls: "code" },
  { key: "college", label: "College", v: (p) => p.college, d: (p) => p.college, cls: "code" },
  { key: "course", label: "Course", v: (p) => p.course, d: (p) => `${esc(p.course)}<span>${esc(p.program)} ${esc(p.number)} · ${esc(p.level)}</span>`, cls: "course", html: true },
  { key: "lead", label: "Lead MP", v: (p) => p.lead, d: (p) => p.lead, cls: "code" },
  { key: "id1", label: "ID", v: (p) => p.id1, d: (p) => p.id1, cls: "code" },
  { key: "videos", label: "Videos", v: (p) => p.videoCount, d: (p) => fmt.int(p.videoCount), num: true },
  { key: "vmin", label: "Video min", v: (p) => p.videoMin, d: (p) => fmt.d1(p.videoMin), num: true },
  { key: "pods", label: "Podcasts", v: (p) => p.podCount, d: (p) => fmt.int(p.podCount), num: true },
  { key: "pmin", label: "Pod min", v: (p) => p.podMin, d: (p) => fmt.d1(p.podMin), num: true },
  { key: "hours", label: "MP hours", v: (p) => p.hours, d: (p) => fmt.d1(p.hours), num: true },
  { key: "ratio", label: "Video work/min", v: (p) => (p.videoRatio == null ? -1 : p.videoRatio), d: (p) => (p.videoRatio == null ? "—" : fmt.d1(p.videoRatio)), num: true },
  { key: "days", label: "Days", v: (p) => p.days, d: (p) => fmt.int(p.days), num: true },
  { key: "pm", label: "± Target", v: (p) => (p.hasTarget ? p.plusMinus : -1e9), d: (p) => (p.hasTarget ? fmt.signed(p.plusMinus) : "—"), num: true },
  { key: "cost", label: "Cost", v: (p) => p.cost.total, d: (p) => fmt.money(p.cost.total) + (p.estimated ? ' <span class="est">est.</span>' : ""), num: true, html: true },
];
const EXPLORER_ORDERS = [
  ["term", "By term", "term", 1],
  ["costDesc", "Most expensive first", "cost", -1],
  ["costAsc", "Least expensive first", "cost", 1],
];
function buildExplorer() {
  const s = ST.explorer,
    col = EXPLORER_COLS.find((c) => c.key === s.sort);
  const list = filtered()
    .slice()
    .sort((a, b) => {
      const x = col.v(a),
        y = col.v(b);
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * s.dir || a.termIdx - b.termIdx;
    });
  const head = EXPLORER_COLS.map((c) => {
    const sorted = c.key === s.sort;
    return `<th scope="col" class="${c.num ? "num" : ""}"${sorted ? ` aria-sort="${s.dir > 0 ? "ascending" : "descending"}"` : ""}><button type="button" data-sort="${c.key}">${c.label}${sorted ? (s.dir > 0 ? " ↑" : " ↓") : ""}</button></th>`;
  }).join("");
  const body = list.map((p) => "<tr>" + EXPLORER_COLS.map((c) => `<td class="${c.num ? "num" : c.cls || ""}">${c.html ? c.d(p) : esc(c.d(p))}</td>`).join("") + "</tr>").join("");
  // Quick orders; none shows as pressed when a column heading sets another sort
  const order = s.sort === "term" && s.dir > 0 ? "term" : s.sort === "cost" ? (s.dir < 0 ? "costDesc" : "costAsc") : null;
  return {
    kind: "html",
    controls: [{ key: "order", label: "Order", options: EXPLORER_ORDERS.map(([k, l]) => [k, l]), value: order }],
    html: `<div class="table-wrap" style="max-height:560px"><table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`,
    foot: `${list.length} courses. "est." marks costs rebuilt from recorded hours.`,
  };
}

/* ---------- KPIs ---------- */
function renderKPIs() {
  const list = filtered(),
    a = agg(list);
  const ays = uniq(list.map((p) => p.ay)).sort();
  const first = ays[0],
    last = ays[ays.length - 1];
  const fa = agg(list.filter((p) => p.ay === first)),
    la = agg(list.filter((p) => p.ay === last));
  const cmp = ays.length > 1;
  const card = (label, value, unit, sub, d) => `<article class="card card--data kpi-card span-3">
      <p class="card__label">${label}</p>
      <p class="kpi">${value}${unit ? `<span class="kpi__unit">${unit}</span>` : ""}</p>
      ${d ? `<p class="kpi__delta">${d}</p>` : ""}
      <p class="kpi__sub">${sub}</p></article>`;
  const hrs = (x) => (x.n ? x.hours / x.n : null),
    cpc = (x) => (x.n ? x.cost.total / x.n : null);
  document.getElementById("kpis").innerHTML = [card("Courses delivered", fmt.int(a.n), "", `${list.filter((p) => p.level === "New").length} new · ${list.filter((p) => p.level === "Refresh").length} refreshed · ${uniq(list.map((p) => p.college)).length} colleges`), card("Final media produced", fmt.int(a.finalMin / 60), " h", `${fmt.int(a.video)} videos · ${fmt.int(a.podcast)} podcasts · ${fmt.int(a.graphics + a.docs + a.anims)} other items`), card(cmp ? `MP hours per course · ${ayLabel(last)}` : "MP hours per course", fmt.d1(cmp ? hrs(la) : hrs(a)), " h", cmp ? `vs ${fmt.d1(hrs(fa))} h in ${ayLabel(first)}` : "Design, recording and post-production", cmp ? delta(hrs(fa), hrs(la)) : ""), card(cmp ? `Cost per course · ${ayLabel(last)}` : "Cost per course", fmt.money(cmp ? cpc(la) : cpc(a)), "", cmp ? `vs ${fmt.money(cpc(fa))} in ${ayLabel(first)}` : "Time and materials", cmp ? delta(cpc(fa), cpc(la)) : "")].join("");
}

/* ---------- Card framework ---------- */
const CARDS = {
  "card-main": { st: "main", build: buildMain },
  "card-mix": { st: "mix", build: buildMix },
  "card-types": { build: buildTypes },
  "card-length": { st: "length", build: buildLength },
  "card-phase": { st: "phase", build: buildPhase },
  "card-location": { st: "location", build: buildLocation },
  "card-scripts": { build: buildScripts },
  "card-deadline": { build: buildDeadline },
  "card-speed": { st: "speed", build: buildSpeed },
  "card-hit": { st: "hit", build: buildHit },
  "card-college": { st: "college", build: buildCollege },
  "card-heat": { st: "heat", build: buildHeat },
  "card-mp": { build: buildMP },
  "card-mpspeed": { build: buildMPSpeed },
  "card-costphase": { st: "costphase", build: buildCostPhase },
  "card-costdots": { st: "costdots", build: buildCostDots },
  "card-explorer": { st: "explorer", build: buildExplorer },
};

function controlsHTML(controls) {
  return controls
    .map(
      (c) => `<div class="seg${c.primary ? " seg--primary" : ""}" role="group" aria-label="${esc(c.label)}">
      <span class="seg__label">${esc(c.label)}</span>
      <div class="seg__buttons">${c.options.map(([v, l]) => `<button type="button" class="control" data-key="${c.key}" data-value="${v}" aria-pressed="${String(c.value) === String(v)}">${esc(l)}</button>`).join("")}</div>
    </div>`,
    )
    .join("");
}

function renderCard(id) {
  const card = document.getElementById(id),
    def = CARDS[id];
  const m = def.build();
  const active = document.activeElement;
  const refocus = active && card.contains(active) && active.dataset.key ? `[data-key="${active.dataset.key}"][data-value="${active.dataset.value}"]` : null;

  if (m.title) card.querySelector(".card__title").textContent = m.title;
  if (m.desc != null) card.querySelector(".card__desc").textContent = m.desc;
  card.querySelector(".card__controls").innerHTML = m.controls ? controlsHTML(m.controls) : "";
  const asTable = card.dataset.view === "table" && m.table && !m.empty;
  card.querySelector(".legend").innerHTML = !asTable && m.legend ? m.legend.map((l) => `<span class="legend__item">${l.line ? '<span class="legend__line"></span>' : `<span class="swatch" style="background:${l.color}"></span>`}${esc(l.label)}</span>`).join("") : "";

  const chart = card.querySelector(".chart"),
    tw = card.querySelector(".table-wrap");
  chart.innerHTML = "";
  chart.hidden = asTable;
  tw.hidden = !asTable;
  const toggle = card.querySelector(".table-toggle");
  if (toggle) toggle.hidden = !m.table;
  if (m.empty) {
    chart.innerHTML = '<p class="empty">No courses in the current filters match this view.</p>';
  } else if (asTable) {
    tw.innerHTML = tableHTML(m.table);
  } else if (m.kind === "html") {
    chart.innerHTML = m.html;
  } else {
    ({ bar: barChart, dot: dotChart, hbar: hbarChart })[m.kind](chart, m);
  }
  card.querySelector(".card__foot").innerHTML = m.empty ? "" : m.foot || "";
  if (m.takeawayEl) document.getElementById(m.takeawayEl).innerHTML = m.empty ? "" : m.takeaway || '<p class="note">Not enough data in the current selection to compare periods.</p>';
  if (refocus) {
    const b = card.querySelector(refocus);
    if (b) b.focus();
  }
}

function wireCard(id) {
  const card = document.getElementById(id),
    def = CARDS[id];
  card.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.classList.contains("table-toggle")) {
      const on = card.dataset.view !== "table";
      card.dataset.view = on ? "table" : "chart";
      btn.setAttribute("aria-pressed", String(on));
      btn.textContent = on ? "View as chart" : "View as table";
      renderCard(id);
      return;
    }
    if (btn.dataset.sort) {
      const s = ST.explorer;
      if (s.sort === btn.dataset.sort) s.dir *= -1;
      else {
        s.sort = btn.dataset.sort;
        s.dir = 1;
      }
      renderCard(id);
      const again = card.querySelector(`[data-sort="${btn.dataset.sort}"]`);
      if (again) again.focus();
      return;
    }
    if (btn.dataset.key && def.st) {
      const s = ST[def.st],
        k = btn.dataset.key,
        v = btn.dataset.value;
      if (def.st === "explorer" && k === "order") {
        const [, , sort, dir] = EXPLORER_ORDERS.find((o) => o[0] === v);
        s.sort = sort;
        s.dir = dir;
        renderCard(id);
        return;
      }
      s[k] = v;
      if (def.st === "main" && k === "measure") {
        s.metric = MAIN[v].metrics[0][0];
        s.basis = MAIN[v].defBasis;
      }
      renderCard(id);
    }
  });
}

function renderAll() {
  renderKPIs();
  Object.keys(CARDS).forEach(renderCard);
  document.querySelectorAll("#filters select").forEach((s) => s.classList.toggle("is-active", s.value !== "all"));
}

/* ==========================================================================
   6. Init
   ========================================================================== */
function fillStats() {
  const ays = uniq(BASE.map((p) => p.ay)).sort();
  const fa = agg(BASE.filter((p) => p.ay === ays[0])),
    la = agg(BASE.filter((p) => p.ay === ays[ays.length - 1]));
  const S = {
    courses: fmt.int(BASE.length),
    hours0: fmt.d1(fa.hours / fa.n),
    hours1: fmt.d1(la.hours / la.n),
    hoursPct: pctChange(fa.hours / fa.n, la.hours / la.n),
    cost0: fmt.money(fa.cost.total / fa.n),
    cost1: fmt.money(la.cost.total / la.n),
    costPct: pctChange(fa.cost.total / fa.n, la.cost.total / la.n),
    rows: ALL.length,
    canceled: ALL.length - BASE.length,
    estimated: BASE.filter((p) => p.estimated).length,
  };
  document.querySelectorAll("[data-stat]").forEach((n) => {
    n.textContent = S[n.dataset.stat];
  });
}

function initFilters() {
  const form = document.getElementById("filters");
  const yearSel = form.elements.year,
    colSel = form.elements.college;
  uniq(BASE.map((p) => p.ay))
    .sort()
    .forEach((ay) => yearSel.add(new Option(ayLabel(ay), ay)));
  COLLEGES.forEach((c) => colSel.add(new Option(c, c)));
  form.addEventListener("change", (e) => {
    FILTERS[e.target.name] = e.target.value;
    renderAll();
  });
  form.addEventListener("reset", () => {
    setTimeout(() => {
      Object.keys(FILTERS).forEach((k) => {
        FILTERS[k] = "all";
      });
      renderAll();
    });
  });
  form.addEventListener("submit", (e) => e.preventDefault());
}

function initNavSpy() {
  const links = [...document.querySelectorAll(".topbar__links a")];
  const map = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((a) => a.removeAttribute("aria-current"));
        const a = map.get(en.target.id);
        if (a) a.setAttribute("aria-current", "true");
      });
    },
    { rootMargin: "-30% 0px -60% 0px" },
  );
  map.forEach((a, id) => {
    const s = document.getElementById(id);
    if (s) io.observe(s);
  });
}

function init() {
  loadColors();
  tip.node = document.getElementById("tooltip");
  ALL = buildProjects(parseCSV(CSV_TEXT).slice(1));
  BASE = ALL.filter((p) => p.completed);
  fillStats();
  initFilters();
  Object.keys(CARDS).forEach(wireCard);
  renderAll();
  initNavSpy();

  // Re-layout charts on resize (widths are measured, not fluid SVG)
  let t,
    lastW = innerWidth;
  addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (innerWidth !== lastW) {
        lastW = innerWidth;
        Object.keys(CARDS).forEach(renderCard);
      }
    }, 150);
  });
  // Tap outside a chart closes the tooltip
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".chart-svg")) tip.hide();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") tip.hide();
  });
  document.getElementById("gate-dismiss").addEventListener("click", () => document.getElementById("gate").classList.add("is-dismissed"));
}

document.addEventListener("DOMContentLoaded", init);

/* ==========================================================================
   Data: sdli-tracker-workload-sntz.csv (embedded verbatim)
   ========================================================================== */
const CSV_TEXT = String.raw`﻿Status,Design,Year,Term,College,Program,Number,Course,Faculty,Media-Producer-Project-Manager,Media-Producer-Video,Media-Producer-WORK-1,Media-Producer-WORK-2,Instructional-Designer-1,Instructional-Designer-2,Launch-term,Months-to-Produce,Date-start,Date-target,Date-end,Plus-Minus-Days-to-Complete,Phase-2-Design-weeks,Phase-2-Design-hours-weekly-estimate,Phase-3-Studio-hours,Phase-3-Location,Phase-3-Worktime-hours,Phase-3-Worktime-days,Video-worktime,Video-count,Video-time-minutes,Video-time-minutes-average,Video-work-per-production-minute,Podcast-worktime,Podcast-count,Podcast-time-minutes,Podcast-time-minutes-average,Podcast-work-per-production-minute,Total-video-scripts,Total-podcast-scripts,Nature-of-scripts,Instructional-documents,Instructional-graphics,Instructional-animations,Media-Producer-Project-Manager,Media-Producer-Video,Media-Producer-WORK-1,Media-Producer-WORK-2,Media-Producer-Project-Manager-Rate,Media-Producer-Video-Rate,Media-Producer-WORK-1-Rate,Media-Producer-WORK-2-Rate,Phase-2-Design-Hours,Phase-3-Studio-Hours,Phase-3-Total-worktime-hours,Phase-3-Production-hours,COST-Design,COST-Recording,COST-Production,TOTAL-COST-ESTIMATE,MATERIALS,TIME and MATERIALS
Completed,New,2020,Fall,CCAS,STAT,6202,Mathematical Statistics 2,Marlowe,MP4,none,MP3,MP4,ID1,none,2021-FA,6,8/1/20,none,2/1/21,0,0,0,0,Remote,233:33:00,29.2,233:33:00,23,322,14,44,00:00:00,0,0,0,0,0,0,None,0,0,0,MP4,none,MP3,MP4,$41.36 ,$0.00 ,$33.13 ,$41.36 ,0,0,233:33:00,233.5,$0.00 ,$0.00 ,"$8,696.71 ","$8,696.71 ",$100.00 ,"$8,796.71 "
Completed,New,2020,Fall,CCAS,ECON,2102,Intermediate Macroeconomics Theory,Dacey,MP4,none,MP3,none,ID1,none,2021-FA,6,8/1/20,none,2/1/21,0,0,0,0,Remote,90:25:00,11.3,90:25:00,16,87,5.5,62,00:00:00,0,0,0,0,0,0,None,0,0,0,MP4,none,MP3,none,$41.36 ,$0.00 ,$33.13 ,$0.00 ,0,0,90:25:00,90.5,$0.00 ,$0.00 ,"$2,998.27 ","$2,998.27 ",$100.00 ,"$3,098.27 "
Completed,New,2020,Fall,CCAS,GEO,3143W,Urban Sustainability,Lindqvist,MP4,none,MP4,none,ID2,none,2021-FA,6,8/1/20,none,2/1/21,0,0,0,0,Remote,111:09:00,13.9,111:09:00,20,208,10.5,32,00:00:00,0,0,0,0,0,0,None,0,0,0,MP4,none,MP4,none,$41.36 ,$0.00 ,$41.36 ,$0.00 ,0,0,111:09:00,111.25,$0.00 ,$0.00 ,"$4,601.30 ","$4,601.30 ",$100.00 ,"$4,701.30 "
Completed,New,2020,Fall,CCAS,ANTHRO,1004,Language in Culture and Society,Cardenas,MP1,none,MP1,none,ID3,ID4,2021-FA,6,8/1/20,none,2/1/21,0,0,0,0,Remote,58:29:00,7.3,41:42:00,4,44,11,57,16:47:00,39,418.25,10.72,2.41,0,6,Partial,0,0,0,MP1,none,MP1,none,$50.21 ,$0.00 ,$50.21 ,$0.00 ,0,0,41:42:00,41.75,$0.00 ,$0.00 ,"$2,096.27 ","$2,096.27 ",$100.00 ,"$2,196.27 "
Completed,New,2020,Fall,CCAS,BIOSCI,2452,Animal Behavior,Haddad,MP1,none,MP1,none,ID4,none,2021-FA,6,8/1/20,none,2/1/21,0,0,0,0,Remote,85:51:00,10.75,85:51:00,17,121,7.25,43,00:00:00,0,0,0,0,17,0,Yes,1,0,0,MP1,none,MP1,none,$50.21 ,$0.00 ,$50.21 ,$0.00 ,0,0,85:51:00,86,$0.00 ,$0.00 ,"$4,318.06 ","$4,318.06 ",$100.00 ,"$4,418.06 "
Completed,New,2020,Fall,CCAS,HIST,2020W,"Washington DC: History, culture and politics",Iverson,MP1,none,MP2,none,ID3,none,2021-FA,6,8/1/20,none,2/1/21,0,0,0,0,Remote,61:30:00,7.7,61:30:00,14,105,7.5,35,00:00:00,0,0,0,0,6,0,Partial,0,0,0,MP1,none,MP2,none,$50.21 ,$0.00 ,$32.80 ,$0.00 ,0,0,61:30:00,61.5,$0.00 ,$0.00 ,"$2,017.20 ","$2,017.20 ",$100.00 ,"$2,117.20 "
Completed,New,2020,Fall,LAW,GCON,6514-10,Federal Grants,Garner,MP1,none,MP2,none,ID3,none,2021-FA,5,8/1/20,none,1/1/21,0,0,0,0,Remote,198:15:00,24.8,198:15:00,27,522,19.25,23,00:00:00,0,0,0,0,0,0,None,0,0,0,MP1,none,MP2,none,$50.21 ,$0.00 ,$32.80 ,$0.00 ,0,0,198:15:00,198.25,$0.00 ,$0.00 ,"$6,502.60 ","$6,502.60 ",$100.00 ,"$6,602.60 "
Completed,New,2020,Fall,LAW,GCON,6516-DE,Internaional Development,Stratton,MP1,none,MP1,none,ID3,none,2021-FA,6,8/1/20,none,2/1/21,0,0,0,0,Remote,01:00:00,0.15,01:00:00,1,2.25,2.25,27,00:00:00,0,0,0,0,0,0,None,0,0,0,MP1,none,MP1,none,$50.21 ,$0.00 ,$50.21 ,$0.00 ,0,0,01:00:00,1,$0.00 ,$0.00 ,$50.21 ,$50.21 ,$100.00 ,$150.21 
Completed,New,2020,Fall,ESIA,IAFF,6222,Monitoring and Evaluation,Gallant,MP4,none,MP2,none,ID2,none,2021-FA,6,8/1/20,none,2/1/21,0,0,0,0,Remote,74:55:00,9.4,74:55:00,13,116,9,39,00:00:00,0,0,0,0,4,0,Partial,0,0,0,MP4,none,MP2,none,$41.63 ,$0.00 ,$32.80 ,$0.00 ,0,0,74:55:00,75,$0.00 ,$0.00 ,"$2,460.00 ","$2,460.00 ",$100.00 ,"$2,560.00 "
Completed,New,2020,Fall,ESIA,IAFF,6186,Political Risk Analysis,Lennox,MP4,none,MP1,none,ID5,none,2021-FA,6,8/1/20,none,2/1/21,0,0,0,0,Remote,25:29:00,3.2,25:29:00,9,37,4,41,00:00:00,0,0,0,0,3,0,Partial,0,0,0,MP4,none,MP1,none,$41.36 ,$0.00 ,$50.21 ,$0.00 ,0,0,25:29:00,25.5,$0.00 ,$0.00 ,"$1,280.36 ","$1,280.36 ",$100.00 ,"$1,380.36 "
Completed,New,2020,Fall,ESIA,IAFF,6222,Advanced Quantitative Data Analytics,Ballard,MP1,none,MP1,none,ID5,none,2021-FA,6,8/1/20,none,2/1/21,0,0,0,0,Remote,00:56:00,0.15,00:56:00,1,2.25,2.25,25,00:00:00,0,0,0,0,0,0,None,0,0,0,MP1,none,MP1,none,$50.21 ,$0.00 ,$0.00 ,$0.00 ,0,0,00:56:00,1,$0.00 ,$0.00 ,$50.21 ,$50.21 ,$100.00 ,$150.21 
Completed,Refresh,2020,Fall,GSEHD,HOL,6706,Current Issues in Ledership,Calder,MP4,none,MP3,none,ID5,none,2021-FA,6,8/1/20,none,2/1/21,0,0,0,0,Remote,73:57:00,9.25,73:57:00,7,50,7,89,00:00:00,0,0,0,0,0,0,None,0,0,0,MP4,none,MP3,none,$41.36 ,$0.00 ,$33.13 ,$0.00 ,0,0,73:57:00,74,$0.00 ,$0.00 ,"$2,451.62 ","$2,451.62 ",$100.00 ,"$2,551.62 "
Completed,New,2021,Spring,GWSB,ISTM,6201,Information Systems Development,Hutchins,MP4,none,MP4,none,ID4,none,2022-SP,5,1/28/21,none,7/1/21,0,0,0,0,Remote,96:33:00,12,96:33:00,14,108,7.75,53,00:00:00,0,0,0,0,1,0,Partial,0,0,0,MP4,none,MP4,none,$41.36 ,$0.00 ,$41.36 ,$0.00 ,0,0,96:33:00,96.5,$0.00 ,$0.00 ,"$3,991.24 ","$3,991.24 ",$100.00 ,"$4,091.24 "
Completed,New,2021,Spring,GWSB,ISTM,6210,Integrated Information Systems Capstone,Hutchins,MP4,none,MP4,none,ID4,none,2022-SP,5,1/28/21,none,7/1/21,0,0,0,0,Remote,24:00:00,3,24:00:00,7,26,3.75,55,00:00:00,0,0,0,0,0,0,None,0,0,0,MP4,none,MP4,none,$41.36 ,$0.00 ,$41.36 ,$0.00 ,0,0,24:00:00,24,$0.00 ,$0.00 ,$992.64 ,$992.64 ,$100.00 ,"$1,092.64 "
Completed,New,2021,Spring,GWSB,ISTM,6204,Project Management,Blackwell,MP4,none,MP4,none,ID2,ID4,2022-SP,5,1/28/21,none,7/1/21,0,0,0,0,Remote,97:28:00,12.2,97:28:00,36,1178,32.75,5,00:00:00,0,0,0,0,0,0,None,0,0,0,MP4,none,MP4,none,$41.36 ,$0.00 ,$41.36 ,$0.00 ,0,0,97:28:00,97.5,$0.00 ,$0.00 ,"$4,032.60 ","$4,032.60 ",$100.00 ,"$4,132.60 "
Completed,New,2021,Spring,GWSB,ISTM,6206,Information Systems Security,Radcliffe,MP2,none,MP2,none,ID5,ID6,2022-SP,5,1/28/21,none,8/1/21,0,0,0,0,Remote,160:04:00,20,160:04:00,13,68,5.5,141,00:00:00,0,0,0,0,8,0,Partial,0,0,0,MP2,none,MP2,none,$32.80 ,$0.00 ,$32.80 ,$0.00 ,0,0,160:04:00,160,$0.00 ,$0.00 ,"$5,248.00 ","$5,248.00 ",$100.00 ,"$5,348.00 "
Completed,New,2021,Spring,CCAS,SLHS,1072,Multicultural Issues in Human Communication,Oakley,MP3,none,MP1,MP3,ID1,none,2022-SP,4,1/28/21,none,6/1/21,0,0,0,0,Remote,162:49:00,20.4,162:49:00,20,65,3.25,15,00:00:00,0,0,0,0,6,0,Partial,0,0,0,MP3,none,MP1,MP3,$33.13 ,$0.00 ,$50.21 ,$33.13 ,0,0,162:49:00,163,$0.00 ,$0.00 ,"$6,792.21 ","$6,792.21 ",$100.00 ,"$6,892.21 "
Completed,New,2021,Spring,CCAS,BISC,3450,Evolutionary Medicine,Everly,MP3,none,MP3,none,ID1,none,2022-SP,4,1/28/21,none,5/28/21,0,0,0,0,Remote,32:39:00,4.05,32:39:00,13,114,8.77,17,00:00:00,0,0,0,0,1,0,Partial,0,0,0,MP3,none,MP3,none,$33.13 ,$0.00 ,$33.13 ,$0.00 ,0,0,32:39:00,32.75,$0.00 ,$0.00 ,"$1,085.01 ","$1,085.01 ",$100.00 ,"$1,185.01 "
Completed,New,2021,Spring,CCAS,SOC,1002,The Sociological Imagination,Dalton,MP3,none,MP3,none,ID1,none,2022-SP,4,1/28/21,none,5/28/21,0,0,0,0,Remote,10:22:00,1.3,10:22:00,8,34.5,4.3,18,00:00:00,0,0,0,0,0,0,None,0,0,0,MP3,none,MP3,none,$33.13 ,$0.00 ,$33.13 ,$0.00 ,0,0,10:22:00,10.5,$0.00 ,$0.00 ,$347.87 ,$347.87 ,$100.00 ,$447.87 
Completed,New,2021,Spring,CCAS,PHIL,2045,Introduction to Logic,Quillen,MP2,none,MP2,none,ID1,none,2022-SP,5,1/28/21,none,7/1/21,0,0,0,0,Remote,253:31:00,31.7,253:31:00,35,246,7,61,00:00:00,0,0,0,0,35,0,Yes,0,0,0,MP2,none,MP2,none,$32.80 ,$0.00 ,$32.80 ,$0.00 ,0,0,253:31:00,253.5,$0.00 ,$0.00 ,"$8,314.80 ","$8,314.80 ",$100.00 ,"$8,414.80 "
Completed,New,2021,Spring,CCAS,PHIL,3142W,Philosophy of Law,Prescott,MP1,none,MP1,none,ID3,none,2022-SP,4,1/28/21,none,5/28/21,0,0,0,0,Remote,119:29:00,15,119:29:00,19,135,7,53,00:00:00,0,0,0,0,19,0,Yes,0,0,0,MP1,none,MP1,none,$50.21 ,$0.00 ,$50.21 ,$0.00 ,0,0,119:29:00,119.5,$0.00 ,$0.00 ,"$6,000.10 ","$6,000.10 ",$100.00 ,"$6,100.10 "
Completed,New,2021,Spring,CCAS,ENG,2470,Poetry Writing,Galloway,MP1,none,MP1,none,ID3,none,2022-SP,4,1/28/21,none,5/28/21,0,0,0,0,Remote,01:45:00,0.2,01:45:00,1,1,1,105,00:00:00,0,0,0,0,1,0,Yes,0,0,0,MP1,none,MP1,none,$50.21 ,$0.00 ,$50.21 ,$0.00 ,0,0,01:45:00,1.75,$0.00 ,$0.00 ,$87.87 ,$87.87 ,$100.00 ,$187.87 
Completed,New,2021,Spring,CCAS,ENGL/WGSS,2710,"Postcolonialism, Race, and Gender",Prentiss,MP4,none,MP4,MP2,ID5,ID6,2022-SP,3,1/28/21,none,4/1/21,0,0,0,0,Remote,100:00:50,12.5,100:00:50,13,128,10,47,00:00:00,0,0,0,0,11,0,Partial,0,0,0,MP4,none,MP4,MP2,$41.36 ,$0.00 ,$41.36 ,$32.80 ,0,0,100:00:50,100,$0.00 ,$0.00 ,"$3,708.00 ","$3,708.00 ",$100.00 ,"$3,808.00 "
Completed,New,2021,Spring,CCAS,POLSCI,2225,Women & Politics,Navarro,MP4,none,MP4,MP2,ID5,ID6,2022-SP,4,1/28/21,none,5/28/21,0,0,0,0,Remote,57:09:00,7.15,57:09:00,12,59,5,58,00:00:00,0,0,0,0,10,0,Partial,0,0,0,MP4,none,MP4,MP2,$41.63 ,$0.00 ,$41.36 ,$32.80 ,0,0,57:09:00,57,$0.00 ,$0.00 ,"$2,113.56 ","$2,113.56 ",$100.00 ,"$2,213.56 "
Completed,Refresh,2021,Spring,GSEHD,HOL,6710,"Globalization, Change, and Learning",Calder,MP3,none,MP3,none,ID5,ID6,2022-SP,5,1/28/21,none,6/1/21,0,0,0,0,Remote,14:08:00,1.75,14:08:00,6,40,6.67,21,00:00:00,0,0,0,0,1,0,Partial,0,0,0,MP3,none,MP3,none,$33.13 ,$0.00 ,$33.13 ,$0.00 ,0,0,14:08:00,14.25,$0.00 ,$0.00 ,$472.10 ,$472.10 ,$100.00 ,$572.10 
Completed,Refresh,2021,Spring,GSEHD,HOL,6703,Consulting Skills,Calder,MP2,none,MP4,MP2,ID5,ID6,2022-SP,3,1/28/21,none,4/1/21,0,0,0,0,Remote,75:32:00,9.45,75:32:00,11,75,6.75,60,00:00:00,0,0,0,0,2,0,Partial,0,0,0,MP2,none,MP4,MP2,$32.80 ,$0.00 ,$41.36 ,$32.80 ,0,0,75:32:00,75.5,$0.00 ,$0.00 ,"$2,799.54 ","$2,799.54 ",$100.00 ,"$2,899.54 "
Completed,New,2021,Summer,ESIA,IAFF,6503,Political Risk Analysis (1-credit version),Lennox,MP4,none,MP4,none,ID6,none,2022-SP,1,6/1/21,none,7/1/21,0,4,0,0,Remote,17:39:00,2.2,17:39:00,2,11,5.5,96,00:00:00,0,0,0,0,0,0,None,0,0,0,MP4,none,MP4,none,$41.36 ,$0.00 ,$41.36 ,$0.00 ,0,0,17:39:00,17.75,$0.00 ,$0.00 ,$734.14 ,$734.14 ,$100.00 ,$834.14 
Completed,New,2021,Summer,ESIA,IAFF,6186,US Grand Strategy,Keaton,MP1,none,MP1,none,ID6,none,2022-SP,2,6/1/21,none,8/1/21,0,4,0,0,Remote,96:03:00,12,96:03:00,16,94,5.88,61,00:00:00,0,0,0,0,16,0,Yes,0,0,0,MP1,none,MP1,none,$50.21 ,$0.00 ,$50.21 ,$0.00 ,0,0,96:03:00,96,$0.00 ,$0.00 ,"$4,820.16 ","$4,820.16 ",$100.00 ,"$4,920.16 "
Completed,New,2021,Fall,LAW,GCON,6513-DE,Negotiations in Government Contracts,Beckett,MP1,MP1,MP4,none,ID3,ID4,2022-SP,6,7/9/21,12/17/21,1/7/22,21,7,0,12,Studio,62:52:00,7.9,62:52:00,11,187,17,20,00:00:00,0,0,0,0,0,0,None,0,0,0,MP1,MP1,MP4,none,$50.21 ,$50.21 ,$41.36 ,$0.00 ,0,12,62:52:00,63,$0.00 ,$602.52 ,"$2,605.68 ","$3,208.20 ",$100.00 ,"$3,308.20 "
Completed,New,2021,Fall,CCAS,ENG,3440W,"Shakespeare, Race, and Gender on Screen",Bridger,MP1,MP1,MP4,none,ID2,none,2022-SUM,4,8/24/21,12/17/21,12/10/21,-7,6,0,9,Studio,45:30:00,5.7,45:30:00,10,48.5,4.85,55,00:00:00,0,0,0,0,10,0,Yes,0,0,0,MP1,MP1,MP4,none,$50.21 ,$50.21 ,$41.36 ,$0.00 ,0,9,45:30:00,45.5,$0.00 ,$451.89 ,"$1,881.88 ","$2,333.77 ",$100.00 ,"$2,433.77 "
Completed,Refresh,2021,Fall,CCAS,PSYC,3199,Special Topics: Eating Disorders,Northcott,MP2,MP4,MP4,none,ID1,none,2022-SUM,7,8/24/21,12/17/21,3/2/22,75,4,0,0,Remote,97:31:00,12.2,97:31:00,22,419.5,19.1,14,00:00:00,0,0,0,0,0,0,None,0,0,0,MP2,MP4,MP4,none,$32.80 ,$41.36 ,$41.36 ,$0.00 ,0,0,97:31:00,97.5,$0.00 ,$0.00 ,"$4,032.60 ","$4,032.60 ",$100.00 ,"$4,132.60 "
Completed,New,2021,Fall,CCAS,PSC,2105,Major Issues of Western Political Thought I,Lovelace,MP3,MP1,MP3,none,ID4,none,2022-SUM,4,8/24/21,12/17/21,12/20/21,3,3,0,3.5,Studio,03:49:00,0.5,03:49:00,8,56.5,7,4,00:00:00,0,0,0,0,8,0,Yes,0,0,0,MP3,MP1,MP3,none,$33.13 ,$50.21 ,$33.13 ,$0.00 ,0,3.5,03:49:00,4,$0.00 ,$175.74 ,$132.52 ,$308.26 ,$100.00 ,$408.26 
Completed,Refresh,2021,Fall,CCAS,EAP,6110,Academic Writing & Research for International Students I,Vasquez,MP3,MP1,MP3,none,ID1,none,2022-SUM,4,8/24/21,12/17/21,12/16/21,-1,4,0,3,Studio,00:50:00,0.15,00:50:00,2,4.5,2.25,11,00:00:00,0,0,0,0,2,0,Yes,0,0,0,MP3,MP1,MP3,none,$33.13 ,$50.21 ,$33.13 ,$0.00 ,0,3,00:50:00,1,$0.00 ,$150.63 ,$33.13 ,$183.76 ,$100.00 ,$283.76 
Completed,New,2021,Fall,CCAS,PSYC,2015,Biological Psychology,Fairbanks,MP3,MP1,MP3,none,ID1,none,2022-SUM,5,9/2/21,12/17/21,1/26/21,40,8,0,7,Studio,78:35:00,9.8,78:35:00,13,128.5,9.88,37,00:00:00,0,0,0,0,13,0,Yes,0,0,0,MP3,MP1,MP3,none,$33.13 ,$50.21 ,$33.13 ,$0.00 ,0,7,78:35:00,78.5,$0.00 ,$351.47 ,"$2,600.71 ","$2,952.18 ",$100.00 ,"$3,052.18 "
Completed,Refresh,2021,Fall,CCAS,ANTH,1002,Sociocultural Anthropology,Bramley,MP2,MP2,MP2,none,ID4,none,2022-SUM,5,8/24/21,12/17/21,1/12/22,26,4,0,0,Remote,68:38:18,8.6,67:04:08,14,192.25,13.73,21,01:34:10,4,232.25,58,0.4,0,0,None,0,0,0,MP2,MP2,MP2,none,$32.80 ,$32.80 ,$32.80 ,$0.00 ,0,0,68:38:18,68.75,$0.00 ,$0.00 ,"$2,255.00 ","$2,255.00 ",$100.00 ,"$2,355.00 "
Completed,Refresh,2021,Fall,CCAS,GEOG,2104,Introduction to Cartography,Jessop,MP2,MP2,MP2,none,ID1,none,2022-SUM,6,8/24/21,12/17/21,2/14/22,59,4,0,10,Studio,144:30:00,18.05,144:30:00,29,226.55,7.81,38,00:00:00,0,0,0,0,11,0,Partial,0,0,0,MP2,MP2,MP2,none,$32.80 ,$32.80 ,$32.80 ,$0.00 ,0,10,144:30:00,144.5,$0.00 ,$328.00 ,"$4,739.60 ","$5,067.60 ",$100.00 ,"$5,167.60 "
Completed,New,2021,Fall,ESIA,IAFF,6186,Russia and International Security,Crenshaw,MP1,MP1,MP4,none,ID2,none,2022-SP,5,8/24/21,12/17/21,1/7/22,21,4,0,0,Remote,29:42:00,3.75,29:42:00,12,81.25,6.77,22,00:00:00,0,0,0,0,12,0,Yes,0,0,0,MP1,MP1,MP4,none,$50.21 ,$50.21 ,$41.36 ,$0.00 ,0,0,29:42:00,29.75,$0.00 ,$0.00 ,"$1,230.46 ","$1,230.46 ",$100.00 ,"$1,330.46 "
Completed,Refresh,2021,Fall,ESIA,IAFF,6222,Ethics in Security Policy,Dorsey,MP2,MP2,MP2,none,ID2,none,2022-SP,4,8/24/21,12/17/21,12/10/21,-7,4,0,0,Remote,57:23:00,7.2,57:23:00,24,258.75,10.78,13,00:00:00,0,0,0,0,0,0,None,0,0,0,MP2,MP2,MP2,none,$32.80 ,$32.80 ,$32.80 ,$0.00 ,0,0,57:23:00,57.23,$0.00 ,$0.00 ,"$1,877.14 ","$1,877.14 ",$100.00 ,"$1,977.14 "
Completed,Refresh,2021,Fall,GSEHD,CNSL,6269,Practicum 1 in Mental Health Counseling,Ridgeway,MP1,MP1,MP2,none,ID4,none,2022-SP,4,8/24/21,12/17/21,12/10/21,-7,7,0,1,Studio,05:24:00,0.7,05:24:00,2,10,5,32,00:00:00,0,0,0,0,2,0,Yes,0,0,0,MP1,MP1,MP2,none,$50.21 ,$50.21 ,$32.80 ,$0.00 ,0,1,05:24:00,5.5,$0.00 ,$50.21 ,$180.40 ,$230.61 ,$100.00 ,$330.61 
Completed,New,2021,Fall,GSEHD,EDUC,8271,Education Policy for School Leaders,Sandoval,MP2,MP2,MP2,none,ID4,none,2022-FA,6,8/24/21,12/17/21,2/15/22,59,4,0,4,Studio,30:51:00,3.9,30:51:00,14,78.15,5.58,24,00:00:00,0,0,0,0,14,0,Yes,0,0,0,MP2,MP2,MP2,none,$32.80 ,$32.80 ,$32.80 ,$0.00 ,0,4,30:51:00,31,$0.00 ,$131.20 ,"$1,016.80 ","$1,148.00 ",$100.00 ,"$1,248.00 "
Completed,New,2022,Spring,GWSB,MBAD,6224,Data Analysis,Quimby,MP2,MP2,MP2,MP1,ID4,none,2022-FA,4,1/17/22,6/3/22,5/20/22,-14,6,2.25,2,Studio,08:37:00,1.05,08:37:00,7,30.75,4.4,17,00:00:00,0,0,0,0,6,0,Partial,0,0,0,MP2,MP2,MP2,MP1,$32.80 ,$32.80 ,$32.80 ,$50.21 ,13.5,2,08:37:00,8.5,$442.80 ,$65.60 ,$352.79 ,$861.19 ,$100.00 ,$961.19 
Completed,New,2022,Spring,GWSB,MBAD,6250,Technology for Business in DC,Hutchins,MP2,MP2,MP4,MP5,ID4,none,2022-FA,4,1/17/22,5/27/22,6/2/22,6,3,2.25,6,Studio,131:34:00,16.45,131:34:00,12,111,9.25,71,00:00:00,0,0,0,0,11,0,Yes,0,0,0,MP2,MP2,MP4,MP5,$32.80 ,$32.80 ,$41.36 ,$50.24 ,6.8,6,131:34:00,131.5,$221.40 ,$196.80 ,"$6,022.70 ","$6,440.90 ",$100.00 ,"$6,540.90 "
Completed,New,2022,Spring,LAW,GCON,6505-DE,Advocacy: Bid Protests,Thackeray,MP1,MP1,MP1,none,ID9,none,2022-SUM-1,4,1/17/22,5/13/22,5/10/22,-6,3,15,15,Studio,24:13:00,3,24:13:00,12,64.75,5.4,22,00:00:00,0,0,0,0,11,0,Partial,0,0,0,MP1,MP1,MP1,none,$50.21 ,$50.21 ,$50.21 ,$0.00 ,45,15,24:13:00,24.25,"$2,259.45 ",$753.15 ,"$1,217.59 ","$4,230.19 ",$100.00 ,"$4,330.19 "
Completed,New,2022,Spring,LAW,GCON,6513-DE,Selected Topics in Government Contract Law: Introduction to Other Transaction Authority (OTA),Eastwood,MP1,MP1,MP5,none,ID9,none,2022-SUM-1,3.5,1/17/22,5/4/22,4/29/22,-6,3,15,9.5,Studio,46:42:00,5.85,46:42:00,8,49.5,6.19,57,00:00:00,0,0,0,0,8,0,Yes,0,0,0,MP1,MP1,MP5,none,$50.21 ,$50.21 ,$50.24 ,$0.00 ,45,9.5,46:42:00,46.75,"$2,259.45 ",$477.00 ,"$2,348.72 ","$5,085.17 ",$100.00 ,"$5,185.17 "
Completed,New,2022,Spring,ESIA,IAFF,6162,Security Policy Analysis,Valdez,MP1,MP1,none,none,ID9,none,2022-FA,4,1/17/22,5/27/22,5/13/22,-14,0,0,4.5,Studio,00:00:00,0,00:00:00,7,0,0,0,00:00:00,0,0,0,0,0,0,None,0,0,0,MP1,MP1,none,none,$50.21 ,$50.21 ,$0.00 ,$0.00 ,0,4.5,00:00:00,0,$0.00 ,$225.95 ,$0.00 ,$225.95 ,$100.00 ,$325.95 
Completed,New,2022,Spring,ESIA,IAFF,6502,Monitoring and Evaluation,Gallant,MP3,MP2,MP1,none,ID10,none,2022-SUM-2,4,1/17/22,5/27/22,5/20/22,-7,3,3.5,2,Studio,10:21:00,7.4,10:21:00,7,43.25,6.18,14,00:00:00,0,0,0,0,0,0,None,0,0,0,MP3,MP2,MP1,none,$33.13 ,$32.80 ,$50.21 ,$0.00 ,10.5,2,10:21:00,10.25,$347.87 ,$65.60 ,$514.65 ,$928.12 ,$100.00 ,"$1,028.12 "
Completed,New,2022,Spring,ESIA,IAFF,6502,Strategic Communications,Redding,MP3,MP1,MP3,none,ID10,none,2022-FA,4,1/17/22,5/27/22,5/26/22,-1,3,4.25,1,Studio,12:15:00,1.2,03:57:00,2,5.5,2.75,43,08:18:00,6,167.5,27.92,3,2,0,Partial,0,0,0,MP3,MP1,MP3,none,$33.13 ,$50.21 ,$33.13 ,$0.00 ,12.8,1,12:15:00,10.25,$422.41 ,$50.21 ,$339.58 ,$812.20 ,$100.00 ,$912.20 
Completed,Refresh,2022,Spring,CCAS,PSYD,6221,Rural LGBT Health Online,Pennington,MP2,MP2,MP5,MP2,ID4,none,2022-FA,4,1/17/22,5/27/22,6/14/22,18,2,9,2,"Studio, Remote",43:05:00,5.25,43:05:00,7,245.75,35.11,11,00:00:00,0,0,0,0,6,0,Partial,0,0,0,MP2,MP2,MP5,MP2,$32.80 ,$32.80 ,$50.24 ,$32.80 ,18,2,43:05:00,43,$590.40 ,$65.60 ,"$1,785.36 ","$2,441.36 ",$100.00 ,"$2,541.36 "
Completed,Refresh,2022,Spring,CCAS,SOC,2135,Youth and Delinquency,Fitzgerald,MP2,MP2,MP2,none,ID1,none,2022-SUM-1,4,1/17/22,5/13/22,5/11/22,-2,3,9,6,Studio,19:58:00,2.5,19:58:00,6,45.25,7.54,26,00:00:00,0,0,0,0,3,0,Partial,0,0,0,MP2,MP2,MP2,none,$32.80 ,$32.80 ,$32.80 ,$0.00 ,27,6,19:58:00,20,$885.60 ,$196.80 ,$656.00 ,"$1,738.40 ",$100.00 ,"$1,838.40 "
Completed,Refresh,2022,Spring,CCAS,GEOG,1003,Society and Environment,Nightingale,MP3,MP1,MP3,none,ID1,none,2022-SUM-1,4,1/17/22,5/13/22,5/10/22,-3,6,8.25,4,Studio,24:56:00,3.15,24:56:00,9,66,7.33,23,00:00:00,0,0,0,0,9,0,Yes,0,0,0,MP3,MP1,MP3,none,$33.13 ,$50.21 ,$33.13 ,$0.00 ,49.5,4,24:56:00,25,"$1,639.94 ",$200.84 ,$828.25 ,"$2,669.03 ",$100.00 ,"$2,769.03 "
Completed,New,2022,Spring,CCAS,ENG,1315,Literature and Financial Imagination,Okonkwo,MP2,MP2,MP2,none,ID4,none,2022-SUM-2,4,1/17/22,5/13/22,5/11/22,-2,4,12,5,Studio,18:22:00,2.3,18:22:00,9,70.25,7.81,16,00:00:00,2,9,0,0,8,0,Partial,0,0,0,MP2,MP2,MP2,none,$32.80 ,$32.80 ,$32.80 ,$0.00 ,48,5,18:22:00,18.5,"$1,574.40 ",$164.00 ,$606.80 ,"$2,345.20 ",$100.00 ,"$2,445.20 "
Completed,Refresh,2022,Spring,CCAS,HIST,1310,Intro to American History,Ellison,MP3,MP2,MP4,none,ID1,none,2022-SUM-1,4,1/17/22,5/20/22,5/3/22,-17,5,7.25,10,Studio,24:30:00,3.05,20:08:00,13,99,16.5,12,04:22:00,6,115.5,19.25,2,13,6,Yes,0,0,0,MP3,MP2,MP4,none,$33.13 ,$32.80 ,$41.36 ,$0.00 ,36.3,10,24:30:00,24.5,"$1,200.96 ",$328.00 ,"$1,013.32 ","$2,542.28 ",$100.00 ,"$2,642.28 "
Completed,Refresh,2022,Spring,CCAS,HIST,1011,"World History, 1500-Present",Alcott,MP3,MP1,MP4,MP3,ID9,none,2022-SUM-2,4,1/17/22,5/27/22,5/26/22,-1,6,7.25,9,Studio,30:53:00,3.9,30:53:00,15,90.25,6.02,21,00:00:00,0,0,0,0,15,0,Yes,0,0,0,MP3,MP1,MP4,MP3,$33.13 ,$50.21 ,$41.36 ,$33.13 ,43.5,9,30:53:00,31,"$1,441.16 ",$451.89 ,"$1,154.60 ","$3,047.64 ",$100.00 ,"$3,147.64 "
Completed,New,2022,Spring,CCAS,GEOG,3195,Sustainable Food Systems,Underhill,MP2,MP2,MP4,MP1,ID1,none,2022-SUM-2,4,1/27/22,5/13/22,5/10/22,-3,4,12,6,Studio,43:42:00,5.5,43:42:00,11,114.5,10.41,23,00:00:00,0,0,0,0,11,0,Yes,0,0,0,MP2,MP2,MP4,MP1,$32.80 ,$32.80 ,$41.36 ,$50.21 ,48,6,43:42:00,43.75,"$1,574.40 ",$196.80 ,"$2,003.09 ","$3,774.29 ",$100.00 ,"$3,874.29 "
Completed,Refresh,2022,Spring,CCAS,SLHS,1071,The Foundations of Human Communication,Whitlock,MP2,MP2,MP5,MP2,ID8,none,2022-SUM-2,4,1/17/22,5/27/22,6/7/22,11,9,11,11,Studio,120:19:00,15,120:19:00,13,99.25,7.64,73,00:00:00,0,0,0,0,8,0,Partial,0,0,0,MP2,MP2,MP5,MP2,$32.80 ,$32.80 ,$50.24 ,$32.80 ,99,11,120:19:00,120.25,"$3,247.20 ",$360.80 ,"$4,992.78 ","$8,600.78 ",$100.00 ,"$8,700.78 "
Completed,New,2022,Spring,GSEHD,EDUC,8280,Critical Review of Educational Leadership Literature,Hollis,MP3,MP1,MP3,none,ID7,none,2023-SP,4,1/17/22,6/3/22,5/27/22,-7,3,3,2,Studio,03:01:00,0.4,03:01:00,2,7.75,3.89,23,00:00:00,0,0,0,0,2,0,Yes,0,0,0,MP3,MP1,MP3,none,$33.13 ,$50.21 ,$33.13 ,$0.00 ,9,2,03:01:00,3,$298.17 ,$100.42 ,$99.39 ,$497.98 ,$100.00 ,$597.98 
Completed,New,2022,Summer,LAW,GCON,6512-10,Intellectual Property,Sinclair,MP1,MP1,MP1,MP4,ID8,none,2022-FA,4,3/1/22,7/21/22,7/25/22,4,3,10,10,Studio,36:48:00,4.6,36:48:00,14,94,6.71,23,00:00:00,0,0,0,0,14,0,Yes,0,0,0,MP1,MP1,MP1,MP4,$50.21 ,$50.21 ,$50.21 ,$41.36 ,30,10,36:48:00,36.75,"$1,506.30 ",$502.10 ,"$1,682.60 ","$3,691.00 ",$100.00 ,"$3,791.00 "
Completed,Refresh,2022,Fall,GWSB,MGT,6253,Leadership and Executive Development,Yoder,MP1,MP1,MP1,MP3,ID4,none,2023-SP,4,8/30/22,12/16/22,12/2/22,-14,3,15,4,Studio,24:58:00,3.13,24:58:00,11,55.75,5.07,27,00:00:00,0,0,0,0,10,0,Partial,0,16,0,MP1,MP1,MP1,MP3,$51.65 ,$51.65 ,$51.65 ,$34.62 ,45,4,24:58:00,25,"$2,324.25 ",$206.60 ,"$1,078.38 ","$3,609.23 ",$100.00 ,"$3,709.23 "
Completed,New,2022,Fall,GWSB,ISTM,6202,Database Management,Montrose,MP1,MP1,MP1,MP3,ID8,none,2023-FA,4,9/15/22,12/16/22,12/21/22,5,3,0,8,Studio,27:41:00,3.47,27:41:00,8,49.65,6.21,33,00:00:00,0,0,0,0,0,0,None,0,45,0,MP1,MP1,MP1,MP3,$51.65 ,$51.65 ,$51.65 ,$34.62 ,0,8,27:41:00,27.75,$0.00 ,$413.20 ,"$1,197.00 ","$1,610.20 ",$100.00 ,"$1,710.20 "
Completed,New,2022,Fall,CCAS,ECON,2199,Economics of E-Commerce,Merriweather,MP3,MP1,MP3,none,ID1,none,2023-SUM1,4,8/31/22,12/2/22,12/12/22,10,5,9,2,Studio,19:45:00,2.57,19:45:00,6,32.5,5.42,36,00:00:00,0,0,0,0,6,0,Yes,0,0,0,MP3,MP1,MP3,none,$34.62 ,$51.65 ,$34.62 ,$0.00 ,45,2,19:45:00,19.75,"$1,557.90 ",$103.30 ,$683.75 ,"$2,344.95 ",$100.00 ,"$2,444.95 "
Completed,New,2022,Fall,CCAS,SMPA,6270.D80,Media Organizationa and Audiences,Sheffield,MP2,MP2,MP2,none,ID1,none,2023-SUM1,4,8/31/22,12/2/22,12/2/22,0,3,6,2,Studio,51:01:00,6.38,49:41:00,12,88.5,9.15,34,01:20:00,1,30.5,30.5,3,4,0,Partial,0,0,0,MP2,MP2,MP2,none,$34.27 ,$34.27 ,$34.27 ,$0.00 ,18,2,51:01:00,51,$616.86 ,$68.54 ,"$1,747.77 ","$2,433.17 ",$100.00 ,"$2,533.17 "
Completed,New,2022,Fall,CCAS,GEOG,1001,Introduction to Human Geography,Vandermeer,MP2,MP2,MP2,none,ID10,none,2023-SUM2,4,8/24/22,2/24/23,4/18/23,32,10,10,3,Studio,136:10:00,17,131:49:00,16,102.75,6.42,77,04:21:00,5,134.5,26.9,2,13,0,Partial,0,0,0,MP2,MP2,MP2,none,$34.27 ,$34.27 ,$34.27 ,$0.00 ,100,3,136:10:00,136.25,"$3,427.00 ",$102.81 ,"$4,669.29 ","$8,199.10 ",$100.00 ,"$8,299.10 "
Completed,New,2022,Fall,CCAS,CSA,1601,New Media Digital Art,Sullivan,MP3,MP1,MP1,none,ID8,none,2023-SUM1,4,8/31/22,12/2/22,12/12/22,10,5,8,10,Studio,14:10:52,1.75,04:09:52,2,8,4,31,10:01:00,8,167.75,20.97,4,2,5,Partial,0,0,0,MP3,MP1,MP1,none,$34.62 ,$51.65 ,$51.65 ,$0.00 ,40,10,14:10:52,14.25,"$1,384.80 ",$516.50 ,$736.01 ,"$2,637.31 ",$100.00 ,"$2,737.31 "
Completed,New,2022,Fall,CCAS,PSC,2366,Russian Politics,Jericho,MP2,MP2,MP2,MP3,ID1,none,2023-SUM1,4,8/31/22,12/16/22,12/1/22,-15,3,5,2.5,Studio,22:13:00,2.78,22:13:00,12,70.75,5.9,19,00:00:00,0,0,0,0,7,0,Partial,0,2,1,MP2,MP2,MP2,MP3,$34.27 ,$34.27 ,$34.27 ,$34.62 ,15,2.5,22:13:00,22.25,$514.05 ,$85.68 ,$766.40 ,"$1,366.13 ",$100.00 ,"$1,466.13 "
Completed,New,2022,Fall,CCAS,SOC,2164,Sociology of the Holocaust and Genecide,Ellery,MP3,MP1,MP2,none,ID4,none,2023-SUM2,4,8/24/22,12/9/22,12/9/22,0,5,7,4.5,Studio,14:34:42,1.81,10:42:51,4,27.75,6.94,23,03:51:51,2,71.25,35.63,3,4,2,Yes,0,0,0,MP3,MP1,MP2,none,$34.62 ,$51.65 ,$34.27 ,$0.00 ,35,4.5,14:34:42,14.5,"$1,211.70 ",$232.43 ,$496.92 ,"$1,941.04 ",$100.00 ,"$2,041.04 "
Completed,New,2022,Fall,CCAS,SOC,1003,Introduction to Criminal JusID6,Sutter,MP2,MP2,MP2,MP3,ID1,none,2023-SUM1,4,8/31/22,1/27/23,1/23/23,-4,3,5,5.5,Studio,30:08:00,2.78,22:17:00,8,63.5,7.94,21,07:51:00,7,81,11.57,6,4,0,Partial,1,9,0,MP2,MP2,MP2,MP3,$34.27 ,$34.27 ,$34.27 ,$34.62 ,15,5.5,30:08:00,30,$514.05 ,$188.49 ,"$1,033.35 ","$1,735.89 ",$100.00 ,"$1,835.89 "
Completed,Refresh,2022,Fall,GSEHD,CNSL,6185,Internship in Counseling,Ridgeway,MP3,MP1,MP3,none,ID10,none,2023-SP,4,9/19/22,12/2/22,12/12/22,23,4,2,1,Studio,04:17:00,0.53,04:17:00,2,11.25,5.63,23,00:00:00,0,0,0,0,2,0,Yes,0,0,0,MP3,MP1,MP3,none,$34.62 ,$51.65 ,$34.62 ,$0.00 ,8,1,04:17:00,4.25,$276.96 ,$51.65 ,$147.14 ,$475.75 ,$100.00 ,$575.75 
Completed,Refresh,2023,Spring,GWSB,MGT,6286,Creativity and Innovation,Garrity,MP3,MP1,MP3,none,ID9,none,2024-SP,4,1/30/23,5/12/23,4/21/23,-21,3,24,7,Studio,20:15:25,2.53,20:15:25,25,297.75,11.91,4,00:00:00,0,0,0,0,0,0,None,0,0,0,MP3,MP1,MP3,none,$34.62 ,$51.65 ,$34.62 ,$0.00 ,72,7,20:15:25,20.25,"$2,492.64 ",$361.55 ,$701.06 ,"$3,555.25 ",$100.00 ,"$3,655.25 "
Completed,New,2023,Spring,CCAS,SOC,2101,Social Research Methods,Ravenscroft,MP1,MP1,MP1,none,ID1,none,2023-SUM-1,4,1/19/23,5/12/23,5/9/23,-3,2,22,5,Studio,23:13:07,2.91,23:13:07,11,39.5,3.6,35,00:00:00,0,0,0,0,11,0,Yes,0,0,0,MP1,MP1,MP1,none,$51.65 ,$51.65 ,$51.65 ,$0.00 ,44,5,23:13:07,23.25,"$2,272.60 ",$258.25 ,"$1,200.86 ","$3,731.71 ",$100.00 ,"$3,831.71 "
Completed,New,2023,Spring,CCAS,ENG,2800W,Introduction to Critical Theory,Bridger,MP1,MP1,MP1,none,ID4,none,2023-SUM-2,4,1/19/23,5/12/23,5/23/23,11,4,26,7.5,Studio,21:31:28,2.69,17:22:10,10,53.75,5.38,19,04:09:18,2,48,24,5,10,0,Partial,0,0,0,MP1,MP1,MP1,none,$51.65 ,$51.65 ,$51.65 ,$0.00 ,104,7.5,21:31:28,21.5,"$5,371.60 ",$387.38 ,"$1,110.48 ","$6,869.45 ",$100.00 ,"$6,969.45 "
Completed,New,2023,Spring,CCAS,COMM,6242,Organizational Communication and Conflict Management,Marchetti,MP2,MP2,MP2,none,ID1,none,2023-FA,4,1/19/23,5/12/23,5/25/23,13,8,14,4,Studio,18:19:17,2.29,05:39:02,2,5.75,2.88,59,12:40:15,12,87,7.25,9,2,12,Yes,0,0,0,MP2,MP2,MP2,none,$34.27 ,$34.27 ,$34.27 ,$0.00 ,112,4,18:19:17,18.33,"$3,838.24 ",$137.08 ,$628.17 ,"$4,603.49 ",$100.00 ,"$4,703.49 "
Completed,New,2023,Spring,CCAS,FORS,6256,Forensic Pathology,Wexler,MP2,MP2,MP2,none,ID1,none,2023-FA,4,1/19/23,5/12/23,6/6/23,25,8,73.5,0,Remote,11:32:53,1.44,00:00:00,0,0,0,0,11:32:53,147,79.75,0.54,9,0,147,None,0,0,0,MP2,MP2,MP2,none,$34.27 ,$0.00 ,$34.27 ,$0.00 ,588,0,11:32:53,11.5,"$20,150.76 ",$0.00 ,$394.11 ,"$20,544.87 ",$100.00 ,"$20,644.87 "
Completed,New,2023,Spring,CCAS,DATS,2102,Visualizing and Modeling Politics; Data Visualization for Data Science,Birchwood,MP2,MP2,MP2,none,ID8,none,2023-SUM-1,4,1/19/23,5/12/23,5/4/23,-8,5,4,1.5,Studio,14:56:05,1.88,14:56:05,7,27.75,3.96,32,00:00:00,0,0,0,0,7,0,Yes,0,0,0,MP2,MP2,MP2,none,$34.27 ,$34.27 ,$34.27 ,$0.00 ,20,1.5,14:56:05,15,$685.40 ,$51.41 ,$514.05 ,"$1,250.86 ",$100.00 ,"$1,350.86 "
Completed,New,2023,Spring,CCAS,WGSS,2125,Varieties for Feminist Theory,Ames,MP3,MP1,MP3,none,ID10,none,2023-SUM-1,4,1/19/23,5/12/23,5/18/23,6,5,22,3,Studio,27:52:16,3.5,23:53:34,12,81,6.75,18,03:58:42,4,57.5,14.38,4,12,0,Yes,0,0,0,MP3,MP2,MP3,none,$34.62 ,$34.27 ,$34.62 ,$0.00 ,110,3,27:52:16,27.9,"$3,808.20 ",$102.81 ,$965.90 ,"$4,876.91 ",$100.00 ,"$4,976.91 "
Completed,New,2023,Spring,CCAS,PHJL,1062,Philosophy of Film,Kingsley,MP2,MP2,MP2,none,ID8,none,2023-SUM-1,4,1/19/23,5/12/23,4/11/23,-31,1,3.5,1,Studio,03:06:00,0.38,03:06:00,7,9.25,1.32,20,00:00:00,0,0,0,0,7,0,Yes,0,0,0,MP2,MP2,MP2,none,$34.27 ,$34.27 ,$34.27 ,$0.00 ,3.5,1,03:06:00,3.1,$119.95 ,$34.27 ,$106.24 ,$260.45 ,$100.00 ,$360.45 
Completed,Refresh,2023,Spring,GSEHD,EDUC,6114,Intoduction to Quantitative Research,Rowley,MP1,MP1,MP1,MP3,ID4,none,2024-SP,4,2/6/23,6/2/23,5/9/23,-17,2,17,2,Studio,08:38:28,1.07,02:20:28,4,12.45,3.11,11,06:18:00,10,37.75,3.78,10,4,10,Yes,0,0,0,MP1,MP1,MP3,none,$51.65 ,$51.65 ,$34.27 ,$0.00 ,34,2,08:38:28,8.7,"$1,756.10 ",$103.30 ,$298.15 ,"$2,157.55 ",$100.00 ,"$2,257.55 "
Completed,Refresh,2023,Spring,GSEHD,EDUC,6426,Computer Interface Design for Learning,Wainwright,MP1,MP1,MP3,none,ID4,none,2023-SUM-1,4,2/6/23,6/2/23,4/26/23,-37,1,1,1,Studio,02:41:30,0.34,02:41:30,1,3.5,3.5,46,00:00:00,0,0,0,0,1,0,Yes,0,0,0,MP1,MP1,MP3,none,$51.65 ,$51.65 ,$34.27 ,$0.00 ,1,1,02:41:30,2.75,$51.65 ,$51.65 ,$94.24 ,$197.54 ,$100.00 ,$297.54 
Completed,New,2023,Fall,CCAS,AMST,2610,"Science, Technology, and Politics in Modern America",Dunmore,MP1,MP1,MP1,none,ID8,none,2024-SUM-1,4,8/29/23,12/15/23,12/13/23,-2,1,12,4,Studio,16:53:51,2.11,09:10:36,17,145,8.53,4,07:43:15,4,166,41.5,3,17,4,Yes,0,0,0,MP1,MP1,MP1,none,$52.73 ,$52.73 ,$52.73 ,$0.00 ,12,4,16:53:51,17,$632.76 ,$210.92 ,$896.41 ,"$1,740.09 ",$100.00 ,"$1,840.09 "
Completed,New,2023,Fall,CCAS,COMM,3173,Communication in the Mediated World,Farrow,MP3,MP1,MP3,none,ID1,ID9,2024-SUM-1,4,8/29/23,12/15/23,12/4/23,-11,1,12,4,Studio,12:50:15,1.63,06:05:15,1,5.5,5.5,66,06:45:00,4,55,13.75,7,1,4,Yes,0,0,0,MP3,MP1,MP3,none,$35.21 ,$52.73 ,$35.21 ,$0.00 ,12,4,12:50:15,12.75,$422.52 ,$210.92 ,$448.93 ,"$1,082.37 ",$100.00 ,"$1,182.37 "
Completed,New,2023,Fall,CCAS,FORS,6207,Photography in the Forensic Sciences,Gentry,MP2,MP2,MP2,none,ID1,ID9,2024-FA,4,8/29/23,12/15/23,12/12/23,-3,1,10,7,Studio,33:18:30,4.16,33:18:30,11,113.5,10.32,18,00:00:00,0,0,0,0,11,0,Yes,0,0,0,MP2,MP2,MP2,none,$35.21 ,$35.21 ,$35.21 ,$0.00 ,10,7,33:18:30,33.25,$352.10 ,$246.47 ,"$1,170.73 ","$1,769.30 ",$100.00 ,"$1,869.30 "
Completed,New,2023,Fall,CCAS,CMST,6201,Introduction to Museum Collections,Bowen,MP2,MP2,MP2,none,ID11,none,2024-SUM-1,4,8/28/23,12/15/23,12/6/23,-9,1,17.25,4,Studio,43:02:19,5.38,27:20:06,5,30.25,6.05,54,15:42:13,9,113.25,12.58,8,5,9,Yes,0,0,0,MP2,MP2,MP2,none,$35.21 ,$35.21 ,$35.21 ,$0.00 ,17.3,4,43:02:19,43,$607.37 ,$140.84 ,"$1,514.03 ","$2,262.24 ",$100.00 ,"$2,362.24 "
Completed,New,2023,Fall,CCAS,SOC,2175,Sex and Gender,Bellamy,MP3,MP1,MP3,none,ID10,none,2024-SUM-1,4,8/30/23,12/15/23,12/19/23,4,3,35,0,Remote,39:25:00,4.94,39:25:00,11,99.25,9.02,24,00:00:00,0,0,0,0,11,0,Yes,0,0,0,MP3,MP1,MP3,none,$35.21 ,$52.73 ,$35.21 ,$0.00 ,105,0,39:25:00,39.5,"$3,697.05 ",$0.00 ,"$1,390.80 ","$5,087.85 ",$100.00 ,"$5,187.85 "
Completed,New,2023,Fall,CCAS,PPPA,6000,PerspecID6s on Public Values (1-credit),Halloran,MP3,MP1,MP3,none,ID1,ID9,2024-SP,4,8/28/23,12/15/23,12/1/23,-14,3,11,2,Studio,12:33:56,1.56,12:33:56,3,20,6.67,38,00:00:00,0,0,0,0,3,0,Yes,0,0,0,MP3,MP1,MP3,none,$35.21 ,$52.73 ,$35.21 ,$0.00 ,33,2,12:33:56,12.5,"$1,161.93 ",$105.46 ,$440.13 ,"$1,707.52 ",$100.00 ,"$1,807.52 "
Completed,New,2023,Fall,CCAS,PSYC,1001,General Psychology,Zeller,MP2,MP2,MP2,none,ID9,none,2024-SUM-1,4,8/28/23,12/15/23,12/18/23,3,1,21,3.5,Studio,55:55:00,7,55:55:00,15,97.25,6.48,35,00:00:00,0,0,0,0,15,0,Yes,0,0,0,MP2,MP2,MP2,none,$35.21 ,$35.21 ,$35.21 ,$0.00 ,21,3.5,55:55:00,56,$739.41 ,$123.24 ,"$1,971.76 ","$2,834.41 ",$100.00 ,"$2,934.41 "
Completed,New,2023,Fall,CCAS,PSYD,6201,Multidisciplinary LGBT Health,Pennington,MP2,MP2,MP2,none,ID1,ID9,2024-SUM-2,4,8/30/23,12/15/23,12/12/23,-3,2,12,0,Remote,18:48:52,2.34,18:48:52,12,179.5,14.96,6,00:00:00,0,0,0,0,11,0,Partial,0,0,0,MP2,MP2,MP2,none,$35.21 ,$35.21 ,$35.21 ,$0.00 ,24,0,18:48:52,18.75,$845.04 ,$0.00 ,$660.19 ,"$1,505.23 ",$100.00 ,"$1,605.23 "
Completed,New,2023,Fall,GSEHD,CNSL,6378,Disability and Case Management,Ridgeway,MP3,MP2,MP2,none,ID10,none,2023-FA,4,8/28/23,12/15/23,11/6/23,-39,0,0,0,Remote,27:00:00,3.38,27:00:00,4,64,16,25,00:00:00,0,0,0,0,0,0,None,0,0,0,MP3,MP2,MP2,none,$35.21 ,$0.00 ,$35.21 ,$0.00 ,0,0,27:00:00,27,$0.00 ,$0.00 ,$950.67 ,$950.67 ,$100.00 ,"$1,050.67 "
Cancelled,New,2024,Spring,GWSB,MGT,6259,Employment Law and Ethics,Nolan,MP1,MP1,MP1,none,ID11,none,2024-FA,4,1/22/24,5/10/24,4/30/24,-10,3,30,2,Studio,00:00:00,0,00:00:00,15,0,0,0,00:00:00,0,0,0,0,15,0,Yes,0,0,0,MP1,MP1,MP1,none,$52.73 ,$52.73 ,$52.73 ,$0.00 ,90,2,00:00:00,0,"$4,745.70 ",$105.46 ,$0.00 ,"$4,851.16 ",$100.00 ,"$4,951.16 "
Completed,New,2024,Spring,CCAS,CMST,6202,Collections Management: Practical Applications,Yarborough,MP6,MP1,MP6,none,ID9,none,2024-FA,4,1/22/24,5/10/24,6/14/24,35,1.25,4.5,0,Remote,15:16:33,1.91,11:22:19,1,2.75,2.75,248,03:54:14,3,9,3,26,1,3,Yes,0,0,0,MP6,MP1,MP6,none,$27.00 ,$52.73 ,$27.00 ,$0.00 ,5.6,0,15:16:33,0,$151.88 ,$0.00 ,$0.00 ,$151.88 ,$100.00 ,$251.88 
Completed,New,2024,Spring,CCAS,DATS,1001,Data Science for All,Maddox,MP1,MP1,none,none,ID8,none,2024-SUM-1,4,1/22/24,5/10/24,5/7/24,-3,3,26,3,Studio,48:16:44,6.03,48:16:44,8,63,7.88,43,00:00:00,0,0,0,0,8,0,Yes,0,0,0,MP1,MP1,MP1,none,$52.73 ,$52.73 ,$52.73 ,$0.00 ,78,3,48:16:44,0,"$4,112.94 ",$158.19 ,$0.00 ,"$4,271.13 ",$100.00 ,"$4,371.13 "
Completed,New,2024,Spring,CCAS,PHIL,1051,Introduction to Philosophy,Calloway,MP3,MP1,none,none,ID10,none,2024-SUM-1,4,1/22/24,5/10/24,5/16/24,6,3,38.5,3,Studio,29:50:44,3.73,29:50:44,11,74.5,6.77,24,00:00:00,0,0,0,0,11,0,Yes,0,0,0,MP3,MP1,MP3,none,$35.21 ,$52.73 ,$35.21 ,$0.00 ,115.5,3,29:50:44,0,"$4,066.76 ",$158.19 ,$0.00 ,"$4,224.95 ",$100.00 ,"$4,324.95 "
Completed,New,2024,Spring,CCAS,PHIL,2125,Philosophy of Race and Gender,Bishop,MP3,MP1,none,none,ID1,none,2024-SUM-1,4,1/22/24,5/10/24,4/23/24,-17,2,10,1.5,Studio,13:42:00,1.72,05:00:00,1,6.5,6.5,46,00:00:00,0,0,0,0,1,0,Yes,0,2,0,MP3,MP1,MP3,none,$35.21 ,$52.73 ,$35.21 ,$0.00 ,20,1.5,13:42:00,0,$704.20 ,$79.10 ,$0.00 ,$783.30 ,$100.00 ,$883.30 
Completed,New,2024,Spring,CCAS,PSYD,6203,LGBT Health Policy,Lockhart,MP3,MP1,MP3,none,ID1,none,2024-SUM-2,4,1/22/24,5/10/24,4/9/24,-30,1,2,0,Remote,00:30:00,0.06,00:30:00,1,6,6,5,00:00:00,0,0,0,0,1,0,Yes,0,0,0,MP3,MP1,MP3,none,$35.21 ,$52.73 ,$35.21 ,$0.00 ,2,0,00:30:00,0,$70.42 ,$0.00 ,$0.00 ,$70.42 ,$100.00 ,$170.42 
Completed,New,2024,Spring,CCAS,SLHS,6291,Advanced Dysphagia Pediatric Feeding and Swallowing,Archer,MP6,MP1,MP6,MP2,ID1,none,2025-SP,4,1/22/24,5/10/24,6/28/24,49,4,43,8.5,Studio,56:32:20,7.06,50:02:20,16,41.5,2.6,72,06:30:00,2,93,46.5,4,16,2,Yes,0,0,0,MP6,MP1,MP6,MP2,$27.00 ,$52.73 ,$27.00 ,$35.21 ,172,8.5,56:32:20,0,"$4,644.00 ",$448.21 ,$0.00 ,"$5,092.21 ",$100.00 ,"$5,192.21 "
Completed,New,2024,Spring,CCAS,SOC,1001,Introduction to Sociology,Devlin,MP3,MP1,none,none,ID1,none,2024-SUM-1,4,1/22/24,5/10/24,5/17/24,7,2,13,2,Studio,18:44:04,2.34,18:44:04,7,51.5,7.36,22,00:00:00,0,0,0,0,7,0,Yes,0,0,0,MP3,MP1,MP3,none,$35.21 ,$52.73 ,$35.21 ,$0.00 ,26,2,18:44:04,0,$915.46 ,$105.46 ,$0.00 ,"$1,020.92 ",$100.00 ,"$1,120.92 "
Completed,New,2024,Spring,GSEHD,CNSL,6380,Job Placement and Supported Employment,Cobbett,MP3,MP1,none,none,ID10,none,2024-FA,4,1/22/24,5/10/24,6/14/24,35,5.6,16,0,Remote,08:20:23,1.04,01:31:23,3,37.75,12.58,2,06:49:00,7,44,6.29,9,1,7,Yes,0,0,0,MP3,MP1,MP1,none,$35.21 ,$52.73 ,$52.73 ,$0.00 ,89.6,0,08:20:23,0,"$3,154.82 ",$0.00 ,$0.00 ,"$3,154.82 ",$100.00 ,"$3,254.82 "
Completed,New,2024,Fall,CCAS,ECON,6374,Probability and Statistics for Economics,Tillman,MP3,MP1,none,none,ID1,none,2025-SP,4,8/27/24,12/20/24,12/16/24,-4,1,7,0,Studio,31:18:00,3.92,31:18:00,7,37.5,5.36,50,00:00:00,0,0,0,0,7,0,Yes,0,0,0,MP3,MP1,MP3,none,$36.90 ,$54.06 ,$36.90 ,$0.00 ,7,0,31:18:00,0,$258.30 ,$0.00 ,$0.00 ,$258.30 ,$100.00 ,$358.30 
Completed,New,2024,Fall,CCAS,FORS,6215,Science of Fingerprints,Thornbury,MP1,MP1,none,none,ID9,none,2025-SUM-1,4,8/27/24,12/20/24,1/27/25,38,2,1,1,Studio,04:14:46,0.53,04:14:46,1,8.25,8.25,31,00:00:00,0,0,0,0,1,0,Yes,0,0,0,MP1,MP1,MP1,none,$54.06 ,$54.06 ,$54.06 ,$0.00 ,2,1,04:14:46,0,$108.12 ,$54.06 ,$0.00 ,$162.18 ,$100.00 ,$262.18 
Completed,New,2024,Fall,CCAS,MATH,1051,Finite Mathematics for the Social and Management Sciences,Hawthorne,MP1,MP1,none,none,ID8,ID11,2025-SUM-1,4,8/27/24,12/20/24,11/12/24,-28,1,2,1,Studio,02:50:52,0.34,02:50:52,1,3.75,3.75,78,00:00:00,0,0,0,0,1,0,Yes,1,1,1,MP1,MP1,MP1,none,$54.06 ,$54.06 ,$54.06 ,$0.00 ,2,1,02:50:52,0,$108.12 ,$54.06 ,$0.00 ,$162.18 ,$100.00 ,$262.18 
Completed,New,2024,Fall,CCAS,PHIL,2132W,Social and Political Philosophy,Bishop,MP3,MP1,none,none,ID1,none,2025-SUM-1,4,8/27/24,12/20/24,11/13/24,-36,1,1.5,1,Studio,01:10:00,0.15,01:10:00,1,5.5,5.5,13,00:00:00,0,0,0,0,1,0,Yes,0,0,0,MP3,MP1,MP3,none,$36.90 ,$54.06 ,$36.90 ,$0.00 ,1.5,1,01:10:00,0,$55.35 ,$54.06 ,$0.00 ,$109.41 ,$100.00 ,$209.41 
Completed,New,2024,Fall,CCAS,PSC,2229,Media and Politics,Cadwell,MP1,MP1,none,none,ID8,ID10,2025-SUM-1,4,8/27/24,12/20/24,1/10/25,21,3,18,6.5,Studio,30:12:33,3.78,30:12:33,7,33.5,4.79,54,00:00:00,0,0,0,0,7,0,Yes,0,0,0,MP1,MP1,MP1,none,$54.06 ,$54.06 ,$54.06 ,$0.00 ,54,6.5,30:12:33,0,"$2,919.24 ",$351.39 ,$0.00 ,"$3,270.63 ",$100.00 ,"$3,370.63 "
Completed,New,2024,Fall,CCAS,ARTH,6262,Career Counseling and Art Theraphy,Fenwick,MP3,MP1,none,none,ID10,none,2025-SUM-1,4,8/27/24,12/20/24,12/20/24,0,1,4,0,Remote,03:41:00,0.47,00:00:00,0,0,0,0,03:41:00,4,46,11.56,5,4,0,Yes,0,0,0,MP3,MP1,MP3,none,$36.90 ,$54.06 ,$36.90 ,$0.00 ,4,0,03:41:00,0,$147.60 ,$0.00 ,$0.00 ,$147.60 ,$100.00 ,$247.60 
Completed,New,2024,Fall,CCAS,COMM,1041,Interpersonal Communication,Winslow,MP3,MP1,none,none,ID1,none,2025-SUM-2,4,8/27/24,12/20/24,2/3/25,45,1,1,1,Studio,07:45:00,0.13,01:00:00,1,2.5,2.5,36,06:45:00,12,114,9.5,3,1,0,Yes,0,0,0,MP3,MP1,MP3,none,$36.90 ,$54.06 ,$36.90 ,$0.00 ,1,1,07:45:00,0,$36.90 ,$54.06 ,$0.00 ,$90.96 ,$100.00 ,$190.96 
Completed,New,2024,Fall,CCAS,BISC,2220,Development Neurobiology,Ostrander,MP3,MP1,none,none,ID1,none,2025-SUM-1,4,8/27/24,12/20/24,12/20/24,0,2.25,15,4.5,Studio,13:09:17,1.65,13:09:17,8,44.25,5.53,18,00:00:00,0,0,0,0,8,0,Yes,0,0,0,MP3,MP1,MP3,none,$36.90 ,$54.06 ,$36.90 ,$0.00 ,33.8,4.5,13:09:17,0,"$1,245.38 ",$243.27 ,$0.00 ,"$1,488.65 ",$100.00 ,"$1,588.65 "
Completed,New,2024,Fall,GSEHD,HOL,6701,Adult Learning,Dorsey,MP1,MP1,none,none,ID9,none,2025-SP,4,8/27/24,12/20/24,11/22/24,-27,3,16,2,Studio,30:19:42,3.79,30:19:42,7,38.25,5.46,48,00:00:00,0,0,0,0,7,0,Yes,0,0,0,MP1,MP1,MP1,none,$54.06 ,$54.06 ,$54.06 ,$0.00 ,48,2,30:19:42,0,"$2,594.88 ",$108.12 ,$0.00 ,"$2,703.00 ",$100.00 ,"$2,803.00 "
Completed,New,2024,Fall,GSEHD,EDUC,6402,Trends and Issues in Educational Technology,Wainwright,MP3,MP1,none,none,ID10,none,2025-SP,4,8/27/24,12/20/24,11/20/24,-29,1,2.5,1,Studio,01:29:55,0.19,01:29:55,1,2.5,2.5,36,00:00:00,0,0,0,0,1,0,Yes,0,0,0,MP3,MP1,MP3,none,$36.90 ,$54.06 ,$36.90 ,$0.00 ,2.5,1,01:29:55,0,$92.25 ,$54.06 ,$0.00 ,$146.31 ,$100.00 ,$246.31 
Completed,New,2024,Fall,GSEHD,CNSL,6381,Medical and Psychosocial Aspects of Disabilities,Okafor,ID11,MP1,none,none,ID11,none,2025-FA,4,8/27/24,12/20/24,2/27/25,69,2,13,2,Studio,30:53:51,3.88,30:53:51,7,55.25,7.89,34,00:00:00,0,0,0,0,7,0,Yes,0,0,0,ID11,MP1,ID11,none,$0.00 ,$54.06 ,$0.00 ,$0.00 ,26,2,30:53:51,0,$0.00 ,$108.12 ,$0.00 ,$108.12 ,$100.00 ,$208.12 
Completed,New,2025,Spring,CCAS,CMUS,1104,Music in Film,Whitaker,MP3,MP1,none,none,ID1,none,2025-SUM-1,4,1/20/25,5/9/25,4/23/25,-16,1,5,2,Studio,03:30:44,0.44,03:30:44,6,111.25,18.54,2,00:00:00,0,0,0,0,7,0,Yes,0,0,0,MP3,MP1,none,none,$0.00 ,$0.00 ,$0.00 ,$0.00 ,5,2,03:30:44,0,$0.00 ,$0.00 ,$0.00 ,$0.00 ,$100.00 ,$100.00 
Cancelled,New,2025,Spring,CCAS,FORS,6219,Digital Image Processing,Delacroix,MP3,MP1,none,none,ID9,none,2025-FA,4,1/20/25,5/9/25,8/1/25,0,1,9,0,Remote,00:00:00,0,00:00:00,0,0,0,0,00:00:00,0,0,0,0,10,0,Yes,0,0,0,MP3,MP1,none,none,$0.00 ,$0.00 ,$0.00 ,$0.00 ,9,0,00:00:00,0,$0.00 ,$0.00 ,$0.00 ,$0.00 ,$100.00 ,$100.00 
Completed,New,2025,Spring,CCAS,PHIL,2111W,History of Ancient Philosophy,Chandler,MP3,MP1,none,none,ID1,none,2025-SUM-1,4,1/20/25,5/9/25,5/16/25,7,1,26,0,Remote,17:02:24,2.13,11:11:00,14,176.75,12.63,4,05:51:24,12,202,16.83,2,14,12,Yes,0,0,0,MP3,MP1,none,none,$0.00 ,$0.00 ,$0.00 ,$0.00 ,26,0,17:02:24,0,$0.00 ,$0.00 ,$0.00 ,$0.00 ,$100.00 ,$100.00 
Completed,New,2025,Spring,CCAS,PHIL,2140,"Philosophy of Love, Sex, and Friendship",Ashford,MP1,MP1,none,none,ID10,none,2025-SUM-2,4,1/20/25,5/9/25,5/13/25,4,0.4,14,2,Studio,21:50:43,2.72,20:40:32,7,38.75,5.54,32,01:10:11,10,202,20.2,0.4,7,10,Yes,0,0,0,MP1,MP1,none,none,$0.00 ,$0.00 ,$0.00 ,$0.00 ,5.6,2,21:50:43,0,$0.00 ,$0.00 ,$0.00 ,$0.00 ,$100.00 ,$100.00 
Completed,New,2025,Spring,CCAS,PSC,1001,Intro to Comparative Politics,Gladwell,MP3,MP1,none,none,ID10,none,2025-SUM-1,4,1/20/25,5/9/25,4/23/25,-16,1,7,1,"Studio, Remote",08:17:28,1.03,03:53:28,1,3.25,3.25,72,04:24:00,5,53,10.6,5,1,5,Yes,0,0,0,MP3,MP1,none,none,$0.00 ,$0.00 ,$0.00 ,$0.00 ,7,1,08:17:28,0,$0.00 ,$0.00 ,$0.00 ,$0.00 ,$100.00 ,$100.00 
Cancelled,New,2025,Spring,CCAS,SMPA,2120/6270,Public Opinion,Larkin,MP1,MP1,none,none,ID1,none,2025-SUM-2,4,1/20/25,5/9/25,8/1/25,0,0,0,0,Studio,00:00:00,0,00:00:00,0,0,0,0,00:00:00,0,0,0,0,0,0,None,0,0,0,MP1,MP1,none,none,$0.00 ,$0.00 ,$0.00 ,$0.00 ,0,0,00:00:00,0,$0.00 ,$0.00 ,$0.00 ,$0.00 ,$100.00 ,$100.00 
Completed,New,2025,Spring,CCAS,SMPA/AMST,3195/3950,TV News: A History,Mallory,MP3,MP1,none,none,ID1,none,2025-SUM-1,4,1/20/25,5/9/25,5/16/25,7,2.5,29,3,Studio,15:44:40,1.97,15:44:40,8,42,5.25,23,00:00:00,0,0,0,0,8,0,Yes,0,0,0,MP3,MP1,none,none,$0.00 ,$0.00 ,$0.00 ,$0.00 ,72.5,3,15:44:40,0,$0.00 ,$0.00 ,$0.00 ,$0.00 ,$100.00 ,$100.00 
Completed,New,2025,Spring,CCAS,AMST,1070,The American Cinema,Fontaine,MP1,MP1,none,none,ID11,none,2025-SUM-2,4,1/20/25,5/9/25,6/3/25,25,1,15,3,Studio,25:16:40,3.15,25:16:40,7,35,4.5,40,00:00:00,0,0,0,0,7,0,Yes,0,0,0,MP1,MP1,none,none,$0.00 ,$0.00 ,$0.00 ,$0.00 ,15,3,25:16:40,0,$0.00 ,$0.00 ,$0.00 ,$0.00 ,$100.00 ,$100.00 
Cancelled,New,2025,Spring,GSEHD,HOL,6704,Leadership in Organizations,Hargrove,MP3,MP1,none,none,none,none,2026-SP,4,1/20/25,5/9/25,8/1/25,0,1,13,2,Studio,00:00:00,0,00:00:00,0,0,0,0,00:00:00,0,0,0,0,6,2,Yes,0,0,0,MP3,MP1,none,none,$0.00 ,$0.00 ,$0.00 ,$0.00 ,13,2,00:00:00,0,$0.00 ,$0.00 ,$0.00 ,$0.00 ,$100.00 ,$100.00 `;
