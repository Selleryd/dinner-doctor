"use strict";

/**
 * Dinner Doctor — Local-first physiology readout (no APIs, no paid keys)
 * - Parses dinner text
 * - Scores physiology signals (0–100)
 * - Renders futuristic radar chart + ranked readout + upgrade ladder
 */

// ----------------------------
// Mini food knowledge base (expand anytime)
// ----------------------------
const FOOD_DB = [
  // Proteins
  { k: ["chicken", "chicken thigh", "chicken breast", "turkey"], tag: ["protein"], p: 32, c: 0, f: 8, fiber: 0, sugar: 0, sodium: 220, satfat: 2, refined: 0 },
  { k: ["steak", "beef", "burger"], tag: ["protein"], p: 30, c: 0, f: 14, fiber: 0, sugar: 0, sodium: 260, satfat: 6, refined: 0 },
  { k: ["salmon", "fish", "tuna"], tag: ["protein"], p: 28, c: 0, f: 12, fiber: 0, sugar: 0, sodium: 180, satfat: 2, refined: 0 },
  { k: ["eggs", "omelet"], tag: ["protein"], p: 18, c: 2, f: 14, fiber: 0, sugar: 0, sodium: 220, satfat: 4, refined: 0 },
  { k: ["tofu", "tempeh"], tag: ["protein"], p: 20, c: 6, f: 12, fiber: 3, sugar: 1, sodium: 200, satfat: 2, refined: 0 },
  { k: ["beans", "lentils", "chickpeas"], tag: ["protein","fiber"], p: 16, c: 32, f: 2, fiber: 12, sugar: 2, sodium: 40, satfat: 0, refined: 0 },

  // Carbs / grains
  { k: ["white rice", "rice"], tag: ["carb"], p: 4, c: 45, f: 1, fiber: 1, sugar: 0, sodium: 5, satfat: 0, refined: 1 },
  { k: ["brown rice"], tag: ["carb","fiber"], p: 5, c: 45, f: 2, fiber: 4, sugar: 0, sodium: 5, satfat: 0, refined: 0.4 },
  { k: ["pasta", "spaghetti", "mac and cheese", "macaroni"], tag: ["carb"], p: 8, c: 48, f: 2, fiber: 2, sugar: 2, sodium: 150, satfat: 1, refined: 1 },
  { k: ["quinoa"], tag: ["carb","fiber"], p: 8, c: 39, f: 4, fiber: 5, sugar: 1, sodium: 10, satfat: 0, refined: 0.2 },
  { k: ["potato", "mashed potatoes", "fries"], tag: ["carb"], p: 4, c: 50, f: 6, fiber: 3, sugar: 2, sodium: 300, satfat: 2, refined: 0.7 },
  { k: ["bread", "roll", "bun"], tag: ["carb"], p: 6, c: 35, f: 3, fiber: 2, sugar: 4, sodium: 280, satfat: 0.5, refined: 1 },

  // Veg + fruit
  { k: ["broccoli", "green beans", "salad", "spinach", "kale", "asparagus", "vegetables", "veggies"], tag: ["veg","fiber"], p: 3, c: 10, f: 0, fiber: 5, sugar: 2, sodium: 60, satfat: 0, refined: 0 },
  { k: ["berries", "fruit", "apple", "banana"], tag: ["fruit","fiber"], p: 1, c: 20, f: 0, fiber: 4, sugar: 12, sodium: 5, satfat: 0, refined: 0 },

  // Fats / extras
  { k: ["olive oil", "avocado"], tag: ["fat"], p: 0, c: 0, f: 14, fiber: 2, sugar: 0, sodium: 5, satfat: 2, refined: 0 },
  { k: ["butter", "cream"], tag: ["fat"], p: 0, c: 0, f: 12, fiber: 0, sugar: 0, sodium: 90, satfat: 7, refined: 0 },

  // Treats / drinks
  { k: ["ice cream", "brownie", "cake", "cookies", "dessert"], tag: ["dessert"], p: 4, c: 45, f: 12, fiber: 1, sugar: 30, sodium: 220, satfat: 7, refined: 1 },
  { k: ["soda", "coke", "juice"], tag: ["sugary_drink"], p: 0, c: 40, f: 0, fiber: 0, sugar: 39, sodium: 40, satfat: 0, refined: 1 },
  { k: ["diet soda", "zero sugar soda"], tag: ["drink"], p: 0, c: 0, f: 0, fiber: 0, sugar: 0, sodium: 40, satfat: 0, refined: 0 },

  // Restaurant-ish
  { k: ["pepperoni pizza", "pizza"], tag: ["restaurant","carb"], p: 18, c: 52, f: 18, fiber: 3, sugar: 6, sodium: 900, satfat: 8, refined: 1 },
  { k: ["caesar salad", "caesar"], tag: ["veg"], p: 6, c: 12, f: 14, fiber: 3, sugar: 2, sodium: 480, satfat: 3, refined: 0.3 },
];

