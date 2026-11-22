"use strict";

import * as THREE from "../vendor/three/three.module.js";
import { GLTFLoader } from "../vendor/three/GLTFLoader.js";
import { OrbitControls } from "../vendor/three/OrbitControls.js";
import { MeshoptDecoder } from "../vendor/three/meshopt_decoder.module.js";

export const CARD_TABLE_Y = 0.808;
export const CARD_W = 0.146;
export const CARD_H = 0.206;
export const CARD_T = 0.0032;

export const SUIT_SYMBOLS = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};

export const SUIT_NAMES_TR = {
  spades: "Maça",
  hearts: "Kupa",
  diamonds: "Karo",
  clubs: "Sinek",
};

const cardFaceCache = new Map();
const cardBackCache = new Map();
const cardSideMat = new THREE.MeshStandardMaterial({
  color: 0xe6dfd0,
  roughness: 0.65,
  metalness: 0.04,
});

export function escHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

export function isRedSuit(suit) {
  return suit === "hearts" || suit === "diamonds" || suit === "H" || suit === "D";
}

export function getCardBackTexture(variant = "emerald") {
  if (cardBackCache.has(variant)) return cardBackCache.get(variant);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");

  const schemes = {
    emerald: { inner: "#0e3b28", accent: "#d4af37", label: "PK" },
    crimson: { inner: "#581320", accent: "#facc15", label: "PİŞTİ" },
    navy: { inner: "#132347", accent: "#e3b857", label: "BATAK" },
  };
  const pal = schemes[variant] || schemes.emerald;

  ctx.fillStyle = "#faf6ec";
  ctx.fillRect(0, 0, 256, 360);
  ctx.fillStyle = pal.inner;
  ctx.fillRect(14, 14, 228, 332);

  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(22, 22, 212, 316);
  ctx.lineWidth = 1.4;
  ctx.strokeRect(30, 30, 196, 300);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 1.2;
  for (let y = 38; y < 322; y += 22) {
    for (let x = 38; x < 218; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x + 9, y);
      ctx.lineTo(x + 18, y + 9);
      ctx.lineTo(x + 9, y + 18);
      ctx.lineTo(x, y + 9);
      ctx.closePath();
      ctx.stroke();
    }
  }

  ctx.fillStyle = pal.accent;
  ctx.beginPath();
  ctx.arc(128, 180, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.inner;
  ctx.beginPath();
  ctx.arc(128, 180, 31, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.accent;
  ctx.font = "900 17px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(pal.label, 128, 181);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cardBackCache.set(variant, tex);
  return tex;
}

export function getCardFaceTexture(card, opts = {}) {
  const highlightBlackKing = Boolean(opts.highlightBlackKing && card.rank === "K" && (card.suit === "spades" || card.suit === "S"));
  const key = `${card.rank}:${card.suit}:${highlightBlackKing ? "kp" : "std"}`;
  if (cardFaceCache.has(key)) return cardFaceCache.get(key);

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");

  const red = isRedSuit(card.suit);
  const sym = SUIT_SYMBOLS[card.suit] || "♠";
  const ink = highlightBlackKing ? "#fbbf24" : red ? "#c41e2e" : "#151a18";

  ctx.fillStyle = highlightBlackKing ? "#17111a" : "#fcfaf2";
  ctx.fillRect(0, 0, 256, 360);

  ctx.strokeStyle = highlightBlackKing ? "#f59e0b" : "#ded5bf";
  ctx.lineWidth = highlightBlackKing ? 6 : 4;
  ctx.strokeRect(4, 4, 248, 352);

  ctx.strokeStyle = highlightBlackKing ? "rgba(251, 191, 36, 0.45)" : "rgba(180, 168, 140, 0.25)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(18, 18, 220, 324);

  // Corner indices
  ctx.fillStyle = ink;
  ctx.font = "bold 42px Georgia, serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(card.rank, 22, 20);
  ctx.font = "34px serif";
  ctx.fillText(sym, 24, 62);

  ctx.save();
  ctx.translate(256, 360);
  ctx.rotate(Math.PI);
  ctx.font = "bold 42px Georgia, serif";
  ctx.fillText(card.rank, 22, 20);
  ctx.font = "34px serif";
  ctx.fillText(sym, 24, 62);
  ctx.restore();

  if (highlightBlackKing) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ef4444";
    ctx.font = "900 22px system-ui, sans-serif";
    ctx.fillText("KARA PAPAZ", 128, 86);
    ctx.fillStyle = "#fde047";
    ctx.font = "bold 96px Georgia, serif";
    ctx.fillText("K", 128, 178);
    ctx.font = "54px serif";
    ctx.fillText("♠", 128, 252);
  } else if (["J", "Q", "K"].includes(card.rank)) {
    ctx.strokeStyle = red ? "rgba(196, 30, 46, 0.26)" : "rgba(21, 26, 24, 0.2)";
    ctx.lineWidth = 3;
    ctx.strokeRect(62, 82, 132, 196);
    ctx.fillStyle = ink;
    ctx.font = "bold 90px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(card.rank, 128, 164);
    ctx.font = "46px serif";
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
  cardFaceCache.set(key, tex);
  return tex;
}

const sharedCardGeo = new THREE.BoxGeometry(CARD_W, CARD_T, CARD_H);

export function createCardMesh(card, opts = {}) {
  const faceUp = opts.faceUp !== false;
  const backVariant = opts.backVariant || "emerald";
  const backMat = new THREE.MeshStandardMaterial({
    map: getCardBackTexture(backVariant),
    roughness: 0.45,
    metalness: 0.06,
  });
  const topMat =
    faceUp && card
      ? new THREE.MeshStandardMaterial({
          map: getCardFaceTexture(card, { highlightBlackKing: opts.highlightBlackKing }),
          roughness: 0.42,
          metalness: 0.04,
        })
      : backMat;

  // BoxGeometry material order: +x, -x, +y (top), -y (bottom), +z, -z
  const mesh = new THREE.Mesh(sharedCardGeo, [
    cardSideMat,
    cardSideMat,
    topMat,
    backMat,
    cardSideMat,
    cardSideMat,
  ]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildBaizeTexture({ title, subtitle, colors }) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext("2d");

  const grad = ctx.createRadialGradient(512, 512, 60, 512, 512, 540);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(0.65, colors[1]);
  grad.addColorStop(1, colors[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle woven baize grain
  ctx.fillStyle = "rgba(255, 255, 255, 0.025)";
  for (let i = 0; i < 3800; i += 1) {
    ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
  }

  // Gold filigree rings
  ctx.strokeStyle = "rgba(234, 198, 102, 0.42)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(512, 512, 465, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(234, 198, 102, 0.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(512, 512, 310, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(250, 224, 138, 0.36)";
  ctx.font = "900 44px Georgia, serif";
  ctx.fillText(title, 512, 470);
  ctx.fillStyle = "rgba(250, 224, 138, 0.28)";
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.fillText(subtitle, 512, 520);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Relative seat coordinates on top of octagonal table around radius ~1.06
 * seat 0 is closest to camera (+Z), then counter-clockwise (+X right, -Z top, -X left)
 */
export function getRelativeSeatAnchor(relSeat, seatCount = 4) {
  const angle =
    seatCount === 2
      ? relSeat === 0
        ? 0
        : Math.PI
      : (relSeat * Math.PI) / 2; // 0: +Z, 1: +X, 2: -Z, 3: -X
  return {
    angle,
    x: Math.sin(angle) * 1.04,
    z: Math.cos(angle) * 1.04,
    rotY: angle,
  };
}

export class CardTableStage3D {
  constructor(canvas3d, canvas2d, stageEl, opts = {}) {
    this.canvas3d = canvas3d;
    this.canvas2d = canvas2d;
    this.stageEl = stageEl;
    this.opts = opts;
    this.cameraMode = "masa";
    this.force2D = false;
    this.webglFailed = false;
    this.disposed = false;
    this.clock = new THREE.Clock();
    this.rafId = null;

    this._initScene();
  }

  _initScene() {
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
      this.renderer.toneMappingExposure = 1.15;
    } catch {
      this.webglFailed = true;
      this._syncVisibility();
      return;
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.opts.bgColor || 0x091114);
    this.scene.fog = new THREE.FogExp2(this.opts.bgColor || 0x091114, 0.075);

    this.camera = new THREE.PerspectiveCamera(44, 1.5, 0.1, 30);
    this.controls = new OrbitControls(this.camera, this.canvas3d);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.45;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 4.6;

    // Warm salon lights
    const hemi = new THREE.HemisphereLight(0xfff5e0, 0x0b1215, 0.9);
    const key = new THREE.DirectionalLight(0xfff6e5, 1.85);
    key.position.set(1.6, 3.8, 2.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const fill = new THREE.PointLight(this.opts.accentLight || 0x10b981, 0.9, 6);
    fill.position.set(-1.8, 2.2, -1.6);
    const rim = new THREE.PointLight(0xfbbf24, 0.7, 6);
    rim.position.set(1.8, 2.2, -1.5);
    this.scene.add(hemi, key, fill, rim);

    // Carpet floor
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(6.5, 48),
      new THREE.MeshStandardMaterial({ color: 0x0d1519, roughness: 0.92, metalness: 0.05 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Custom felt disk right inside the table rim
    const baizeTex = buildBaizeTexture({
      title: this.opts.tableTitle || "HAKING KIRAATHANE",
      subtitle: this.opts.tableSubtitle || "VIP KART SALONU",
      colors: this.opts.baizeColors || ["#17734d", "#0c4f33", "#073420"],
    });
    const felt = new THREE.Mesh(
      new THREE.CircleGeometry(1.26, 48),
      new THREE.MeshStandardMaterial({ map: baizeTex, roughness: 0.88, metalness: 0.02 }),
    );
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = 0.802;
    felt.receiveShadow = true;
    this.scene.add(felt);

    this.cardsGroup = new THREE.Group();
    this.scene.add(this.cardsGroup);
    this.propsGroup = new THREE.Group();
    this.scene.add(this.propsGroup);

    // Load octagonal card table + optional krupiye dealer GLB cleanly
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      "./assets/models/card_table.glb",
      (gltf) => {
        if (this.disposed) return;
        gltf.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        this.scene.add(gltf.scene);
      },
      undefined,
      () => {},
    );

    if (this.opts.withDealer !== false) {
      loader.load(
        "./assets/models/dealer.glb",
        (gltf) => {
          if (this.disposed) return;
          const m = gltf.scene;
          const bones = {};
          m.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
              o.frustumCulled = false;
            }
            if (o.isBone) {
              const clean = o.name.replace(/^mixamorig/i, "");
              bones[clean] = o;
              bones[o.name] = o;
            }
          });
          const box = new THREE.Box3().setFromObject(m);
          const sz = new THREE.Vector3();
          box.getSize(sz);
          const sc = sz.y > 0.01 ? 1.72 / sz.y : 1;
          m.scale.setScalar(sc);
          m.updateMatrixWorld(true);
          const sbox = new THREE.Box3().setFromObject(m);
          const ctr = new THREE.Vector3();
          sbox.getCenter(ctr);
          m.position.set(-ctr.x, -sbox.min.y + 0.02, -ctr.z - 1.78);
          this.scene.add(m);

          const poseRig = {};
          const alignBone = (bKey, cKey, dirWorld) => {
            const bone = bones[bKey];
            const child = bones[cKey];
            if (!bone || !child) return;
            m.updateMatrixWorld(true);
            const p0 = new THREE.Vector3();
            const p1 = new THREE.Vector3();
            bone.getWorldPosition(p0);
            child.getWorldPosition(p1);
            const cur = p1.sub(p0).normalize();
            if (cur.lengthSq() < 0.001) return;
            const delta = new THREE.Quaternion().setFromUnitVectors(cur, dirWorld.clone().normalize());
            const pQ = new THREE.Quaternion();
            const wQ = new THREE.Quaternion();
            if (bone.parent) bone.parent.getWorldQuaternion(pQ);
            bone.getWorldQuaternion(wQ);
            bone.quaternion.copy(pQ.clone().invert().multiply(delta.multiply(wQ)));
            poseRig[bKey] = { bone, base: bone.quaternion.clone() };
          };
          alignBone("LeftArm", "LeftForeArm", new THREE.Vector3(0.32, -0.78, 0.52));
          alignBone("LeftForeArm", "LeftHand", new THREE.Vector3(-0.08, -0.18, 0.98));
          alignBone("RightArm", "RightForeArm", new THREE.Vector3(-0.32, -0.78, 0.52));
          alignBone("RightForeArm", "RightHand", new THREE.Vector3(0.08, -0.18, 0.98));
          for (const key of ["Spine", "Spine1", "Spine2", "Neck", "Head"]) {
            if (bones[key]) poseRig[key] = { bone: bones[key], base: bones[key].quaternion.clone() };
          }
          this.dealerModel = m;
          this.dealerRig = { root: m, poseRig, dealPulseUntil: 0 };
        },
        undefined,
        () => {},
      );
    }

    this.setCameraMode("masa", true);
    this._resize();
    this._resizeObs = new ResizeObserver(() => this._resize());
    this._resizeObs.observe(this.stageEl);
  }

  setCameraMode(mode, immediate = false) {
    this.cameraMode = mode;
    if (!this.camera || !this.controls) return;
    if (!this._camPos) {
      this._camPos = new THREE.Vector3();
      this._camLook = new THREE.Vector3();
      this._camGlide = false;
      this.controls.addEventListener("start", () => {
        this._camGlide = false;
      });
    }
    const narrow = (this.camera.aspect || 1.5) < 1.35;
    if (mode === "yakin") {
      this._camPos.set(0, narrow ? 2.15 : 1.72, narrow ? 2.05 : 1.55);
      this._camLook.set(0, 0.82, 0.08);
    } else if (mode === "ustten") {
      this._camPos.set(0, narrow ? 3.55 : 2.95, 0.55);
      this._camLook.set(0, 0.8, 0);
    } else {
      this._camPos.set(0, narrow ? 2.65 : 2.24, narrow ? 3.3 : 2.64);
      this._camLook.set(0, 0.94, -0.05);
    }

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
    const w = Math.max(240, this.stageEl.clientWidth);
    const h = Math.max(190, this.stageEl.clientHeight);
    const prevNarrow = (this.camera.aspect || 1.5) < 1.35;
    const nextNarrow = w / h < 1.35;
    this.camera.aspect = w / h;
    this.camera.fov = nextNarrow ? 48 : 43;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (prevNarrow !== nextNarrow) {
      this.setCameraMode(this.cameraMode, true);
    }
  }

  _syncVisibility() {
    const use2D = this.force2D || this.webglFailed;
    this.canvas3d.hidden = use2D;
    this.canvas2d.hidden = !use2D;
  }

  toggle2D() {
    this.force2D = !this.force2D;
    this._syncVisibility();
    return this.force2D;
  }

  stepCamera(dt) {
    if (this._camGlide && this.camera && this.controls) {
      const k = 1 - Math.exp(-8.5 * dt);
      this.camera.position.lerp(this._camPos, k);
      this.controls.target.lerp(this._camLook, k);
      if (this.camera.position.distanceToSquared(this._camPos) < 0.0005) {
        this.camera.position.copy(this._camPos);
        this.controls.target.copy(this._camLook);
        this._camGlide = false;
      }
    }
    this.controls?.update();

    // Subtle organic idle croupier breathing & table scan
    if (this.dealerRig?.poseRig) {
      const tSec = performance.now() * 0.001;
      const { poseRig } = this.dealerRig;
      if (poseRig.Spine1?.base) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(tSec * 1.45) * 0.022, 0, 0));
        poseRig.Spine1.bone.quaternion.copy(poseRig.Spine1.base).multiply(q);
      }
      if (poseRig.Neck?.base) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, Math.sin(tSec * 0.45) * 0.14, 0));
        poseRig.Neck.bone.quaternion.copy(poseRig.Neck.base).multiply(q);
      }
      if (poseRig.Head?.base) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.06, Math.sin(tSec * 0.55) * 0.16, 0));
        poseRig.Head.bone.quaternion.copy(poseRig.Head.base).multiply(q);
      }
      if (poseRig.RightArm?.base) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(tSec * 1.35) * 0.025, 0, 0));
        poseRig.RightArm.bone.quaternion.copy(poseRig.RightArm.base).multiply(q);
      }
    }
  }

  dispose() {
    this.disposed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this._resizeObs?.disconnect?.();
    this.controls?.dispose?.();
    this.renderer?.dispose?.();
  }
}

