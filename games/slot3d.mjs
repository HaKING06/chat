"use strict";

import * as THREE from "../vendor/three/three.module.js";
import { OrbitControls } from "../vendor/three/OrbitControls.js";
import { GLTFLoader } from "../vendor/three/GLTFLoader.js";
import { MeshoptDecoder } from "../vendor/three/meshopt_decoder.module.js";
import {
  playSlotGamble,
  playSlotLever,
  playSlotReelStop,
  playSlotTease,
  playSlotWin,
} from "./sfx.mjs";

const N_FACES = 24;
const FACE_STEP = (Math.PI * 2) / N_FACES;
const REEL_RADIUS = 0.34;
const REEL_WIDTH = 0.255;
const REEL_X = [-0.628, -0.314, 0, 0.314, 0.628];
const REEL_Y = 1.27;
const REEL_Z = 0.085;

const PAYLINE_COLORS = [
  "#fde047", "#38bdf8", "#fb7185", "#4ade80", "#c084fc",
  "#fb923c", "#2dd4bf", "#f472b6", "#a3e635", "#60a5fa",
];

const SYMBOL_ORDER = [
  "CHERRY", "LEMON", "ORANGE", "PLUM", "GRAPE",
  "BELL", "BAR", "777", "WILD", "SCATTER",
];

const SYMBOL_LABELS = {
  "777": "Üçlü 777",
  BAR: "Altın BAR",
  BELL: "Özgürlük Çanı",
  GRAPE: "Üzüm",
  PLUM: "Erik",
  ORANGE: "Portakal",
  LEMON: "Limon",
  CHERRY: "Vişne",
  WILD: "WILD Joker",
  SCATTER: "Bonus Yıldız",
};