// ----------------------------
// Modes
// ----------------------------
const MODES = {
  none: { name: "Standard" },
  t1d:  { name: "Type 1 Diabetes" },
  heart:{ name: "Heart" },
  gut:  { name: "Gut" },
  muscle:{ name: "Muscle" },
  cut:  { name: "Weight Loss" },
};

let activeMode = "none";

// ----------------------------
// DOM
// ----------------------------
const $ = (id) => document.getElementById(id);

const el = {
  mealInput: $("mealInput"),
  analyzeBtn: $("analyzeBtn"),
  parseLine: $("parseLine"),
  ddScore: $("ddScore"),
  miniProtein: $("miniProtein"),
  miniFiber: $("miniFiber"),
  miniSugar: $("miniSugar"),
  miniSodium: $("miniSodium"),
  bestMoveText: $("bestMoveText"),
  readoutBody: $("readoutBody"),
  ladderWrap: $("ladderWrap"),
  modeLabel: $("modeLabel"),
  signalLabel: $("signalLabel"),
  radar: $("radar"),
  copyLinkBtn: $("copyLinkBtn"),
};

// ----------------------------
// Utilities
// ----------------------------
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
function round(n){ return Math.round(n); }
function pct(n){ return `${clamp(Math.round(n), 0, 100)}%`; }

function normalizeText(s){
  return (s || "")
    .toLowerCase()
    .replace(/[®™]/g,"")
    .replace(/[\(\)\[\]\{\}]/g," ")
    .replace(/[^\w\s\+\-\,\.]/g," ")
    .replace(/\s+/g," ")
    .trim();
}

// Split by commas, plus, "and"
function splitFoods(text){
  const t = normalizeText(text)
    .replace(/\s*\+\s*/g, ", ")
    .replace(/\s+and\s+/g, ", ")
    .replace(/\s*&\s*/g, ", ");
  return t.split(",").map(s=>s.trim()).filter(Boolean);
}

// Find best matching food entry (simple heuristic: longest keyword match)
function matchFood(token){
  const t = normalizeText(token);
  let best = null;
  let bestLen = 0;

  for (const item of FOOD_DB){
    for (const key of item.k){
      const k = normalizeText(key);
      if (t === k || t.includes(k) || k.includes(t)){
        const scoreLen = Math.min(t.length, k.length);
        if (scoreLen > bestLen){
          best = item;
          bestLen = scoreLen;
        }
      }
    }
  }
  return best;
}

function severityLabel(metricName, score){
  // For Satiety & Digestion: low is worse. For the other 3: high is worse.
  const isGoodHigher = (metricName === "Satiety" || metricName === "Digestion");

  let badness = isGoodHigher ? (100 - score) : score;

  if (badness >= 70) return { label: "High", tone: "bad" };
  if (badness >= 45) return { label: "Moderate", tone: "warn" };
  return { label: "Low", tone: "good" };
}

function toneColor(tone){
  if (tone === "bad") return getComputedStyle(document.documentElement).getPropertyValue("--bad").trim();
  if (tone === "warn") return getComputedStyle(document.documentElement).getPropertyValue("--warn").trim();
  return getComputedStyle(document.documentElement).getPropertyValue("--good").trim();
}

