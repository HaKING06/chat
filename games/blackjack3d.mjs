import * as THREE from "../vendor/three/three.module.js";
import { GLTFLoader } from "../vendor/three/GLTFLoader.js";
import { OrbitControls } from "../vendor/three/OrbitControls.js";
import { MeshoptDecoder } from "../vendor/three/meshopt_decoder.module.js";
import { playBlackjack, playCard, playChip, playDraw, playTick, playWin } from "./sfx.mjs";

const TABLE_Y = 0.8;
const CARD_W = 0.138;
const CARD_H = 0.194;
const CARD_T = 0.003;
const SEAT_COUNT = 6;
const SEAT_ANGLES = [-1.06, -0.64, -0.215, 0.215, 0.64, 1.06];
const ARC_CENTER_Z = -0.58;
const REACTIONS = ["🔥", "👏", "😎", "😱", "🍀", "💎"];
const CHIP_PRESETS = [10, 25, 50, 100, 250, 500];
const CHIP_DENOMS = [
  { val: 100, color: 0x1e2420, rim: 0xe6be53 },
  { val: 50, color: 0xb52b2b, rim: 0xf4efe4 },
  { val: 25, color: 0x168a51, rim: 0xf4efe4 },
  { val: 10, color: 0x1c65b8, rim: 0xf4efe4 },
];

const SUIT_SYMBOLS = { S: "♠", H: "♥", D: "♦", C: "♣" };
const OUTCOME_LABELS = {
  blackjack: "Blackjack!",
  win: "Kazandı",
  push: "Berabere",
  lose: "Kasa aldı",
  bust: "Patladı",
};

const cardTexCache = new Map();
let backTexCache = null;

function createCardBackTexture() {
  if (backTexCache) return backTexCache;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, 256, 360);

  ctx.fillStyle = "#172d22";
  ctx.fillRect(14, 14, 228, 332);

  ctx.strokeStyle = "#d8b454";
  ctx.lineWidth = 4;
  ctx.strokeRect(22, 22, 212, 316);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(30, 30, 196, 300);

  ctx.strokeStyle = "rgba(197, 242, 115, 0.22)";
  ctx.lineWidth = 1.2;
  for (let y = 36; y < 326; y += 22) {
    for (let x = 36; x < 222; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x + 9, y);
      ctx.lineTo(x + 18, y + 9);
      ctx.lineTo(x + 9, y + 18);
      ctx.lineTo(x, y + 9);
      ctx.closePath();
      ctx.stroke();
    }
  }

  ctx.fillStyle = "#d8b454";
  ctx.beginPath();
  ctx.arc(128, 180, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#13221a";
  ctx.beginPath();
  ctx.arc(128, 180, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c5f273";
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("HK", 128, 181);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  backTexCache = tex;
  return tex;
}

function getCardFaceTexture(card) {
  const key = card.id || `${card.rank}${card.suit}`;
  if (cardTexCache.has(key)) return cardTexCache.get(key);

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");

  const red = card.suit === "H" || card.suit === "D";
  const ink = red ? "#be1f2d" : "#151a17";
  const sym = SUIT_SYMBOLS[card.suit] || "♠";

  ctx.fillStyle = "#fbf8f0";
  ctx.fillRect(0, 0, 256, 360);

  ctx.strokeStyle = "#dfd7c3";
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 248, 352);

  ctx.strokeStyle = "rgba(180,168,140,0.28)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(18, 18, 220, 324);

  ctx.fillStyle = ink;
  ctx.font = "bold 40px Georgia, serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(card.rank, 22, 20);
  ctx.font = "34px serif";
  ctx.fillText(sym, 24, 62);

  ctx.save();
  ctx.translate(256, 360);
  ctx.rotate(Math.PI);
  ctx.font = "bold 40px Georgia, serif";
  ctx.fillText(card.rank, 22, 20);
  ctx.font = "34px serif";
  ctx.fillText(sym, 24, 62);
  ctx.restore();

  if (["J", "Q", "K"].includes(card.rank)) {
    ctx.strokeStyle = red ? "rgba(190,31,45,0.22)" : "rgba(21,26,23,0.18)";
    ctx.lineWidth = 3;
    ctx.strokeRect(62, 82, 132, 196);
    ctx.fillStyle = ink;
    ctx.font = "bold 88px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(card.rank, 128, 166);
    ctx.font = "44px serif";
    ctx.fillText(sym, 128, 232);
  } else {
    ctx.fillStyle = ink;
    ctx.font = card.rank === "A" ? "118px serif" : "92px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(sym, 128, 182);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cardTexCache.set(key, tex);
  return tex;
}

function createFeltTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");

  // World bounds mapped linearly onto this 2048x1024 canvas:
  // x in [-1.54, +1.54] -> px in [0, 2048]
  // z relative to ARC_CENTER_Z in [-0.04, +1.54] -> py in [0, 1024]
  const toX = (wx) => ((wx + 1.54) / 3.08) * 2048;
  const toY = (dz) => ((dz + 0.04) / 1.58) * 1024;
  const scalePx = 2048 / 3.08;

  const grad = ctx.createRadialGradient(toX(0), toY(0.18), 70, toX(0), toY(0.45), 1100);
  grad.addColorStop(0, "#15754c");
  grad.addColorStop(0.58, "#0b5134");
  grad.addColorStop(1, "#063621");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2048, 1024);

  ctx.fillStyle = "rgba(255,255,255,0.024)";
  for (let i = 0; i < 6000; i++) {
    ctx.fillRect(Math.random() * 2048, Math.random() * 1024, 2, 2);
  }

  // Semicircular betting arc markings centered accurately at (0, 0) local
  const cx = toX(0);
  const cy = toY(0);

  ctx.strokeStyle = "rgba(232, 198, 112, 0.45)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, 0.72 * scalePx, 0.14 * Math.PI, 0.86 * Math.PI);
  ctx.stroke();

  ctx.strokeStyle = "rgba(197, 242, 115, 0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 0.80 * scalePx, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.stroke();

  ctx.fillStyle = "rgba(242, 218, 148, 0.78)";
  ctx.font = "bold 36px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("HAKING CASINO", cx, toY(0.55));

  ctx.fillStyle = "rgba(242, 218, 148, 0.62)";
  ctx.font = "bold 20px system-ui, sans-serif";
  ctx.fillText("BLACKJACK PAYS 3 TO 2 · DEALER STANDS ON ALL 17s", cx, toY(0.62));

  // Draw 6 numbered betting spots matching EXACT world coordinates of seatWorldPoint(idx, 1.32)
  SEAT_ANGLES.forEach((angle, idx) => {
    const wx = Math.sin(angle) * 1.32;
    const dz = Math.cos(angle) * 1.32;
    const sx = toX(wx);
    const sy = toY(dz);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-angle);

    ctx.strokeStyle = "rgba(236, 198, 96, 0.88)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 44, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 35, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(236, 198, 96, 0.82)";
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(idx + 1), 0, 0);
    ctx.restore();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function seatWorldPoint(seatIndex, radius) {
  const angle = SEAT_ANGLES[seatIndex];
  return new THREE.Vector3(
    Math.sin(angle) * radius,
    TABLE_Y,
    ARC_CENTER_Z + Math.cos(angle) * radius,
  );
}

