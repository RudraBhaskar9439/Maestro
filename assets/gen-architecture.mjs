// Generates assets/architecture.svg — the Maestro swimlane architecture (zoomable vector).
//   node assets/gen-architecture.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = dirname(fileURLToPath(import.meta.url));
const P = [];
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FONT = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";

function lane(x, y, w, h, title, fill, stroke, tcolor) {
  P.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`);
  P.push(`<text x="${x + w / 2}" y="${y + 30}" fill="${tcolor}" font-size="20" font-weight="700" text-anchor="middle">${esc(title)}</text>`);
}

function box(x, y, w, h, lines, fill, stroke, tcolor, fs = 13, weightFirst = false) {
  P.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`);
  const lh = fs * 1.45;
  const startY = y + h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((ln, i) => {
    const w0 = weightFirst && i === 0 ? ` font-weight="700"` : "";
    P.push(`<text x="${x + w / 2}" y="${startY + i * lh}" fill="${tcolor}" font-size="${fs}"${w0} text-anchor="middle" dominant-baseline="central">${esc(ln)}</text>`);
  });
}

function listBox(x, y, w, h, title, lines, fill, stroke, tcolor) {
  P.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>`);
  P.push(`<text x="${x + 16}" y="${y + 26}" fill="${tcolor}" font-size="15" font-weight="700">${esc(title)}</text>`);
  P.push(`<line x1="${x + 12}" y1="${y + 38}" x2="${x + w - 12}" y2="${y + 38}" stroke="${stroke}" stroke-width="1.2"/>`);
  let yy = y + 60;
  for (const ln of lines) {
    P.push(`<text x="${x + 16}" y="${yy}" fill="#212529" font-size="12.5">${esc(ln)}</text>`);
    yy += 22;
  }
}

function arrow(x1, y1, x2, y2, label, color = "#5a6270", labelDx = 0, labelDy = -6) {
  P.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2"/>`);
  const ang = Math.atan2(y2 - y1, x2 - x1), len = 11, s = 0.5;
  P.push(`<polyline points="${x2 - len * Math.cos(ang - s)},${y2 - len * Math.sin(ang - s)} ${x2},${y2} ${x2 - len * Math.cos(ang + s)},${y2 - len * Math.sin(ang + s)}" fill="none" stroke="${color}" stroke-width="2"/>`);
  if (label) {
    const mx = (x1 + x2) / 2 + labelDx, my = (y1 + y2) / 2 + labelDy;
    P.push(`<text x="${mx}" y="${my}" fill="${color}" font-size="11.5" text-anchor="middle">${esc(label)}</text>`);
  }
}

// ── canvas ──
const W = 1240, H = 940;
P.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">`);
P.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);
P.push(`<text x="${W / 2}" y="40" fill="#1e1e1e" font-size="24" font-weight="700" text-anchor="middle">Maestro — Autonomous Cross-Chain am-AMM</text>`);

// ── lanes ──
lane(30, 170, 250, 580, "FRONTEND", "#eafaf0", "#82b366", "#2e7d32");
lane(310, 70, 560, 820, "Unichain Sepolia", "#fde7e9", "#cc8a8a", "#c47d00");
lane(900, 240, 300, 560, "Reactive", "#dae8fc", "#6c8ebf", "#2e5fb0");
lane(900, 70, 300, 140, "Ethereum Sepolia (origin)", "#e9f7ef", "#82b366", "#2e7d32");

// ── frontend ──
box(55, 220, 200, 60, ["Landing + App", "(Next.js 16)"], "#d5e8d4", "#82b366", "#2e7d32");
box(55, 300, 200, 70, ["Live dashboard", "ETH/USD (Pyth) + band"], "#d5e8d4", "#82b366", "#2e7d32");
box(55, 390, 200, 70, ["LP actions", "deposit · withdraw · claim"], "#d5e8d4", "#82b366", "#2e7d32");
box(55, 480, 200, 70, ["Activity feed", "+ verify ↗ links"], "#d5e8d4", "#82b366", "#2e7d32");

// ── unichain ──
box(340, 120, 500, 70, ["MaestroHook events", "Deposit · BidPlaced · ManagerChanged · RentClaimed · Repositioned"], "#d5e8d4", "#82b366", "#2e7d32", 12.5, true);
listBox(340, 240, 500, 380, "MAESTRO HOOK   ·   WETH / USDC @ live ETH price", [
  "MaestroHook.sol  +  HarbergerAuction.sol",
  "",
  "• Hook-owned liquidity vault → LP shares",
  "• Harberger auction: bid → K=10 delay → manager",
  "      manager pays rent every block → LPs",
  "• repositionToPrice(price): band spans [spot, oracle]",
  "• beforeSwap: _poke charge rent + override fee (≤ 5%)",
  "• afterSwap: distribute rent to LP shares",
  "• before add / remove liquidity → REVERT (hook-owned)",
], "#fff2cc", "#d6b656", "#b8860b");
box(340, 680, 240, 90, ["ManagerCallback", "(cross-chain destination)", "wins auction · repositionToPrice"], "#d5e8d4", "#82b366", "#2e7d32", 12.5, true);
box(600, 680, 240, 90, ["Swappers / Arbitrageurs", "swap → spot tracks oracle", "LVR value → LP rent"], "#ffe6cc", "#d79b00", "#b35f00", 12.5, true);

// ── reactive ──
listBox(925, 300, 250, 190, "MaestroManagerRSC", [
  "subscribe:",
  "  Pyth PriceFeedUpdate",
  "react():",
  "  decode the LIVE price →",
  "  forward it cross-chain →",
  "  emit Callback(repositionToPrice)",
], "#d5e8d4", "#82b366", "#2e7d32");
box(925, 620, 250, 80, ["Callback proxy", "[ SYSTEM 0x…fffFfF ]"], "#d5e8d4", "#82b366", "#2e7d32");

// ── ethereum ──
box(925, 110, 250, 75, ["Pyth ETH/USD", "PriceFeedUpdate (live)"], "#d5e8d4", "#82b366", "#2e7d32", 13, true);

// ── arrows ──
arrow(1050, 185, 1050, 300, "PriceFeedUpdate (subscribed)", "#5a6270", 0, -8);
arrow(1050, 490, 1050, 620, "emit Callback", "#5a6270", 0, -8);
arrow(925, 660, 582, 722, "cross-chain callback → repositionToPrice", "#5a6270", -10, -10);
arrow(460, 680, 460, 622, "bid · repositionToPrice", "#5a6270", 0, -8);
arrow(720, 680, 720, 622, "swap → spot tracks oracle", "#d79b00", 0, -8);
arrow(255, 425, 340, 425, "deposit · read state", "#5a6270", 0, -10);
arrow(590, 240, 590, 192, "emits", "#5a6270", 24, -2);

P.push("</svg>");
writeFileSync(join(OUT, "architecture.svg"), P.join("\n"));
console.log("wrote assets/architecture.svg");
