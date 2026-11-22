"use strict";

import * as THREE from "../vendor/three/three.module.js";
import {
  CARD_H,
  CARD_T,
  CARD_TABLE_Y,
  CARD_W,
  CardTableStage3D,
  cardHtmlChip,
  createCardMesh,
  escHtml,
  getRelativeSeatAnchor,
  stepCardFlight,
} from "./card3d_common.mjs";
import {
  playCard,
  playCardCapture,
  playPapazLost,
  playWin,
} from "./sfx.mjs";

const REACTIONS = ["🔥", "👏", "😂", "😱", "🃏", "🍀"];

export class PapazArena {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.cb = callbacks;
    this.table = null;
    this.mySocketId = null;
    this.isSpectator = false;
    this.lastDrawAt = 0;
    this.lastStatusKey = "";
    this.donorPickables = [];
    this.hoveredDonorIdx = -1;
    this.flyAnim = null;

    this._buildDom();
    this.stage3d = new CardTableStage3D(
      this.els.canvas3d,
      this.els.canvas2d,
      this.stageEl,
      {
        tableTitle: "PAPAZ KİMDE",
        tableSubtitle: "49 KART · KARA PAPAZ ♠K",
        baizeColors: ["#15734b", "#0b4f32", "#073420"],
        bgColor: 0x081110,
        accentLight: 0x10b981,
      },
    );
    this._bindStageRaycaster();
    this._startLoop();
  }

  _buildDom() {
    this.container.innerHTML = "";
    this.root = document.createElement("div");
    this.root.className = "card-arena papaz-arena";

    this.root.innerHTML = `
      <div class="card-topbar">
        <div class="card-top-left">
          <span class="cg-title-pill">🃏 Papaz Kimde</span>
          <span class="cg-meta-pill" data-el="round-pill">Hazırlık</span>
          <span class="cg-turn-pill" data-el="turn-pill">Bekleniyor</span>
        </div>
        <div class="card-top-actions">
          <div class="cg-cam-group" role="group" aria-label="Kamera">
            <button type="button" class="cg-cam-btn active" data-cam="masa">Masa</button>
            <button type="button" class="cg-cam-btn" data-cam="yakin">Yakın</button>
            <button type="button" class="cg-cam-btn" data-cam="ustten">Üstten</button>
          </div>
          <button type="button" class="button small secondary" data-act="toggle-2d">2D</button>
          <button type="button" class="button small secondary" data-act="help">? Kurallar</button>
          <button type="button" class="button small secondary" data-act="leave">Çık</button>
        </div>
      </div>

      <div class="cg-seats-bar" data-el="seats-bar"></div>

      <div class="cg-stage-wrap">
        <canvas class="cg-canvas-3d" data-el="canvas3d"></canvas>
        <canvas class="cg-canvas-2d" data-el="canvas2d" hidden></canvas>
        <div class="cg-stage-hud">
          <div class="cg-action-banner" data-el="action-banner">Masa açıldı</div>
          <div class="cg-result-banner" data-el="result-banner" hidden></div>
        </div>
      </div>

      <div class="cg-controls-dock">
        <div class="cg-donor-strip" data-el="donor-strip" hidden></div>
        <div class="cg-lobby-controls" data-el="lobby-controls" hidden>
          <button type="button" class="button small secondary" data-act="add-bot">🤖 Bot Ekle</button>
          <button type="button" class="button small secondary" data-act="remove-bot">Bot Çıkar</button>
          <button type="button" class="button primary" data-act="start">▶ Oyunu Başlat</button>
        </div>
        <div class="cg-finish-controls" data-el="finish-controls" hidden>
          <button type="button" class="button primary" data-act="rematch">↻ Tekrar Oyna</button>
        </div>
        <div class="cg-hand-header">
          <strong data-el="hand-title">Elindeki Kartlar</strong>
          <div class="cg-hand-tools">
            <button type="button" class="button small secondary" data-act="shuffle" hidden>🔀 Elimi Karıştır</button>
            <div class="cg-react-row">
              ${REACTIONS.map((r) => `<button type="button" class="cg-react-btn" data-react="${r}">${r}</button>`).join("")}
            </div>
          </div>
        </div>
        <div class="cg-hand-cards" data-el="hand-cards"></div>
      </div>
    `;

    this.container.append(this.root);
    this.stageEl = this.root.querySelector(".cg-stage-wrap");
    this.els = {};
    this.root.querySelectorAll("[data-el]").forEach((n) => {
      this.els[n.dataset.el] = n;
    });

    this.root.addEventListener("click", (e) => {
      const camBtn = e.target.closest("[data-cam]");
      if (camBtn) {
        this.root.querySelectorAll("[data-cam]").forEach((b) =>
          b.classList.toggle("active", b === camBtn),
        );
        this.stage3d?.setCameraMode(camBtn.dataset.cam, false);
        return;
      }
      const donorBtn = e.target.closest("[data-pick-idx]");
      if (donorBtn) {
        const idx = Number(donorBtn.dataset.pickIdx);
        if (Number.isInteger(idx)) this.cb.onDraw?.(idx);
        return;
      }
      const reactBtn = e.target.closest("[data-react]");
      if (reactBtn) {
        this.cb.onReact?.(reactBtn.dataset.react);
        return;
      }
      const actBtn = e.target.closest("[data-act]");
      if (!actBtn) return;
      const act = actBtn.dataset.act;
      if (act === "leave") this.cb.onLeave?.();
      else if (act === "help") this.cb.onHelp?.();
      else if (act === "start") this.cb.onStart?.();
      else if (act === "add-bot") this.cb.onConfig?.("addBot");
      else if (act === "remove-bot") this.cb.onConfig?.("removeBot");
      else if (act === "shuffle") this.cb.onShuffle?.();
      else if (act === "rematch") this.cb.onRematch?.();
      else if (act === "toggle-2d") {
        const is2d = this.stage3d.toggle2D();
        actBtn.textContent = is2d ? "3D" : "2D";
      }
    });
  }

  _bindStageRaycaster() {
    const canvas = this.els.canvas3d;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downPt = null;

    const getHitIndex = (e) => {
      if (!this.donorPickables.length || !this.stage3d?.camera) return -1;
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, this.stage3d.camera);
      const hits = raycaster.intersectObjects(this.donorPickables, false);
      return hits.length > 0 ? hits[0].object.userData.cardIdx : -1;
    };

    canvas.addEventListener("pointermove", (e) => {
      const idx = getHitIndex(e);
      if (idx !== this.hoveredDonorIdx) {
        this.hoveredDonorIdx = idx;
        canvas.style.cursor = idx >= 0 ? "pointer" : "grab";
        for (const m of this.donorPickables) {
          m.position.y = CARD_TABLE_Y + 0.08 + (m.userData.cardIdx === idx ? 0.045 : 0);
        }
      }
    });
    canvas.addEventListener("pointerdown", (e) => {
      downPt = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener("pointerup", (e) => {
      if (!downPt) return;
      if (Math.hypot(e.clientX - downPt.x, e.clientY - downPt.y) > 9) return;
      const idx = getHitIndex(e);
      if (idx >= 0) this.cb.onDraw?.(idx);
    });
  }

  update(table, mySocketId, opts = {}) {
    if (!table || this.stage3d?.disposed) return;
    this.table = table;
    this.mySocketId = mySocketId;
    this.isSpectator = Boolean(opts.spectator || table.mySeatIndex < 0);

    // Sound triggers on transitions
    if (table.lastDraw?.at && table.lastDraw.at !== this.lastDrawAt) {
      this.lastDrawAt = table.lastDraw.at;
      if (table.lastDraw.matched) playCardCapture();
      else playCard();
      this._triggerDrawFlight(table.lastDraw);
    }
    const statKey = `${table.round}:${table.status}`;
    if (statKey !== this.lastStatusKey) {
      this.lastStatusKey = statKey;
      if (table.status === "finished") {
        if (table.loserSeatIndex === table.mySeatIndex) playPapazLost();
        else playWin();
      }
    }

    this._renderHUD();
    this._sync3DCards();
  }

  _triggerDrawFlight(draw) {
    if (!this.stage3d?.scene || !this.table) return;
    if (this.flyAnim) {
      this.stage3d.cardsGroup.remove(this.flyAnim.mesh);
      this.flyAnim = null;
    }
    const baseSeat = this.table.mySeatIndex >= 0 ? this.table.mySeatIndex : 0;
    const relFrom = (draw.fromSeat - baseSeat + 4) % 4;
    const relTo = (draw.toSeat - baseSeat + 4) % 4;
    const fromA = getRelativeSeatAnchor(relFrom, 4);
    const toA = getRelativeSeatAnchor(relTo, 4);
    const card = draw.matched && draw.pairCards?.[1] ? draw.pairCards[1] : null;
    const mesh = createCardMesh(card, {
      faceUp: Boolean(card),
      backVariant: "emerald",
      highlightBlackKing: true,
    });
    mesh.position.set(fromA.x * 0.72, CARD_TABLE_Y + 0.08, fromA.z * 0.72);
    this.stage3d.cardsGroup.add(mesh);
    this.flyAnim = {
      mesh,
      from: new THREE.Vector3(fromA.x * 0.72, CARD_TABLE_Y + 0.08, fromA.z * 0.72),
      to: draw.matched
        ? new THREE.Vector3(0, CARD_TABLE_Y + 0.06, 0)
        : new THREE.Vector3(toA.x * 0.72, CARD_TABLE_Y + 0.08, toA.z * 0.72),
      t: 0,
      dur: 0.36,
    };
  }

  _sync3DCards() {
    const group = this.stage3d?.cardsGroup;
    if (!group || !this.table) return;
    const activeFlyMesh = this.flyAnim?.mesh || null;
    for (const child of [...group.children]) {
      if (child !== activeFlyMesh) group.remove(child);
    }
    this.donorPickables = [];
    this.hoveredDonorIdx = -1;

    const t = this.table;
    const baseSeat = t.mySeatIndex >= 0 ? t.mySeatIndex : 0;
    const myTurn = !this.isSpectator && t.status === "playing" && t.turnSeatIndex === t.mySeatIndex;

    // 1) Center discarded pair stack (burnPileTop face up)
    const burnCards = t.burnPileTop || [];
    burnCards.forEach((c, idx) => {
      const m = createCardMesh(c, { faceUp: true, backVariant: "emerald" });
      m.position.set(
        ((idx % 3) - 1) * 0.065,
        CARD_TABLE_Y + idx * 0.004,
        ((idx % 2) - 0.5) * 0.04,
      );
      m.rotation.y = (idx - 1.5) * 0.24;
      group.add(m);
    });

    // 2) Seat fans around the octagonal felt
    for (let i = 0; i < 4; i += 1) {
      const seat = t.seats[i];
      if (!seat || seat.cardCount <= 0) continue;
      const rel = (i - baseSeat + 4) % 4;
      const anc = getRelativeSeatAnchor(rel, 4);
      const isDonor = myTurn && i === t.donorSeatIndex;
      const count = Math.min(16, seat.cardCount);
      const fanSpan = Math.min(0.85, count * 0.085);

      for (let k = 0; k < count; k += 1) {
        const frac = count === 1 ? 0 : (k / (count - 1)) * 2 - 1;
        const showMyOwn = rel === 0 && seat.hand?.[k];
        const cardData = showMyOwn ? seat.hand[k] : null;
        const m = createCardMesh(cardData, {
          faceUp: Boolean(showMyOwn),
          backVariant: "emerald",
          highlightBlackKing: true,
        });

        // Spread tangentially across the player's side edge
        const tangentX = Math.cos(anc.rotY);
        const tangentZ = -Math.sin(anc.rotY);
        const offsetAlong = frac * fanSpan * 0.48;
        const depthScale = isDonor ? 0.68 : 0.78;
        m.position.set(
          anc.x * depthScale + tangentX * offsetAlong,
          CARD_TABLE_Y + (isDonor ? 0.08 : 0.05) + k * 0.001,
          anc.z * depthScale + tangentZ * offsetAlong,
        );
        m.rotation.y = anc.rotY - frac * 0.22;
        // Tilt donor fan upward slightly so you can clearly click a hidden card from the table!
        if (isDonor) {
          m.rotation.x = -0.34;
          m.userData.cardIdx = k;
          this.donorPickables.push(m);
        } else if (rel !== 0) {
          m.rotation.x = -0.22;
        }
        group.add(m);
      }
    }
  }

  _renderHUD() {
    const t = this.table;
    if (!t) return;

    this.els["round-pill"].textContent = `${t.round || 0}. El · Atık ${t.burnPileCount || 0}`;
    const turnSeat = t.turnSeatIndex >= 0 ? t.seats[t.turnSeatIndex] : null;
    const myTurn = !this.isSpectator && t.status === "playing" && t.turnSeatIndex === t.mySeatIndex;
    this.els["turn-pill"].textContent =
      t.status === "waiting"
        ? "Oyuncular Bekleniyor"
        : t.status === "finished"
          ? "El Tamamlandı"
          : myTurn
            ? "🔥 SIRA SENDE — KART ÇEK!"
            : turnSeat
              ? `Sıra: ${turnSeat.name}`
              : "Oynanıyor";
    this.els["turn-pill"].classList.toggle("is-my-turn", myTurn);
    this.els["action-banner"].textContent = t.lastAction?.text || "Papaz Kimde";

    // Seats bar
    const sBar = this.els["seats-bar"];
    sBar.innerHTML = "";
    const now = Date.now();
    t.seats.forEach((s, idx) => {
      const card = document.createElement("div");
      const isTurn = t.status === "playing" && t.turnSeatIndex === idx;
      const isDonor = myTurn && t.donorSeatIndex === idx;
      const isLoser = t.status === "finished" && t.loserSeatIndex === idx;
      card.className = `cg-seat-chip ${isTurn ? "is-turn" : ""} ${isDonor ? "is-donor" : ""} ${isLoser ? "is-loser" : ""} ${idx === t.mySeatIndex ? "is-me" : ""}`;
      if (!s) {
        card.innerHTML = `<span class="cg-seat-empty">Koltuk #${idx + 1} · Boş</span>`;
      } else {
        const react = s.reaction && now - s.reaction.at < 4500 ? `<span class="cg-react-pop">${escHtml(s.reaction.emoji)}</span>` : "";
        const badge = s.finishRank
          ? `🏆 #${s.finishRank} Kurtuldu`
          : isLoser
            ? `💀 ♠K Patladı`
            : `🂠 ${s.cardCount} Kart`;
        card.innerHTML = `
          <div class="cg-seat-top">
            <strong>${escHtml(s.name)} ${s.isBot ? "🤖" : ""}</strong>
            ${react}
          </div>
          <small>${badge} · Çift: ${s.pairsThrown || 0} · G:${s.wins || 0}</small>
        `;
      }
      sBar.append(card);
    });

    // Result Banner
    const resBan = this.els["result-banner"];
    if (t.status === "finished" && t.loserSeatIndex >= 0) {
      const loser = t.seats[t.loserSeatIndex];
      resBan.textContent = `💀 ♠K KARA PAPAZ ${loser?.name || "?"} ELİNDE KALDI!`;
      resBan.hidden = false;
    } else {
      resBan.hidden = true;
    }

    // Lobby controls & finish controls
    const occupiedCount = t.seats.filter(Boolean).length;
    this.els["lobby-controls"].hidden = !(t.status === "waiting" && !this.isSpectator);
    const startBtn = this.root.querySelector('[data-act="start"]');
    if (startBtn) startBtn.disabled = occupiedCount < 2;
    this.els["finish-controls"].hidden = !(t.status === "finished" && !this.isSpectator);

    const shuffleBtn = this.root.querySelector('[data-act="shuffle"]');
    const mySeat = t.mySeatIndex >= 0 ? t.seats[t.mySeatIndex] : null;
    if (shuffleBtn) {
      shuffleBtn.hidden = !(t.status === "playing" && !this.isSpectator && mySeat && mySeat.hand?.length >= 2);
    }

    // Donor pick strip when it's your turn!
    const dStrip = this.els["donor-strip"];
    const donorSeat = t.donorSeatIndex >= 0 ? t.seats[t.donorSeatIndex] : null;
    if (myTurn && donorSeat && donorSeat.cardCount > 0) {
      dStrip.innerHTML = `
        <span class="cg-donor-prompt">👆 <strong>${escHtml(donorSeat.name)}</strong> oyuncusundan 1 kart seç:</span>
        <div class="cg-donor-slots">
          ${Array.from({ length: donorSeat.cardCount }, (_, idx) =>
        `<button type="button" class="cg-donor-card" data-pick-idx="${idx}" title="${idx + 1}. kartı çek"><span>🂠</span><small>#${idx + 1}</small></button>`,
      ).join("")}
        </div>
      `;
      dStrip.hidden = false;
    } else {
      dStrip.hidden = true;
    }

    // Player Hand Dock
    const handWrap = this.els["hand-cards"];
    handWrap.innerHTML = "";
    if (this.isSpectator) {
      this.els["hand-title"].textContent = "👁 İzleyici Modu (Eller Gizli)";
    } else if (!mySeat || !mySeat.hand?.length) {
      this.els["hand-title"].textContent = mySeat?.finishRank
        ? `🏆 Tebrikler! ${mySeat.finishRank}. sırada kurtuldun!`
        : "Elindeki Kartlar (0)";
    } else {
      this.els["hand-title"].textContent = `Elindeki Kartlar (${mySeat.hand.length})`;
      for (const c of mySeat.hand) {
        const isBlackKing = c.rank === "K" && c.suit === "spades";
        const btn = document.createElement("div");
        btn.className = `cg-hand-card static ${isBlackKing ? "is-black-king" : ""}`;
        btn.innerHTML = cardHtmlChip(c, { highlightBlackKing: true });
        handWrap.append(btn);
      }
    }
  }

  _startLoop() {
    const tick = () => {
      if (this.stage3d.disposed) return;
      this.stage3d.rafId = requestAnimationFrame(tick);
      const dt = Math.min(0.05, this.stage3d.clock.getDelta());
      this.stage3d.stepCamera(dt);

      if (this.flyAnim) {
        this.flyAnim = stepCardFlight(this.flyAnim, dt, this.stage3d.cardsGroup, 0.28);
      }

      if (!this.stage3d.force2D && !this.stage3d.webglFailed && this.stage3d.renderer) {
        this.stage3d.renderer.render(this.stage3d.scene, this.stage3d.camera);
      } else {
        this._render2D();
      }
    };
    this.stage3d.rafId = requestAnimationFrame(tick);
  }

  _render2D() {
    const canvas = this.els.canvas2d;
    if (!canvas || canvas.hidden) return;
    const w = Math.max(260, this.stageEl.clientWidth);
    const h = Math.max(190, this.stageEl.clientHeight);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0b422a";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#e3b857";
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = "#fef08a";
    ctx.font = "800 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(this.table?.lastAction?.text || "Papaz Kimde (2D)", w * 0.5, h * 0.5);
  }

  dispose() {
    this.stage3d?.dispose?.();
    this.container.innerHTML = "";
  }
}
