import * as THREE from "../vendor/three/three.module.js";
import { OrbitControls } from "../vendor/three/OrbitControls.js";
import { GLTFLoader } from "../vendor/three/GLTFLoader.js";
import { clone as cloneSkeleton } from "../vendor/three/SkeletonUtils.js";
import {
  playCard,
  playWin,
  playTurnChime,
  playCountdownTick,
  playLiarCall,
  playRevolverSpin,
  playRevolverClick,
  playRevolverShot,
  isSfxMuted,
  toggleSfxMute,
} from "./sfx.mjs";

const TABLE_RADIUS = 2.12;
const TABLE_TOP_Y = 0.88;
const SEAT_RADIUS = 2.56;
const SEAT_POSITIONS = [
  { x: 0, z: SEAT_RADIUS, rotY: Math.PI }, // South (Camera near side)
  { x: -SEAT_RADIUS, z: 0, rotY: Math.PI * 0.5 }, // West
  { x: 0, z: -SEAT_RADIUS, rotY: 0 }, // North
  { x: SEAT_RADIUS, z: 0, rotY: -Math.PI * 0.5 }, // East
];
const HIDE_EQUIP_RE = /^(1H_|2H_|.*Shield|.*Crossbow|Knife|Throwable|Spellbook|Mug)/i;

const RANK_INFO = {
  A: { title: "AS", symbol: "A", accent: "#fbbf24", sub: "ASLAR MASASI", badge: "A" },
  K: { title: "PAPAZ", symbol: "K", accent: "#f87171", sub: "PAPAZLAR MASASI", badge: "K" },
  Q: { title: "KIZ", symbol: "Q", accent: "#f472b6", sub: "KIZLAR MASASI", badge: "Q" },
  JOKER: { title: "JOKER", symbol: "★", accent: "#34d399", sub: "HER KART YERİNE GEÇER", badge: "★" },
  DEVIL: { title: "ŞEYTAN", symbol: "😈", accent: "#ef4444", sub: "YALNIZ TEK ATILIR!", badge: "😈" },
};

const ASSET_BASE = new URL("../assets/models/blof/", import.meta.url).href;
const gltfLoader = new GLTFLoader();
const modelCache = new Map();

function loadCachedGLB(fileName) {
  if (!modelCache.has(fileName)) {
    modelCache.set(
      fileName,
      new Promise((resolve, reject) => {
        gltfLoader.load(
          ASSET_BASE + fileName,
          (gltf) => resolve(gltf),
          undefined,
          (err) => reject(err),
        );
      }),
    );
  }
  return modelCache.get(fileName);
}

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "") node.textContent = String(text);
  return node;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createBlofCardTexture(rank, faceUp = true) {
  const w = 256;
  const h = 360;
  const cvs = document.createElement("canvas");
  cvs.width = w;
  cvs.height = h;
  const ctx = cvs.getContext("2d");

  if (!faceUp) {
    // Ornate dive-bar oxblood & dark gold card back
    const grd = ctx.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, "#3a0d12");
    grd.addColorStop(0.5, "#5c141d");
    grd.addColorStop(1, "#2a090d");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "#d4a44a";
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.lineWidth = 2;
    ctx.strokeRect(22, 22, w - 44, h - 44);

    // Subtle diamond crosshatch
    ctx.strokeStyle = "rgba(212, 164, 74, 0.18)";
    ctx.lineWidth = 2;
    for (let y = 32; y < h - 32; y += 26) {
      for (let x = 32; x < w - 32; x += 26) {
        ctx.strokeRect(x, y, 14, 14);
      }
    }

    ctx.fillStyle = "#e5bd67";
    ctx.font = "bold 46px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BLÖF", w / 2, h / 2 - 14);
    ctx.font = "bold 20px system-ui, sans-serif";
    ctx.fillStyle = "rgba(245, 224, 175, 0.78)";
    ctx.fillText("★ LIAR'S DECK ★", w / 2, h / 2 + 28);
  } else {
    const meta = RANK_INFO[rank] || RANK_INFO.A;
    const isDevil = rank === "DEVIL";
    const isJoker = rank === "JOKER";
    const bg = ctx.createLinearGradient(0, 0, w, h);
    if (isDevil) {
      bg.addColorStop(0, "#24060b");
      bg.addColorStop(1, "#570b17");
    } else if (isJoker) {
      bg.addColorStop(0, "#0b241c");
      bg.addColorStop(1, "#143d2e");
    } else {
      bg.addColorStop(0, "#f5ead6");
      bg.addColorStop(1, "#dfd0b4");
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = meta.accent;
    ctx.lineWidth = 9;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    const ink = isDevil ? "#fca5a5" : isJoker ? "#a7f3d0" : "#1c130e";
    ctx.fillStyle = ink;
    ctx.font = "bold 46px Georgia, serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(meta.badge, 24, 22);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 104px Georgia, serif";
    ctx.fillStyle = isDevil ? "#ff4d5a" : isJoker ? "#34d399" : rank === "K" ? "#991b1b" : rank === "Q" ? "#86198f" : "#1f2937";
    ctx.fillText(meta.symbol, w / 2, h / 2 - 16);

    ctx.font = "bold 30px Georgia, serif";
    ctx.fillStyle = ink;
    ctx.fillText(meta.title, w / 2, h / 2 + 64);

    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.fillStyle = isDevil || isJoker ? "rgba(255,255,255,0.72)" : "rgba(40,26,18,0.68)";
    ctx.fillText(meta.sub, w / 2, h - 42);
  }

  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createNameplateTexture(seat, isTurn = false, isTarget = false) {
  const w = 512;
  const h = 128;
  const cvs = document.createElement("canvas");
  cvs.width = w;
  cvs.height = h;
  const ctx = cvs.getContext("2d");

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = !seat.alive
    ? "rgba(28, 10, 12, 0.9)"
    : isTarget
      ? "rgba(127, 29, 29, 0.94)"
      : isTurn
        ? "rgba(62, 42, 12, 0.95)"
        : "rgba(15, 11, 10, 0.88)";
  ctx.beginPath();
  ctx.roundRect(10, 10, w - 20, h - 20, 22);
  ctx.fill();

  ctx.lineWidth = isTurn || isTarget ? 6 : 3;
  ctx.strokeStyle = !seat.alive
    ? "#ef4444"
    : isTarget
      ? "#ff3b4e"
      : isTurn
        ? "#f59e0b"
        : seat.color || "#9ca3af";
  ctx.stroke();

  ctx.fillStyle = !seat.alive ? "#fca5a5" : "#faf5ea";
  ctx.font = "bold 34px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const prefix = !seat.alive ? "💀 " : isTarget ? "🔫 " : isTurn ? "▶ " : "";
  const label = `${prefix}${seat.name}`.slice(0, 20);
  ctx.fillText(label, 30, 44);

  ctx.fillStyle = !seat.alive ? "#f87171" : "#d6c3a5";
  ctx.font = "600 24px system-ui, sans-serif";
  const sub = !seat.alive
    ? `ELENDİ (${seat.revolverOdds})`
    : `${seat.characterName || "Oyuncu"} · 🃏 ${seat.cardCount || 0} · 🔫 ${seat.revolverOdds}`;
  ctx.fillText(sub, 30, 86);

  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRevolverRig() {
  const root = new THREE.Group();
  root.name = "revolver_root";

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x3b424c,
    metalness: 0.88,
    roughness: 0.28,
  });
  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x1b1f26,
    metalness: 0.85,
    roughness: 0.35,
  });
  const walnutMat = new THREE.MeshStandardMaterial({
    color: 0x4b2616,
    metalness: 0.08,
    roughness: 0.72,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4a33b,
    metalness: 0.92,
    roughness: 0.24,
  });
  const spentMat = new THREE.MeshStandardMaterial({
    color: 0x2f2b26,
    metalness: 0.65,
    roughness: 0.65,
  });

  // Barrel & top rib extending +Z
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.44, 14), steelMat);
  barrel.rotation.x = Math.PI * 0.5;
  barrel.position.set(0, 0.06, 0.26);
  barrel.castShadow = true;
  root.add(barrel);

  const underLug = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.042, 0.38), darkSteelMat);
  underLug.position.set(0, 0.028, 0.24);
  root.add(underLug);

  const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.034, 0.045), darkSteelMat);
  frontSight.position.set(0, 0.105, 0.45);
  root.add(frontSight);

  // Frame
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.15, 0.22), steelMat);
  frame.position.set(0, 0.03, -0.02);
  frame.castShadow = true;
  root.add(frame);

  // Top strap
  const topStrap = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.022, 0.18), steelMat);
  topStrap.position.set(0, 0.125, -0.01);
  root.add(topStrap);

  // Walnut grip
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.22, 0.095), walnutMat);
  grip.position.set(0, -0.1, -0.13);
  grip.rotation.x = -0.34;
  grip.castShadow = true;
  root.add(grip);

  // Trigger guard + trigger
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.009, 8, 18), darkSteelMat);
  guard.rotation.y = Math.PI * 0.5;
  guard.position.set(0, -0.042, 0.01);
  root.add(guard);

  const triggerPivot = new THREE.Group();
  triggerPivot.position.set(0, -0.02, 0.022);
  const triggerBlade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.048, 0.018), darkSteelMat);
  triggerBlade.position.set(0, -0.02, -0.006);
  triggerBlade.rotation.x = 0.25;
  triggerPivot.add(triggerBlade);
  root.add(triggerPivot);

  // Hammer pivot
  const hammerPivot = new THREE.Group();
  hammerPivot.position.set(0, 0.085, -0.12);
  const hammerBody = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.068, 0.036), darkSteelMat);
  hammerBody.position.set(0, 0.026, -0.01);
  hammerBody.rotation.x = -0.35;
  hammerPivot.add(hammerBody);
  root.add(hammerPivot);

  // Articulated 6-Chamber Spinning Cylinder!
  const cylinderPivot = new THREE.Group();
  cylinderPivot.position.set(0, 0.056, 0.005);
  const cylBody = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.135, 18), darkSteelMat);
  cylBody.rotation.x = Math.PI * 0.5;
  cylBody.castShadow = true;
  cylinderPivot.add(cylBody);

  const chambers = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const r = 0.04;
    const brassCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.142, 10),
      brassMat.clone(),
    );
    brassCap.rotation.x = Math.PI * 0.5;
    brassCap.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
    cylinderPivot.add(brassCap);
    chambers.push({ cap: brassCap, brassMat, spentMat });
  }
  root.add(cylinderPivot);

  // Muzzle Flash + Smoke Ring
  const muzzleGroup = new THREE.Group();
  muzzleGroup.position.set(0, 0.06, 0.52);
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffb347,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const starGeo = new THREE.PlaneGeometry(0.38, 0.38);
  const star1 = new THREE.Mesh(starGeo, flashMat);
  const star2 = new THREE.Mesh(starGeo, flashMat);
  star2.rotation.z = Math.PI * 0.25;
  muzzleGroup.add(star1, star2);

  const flashLight = new THREE.PointLight(0xff9b38, 0, 6.5, 1.5);
  muzzleGroup.add(flashLight);

  const smokeMat = new THREE.MeshStandardMaterial({
    color: 0x9ca3af,
    transparent: true,
    opacity: 0,
    roughness: 1,
    depthWrite: false,
  });
  const smokeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), smokeMat);
  muzzleGroup.add(smokeMesh);
  root.add(muzzleGroup);

  root.scale.setScalar(1.38);

  return {
    root,
    cylinderPivot,
    hammerPivot,
    triggerPivot,
    chambers,
    muzzleGroup,
    flashMat,
    flashLight,
    smokeMesh,
    smokeMat,
  };
}

