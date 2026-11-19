import * as THREE from "../vendor/three/three.module.js";
import { GLTFLoader } from "../vendor/three/GLTFLoader.js";
import { OrbitControls } from "../vendor/three/OrbitControls.js";
import {
  playChessCapture,
  playChessCheck,
  playChessMove,
  playChip,
  playDraw,
  playWin,
} from "./sfx.mjs";

const REACTIONS = ["🔥", "👏", "🤔", "😮", "🤝", "♟"];
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const PIECE_WEIGHT = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const PIECE_GLYPH = {
  wp: "♙",
  wn: "♘",
  wb: "♗",
  wr: "♖",
  wq: "♕",
  wk: "♔",
  bp: "♟",
  bn: "♞",
  bb: "♝",
  br: "♜",
  bq: "♛",
  bk: "♚",
};

function parseFenBoard(fen) {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const placement = String(fen || "").split(" ")[0] || "";
  const rows = placement.split("/");
  for (let r = 0; r < 8 && r < rows.length; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (ch >= "1" && ch <= "8") {
        f += Number(ch);
      } else if (f < 8) {
        const color = ch === ch.toUpperCase() ? "w" : "b";
        board[r][f] = { color, type: ch.toLowerCase() };
        f++;
      }
    }
  }
  return board;
}

function squareToRF(sq) {
  const f = FILES.indexOf(sq[0]);
  const rank = Number(sq[1]);
  const r = 8 - rank;
  return { r, f };
}

function rfToSquare(r, f) {
  if (r < 0 || r > 7 || f < 0 || f > 7) return null;
  return FILES[f] + String(8 - r);
}

function squareToWorld(r, f) {
  return new THREE.Vector3(f - 3.5, 0.08, r - 3.5);
}

function formatClock(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function makeHorizontalLabels(chars) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#221710";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#e8dcc4";
  ctx.font = "700 44px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const step = canvas.width / 8;
  for (let i = 0; i < 8; i++) {
    ctx.fillText(chars[i], step * i + step / 2, canvas.height / 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeVerticalLabels(chars) {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#221710";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#e8dcc4";
  ctx.font = "700 44px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const step = canvas.height / 8;
  for (let i = 0; i < 8; i++) {
    ctx.fillText(chars[i], canvas.width / 2, step * i + step / 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Procedural Staunton fallback if GLB ever fails
function buildFallbackPieceMesh(type, material) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.34, 0.16, 22),
    material,
  );
  base.position.y = 0.08;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  const heights = { p: 0.38, n: 0.56, b: 0.62, r: 0.50, q: 0.72, k: 0.82 };
  const h = heights[type] || 0.45;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.23, h, 20),
    material,
  );
  body.position.y = 0.16 + h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  if (type === "k") {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), material);
    v.position.y = 0.16 + h + 0.11;
    const hz = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.08), material);
    hz.position.y = 0.16 + h + 0.14;
    g.add(v, hz);
  } else if (type === "q") {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), material);
    orb.position.y = 0.16 + h + 0.08;
    g.add(orb);
  } else {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 14), material);
    cap.position.y = 0.16 + h + 0.06;
    g.add(cap);
  }
  return g;
}

export class ChessArena {
  constructor(root, user, callbacks) {
    this.root = root;
    this.user = user;
    this.cb = callbacks || {};
    this.table = null;
    this.disposed = false;
    this.webglReady = false;

    this.selectedSquare = null;
    this.pendingPromo = null; // { from, to }
    this.cameraMode = "bird"; // "bird" | "angle" | "low"
    this.flipped = false;
    this.viewInitForTable = null;
    this.lastMoveKey = "";
    this.lastStatus = "";

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pointerDownPos = null;

    this.boardGroup = null;
    this.piecesGroup = null;
    this.markersGroup = null;
    this.hitPlane = null;
    this.fileStripTop = null;
    this.fileStripBot = null;
    this.rankStripL = null;
    this.rankStripR = null;

    this.templates = {};
    this.whiteMat = null;
    this.blackMat = null;
    this.activeMeshes = new Map(); // square -> { color, type, obj }
    this.animating = []; // { obj, startPos, endPos, startAt, dur }
    this.rafId = null;
    this.clockInterval = null;

    this._buildDom();
    this._init3D();
    this._startClockLoop();
  }

  _myColor() {
    if (!this.table || !this.user) return null;
    const seat = this.table.seats?.find((s) => s && s.userId === this.user.id);
    return seat ? seat.color : null;
  }

  _isSpectator() {
    return Boolean(this.table && !this._myColor());
  }

