import * as THREE from "../vendor/three/three.module.js";
import { GLTFLoader } from "../vendor/three/GLTFLoader.js";
import { OrbitControls } from "../vendor/three/OrbitControls.js";
import {
  playChip,
  playDraw,
  playTileDraw,
  playTileOpen,
  playTilePenalty,
  playTilePlace,
  playWin,
} from "./sfx.mjs";

const REACTIONS = ["🔥", "👏", "🤔", "😮", "🤝", "☕"];
const COLOR_META = {
  R: { name: "Kırmızı", hex: "#c92a2a", cls: "tile-c-R" },
  K: { name: "Siyah", hex: "#1b1f23", cls: "tile-c-K" },
  B: { name: "Mavi", hex: "#1864ab", cls: "tile-c-B" },
  Y: { name: "Sarı", hex: "#c48400", cls: "tile-c-Y" },
};

function isRealOkey(t, okeyTarget) {
  return Boolean(
    t && okeyTarget && !t.isFalse && t.color === okeyTarget.color && t.num === okeyTarget.num,
  );
}

function effectiveTile(t, okeyTarget) {
  if (!t) return null;
  if (t.isFalse && okeyTarget) {
    return { color: okeyTarget.color, num: okeyTarget.num, isWild: false, isFalse: true };
  }
  if (isRealOkey(t, okeyTarget)) {
    return { color: t.color, num: t.num, isWild: true, isFalse: false };
  }
  return { color: t.color, num: t.num, isWild: false, isFalse: false };
}

