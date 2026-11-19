import * as THREE from "../vendor/three/three.module.js";
import { GLTFLoader } from "../vendor/three/GLTFLoader.js";
import { OrbitControls } from "../vendor/three/OrbitControls.js";
import {
  playChip,
  playDraw,
  playTavlaBearOff,
  playTavlaHit,
  playTavlaMove,
  playTavlaRoll,
  playWin,
} from "./sfx.mjs";

const REACTIONS = ["🎲", "🔥", "👏", "😮", "😅", "🤝"];
const TARGET_SCORES = [1, 3, 5];

// Exact orientation verified against assets/models/dice.glb so top face (+Y) displays pips 1..6
const FACE_EULERS = {
  1: new THREE.Euler(Math.PI, 0, 0),
  2: new THREE.Euler(-Math.PI / 2, 0, 0),
  3: new THREE.Euler(0, 0, -Math.PI / 2),
  4: new THREE.Euler(0, 0, Math.PI / 2),
  5: new THREE.Euler(Math.PI / 2, 0, 0),
  6: new THREE.Euler(0, 0, 0),
};

function faceTargetQuaternion(value, yaw = 0) {
  const qFace = new THREE.Quaternion().setFromEuler(FACE_EULERS[value] || FACE_EULERS[6]);
  const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  return qYaw.multiply(qFace);
}

// Geometry constants matched precisely to assets/models/tavla.glb
const BOARD_W = 10.8;
const BOARD_D = 7.6;
const INNER_X_MIN = -5.06;
const BAR_X = -0.48;
const LEFT_X_MIN = -5.06;
const LEFT_X_MAX = -0.76;
const RIGHT_X_MIN = -0.2;
const RIGHT_X_MAX = 4.1;
const QUAD_W = 4.3;
const COL_W = QUAD_W / 6;
const TRAY_X = 4.7;
const INNER_Z = 3.46;
const FLOOR_Y = 0.162;

function colorLabel(color) {
  return color === "w" ? "Beyaz" : "Siyah";
}

function pointLayoutCoords(point, flipped = false) {
  const vp = flipped ? 25 - point : point;
  let isTop = false;
  let x = 0;
  if (vp >= 1 && vp <= 6) {
    isTop = false;
    const col = 6 - vp;
    x = RIGHT_X_MIN + (col + 0.5) * COL_W;
  } else if (vp >= 7 && vp <= 12) {
    isTop = false;
    const col = 12 - vp;
    x = LEFT_X_MIN + (col + 0.5) * COL_W;
  } else if (vp >= 13 && vp <= 18) {
    isTop = true;
    const col = vp - 13;
    x = LEFT_X_MIN + (col + 0.5) * COL_W;
  } else {
    isTop = true;
    const col = vp - 19;
    x = RIGHT_X_MIN + (col + 0.5) * COL_W;
  }
  const zSign = isTop ? -1 : 1;
  return { x, zSign, isTop, vp };
}