function drawSlotIcon(ctx, id, size) {
  const r = size * 0.42;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Dark/light glossy badge background per symbol tier
  const bg = ctx.createRadialGradient(0, -r * 0.2, 4, 0, 0, r * 1.15);
  if (id === "WILD") {
    bg.addColorStop(0, "#0284c7");
    bg.addColorStop(1, "#0f172a");
  } else if (id === "SCATTER") {
    bg.addColorStop(0, "#7c2d12");
    bg.addColorStop(1, "#1c1026");
  } else if (id === "777") {
    bg.addColorStop(0, "#3b0a0a");
    bg.addColorStop(1, "#160708");
  } else if (id === "BAR") {
    bg.addColorStop(0, "#2c2210");
    bg.addColorStop(1, "#0e0c09");
  } else {
    bg.addColorStop(0, "#fffdf7");
    bg.addColorStop(1, "#efe3c6");
  }

  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(-size * 0.46, -size * 0.42, size * 0.92, size * 0.84, 14);
  ctx.fill();
  ctx.lineWidth = id === "WILD" || id === "SCATTER" || id === "777" ? 4 : 2.5;
  ctx.strokeStyle =
    id === "WILD"
      ? "#38bdf8"
      : id === "SCATTER"
        ? "#facc15"
        : id === "777"
          ? "#ef4444"
          : "#d4af37";
  ctx.stroke();

  if (id === "777") {
    ctx.font = `900 ${Math.round(size * 0.36)}px Georgia, serif`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#facc15";
    ctx.strokeText("777", 0, 2);
    ctx.fillStyle = "#ef4444";
    ctx.fillText("777", 0, 2);
  } else if (id === "BAR") {
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.roundRect(-r * 0.9, -r * 0.44, r * 1.8, r * 0.88, 8);
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "#facc15";
    ctx.stroke();
    ctx.fillStyle = "#fef08a";
    ctx.font = `900 ${Math.round(size * 0.28)}px system-ui, sans-serif`;
    ctx.fillText("BAR", 0, 2);
  } else if (id === "WILD") {
    // Crown + WILD ribbon
    ctx.fillStyle = "#fde047";
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, r * 0.05);
    ctx.lineTo(-r * 0.65, -r * 0.48);
    ctx.lineTo(-r * 0.25, -r * 0.2);
    ctx.lineTo(0, -r * 0.58);
    ctx.lineTo(r * 0.25, -r * 0.2);
    ctx.lineTo(r * 0.65, -r * 0.48);
    ctx.lineTo(r * 0.55, r * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#38bdf8";
    ctx.font = `900 ${Math.round(size * 0.22)}px system-ui, sans-serif`;
    ctx.fillText("WILD", 0, r * 0.46);
  } else if (id === "SCATTER") {
    // Radiant 5-point Star
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const ang = (i * Math.PI) / 5 - Math.PI / 2;
      const rad = i % 2 === 0 ? r * 0.62 : r * 0.27;
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad - r * 0.12;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#fffbeb";
    ctx.stroke();
    ctx.fillStyle = "#fef08a";
    ctx.font = `900 ${Math.round(size * 0.16)}px system-ui, sans-serif`;
    ctx.fillText("BONUS", 0, r * 0.58);
  } else if (id === "BELL") {
    ctx.fillStyle = "#eab308";
    ctx.beginPath();
    ctx.moveTo(-r * 0.58, r * 0.36);
    ctx.quadraticCurveTo(-r * 0.45, -r * 0.48, 0, -r * 0.55);
    ctx.quadraticCurveTo(r * 0.45, -r * 0.48, r * 0.58, r * 0.36);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#854d0e";
    ctx.stroke();
    ctx.fillStyle = "#b45309";
    ctx.beginPath();
    ctx.arc(0, r * 0.45, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
  } else if (id === "CHERRY") {
    // Stems
    ctx.strokeStyle = "#15803d";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-r * 0.28, r * 0.2);
    ctx.quadraticCurveTo(-r * 0.1, -r * 0.45, r * 0.12, -r * 0.56);
    ctx.moveTo(r * 0.28, r * 0.24);
    ctx.quadraticCurveTo(r * 0.22, -r * 0.32, r * 0.12, -r * 0.56);
    ctx.stroke();
    // Leaf
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.ellipse(r * 0.28, -r * 0.48, r * 0.2, r * 0.1, 0.35, 0, Math.PI * 2);
    ctx.fill();
    // Cherries
    for (const [cx, cy] of [[-r * 0.3, r * 0.26], [r * 0.26, r * 0.3]]) {
      ctx.fillStyle = "#dc2626";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.beginPath();
      ctx.arc(cx - r * 0.08, cy - r * 0.09, r * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (id === "LEMON") {
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.62, r * 0.44, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#a16207";
    ctx.stroke();
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.ellipse(r * 0.32, -r * 0.36, r * 0.2, r * 0.1, 0.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (id === "ORANGE") {
    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.arc(0, r * 0.05, r * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#c2410c";
    ctx.stroke();
    ctx.fillStyle = "#16a34a";
    ctx.beginPath();
    ctx.ellipse(r * 0.14, -r * 0.46, r * 0.22, r * 0.1, -0.35, 0, Math.PI * 2);
    ctx.fill();
  } else if (id === "PLUM") {
    ctx.fillStyle = "#7e22ce";
    ctx.beginPath();
    ctx.ellipse(0, r * 0.06, r * 0.44, r * 0.5, 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#4c1d95";
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.14, -r * 0.14, r * 0.09, r * 0.16, -0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (id === "GRAPE") {
    const pts = [
      [-r * 0.24, -r * 0.18], [0, -r * 0.18], [r * 0.24, -r * 0.18],
      [-r * 0.14, r * 0.06], [r * 0.14, r * 0.06], [0, r * 0.32],
    ];
    for (const [gx, gy] of pts) {
      ctx.fillStyle = "#9333ea";
      ctx.beginPath();
      ctx.arc(gx, gy, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#581c87";
      ctx.stroke();
    }
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(-3, -r * 0.52, 6, r * 0.22);
  }

  ctx.restore();
}

export function drawSlotSymbolBadge(canvas, id) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width * 0.5, canvas.height * 0.5);
  drawSlotIcon(ctx, id, canvas.width * 0.94);
  ctx.restore();
}

function getCellAnchorWorld(reel, row) {
  const angleOffset = (1 - row) * FACE_STEP; // row 0 -> +FACE_STEP (+Y), row 1 -> 0, row 2 -> -FACE_STEP (-Y)
  return new THREE.Vector3(
    REEL_X[reel],
    REEL_Y + Math.sin(angleOffset) * (REEL_RADIUS + 0.025),
    REEL_Z + Math.cos(angleOffset) * (REEL_RADIUS + 0.025),
  );
}

export class SlotArena {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.cb = callbacks;
    this.hall = null;
    this.mySocketId = null;
    this.isSpectator = false;
    this.selectedStake = 40;
    this.turboMode = false;
    this.autoRemaining = 0;
    this.spinning = false;
    this.cameraMode = "makine";
    this.force2D = false;
    this.webglFailed = false;
    this.disposed = false;
    this.activeTab = "kabin"; // kabin | odeme | salon
    this.rafId = null;
    this.clock = new THREE.Clock();
    this.reels = [];
    this.winCoins = [];
    this.paylineGroup = null;
    this.leverMesh = null;
    this.leverAnim = 0;
    this.marqueeMat = null;
    this.marqueeCtx = null;
    this.marqueeCanvas = null;
    this.paylineCycleIdx = 0;
    this.paylineCycleTimer = 0;
    this.activeSpinAnim = null;
    this.lastSpinSeenId = "";
    this._hydrated = false;
    this.iconUrls = {};

    this._prebakeIcons();
    this._buildDom();
    this._init3D();
    this._startLoop();
  }

  _prebakeIcons() {
    const c = document.createElement("canvas");
    c.width = 112;
    c.height = 112;
    for (const id of SYMBOL_ORDER) {
      drawSlotSymbolBadge(c, id);
      this.iconUrls[id] = c.toDataURL("image/png");
    }
  }

  _buildDom() {
    this.container.innerHTML = "";
    this.root = document.createElement("div");
    this.root.className = "slot-arena";

    const topbar = document.createElement("div");
    topbar.className = "slot-topbar";
    topbar.innerHTML = `
      <div class="slot-top-left">
        <span class="sl-jackpot-pill" data-el="jackpot-pill">💎 VIP JACKPOT: 25.000 💰</span>
        <span class="sl-rtp-pill" data-el="rtp-pill">RTP %96.2 · 20 Hat</span>
        <span class="sl-bank-pill" data-el="bank-pill">💰 1.000 Fiş</span>
        <button type="button" class="button small primary" data-act="rebuy" hidden>+500 Fiş Al</button>
      </div>
      <div class="slot-top-actions">
        <div class="sl-cam-group" role="group" aria-label="Kamera açıları">
          <button type="button" class="sl-cam-btn active" data-cam="makine">Makine</button>
          <button type="button" class="sl-cam-btn" data-cam="makara">Makaralar</button>
          <button type="button" class="sl-cam-btn" data-cam="salon">Salon</button>
        </div>
        <button type="button" class="button small secondary" data-act="toggle-2d">2D</button>
        <button type="button" class="button small secondary" data-act="spectate-toggle" hidden>İzle 👁</button>
        <button type="button" class="button small secondary" data-act="help">? Ödeme Tablosu</button>
        <button type="button" class="button small secondary" data-act="leave">Çık</button>
      </div>
    `;

    const mainWrap = document.createElement("div");
    mainWrap.className = "slot-main";

    const stage = document.createElement("div");
    stage.className = "slot-stage";
    stage.innerHTML = `
      <canvas class="sl-canvas-3d" data-el="canvas3d"></canvas>
      <canvas class="sl-canvas-2d" data-el="canvas2d" hidden></canvas>
      <div class="sl-stage-hud">
        <div class="sl-fs-banner" data-el="fs-banner" hidden></div>
        <div class="sl-win-overlay" data-el="win-overlay" hidden></div>
        <div class="sl-hint-pill">🕹 Kolu çek veya ÇEVİR'e bas ([Boşluk]) · 5×777 = Jackpot</div>
      </div>
    `;

    const sideDock = document.createElement("aside");
    sideDock.className = "slot-side";
    sideDock.innerHTML = `
      <div class="sl-side-section">
        <div class="sl-side-head">
          <strong>🎰 Vegas VIP Salonu</strong>
          <span class="sl-side-sub" data-el="players-count">1 Oyuncu</span>
        </div>
        <div class="sl-players-list" data-el="players-list"></div>
        <div class="sl-react-strip" role="group" aria-label="Salon tepkileri">
          <button type="button" class="sl-react-btn" data-react="🔥">🔥</button>
          <button type="button" class="sl-react-btn" data-react="👏">👏</button>
          <button type="button" class="sl-react-btn" data-react="😎">😎</button>
          <button type="button" class="sl-react-btn" data-react="🍀">🍀</button>
          <button type="button" class="sl-react-btn" data-react="💎">💎</button>
          <button type="button" class="sl-react-btn" data-react="😱">😱</button>
        </div>
      </div>
      <div class="sl-side-section sl-wins-section">
        <div class="sl-side-head">
          <strong>🏆 Canlı Büyük Kazançlar</strong>
        </div>
        <div class="sl-wins-list" data-el="wins-list"></div>
      </div>
    `;

    mainWrap.append(stage, sideDock);

    const consoleBox = document.createElement("section");
    consoleBox.className = "slot-console";
    consoleBox.innerHTML = `
      <div class="sl-gamble-bar" data-el="gamble-bar" hidden></div>
      <div class="sl-console-row">
        <div class="sl-stakes-group" data-el="stakes-group"></div>
        <div class="sl-mid-controls">
          <button type="button" class="sl-mode-btn" data-act="toggle-turbo" title="Hızlı makara dönüşü">⚡ Turbo</button>
          <div class="sl-auto-wrap">
            <button type="button" class="sl-mode-btn" data-act="auto-5">🔁 5× Oto</button>
            <button type="button" class="sl-mode-btn" data-act="auto-15">15×</button>
            <button type="button" class="sl-mode-btn sl-auto-stop" data-act="auto-stop" hidden>⏹ Durdur (<span data-el="auto-rem">0</span>)</button>
          </div>
        </div>
        <button type="button" class="sl-spin-btn" data-act="spin">
          <span class="sl-spin-title">ÇEVİR</span>
          <small class="sl-spin-sub" data-el="spin-sub">40 Fiş · 20 Hat</small>
        </button>
      </div>
      <div class="sl-status-strip" data-el="status-strip">
        20 Sabit Ödeme Hattı · 👑 WILD tüm sembollerin (⭐ hariç) yerine geçer · 3× ⭐ Bonus = 10 Free Spin (×2)
      </div>
    `;

    this.root.append(topbar, mainWrap, consoleBox);
    this.container.append(this.root);

    this.els = {};
    this.root.querySelectorAll("[data-el]").forEach((n) => {
      this.els[n.dataset.el] = n;
    });

    this._renderStakes();
    this._bindEvents();
  }

  _renderStakes() {
    const wrap = this.els["stakes-group"];
    wrap.innerHTML = "";
    const stakes = this.hall?.stakes || [20, 40, 100, 200, 500, 1000];
    for (const s of stakes) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `sl-stake-btn ${this.selectedStake === s ? "active" : ""}`;
      btn.dataset.stake = String(s);
      btn.textContent = String(s);
      btn.title = `${s} Fiş toplam bahis (hat başı ${s / 20} fiş)`;
      wrap.append(btn);
    }
    if (this.els["spin-sub"]) {
      const fs = this.hall?.myCabinet?.freeSpins || 0;
      this.els["spin-sub"].textContent = fs > 0
        ? `ÜCRETSİZ (${fs} kalan · ×${this.hall.myCabinet.freeSpinMult || 2})`
        : `${this.selectedStake} Fiş · 20 Hat`;
    }
  }

  _bindEvents() {
    this.root.addEventListener("click", (e) => {
      const camBtn = e.target.closest("[data-cam]");
      if (camBtn) {
        this.setCameraMode(camBtn.dataset.cam);
        return;
      }
      const stakeBtn = e.target.closest("[data-stake]");
      if (stakeBtn) {
        if (this.spinning || (this.hall?.myCabinet?.freeSpins || 0) > 0) return;
        this.selectedStake = Number(stakeBtn.dataset.stake) || 40;
        this._renderStakes();
        return;
      }
      const reactBtn = e.target.closest("[data-react]");
      if (reactBtn) {
        this.cb.onReact?.(reactBtn.dataset.react);
        return;
      }
      const gambleBtn = e.target.closest("[data-gamble]");
      if (gambleBtn) {
        const pick = gambleBtn.dataset.gamble;
        if (pick === "collect") this.cb.onCollectGamble?.();
        else {
          this.cb.onGamble?.(pick);
        }
        return;
      }
      const actBtn = e.target.closest("[data-act]");
      if (actBtn) {
        const act = actBtn.dataset.act;
        if (act === "leave") this.cb.onLeave?.();
        else if (act === "help") this.cb.onHelp?.();
        else if (act === "rebuy") this.cb.onRebuy?.();
        else if (act === "spin") this.triggerSpin();
        else if (act === "toggle-turbo") {
          this.turboMode = !this.turboMode;
          actBtn.classList.toggle("active", this.turboMode);
        } else if (act === "auto-5") this._startAuto(5);
        else if (act === "auto-15") this._startAuto(15);
        else if (act === "auto-stop") {
          this.autoRemaining = 0;
          this._syncAutoUI();
        } else if (act === "spectate-toggle") {
          this.cb.onSpectateToggle?.(!this.isSpectator);
        } else if (act === "toggle-2d") {
          this.force2D = !this.force2D;
          actBtn.textContent = this.force2D ? "3D" : "2D";
          this._syncCanvasVisibility();
        }
      }
    });

    this._onKeyDown = (e) => {
      if (this.disposed || this.root.closest("[hidden]")) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        this.triggerSpin();
      }
    };
    window.addEventListener("keydown", this._onKeyDown);
  }

  _startAuto(count) {
    if (this.isSpectator) return;
    this.autoRemaining = count;
    this._syncAutoUI();
    if (!this.spinning) this.triggerSpin();
  }

  _syncAutoUI() {
    const stopBtn = this.root.querySelector('[data-act="auto-stop"]');
    if (stopBtn) stopBtn.hidden = this.autoRemaining <= 0;
    if (this.els["auto-rem"]) this.els["auto-rem"].textContent = String(this.autoRemaining);
  }

  triggerSpin() {
    if (this.spinning || this.isSpectator || !this.hall?.myCabinet) return;
    const cab = this.hall.myCabinet;
    if (cab.freeSpins <= 0 && cab.chips < this.selectedStake) {
      this.autoRemaining = 0;
      this._syncAutoUI();
    }
    this.spinning = true;
    this.leverAnim = 1.0;
    playSlotLever();
    this._clearPaylines();
    if (this.els["win-overlay"]) this.els["win-overlay"].hidden = true;
    this.root.querySelector('[data-act="spin"]')?.classList.add("is-spinning");
    this.cb.onSpin?.(this.selectedStake);
  }

  abortSpin() {
    if (this.activeSpinAnim) return;
    this.spinning = false;
    this.autoRemaining = 0;
    this._syncAutoUI();
    this.root.querySelector('[data-act="spin"]')?.classList.remove("is-spinning");
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
      this.renderer.toneMappingExposure = 1.18;
    } catch {
      this.webglFailed = true;
      this._syncCanvasVisibility();
      return;
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0812);
    this.scene.fog = new THREE.FogExp2(0x0b0812, 0.085);

    this.camera = new THREE.PerspectiveCamera(42, 1.5, 0.1, 35);
    this.controls = new OrbitControls(this.camera, canvas3d);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 1.25;
    this.controls.maxDistance = 4.8;

    this._buildLighting();
    this._buildCasinoSalonAndCabinet();
    this._buildReels();
    this._bindLeverClick(canvas3d);

    this.setCameraMode("makine", true);
    this._resize();
    this._resizeObs = new ResizeObserver(() => this._resize());
    this._resizeObs.observe(this.root.querySelector(".slot-stage"));
  }

  _buildLighting() {
    const hemi = new THREE.HemisphereLight(0xfff0d4, 0x1e1026, 0.95);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff4de, 1.9);
    key.position.set(1.2, 3.6, 2.8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);

    this.reelSpot = new THREE.SpotLight(0xffe09a, 3.2, 5.5, Math.PI * 0.25, 0.45, 1.1);
    this.reelSpot.position.set(0, 2.25, 1.85);
    this.reelSpot.target.position.set(0, REEL_Y, REEL_Z + REEL_RADIUS);
    this.scene.add(this.reelSpot, this.reelSpot.target);

    const neonMagenta = new THREE.PointLight(0xd946ef, 1.2, 6);
    neonMagenta.position.set(-1.6, 1.8, -0.4);
    const neonGold = new THREE.PointLight(0xfbbf24, 1.2, 6);
    neonGold.position.set(1.6, 1.8, -0.4);
    this.scene.add(neonMagenta, neonGold);
  }

  _buildCasinoSalonAndCabinet() {
    // Rich Vegas velvet carpet floor
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(6.5, 48),
      new THREE.MeshStandardMaterial({ color: 0x260916, roughness: 0.88, metalness: 0.06 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Fluted salon backdrop pillars
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1b1224, roughness: 0.42, metalness: 0.25 });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf0c458,
      emissive: 0x6b4506,
      emissiveIntensity: 0.45,
      roughness: 0.22,
      metalness: 0.88,
    });
    for (const px of [-2.05, 2.05]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 3.2, 16), pillarMat);
      col.position.set(px, 1.6, -1.1);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 10, 24), brassMat);
      band.rotation.x = Math.PI / 2;
      band.position.set(px, 1.95, -1.1);
      this.scene.add(col, band);
    }

    // Marquee illuminated Vegas signboard plane on front of cabinet upper housing
    this.marqueeCanvas = document.createElement("canvas");
    this.marqueeCanvas.width = 512;
    this.marqueeCanvas.height = 128;
    this.marqueeCtx = this.marqueeCanvas.getContext("2d");
    const mTex = new THREE.CanvasTexture(this.marqueeCanvas);
    mTex.colorSpace = THREE.SRGBColorSpace;
    this.marqueeMat = new THREE.MeshStandardMaterial({
      map: mTex,
      emissiveMap: mTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.9,
      roughness: 0.82,
      metalness: 0.0,
    });
    const marqueePlane = new THREE.Mesh(new THREE.PlaneGeometry(1.58, 0.36), this.marqueeMat);
    marqueePlane.position.set(0, 1.98, 0.405);
    this.scene.add(marqueePlane);
    this._redrawMarquee();

    // Subtle reflective reel glass front panel
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(1.52, 0.68),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.08,
        roughness: 0.05,
        metalness: 0.1,
      }),
    );
    glass.position.set(0, REEL_Y, 0.44);
    this.scene.add(glass);

    // Win payline tubes & coin particles containers
    this.paylineGroup = new THREE.Group();
    this.scene.add(this.paylineGroup);
    this.coinsGroup = new THREE.Group();
    this.scene.add(this.coinsGroup);

    // Load physical GLTF slot cabinet
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      "./assets/models/slot_machine.glb",
      (gltf) => {
        if (this.disposed) return;
        gltf.scene.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            if (obj.name === "slot_lever") {
              this.leverMesh = obj;
            }
          }
        });
        this.scene.add(gltf.scene);
      },
      undefined,
      () => { },
    );
  }

  _redrawMarquee(customMsg = null) {
    if (!this.marqueeCtx || !this.marqueeMat) return;
    const ctx = this.marqueeCtx;
    const W = 512;
    const H = 128;
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#3b0764");
    grad.addColorStop(0.5, "#7e1233");
    grad.addColorStop(1, "#3b0764");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#fde047";
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, W - 8, H - 8);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const jp = Math.round(this.hall?.jackpotPool || 25000).toLocaleString("tr-TR");
    const fs = this.hall?.myCabinet?.freeSpins || 0;

    if (customMsg) {
      ctx.fillStyle = "#fde047";
      ctx.font = "900 32px system-ui, sans-serif";
      ctx.fillText(customMsg, W * 0.5, H * 0.5);
    } else if (fs > 0) {
      ctx.fillStyle = "#4ade80";
      ctx.font = "800 22px system-ui, sans-serif";
      ctx.fillText("⭐ ÜCRETSİZ ÇEVİRME BONUSU ⭐", W * 0.5, 36);
      ctx.fillStyle = "#fffbeb";
      ctx.font = "900 34px system-ui, sans-serif";
      ctx.fillText(`${fs} KALAN · ×${this.hall.myCabinet.freeSpinMult || 2} ÇARPAN`, W * 0.5, 84);
    } else {
      ctx.fillStyle = "#fde68a";
      ctx.font = "800 20px system-ui, sans-serif";
      ctx.fillText("★ LAS VEGAS VIP JACKPOT ★", W * 0.5, 34);
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 40px system-ui, sans-serif";
      ctx.fillText(`${jp} FİŞ`, W * 0.5, 84);
    }
    this.marqueeMat.map.needsUpdate = true;
    this.marqueeMat.emissiveMap.needsUpdate = true;
  }

  _buildReels() {
    this.reels = [];
    for (let r = 0; r < 5; r += 1) {
      const strip = Array.from(
        { length: N_FACES },
        (_, i) => SYMBOL_ORDER[(i * 3 + r * 2) % SYMBOL_ORDER.length],
      );
      const canvas = document.createElement("canvas");
      canvas.width = N_FACES * 128;
      canvas.height = 192;
      const ctx = canvas.getContext("2d");
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;

      const geo = new THREE.CylinderGeometry(REEL_RADIUS, REEL_RADIUS, REEL_WIDTH, N_FACES, 1, false);
      geo.rotateZ(-Math.PI / 2);

      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.3,
        metalness: 0.06,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(REEL_X[r], REEL_Y, REEL_Z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      const reelState = {
        index: r,
        mesh,
        canvas,
        ctx,
        tex,
        strip,
        targetCell: 12,
        angle: -((12 + 0.5) / N_FACES) * Math.PI * 2,
        speed: 0,
        spinning: false,
        locked: true,
        stopAt: 0,
        targetAngle: 0,
        teaseLight: false,
      };
      this._paintReelStrip(reelState);
      mesh.rotation.x = reelState.angle;
      this.reels.push(reelState);
    }
  }

  _paintReelStrip(reel) {
    const ctx = reel.ctx;
    const cellW = 128;
    const cellH = 192;
    ctx.fillStyle = "#18121e";
    ctx.fillRect(0, 0, reel.canvas.width, cellH);

    for (let i = 0; i < N_FACES; i += 1) {
      const sym = reel.strip[i] || "CHERRY";
      ctx.save();
      ctx.translate(i * cellW + cellW * 0.5, cellH * 0.5);
      ctx.rotate(-Math.PI / 2);
      drawSlotIcon(ctx, sym, 114);
      ctx.restore();
    }
    reel.tex.needsUpdate = true;
  }

  _bindLeverClick(canvas) {
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downPt = null;
    canvas.addEventListener("pointerdown", (e) => {
      downPt = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener("pointerup", (e) => {
      if (!downPt || !this.leverMesh) return;
      if (Math.hypot(e.clientX - downPt.x, e.clientY - downPt.y) > 8) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, this.camera);
      if (raycaster.intersectObject(this.leverMesh, false).length > 0) {
        this.triggerSpin();
      }
    });
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
    const aspect = this.camera.aspect || 1.5;
    const isNarrow = aspect < 1.35;

    if (mode === "makara") {
      this._camTargetPos.set(0, 1.32, isNarrow ? 2.45 : 1.72);
      this._camTargetLook.set(0, 1.28, 0.25);
    } else if (mode === "salon") {
      this._camTargetPos.set(-1.35, 1.95, isNarrow ? 3.9 : 3.05);
      this._camTargetLook.set(0, 1.25, 0);
    } else {
      // Full machine view centered cleanly for both desktop & mobile portrait!
      this._camTargetPos.set(0.06, isNarrow ? 1.48 : 1.44, isNarrow ? 3.72 : 2.75);
      this._camTargetLook.set(0.04, 1.29, 0.1);
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
    const stage = this.root.querySelector(".slot-stage");
    const w = Math.max(260, stage.clientWidth);
    const h = Math.max(210, stage.clientHeight);
    const prevNarrow = (this.camera.aspect || 1.5) < 1.35;
    const nextAspect = w / h;
    const nextNarrow = nextAspect < 1.35;
    this.camera.aspect = nextAspect;
    this.camera.fov = nextNarrow ? 48 : 42;
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

  update(hall, mySocketId, opts = {}) {
    if (!hall || this.disposed) return;
    this.hall = hall;
    this.mySocketId = mySocketId;
    this.isSpectator = Boolean(opts.spectator);

    const cab = hall.myCabinet;
    if (cab) {
      const isInitialCabinet = !this._hydrated;
      this._hydrated = true;
      if (cab.lastSpin && cab.lastSpin.id !== this.lastSpinSeenId) {
        this.lastSpinSeenId = cab.lastSpin.id;
        if (isInitialCabinet && !this.spinning) {
          this._snapReelsToGrid(cab.lastSpin.grid);
          this.spinning = false;
          this.root.querySelector('[data-act="spin"]')?.classList.remove("is-spinning");
        } else {
          this._startReelSequence(cab.lastSpin);
        }
      }
    } else {
      this._hydrated = false;
    }

    this._redrawMarquee();
    this._renderHUD();
  }

  _snapReelsToGrid(grid) {
    if (!grid || !this.reels.length) return;
    for (let r = 0; r < 5; r += 1) {
      const reel = this.reels[r];
      const t = reel.targetCell;
      reel.strip[(t - 1 + N_FACES) % N_FACES] = grid[0][r];
      reel.strip[t] = grid[1][r];
      reel.strip[(t + 1) % N_FACES] = grid[2][r];
      this._paintReelStrip(reel);
      reel.angle = -((t + 0.5) / N_FACES) * Math.PI * 2;
      reel.mesh.rotation.x = reel.angle;
    }
  }

  _startReelSequence(spin) {
    this.spinning = true;
    const now = performance.now();
    const baseDur = this.turboMode ? 420 : 920;
    const stepDur = this.turboMode ? 120 : 280;
    const teaseFrom = !this.turboMode && spin.scatterTeaseFromReel >= 0 ? spin.scatterTeaseFromReel : 99;
    let teaseOffset = 0;

    for (let r = 0; r < 5; r += 1) {
      const reel = this.reels[r];
      const t = (reel.targetCell + 12) % N_FACES;
      reel.targetCell = t;
      reel.strip[(t - 1 + N_FACES) % N_FACES] = spin.grid[0][r];
      reel.strip[t] = spin.grid[1][r];
      reel.strip[(t + 1) % N_FACES] = spin.grid[2][r];
      this._paintReelStrip(reel);

      if (r >= teaseFrom) teaseOffset += 780;
      const dur = baseDur + r * stepDur + teaseOffset;
      const desiredMod = -((t + 0.5) / N_FACES) * Math.PI * 2;
      const revolutions = (2 + r) * (Math.PI * 2);
      // Reach a forward positive rotation congruent to desiredMod
      const TWO_PI = Math.PI * 2;
      let target = reel.angle + revolutions;
      const rem = (desiredMod - (target % TWO_PI) + TWO_PI * 4) % TWO_PI;
      target += rem;

      reel.startAngle = reel.angle;
      reel.targetAngle = target;
      reel.startAt = now;
      reel.stopAt = now + dur;
      reel.spinning = true;
      reel.locked = false;
      reel.teased = false;
      reel.needsTease = r >= teaseFrom;
    }

    this.activeSpinAnim = spin;
  }

  _finishSpinSequence(spin) {
    this.spinning = false;
    this.root.querySelector('[data-act="spin"]')?.classList.remove("is-spinning");

    if (spin.totalWin > 0) {
      const isBig = spin.spinTier === "big" || spin.spinTier === "mega" || spin.spinTier === "jackpot";
      playSlotWin(isBig);
      this._buildPaylineHighlights(spin);
      if (isBig || spin.awardedFreeSpins > 0) {
        this._spawnCoinShower(spin.spinTier === "jackpot" ? 36 : 20);
        this._redrawMarquee(
          spin.jackpotWon > 0
            ? `💎 JACKPOT +${spin.totalWin.toLocaleString("tr-TR")}!`
            : `🔥 KAZANÇ +${spin.totalWin.toLocaleString("tr-TR")}!`,
        );
      }
      if (this.els["win-overlay"]) {
        const tierLabel =
          spin.spinTier === "jackpot"
            ? "👑 VIP JACKPOT!"
            : spin.spinTier === "mega"
              ? "🔥 MEGA KAZANÇ!"
              : spin.spinTier === "big"
                ? "✨ BÜYÜK KAZANÇ!"
                : "KAZANDIN!";
        const fsTxt = spin.awardedFreeSpins > 0 ? ` · ⭐ +${spin.awardedFreeSpins} Free Spin!` : "";
        this.els["win-overlay"].textContent = `${tierLabel} +${spin.totalWin.toLocaleString("tr-TR")} Fiş${fsTxt}`;
        this.els["win-overlay"].className = `sl-win-overlay tier-${spin.spinTier}`;
        this.els["win-overlay"].hidden = false;
      }
    }

    this._renderHUD();

    // Continue Auto-Spin smoothly or pause if Free Spins just triggered or broke
    if (this.autoRemaining > 0) {
      this.autoRemaining -= 1;
      this._syncAutoUI();
      if (spin.awardedFreeSpins > 0 || spin.jackpotWon > 0) {
        this.autoRemaining = 0;
        this._syncAutoUI();
      } else if (this.autoRemaining > 0 || (this.hall?.myCabinet?.freeSpins || 0) > 0) {
        setTimeout(() => {
          if (!this.disposed && !this.spinning && (this.autoRemaining > 0 || (this.hall?.myCabinet?.freeSpins || 0) > 0)) {
            this.triggerSpin();
          }
        }, spin.totalWin > 0 ? 1150 : 450);
      }
    }
  }

  _clearPaylines() {
    if (!this.paylineGroup) return;
    while (this.paylineGroup.children.length) {
      const m = this.paylineGroup.children.pop();
      m.geometry?.dispose?.();
      m.material?.dispose?.();
    }
  }

  _buildPaylineHighlights(spin) {
    this._clearPaylines();
    if (!this.paylineGroup || !spin?.winningLines?.length) return;

    spin.winningLines.forEach((wl, idx) => {
      const colHex = PAYLINE_COLORS[wl.lineIndex % PAYLINE_COLORS.length];
      const pts = wl.rows.map((row, reel) => getCellAnchorWorld(reel, row));
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 24, 0.011, 8, false),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(colHex),
          transparent: true,
          opacity: idx === 0 ? 0.92 : 0.32,
        }),
      );
      tube.userData.lineIdx = idx;
      this.paylineGroup.add(tube);
    });
    this.paylineCycleIdx = 0;
    this.paylineCycleTimer = 0;
  }

  _spawnCoinShower(count = 20) {
    if (!this.coinsGroup) return;
    const coinGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.008, 16);
    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0x713f12,
      emissiveIntensity: 0.4,
      roughness: 0.16,
      metalness: 0.92,
    });
    for (let i = 0; i < count; i += 1) {
      const m = new THREE.Mesh(coinGeo, coinMat);
      m.position.set((Math.random() - 0.5) * 0.7, 0.34, 0.54 + Math.random() * 0.12);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      this.coinsGroup.add(m);
      this.winCoins.push({
        mesh: m,
        vx: (Math.random() - 0.5) * 1.1,
        vy: 1.4 + Math.random() * 1.4,
        vz: 0.45 + Math.random() * 0.7,
        life: 0,
        maxLife: 1.6,
      });
    }
  }

  _renderHUD() {
    const h = this.hall;
    if (!h) return;
    const cab = h.myCabinet;

    this.els["jackpot-pill"].textContent = `💎 VIP JACKPOT: ${Math.round(h.jackpotPool || 25000).toLocaleString("tr-TR")} 💰`;
    this.els["bank-pill"].textContent = this.isSpectator
      ? "👁 İzleyici Modu"
      : `💰 ${(cab?.chips || 0).toLocaleString("tr-TR")} Fiş`;

    const rebuyBtn = this.root.querySelector('[data-act="rebuy"]');
    if (rebuyBtn) {
      rebuyBtn.hidden = !(cab && cab.chips < 100 && cab.freeSpins === 0);
    }

    const specBtn = this.root.querySelector('[data-act="spectate-toggle"]');
    if (specBtn) {
      specBtn.hidden = false;
      specBtn.textContent = this.isSpectator ? "Kabin Aç 🎰" : "İzle 👁";
    }

    const fsBanner = this.els["fs-banner"];
    if (cab && cab.freeSpins > 0) {
      fsBanner.textContent = `⭐ ÜCRETSİZ ÇEVİRME: ${cab.freeSpins} KALAN · ×${cab.freeSpinMult} ÇARPAN`;
      fsBanner.hidden = false;
    } else {
      fsBanner.hidden = true;
    }

    // Gamble Bar
    const gambleBar = this.els["gamble-bar"];
    if (!this.spinning && cab && cab.pendingGambleWin > 0) {
      const cardInfo = cab.lastGambleCard
        ? ` · Son Kart: ${cab.lastGambleCard.rank}${cab.lastGambleCard.suit}`
        : "";
      gambleBar.innerHTML = `
        <span class="sl-gamble-label">🃏 Kazancı Katla (${cab.pendingGambleWin.toLocaleString("tr-TR")} → ${(cab.pendingGambleWin * 2).toLocaleString("tr-TR")})${cardInfo}</span>
        <div class="sl-gamble-actions">
          <button type="button" class="button small sl-gamble-red" data-gamble="red">♥♦ Kırmızı</button>
          <button type="button" class="button small sl-gamble-black" data-gamble="black">♠♣ Siyah</button>
          <button type="button" class="button small primary" data-gamble="collect">Kasaya Al 💰</button>
        </div>
      `;
      gambleBar.hidden = false;
    } else {
      gambleBar.hidden = true;
    }

    this._renderStakes();

    // Spin button styling
    const spinBtn = this.root.querySelector('[data-act="spin"]');
    if (spinBtn) {
      spinBtn.classList.toggle("is-free-spin", !!(cab && cab.freeSpins > 0));
      const titleEl = spinBtn.querySelector(".sl-spin-title");
      if (titleEl) titleEl.textContent = cab?.freeSpins > 0 ? "⭐ ÜCRETSİZ ÇEVİR" : "ÇEVİR";
    }

    // Status strip
    if (!this.spinning && cab?.lastSpin && cab.lastSpin.totalWin > 0) {
      const wl = cab.lastSpin.winningLines || [];
      this.els["status-strip"].textContent =
        `🎉 ${wl.length} Hat Kazandı · Toplam +${cab.lastSpin.totalWin.toLocaleString("tr-TR")} Fiş` +
        (cab.lastSpin.scatterPay > 0 ? ` (+${cab.lastSpin.scatterPay} Scatter)` : "");
    } else if (!this.spinning) {
      this.els["status-strip"].textContent =
        "20 Sabit Ödeme Hattı · 👑 WILD (Joker) tüm normal sembollerin yerine geçer · 3× ⭐ = 10 Ücretsiz Çevirme (×2)";
    }

    // Salon Players & Big Wins Feed
    this.els["players-count"].textContent = `${h.playerCount || 0} Oyuncu`;
    const pList = this.els["players-list"];
    pList.innerHTML = "";
    const now = Date.now();
    for (const p of h.players || []) {
      const row = document.createElement("div");
      row.className = `sl-player-row ${p.userId === this.mySocketId ? "me" : ""}`;
      const rTxt =
        p.reaction && now - p.reaction.at < 4500
          ? `<span class="rl-seat-react">${this._esc(p.reaction.emoji)}</span>`
          : "";
      row.innerHTML = `
        <span class="sl-p-name">${this._esc(p.name)}</span>
        ${rTxt}
        <span class="sl-p-fs">${p.freeSpins > 0 ? `⭐${p.freeSpins}` : ""}</span>
        <span class="sl-p-chips">${p.chips.toLocaleString("tr-TR")} 💰</span>
      `;
      pList.append(row);
    }

    const wList = this.els["wins-list"];
    wList.innerHTML = "";
    const wins = h.liveWins || [];
    if (wins.length === 0) {
      wList.innerHTML = `<div class="sl-win-empty">Büyük kazançlar burada canlı yayınlanır!</div>`;
    } else {
      for (const w of wins) {
        const row = document.createElement("div");
        row.className = `sl-win-row tier-${w.tier}`;
        row.innerHTML = `
          <strong>${this._esc(w.name)}</strong>
          <span>+${w.payout.toLocaleString("tr-TR")} 💰${w.freeSpinsWon ? ` · ⭐${w.freeSpinsWon}` : ""}</span>
        `;
        wList.append(row);
      }
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
      this._animateScene(dt);
      if (!this.force2D && !this.webglFailed && this.renderer && this.scene && this.camera) {
        this.controls?.update();
        this.renderer.render(this.scene, this.camera);
      } else {
        this._render2DCanvas();
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  _animateScene(dt) {
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

    // Chrome lever pull animation
    if (this.leverMesh) {
      if (this.leverAnim > 0) {
        this.leverAnim = Math.max(0, this.leverAnim - dt * 2.2);
        const swing = Math.sin(this.leverAnim * Math.PI) * 0.85;
        this.leverMesh.rotation.x = swing;
      } else {
        this.leverMesh.rotation.x *= Math.max(0, 1 - dt * 10);
      }
    }

    // Physical 5-reel rotational cascade + bounce
    const now = performance.now();
    let anySpinning = false;
    let teaseActive = false;

    for (const reel of this.reels) {
      if (!reel.spinning) continue;
      anySpinning = true;
      const total = Math.max(1, reel.stopAt - reel.startAt);
      const p = Math.min(1, Math.max(0, (now - reel.startAt) / total));

      // Trigger anticipation tease spotlight when approaching final teased reels
      if (reel.needsTease && !reel.teased && p > 0.62) {
        reel.teased = true;
        playSlotTease();
      }
      if (reel.needsTease && p > 0.55 && p < 1) {
        teaseActive = true;
      }

      if (p < 1) {
        // Ease-out with crisp subtle Vegas overshoot right at 0.94..1.0
        const backOut = 1 + 1.15 * Math.pow(p - 1, 3) + 0.5 * Math.pow(p - 1, 2);
        reel.angle = reel.startAngle + (reel.targetAngle - reel.startAngle) * Math.min(1.035, backOut);
        reel.mesh.rotation.x = reel.angle;
      } else {
        reel.angle = reel.targetAngle;
        reel.mesh.rotation.x = reel.angle;
        reel.spinning = false;
        reel.locked = true;
        playSlotReelStop(reel.index);
      }
    }

    if (this.reelSpot) {
      this.reelSpot.color.setHex(teaseActive ? 0xf59e0b : 0xffe09a);
      this.reelSpot.intensity = teaseActive ? 5.2 : 3.2;
    }

    if (this.activeSpinAnim && !anySpinning) {
      const done = this.activeSpinAnim;
      this.activeSpinAnim = null;
      this._finishSpinSequence(done);
    }

    // Cycle highlighted winning payline tubes
    if (this.paylineGroup && this.paylineGroup.children.length > 1) {
      this.paylineCycleTimer += dt;
      if (this.paylineCycleTimer >= 1.05) {
        this.paylineCycleTimer = 0;
        this.paylineCycleIdx = (this.paylineCycleIdx + 1) % this.paylineGroup.children.length;
        this.paylineGroup.children.forEach((m, idx) => {
          m.material.opacity = idx === this.paylineCycleIdx ? 0.95 : 0.2;
        });
      }
    }

    // Coin shower fountain physics with chrome coin-tray bounce
    if (this.winCoins.length) {
      const keep = [];
      for (const c of this.winCoins) {
        c.life += dt;
        c.vy -= 6.8 * dt;
        c.mesh.position.x += c.vx * dt;
        c.mesh.position.y += c.vy * dt;
        c.mesh.position.z += c.vz * dt;
        if (c.mesh.position.y <= 0.14 && c.vy < 0 && c.mesh.position.z > 0.1) {
          c.mesh.position.y = 0.14;
          c.vy = Math.abs(c.vy) * 0.46;
          c.vx *= 0.72;
          c.vz *= 0.72;
        }
        c.mesh.rotation.x += dt * 9;
        c.mesh.rotation.y += dt * 7;
          if (c.life < c.maxLife && c.mesh.position.y > -0.25) {
            keep.push(c);
          } else {
            this.coinsGroup?.remove(c.mesh);
          }
        }
        this.winCoins = keep;
      }
    }

    _render2DCanvas() {
      const canvas = this.els.canvas2d;
      if (!canvas || canvas.hidden) return;
      const stage = this.root.querySelector(".slot-stage");
      const w = Math.max(260, stage.clientWidth);
      const h = Math.max(210, stage.clientHeight);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, w, h);

      // Sleek 2D cabinet fallback
      ctx.fillStyle = "#170e20";
      ctx.fillRect(0, 0, w, h);
      const gridW = Math.min(w - 28, h * 1.72);
      const gridH = gridW * 0.56;
      const ox = (w - gridW) * 0.5;
      const oy = (h - gridH) * 0.5;
      const cw = gridW / 5;
      const ch = gridH / 3;

      ctx.strokeStyle = "#e3b857";
      ctx.lineWidth = 4;
      ctx.strokeRect(ox - 4, oy - 4, gridW + 8, gridH + 8);

      const grid = this.hall?.myCabinet?.lastSpin?.grid || [
        ["CHERRY", "BELL", "777", "BAR", "LEMON"],
        ["WILD", "BAR", "777", "BELL", "SCATTER"],
        ["ORANGE", "PLUM", "GRAPE", "CHERRY", "BELL"],
      ];
      for (let r = 0; r < 5; r += 1) {
        for (let row = 0; row < 3; row += 1) {
          const sym = this.reels[r]?.spinning
            ? SYMBOL_ORDER[Math.floor((performance.now() / 80 + r * 3 + row) % SYMBOL_ORDER.length)]
            : grid[row]?.[r] || "CHERRY";
          ctx.save();
          ctx.translate(ox + r * cw + cw * 0.5, oy + row * ch + ch * 0.5);
          drawSlotIcon(ctx, sym, Math.min(cw, ch) * 0.9);
          ctx.restore();
        }
      }
    }

    getPaytableMeta() {
      return { SYMBOL_LABELS, iconUrls: this.iconUrls };
    }

    dispose() {
      this.disposed = true;
      if (this.rafId) cancelAnimationFrame(this.rafId);
      if (this._onKeyDown) window.removeEventListener("keydown", this._onKeyDown);
      this._resizeObs?.disconnect?.();
      this.controls?.dispose?.();
      if (this.renderer) this.renderer.dispose();
      this.container.innerHTML = "";
    }
  }
