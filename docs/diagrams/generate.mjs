// Generates .excalidraw files for the Maestro architecture docs.
//   node docs/diagrams/generate.mjs
// Open the output at https://excalidraw.com (File > Open) or the VS Code Excalidraw extension.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = dirname(fileURLToPath(import.meta.url));

let SEED = 1;
const nextSeed = () => (SEED = (SEED * 1103515245 + 12345) & 0x7fffffff);

const COLORS = {
  ink: "#1e1e1e",
  text: "#1e1e1e",
  cyan: "#a5d8ff",
  cyanInk: "#1971c2",
  violet: "#d0bfff",
  violetInk: "#6741d9",
  green: "#b2f2bb",
  greenInk: "#2f9e44",
  amber: "#ffec99",
  amberInk: "#e8590c",
  red: "#ffc9c9",
  redInk: "#e03131",
  gray: "#e9ecef",
  muted: "#868e96",
  arrow: "#495057",
};

function base(type, x, y, w, h, extra = {}) {
  return {
    id: `el${nextSeed()}`,
    type,
    x, y, width: w, height: h,
    angle: 0,
    strokeColor: COLORS.ink,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: type === "rectangle" ? { type: 3 } : null,
    seed: nextSeed(),
    version: 1,
    versionNonce: nextSeed(),
    isDeleted: false,
    boundElements: [],
    updated: 1,
    link: null,
    locked: false,
    ...extra,
  };
}

const elements = [];

// A labelled box = rectangle with centered, container-bound text.
function box(x, y, w, h, label, fill = COLORS.cyan, ink = COLORS.cyanInk, fontSize = 18) {
  const rect = base("rectangle", x, y, w, h, { backgroundColor: fill, strokeColor: ink });
  const text = base("text", x, y, w, h, {
    type: "text",
    text: label,
    fontSize,
    fontFamily: 2,
    textAlign: "center",
    verticalAlign: "middle",
    baseline: fontSize,
    containerId: rect.id,
    originalText: label,
    lineHeight: 1.25,
    strokeColor: ink,
    autoResize: true,
  });
  rect.boundElements.push({ type: "text", id: text.id });
  elements.push(rect, text);
  return rect;
}

// Free-floating label (no container).
function label(x, y, text, fontSize = 14, color = COLORS.text) {
  const t = base("text", x, y, text.length * fontSize * 0.55, fontSize * 1.4, {
    type: "text",
    text,
    fontSize,
    fontFamily: 2,
    textAlign: "left",
    verticalAlign: "top",
    baseline: fontSize,
    containerId: null,
    originalText: text,
    lineHeight: 1.25,
    strokeColor: color,
    autoResize: true,
  });
  elements.push(t);
  return t;
}

// Arrow from edge of box a to edge of box b, bound both ways.
function arrow(a, b, text) {
  const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  // pick start/end on the facing edges
  const dx = bc.x - ac.x, dy = bc.y - ac.y;
  let sx, sy, ex, ey;
  if (Math.abs(dx) > Math.abs(dy)) {
    sx = ac.x + Math.sign(dx) * (a.width / 2); sy = ac.y;
    ex = bc.x - Math.sign(dx) * (b.width / 2); ey = bc.y;
  } else {
    sx = ac.x; sy = ac.y + Math.sign(dy) * (a.height / 2);
    ex = bc.x; ey = bc.y - Math.sign(dy) * (b.height / 2);
  }
  const ar = base("arrow", sx, sy, ex - sx, ey - sy, {
    type: "arrow",
    strokeColor: COLORS.arrow,
    points: [[0, 0], [ex - sx, ey - sy]],
    lastCommittedPoint: null,
    startBinding: { elementId: a.id, focus: 0, gap: 6 },
    endBinding: { elementId: b.id, focus: 0, gap: 6 },
    startArrowhead: null,
    endArrowhead: "arrow",
  });
  a.boundElements.push({ type: "arrow", id: ar.id });
  b.boundElements.push({ type: "arrow", id: ar.id });
  elements.push(ar);
  if (text) {
    label((sx + ex) / 2 - text.length * 3.5, (sy + ey) / 2 - 22, text, 13, COLORS.arrow);
  }
  return ar;
}

