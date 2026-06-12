#!/usr/bin/env node
// Skills-over-time chart generator — a self-hosted, dependency-free
// replacement for the discontinued CodersRank skills-chart widget
// (cr-skills-chart-widget.azurewebsites.net, offline since CodersRank shut down).
//
// Faithful to CodersRank's original render-chart.js: a STACKED AREA chart of
// straight-segment <polygon>s (top layer drawn first), per-skill legend, and an
// "Other" bucket. It is NOT smoothed — CodersRank used straight points and so
// does this. A left-to-right SMIL reveal animation makes it draw in over time;
// that animation plays even when the SVG is embedded as an <img>, which is how
// GitHub serves README images (a README itself can't run JS, so the original
// widget's hover/legend interactivity is impossible here by design).
//
// Data model: CodersRank's "activity over time". For each public non-fork repo
// we take the owner's commit volume per year (stats/contributors) and split it
// across that repo's languages by byte share, then sum per (year, language).
// Each year's value is that year's activity (non-cumulative), so the bands rise
// and fall like the original chart instead of only growing.
//
// Output: a self-contained SVG (no external fonts/JS) written to OUT. Failure is
// non-fatal: if data can't be fetched the committed SVG is left intact.
//
// Config (env vars / CLI `--key=value`):
//   --username / GH_USER / OWNER   GitHub login (default: gh-authed user || "aliammari1")
//   THEME        charcoal | light  (default: charcoal — matches BANNER.md)
//   WIDTH        chart width px      (default: 640, CodersRank default)
//   SKILLS       comma list to keep  (optional filter)
//   SHOW_OTHER   true | false        (default: true — groups the long tail)
//   TOP          max named languages  (default: 8)
//   ANIMATE      true | false         (default: true — SMIL reveal)
//   OUT          output path          (default: assets/skills-chart.svg)

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------- config ----------------------------- */

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a) => {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    return m ? [[m[1].toUpperCase(), m[2]]] : [];
  }),
);
const cfg = (k, d) => args[k] ?? process.env[k] ?? d;