  _buildDom() {
    this.root.replaceChildren();
    this.shell = document.createElement("div");
    this.shell.className = "bj-shell chess-shell";

    // Top Bar
    const top = document.createElement("div");
    top.className = "bj-topbar chess-topbar";

    const titleWrap = document.createElement("div");
    titleWrap.className = "bj-title-wrap";
    this.tableTitle = document.createElement("strong");
    this.tableTitle.textContent = "Satranç Masası";
    this.phaseBadge = document.createElement("span");
    this.phaseBadge.className = "tag bj-phase-tag";
    this.spectatorBadge = document.createElement("span");
    this.spectatorBadge.className = "tag chess-spec-tag";
    this.spectatorBadge.hidden = true;
    titleWrap.append(this.tableTitle, this.phaseBadge, this.spectatorBadge);

    const rightControls = document.createElement("div");
    rightControls.className = "bj-top-right";

    this.camBirdBtn = document.createElement("button");
    this.camBirdBtn.type = "button";
    this.camBirdBtn.className = "button small primary";
    this.camBirdBtn.textContent = "🦅 Kuş Bakışı";
    this.camBirdBtn.addEventListener("click", () => this.setCameraPreset("bird"));

    this.camAngleBtn = document.createElement("button");
    this.camAngleBtn.type = "button";
    this.camAngleBtn.className = "button small secondary";
    this.camAngleBtn.textContent = "🎥 3D Açı";
    this.camAngleBtn.addEventListener("click", () => this.setCameraPreset("angle"));

    this.flipBtn = document.createElement("button");
    this.flipBtn.type = "button";
    this.flipBtn.className = "button small secondary";
    this.flipBtn.textContent = "⇅ Tahtayı Çevir";
    this.flipBtn.addEventListener("click", () => this.toggleFlip());

    this.leaveBtn = document.createElement("button");
    this.leaveBtn.type = "button";
    this.leaveBtn.className = "button small secondary";
    this.leaveBtn.textContent = "Masadan kalk";
    this.leaveBtn.addEventListener("click", () => this.cb.onLeave?.());

    rightControls.append(
      this.camBirdBtn,
      this.camAngleBtn,
      this.flipBtn,
      this.leaveBtn,
    );
    top.append(titleWrap, rightControls);

    // Main responsive split: 3D Board Stage + Side Match Panel
    this.mainGrid = document.createElement("div");
    this.mainGrid.className = "chess-main-grid";

    // Left/Main Stage
    this.stage = document.createElement("div");
    this.stage.className = "bj-stage chess-stage";

    this.canvasWrap = document.createElement("div");
    this.canvasWrap.className = "bj-canvas-wrap chess-canvas-wrap";

    this.fallback2d = document.createElement("div");
    this.fallback2d.className = "chess-2d-fallback";
    this.fallback2d.hidden = true;

    this.banner = document.createElement("div");
    this.banner.className = "bj-status-banner chess-banner";
    this.banner.textContent = "Taşlar diziliyor…";

    this.hintPill = document.createElement("div");
    this.hintPill.className = "chess-cam-hint";
    this.hintPill.textContent =
      "Sürükle: Serbest Gez · Tekerlek/Parmak: Yakınlaş · Kareye dokun: Hamle yap";

    this.promoModal = document.createElement("div");
    this.promoModal.className = "chess-promo-modal";
    this.promoModal.hidden = true;
    const promoTitle = document.createElement("strong");
    promoTitle.textContent = "Terfi Taşı Seç:";
    const promoRow = document.createElement("div");
    promoRow.className = "chess-promo-choices";
    for (const [piece, label] of [
      ["q", "♕ Vezir"],
      ["r", "♖ Kale"],
      ["b", "♗ Fil"],
      ["n", "♘ At"],
    ]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "button primary small";
      btn.textContent = label;
      btn.addEventListener("click", () => this._submitPromotion(piece));
      promoRow.append(btn);
    }
    const promoCancel = document.createElement("button");
    promoCancel.type = "button";
    promoCancel.className = "button small secondary";
    promoCancel.textContent = "İptal";
    promoCancel.addEventListener("click", () => {
      this.pendingPromo = null;
      this.promoModal.hidden = true;
    });
    this.promoModal.append(promoTitle, promoRow, promoCancel);

    this.stage.append(
      this.canvasWrap,
      this.fallback2d,
      this.banner,
      this.hintPill,
      this.promoModal,
    );

    // Side HUD panel (Players, Clocks, Captures, Moves, Spectator bar, Controls)
    this.sidePanel = document.createElement("aside");
    this.sidePanel.className = "chess-side-panel";

    this.playersBox = document.createElement("div");
    this.playersBox.className = "chess-players-box";

    this.movesWrap = document.createElement("div");
    this.movesWrap.className = "chess-moves-wrap";
    const movesHead = document.createElement("div");
    movesHead.className = "chess-moves-head";
    movesHead.innerHTML = "<span>Hamle Geçmişi (SAN)</span>";
    this.moveCountBadge = document.createElement("span");
    this.moveCountBadge.className = "tag";
    movesHead.append(this.moveCountBadge);
    this.movesList = document.createElement("div");
    this.movesList.className = "chess-moves-list";
    this.movesWrap.append(movesHead, this.movesList);

    this.spectatorsListEl = document.createElement("div");
    this.spectatorsListEl.className = "chess-spectators-strip";
    this.spectatorsListEl.hidden = true;

    this.controlsBox = document.createElement("div");
    this.controlsBox.className = "chess-controls-box";

    this.reactRow = document.createElement("div");
    this.reactRow.className = "bj-react-row chess-react-row";
    for (const emoji of REACTIONS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "bj-react-btn";
      b.textContent = emoji;
      b.setAttribute("aria-label", `${emoji} tepkisi gönder`);
      b.addEventListener("click", () => {
        playChip();
        this.cb.onReact?.(emoji);
      });
      this.reactRow.append(b);
    }

    this.sidePanel.append(
      this.playersBox,
      this.movesWrap,
      this.spectatorsListEl,
      this.controlsBox,
      this.reactRow,
    );

    this.mainGrid.append(this.stage, this.sidePanel);
    this.shell.append(top, this.mainGrid);
    this.root.append(this.shell);
  }