function frame(x, y, w, h, title, color) {
  const r = base("rectangle", x, y, w, h, {
    backgroundColor: "transparent",
    strokeColor: color,
    strokeStyle: "dashed",
    strokeWidth: 1.5,
    roundness: { type: 3 },
  });
  elements.push(r);
  label(x + 14, y + 10, title, 13, color);
  return r;
}

// A UML-style "class box": title, divider, then a left-aligned list of members.
function listBox(x, y, w, h, title, lines, fill, ink) {
  const card = base("rectangle", x, y, w, h, { backgroundColor: fill, strokeColor: ink, strokeWidth: 2.5 });
  elements.push(card);
  label(x + 16, y + 13, title, 16, ink);
  const divider = base("rectangle", x, y + 40, w, 2, { backgroundColor: ink, strokeColor: ink, strokeWidth: 0 });
  elements.push(divider);
  let yy = y + 52;
  for (const ln of lines) {
    label(x + 16, yy, ln, 13, "#212529");
    yy += 21;
  }
  return card;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Render the current elements to a standalone SVG (no editor needed to view).
function toSvg(els) {
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  const ext = (x, y) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (const e of els) {
    if (e.type === "arrow") for (const p of e.points) ext(e.x + p[0], e.y + p[1]);
    else { ext(e.x, e.y); ext(e.x + e.width, e.y + e.height); }
  }
  const pad = 40;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const W = Math.round(maxX - minX), H = Math.round(maxY - minY);
  const o = [];
  o.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${Math.round(minX)} ${Math.round(minY)} ${W} ${H}" ` +
    `width="${W}" height="${H}" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif">`,
  );
  o.push(`<rect x="${Math.round(minX)}" y="${Math.round(minY)}" width="${W}" height="${H}" fill="#ffffff"/>`);

  for (const e of els.filter((e) => e.type === "rectangle")) {
    const fill = e.backgroundColor === "transparent" ? "none" : e.backgroundColor;
    const dash = e.strokeStyle === "dashed" ? ` stroke-dasharray="7 5"` : "";
    o.push(
      `<rect x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" rx="10" ` +
      `fill="${fill}" stroke="${e.strokeColor}" stroke-width="${e.strokeWidth}"${dash}/>`,
    );
  }
  for (const e of els.filter((e) => e.type === "arrow")) {
    const x1 = e.x + e.points[0][0], y1 = e.y + e.points[0][1];
    const x2 = e.x + e.points[1][0], y2 = e.y + e.points[1][1];
    const ang = Math.atan2(y2 - y1, x2 - x1), len = 11, s = 0.45;
    o.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${e.strokeColor}" stroke-width="${e.strokeWidth}"/>`);
    o.push(
      `<polyline points="${x2 - len * Math.cos(ang - s)},${y2 - len * Math.sin(ang - s)} ${x2},${y2} ` +
      `${x2 - len * Math.cos(ang + s)},${y2 - len * Math.sin(ang + s)}" ` +
      `fill="none" stroke="${e.strokeColor}" stroke-width="${e.strokeWidth}"/>`,
    );
  }
  for (const e of els.filter((e) => e.type === "text")) {
    const lines = e.text.split("\n");
    const fs = e.fontSize, lh = fs * 1.25;
    const weight = fs >= 22 ? ' font-weight="700"' : "";
    if (e.containerId) {
      const cx = e.x + e.width / 2, cy = e.y + e.height / 2;
      const startY = cy - ((lines.length - 1) * lh) / 2;
      lines.forEach((ln, i) =>
        o.push(
          `<text x="${cx}" y="${startY + i * lh}" fill="${e.strokeColor}" font-size="${fs}"${weight} ` +
          `text-anchor="middle" dominant-baseline="central">${esc(ln)}</text>`,
        ),
      );
    } else {
      lines.forEach((ln, i) =>
        o.push(
          `<text x="${e.x}" y="${e.y + fs + i * lh}" fill="${e.strokeColor}" font-size="${fs}"${weight} ` +
          `text-anchor="start">${esc(ln)}</text>`,
        ),
      );
    }
  }
  o.push("</svg>");
  return o.join("\n");
}

