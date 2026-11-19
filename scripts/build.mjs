// Draws the profile's live images from ShermR6's GitHub data:
//   dist/panel.svg  cockpit instruments (contributions, streak, top language, this week)
//   dist/atis.svg   the intro as an ATIS broadcast, a new information letter each day
//   dist/graph.svg  an aircraft flying over the contribution graph and landing on today
//   dist/radar.svg  a radar scope with each public repo as a blip
//
//   GITHUB_TOKEN=... node scripts/build.mjs [login]
// Run daily by .github/workflows/profile.yml, which publishes dist/ to the output branch.

import fs from "node:fs";

const LOGIN = process.argv[2] || "ShermR6";
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error("GITHUB_TOKEN is needed"); process.exit(1); }

const INK = "#FAFAFA", MUTED = "#8B949E", FAINT = "#3A3F47", LIVE = "#38BDF8", PANEL = "#141414";
const SANS = `Geist, Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif`;
const MONO = `'Geist Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f1 = (n) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------- data

async function load() {
  const query = `query($login: String!) { user(login: $login) {
    contributionsCollection { contributionCalendar { totalContributions
      weeks { contributionDays { date weekday contributionCount contributionLevel } } } }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, orderBy: {field: PUSHED_AT, direction: DESC}) {
      nodes { name pushedAt isArchived languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name } } } } } } }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "profile-builder" },
    body: JSON.stringify({ query, variables: { login: LOGIN } }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(JSON.stringify(body.errors || body).slice(0, 400));
  return body.data.user;
}

function stats(user) {
  const cal = user.contributionsCollection.contributionCalendar;
  const days = cal.weeks.flatMap((w) => w.contributionDays);
  // streak: days in a row with contributions, ending today (or yesterday, if today has none yet)
  let i = days.length - 1, streak = 0;
  if (days[i] && days[i].contributionCount === 0) i--;
  for (; i >= 0 && days[i].contributionCount > 0; i--) streak++;
  const sum = (a) => a.reduce((n, d) => n + d.contributionCount, 0);
  const week = sum(days.slice(-7)), lastWeek = sum(days.slice(-14, -7));
  const bytes = new Map();
  // Markup and stylesheets are left out, and so are archived repos: the dial shows what is being built now.
  const SKIP = new Set(["HTML", "CSS", "SCSS", "Dockerfile", "Makefile", "Procfile"]);
  for (const r of user.repositories.nodes) {
    if (r.isArchived) continue;
    for (const e of r.languages.edges) if (!SKIP.has(e.node.name)) bytes.set(e.node.name, (bytes.get(e.node.name) || 0) + e.size);
  }
  const total = [...bytes.values()].reduce((a, b) => a + b, 0) || 1;
  const langs = [...bytes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, b]) => [name, Math.round((b / total) * 100)]);
  return { total: cal.totalContributions, streak, week, lastWeek, langs, weeks: cal.weeks, repos: user.repositories.nodes };
}

const ABBR = { TypeScript: "TS", JavaScript: "JS", Python: "PY", PowerShell: "PS", Shell: "SH", HTML: "HTML", CSS: "CSS" };
const abbr = (n) => ABBR[n] || n.slice(0, 4).toUpperCase();

// ---------------------------------------------------------------- 1. cockpit panel

const rad = (d) => ((d - 90) * Math.PI) / 180;
const pt = (cx, cy, r, d) => [f1(cx + r * Math.cos(rad(d))), f1(cy + r * Math.sin(rad(d)))];
const label = (x, y, s, size, fill, extra = "") => `<text x="${x}" y="${y}" text-anchor="middle" font-family="${MONO}" font-size="${size}" fill="${fill}" ${extra}>${esc(s)}</text>`;
const num = (x, y, s, size = 15) => `<text x="${x}" y="${y}" text-anchor="middle" font-family="${SANS}" font-weight="600" font-size="${size}" fill="${INK}">${esc(s)}</text>`;