  _init3D() {
    try {
      const testCanvas = document.createElement("canvas");
      const gl =
        testCanvas.getContext("webgl2") ||
        testCanvas.getContext("webgl") ||
        testCanvas.getContext("experimental-webgl");
      if (!gl) throw new Error("No WebGL");

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x0c110e);

      const width = Math.max(300, this.canvasWrap.clientWidth || 720);
      const height = Math.max(320, this.canvasWrap.clientHeight || 520);

      this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 70);
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.12;
      this.canvasWrap.append(this.renderer.domElement);

      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.minDistance = 5.5;
      this.controls.maxDistance = 24;
      this.controls.minPolarAngle = 0.04; // straight extreme bird's eye allowed!
      this.controls.maxPolarAngle = 1.42;
      this.controls.target.set(0, 0.1, 0);
      this.userOrbited = false;
      this.controls.addEventListener("start", () => {
        this.userOrbited = true;
      });

      // Rich tournament lighting
      const hemi = new THREE.HemisphereLight(0xfff8eb, 0x1e2822, 0.92);
      this.scene.add(hemi);

      const key = new THREE.DirectionalLight(0xfff4df, 1.55);
      key.position.set(4.5, 11, 5.5);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.near = 2;
      key.shadow.camera.far = 25;
      const d = 6;
      key.shadow.camera.left = -d;
      key.shadow.camera.right = d;
      key.shadow.camera.top = d;
      key.shadow.camera.bottom = -d;
      key.shadow.bias = -0.0005;
      this.scene.add(key);

      const rim = new THREE.DirectionalLight(0xa3c9ff, 0.55);
      rim.position.set(-6, 7, -5);
      this.scene.add(rim);

      this.whiteMat = new THREE.MeshStandardMaterial({
        color: 0xf4ecd8,
        roughness: 0.28,
        metalness: 0.06,
      });
      this.blackMat = new THREE.MeshStandardMaterial({
        color: 0x25282c,
        roughness: 0.34,
        metalness: 0.14,
      });

      this._buildBoard();
      this._loadPieceModels();

      this.piecesGroup = new THREE.Group();
      this.markersGroup = new THREE.Group();
      this.scene.add(this.markersGroup, this.piecesGroup);

      // Tap / Click handling separated cleanly from OrbitControls drag
      const domEl = this.renderer.domElement;
      domEl.addEventListener("pointerdown", (e) => {
        this.pointerDownPos = { x: e.clientX, y: e.clientY };
      });
      domEl.addEventListener("pointerup", (e) => {
        if (!this.pointerDownPos) return;
        const dx = e.clientX - this.pointerDownPos.x;
        const dy = e.clientY - this.pointerDownPos.y;
        this.pointerDownPos = null;
        if (Math.hypot(dx, dy) > 10) return; // User orbited camera, ignore move click
        this._handleBoardTap(e);
      });

      this.ro = new ResizeObserver(() => this._resize());
      this.ro.observe(this.canvasWrap);