function formatSecLeft(targetMs) {
  if (!targetMs) return 0;
  return Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
}

function chipBreakdown(bet) {
  const stacks = [];
  let rem = Math.max(0, Math.floor(bet));
  for (const d of CHIP_DENOMS) {
    while (rem >= d.val && stacks.length < 11) {
      stacks.push(d);
      rem -= d.val;
    }
  }
  return stacks;
}

export class BlackjackArena {
  constructor(container, callbacks) {
    this.container = container;
    this.cb = callbacks;
    this.table = null;
    this.mySocketId = null;
    this.cameraMode = "masa";
    this.lastTurnKey = "";
    this.lastDealSignature = "";
    this.lastResultKey = "";
    this.lastTickSec = null;
    this.dealPulseUntil = 0;
    this.webglFailed = false;
    this.disposed = false;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.cardsGroup = null;
    this.chipsGroup = null;
    this.cardEntries = new Map();
    this.dealerRig = null;
    this.seatAnchors = [];
    this.seatRingMeshes = [];
    this.hudNodes = {};
    this.rafId = 0;
    this.timerId = 0;
    this.resizeObs = null;
    this.lastTime = performance.now();

    this._buildDom();
    this._init3DOrFallback();
    this.timerId = setInterval(() => this._refreshCountdowns(), 200);
  }

  _buildDom() {
    this.container.replaceChildren();
    const wrap = document.createElement("div");
    wrap.className = "bj-shell";

    // Top bar
    const topbar = document.createElement("div");
    topbar.className = "bj-topbar";

    const titleWrap = document.createElement("div");
    titleWrap.className = "bj-title-group";
    const nameEl = document.createElement("strong");
    nameEl.className = "bj-table-name";
    const roundBadge = document.createElement("span");
    roundBadge.className = "tag bj-round-badge";
    const seatBadge = document.createElement("span");
    seatBadge.className = "bj-meta-pill";
    const shoeBadge = document.createElement("span");
    shoeBadge.className = "bj-meta-pill hide-xs";
    titleWrap.append(nameEl, roundBadge, seatBadge, shoeBadge);

    const rightWrap = document.createElement("div");
    rightWrap.className = "bj-top-actions";
    const camGroup = document.createElement("div");
    camGroup.className = "bj-cam-pills";
    const camBtns = {};
    for (const [mode, label] of [
      ["masa", "Masa"],
      ["elim", "Elim"],
      ["ustten", "Üstten"],
    ]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bj-pill-btn" + (mode === "masa" ? " active" : "");
      btn.textContent = label;
      btn.addEventListener("click", () => this.setCameraMode(mode));
      camGroup.append(btn);
      camBtns[mode] = btn;
    }

    const leaveBtn = document.createElement("button");
    leaveBtn.type = "button";
    leaveBtn.className = "button small secondary bj-leave-btn";
    leaveBtn.textContent = "Masadan kalk";
    leaveBtn.addEventListener("click", () => this.cb.onLeave());

    rightWrap.append(camGroup, leaveBtn);
    topbar.append(titleWrap, rightWrap);

    // Stage container (WebGL canvas + overlay HUDs + 2D fallback)
    const stage = document.createElement("div");
    stage.className = "bj-stage";

    const statusBanner = document.createElement("div");
    statusBanner.className = "bj-status-banner";

    const modelBadge = document.createElement("div");
    modelBadge.className = "bj-model-badge";
    modelBadge.textContent = "Kurpiyer hazırlanıyor…";

    const overlays = document.createElement("div");
    overlays.className = "bj-overlays";

    const fallback2d = document.createElement("div");
    fallback2d.className = "bj-fallback-2d";
    fallback2d.hidden = true;

    stage.append(overlays, statusBanner, modelBadge, fallback2d);

    // Bottom thumb-friendly dock
    const dock = document.createElement("div");
    dock.className = "bj-dock";

    const dockInfo = document.createElement("div");
    dockInfo.className = "bj-dock-info";
    const balanceEl = document.createElement("div");
    balanceEl.className = "bj-balance";
    const reactRow = document.createElement("div");
    reactRow.className = "bj-react-row";
    for (const emoji of REACTIONS) {
      const rBtn = document.createElement("button");
      rBtn.type = "button";
      rBtn.className = "bj-react-btn";
      rBtn.textContent = emoji;
      rBtn.setAttribute("aria-label", `Tepki gönder ${emoji}`);
      rBtn.addEventListener("click", () => this.cb.onReact(emoji));
      reactRow.append(rBtn);
    }
    dockInfo.append(balanceEl, reactRow);

    const dockControls = document.createElement("div");
    dockControls.className = "bj-dock-controls";

    dock.append(dockInfo, dockControls);
    wrap.append(topbar, stage, dock);
    this.container.append(wrap);

    this.hudNodes = {
      wrap,
      nameEl,
      roundBadge,
      seatBadge,
      shoeBadge,
      camBtns,
      camGroup,
      stage,
      statusBanner,
      modelBadge,
      overlays,
      fallback2d,
      balanceEl,
      dockControls,
    };
  }