// ----------------------------
// Scoring model (heuristic, local-only)
// ----------------------------
function scoreMeal(agg, mode){
  // agg fields roughly represent: a "typical serving per recognized item"
  // These are not medical/clinical numbers — they’re consistent heuristics for ranking meals.

  const protein = agg.p;
  const carbs   = agg.c;
  const fat     = agg.f;
  const fiber   = agg.fiber;
  const sugar   = agg.sugar;
  const sodium  = agg.sodium;
  const satfat  = agg.satfat;
  const refined = agg.refined; // 0..n

  // Signals
  // Satiety: protein + fiber + fat (moderate) minus sugar/refined overload
  let satiety =
    30
    + protein * 1.15
    + fiber * 2.3
    + Math.min(fat, 25) * 0.6
    - sugar * 0.55
    - refined * 7.0;

  // Crash risk: refined carbs + sugar, reduced by protein/fiber/fat
  let crash =
    20
    + refined * 12
    + sugar * 0.85
    + Math.max(0, carbs - 45) * 0.25
    - protein * 0.75
    - fiber * 1.6
    - fat * 0.35;

  // Cravings: sugar/refined + low protein/fiber
  let cravings =
    18
    + refined * 10
    + sugar * 0.9
    - protein * 0.55
    - fiber * 1.25
    - Math.min(fat, 20) * 0.25;

  // Digestion: penalize very high fat/sat fat + low fiber + ultra-salty restaurant patterns
  let digestion =
    55
    + fiber * 1.4
    - Math.max(0, fat - 25) * 0.9
    - Math.max(0, satfat - 10) * 1.2
    - Math.max(0, sodium - 900) * 0.01
    - refined * 1.5;

  // Glucose volatility: sugar/refined + large carb load; buffered by protein/fiber/fat
  let glucose =
    22
    + refined * 14
    + sugar * 0.95
    + Math.max(0, carbs - 40) * 0.35
    - protein * 0.55
    - fiber * 1.75
    - fat * 0.25;

  // Mode adjustments
  if (mode === "t1d"){
    glucose += 10; // tighten sensitivity
    crash += 5;
  }
  if (mode === "heart"){
    // sodium + satfat more important
    crash += Math.max(0, sodium - 700) * 0.01;
    digestion -= Math.max(0, satfat - 8) * 0.8;
  }
  if (mode === "gut"){
    digestion += fiber * 0.8;
    // very low fiber feels "off"
    digestion -= Math.max(0, 6 - fiber) * 2.0;
  }
  if (mode === "muscle"){
    satiety += Math.max(0, protein - 25) * 0.6;
    cravings -= protein * 0.15;
  }
  if (mode === "cut"){
    satiety += fiber * 0.6;
    cravings += sugar * 0.2;
  }

  // Clamp and orient:
  satiety   = clamp(satiety, 0, 100);          // higher better
  digestion = clamp(digestion, 0, 100);        // higher better
  crash     = clamp(crash, 0, 100);            // higher worse
  cravings  = clamp(cravings, 0, 100);         // higher worse
  glucose   = clamp(glucose, 0, 100);          // higher worse

  // Composite Dinner Doctor score:
  // reward satiety+digestion; penalize crash+cravings+glucose
  const dd =
    clamp(
      0.34*satiety +
      0.22*digestion +
      0.14*(100 - crash) +
      0.15*(100 - cravings) +
      0.15*(100 - glucose),
      0, 100
    );

  return {
    dd: round(dd),
    metrics: [
      { name: "Satiety", value: round(satiety), better: "higher" },
      { name: "Energy crash risk", value: round(crash), better: "lower" },
      { name: "Cravings", value: round(cravings), better: "lower" },
      { name: "Digestion", value: round(digestion), better: "higher" },
      { name: "Glucose volatility", value: round(glucose), better: "lower" },
    ],
    anchors: {
      protein: protein,
      fiber: fiber,
      sugar: sugar,
      sodium: sodium,
      refined: refined,
      satfat: satfat,
      carbs: carbs,
      fat: fat
    }
  };
}

