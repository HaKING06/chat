import * as THREE from "../vendor/three/three.module.js";
import { GLTFLoader } from "../vendor/three/GLTFLoader.js";
import { OrbitControls } from "../vendor/three/OrbitControls.js";
import {
  playBlackjack,
  playChip,
  playDiceLock,
  playDiceRoll,
  playFarkle,
  playTick,
} from "./sfx.mjs";

const MAX_SEATS = 6;
const TARGET_PRESETS = [3000, 5000, 10000];
const REACTIONS = ["🔥", "👏", "😎", "😱", "🍀", "🎲"];
const SEAT_COLORS = ["#c5f273", "#60b8ff", "#ffb347", "#ff7b89", "#b794ff", "#49e3c1"];

const TRAY_Y = 0.08;
const DIE_SIZE = 0.34;
const DIE_REST_Y = TRAY_Y + DIE_SIZE * 0.5 + 0.012;

// Verified outward orientation for @3d-dice/theme-smooth-pip GLB (+Y=6, -Y=1, +X=4, -X=3, +Z=2, -Z=5)
const FACE_EULERS = {
  1: new THREE.Euler(Math.PI, 0, 0),
  2: new THREE.Euler(-Math.PI / 2, 0, 0),
  3: new THREE.Euler(0, 0, -Math.PI / 2),
  4: new THREE.Euler(0, 0, Math.PI / 2),
  5: new THREE.Euler(Math.PI / 2, 0, 0),
  6: new THREE.Euler(0, 0, 0),
};

function faceTargetQuaternion(value, yaw = 0) {
  const faceQ = new THREE.Quaternion().setFromEuler(
    FACE_EULERS[value] || FACE_EULERS[6],
  );
  const yawQ = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    yaw,
  );
  return yawQ.multiply(faceQ);
}

// Mirror exact server scoring so user gets instantaneous live combo preview
export function previewDiceSelection(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return { points: 0, leftoverCount: 0, labels: [] };
  }
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const v of values) if (v >= 1 && v <= 6) counts[v]++;
  const total = counts.slice(1).reduce((s, n) => s + n, 0);
  if (total === 6) {
    if ([1, 2, 3, 4, 5, 6].every((v) => counts[v] === 1)) {
      return { points: 1500, leftoverCount: 0, labels: ["1-6 Sıralı"] };
    }
    const pairs = counts.slice(1).filter((n) => n === 2).length;
    const quads = counts.slice(1).filter((n) => n === 4).length;
    if (pairs === 3 || (quads === 1 && pairs === 1)) {
      return { points: 1500, leftoverCount: 0, labels: ["Üç Çift"] };
    }
    if (counts.slice(1).filter((n) => n === 3).length === 2) {
      return { points: 2500, leftoverCount: 0, labels: ["İki Üçlü"] };
    }
  }
  let points = 0;
  let used = 0;
  const labels = [];
  for (let face = 1; face <= 6; face++) {
    const n = counts[face];
    if (!n) continue;
    const base = face === 1 ? 1000 : face * 100;
    if (n >= 3) {
      const pts = base * (n - 2);
      points += pts;
      used += n;
      labels.push(`${n}×${face} (+${pts})`);
    } else if (face === 1) {
      points += n * 100;
      used += n;
      labels.push(`${n}×1 (+${n * 100})`);
    } else if (face === 5) {
      points += n * 50;
      used += n;
      labels.push(`${n}×5 (+${n * 50})`);
    }
  }
  return { points, leftoverCount: total - used, labels };
}