      this.webglReady = true;
      this._applyCameraImmediate("bird", false);
      this._animate();
    } catch {
      this.webglReady = false;
      this.canvasWrap.hidden = true;
      this.fallback2d.hidden = false;
    }
  }

  _buildBoard() {
    this.boardGroup = new THREE.Group();

    // Rich dark walnut cabinet frame (top at y = 0.072, safely beneath tile top y = 0.082)
    const cabinet = new THREE.Mesh(
      new THREE.BoxGeometry(9.2, 0.28, 9.2),
      new THREE.MeshStandardMaterial({
        color: 0x2a1c14,
        roughness: 0.45,
        metalness: 0.08,
      }),
    );
    cabinet.position.y = -0.07;
    cabinet.receiveShadow = true;
    this.boardGroup.add(cabinet);

    // Recessed warm brass border frame strictly below tile top (top at y = 0.076)
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(8.18, 0.06, 8.18),
      new THREE.MeshStandardMaterial({
        color: 0xa27e3d,
        roughness: 0.35,
        metalness: 0.55,
      }),
    );
    trim.position.y = 0.044;
    this.boardGroup.add(trim);

    const lightSqMat = new THREE.MeshStandardMaterial({
      color: 0xebe0c6,
      roughness: 0.42,
      metalness: 0.02,
    });
    const darkSqMat = new THREE.MeshStandardMaterial({
      color: 0x4b7057,
      roughness: 0.46,
      metalness: 0.04,
    });

    const tileGeo = new THREE.BoxGeometry(1.0, 0.08, 1.0);
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const isLight = (r + f) % 2 === 0;
        const tile = new THREE.Mesh(tileGeo, isLight ? lightSqMat : darkSqMat);
        tile.position.set(f - 3.5, 0.042, r - 3.5);
        tile.receiveShadow = true;
        tile.userData.square = rfToSquare(r, f);
        this.boardGroup.add(tile);
      }
    }

    // Coordinate label strips along the walnut bezel
    const fileTex = makeHorizontalLabels(FILES);
    const rankTex = makeVerticalLabels(["8", "7", "6", "5", "4", "3", "2", "1"]);

    const stripH = new THREE.PlaneGeometry(8.0, 0.36);
    this.fileStripBot = new THREE.Mesh(
      stripH,
      new THREE.MeshBasicMaterial({ map: fileTex }),
    );
    this.fileStripBot.rotation.x = -Math.PI / 2;
    this.fileStripBot.position.set(0, 0.073, 4.30);

    this.fileStripTop = new THREE.Mesh(
      stripH,
      new THREE.MeshBasicMaterial({ map: fileTex }),
    );
    this.fileStripTop.rotation.x = -Math.PI / 2;
    this.fileStripTop.position.set(0, 0.073, -4.30);

    const stripV = new THREE.PlaneGeometry(0.36, 8.0);
    this.rankStripL = new THREE.Mesh(
      stripV,
      new THREE.MeshBasicMaterial({ map: rankTex }),
    );
    this.rankStripL.rotation.x = -Math.PI / 2;
    this.rankStripL.position.set(-4.30, 0.073, 0);

    this.rankStripR = new THREE.Mesh(
      stripV,
      new THREE.MeshBasicMaterial({ map: rankTex }),
    );
    this.rankStripR.rotation.x = -Math.PI / 2;
    this.rankStripR.position.set(4.30, 0.073, 0);

    this.boardGroup.add(
      this.fileStripBot,
      this.fileStripTop,
      this.rankStripL,
      this.rankStripR,
    );

    // Invisible crisp click hit plane over 8x8 surface
    this.hitPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(8.0, 8.0),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.hitPlane.rotation.x = -Math.PI / 2;
    this.hitPlane.position.y = 0.085;
    this.boardGroup.add(this.hitPlane);

    this.scene.add(this.boardGroup);
  }

  _loadPieceModels() {
    const loader = new GLTFLoader();
    loader.load(
      "/assets/models/chess.glb",
      (gltf) => {
        if (this.disposed) return;
        gltf.scene.traverse((child) => {
          if (child.isMesh && child.name.startsWith("piece_")) {
            const type = child.name.slice(6);
            this.templates[type] = child.geometry;
          }
        });
        if (this.table) this._syncPieces();
      },
      undefined,
      () => {
        // Fallback procedural geometries work automatically
      },
    );
  }

  _createPieceObject(color, type) {
    const mat = color === "w" ? this.whiteMat : this.blackMat;
    let obj;
    if (this.templates[type]) {
      const m = new THREE.Mesh(this.templates[type], mat);
      m.castShadow = true;
      m.receiveShadow = true;
      obj = m;
    } else {
      obj = buildFallbackPieceMesh(type, mat);
    }
    // Slight scale polish so pieces breathe cleanly inside 1x1 squares
    obj.scale.setScalar(0.92);
    // White pieces face -Z (toward Black), Black knights/pieces face +Z
    obj.rotation.y = color === "w" ? Math.PI : 0;
    obj.userData = { color, type };
    return obj;
  }

  _handleBoardTap(e) {
    if (!this.webglReady || !this.table || this.table.status !== "playing") return;
    if (this._isSpectator()) return;
    const myColor = this._myColor();
    if (!myColor || this.table.turn !== myColor) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    // Check piece hits first (tapping top of a King or Knight maps to its square!), then board plane
    const pieceHits = this.raycaster.intersectObjects(this.piecesGroup.children, true);
    let sq = null;
    if (pieceHits.length > 0) {
      let cur = pieceHits[0].object;
      while (cur && !cur.userData?.square && cur.parent) cur = cur.parent;
      sq = cur?.userData?.square || null;
    }
    if (!sq) {
      const hits = this.raycaster.intersectObject(this.hitPlane, false);
      if (hits.length > 0) {
        const pt = hits[0].point;
        const f = Math.min(7, Math.max(0, Math.floor(pt.x + 4)));
        const r = Math.min(7, Math.max(0, Math.floor(pt.z + 4)));
        sq = rfToSquare(r, f);
      }
    }
    if (sq) this._onSquareTap(sq);
  }

  _onSquareTap(sq) {
    if (!this.table || this.table.status !== "playing") return;
    const myColor = this._myColor();
    if (!myColor || this.table.turn !== myColor) return;

    const legalFromSelected = this.selectedSquare
      ? this.table.legalMoves?.[this.selectedSquare] || []
      : [];
    const targetMove = legalFromSelected.find((m) => m.to === sq);

    if (targetMove) {
      const from = this.selectedSquare;
      this.selectedSquare = null;
      this._renderMarkers();
      this._renderFallback2D();
      if (targetMove.promo) {
        this.pendingPromo = { from, to: sq };
        this.promoModal.hidden = false;
        return;
      }
      this.cb.onMove?.({ from, to: sq });
      return;
    }

    // Select own piece that has legal moves (or deselect if tapped again)
    if (this.selectedSquare === sq) {
      this.selectedSquare = null;
    } else if (this.table.legalMoves?.[sq]?.length) {
      playChip();
      this.selectedSquare = sq;
    } else {
      this.selectedSquare = null;
    }
    this._renderMarkers();
    this._renderFallback2D();
  }

  _submitPromotion(piece) {
    if (!this.pendingPromo) return;
    const { from, to } = this.pendingPromo;
    this.pendingPromo = null;
    this.promoModal.hidden = true;
    this.cb.onMove?.({ from, to, promotion: piece });
  }

  setCameraPreset(mode) {
    this.cameraMode = mode;
    this.userOrbited = false;
    this.camBirdBtn.className = "button small " + (mode === "bird" ? "primary" : "secondary");
    this.camAngleBtn.className = "button small " + (mode === "angle" ? "primary" : "secondary");
    if (this.webglReady) this._applyCameraImmediate(mode, this.flipped);
  }

  toggleFlip() {
    this.flipped = !this.flipped;
    if (this.webglReady) this._applyCameraImmediate(this.cameraMode, this.flipped);
  }

  _applyCameraImmediate(mode, flipped) {
    if (!this.camera || !this.controls) return;
    const side = flipped ? -1 : 1;
    // Rotate edge label strips 180 deg if flipped so Black's viewpoint reads upright
    const rot = flipped ? Math.PI : 0;
    for (const s of [this.fileStripBot, this.fileStripTop, this.rankStripL, this.rankStripR]) {
      if (s) s.rotation.z = rot;
    }
    const aspect = this.camera.aspect || 1;
    const portraitBoost = aspect < 1 ? 1.32 : 1.0;
    // Extreme bird's-eye default ("aşırı kuş bakışı"): fits full 8x8 board cleanly!
    if (mode === "bird") {
      this.camera.position.set(0, 14.6 * portraitBoost, 1.45 * side * portraitBoost);
    } else {
      this.camera.position.set(4.2 * side * portraitBoost, 9.2 * portraitBoost, 8.4 * side * portraitBoost);
    }
    this.controls.target.set(0, 0.08, 0);
    this.controls.update();
  }

  _resize() {
    if (!this.webglReady || !this.renderer || !this.camera) return;
    const w = Math.max(280, this.canvasWrap.clientWidth || 640);
    const h = Math.max(300, this.canvasWrap.clientHeight || 480);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (!this.userOrbited) this._applyCameraImmediate(this.cameraMode, this.flipped);
  }

  _animate() {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(() => this._animate());

    const now = performance.now();
    if (this.animating.length > 0) {
      const keep = [];
      for (const a of this.animating) {
        const t = Math.min(1, (now - a.startAt) / a.dur);
        const ease = 1 - Math.pow(1 - t, 3);
        a.obj.position.lerpVectors(a.startPos, a.endPos, ease);
        a.obj.position.y += Math.sin(t * Math.PI) * 0.42;
        if (t < 1) keep.push(a);
        else a.obj.position.copy(a.endPos);
      }
      this.animating = keep;
    }

    this.controls?.update();
    this.renderer?.render(this.scene, this.camera);
  }

  _syncPieces() {
    if (!this.webglReady || !this.table) return;
    const board = parseFenBoard(this.table.fen);
    const prevLast = this.table.lastMove;
    const prevSquare = prevLast ? prevLast.from : null;
    const nextSquare = prevLast ? prevLast.to : null;
    const prevMesh = prevSquare ? this.activeMeshes.get(prevSquare) : null;

    this.piecesGroup.clear();
    this.activeMeshes.clear();
    this.animating = [];

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const piece = board[r][f];
        if (!piece) continue;
        const sq = rfToSquare(r, f);
        const obj = this._createPieceObject(piece.color, piece.type);
        obj.userData.square = sq;
        const targetPos = squareToWorld(r, f);

        if (
          prevLast &&
          sq === nextSquare &&
          prevMesh &&
          prevMesh.color === piece.color
        ) {
          const fromRF = squareToRF(prevSquare);
          const startPos = squareToWorld(fromRF.r, fromRF.f);
          obj.position.copy(startPos);
          this.animating.push({
            obj,
            startPos,
            endPos: targetPos,
            startAt: performance.now(),
            dur: 210,
          });
        } else {
          obj.position.copy(targetPos);
        }

        this.piecesGroup.add(obj);
        this.activeMeshes.set(sq, { color: piece.color, type: piece.type, obj });
      }
    }
    this._renderMarkers();
  }

  _renderMarkers() {
    if (!this.webglReady || !this.table) return;
    this.markersGroup.clear();

    const addSqHighlight = (sq, color, opacity = 0.42, y = 0.083) => {
      const { r, f } = squareToRF(sq);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.94, 0.94),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(f - 3.5, y, r - 3.5);
      this.markersGroup.add(mesh);
    };

    if (this.table.lastMove) {
      addSqHighlight(this.table.lastMove.from, 0xf2d14b, 0.34, 0.082);
      addSqHighlight(this.table.lastMove.to, 0xf2d14b, 0.44, 0.082);
    }

    if (this.selectedSquare) {
      addSqHighlight(this.selectedSquare, 0xc5f273, 0.52, 0.084);
      const targets = this.table.legalMoves?.[this.selectedSquare] || [];
      const board = parseFenBoard(this.table.fen);
      for (const m of targets) {
        const { r, f } = squareToRF(m.to);
        const occupied = Boolean(board[r][f]);
        if (occupied) {
          // Capture ring
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.34, 0.46, 28),
            new THREE.MeshBasicMaterial({
              color: 0xff6b6b,
              transparent: true,
              opacity: 0.85,
              side: THREE.DoubleSide,
              depthWrite: false,
            }),
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(f - 3.5, 0.086, r - 3.5);
          this.markersGroup.add(ring);
        } else {
          // Quiet move dot
          const dot = new THREE.Mesh(
            new THREE.CircleGeometry(0.16, 22),
            new THREE.MeshBasicMaterial({
              color: 0xc5f273,
              transparent: true,
              opacity: 0.86,
              depthWrite: false,
            }),
          );
          dot.rotation.x = -Math.PI / 2;
          dot.position.set(f - 3.5, 0.086, r - 3.5);
          this.markersGroup.add(dot);
        }
      }
    }

    if (this.table.inCheck && this.table.status === "playing") {
      const board = parseFenBoard(this.table.fen);
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const p = board[r][f];
          if (p && p.type === "k" && p.color === this.table.turn) {
            addSqHighlight(rfToSquare(r, f), 0xff3b3b, 0.62, 0.085);
          }
        }
      }
    }
  }

  _startClockLoop() {
    this.clockInterval = setInterval(() => this._refreshClocks(), 500);
  }

  _refreshClocks() {
    if (!this.table) return;
    const els = this.playersBox.querySelectorAll("[data-chess-clock]");
    for (const el of els) {
      const col = el.getAttribute("data-chess-clock");
      let total = this.table.clocks?.[col] || 0;
      if (
        this.table.status === "playing" &&
        this.table.turn === col &&
        this.table.turnStartedAt
      ) {
        total += Math.max(0, Date.now() - this.table.turnStartedAt);
      }
      el.textContent = formatClock(total);
    }
    const graceEls = this.playersBox.querySelectorAll("[data-chess-grace]");
    for (const gel of graceEls) {
      const deadline = Number(gel.getAttribute("data-chess-grace")) || 0;
      const remMs = Math.max(0, deadline - Date.now());
      gel.textContent =
        remMs > 0 ? `⏳ Koptu · ${formatClock(remMs)}` : "⏳ Süre doluyor";
    }
  }

  update(table) {
    this.table = table;
    if (!table) return;

    const myColor = this._myColor();
    const isSpec = !myColor;

    // Auto orient board on first render of a table so Black sits bottom-facing for Black player!
    if (this.viewInitForTable !== table.id) {
      this.viewInitForTable = table.id;
      this.flipped = myColor === "b";
      this.selectedSquare = null;
      this.pendingPromo = null;
      this.promoModal.hidden = true;
      if (this.webglReady) this._applyCameraImmediate(this.cameraMode, this.flipped);
    }

    // Play crisp move / capture / check / game-over sounds cleanly on change
    const mvKey = table.lastMove
      ? `${table.round}:${table.moves?.length || 0}:${table.lastMove.san}`
      : `${table.round}:0`;
    if (this.lastMoveKey && this.lastMoveKey !== mvKey && table.lastMove) {
      const last = table.moves[table.moves.length - 1];
      if (table.inCheck) playChessCheck();
      else if (last?.captured) playChessCapture();
      else playChessMove();
    }
    this.lastMoveKey = mvKey;

    if (this.lastStatus !== table.status && table.status === "finished") {
      if (table.winnerColor === "draw") playDraw();
      else if (myColor && table.winnerColor === myColor) playWin();
      else playWin();
    }
    this.lastStatus = table.status;

    this.tableTitle.textContent = table.name || "Satranç 3D";
    if (table.status === "waiting") {
      this.phaseBadge.textContent = "OYUNCU BEKLENİYOR";
    } else if (table.status === "playing") {
      const sideLabel = table.turn === "w" ? "Beyaz Hamlede" : "Siyah Hamlede";
      this.phaseBadge.textContent = table.inCheck ? `ŞAH! · ${sideLabel}` : sideLabel;
    } else {
      this.phaseBadge.textContent =
        table.winnerColor === "draw"
          ? `BERABERE · ${table.resultReason}`
          : `BİTTİ · ${table.resultReason}`;
    }

    if (isSpec || table.spectatorCount > 0) {
      this.spectatorBadge.hidden = false;
      this.spectatorBadge.textContent = isSpec
        ? `👁 İzleyici Modu · ${table.spectatorCount || 1} İzleyici`
        : `👁 ${table.spectatorCount} İzleyici`;
    } else {
      this.spectatorBadge.hidden = true;
    }

    this.banner.textContent = table.lastAction?.text || "Satranç Masası hazır.";

    if (
      this.selectedSquare &&
      (table.status !== "playing" || table.turn !== myColor)
    ) {
      this.selectedSquare = null;
    }

    this._syncPieces();
    this._renderFallback2D();
    this._renderPlayersAndControls();
  }

  _renderFallback2D() {
    if (this.webglReady || !this.table) return;
    this.fallback2d.replaceChildren();
    const board = parseFenBoard(this.table.fen);
    const grid = document.createElement("div");
    grid.className = "chess-2d-grid";
    const rows = this.flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const files = this.flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const legalTargets = new Set(
      (this.table.legalMoves?.[this.selectedSquare] || []).map((m) => m.to),
    );
    for (const r of rows) {
      for (const f of files) {
        const sq = rfToSquare(r, f);
        const p = board[r][f];
        const btn = document.createElement("button");
        btn.type = "button";
        const isLight = (r + f) % 2 === 0;
        btn.className =
          "chess-2d-sq " +
          (isLight ? "light" : "dark") +
          (this.selectedSquare === sq ? " selected" : "") +
          (legalTargets.has(sq) ? " legal" : "") +
          (this.table.lastMove?.from === sq || this.table.lastMove?.to === sq
            ? " last"
            : "");
        btn.setAttribute("aria-label", sq);
        btn.textContent = p ? PIECE_GLYPH[p.color + p.type] : "";
        btn.addEventListener("click", () => this._onSquareTap(sq));
        grid.append(btn);
      }
    }
    this.fallback2d.append(grid);
  }

  _renderPlayersAndControls() {
    const t = this.table;
    if (!t) return;
    const myColor = this._myColor();
    const isSpec = !myColor;

    // Players HUD (show opponent on top, own side or White on bottom relative to flip)
    this.playersBox.replaceChildren();
    const order = this.flipped ? [0, 1] : [1, 0];
    for (const idx of order) {
      const seat = t.seats[idx];
      const color = idx === 0 ? "w" : "b";
      const isActive = t.status === "playing" && t.turn === color;
      const card = document.createElement("div");
      card.className =
        "chess-player-card" +
        (isActive ? " active-turn" : "") +
        (t.winnerColor === color ? " winner" : "") +
        (seat?.disconnected ? " disconnected" : "");

      const topRow = document.createElement("div");
      topRow.className = "chess-player-top";
      const icon = color === "w" ? "♔" : "♚";
      const label = seat
        ? seat.isBot
          ? `🤖 ${seat.name}`
          : seat.userId === this.user?.id
            ? `${seat.name} (Sen)`
            : seat.name
        : `Boş (${color === "w" ? "Beyaz" : "Siyah"})`;
      const nameEl = document.createElement("strong");
      nameEl.textContent = `${icon} ${label}`;

      const rightMeta = document.createElement("div");
      rightMeta.className = "chess-player-meta";
      if (seat?.disconnected && seat?.reconnectDeadline) {
        const g = document.createElement("span");
        g.className = "tag chess-grace-tag";
        g.setAttribute("data-chess-grace", String(seat.reconnectDeadline));
        g.textContent = "⏳ Koptu";
        rightMeta.append(g);
      }
      if (seat && seat.wins > 0) {
        const w = document.createElement("span");
        w.className = "tag";
        w.textContent = `${seat.wins}G`;
        rightMeta.append(w);
      }
      const clock = document.createElement("span");
      clock.className = "chess-clock";
      clock.setAttribute("data-chess-clock", color);
      clock.textContent = formatClock(t.clocks?.[color] || 0);
      rightMeta.append(clock);
      topRow.append(nameEl, rightMeta);

      // Captured pieces + reaction bubble
      const capRow = document.createElement("div");
      capRow.className = "chess-captured-row";
      const caps = t.captured?.[color] || [];
      if (caps.length) {
        const capColor = color === "w" ? "b" : "w";
        capRow.textContent = caps.map((pt) => PIECE_GLYPH[capColor + pt]).join(" ");
      } else {
        capRow.textContent = color === "w" ? "Beyaz Taşlar" : "Siyah Taşlar";
      }

      if (seat?.reaction && Date.now() - seat.reaction.at < 4000) {
        const reactBubble = document.createElement("span");
        reactBubble.className = "bj-react-bubble";
        reactBubble.textContent = seat.reaction.emoji;
        card.append(reactBubble);
      }

      card.append(topRow, capRow);
      this.playersBox.append(card);
    }
    this._refreshClocks();

    // Move list (paired 1. e4 e5)
    this.moveCountBadge.textContent = `${t.moves?.length || 0} hamle`;
    this.movesList.replaceChildren();
    const moves = t.moves || [];
    for (let i = 0; i < moves.length; i += 2) {
      const pair = document.createElement("div");
      pair.className = "chess-move-pair";
      const num = document.createElement("span");
      num.className = "chess-move-num";
      num.textContent = `${Math.floor(i / 2) + 1}.`;
      const wMv = document.createElement("span");
      wMv.textContent = moves[i]?.san || "";
      const bMv = document.createElement("span");
      bMv.textContent = moves[i + 1]?.san || "";
      pair.append(num, wMv, bMv);
      this.movesList.append(pair);
    }
    this.movesList.scrollTop = this.movesList.scrollHeight;

    // Spectators bar
    if (t.spectatorCount > 0) {
      this.spectatorsListEl.hidden = false;
      this.spectatorsListEl.textContent = `👁 İzleyenler (${t.spectatorCount}): ${(t.spectators || []).join(", ")}`;
    } else {
      this.spectatorsListEl.hidden = true;
    }

    // Action controls
    this.controlsBox.replaceChildren();
    this.reactRow.hidden = isSpec;

    if (isSpec) {
      const note = document.createElement("p");
      note.className = "chess-spec-note";
      note.textContent =
        "👁 İzleyici modundasın. Hamleleri canlı izleyebilir ve sağ alttan sohbet edebilirsin.";
      this.controlsBox.append(note);
      if (t.seatedCount < 2 && t.status === "waiting") {
        const sitBtn = document.createElement("button");
        sitBtn.type = "button";
        sitBtn.className = "button primary";
        sitBtn.textContent = "🪑 Boş Koltuğa Otur";
        sitBtn.addEventListener("click", () => this.cb.onSit?.());
        this.controlsBox.append(sitBtn);
      }
      return;
    }

    if (t.status === "waiting") {
      const diffRow = document.createElement("div");
      diffRow.className = "chess-bot-bar";
      for (const [d, lbl] of [
        ["easy", "Kolay Bot"],
        ["medium", "Orta Bot"],
        ["hard", "Usta Bot"],
      ]) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "button small secondary";
        b.textContent = `🤖 ${lbl}`;
        b.addEventListener("click", () => this.cb.onConfig?.({ withBot: true, botDifficulty: d }));
        diffRow.append(b);
      }
      const info = document.createElement("small");
      info.className = "chess-wait-hint";
      info.textContent = "Arkadaşın lobiden Katıl'a basınca oyun başlar veya hemen Bot ekle.";
      this.controlsBox.append(diffRow, info);
      return;
    }

    if (t.status === "playing") {
      // Check incoming draw offer
      if (t.drawOfferBy && t.drawOfferBy !== myColor) {
        const offerBanner = document.createElement("div");
        offerBanner.className = "chess-draw-banner";
        offerBanner.innerHTML = "<span>🤝 Rakibin beraberlik teklif etti!</span>";
        const btns = document.createElement("div");
        btns.className = "game-buttons";
        const acc = document.createElement("button");
        acc.type = "button";
        acc.className = "button small primary";
        acc.textContent = "Kabul Et";
        acc.addEventListener("click", () => this.cb.onAction?.("acceptDraw"));
        const dec = document.createElement("button");
        dec.type = "button";
        dec.className = "button small secondary";
        dec.textContent = "Reddet";
        dec.addEventListener("click", () => this.cb.onAction?.("declineDraw"));
        btns.append(acc, dec);
        offerBanner.append(btns);
        this.controlsBox.append(offerBanner);
      }

      const row = document.createElement("div");
      row.className = "game-buttons";
      if (!t.hasBot) {
        const drawBtn = document.createElement("button");
        drawBtn.type = "button";
        drawBtn.className = "button small secondary";
        drawBtn.disabled = t.drawOfferBy === myColor;
        drawBtn.textContent =
          t.drawOfferBy === myColor ? "🤝 Teklif gönderildi" : "🤝 Beraberlik Teklif Et";
        drawBtn.addEventListener("click", () => this.cb.onAction?.("offerDraw"));
        row.append(drawBtn);
      }
      const resignBtn = document.createElement("button");
      resignBtn.type = "button";
      resignBtn.className = "button small danger";
      resignBtn.textContent = "🏳 Terk Et";
      resignBtn.addEventListener("click", () => {
        if (confirm("Oyunu terk etmek istediğine emin misin?")) {
          this.cb.onAction?.("resign");
        }
      });
      row.append(resignBtn);
      this.controlsBox.append(row);
      return;
    }

    if (t.status === "finished") {
      const resBanner = document.createElement("div");
      resBanner.className = "chess-result-banner";
      resBanner.textContent =
        t.winnerColor === "draw"
          ? `🤝 Berabere — ${t.resultReason}`
          : `🏆 Kazanan: ${t.winnerName} (${t.resultReason})`;
      const row = document.createElement("div");
      row.className = "game-buttons";
      if (t.seats[0] && t.seats[1]) {
        const rematchBtn = document.createElement("button");
        rematchBtn.type = "button";
        rematchBtn.className = "button primary";
        rematchBtn.textContent = "↻ Rövanş (Beyaz ↔ Siyah)";
        rematchBtn.addEventListener("click", () => this.cb.onAction?.("rematch"));
        row.append(rematchBtn);
      }
      this.controlsBox.append(resBanner, row);
    }
  }

  dispose() {
    this.disposed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.clockInterval) clearInterval(this.clockInterval);
    this.ro?.disconnect();
    this.controls?.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement?.remove();
    }
    this.root.replaceChildren();
  }
}