// Wrap text to ~max chars per line (word boundaries) for narration bodies.
function wrap(text, max) {
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) {
      if (cur) lines.push(cur.trim());
      cur = w;
    } else cur += " " + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines.join("\n");
}

// A numbered story panel: colored card + number badge + title + narration body.
const SCENE_W = 380, SCENE_H = 260;
function scene(x, y, num, title, body, fill, ink) {
  const card = base("rectangle", x, y, SCENE_W, SCENE_H, {
    backgroundColor: fill,
    strokeColor: ink,
    strokeWidth: 2.5,
  });
  elements.push(card);
  box(x + 20, y + 20, 46, 46, String(num), ink, "#ffffff", 24); // badge
  label(x + 80, y + 30, title, 22, ink); // bold (fontSize >= 22)
  label(x + 24, y + 86, wrap(body, 40), 15, "#212529");
  return card;
}

function write(name, title) {
  const doc = {
    type: "excalidraw",
    version: 2,
    source: "maestro-docs",
    elements: elements.slice(),
    appState: { viewBackgroundColor: "#ffffff", gridSize: null },
    files: {},
  };
  writeFileSync(join(OUT, name), JSON.stringify(doc, null, 2));
  writeFileSync(join(OUT, name.replace(".excalidraw", ".svg")), toSvg(elements));
  elements.length = 0;
  SEED = 1;
  console.log(`wrote ${name} + ${name.replace(".excalidraw", ".svg")} (${title})`);
}

/* ───────────── Diagram 1: cross-chain architecture ───────────── */
label(360, 30, "Maestro — Autonomous Cross-Chain am-AMM", 24, COLORS.ink);

frame(40, 90, 300, 260, "Ethereum Sepolia (origin)", COLORS.greenInk);
const pyth = box(90, 170, 200, 90, "Pyth\nETH/USD price feed", COLORS.green, COLORS.greenInk);

frame(400, 90, 320, 260, "Reactive Lasna (ReactVM)", COLORS.violetInk);
const rsc = box(450, 170, 220, 90, "MaestroManagerRSC\nautonomous brain", COLORS.violet, COLORS.violetInk);

frame(780, 90, 380, 520, "Unichain Sepolia (destination)", COLORS.cyanInk);
const cb = box(830, 170, 280, 90, "ManagerCallback\nwins auction · repositions", COLORS.cyan, COLORS.cyanInk);
const hook = box(830, 330, 280, 100, "MaestroHook\nv4 hook · auction · vault", COLORS.cyan, COLORS.cyanInk, 20);
const pool = box(830, 490, 280, 80, "Uniswap v4 Pool", COLORS.gray, COLORS.ink);

arrow(pyth, rsc, "PriceFeedUpdate event");
arrow(rsc, cb, "cross-chain callback");
arrow(cb, hook, "repositionTo(lower,upper)");
arrow(hook, pool, "modifyLiquidity");
write("01-architecture.excalidraw", "cross-chain architecture");

/* ───────────── Diagram 2: Harberger auction lifecycle ───────────── */
label(300, 30, "Harberger Auction — Manager Lifecycle", 24, COLORS.ink);

const bid = box(80, 120, 220, 90, "bid(rentRate, deposit)\nanyone can bid", COLORS.cyan, COLORS.cyanInk);
const kdelay = box(80, 280, 220, 90, "K-block delay\ncensorship resistance", COLORS.amber, COLORS.amberInk);
const mgr = box(80, 440, 220, 90, "becomes Manager\npays rent every block", COLORS.green, COLORS.greenInk);

const setfee = box(420, 280, 220, 80, "setFee(f ≤ f_max)", COLORS.cyan, COLORS.cyanInk);
const repos = box(420, 400, 220, 80, "reposition(band)", COLORS.cyan, COLORS.cyanInk);
const rent = box(760, 340, 240, 90, "rent → LPs\n(rentPerShare accrual)", COLORS.green, COLORS.greenInk);
const outbid = box(420, 120, 220, 80, "higher bid arrives\n→ manager replaced", COLORS.amber, COLORS.amberInk);

arrow(bid, kdelay, "");
arrow(kdelay, mgr, "after K blocks");
arrow(mgr, setfee, "");
arrow(mgr, repos, "");
arrow(setfee, rent, "");
arrow(repos, rent, "");
arrow(outbid, bid, "outbid loop");
write("02-auction-lifecycle.excalidraw", "auction lifecycle");

