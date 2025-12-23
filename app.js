"use strict";

/**
 * Dinner Doctor — Portion-aware physiology readout (no paid APIs)
 * - Parse dinner text → show Portion Check panel
 * - Portions drive the math (grams conversion)
 * - Unknown items: user chooses a category (still scores accurately)
 * - Large DB is loaded from foods.json (easy to expand)
 */

// ----------------------------
// Modes
// ----------------------------
const MODES = {
  none:   { name: "Standard" },
  t1d:    { name: "Type 1 Diabetes" },
  heart:  { name: "Heart" },
  gut:    { name: "Gut" },
  muscle: { name: "Muscle" },
  cut:    { name: "Weight Loss" },
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

  portionCard: $("portionCard"),
  portionRows: $("portionRows"),
  portionScan: $("portionScan"),
  portionBack: $("portionBack"),
  portionClose: $("portionClose"),

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
// Food DB loading (foods.json)
// ----------------------------
let FOODS = [];
let FOODS_READY = loadFoods();

async function loadFoods(){
  try{
    const res = await fetch("./foods.json", { cache: "no-store" });
    if (!res.ok) throw new Error("foods.json not found");
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("foods.json must be an array");
    FOODS = data;
  }catch(e){
    // Minimal fallback (app still runs)
    FOODS = [
      { id:"salmon", name:"Salmon", syn:["salmon","fish"], serving_g:140, units:{ "oz":28.35, "g":1, "serving":140 }, per_serving:{ p:28, c:0, f:12, fiber:0, sugar:0, sodium:120, satfat:2, refined:0 }},
      { id:"mashed_potato", name:"Mashed potatoes", syn:["mashed potatoes","potatoes","potato"], serving_g:210, units:{ "cup":210, "g":1, "serving":210 }, per_serving:{ p:4, c:35, f:8, fiber:3, sugar:3, sodium:350, satfat:2, refined:0.6 }},
      { id:"broccoli", name:"Broccoli", syn:["broccoli","veggies","vegetables"], serving_g:150, units:{ "cup":90, "g":1, "serving":150 }, per_serving:{ p:4, c:10, f:1, fiber:5, sugar:2, sodium:50, satfat:0, refined:0 }},
      { id:"dessert_generic", name:"Dessert (generic)", syn:["cake","brownie","ice cream","cookies","dessert"], serving_g:90, units:{ "slice":90, "g":1, "serving":90 }, per_serving:{ p:4, c:45, f:12, fiber:1, sugar:30, sodium:200, satfat:7, refined:1 }},
    ];
  }
  indexFoods();
}

// Quick index for matching
let FOOD_INDEX = [];
function indexFoods(){
  FOOD_INDEX = FOODS.map(f => ({
    food: f,
    keys: (f.syn || []).map(normalizeText).concat([normalizeText(f.name || "")]).filter(Boolean)
  }));
}

// ----------------------------
// Unknown-item category defaults (so EVERY query can still be scored)
// ----------------------------
const CATEGORY_PROFILES = {
  protein: { label:"Protein", serving_g:120, units:{ serving:120, g:1, oz:28.35, piece:120 }, per_serving:{ p:26, c:2, f:10, fiber:0, sugar:1, sodium:220, satfat:3, refined:0.1 }},
  carb:    { label:"Carb", serving_g:180, units:{ serving:180, g:1, oz:28.35, cup:180, slice:40 }, per_serving:{ p:5, c:45, f:3, fiber:3, sugar:3, sodium:180, satfat:0.6, refined:0.9 }},
  veg:     { label:"Vegetable", serving_g:150, units:{ serving:150, g:1, cup:90 }, per_serving:{ p:3, c:10, f:0.5, fiber:5, sugar:3, sodium:60, satfat:0, refined:0 }},
  fruit:   { label:"Fruit", serving_g:150, units:{ serving:150, g:1, cup:150, piece:150 }, per_serving:{ p:1, c:22, f:0.2, fiber:4, sugar:15, sodium:5, satfat:0, refined:0 }},
  dairy:   { label:"Dairy", serving_g:170, units:{ serving:170, g:1, cup:245 }, per_serving:{ p:12, c:12, f:6, fiber:0, sugar:10, sodium:140, satfat:3, refined:0.1 }},
  fat:     { label:"Fat / Sauce", serving_g:14, units:{ serving:14, g:1, tbsp:14, tsp:5 }, per_serving:{ p:0, c:0, f:14, fiber:0, sugar:0, sodium:80, satfat:2, refined:0 }},
  dessert: { label:"Dessert", serving_g:90, units:{ serving:90, g:1, slice:90, piece:90 }, per_serving:{ p:3, c:45, f:12, fiber:1, sugar:28, sodium:200, satfat:7, refined:1 }},
  drink:   { label:"Drink", serving_g:355, units:{ serving:355, g:1, cup:240, can:355, bottle:500 }, per_serving:{ p:0, c:20, f:0, fiber:0, sugar:18, sodium:40, satfat:0, refined:1 }},
  mixed:   { label:"Mixed dish", serving_g:350, units:{ serving:350, g:1, cup:240, bowl:350, plate:450 }, per_serving:{ p:18, c:50, f:18, fiber:5, sugar:6, sodium:700, satfat:5, refined:0.8 }},
};

const CATEGORY_LIST = [
  ["mixed","Mixed dish"],
  ["protein","Protein"],
  ["carb","Carb"],
  ["veg","Vegetable"],
  ["fruit","Fruit"],
  ["dairy","Dairy"],
  ["fat","Fat / Sauce"],
  ["dessert","Dessert"],
  ["drink","Drink"],
];

// ----------------------------
// Utilities
// ----------------------------
function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }
function round(n){ return Math.round(n); }
function pct(n){ return `${clamp(Math.round(n),0,100)}%`; }

