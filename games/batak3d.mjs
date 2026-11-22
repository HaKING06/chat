"use strict";

import * as THREE from "../vendor/three/three.module.js";
import {
  CARD_TABLE_Y,
  CardTableStage3D,
  SUIT_NAMES_TR,
  SUIT_SYMBOLS,
  cardHtmlChip,
  createCardMesh,
  escHtml,
  getRelativeSeatAnchor,
  isRedSuit,
} from "./card3d_common.mjs";
import {
  playCard,
  playCardCapture,
  playTrumpCut,
  playWin,
} from "./sfx.mjs";

const REACTIONS = ["🔥", "👏", "🤔", "😱", "♠️", "🍀"];

export class BatakArena {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.cb = callbacks;
    this.table = null;
    this.mySocketId = null;
    this.isSpectator = false;
    this.lastTrickKey = "";
    this.lastCompletedAt = 0;
    this.lastStatusKey = "";
    this.flyAnim = null;

    this._buildDom();
    this.stage3d = new CardTableStage3D(
      this.els.canvas3d,
      this.els.canvas2d,
      this.stageEl,
      {
        tableTitle: "BATAK VIP",
        tableSubtitle: "RENK TAKİBİ · BÜYÜTME · KOZ ÇAKMA",
        baizeColors: ["#173669", "#0f2247", "#09142c"],
        bgColor: 0x070d1a,
        accentLight: 0x38bdf8,
      },
    );
    this._startLoop();
  }

  _buildDom() {
    this.container.innerHTML = "";
    this.root = document.createElement("div");
    this.root.className = "card-arena batak-arena";

    this.root.innerHTML = `
      <div class="card-topbar">
        <div class="card-top-left">
          <span class="cg-title-pill batak">♠ Batak</span>
          <span class="cg-meta-pill" data-el="hand-pill">1 / 5 El</span>
          <span class="cg-meta-pill gold" data-el="trump-pill">Koz: Bekleniyor</span>
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
          <div class="cg-action-banner" data-el="action-banner">Batak masası açıldı</div>
          <div class="cg-last-trick-pill" data-el="last-trick-pill" hidden></div>
          <div class="cg-summary-card" data-el="summary-card" hidden></div>
        </div>
      </div>

      <div class="cg-controls-dock">
        <div class="cg-bid-bar" data-el="bid-bar" hidden></div>
        <div class="cg-trump-bar" data-el="trump-bar" hidden>
          <span class="cg-bid-label">👑 İhaleyi kazandın! Koz rengini seç:</span>
          <div class="cg-trump-choices">
            <button type="button" class="cg-trump-btn" data-trump="spades">♠ Maça</button>
            <button type="button" class="cg-trump-btn red" data-trump="hearts">♥ Kupa</button>
            <button type="button" class="cg-trump-btn red" data-trump="diamonds">♦ Karo</button>
            <button type="button" class="cg-trump-btn" data-trump="clubs">♣ Sinek</button>
          </div>
        </div>
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
            <div class="cg-react-row">
              ${REACTIONS.map((r) => `<button type="button" class="cg-react-btn" data-react="${r}">${r}</button>`).join("")}
            </div>
          </div>
        </div>
        <div class="cg-hand-cards compact" data-el="hand-cards"></div>
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
      const bidBtn = e.target.closest("[data-bid]");
      if (bidBtn && !bidBtn.disabled) {
        this.cb.onBid?.(Number(bidBtn.dataset.bid));
        return;
      }
      const trumpBtn = e.target.closest("[data-trump]");
      if (trumpBtn) {
        this.cb.onChooseTrump?.(trumpBtn.dataset.trump);
        return;
      }
      const cardBtn = e.target.closest("[data-play-id]");
      if (cardBtn && !cardBtn.disabled) {
        this.cb.onPlay?.(cardBtn.dataset.playId);
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
      else if (act === "next-hand") this.cb.onNextHand?.();
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

    const trickKey = (table.trick || []).map((x) => `${x.seatIndex}:${x.card.id}`).join(",");
    if (trickKey !== this.lastTrickKey) {
      this.lastTrickKey = trickKey;
      const latest = table.trick?.[table.trick.length - 1];
      if (latest) {
        if (latest.card.suit === table.trumpSuit && table.trickLeadSuit !== table.trumpSuit) {
          playTrumpCut();
        } else {
          playCard();
        }
        this._triggerTrickFlight(latest);
      }
    }

    if (table.lastCompletedTrick?.at && table.lastCompletedTrick.at !== this.lastCompletedAt) {
      this.lastCompletedAt = table.lastCompletedTrick.at;
      playCardCapture();
    }

    const statKey = `${table.handNumber}:${table.status}`;
    if (statKey !== this.lastStatusKey) {
      this.lastStatusKey = statKey;
      if (table.status === "finished") playWin();
    }

    this._renderHUD();
    this._sync3DScene();
  }

  _triggerTrickFlight(entry) {
    if (!this.stage3d?.scene || !this.table) return;
    if (this.flyAnim) {
      this.stage3d.cardsGroup.remove(this.flyAnim.mesh);
      this.flyAnim = null;
    }
    const baseSeat = this.table.mySeatIndex >= 0 ? this.table.mySeatIndex : 0;
    const rel = (entry.seatIndex - baseSeat + 4) % 4;
    const anc = getRelativeSeatAnchor(rel, 4);
    const mesh = createCardMesh(entry.card, { faceUp: true, backVariant: "navy" });
    mesh.position.set(anc.x * 0.72, CARD_TABLE_Y + 0.14, anc.z * 0.72);
    this.stage3d.cardsGroup.add(mesh);
    this.flyAnim = {
      mesh,
      from: mesh.position.clone(),
      to: new THREE.Vector3(anc.x * 0.24, CARD_TABLE_Y + 0.04, anc.z * 0.24),
      t: 0,
      dur: 0.28,
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
    const baseSeat = t.mySeatIndex >= 0 ? t.mySeatIndex : 0;

    // 1) Center Trick cards placed cleanly facing each seat's quadrant
    (t.trick || []).forEach((entry, idx) => {
      const rel = (entry.seatIndex - baseSeat + 4) % 4;
      const anc = getRelativeSeatAnchor(rel, 4);
      const m = createCardMesh(entry.card, { faceUp: true, backVariant: "navy" });
      m.position.set(anc.x * 0.25, CARD_TABLE_Y + 0.012 + idx * 0.004, anc.z * 0.25);
      m.rotation.y = anc.rotY;
      group.add(m);
    });

    // 2) Opponent fanned card backs around the octagonal baize
    for (let i = 0; i < 4; i += 1) {
      const s = t.seats[i];
      if (!s || s.cardCount <= 0) continue;
      const rel = (i - baseSeat + 4) % 4;
      if (rel === 0) continue;
      const anc = getRelativeSeatAnchor(rel, 4);
      const tangentX = Math.cos(anc.rotY);
      const tangentZ = -Math.sin(anc.rotY);
      const visCount = Math.min(13, s.cardCount);
      const span = Math.min(0.68, visCount * 0.055);

      for (let k = 0; k < visCount; k += 1) {
        const frac = visCount === 1 ? 0 : (k / (visCount - 1)) * 2 - 1;
        const m = createCardMesh(null, { faceUp: false, backVariant: "navy" });
        m.position.set(
          anc.x * 0.8 + tangentX * frac * span * 0.5,
          CARD_TABLE_Y + 0.045 + k * 0.001,
          anc.z * 0.8 + tangentZ * frac * span * 0.5,
        );
        m.rotation.y = anc.rotY - frac * 0.16;
        m.rotation.x = -0.22;
        group.add(m);
      }
    }
  }

  _renderHUD() {
    const t = this.table;
    if (!t) return;

    this.els["hand-pill"].textContent = `${t.handNumber || 0} / ${t.targetHands} El · ${t.trickNumber ? `${t.trickNumber}. Ortadaki El` : "Hazırlık"}`;
    const trumpSym = t.trumpSuit ? SUIT_SYMBOLS[t.trumpSuit] : "";
    const trumpName = t.trumpSuit ? SUIT_NAMES_TR[t.trumpSuit] : "Bekleniyor";
    const bidderName = t.highestBidderSeat >= 0 ? t.seats[t.highestBidderSeat]?.name : null;
    this.els["trump-pill"].textContent =
      t.variant === "kozmaca"
        ? "♠ Koz Maça"
        : t.trumpSuit
          ? `${trumpSym} Koz: ${trumpName}${bidderName ? ` (${bidderName}: ${t.highestBid})` : ""}`
          : t.highestBid > 0 && bidderName
            ? `İhale: ${bidderName} (${t.highestBid})`
            : "Koz: İhale Açık";
    this.els["trump-pill"].classList.toggle("red-suit", isRedSuit(t.trumpSuit));

    const myTurn = !this.isSpectator && t.turnSeatIndex === t.mySeatIndex;
    const turnSeat = t.turnSeatIndex >= 0 ? t.seats[t.turnSeatIndex] : null;
    this.els["turn-pill"].textContent =
      t.status === "waiting"
        ? "Oyuncular Bekleniyor"
        : t.status === "bidding"
          ? myTurn
            ? "🔥 SIRA SENDE — TEKLİF VER!"
            : `İhale Sırası: ${turnSeat?.name || "?"}`
          : t.status === "choosingTrump"
            ? myTurn
              ? "👑 KOZ RENGİNİ SEÇ!"
              : `${turnSeat?.name || "?"} Koz Seçiyor`
            : t.status === "hand_finished"
              ? "El Puanlandı"
              : t.status === "finished"
                ? "Maç Bitti"
                : myTurn
                  ? "🔥 SIRA SENDE — KART AT!"
                  : `Sıra: ${turnSeat?.name || "?"}`;
    this.els["turn-pill"].classList.toggle("is-my-turn", myTurn);
    this.els["action-banner"].textContent = t.lastAction?.text || "Batak";

    // Seats bar
    const sBar = this.els["seats-bar"];
    sBar.innerHTML = "";
    const now = Date.now();
    t.seats.forEach((s, idx) => {
      const card = document.createElement("div");
      const isTurn = !["waiting", "hand_finished", "finished"].includes(t.status) && t.turnSeatIndex === idx;
      card.className = `cg-seat-chip ${isTurn ? "is-turn" : ""} ${idx === t.mySeatIndex ? "is-me" : ""}`;
      if (!s) {
        card.innerHTML = `<span class="cg-seat-empty">Koltuk #${idx + 1} · Boş</span>`;
      } else {
        const react = s.reaction && now - s.reaction.at < 4500 ? `<span class="cg-react-pop">${escHtml(s.reaction.emoji)}</span>` : "";
        const bidStr =
          s.bid === 0
            ? "Pas"
            : Number.isInteger(s.bid)
              ? `Hedef:${s.bid}`
              : t.highestBidderSeat === idx
                ? `İhale:${t.highestBid}`
                : "";
        card.innerHTML = `
          <div class="cg-seat-top">
            <strong>${escHtml(s.name)} ${s.isBot ? "🤖" : ""}</strong>
            ${react}
          </div>
          <small>Puan: <b>${s.score}</b> · El: ${s.tricksWon}${bidStr ? ` (${bidStr})` : ""}</small>
        `;
      }
      sBar.append(card);
    });

    // Last Completed Trick Pill
    const ltp = this.els["last-trick-pill"];
    if (t.lastCompletedTrick && t.status === "playing") {
      const wName = t.seats[t.lastCompletedTrick.winnerSeatIndex]?.name || "?";
      const cardsTxt = t.lastCompletedTrick.cards
        .map((c) => `${c.card.rank}${SUIT_SYMBOLS[c.card.suit] || ""}`)
        .join(" · ");
      ltp.textContent = `Son El (${wName} aldı): ${cardsTxt}`;
      ltp.hidden = false;
    } else {
      ltp.hidden = true;
    }

    // Score summary card for hand_finished / finished
    const sumEl = this.els["summary-card"];
    if ((t.status === "hand_finished" || t.status === "finished") && t.lastHandSummary) {
      const hs = t.lastHandSummary;
      const rows = hs.rows.map((r) => `
        <div class="cg-sum-row">
          <strong>${escHtml(r.name)} ${r.isBidder ? "👑" : ""}</strong>
          <span>${r.bid ? `Hedef ${r.bid} / ` : ""}Aldığı: ${r.tricksWon} el → <b>${r.delta >= 0 ? `+${r.delta}` : r.delta}</b> (Toplam: <b>${r.totalScore}</b>)</span>
        </div>
      `).join("");
      sumEl.innerHTML = `
        <div class="cg-sum-title">${t.status === "finished" ? `🏆 Batak Şampiyonu: ${escHtml(t.winnerName)}` : `${hs.handNumber}. El Sonucu (${SUIT_SYMBOLS[hs.trumpSuit] || ""} Koz)`}</div>
        ${rows}
      `;
      sumEl.hidden = false;
    } else {
      sumEl.hidden = true;
    }

    const occupiedCount = t.seats.filter(Boolean).length;
    this.els["lobby-controls"].hidden = !(t.status === "waiting" && !this.isSpectator);
    const startBtn = this.root.querySelector('[data-act="start"]');
    if (startBtn) startBtn.disabled = occupiedCount < 4;
    this.els["next-controls"].hidden = !(t.status === "hand_finished" && !this.isSpectator);
    this.els["rematch-controls"].hidden = !(t.status === "finished" && !this.isSpectator);

    // Bid Bar
    const bidBar = this.els["bid-bar"];
    if (t.status === "bidding" && myTurn) {
      const minB = t.minBid || (t.variant === "kozmaca" ? 1 : 5);
      const btns = [];
      if (t.variant !== "kozmaca") {
        btns.push(`<button type="button" class="cg-bid-btn pass" data-bid="0">Pas</button>`);
      }
      for (let b = minB; b <= 13; b += 1) {
        btns.push(`<button type="button" class="cg-bid-btn" data-bid="${b}">${b}</button>`);
      }
      bidBar.innerHTML = `
        <span class="cg-bid-label">${t.variant === "kozmaca" ? "Kaç el alacaksın?" : `İhale Teklifi (En az ${minB}):`}</span>
        <div class="cg-bid-choices">${btns.join("")}</div>
      `;
      bidBar.hidden = false;
    } else {
      bidBar.hidden = true;
    }

    // Trump Picker Bar
    this.els["trump-bar"].hidden = !(
      t.status === "choosingTrump" &&
      !this.isSpectator &&
      t.highestBidderSeat === t.mySeatIndex
    );

    // Player 13-Card Hand with Legal Highlighting
    const handWrap = this.els["hand-cards"];
    handWrap.innerHTML = "";
    const mySeat = t.mySeatIndex >= 0 ? t.seats[t.mySeatIndex] : null;
    const legalSet = new Set(t.myLegalCardIds || []);
    if (this.isSpectator) {
      this.els["hand-title"].textContent = "👁 İzleyici Modu (Eller Gizli)";
    } else if (!mySeat || !mySeat.hand?.length) {
      this.els["hand-title"].textContent = "Elindeki Kartlar (0)";
    } else {
      const canPlayNow = t.status === "playing" && myTurn;
      this.els["hand-title"].textContent = canPlayNow
        ? `Sıra Sende — Kurallı ${legalSet.size} kart oynanabilir`
        : `Elindeki Kartlar (${mySeat.hand.length})`;
      for (const c of mySeat.hand) {
        const legal = canPlayNow && legalSet.has(c.id);
        const isTrump = t.trumpSuit && c.suit === t.trumpSuit;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.playId = c.id;
        btn.disabled = !legal;
        btn.className = `cg-hand-card compact ${legal ? "playable" : canPlayNow ? "locked" : ""} ${isTrump ? "is-trump" : ""}`;
        btn.title = canPlayNow && !legal
          ? "Renk takibi, büyütme veya koz çakma kuralı gereği bu kart şu an oynanamaz."
          : isTrump
            ? "Koz kartı"
            : "";
        btn.innerHTML = `${isTrump ? `<span class="cg-card-badge trump">KOZ</span>` : ""}${cardHtmlChip(c)}`;
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
        this.flyAnim.mesh.position.y += Math.sin(p * Math.PI) * 0.22;
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
    ctx.fillStyle = "#0e1d3d";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#e3b857";
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = "#fef08a";
    ctx.font = "800 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(this.table?.lastAction?.text || "Batak VIP (2D)", w * 0.5, h * 0.5);
  }

  dispose() {
    this.stage3d?.dispose?.();
    this.container.innerHTML = "";
  }
}