function face(cx, cy, r) {
  return `<circle cx="${cx}" cy="${cy}" r="${r + 9}" fill="#000" stroke="#2A2F36" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#0A0A0A" stroke="#1C1C1C"/>`;
}
function ticks(cx, cy, r, from, to, n, every, [big, small]) {
  let s = "";
  for (let i = 0; i <= n; i++) {
    const d = from + ((to - from) * i) / n, major = i % every === 0;
    const [x1, y1] = pt(cx, cy, r, d), [x2, y2] = pt(cx, cy, r - (major ? big : small), d);
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${major ? INK : MUTED}" stroke-width="${major ? 2 : 1}"/>`;
  }
  return s;
}
function arc(cx, cy, r, from, to, color, opacity = 1) {
  const [ax, ay] = pt(cx, cy, r, from), [bx, by] = pt(cx, cy, r, to);
  return `<path d="M ${ax} ${ay} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${bx} ${by}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="6"/>`;
}
function needle(cx, cy, len, d, w, tail = 12) {
  const [x, y] = pt(cx, cy, len, d), [tx, ty] = pt(cx, cy, -tail, d);
  return `<line x1="${tx}" y1="${ty}" x2="${x}" y2="${y}" stroke="${INK}" stroke-width="${w}" stroke-linecap="round"/>`;
}
const hub = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="6" fill="#111" stroke="${MUTED}"/>`;

function altimeter(cx, cy, r, total) {
  let s = face(cx, cy, r) + ticks(cx, cy, r - 4, 0, 360, 50, 5, [12, 6]);
  for (let i = 0; i < 10; i++) { const [x, y] = pt(cx, cy, r - 28, i * 36); s += num(x, y + 6, i, 17); }
  s += label(cx, cy - r * 0.32, "CONTRIB", 9, MUTED, `letter-spacing="1.4"`) + label(cx, cy + r * 0.38, "PAST YEAR", 8, FAINT, `letter-spacing="1"`);
  const shown = total.toLocaleString("en-US");
  const bw = Math.max(44, shown.length * 8 + 10);
  s += `<rect x="${cx + r * 0.2}" y="${cy - 9}" width="${bw}" height="18" rx="2" fill="#000" stroke="${FAINT}"/>` + label(cx + r * 0.2 + bw / 2, cy + 4.5, shown, 11.5, INK);
  s += needle(cx, cy, r * 0.48, ((total % 10000) / 10000) * 360, 6, 8) + needle(cx, cy, r * 0.8, ((total % 1000) / 1000) * 360, 3);
  return s + hub(cx, cy);
}
function airspeed(cx, cy, r, days) {
  const max = Math.max(60, Math.ceil((days * 1.2) / 10) * 10), from = -150, to = 150, at = (v) => from + ((to - from) * Math.min(v, max)) / max;
  let s = face(cx, cy, r) + arc(cx, cy, r - 8, at(0), at(max * 0.7), INK, 0.25) + arc(cx, cy, r - 8, at(max * 0.7), at(max), LIVE);
  s += ticks(cx, cy, r - 4, from, to, 30, 5, [13, 6]);
  for (let v = 0; v <= max; v += max / 6) { const [x, y] = pt(cx, cy, r - 30, at(v)); s += num(x, y + 5, Math.round(v), 14); }
  s += label(cx, cy - r * 0.32, "STREAK", 9, MUTED, `letter-spacing="1.4"`) + label(cx, cy + r * 0.62, "DAYS", 8.5, FAINT, `letter-spacing="1"`);
  s += `<text x="${cx}" y="${cy + r * 0.38}" text-anchor="middle" font-family="${MONO}" font-size="16" font-weight="600" fill="${INK}">${days}</text>`;
  return s + needle(cx, cy, r * 0.8, at(days), 3.5) + hub(cx, cy);
}
function headingInd(cx, cy, r, langs) {
  let s = face(cx, cy, r) + ticks(cx, cy, r - 4, 0, 360, 72, 6, [12, 6]);
  langs.forEach(([name, share], k) => {
    const d = k * 90, [x, y] = pt(cx, cy, r - 31, d);
    s += `<text x="${x}" y="${y + 5}" text-anchor="middle" font-family="${MONO}" font-weight="600" font-size="12.5" fill="${k === 0 ? LIVE : INK}">${esc(k === 0 ? `${abbr(name)} ${share}%` : abbr(name))}</text>`;
  });
  s += `<path d="M ${cx} ${cy - r + 2} l -7 -12 h 14 z" fill="${LIVE}"/><path d="M ${cx} ${cy - 22} l 14 34 l -14 -7 l -14 7 z" fill="${INK}"/>`;
  return s + label(cx, cy + 30, "TOP LANGUAGE", 9, MUTED, `letter-spacing="1.4"`);
}
function vsi(cx, cy, r, week, lastWeek) {
  const diff = week - lastWeek, at = (v) => -90 + (Math.max(-40, Math.min(40, v)) / 40) * 160;
  let s = face(cx, cy, r) + ticks(cx, cy, r - 4, -250, 70, 32, 4, [12, 6]);
  for (const v of [-40, -20, 0, 20, 40]) { const [x, y] = pt(cx, cy, r - 30, at(v)); s += num(x, y + 5, Math.abs(v), 14); }
  s += label(cx, cy - 24, "CONTRIB / WK", 9, MUTED, `letter-spacing="1.2"`);
  s += `<text x="${cx}" y="${cy + 34}" text-anchor="middle" font-family="${MONO}" font-size="13" font-weight="600" fill="${LIVE}">${diff >= 0 ? "+" : ""}${diff}</text>`;
  s += label(cx, cy + 48, `${week} VS ${lastWeek} LAST WK`, 8, FAINT);
  return s + needle(cx, cy, r * 0.82, at(diff), 3.5) + hub(cx, cy);
}
function panel(st) {
  const W = 860, H = 250, r = 88, y = 122, xs = [115, 325, 535, 745];
  const langs = st.langs.length ? st.langs : [["None", 0]];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${LOGIN}'s GitHub as a cockpit panel: ${st.total} contributions in the past year, a ${st.streak} day streak, top language ${langs[0][0]}, ${st.week} contributions this week">
<title>${LOGIN}: ${st.total} contributions, ${st.streak} day streak, top language ${esc(langs[0][0])}</title>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="${PANEL}" stroke="#262626"/>
${xs.map((x) => `<circle cx="${x - r - 2}" cy="20" r="3" fill="#2A2A2A"/><circle cx="${x + r + 2}" cy="20" r="3" fill="#2A2A2A"/>`).join("")}
${altimeter(xs[0], y, r, st.total)}${airspeed(xs[1], y, r, st.streak)}${headingInd(xs[2], y, r, langs)}${vsi(xs[3], y, r, st.week, st.lastWeek)}
${label(W / 2, H - 10, `${LOGIN.toUpperCase()} · N-PANEL · UPDATED ${new Date().toISOString().slice(0, 10)}`, 10, "#4A4A4A", `letter-spacing="2"`)}
</svg>`;
}

