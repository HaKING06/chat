"use strict";

import * as THREE from "../vendor/three/three.module.js";
import {
  CARD_TABLE_Y,
  CardTableStage3D,
  cardHtmlChip,
  createCardMesh,
  escHtml,
  getRelativeSeatAnchor,
} from "./card3d_common.mjs";
import {
  playCard,
  playCardCapture,
  playPistiFlash,
  playWin,
} from "./sfx.mjs";

const REACTIONS = ["🔥", "👏", "😮", "😂", "🃏", "💎"];

export class PistiArena {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.cb = callbacks;
    this.table = null;
    this.mySocketId = null;
    this.isSpectator = false;
    this.lastPlayAt = 0;
    this.lastStatusKey = "";
    this.flyAnim = null;

    this._buildDom();
    this.stage3d = new CardTableStage3D(
      this.els.canvas3d,
      this.els.canvas2d,
      this.stageEl,
      {
        tableTitle: "PİŞTİ 52",
        tableSubtitle: "KLASİK 3 KAPALI + 1 AÇIK · +10 / +20 PİŞTİ",
        baizeColors: ["#6f1d2e", "#46111d", "#290910"],
        bgColor: 0x12090d,
        accentLight: 0xf43f5e,
      },
    );
    this._startLoop();
  }

  _buildDom() {
    this.container.innerHTML = "";
    this.root = document.createElement("div");
    this.root.className = "card-arena pisti-arena";

    this.root.innerHTML = `
      <div class="card-topbar">
        <div class="card-top-left">
          <span class="cg-title-pill pisti">🂡 Pişti</span>
          <span class="cg-meta-pill" data-el="deck-pill">Deste: 48 · Yer: 4</span>
          <span class="cg-meta-pill gold" data-el="score-pill">Hedef: 101</span>
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
          <div class="cg-pisti-flash" data-el="pisti-flash" hidden></div>
          <div class="cg-action-banner" data-el="action-banner">Pişti masası açıldı</div>
          <div class="cg-summary-card" data-el="summary-card" hidden></div>
        </div>
      </div>

      <div class="cg-controls-dock">
        <div class="cg-lobby-controls" data-el="lobby-controls" hidden>
          <button type="button" class="button small secondary" data-act="fill-bots">🤖 Botlarla Doldur</button>
          <button type="button" class="button small secondary" data-act="remove-bots">Botları Kaldır</button>
          <button type="button" class="button primary" data-act="start">▶ Maçı Başlat</button>
        </div>
        <div class="cg-finish-controls" data-el="next-controls" hidden>
          <button type="button" class="button primary" data-act="next-hand">▶ Sonraki Eli Dağıt</button>
        </div>
        <div class="cg-finish-controls" data-el="rematch-controls" hidden>
          <button type="button" class="button primary" data-act="rematch">↻ Yeni Maç Başlat</button>
        </div>
        <div class="cg-hand-header">
          <strong data-el="hand-title">Elindeki Kartlar</strong>
          <div class="cg-hand-tools">
            <span class="cg-hint-pill" data-el="pile-hint">Yer Boş</span>
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
      const playCardBtn = e.target.closest("[data-play-id]");
      if (playCardBtn && !playCardBtn.disabled) {
        this.cb.onPlay?.(playCardBtn.dataset.playId);
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
      else if (act === "fill-bots") this.cb.onConfig?.("fillBots");
      else if (act === "remove-bots") this.cb.onConfig?.("removeBots");
      else if (act === "next-hand") this.cb.onNextRound?.();
      else if (act === "rematch") this.cb.onRematch?.();
      else if (act === "toggle-2d") {
        const is2d = this.stage3d.toggle2D();
        actBtn.textContent = is2d ? "3D" : "2D";
      }
    });
  }

  update(table, mySocketId, opts = {}) {
    if (!table || this.stage3d?.disposed) return;
    this.table = table;
    this.mySocketId = mySocketId;
    this.isSpectator = Boolean(opts.spectator || table.mySeatIndex < 0);

    if (table.lastPlay?.at && table.lastPlay.at !== this.lastPlayAt) {
      this.lastPlayAt = table.lastPlay.at;
      const lp = table.lastPlay;
      if (lp.pistiType) {
        playPistiFlash(lp.pistiType === "vale");
        this._showPistiBurst(lp.pistiType);
      } else if (lp.capturedCount > 0) {
        playCardCapture();
      } else {
        playCard();
      }
      this._triggerPlayFlight(lp);
    }

    const statKey = `${table.handNumber}:${table.status}`;
    if (statKey !== this.lastStatusKey) {
      this.lastStatusKey = statKey;
      if (table.status === "finished") playWin();
    }

    this._renderHUD();
    this._sync3DScene();
  }

  _showPistiBurst(pistiType) {
    const el = this.els["pisti-flash"];
    if (!el) return;
    el.textContent = pistiType === "vale" ? "🔥 VALE PİŞTİSİ! (+20 PUAN)" : "✨ PİŞTİ! (+10 PUAN)";
    el.className = `cg-pisti-flash ${pistiType === "vale" ? "vale" : ""}`;
    el.hidden = false;
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      if (!this.stage3d?.disposed) el.hidden = true;
    }, 2600);
  }

  _triggerPlayFlight(lp) {
    if (!this.stage3d?.scene || !this.table) return;
    if (this.flyAnim) {
      this.stage3d.cardsGroup.remove(this.flyAnim.mesh);
      this.flyAnim = null;
    }
    const maxSeats = this.table.maxSeats || 2;
    const baseSeat = this.table.mySeatIndex >= 0 ? this.table.mySeatIndex : 0;
    const relFrom = (lp.seatIndex - baseSeat + maxSeats) % maxSeats;
    const anc = getRelativeSeatAnchor(relFrom, maxSeats);
    const m = createCardMesh(lp.card, { faceUp: true, backVariant: "crimson" });
    m.position.set(anc.x * 0.72, CARD_TABLE_Y + 0.14, anc.z * 0.72);
    this.stage3d.cardsGroup.add(m);
    this.flyAnim = {
      mesh: m,
      from: m.position.clone(),
      to: new THREE.Vector3(0, CARD_TABLE_Y + 0.04, 0),
      t: 0,
      dur: 0.3,
    };
  }

  _sync3DScene() {
    const group = this.stage3d?.cardsGroup;
    if (!group || !this.table) return;
    const keepFly = this.flyAnim?.mesh || null;
    for (const child of [...group.children]) {
      if (child !== keepFly) group.remove(child);
    }

    const t = this.table;
    const maxSeats = t.maxSeats || 2;
    const baseSeat = t.mySeatIndex >= 0 ? t.mySeatIndex : 0;

    // 1) Undealt deck shoe stack on left (-0.54, z: -0.05)
    const deckLayers = Math.min(8, Math.ceil((t.deckRemaining || 0) / 6));
    for (let d = 0; d < deckLayers; d += 1) {
      const dm = createCardMesh(null, { faceUp: false, backVariant: "crimson" });
      dm.position.set(-0.56, CARD_TABLE_Y + d * 0.0045, -0.04);
      dm.rotation.y = 0.14;
      group.add(dm);
    }

    // 2) Center pile stack: initial hidden base cards face-down + pileTop face-up!
    const totalPile = t.pileCount || 0;
    if (totalPile > 0) {
      const stackVisualCount = Math.min(10, totalPile);
      for (let idx = 0; idx < stackVisualCount - 1; idx += 1) {
        const sm = createCardMesh(null, { faceUp: false, backVariant: "crimson" });
        sm.position.set(
          Math.sin(idx * 1.9) * 0.018,
          CARD_TABLE_Y + idx * 0.004,
          Math.cos(idx * 2.3) * 0.018,
        );
        sm.rotation.y = (idx - 2) * 0.16;
        group.add(sm);
      }
      if (t.pileTop) {
        const topMesh = createCardMesh(t.pileTop, { faceUp: true, backVariant: "crimson" });
        topMesh.position.set(0, CARD_TABLE_Y + stackVisualCount * 0.0045, 0);
        topMesh.rotation.y = (stackVisualCount % 3 - 1) * 0.08;
        group.add(topMesh);
      }
    }

    // 3) Each seat's opponent hand backs + collected capture stack!
    for (let i = 0; i < maxSeats; i += 1) {
      const s = t.seats[i];
      if (!s) continue;
      const rel = (i - baseSeat + maxSeats) % maxSeats;
      const anc = getRelativeSeatAnchor(rel, maxSeats);
      const tangentX = Math.cos(anc.rotY);
      const tangentZ = -Math.sin(anc.rotY);

      if (rel !== 0 && s.cardCount > 0) {
        for (let k = 0; k < s.cardCount; k += 1) {
          const frac = s.cardCount === 1 ? 0 : (k / (s.cardCount - 1)) * 2 - 1;
          const m = createCardMesh(null, { faceUp: false, backVariant: "crimson" });
          m.position.set(
            anc.x * 0.78 + tangentX * frac * 0.19,
            CARD_TABLE_Y + 0.045 + k * 0.001,
            anc.z * 0.78 + tangentZ * frac * 0.19,
          );
          m.rotation.y = anc.rotY - frac * 0.18;
          m.rotation.x = -0.22;
          group.add(m);
        }
      }

      if (s.capturedCount > 0) {
        const capStacks = Math.min(6, Math.ceil(s.capturedCount / 6));
        for (let c = 0; c < capStacks; c += 1) {
          const cm = createCardMesh(null, { faceUp: false, backVariant: "crimson" });
          cm.position.set(
            anc.x * 0.65 + tangentX * 0.28,
            CARD_TABLE_Y + c * 0.0045,
            anc.z * 0.65 + tangentZ * 0.28,
          );
          cm.rotation.y = anc.rotY + 0.35;
          group.add(cm);
        }
      }
    }
  }

  _renderHUD() {
    const t = this.table;
    if (!t) return;

    this.els["deck-pill"].textContent = `El: ${t.handNumber || 0} · Deste: ${t.deckRemaining || 0} · Yer: ${t.pileCount || 0}`;
    if (t.mode === "2v2") {
      this.els["score-pill"].textContent = `Takım A: ${t.teamScores?.[0] || 0} — Takım B: ${t.teamScores?.[1] || 0} (Hedef: ${t.targetScore})`;
    } else {
      const s0 = t.seats[0]?.score || 0;
      const s1 = t.seats[1]?.score || 0;
      this.els["score-pill"].textContent = `${s0} — ${s1} (Hedef: ${t.targetScore})`;
    }

    const myTurn = !this.isSpectator && t.status === "playing" && t.turnSeatIndex === t.mySeatIndex;
    const turnSeat = t.turnSeatIndex >= 0 ? t.seats[t.turnSeatIndex] : null;
    this.els["turn-pill"].textContent =
      t.status === "waiting"
        ? "Oyuncular Bekleniyor"
        : t.status === "hand_finished"
          ? "El Tamamlandı"
          : t.status === "finished"
            ? "Maç Bitti"
            : myTurn
              ? "🔥 SIRA SENDE!"
              : turnSeat
                ? `Sıra: ${turnSeat.name}`
                : "Oynanıyor";
    this.els["turn-pill"].classList.toggle("is-my-turn", myTurn);
    this.els["action-banner"].textContent = t.lastAction?.text || "Pişti";

    // Seats bar
    const sBar = this.els["seats-bar"];
    sBar.innerHTML = "";
    const now = Date.now();
    t.seats.forEach((s, idx) => {
      const card = document.createElement("div");
      const isTurn = t.status === "playing" && t.turnSeatIndex === idx;
      card.className = `cg-seat-chip ${isTurn ? "is-turn" : ""} ${idx === t.mySeatIndex ? "is-me" : ""}`;
      if (!s) {
        card.innerHTML = `<span class="cg-seat-empty">Koltuk #${idx + 1} · Boş</span>`;
      } else {
        const react = s.reaction && now - s.reaction.at < 4500 ? `<span class="cg-react-pop">${escHtml(s.reaction.emoji)}</span>` : "";
        const teamBadge = t.mode === "2v2" ? ` · Takım ${s.teamIndex === 0 ? "A" : "B"}` : "";
        card.innerHTML = `
          <div class="cg-seat-top">
            <strong>${escHtml(s.name)} ${s.isBot ? "🤖" : ""}</strong>
            ${react}
          </div>
          <small>Puan: ${s.score}${teamBadge} · Aldığı: ${s.capturedCount} kart · Pişti: ${s.pistiCount + s.doublePistiCount}</small>
        `;
      }
      sBar.append(card);
    });

    // Summary overlay for hand_finished / finished
    const sumEl = this.els["summary-card"];
    if ((t.status === "hand_finished" || t.status === "finished") && t.lastHandSummary) {
      const hs = t.lastHandSummary;
      const rows = (hs.teams || hs.players || []).map((r) => `
        <div class="cg-sum-row">
          <strong>${escHtml(r.label || r.name)}</strong>
          <span>${r.cardsCount} kart (Kart:${r.cardPts} + Pişti:${r.pistiPts} + Çoğ:${r.majorityPts}) = <b>+${r.handTotal}</b> → Toplam: <b>${r.matchTotal}</b></span>
        </div>
      `).join("");
      sumEl.innerHTML = `
        <div class="cg-sum-title">${t.status === "finished" ? `🏆 Kazanan: ${escHtml(t.winnerName)}` : `${t.handNumber}. El Skor Özeti`}</div>
        ${rows}
      `;
      sumEl.hidden = false;
    } else {
      sumEl.hidden = true;
    }

    const occupiedCount = t.seats.filter(Boolean).length;
    this.els["lobby-controls"].hidden = !(t.status === "waiting" && !this.isSpectator);
    const startBtn = this.root.querySelector('[data-act="start"]');
    if (startBtn) startBtn.disabled = occupiedCount < t.maxSeats;
    this.els["next-controls"].hidden = !(t.status === "hand_finished" && !this.isSpectator);
    this.els["rematch-controls"].hidden = !(t.status === "finished" && !this.isSpectator);

    // Center pile indicator
    this.els["pile-hint"].textContent = t.pileTop
      ? `Yer Üstü: ${t.pileTop.rank}${t.pileTop.suit === "hearts" ? "♥" : t.pileTop.suit === "diamonds" ? "♦" : t.pileTop.suit === "clubs" ? "♣" : "♠"} (${t.pileCount} kart${t.pileCount === 1 ? " — PİŞTİ FIRSATI!" : ""})`
      : "Yer Boş (Pişti Riski!)";

    // Hand Dock
    const handWrap = this.els["hand-cards"];
    handWrap.innerHTML = "";
    const mySeat = t.mySeatIndex >= 0 ? t.seats[t.mySeatIndex] : null;
    if (this.isSpectator) {
      this.els["hand-title"].textContent = "👁 İzleyici Modu";
    } else if (!mySeat || !mySeat.hand?.length) {
      this.els["hand-title"].textContent = "Elindeki Kartlar (0)";
    } else {
      this.els["hand-title"].textContent = myTurn ? `Sıra Sende — Atmak istediğin karta tıkla` : `Elindeki Kartlar (${mySeat.hand.length})`;
      for (const c of mySeat.hand) {
        const isPistiMatch = t.pileTop && t.pileCount === 1 && c.rank === t.pileTop.rank;
        const isCapture = t.pileTop && (c.rank === t.pileTop.rank || c.rank === "J");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.playId = c.id;
        btn.disabled = !myTurn;
        btn.className = `cg-hand-card ${myTurn ? "playable" : ""} ${isPistiMatch ? "pisti-hint" : isCapture ? "capture-hint" : ""}`;
        const badge = isPistiMatch
          ? `<span class="cg-card-badge gold">PİŞTİ!</span>`
          : isCapture && myTurn
            ? `<span class="cg-card-badge">Alır</span>`
            : "";
        btn.innerHTML = `${badge}${cardHtmlChip(c)}`;
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
        this.flyAnim.t += dt;
        const p = Math.min(1, this.flyAnim.t / this.flyAnim.dur);
        this.flyAnim.mesh.position.lerpVectors(this.flyAnim.from, this.flyAnim.to, p);
        this.flyAnim.mesh.position.y += Math.sin(p * Math.PI) * 0.24;
        if (p >= 1) {
          this.stage3d.cardsGroup.remove(this.flyAnim.mesh);
          this.flyAnim = null;
        }
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
    ctx.fillStyle = "#3f101b";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = "#fef08a";
    ctx.font = "800 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    const topLabel = this.table?.pileTop ? `Yer Üstü: ${this.table.pileTop.rank}` : "Yer Boş";
    ctx.fillText(`${topLabel} · ${this.table?.lastAction?.text || "Pişti (2D)"}`, w * 0.5, h * 0.5);
  }

  dispose() {
    clearTimeout(this._flashTimer);
    this.stage3d?.dispose?.();
    this.container.innerHTML = "";
  }
}