/* ───────────── Diagram 3: LP + swap value flow ───────────── */
label(300, 30, "LP & Swap Value Flow", 24, COLORS.ink);

const lp = box(80, 200, 200, 90, "LP\ndeposit(amt0, amt1)", COLORS.green, COLORS.greenInk);
const vault = box(360, 200, 240, 100, "MaestroHook vault\nhook-owned liquidity", COLORS.cyan, COLORS.cyanInk, 20);
const shares = box(360, 380, 240, 80, "LP shares minted", COLORS.gray, COLORS.ink);
const swapper = box(80, 40, 200, 80, "Swapper", COLORS.amber, COLORS.amberInk);
const fee = box(680, 80, 240, 90, "dynamic fee\nset by manager", COLORS.violet, COLORS.violetInk);
const rentpool = box(680, 300, 240, 90, "rent + fees\n→ claimable by LPs", COLORS.green, COLORS.greenInk);

arrow(lp, vault, "");
arrow(vault, shares, "");
arrow(swapper, vault, "swap");
arrow(vault, fee, "beforeSwap");
arrow(fee, rentpool, "");
arrow(shares, rentpool, "claimRent()");
write("03-lp-swap-flow.excalidraw", "LP & swap flow");

/* ───────────── Diagram 0: full-system overview (the master board) ───────────── */
label(470, 24, "Maestro — Full System", 28, COLORS.ink);
label(440, 60, "Auction-managed AMM with an autonomous cross-chain pool manager", 15, COLORS.muted ?? COLORS.text);

// three chain swimlanes + a participants lane
frame(40, 100, 280, 660, "1 · Ethereum Sepolia  (origin)", COLORS.greenInk);
frame(360, 100, 320, 660, "2 · Reactive Lasna  (ReactVM)", COLORS.violetInk);
frame(720, 100, 520, 660, "3 · Unichain Sepolia  (destination)", COLORS.cyanInk);
frame(1280, 100, 250, 660, "Participants", COLORS.ink);

// origin
const oPyth = box(80, 320, 200, 110, "Pyth Oracle\nETH/USD price feed", COLORS.green, COLORS.greenInk);

// reactive
const oRsc = box(400, 300, 240, 130, "MaestroManagerRSC\nsubscribe + react()", COLORS.violet, COLORS.violetInk, 17);
label(404, 450, "decode the LIVE price →\nforward it cross-chain →\nrepositionToPrice", 12, COLORS.violetInk);

// destination
const oCb = box(760, 160, 250, 90, "ManagerCallback\nwins auction · repositionToPrice", COLORS.cyan, COLORS.cyanInk, 14);
const oHook = box(760, 310, 430, 160,
  "MaestroHook  (Uniswap v4)\n\n• Harberger auction engine\n• hook-owned liquidity vault\n• dynamic fee · OracleMath",
  COLORS.cyan, COLORS.cyanInk, 17);
const oPool = box(760, 540, 250, 100, "Uniswap v4 Pool", COLORS.gray, COLORS.ink);
const oMt0 = box(1050, 540, 140, 45, "WETH", COLORS.gray, COLORS.ink, 14);
const oMt1 = box(1050, 595, 140, 45, "USDC  (rent)", COLORS.gray, COLORS.ink, 12);

// participants
const oLp = box(1310, 190, 190, 80, "LPs", COLORS.green, COLORS.greenInk);
const oSwap = box(1310, 380, 190, 80, "Swappers", COLORS.amber, COLORS.amberInk);
const oBid = box(1310, 560, 190, 90, "Bidders /\nManagers", COLORS.violet, COLORS.violetInk);

// flows
arrow(oPyth, oRsc, "PriceFeedUpdate");
arrow(oRsc, oCb, "cross-chain callback");
arrow(oCb, oHook, "repositionToPrice");
arrow(oHook, oPool, "modifyLiquidity");
arrow(oPool, oMt1, "rent / fees");
arrow(oLp, oHook, "deposit · claimRent");
arrow(oBid, oHook, "bid() · K-delay");
arrow(oSwap, oPool, "swap · dynamic fee");
write("00-overview.excalidraw", "full-system overview");