// ---------------------------------------------------------------- 2. ATIS

const PHONETIC = "ALFA BRAVO CHARLIE DELTA ECHO FOXTROT GOLF HOTEL INDIA JULIETT KILO LIMA MIKE NOVEMBER OSCAR PAPA QUEBEC ROMEO SIERRA TANGO UNIFORM VICTOR WHISKEY XRAY YANKEE ZULU".split(" ");
function atis() {
  const now = new Date();
  const day = Math.floor((now - new Date(Date.UTC(now.getUTCFullYear(), 0, 0))) / 86400000);
  const info = PHONETIC[day % 26];
  const zulu = `${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}`;
  const B = (t) => `<tspan fill="${INK}" font-weight="600">${esc(t)}</tspan>`, K = (t) => `<tspan fill="${MUTED}">${esc(t)}</tspan>`, L = (t) => `<tspan fill="${LIVE}">${esc(t)}</tspan>`, T = (t) => esc(t);
  const lines = [
    [B(`FINALPING INFORMATION ${info}`), T(", "), K("TIME"), T(` ${zulu} ZULU.`)],
    [K("WIND"), T(" FAVORABLE. "), K("VISIBILITY"), T(" UNLIMITED, "), L("LIVE MAP 3D"), T(".")],
    [K("ALERTS"), T(" AT DISTANCES OF YOUR CHOOSING, ONE ZERO, FIVE AND TWO MILES TO START.")],
    [K("LANDING AND DEPARTING"), T(" REPORTED EVERY LAP OF THE PATTERN.")],
    [K("FREQUENCIES"), T(" DISCORD, SLACK, TEAMS, GOOGLE CHAT, EMAIL, TEXT, TELEGRAM, WEBHOOK.")],
    [K("GROUND STATION"), T(" AVAILABLE, RASPBERRY PI, ONE COMMAND.")],
    [K("NOTAMS"), T(": SEVEN DAY FREE TRIAL IN EFFECT.")],
    [T("ADVISE ON INITIAL CONTACT YOU HAVE "), B(`INFORMATION ${info}`), T(" · finalpingapp.com")],
  ];
  const W = 860, lh = 26, H = 40 + lines.length * lh;
  const alt = `FinalPing information ${info}, time ${zulu} Zulu. Alerts at distances of your choosing, 10, 5 and 2 miles to start. Landing and departing reported every lap of the pattern. Discord, Slack, Teams, Google Chat, email, text, Telegram, webhook. Raspberry Pi ground station, one command. Seven day free trial.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(alt)}">
<title>${esc(alt)}</title>
<style>@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}.c{animation:blink 1.1s steps(1) infinite}@media (prefers-reduced-motion:reduce){.c{animation:none}}</style>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="8" fill="#010409" stroke="#30363D"/>
<g font-family="${MONO}" font-size="13.5" fill="#C9D1D9">
${lines.map((parts, k) => `<text x="22" y="${32 + k * lh}">${parts.join("")}</text>`).join("\n")}
</g>
<rect class="c" x="${f1(22 + 8.1 * `ADVISE ON INITIAL CONTACT YOU HAVE INFORMATION ${info} · finalpingapp.com`.length + 4)}" y="${32 + (lines.length - 1) * lh - 12}" width="8" height="15" fill="${LIVE}"/>
</svg>`;
}

