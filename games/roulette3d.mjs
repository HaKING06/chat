"use strict";

import * as THREE from "../vendor/three/three.module.js";
import { OrbitControls } from "../vendor/three/OrbitControls.js";
import { GLTFLoader } from "../vendor/three/GLTFLoader.js";
import { MeshoptDecoder } from "../vendor/three/meshopt_decoder.module.js";
import {
  playRouletteBallTick,
  playRouletteChip,
  playRouletteDrop,
  playRouletteRemove,
  playRouletteSpin,
  playRouletteWin,
} from "./sfx.mjs";

export const WHEEL_ORDER = Object.freeze([
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
]);

const WHEEL_INDEX = new Map(WHEEL_ORDER.map((n, i) => [n, i]));

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

const CHIP_DENOMS = [10, 25, 50, 100, 500];
const CHIP_META = {
  10: { fill: "#2563eb", accent: "#eff6ff", label: "10" },
  25: { fill: "#16a34a", accent: "#f0fdf4", label: "25" },
  50: { fill: "#d97706", accent: "#fffbeb", label: "50" },
  100: { fill: "#18181b", accent: "#facc15", label: "100" },
  500: { fill: "#7c3aed", accent: "#faf5ff", label: "500" },
};

const TABLE_Y = 0.8;
const WHEEL_POS = new THREE.Vector3(-1.14, TABLE_Y + 0.015, 0.02);
const WHEEL_SCALE = 0.62;

// Felt rectangle in world XZ (right two-thirds of table)
const FELT_X0 = -0.4;
const FELT_X1 = 1.66;
const FELT_Z0 = -0.49;
const FELT_Z1 = 0.49;
const FELT_W = FELT_X1 - FELT_X0;
const FELT_D = FELT_Z1 - FELT_Z0;
const FELT_CX = (FELT_X0 + FELT_X1) * 0.5;
const FELT_CZ = (FELT_Z0 + FELT_Z1) * 0.5;

// Normalized UV grid regions inside felt [0..1] x [0..1]
// u = 0..1 maps FELT_X0..FELT_X1 ; vTop = 0..1 maps FELT_Z0..FELT_Z1 (canvas y)
const U_ZERO_END = 0.085;
const U_GRID_END = 0.915;
const U_COL_END = 1.0;
const V_NUM_END = 0.6;
const V_DOZ_END = 0.8;
const V_OUT_END = 1.0;

function numColor(n) {
  if (n === 0) return "green";
  return RED_NUMBERS.has(n) ? "red" : "black";
}

function numBgHex(n) {
  const c = numColor(n);
  if (c === "green") return "#0d9448";
  if (c === "red") return "#c81e2b";
  return "#151922";
}

function getSpotCoveredNumbers(key) {
  if (!key) return [];
  if (key === "red") return [...RED_NUMBERS];
  if (key === "black") {
    const out = [];
    for (let n = 1; n <= 36; n += 1) if (!RED_NUMBERS.has(n)) out.push(n);
    return out;
  }
  if (key === "even") return Array.from({ length: 18 }, (_, i) => (i + 1) * 2);
  if (key === "odd") return Array.from({ length: 18 }, (_, i) => i * 2 + 1);
  if (key === "low") return Array.from({ length: 18 }, (_, i) => i + 1);
  if (key === "high") return Array.from({ length: 18 }, (_, i) => i + 19);
  const [prefix, body] = key.split(":");
  if (prefix === "straight") return [Number(body)];
  if (prefix === "dozen") {
    const d = Number(body);
    return Array.from({ length: 12 }, (_, i) => (d - 1) * 12 + 1 + i);
  }
  if (prefix === "col") {
    const c = Number(body);
    const rem = c === 3 ? 0 : c;
    const out = [];
    for (let n = 1; n <= 36; n += 1) if (n % 3 === rem) out.push(n);
    return out;
  }
  if (body) return body.split("-").map(Number).filter(Number.isFinite);
  return [];
}

function getSpotFeltUV(key) {
  const colW = (U_GRID_END - U_ZERO_END) / 12;
  const rowH = V_NUM_END / 3;
  const numCellUV = (n) => {
    if (n === 0) return { u: U_ZERO_END * 0.5, v: V_NUM_END * 0.5 };
    const col = Math.floor((n - 1) / 3); // 0..11
    const rFromBottom = (n - 1) % 3; // 0->row3(bottom), 1->middle, 2->top
    const row = 2 - rFromBottom; // canvas top=0..2
    return {
      u: U_ZERO_END + (col + 0.5) * colW,
      v: (row + 0.5) * rowH,
    };
  };

  if (key === "red") return { u: U_ZERO_END + (U_GRID_END - U_ZERO_END) * (2.5 / 6), v: 0.9 };
  if (key === "black") return { u: U_ZERO_END + (U_GRID_END - U_ZERO_END) * (3.5 / 6), v: 0.9 };
  if (key === "low") return { u: U_ZERO_END + (U_GRID_END - U_ZERO_END) * (0.5 / 6), v: 0.9 };
  if (key === "even") return { u: U_ZERO_END + (U_GRID_END - U_ZERO_END) * (1.5 / 6), v: 0.9 };
  if (key === "odd") return { u: U_ZERO_END + (U_GRID_END - U_ZERO_END) * (4.5 / 6), v: 0.9 };
  if (key === "high") return { u: U_ZERO_END + (U_GRID_END - U_ZERO_END) * (5.5 / 6), v: 0.9 };

  const [prefix, body] = key.split(":");
  if (prefix === "dozen") {
    const d = Number(body);
    return {
      u: U_ZERO_END + ((d - 0.5) / 3) * (U_GRID_END - U_ZERO_END),
      v: (V_NUM_END + V_DOZ_END) * 0.5,
    };
  }
  if (prefix === "col") {
    const c = Number(body); // col 3 top (row 0), col 2 mid (row 1), col 1 bottom (row 2)
    const row = 3 - c;
    return {
      u: (U_GRID_END + U_COL_END) * 0.5,
      v: (row + 0.5) * rowH,
    };
  }
  if (prefix === "straight") {
    return numCellUV(Number(body));
  }
  if (prefix === "street") {
    const nums = body.split("-").map(Number);
    const col = Math.floor((nums[0] - 1) / 3);
    return { u: U_ZERO_END + (col + 0.5) * colW, v: V_NUM_END };
  }
  if (prefix === "trio") {
    const nums = body.split("-").map(Number);
    const vPos = nums.includes(1) ? 2 * rowH : rowH;
    return { u: U_ZERO_END, v: vPos };
  }
  if (prefix === "sixline") {
    const nums = body.split("-").map(Number);
    const colL = Math.floor((nums[0] - 1) / 3);
    return { u: U_ZERO_END + (colL + 1) * colW, v: V_NUM_END };
  }
  if (prefix === "corner") {
    const nums = body.split("-").map(Number);
    if (nums[0] === 0) return { u: U_ZERO_END, v: V_NUM_END };
    const colL = Math.floor((nums[0] - 1) / 3);
    const rLow = (nums[0] - 1) % 3; // 0 or 1
    const vBoundary = rLow === 0 ? 2 * rowH : rowH;
    return { u: U_ZERO_END + (colL + 1) * colW, v: vBoundary };
  }
  if (prefix === "split") {
    const [a, b] = body.split("-").map(Number);
    if (a === 0) {
      const p = numCellUV(b);
      return { u: U_ZERO_END, v: p.v };
    }
    const pa = numCellUV(a);
    const pb = numCellUV(b);
    return { u: (pa.u + pb.u) * 0.5, v: (pa.v + pb.v) * 0.5 };
  }
  return { u: 0.5, v: 0.5 };
}

function feltUVToWorld(u, v) {
  return new THREE.Vector3(
    FELT_X0 + u * FELT_W,
    TABLE_Y + 0.004,
    FELT_Z0 + v * FELT_D,
  );
}

function hitTestFeltUV(u, v) {
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;

  // Outside bets
  if (v > V_DOZ_END) {
    if (u < U_ZERO_END || u > U_GRID_END) return null;
    const norm = (u - U_ZERO_END) / (U_GRID_END - U_ZERO_END);
    const slot = Math.min(5, Math.max(0, Math.floor(norm * 6)));
    return ["low", "even", "red", "black", "odd", "high"][slot];
  }
  // Dozens
  if (v > V_NUM_END) {
    if (u < U_ZERO_END || u > U_GRID_END) return null;
    const norm = (u - U_ZERO_END) / (U_GRID_END - U_ZERO_END);
    const d = Math.min(3, Math.max(1, Math.floor(norm * 3) + 1));
    return `dozen:${d}`;
  }
  // Column 2:1
  if (u > U_GRID_END) {
    const row = Math.min(2, Math.max(0, Math.floor((v / V_NUM_END) * 3)));
    const colNum = 3 - row;
    return `col:${colNum}`;
  }

  const colW = (U_GRID_END - U_ZERO_END) / 12;
  const rowH = V_NUM_END / 3;
  const edgeU = colW * 0.22;
  const edgeV = rowH * 0.22;

  // Zero + borders with 1,2,3
  if (u < U_ZERO_END - edgeU * 0.7) {
    return "straight:0";
  }
  if (u < U_ZERO_END + edgeU * 0.9) {
    if (v > V_NUM_END - edgeV) return "corner:0-1-2-3";
    if (Math.abs(v - 2 * rowH) < edgeV) return "trio:0-1-2";
    if (Math.abs(v - rowH) < edgeV) return "trio:0-2-3";
    const row = Math.min(2, Math.max(0, Math.floor(v / rowH)));
    const targetNum = 3 - row;
    return `split:0-${targetNum}`;
  }

  // Number grid 1..36 with split / corner / street / sixline edges
  const gx = (u - U_ZERO_END) / colW;
  const gy = v / rowH;
  const col = Math.min(11, Math.max(0, Math.floor(gx)));
  const row = Math.min(2, Math.max(0, Math.floor(gy)));
  const fx = gx - col;
  const fy = gy - row;

  const numAt = (c, r) => c * 3 + (3 - r);
  const curNum = numAt(col, row);

  const nearLeft = fx < 0.2 && col > 0;
  const nearRight = fx > 0.8 && col < 11;
  const nearTop = fy < 0.2 && row > 0;
  const nearBottom = fy > 0.8 && row < 2;
  const nearBottomGrid = row === 2 && fy > 0.84;

  // Six-line or Street at bottom edge of grid
  if (nearBottomGrid) {
    if (nearLeft) {
      const s = (col - 1) * 3 + 1;
      return `sixline:${s}-${s + 5}`;
    }
    if (nearRight) {
      const s = col * 3 + 1;
      return `sixline:${s}-${s + 5}`;
    }
    const s = col * 3 + 1;
    return `street:${s}-${s + 1}-${s + 2}`;
  }

  // Corners (4-way intersections)
  if ((nearLeft || nearRight) && (nearTop || nearBottom)) {
    const leftCol = nearLeft ? col - 1 : col;
    const topRow = nearTop ? row - 1 : row;
    const nums = [
      numAt(leftCol, topRow),
      numAt(leftCol, topRow + 1),
      numAt(leftCol + 1, topRow),
      numAt(leftCol + 1, topRow + 1),
    ].sort((a, b) => a - b);
    return `corner:${nums.join("-")}`;
  }

  // Vertical & Horizontal Splits
  if (nearLeft) {
    const other = numAt(col - 1, row);
    return `split:${Math.min(curNum, other)}-${Math.max(curNum, other)}`;
  }
  if (nearRight) {
    const other = numAt(col + 1, row);
    return `split:${Math.min(curNum, other)}-${Math.max(curNum, other)}`;
  }
  if (nearTop) {
    const other = numAt(col, row - 1);
    return `split:${Math.min(curNum, other)}-${Math.max(curNum, other)}`;
  }
  if (nearBottom) {
    const other = numAt(col, row + 1);
    return `split:${Math.min(curNum, other)}-${Math.max(curNum, other)}`;
  }

  return `straight:${curNum}`;
}