export function stepCardFlight(flyAnim, dt, cardsGroup, arcHeight = 0.25) {
  if (!flyAnim) return null;
  flyAnim.t += dt;
  const p = Math.min(1, flyAnim.t / flyAnim.dur);
  const ease = 1 - Math.pow(1 - p, 3);
  flyAnim.mesh.position.lerpVectors(flyAnim.from, flyAnim.to, ease);
  flyAnim.mesh.position.y += Math.sin(p * Math.PI) * arcHeight;
  flyAnim.mesh.rotation.z = Math.sin(p * Math.PI) * 0.34;
  flyAnim.mesh.rotation.x = -Math.sin(p * Math.PI) * 0.22;
  if (p >= 1) {
    cardsGroup?.remove(flyAnim.mesh);
    return null;
  }
  return flyAnim;
}

export function cardHtmlChip(card, opts = {}) {
  const sym = SUIT_SYMBOLS[card.suit] || "♠";
  const red = isRedSuit(card.suit);
  const isKp = opts.highlightBlackKing && card.rank === "K" && (card.suit === "spades" || card.suit === "S");
  return `
    <span class="cg-card-rank">${escHtml(card.rank)}</span>
    <span class="cg-card-suit ${red ? "red" : "blk"}${isKp ? " kp" : ""}">${sym}</span>
  `;
}