function authedUser() {
  try {
    return execFileSync("gh", ["api", "user", "--jq", ".login"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

// NB: never read process.env.USERNAME — on Windows that's the OS login name.
const USERNAME =
  args.USERNAME ||
  process.env.GH_USER ||
  process.env.OWNER ||
  authedUser() ||
  "aliammari1";
const THEME = cfg("THEME", "charcoal").toLowerCase();
const WIDTH = Math.max(360, parseInt(cfg("WIDTH", "640"), 10) || 640);
const TOP = Math.max(1, parseInt(cfg("TOP", "8"), 10) || 8);
const SHOW_OTHER = String(cfg("SHOW_OTHER", "true")).toLowerCase() !== "false";
const ANIMATE = String(cfg("ANIMATE", "true")).toLowerCase() !== "false";
const SKILLS_FILTER = (cfg("SKILLS", "") || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const OUT = cfg("OUT", "assets/skills-chart.svg");

/* ------------------- GitHub Linguist-ish colors -------------------- */

const LANG_COLORS = {
  JavaScript: "#f1e05a", TypeScript: "#3178c6", Python: "#3572A5",
  Java: "#b07219", C: "#555555", "C++": "#f34b7d", "C#": "#178600",
  PHP: "#4F5D95", HTML: "#e34c26", CSS: "#563d7c", SCSS: "#c6538c",
  Shell: "#89e051", Dart: "#00B4AB", Go: "#00ADD8", Rust: "#dea584",
  Ruby: "#701516", Kotlin: "#A97BFF", Swift: "#F05138", Vue: "#41b883",
  "Jupyter Notebook": "#DA5B0B", Dockerfile: "#384d54", Makefile: "#427819",
  "Objective-C": "#438eff", Lua: "#000080", Perl: "#0298c3", QML: "#44a51c",
  Haskell: "#5e5086", R: "#198CE7", Scala: "#c22d40", Elixir: "#6e4a7e",
  Clojure: "#db5855", TeX: "#3D6117", PowerShell: "#012456", CMake: "#DA3434",
  Assembly: "#6E4C13", Astro: "#ff5a03", Svelte: "#ff3e00", MDX: "#fcb32c",
  Twig: "#c1d026", Nix: "#7e7eff", Batchfile: "#C1F12E", SQL: "#e38c00",
  "Vim Script": "#199f4b", Solidity: "#AA6746", Zig: "#ec915c",
};
const FALLBACK = ["#7c9eff", "#ff8fa3", "#7ee787", "#ffa657", "#d2a8ff", "#79c0ff"];
const OTHER_COLOR = "#8b949e";
const colorFor = (lang, i) =>
  lang === "Other" ? OTHER_COLOR : LANG_COLORS[lang] || FALLBACK[i % FALLBACK.length];

/* ------------------------------ themes ----------------------------- */

const THEMES = {
  charcoal: { bg: "#0d1117", grid: "#21262d", text: "#c9d1d9", muted: "#8b949e", title: "#f0f6fc", border: "#30363d" },
  light: { bg: "#ffffff", grid: "#eaeef2", text: "#24292f", muted: "#57606a", title: "#1f2328", border: "#d0d7de" },
};
const T = THEMES[THEME] || THEMES.charcoal;

/* --------------------------- GitHub data --------------------------- */

function gh(path, paginate = false) {
  const a = ["api"];
  if (paginate) a.push("--paginate");
  a.push(path);
  return JSON.parse(execFileSync("gh", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
}

function fetchRepos() {
  const repos = gh(
    `users/${USERNAME}/repos?per_page=100&type=owner&sort=created&direction=asc`,
    true,
  );
  return repos.filter((r) => r && !r.fork);
}

function fetchLanguages(name) {
  try {
    return gh(`repos/${USERNAME}/${encodeURIComponent(name)}/languages`);
  } catch {
    return {};
  }
}

// stats/contributors returns full-history weekly commits per contributor, but
// answers 202 (empty) while GitHub computes it — so retry with backoff.
async function fetchContributors(name) {
  const path = `repos/${USERNAME}/${encodeURIComponent(name)}/stats/contributors`;
  for (const delay of [0, 400, 900, 1800, 3000]) {
    if (delay) await sleep(delay);
    try {
      const data = gh(path);
      if (Array.isArray(data) && data.length) return data;
    } catch {
      /* 202 / empty body -> retry */
    }
  }
  return [];
}

// Owner's commits per year for one repo (falls back to all contributors if the
// owner's login never appears, e.g. commits authored under another identity).
function commitsByYear(contributors) {
  const me = USERNAME.toLowerCase();
  const mine = new Map();
  const all = new Map();
  let mineTotal = 0;
  for (const c of contributors) {
    const isMe = c.author && (c.author.login || "").toLowerCase() === me;
    for (const wk of c.weeks || []) {
      if (!wk.c) continue;
      const y = new Date(wk.w * 1000).getUTCFullYear();
      all.set(y, (all.get(y) || 0) + wk.c);
      if (isMe) {
        mine.set(y, (mine.get(y) || 0) + wk.c);
        mineTotal += wk.c;
      }
    }
  }
  return mineTotal > 0 ? mine : all;
}

/* ------- build year × language activity matrix (non-cumulative) ---- */

async function buildSeries(repos) {
  const yearLang = new Map(); // year -> Map(lang -> activity score)
  const totals = new Map(); // lang -> total score
  const addScore = (y, lang, v) => {
    let bucket = yearLang.get(y);
    if (!bucket) yearLang.set(y, (bucket = new Map()));
    bucket.set(lang, (bucket.get(lang) || 0) + v);
    totals.set(lang, (totals.get(lang) || 0) + v);
  };

  for (const r of repos) {
    const langs = fetchLanguages(r.name);
    const totalBytes = Object.values(langs).reduce((a, b) => a + b, 0);
    if (totalBytes === 0) continue;

    const byYear = commitsByYear(await fetchContributors(r.name));
    if (byYear.size === 0) {
      // No commit stats available — seed the repo's footprint in its birth year
      // so it still contributes rather than vanishing.
      const y = new Date(r.created_at).getUTCFullYear();
      for (const [lang, bytes] of Object.entries(langs)) addScore(y, lang, bytes / totalBytes);
      continue;
    }
    // Distribute each year's commit volume across languages by byte share.
    for (const [y, commits] of byYear) {
      for (const [lang, bytes] of Object.entries(langs)) {
        addScore(y, lang, commits * (bytes / totalBytes));
      }
    }
  }
  if (totals.size === 0) return null;

  const allYears = [...yearLang.keys()].sort((a, b) => a - b);
  const years = [];
  for (let y = allYears[0]; y <= allYears[allYears.length - 1]; y++) years.push(y);

  let ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
  if (SKILLS_FILTER.length) ranked = ranked.filter((l) => SKILLS_FILTER.includes(l.toLowerCase()));
  const named = ranked.slice(0, TOP);
  const tail = ranked.slice(TOP);
  // Biggest skill at the bottom of the stack (sort-by-score, like CodersRank).
  const keys = [...named];
  if (SHOW_OTHER && tail.length) keys.push("Other");

  const rows = years.map((y) => {
    const src = yearLang.get(y) || new Map();
    const values = new Map(keys.map((k) => [k, 0]));
    for (const [lang, v] of src) {
      if (named.includes(lang)) values.set(lang, values.get(lang) + v);
      else if (SHOW_OTHER && tail.length) values.set("Other", (values.get("Other") || 0) + v);
    }
    return { year: y, values };
  });

  return { years, keys, rows };
}

/* --------------------------- SVG render ---------------------------- */

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => Math.round(n * 100) / 100;

function render({ years, keys, rows }) {
  const padL = 16, padR = 16, padT = 54;
  const plotH = 220;
  const plotW = WIDTH - padL - padR;
  const x0 = padL, x1 = WIDTH - padR;
  const yTop = padT, yBot = padT + plotH;
  const n = years.length;

  const xAt = (i) => (n <= 1 ? (x0 + x1) / 2 : x0 + (plotW * i) / (n - 1));
  // Max stacked total across years = the scale ceiling (CodersRank getSummValues).
  const maxTotal = Math.max(
    1,
    ...rows.map((r) => [...r.values.values()].reduce((a, b) => a + b, 0)),
  );
  const yAt = (v) => yBot - (plotH * v) / maxTotal;

  // Cumulative value through layer k at year i (straight stacked polygons).
  const cumAt = (i, k) => {
    let s = 0;
    for (let j = 0; j <= k; j++) s += rows[i].values.get(keys[j]) || 0;
    return s;
  };

  // Build a polygon per layer, top-down (largest cumulative first), each closed
  // to the bottom corners and filled — identical stacking to render-chart.js.
  const polygons = [];
  for (let k = keys.length - 1; k >= 0; k--) {
    const top = years.map((_, i) => `${fmt(xAt(i))} ${fmt(yAt(cumAt(i, k)))}`);
    if (n === 1) top.push(`${fmt(x1)} ${fmt(yAt(cumAt(0, k)))}`); // give a single year width
    const pts = `${top.join(" ")} ${fmt(x1)} ${fmt(yBot)} ${fmt(x0)} ${fmt(yBot)}`;
    polygons.push(
      `<polygon points="${pts}" fill="${colorFor(keys[k], k)}" fill-opacity="0.92" stroke="${T.bg}" stroke-width="0.5"/>`,
    );
  }

  // Horizontal gridlines.
  const grid = [];
  for (let g = 0; g <= 4; g++) {
    const gy = yTop + (plotH * g) / 4;
    grid.push(`<line x1="${x0}" y1="${fmt(gy)}" x2="${x1}" y2="${fmt(gy)}" stroke="${T.grid}" stroke-width="1"/>`);
  }

  // X-axis year labels (thinned if crowded).
  const step = Math.max(1, Math.ceil(n / 8));
  const xLabels = years
    .map((y, i) =>
      i % step === 0 || i === n - 1
        ? `<text x="${fmt(xAt(i))}" y="${yBot + 18}" fill="${T.muted}" font-size="11" text-anchor="middle">${y}</text>`
        : "",
    )
    .join("");

  // Legend chips, wrapped under the plot.
  const legendY = yBot + 34, chip = 11, gap = 14, lineH = 22;
  let lx = x0, ly = legendY, rowsUsed = 1;
  const legend = [];
  for (let k = 0; k < keys.length; k++) {
    const name = keys[k];
    const w = chip + 6 + name.length * 6.6 + gap;
    if (lx + w > x1 && lx > x0) { lx = x0; ly += lineH; rowsUsed++; }
    legend.push(
      `<rect x="${fmt(lx)}" y="${ly - chip + 2}" width="${chip}" height="${chip}" rx="2" fill="${colorFor(name, k)}"/>` +
        `<text x="${fmt(lx + chip + 5)}" y="${ly + 1}" fill="${T.text}" font-size="12">${esc(name)}</text>`,
    );
    lx += w;
  }

  const height = Math.ceil(legendY + rowsUsed * lineH + 6);
  const font = "-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif";
  const span = n > 1 ? `${years[0]}–${years[n - 1]}` : `${years[0]}`;

  // SMIL left-to-right reveal: a clip rect grows from width 0 to plotW. Plays in
  // <img>-embedded SVGs (how GitHub serves README images); freezes at full.
  const clip = ANIMATE
    ? `<clipPath id="cr-reveal"><rect x="${x0}" y="${yTop}" width="0" height="${plotH}"><animate attributeName="width" from="0" to="${plotW}" dur="1.4s" begin="0s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.25 0.1 0.25 1"/></rect></clipPath>`
    : "";
  const clipAttr = ANIMATE ? ' clip-path="url(#cr-reveal)"' : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" font-family="${font}" role="img" aria-label="Coding skills over time for ${esc(USERNAME)}">
  <defs>${clip}</defs>
  <rect width="100%" height="100%" rx="10" fill="${T.bg}"/>
  <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="10" fill="none" stroke="${T.border}" stroke-width="1"/>
  <text x="${padL}" y="26" fill="${T.title}" font-size="15" font-weight="700">Skills over time</text>
  <text x="${padL}" y="42" fill="${T.muted}" font-size="11">@${esc(USERNAME)} · commit-weighted language activity · ${span}</text>
  <text x="${x1}" y="42" fill="${T.muted}" font-size="9.5" text-anchor="end">self-hosted · GitHub API</text>
  <g>${grid.join("")}</g>
  <g${clipAttr}>${polygons.join("")}</g>
  <g>${xLabels}</g>
  <g>${legend.join("")}</g>
</svg>`;
}

/* ------------------------------ main ------------------------------- */

function keepFallback(reason) {
  console.log(`${reason} — leaving ${OUT} untouched.`);
  process.exit(0);
}

let repos;
try {
  repos = fetchRepos();
} catch (e) {
  keepFallback(`Could not list repos (${e.message})`);
}
if (!repos || repos.length === 0) keepFallback("No public repos found");

const series = await buildSeries(repos);
if (!series) keepFallback("No language data resolved");

const svg = render(series);
const dir = dirname(OUT);
if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });

const prev = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
if (prev === svg) {
  console.log(`No change to ${OUT}.`);
} else {
  writeFileSync(OUT, svg);
  console.log(
    `Wrote ${OUT} — ${series.keys.length} skills across ${series.years.length} years (${USERNAME}).`,
  );
}