/* ───────────── Diagram 4: the story (narrate this in the video) ───────────── */
label(700, 36, "Maestro — The Story", 32, COLORS.ink);
label(560, 86, "From impermanent loss to liquidity that manages itself  ·  narrate 1 → 7", 16, COLORS.muted);

const GAPX = 60, GAPY = 130;
const colX = (c) => 40 + c * (SCENE_W + GAPX);
const row1 = 150, row2 = row1 + SCENE_H + GAPY;

// Row 1 (left → right): the problem and the mechanism
const s1 = scene(colX(0), row1, 1, "The problem",
  "A liquidity pool sits still while the price moves. Arbitrageurs skim the gap (LVR) and LPs are left with impermanent loss. No one is steering the pool.",
  COLORS.red, COLORS.redInk);
const s2 = scene(colX(1), row1, 2, "The idea: am-AMM",
  "What if we SOLD the right to run the pool? A continuous auction picks a 'pool manager' — and the rent they pay flows straight to the LPs.",
  COLORS.cyan, COLORS.cyanInk);
const s3 = scene(colX(2), row1, 3, "The auction",
  "Anyone bids a per-block rent to become manager. Each bid must beat the last; the winner takes over after a 10-block delay, then pays rent every block until outbid.",
  COLORS.cyan, COLORS.cyanInk);
const s4 = scene(colX(3), row1, 4, "The manager's job",
  "The manager concentrates liquidity around the live price and sets the swap fee. Better placement -> more fees -> worth the rent. The arbitrageur now works for the LPs.",
  COLORS.cyan, COLORS.cyanInk);

// Row 2 (right → left): the novelty and the payoff
const s5 = scene(colX(3), row2, 5, "The twist",
  "But a human manager is slow and centralized. So Maestro makes the manager a SMART CONTRACT — autonomous, unstoppable, no keeper, no bot.",
  COLORS.violet, COLORS.violetInk);
const s6 = scene(colX(2), row2, 6, "The cross-chain brain",
  "A Pyth price update on Ethereum Sepolia wakes our Reactive contract on Lasna. It picks the new tick band and fires a cross-chain callback to Unichain, which repositions the pool — automatically.",
  COLORS.violet, COLORS.violetInk);
const s7 = scene(colX(1), row2, 7, "The result",
  "Liquidity that follows the price by itself. Arbitrage value recaptured as LP income. Two open am-AMM problems — concentrated liquidity + an autonomous manager — solved.",
  COLORS.green, COLORS.greenInk);

arrow(s1, s2, "");
arrow(s2, s3, "");
arrow(s3, s4, "");
arrow(s4, s5, "then…");
arrow(s5, s6, "");
arrow(s6, s7, "");

// closing banner in the empty bottom-left slot
const banner = base("rectangle", colX(0), row2 + 60, SCENE_W, SCENE_H - 120, {
  backgroundColor: COLORS.gray,
  strokeColor: COLORS.ink,
  strokeStyle: "dashed",
  strokeWidth: 2,
});
elements.push(banner);
label(colX(0) + 24, row2 + 86, wrap("One line: \"The pool runs itself, across chains — and LPs get paid the value that used to leak out.\"", 38), 16, COLORS.ink);
write("04-story.excalidraw", "narrated story");

/* ───────────── Diagram 5: internal hook architecture (how it works inside) ───────────── */
label(560, 30, "Maestro — Internal Hook Architecture", 30, COLORS.ink);
label(470, 72, "How the contracts work internally: callers → public API → engine → state → Uniswap v4", 15, COLORS.muted);

// top: cross-chain signal chain
const iPyth = box(300, 96, 300, 56, "Pyth @ Eth Sepolia", COLORS.green, COLORS.greenInk, 14);
const iRsc = box(640, 96, 300, 56, "MaestroManagerRSC @ Lasna", COLORS.violet, COLORS.violetInk, 13);
const iCb = box(980, 96, 340, 56, "ManagerCallback (Unichain, dest)", COLORS.cyan, COLORS.cyanInk, 13);