function validateGroupLocal(rawTiles, okeyTarget) {
  if (!Array.isArray(rawTiles)) return { valid: false, score: 0 };
  const len = rawTiles.length;
  if (len < 3 || len > 13) return { valid: false, score: 0 };
  const eff = rawTiles.map((t) => effectiveTile(t, okeyTarget));
  if (eff.some((t) => !t)) return { valid: false, score: 0 };
  const real = eff.filter((t) => !t.isWild);
  if (!real.length) return { valid: false, score: 0 };

  let bestScore = -1;
  let bestKind = null;

  if (len <= 4) {
    const num = real[0].num;
    if (real.every((t) => t.num === num) && new Set(real.map((t) => t.color)).size === real.length) {
      bestScore = num * len;
      bestKind = "set";
    }
  }

  const runColor = real[0].color;
  if (real.every((t) => t.color === runColor) && new Set(real.map((t) => t.num)).size === real.length) {
    for (let start = 1; start <= 15 - len; start++) {
      const end = start + len - 1;
      const allowAceHigh = end === 14;
      let ok = true;
      for (const t of real) {
        const r = allowAceHigh && t.num === 1 ? 14 : t.num;
        if (r < start || r > end) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      let sum = 0;
      for (let r = start; r <= end; r++) sum += r === 14 ? 1 : r;
      if (sum > bestScore) {
        bestScore = sum;
        bestKind = "run";
      }
    }
  }

  return bestScore >= 0 ? { valid: true, kind: bestKind, score: bestScore } : { valid: false, score: 0 };
}

function validatePairLocal(rawTiles, okeyTarget) {
  if (!Array.isArray(rawTiles) || rawTiles.length !== 2) return false;
  const a = effectiveTile(rawTiles[0], okeyTarget);
  const b = effectiveTile(rawTiles[1], okeyTarget);
  if (!a || !b) return false;
  if (a.isWild || b.isWild) return true;
  return a.color === b.color && a.num === b.num;
}

function tileFitsMeldLocal(meld, tile, okeyTarget) {
  if (!meld || !tile || meld.kind === "pair" || !meld.tiles) return false;
  if (validateGroupLocal([tile, ...meld.tiles], okeyTarget).valid) return true;
  if (validateGroupLocal([...meld.tiles, tile], okeyTarget).valid) return true;
  return false;
}

function formatShortTile(t, okeyTarget) {
  if (!t) return "";
  if (t.isFalse) return okeyTarget ? `★${okeyTarget.num}` : "★";
  return String(t.num);
}

function createTileFaceTexture(tile, okeyTarget) {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 240;
  const ctx = canvas.getContext("2d");

  // Warm polished ivory tile gradient
  const grad = ctx.createLinearGradient(0, 0, 0, 240);
  grad.addColorStop(0, "#fdfbf4");
  grad.addColorStop(1, "#ede4cf");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 160, 240);

  // Subtle carved frame & top finger dimple
  ctx.strokeStyle = "rgba(130, 108, 72, 0.25)";
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 148, 228);

  if (!tile) {
    // Facedown back emblem (never exposes values)
    ctx.fillStyle = "#cfc3a6";
    ctx.beginPath();
    ctx.arc(80, 120, 24, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const wild = isRealOkey(tile, okeyTarget);
  if (wild) {
    ctx.fillStyle = "rgba(218, 165, 32, 0.14)";
    ctx.fillRect(10, 10, 140, 220);
  }

  if (tile.isFalse) {
    ctx.fillStyle = "#7c3aed";
    ctx.font = "900 72px 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("★", 80, 102);
    ctx.font = "800 22px 'Segoe UI', Arial, sans-serif";
    ctx.fillText("SAHTE", 80, 166);
    if (okeyTarget) {
      ctx.fillStyle = COLOR_META[okeyTarget.color]?.hex || "#333";
      ctx.font = "700 24px 'Segoe UI', Arial, sans-serif";
      ctx.fillText(String(okeyTarget.num), 80, 198);
    }
  } else {
    const meta = COLOR_META[tile.color] || COLOR_META.K;
    ctx.fillStyle = meta.hex;
    ctx.font = "900 94px 'Segoe UI', Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(tile.num), 80, 96);

    // Classic colored circle pip + mini crescent detail
    ctx.beginPath();
    ctx.arc(80, 174, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fdfbf4";
    ctx.beginPath();
    ctx.arc(84, 171, 6, 0, Math.PI * 2);
    ctx.fill();

    if (wild) {
      ctx.fillStyle = "#b8860b";
      ctx.font = "800 18px 'Segoe UI', Arial, sans-serif";
      ctx.fillText("OKEY ★", 80, 212);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class OkeyArena {
  constructor(root, user, cb) {
    this.root = root;
    this.user = user;
    this.cb = cb;
    this.table = null;
    this.selectedSlot = null;
    this.dragFromSlot = null;
    this.cameraPreset = "birdseye";
    this.lastActionAt = 0;
    this.lastTurnKey = "";
    this.lastStatus = "";
    this.disposed = false;
    this.tileGeo = null;
    this.rackGeo = null;
    this.texCache = new Map();
    this.backTex = createTileFaceTexture(null, null);
    this.pointerDownPos = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.interactiveDeckMesh = null;
    this.interactiveLeftMesh = null;
    this.animFrame = null;

    this.buildDom();
    this.init3D();
    this.loadGlbAsset();
  }

  buildDom() {
    this.root.replaceChildren();
    this.root.className = "okey-shell";

    // Topbar
    const topbar = document.createElement("div");
    topbar.className = "okey-topbar";

    const titleWrap = document.createElement("div");
    titleWrap.className = "okey-title-wrap";
    this.titleEl = document.createElement("strong");
    this.modeBadge = document.createElement("span");
    this.modeBadge.className = "tag bj-phase-tag";
    this.specBadge = document.createElement("span");
    this.specBadge.className = "tag chess-spec-tag";
    this.specBadge.hidden = true;
    this.okeyPill = document.createElement("span");
    this.okeyPill.className = "tag okey-wild-pill";
    this.timerPill = document.createElement("span");
    this.timerPill.id = "okey-timer-pill";
    this.timerPill.className = "tag okey-timer-pill";
    this.timerPill.hidden = true;
    titleWrap.append(this.titleEl, this.modeBadge, this.specBadge, this.okeyPill, this.timerPill);

    const camBar = document.createElement("div");
    camBar.className = "okey-cam-bar";
    this.takeBotBtn = this.makeBtn("🪑 Bot Yerine Otur", "button small primary okey-take-bot-btn", () => {
      if (this.firstBotIdx >= 0) this.cb.onTakeBotSeat?.(this.firstBotIdx);
    });
    this.takeBotBtn.hidden = true;
    this.takeBotBtn.title = "Çıkan oyuncunun yerine geçen botun koltuğunu devral";
    this.camBirdsBtn = this.makeBtn("🦅 Kuş Bakışı", "button small secondary active", () =>
      this.setCameraPreset("birdseye"),
    );
    this.camAngleBtn = this.makeBtn("🪑 Masa Açısı", "button small secondary", () =>
      this.setCameraPreset("player"),
    );
    this.helpBtn = this.makeBtn("?", "button small secondary", () => this.cb.onHelp?.(this.table?.variant));
    this.helpBtn.title = "Kurallar ve Nasıl Oynanır";
    this.leaveBtn = this.makeBtn("Masadan kalk", "button small secondary", () => this.cb.onLeave?.());
    camBar.append(
      this.takeBotBtn,
      this.camBirdsBtn,
      this.camAngleBtn,
      this.helpBtn,
      this.leaveBtn,
    );

    if (this.timerTick) clearInterval(this.timerTick);
    this.timerTick = setInterval(() => this.updateTimerPill(), 250);

    topbar.append(titleWrap, camBar);

    // Arena middle: 3D Stage + Right/Overlay HUD
    const main = document.createElement("div");
    main.className = "okey-main";

    this.stage = document.createElement("div");
    this.stage.className = "okey-stage";

    this.canvasWrap = document.createElement("div");
    this.canvasWrap.className = "okey-canvas-wrap";

    this.banner = document.createElement("div");
    this.banner.className = "okey-banner";
    this.bannerText = document.createElement("span");
    this.banner.append(this.bannerText);

    // Floating compact 4-seat corners & waiting controls inside 3D stage
    this.seatsHud = document.createElement("div");
    this.seatsHud.className = "okey-seats-hud";

    // Center 101 opened melds tabletop drawer/panel over green felt (visible when melds exist)
    this.meldsPanel = document.createElement("div");
    this.meldsPanel.className = "okey-melds-overlay";
    this.meldsPanel.hidden = true;

    // Waiting overlay (shown until 4/4 seats filled)
    this.waitOverlay = document.createElement("div");
    this.waitOverlay.className = "okey-wait-overlay";
    this.waitOverlay.hidden = true;

    // End-of-round summary overlay
    this.summaryOverlay = document.createElement("div");
    this.summaryOverlay.className = "okey-summary-overlay";
    this.summaryOverlay.hidden = true;

    this.stage.append(
      this.canvasWrap,
      this.banner,
      this.seatsHud,
      this.meldsPanel,
      this.waitOverlay,
      this.summaryOverlay,
    );

    // Quick draw / action rail & reactions
    this.sideRail = document.createElement("aside");
    this.sideRail.className = "okey-side-rail";

    this.deckBox = document.createElement("div");
    this.deckBox.className = "okey-draw-box";
    this.drawDeckBtn = this.makeBtn("🁣 Ortadan Çek", "button primary small", () =>
      this.cb.onAction?.({ action: "drawDeck" }),
    );
    this.drawLeftBtn = this.makeBtn("← Soldan Al", "button secondary small", () =>
      this.cb.onAction?.({ action: "drawDiscard" }),
    );
    this.undoLeftBtn = this.makeBtn("↩ Taşı Geri Koy", "button secondary small", () =>
      this.cb.onAction?.({ action: "undoDiscardDraw" }),
    );
    this.undoLeftBtn.hidden = true;
    this.showIndicatorBtn = this.makeBtn("✨ Gösterge Göster", "button secondary small", () =>
      this.cb.onAction?.({ action: "showIndicator" }),
    );
    this.showIndicatorBtn.hidden = true;
    this.deckBox.append(this.drawDeckBtn, this.drawLeftBtn, this.undoLeftBtn, this.showIndicatorBtn);

    // Tile play / open / sort box
    this.playBox = document.createElement("div");
    this.playBox.className = "okey-play-box";
    this.selectionInfo = document.createElement("div");
    this.selectionInfo.className = "okey-selection-info";
    this.discardBtn = this.makeBtn("➡ Sağdan Taş At", "button primary small", () =>
      this.handleDiscardSelected(),
    );
    this.finishBtn = this.makeBtn("🏆 Bu Taşla Bitir", "button primary small", () =>
      this.handleFinishSelected(),
    );
    this.openSeriesBtn = this.makeBtn("Aç (Seri 101+)", "button primary small", () =>
      this.cb.onAction?.({ action: "openHand", openType: "series" }),
    );
    this.openPairsBtn = this.makeBtn("Çift Aç (5+)", "button secondary small", () =>
      this.cb.onAction?.({ action: "openHand", openType: "pairs" }),
    );
    this.openMoreBtn = this.makeBtn("+ Yeni Per İndir", "button secondary small", () =>
      this.cb.onAction?.({ action: "openMore" }),
    );
    this.playBox.append(
      this.selectionInfo,
      this.discardBtn,
      this.finishBtn,
      this.openSeriesBtn,
      this.openPairsBtn,
      this.openMoreBtn,
    );

    this.analysisPill = document.createElement("div");
    this.analysisPill.className = "okey-analysis-pill";

    this.scoreBox = document.createElement("div");
    this.scoreBox.className = "okey-score-mini";

    this.reactBar = document.createElement("div");
    this.reactBar.className = "okey-react-bar";
    for (const em of REACTIONS) {
      this.reactBar.append(
        this.makeBtn(em, "okey-react-btn", () => this.cb.onReact?.(em)),
      );
    }

    this.sideRail.append(
      this.analysisPill,
      this.deckBox,
      this.playBox,
      this.scoreBox,
      this.reactBar,
    );
    main.append(this.stage, this.sideRail);

    // Bottom 2-Tier Wooden Istaka Dock (Manual Drag/Tap + Auto-Arrange)
    this.rackDock = document.createElement("section");
    this.rackDock.className = "okey-rack-dock";
    this.rackDock.setAttribute("aria-label", "Oyuncu Istakası");

    const rackTools = document.createElement("div");
    rackTools.className = "okey-rack-tools";
    const rackLeftTools = document.createElement("div");
    rackLeftTools.className = "okey-rack-tools-group";
    this.sortSeriesBtn = this.makeBtn("📊 Seri Diz", "button small secondary", () => {
      this.selectedSlot = null;
      this.cb.onArrange?.({ mode: "sortSeries" });
    });
    this.sortSeriesBtn.title = "101+ seri hedefini önceliklendirerek en verimli perleri otomatik dizer";
    this.sortPairsBtn = this.makeBtn("👯 Çift Diz", "button small secondary", () => {
      this.selectedSlot = null;
      this.cb.onArrange?.({ mode: "sortPairs" });
    });
    this.sortPairsBtn.title = "Çiftleri ve Okey eşleşmelerini sol tarafa toplar";
    rackLeftTools.append(this.sortSeriesBtn, this.sortPairsBtn);

    this.rackHintEl = document.createElement("span");
    this.rackHintEl.className = "okey-rack-hint";
    this.rackHintEl.textContent = "Taşı sürükle veya tıkla-taşı";

    rackTools.append(rackLeftTools, this.rackHintEl);

    this.rackBoard = document.createElement("div");
    this.rackBoard.className = "okey-istaka";

    this.rackDock.append(rackTools, this.rackBoard);
    this.root.append(topbar, main, this.rackDock);
  }

  makeBtn(text, className, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = className;
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  }

  init3D() {
    const wrap = this.canvasWrap;
    const w = Math.max(300, wrap.clientWidth || 640);
    const h = Math.max(220, wrap.clientHeight || 380);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c140e);

    this.camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    wrap.append(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.44;
    this.controls.minPolarAngle = 0.12;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 24;
    this.controls.target.set(0, 0.4, 0);

    // Rich tabletop studio lighting
    this.scene.add(new THREE.AmbientLight(0xfff7e6, 0.85));
    const key = new THREE.DirectionalLight(0xfff1d6, 1.35);
    key.position.set(5, 13, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 30;
    const d = 8.5;
    key.shadow.camera.left = -d;
    key.shadow.camera.right = d;
    key.shadow.camera.top = d;
    key.shadow.camera.bottom = -d;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0xa8df6e, 0.35);
    rim.position.set(-7, 7, -6);
    this.scene.add(rim);

    // Base walnut & emerald green baize table
    this.tableGroup = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x4b2a15, roughness: 0.48, metalness: 0.08 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd6b05c, roughness: 0.28, metalness: 0.72 });
    const feltMat = new THREE.MeshStandardMaterial({ color: 0x165b36, roughness: 0.9, metalness: 0.02 });

    const woodOuter = new THREE.Mesh(new THREE.BoxGeometry(13.8, 0.42, 13.8), frameMat);
    woodOuter.position.y = -0.22;
    woodOuter.receiveShadow = true;
    this.tableGroup.add(woodOuter);

    const trim = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.44, 12.6), brassMat);
    trim.position.y = -0.21;
    this.tableGroup.add(trim);

    const felt = new THREE.Mesh(new THREE.BoxGeometry(12.35, 0.46, 12.35), feltMat);
    felt.position.y = -0.20;
    felt.receiveShadow = true;
    this.tableGroup.add(felt);

    this.scene.add(this.tableGroup);
    this.dynamicGroup = new THREE.Group();
    this.scene.add(this.dynamicGroup);

    // Default procedural fallback geometries (upgraded when okey.glb finishes loading)
    this.tileGeo = new THREE.BoxGeometry(0.58, 0.86, 0.22);
    this.rackGeo = new THREE.BoxGeometry(9.4, 0.68, 0.55);

    this.animGroup = new THREE.Group();
    this.scene.add(this.animGroup);
    this.flyingTiles = [];
    this.fxRings = [];
    this.camTargetPos = new THREE.Vector3();
    this.camTargetLook = new THREE.Vector3();
    this.camGliding = false;
    this.controls.addEventListener("start", () => {
      this.camGliding = false;
    });

    this.setCameraPreset("birdseye", true);

    // 3D canvas tap handler (click Deste or Sol Atık directly on the 3D table!)
    this.renderer.domElement.addEventListener("pointerdown", (e) => {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
    });
    this.renderer.domElement.addEventListener("pointerup", (e) => {
      if (!this.pointerDownPos) return;
      const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
      this.pointerDownPos = null;
      if (dist > 8) return;
      this.handleCanvasTap(e);
    });

    this.resizeObs = new ResizeObserver(() => this.handleResize());
    this.resizeObs.observe(wrap);

    let lastTs = performance.now();
    const loop = (now = performance.now()) => {
      if (this.disposed) return;
      this.animFrame = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      // Animate flying Okey tiles (draw from deck, draw from left discard, discard arc)
      if (this.flyingTiles.length) {
        const keep = [];
        for (const f of this.flyingTiles) {
          f.elapsed = Math.min(f.dur, f.elapsed + dt);
          const u = f.elapsed / f.dur;
          const ease = 1 - Math.pow(1 - u, 3);
          f.mesh.position.lerpVectors(f.startPos, f.endPos, ease);
          f.mesh.position.y += Math.sin(u * Math.PI) * f.arcH;
          f.mesh.rotation.x = f.startRotX + (f.endRotX - f.startRotX) * ease + Math.sin(u * Math.PI) * 0.22;
          f.mesh.rotation.y = f.startRotY + (f.endRotY - f.startRotY) * ease;
          f.mesh.rotation.z = f.startRotZ + (f.endRotZ - f.startRotZ) * ease + Math.sin(u * Math.PI) * 0.28;
          if (u < 1) {
            keep.push(f);
          } else {
            this.animGroup.remove(f.mesh);
            f.onLand?.();
          }
        }
        this.flyingTiles = keep;
      }

      // Expanding landing & meld rings
      if (this.fxRings.length) {
        const keep = [];
        for (const r of this.fxRings) {
          r.elapsed += dt;
          const u = Math.min(1, r.elapsed / r.dur);
          const ease = 1 - Math.pow(1 - u, 2);
          r.mesh.scale.setScalar(1 + ease * r.maxScale);
          r.mesh.material.opacity = (1 - u) * 0.85;
          if (u < 1) keep.push(r);
          else {
            this.animGroup.remove(r.mesh);
            r.mesh.geometry.dispose();
            r.mesh.material.dispose();
          }
        }
        this.fxRings = keep;
      }

      // Smooth camera preset glide
      if (this.camGliding && this.camera && this.controls) {
        const ck = 1 - Math.exp(-8.5 * dt);
        this.camera.position.lerp(this.camTargetPos, ck);
        this.controls.target.lerp(this.camTargetLook, ck);
        if (
          this.camera.position.distanceToSquared(this.camTargetPos) < 0.001 &&
          this.controls.target.distanceToSquared(this.camTargetLook) < 0.001
        ) {
          this.camera.position.copy(this.camTargetPos);
          this.controls.target.copy(this.camTargetLook);
          this.camGliding = false;
        }
      }

      this.controls.update();
      if (this.drawGlowRing && this.drawGlowRing.visible) {
        this.drawGlowRing.scale.setScalar(1 + 0.07 * Math.sin(now * 0.006));
      }
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  loadGlbAsset() {
    const loader = new GLTFLoader();
    loader.load(
      "/assets/models/okey.glb",
      (gltf) => {
        if (this.disposed) return;
        gltf.scene.traverse((child) => {
          if (child.isMesh && child.name === "okey_tile") {
            this.tileGeo = child.geometry.clone();
          } else if (child.isMesh && child.name === "okey_rack") {
            this.rackGeo = child.geometry.clone();
          }
        });
        if (this.table) this.rebuild3DScene();
      },
      undefined,
      () => { },
    );
  }

  setCameraPreset(preset, immediate = false) {
    this.cameraPreset = preset;
    this.camBirdsBtn?.classList.toggle("active", preset === "birdseye");
    this.camAngleBtn?.classList.toggle("active", preset === "player");
    const aspect = (this.canvasWrap.clientWidth || 640) / Math.max(1, this.canvasWrap.clientHeight || 380);
    const portraitBoost = aspect < 1.05 ? 1.24 : 1.0;
    if (preset === "birdseye") {
      this.camTargetPos.set(0, 14.5 * portraitBoost, 4.6 * portraitBoost);
      this.camTargetLook.set(0, 0.2, 0.15);
    } else {
      this.camTargetPos.set(0, 7.6 * portraitBoost, 10.6 * portraitBoost);
      this.camTargetLook.set(0, 0.35, -0.2);
    }
    if (immediate) {
      this.camGliding = false;
      this.camera.position.copy(this.camTargetPos);
      this.controls.target.copy(this.camTargetLook);
      this.controls.update();
    } else {
      this.camGliding = true;
    }
  }

  handleResize() {
    if (this.disposed || !this.renderer || !this.canvasWrap) return;
    const w = Math.max(260, this.canvasWrap.clientWidth);
    const h = Math.max(180, this.canvasWrap.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  handleCanvasTap(e) {
    if (!this.table || this.table.status !== "playing") return;
    const isMyTurn = this.table.mySeat !== -1 && this.table.turn === this.table.mySeat;
    if (!isMyTurn) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const targets = [];
    if (this.interactiveDeckMesh) targets.push(this.interactiveDeckMesh);
    if (this.interactiveLeftMesh) targets.push(this.interactiveLeftMesh);
    if (!targets.length) return;

    const hits = this.raycaster.intersectObjects(targets, true);
    if (!hits.length) return;
    let obj = hits[0].object;
    while (obj && !obj.userData?.okeyAction && obj.parent) obj = obj.parent;
    const actName = obj?.userData?.okeyAction;
    if (actName && this.table.turnPhase === "draw") {
      this.cb.onAction?.({ action: actName });
    }
  }

  getTileTexture(tile, okeyTarget) {
    if (!tile) return this.backTex;
    const wild = isRealOkey(tile, okeyTarget);
    const key = tile.isFalse
      ? `F_${okeyTarget?.color || ""}${okeyTarget?.num || ""}`
      : `${tile.color}${tile.num}${wild ? "_W" : ""}`;
    if (!this.texCache.has(key)) {
      this.texCache.set(key, createTileFaceTexture(tile, okeyTarget));
    }
    return this.texCache.get(key);
  }

  build3DTileMesh(tile, faceUp = true, okeyTarget = null) {
    const group = new THREE.Group();
    const ivoryMat = new THREE.MeshStandardMaterial({
      color: isRealOkey(tile, okeyTarget) && faceUp ? 0xfff5d4 : 0xf4ecd9,
      roughness: 0.25,
      metalness: 0.04,
    });
    const body = new THREE.Mesh(this.tileGeo, ivoryMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    if (faceUp && tile) {
      const planeMat = new THREE.MeshStandardMaterial({
        map: this.getTileTexture(tile, okeyTarget),
        roughness: 0.24,
        metalness: 0.02,
      });
      const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.80), planeMat);
      sticker.position.z = 0.141;
      group.add(sticker);
    }
    return group;
  }

  rebuild3DScene() {
    while (this.dynamicGroup.children.length) {
      this.dynamicGroup.remove(this.dynamicGroup.children[0]);
    }
    this.interactiveDeckMesh = null;
    this.interactiveLeftMesh = null;
    this.drawGlowRing = null;

    const t = this.table;
    if (!t) return;
    const viewSeat = t.mySeat >= 0 ? t.mySeat : 0;
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x6f4324, roughness: 0.5, metalness: 0.08 });

    // Seat positions relative to viewer: Bottom(0), Right(1), Top(2), Left(3)
    const seatTransforms = [
      { pos: [0, 0.03, 5.1], rotY: 0, disc: [3.95, 0.16, 4.35] },
      { pos: [5.1, 0.03, 0], rotY: Math.PI / 2, disc: [4.35, 0.16, -3.95] },
      { pos: [0, 0.03, -5.1], rotY: Math.PI, disc: [-3.95, 0.16, -4.35] },
      { pos: [-5.1, 0.03, 0], rotY: -Math.PI / 2, disc: [-4.35, 0.16, 3.95] },
    ];

    for (let rel = 0; rel < 4; rel++) {
      const absIdx = (viewSeat + rel) % 4;
      const seat = t.seats?.[absIdx];
      const xf = seatTransforms[rel];
      const rackHolder = new THREE.Group();
      rackHolder.position.set(...xf.pos);
      rackHolder.rotation.y = xf.rotY;

      const rackMesh = new THREE.Mesh(this.rackGeo, rackMat);
      rackMesh.castShadow = true;
      rackMesh.receiveShadow = true;
      rackHolder.add(rackMesh);

      if (seat && t.status !== "waiting") {
        // Opponent racks show ONLY facedown tiles matching exact tileCount (anti-peek!)
        const count = Math.min(22, seat.tileCount || 0);
        const topCount = Math.min(11, Math.ceil(count / 2));
        const botCount = count - topCount;
        const placeFacedownRow = (n, y, z) => {
          const span = Math.max(0, (n - 1) * 0.64);
          for (let i = 0; i < n; i++) {
            const tileObj = this.build3DTileMesh(null, false);
            tileObj.scale.setScalar(0.92);
            tileObj.position.set(-span / 2 + i * 0.64, y, z);
            // Only own bottom rack faces toward camera; opponent racks face their owners (back to center!)
            if (rel === 0 && t.mySeat !== -1 && t.myRack) {
              // Own 3D preview uses small backs from other angles; own true interactive rack sits in 2D oak dock
            }
            rackHolder.add(tileObj);
          }
        };
        if (rel !== 0 || t.mySeat === -1) {
          placeFacedownRow(topCount, 1.12, -0.04);
          placeFacedownRow(botCount, 0.56, 0.12);
        }
      }
      this.dynamicGroup.add(rackHolder);

      // Corner discard coaster & top visible discarded stone
      const coaster = new THREE.Mesh(
        new THREE.CylinderGeometry(0.68, 0.72, 0.08, 24),
        new THREE.MeshStandardMaterial({
          color: rel === 3 && t.mySeat === t.turn && t.turnPhase === "draw" ? 0x2c6e3b : 0x114528,
          roughness: 0.7,
        }),
      );
      coaster.position.set(xf.disc[0], 0.06, xf.disc[2]);
      coaster.receiveShadow = true;
      this.dynamicGroup.add(coaster);

      if (seat?.topDiscard) {
        const discTile = this.build3DTileMesh(seat.topDiscard, true, t.okeyTarget);
        discTile.rotation.x = -Math.PI / 2;
        discTile.rotation.z = xf.rotY;
        discTile.position.set(xf.disc[0], 0.24, xf.disc[2]);
        if (rel === 3) {
          discTile.userData.okeyAction = "drawDiscard";
          this.interactiveLeftMesh = discTile;
        }
        this.dynamicGroup.add(discTile);
      }
    }

    // Center Gösterge (Indicator) & Kapalı Deste (Draw stack)
    if (t.status !== "waiting") {
      const stackGroup = new THREE.Group();
      stackGroup.position.set(-0.95, 0.05, 0);
      stackGroup.userData.okeyAction = "drawDeck";
      const layers = Math.max(1, Math.min(6, Math.ceil((t.deckCount || 0) / 8)));
      for (let i = 0; i < layers; i++) {
        const layerTile = this.build3DTileMesh(null, false);
        layerTile.rotation.x = -Math.PI / 2;
        layerTile.position.y = 0.13 + i * 0.22;
        stackGroup.add(layerTile);
      }
      this.interactiveDeckMesh = stackGroup;
      this.dynamicGroup.add(stackGroup);

      // Pulse ring around Deste when it's your turn to draw
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.62, 0.76, 32),
        new THREE.MeshBasicMaterial({
          color: 0xc5f273,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(-0.95, 0.08, 0);
      ring.visible = t.status === "playing" && t.mySeat !== -1 && t.turn === t.mySeat && t.turnPhase === "draw";
      this.drawGlowRing = ring;
      this.dynamicGroup.add(ring);

      if (t.indicator) {
        const indStand = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.14, 0.42), rackMat);
        indStand.position.set(0.95, 0.09, 0);
        this.dynamicGroup.add(indStand);
        const indMesh = this.build3DTileMesh(t.indicator, true, t.okeyTarget);
        indMesh.position.set(0.95, 0.56, 0);
        indMesh.rotation.x = -0.22;
        this.dynamicGroup.add(indMesh);
      }
    }
  }

  spawnFxRing(x, z, color = 0xc5f273, maxScale = 2.0, dur = 0.42) {
    if (!this.animGroup) return;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.46, 28),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.14, z);
    this.animGroup.add(ring);
    this.fxRings.push({ mesh: ring, elapsed: 0, dur, maxScale });
  }

  triggerActionAnimation(prev, table, typ) {
    if (!this.animGroup || !table || table.status === "waiting") return;
    const viewSeat = table.mySeat >= 0 ? table.mySeat : 0;
    const seatTransforms = [
      { pos: [0, 0.72, 4.9], rotY: 0, disc: [3.95, 0.24, 4.35] },
      { pos: [4.9, 0.72, 0], rotY: Math.PI / 2, disc: [4.35, 0.24, -3.95] },
      { pos: [0, 0.72, -4.9], rotY: Math.PI, disc: [-3.95, 0.24, -4.35] },
      { pos: [-4.9, 0.72, 0], rotY: -Math.PI / 2, disc: [-4.35, 0.24, 3.95] },
    ];

    if (typ === "draw") {
      const actor = Number.isInteger(table.turn) ? table.turn : 0;
      const rel = (actor - viewSeat + 4) % 4;
      const xf = seatTransforms[rel];
      const tile = this.build3DTileMesh(null, false);
      const startPos = new THREE.Vector3(-0.95, 0.85, 0);
      const endPos = new THREE.Vector3(...xf.pos);
      tile.position.copy(startPos);
      this.animGroup.add(tile);
      this.flyingTiles.push({
        mesh: tile,
        startPos,
        endPos,
        startRotX: -Math.PI / 2,
        endRotX: 0,
        startRotY: 0,
        endRotY: xf.rotY,
        startRotZ: 0,
        endRotZ: 0,
        arcH: 1.65,
        elapsed: 0,
        dur: 0.36,
      });
      this.spawnFxRing(-0.95, 0, 0xc5f273, 1.4, 0.34);
    } else if (typ === "drawDiscard") {
      const actor = Number.isInteger(table.turn) ? table.turn : 0;
      const rel = (actor - viewSeat + 4) % 4;
      const srcRel = (rel + 3) % 4;
      const srcSeatIdx = (actor + 3) % 4;
      const prevTop = prev?.seats?.[srcSeatIdx]?.topDiscard || null;
      const tile = this.build3DTileMesh(prevTop, Boolean(prevTop), table.okeyTarget);
      const startPos = new THREE.Vector3(...seatTransforms[srcRel].disc);
      const endPos = new THREE.Vector3(...seatTransforms[rel].pos);
      tile.position.copy(startPos);
      this.animGroup.add(tile);
      this.flyingTiles.push({
        mesh: tile,
        startPos,
        endPos,
        startRotX: -Math.PI / 2,
        endRotX: 0,
        startRotY: 0,
        endRotY: seatTransforms[rel].rotY,
        startRotZ: seatTransforms[srcRel].rotY,
        endRotZ: 0,
        arcH: 1.55,
        elapsed: 0,
        dur: 0.38,
      });
    } else if (typ === "discard") {
      const actor = Number.isInteger(prev?.turn) ? prev.turn : (table.turn + 3) % 4;
      const rel = (actor - viewSeat + 4) % 4;
      const xf = seatTransforms[rel];
      const topTile = table.seats?.[actor]?.topDiscard || null;
      const tile = this.build3DTileMesh(topTile, Boolean(topTile), table.okeyTarget);
      const startPos = new THREE.Vector3(...xf.pos);
      const endPos = new THREE.Vector3(...xf.disc);
      tile.position.copy(startPos);
      this.animGroup.add(tile);
      this.flyingTiles.push({
        mesh: tile,
        startPos,
        endPos,
        startRotX: 0,
        endRotX: -Math.PI / 2,
        startRotY: xf.rotY,
        endRotY: 0,
        startRotZ: 0,
        endRotZ: xf.rotY,
        arcH: 1.45,
        elapsed: 0,
        dur: 0.34,
        onLand: () => {
          this.spawnFxRing(endPos.x, endPos.z, 0xf4c44e, 1.55, 0.36);
        },
      });
    } else if (typ === "openSeries" || typ === "openPairs" || typ === "openMore" || typ === "layoff") {
      this.spawnFxRing(0, 0, 0xc5f273, 3.2, 0.55);
    }
  }

  update(table, myId) {
    const prev = this.table;
    this.table = table;
    if (!table) return;

    // Tactile sound effects & 3D tile flight animations on state transitions
    if (table.lastAction?.at && table.lastAction.at !== this.lastActionAt) {
      this.lastActionAt = table.lastAction.at;
      const typ = table.lastAction.type;
      if (typ === "draw" || typ === "drawDiscard") playTileDraw();
      else if (typ === "discard") playTilePlace();
      else if (typ === "openSeries" || typ === "openPairs" || typ === "openMore" || typ === "layoff") {
        playTileOpen();
      } else if (typ === "penalty") playTilePenalty();
      else if (typ === "win") playWin();
      else if (typ === "draw" && table.status === "finished") playDraw();
      else if (typ === "join") playChip();

      this.triggerActionAnimation(prev, table, typ);
    }

    const is101 = table.variant === "101";
    const isSpec = table.mySeat === -1;
    const isMyTurn = !isSpec && table.status === "playing" && table.turn === table.mySeat;
    const firstBotIdx = (table.seats || []).findIndex((s) => s?.isBot);
    this.firstBotIdx = firstBotIdx;
    if (this.takeBotBtn) {
      this.takeBotBtn.hidden = !(isSpec && firstBotIdx !== -1);
    }

    this.titleEl.textContent = table.name;
    this.modeBadge.textContent =
      table.status === "waiting"
        ? `Bekleniyor (${table.seatedCount}/4)`
        : table.status === "finished"
          ? "El Bitti"
          : `${table.round}. El · ${table.deckCount} Taş`;
    this.specBadge.hidden = !isSpec;
    if (isSpec) {
      this.specBadge.textContent = `👁 İzleyici · ${table.spectatorCount || 1}`;
    }

    if (table.okeyTarget) {
      const m = COLOR_META[table.okeyTarget.color];
      this.okeyPill.hidden = false;
      this.okeyPill.textContent = `★ Okey: ${m?.name || ""} ${table.okeyTarget.num}`;
      this.okeyPill.style.borderColor = m?.hex || "";
    } else {
      this.okeyPill.hidden = true;
    }

    // Banner text
    const activeName = table.seats?.[table.turn]?.name || "";
    if (table.status === "waiting") {
      this.bannerText.textContent = `Masadaki 4 koltuk dolduğunda otomatik başlar (${table.seatedCount}/4).`;
    } else if (table.status === "playing") {
      if (isMyTurn) {
        this.bannerText.textContent =
          table.turnPhase === "draw"
            ? "SIRA SENDE — Ortadan taş çek veya solundaki atığı al!"
            : is101
              ? "SIRA SENDE — Taşlarını diz, gerekirse el aç/işle ve 1 taş at."
              : "SIRA SENDE — Taşlarını diz, ardından sağdan 1 taş at veya elini bitir.";
      } else {
        this.bannerText.textContent = table.lastAction?.text || `Sıra: ${activeName}`;
      }
    } else {
      this.bannerText.textContent = table.lastAction?.text || "El tamamlandı.";
    }
    this.banner.classList.toggle("is-my-turn", isMyTurn);

    this.updateTimerPill();
    this.renderSeatsHud(myId);
    this.renderWaitOverlay();
    this.renderMeldsOverlay();
    this.renderSummaryOverlay();
    this.renderControls(is101, isSpec, isMyTurn);
    this.renderRackDock(is101, isSpec, isMyTurn);
    this.rebuild3DScene();
  }

  updateTimerPill() {
    if (!this.timerPill || !this.table) return;
    const t = this.table;
    if (t.status !== "playing") {
      this.timerPill.hidden = true;
      return;
    }
    const activeSeat = t.seats?.[t.turn];
    this.timerPill.hidden = false;
    this.timerPill.classList.remove("warn", "active", "bot");
    if (activeSeat?.isBot) {
      this.timerPill.classList.add("bot");
      this.timerPill.textContent = "🤖 Bot oynuyor…";
      return;
    }
    const deadline = Number(t.turnDeadline) || 0;
    const remSec = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const isMine = t.mySeat !== -1 && t.turn === t.mySeat;
    if (isMine) this.timerPill.classList.add("active");
    if (remSec <= 15) this.timerPill.classList.add("warn");
    this.timerPill.textContent = isMine ? `⏱ ${remSec}s (Sen)` : `⏱ ${remSec}s`;
  }

  renderSeatsHud(myId) {
    this.seatsHud.replaceChildren();
    const t = this.table;
    const isSpec = t.mySeat === -1;
    const viewSeat = t.mySeat >= 0 ? t.mySeat : 0;
    const slotPosCls = ["pos-bottom", "pos-right", "pos-top", "pos-left"];
    for (let rel = 0; rel < 4; rel++) {
      const absIdx = (viewSeat + rel) % 4;
      const seat = t.seats?.[absIdx];
      const card = document.createElement("div");
      card.className = `okey-seat-chip ${slotPosCls[rel]}`;
      if (t.status === "playing" && t.turn === absIdx) card.classList.add("active");
      if (!seat) {
        card.classList.add("empty");
        card.textContent = `Koltuk ${absIdx + 1}: Boş`;
      } else {
        const isMe = seat.userId === myId;
        if (seat.isBot) card.classList.add("is-bot");
        const canSit = isSpec && seat.isBot;
        if (canSit) {
          card.classList.add("is-bot-joinable");
          card.setAttribute("role", "button");
          card.tabIndex = 0;
          card.title = "Bu botun yerine masaya oturmak için tıkla";
          const onSit = () => this.cb.onTakeBotSeat?.(absIdx);
          card.addEventListener("click", onSit);
          card.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              onSit();
            }
          });
        }
        const nameEl = document.createElement("strong");
        nameEl.textContent = seat.name + (isMe ? " (Sen)" : "");
        if (canSit) {
          const sitBadge = document.createElement("span");
          sitBadge.className = "okey-seat-sit-badge";
          sitBadge.textContent = "Otur";
          nameEl.append(sitBadge);
        }
        const metaEl = document.createElement("small");
        const countTxt = t.status === "playing" ? `${seat.tileCount} taş` : `${seat.score} p`;
        const openTxt = t.variant === "101" && seat.opened ? (seat.openedType === "pairs" ? " · Çift" : ` · ${seat.openedScore}p`) : "";
        metaEl.textContent = countTxt + openTxt;
        card.append(nameEl, metaEl);
        if (seat.topDiscard && rel === 3) {
          const leftMini = document.createElement("span");
          leftMini.className = `okey-mini-tile ${COLOR_META[seat.topDiscard.color]?.cls || "tile-c-F"}`;
          leftMini.textContent = formatShortTile(seat.topDiscard, t.okeyTarget);
          card.append(leftMini);
        }
        if (seat.reaction?.emoji) {
          const rx = document.createElement("span");
          rx.className = "okey-seat-react";
          rx.textContent = seat.reaction.emoji;
          card.append(rx);
        }
      }
      this.seatsHud.append(card);
    }
  }

  renderWaitOverlay() {
    const t = this.table;
    if (t.status !== "waiting") {
      this.waitOverlay.hidden = true;
      return;
    }
    this.waitOverlay.hidden = false;
    this.waitOverlay.replaceChildren();

    const box = document.createElement("div");
    box.className = "okey-wait-card";
    const h = document.createElement("h3");
    h.textContent = `${t.variant === "101" ? "101 Okey" : "Klasik Okey"} · Oyuncu Bekleniyor (${t.seatedCount}/4)`;
    const p = document.createElement("p");
    p.textContent = "Gerçek 4 kişilik masa kuralı: 4 koltuğun tamamı dolduğunda el otomatik olarak dağıtılır.";

    const seatsRow = document.createElement("div");
    seatsRow.className = "okey-wait-seats";
    for (let i = 0; i < 4; i++) {
      const s = t.seats?.[i];
      if (s) {
        const pill = document.createElement("div");
        pill.className = "okey-wait-seat filled";
        pill.textContent = `✓ ${i + 1}. ${s.name}`;
        seatsRow.append(pill);
      } else {
        const btn = this.makeBtn(`+ ${i + 1}. Koltuğa Otur`, "button small secondary", () =>
          this.cb.onJoinSeat?.(i),
        );
        seatsRow.append(btn);
      }
    }
    box.append(h, p, seatsRow);
    this.waitOverlay.append(box);
  }

  renderMeldsOverlay() {
    const t = this.table;
    if (t.variant !== "101" || !t.melds?.length || t.status === "waiting") {
      this.meldsPanel.hidden = true;
      return;
    }
    this.meldsPanel.hidden = false;
    this.meldsPanel.replaceChildren();

    const header = document.createElement("div");
    header.className = "okey-melds-head";
    header.textContent = `Masaya Açılan Perler (${t.melds.length})`;
    this.meldsPanel.append(header);

    const grid = document.createElement("div");
    grid.className = "okey-melds-list";
    const selectedTile = this.getSelectedTile();
    const mySeatObj = t.mySeat !== -1 ? t.seats?.[t.mySeat] : null;
    const canLayoffNow =
      t.mySeat !== -1 &&
      t.status === "playing" &&
      t.turn === t.mySeat &&
      t.turnPhase === "discard" &&
      mySeatObj?.opened &&
      mySeatObj?.openedType === "series" &&
      Boolean(selectedTile);

    for (const m of t.melds) {
      const grp = document.createElement("button");
      grp.type = "button";
      grp.className = "okey-meld-group";
      const fits = canLayoffNow && tileFitsMeldLocal(m, selectedTile, t.okeyTarget);
      if (fits) grp.classList.add("can-layoff");
      grp.title = fits ? "Seçili taşı buraya işlemek için tıkla!" : `${m.ownerName}`;
      grp.addEventListener("click", () => {
        if (fits && selectedTile) {
          this.selectedSlot = null;
          this.cb.onAction?.({ action: "layoff", meldIndex: m.index, tileId: selectedTile.id });
        }
      });

      const ownerTag = document.createElement("span");
      ownerTag.className = "okey-meld-owner";
      ownerTag.textContent = m.ownerName;
      grp.append(ownerTag);

      const strip = document.createElement("span");
      strip.className = "okey-meld-tiles";
      for (const tile of m.tiles) {
        const chip = document.createElement("span");
        const cm = tile.isFalse ? null : COLOR_META[tile.color];
        chip.className = `okey-mini-tile ${cm?.cls || "tile-c-F"}`;
        if (isRealOkey(tile, t.okeyTarget)) chip.classList.add("is-wild");
        chip.textContent = tile.isFalse ? `★` : String(tile.num);
        strip.append(chip);
      }
      grp.append(strip);
      grid.append(grp);
    }
    this.meldsPanel.append(grid);
  }

  renderSummaryOverlay() {
    const t = this.table;
    if (t.status !== "finished" || !t.roundSummary) {
      this.summaryOverlay.hidden = true;
      return;
    }
    this.summaryOverlay.hidden = false;
    this.summaryOverlay.replaceChildren();

    const card = document.createElement("div");
    card.className = "okey-summary-card";
    const h = document.createElement("h3");
    h.textContent = t.roundSummary.winnerName
      ? `🏆 ${t.roundSummary.winnerName} · ${t.roundSummary.finishLabel}`
      : t.roundSummary.finishLabel;
    card.append(h);

    const list = document.createElement("div");
    list.className = "okey-summary-rows";
    for (const r of t.roundSummary.results || []) {
      const row = document.createElement("div");
      row.className = "okey-summary-row";
      const meta = document.createElement("div");
      const sign = r.delta > 0 ? `+${r.delta}` : String(r.delta);
      meta.innerHTML = "";
      const nm = document.createElement("strong");
      nm.textContent = r.name;
      const pts = document.createElement("span");
      pts.className = "tag";
      pts.textContent = `${sign} → Toplam ${r.score} p`;
      meta.append(nm, pts);
      row.append(meta);
      if (r.tiles?.length) {
        const rem = document.createElement("div");
        rem.className = "okey-summary-tiles";
        for (const tile of r.tiles.slice(0, 22)) {
          const sp = document.createElement("span");
          sp.className = `okey-mini-tile ${COLOR_META[tile.color]?.cls || "tile-c-F"}`;
          sp.textContent = tile.isFalse ? "★" : String(tile.num);
          rem.append(sp);
        }
        row.append(rem);
      }
      list.append(row);
    }
    card.append(list);

    if (t.mySeat !== -1) {
      const btn = this.makeBtn(
        t.seatedCount === 4 ? "Yeni El Başlat ↻" : `Yeni El İçin 4/4 Bekleniyor (${t.seatedCount}/4)`,
        "button primary",
        () => this.cb.onAction?.({ action: "newRound" }),
      );
      btn.disabled = t.seatedCount < 4;
      card.append(btn);
    }
    this.summaryOverlay.append(card);
  }

  renderControls(is101, isSpec, isMyTurn) {
    const t = this.table;
    const prevSeat = t.mySeat !== -1 ? t.seats?.[(t.mySeat + 3) % 4] : null;
    const canDraw = isMyTurn && t.turnPhase === "draw";
    const canDiscard = isMyTurn && t.turnPhase === "discard";
    const mySeatObj = t.mySeat !== -1 ? t.seats?.[t.mySeat] : null;
    const selTile = this.getSelectedTile();

    this.deckBox.hidden = isSpec || t.status !== "playing";
    this.playBox.hidden = isSpec || t.status !== "playing";

    this.drawDeckBtn.disabled = !canDraw || t.deckCount <= 0;
    this.drawDeckBtn.textContent = `🁣 Deste (${t.deckCount})`;

    const leftTile = prevSeat?.topDiscard;
    this.drawLeftBtn.disabled = !canDraw || !leftTile;
    this.drawLeftBtn.textContent = leftTile
      ? `← Soldan Al (${COLOR_META[leftTile.color]?.name?.[0] || "★"}${leftTile.isFalse ? "" : leftTile.num})`
      : "← Soldan Al";

    this.undoLeftBtn.hidden = !(is101 && canDiscard && mySeatObj?.canUndoLeftDraw);

    const hasIndicatorInHand =
      !isSpec &&
      !mySeatObj?.shownIndicator &&
      t.indicator &&
      (t.myRack || []).some(
        (x) => x && !x.isFalse && x.color === t.indicator.color && x.num === t.indicator.num,
      );
    this.showIndicatorBtn.hidden = !(canDiscard && !is101 && hasIndicatorInHand && t.round >= 1 && (mySeatObj?.discards?.length || 0) === 0);

    // Discard & Finish buttons
    const mustOpenBlocked = Boolean(is101 && mySeatObj?.mustOpenThisTurn);
    const fitsTable = is101 && selTile && (t.melds || []).some((m) => tileFitsMeldLocal(m, selTile, t.okeyTarget));
    const selIsWild = selTile && isRealOkey(selTile, t.okeyTarget);
    this.discardBtn.disabled = !canDiscard || !selTile || mustOpenBlocked;
    this.discardBtn.textContent = mustOpenBlocked
      ? "⚠ Önce El Aç / Geri Koy"
      : is101 && selTile && (fitsTable || (selIsWild && (t.myRack?.filter(Boolean).length || 0) > 1))
        ? "⚠ İşlek/Okey At (+101 Ceza!)"
        : "➡ Sağdan Taş At";

    this.finishBtn.hidden = is101;
    this.finishBtn.disabled = !canDiscard || !selTile;

    // 101 Open buttons
    const a = t.myAnalysis;
    this.openSeriesBtn.hidden = !is101 || mySeatObj?.opened;
    this.openPairsBtn.hidden = !is101 || mySeatObj?.opened;
    this.openMoreBtn.hidden = !is101 || !mySeatObj?.opened;

    if (is101 && a) {
      this.openSeriesBtn.disabled = !canDiscard || !a.canOpenSeries;
      this.openSeriesBtn.textContent = `Seri Aç (${a.seriesScore}/101)`;
      this.openPairsBtn.disabled = !canDiscard || !a.canOpenPairs;
      this.openPairsBtn.textContent = `Çift Aç (${a.pairCount}/5)`;
      this.openMoreBtn.disabled = !canDiscard || (mySeatObj?.openedType === "pairs" ? a.pairCount === 0 : a.validGroupCount === 0);

      this.analysisPill.hidden = isSpec;
      this.analysisPill.textContent = mySeatObj?.opened
        ? mySeatObj.openedType === "pairs"
          ? "✓ Çift açtın · Çift devam"
          : "✓ El açık · Taşa bas + masa perine tıkla = İşle"
        : `Per toplamı: ${a.seriesScore} p · Çift: ${a.pairCount}`;
      this.analysisPill.classList.toggle("ready", Boolean(a.canOpenSeries || a.canOpenPairs || mySeatObj?.opened));
    } else {
      this.analysisPill.hidden = true;
    }

    this.selectionInfo.textContent = selTile
      ? `Seçili: ${COLOR_META[selTile.color]?.name || "Sahte"} ${selTile.isFalse ? "" : selTile.num}`
      : canDiscard
        ? "Atmak/bitmek için aşağıdan taş seç"
        : "";

    // Mini scoreboard
    this.scoreBox.replaceChildren();
    for (const s of t.seats || []) {
      if (!s) continue;
      const row = document.createElement("div");
      row.className = "okey-score-item";
      row.innerHTML = "";
      const n = document.createElement("span");
      n.textContent = s.name;
      const sc = document.createElement("strong");
      sc.textContent = `${s.score} p`;
      row.append(n, sc);
      this.scoreBox.append(row);
    }
  }

  getSelectedTile() {
    if (this.selectedSlot === null || !this.table?.myRack) return null;
    return this.table.myRack[this.selectedSlot] || null;
  }

  handleDiscardSelected() {
    const tile = this.getSelectedTile();
    if (!tile) return;
    this.selectedSlot = null;
    this.cb.onAction?.({ action: "discard", tileId: tile.id });
  }

  handleFinishSelected() {
    const tile = this.getSelectedTile();
    if (!tile) return;
    this.selectedSlot = null;
    this.cb.onAction?.({ action: "finish", tileId: tile.id });
  }

  renderRackDock(is101, isSpec, isMyTurn) {
    if (isSpec || this.table.status === "waiting" || !this.table.myRack) {
      this.rackDock.hidden = true;
      return;
    }
    this.rackDock.hidden = false;
    this.rackBoard.replaceChildren();

    const rack = this.table.myRack;
    // Detect contiguous valid melds/pairs per row so players get immediate visual feedback while arranging manually!
    const slotTag = Array(28).fill("");
    for (let r = 0; r < 2; r++) {
      let start = r * 14;
      while (start < (r + 1) * 14) {
        if (!rack[start]) {
          start++;
          continue;
        }
        let end = start;
        while (end + 1 < (r + 1) * 14 && rack[end + 1]) end++;
        const slice = rack.slice(start, end + 1);
        if (slice.length >= 3 && validateGroupLocal(slice, this.table.okeyTarget).valid) {
          for (let k = start; k <= end; k++) slotTag[k] = "is-group";
        } else if (slice.length === 2 && validatePairLocal(slice, this.table.okeyTarget)) {
          for (let k = start; k <= end; k++) slotTag[k] = "is-pair";
        }
        start = end + 1;
      }
    }

    for (let rowIdx = 0; rowIdx < 2; rowIdx++) {
      const rowEl = document.createElement("div");
      rowEl.className = "okey-istaka-row";
      for (let col = 0; col < 14; col++) {
        const slotIdx = rowIdx * 14 + col;
        const tile = rack[slotIdx];
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "okey-slot";
        cell.dataset.slot = String(slotIdx);
        if (slotTag[slotIdx]) cell.classList.add(slotTag[slotIdx]);
        if (this.selectedSlot === slotIdx) cell.classList.add("selected");

        // Drag-and-drop support for Desktop + pointer click-to-swap for Mobile & Touch!
        cell.addEventListener("dragover", (e) => {
          e.preventDefault();
          cell.classList.add("drag-over");
        });
        cell.addEventListener("dragleave", () => cell.classList.remove("drag-over"));
        cell.addEventListener("drop", (e) => {
          e.preventDefault();
          cell.classList.remove("drag-over");
          const from = Number(e.dataTransfer?.getData("text/plain") ?? this.dragFromSlot);
          this.dragFromSlot = null;
          if (Number.isInteger(from) && from !== slotIdx && rack[from]) {
            this.swapRackLocally(from, slotIdx);
          }
        });

        cell.addEventListener("click", () => {
          if (this.selectedSlot === null) {
            if (tile) {
              this.selectedSlot = slotIdx;
              this.renderRackDock(is101, isSpec, isMyTurn);
              this.renderControls(is101, isSpec, isMyTurn);
              this.renderMeldsOverlay();
            }
            return;
          }
          if (this.selectedSlot === slotIdx) {
            this.selectedSlot = null;
            this.renderRackDock(is101, isSpec, isMyTurn);
            this.renderControls(is101, isSpec, isMyTurn);
            this.renderMeldsOverlay();
            return;
          }
          const from = this.selectedSlot;
          this.selectedSlot = null;
          this.swapRackLocally(from, slotIdx);
        });

        if (tile) {
          cell.draggable = true;
          cell.addEventListener("dragstart", (e) => {
            this.dragFromSlot = slotIdx;
            e.dataTransfer?.setData("text/plain", String(slotIdx));
          });

          const chip = document.createElement("div");
          const cm = tile.isFalse ? null : COLOR_META[tile.color];
          chip.className = `okey-tile-chip ${cm?.cls || "tile-c-F"}`;
          const wild = isRealOkey(tile, this.table.okeyTarget);
          if (wild) chip.classList.add("is-wild");

          const numEl = document.createElement("span");
          numEl.className = "okey-tile-num";
          numEl.textContent = tile.isFalse ? "★" : String(tile.num);

          const pipEl = document.createElement("span");
          pipEl.className = "okey-tile-pip";
          pipEl.textContent = wild ? "OKEY" : tile.isFalse ? "SAHTE" : "●";

          chip.append(numEl, pipEl);
          cell.append(chip);
        }
        rowEl.append(cell);
      }
      this.rackBoard.append(rowEl);
    }
  }

  swapRackLocally(fromSlot, toSlot) {
    if (!this.table?.myRack) return;
    const tmp = this.table.myRack[fromSlot];
    this.table.myRack[fromSlot] = this.table.myRack[toSlot];
    this.table.myRack[toSlot] = tmp;
    playTilePlace();
    const is101 = this.table.variant === "101";
    const isMyTurn = this.table.status === "playing" && this.table.turn === this.table.mySeat;
    this.renderRackDock(is101, false, isMyTurn);
    this.renderControls(is101, false, isMyTurn);
    this.cb.onArrange?.({ mode: "move", fromSlot, toSlot });
  }

  dispose() {
    this.disposed = true;
    if (this.timerTick) {
      clearInterval(this.timerTick);
      this.timerTick = null;
    }
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.resizeObs?.disconnect();
    this.controls?.dispose();
    this.renderer?.dispose();
    this.texCache.forEach((tex) => tex.dispose());
    this.texCache.clear();
    this.backTex?.dispose();
    this.root.replaceChildren();
  }
}