// ----------------------------
// Best move + ladder
// ----------------------------
function bestMoveAndLadder(anchors, mode){
  // Decide biggest lever
  const lowProtein = anchors.protein < 25;
  const lowFiber   = anchors.fiber < 6;
  const highSugar  = anchors.sugar > 18;
  const highRefined = anchors.refined > 1.2;
  const highSodium = anchors.sodium > 900;

  // Weighted priority depending on mode
  const priorities = [];
  priorities.push({ key:"fiber", score: (lowFiber? 100:0) + (mode==="gut"? 30:0) + (mode==="cut"? 15:0) });
  priorities.push({ key:"protein", score: (lowProtein? 95:0) + (mode==="muscle"? 25:0) });
  priorities.push({ key:"sugar", score: (highSugar? 90:0) + (mode==="t1d"? 35:0) + (mode==="cut"? 10:0) });
  priorities.push({ key:"refined", score: (highRefined? 85:0) + (mode==="t1d"? 30:0) });
  priorities.push({ key:"sodium", score: (highSodium? 80:0) + (mode==="heart"? 40:0) });

  priorities.sort((a,b)=>b.score-a.score);
  const top = priorities[0]?.key || "fiber";

  let oneBest = "";
  let ladder = [];

  if (top === "fiber"){
    oneBest = "Add a fiber + color anchor: 2 cups veggies or a side salad kit (this stabilizes fullness, cravings, and crash risk).";
    ladder = [
      { name:"Level 1 (zero-cook)", delta:"+8", text:"Add a bagged salad or raw veggies + a piece of fruit." },
      { name:"Level 2 (one-step)", delta:"+13", text:"Add beans/lentils OR swap to a higher-fiber carb (brown rice, quinoa, whole grain)." },
      { name:"Level 3 (chef)", delta:"+18", text:"Build a ‘half-plate plants’ dinner: roast veg + add legumes + keep dessert smaller or later." },
    ];
  } else if (top === "protein"){
    oneBest = "Add a protein anchor: aim for a palm-sized portion (or beans/tofu) to improve satiety and reduce cravings later.";
    ladder = [
      { name:"Level 1 (zero-cook)", delta:"+7", text:"Add Greek yogurt/cottage cheese OR a protein shake/smoothie on the side." },
      { name:"Level 2 (one-step)", delta:"+12", text:"Add eggs, tofu, chicken, tuna, or beans to the meal." },
      { name:"Level 3 (chef)", delta:"+17", text:"Re-plate: protein first, then veg, then carb — keep dessert smaller or paired with protein." },
    ];
  } else if (top === "sugar"){
    oneBest = "Neutralize added sugar: move dessert to a smaller portion, and pair it with protein/fiber to reduce volatility and cravings.";
    ladder = [
      { name:"Level 1 (zero-cook)", delta:"+8", text:"Swap soda/juice for water/diet option; keep dessert smaller." },
      { name:"Level 2 (one-step)", delta:"+13", text:"Pair dessert with Greek yogurt/berries or nuts; add salad/veg first." },
      { name:"Level 3 (chef)", delta:"+18", text:"Dessert redesign: higher-protein + higher-fiber version (or split dessert timing)." },
    ];
  } else if (top === "refined"){
    oneBest = "Upgrade carb quality: swap refined carbs for higher-fiber alternatives to lower crash risk and glucose volatility.";
    ladder = [
      { name:"Level 1 (zero-cook)", delta:"+6", text:"Add a fiber side (salad/veg) before the carb-heavy part of the meal." },
      { name:"Level 2 (one-step)", delta:"+12", text:"Switch to brown rice/quinoa/whole grain; reduce the refined portion slightly." },
      { name:"Level 3 (chef)", delta:"+16", text:"Rebuild the plate: half veg, palm protein, fist carb — dessert smaller/later." },
    ];
  } else { // sodium
    oneBest = "Lower sodium load: restaurant-style sodium drives thirst, bloating, and rebound cravings — dilute with fresh volume.";
    ladder = [
      { name:"Level 1 (zero-cook)", delta:"+6", text:"Add a big fresh side (salad, fruit) + extra water; skip salty add-ons." },
      { name:"Level 2 (one-step)", delta:"+11", text:"Choose lower-sodium versions / rinse canned items / use herbs + acid (lemon) instead." },
      { name:"Level 3 (chef)", delta:"+15", text:"Cook a ‘clean base’ protein + veg; keep the salty item as a smaller accent." },
    ];
  }

  // Mode footnotes baked into copy (subtle)
  if (mode === "t1d"){
    oneBest += " (T1D mode prioritizes volatility buffering: protein + fiber first.)";
  }
  if (mode === "heart"){
    oneBest += " (Heart mode emphasizes sodium + saturated fat.)";
  }

  return { oneBest, ladder };
}