function normalizeText(s){
  return (s || "")
    .toLowerCase()
    .replace(/[®™]/g,"")
    .replace(/[\(\)\[\]\{\}]/g," ")
    .replace(/[^\w\s\+\-\,\.\/]/g," ")
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

// Parse portion patterns like: "2 slices pizza", "8 oz steak", "1.5 cups rice"
function parsePortion(token){
  const t = normalizeText(token);

  // e.g. "8oz", "8 oz", "1.5 cups", "2 slices"
  const m = t.match(/^(\d+(\.\d+)?)\s*(g|gram|grams|oz|ounce|ounces|lb|pound|pounds|cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|slice|slices|piece|pieces|serving|servings|can|cans|bottle|bottles|bowl|bowls|plate|plates)\s+(.*)$/i);
  if (!m) return { amount: 1, unit: "serving", name: token };

  const amount = parseFloat(m[1]);
  const rawUnit = (m[3] || "").toLowerCase();
  const name = m[4] || token;

  const unitMap = {
    g:"g", gram:"g", grams:"g",
    oz:"oz", ounce:"oz", ounces:"oz",
    lb:"lb", pound:"lb", pounds:"lb",
    cup:"cup", cups:"cup",
    tbsp:"tbsp", tablespoon:"tbsp", tablespoons:"tbsp",
    tsp:"tsp", teaspoon:"tsp", teaspoons:"tsp",
    slice:"slice", slices:"slice",
    piece:"piece", pieces:"piece",
    serving:"serving", servings:"serving",
    can:"can", cans:"can",
    bottle:"bottle", bottles:"bottle",
    bowl:"bowl", bowls:"bowl",
    plate:"plate", plates:"plate",
  };

  return { amount: isFinite(amount) ? amount : 1, unit: unitMap[rawUnit] || "serving", name };
}

function escapeHtml(s){
  return (s ?? "").toString()
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function hexToRgba(hex, a){
  const h = (hex || "").trim();
  if (!/^#?[0-9a-fA-F]{6}$/.test(h)) return `rgba(255,255,255,${a})`;
  const x = h.startsWith("#") ? h.slice(1) : h;
  const r = parseInt(x.slice(0,2),16);
  const g = parseInt(x.slice(2,4),16);
  const b = parseInt(x.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}

function toneColor(tone){
  const root = getComputedStyle(document.documentElement);
  if (tone === "bad") return root.getPropertyValue("--bad").trim();
  if (tone === "warn") return root.getPropertyValue("--warn").trim();
  return root.getPropertyValue("--good").trim();
}

// ----------------------------
// Matching
// ----------------------------
function matchFood(name){
  const t = normalizeText(name);
  let best = null;
  let bestLen = 0;

  for (const row of FOOD_INDEX){
    for (const k of row.keys){
      if (!k) continue;
      if (t === k || t.includes(k) || k.includes(t)){
        const scoreLen = Math.min(t.length, k.length);
        if (scoreLen > bestLen){
          best = row.food;
          bestLen = scoreLen;
        }
      }
    }
  }
  return best;
}

function guessCategory(name){
  const t = normalizeText(name);

  // Quick heuristics to reduce friction for unknown items
  if (/(soda|coke|cola|juice|lemonade|beer|wine|cocktail|tea|coffee|latte|smoothie)/.test(t)) return "drink";
  if (/(cake|cookie|brownie|ice cream|dessert|candy|donut|chocolate|pie|cupcake)/.test(t)) return "dessert";
  if (/(salad|broccoli|asparagus|spinach|kale|vegetable|veggies|carrot|green beans|zucchini|pepper|tomato|cucumber)/.test(t)) return "veg";
  if (/(apple|banana|berries|strawberry|blueberry|grapes|orange|fruit)/.test(t)) return "fruit";
  if (/(yogurt|milk|cheese|cottage|kefir)/.test(t)) return "dairy";
  if (/(oil|butter|mayo|mayonnaise|cream|avocado|nuts|peanut butter|tahini)/.test(t)) return "fat";
  if (/(rice|pasta|bread|roll|bun|potato|fries|quinoa|oats|tortilla|noodles)/.test(t)) return "carb";
  if (/(chicken|beef|steak|fish|salmon|tuna|turkey|egg|tofu|tempeh|beans|lentils)/.test(t)) return "protein";

  return "mixed";
}

// ----------------------------
// Portion conversion
// ----------------------------
function unitToGrams(foodOrProfile, unit, amount){
  const amt = isFinite(amount) && amount > 0 ? amount : 1;
  const u = (unit || "serving").toLowerCase();

  // direct grams
  if (u === "g") return amt;

  // oz/lb
  if (u === "oz") return amt * 28.3495;
  if (u === "lb") return amt * 453.592;

  const map = foodOrProfile.units || {};
  const gPer = map[u];

  // If we know the unit for that food, use it
  if (typeof gPer === "number" && isFinite(gPer) && gPer > 0) return amt * gPer;

  // fallback to serving grams
  const sg = foodOrProfile.serving_g || 100;
  if (u === "serving") return amt * sg;

  // last resort: treat unknown unit as serving
  return amt * sg;
}

// ----------------------------
// Analysis pipeline
// ----------------------------
let CURRENT_ITEMS = []; // portion rows model

function parseDinnerToItems(text){
  const tokens = splitFoods(text);

  const hits = [];
  const misses = [];

  const items = tokens.map((tok, idx) => {
    const p = parsePortion(tok);
    const food = matchFood(p.name);
    if (food){
      hits.push(p.name);
      return {
        id: `i_${idx}`,
        raw: tok,
        name: p.name,
        amount: p.amount,
        unit: defaultUnitFor(food, p.unit),
        known: true,
        food,
        category: null
      };
    } else {
      misses.push(p.name);
      const cat = guessCategory(p.name);
      return {
        id: `i_${idx}`,
        raw: tok,
        name: p.name,
        amount: p.amount,
        unit: defaultUnitFor(CATEGORY_PROFILES[cat], p.unit),
        known: false,
        food: null,
        category: cat
      };
    }
  });

  return { items, hits, misses };
}

function defaultUnitFor(foodOrProfile, parsedUnit){
  const u = (parsedUnit || "serving").toLowerCase();
  const units = foodOrProfile.units || {};
  if (u === "g" || u === "oz" || u === "lb") return u;
  if (units[u]) return u;
  if (units["serving"]) return "serving";
  // pick any known unit
  const first = Object.keys(units)[0];
  return first || "serving";
}

function aggregateFromItems(items){
  const agg = { p:0, c:0, f:0, fiber:0, sugar:0, sodium:0, satfat:0, refined:0 };

  for (const it of items){
    const base = it.known ? it.food : CATEGORY_PROFILES[it.category || "mixed"];
    if (!base) continue;

    const grams = unitToGrams(base, it.unit, it.amount);
    const mult = grams / (base.serving_g || 100);

    const src = it.known ? it.food.per_serving : base.per_serving;

    agg.p      += (src.p || 0) * mult;
    agg.c      += (src.c || 0) * mult;
    agg.f      += (src.f || 0) * mult;
    agg.fiber  += (src.fiber || 0) * mult;
    agg.sugar  += (src.sugar || 0) * mult;
    agg.sodium += (src.sodium || 0) * mult;
    agg.satfat += (src.satfat || 0) * mult;
    agg.refined+= (src.refined || 0) * mult;
  }

  return agg;
}

// ----------------------------
// Scoring model (heuristic, portion-aware)
// ----------------------------
function scoreMeal(agg, mode){
  const protein = agg.p;
  const carbs   = agg.c;
  const fat     = agg.f;
  const fiber   = agg.fiber;
  const sugar   = agg.sugar;
  const sodium  = agg.sodium;
  const satfat  = agg.satfat;
  const refined = agg.refined;

  let satiety =
    30 + protein * 1.05 + fiber * 2.4 + Math.min(fat, 28) * 0.55
    - sugar * 0.55 - refined * 7.5;

  let crash =
    18 + refined * 13 + sugar * 0.85 + Math.max(0, carbs - 60) * 0.22
    - protein * 0.70 - fiber * 1.7 - fat * 0.30;

  let cravings =
    16 + refined * 11 + sugar * 0.90
    - protein * 0.55 - fiber * 1.30 - Math.min(fat, 20) * 0.20;

  let digestion =
    55 + fiber * 1.35
    - Math.max(0, fat - 30) * 0.85
    - Math.max(0, satfat - 12) * 1.15
    - Math.max(0, sodium - 1100) * 0.010
    - refined * 1.3;

  let glucose =
    20 + refined * 14 + sugar * 0.95 + Math.max(0, carbs - 55) * 0.33
    - protein * 0.55 - fiber * 1.8 - fat * 0.22;

  if (mode === "t1d"){ glucose += 10; crash += 6; }
  if (mode === "heart"){
    crash += Math.max(0, sodium - 800) * 0.012;
    digestion -= Math.max(0, satfat - 9) * 0.9;
  }
  if (mode === "gut"){
    digestion += fiber * 0.8;
    digestion -= Math.max(0, 7 - fiber) * 2.1;
  }
  if (mode === "muscle"){
    satiety += Math.max(0, protein - 30) * 0.55;
    cravings -= protein * 0.12;
  }
  if (mode === "cut"){
    satiety += fiber * 0.55;
    cravings += sugar * 0.18;
  }

  satiety   = clamp(satiety, 0, 100);
  digestion = clamp(digestion, 0, 100);
  crash     = clamp(crash, 0, 100);
  cravings  = clamp(cravings, 0, 100);
  glucose   = clamp(glucose, 0, 100);

  const dd = clamp(
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
    anchors: { protein, fiber, sugar, sodium, refined, satfat, carbs, fat }
  };
}

// ----------------------------
// Best move + ladder (portion-aware)
// ----------------------------
function bestMoveAndLadder(anchors, mode){
  const lowProtein = anchors.protein < 28;
  const lowFiber   = anchors.fiber < 8;
  const highSugar  = anchors.sugar > 22;
  const highRefined= anchors.refined > 1.4;
  const highSodium = anchors.sodium > 1100;

  const priorities = [];
  priorities.push({ key:"fiber", score: (lowFiber? 100:0) + (mode==="gut"? 30:0) + (mode==="cut"? 15:0) });
  priorities.push({ key:"protein", score: (lowProtein? 96:0) + (mode==="muscle"? 25:0) });
  priorities.push({ key:"sugar", score: (highSugar? 92:0) + (mode==="t1d"? 35:0) + (mode==="cut"? 10:0) });
  priorities.push({ key:"refined", score: (highRefined? 86:0) + (mode==="t1d"? 28:0) });
  priorities.push({ key:"sodium", score: (highSodium? 82:0) + (mode==="heart"? 40:0) });

  priorities.sort((a,b)=>b.score-a.score);
  const top = priorities[0]?.key || "fiber";

  let oneBest = "";
  let ladder = [];

  if (top === "fiber"){
    oneBest = "Add a fiber + color anchor: 2 cups vegetables or a side salad (this stabilizes satiety, cravings, and crash risk).";
    ladder = [
      { name:"Level 1 (zero-cook)", delta:"+8",  text:"Add bagged salad or raw veg + fruit." },
      { name:"Level 2 (one-step)",  delta:"+13", text:"Add beans/lentils OR swap to higher-fiber carb (quinoa/brown rice/whole grain)." },
      { name:"Level 3 (chef)",      delta:"+18", text:"Half-plate plants + protein first; keep dessert smaller or later." },
    ];
  } else if (top === "protein"){
    oneBest = "Add a protein anchor: aim for ~25–35g protein at dinner to improve satiety and reduce late cravings.";
    ladder = [
      { name:"Level 1 (zero-cook)", delta:"+7",  text:"Add Greek yogurt/cottage cheese or a protein shake." },
      { name:"Level 2 (one-step)",  delta:"+12", text:"Add eggs, tofu, chicken, tuna, or beans." },
      { name:"Level 3 (chef)",      delta:"+17", text:"Re-plate: protein + veg first; carb second; dessert smaller or paired." },
    ];
  } else if (top === "sugar"){
    oneBest = "Neutralize added sugar: reduce dessert portion and pair it with protein/fiber to reduce volatility and cravings.";
    ladder = [
      { name:"Level 1 (zero-cook)", delta:"+8",  text:"Swap sugary drink for water/diet option; keep dessert smaller." },
      { name:"Level 2 (one-step)",  delta:"+13", text:"Pair dessert with Greek yogurt/berries or nuts; eat veg first." },
      { name:"Level 3 (chef)",      delta:"+18", text:"Dessert redesign: higher-protein/higher-fiber version or split timing." },
    ];
  } else if (top === "refined"){
    oneBest = "Upgrade carb quality: swap refined carbs for higher-fiber options to lower crash risk and glucose volatility.";
    ladder = [
      { name:"Level 1 (zero-cook)", delta:"+6",  text:"Add veg/salad before the carb-heavy portion." },
      { name:"Level 2 (one-step)",  delta:"+12", text:"Switch to quinoa/brown rice/whole grain; slightly reduce refined portion." },
      { name:"Level 3 (chef)",      delta:"+16", text:"Rebuild plate: half veg, palm protein, fist carb; dessert smaller/later." },
    ];
  } else {
    oneBest = "Lower sodium load: high sodium drives thirst/bloating and can increase rebound cravings—dilute with fresh volume.";
    ladder = [
      { name:"Level 1 (zero-cook)", delta:"+6",  text:"Add a big fresh side + extra water; skip salty add-ons." },
      { name:"Level 2 (one-step)",  delta:"+11", text:"Choose lower-sodium versions; rinse canned items; use herbs + lemon." },
      { name:"Level 3 (chef)",      delta:"+15", text:"Cook a clean base protein + veg; keep salty items as accents." },
    ];
  }

  if (mode === "t1d") oneBest += " (T1D mode prioritizes volatility buffering: protein + fiber first.)";
  if (mode === "heart") oneBest += " (Heart mode emphasizes sodium + saturated fat.)";

  return { oneBest, ladder };
}

// ----------------------------
// Readout helpers
// ----------------------------
function severityLabel(metricName, score){
  const isGoodHigher = (metricName === "Satiety" || metricName === "Digestion");
  const badness = isGoodHigher ? (100 - score) : score;
  if (badness >= 70) return { label: "High", tone: "bad" };
  if (badness >= 45) return { label: "Moderate", tone: "warn" };
  return { label: "Low", tone: "good" };
}

function metricInterpretation(metric, anchors, mode){
  const v = metric.value;
  switch(metric.name){
    case "Satiety":
      if (v >= 75) return "Steady fullness likely; low snack-pressure later.";
      if (v >= 55) return "Decent fullness, but could fade if fiber/protein is light.";
      return "Hunger rebound likely; add protein/fiber anchor.";
    case "Energy crash risk":
      if (v >= 75) return "Crash risk elevated; buffer with protein/fiber; reduce refined/sugar.";
      if (v >= 55) return "Some dip risk; fiber/protein can stabilize.";
      return "Energy likely steady.";
    case "Cravings":
      if (v >= 75) return "Cravings likely later (often sugar/refined-driven).";
      if (v >= 55) return "Moderate craving risk; improve protein/fiber pairing.";
      return "Cravings likely low.";
    case "Digestion":
      if (v >= 75) return "Generally digestion-friendly.";
      if (v >= 55) return "Okay, but heavy fat/sodium can feel ‘weighed down.’";
      return "Heaviness/bloat risk; lighten fat + raise fiber.";
    case "Glucose volatility":
      if (mode === "t1d" && v >= 65) return "T1D mode flags higher volatility; protein/fiber first.";
      if (v >= 75) return "Volatility likely high; reduce refined/sugar or add fiber/protein.";
      if (v >= 55) return "Moderate volatility; pairing improves stability.";
      return "Likely stable.";
    default:
      return "";
  }
}

// ----------------------------
// Radar chart (canvas)
// ----------------------------
function drawRadar(canvas, metrics){
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0,0,w,h);

  const root = getComputedStyle(document.documentElement);
  const stroke = root.getPropertyValue("--stroke").trim();
  const stroke2 = root.getPropertyValue("--stroke2").trim();
  const cyan = root.getPropertyValue("--cyan").trim();
  const text = root.getPropertyValue("--text").trim();
  const muted = root.getPropertyValue("--muted2").trim();

  const cx = w/2;
  const cy = h/2 + 8;
  const r = Math.min(w,h) * 0.34;

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

  const points = metrics.map((m,i)=>{
    const a = (Math.PI*2) * (i/N) - Math.PI/2;
    const val = (m.better === "lower") ? (100 - m.value) : m.value;
    const rr = r * (val/100);
    return { x: Math.cos(a)*rr, y: Math.sin(a)*rr, a, val };
  });

  ctx.beginPath();
  points.forEach((p,i)=> i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
  ctx.closePath();

  const grad = ctx.createLinearGradient(-r, -r, r, r);
  grad.addColorStop(0, "rgba(121,198,255,.28)");
  grad.addColorStop(1, "rgba(176,140,255,.28)");
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = "rgba(121,198,255,.85)";
  ctx.lineWidth = 2;
  ctx.stroke();

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

  ctx.fillStyle = text;
  ctx.font = "900 12px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.fillText("DINNER DOCTOR", 0, -r-18);
  ctx.restore();
}

// ----------------------------
// UI: Portion panel rendering
// ----------------------------
function showPortionPanel(items, hits, misses){
  CURRENT_ITEMS = items;

  const recognized = hits.length ? `Recognized: ${hits.join(", ")}` : "";
  const unknown = misses.length ? ` • Unknown: ${misses.join(", ")} (pick category)` : "";
  el.parseLine.textContent = (recognized || "No recognizable items found.") + unknown;

  el.portionCard.classList.remove("hidden");

  el.portionRows.innerHTML = items.map(it => {
    const tagText = it.known ? `Matched: ${escapeHtml(it.food.name)}` : `Unknown → ${CATEGORY_PROFILES[it.category]?.label || "Mixed dish"}`;
    const dot = it.known ? "var(--good)" : "var(--warn)";

    const unitOptions = buildUnitOptions(it);
    const catOptions = it.known ? "" : `
      <div class="pCell">
        <div class="pLabel">Category</div>
        <select class="pSelect" data-field="category" data-id="${it.id}">
          ${CATEGORY_LIST.map(([k,label])=>`<option value="${k}" ${k===it.category?"selected":""}>${label}</option>`).join("")}
        </select>
      </div>
    `;

    return `
      <div class="pRow" data-row="${it.id}">
        <div>
          <div class="pName">${escapeHtml(it.name)}</div>
          <div class="pMeta">
            <span class="pTag"><span class="pDot" style="background:${dot};"></span>${tagText}</span>
          </div>
        </div>

        <div class="pCell">
          <div class="pLabel">Amount</div>
          <input class="pInput" data-field="amount" data-id="${it.id}" type="number" inputmode="decimal" min="0.1" step="0.1" value="${it.amount}" />
        </div>

        <div class="pCell">
          <div class="pLabel">Unit</div>
          <select class="pSelect" data-field="unit" data-id="${it.id}">
            ${unitOptions}
          </select>
        </div>

        ${catOptions || `<div class="pCell"><div class="pLabel">Category</div><div class="pMeta" style="padding:10px 10px;border-radius:12px;background:rgba(5,8,18,.35);border:1px solid rgba(255,255,255,.08);font-weight:900;">Known</div></div>`}
      </div>
    `;
  }).join("");

  // Wire per-row category updates (so unit list updates too)
  el.portionRows.querySelectorAll('select[data-field="category"]').forEach(sel=>{
    sel.addEventListener("change", ()=>{
      const id = sel.getAttribute("data-id");
      const row = CURRENT_ITEMS.find(x=>x.id===id);
      if (!row) return;
      row.category = sel.value;
      // update unit default if needed
      row.unit = defaultUnitFor(CATEGORY_PROFILES[row.category], row.unit);
      // re-render just units dropdown for that row
      const rowEl = el.portionRows.querySelector(`[data-row="${id}"]`);
      const unitSel = rowEl?.querySelector('select[data-field="unit"]');
      if (unitSel){
        unitSel.innerHTML = buildUnitOptions(row);
        unitSel.value = row.unit;
      }
    });
  });
}

function buildUnitOptions(item){
  const base = item.known ? item.food : CATEGORY_PROFILES[item.category || "mixed"];
  const units = Object.keys(base.units || {});
  // Always include g/oz/lb
  const all = Array.from(new Set(["serving", "cup", "tbsp", "tsp", "slice", "piece", "can", "bottle", "bowl", "plate", ...units, "g", "oz", "lb"]));
  const nice = {
    serving:"serving", g:"g", oz:"oz", lb:"lb",
    cup:"cup", tbsp:"tbsp", tsp:"tsp",
    slice:"slice", piece:"piece",
    can:"can", bottle:"bottle", bowl:"bowl", plate:"plate"
  };

  const allowed = all.filter(u=>{
    if (u==="g" || u==="oz" || u==="lb") return true;
    return (base.units && base.units[u]) || u==="serving";
  });

  return allowed.map(u=>{
    const label = nice[u] || u;
    const sel = (u === item.unit) ? "selected" : "";
    return `<option value="${u}" ${sel}>${label}</option>`;
  }).join("");
}

function readPortionPanelToItems(){
  const items = CURRENT_ITEMS.map(it => ({...it}));

  // pull values
  el.portionRows.querySelectorAll("[data-field]").forEach(node=>{
    const field = node.getAttribute("data-field");
    const id = node.getAttribute("data-id");
    const it = items.find(x=>x.id===id);
    if (!it) return;

    if (field === "amount"){
      it.amount = parseFloat(node.value);
      if (!isFinite(it.amount) || it.amount <= 0) it.amount = 1;
    } else if (field === "unit"){
      it.unit = node.value;
    } else if (field === "category"){
      it.category = node.value;
    }
  });

  return items;
}

// ----------------------------
// Rendering: scores + readout
// ----------------------------
function renderAll(scored, agg){
  // Mini stats
  el.ddScore.textContent = scored.dd;
  el.miniProtein.textContent = agg.p >= 30 ? "Strong" : agg.p >= 18 ? "Okay" : "Low";
  el.miniFiber.textContent = agg.fiber >= 10 ? "Strong" : agg.fiber >= 6 ? "Okay" : "Low";
  el.miniSugar.textContent = agg.sugar <= 12 ? "Low" : agg.sugar <= 24 ? "Moderate" : "High";
  el.miniSodium.textContent = agg.sodium <= 800 ? "Low" : agg.sodium <= 1200 ? "Moderate" : "High";

  const signal = scored.dd >= 78 ? "Excellent" : scored.dd >= 62 ? "Strong" : scored.dd >= 48 ? "Mixed" : "Needs work";
  el.signalLabel.textContent = signal;

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

  // Readout table ranked by badness
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
    const barVal = (m.better==="lower") ? (100 - m.value) : m.value;

    return `
      <tr>
        <td>
          <div class="metric">
            <span class="chip" style="background:${c}; box-shadow:0 0 14px ${hexToRgba(c,.30)};"></span>
            <div>
              <div style="font-weight:900;">${escapeHtml(m.name)}</div>
              <div class="sev">${escapeHtml(metricInterpretation(m, scored.anchors, activeMode))}</div>
              <div class="bar"><i style="width:${pct(barVal)};"></i></div>
            </div>
          </div>
        </td>
        <td class="score">${m.value}</td>
        <td class="sev" style="color:${c}; font-weight:900;">${sev.label}</td>
      </tr>
    `;
  }).join("");

  drawRadar(el.radar, scored.metrics);
}

// ----------------------------
// Events
// ----------------------------
function setMode(mode){
  activeMode = MODES[mode] ? mode : "none";
  el.modeLabel.textContent = MODES[activeMode].name;

  document.querySelectorAll(".toggle").forEach(btn=>{
    const is = btn.getAttribute("data-mode") === activeMode;
    btn.setAttribute("aria-pressed", is ? "true" : "false");
  });

  // If we already have parsed items visible, re-run scan using current portion inputs
  if (!el.portionCard.classList.contains("hidden") && CURRENT_ITEMS.length){
    runScanFromPortions();
  }
}

async function runAnalyze(){
  await FOODS_READY;

  const text = el.mealInput.value.trim();
  if (!text){
    el.parseLine.textContent = "Type a dinner first (e.g., “salmon, rice, broccoli”).";
    return;
  }

  const { items, hits, misses } = parseDinnerToItems(text);
  showPortionPanel(items, hits, misses);
  syncShareUrl(text, activeMode);
}

function runScanFromPortions(){
  const items = readPortionPanelToItems();
  const agg = aggregateFromItems(items);
  const scored = scoreMeal(agg, activeMode);
  renderAll(scored, agg);
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

el.analyzeBtn.addEventListener("click", runAnalyze);
el.mealInput.addEventListener("keydown", (e)=>{ if (e.key === "Enter") runAnalyze(); });
el.copyLinkBtn.addEventListener("click", copyShareLink);

el.portionScan.addEventListener("click", runScanFromPortions);
el.portionBack.addEventListener("click", ()=>{
  el.portionCard.classList.add("hidden");
  el.mealInput.focus();
});
el.portionClose.addEventListener("click", ()=>{
  el.portionCard.classList.add("hidden");
});

document.querySelectorAll(".toggle").forEach(btn=>{
  btn.addEventListener("click", ()=> setMode(btn.getAttribute("data-mode")));
});

document.querySelectorAll(".chipBtn").forEach(btn=>{
  btn.addEventListener("click", async ()=>{
    el.mealInput.value = btn.getAttribute("data-example");
    await runAnalyze();
  });
});

// Boot from URL (?meal=...&mode=...)
(async function bootFromUrl(){
  await FOODS_READY;

  const params = new URLSearchParams(location.search);
  const meal = params.get("meal");
  const mode = params.get("mode");

  if (mode) setMode(mode);

  if (meal){
    el.mealInput.value = meal;
    await runAnalyze();
    // auto-run scan once with defaults (user can refine)
    runScanFromPortions();
  } else {
    drawRadar(el.radar, [
      { name:"Satiety", value:55, better:"higher" },
      { name:"Energy crash risk", value:50, better:"lower" },
      { name:"Cravings", value:45, better:"lower" },
      { name:"Digestion", value:60, better:"higher" },
      { name:"Glucose volatility", value:50, better:"lower" },
    ]);
  }
})();