function createWheelRingTexture() {
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const cx = size * 0.5;
  const cy = size * 0.5;
  const outerR = size * 0.5;

  // Map normalized canvas radius proportional to RingGeometry(0.382, 0.552)
  const rInner = 0.382;
  const rOuter = 0.552;
  const rPocketEnd = 0.49;
  const rToPx = (rWorld) => (rWorld / rOuter) * outerR;

  ctx.clearRect(0, 0, size, size);

  const step = (Math.PI * 2) / 37;
  for (let i = 0; i < 37; i += 1) {
    const num = WHEEL_ORDER[i];
    const ang = (i / 37) * Math.PI * 2;
    const a0 = ang - step * 0.5;
    const a1 = ang + step * 0.5;
    const col = numBgHex(num);

    // Inner pocket well color
    ctx.beginPath();
    ctx.arc(cx, cy, rToPx(rPocketEnd), a0, a1);
    ctx.arc(cx, cy, rToPx(rInner), a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = num === 0 ? "#0f9f4f" : col === "#c81e2b" ? "#991b1b" : "#0b0d12";
    ctx.fill();

    // Outer number ring cell
    ctx.beginPath();
    ctx.arc(cx, cy, rToPx(rOuter), a0, a1);
    ctx.arc(cx, cy, rToPx(rPocketEnd), a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#d9af52";
    ctx.stroke();

    // Radial number label
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.fillStyle = "#fcf7e3";
    ctx.font = "800 22px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const textR = rToPx((rPocketEnd + rOuter) * 0.51);
    ctx.translate(textR, 0);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(String(num), 0, 0);
    ctx.restore();
  }

  // Gold circular rims
  for (const rw of [rInner + 0.002, rPocketEnd, rOuter - 0.002]) {
    ctx.beginPath();
    ctx.arc(cx, cy, rToPx(rw), 0, Math.PI * 2);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "#e6be60";
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createRouletteFeltTexture() {
  const W = 2048;
  const H = 1024;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");

  // Subtle casino baize gradient
  const grad = ctx.createRadialGradient(W * 0.5, H * 0.45, 60, W * 0.5, H * 0.5, W * 0.72);
  grad.addColorStop(0, "#106b42");
  grad.addColorStop(0.65, "#0b5434");
  grad.addColorStop(1, "#073b24");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Micro fabric grain
  ctx.fillStyle = "rgba(255,255,255,0.018)";
  for (let i = 0; i < 3200; i += 1) {
    ctx.fillRect((i * 73) % W, (i * 139) % H, 2, 2);
  }

  const xZero = U_ZERO_END * W;
  const xGridEnd = U_GRID_END * W;
  const yNumEnd = V_NUM_END * H;
  const yDozEnd = V_DOZ_END * H;
  const colW = (xGridEnd - xZero) / 12;
  const rowH = yNumEnd / 3;

  ctx.lineWidth = 4;
  ctx.strokeStyle = "#e4bf68";

  // 0 cell
  ctx.fillStyle = "#0e8a45";
  ctx.beginPath();
  ctx.moveTo(xZero, 6);
  ctx.lineTo(18, 6);
  ctx.quadraticCurveTo(6, yNumEnd * 0.5, 18, yNumEnd);
  ctx.lineTo(xZero, yNumEnd);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fffdf4";
  ctx.font = "900 72px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("0", xZero * 0.52, yNumEnd * 0.5);

  // Numbers 1..36
  for (let col = 0; col < 12; col += 1) {
    for (let row = 0; row < 3; row += 1) {
      const n = col * 3 + (3 - row);
      const rx = xZero + col * colW;
      const ry = row * rowH;

      ctx.fillStyle = "rgba(8, 56, 33, 0.55)";
      ctx.fillRect(rx, ry, colW, rowH);
      ctx.strokeRect(rx, ry, colW, rowH);

      // Oval casino medallion
      ctx.beginPath();
      ctx.ellipse(rx + colW * 0.5, ry + rowH * 0.5, colW * 0.36, rowH * 0.38, 0, 0, Math.PI * 2);
      ctx.fillStyle = RED_NUMBERS.has(n) ? "#be1e2d" : "#14171f";
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "rgba(232,198,112,0.72)";
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#e4bf68";

      ctx.fillStyle = "#fbf7ec";
      ctx.font = "800 52px system-ui, sans-serif";
      ctx.fillText(String(n), rx + colW * 0.5, ry + rowH * 0.52);
    }
  }

  // 2:1 Columns
  const colRectW = W - xGridEnd - 6;
  for (let row = 0; row < 3; row += 1) {
    const ry = row * rowH;
    ctx.fillStyle = "rgba(10, 52, 34, 0.72)";
    ctx.fillRect(xGridEnd, ry, colRectW, rowH);
    ctx.strokeRect(xGridEnd, ry, colRectW, rowH);
    ctx.fillStyle = "#f4df9e";
    ctx.font = "800 42px system-ui, sans-serif";
    ctx.fillText("2:1", xGridEnd + colRectW * 0.5, ry + rowH * 0.5);
  }

  // Dozens row
  const dozW = (xGridEnd - xZero) / 3;
  const dozLabels = ["1. DÜZİNE (1–12)", "2. DÜZİNE (13–24)", "3. DÜZİNE (25–36)"];
  for (let d = 0; d < 3; d += 1) {
    const dx = xZero + d * dozW;
    ctx.fillStyle = "rgba(9, 60, 38, 0.72)";
    ctx.fillRect(dx, yNumEnd, dozW, yDozEnd - yNumEnd);
    ctx.strokeRect(dx, yNumEnd, dozW, yDozEnd - yNumEnd);
    ctx.fillStyle = "#fbf7ec";
    ctx.font = "800 38px system-ui, sans-serif";
    ctx.fillText(dozLabels[d], dx + dozW * 0.5, (yNumEnd + yDozEnd) * 0.52);
  }

  // Bottom outside boxes
  const outW = (xGridEnd - xZero) / 6;
  const outs = [
    { label: "1 – 18", bg: "rgba(9, 60, 38, 0.72)" },
    { label: "ÇİFT", bg: "rgba(9, 60, 38, 0.72)" },
    { label: "♦ KIRMIZI", bg: "#a61b26" },
    { label: "♦ SİYAH", bg: "#14171f" },
    { label: "TEK", bg: "rgba(9, 60, 38, 0.72)" },
    { label: "19 – 36", bg: "rgba(9, 60, 38, 0.72)" },
  ];
  outs.forEach((o, i) => {
    const ox = xZero + i * outW;
    ctx.fillStyle = o.bg;
    ctx.fillRect(ox, yDozEnd, outW, H - yDozEnd - 6);
    ctx.strokeRect(ox, yDozEnd, outW, H - yDozEnd - 6);
    ctx.fillStyle = "#fbf7ec";
    ctx.font = "800 32px system-ui, sans-serif";
    ctx.fillText(o.label, ox + outW * 0.5, (yDozEnd + H) * 0.5);
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export class RouletteArena {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.cb = callbacks;
    this.table = null;
    this.mySocketId = null;
    this.isSpectator = false;
    this.selectedChip = 25;
    this.eraseMode = false;
    this.cameraMode = "genis";
    this.force2D = false;
    this.webglFailed = false;
    this.disposed = false;
    this.activeTab = "masa"; // masa | racetrack | feed
    this.neighborsRadius = 2;
    this.hoveredSpot = null;
    this.lastRoundSound = 0;
    this.lastPhase = "";
    this.lastFeedId = "";
    this.lastTickBucket = -1;
    this.didDropSfx = false;
    this.rafId = null;
    this.countdownTimer = null;
    this.clock = new THREE.Clock();
    this.rotorYaw = 0;
    this.chipStacks = [];
    this.chipFlights = [];
    this._labelTextures = new Map();
    this.dealerRig = null;
    this.dealPulseUntil = 0;
    this.celebrateUntil = 0;
    this.dollyTarget = null;
    this.hoverMeshes = [];

    this._buildDom();
    this._init3D();
    this._startLoop();
  }

  _buildDom() {
    this.container.innerHTML = "";
    this.root = document.createElement("div");
    this.root.className = "roulette-arena";

    const topbar = document.createElement("div");
    topbar.className = "roulette-topbar";
    topbar.innerHTML = `
      <div class="roulette-top-left">
        <span class="rl-phase-pill" data-el="phase-pill">Hazırlanıyor</span>
        <span class="rl-timer-pill" data-el="timer-pill">--s</span>
        <span class="rl-meta-pill" data-el="table-name">Rulet Masası</span>
        <span class="rl-bank-pill" data-el="bank-pill">💰 1.000 Fiş</span>
        <button type="button" class="button small primary rl-rebuy-btn" data-act="rebuy" hidden>+500 Fiş Al</button>
      </div>
      <div class="rl-history-strip" data-el="history-strip" aria-label="Son turlar"></div>
      <div class="roulette-top-actions">
        <div class="rl-cam-group" role="group" aria-label="Kamera açıları">
          <button type="button" class="rl-cam-btn active" data-cam="genis">Geniş</button>
          <button type="button" class="rl-cam-btn" data-cam="cark">Çark</button>
          <button type="button" class="rl-cam-btn" data-cam="masa">Masa</button>
          <button type="button" class="rl-cam-btn" data-cam="ustten">Üstten</button>
        </div>
        <button type="button" class="button small secondary" data-act="toggle-2d">2D</button>
        <button type="button" class="button small secondary" data-act="spectate-toggle" hidden>İzle 👁</button>
        <button type="button" class="button small secondary" data-act="help">? Kurallar</button>
        <button type="button" class="button small secondary" data-act="leave">Çık</button>
      </div>
      <div class="rl-cycle-bar" title="Her 60 saniyede bir otomatik çark turu">
        <span class="rl-cycle-fill" data-el="cycle-fill"></span>
      </div>
    `;

    const mainWrap = document.createElement("div");
    mainWrap.className = "roulette-main";

    const stage = document.createElement("div");
    stage.className = "roulette-stage";
    stage.innerHTML = `
      <canvas class="rl-canvas-3d" data-el="canvas3d"></canvas>
      <canvas class="rl-canvas-2d" data-el="canvas2d" hidden></canvas>
      <div class="rl-stage-hud">
        <div class="rl-win-banner" data-el="win-banner" hidden></div>
        <div class="rl-hint-pill">🖱 Sol Tık: Bahis Ekle · Sağ Tık: O Yerdeki Paranı Kaldır</div>
        <div class="rl-hover-chip" data-el="hover-chip" hidden></div>
      </div>
    `;

    const sideDock = document.createElement("aside");
    sideDock.className = "roulette-side";
    sideDock.innerHTML = `
      <div class="rl-side-section rl-hotcold-box" data-el="hotcold-box"></div>
      <div class="rl-side-section">
        <div class="rl-side-head">
          <strong>🪑 Masadaki Oyuncular</strong>
          <span class="rl-side-sub" data-el="pot-pill">Toplam: 0 Fiş</span>
        </div>
        <div class="rl-seats-list" data-el="seats-list"></div>
        <div class="rl-react-strip" role="group" aria-label="Masa tepkileri">
          <button type="button" class="rl-react-btn" data-react="🔥">🔥</button>
          <button type="button" class="rl-react-btn" data-react="👏">👏</button>
          <button type="button" class="rl-react-btn" data-react="😎">😎</button>
          <button type="button" class="rl-react-btn" data-react="🍀">🍀</button>
          <button type="button" class="rl-react-btn" data-react="💎">💎</button>
          <button type="button" class="rl-react-btn" data-react="😱">😱</button>
        </div>
      </div>
      <div class="rl-side-section rl-feed-section">
        <div class="rl-side-head">
          <strong>💎 Canlı Masa Bahisleri</strong>
          <span class="rl-side-sub" data-el="spec-pill"></span>
        </div>
        <div class="rl-feed-list" data-el="feed-list"></div>
      </div>
    `;

    mainWrap.append(stage, sideDock);

    const dock = document.createElement("section");
    dock.className = "roulette-dock";
    dock.innerHTML = `
      <div class="rl-dock-toolbar">
        <div class="rl-rack-wrap">
          <div class="rl-chip-rack" data-el="chip-rack"></div>
          <button type="button" class="rl-erase-btn" data-act="toggle-erase" title="Açıkken tıkladığın noktadaki kendi bahsini kaldırır (PC'de sağ tık her zaman kaldırır)">🧹 Kaldır</button>
        </div>
        <div class="rl-dock-tabs">
          <button type="button" class="rl-tab-btn active" data-tab="masa">🎯 Masa Düzeni</button>
          <button type="button" class="rl-tab-btn" data-tab="racetrack">🏁 RaceTrack &amp; Komşular</button>
          <button type="button" class="rl-tab-btn rl-tab-feed" data-tab="feed">💎 Bahisler &amp; Analiz</button>
        </div>
        <div class="rl-quick-actions">
          <button type="button" class="button small secondary" data-act="undo" title="Son koyulan bahsi geri al">↩ Geri Al</button>
          <button type="button" class="button small secondary" data-act="clear" title="Tüm bahislerini kaldır">✕ Temizle</button>
          <button type="button" class="button small secondary" data-act="rebet" title="Önceki turu tekrarla">↻ Tekrarla</button>
          <button type="button" class="button small secondary" data-act="halve" title="Tüm bahisleri yarıya düşür">½</button>
          <button type="button" class="button small primary" data-act="double" title="Bahisleri 2x katla">×2</button>
        </div>
      </div>
      <div class="rl-panel-masa" data-el="panel-masa"></div>
      <div class="rl-panel-racetrack" data-el="panel-racetrack" hidden></div>
      <div class="rl-panel-mobile-feed" data-el="panel-mobile-feed" hidden></div>
    `;

    this.root.append(topbar, mainWrap, dock);
    this.container.append(this.root);

    this.els = {};
    this.root.querySelectorAll("[data-el]").forEach((n) => {
      this.els[n.dataset.el] = n;
    });

    this._renderChipRack();
    this._render2DBettingBoard();
    this._renderRaceTrack();
    this._bindEvents();
  }

  _renderChipRack() {
    const rack = this.els["chip-rack"];
    rack.innerHTML = "";
    for (const denom of CHIP_DENOMS) {
      const m = CHIP_META[denom];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `rl-chip-btn ${!this.eraseMode && this.selectedChip === denom ? "active" : ""}`;
      btn.dataset.chip = String(denom);
      btn.style.setProperty("--chip-bg", m.fill);
      btn.style.setProperty("--chip-accent", m.accent);
      btn.innerHTML = `<span>${m.label}</span>`;
      btn.title = `${denom} Fiş`;
      rack.append(btn);
    }
    const eraseBtn = this.root.querySelector('[data-act="toggle-erase"]');
    if (eraseBtn) {
      eraseBtn.classList.toggle("active", this.eraseMode);
      eraseBtn.setAttribute("aria-pressed", String(this.eraseMode));
    }
  }

  _render2DBettingBoard() {
    const wrap = this.els["panel-masa"];
    wrap.innerHTML = "";

    const board = document.createElement("div");
    board.className = "rl-felt-2d";

    const topGrid = document.createElement("div");
    topGrid.className = "rl-felt-main-row";

    // Zero + Basket/Trio bar
    const zeroCol = document.createElement("div");
    zeroCol.className = "rl-zero-col";
    const zeroBtn = this._makeSpotBtn("straight:0", "0", "rl-cell rl-cell-zero green");
    const ffBtn = this._makeSpotBtn("corner:0-1-2-3", "0-3", "rl-split-mini");
    ffBtn.title = "İlk Dörtlü (0-1-2-3) · 8:1";
    zeroCol.append(zeroBtn, ffBtn);
    topGrid.append(zeroCol);

    // 3x12 Number cells with corner & street triggers
    const numsGrid = document.createElement("div");
    numsGrid.className = "rl-nums-grid";
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 12; col += 1) {
        const n = col * 3 + (3 - row);
        const colorCls = RED_NUMBERS.has(n) ? "red" : "black";
        const cellWrap = document.createElement("div");
        cellWrap.className = "rl-num-wrap";
        const btn = this._makeSpotBtn(`straight:${n}`, String(n), `rl-cell rl-cell-num ${colorCls}`);
        cellWrap.append(btn);

        if (col < 11) {
          const splitH = this._makeSpotBtn(`split:${n}-${n + 3}`, "", "rl-hot-split-h");
          splitH.title = `Split ${n}/${n + 3} (17:1)`;
          cellWrap.append(splitH);
        }
        if (row < 2) {
          const splitV = this._makeSpotBtn(`split:${n - 1}-${n}`, "", "rl-hot-split-v");
          splitV.title = `Split ${n - 1}/${n} (17:1)`;
          cellWrap.append(splitV);
        }
        if (col < 11 && row < 2) {
          const base = n - 1;
          const cornerKey = `corner:${base}-${base + 1}-${base + 3}-${base + 4}`;
          const cornerHot = this._makeSpotBtn(cornerKey, "", "rl-hot-corner");
          cornerHot.title = `Köşe ${base}/${base + 1}/${base + 3}/${base + 4} (8:1)`;
          cellWrap.append(cornerHot);
        }
        if (row === 2) {
          const s = col * 3 + 1;
          const streetHot = this._makeSpotBtn(`street:${s}-${s + 1}-${s + 2}`, "", "rl-hot-street");
          streetHot.title = `Sıra ${s}–${s + 2} (11:1)`;
          cellWrap.append(streetHot);
          if (col < 11) {
            const sixHot = this._makeSpotBtn(`sixline:${s}-${s + 5}`, "", "rl-hot-sixline");
            sixHot.title = `Altılı ${s}–${s + 5} (5:1)`;
            cellWrap.append(sixHot);
          }
        }
        numsGrid.append(cellWrap);
      }
    }
    topGrid.append(numsGrid);

    const colBtns = document.createElement("div");
    colBtns.className = "rl-cols-bar";
    for (const c of [3, 2, 1]) {
      const b = this._makeSpotBtn(`col:${c}`, "2:1", "rl-cell rl-cell-col");
      b.title = `${c}. Sütun (2:1)`;
      colBtns.append(b);
    }
    topGrid.append(colBtns);

    const dozRow = document.createElement("div");
    dozRow.className = "rl-dozens-row";
    dozRow.append(
      this._makeSpotBtn("dozen:1", "1. Düzine (1–12)", "rl-cell rl-cell-outside"),
      this._makeSpotBtn("dozen:2", "2. Düzine (13–24)", "rl-cell rl-cell-outside"),
      this._makeSpotBtn("dozen:3", "3. Düzine (25–36)", "rl-cell rl-cell-outside"),
    );

    const outRow = document.createElement("div");
    outRow.className = "rl-outside-row";
    outRow.append(
      this._makeSpotBtn("low", "1–18", "rl-cell rl-cell-outside"),
      this._makeSpotBtn("even", "ÇİFT", "rl-cell rl-cell-outside"),
      this._makeSpotBtn("red", "♦ KIRMIZI", "rl-cell rl-cell-outside red"),
      this._makeSpotBtn("black", "♦ SİYAH", "rl-cell rl-cell-outside black"),
      this._makeSpotBtn("odd", "TEK", "rl-cell rl-cell-outside"),
      this._makeSpotBtn("high", "19–36", "rl-cell rl-cell-outside"),
    );

    board.append(topGrid, dozRow, outRow);
    wrap.append(board);
    this.spotButtons = Array.from(board.querySelectorAll("[data-bet-key]"));
  }

  _makeSpotBtn(key, label, cls) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.dataset.betKey = key;
    b.innerHTML = `<span class="rl-lbl">${label}</span><span class="rl-spot-badges"></span>`;
    return b;
  }

  _renderRaceTrack() {
    const rt = this.els["panel-racetrack"];
    rt.innerHTML = `
      <div class="rl-racetrack-top">
        <div class="rl-french-calls">
          <button type="button" class="rl-call-btn" data-call="tiers"><strong>Tiers du Cylindre</strong><small>6 Çip · Split</small></button>
          <button type="button" class="rl-call-btn" data-call="orphelins"><strong>Orphelins</strong><small>5 Çip · Karışık</small></button>
          <button type="button" class="rl-call-btn" data-call="voisins"><strong>Voisins du Zéro</strong><small>9 Çip · Sektör</small></button>
          <button type="button" class="rl-call-btn" data-call="jeu0"><strong>Jeu Zéro</strong><small>4 Çip · 0 Etrafı</small></button>
        </div>
        <div class="rl-neighbor-ctrl">
          <span>Komşular:</span>
          <button type="button" class="rl-rad-btn active" data-radius="2">±2 (5 sayı)</button>
          <button type="button" class="rl-rad-btn" data-radius="1">±1 (3 sayı)</button>
          <button type="button" class="rl-rad-btn" data-radius="3">±3 (7 sayı)</button>
        </div>
      </div>
      <div class="rl-wheel-strip" data-el="wheel-strip"></div>
    `;
    const strip = rt.querySelector('[data-el="wheel-strip"]');
    for (const num of WHEEL_ORDER) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `rl-strip-num ${numColor(num)}`;
      btn.dataset.neighborNum = String(num);
      btn.textContent = String(num);
      btn.title = `${num} ve ±${this.neighborsRadius} komşuları`;
      strip.append(btn);
    }
  }

  _bindEvents() {
    this.root.addEventListener("click", (e) => {
      const camBtn = e.target.closest("[data-cam]");
      if (camBtn) {
        this.setCameraMode(camBtn.dataset.cam);
        return;
      }
      const chipBtn = e.target.closest("[data-chip]");
      if (chipBtn) {
        this.selectedChip = Number(chipBtn.dataset.chip) || 25;
        this.eraseMode = false;
        this._renderChipRack();
        return;
      }
      const reactBtn = e.target.closest("[data-react]");
      if (reactBtn) {
        this.cb.onReact?.(reactBtn.dataset.react);
        return;
      }
      const tabBtn = e.target.closest("[data-tab]");
      if (tabBtn) {
        this.activeTab = tabBtn.dataset.tab;
        this.root.querySelectorAll("[data-tab]").forEach((t) => {
          t.classList.toggle("active", t.dataset.tab === this.activeTab);
        });
        this.els["panel-masa"].hidden = this.activeTab !== "masa";
        this.els["panel-racetrack"].hidden = this.activeTab !== "racetrack";
        this.els["panel-mobile-feed"].hidden = this.activeTab !== "feed";
        return;
      }
      const callBtn = e.target.closest("[data-call]");
      if (callBtn) {
        this._placeCallBet(callBtn.dataset.call);
        return;
      }
      const radBtn = e.target.closest("[data-radius]");
      if (radBtn) {
        this.neighborsRadius = Number(radBtn.dataset.radius) || 2;
        this.root.querySelectorAll("[data-radius]").forEach((r) => {
          r.classList.toggle("active", Number(r.dataset.radius) === this.neighborsRadius);
        });
        return;
      }
      const nbBtn = e.target.closest("[data-neighbor-num]");
      if (nbBtn) {
        this._placeNeighbors(Number(nbBtn.dataset.neighborNum));
        return;
      }
      const betBtn = e.target.closest("[data-bet-key]");
      if (betBtn) {
        if (this.eraseMode) this._removeSingleSpot(betBtn.dataset.betKey);
        else this._placeSingleBet(betBtn.dataset.betKey);
        return;
      }
      const actBtn = e.target.closest("[data-act]");
      if (actBtn) {
        const act = actBtn.dataset.act;
        if (act === "leave") this.cb.onLeave?.();
        else if (act === "help") this.cb.onHelp?.();
        else if (act === "undo") this.cb.onUndo?.();
        else if (act === "clear") this.cb.onClear?.();
        else if (act === "rebet") this.cb.onRebet?.();
        else if (act === "halve") this.cb.onHalve?.();
        else if (act === "double") this.cb.onDouble?.();
        else if (act === "rebuy") this.cb.onRebuy?.();
        else if (act === "toggle-erase") {
            this.eraseMode = !this.eraseMode;
            this.root.classList.toggle("is-erase-mode", this.eraseMode);
            this._renderChipRack();
          } else if (act === "spectate-toggle") {
            this.cb.onSpectateToggle?.(!this.isSpectator);
          } else if (act === "toggle-2d") {
            this.force2D = !this.force2D;
            actBtn.textContent = this.force2D ? "3D" : "2D";
            this._syncCanvasVisibility();
          }
        }
      });

    // Right-click removes the player's placed bet from that exact spot (on both 2D table & 3D felt!)
    this.root.addEventListener("contextmenu", (e) => {
      const betBtn = e.target.closest("[data-bet-key]");
      if (betBtn) {
        e.preventDefault();
        this._removeSingleSpot(betBtn.dataset.betKey);
        return;
      }
      if (e.target.closest(".rl-canvas-3d")) {
        e.preventDefault();
      }
    });

    // Hover highlight from 2D felt to 3D felt!
    this.els["panel-masa"].addEventListener("pointerover", (e) => {
      const btn = e.target.closest("[data-bet-key]");
      if (btn) this._setHoverSpot(btn.dataset.betKey);
    });
    this.els["panel-masa"].addEventListener("pointerout", () => {
      this._setHoverSpot(null);
    });
  }

  _placeSingleBet(key) {
    if (!key || !this.table || this.table.phase !== "betting" || this.isSpectator) return;
    playRouletteChip();
    this.dealPulseUntil = performance.now() + 600;
    this._spawnChipFlight(key);
    this.cb.onBet?.([{ key, amount: this.selectedChip }]);
  }

  _removeSingleSpot(key, amount = null) {
    if (!key || !this.table || this.table.phase !== "betting" || this.isSpectator) return;
    const mySeat = this.table.seats?.find((s) => s && s.userId === this.mySocketId);
    if (!mySeat || !(mySeat.bets?.[key] > 0)) return;
    playRouletteRemove();
    this.dealPulseUntil = performance.now() + 450;
    this.cb.onRemoveSpot?.(key, amount);
  }

  _placeCallBet(callName) {
    if (!callName || !this.table || this.table.phase !== "betting" || this.isSpectator) return;
    playRouletteChip();
    this.dealPulseUntil = performance.now() + 700;
    this.cb.onCallBet?.({ callName, unitAmount: this.selectedChip });
  }

  _placeNeighbors(centerNum) {
    if (!Number.isFinite(centerNum) || !this.table || this.table.phase !== "betting" || this.isSpectator) return;
    playRouletteChip();
    this.dealPulseUntil = performance.now() + 700;
    this.cb.onNeighborsBet?.({
      neighborsCenter: centerNum,
      unitAmount: this.selectedChip,
      radius: this.neighborsRadius,
    });
  }

  _init3D() {
    const canvas3d = this.els.canvas3d;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: canvas3d,
        antialias: true,
        powerPreference: "high-performance",
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;
    } catch {
      this.webglFailed = true;
      this._syncCanvasVisibility();
      return;
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b100e);
    this.scene.fog = new THREE.FogExp2(0x0b100e, 0.085);

    this.camera = new THREE.PerspectiveCamera(44, 1.6, 0.1, 40);
    this.controls = new OrbitControls(this.camera, canvas3d);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 1.05;
    this.controls.maxDistance = 5.4;

    this._buildLighting();
    this._buildTableMesh();
    this._buildWheelAndBall();
    this._loadDealerModel();
    this._bind3DInteraction(canvas3d);

    this.setCameraMode("genis", true);
    this._resize();
    this._resizeObs = new ResizeObserver(() => this._resize());
    this._resizeObs.observe(this.root.querySelector(".roulette-stage"));
  }

  _buildLighting() {
    const hemi = new THREE.HemisphereLight(0xfff1d6, 0x0c2419, 0.92);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffe8c2, 1.85);
    keyLight.position.set(0.5, 4.4, 2.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 12;
    keyLight.shadow.camera.left = -2.6;
    keyLight.shadow.camera.right = 2.6;
    keyLight.shadow.camera.top = 2.2;
    keyLight.shadow.camera.bottom = -2.2;
    this.scene.add(keyLight);

    const wheelSpot = new THREE.SpotLight(0xffdf9a, 3.6, 6.5, Math.PI * 0.24, 0.45, 1.2);
    wheelSpot.position.set(WHEEL_POS.x, 2.9, WHEEL_POS.z + 0.4);
    wheelSpot.target.position.copy(WHEEL_POS);
    this.scene.add(wheelSpot, wheelSpot.target);

    const feltFill = new THREE.PointLight(0x28c77a, 0.95, 5.2);
    feltFill.position.set(0.65, 2.1, 0.35);
    this.scene.add(feltFill);

    const dealerFill = new THREE.PointLight(0xffe8c8, 1.1, 5.5);
    dealerFill.position.set(-0.35, 1.88, 0.88);
    this.scene.add(dealerFill);
  }

  _buildTableMesh() {
    // Floor
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(7, 48),
      new THREE.MeshStandardMaterial({ color: 0x09110d, roughness: 0.9, metalness: 0.05 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // VIP Casino Salon curved walnut backdrop behind croupier so dark void feels rich & authentic
    const salonBack = new THREE.Mesh(
      new THREE.CylinderGeometry(3.8, 3.8, 2.8, 36, 1, true, Math.PI * 0.65, Math.PI * 0.7),
      new THREE.MeshStandardMaterial({
        color: 0x1a100c,
        roughness: 0.58,
        metalness: 0.12,
        side: THREE.BackSide,
      }),
    );
    salonBack.position.set(0, 1.4, 0.2);
    this.scene.add(salonBack);

    const sconceMat = new THREE.MeshStandardMaterial({
      color: 0xe6be60,
      emissive: 0x704810,
      emissiveIntensity: 0.6,
      roughness: 0.25,
      metalness: 0.85,
    });
    for (const sx of [-1.45, -0.45, 0.55, 1.55]) {
      const pilaster = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 2.5, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x2c160e, roughness: 0.45, metalness: 0.14 }),
      );
      pilaster.position.set(sx, 1.25, -1.95);
      const sconce = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.032, 0.16, 12), sconceMat);
      sconce.position.set(sx, 1.65, -1.89);
      this.scene.add(pilaster, sconce);
    }

    // Pedestals
    const pedMat = new THREE.MeshStandardMaterial({ color: 0x24120c, roughness: 0.45, metalness: 0.14 });
    for (const px of [-0.95, 0.85]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.38, TABLE_Y - 0.05, 24), pedMat);
      leg.position.set(px, (TABLE_Y - 0.05) * 0.5, 0);
      leg.castShadow = true;
      leg.receiveShadow = true;
      this.scene.add(leg);
    }

    // Mahogany casino table top & padded leather bumper rail
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(3.84, 0.08, 1.48),
      new THREE.MeshStandardMaterial({ color: 0x381910, roughness: 0.3, metalness: 0.12 }),
    );
    deck.position.set(0.05, TABLE_Y - 0.04, 0);
    deck.receiveShadow = true;
    this.scene.add(deck);

    // Green baize base underneath wheel + cloth
    const fullBaize = new THREE.Mesh(
      new THREE.BoxGeometry(3.64, 0.012, 1.28),
      new THREE.MeshStandardMaterial({ color: 0x0a4d30, roughness: 0.9, metalness: 0.02 }),
    );
    fullBaize.position.set(0.05, TABLE_Y - 0.002, 0);
    fullBaize.receiveShadow = true;
    this.scene.add(fullBaize);

    // Dark espresso padded bumper bars
    const railMat = new THREE.MeshStandardMaterial({ color: 0x1b110e, roughness: 0.38, metalness: 0.12 });
    for (const sz of [-0.71, 0.71]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(3.88, 0.105, 0.11), railMat);
      side.position.set(0.05, TABLE_Y + 0.032, sz);
      side.castShadow = true;
      this.scene.add(side);
    }
    for (const sx of [-1.88, 1.98]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.105, 1.53), railMat);
      cap.position.set(sx, TABLE_Y + 0.032, 0);
      cap.castShadow = true;
      this.scene.add(cap);
    }

    // Gold brass separator strip between wheel and betting cloth
    const sep = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.022, 1.24),
      new THREE.MeshStandardMaterial({ color: 0xdfba5c, roughness: 0.22, metalness: 0.88 }),
    );
    sep.position.set(-0.5, TABLE_Y + 0.01, 0);
    this.scene.add(sep);

    // Interactive Roulette Betting Felt Plane
    this.feltMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(FELT_W, FELT_D),
      new THREE.MeshStandardMaterial({
        map: createRouletteFeltTexture(),
        roughness: 0.84,
        metalness: 0.04,
      }),
    );
    this.feltMesh.rotation.x = -Math.PI / 2;
    this.feltMesh.position.set(FELT_CX, TABLE_Y + 0.005, FELT_CZ);
    this.feltMesh.receiveShadow = true;
    this.scene.add(this.feltMesh);

    // Highlight overlay pool (shows covered numbers on hover & winning number)
    const hlGroup = new THREE.Group();
    this.scene.add(hlGroup);
    this.hoverGroup = hlGroup;
    for (let i = 0; i < 18; i += 1) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.125, 0.18),
        new THREE.MeshBasicMaterial({
          color: 0xfde047,
          transparent: true,
          opacity: 0.34,
          depthWrite: false,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      hlGroup.add(m);
      this.hoverMeshes.push(m);
    }

    // Turned brass/crystal Dolly winning marker
    this.dollyGroup = new THREE.Group();
    const dollyBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.036, 0.028, 20),
      new THREE.MeshStandardMaterial({ color: 0xf6cf65, roughness: 0.15, metalness: 0.92 }),
    );
    dollyBase.position.y = 0.014;
    const dollyStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.024, 0.085, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.08,
        metalness: 0.2,
        transparent: true,
        opacity: 0.85,
      }),
    );
    dollyStem.position.y = 0.068;
    const dollyCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xf6cf65, roughness: 0.14, metalness: 0.92 }),
    );
    dollyCap.position.y = 0.118;
    this.dollyGroup.add(dollyBase, dollyStem, dollyCap);
    this.dollyGroup.visible = false;
    this.scene.add(this.dollyGroup);

    // Chip stacks group
    this.chipsGroup = new THREE.Group();
    this.scene.add(this.chipsGroup);
  }

  _buildWheelAndBall() {
    this.wheelRoot = new THREE.Group();
    this.wheelRoot.position.copy(WHEEL_POS);
    this.wheelRoot.scale.setScalar(WHEEL_SCALE);
    this.scene.add(this.wheelRoot);

    this.rotorGroup = new THREE.Group();
    this.wheelRoot.add(this.rotorGroup);

    // Painted number ring & pocket colors mounted inside rotorGroup!
    const ringGeo = new THREE.RingGeometry(0.382, 0.552, 74);
    const ringMesh = new THREE.Mesh(
      ringGeo,
      new THREE.MeshStandardMaterial({
        map: createWheelRingTexture(),
        roughness: 0.35,
        metalness: 0.08,
      }),
    );
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.064;
    this.rotorGroup.add(ringMesh);

    // Pearl ivory roulette ball inside wheelRoot space
    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.021, 18, 14),
      new THREE.MeshStandardMaterial({
        color: 0xfaf8f2,
        roughness: 0.12,
        metalness: 0.08,
        emissive: 0x222018,
      }),
    );
    this.ballMesh.castShadow = true;
    this.ballMesh.position.set(0.435, 0.088, 0);
    this.wheelRoot.add(this.ballMesh);

    // Load physical wheel GLB assembly
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      "./assets/models/roulette.glb",
      (gltf) => {
        if (this.disposed) return;
        const nodes = [];
        gltf.scene.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            nodes.push(obj);
          }
        });
        for (const m of nodes) {
          if (m.name === "roulette_rotor" || m.name === "roulette_turret") {
            this.rotorGroup.add(m);
          } else {
            this.wheelRoot.add(m);
          }
        }
      },
      undefined,
      () => { },
    );
  }

  async _loadDealerModel() {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    try {
      const gltf = await loader.loadAsync("./assets/models/dealer.glb");
      if (this.disposed) return;
      const root = gltf.scene;
      root.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          obj.frustumCulled = false;
        }
      });

      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      box.getSize(size);
      const scale = size.y > 0.01 ? 1.72 / size.y : 1;
      root.scale.setScalar(scale);
      root.updateMatrixWorld(true);

      const sbox = new THREE.Box3().setFromObject(root);
      const center = new THREE.Vector3();
      sbox.getCenter(center);
      // Stand behind wheel-shoulder facing toward wheel and betting felt
      root.position.set(-center.x - 0.56, -sbox.min.y + 0.02, -center.z - 0.92);
      root.rotation.y = 0.28;
      this.scene.add(root);

      const bones = {};
      root.traverse((obj) => {
        if (obj.isBone) {
          const clean = obj.name.replace(/^mixamorig/i, "");
          bones[clean] = obj;
          bones[obj.name] = obj;
        }
      });

      root.updateMatrixWorld(true);
      const poseRig = {};
      for (const [k, b] of Object.entries(bones)) {
        poseRig[k] = { bone: b, rest: b.quaternion.clone() };
      }

      const alignBoneToward = (boneKey, childKey, desiredDirWorld) => {
        const entry = poseRig[boneKey];
        const child = bones[childKey];
        if (!entry || !child) return;
        const bone = entry.bone;
        bone.quaternion.copy(entry.rest);
        root.updateMatrixWorld(true);
        const p0 = new THREE.Vector3();
        const p1 = new THREE.Vector3();
        bone.getWorldPosition(p0);
        child.getWorldPosition(p1);
        const curDir = p1.sub(p0).normalize();
        if (curDir.lengthSq() < 0.001) return;
        const targetDir = desiredDirWorld.clone().normalize();
        const deltaWorld = new THREE.Quaternion().setFromUnitVectors(curDir, targetDir);
        const parentQuat = new THREE.Quaternion();
        if (bone.parent) bone.parent.getWorldQuaternion(parentQuat);
        const worldQuat = new THREE.Quaternion();
        bone.getWorldQuaternion(worldQuat);
        const nextWorld = deltaWorld.multiply(worldQuat);
        bone.quaternion.copy(parentQuat.clone().invert().multiply(nextWorld));
        entry.base = bone.quaternion.clone();
      };

      alignBoneToward("LeftArm", "LeftForeArm", new THREE.Vector3(0.32, -0.78, 0.52));
      alignBoneToward("LeftForeArm", "LeftHand", new THREE.Vector3(-0.08, -0.18, 0.98));
      alignBoneToward("RightArm", "RightForeArm", new THREE.Vector3(-0.34, -0.76, 0.52));
      alignBoneToward("RightForeArm", "RightHand", new THREE.Vector3(0.1, -0.16, 0.98));

      for (const key of ["Spine", "Spine1", "Spine2", "Neck", "Head"]) {
        if (poseRig[key]) poseRig[key].base = poseRig[key].rest.clone();
      }

      this.dealerRig = { root, poseRig, lookYaw: 0, reachMix: 0 };
    } catch {
      // Decorative model optional if asset unavailable
    }
  }

  _bind3DInteraction(canvas) {
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downPt = null;

    const pickUV = (evt) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      pointer.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, this.camera);
      const hits = raycaster.intersectObject(this.feltMesh, false);
      if (!hits.length) return null;
      const p = hits[0].point;
      const u = (p.x - FELT_X0) / FELT_W;
      const v = (p.z - FELT_Z0) / FELT_D;
      return { u, v, clientX: evt.clientX - rect.left, clientY: evt.clientY - rect.top };
    };

    canvas.addEventListener("pointermove", (e) => {
      const hit = pickUV(e);
      if (!hit) {
        this._setHoverSpot(null);
        return;
      }
      const key = hitTestFeltUV(hit.u, hit.v);
      this._setHoverSpot(key, hit);
    });

    canvas.addEventListener("pointerdown", (e) => {
      downPt = { x: e.clientX, y: e.clientY, btn: e.button };
    });

    canvas.addEventListener("pointerup", (e) => {
      if (!downPt) return;
      const dist = Math.hypot(e.clientX - downPt.x, e.clientY - downPt.y);
      const btn = downPt.btn;
      downPt = null;
      if (dist > 8) return; // Dragged orbit
      const hit = pickUV(e);
      if (!hit) return;
      const key = hitTestFeltUV(hit.u, hit.v);
      if (!key) return;
      if (btn === 2 || this.eraseMode) {
        this._removeSingleSpot(key);
      } else if (btn === 0) {
        this._placeSingleBet(key);
      }
    });
  }

  _setHoverSpot(key, pointerInfo = null) {
    this.hoveredSpot = key;
    const tip = this.els["hover-chip"];
    if (!key) {
      for (const m of this.hoverMeshes) m.visible = false;
      if (tip) tip.hidden = true;
      return;
    }

    const mySeat = this.table?.seats?.find((s) => s && s.userId === this.mySocketId);
    const mySpotAmt = mySeat?.bets?.[key] || 0;
    const isRemoving = this.eraseMode;
    const hlColor = isRemoving ? 0xf87171 : mySpotAmt > 0 ? 0x60a5fa : 0xfde047;

    const nums = getSpotCoveredNumbers(key).slice(0, this.hoverMeshes.length);
    const colW = FELT_W / 14;
    const rowH = FELT_D * V_NUM_END / 3;
    this.hoverMeshes.forEach((mesh, idx) => {
      const n = nums[idx];
      if (n === undefined) {
        mesh.visible = false;
        return;
      }
      const uv = getSpotFeltUV(`straight:${n}`);
      const wp = feltUVToWorld(uv.u, uv.v);
      mesh.position.set(wp.x, TABLE_Y + 0.008, wp.z);
      mesh.material.color.setHex(hlColor);
      mesh.scale.set(
        n === 0 ? 1.0 : (colW / 0.125) * 0.9,
        n === 0 ? 2.6 : (rowH / 0.18) * 0.88,
        1,
      );
      mesh.visible = true;
    });

    if (tip && pointerInfo) {
      const upper = key.toUpperCase();
      if (isRemoving) {
        tip.textContent = mySpotAmt > 0 ? `🧹 ${upper} · Kaldır (${mySpotAmt} Fiş)` : `${upper} · Bahsin yok`;
      } else if (mySpotAmt > 0) {
        tip.textContent = `${upper} · Sol: +${this.selectedChip} | Sağ Tık: Kaldır (${mySpotAmt})`;
      } else {
        tip.textContent = `${upper} · Sol Tık: +${this.selectedChip} Fiş`;
      }
      tip.style.left = `${Math.min(Math.max(pointerInfo.clientX, 75), this.els.canvas3d.clientWidth - 90)}px`;
      tip.style.top = `${Math.max(22, pointerInfo.clientY - 34)}px`;
      tip.hidden = false;
    } else if (tip) {
      tip.hidden = true;
    }
  }

  setCameraMode(mode, immediate = false) {
    this.cameraMode = mode;
    this.root.querySelectorAll("[data-cam]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.cam === mode);
    });
    if (!this.camera || !this.controls) return;
    if (!this._camTargetPos) {
      this._camTargetPos = new THREE.Vector3();
      this._camTargetLook = new THREE.Vector3();
      this._camGliding = false;
      this.controls.addEventListener("start", () => {
        this._camGliding = false;
      });
    }
    const aspect = this.camera.aspect || 1.6;
    const isNarrow = aspect < 1.38;

    if (mode === "cark") {
      this._camTargetPos.set(WHEEL_POS.x + 0.35, TABLE_Y + (isNarrow ? 1.18 : 0.92), isNarrow ? 1.48 : 1.18);
      this._camTargetLook.set(WHEEL_POS.x, TABLE_Y + 0.08, WHEEL_POS.z);
    } else if (mode === "masa") {
      this._camTargetPos.set(0.62, TABLE_Y + (isNarrow ? 1.65 : 1.15), isNarrow ? 1.85 : 1.32);
      this._camTargetLook.set(0.58, TABLE_Y + 0.04, 0.02);
    } else if (mode === "ustten") {
      this._camTargetPos.set(0.05, TABLE_Y + (isNarrow ? 3.25 : 2.38), isNarrow ? 0.55 : 0.32);
      this._camTargetLook.set(0.05, TABLE_Y, 0.02);
    } else {
      // Geniş VIP view (Croupier + Wheel + Felt all together)
      this._camTargetPos.set(
        isNarrow ? 0.08 : 0.15,
        TABLE_Y + (isNarrow ? 2.55 : 1.56),
        isNarrow ? 3.85 : 2.28,
      );
      this._camTargetLook.set(0.02, TABLE_Y + 0.14, -0.04);
    }

    if (immediate) {
      this._camGliding = false;
      this.camera.position.copy(this._camTargetPos);
      this.controls.target.copy(this._camTargetLook);
      this.controls.update();
    } else {
      this._camGliding = true;
    }
  }

  _resize() {
    if (!this.renderer || !this.camera || this.webglFailed) return;
    const stage = this.root.querySelector(".roulette-stage");
    const w = Math.max(280, stage.clientWidth);
    const h = Math.max(210, stage.clientHeight);
    const prevNarrow = (this.camera.aspect || 1.6) < 1.38;
    const nextAspect = w / h;
    const nextNarrow = nextAspect < 1.38;
    this.camera.aspect = nextAspect;
    this.camera.fov = nextNarrow ? 50 : 42;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (prevNarrow !== nextNarrow) {
      this.setCameraMode(this.cameraMode, true);
    }
  }

  _syncCanvasVisibility() {
    const show2D = this.force2D || this.webglFailed;
    this.els.canvas3d.hidden = show2D;
    this.els.canvas2d.hidden = !show2D;
  }

  _getChipLabelTexture(text, color) {
    const key = `${text}|${color}`;
    if (this._labelTextures.has(key)) return this._labelTextures.get(key);
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "rgba(10, 15, 13, 0.88)";
    ctx.strokeStyle = color || "#facc15";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(6, 10, 116, 44, 22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fffbeb";
    ctx.font = "900 28px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(text), 64, 33);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (this._labelTextures.size > 48) {
      const oldest = this._labelTextures.keys().next().value;
      this._labelTextures.get(oldest)?.dispose?.();
      this._labelTextures.delete(oldest);
    }
    this._labelTextures.set(key, tex);
    return tex;
  }

  _spawnChipFlight(key, colorHex = "#eab308") {
    if (!this.scene || this.webglFailed || this.force2D) return;
    const uv = getSpotFeltUV(key);
    const endPos = feltUVToWorld(uv.u, uv.v);
    const startPos = new THREE.Vector3(endPos.x * 0.7, TABLE_Y + 0.34, 0.92);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.009, 16),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorHex),
        roughness: 0.25,
        metalness: 0.25,
      }),
    );
    mesh.position.copy(startPos);
    this.scene.add(mesh);
    this.chipFlights.push({ mesh, startPos, endPos, elapsed: 0, dur: 0.26 });
  }

  _rebuild3DChips() {
    if (!this.chipsGroup || !this.table) return;
    while (this.chipsGroup.children.length) {
      const child = this.chipsGroup.children.pop();
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.());
      else child.material?.dispose?.();
    }

    const spots = this.table.tableSpots || [];
    for (const spot of spots) {
      const uv = getSpotFeltUV(spot.key);
      const basePos = feltUVToWorld(uv.u, uv.v);
      let stackY = 0;
      let topColor = "#facc15";

      for (const entry of spot.breakdown || []) {
        topColor = entry.color || "#eab308";
        const layers = Math.min(6, Math.max(1, Math.ceil(Math.log2(Math.max(1, entry.amount / 10)) + 1)));
        const rimMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(topColor),
          roughness: 0.26,
          metalness: 0.2,
        });
        const coreMat = new THREE.MeshStandardMaterial({
          color: 0xfef9e7,
          roughness: 0.34,
          metalness: 0.08,
        });
        for (let k = 0; k < layers; k += 1) {
          const disc = new THREE.Mesh(
            new THREE.CylinderGeometry(0.029, 0.029, 0.008, 18),
            [rimMat, coreMat, rimMat],
          );
          disc.position.set(basePos.x, TABLE_Y + 0.009 + stackY, basePos.z);
          disc.castShadow = true;
          this.chipsGroup.add(disc);
          stackY += 0.0085;
        }
      }

      // Floating crisp amount sprite above stacked chips
      if (spot.totalAmount > 0) {
        const spriteMat = new THREE.SpriteMaterial({
          map: this._getChipLabelTexture(spot.totalAmount, topColor),
          transparent: true,
          depthTest: false,
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.set(basePos.x, TABLE_Y + 0.048 + stackY, basePos.z);
        sprite.scale.set(0.115, 0.056, 1);
        this.chipsGroup.add(sprite);
      }
    }

    // Golden Dolly winning number marker on 3D cloth
    if (this.dollyGroup) {
      if (this.table.phase === "settled" && Number.isInteger(this.table.winningNumber)) {
        const uv = getSpotFeltUV(`straight:${this.table.winningNumber}`);
        const wp = feltUVToWorld(uv.u, uv.v);
        this.dollyGroup.position.set(wp.x, TABLE_Y + 0.006, wp.z);
        this.dollyGroup.visible = true;
      } else {
        this.dollyGroup.visible = false;
      }
    }
  }

  update(table, mySocketId, opts = {}) {
    if (!table || this.disposed) return;
    this.table = table;
    this.mySocketId = mySocketId;
    this.isSpectator = Boolean(opts.spectator);
    this.serverOffsetMs = (table.serverNow || Date.now()) - Date.now();

    if (table.phase !== this.lastPhase) {
      if (table.phase === "spinning") {
        this.lastTickBucket = -1;
        this.didDropSfx = false;
        this.dealPulseUntil = performance.now() + 900;
        playRouletteSpin();
      } else if (table.phase === "settled") {
        const mySeat = table.seats?.find((s) => s && s.userId === mySocketId);
        if (mySeat && mySeat.lastWin > 0) {
          this.celebrateUntil = performance.now() + 1800;
          playRouletteWin();
        }
      }
      this.lastPhase = table.phase;
    }

    const topFeed = table.liveFeed?.[0];
    if (topFeed && topFeed.id !== this.lastFeedId) {
      this.lastFeedId = topFeed.id;
      this.dealPulseUntil = performance.now() + 450;
      if (topFeed.userId !== mySocketId) {
        this._spawnChipFlight(topFeed.key, topFeed.color);
      }
    }

    this._renderHUD();
    this._rebuild3DChips();
  }

  _renderHUD() {
    const t = this.table;
    if (!t) return;

    const mySeat = t.seats?.find((s) => s && s.userId === this.mySocketId) || null;
    this.els["table-name"].textContent = `${t.name} · ${t.round}. Tur`;

    const phasePill = this.els["phase-pill"];
    phasePill.className = `rl-phase-pill phase-${t.phase}`;
    if (t.phase === "betting") {
      phasePill.textContent = "🟢 Bahisler Açık";
    } else if (t.phase === "spinning") {
      phasePill.textContent = "🎡 Çark Dönüyor…";
    } else {
      const colLabel = t.winningColor === "green" ? "YEŞİL" : t.winningColor === "red" ? "KIRMIZI" : "SİYAH";
      phasePill.textContent = `🏆 Kazanan: ${t.winningNumber} ${colLabel}`;
    }

    this._updateCountdown();

    const myChips = mySeat ? mySeat.chips : 0;
    this.els["bank-pill"].textContent = this.isSpectator
      ? "👁 İzleyici Modu"
      : `💰 ${myChips.toLocaleString("tr-TR")} Fiş${mySeat?.totalBet ? ` (Bahis: ${mySeat.totalBet})` : ""}`;
    const rebuyBtn = this.root.querySelector('[data-act="rebuy"]');
    if (rebuyBtn) {
      rebuyBtn.hidden = !(mySeat && mySeat.chips < 100 && mySeat.totalBet === 0);
    }

    const specToggle = this.root.querySelector('[data-act="spectate-toggle"]');
    if (specToggle) {
      specToggle.hidden = false;
      specToggle.textContent = this.isSpectator ? "Masaya Otur 🪑" : "İzle 👁";
    }

    // History strip (Son 18 Tur)
    const histWrap = this.els["history-strip"];
    histWrap.innerHTML = "";
    const hist = t.history || [];
    if (hist.length === 0) {
      const empty = document.createElement("span");
      empty.className = "rl-hist-empty";
      empty.textContent = "⏱ Her 60 sn'de oto çark";
      histWrap.append(empty);
    } else {
      hist.forEach((h, idx) => {
        const dot = document.createElement("span");
        dot.className = `rl-hist-dot ${h.color} ${idx === 0 ? "latest" : ""}`;
        dot.textContent = String(h.number);
        dot.title = `${h.round}. Tur: ${h.number}`;
        histWrap.append(dot);
      });
      if (t.historyStats?.total > 0) {
        const st = document.createElement("span");
        st.className = "rl-hist-stats";
        st.textContent = `🔴%${t.historyStats.redPct} ⚫%${t.historyStats.blackPct} 🟢%${t.historyStats.greenPct}`;
        histWrap.append(st);
      }
    }

    // Hot / Cold analytics panel
    const hcBox = this.els["hotcold-box"];
    if (hcBox) {
      hcBox.innerHTML = "";
      const stats = t.historyStats;
      if (stats?.total > 0 && stats.hot?.length > 0) {
        const hotRow = document.createElement("div");
        hotRow.className = "rl-hc-row";
        hotRow.innerHTML = `<span class="rl-hc-label">🔥 Sıcak:</span>`;
        for (const h of stats.hot) {
          const s = document.createElement("span");
          s.className = `rl-hc-chip ${numColor(h.num)}`;
          s.textContent = `${h.num}`;
          s.title = `${h.hits} kez geldi`;
          hotRow.append(s);
        }
        const coldRow = document.createElement("div");
        coldRow.className = "rl-hc-row";
        coldRow.innerHTML = `<span class="rl-hc-label">❄️ Soğuk:</span>`;
        for (const c of stats.cold || []) {
          const s = document.createElement("span");
          s.className = `rl-hc-chip ${numColor(c.num)}`;
          s.textContent = `${c.num}`;
          coldRow.append(s);
        }
        const ratio = document.createElement("div");
        ratio.className = "rl-hc-row";
        ratio.textContent = `Çift %${stats.evenPct ?? 0} · Tek %${stats.oddPct ?? 0} · (${stats.total} tur)`;
        hcBox.append(hotRow, coldRow, ratio);
      } else {
        hcBox.innerHTML = `<div class="rl-hc-row"><span class="rl-hc-label">⏱ Oto Çark:</span><span>60 sn'de bir · Sol tık ekler, sağ tık kaldırır</span></div>`;
      }
    }

    // Win Banner on Stage
    const winBanner = this.els["win-banner"];
    if (t.phase === "settled" && Number.isInteger(t.winningNumber)) {
      const colTxt = t.winningColor === "green" ? "YEŞİL" : t.winningColor === "red" ? "KIRMIZI" : "SİYAH";
      const myMsg = mySeat
        ? mySeat.lastWin > 0
          ? ` · 🎉 +${mySeat.lastWin} Fiş Kazandın!`
          : mySeat.totalBet > 0
            ? " · Bu tur tutmadı"
            : ""
        : "";
      winBanner.className = `rl-win-banner ${t.winningColor}`;
      winBanner.textContent = `${t.winningNumber} ${colTxt}${myMsg}`;
      winBanner.hidden = false;
    } else {
      winBanner.hidden = true;
    }

    // Seated players & Pot
    this.els["pot-pill"].textContent = `Masa Potu: ${(t.totalPot || 0).toLocaleString("tr-TR")} Fiş`;
    this.els["spec-pill"].textContent = t.spectatorCount > 0 ? `👁 ${t.spectatorCount} İzleyici` : "";

    const seatsEl = this.els["seats-list"];
    seatsEl.innerHTML = "";
    const activeSeats = (t.seats || []).filter(Boolean);
    const now = Date.now();
    for (const seat of activeSeats) {
      const row = document.createElement("div");
      row.className = `rl-seat-row ${seat.userId === this.mySocketId ? "me" : ""}`;
      const winTxt =
        t.phase === "settled" && seat.lastWin > 0
          ? `<span class="rl-seat-win">+${seat.lastWin}</span>`
          : "";
      const reactTxt =
        seat.reaction && now - seat.reaction.at < 4500
          ? `<span class="rl-seat-react">${this._esc(seat.reaction.emoji)}</span>`
          : "";
      row.innerHTML = `
        <span class="rl-seat-dot" style="background:${seat.color}"></span>
        <span class="rl-seat-name">${this._esc(seat.name)}</span>
        ${reactTxt}
        <span class="rl-seat-bet">${seat.totalBet ? `${seat.totalBet}⏳` : ""}</span>
        ${winTxt}
        <span class="rl-seat-chips">${seat.chips} 💰</span>
      `;
      seatsEl.append(row);
    }

    // Transparent Live Player Bets Feed ("Şu kullanıcı şuraya şunu koydu")
      const renderFeedInto = (container, withAnalytics = false) => {
        container.innerHTML = "";
        if (withAnalytics && hcBox && hcBox.innerHTML) {
          const clone = hcBox.cloneNode(true);
          clone.className = "rl-hotcold-box rl-mobile-hc";
          container.append(clone);
        }
        const feed = t.liveFeed || [];
        if (feed.length === 0) {
          const empty = document.createElement("div");
          empty.className = "rl-feed-empty";
          empty.textContent =
            t.phase === "betting"
              ? "Henüz masaya bahis konmadı — çip seçip masaya tıkla!"
              : "Bu turda bahis kaydı yok.";
          container.append(empty);
          return;
        }
        for (const item of feed) {
          const row = document.createElement("div");
          row.className = "rl-feed-row";
          row.innerHTML = `
          <span class="rl-seat-dot" style="background:${item.color}"></span>
          <span class="rl-feed-who">${this._esc(item.name)}</span>
          <span class="rl-feed-arrow">→</span>
          <span class="rl-feed-spot">${this._esc(item.label)}</span>
          <strong class="rl-feed-amt">+${item.amount}</strong>
        `;
          container.append(row);
        }
      };
      renderFeedInto(this.els["feed-list"], false);
      renderFeedInto(this.els["panel-mobile-feed"], true);

      // Update 2D Felt badges showing EVERYONE's chips transparently on each spot!
      const spotMap = new Map((t.tableSpots || []).map((s) => [s.key, s]));
      for (const btn of this.spotButtons || []) {
        const key = btn.dataset.betKey;
        const spot = spotMap.get(key);
        const badges = btn.querySelector(".rl-spot-badges");
        if (!badges) continue;
        badges.innerHTML = "";
        const nums = getSpotCoveredNumbers(key);
        btn.classList.toggle(
          "is-winner",
          t.phase === "settled" && Number.isInteger(t.winningNumber) && nums.includes(t.winningNumber),
        );
        if (!spot) continue;

        const totalPill = document.createElement("span");
        totalPill.className = "rl-spot-total";
        totalPill.textContent = String(spot.totalAmount);
        badges.append(totalPill);

        for (const br of spot.breakdown.slice(0, 3)) {
          const cDot = document.createElement("i");
          cDot.className = "rl-spot-owner";
          cDot.style.background = br.color;
          cDot.title = `${br.name}: ${br.amount} fiş (Sağ tıkla kaldır)`;
          badges.append(cDot);
        }
      }

      const canBet = t.phase === "betting" && !this.isSpectator && !!mySeat;
      this.root.querySelector(".roulette-dock")?.classList.toggle("is-locked", !canBet);
    }

    _updateCountdown() {
      if (!this.table || !this.els["timer-pill"]) return;
      const remMs = Math.max(0, (this.table.phaseEndsAt || 0) - (Date.now() + (this.serverOffsetMs || 0)));
      const sec = Math.ceil(remMs / 1000);
      this.els["timer-pill"].textContent = `${sec}s`;
      this.els["timer-pill"].classList.toggle("urgent", this.table.phase === "betting" && sec <= 5);
      const fill = this.els["cycle-fill"];
      if (fill) {
        const dur = Math.max(1000, this.table.phaseDurationMs || 48000);
        const pct = Math.min(100, Math.max(0, (remMs / dur) * 100));
        fill.style.width = `${pct.toFixed(1)}%`;
        fill.className = `rl-cycle-fill phase-${this.table.phase}`;
      }
    }

    _esc(str) {
      return String(str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    _startLoop() {
      const tick = () => {
        if (this.disposed) return;
        this.rafId = requestAnimationFrame(tick);
        const dt = Math.min(0.05, this.clock.getDelta());
        const elapsed = this.clock.elapsedTime;
        this._updateCountdown();
        this._animateWheelAndScene(elapsed, dt);

        if (!this.force2D && !this.webglFailed && this.renderer && this.scene && this.camera) {
          this.controls?.update();
          this.renderer.render(this.scene, this.camera);
        } else {
          this._render2DCanvas();
        }
      };
      this.rafId = requestAnimationFrame(tick);
    }

    _animateWheelAndScene(time, dt) {
      // Parabolic chip toss animation
      if (this.chipFlights.length) {
        const keep = [];
        for (const f of this.chipFlights) {
          f.elapsed = Math.min(f.dur, f.elapsed + dt);
          const u = f.elapsed / f.dur;
          const ease = 1 - Math.pow(1 - u, 3);
          f.mesh.position.lerpVectors(f.startPos, f.endPos, ease);
          f.mesh.position.y += Math.sin(u * Math.PI) * 0.16;
          f.mesh.rotation.y += dt * 12;
          if (u < 1) {
            keep.push(f);
          } else {
            this.scene.remove(f.mesh);
            f.mesh.geometry?.dispose?.();
            f.mesh.material?.dispose?.();
          }
        }
        this.chipFlights = keep;
      }

      // Camera glide
      if (this._camGliding && this.camera && this.controls) {
        const ck = 1 - Math.exp(-8.5 * dt);
        this.camera.position.lerp(this._camTargetPos, ck);
        this.controls.target.lerp(this._camTargetLook, ck);
        if (this.camera.position.distanceToSquared(this._camTargetPos) < 0.0005) {
          this.camera.position.copy(this._camTargetPos);
          this.controls.target.copy(this._camTargetLook);
          this._camGliding = false;
        }
      }

      const t = this.table;
      if (this.rotorGroup && this.ballMesh) {
        if (t?.phase === "spinning" && t.spinMeta) {
          const meta = t.spinMeta;
          const duration = Math.max(1000, meta.durationMs || 6400);
          const nowServer = Date.now() + (this.serverOffsetMs || 0);
          const u = Math.min(1, Math.max(0, (nowServer - meta.startedAt) / duration));

          // Smooth decelerating rotor rotation (+Y)
          const rotorEase = 1 - Math.pow(1 - u, 2.15);
          this.rotorYaw = rotorEase * Math.PI * 2 * (meta.rotorRevs || 3);
          this.rotorGroup.rotation.y = this.rotorYaw;

          const targetLocalPocket = ((meta.pocketIndex ?? 0) / 37) * Math.PI * 2;
          const ballTotalWorld = -Math.PI * 2 * (meta.ballRevs || 9);

          if (u < 0.46) {
            // Outer ball track high orbit
            const wAng = ballTotalWorld * (u / 0.72) * 0.92;
            const r = 0.806;
            this.ballMesh.position.set(Math.cos(wAng) * r, 0.194, Math.sin(wAng) * r);
            const bucket = Math.floor(Math.abs(wAng) / (Math.PI * 0.45));
            if (bucket !== this.lastTickBucket && u < 0.4) {
              this.lastTickBucket = bucket;
              playRouletteBallTick(0.9);
            }
          } else if (u < 0.72) {
            // Spiral inward across slanted apron & 8 brass diamond deflectors
            const du = (u - 0.46) / 0.26;
            const wAng = ballTotalWorld * (u / 0.72) * 0.92 + Math.sin(du * Math.PI * 5 + (meta.deflectorSeed || 0) * 6) * 0.08 * (1 - du);
            const r = 0.806 - du * (0.806 - 0.56);
            const deflBump = Math.abs(Math.sin(du * Math.PI * 4)) * 0.016 * (1 - du * 0.6);
            const y = 0.194 - du * (0.194 - 0.098) + deflBump;
            this.ballMesh.position.set(Math.cos(wAng) * r, y, Math.sin(wAng) * r);
            const bucket = Math.floor(du * 6);
            if (bucket !== this.lastTickBucket) {
              this.lastTickBucket = bucket;
              playRouletteBallTick(1.15 - du * 0.25);
            }
          } else {
            // Capture into exact winning pocket inside rotor-local frame!
            if (!this.didDropSfx) {
              this.didDropSfx = true;
              playRouletteDrop();
            }
            const pu = Math.min(1, (u - 0.72) / 0.22);
            const easeP = 1 - Math.pow(1 - pu, 3);
            const dropWorldAng = ballTotalWorld * 0.92;
            const dropLocalAng = dropWorldAng + this.rotorYaw;

            // Nearest congruent pocket ahead of current spin
            const TWO_PI = Math.PI * 2;
            let diff = (targetLocalPocket - dropLocalAng) % TWO_PI;
            if (diff > 0) diff -= TWO_PI; // Continue forward negative sweep naturally
            const finalLocalAng = dropLocalAng + diff - TWO_PI;
            const curLocalAng = dropLocalAng + (finalLocalAng - dropLocalAng) * easeP;

            const curWorldAng = curLocalAng - this.rotorYaw;
            const r = 0.56 - easeP * (0.56 - 0.435);
            const bounce = pu < 1 ? Math.abs(Math.sin(pu * Math.PI * 3.5)) * 0.028 * (1 - pu) : 0;
            const y = 0.098 - easeP * (0.098 - 0.085) + bounce;
            this.ballMesh.position.set(Math.cos(curWorldAng) * r, y, Math.sin(curWorldAng) * r);
          }
        } else {
          // Gentle idle casino wheel spin + ball seated on winning pocket (or 0)
          this.rotorYaw += dt * 0.36;
          this.rotorGroup.rotation.y = this.rotorYaw;
          const restNum = Number.isInteger(t?.winningNumber)
            ? t.winningNumber
            : t?.history?.[0]?.number ?? 0;
          const pIdx = WHEEL_INDEX.get(restNum) ?? 0;
          const localAng = (pIdx / 37) * Math.PI * 2;
          const worldAng = localAng - this.rotorYaw;
          this.ballMesh.position.set(Math.cos(worldAng) * 0.435, 0.085, Math.sin(worldAng) * 0.435);
        }
      }

      // Live 3D Croupier animation
      if (this.dealerRig) {
        const { poseRig } = this.dealerRig;
        let targetLook = t?.phase === "spinning" ? -0.35 : Math.sin(time * 0.4) * 0.14;
        this.dealerRig.lookYaw += (targetLook - this.dealerRig.lookYaw) * Math.min(1, dt * 4);
        const reachTarget = performance.now() < this.dealPulseUntil ? 1 : 0;
        this.dealerRig.reachMix += (reachTarget - this.dealerRig.reachMix) * Math.min(1, dt * 7);
        const reach = this.dealerRig.reachMix;
        const happy = performance.now() < this.celebrateUntil ? Math.sin(time * 8) * 0.08 : 0;

        if (poseRig.Spine1?.base) {
          const q = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(Math.sin(time * 1.5) * 0.02 + reach * 0.04, 0, happy * 0.35),
          );
          poseRig.Spine1.bone.quaternion.copy(poseRig.Spine1.base).multiply(q);
        }
        if (poseRig.Neck?.base) {
          const q = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0.06, this.dealerRig.lookYaw * 0.45, 0),
          );
          poseRig.Neck.bone.quaternion.copy(poseRig.Neck.base).multiply(q);
        }
        if (poseRig.Head?.base) {
          const q = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0.08 + happy * 0.5, this.dealerRig.lookYaw * 0.55, 0),
          );
          poseRig.Head.bone.quaternion.copy(poseRig.Head.base).multiply(q);
        }
        if (poseRig.RightArm?.base) {
          const q = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(-reach * 0.42 + happy * 0.4, reach * 0.2 + Math.sin(time * 1.3) * 0.02, 0),
          );
          poseRig.RightArm.bone.quaternion.copy(poseRig.RightArm.base).multiply(q);
        }
      }
    }

    _render2DCanvas() {
      const canvas = this.els.canvas2d;
      if (!canvas || canvas.hidden) return;
      const stage = this.root.querySelector(".roulette-stage");
      const w = Math.max(300, stage.clientWidth);
      const h = Math.max(210, stage.clientHeight);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, w, h);

      const cx = w * 0.5;
      const cy = h * 0.5;
      const outerR = Math.min(w, h) * 0.44;

      // Bowl rim
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.fillStyle = "#3f180e";
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#e3b857";
      ctx.stroke();

      const step = (Math.PI * 2) / 37;
      for (let i = 0; i < 37; i += 1) {
        const n = WHEEL_ORDER[i];
        const ang = (i / 37) * Math.PI * 2 - this.rotorYaw;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR * 0.86, ang - step * 0.5, ang + step * 0.5);
        ctx.arc(cx, cy, outerR * 0.52, ang + step * 0.5, ang - step * 0.5, true);
        ctx.closePath();
        ctx.fillStyle = numBgHex(n);
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "#d9af52";
        ctx.stroke();

        ctx.save();
        ctx.translate(cx + Math.cos(ang) * outerR * 0.72, cy + Math.sin(ang) * outerR * 0.72);
        ctx.rotate(ang + Math.PI / 2);
        ctx.fillStyle = "#ffffff";
        ctx.font = `700 ${Math.max(9, Math.round(outerR * 0.085))}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(n), 0, 0);
        ctx.restore();
      }

      // Hub
      ctx.beginPath();
      ctx.arc(cx, cy, outerR * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = "#2b120c";
      ctx.fill();
      ctx.strokeStyle = "#e3b857";
      ctx.stroke();

      // Ball
      if (this.ballMesh) {
        const bx = cx + (this.ballMesh.position.x / 0.85) * outerR * 0.94;
        const bz = cy + (this.ballMesh.position.z / 0.85) * outerR * 0.94;
        ctx.beginPath();
        ctx.arc(bx, bz, Math.max(5, outerR * 0.045), 0, Math.PI * 2);
        ctx.fillStyle = "#fffdf6";
        ctx.fill();
      }
    }

    dispose() {
      this.disposed = true;
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this._resizeObs?.disconnect?.();
      this.controls?.dispose?.();
      if (this._labelTextures) {
        for (const tex of this._labelTextures.values()) tex?.dispose?.();
        this._labelTextures.clear();
      }
      this.chipFlights = [];
      if (this.renderer) {
        this.renderer.dispose();
      }
      this.container.innerHTML = "";
    }
  }