// ----------------------------
// Parse + aggregate
// ----------------------------
function analyzeDinner(text, mode){
  const tokens = splitFoods(text);

  const hits = [];
  const misses = [];

  // Aggregate nutrients from matched items (simple additive)
  const agg = { p:0, c:0, f:0, fiber:0, sugar:0, sodium:0, satfat:0, refined:0, tags:new Set() };

  for (const tok of tokens){
    const match = matchFood(tok);
    if (!match){
      misses.push(tok);
      continue;
    }
    hits.push({ tok, match });

    agg.p += match.p;
    agg.c += match.c;
    agg.f += match.f;
    agg.fiber += match.fiber;
    agg.sugar += match.sugar;
    agg.sodium += match.sodium;
    agg.satfat += match.satfat;
    agg.refined += match.refined;
    (match.tag || []).forEach(t => agg.tags.add(t));
  }

  // Heuristic “portion realism” normalization:
  // If many items recognized, scale down a bit so scores don’t explode
  const n = Math.max(1, hits.length);
  const scale = n <= 3 ? 1 : (n <= 5 ? 0.85 : 0.75);

  for (const k of ["p","c","f","fiber","sugar","sodium","satfat","refined"]){
    agg[k] *= scale;
  }

  const scored = scoreMeal(agg, mode);

  return { tokens, hits, misses, agg, scored };
}