function makePipFallbackTexture(num) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#f5efe2";
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "#d9ceb4";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 122, 122);
  const pos = {
    1: [[64, 64]],
    2: [[34, 34], [94, 94]],
    3: [[34, 34], [64, 64], [94, 94]],
    4: [[34, 34], [94, 34], [34, 94], [94, 94]],
    5: [[34, 34], [94, 34], [64, 64], [34, 94], [94, 94]],
    6: [[34, 30], [94, 30], [34, 64], [94, 64], [34, 98], [94, 98]],
  };
  ctx.fillStyle = num === 1 ? "#bf2230" : "#151a17";
  for (const [x, y] of pos[num] || []) {
    ctx.beginPath();
    ctx.arc(x, y, num === 1 ? 14 : 11, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeProceduralDieMesh() {
  // Exact face match to BoxGeometry face order: +X(4), -X(3), +Y(6), -Y(1), +Z(2), -Z(5)
  const faceNums = [4, 3, 6, 1, 2, 5];
  const mats = faceNums.map(
    (n) =>
      new THREE.MeshStandardMaterial({
        map: makePipFallbackTexture(n),
        roughness: 0.28,
        metalness: 0.05,
      }),
  );
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE), mats);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

let cachedDieTemplate = null;
let dieLoadPromise = null;

function loadDieTemplate() {
  if (cachedDieTemplate) return Promise.resolve(cachedDieTemplate.clone(true));
  if (!dieLoadPromise) {
    const loader = new GLTFLoader();
    dieLoadPromise = new Promise((resolve) => {
      loader.load(
        "./assets/models/dice.glb",
        (gltf) => {
          const model = gltf.scene || gltf.scenes?.[0];
          if (!model) {
            resolve(null);
            return;
          }
          model.scale.setScalar(DIE_SIZE);
          model.traverse((obj) => {
            if (obj.isMesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
              if (obj.material) obj.material = obj.material.clone();
            }
          });
          cachedDieTemplate = model;
          resolve(model);
        },
        undefined,
        () => resolve(null),
      );
    });
  }
  return dieLoadPromise.then((tpl) =>
    tpl ? tpl.clone(true) : makeProceduralDieMesh(),
  );
}

function seatSlotPosition(idx) {
  const angle = -Math.PI * 0.72 + (idx / 5) * (Math.PI * 1.44);
  const r = 1.85;
  return [Math.sin(angle) * r, 0.25, Math.cos(angle) * r];
}

export class DiceArena {
  constructor(root, callbacks) {
    this.root = root;
    this.cb = callbacks;
    this.table = null;
    this.myId = null;
    this.selected = new Set();
    this.lastRollSeq = -1;
    this.lastStatus = "";
    this.lastTurnPhase = "";
    this.lastWinner = "";
    this.disposed = false;
    this.webglReady = false;
    this.camMode = 0;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pointerDownPos = null;
    this.diceActors = [];
    this.ringMeshes = [];
    this.countdownTimer = null;
    this.rafId = null;
    this.animClock = new THREE.Clock();

    this._buildDom();
    this._init3D();
    this._startCountdownLoop();
  }

  _buildDom() {
    this.root.replaceChildren();
    this.shell = document.createElement("div");
    this.shell.className = "bj-shell dice-shell";

    // Top bar
    const top = document.createElement("div");
    top.className = "bj-topbar";

    const titleWrap = document.createElement("div");
    titleWrap.className = "bj-title-wrap";
    this.tableTitle = document.createElement("strong");
    this.tableTitle.textContent = "Zar Arenası";
    this.phaseBadge = document.createElement("span");
    this.phaseBadge.className = "tag bj-phase-tag";
    this.antiGhostBadge = document.createElement("span");
    this.antiGhostBadge.className = "tag dice-antighost-tag";
    this.antiGhostBadge.textContent = "🛡 Anti-Ghost · Açık Bilgi";
    titleWrap.append(this.tableTitle, this.phaseBadge, this.antiGhostBadge);

    const rightControls = document.createElement("div");
    rightControls.className = "bj-top-right";

    this.potPill = document.createElement("div");
    this.potPill.className = "bj-chips-pill";
    this.potPill.textContent = "Pot: 0 puan";

    this.camBtn = document.createElement("button");
    this.camBtn.type = "button";
    this.camBtn.className = "button small secondary";
    this.camBtn.textContent = "📷 Kamera";
    this.camBtn.addEventListener("click", () => this.cycleCamera());

    this.leaveBtn = document.createElement("button");
    this.leaveBtn.type = "button";
    this.leaveBtn.className = "button small secondary";
    this.leaveBtn.textContent = "Masadan kalk";
    this.leaveBtn.addEventListener("click", () => this.cb.onLeave?.());

    rightControls.append(this.potPill, this.camBtn, this.leaveBtn);
    top.append(titleWrap, rightControls);

    // 3D viewport + overlays
    this.stage = document.createElement("div");
    this.stage.className = "bj-stage dice-stage";

    this.canvasWrap = document.createElement("div");
    this.canvasWrap.className = "bj-canvas-wrap";

    this.fallback2d = document.createElement("div");
    this.fallback2d.className = "dice-2d-board";
    this.fallback2d.hidden = true;

    this.actionBanner = document.createElement("div");
    this.actionBanner.className = "bj-action-banner";
    this.actionBanner.setAttribute("aria-live", "polite");

    this.timerPill = document.createElement("div");
    this.timerPill.className = "bj-timer-pill";
    this.timerPill.hidden = true;

    this.seatsHud = document.createElement("div");
    this.seatsHud.className = "dice-seats-hud";

    this.stage.append(
      this.canvasWrap,
      this.fallback2d,
      this.actionBanner,
      this.timerPill,
      this.seatsHud,
    );

    // Dock controls (responsive desktop + mobile)
    this.dock = document.createElement("div");
    this.dock.className = "bj-dock dice-dock";

    this.trayHint = document.createElement("div");
    this.trayHint.className = "dice-tray-bar";

    this.controlsRow = document.createElement("div");
    this.controlsRow.className = "dice-controls-row";

    this.reactRow = document.createElement("div");
    this.reactRow.className = "bj-react-row";
    for (const emoji of REACTIONS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bj-react-btn";
      btn.textContent = emoji;
      btn.setAttribute("aria-label", `${emoji} tepkisi gönder`);
      btn.addEventListener("click", () => this.cb.onReact?.(emoji));
      this.reactRow.append(btn);
    }

    this.dock.append(this.trayHint, this.controlsRow, this.reactRow);
    this.shell.append(top, this.stage, this.dock);
    this.root.append(this.shell);
  }

  _init3D() {
    try {
      const w = Math.max(300, this.stage.clientWidth || 720);
      const h = Math.max(260, this.stage.clientHeight || 420);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      this.canvasWrap.append(renderer.domElement);
      this.renderer = renderer;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0c130f);
      scene.fog = new THREE.FogExp2(0x0c130f, 0.085);
      this.scene = scene;

      const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 40);
      this.camera = camera;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.maxPolarAngle = Math.PI * 0.44;
      controls.minPolarAngle = 0.12;
      controls.minDistance = 2.0;
      controls.maxDistance = 6.2;
      controls.target.set(0, 0.12, 0.06);
      this.controls = controls;

      // Studio lighting
      const hemi = new THREE.HemisphereLight(0xf6faed, 0x16241b, 0.85);
      scene.add(hemi);

      const key = new THREE.DirectionalLight(0xfff8e7, 2.1);
      key.position.set(2.4, 4.6, 2.2);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 12;
      key.shadow.camera.left = -2.4;
      key.shadow.camera.right = 2.4;
      key.shadow.camera.top = 2.4;
      key.shadow.camera.bottom = -2.4;
      key.shadow.bias = -0.0005;
      scene.add(key);

      const rim = new THREE.PointLight(0xc5f273, 1.4, 8);
      rim.position.set(-2.2, 2.0, -2.0);
      scene.add(rim);

      // Octagonal wooden tabletop & emerald baize felt tray
      const floor = new THREE.Mesh(
        new THREE.CylinderGeometry(4.4, 4.4, 0.2, 32),
        new THREE.MeshStandardMaterial({ color: 0x131915, roughness: 0.9 }),
      );
      floor.position.y = -0.22;
      floor.receiveShadow = true;
      scene.add(floor);

      const woodOuter = new THREE.Mesh(
        new THREE.CylinderGeometry(1.75, 1.84, 0.22, 8),
        new THREE.MeshStandardMaterial({
          color: 0x4b2b18,
          roughness: 0.45,
          metalness: 0.08,
        }),
      );
      woodOuter.position.y = -0.03;
      woodOuter.receiveShadow = true;
      woodOuter.castShadow = true;
      scene.add(woodOuter);

      const brassTrim = new THREE.Mesh(
        new THREE.TorusGeometry(1.56, 0.038, 12, 8),
        new THREE.MeshStandardMaterial({
          color: 0xd8b454,
          roughness: 0.28,
          metalness: 0.85,
        }),
      );
      brassTrim.rotation.x = Math.PI / 2;
      brassTrim.rotation.z = Math.PI / 8;
      brassTrim.position.y = 0.088;
      scene.add(brassTrim);

      const felt = new THREE.Mesh(
        new THREE.CylinderGeometry(1.48, 1.48, 0.05, 32),
        new THREE.MeshStandardMaterial({
          color: 0x14613f,
          roughness: 0.85,
          metalness: 0.02,
        }),
      );
      felt.position.y = TRAY_Y - 0.024;
      felt.receiveShadow = true;
      scene.add(felt);

      // Inner center ring decoration on baize
      const centerMark = new THREE.Mesh(
        new THREE.RingGeometry(0.68, 0.71, 48),
        new THREE.MeshBasicMaterial({
          color: 0xd8b454,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
        }),
      );
      centerMark.rotation.x = -Math.PI / 2;
      centerMark.position.y = TRAY_Y + 0.004;
      scene.add(centerMark);

      // 6 seat pucks around outer wooden rim
      this.seatPucks = [];
      for (let i = 0; i < MAX_SEATS; i++) {
        const [sx, sy, sz] = seatSlotPosition(i);
        const puck = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.18, 0.06, 24),
          new THREE.MeshStandardMaterial({
            color: SEAT_COLORS[i],
            roughness: 0.35,
            metalness: 0.2,
            emissive: 0x000000,
          }),
        );
        puck.position.set(sx, sy - 0.14, sz);
        puck.castShadow = true;
        scene.add(puck);
        this.seatPucks.push(puck);
      }

      // Create 6 animated dice actors
      const slots = [
        [-0.58, -0.26],
        [0, -0.28],
        [0.58, -0.26],
        [-0.58, 0.32],
        [0, 0.34],
        [0.58, 0.32],
      ];

      for (let i = 0; i < 6; i++) {
        const holder = new THREE.Group();
        holder.position.set(slots[i][0], DIE_REST_Y, slots[i][1]);
        holder.userData.dieIndex = i;
        scene.add(holder);

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(DIE_SIZE * 0.62, DIE_SIZE * 0.78, 32),
          new THREE.MeshBasicMaterial({
            color: 0xc5f273,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(slots[i][0], TRAY_Y + 0.006, slots[i][1]);
        scene.add(ring);
        this.ringMeshes.push(ring);

        this.diceActors.push({
          index: i,
          holder,
          mesh: null,
          basePos: new THREE.Vector3(slots[i][0], DIE_REST_Y, slots[i][1]),
          pos: new THREE.Vector3(slots[i][0], DIE_REST_Y, slots[i][1]),
          spinFrom: new THREE.Quaternion(),
          targetQuat: faceTargetQuaternion(i + 1, 0),
          animElapsed: 1,
          animDuration: 0.85,
          tumbleAxis: new THREE.Vector3(1, 0.6, 0.4).normalize(),
          tumbleSpins: 3,
          jumpHeight: 0.75,
          value: i + 1,
          playable: false,
          locked: false,
        });

        loadDieTemplate().then((tpl) => {
          if (this.disposed) return;
          tpl.traverse((child) => {
            if (child.isMesh) child.userData.dieIndex = i;
          });
          holder.add(tpl);
          this.diceActors[i].mesh = tpl;
        });
      }

      this._applyCameraPreset();
      this.webglReady = true;

      // Tap / Click raycasting on dice (ignore drags)
      const domEl = renderer.domElement;
      domEl.addEventListener("pointerdown", (e) => {
        this.pointerDownPos = { x: e.clientX, y: e.clientY };
      });
      domEl.addEventListener("pointerup", (e) => {
        if (!this.pointerDownPos) return;
        const dx = e.clientX - this.pointerDownPos.x;
        const dy = e.clientY - this.pointerDownPos.y;
        this.pointerDownPos = null;
        if (Math.hypot(dx, dy) > 8) return;
        const rect = domEl.getBoundingClientRect();
        this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const meshes = [];
        for (const a of this.diceActors) {
          if (a.holder.visible) meshes.push(a.holder);
        }
        const hits = this.raycaster.intersectObjects(meshes, true);
        if (hits.length) {
          const hitObj = hits[0].object;
          const idx = hitObj.userData?.dieIndex;
          if (Number.isInteger(idx)) this._toggleDieSelection(idx);
        }
      });

      this.resizeObs = new ResizeObserver(() => this._handleResize());
      this.resizeObs.observe(this.stage);

      const animate = () => {
        if (this.disposed) return;
        this.rafId = requestAnimationFrame(animate);
        const dt = Math.min(0.05, this.animClock.getDelta());
        this._stepDiceAnimations(dt);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
      };
      animate();
    } catch {
      this.webglReady = false;
      this.canvasWrap.hidden = true;
      this.fallback2d.hidden = false;
      this.camBtn.hidden = true;
    }
  }

  _handleResize() {
    if (!this.renderer || !this.camera || !this.stage) return;
    const w = Math.max(280, this.stage.clientWidth);
    const h = Math.max(240, this.stage.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _applyCameraPreset() {
    if (!this.camera || !this.controls) return;
    const isNarrow = window.innerWidth <= 680;
    const presets = isNarrow
      ? [
          [0, 3.05, 2.75],
          [0, 3.85, 0.35],
          [1.65, 2.55, 2.25],
        ]
      : [
          [0, 2.65, 2.45],
          [0, 3.45, 0.3],
          [1.85, 2.1, 2.05],
        ];
    const [x, y, z] = presets[this.camMode % presets.length];
    this.camera.position.set(x, y, z);
    this.controls.target.set(0, 0.1, 0.04);
    this.controls.update();
  }

  cycleCamera() {
    this.camMode = (this.camMode + 1) % 3;
    this._applyCameraPreset();
  }

  _stepDiceAnimations(dt) {
    const t = this.table;
    const showActive = t?.status === "playing" && (t.activeDice?.length || 0) > 0;
    for (let i = 0; i < this.diceActors.length; i++) {
      const a = this.diceActors[i];
      const ring = this.ringMeshes[i];
      if (!showActive && t?.status === "playing") {
        // Resting preview dice before roll or between turns
        a.holder.visible = false;
        ring.visible = false;
        continue;
      }
      const visible =
        !t || ["waiting", "countdown", "finished"].includes(t.status)
          ? i < 2
          : i < (t.activeDice?.length || 0);
      a.holder.visible = visible;
      ring.visible = visible;
      if (!visible) continue;

      if (a.animElapsed < a.animDuration) {
        a.animElapsed = Math.min(a.animDuration, a.animElapsed + dt);
        const u = a.animElapsed / a.animDuration;
        const ease = 1 - Math.pow(1 - u, 3);
        const bounce =
          u < 0.7
            ? Math.sin((u / 0.7) * Math.PI) * a.jumpHeight
            : Math.abs(Math.sin(((u - 0.7) / 0.3) * Math.PI)) * 0.11;
        a.holder.position.set(a.basePos.x, DIE_REST_Y + bounce, a.basePos.z);

        const spinAngle = (1 - ease) * Math.PI * 2 * a.tumbleSpins;
        const extraSpin = new THREE.Quaternion().setFromAxisAngle(
          a.tumbleAxis,
          spinAngle,
        );
        const q = a.targetQuat.clone().premultiply(extraSpin);
        a.holder.quaternion.copy(q);
      } else {
        const lift = this.selected.has(i) ? 0.11 : 0;
        a.holder.position.y += (DIE_REST_Y + lift - a.holder.position.y) * Math.min(1, dt * 14);
        a.holder.position.x = a.basePos.x;
        a.holder.position.z = a.basePos.z;
        a.holder.quaternion.slerp(a.targetQuat, Math.min(1, dt * 14));
      }

      const isSelected = this.selected.has(i);
      const isPlayable = !!t?.scoringMask?.[i] && t?.turnPhase === "selecting";
      ring.material.color.setHex(
        isSelected ? 0xc5f273 : isPlayable ? 0xf6c95e : 0x5c695f,
      );
      ring.material.opacity = isSelected ? 0.92 : isPlayable ? 0.46 : 0;
      const scalePulse = isSelected ? 1.08 + Math.sin(performance.now() * 0.008) * 0.05 : 1;
      ring.scale.setScalar(scalePulse);
    }

    // Highlight active turn seat puck
    if (this.seatPucks && t) {
      for (let i = 0; i < MAX_SEATS; i++) {
        const puck = this.seatPucks[i];
        const seat = t.seats?.[i];
        puck.visible = !!seat;
        if (!seat) continue;
        const active = t.status === "playing" && t.turnSeatIndex === i;
        puck.material.emissive.setHex(active ? 0x628c25 : 0x000000);
        puck.scale.setScalar(active ? 1.24 : 1);
      }
    }
  }

  _startCountdownLoop() {
    this.countdownTimer = setInterval(() => {
      if (this.disposed || !this.table) return;
      const t = this.table;
      let targetAt = null;
      let label = "";
      if (t.status === "countdown" && t.countdownEndsAt) {
        targetAt = t.countdownEndsAt;
        label = "Başlıyor";
      } else if (t.status === "playing" && t.turnExpiresAt && t.turnPhase !== "farkled") {
        targetAt = t.turnExpiresAt;
        label = "Süre";
      }
      if (!targetAt) {
        this.timerPill.hidden = true;
        return;
      }
      const sec = Math.max(0, Math.ceil((targetAt - Date.now()) / 1000));
      this.timerPill.hidden = false;
      this.timerPill.textContent = `⏱ ${label}: ${sec}s`;
      this.timerPill.classList.toggle("urgent", sec <= 5);
    }, 250);
  }

  _isMyTurn() {
    const t = this.table;
    if (!t || t.status !== "playing") return false;
    const seat = t.seats?.[t.turnSeatIndex];
    return !!seat && !seat.isBot && seat.userId === this.myId;
  }

  _toggleDieSelection(idx) {
    const t = this.table;
    if (!t || !this._isMyTurn() || t.turnPhase !== "selecting") return;
    if (!t.scoringMask?.[idx]) return;
    if (this.selected.has(idx)) this.selected.delete(idx);
    else this.selected.add(idx);
    playDiceLock();
    this._renderTrayAndControls();
  }

  _selectAllScoring() {
    const t = this.table;
    if (!t || !this._isMyTurn() || t.turnPhase !== "selecting") return;
    this.selected.clear();
    t.scoringMask.forEach((ok, idx) => {
      if (ok) this.selected.add(idx);
    });
    playDiceLock();
    this._renderTrayAndControls();
  }

  update(table, myId) {
    this.table = table;
    this.myId = myId;
    if (!table) return;

    const isNewRoll = table.rollSeq !== this.lastRollSeq;
    if (isNewRoll) {
      this.selected.clear();
      this.lastRollSeq = table.rollSeq;
      if (table.activeDice?.length) {
        playDiceRoll();
        for (let i = 0; i < table.activeDice.length; i++) {
          const a = this.diceActors[i];
          if (!a) continue;
          const val = table.activeDice[i];
          a.value = val;
          a.targetQuat.copy(faceTargetQuaternion(val, (i - 2.5) * 0.16));
          a.animElapsed = 0;
          a.animDuration = 0.68 + (i % 3) * 0.08;
          a.tumbleSpins = 2.5 + (i % 3) * 0.6;
          a.jumpHeight = 0.62 + (i % 2) * 0.18;
        }
      }
    }

    if (table.turnPhase === "farkled" && this.lastTurnPhase !== "farkled") {
      playFarkle();
    } else if (
      table.status === "finished" &&
      this.lastStatus !== "finished" &&
      table.winnerName
    ) {
      playBlackjack();
    } else if (table.status === "countdown" && this.lastStatus !== "countdown") {
      playTick();
    }
    this.lastStatus = table.status;
    this.lastTurnPhase = table.turnPhase;

    // Header
    this.tableTitle.textContent = `${table.name} · Hedef ${table.targetScore.toLocaleString("tr-TR")}`;
    const phaseLabels = {
      waiting: "OYUNCU BEKLENİYOR",
      countdown: "BAŞLAMAK ÜZERE",
      playing: table.finalRoundTriggeredBy !== -1 ? "SON TUR!" : `${table.round}. TUR`,
      finished: "TUR TAMAMLANDI",
    };
    this.phaseBadge.textContent = phaseLabels[table.status] || "HAZIR";
    this.potPill.textContent = `Tur Potu: ${table.turnPot.toLocaleString("tr-TR")} p`;
    this.actionBanner.textContent =
      table.lastAction?.text || "Zar sırası geldiğinde tahtadaki veya alttaki zarlara dokun!";
    this.actionBanner.hidden = !this.actionBanner.textContent;

    // Seat cards HUD
    this.seatsHud.replaceChildren();
    for (let i = 0; i < MAX_SEATS; i++) {
      const s = table.seats[i];
      const pill = document.createElement("button");
      pill.type = "button";
      const isMine = s && !s.isBot && s.userId === this.myId;
      const isTurn = table.status === "playing" && table.turnSeatIndex === i;
      const isWinner = table.status === "finished" && table.winnerSeatIndex === i;
      pill.className =
        "bj-seat-pill dice-seat-pill" +
        (s ? " occupied" : " empty") +
        (isMine ? " mine" : "") +
        (isTurn ? " turn" : "") +
        (isWinner ? " win" : "");
      if (s) {
        const nameSpan = document.createElement("strong");
        nameSpan.textContent = s.isBot ? "🤖 Zar Bot" : isMine ? `${s.name} (Sen)` : s.name;
        const scoreSpan = document.createElement("small");
        scoreSpan.textContent = `${s.score.toLocaleString("tr-TR")} p`;
        pill.append(nameSpan, scoreSpan);
        if (s.reaction && Date.now() - s.reaction.at < 4000) {
          const reactBubble = document.createElement("span");
          reactBubble.className = "bj-react-bubble";
          reactBubble.textContent = s.reaction.emoji;
          pill.append(reactBubble);
        }
        pill.disabled = true;
      } else {
        const canSit = ["waiting", "countdown", "finished"].includes(table.status);
        pill.innerHTML = `<span class="seat-num">Koltuk ${i + 1}</span><small>${canSit ? "Geç ↗" : "Boş"}</small>`;
        pill.disabled = !canSit;
        if (canSit) pill.addEventListener("click", () => this.cb.onSwitchSeat?.(i));
      }
      this.seatsHud.append(pill);
    }

    this._renderFallback2D();
    this._renderTrayAndControls();
  }

  _renderFallback2D() {
    if (this.webglReady || !this.table) return;
    this.fallback2d.replaceChildren();
    const t = this.table;
    if (!t.activeDice?.length) {
      const idle = document.createElement("p");
      idle.className = "dice2d-empty";
      idle.textContent =
        t.status === "playing"
          ? "Zar sırası: " + (t.seats[t.turnSeatIndex]?.name || "")
          : `${t.seatedCount}/6 koltuk dolu · Başlatmaya hazır.`;
      this.fallback2d.append(idle);
      return;
    }
    const grid = document.createElement("div");
    grid.className = "dice2d-grid";
    t.activeDice.forEach((v, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className =
        "dice2d-die" +
        (this.selected.has(i) ? " selected" : "") +
        (t.scoringMask[i] ? " playable" : " dead");
      b.textContent = String(v);
      b.addEventListener("click", () => this._toggleDieSelection(i));
      grid.append(b);
    });
    this.fallback2d.append(grid);
  }

  _renderTrayAndControls() {
    const t = this.table;
    if (!t) return;
    const isMyTurn = this._isMyTurn();
    const pickedValues = [...this.selected].map((i) => t.activeDice[i]).filter(Boolean);
    const preview = previewDiceSelection(pickedValues);
    const validPick =
      pickedValues.length > 0 && preview.points > 0 && preview.leftoverCount === 0;

    // Tactile die tray bar (works effortlessly on desktop & thumb-tap mobile!)
    this.trayHint.replaceChildren();
    if (t.status === "playing") {
      if (t.activeDice?.length) {
        const bar = document.createElement("div");
        bar.className = "dice-chip-row";
        t.activeDice.forEach((val, idx) => {
          const canPick = isMyTurn && t.turnPhase === "selecting" && t.scoringMask[idx];
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className =
            "dice-face-chip" +
            (this.selected.has(idx) ? " selected" : "") +
            (t.scoringMask[idx] ? " playable" : " dead");
          chip.disabled = !canPick;
          chip.innerHTML = `<span class="die-pip-val">${val}</span><small>${t.scoringMask[idx] ? (val === 1 ? "100" : val === 5 ? "50" : "Puan") : "—"}</small>`;
          chip.addEventListener("click", () => this._toggleDieSelection(idx));
          bar.append(chip);
        });
        this.trayHint.append(bar);
      }

      const info = document.createElement("div");
      info.className = "dice-combo-info";
      if (t.turnPhase === "farkled") {
        info.textContent = "💥 YANDIN! Puan getiren zar çıkmadı, sıra geçiyor…";
      } else if (t.turnPhase === "readyToRoll") {
        const activeName = t.seats[t.turnSeatIndex]?.name || "";
        info.textContent = isMyTurn
          ? `Sıra sende! ${t.remainingDice} zarı at.`
          : `${activeName} zar atmaya hazırlanıyor…`;
      } else if (isMyTurn) {
        info.textContent = !pickedValues.length
          ? `3D tahtadan veya alttan puan getiren zarları seç (Seçili pot: +${t.turnPot} p)`
          : validPick
            ? `✓ Seçili: +${preview.points} (${preview.labels.join(", ")}) → Yeni pot: ${t.turnPot + preview.points} p`
            : `⚠ Seçilen zarlardan eşleşmeyen var (${preview.labels.join(", ") || "geçersiz"}). Üçlüleri tamamla.`;
      } else {
        const activeName = t.seats[t.turnSeatIndex]?.name || "";
        info.textContent = `${activeName} zar seçimi yapıyor (Tur potu: ${t.turnPot} p)…`;
      }
      this.trayHint.append(info);
    } else {
      const lobbyHint = document.createElement("div");
      lobbyHint.className = "dice-combo-info";
      lobbyHint.textContent =
        t.status === "finished"
          ? `🏆 Kazanan: ${t.winnerName} · Ayarları değiştirip yeni tur başlatabilirsin.`
          : "Hedef puanı seç, istersen Zar Botu ekle ve Başlat'a bas (1-6 = 1500, 1=100, 5=50, Üçlüler = x100).";
      this.trayHint.append(lobbyHint);
    }

    // Bottom action controls
    this.controlsRow.replaceChildren();
    if (["waiting", "countdown", "finished"].includes(t.status)) {
      const targetBar = document.createElement("div");
      targetBar.className = "dice-preset-group";
      for (const pts of TARGET_PRESETS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "button small " + (t.targetScore === pts ? "primary" : "secondary");
        btn.textContent = `${pts.toLocaleString("tr-TR")} Hedef`;
        btn.disabled = t.status === "countdown";
        btn.addEventListener("click", () => {
          playChip();
          this.cb.onConfig?.({ targetScore: pts });
        });
        targetBar.append(btn);
      }

      const botBtn = document.createElement("button");
      botBtn.type = "button";
      botBtn.className = "button small secondary";
      botBtn.textContent = t.hasBot ? "🤖 Zar Botunu Çıkar" : "🤖 Zar Botu Ekle (1v1)";
      botBtn.disabled = t.status === "countdown";
      botBtn.addEventListener("click", () => {
        playChip();
        this.cb.onConfig?.({ withBot: !t.hasBot });
      });

      const activeSeats = t.seats.filter((s) => s && !s.disconnected).length;
      const startBtn = document.createElement("button");
      startBtn.type = "button";
      startBtn.className = "button primary dice-start-btn";
      startBtn.disabled = t.status === "countdown";
      startBtn.textContent =
        t.status === "countdown"
          ? "Başlıyor…"
          : activeSeats >= 2
            ? t.status === "finished"
              ? "🎲 Yeni Turu Başlat (10 sn)"
              : "🎲 Oyunu Başlat (10 sn)"
            : "🤖 Botla Hemen Başlat";
      startBtn.addEventListener("click", () =>
        this.cb.onStart?.({ withBot: activeSeats < 2 }),
      );

      this.controlsRow.append(targetBar, botBtn, startBtn);
      return;
    }

    // Playing phase action bar
    if (!isMyTurn) {
      const waitTag = document.createElement("span");
      waitTag.className = "bj-wait-note";
      waitTag.textContent = `Sıra ${t.seats[t.turnSeatIndex]?.name || "oyuncuda"} · Tüm zarlar şeffaftır (Ghost engelli).`;
      this.controlsRow.append(waitTag);
      return;
    }

    if (t.turnPhase === "readyToRoll") {
      const rollBtn = document.createElement("button");
      rollBtn.type = "button";
      rollBtn.className = "button primary dice-big-btn";
      rollBtn.textContent = `🎲 ${t.remainingDice} Zarı At!`;
      rollBtn.addEventListener("click", () => this.cb.onRoll?.());
      this.controlsRow.append(rollBtn);
      return;
    }

    if (t.turnPhase === "selecting") {
      const autoBtn = document.createElement("button");
      autoBtn.type = "button";
      autoBtn.className = "button secondary";
      autoBtn.textContent = "✨ Puanlıları Seç";
      autoBtn.addEventListener("click", () => this._selectAllScoring());

      const rerollCount = t.activeDice.length - pickedValues.length;
      const rollMoreBtn = document.createElement("button");
      rollMoreBtn.type = "button";
      rollMoreBtn.className = "button secondary";
      rollMoreBtn.disabled = !validPick;
      rollMoreBtn.textContent =
        validPick && rerollCount === 0
          ? "🔥 Sıcak Zar! (6 Zarı Tekrar At)"
          : `🎲 Kilitle & ${validPick ? rerollCount : "?"} Zarı At`;
      rollMoreBtn.addEventListener("click", () =>
        this.cb.onCommit?.({ indices: [...this.selected], mode: "roll" }),
      );

      const bankBtn = document.createElement("button");
      bankBtn.type = "button";
      bankBtn.className = "button primary";
      bankBtn.disabled = !validPick;
      bankBtn.textContent = validPick
        ? `💰 +${(t.turnPot + preview.points).toLocaleString("tr-TR")} Kasaya Yaz`
        : "💰 Kasaya Yaz";
      bankBtn.addEventListener("click", () =>
        this.cb.onCommit?.({ indices: [...this.selected], mode: "bank" }),
      );

      this.controlsRow.append(autoBtn, rollMoreBtn, bankBtn);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.countdownTimer);
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.resizeObs?.disconnect();
    this.controls?.dispose();
    this.renderer?.dispose();
    this.root.replaceChildren();
  }
}