export class BlofArena {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.cb = callbacks;
    this.table = null;
    this.userId = null;
    this.spectator = false;
    this.selectedIds = new Set();
    this.force2D = false;
    this.webglFailed = false;
    this.cameraMode = "masadan";
    this.disposed = false;
    this._lastActionSeq = -1;
    this._lastPlaySeq = -1;
    this._lastShotSeq = -1;
    this._lastCountdownTick = -1;
    this._countdownRaf = null;
    this._camPos = new THREE.Vector3(0, 3.15, 5.1);
    this._camLook = new THREE.Vector3(0, 0.92, -0.1);
    this._camGlide = false;
    this._shakeTimer = 0;
    this._shotAnim = {
      active: false,
      elapsed: 0,
      hit: false,
      targetSeat: -1,
    };

    this._buildDom();
    this._init3D();
    this._bindEvents();
  }

  _buildDom() {
    this.container.replaceChildren();
    this.rootEl = el("div", "blof-arena");

    // Top bar
    this.topBar = el("div", "blof-topbar");
    const leftTop = el("div", "blof-top-group");
    this.titleBadge = el("span", "blof-badge-main", "🔫 BLÖF");
    this.modeBadge = el("span", "blof-pill", "KLASİK 20 KART");
    this.roundBadge = el("span", "blof-pill", "LOBİ");
    leftTop.append(this.titleBadge, this.modeBadge, this.roundBadge);

    this.tableTypeBanner = el("div", "blof-tabletype-pill", "MASA: BEKLENİYOR");

    const rightTop = el("div", "blof-top-group");
    this.pileBadge = el("span", "blof-pill", "Yığın: 0");
    this.camBtn = el("button", "button secondary compact", "🎥 Açı");
    this.viewBtn = el("button", "button secondary compact", "2D / 3D");
    this.sfxBtn = el("button", "button secondary compact", isSfxMuted() ? "🔇" : "🔊");
    this.helpBtn = el("button", "button secondary compact", "? Kurallar");
    this.leaveBtn = el("button", "button secondary compact danger-soft", "Masadan Kalk");
    rightTop.append(
      this.pileBadge,
      this.camBtn,
      this.viewBtn,
      this.sfxBtn,
      this.helpBtn,
      this.leaveBtn,
    );
    this.topBar.append(leftTop, this.tableTypeBanner, rightTop);

    // 3D Stage
    this.stageWrap = el("div", "blof-stage-wrap");
    this.canvas3d = el("canvas", "blof-canvas3d");
    this.canvas2d = el("canvas", "blof-canvas2d");
    this.canvas2d.hidden = true;

    // Dramatic overlaid HUD inside stage
    this.turnBanner = el("div", "blof-stage-hud-top");
    this.shotToastEl = el("div", "blof-shot-overlay");
    this.shotToastEl.hidden = true;
    this.revealStripEl = el("div", "blof-reveal-strip");
    this.revealStripEl.hidden = true;

    // Pre-Game Character Select & Ready Lobby Overlay
    this.lobbyOverlay = el("div", "blof-lobby-overlay");
    this.lobbyCard = el("div", "blof-lobby-card");
    this.lobbyOverlay.append(this.lobbyCard);

    // Post-Match Victory Overlay
    this.finishOverlay = el("div", "blof-lobby-overlay");
    this.finishOverlay.hidden = true;
    this.finishCard = el("div", "blof-lobby-card blof-finish-card");
    this.finishOverlay.append(this.finishCard);

    this.stageWrap.append(
      this.canvas3d,
      this.canvas2d,
      this.turnBanner,
      this.revealStripEl,
      this.shotToastEl,
      this.lobbyOverlay,
      this.finishOverlay,
    );

    // Compact Seats Strip
    this.seatsBar = el("div", "blof-seats-bar");

    // Bottom Interactive Hand & Actions Bar
    this.controlsBar = el("div", "blof-controls-bar");
    this.handWrap = el("div", "blof-hand-wrap");
    this.actionsWrap = el("div", "blof-actions-wrap");
    this.playBtn = el("button", "button primary blof-act-btn", "🃏 Kartları At");
    this.liarBtn = el("button", "button danger blof-liar-btn", "🚨 YALANCI!");
    this.triggerBtn = el("button", "button danger blof-trigger-btn", "🔫 TETİĞİ ÇEK!");
    this.triggerBtn.hidden = true;
    this.actionsWrap.append(this.playBtn, this.liarBtn, this.triggerBtn);
    this.controlsBar.append(this.handWrap, this.actionsWrap);

    this.rootEl.append(this.topBar, this.stageWrap, this.seatsBar, this.controlsBar);
    this.container.append(this.rootEl);
  }

  _bindEvents() {
    this.leaveBtn.addEventListener("click", () => this.cb.onLeave?.());
    this.helpBtn.addEventListener("click", () => this.cb.onHelp?.());
    this.sfxBtn.addEventListener("click", () => {
      const m = toggleSfxMute();
      this.sfxBtn.textContent = m ? "🔇" : "🔊";
    });
    this.viewBtn.addEventListener("click", () => {
      this.force2D = !this.force2D;
      this.viewBtn.textContent = this.force2D ? "3D Sahne" : "2D / 3D";
      this._syncVisibility();
      if (this.force2D || this.webglFailed) this._draw2D();
    });
    this.camBtn.addEventListener("click", () => {
      const order = ["masadan", "yakin", "genel"];
      const idx = (order.indexOf(this.cameraMode) + 1) % order.length;
      this.setCameraMode(order[idx], false);
    });
    this.playBtn.addEventListener("click", () => {
      const ids = Array.from(this.selectedIds);
      if (ids.length < 1 || ids.length > 3) return;
      this.cb.onPlay?.(ids);
      this.selectedIds.clear();
    });
    this.liarBtn.addEventListener("click", () => {
      this.cb.onCallLiar?.();
    });
    this.triggerBtn.addEventListener("click", () => {
      this.cb.onPullTrigger?.();
    });
  }

  _init3D() {
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas3d,
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
      this._syncVisibility();
      return;
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0604);
    this.scene.fog = new THREE.FogExp2(0x0c0705, 0.044);

    this.camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 60);
    this.camera.position.copy(this._camPos);

    this.controls = new OrbitControls(this.camera, this.canvas3d);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minPolarAngle = 0.25;
    this.controls.minDistance = 2.1;
    this.controls.maxDistance = 9.2;
    this.controls.target.copy(this._camLook);
    this.controls.addEventListener("start", () => {
      this._camGlide = false;
    });

    this._buildBarScene();
    this._resize();
    this._resizeObs = new ResizeObserver(() => this._resize());
    this._resizeObs.observe(this.stageWrap);

    this._lastTime = performance.now();
    const tick = (now) => {
      if (this.disposed) return;
      this.rafId = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - this._lastTime) / 1000);
      this._lastTime = now;
      this._updateScene(dt, now * 0.001);
      this.renderer.render(this.scene, this.camera);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  _buildBarScene() {
    // Smoky Dive-Bar Lighting — warm amber key + noir teal contrast rim + cozy lantern fill
    const hemi = new THREE.HemisphereLight(0x8e6240, 0x261710, 1.45);
    this.scene.add(hemi);

    // Overhead dangling swinging bar lamp + warm spotlight
    this.lampGroup = new THREE.Group();
    this.lampGroup.position.set(0, 4.4, 0);
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 1.35, 8),
      new THREE.MeshStandardMaterial({ color: 0x181512, metalness: 0.7 }),
    );
    cord.position.y = -0.65;
    this.lampGroup.add(cord);

    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.46, 0.28, 24, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x4d2d18,
        metalness: 0.65,
        roughness: 0.35,
        side: THREE.DoubleSide,
      }),
    );
    shade.position.y = -1.28;
    this.lampGroup.add(shade);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd28a }),
    );
    bulb.position.y = -1.32;
    this.lampGroup.add(bulb);

    this.overheadSpot = new THREE.SpotLight(0xffbe6b, 48, 18, Math.PI * 0.42, 0.55, 1.15);
    this.overheadSpot.position.set(0, -1.36, 0);
    this.overheadSpot.target.position.set(0, -3.55, 0);
    this.overheadSpot.castShadow = true;
    this.overheadSpot.shadow.mapSize.set(1024, 1024);
    this.lampGroup.add(this.overheadSpot);
    this.lampGroup.add(this.overheadSpot.target);

    // Volumetric smoky cone beam
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xffb866,
      transparent: true,
      opacity: 0.045,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const volCone = new THREE.Mesh(new THREE.ConeGeometry(2.45, 3.25, 24, 1, true), coneMat);
    volCone.position.y = -2.95;
    this.lampGroup.add(volCone);
    this.scene.add(this.lampGroup);

    // Warm rim & character face fill lights around the bar table
    const rimA = new THREE.PointLight(0xff8e42, 11, 14);
    rimA.position.set(-4.2, 2.7, -3.6);
    const rimB = new THREE.PointLight(0x528db8, 7.5, 14);
    rimB.position.set(4.4, 2.8, 3.5);
    const keyFront = new THREE.PointLight(0xffbe7a, 9, 12);
    keyFront.position.set(0, 2.85, 2.2);
    this.scene.add(rimA, rimB, keyFront);

    // Pub wooden plank floor + moody walls
    const floorGeo = new THREE.CylinderGeometry(11.5, 11.5, 0.2, 36);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a100b,
      roughness: 0.88,
      metalness: 0.05,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const enclosure = new THREE.Mesh(
      new THREE.CylinderGeometry(11.2, 11.2, 7.2, 32, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x170d08,
        roughness: 0.95,
        side: THREE.BackSide,
      }),
    );
    enclosure.position.y = 3.4;
    this.scene.add(enclosure);

    // Main Round Carved Mahogany + Oxblood Velvet Card Table
    const tableGroup = new THREE.Group();
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.72, 0.84, 18),
      new THREE.MeshStandardMaterial({ color: 0x26140c, roughness: 0.68 }),
    );
    pedestal.position.y = 0.42;
    pedestal.castShadow = true;
    tableGroup.add(pedestal);

    const woodRim = new THREE.Mesh(
      new THREE.CylinderGeometry(TABLE_RADIUS, TABLE_RADIUS * 0.96, 0.14, 48),
      new THREE.MeshStandardMaterial({ color: 0x3b1c0e, roughness: 0.48, metalness: 0.1 }),
    );
    woodRim.position.y = TABLE_TOP_Y - 0.06;
    woodRim.receiveShadow = true;
    woodRim.castShadow = true;
    tableGroup.add(woodRim);

    const velvetTop = new THREE.Mesh(
      new THREE.CylinderGeometry(TABLE_RADIUS - 0.17, TABLE_RADIUS - 0.17, 0.025, 48),
      new THREE.MeshStandardMaterial({ color: 0x4b1218, roughness: 0.9 }),
    );
    velvetTop.position.y = TABLE_TOP_Y + 0.01;
    velvetTop.receiveShadow = true;
    tableGroup.add(velvetTop);

    const goldRing = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 0.755, 48),
      new THREE.MeshStandardMaterial({
        color: 0xc9963a,
        metalness: 0.85,
        roughness: 0.25,
        side: THREE.DoubleSide,
      }),
    );
    goldRing.rotation.x = -Math.PI * 0.5;
    goldRing.position.y = TABLE_TOP_Y + 0.024;
    tableGroup.add(goldRing);
    this.scene.add(tableGroup);

    // Floating smoke motes drifting above bar table
    const moteCount = 90;
    const motePos = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i += 1) {
      motePos[i * 3] = (Math.random() - 0.5) * 8.5;
      motePos[i * 3 + 1] = 0.7 + Math.random() * 3.2;
      motePos[i * 3 + 2] = (Math.random() - 0.5) * 8.5;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
    this.smokePoints = new THREE.Points(
      moteGeo,
      new THREE.PointsMaterial({
        color: 0xffd7a3,
        size: 0.036,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      }),
    );
    this.scene.add(this.smokePoints);

    // Groups for Center Played Cards + Revealed Cards
    this.pileGroup = new THREE.Group();
    this.pileGroup.position.set(0, TABLE_TOP_Y + 0.03, 0);
    this.scene.add(this.pileGroup);

    // Articulated 6-Chamber Revolver Rig + Flying Card & Gunpowder Spark Groups
    this.flyingGroup = new THREE.Group();
    this.scene.add(this.flyingGroup);
    this.flyingCards = [];
    this.sparkParticles = [];
    this.flickerLights = [];
    this._revealAnimProgress = 1;

    this.revolver = createRevolverRig();
    this.revolver.root.position.set(0.32, TABLE_TOP_Y + 0.09, 0.42);
    this.revolver.root.rotation.set(0, 0.55, Math.PI * 0.48); // Resting sideways on felt
    this.scene.add(this.revolver.root);

    // Seat Anchors (Character seated flush in chair.glb at z=-0.35 facing +Z toward table)
    this.seatNodes = SEAT_POSITIONS.map((pos, idx) => {
      const grp = new THREE.Group();
      grp.position.set(pos.x, 0, pos.z);
      grp.rotation.y = pos.rotY;

      const chairAnchor = new THREE.Group();
      chairAnchor.position.set(0, 0, -0.39);
      grp.add(chairAnchor);

      const charAnchor = new THREE.Group();
      charAnchor.position.set(0, 0, 0);
      grp.add(charAnchor);

      const nameplateMat = new THREE.SpriteMaterial({ transparent: true, opacity: 0 });
      const nameplate = new THREE.Sprite(nameplateMat);
      nameplate.position.set(0, 2.15, -0.22);
      nameplate.scale.set(1.16, 0.28, 1);
      grp.add(nameplate);

      const seatFill = new THREE.PointLight(0xffba73, 2.8, 3.8);
      seatFill.position.set(0, 1.85, 0.85);
      grp.add(seatFill);

      // Facedown hand stack indicator on table in front of each seat
      const handAnchor = new THREE.Group();
      handAnchor.position.set(0, TABLE_TOP_Y + 0.04, 1.02);
      grp.add(handAnchor);

      this.scene.add(grp);
      return {
        index: idx,
        group: grp,
        chairAnchor,
        charAnchor,
        handAnchor,
        nameplate,
        loadedModelFile: null,
        charMesh: null,
        mixer: null,
        actions: {},
        currentAction: null,
      };
    });

    // Asynchronously load local CC0 bar environment props & chairs (zero blocking!)
    this._populateBarProps();
  }

  _populateBarProps() {
    for (const node of this.seatNodes) {
      loadCachedGLB("chair.glb")
        .then((gltf) => {
          if (this.disposed) return;
          const chair = gltf.scene.clone(true);
          // chair.glb's backrest is on local +X, open front on -X -> +90deg Y places backrest at -Z (behind character)
          chair.rotation.y = Math.PI * 0.5;
          chair.scale.setScalar(1.05);
          chair.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          node.chairAnchor.clear();
          node.chairAnchor.add(chair);
        })
        .catch(() => { });
    }

    const props = [
      { file: "barrel.glb", pos: [-4.6, 0, -4.4], scale: 0.9, rotY: 0.5 },
      { file: "keg.glb", pos: [-3.4, 0, -5.0], scale: 0.85, rotY: 0.2 },
      { file: "barrel.glb", pos: [4.7, 0, -4.3], scale: 0.92, rotY: -0.4 },
      { file: "table_medium.glb", pos: [-5.8, 0, 2.8], scale: 0.82, rotY: 0.4 },
      { file: "table_medium.glb", pos: [5.8, 0, 2.2], scale: 0.82, rotY: -0.5 },
      { file: "torch_mounted.glb", pos: [-5.4, 2.35, -5.4], scale: 0.95, rotY: Math.PI * 0.25, light: true },
      { file: "torch_mounted.glb", pos: [5.4, 2.35, -5.4], scale: 0.95, rotY: -Math.PI * 0.25, light: true },
      { file: "candle_triple.glb", pos: [-0.95, TABLE_TOP_Y + 0.015, -1.24], scale: 0.48, rotY: 0.2, light: true },
      { file: "candle_lit.glb", pos: [1.18, TABLE_TOP_Y + 0.015, -1.08], scale: 0.55, rotY: 0.1, light: true },
      { file: "bottle_brown.glb", pos: [-1.42, TABLE_TOP_Y + 0.015, 0.95], scale: 0.42, rotY: 0.4 },
      { file: "bottle_green.glb", pos: [1.45, TABLE_TOP_Y + 0.015, -0.78], scale: 0.42, rotY: -0.7 },
      { file: "bottle_brown.glb", pos: [1.32, TABLE_TOP_Y + 0.015, 1.12], scale: 0.39, rotY: 1.1 },
    ];
    for (const p of props) {
      loadCachedGLB(p.file)
        .then((gltf) => {
          if (this.disposed) return;
          const clone = gltf.scene.clone(true);
          clone.scale.setScalar(p.scale);
          clone.position.set(p.pos[0], p.pos[1], p.pos[2]);
          clone.rotation.y = p.rotY;
          clone.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          this.scene.add(clone);
          if (p.light) {
            const fl = new THREE.PointLight(0xff9b3d, 3.2, 5.5);
            fl.position.set(p.pos[0], p.pos[1] + 0.38, p.pos[2]);
            this.scene.add(fl);
            this.flickerLights.push({ light: fl, base: 3.2, phase: p.pos[0] * 1.7 + p.pos[2] });
          }
        })
        .catch(() => { });
    }
  }

  _ensureSeatCharacter(seatNode, seat) {
    if (!seat) {
      seatNode.charAnchor.visible = false;
      seatNode.nameplate.visible = false;
      return;
    }
    seatNode.charAnchor.visible = true;
    seatNode.nameplate.visible = true;
    const modelFile = seat.characterModel || "Barbarian.glb";
    if (seatNode.loadedModelFile === modelFile) return;

    seatNode.loadedModelFile = modelFile;
    loadCachedGLB(modelFile)
      .then((gltf) => {
        if (this.disposed || seatNode.loadedModelFile !== modelFile) return;
        seatNode.charAnchor.clear();
        const model = cloneSkeleton(gltf.scene);
        // KayKit furniture (chair.glb) & characters share identical meter scale; hide overlapping combat weapons
        model.scale.setScalar(0.92);
        model.position.set(0, 0.08, 0);
        model.traverse((child) => {
          if (child.isMesh) {
            if (HIDE_EQUIP_RE.test(child.name)) {
              child.visible = false;
              return;
            }
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
          }
        });
        seatNode.charAnchor.add(model);
        seatNode.charMesh = model;
        seatNode.mixer = new THREE.AnimationMixer(model);
        seatNode.actions = {};
        for (const clip of gltf.animations || []) {
          seatNode.actions[clip.name] = seatNode.mixer.clipAction(clip);
        }
        seatNode.currentAction = null;
        this._playSeatAnim(seatNode, seat.alive ? "Sit_Chair_Idle" : "Death_A", true);
        seatNode.mixer.update(0.05);
      })
      .catch(() => { });
  }

  _playSeatAnim(seatNode, clipName, loopForever = true) {
    if (!seatNode?.mixer || !seatNode.actions) return;
    const action =
      seatNode.actions[clipName] ||
      seatNode.actions.Idle ||
      Object.values(seatNode.actions)[0];
    if (!action || seatNode.currentAction === action) return;
    if (seatNode.currentAction) {
      seatNode.currentAction.fadeOut(0.22);
    }
    action.reset();
    if (loopForever) {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
    } else {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    action.fadeIn(0.22).play();
    seatNode.currentAction = action;
  }

  _pulseSeatAnim(seatNode, clipName, returnClip = "Sit_Chair_Idle") {
    if (!seatNode?.mixer || !seatNode.actions?.[clipName]) return;
    const action = seatNode.actions[clipName];
    if (seatNode.currentAction && seatNode.currentAction !== action) {
      seatNode.currentAction.fadeOut(0.14);
    }
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = false;
    action.fadeIn(0.14).play();
    seatNode.currentAction = action;
    const onDone = (e) => {
      if (e.action === action) {
        seatNode.mixer.removeEventListener("finished", onDone);
        seatNode.currentAction = null;
        this._playSeatAnim(seatNode, returnClip, true);
      }
    };
    seatNode.mixer.addEventListener("finished", onDone);
  }

  _syncSceneEntities() {
    if (!this.scene || !this.table) return;
    const t = this.table;

    for (let i = 0; i < 4; i += 1) {
      const seat = t.seats[i];
      const node = this.seatNodes[i];
      this._ensureSeatCharacter(node, seat);

      if (!seat) {
        node.handAnchor.clear();
        continue;
      }

      const isTurn = t.status === "playing" && t.turnSeatIndex === i;
      const isTarget = t.status === "roulette" && t.rouletteTargetSeat === i;
      const isCameraNearSeat = i === Math.max(0, this.mySeatIndex());
      node.nameplate.visible = !isCameraNearSeat;
      if (!isCameraNearSeat) {
        const newTex = createNameplateTexture(seat, isTurn, isTarget);
        node.nameplate.material.map?.dispose();
        node.nameplate.material.map = newTex;
        node.nameplate.material.opacity = 1;
        node.nameplate.material.needsUpdate = true;
      }

      if (!seat.alive && node.currentAction !== node.actions?.Death_A) {
        this._playSeatAnim(node, "Death_A", false);
      } else if (seat.alive && isTarget) {
        this._playSeatAnim(node, "1H_Ranged_Aiming", true);
      } else if (seat.alive && node.actions?.Sit_Chair_Idle && node.currentAction === node.actions?.Death_A) {
        this._playSeatAnim(node, "Sit_Chair_Idle", true);
      }

      // Opponent card stack fan on table edge
      node.handAnchor.clear();
      const count = Math.min(5, seat.cardCount || 0);
      for (let c = 0; c < count; c += 1) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.006, 0.31),
          new THREE.MeshStandardMaterial({ color: 0x5c141d, roughness: 0.65 }),
        );
        const offset = (c - (count - 1) / 2) * 0.075;
        mesh.position.set(offset, c * 0.006, Math.abs(offset) * 0.14);
        mesh.rotation.y = -offset * 0.45;
        mesh.castShadow = true;
        node.handAnchor.add(mesh);
      }
    }

    // Center pile cards / Challenge reveal
    this.pileGroup.clear();
    const revealCards = t.rouletteReveal?.cards;
    if ((t.status === "roulette" || t.status === "shot_result") && revealCards?.length) {
      revealCards.forEach((card, idx) => {
        const tex = createBlofCardTexture(card.rank, true);
        const mat = [
          new THREE.MeshStandardMaterial({ color: 0x2a1812 }),
          new THREE.MeshStandardMaterial({ color: 0x2a1812 }),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 }),
          new THREE.MeshStandardMaterial({ color: 0x451218 }),
          new THREE.MeshStandardMaterial({ color: 0x2a1812 }),
          new THREE.MeshStandardMaterial({ color: 0x2a1812 }),
        ];
        const cardMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.01, 0.58), mat);
        const spread = (idx - (revealCards.length - 1) / 2) * 0.48;
        cardMesh.position.set(spread, 0.035 + idx * 0.008, 0);
        cardMesh.rotation.y = spread * 0.12;
        cardMesh.rotation.x = Math.PI * (1 - this._revealAnimProgress);
        cardMesh.castShadow = true;
        this.pileGroup.add(cardMesh);
      });
    } else if (t.pileCount > 0) {
      const backTex = createBlofCardTexture("A", false);
      const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.55 });
      const drawCount = Math.min(8, t.pileCount);
      for (let i = 0; i < drawCount; i += 1) {
        const cardMesh = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.008, 0.52), backMat);
        cardMesh.position.set(
          Math.sin(i * 2.1) * 0.14,
          i * 0.009,
          Math.cos(i * 1.7) * 0.14,
        );
        cardMesh.rotation.y = (i - drawCount / 2) * 0.34;
        cardMesh.castShadow = true;
        this.pileGroup.add(cardMesh);
      }
    }

    // Update brass chambers visual state for current roulette target or seat 0
    const inspectSeat =
      t.seats[t.rouletteTargetSeat >= 0 ? t.rouletteTargetSeat : Math.max(0, this.mySeatIndex())] ||
      t.seats[0];
    if (inspectSeat && this.revolver) {
      const pulls = inspectSeat.triggerPulls || 0;
      this.revolver.chambers.forEach((ch, idx) => {
        ch.cap.material = idx < pulls ? ch.spentMat : ch.brassMat;
      });
    }
  }

  _spawnCardThrow(seatIndex, count = 1) {
    if (!this.flyingGroup || !this.seatNodes?.[seatIndex]) return;
    const node = this.seatNodes[seatIndex];
    const origin = new THREE.Vector3();
    node.handAnchor.getWorldPosition(origin);
    const backTex = createBlofCardTexture("A", false);
    const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.52 });
    const n = Math.min(3, Math.max(1, count));
    for (let i = 0; i < n; i += 1) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.008, 0.52), backMat);
      mesh.position.copy(origin);
      mesh.castShadow = true;
      this.flyingGroup.add(mesh);
      this.flyingCards.push({
        mesh,
        from: origin.clone(),
        to: new THREE.Vector3(
          (i - (n - 1) / 2) * 0.14,
          TABLE_TOP_Y + 0.04 + i * 0.01,
          (Math.random() - 0.5) * 0.12,
        ),
        delay: i * 0.075,
        t: 0,
        dur: 0.38,
        spinY: (Math.random() - 0.5) * 3.8,
      });
    }
  }

  _spawnMuzzleSparks() {
    if (!this.flyingGroup || !this.revolver?.muzzleGroup) return;
    const origin = new THREE.Vector3();
    this.revolver.muzzleGroup.getWorldPosition(origin);
    const sparkGeo = new THREE.SphereGeometry(0.022, 6, 6);
    for (let i = 0; i < 24; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xfef08a : i % 3 === 1 ? 0xf97316 : 0xef4444,
        transparent: true,
        opacity: 1,
      });
      const m = new THREE.Mesh(sparkGeo, mat);
      m.position.copy(origin);
      this.flyingGroup.add(m);
      this.sparkParticles.push({
        mesh: m,
        vx: (Math.random() - 0.5) * 4.4,
        vy: 1.2 + Math.random() * 2.8,
        vz: (Math.random() - 0.5) * 4.4,
        life: 0,
        maxLife: 0.55 + Math.random() * 0.4,
      });
    }
  }

  _updateScene(dt, tSec) {
    // Gentle hanging lamp sway + dust motes float + candle/torch flicker
    if (this.lampGroup) {
      this.lampGroup.rotation.z = Math.sin(tSec * 0.7) * 0.024;
      this.lampGroup.rotation.x = Math.cos(tSec * 0.52) * 0.016;
    }
    if (this.smokePoints) {
      this.smokePoints.rotation.y = tSec * 0.035;
    }
    for (const fl of this.flickerLights || []) {
      fl.light.intensity = fl.base + Math.sin(tSec * 7.5 + fl.phase) * 0.38 + Math.sin(tSec * 14.3 + fl.phase) * 0.22;
    }

    // Challenge card flip ease-out
    if (this._revealAnimProgress < 1 && this.pileGroup) {
      this._revealAnimProgress = Math.min(1, this._revealAnimProgress + dt * 2.6);
      const easeFlip = 1 - Math.pow(1 - this._revealAnimProgress, 3);
      for (const child of this.pileGroup.children) {
        child.rotation.x = Math.PI * (1 - easeFlip);
        child.position.y = 0.035 + Math.sin(easeFlip * Math.PI) * 0.24;
      }
    }

    // Parabolic flying card arcs onto the pile
    if (this.flyingCards?.length) {
      const keep = [];
      for (const fc of this.flyingCards) {
        if (fc.delay > 0) {
          fc.delay -= dt;
          keep.push(fc);
          continue;
        }
        fc.t = Math.min(fc.dur, fc.t + dt);
        const u = fc.t / fc.dur;
        const ease = 1 - Math.pow(1 - u, 3);
        fc.mesh.position.lerpVectors(fc.from, fc.to, ease);
        fc.mesh.position.y += Math.sin(u * Math.PI) * 0.44;
        fc.mesh.rotation.y = fc.spinY * ease;
        fc.mesh.rotation.z = Math.sin(u * Math.PI) * 0.42;
        if (u < 1) keep.push(fc);
        else this.flyingGroup.remove(fc.mesh);
      }
      this.flyingCards = keep;
    }

    // Muzzle flash gunpowder sparks with gravity & table bounce
    if (this.sparkParticles?.length) {
      const keep = [];
      for (const sp of this.sparkParticles) {
        sp.life += dt;
        sp.vy -= 12.5 * dt;
        sp.mesh.position.x += sp.vx * dt;
        sp.mesh.position.y += sp.vy * dt;
        sp.mesh.position.z += sp.vz * dt;
        if (sp.mesh.position.y <= TABLE_TOP_Y + 0.03 && sp.vy < 0 && Math.hypot(sp.mesh.position.x, sp.mesh.position.z) < TABLE_RADIUS) {
          sp.mesh.position.y = TABLE_TOP_Y + 0.03;
          sp.vy = Math.abs(sp.vy) * 0.44;
          sp.vx *= 0.72;
          sp.vz *= 0.72;
        }
        sp.mesh.material.opacity = Math.max(0, 1 - sp.life / sp.maxLife);
        if (sp.life < sp.maxLife) keep.push(sp);
        else {
          this.flyingGroup.remove(sp.mesh);
          sp.mesh.material.dispose();
        }
      }
      this.sparkParticles = keep;
    }

    // Character skeletal animation mixers + subtle active-turn lean
    const turnIdx = this.table?.status === "playing" ? this.table.turnSeatIndex : -1;
    for (let i = 0; i < (this.seatNodes || []).length; i += 1) {
      const node = this.seatNodes[i];
      node.mixer?.update(dt);
      const targetLean = i === turnIdx && this.table?.seats?.[i]?.alive ? 0.08 : 0;
      if (node.charAnchor) {
        node.charAnchor.rotation.x += (targetLean - node.charAnchor.rotation.x) * Math.min(1, dt * 6);
      }
    }

    // Revolver glide & firing sequence animation
    if (this.revolver && this.table) {
      const t = this.table;
      const rev = this.revolver;
      if (this._shotAnim.active) {
        this._shotAnim.elapsed += dt;
        const p = this._shotAnim.elapsed;
        rev.hammerPivot.rotation.x = p < 0.09 ? -0.45 * (1 - p / 0.09) : 0;
        rev.triggerPivot.rotation.x = p < 0.15 ? 0.32 : 0;
        if (this._shotAnim.hit) {
          // Explosive BANG!
          const kick = p < 0.16 ? Math.sin((p / 0.16) * Math.PI) * 0.45 : Math.max(0, 0.35 - p) * 0.6;
          rev.root.rotation.x = -kick;
          const flashFade = Math.max(0, 1 - p / 0.18);
          rev.flashMat.opacity = flashFade;
          rev.flashLight.intensity = flashFade * 26;
          const smokeFade = Math.max(0, 1 - Math.max(0, p - 0.04) / 0.75);
          rev.smokeMat.opacity = smokeFade * 0.55;
          const sScale = 0.6 + p * 3.8;
          rev.smokeMesh.scale.setScalar(sScale);
          rev.smokeMesh.position.y = p * 0.55;
        } else {
          // Dry click jitter
          rev.root.rotation.x = p < 0.12 ? -0.06 * Math.sin((p / 0.12) * Math.PI) : 0;
          rev.flashMat.opacity = 0;
          rev.flashLight.intensity = 0;
          rev.smokeMat.opacity = 0;
        }
        if (p >= 1.1) {
          this._shotAnim.active = false;
          rev.flashMat.opacity = 0;
          rev.flashLight.intensity = 0;
          rev.smokeMat.opacity = 0;
          rev.smokeMesh.position.y = 0;
        }
      } else if (t.status === "roulette" && t.rouletteTargetSeat >= 0) {
        const sp = SEAT_POSITIONS[t.rouletteTargetSeat];
        const aimPos = new THREE.Vector3(sp.x * 0.52, TABLE_TOP_Y + 0.58, sp.z * 0.52);
        rev.root.position.lerp(aimPos, 1 - Math.exp(-8 * dt));
        rev.root.lookAt(sp.x, TABLE_TOP_Y + 1.05, sp.z);
        rev.cylinderPivot.rotation.z += dt * 15;
        rev.hammerPivot.rotation.x = -0.38;
      } else {
        const restPos = new THREE.Vector3(0.45, TABLE_TOP_Y + 0.09, 0.46);
        rev.root.position.lerp(restPos, 1 - Math.exp(-6 * dt));
        rev.root.rotation.x *= 1 - Math.min(1, dt * 6);
        rev.root.rotation.y += (0.55 - rev.root.rotation.y) * Math.min(1, dt * 6);
        rev.root.rotation.z += (Math.PI * 0.48 - rev.root.rotation.z) * Math.min(1, dt * 6);
        rev.hammerPivot.rotation.x = 0;
        rev.triggerPivot.rotation.x = 0;
      }
    }

    // Smooth camera glide + subtle shot recoil shake
    if (this._camGlide) {
      const k = 1 - Math.exp(-6.5 * dt);
      this.camera.position.lerp(this._camPos, k);
      this.controls.target.lerp(this._camLook, k);
      if (this.camera.position.distanceToSquared(this._camPos) < 0.001) {
        this._camGlide = false;
      }
    }
    this.controls?.update();

    if (this._shakeTimer > 0) {
      this._shakeTimer = Math.max(0, this._shakeTimer - dt);
      const amp = this._shakeTimer * 0.22;
      this.camera.position.x += (Math.random() - 0.5) * amp;
      this.camera.position.y += (Math.random() - 0.5) * amp;
    }
  }

  setCameraMode(mode, immediate = false) {
    this.cameraMode = mode;
    if (!this.camera || !this.controls) return;
    const narrow = (this.camera.aspect || 1.6) < 1.25;
    const myIdx = Math.max(0, this.mySeatIndex());
    const baseAngle = [0, -Math.PI * 0.5, Math.PI, Math.PI * 0.5][myIdx] || 0;
    const offAngle = baseAngle + 0.36; // Classic Liar's Bar over-the-shoulder perspective!
    const dist = mode === "yakin" ? (narrow ? 3.85 : 3.2) : mode === "genel" ? (narrow ? 6.6 : 5.8) : narrow ? 5.6 : 4.75;
    const height = mode === "yakin" ? (narrow ? 2.85 : 2.35) : mode === "genel" ? (narrow ? 4.4 : 3.85) : narrow ? 3.7 : 3.2;

    this._camPos.set(Math.sin(offAngle) * dist, height, Math.cos(offAngle) * dist);
    this._camLook.set(0, 1.0, 0);
    if (immediate) {
      this._camGlide = false;
      this.camera.position.copy(this._camPos);
      this.controls.target.copy(this._camLook);
      this.controls.update();
    } else {
      this._camGlide = true;
    }
  }

  _resize() {
    if (!this.renderer || !this.camera || this.webglFailed) return;
    const w = Math.max(240, this.stageWrap.clientWidth);
    const h = Math.max(200, this.stageWrap.clientHeight);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.2 ? 50 : 44;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.setCameraMode(this.cameraMode, true);
  }

  _syncVisibility() {
    const use2D = this.force2D || this.webglFailed;
    this.canvas3d.hidden = use2D;
    this.canvas2d.hidden = !use2D;
  }

  mySeatIndex() {
    if (!this.table || !this.userId) return -1;
    return (this.table.seats || []).findIndex((s) => s && s.id === this.userId);
  }

  update(table, userId, { spectator = false } = {}) {
    this.table = table;
    this.userId = userId;
    this.spectator = spectator;
    if (!table) return;

    this._handleEventsAndSounds(table);
    this._renderHUD();
    this._renderLobbyAndFinish();
    this._renderSeats();
    this._renderHandAndActions();
    this._syncSceneEntities();
    if (this.force2D || this.webglFailed) this._draw2D();
  }

  _handleEventsAndSounds(t) {
    if (t.lastPlay && t.lastPlay.seq !== this._lastPlaySeq) {
      const wasInitial = this._lastPlaySeq === -1;
      this._lastPlaySeq = t.lastPlay.seq;
      if (!wasInitial) {
        playCard();
        const node = this.seatNodes?.[t.lastPlay.seatIndex];
        this._pulseSeatAnim(node, "Throw");
        this._spawnCardThrow(t.lastPlay.seatIndex, t.lastPlay.count);
      }
    }

    if (t.status === "roulette" && t.lastAction && t.lastAction.seq !== this._lastActionSeq) {
      if (this._lastActionSeq !== -1 && t.rouletteReveal) {
        this._revealAnimProgress = 0;
        playLiarCall();
        playRevolverSpin();
      }
    }

    if (t.lastShot && t.lastShot.seq !== this._lastShotSeq) {
      const wasInit = this._lastShotSeq === -1;
      this._lastShotSeq = t.lastShot.seq;
      if (!wasInit) {
        this._shotAnim = {
          active: true,
          elapsed: 0,
          hit: t.lastShot.hit,
          targetSeat: t.lastShot.seatIndex,
        };
        if (t.lastShot.hit) {
          this._shakeTimer = 0.42;
          this._spawnMuzzleSparks();
          playRevolverShot();
          this._showShotFlash(`💥 PAT! ${t.lastShot.seatName} ELENDİ!`, "danger");
        } else {
          playRevolverClick();
          this._showShotFlash(`💨 TIK! ${t.lastShot.seatName} KURTULDU (${t.lastShot.oddsLabel})`, "safe");
          const node = this.seatNodes?.[t.lastShot.seatIndex];
          this._pulseSeatAnim(node, "Cheer");
        }
      }
    }

    if (t.status === "playing" && t.lastAction?.seq !== this._lastActionSeq) {
      const myIdx = this.mySeatIndex();
      if (this._lastActionSeq !== -1 && myIdx >= 0 && t.turnSeatIndex === myIdx) {
        playTurnChime();
      }
    }
    if (t.status === "finished" && t.lastAction?.seq !== this._lastActionSeq) {
      const myIdx = this.mySeatIndex();
      if (this._lastActionSeq !== -1 && myIdx >= 0 && t.winnerSeatIndex === myIdx) {
        playWin();
      }
    }
    if (t.lastAction) this._lastActionSeq = t.lastAction.seq;
  }

  _showShotFlash(text, tone) {
    this.shotToastEl.textContent = text;
    this.shotToastEl.className = `blof-shot-overlay ${tone}`;
    this.shotToastEl.hidden = false;
    clearTimeout(this._shotHideTimer);
    this._shotHideTimer = setTimeout(() => {
      if (!this.disposed) this.shotToastEl.hidden = true;
    }, 2400);
  }

  _renderHUD() {
    const t = this.table;
    this.modeBadge.textContent =
      t.mode === "devil" ? "😈 ŞEYTAN MODU (21 KART)" : "🔫 KLASİK (20 KART)";
    this.roundBadge.textContent =
      t.status === "waiting" || t.status === "countdown"
        ? `LOBİ (${t.seats.filter(Boolean).length}/4)`
        : `TUR ${t.round || 1}`;
    this.pileBadge.textContent = `Yığın: ${t.pileCount || 0} Kart`;

    const meta = RANK_INFO[t.tableType] || RANK_INFO.A;
    this.tableTypeBanner.innerHTML =
      t.status === "waiting" || t.status === "countdown"
        ? `<span>🎭 Karakter Seç &amp; Hazır Ol</span>`
        : `<span class="blof-tt-lbl">MASA KARTI:</span> <strong style="color:${meta.accent}">${meta.title} (${meta.symbol})</strong>`;

    // Turn / Reveal top banner
    let bannerHtml = "";
    if (t.status === "playing") {
      const activeSeat = t.seats[t.turnSeatIndex];
      const mine = activeSeat && activeSeat.id === this.userId;
      bannerHtml = `<span class="blof-turn-tag ${mine ? "mine" : ""}">${mine ? "🔥 SIRA SENDE" : `⏳ Sıra: ${esc(activeSeat?.name || "")}`
        }</span><span class="blof-last-msg">${esc(t.lastAction?.text || "")}</span>`;
    } else if (t.status === "roulette") {
      const target = t.seats[t.rouletteTargetSeat];
      const mine = target && target.id === this.userId;
      bannerHtml = `<span class="blof-turn-tag danger">🔫 RUS RULETİ · ${mine ? "SENİN SIRAN!" : esc(target?.name || "")
        }</span><span class="blof-last-msg">${esc(t.lastAction?.text || "")}</span>`;
    } else {
      bannerHtml = `<span class="blof-last-msg">${esc(t.lastAction?.text || "Lobi hazırlanıyor...")}</span>`;
    }
    this.turnBanner.innerHTML = bannerHtml;

    // Reveal Strip when cards flip during Yalancı! challenge
    if ((t.status === "roulette" || t.status === "shot_result") && t.rouletteReveal?.cards?.length) {
      const rev = t.rouletteReveal;
      const verdictText =
        rev.outcome === "devil"
          ? "😈 ŞEYTAN KARTI AÇILDI! DİĞERLERİ TETİĞİ ÇEKİYOR!"
          : rev.outcome === "bluff"
            ? "🚨 YALAN YAKALANDI!"
            : "✅ DOĞRU SÖYLEDİ — SUÇLAYAN YANDI!";
      const cardsHtml = rev.cards
        .map((c) => {
          const rm = RANK_INFO[c.rank] || RANK_INFO.A;
          const isTruth = c.rank === rev.tableType || c.rank === "JOKER";
          return `<span class="blof-rev-chip ${c.rank === "DEVIL" ? "devil" : isTruth ? "truth" : "lie"}">${rm.badge} ${rm.title}</span>`;
        })
        .join("");
      this.revealStripEl.innerHTML = `<div class="blof-rev-title">${verdictText}</div><div class="blof-rev-cards">${cardsHtml}</div>`;
      this.revealStripEl.hidden = false;
    } else {
      this.revealStripEl.hidden = true;
    }
  }

  _renderLobbyAndFinish() {
    const t = this.table;
    if (t.status === "waiting" || t.status === "countdown") {
      this.lobbyOverlay.hidden = false;
      this.finishOverlay.hidden = true;

      const mySeat = this.mySeatIndex() >= 0 ? t.seats[this.mySeatIndex()] : null;
      const isHost = t.hostId === this.userId;
      const seatedCount = t.seats.filter(Boolean).length;
      const readyCount = t.seats.filter((s) => s && s.ready).length;

      let countdownHtml = "";
      if (t.status === "countdown" && t.countdownEndsAt) {
        const remMs = Math.max(0, t.countdownEndsAt - Date.now());
        const sec = Math.max(1, Math.ceil(remMs / 1000));
        if (sec !== this._lastCountdownTick) {
          this._lastCountdownTick = sec;
          playCountdownTick(sec <= 1);
        }
        countdownHtml = `<div class="blof-countdown-box"><div class="blof-countdown-num">${sec}</div><div>HERKES HAZIR — OYUN BAŞLIYOR!</div></div>`;
        clearTimeout(this._countdownRaf);
        this._countdownRaf = setTimeout(() => {
          if (!this.disposed && this.table?.status === "countdown") {
            this._renderLobbyAndFinish();
          }
        }, 180);
      } else {
        this._lastCountdownTick = -1;
      }

      const seatsHtml = [0, 1, 2, 3]
        .map((i) => {
          const s = t.seats[i];
          if (!s) {
            return `<div class="blof-lobby-seat empty"><span>Koltuk ${i + 1}</span><small>Boş Koltuk</small></div>`;
          }
          const isMe = s.id === this.userId;
          return `<div class="blof-lobby-seat filled ${isMe ? "me" : ""}" style="border-color:${s.color}">
            <div class="blof-lseat-top">
              <strong>${esc(s.name)}</strong>
              <span class="blof-ready-dot ${s.ready ? "ok" : ""}">${s.ready ? "✅ Hazır" : "⏳ Seçiyor"}</span>
            </div>
            <small style="color:${s.color}">${esc(s.characterName)} · ${esc(s.characterTitle)}</small>
          </div>`;
        })
        .join("");

      const charsHtml = (t.characters || [])
        .map((ch) => {
          const owner = t.seats.find((s) => s && s.characterId === ch.id);
          const pickedByMe = mySeat && mySeat.characterId === ch.id;
          const lockedByOther = owner && (!mySeat || owner.id !== mySeat.id);
          return `<button type="button" class="blof-char-card ${pickedByMe ? "active" : ""} ${lockedByOther ? "taken" : ""}" data-char-id="${esc(ch.id)}" ${lockedByOther || !mySeat ? "disabled" : ""} style="--char-accent:${ch.color}">
            <div class="blof-char-name">${esc(ch.name)}</div>
            <div class="blof-char-sub">${esc(ch.title)}</div>
            <div class="blof-char-tag">${esc(ch.tagline)}</div>
            <div class="blof-char-status">${pickedByMe
              ? "✓ SEÇİLDİ"
              : lockedByOther
                ? `🔒 ${esc(owner.name)}`
                : "Seç"
            }</div>
          </button>`;
        })
        .join("");

      const hasBots = t.seats.some((s) => s && s.isBot);
      const canFill = seatedCount < 4;

      this.lobbyCard.innerHTML = `
        <div class="blof-lobby-head">
          <h2>🥃 BLÖF BARI · KARAKTER LOBİSİ</h2>
          <span class="blof-pill">Hazır: ${readyCount} / ${seatedCount} (Hedef 4 Kişi)</span>
        </div>
        ${countdownHtml}
        <div class="blof-lobby-seats">${seatsHtml}</div>
        <div class="blof-char-grid-title">Karakterini Seç (Masada Herkes Farklı Olur):</div>
        <div class="blof-char-grid">${charsHtml}</div>
        <div class="blof-lobby-actions">
          ${mySeat
          ? `<button type="button" class="button ${mySeat.ready ? "secondary" : "primary"} blof-ready-btn" data-act="ready">
                  ${mySeat.ready ? "✅ Hazırsın (İptal Et)" : "✋ HAZIR VER (Oyun Başlasın)"}
                 </button>`
          : `<span class="blof-pill">İzleyici Modu</span>`
        }
          ${isHost && t.status === "waiting"
          ? `<button type="button" class="button secondary" data-act="mode">${t.mode === "devil" ? "Mod: 😈 Şeytan (Değiştir)" : "Mod: 🃏 Klasik (Değiştir)"
          }</button>`
          : ""
        }
          ${mySeat && t.status === "waiting" && canFill
          ? `<button type="button" class="button secondary" data-act="fillBots">🤖 Boşları Botla 4'le</button>`
          : ""
        }
          ${isHost && t.status === "waiting" && hasBots
          ? `<button type="button" class="button secondary" data-act="removeBots">Botları Çıkar</button>`
          : ""
        }
        </div>
        <p class="blof-lobby-hint">Masadaki tüm oyuncular <strong>Hazır</strong> dediğinde oyun otomatik olarak <strong>3 saniye içinde</strong> başlar.</p>
      `;

      this.lobbyCard.querySelectorAll("[data-char-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.cb.onSelectCharacter?.(btn.dataset.charId);
        });
      });
      this.lobbyCard.querySelector("[data-act='ready']")?.addEventListener("click", () => {
        this.cb.onReady?.(!mySeat?.ready);
      });
      this.lobbyCard.querySelector("[data-act='fillBots']")?.addEventListener("click", () => {
        this.cb.onConfig?.("fillBots");
      });
      this.lobbyCard.querySelector("[data-act='removeBots']")?.addEventListener("click", () => {
        this.cb.onConfig?.("removeBots");
      });
      this.lobbyCard.querySelector("[data-act='mode']")?.addEventListener("click", () => {
        this.cb.onConfig?.("setMode", t.mode === "devil" ? "classic" : "devil");
      });
    } else if (t.status === "finished") {
      this.lobbyOverlay.hidden = true;
      this.finishOverlay.hidden = false;
      const winSeat = t.seats[t.winnerSeatIndex];
      const rowsHtml = t.seats
        .filter(Boolean)
        .map(
          (s) => `<div class="blof-fin-row ${s.alive ? "winner" : "dead"}">
            <span>${s.alive ? "🏆" : "💀"} <strong>${esc(s.name)}</strong> (${esc(s.characterName)})</span>
            <span>Kovan: ${s.triggerPulls}/6 · Blöf Avı: ${s.bluffsWon || 0}</span>
          </div>`,
        )
        .join("");

      this.finishCard.innerHTML = `
        <h2>🏆 HAYATTA KALAN ŞAMPİYON</h2>
        <div class="blof-winner-name" style="color:${winSeat?.color || "#fbbf24"}">${esc(winSeat?.name || "Kazanan")}</div>
        <p>${esc(winSeat?.characterName || "")} mermilerden kurtularak masanın tek hakimi oldu!</p>
        <div class="blof-fin-list">${rowsHtml}</div>
        <div class="blof-lobby-actions">
          ${this.mySeatIndex() >= 0 ? `<button type="button" class="button primary" data-act="rematch">Tekrar Oyna ↻</button>` : ""}
          <button type="button" class="button secondary" data-act="leave">Lobiden Ayrıl</button>
        </div>
      `;
      this.finishCard.querySelector("[data-act='rematch']")?.addEventListener("click", () => {
        this.cb.onRematch?.();
      });
      this.finishCard.querySelector("[data-act='leave']")?.addEventListener("click", () => {
        this.cb.onLeave?.();
      });
    } else {
      this.lobbyOverlay.hidden = true;
      this.finishOverlay.hidden = true;
    }
  }

  _renderSeats() {
    const t = this.table;
    this.seatsBar.replaceChildren();
    for (let i = 0; i < 4; i += 1) {
      const s = t.seats[i];
      if (!s) continue;
      const isTurn = t.status === "playing" && t.turnSeatIndex === i;
      const isRoulette = t.status === "roulette" && t.rouletteTargetSeat === i;
      const isMe = s.id === this.userId;
      const chip = el(
        "div",
        `blof-seat-chip ${isTurn ? "turn" : ""} ${isRoulette ? "roulette" : ""} ${!s.alive ? "eliminated" : ""} ${isMe ? "me" : ""}`,
      );
      chip.style.setProperty("--seat-accent", s.color || "#fbbf24");
      chip.innerHTML = `
        <div class="blof-schip-top">
          <strong>${s.alive ? "" : "💀 "}${esc(s.name)}</strong>
          <span class="blof-odds-pill">${esc(s.revolverOdds)}</span>
        </div>
        <div class="blof-schip-sub">
          <span>${esc(s.characterName)}</span>
          <span>${s.alive ? `🃏 ${s.cardCount}` : "ELENDİ"}</span>
        </div>
      `;
      this.seatsBar.append(chip);
    }
  }

  _renderHandAndActions() {
    const t = this.table;
    const myIdx = this.mySeatIndex();
    const mySeat = myIdx >= 0 ? t.seats[myIdx] : null;
    const myHand = mySeat?.hand || [];

    // Prune stale selected IDs that are no longer in hand
    const validSet = new Set(myHand.map((c) => c.id));
    for (const id of Array.from(this.selectedIds)) {
      if (!validSet.has(id)) this.selectedIds.delete(id);
    }

    const isMyTurn = t.status === "playing" && t.turnSeatIndex === myIdx && mySeat?.alive;
    const isMyRoulette = t.status === "roulette" && t.rouletteTargetSeat === myIdx && mySeat?.alive;

    this.handWrap.replaceChildren();
    if (!mySeat) {
      this.handWrap.append(el("span", "blof-hand-note", "👁 İzleyici olarak izliyorsunuz"));
    } else if (!mySeat.alive) {
      this.handWrap.append(el("span", "blof-hand-note dead", "💀 Vuruldunuz — turun sonunu izliyorsunuz"));
    } else if (myHand.length === 0) {
      this.handWrap.append(
        el(
          "span",
          "blof-hand-note safe",
          t.status === "playing" ? "✅ Elin bitti — bu tur güvendesin!" : "Kartlar dağıtılmayı bekliyor...",
        ),
      );
    } else {
      for (const card of myHand) {
        const meta = RANK_INFO[card.rank] || RANK_INFO.A;
        const selected = this.selectedIds.has(card.id);
        const matchesTable = card.rank === t.tableType || card.rank === "JOKER";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `blof-hand-card ${card.rank.toLowerCase()} ${selected ? "selected" : ""} ${matchesTable ? "truth" : ""}`;
        btn.disabled = !isMyTurn || t.mustCallLiar;
        btn.innerHTML = `
          <span class="blof-hc-rank">${esc(meta.badge)}</span>
          <span class="blof-hc-title">${esc(meta.title)}</span>
          ${card.rank === "DEVIL" ? `<span class="blof-hc-tag devil">TEK AT</span>` : matchesTable ? `<span class="blof-hc-tag truth">DOĞRU</span>` : `<span class="blof-hc-tag bluff">BLÖF</span>`}
        `;
        btn.addEventListener("click", () => {
          if (!isMyTurn || t.mustCallLiar) return;
          if (this.selectedIds.has(card.id)) {
            this.selectedIds.delete(card.id);
          } else {
            if (card.rank === "DEVIL") {
              this.selectedIds.clear();
              this.selectedIds.add(card.id);
            } else {
              // Deselect Devil if picking normal cards, enforce max 3 cards
              for (const existingId of Array.from(this.selectedIds)) {
                const cObj = myHand.find((x) => x.id === existingId);
                if (cObj?.rank === "DEVIL") this.selectedIds.delete(existingId);
              }
              if (this.selectedIds.size >= 3) {
                const first = this.selectedIds.values().next().value;
                this.selectedIds.delete(first);
              }
              this.selectedIds.add(card.id);
            }
          }
          this._renderHandAndActions();
        });
        this.handWrap.append(btn);
      }
    }

    // Action buttons state
    const selCount = this.selectedIds.size;
    const meta = RANK_INFO[t.tableType] || RANK_INFO.A;
    this.playBtn.hidden = isMyRoulette;
    this.liarBtn.hidden = isMyRoulette;
    this.triggerBtn.hidden = !isMyRoulette;

    this.playBtn.disabled = !isMyTurn || t.mustCallLiar || selCount < 1;
    this.playBtn.textContent =
      t.mustCallLiar
        ? "Son Kalan Sensin!"
        : selCount > 0
          ? `🃏 ${selCount}× ${meta.title} At`
          : `🃏 Kart Seç (1–3)`;

    this.liarBtn.disabled = !(isMyTurn && t.canCallLiar);
    this.liarBtn.textContent = t.mustCallLiar ? "🚨 YALANCI! (ZORUNLU)" : "🚨 YALANCI!";

    if (isMyRoulette) {
      this.triggerBtn.disabled = false;
      this.triggerBtn.textContent = `🔫 TETİĞİ ÇEK! (${mySeat?.revolverOdds || "1/6"})`;
    }
  }

  _draw2D() {
    const t = this.table;
    if (!t || !this.canvas2d) return;
    const w = Math.max(300, this.stageWrap.clientWidth);
    const h = Math.max(200, this.stageWrap.clientHeight);
    this.canvas2d.width = w;
    this.canvas2d.height = h;
    const ctx = this.canvas2d.getContext("2d");

    const bg = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, Math.max(w, h) * 0.7);
    bg.addColorStop(0, "#4b1218");
    bg.addColorStop(0.55, "#230c0d");
    bg.addColorStop(1, "#0d0605");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "#c9963a";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w * 0.34, h * 0.32, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#faf5ea";
    ctx.font = "bold 20px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(`2D Modu · Masa: ${t.tableTypeLabel} · Yığın: ${t.pileCount}`, w / 2, h / 2 - 8);
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.fillStyle = "#d6c3a5";
    ctx.fillText(t.lastAction?.text || "", w / 2, h / 2 + 22);
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this._shotHideTimer);
    clearTimeout(this._countdownRaf);
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this._resizeObs?.disconnect?.();
    this.controls?.dispose?.();
    this.renderer?.dispose?.();
  }
}