// ----------------------------
// Radar chart rendering (canvas)
// ----------------------------
function drawRadar(canvas, metrics){
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  // Background
  ctx.clearRect(0,0,w,h);

  // Colors from CSS
  const root = getComputedStyle(document.documentElement);
  const stroke = root.getPropertyValue("--stroke").trim();
  const stroke2 = root.getPropertyValue("--stroke2").trim();
  const cyan = root.getPropertyValue("--cyan").trim();
  const purple = root.getPropertyValue("--purple").trim();
  const text = root.getPropertyValue("--text").trim();
  const muted = root.getPropertyValue("--muted2").trim();

  const cx = w/2;
  const cy = h/2 + 8;
  const r = Math.min(w,h) * 0.34;

  // Grid rings
  ctx.save();
  ctx.translate(cx,cy);

  for (let i=1;i<=5;i++){
    const rr = r * (i/5);
    ctx.beginPath();
    ctx.arc(0,0,rr,0,Math.PI*2);
    ctx.strokeStyle = i===5 ? stroke : stroke2;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Axes
  const N = metrics.length;
  for (let i=0;i<N;i++){
    const a = (Math.PI*2) * (i/N) - Math.PI/2;
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
    ctx.strokeStyle = stroke2;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Labels
  ctx.font = "700 14px ui-sans-serif, system-ui, -apple-system, Segoe UI";
  ctx.fillStyle = muted;
  for (let i=0;i<N;i++){
    const a = (Math.PI*2) * (i/N) - Math.PI/2;
    const lx = Math.cos(a)*(r+36);
    const ly = Math.sin(a)*(r+36);

    const name = metrics[i].name
      .replace("Energy crash risk","Crash risk")
      .replace("Glucose volatility","Glucose");

    ctx.textAlign = lx < -8 ? "right" : lx > 8 ? "left" : "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, lx, ly);
  }

  // Polygon points:
  // For “worse when higher” metrics, invert on the chart so “bigger = better” visually
  const points = metrics.map((m,i)=>{
    const a = (Math.PI*2) * (i/N) - Math.PI/2;
    const val = (m.better === "lower") ? (100 - m.value) : m.value;
    const rr = r * (val/100);
    return { x: Math.cos(a)*rr, y: Math.sin(a)*rr, a, val };
  });

  // Glow polygon
  ctx.beginPath();
  points.forEach((p,i)=> i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
  ctx.closePath();

  // Fill gradient
  const grad = ctx.createLinearGradient(-r, -r, r, r);
  grad.addColorStop(0, "rgba(121,198,255,.28)");
  grad.addColorStop(1, "rgba(176,140,255,.28)");
  ctx.fillStyle = grad;
  ctx.fill();

  // Stroke
  ctx.strokeStyle = "rgba(121,198,255,.85)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Nodes
  for (const p of points){
    ctx.beginPath();
    ctx.arc(p.x,p.y,4,0,Math.PI*2);
    ctx.fillStyle = cyan;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x,p.y,10,0,Math.PI*2);
    ctx.strokeStyle = "rgba(121,198,255,.18)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Center label
  ctx.fillStyle = text;
  ctx.font = "900 12px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.fillText("DINNER DOCTOR", 0, -r-18);
  ctx.restore();
}

// ----------------------------
// UI renderers
// ----------------------------
function renderAll(result){
  const { hits, misses, agg, scored } = result;

  // Parse line
  const recognized = hits.map(h=>h.tok).join(", ");
  const missed = misses.length ? ` • Unrecognized: ${misses.join(", ")}` : "";
  el.parseLine.textContent = hits.length
    ? `Recognized: ${recognized}${missed}`
    : `Try a simpler description (e.g., “salmon, rice, broccoli”).`;

  // Mini stats
  el.ddScore.textContent = scored.dd;
  el.miniProtein.textContent = agg.p >= 25 ? "Strong" : agg.p >= 15 ? "Okay" : "Low";
  el.miniFiber.textContent = agg.fiber >= 8 ? "Strong" : agg.fiber >= 5 ? "Okay" : "Low";
  el.miniSugar.textContent = agg.sugar <= 10 ? "Low" : agg.sugar <= 20 ? "Moderate" : "High";
  el.miniSodium.textContent = agg.sodium <= 700 ? "Low" : agg.sodium <= 1000 ? "Moderate" : "High";

  // Signal label
  const signal = scored.dd >= 78 ? "Excellent" : scored.dd >= 62 ? "Strong" : scored.dd >= 48 ? "Mixed" : "Needs work";
  el.signalLabel.textContent = signal;

  // Best move + ladder
  const { oneBest, ladder } = bestMoveAndLadder(scored.anchors, activeMode);
  el.bestMoveText.textContent = oneBest;

  el.ladderWrap.innerHTML = ladder.map(s => `
    <div class="step">
      <div class="stepTop">
        <div class="stepName">${escapeHtml(s.name)}</div>
        <div class="stepDelta">${escapeHtml(s.delta)}</div>
      </div>
      <div class="stepText">${escapeHtml(s.text)}</div>
    </div>
  `).join("");

  // Readout table (ranked by "badness")
  const rows = scored.metrics
    .map(m=>{
      const isGoodHigher = (m.name === "Satiety" || m.name === "Digestion");
      const badness = isGoodHigher ? (100 - m.value) : m.value;
      return { ...m, badness };
    })
    .sort((a,b)=> b.badness - a.badness);

  el.readoutBody.innerHTML = rows.map(m=>{
    const sev = severityLabel(m.name, m.value);
    const c = toneColor(sev.tone);
    return `
      <tr>
        <td>
          <div class="metric">
            <span class="chip" style="background:${c}; box-shadow:0 0 14px ${hexToRgba(c,.30)};"></span>
            <div>
              <div style="font-weight:900;">${escapeHtml(m.name)}</div>
              <div class="sev">${escapeHtml(metricInterpretation(m, scored.anchors, activeMode))}</div>
              <div class="bar"><i style="width:${pct(m.better==="lower" ? (100-m.value) : m.value)};"></i></div>
            </div>
          </div>
        </td>
        <td class="score">${m.value}</td>
        <td class="sev" style="color:${c}; font-weight:900;">${sev.label}</td>
      </tr>
    `;
  }).join("");

  // Radar chart
  drawRadar(el.radar, scored.metrics);
}

function metricInterpretation(metric, anchors, mode){
  const v = metric.value;
  switch(metric.name){
    case "Satiety":
      if (v >= 75) return "Likely steady fullness; low snack-pressure later.";
      if (v >= 55) return "Decent fullness, but could fade if fiber/protein is light.";
      return "Hunger rebound likely; add protein/fiber anchor.";
    case "Energy crash risk":
      if (v >= 75) return "Crash risk elevated; refine/sugar buffering needed.";
      if (v >= 55) return "Some dip risk; fiber/protein can stabilize.";
      return "Energy likely steady.";
    case "Cravings":
      if (v >= 75) return "Cravings likely later (often sugar/refined-driven).";
      if (v >= 55) return "Moderate craving risk; improve protein/fiber pairing.";
      return "Cravings likely low.";
    case "Digestion":
      if (v >= 75) return "Generally digestion-friendly.";
      if (v >= 55) return "Okay, but heavy fat/sodium can feel ‘weighed down.’";
      return "Heaviness/bloat risk; consider lighter fat + more fiber.";
    case "Glucose volatility":
      if (mode === "t1d" && v >= 65) return "T1D mode flags higher volatility; buffer with protein/fiber first.";
      if (v >= 75) return "Volatility likely high; reduce refined/sugar or add fiber/protein.";
      if (v >= 55) return "Moderate volatility; pairing improves stability.";
      return "Likely stable.";
    default:
      return "";
  }
}

function escapeHtml(s){
  return (s ?? "").toString()
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

// Convert hex colors to rgba for box-shadow
function hexToRgba(hex, a){
  const h = (hex || "").trim();
  // supports #RRGGBB
  if (!/^#?[0-9a-fA-F]{6}$/.test(h)) return `rgba(255,255,255,${a})`;
  const x = h.startsWith("#") ? h.slice(1) : h;
  const r = parseInt(x.slice(0,2),16);
  const g = parseInt(x.slice(2,4),16);
  const b = parseInt(x.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}

// ----------------------------
// Mode toggles + events
// ----------------------------
function setMode(mode){
  activeMode = MODES[mode] ? mode : "none";
  el.modeLabel.textContent = MODES[activeMode].name;

  document.querySelectorAll(".toggle").forEach(btn=>{
    const is = btn.getAttribute("data-mode") === activeMode;
    btn.setAttribute("aria-pressed", is ? "true" : "false");
  });

  // Re-run if there is input
  const t = el.mealInput.value.trim();
  if (t) runAnalysis();
}

function runAnalysis(){
  const text = el.mealInput.value.trim();
  if (!text){
    el.parseLine.textContent = "Type a dinner first (e.g., “salmon, rice, broccoli”).";
    return;
  }
  const result = analyzeDinner(text, activeMode);
  renderAll(result);
  syncShareUrl(text, activeMode);
}

function syncShareUrl(text, mode){
  const params = new URLSearchParams(location.search);
  params.set("meal", text);
  params.set("mode", mode);
  const newUrl = `${location.pathname}?${params.toString()}`;
  history.replaceState({}, "", newUrl);
}

function copyShareLink(){
  const url = location.href;
  navigator.clipboard?.writeText(url).then(()=>{
    el.copyLinkBtn.textContent = "Copied!";
    setTimeout(()=> el.copyLinkBtn.textContent = "Copy share link", 1200);
  }).catch(()=>{
    // Fallback
    const ta = document.createElement("textarea");
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    el.copyLinkBtn.textContent = "Copied!";
    setTimeout(()=> el.copyLinkBtn.textContent = "Copy share link", 1200);
  });
}

// Wire up
el.analyzeBtn.addEventListener("click", runAnalysis);
el.mealInput.addEventListener("keydown", (e)=>{ if (e.key === "Enter") runAnalysis(); });
el.copyLinkBtn.addEventListener("click", copyShareLink);

document.querySelectorAll(".toggle").forEach(btn=>{
  btn.addEventListener("click", ()=> setMode(btn.getAttribute("data-mode")));
});

document.querySelectorAll(".chipBtn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    el.mealInput.value = btn.getAttribute("data-example");
    runAnalysis();
  });
});

// Deep-link support: ?meal=...&mode=...
(function bootFromUrl(){
  const params = new URLSearchParams(location.search);
  const meal = params.get("meal");
  const mode = params.get("mode");
  if (mode) setMode(mode);
  if (meal){
    el.mealInput.value = meal;
    runAnalysis();
  } else {
    // nice default drawing
    drawRadar(el.radar, [
      { name:"Satiety", value:55, better:"higher" },
      { name:"Energy crash risk", value:50, better:"lower" },
      { name:"Cravings", value:45, better:"lower" },
      { name:"Digestion", value:60, better:"higher" },
      { name:"Glucose volatility", value:50, better:"lower" },
    ]);
  }
})();