  _init3DOrFallback() {
    try {
      const { stage } = this.hudNodes;
      const w = Math.max(300, stage.clientWidth || 720);
      const h = Math.max(260, stage.clientHeight || 430);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.domElement.className = "bj-canvas";
      stage.prepend(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x09110d);
      scene.fog = new THREE.FogExp2(0x09110d, 0.11);

      const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 30);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.maxPolarAngle = Math.PI * 0.47;
      controls.minPolarAngle = 0.25;
      controls.minDistance = 1.15;
      controls.maxDistance = 4.6;
      controls.enablePan = false;

      // Studio + VIP Casino Lighting
      scene.add(new THREE.HemisphereLight(0xd9f0e1, 0x16110d, 0.85));

      const mainSpot = new THREE.SpotLight(0xfff1d6, 22, 12, Math.PI * 0.34, 0.55, 1.4);
      mainSpot.position.set(0.3, 4.1, 0.7);
      mainSpot.target.position.set(0, TABLE_Y, -0.15);
      mainSpot.castShadow = true;
      mainSpot.shadow.mapSize.set(1024, 1024);
      mainSpot.shadow.bias = -0.0005;
      scene.add(mainSpot, mainSpot.target);

      const croupierKey = new THREE.DirectionalLight(0xffe7cc, 1.55);
      croupierKey.position.set(-1.3, 2.6, 1.9);
      croupierKey.castShadow = true;
      scene.add(croupierKey);

      const rimLight = new THREE.PointLight(0xc5f273, 4.2, 6, 1.8);
      rimLight.position.set(1.6, 2.1, -1.7);
      scene.add(rimLight);

      const warmAccent = new THREE.PointLight(0xffb86c, 3.2, 6, 1.8);
      warmAccent.position.set(-1.8, 1.9, -1.4);
      scene.add(warmAccent);

      this.scene = scene;
      this.camera = camera;
      this.renderer = renderer;
      this.controls = controls;
      this.cardsGroup = new THREE.Group();
      this.chipsGroup = new THREE.Group();
      scene.add(this.cardsGroup, this.chipsGroup);

      this._buildCasinoEnvironment();
      this._loadDealerModel();
      this.setCameraMode(w < 540 ? "masa" : "masa");

      this.resizeObs = new ResizeObserver(() => this._resize());
      this.resizeObs.observe(stage);

      const tick = (now) => {
        if (this.disposed) return;
        this.rafId = requestAnimationFrame(tick);
        const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
        this.lastTime = now;
        this._animateScene(now * 0.001, dt);
        controls.update();
        renderer.render(scene, camera);
        this._projectOverlays();
      };
      this.rafId = requestAnimationFrame(tick);
    } catch {
      this._enableFallback2D();
    }
  }

  _enableFallback2D() {
    this.webglFailed = true;
    this.hudNodes.modelBadge.hidden = true;
    this.hudNodes.camGroup.hidden = true;
    this.hudNodes.overlays.hidden = true;
    this.hudNodes.fallback2d.hidden = false;
    if (this.table) this._renderFallback2D();
  }

  _buildCasinoEnvironment() {
    // Velvet floor disk
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(6, 48),
      new THREE.MeshStandardMaterial({
        color: 0x0c1410,
        roughness: 0.92,
        metalness: 0.05,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Table pedestal
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.78, TABLE_Y - 0.06, 32),
      new THREE.MeshStandardMaterial({
        color: 0x1c120d,
        roughness: 0.6,
        metalness: 0.15,
      }),
    );
    pedestal.position.set(0, (TABLE_Y - 0.06) / 2, -0.15);
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    this.scene.add(pedestal);

    // Table base slab underneath felt (semicircular dark mahogany skirt)
    const tableBodyGeo = new THREE.CylinderGeometry(
      1.54,
      1.54,
      0.045,
      64,
      1,
      false,
      -Math.PI / 2,
      Math.PI,
    );
    const tableBody = new THREE.Mesh(
      tableBodyGeo,
      new THREE.MeshStandardMaterial({
        color: 0x26140d,
        roughness: 0.45,
        metalness: 0.1,
      }),
    );
    tableBody.position.set(0, TABLE_Y - 0.025, ARC_CENTER_Z);
    tableBody.receiveShadow = true;
    this.scene.add(tableBody);

    // Exact world-UV-aligned semicircular baize felt surface
    const feltShape = new THREE.Shape();
    feltShape.moveTo(-1.54, 0.04);
    feltShape.lineTo(1.54, 0.04);
    feltShape.absarc(0, 0, 1.54, 0, -Math.PI, true);
    feltShape.closePath();

    const feltGeo = new THREE.ShapeGeometry(feltShape, 64);
    const posAttr = feltGeo.attributes.position;
    const uvArr = new Float32Array(posAttr.count * 2);
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const dz = -vy; // after rotateX(-PI/2): local y becomes -z
      uvArr[i * 2] = (vx + 1.54) / 3.08;
      uvArr[i * 2 + 1] = 1 - (dz + 0.04) / 1.58;
    }
    feltGeo.setAttribute("uv", new THREE.BufferAttribute(uvArr, 2));

    const feltMat = new THREE.MeshStandardMaterial({
      map: createFeltTexture(),
      roughness: 0.88,
      metalness: 0.02,
    });
    const felt = new THREE.Mesh(feltGeo, feltMat);
    felt.rotation.x = -Math.PI / 2;
    felt.position.set(0, TABLE_Y + 0.001, ARC_CENTER_Z);
    felt.receiveShadow = true;
    this.scene.add(felt);

    // Back extension rectangle so dealer edge feels deep & finished
    const backLip = new THREE.Mesh(
      new THREE.BoxGeometry(3.16, 0.055, 0.28),
      new THREE.MeshStandardMaterial({
        color: 0x3b1b10,
        roughness: 0.35,
        metalness: 0.12,
      }),
    );
    backLip.position.set(0, TABLE_Y - 0.02, ARC_CENTER_Z - 0.14);
    backLip.castShadow = true;
    backLip.receiveShadow = true;
    this.scene.add(backLip);

    // Mahogany padded semicircular rail
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x261510,
      roughness: 0.32,
      metalness: 0.12,
    });
    const arcRail = new THREE.Mesh(
      new THREE.TorusGeometry(1.56, 0.075, 18, 64, Math.PI),
      railMat,
    );
    arcRail.rotation.x = Math.PI / 2;
    arcRail.position.set(0, TABLE_Y + 0.012, ARC_CENTER_Z);
    arcRail.castShadow = true;
    arcRail.receiveShadow = true;
    this.scene.add(arcRail);

    // Thin brushed gold trim inside rail
    const goldTrim = new THREE.Mesh(
      new THREE.TorusGeometry(1.485, 0.011, 10, 64, Math.PI),
      new THREE.MeshStandardMaterial({
        color: 0xd6b057,
        roughness: 0.28,
        metalness: 0.82,
      }),
    );
    goldTrim.rotation.x = Math.PI / 2;
    goldTrim.position.set(0, TABLE_Y + 0.008, ARC_CENTER_Z);
    this.scene.add(goldTrim);

    // 6 glowing active seat ring highlights on felt
    for (let i = 0; i < SEAT_COUNT; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.068, 0.088, 32),
        new THREE.MeshBasicMaterial({
          color: 0xc5f273,
          transparent: true,
          opacity: 0.0,
          side: THREE.DoubleSide,
        }),
      );
      const pos = seatWorldPoint(i, 1.32);
      ring.position.set(pos.x, TABLE_Y + 0.003, pos.z);
      ring.rotation.x = -Math.PI / 2;
      this.scene.add(ring);
      this.seatRingMeshes.push(ring);

      this.seatAnchors.push(
        new THREE.Vector3(
          Math.sin(SEAT_ANGLES[i]) * 1.46,
          TABLE_Y + 0.09,
          ARC_CENTER_Z + Math.cos(SEAT_ANGLES[i]) * 1.46,
        ),
      );
    }

    // Card Shoe on dealer's left (+X)
    const shoeGroup = new THREE.Group();
    const shoeBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.11, 0.28),
      new THREE.MeshStandardMaterial({
        color: 0x161918,
        roughness: 0.25,
        metalness: 0.4,
      }),
    );
    shoeBody.position.y = 0.055;
    shoeBody.castShadow = true;
    const shoeDeck = new THREE.Mesh(
      new THREE.BoxGeometry(0.132, 0.08, 0.19),
      new THREE.MeshStandardMaterial({
        color: 0xf4efe4,
        roughness: 0.5,
      }),
    );
    shoeDeck.position.set(0, 0.065, -0.01);
    shoeGroup.add(shoeBody, shoeDeck);
    shoeGroup.position.set(0.86, TABLE_Y, ARC_CENTER_Z + 0.12);
    shoeGroup.rotation.y = -0.35;
    this.scene.add(shoeGroup);

    // Dealer Chip Tray right in front of dealer
    const tray = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.025, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0x181c1a,
        roughness: 0.35,
        metalness: 0.5,
      }),
    );
    tray.position.set(0, TABLE_Y + 0.012, ARC_CENTER_Z - 0.12);
    tray.receiveShadow = true;
    this.scene.add(tray);

    for (let c = 0; c < 6; c++) {
      const col = CHIP_DENOMS[c % CHIP_DENOMS.length].color;
      const stack = new THREE.Mesh(
        new THREE.CylinderGeometry(0.023, 0.023, 0.032, 18),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.2 }),
      );
      stack.rotation.z = Math.PI / 2;
      stack.rotation.y = Math.PI / 2;
      stack.position.set(-0.15 + c * 0.06, TABLE_Y + 0.028, ARC_CENTER_Z - 0.12);
      this.scene.add(stack);
    }
  }

  async _loadDealerModel() {
    const badge = this.hudNodes.modelBadge;
    try {
      await MeshoptDecoder.ready;
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync("/assets/models/dealer.glb");
      if (this.disposed) return;

      const root = gltf.scene;
      root.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          obj.frustumCulled = false;
        }
      });

      // Auto-scale normalized croupier stature (~1.72m) positioned naturally behind dealer rail
      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      box.getSize(size);
      const targetHeight = 1.72;
      const scale = size.y > 0.01 ? targetHeight / size.y : 1;
      root.scale.setScalar(scale);
      root.updateMatrixWorld(true);

      const scaledBox = new THREE.Box3().setFromObject(root);
      const center = new THREE.Vector3();
      scaledBox.getCenter(center);
      root.position.set(-center.x, -scaledBox.min.y + 0.02, -center.z + (ARC_CENTER_Z - 0.44));
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

      // Compute world-space arm alignment out of T-pose into natural croupier stance
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
      alignBoneToward("RightArm", "RightForeArm", new THREE.Vector3(-0.32, -0.78, 0.52));
      alignBoneToward("RightForeArm", "RightHand", new THREE.Vector3(0.08, -0.18, 0.98));

      for (const key of ["Spine", "Spine1", "Spine2", "Neck", "Head"]) {
        if (poseRig[key]) poseRig[key].base = poseRig[key].rest.clone();
      }

      this.dealerRig = {
        root,
        poseRig,
        lookYaw: 0,
        dealMix: 0,
      };
      if (badge) {
        badge.textContent = "Kurpiyer masada";
        setTimeout(() => {
          if (badge) badge.classList.add("fade-out");
        }, 1600);
      }
    } catch {
      if (badge) badge.hidden = true;
    }
  }

  setCameraMode(mode) {
    this.cameraMode = mode;
    for (const [m, btn] of Object.entries(this.hudNodes.camBtns)) {
      btn.classList.toggle("active", m === mode);
    }
    if (!this.camera || !this.controls) return;

    const aspect = this.camera.aspect || 1.5;
    const isNarrow = aspect < 0.95;

    if (mode === "ustten") {
      this.camera.position.set(0, isNarrow ? 3.55 : 2.95, isNarrow ? 1.15 : 0.88);
      this.controls.target.set(0, TABLE_Y, 0.05);
    } else if (mode === "elim") {
      const mySeat = this._mySeat();
      if (mySeat) {
        const pt = seatWorldPoint(mySeat.seatIndex, 1.05);
        const camPt = seatWorldPoint(mySeat.seatIndex, 2.05);
        this.camera.position.set(camPt.x * 0.95, TABLE_Y + 0.92, camPt.z + 0.18);
        this.controls.target.set(pt.x * 0.55, TABLE_Y + 0.05, -0.02);
      } else {
        this.camera.position.set(0, TABLE_Y + 0.98, 2.05);
        this.controls.target.set(0, TABLE_Y + 0.06, -0.05);
      }
    } else {
      // Wide croupier + full 6-seat table
      this.camera.position.set(0, isNarrow ? 2.65 : 2.15, isNarrow ? 3.25 : 2.52);
      this.controls.target.set(0, 0.98, -0.22);
    }
    this.controls.update();
  }

  _resize() {
    if (!this.renderer || !this.camera || this.webglFailed) return;
    const { stage } = this.hudNodes;
    const w = Math.max(300, stage.clientWidth);
    const h = Math.max(260, stage.clientHeight);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.95 ? 48 : 42;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  _mySeat() {
    if (!this.table || !this.mySocketId) return null;
    return this.table.seats.find((s) => s && s.userId === this.mySocketId) || null;
  }

  _animateScene(time, dt) {
    // Card flight & flip interpolation
    for (const entry of this.cardEntries.values()) {
      const k = 1 - Math.exp(-11 * dt);
      entry.mesh.position.lerp(entry.targetPos, k);
      const dy = entry.targetPos.distanceTo(entry.mesh.position);
      entry.mesh.position.y = entry.targetPos.y + Math.min(0.14, dy * 0.25);
      entry.mesh.rotation.y += (entry.targetRotY - entry.mesh.rotation.y) * k;
      entry.mesh.rotation.z += (entry.targetRotZ - entry.mesh.rotation.z) * k;
    }

    // Pulse active turn betting circle
    const activeIdx =
      this.table?.status === "playing" && this.table?.turn
        ? this.table.turn.seatIndex
        : -1;
    this.seatRingMeshes.forEach((ring, i) => {
      const occupied = !!this.table?.seats[i];
      if (i === activeIdx) {
        ring.material.color.setHex(0xc5f273);
        ring.material.opacity = 0.55 + Math.sin(time * 5.5) * 0.28;
      } else if (occupied) {
        ring.material.color.setHex(0xe8c670);
        ring.material.opacity = 0.22;
      } else {
        ring.material.opacity = 0;
      }
    });

    // Live croupier bone animation (breathing, seat tracking, dealing reach)
    if (this.dealerRig) {
      const { poseRig } = this.dealerRig;
      let desiredYaw = Math.sin(time * 0.45) * 0.14;
      if (activeIdx >= 0 && activeIdx < SEAT_COUNT) {
        desiredYaw = SEAT_ANGLES[activeIdx] * 0.36;
      } else if (this.table?.status === "dealerTurn") {
        desiredYaw = 0;
      }
      this.dealerRig.lookYaw += (desiredYaw - this.dealerRig.lookYaw) * Math.min(1, dt * 4);

      const dealActive = performance.now() < this.dealPulseUntil ? 1 : 0;
      this.dealerRig.dealMix += (dealActive - this.dealerRig.dealMix) * Math.min(1, dt * 8);
      const reach = this.dealerRig.dealMix;

      if (poseRig.Spine1?.base) {
        const q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(Math.sin(time * 1.55) * 0.018 + reach * 0.04, 0, 0),
        );
        poseRig.Spine1.bone.quaternion.copy(poseRig.Spine1.base).multiply(q);
      }
      if (poseRig.Neck?.base) {
        const q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0.05 + Math.sin(time * 1.55) * 0.012, this.dealerRig.lookYaw * 0.45, 0),
        );
        poseRig.Neck.bone.quaternion.copy(poseRig.Neck.base).multiply(q);
      }
      if (poseRig.Head?.base) {
        const q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0.06, this.dealerRig.lookYaw * 0.55, 0),
        );
        poseRig.Head.bone.quaternion.copy(poseRig.Head.base).multiply(q);
      }
      if (poseRig.RightArm?.base) {
        const q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(-reach * 0.34, reach * 0.18 + Math.sin(time * 1.4) * 0.02, 0),
        );
        poseRig.RightArm.bone.quaternion.copy(poseRig.RightArm.base).multiply(q);
      }
      if (poseRig.LeftArm?.base) {
        const q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(Math.sin(time * 1.3 + 1) * 0.02, 0, 0),
        );
        poseRig.LeftArm.bone.quaternion.copy(poseRig.LeftArm.base).multiply(q);
      }
    }
  }

  _projectOverlays() {
    if (this.webglFailed || !this.table || !this.camera) return;
    const { stage, overlays } = this.hudNodes;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;

    const project = (worldVec) => {
      const v = worldVec.clone().project(this.camera);
      const x = ((v.x + 1) / 2) * w;
      const y = ((-v.y + 1) / 2) * h;
      return {
        x: Math.max(46, Math.min(w - 46, x)),
        y: Math.max(48, Math.min(h - 24, y)),
        visible: v.z < 1,
      };
    };

    const dealerBadge = overlays.querySelector(".bj-dealer-pill");
    if (dealerBadge) {
      const p = project(new THREE.Vector3(0, TABLE_Y + 0.15, ARC_CENTER_Z + 0.18));
      dealerBadge.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -100%)`;
      dealerBadge.style.opacity = p.visible ? "1" : "0";
    }

    for (let i = 0; i < SEAT_COUNT; i++) {
      const pill = overlays.querySelector(`[data-seat="${i}"]`);
      if (!pill) continue;
      const p = project(this.seatAnchors[i]);
      pill.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%)`;
      pill.style.opacity = p.visible ? "1" : "0";
    }
  }

  update(table, mySocketId) {
    this.table = table;
    this.mySocketId = mySocketId;
    if (!table) return;

    const {
      nameEl,
      roundBadge,
      seatBadge,
      shoeBadge,
      balanceEl,
    } = this.hudNodes;

    nameEl.textContent = table.name;
    roundBadge.textContent = table.round > 0 ? `${table.round}. EL` : "HAZIRLIK";
    seatBadge.textContent = `${table.seatedCount}/${table.maxSeats} Koltuk`;
    shoeBadge.textContent = `Deste: ${table.shoeCount}/${table.shoeTotal}`;

    const mySeat = this._mySeat();
    balanceEl.replaceChildren();
    if (mySeat) {
      const chipIcon = document.createElement("span");
      chipIcon.className = "bj-chip-dot";
      chipIcon.textContent = "◉";
      const val = document.createElement("strong");
      val.textContent = `${mySeat.chips.toLocaleString("tr-TR")} fiş`;
      const betText = document.createElement("small");
      betText.textContent = `Bahis: ${mySeat.bet}`;
      balanceEl.append(chipIcon, val, betText);
    } else {
      balanceEl.textContent = "İzleyici · Boş bir koltuğa tıkla";
    }

    this._handleSounds(table, mySeat);
    if (!this.webglFailed) {
      this._syncCardsAndChips(table);
      this._syncOverlays(table);
    } else {
      this._renderFallback2D();
    }
    this._renderDock(table, mySeat);
    this._refreshCountdowns();
  }

  _handleSounds(table, mySeat) {
    const cardTotal =
      table.dealer.cards.length +
      table.seats.reduce(
        (sum, s) =>
          sum + (s ? s.hands.reduce((hs, h) => hs + h.cards.length, 0) : 0),
        0,
      );
    const dealSig = `${table.round}:${cardTotal}:${table.dealer.hiddenHole}`;
    if (this.lastDealSignature && dealSig !== this.lastDealSignature && cardTotal > 0) {
      playCard();
      this.dealPulseUntil = performance.now() + 650;
    }
    this.lastDealSignature = dealSig;

    const resultKey = `${table.round}:${table.status}`;
    if (resultKey !== this.lastResultKey && table.status === "settled" && mySeat?.activeInRound) {
      const hasBJ = mySeat.hands.some((h) => h.outcome === "blackjack");
      const hasWin = mySeat.hands.some((h) => h.outcome === "win");
      const hasPush = mySeat.hands.some((h) => h.outcome === "push");
      if (hasBJ) playBlackjack();
      else if (hasWin) playWin();
      else if (hasPush) playDraw();
    }
    this.lastResultKey = resultKey;
  }

  _syncCardsAndChips(table) {
    if (!this.scene) return;
    const activeIds = new Set();
    const shoeOrigin = new THREE.Vector3(0.86, TABLE_Y + 0.12, ARC_CENTER_Z + 0.12);

    const placeCard = (key, cardData, pos, rotY, hidden, orderIndex) => {
      activeIds.add(key);
      let entry = this.cardEntries.get(key);
      if (!entry) {
        const edgeMat = new THREE.MeshStandardMaterial({ color: 0xebe3cf, roughness: 0.45 });
        const backMat = new THREE.MeshStandardMaterial({
          map: createCardBackTexture(),
          roughness: 0.35,
          metalness: 0.06,
        });
        const faceMat = new THREE.MeshStandardMaterial({
          map: hidden ? createCardBackTexture() : getCardFaceTexture(cardData),
          roughness: 0.35,
          metalness: 0.04,
        });
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(CARD_W, CARD_T, CARD_H),
          [edgeMat, edgeMat, faceMat, backMat, edgeMat, edgeMat],
        );
        mesh.position.copy(shoeOrigin);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.cardsGroup.add(mesh);
        entry = {
          mesh,
          faceMat,
          wasHidden: hidden,
          targetPos: pos.clone(),
          targetRotY: rotY,
          targetRotZ: hidden ? Math.PI : 0,
        };
        this.cardEntries.set(key, entry);
      } else {
        if (entry.wasHidden && !hidden && cardData?.rank) {
          entry.faceMat.map = getCardFaceTexture(cardData);
          entry.faceMat.needsUpdate = true;
          entry.wasHidden = false;
        }
        entry.targetPos.copy(pos);
        entry.targetRotY = rotY;
        entry.targetRotZ = hidden ? Math.PI : 0;
      }
      entry.mesh.renderOrder = orderIndex;
    };

    // Dealer cards
    const dCards = table.dealer?.cards || [];
    const dCount = dCards.length;
    dCards.forEach((c, idx) => {
      const key = `d-${table.round}-${idx}`;
      const xOff = (idx - (dCount - 1) / 2) * (CARD_W + 0.022);
      placeCard(
        key,
        c,
        new THREE.Vector3(xOff, TABLE_Y + 0.008 + idx * 0.001, ARC_CENTER_Z + 0.24),
        0,
        !!c.hidden,
        idx,
      );
    });

    // Player hands around semicircular felt
    for (let s = 0; s < SEAT_COUNT; s++) {
      const seat = table.seats[s];
      if (!seat || !seat.activeInRound) continue;
      const angle = SEAT_ANGLES[s];
      const rightVec = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
      const basePos = seatWorldPoint(s, 0.98);
      const handsCount = seat.hands.length;

      seat.hands.forEach((hand, hIdx) => {
        const splitShift = handsCount > 1 ? (hIdx - 0.5) * 0.24 : 0;
        const hCenter = basePos.clone().addScaledVector(rightVec, splitShift);
        const cards = hand.cards || [];
        cards.forEach((card, cIdx) => {
          const offset = (cIdx - (cards.length - 1) / 2) * 0.044;
          const cardPos = hCenter
            .clone()
            .addScaledVector(rightVec, offset)
            .add(new THREE.Vector3(0, 0.008 + cIdx * 0.002, -cIdx * 0.012));
          placeCard(
            `p-${table.round}-${s}-${hIdx}-${cIdx}-${card.id || cIdx}`,
            card,
            cardPos,
            angle,
            false,
            cIdx + 2,
          );
        });
      });
    }

    for (const [key, entry] of this.cardEntries.entries()) {
      if (!activeIds.has(key)) {
        this.cardsGroup.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        this.cardEntries.delete(key);
      }
    }

    // Rebuild lightweight chip stacks on betting circles
    while (this.chipsGroup.children.length) {
      const child = this.chipsGroup.children[0];
      this.chipsGroup.remove(child);
    }
    const chipGeo =
      this._chipGeo ||
      (this._chipGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.008, 20));
    if (!this._chipMats) {
      this._chipMats = new Map();
      for (const d of CHIP_DENOMS) {
        this._chipMats.set(
          d.val,
          new THREE.MeshStandardMaterial({
            color: d.color,
            roughness: 0.32,
            metalness: 0.28,
          }),
        );
      }
    }
    for (let s = 0; s < SEAT_COUNT; s++) {
      const seat = table.seats[s];
      if (!seat) continue;
      const shownBet = seat.activeInRound
        ? seat.hands.reduce((a, h) => a + h.bet, 0)
        : seat.bet;
      const tokens = chipBreakdown(shownBet);
      const cPos = seatWorldPoint(s, 1.32);
      tokens.forEach((t, idx) => {
        const chip = new THREE.Mesh(chipGeo, this._chipMats.get(t.val));
        chip.position.set(cPos.x, TABLE_Y + 0.005 + idx * 0.0085, cPos.z);
        chip.castShadow = true;
        this.chipsGroup.add(chip);
      });
    }
  }

  _syncOverlays(table) {
    const { overlays } = this.hudNodes;
    overlays.replaceChildren();

    // Dealer score floating pill
    const dealerPill = document.createElement("div");
    dealerPill.className = "bj-dealer-pill";
    const dEval = table.dealer.evaluation || { total: 0 };
    if (table.dealer.cards?.length) {
      dealerPill.textContent = table.dealer.hiddenHole
        ? `Kasa: ${dEval.total} + ?`
        : dEval.isBust
          ? `Kasa: ${dEval.total} (Patladı)`
          : dEval.isBlackjack
            ? "Kasa: BLACKJACK!"
            : `Kasa: ${dEval.total}`;
    } else {
      dealerPill.textContent = "Kurpiyer";
    }
    overlays.append(dealerPill);

    // 6 projected seat badges
    for (let i = 0; i < SEAT_COUNT; i++) {
      const seat = table.seats[i];
      const isTurn =
        table.status === "playing" && table.turn?.seatIndex === i;
      const isMe = seat && seat.userId === this.mySocketId;
      const pill = document.createElement("button");
      pill.type = "button";
      pill.dataset.seat = String(i);
      pill.className =
        "bj-seat-pill" +
        (seat ? " occupied" : " empty") +
        (isMe ? " is-me" : "") +
        (isTurn ? " is-turn" : "");

      if (!seat) {
        pill.textContent = `+ Koltuk ${i + 1}`;
        pill.addEventListener("click", () => this.cb.onSwitchSeat(i));
      } else {
        const top = document.createElement("div");
        top.className = "bj-seat-name";
        top.textContent = seat.name + (isMe ? " ★" : "");
        const sub = document.createElement("div");
        sub.className = "bj-seat-score";
        if (seat.activeInRound && seat.hands.length) {
          sub.textContent = seat.hands
            .map((h) => {
              const tag = h.outcome
                ? OUTCOME_LABELS[h.outcome] || ""
                : h.busted
                  ? "Patladı"
                  : h.blackjack
                    ? "BJ!"
                    : `${h.evaluation?.total || 0}`;
              return `${tag}`;
            })
            .join(" / ");
        } else {
          sub.textContent = `Bahis ${seat.bet}`;
        }
        pill.append(top, sub);
        if (seat.reaction?.emoji) {
          const rx = document.createElement("span");
          rx.className = "bj-seat-reaction";
          rx.textContent = seat.reaction.emoji;
          pill.append(rx);
        }
        if (isMe) pill.disabled = true;
        else pill.disabled = true;
      }
      overlays.append(pill);
    }
    this._projectOverlays();
  }

  _renderFallback2D() {
    const table = this.table;
    const box = this.hudNodes.fallback2d;
    box.replaceChildren();

    const dealerZone = document.createElement("div");
    dealerZone.className = "bj2d-dealer";
    const dEval = table.dealer.evaluation || { total: 0 };
    const dLabel = document.createElement("div");
    dLabel.className = "bj2d-label";
    dLabel.textContent = table.dealer.cards?.length
      ? `Kasa: ${table.dealer.hiddenHole ? dEval.total + " + ?" : dEval.total}`
      : "Kurpiyer masada bekliyor";
    const dCards = document.createElement("div");
    dCards.className = "bj2d-cards";
    for (const c of table.dealer.cards || []) {
      const chip = document.createElement("span");
      chip.className =
        "bj2d-card" +
        (c.hidden ? " back" : c.suit === "H" || c.suit === "D" ? " red" : "");
      chip.textContent = c.hidden ? "HK" : `${c.rank}${SUIT_SYMBOLS[c.suit]}`;
      dCards.append(chip);
    }
    dealerZone.append(dLabel, dCards);

    const seatsGrid = document.createElement("div");
    seatsGrid.className = "bj2d-seats";
    for (let i = 0; i < SEAT_COUNT; i++) {
      const seat = table.seats[i];
      const el = document.createElement("div");
      const isTurn = table.status === "playing" && table.turn?.seatIndex === i;
      const isMe = seat && seat.userId === this.mySocketId;
      el.className =
        "bj2d-seat" +
        (seat ? " occupied" : " empty") +
        (isMe ? " is-me" : "") +
        (isTurn ? " is-turn" : "");

      if (!seat) {
        const sitBtn = document.createElement("button");
        sitBtn.type = "button";
        sitBtn.className = "bj2d-sit-btn";
        sitBtn.textContent = `+ Koltuk ${i + 1}`;
        sitBtn.addEventListener("click", () => this.cb.onSwitchSeat(i));
        el.append(sitBtn);
      } else {
        const title = document.createElement("strong");
        title.textContent = `${seat.name}${isMe ? " ★" : ""}`;
        const bet = document.createElement("small");
        bet.textContent = `Bahis ${seat.bet} · Fiş ${seat.chips}`;
        el.append(title, bet);
        for (const h of seat.hands || []) {
          const hRow = document.createElement("div");
          hRow.className = "bj2d-hand";
          const txt = h.cards.map((c) => `${c.rank}${SUIT_SYMBOLS[c.suit]}`).join(" ");
          hRow.textContent = `${txt} (${h.evaluation?.total || 0})${
            h.outcome ? " · " + OUTCOME_LABELS[h.outcome] : ""
          }`;
          el.append(hRow);
        }
      }
      seatsGrid.append(el);
    }

    box.append(dealerZone, seatsGrid);
  }

  _renderDock(table, mySeat) {
    const dock = this.hudNodes.dockControls;
    dock.replaceChildren();
    if (!mySeat) return;

    if (["waiting", "countdown"].includes(table.status)) {
      if (mySeat.chips < 10) {
        const rebuyBtn = document.createElement("button");
        rebuyBtn.type = "button";
        rebuyBtn.className = "button primary bj-action-main";
        rebuyBtn.textContent = "Bakiyen bitti · +500 Fiş Yenile ↻";
        rebuyBtn.addEventListener("click", () => {
          playChip();
          this.cb.onRebuy();
        });
        dock.append(rebuyBtn);
      } else {
        const chipsBar = document.createElement("div");
        chipsBar.className = "bj-chip-bar";
        for (const amt of CHIP_PRESETS) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className =
            "bj-chip-btn" + (mySeat.bet === amt ? " active" : "");
          btn.textContent = String(amt);
          btn.disabled = mySeat.chips < amt;
          btn.addEventListener("click", () => {
            playChip();
            this.cb.onBet(amt);
          });
          chipsBar.append(btn);
        }

        const startBtn = document.createElement("button");
        startBtn.type = "button";
        startBtn.id = "bj-start-btn";
        startBtn.className = "button primary bj-start-btn";
        startBtn.disabled = table.status === "countdown";
        startBtn.textContent =
          table.status === "countdown"
            ? `Başlıyor (${formatSecLeft(table.countdownEndsAt)}s)…`
            : "Başlat (10 sn) ▶";
        startBtn.addEventListener("click", () => {
          playTick();
          this.cb.onStart();
        });
        dock.append(chipsBar, startBtn);
      }
      return;
    }

    if (table.status === "playing") {
      const myTurn =
        table.turn && table.turn.seatIndex === mySeat.seatIndex;
      const activeHand = mySeat.hands?.[table.turn?.handIndex || 0];

      const actionBar = document.createElement("div");
      actionBar.className = "bj-play-bar";

      const hitBtn = document.createElement("button");
      hitBtn.type = "button";
      hitBtn.className = "button primary";
      hitBtn.textContent = "Kart Çek";
      hitBtn.disabled = !myTurn;
      hitBtn.addEventListener("click", () => this.cb.onAction("hit"));

      const standBtn = document.createElement("button");
      standBtn.type = "button";
      standBtn.className = "button secondary";
      standBtn.textContent = "Dur";
      standBtn.disabled = !myTurn;
      standBtn.addEventListener("click", () => this.cb.onAction("stand"));

      const doubleBtn = document.createElement("button");
      doubleBtn.type = "button";
      doubleBtn.className = "button secondary";
      doubleBtn.textContent = "2× Katla";
      doubleBtn.disabled =
        !myTurn ||
        !activeHand ||
        activeHand.cards.length !== 2 ||
        mySeat.chips < activeHand.bet;
      doubleBtn.addEventListener("click", () => this.cb.onAction("double"));

      const splitBtn = document.createElement("button");
      splitBtn.type = "button";
      splitBtn.className = "button secondary";
      splitBtn.textContent = "Böl";
      splitBtn.disabled =
        !myTurn ||
        !activeHand ||
        !activeHand.evaluation?.canSplit ||
        mySeat.hands.length >= 2 ||
        mySeat.chips < activeHand.bet;
      splitBtn.addEventListener("click", () => this.cb.onAction("split"));

      actionBar.append(hitBtn, standBtn, doubleBtn, splitBtn);
      dock.append(actionBar);
      return;
    }

    if (table.status === "settled" && mySeat.chips < 10) {
      const rebuyBtn = document.createElement("button");
      rebuyBtn.type = "button";
      rebuyBtn.className = "button primary";
      rebuyBtn.textContent = "+500 Fiş Yenile ↻";
      rebuyBtn.addEventListener("click", () => this.cb.onRebuy());
      dock.append(rebuyBtn);
    } else {
      const note = document.createElement("div");
      note.className = "bj-wait-note";
      note.textContent =
        table.status === "dealerTurn"
          ? "Kurpiyer sırası · Kartlar açılıyor…"
          : "El sonuçlandı · Bir sonraki el hazırlanıyor…";
      dock.append(note);
    }
  }

  _refreshCountdowns() {
    if (!this.table) return;
    const t = this.table;
    const banner = this.hudNodes.statusBanner;

    if (t.status === "countdown") {
      const sec = formatSecLeft(t.countdownEndsAt);
      if (sec !== this.lastTickSec && sec <= 3 && sec > 0) playTick();
      this.lastTickSec = sec;
      banner.textContent = `Oyun başlıyor: ${sec} sn · Bahisleri kilitleyin!`;
      banner.className = "bj-status-banner countdown";
      const sb = this.hudNodes.dockControls.querySelector("#bj-start-btn");
      if (sb) sb.textContent = `Başlıyor (${sec}s)…`;
    } else if (t.status === "playing" && t.turn) {
      const sec = formatSecLeft(t.turn.expiresAt);
      const seat = t.seats[t.turn.seatIndex];
      const mine = seat?.userId === this.mySocketId;
      banner.textContent = mine
        ? `Sıra SENDE · ${sec}s`
        : `Sıra: ${seat?.name || "Oyuncu"} · ${sec}s`;
      banner.className =
        "bj-status-banner" + (mine ? " my-turn" : "");
    } else if (t.status === "dealerTurn") {
      banner.textContent = t.lastAction?.text || "Kurpiyer oynuyor…";
      banner.className = "bj-status-banner";
    } else if (t.status === "settled") {
      const sec = formatSecLeft(t.nextRoundAt);
      banner.textContent = `${t.lastAction?.text || "El tamamlandı."} · Yeni el ${sec}s`;
      banner.className = "bj-status-banner settled";
    } else {
      banner.textContent =
        t.seatedCount >= 6
          ? "Masa doldu (6/6) · Otomatik başlıyor…"
          : t.lastAction?.text || "Hazır olduğunda Başlat'a bas (10 sn · 6/6'da oto başlar)";
      banner.className = "bj-status-banner";
    }
  }

  dispose() {
    this.disposed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.timerId) clearInterval(this.timerId);
    if (this.resizeObs) this.resizeObs.disconnect();
    if (this.controls) this.controls.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement?.remove();
    }
  }
}