// callers
const iLp = box(340, 200, 250, 60, "LP", COLORS.green, COLORS.greenInk, 16);
const iMgr = box(700, 200, 290, 60, "Bidder / Manager", COLORS.violet, COLORS.violetInk, 15);

// public API (entry points)
const iLpApi = listBox(300, 300, 360, 150, "LP API", [
  "deposit(amt0, amt1) → mint shares",
  "withdraw(shares) → burn + return",
  "claimRent() → pay pending rent",
], COLORS.cyan, COLORS.cyanInk);
const iAuctApi = listBox(700, 300, 360, 150, "Auction API  (HarbergerAuction)", [
  "bid(rentRate, deposit)",
  "setFee(fee ≤ F_MAX) · topUp(amt)",
  "poke() · withdraw() refunds",
], COLORS.cyan, COLORS.cyanInk);
const iMgrApi = listBox(1100, 300, 360, 170, "Manager API", [
  "reposition(lower, upper)",
  "repositionToOracle(halfWidth)",
  "reads OracleMath + Pyth",
], COLORS.cyan, COLORS.cyanInk);

// hook callbacks (reference block on the right)
const iCbk = listBox(1520, 300, 380, 250, "Hook callbacks  (PoolManager → hook)", [
  "beforeInitialize: capture poolKey",
  "beforeAddLiquidity → REVERT",
  "beforeRemoveLiquidity → REVERT",
  "  (liquidity is hook-owned only)",
  "beforeSwap → _poke + fee override",
  "afterSwap → distribute rent to LPs",
], COLORS.gray, COLORS.ink);

// engine
const iPoke = listBox(300, 520, 560, 220, "_poke(id) — rent + auction engine", [
  "charge rent = rentRate × Δblocks",
  "→ lease.deposit −= rent",
  "→ totalRentCharged += rent",
  "→ rentPerShare += rent / Σshares  (if Σ>0)",
  "promote pending bid when block ≥ bid+K",
], COLORS.amber, COLORS.amberInk);
const iUnlock = listBox(900, 520, 560, 180, "unlockCallback  (poolManager.unlock)", [
  "mode: DEPOSIT / WITHDRAW / REPOSITION",
  "poolManager.modifyLiquidity(band, Δliq)",
  "settle() pays in · take() pulls out",
], COLORS.amber, COLORS.amberInk);

// state
const iVault = listBox(300, 780, 560, 200, "Vault state  (MaestroHook)", [
  "positionLiquidity · tickLower · tickUpper",
  "totalShares · sharesOf[addr]",
  "rentPerShare · rentDebt[addr]",
  "poolKey · initialized",
], COLORS.green, COLORS.greenInk);
const iAstate = listBox(900, 780, 560, 210, "Auction state — leases[poolId]", [
  "manager · rentRate · deposit · fee",
  "pendingBidder · pendingRent · pendingDeposit",
  "pendingActiveBlock (= bidBlock + K)",
  "accruedRent · totalRentCharged",
  "K = 10 · F_MAX = 5% · DEFAULT_FEE = 0.30%",
], COLORS.violet, COLORS.violetInk);

// external infra
const iOracle = box(300, 1030, 560, 90, "Pyth + OracleMath — price → sqrtPriceX96 → tick", COLORS.green, COLORS.greenInk, 14);
const iPm = box(900, 1030, 560, 90, "Uniswap v4 PoolManager (singleton)", COLORS.cyan, COLORS.cyanInk, 15);

// flows
arrow(iPyth, iRsc, "PriceFeedUpdate");
arrow(iRsc, iCb, "cross-chain callback");
arrow(iLp, iLpApi, "");
arrow(iMgr, iAuctApi, "");
arrow(iCb, iMgrApi, "repositionTo");
arrow(iCb, iAuctApi, "bid");
arrow(iLpApi, iPoke, "");
arrow(iAuctApi, iPoke, "");
arrow(iMgrApi, iUnlock, "");
arrow(iPoke, iVault, "rentPerShare");
arrow(iPoke, iAstate, "charge · promote");
arrow(iUnlock, iVault, "positionLiquidity");
arrow(iUnlock, iPm, "modifyLiquidity");
write("05-internals.excalidraw", "internal hook architecture");

console.log("\nAll diagrams written to docs/diagrams/");