function createInlaidBoardTexture(flipped = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1400;
  const ctx = canvas.getContext("2d");

  const spanX = 10.12; // -5.06 .. +5.06
  const spanZ = 6.92; // -3.46 .. +3.46
  const toU = (x) => ((x - INNER_X_MIN) / spanX) * canvas.width;
  const toV = (z) => ((z + INNER_Z) / spanZ) * canvas.height;

  // Base warm satin walnut veneer bed
  const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, "#2b1c12");
  bg.addColorStop(0.5, "#3a2518");
  bg.addColorStop(1, "#26180f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle wood grain horizontal streaks
  ctx.strokeStyle = "rgba(255, 224, 180, 0.035)";
  ctx.lineWidth = 2;
  for (let y = 8; y < canvas.height; y += 11) {
    ctx.beginPath();
    ctx.moveTo(0, y + Math.sin(y * 0.05) * 4);
    ctx.bezierCurveTo(
      canvas.width * 0.35,
      y - 6,
      canvas.width * 0.7,
      y + 7,
      canvas.width,
      y,
    );
    ctx.stroke();
  }

  // Center quad recessed parchment/camel inlay fields + bear-off dark emerald baize
  const fillField = (x1, x2, colA, colB) => {
    const ux1 = toU(x1);
    const ux2 = toU(x2);
    const grd = ctx.createLinearGradient(ux1, 0, ux2, canvas.height);
    grd.addColorStop(0, colA);
    grd.addColorStop(1, colB);
    ctx.fillStyle = grd;
    ctx.fillRect(ux1, 14, ux2 - ux1, canvas.height - 28);
    ctx.strokeStyle = "rgba(218, 174, 98, 0.38)";
    ctx.lineWidth = 4;
    ctx.strokeRect(ux1 + 2, 16, ux2 - ux1 - 4, canvas.height - 32);
  };

  fillField(LEFT_X_MIN, LEFT_X_MAX, "#d8c49e", "#c7ae84");
  fillField(RIGHT_X_MIN, RIGHT_X_MAX, "#d8c49e", "#c7ae84");
  fillField(4.34, 5.06, "#14261c", "#0e1b14");

  // Subtle center home divider shadow groove inside quads
  ctx.fillStyle = "rgba(38, 22, 12, 0.14)";
  ctx.fillRect(toU(LEFT_X_MIN), canvas.height * 0.495, toU(LEFT_X_MAX) - toU(LEFT_X_MIN), 8);
  ctx.fillRect(toU(RIGHT_X_MIN), canvas.height * 0.495, toU(RIGHT_X_MAX) - toU(RIGHT_X_MIN), 8);

  // Inlaid marquetry triangles (dark mahogany vs mother-of-pearl / gold trim)
  const triTipLen = canvas.height * 0.415;
  for (let p = 1; p <= 24; p++) {
    const { x, isTop } = pointLayoutCoords(p, flipped);
    const cx = toU(x);
    const halfW = ((COL_W * 0.86) / spanX) * canvas.width * 0.5;
    const baseY = isTop ? 18 : canvas.height - 18;
    const tipY = isTop ? baseY + triTipLen : baseY - triTipLen;

    const isDark = p % 2 === 1;
    const grad = ctx.createLinearGradient(cx, baseY, cx, tipY);
    if (isDark) {
      grad.addColorStop(0, "#5a1f16");
      grad.addColorStop(1, "#3d120c");
    } else {
      grad.addColorStop(0, "#243b2e");
      grad.addColorStop(1, "#16261d");
    }

    ctx.beginPath();
    ctx.moveTo(cx - halfW, baseY);
    ctx.lineTo(cx, tipY);
    ctx.lineTo(cx + halfW, baseY);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = isDark ? "rgba(235, 198, 130, 0.55)" : "rgba(182, 222, 165, 0.42)";
    ctx.lineWidth = 2.6;
    ctx.stroke();

    // Fine inlaid inner spear accent
    ctx.beginPath();
    ctx.moveTo(cx, baseY + (isTop ? 24 : -24));
    ctx.lineTo(cx, tipY + (isTop ? -26 : 26));
    ctx.strokeStyle = "rgba(255, 240, 200, 0.16)";
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  // Subtle brass corner filigree dots on bear-off tray
  ctx.fillStyle = "rgba(218, 174, 98, 0.5)";
  ctx.font = "600 22px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("TOPLAMA", toU(TRAY_X), canvas.height * 0.5 + 8);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function createDiePipBadge(value, dimmed = false) {
  const el = document.createElement("span");
  el.className = `tavla-die-badge${dimmed ? " used" : ""}`;
  el.setAttribute("aria-label", `Zar ${value}`);
  const grid = document.createElement("span");
  grid.className = "tavla-die-grid";
  const pipMap = {
    1: [4],
    2: [2, 6],
    3: [2, 4, 6],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  const active = new Set(pipMap[value] || []);
  for (let i = 0; i < 9; i++) {
    const dot = document.createElement("span");
    dot.className = active.has(i) ? "pip on" : "pip";
    grid.append(dot);
  }
  el.append(grid);
  return el;
}

export class TavlaArena {
  constructor(root, callbacks = {}) {
    this.root = root;
    this.cb = callbacks;
    this.table = null;
    this.user = null;
    this.spectator = false;
    this.disposed = false;
    this.viewMode = "3d";
    this.selectedFrom = null;
    this.boardFlipped = null; // null = auto from user's color
    this.prevState = null;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.rafId = 0;
    this.ro = null;

    this.checkerGroup = new THREE.Group();
    this.highlightGroup = new THREE.Group();
    this.hitGroup = new THREE.Group();
    this.trayGroup = new THREE.Group();
    this.boardPlane = null;
    this.boardTexture = null;
    this.templateCheckerGeo = null;
    this.dieMeshPool = [];
    this.diceAnim = null;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pointerDownPos = null;
    this.cameraTopView = false;

    this.materials = {
      whiteChecker: new THREE.MeshStandardMaterial({
        color: 0xf4ead2,
        roughness: 0.22,
        metalness: 0.06,
      }),
      blackChecker: new THREE.MeshStandardMaterial({
        color: 0x1f2228,
        roughness: 0.26,
        metalness: 0.14,
      }),
      goldRing: new THREE.MeshBasicMaterial({
        color: 0xb7ec5d,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      }),
      targetRing: new THREE.MeshBasicMaterial({
        color: 0xf4c44e,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
      }),
      hitRing: new THREE.MeshBasicMaterial({
        color: 0xff6b57,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
      }),
      invisibleHit: new THREE.MeshBasicMaterial({
        visible: false,
        side: THREE.DoubleSide,
      }),
    };

    this.buildDOM();
    this.initScene();
  }

  buildDOM() {
    this.root.replaceChildren();
    const wrap = document.createElement("div");
    wrap.className = "tavla-arena";

    // Header strip: seats + match score + pips + actions
    const topBar = document.createElement("div");
    topBar.className = "tavla-topbar";
    this.playersEl = document.createElement("div");
    this.playersEl.className = "tavla-players";
    this.matchBadgeEl = document.createElement("div");
    this.matchBadgeEl.className = "tavla-match-badge";
    const topRight = document.createElement("div");
    topRight.className = "tavla-top-actions";
    this.helpBtn = document.createElement("button");
    this.helpBtn.type = "button";
    this.helpBtn.className = "button small secondary";
    this.helpBtn.textContent = "? Tavla Kuralları";
    this.helpBtn.addEventListener("click", () => this.cb.onHelp?.());

    this.flipBtn = document.createElement("button");
    this.flipBtn.type = "button";
    this.flipBtn.className = "button small secondary";
    this.flipBtn.textContent = "⇅ Yön";
    this.flipBtn.title = "Tahtayı çevir [F]";
    this.flipBtn.addEventListener("click", () => {
      this.boardFlipped = !this.effectiveFlipped();
      this.rebuildBoardTexture();
      this.rebuildCheckers();
      this.rebuildHighlights();
      this.syncBearOffStacks();
    });

    this.camBtn = document.createElement("button");
    this.camBtn.type = "button";
    this.camBtn.className = "button small secondary";
    this.camBtn.textContent = "🎥 2D/Üst";
    this.camBtn.title = "Kuşbakışı / 3D kamera [R]";
    this.camBtn.addEventListener("click", () => this.toggleCameraAngle());

    this.leaveBtn = document.createElement("button");
    this.leaveBtn.type = "button";
    this.leaveBtn.className = "button small danger";
    this.leaveBtn.textContent = "Masadan Kalk";
    this.leaveBtn.addEventListener("click", () => this.cb.onLeave?.());

    topRight.append(this.helpBtn, this.flipBtn, this.camBtn, this.leaveBtn);
    topBar.append(this.playersEl, this.matchBadgeEl, topRight);

    // Stage: 3D canvas + HUD banner + fallback 2D surface
    const stageWrap = document.createElement("div");
    stageWrap.className = "tavla-stage-wrap";
    this.stageEl = document.createElement("div");
    this.stageEl.className = "tavla-stage";
    this.fallbackEl = document.createElement("div");
    this.fallbackEl.className = "tavla-fallback";
    this.fallbackEl.hidden = true;

    this.diceHudEl = document.createElement("div");
    this.diceHudEl.className = "tavla-dice-hud";

    this.statusEl = document.createElement("div");
    this.statusEl.className = "tavla-status-bar";

    stageWrap.append(this.stageEl, this.fallbackEl, this.diceHudEl);

    // Controls + Reactions tray
    this.controlsEl = document.createElement("div");
    this.controlsEl.className = "tavla-controls";

    const reactBar = document.createElement("div");
    reactBar.className = "tavla-react-bar";
    for (const emoji of REACTIONS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "emoji-btn tavla-react-btn";
      btn.textContent = emoji;
      btn.addEventListener("click", () => this.cb.onReact?.(emoji));
      reactBar.append(btn);
    }

    wrap.append(topBar, this.statusEl, stageWrap, this.controlsEl, reactBar);
    this.root.append(wrap);
  }

  mySeatIndex() {
    if (!this.table || !this.user) return -1;
    return this.table.seats.findIndex((s) => s && !s.isBot && s.userId === this.user.id);
  }

  myColor() {
    const idx = this.mySeatIndex();
    return idx === 0 ? "w" : idx === 1 ? "b" : "";
  }

  effectiveFlipped() {
    if (typeof this.boardFlipped === "boolean") return this.boardFlipped;
    return this.myColor() === "b";
  }

  async initScene() {
    const rect = this.stageEl.getBoundingClientRect();
    const w = Math.max(300, rect.width || 680);
    const h = Math.max(240, rect.height || 440);

    try {
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x0f1912);

      this.camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 90);

      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(w, h);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.12;
      this.stageEl.append(this.renderer.domElement);

      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.minDistance = 6.2;
      this.controls.maxDistance = 28;
      this.controls.maxPolarAngle = Math.PI * 0.44;
      this.controls.minPolarAngle = 0.04;
      this.applyCameraFraming(w, h);

      // Three-point studio lighting + rim warm light
      const hemi = new THREE.HemisphereLight(0xfff4df, 0x243624, 1.18);
      this.scene.add(hemi);

      const keyLight = new THREE.DirectionalLight(0xfff5e4, 1.5);
      keyLight.position.set(5.5, 13.5, 7.2);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 28;
      keyLight.shadow.camera.left = -7;
      keyLight.shadow.camera.right = 7;
      keyLight.shadow.camera.top = 5.5;
      keyLight.shadow.camera.bottom = -5.5;
      keyLight.shadow.bias = -0.0005;
      this.scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xaad5ff, 0.52);
      fillLight.position.set(-7, 8, -5);
      this.scene.add(fillLight);

      // Matte ambient velvet cloth table base under the wooden box
      const tableCloth = new THREE.Mesh(
        new THREE.PlaneGeometry(34, 26),
        new THREE.MeshStandardMaterial({ color: 0x16261c, roughness: 0.92, metalness: 0.02 }),
      );
      tableCloth.rotation.x = -Math.PI / 2;
      tableCloth.position.y = -0.004;
      tableCloth.receiveShadow = true;
      this.scene.add(tableCloth);

      // Inlaid play surface inside box
      this.boardTexture = createInlaidBoardTexture(this.effectiveFlipped());
      this.boardPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(10.12, 6.92),
        new THREE.MeshStandardMaterial({
          map: this.boardTexture,
          roughness: 0.36,
          metalness: 0.06,
        }),
      );
      this.boardPlane.rotation.x = -Math.PI / 2;
      this.boardPlane.position.set(0, FLOOR_Y, 0);
      this.boardPlane.receiveShadow = true;
      this.scene.add(this.boardPlane);

      this.scene.add(this.checkerGroup, this.highlightGroup, this.hitGroup, this.trayGroup);
      this.buildHitZones();

      // Load handcrafted Tavla box + checker lathed mesh and MIT dice.glb
      await Promise.all([this.loadTavlaModel(), this.loadDiceModels()]);

      this.bindCanvasEvents();
      this.setupResizeObserver();
      this.rebuildCheckers();
      this.rebuildHighlights();
      this.syncBearOffStacks();
      this.syncDiceOnBoard(false);
      this.startLoop();
    } catch {
      this.activate2DFallback();
    }
  }

  activate2DFallback() {
    this.viewMode = "2d";
    if (this.stageEl) this.stageEl.hidden = true;
    if (this.fallbackEl) {
      this.fallbackEl.hidden = false;
      this.render2DFallback();
    }
  }

  async loadTavlaModel() {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync("./assets/models/tavla.glb");
      const root = gltf.scene;
      root.traverse((obj) => {
        if (!obj.isMesh) return;
        if (obj.name === "tavla_checker") {
          this.templateCheckerGeo = obj.geometry.clone();
          obj.visible = false;
        } else if (obj.name === "tavla_frame") {
          obj.material = new THREE.MeshStandardMaterial({
            color: 0x452514,
            roughness: 0.36,
            metalness: 0.08,
          });
          obj.castShadow = true;
          obj.receiveShadow = true;
        } else if (obj.name === "tavla_brass") {
          obj.material = new THREE.MeshStandardMaterial({
            color: 0xd4a94d,
            roughness: 0.25,
            metalness: 0.85,
          });
          obj.castShadow = true;
        }
      });
      this.scene.add(root);
    } catch {
      // Procedural walnut fallback frame + cylinder checker
      const boxMat = new THREE.MeshStandardMaterial({ color: 0x452514, roughness: 0.38 });
      const floor = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W, 0.16, BOARD_D), boxMat);
      floor.position.y = 0.08;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.4, BOARD_D - 0.5), boxMat);
      bar.position.set(BAR_X, 0.22, 0);
      this.scene.add(floor, bar);
    }

    if (!this.templateCheckerGeo) {
      this.templateCheckerGeo = new THREE.CylinderGeometry(0.265, 0.272, 0.11, 32);
    }
  }

  async loadDiceModels() {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync("./assets/models/dice.glb");
      let template = null;
      gltf.scene.traverse((obj) => {
        if (obj.isMesh && !template) template = obj;
      });
      if (!template) return;

      for (let i = 0; i < 2; i++) {
        const die = template.clone();
        die.material = template.material.clone();
        die.scale.setScalar(0.245);
        die.castShadow = true;
        die.receiveShadow = true;
        die.visible = false;
        die.position.set(1.5 + i * 0.92, FLOOR_Y + 0.25, 0);
        this.scene.add(die);
        this.dieMeshPool.push({
          mesh: die,
          startPos: new THREE.Vector3(),
          endPos: new THREE.Vector3(),
          startQuat: new THREE.Quaternion(),
          endQuat: new THREE.Quaternion(),
          progress: 1,
        });
      }
    } catch {
      for (let i = 0; i < 2; i++) {
        const die = new THREE.Mesh(
          new THREE.BoxGeometry(0.46, 0.46, 0.46),
          new THREE.MeshStandardMaterial({ color: 0xf7f2e8, roughness: 0.28 }),
        );
        die.visible = false;
        die.castShadow = true;
        this.scene.add(die);
        this.dieMeshPool.push({
          mesh: die,
          startPos: new THREE.Vector3(),
          endPos: new THREE.Vector3(),
          startQuat: new THREE.Quaternion(),
          endQuat: new THREE.Quaternion(),
          progress: 1,
        });
      }
    }
  }

  buildHitZones() {
    this.hitGroup.clear();
    const triGeo = new THREE.PlaneGeometry(COL_W * 0.94, 3.22);
    for (let p = 1; p <= 24; p++) {
      const mesh = new THREE.Mesh(triGeo, this.materials.invisibleHit);
      mesh.rotation.x = -Math.PI / 2;
      mesh.userData.pointIndex = p;
      this.hitGroup.add(mesh);
    }

    const barHit = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.65, 6.2), this.materials.invisibleHit);
    barHit.position.set(BAR_X, 0.35, 0);
    barHit.userData.endpoint = "bar";
    this.hitGroup.add(barHit);

    const trayHit = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.5, 3.4), this.materials.invisibleHit);
    trayHit.position.set(TRAY_X, 0.28, 1.72);
    trayHit.userData.endpoint = "off";
    this.hitGroup.add(trayHit);

    this.repositionHitZones();
  }

  repositionHitZones() {
    const flipped = this.effectiveFlipped();
    for (const m of this.hitGroup.children) {
      if (Number.isInteger(m.userData.pointIndex)) {
        const { x, zSign } = pointLayoutCoords(m.userData.pointIndex, flipped);
        m.position.set(x, FLOOR_Y + 0.08, zSign * 1.84);
      }
    }
  }

  rebuildBoardTexture() {
    if (!this.boardPlane) return;
    const oldTex = this.boardTexture;
    this.boardTexture = createInlaidBoardTexture(this.effectiveFlipped());
    this.boardPlane.material.map = this.boardTexture;
    this.boardPlane.material.needsUpdate = true;
    oldTex?.dispose();
    this.repositionHitZones();
  }

  rebuildCheckers() {
    if (!this.scene || !this.templateCheckerGeo) return;
    this.checkerGroup.clear();
    const t = this.table;
    if (!t?.board) return;

    const flipped = this.effectiveFlipped();
    const myCol = this.myColor() || "w";

    // Points 1..24
    for (let p = 1; p <= 24; p++) {
      const v = t.board.points[p] || 0;
      if (v === 0) continue;
      const color = v > 0 ? "w" : "b";
      const count = Math.abs(v);
      const { x, zSign } = pointLayoutCoords(p, flipped);
      const mat = color === "w" ? this.materials.whiteChecker : this.materials.blackChecker;

      for (let i = 0; i < count; i++) {
        const row = i % 5;
        const layer = Math.floor(i / 5);
        const stepZ = count > 5 ? 0.51 : 0.55;
        const z = zSign * (3.14 - row * stepZ);
        const y = FLOOR_Y + layer * 0.112;
        const mesh = new THREE.Mesh(this.templateCheckerGeo, mat);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.endpoint = p;
        this.checkerGroup.add(mesh);
      }
    }

    // Center Bar ("Kırık Taş")
    for (const c of ["w", "b"]) {
      const cnt = t.board.bar?.[c] || 0;
      if (!cnt) continue;
      const mat = c === "w" ? this.materials.whiteChecker : this.materials.blackChecker;
      const zSide = c === myCol ? 1 : -1;
      for (let i = 0; i < cnt; i++) {
        const mesh = new THREE.Mesh(this.templateCheckerGeo, mat);
        mesh.position.set(BAR_X, 0.42 + i * 0.112, zSide * (0.65 + (i % 2) * 0.62));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.endpoint = "bar";
        this.checkerGroup.add(mesh);
      }
    }
  }

  syncBearOffStacks() {
    if (!this.scene || !this.templateCheckerGeo) return;
    this.trayGroup.clear();
    const t = this.table;
    if (!t?.board) return;
    const myCol = this.myColor() || "w";

    for (const c of ["w", "b"]) {
      const count = t.board.borneOff?.[c] || 0;
      if (!count) continue;
      const mat = c === "w" ? this.materials.whiteChecker : this.materials.blackChecker;
      const baseZ = c === myCol ? 3.22 : -3.22;
      const dir = c === myCol ? -1 : 1;
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(this.templateCheckerGeo, mat);
        // Stand edge-on inside the emerald bear-off slot cleanly
        mesh.rotation.x = Math.PI / 2;
        mesh.scale.set(0.95, 1.35, 0.95);
        mesh.position.set(TRAY_X, FLOOR_Y + 0.26, baseZ + dir * (0.1 + i * 0.18));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.endpoint = "off";
        this.trayGroup.add(mesh);
      }
    }
  }

  rebuildHighlights() {
    if (!this.scene) return;
    this.highlightGroup.clear();
    const t = this.table;
    const myCol = this.myColor();
    if (!t || this.spectator || t.status !== "playing" || t.turn !== myCol || t.turnPhase !== "move") {
      return;
    }

    const flipped = this.effectiveFlipped();
    const legalMap = t.legalMoves || {};

    // Selected checker glow OR movable sources glow
    if (this.selectedFrom !== null) {
      const srcKey = String(this.selectedFrom);
      const ringGeo = new THREE.RingGeometry(0.24, 0.33, 32);
      if (this.selectedFrom === "bar") {
        const ring = new THREE.Mesh(ringGeo, this.materials.goldRing);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(BAR_X, 0.56, 0.85);
        this.highlightGroup.add(ring);
      } else {
        const { x, zSign } = pointLayoutCoords(Number(this.selectedFrom), flipped);
        const count = Math.abs(t.board.points[Number(this.selectedFrom)] || 1);
        const topRow = (count - 1) % 5;
        const z = zSign * (3.14 - topRow * (count > 5 ? 0.51 : 0.55));
        const ring = new THREE.Mesh(ringGeo, this.materials.goldRing);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, FLOOR_Y + 0.14 + Math.floor((count - 1) / 5) * 0.112, z);
        this.highlightGroup.add(ring);
      }

      const targets = legalMap[srcKey] || [];
      const destGeo = new THREE.RingGeometry(0.22, 0.32, 32);
      for (const dest of targets) {
        if (dest.to === "off") {
          const pad = new THREE.Mesh(
            new THREE.PlaneGeometry(0.68, 3.2),
            new THREE.MeshBasicMaterial({
              color: 0xb7ec5d,
              transparent: true,
              opacity: 0.36,
              side: THREE.DoubleSide,
            }),
          );
          pad.rotation.x = -Math.PI / 2;
          pad.position.set(TRAY_X, FLOOR_Y + 0.03, 1.72);
          pad.userData.endpoint = "off";
          this.highlightGroup.add(pad);
        } else {
          const { x, zSign } = pointLayoutCoords(dest.to, flipped);
          const ring = new THREE.Mesh(destGeo, dest.hit ? this.materials.hitRing : this.materials.targetRing);
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(x, FLOOR_Y + 0.025, zSign * 2.15);
          ring.userData.endpoint = dest.to;
          this.highlightGroup.add(ring);
        }
      }
    } else {
      // Softly outline all playable source checkers
      const srcGeo = new THREE.RingGeometry(0.26, 0.31, 28);
      const srcMat = new THREE.MeshBasicMaterial({
        color: 0xb7ec5d,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      });
      for (const key of Object.keys(legalMap)) {
        if (key === "bar") {
          const ring = new THREE.Mesh(srcGeo, srcMat);
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(BAR_X, 0.56, 0.85);
          this.highlightGroup.add(ring);
        } else {
          const p = Number(key);
          const { x, zSign } = pointLayoutCoords(p, flipped);
          const count = Math.abs(t.board.points[p] || 1);
          const topRow = (count - 1) % 5;
          const z = zSign * (3.14 - topRow * (count > 5 ? 0.51 : 0.55));
          const ring = new THREE.Mesh(srcGeo, srcMat);
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(x, FLOOR_Y + 0.14 + Math.floor((count - 1) / 5) * 0.112, z);
          this.highlightGroup.add(ring);
        }
      }
    }
  }

  syncDiceOnBoard(animate = false) {
    if (!this.dieMeshPool.length) return;
    const t = this.table;
    if (!t || !Array.isArray(t.dice) || t.dice.length < 2 || t.status === "waiting") {
      for (const d of this.dieMeshPool) d.mesh.visible = false;
      return;
    }

    const onRight = t.turn === "w" ? 1 : -1;
    const baseX = onRight > 0 ? 1.55 : -3.25;
    const offsets = [
      [baseX, FLOOR_Y + 0.25, 0.16],
      [baseX + 0.92, FLOOR_Y + 0.25, -0.22],
    ];

    const rem = [...(t.remainingDice || [])];
    for (let i = 0; i < 2; i++) {
      const slot = this.dieMeshPool[i];
      const val = t.dice[i];
      slot.mesh.visible = true;

      // Dim consumed dice cleanly when playing moves
      let activeForThisDie = t.turnPhase === "move";
      if (activeForThisDie) {
        const idx = rem.indexOf(val);
        if (idx !== -1) rem.splice(idx, 1);
        else activeForThisDie = false;
      }
      if (slot.mesh.material) {
        slot.mesh.material.opacity = t.turnPhase === "move" && !activeForThisDie ? 0.38 : 1;
        slot.mesh.material.transparent = true;
      }

      const targetQuat = faceTargetQuaternion(val, (i === 0 ? 0.18 : -0.24) + (animate ? 0.08 : 0));
      const [tx, ty, tz] = offsets[i];
      if (animate) {
        slot.startPos.set(tx - onRight * 1.4, FLOOR_Y + 1.45, tz - 0.5);
        slot.endPos.set(tx, ty, tz);
        slot.startQuat.setFromEuler(
          new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        );
        slot.endQuat.copy(targetQuat);
        slot.progress = 0;
        slot.mesh.position.copy(slot.startPos);
      } else {
        slot.progress = 1;
        slot.mesh.position.set(tx, ty, tz);
        slot.mesh.quaternion.copy(targetQuat);
      }
    }
  }

  bindCanvasEvents() {
    const dom = this.renderer.domElement;
    dom.addEventListener("pointerdown", (e) => {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener("pointerup", (e) => {
      if (!this.pointerDownPos) return;
      const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
      this.pointerDownPos = null;
      if (dist > 10) return; // dragged OrbitControls camera
      this.handleCanvasTap(e.clientX, e.clientY);
    });
    this._onKeyDown = (e) => {
      if (this.disposed || this.root.hidden || !this.table) return;
      const active = document.activeElement;
      if (
        active &&
        (["INPUT", "TEXTAREA", "SELECT", "EMOJI-PICKER"].includes(active.tagName) ||
          active.isContentEditable)
      ) {
        return;
      }
      if (e.code === "Space" && this.table.status === "playing" && this.table.turn === this.myColor() && this.table.turnPhase === "roll") {
        e.preventDefault();
        this.cb.onRoll?.();
      } else if ((e.key === "z" || e.key === "Z") && this.table.canUndo && this.table.turn === this.myColor()) {
        e.preventDefault();
        this.cb.onAction?.("undoTurn");
      } else if (e.key === "f" || e.key === "F") {
        this.flipBtn?.click();
      } else if (e.key === "r" || e.key === "R") {
        this.toggleCameraAngle();
      }
    };
    window.addEventListener("keydown", this._onKeyDown);
  }

  handleCanvasTap(clientX, clientY) {
    const t = this.table;
    const myCol = this.myColor();
    if (!t || this.spectator || t.status !== "playing" || t.turn !== myCol || t.turnPhase !== "move") {
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const targets = [
      ...this.highlightGroup.children,
      ...this.checkerGroup.children,
      ...this.trayGroup.children,
      ...this.hitGroup.children,
    ];
    const hits = this.raycaster.intersectObjects(targets, false);
    if (!hits.length) {
      if (this.selectedFrom !== null) {
        this.selectedFrom = null;
        this.rebuildHighlights();
      }
      return;
    }

    for (const h of hits) {
      const ep =
        h.object.userData.endpoint !== undefined
          ? h.object.userData.endpoint
          : h.object.userData.pointIndex;
      if (ep === undefined) continue;
      this.handleEndpointClick(ep);
      return;
    }
  }

  handleEndpointClick(endpoint) {
    const t = this.table;
    const myCol = this.myColor();
    if (!t || this.spectator || t.status !== "playing" || t.turn !== myCol || t.turnPhase !== "move") {
      return;
    }
    const legalMap = t.legalMoves || {};

    // Case 1: Destination clicked when source is selected
    if (this.selectedFrom !== null) {
      const opts = legalMap[String(this.selectedFrom)] || [];
      const match = opts.find((o) => String(o.to) === String(endpoint));
      if (match) {
        const from = this.selectedFrom;
        this.selectedFrom = null;
        this.rebuildHighlights();
        this.cb.onMove?.({ from, to: match.to, die: match.die });
        return;
      }
      if (String(endpoint) === String(this.selectedFrom)) {
        // Clicking already-selected checker toggles off OR auto-moves if single legal destination exists
        if (opts.length === 1) {
          const from = this.selectedFrom;
          this.selectedFrom = null;
          this.rebuildHighlights();
          this.cb.onMove?.({ from, to: opts[0].to, die: opts[0].die });
          return;
        }
        this.selectedFrom = null;
        this.rebuildHighlights();
        if (this.viewMode === "2d") this.render2DFallback();
        return;
      }
    }

    // Case 2: Source point or "bar" clicked
    if (legalMap[String(endpoint)]?.length) {
      this.selectedFrom = endpoint === "bar" ? "bar" : Number(endpoint);
      this.rebuildHighlights();
      if (this.viewMode === "2d") this.render2DFallback();
      return;
    }

    this.selectedFrom = null;
    this.rebuildHighlights();
    if (this.viewMode === "2d") this.render2DFallback();
  }

  applyCameraFraming(w, h) {
    if (!this.camera || !this.controls) return;
    const safeW = Math.max(260, w || this.stageEl?.clientWidth || 680);
    const safeH = Math.max(180, h || this.stageEl?.clientHeight || 440);
    const aspect = safeW / safeH;
    const halfFovRad = (this.camera.fov * Math.PI) / 360;
    const tanV = Math.tan(halfFovRad);
    const tanH = tanV * aspect;

    // Fit entire 10.8 x 7.6 walnut box cleanly on Desktop, Mobile Portrait & Mobile Landscape
    const needW = 6.0 / Math.max(0.24, tanH);
    const needD = (safeH < 280 ? 6.15 : 4.45) / Math.max(0.24, tanV);
    const dist = Math.max(12.2, needW, needD);

    if (this.cameraTopView) {
      this.camera.position.set(0, dist * 1.02, 0.45);
      this.controls.target.set(0, 0.16, 0);
    } else {
      this.camera.position.set(0, dist * 0.89, dist * 0.46);
      this.controls.target.set(0, 0.16, 0.08);
    }
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  toggleCameraAngle() {
    if (!this.camera || !this.controls) return;
    this.cameraTopView = !this.cameraTopView;
    this.applyCameraFraming(this.stageEl?.clientWidth, this.stageEl?.clientHeight);
  }

  setupResizeObserver() {
    const syncSize = () => {
      if (this.disposed || !this.renderer || !this.camera) return;
      const w = Math.max(260, this.stageEl.clientWidth);
      const h = Math.max(180, this.stageEl.clientHeight);
      this.applyCameraFraming(w, h);
      this.renderer.setSize(w, h);
    };
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(syncSize);
      this.ro.observe(this.stageEl);
    }
  }

  startLoop() {
    let lastTs = performance.now();
    const tick = (now) => {
      if (this.disposed) return;
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      for (const slot of this.dieMeshPool) {
        if (slot.progress < 1) {
          slot.progress = Math.min(1, slot.progress + dt * 2.8);
          const e = 1 - Math.pow(1 - slot.progress, 3);
          slot.mesh.position.lerpVectors(slot.startPos, slot.endPos, e);
          slot.mesh.position.y += Math.sin(slot.progress * Math.PI) * 0.72;
          slot.mesh.quaternion.slerpQuaternions(slot.startQuat, slot.endQuat, e);
        }
      }

      this.controls?.update();
      this.renderer?.render(this.scene, this.camera);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  update(table, user, { spectator = false } = {}) {
    const prev = this.prevState;
    const prevFlip = this.boardFlipped === null && prev ? this.myColor() === "b" : null;
    this.table = table;
    this.user = user;
    this.spectator = Boolean(spectator);
    const nextFlip = this.effectiveFlipped();

    if (prevFlip !== null && prevFlip !== nextFlip && this.boardFlipped === null) {
      this.rebuildBoardTexture();
    } else {
      this.repositionHitZones();
    }

    // Play audio cues on state changes
    let shouldAnimateDice = false;
    if (prev && table) {
      const diceChanged =
        JSON.stringify(prev.dice) !== JSON.stringify(table.dice) &&
        table.status === "playing";
      const phaseRolled = prev.turnPhase === "roll" && table.turnPhase === "move";
      if (diceChanged || phaseRolled) {
        shouldAnimateDice = true;
        playTavlaRoll();
      }
      if (table.lastMove && (!prev.lastMove || table.lastMove.at !== prev.lastMove.at)) {
        if (table.lastMove.hit) playTavlaHit();
        else if (table.lastMove.to === "off") playTavlaBearOff();
        else playTavlaMove();
      }
      if (
        (prev.status === "playing" && table.status === "finished") ||
        (prev.status === "playing" && table.status === "hand_finished")
      ) {
        if (table.winnerColor === this.myColor()) playWin();
        else playChip();
      }
    }

    if (
      this.selectedFrom !== null &&
      !(table?.legalMoves && table.legalMoves[String(this.selectedFrom)]?.length)
    ) {
      this.selectedFrom = null;
    }

    this.prevState = table;
    this.renderHud();
    if (this.viewMode === "3d") {
      this.rebuildCheckers();
      this.syncBearOffStacks();
      this.rebuildHighlights();
      this.syncDiceOnBoard(shouldAnimateDice);
    } else {
      this.render2DFallback();
    }
  }

  renderHud() {
    const t = this.table;
    if (!t) return;
    const myCol = this.myColor();

    // Players strip
    this.playersEl.replaceChildren();
    for (let i = 0; i < 2; i++) {
      const seat = t.seats[i];
      const color = i === 0 ? "w" : "b";
      const pill = document.createElement("div");
      const isTurn = t.status === "playing" && t.turn === color;
      pill.className = `tavla-seat-pill ${color}${isTurn ? " active-turn" : ""}${seat?.disconnected ? " disconnected" : ""}`;
      if (!seat) {
        pill.innerHTML = `<span class="disc ${color}"></span><span>Boş Koltuk (${colorLabel(color)})</span>`;
      } else {
        const pipVal = t.pips?.[color] ?? 167;
        const reactTxt =
          seat.reaction && Date.now() - seat.reaction.at < 4500 ? ` ${seat.reaction.emoji}` : "";
        const discTxt = seat.disconnected ? " · Bağlantı bekleniyor…" : "";
        const meBadge = color === myCol ? " (Sen)" : "";
        pill.innerHTML = `<span class="disc ${color}"></span><strong>${seat.name}${meBadge}${reactTxt}</strong><span class="tavla-score">${seat.score || 0}/${t.targetScore}</span><span class="tavla-pip">${pipVal} pip · T:${t.board?.borneOff?.[color] || 0}${discTxt}</span>`;
      }
      this.playersEl.append(pill);
    }

    this.matchBadgeEl.textContent =
      t.spectatorCount > 0
        ? `${t.name} · Maç ${t.round} · ${t.handNumber}. El · 👁 ${t.spectatorCount}`
        : `${t.name} · Maç ${t.round} · ${t.handNumber}. El (${t.targetScore} El)`;

    // Status message
    this.statusEl.textContent = t.lastAction?.text || "";

    // Floating Dice HUD
    this.diceHudEl.replaceChildren();
    if (Array.isArray(t.dice) && t.dice.length === 2 && t.status !== "waiting") {
      const label = document.createElement("span");
      label.className = "tavla-dice-side";
      label.textContent = `${colorLabel(t.turn)} zarı:`;
      this.diceHudEl.append(label);
      const rem = [...(t.remainingDice || [])];
      for (const d of t.dice) {
        let used = false;
        if (t.turnPhase === "move") {
          const idx = rem.indexOf(d);
          if (idx !== -1) rem.splice(idx, 1);
          else used = true;
        }
        this.diceHudEl.append(createDiePipBadge(d, used));
      }
      if (t.dice[0] === t.dice[1]) {
        const dblTag = document.createElement("span");
        dblTag.className = "tavla-double-tag";
        dblTag.textContent = `Çift ×4 (${t.remainingDice.length} kaldı)`;
        this.diceHudEl.append(dblTag);
      }
    }

    // Controls tray
    this.controlsEl.replaceChildren();

    if (this.spectator) {
      const note = document.createElement("span");
      note.className = "muted small-text";
      note.textContent = "👁 İzleyici modundasın — canlı hamleleri ve 3D zarları takip ediyorsun.";
      this.controlsEl.append(note);
      return;
    }

    if (t.status === "waiting") {
      const row = document.createElement("div");
      row.className = "game-buttons";

      // Target match score pills (1, 3, 5)
      const scGroup = document.createElement("div");
      scGroup.className = "tavla-target-pills";
      const lbl = document.createElement("span");
      lbl.className = "muted small-text";
      lbl.textContent = "Hedef:";
      scGroup.append(lbl);
      for (const pts of TARGET_SCORES) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `button small ${t.targetScore === pts ? "primary" : "secondary"}`;
        b.textContent = `${pts} El`;
        b.addEventListener("click", () => this.cb.onConfig?.({ targetScore: pts }));
        scGroup.append(b);
      }
      row.append(scGroup);

      if (!t.hasBot) {
        const botBtn = document.createElement("button");
        botBtn.type = "button";
        botBtn.className = "button small primary";
        botBtn.textContent = "🤖 Bot ile Başla";
        botBtn.addEventListener("click", () => this.cb.onConfig?.({ withBot: true }));
        row.append(botBtn);
      }
      this.controlsEl.append(row);
      return;
    }

    if (t.status === "playing") {
      const row = document.createElement("div");
      row.className = "game-buttons";
      const isMyTurn = t.turn === myCol;

      if (isMyTurn && t.turnPhase === "roll") {
        const rollBtn = document.createElement("button");
        rollBtn.type = "button";
        rollBtn.className = "button primary tavla-roll-btn";
        rollBtn.textContent = "🎲 Zar At [Boşluk]";
        rollBtn.addEventListener("click", () => this.cb.onRoll?.());
        row.append(rollBtn);
      } else if (isMyTurn && t.turnPhase === "move") {
        const moveHint = document.createElement("span");
        moveHint.className = "tavla-turn-hint";
        moveHint.textContent =
          t.board?.bar?.[myCol] > 0
            ? "⚠ Kırık taşın var: önce rakibin evine gir!"
            : this.selectedFrom !== null
              ? "✨ Parlayan hedef haneye (veya toplamaya) dokun"
              : "🟢 Taş seç — tekrar dokunursan tek seçeneğe yürür";
        row.append(moveHint);

        if (t.canUndo) {
          const undoBtn = document.createElement("button");
          undoBtn.type = "button";
          undoBtn.className = "button small secondary";
          undoBtn.textContent = "↶ Hamleyi Geri Al";
          undoBtn.addEventListener("click", () => this.cb.onAction?.("undoTurn"));
          row.append(undoBtn);
        }
      } else {
        const waitEl = document.createElement("span");
        waitEl.className = "muted small-text";
        waitEl.textContent = t.hasBot
          ? "🤖 Tavla Botu düşünüyor…"
          : `⏳ Sıra ${colorLabel(t.turn)} oyuncuda…`;
        row.append(waitEl);
      }

      const resignBtn = document.createElement("button");
      resignBtn.type = "button";
      resignBtn.className = "button small danger";
      resignBtn.textContent = "🏳 Terk Et";
      resignBtn.addEventListener("click", () => {
        if (confirm("Tavla maçını terk etmek istediğine emin misin?")) {
          this.cb.onAction?.("resign");
        }
      });
      row.append(resignBtn);
      this.controlsEl.append(row);
      return;
    }

    if (t.status === "hand_finished") {
      const banner = document.createElement("div");
      banner.className = "chess-result-banner tavla-hand-banner";
      banner.textContent = `🎲 ${t.handNumber}. El bitti: ${t.lastHandResult?.winnerName} · ${t.lastHandResult?.label} (${t.seats[0]?.score || 0}-${t.seats[1]?.score || 0})`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "button primary";
      btn.textContent = "▶ Sonraki Eli Başlat";
      btn.addEventListener("click", () => this.cb.onAction?.("nextHand"));
      this.controlsEl.append(banner, btn);
      return;
    }

    if (t.status === "finished") {
      const banner = document.createElement("div");
      banner.className = "chess-result-banner";
      banner.textContent = `🏆 Kazanan: ${t.winnerName} (${t.resultReason})`;

      const area = document.createElement("div");
      area.className = "game-buttons";

      if (!t.hasBot && t.rematchOfferBy && t.rematchOfferBy !== myCol && t.seats[0] && t.seats[1]) {
        const offerBox = document.createElement("div");
        offerBox.className = "chess-draw-banner";
        offerBox.innerHTML = "<span>🎲 Rakibin aynı masada rövanş istiyor! (Renkler değişir)</span>";
        const acc = document.createElement("button");
        acc.type = "button";
        acc.className = "button small primary";
        acc.textContent = "Kabul Et & Başla";
        acc.addEventListener("click", () => this.cb.onAction?.("acceptRematch"));
        const dec = document.createElement("button");
        dec.type = "button";
        dec.className = "button small secondary";
        dec.textContent = "Reddet";
        dec.addEventListener("click", () => this.cb.onAction?.("declineRematch"));
        offerBox.append(acc, dec);
        this.controlsEl.append(banner, offerBox);
        return;
      }

      if (t.seats[0] && t.seats[1]) {
        const remBtn = document.createElement("button");
        remBtn.type = "button";
        remBtn.className = "button primary";
        if (!t.hasBot && t.rematchOfferBy === myCol) {
          remBtn.disabled = true;
          remBtn.textContent = "🎲 Rövanş Teklifi Gönderildi…";
        } else {
          remBtn.textContent = t.hasBot
            ? "↻ Tekrar Oyna (Beyaz ↔ Siyah)"
            : "↻ Aynı Masada Rövanş Teklif Et";
        }
        remBtn.addEventListener("click", () => this.cb.onAction?.("rematch"));
        area.append(remBtn);
      }

      this.controlsEl.append(banner, area);
    }
  }

  render2DFallback() {
    const t = this.table;
    if (!t?.board || !this.fallbackEl) return;
    this.fallbackEl.replaceChildren();
    const flipped = this.effectiveFlipped();
    const legalMap = t.legalMoves || {};
    const destSet = new Set(
      this.selectedFrom !== null
        ? (legalMap[String(this.selectedFrom)] || []).map((m) => String(m.to))
        : [],
    );

    const grid = document.createElement("div");
    grid.className = "tavla-2d-grid";
    const renderHalfRow = (pts, top) => {
      const row = document.createElement("div");
      row.className = `tavla-2d-row ${top ? "top" : "bottom"}`;
      for (const p of pts) {
        const realPoint = flipped ? 25 - p : p;
        const v = t.board.points[realPoint] || 0;
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "tavla-2d-pt";
        if (String(this.selectedFrom) === String(realPoint)) cell.classList.add("selected");
        if (destSet.has(String(realPoint))) cell.classList.add("target");
        if (legalMap[String(realPoint)]?.length) cell.classList.add("movable");

        const num = document.createElement("span");
        num.className = "pt-num";
        num.textContent = String(realPoint);
        const stack = document.createElement("div");
        stack.className = "pt-stack";
        const count = Math.abs(v);
        const cName = v > 0 ? "w" : "b";
        for (let i = 0; i < Math.min(count, 5); i++) {
          const disc = document.createElement("span");
          disc.className = `disc ${cName}`;
          if (i === 4 && count > 5) disc.textContent = String(count);
          stack.append(disc);
        }
        cell.append(num, stack);
        cell.addEventListener("click", () => this.handleEndpointClick(realPoint));
        row.append(cell);
      }
      return row;
    };

    const topPts = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
    const botPts = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    grid.append(renderHalfRow(topPts, true), renderHalfRow(botPts, false));

    const sideActions = document.createElement("div");
    sideActions.className = "tavla-2d-side";
    const barBtn = document.createElement("button");
    barBtn.type = "button";
    barBtn.className = `button small ${this.selectedFrom === "bar" ? "primary" : "secondary"}`;
    barBtn.textContent = `Kırık: B${t.board.bar.w} · S${t.board.bar.b}`;
    barBtn.addEventListener("click", () => this.handleEndpointClick("bar"));

    const offBtn = document.createElement("button");
    offBtn.type = "button";
    offBtn.className = `button small ${destSet.has("off") ? "primary" : "secondary"}`;
    offBtn.textContent = `Topla (${t.board.borneOff.w} / ${t.board.borneOff.b})`;
    offBtn.addEventListener("click", () => this.handleEndpointClick("off"));
    sideActions.append(barBtn, offBtn);

    this.fallbackEl.append(grid, sideActions);
  }

  dispose() {
    this.disposed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this._onKeyDown) window.removeEventListener("keydown", this._onKeyDown);
    this.ro?.disconnect();
    this.controls?.dispose();
    this.boardTexture?.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement?.remove();
    }
    this.root.replaceChildren();
  }
}