// ---------------------------------------------------------------- 3. aircraft over the contribution graph

function graph(st) {
  const cell = 12, gap = 3.5, ox = 20, oy = 24, D = 16, LAND = 0.82;
  const shades = { NONE: "#161B22", FIRST_QUARTILE: "#2E2E2E", SECOND_QUARTILE: "#5C5C5C", THIRD_QUARTILE: "#A3A3A3", FOURTH_QUARTILE: "#FAFAFA" };
  const weeks = st.weeks, cols = weeks.length, W = ox * 2 + cols * (cell + gap) - gap, H = oy + 7 * (cell + gap) + 34;
  const cx = (x) => ox + x * (cell + gap) + cell / 2, cy = (y) => oy + y * (cell + gap) + cell / 2;
  const last = weeks[cols - 1].contributionDays, today = last[last.length - 1], tx = cols - 1, ty = today.weekday;
  // the route: weave across the year, then a straight final onto today's square
  const pts = [], weave = (x) => 2 + Math.sin(x / 3.4) * 2.2, turn = cols - 7;
  for (let x = 0; x <= turn; x += 0.25) pts.push([cx(x), cy(weave(x))]);
  for (let t = 0.05; t <= 1.0001; t += 0.05) pts.push([cx(turn + (tx - turn) * t), cy(weave(turn) + (ty - weave(turn)) * t)]);
  const len = [0]; for (let k = 1; k < pts.length; k++) len.push(len[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const L = len[len.length - 1];
  // when the aircraft passes over each square, as a fraction of the loop
  const passed = new Map();
  pts.forEach(([x, y], k) => {
    const gx = Math.round((x - ox - cell / 2) / (cell + gap)), gy = Math.round((y - oy - cell / 2) / (cell + gap));
    const key = `${gx},${gy}`; if (!passed.has(key)) passed.set(key, (len[k] / L) * LAND);
  });
  let squares = "", glow = "";
  weeks.forEach((w, x) => w.contributionDays.forEach((d) => {
    const y = d.weekday, rx = f1(ox + x * (cell + gap)), ry = f1(oy + y * (cell + gap));
    squares += `<rect x="${rx}" y="${ry}" width="${cell}" height="${cell}" rx="2.5" fill="${shades[d.contributionLevel] || shades.NONE}"><title>${d.date}: ${d.contributionCount}</title></rect>`;
    const t = passed.get(`${x},${y}`), isToday = x === tx && y === ty;
    if (t !== undefined && (d.contributionCount > 0 || isToday)) {
      const a = Math.min(isToday ? LAND : t, 0.95);
      glow += `<rect x="${rx}" y="${ry}" width="${cell}" height="${cell}" rx="2.5" fill="${LIVE}" opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;${f1(a * 1000) / 1000};${f1((a + 0.004) * 1000) / 1000};0.96;1" dur="${D}s" repeatCount="indefinite"/></rect>`;
    }
  }));
  const route = "M " + pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join(" L ");
  const plane = `<path d="M 9 0 L 3 -1.4 L -1 -9 L -3.6 -9 L -1.8 -1.4 L -7 -1.4 L -9 -4 L -10.4 -4 L -9 0 L -10.4 4 L -9 4 L -7 1.4 L -1.8 1.4 L -3.6 9 L -1 9 L 3 1.4 Z" fill="${INK}" stroke="#000" stroke-width="0.8"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${LOGIN}'s contribution graph: ${st.total} contributions in the past year, with an aircraft flying over it and landing on today">
<title>${st.total} contributions in the past year</title>
<rect width="${W}" height="${H}" rx="8" fill="#0D1117"/>
${squares}${glow}
<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.02;0.96;1" dur="${D}s" repeatCount="indefinite"/>
<g>${plane}<animateMotion path="${route}" rotate="auto" dur="${D}s" repeatCount="indefinite" calcMode="linear" keyPoints="0;1;1" keyTimes="0;${LAND};1"/></g></g>
<text x="${ox}" y="${H - 12}" font-family="${MONO}" font-size="11" fill="${MUTED}">${st.total.toLocaleString("en-US")} contributions in the past year</text>
<text x="${W - ox}" y="${H - 12}" text-anchor="end" font-family="${MONO}" font-size="11" fill="${MUTED}" opacity="1"><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;${LAND};${LAND + 0.005};1" dur="${D}s" repeatCount="indefinite"/>ON FINAL FOR TODAY</text>
<text x="${W - ox}" y="${H - 12}" text-anchor="end" font-family="${MONO}" font-size="11" fill="${LIVE}" opacity="0"><animate attributeName="opacity" values="0;0;1;1" keyTimes="0;${LAND};${LAND + 0.005};1" dur="${D}s" repeatCount="indefinite"/>LANDED · TODAY</text>
</svg>`;
}

// ---------------------------------------------------------------- 4. radar scope

function radar(st) {
  const W = 860, H = 360, cx = 300, cy = 180, R = 160, D = 8;
  const now = Date.now();
  const repos = st.repos.slice(0, 8);
  const band = (days) => (days < 1 ? [0.16, 0.25] : days < 7 ? [0.3, 0.48] : days < 30 ? [0.55, 0.72] : [0.78, 0.92]);
  let rings = "", blips = "";
  for (const f of [0.25, 0.5, 0.75, 1]) rings += `<circle cx="${cx}" cy="${cy}" r="${R * f}" fill="none" stroke="#1F2A33"/>`;
  for (let a = 0; a < 360; a += 30) { const [x, y] = pt(cx, cy, R, a); rings += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#1F2A33"/>`; }
  repos.forEach((r, k) => {
    const days = (now - new Date(r.pushedAt)) / 86400000, [lo, hi] = band(days);
    const dist = lo + ((hi - lo) * ((k * 37) % 10)) / 10, deg = (k * (360 / repos.length) + 25) % 360;
    const [x, y] = pt(cx, cy, R * dist, deg), fresh = days < 1;
    const when = r.isArchived ? "ARCHIVED" : days < 1 ? "PUSHED TODAY" : `PUSHED ${Math.round(days)} DAY${Math.round(days) === 1 ? "" : "S"} AGO`;
    blips += `<g opacity="0"><animate attributeName="opacity" values="1;0;0" keyTimes="0;0.6;1" dur="${D}s" begin="${f1((deg / 360) * D)}s" repeatCount="indefinite"/>
<circle cx="${x}" cy="${y}" r="3.6" fill="${fresh ? LIVE : INK}"/><line x1="${x + 4}" y1="${y - 4}" x2="${x + 14}" y2="${y - 14}" stroke="${MUTED}"/>
<text x="${x + 16}" y="${y - 16}" font-family="${MONO}" font-size="11.5" font-weight="600" fill="${INK}">${esc(r.name)}</text>
<text x="${x + 16}" y="${y - 3}" font-family="${MONO}" font-size="10.5" fill="${MUTED}">${when}</text></g>`;
  });
  // the beam and its fading wake, turning together
  let wake = "";
  for (let k = 0; k < 14; k++) {
    const [ax, ay] = pt(cx, cy, R, -k * 3), [bx, by] = pt(cx, cy, R, -(k + 1) * 3);
    wake += `<path d="M ${cx} ${cy} L ${ax} ${ay} A ${R} ${R} 0 0 0 ${bx} ${by} Z" fill="${LIVE}" fill-opacity="${f1((0.24 * (1 - k / 14)) * 100) / 100}"/>`;
  }
  const fresh = repos.filter((r) => now - new Date(r.pushedAt) < 86400000).length;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Radar scope of ${LOGIN}'s ${repos.length} public repositories, ${fresh} pushed today">
<title>${repos.length} public repositories, ${fresh} pushed today</title>
<rect width="${W}" height="${H}" rx="8" fill="#0D1117"/>
<circle cx="${cx}" cy="${cy}" r="${R + 6}" fill="#000"/>${rings}
<g>${wake}<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - R}" stroke="${LIVE}" stroke-width="1.5"/>
<animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="${D}s" repeatCount="indefinite"/></g>
${blips}
<g font-family="${MONO}" font-size="11" fill="${MUTED}">
<text x="500" y="70">RANGE RINGS: TODAY · WEEK · MONTH · OLDER</text>
<text x="500" y="92"><tspan fill="${LIVE}">●</tspan> PUSHED IN THE LAST DAY</text>
<text x="500" y="114">${repos.length} TARGETS · ${LOGIN.toUpperCase()}</text>
<text x="500" y="136" fill="#4A4A4A">UPDATED ${new Date().toISOString().slice(11, 16)}Z</text>
</g>
</svg>`;
}

// ---------------------------------------------------------------- write

const st = stats(await load());
fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/panel.svg", panel(st));
fs.writeFileSync("dist/atis.svg", atis());
fs.writeFileSync("dist/graph.svg", graph(st));
fs.writeFileSync("dist/radar.svg", radar(st));
console.log(`built: ${st.total} contributions, streak ${st.streak}, week ${st.week} vs ${st.lastWeek}, langs ${st.langs.map((l) => l.join(" ")).join(", ")}, ${st.repos.length} repos`);
