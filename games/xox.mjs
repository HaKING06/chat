import { playDraw, playMove, playWin } from "./sfx.mjs";

const DIFFICULTY_LABELS = {
  easy: "Kolay Bot",
  medium: "Orta Bot",
  hard: "Yenilmez Bot",
};

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function makeMarkSvg(symbol) {
  const svg = svgEl("svg", {
    viewBox: "0 0 64 64",
    class: `xox-svg xox-svg-${symbol.toLowerCase()}`,
    "aria-hidden": "true",
  });
  if (symbol === "X") {
    svg.append(
      svgEl("line", {
        x1: 15,
        y1: 15,
        x2: 49,
        y2: 49,
        pathLength: 100,
        "stroke-width": 7,
        "stroke-linecap": "round",
      }),
      svgEl("line", {
        x1: 49,
        y1: 15,
        x2: 15,
        y2: 49,
        pathLength: 100,
        "stroke-width": 7,
        "stroke-linecap": "round",
      }),
    );
  } else {
    svg.append(
      svgEl("circle", {
        cx: 32,
        cy: 32,
        r: 17.5,
        pathLength: 100,
        fill: "none",
        "stroke-width": 7,
        "stroke-linecap": "round",
      }),
    );
  }
  return svg;
}

function winLineCoords(line) {
  if (!Array.isArray(line) || line.length !== 3) return null;
  const col = (i) => ((i % 3) * 100) + 50;
  const row = (i) => (Math.floor(i / 3) * 100) + 50;
  return {
    x1: col(line[0]),
    y1: row(line[0]),
    x2: col(line[2]),
    y2: row(line[2]),
  };
}

let lastSnapshot = "";
let prevRoundKey = "";
let prevBoard = Array(9).fill(null);
let prevWinPlayed = false;

export function resetXoxSoundState() {
  lastSnapshot = "";
  prevRoundKey = "";
  prevBoard = Array(9).fill(null);
  prevWinPlayed = false;
}

export function renderXoxView({
  game,
  mySocketId,
  containers,
  handlers,
}) {
  const {
    playersRow,
    metaRow,
    statusEl,
    rematchBox,
    boardWrap,
    addBotBtn,
    rematchBtn,
  } = containers;

  const filled = game.board.filter(Boolean).length;
  const snapKey = `${game.id}:${game.round}:${game.status}:${filled}:${game.winner || ""}`;
  if (lastSnapshot && snapKey !== lastSnapshot) {
    if (game.status === "finished") {
      if (game.winner === "draw" || game.winner === "left") playDraw();
      else playWin();
    } else if (filled > 0) {
      playMove(game.turn === "X" ? "O" : "X");
    }
  }
  lastSnapshot = snapKey;

  const round = game.round || 1;
  const starterIndex = game.starterIndex || 0;
  const starter = game.players[starterIndex] || game.players[0];
  const nextStarter = game.players[starterIndex === 0 ? 1 : 0] || game.players[0];
  const scores = game.scores || { X: 0, O: 0, draws: 0 };

  if (metaRow) {
    metaRow.replaceChildren();
    const modeBadge = document.createElement("span");
    modeBadge.className =
      "tag " + (game.mode === "infinite" ? "xox-infinite-tag" : "");
    modeBadge.textContent =
      game.mode === "infinite" ? "SONSUZ 3 TAŞ · BERABERESİZ" : "KLASİK 3×3";
    const roundBadge = document.createElement("span");
    roundBadge.className = "tag xox-round-tag";
    roundBadge.textContent = `${round}. EL`;
    const starterBadge = document.createElement("span");
    starterBadge.className = "xox-starter-pill";
    starterBadge.textContent = `İlk başlayan: ${starter ? starter.name : "×"}`;
    const scorePill = document.createElement("span");
    scorePill.className = "xox-score-pill";
    scorePill.textContent =
      game.mode === "infinite"
        ? `× ${scores.X} · ${scores.O} ○`
        : `× ${scores.X} · Berabere ${scores.draws} · ${scores.O} ○`;
    metaRow.append(modeBadge, roundBadge, starterBadge, scorePill);
    if (game.bot) {
      const diffBadge = document.createElement("span");
      diffBadge.className = "tag";
      diffBadge.textContent = DIFFICULTY_LABELS[game.difficulty || "hard"];
      metaRow.append(diffBadge);
    }
  }

  playersRow.replaceChildren();
  for (let index = 0; index < 2; index++) {
    const player = game.players[index];
    const node = document.createElement("div");
    const isTurn =
      game.status === "playing" && player && game.turn === player.symbol;
    node.className = "game-player" + (isTurn ? " is-turn" : "");
    const mark = document.createElement("span");
    mark.textContent = index ? "○" : "×";
    const label = document.createElement("strong");
    label.textContent = player
      ? player.name + (player.id === mySocketId ? " · sen" : "")
      : "Oyuncu bekleniyor…";
    const pts = document.createElement("small");
    pts.className = "player-score";
    pts.textContent = `${index ? scores.O : scores.X} puan`;
    node.append(mark, label, pts);
    playersRow.append(node);
  }

  const mine = game.players.find((p) => p.id === mySocketId);
  let status;
  if (game.status === "waiting") {
    status = "Bir arkadaşın bekleniyor. Odan aşağıdaki lobide listelendi.";
  } else if (game.status === "finished") {
    if (game.winner === "draw") status = "Berabere! Başa baş bir el oldu.";
    else if (game.winner === "left")
      status = "Rakip oyundan ayrıldı. Yeni bir oda açabilirsin.";
    else if (game.winner === mine?.symbol) status = "Kazandın! Müthiş hamle.";
    else {
      const winnerName =
        game.players.find((p) => p.symbol === game.winner)?.name || "Rakip";
      status = `${winnerName} bu eli kazandı.`;
    }
  } else {
    status =
      game.turn === mine?.symbol
        ? `Sıra sende (${mine.symbol}). Hamleni yap.`
        : `${game.players.find((p) => p.symbol === game.turn)?.name || "Rakip"} düşünüyor…`;
  }
  statusEl.textContent = status;
  statusEl.className =
    "game-status" +
    (game.status === "playing" && game.turn === mine?.symbol ? " my-turn" : "");

  // Inline 1v1 Rematch Prompt / Acceptance Banner
  rematchBox.replaceChildren();
  rematchBox.hidden = true;
  if (game.status === "finished" && !game.bot && game.rematch) {
    rematchBox.hidden = false;
    if (game.rematch.state === "pending") {
      if (game.rematch.toId === mySocketId) {
        const card = document.createElement("div");
        card.className = "rematch-card incoming";
        const title = document.createElement("strong");
        title.textContent = `${game.rematch.fromName} 1v1 Tekrar Oyna istiyor!`;
        const hint = document.createElement("p");
        hint.textContent = `Kabul edersen ${round + 1}. el hemen başlayacak · Sıradaki ilk başlayan: ${nextStarter.id === mySocketId ? `Sen (${nextStarter.symbol})` : nextStarter.name
          }`;
        const actions = document.createElement("div");
        actions.className = "rematch-actions";
        const acceptBtn = document.createElement("button");
        acceptBtn.type = "button";
        acceptBtn.className = "button primary";
        acceptBtn.textContent = "Kabul et & Başla ✓";
        acceptBtn.addEventListener("click", () => handlers.onRematchRespond(true));
        const declineBtn = document.createElement("button");
        declineBtn.type = "button";
        declineBtn.className = "button secondary";
        declineBtn.textContent = "Reddet ×";
        declineBtn.addEventListener("click", () => handlers.onRematchRespond(false));
        actions.append(acceptBtn, declineBtn);
        card.append(title, hint, actions);
        rematchBox.append(card);
      } else {
        const card = document.createElement("div");
        card.className = "rematch-card waiting";
        const msg = document.createElement("span");
        msg.textContent = `${game.rematch.toName} oyuncusuna tekrar oyun isteği gönderildi · Onay bekleniyor…`;
        card.append(msg);
        rematchBox.append(card);
      }
    } else if (game.rematch.state === "declined") {
      const card = document.createElement("div");
      card.className = "rematch-card declined";
      const msg = document.createElement("span");
      msg.textContent = `${game.rematch.respondedBy || "Rakip"} tekrar oyun isteğini reddetti.`;
      card.append(msg);
      rematchBox.append(card);
    }
  }

  // Tactile 3D XOX Board + Winning Strike Overlay
  boardWrap.replaceChildren();
  const canClickBoard =
    game.status === "playing" && game.turn === mine?.symbol;
  if (mine?.symbol) boardWrap.dataset.myMark = mine.symbol;
  boardWrap.classList.toggle("is-my-turn", canClickBoard);

  const roundKey = `${game.id}:${game.round || 1}`;
  if (roundKey !== prevRoundKey) {
    prevRoundKey = roundKey;
    prevBoard = Array(9).fill(null);
    prevWinPlayed = false;
  }

  game.board.forEach((value, index) => {
    const isNewMark = !!value && prevBoard[index] !== value;
    const isVanishing =
      game.mode === "infinite" &&
      game.status === "playing" &&
      game.vanishIndex === index &&
      !!value;
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className =
      "game-cell" +
      (value ? " is-filled " + value.toLowerCase() : "") +
      (isNewMark ? " is-new" : "") +
      (isVanishing ? " is-fading" : "") +
      (game.winningLine?.includes(index) ? " win" : "");
    cell.setAttribute(
      "aria-label",
      `${Math.floor(index / 3) + 1}. satır, ${(index % 3) + 1}. sütun: ${value || "boş"}${isVanishing ? " (bir sonraki hamlede silinecek)" : ""}`,
    );
    cell.disabled = !!value || !canClickBoard;
    if (value) {
      cell.append(makeMarkSvg(value));
      if (isVanishing) {
        const hint = document.createElement("span");
        hint.className = "cell-vanish-badge";
        hint.textContent = "SONRAKİ GİDER";
        cell.append(hint);
      }
    } else if (canClickBoard) {
      const ghost = document.createElement("span");
      ghost.className = "cell-ghost";
      ghost.textContent = mine.symbol === "X" ? "×" : "○";
      cell.append(ghost);
    }
    cell.addEventListener("click", () => handlers.onMove(index));
    boardWrap.append(cell);
  });
  prevBoard = [...game.board];

  const line = winLineCoords(game.winningLine);
  if (line) {
    const strike = svgEl("svg", {
      viewBox: "0 0 300 300",
      class:
        "xox-strike-overlay" +
        (game.winner === "O" ? " o" : "") +
        (!prevWinPlayed ? " is-new" : ""),
      "aria-hidden": "true",
    });
    prevWinPlayed = true;
    strike.append(
      svgEl("line", {
        x1: line.x1,
        y1: line.y1,
        x2: line.x2,
        y2: line.y2,
        pathLength: 100,
      }),
    );
    boardWrap.append(strike);
  }

  addBotBtn.hidden = game.status !== "waiting";

  const leftMatch = game.status === "finished" && game.winner === "left";
  const alreadyWaitingMyReq =
    game.rematch?.state === "pending" && game.rematch?.fromId === mySocketId;
  const incomingForMe =
    game.rematch?.state === "pending" && game.rematch?.toId === mySocketId;
  rematchBtn.hidden = game.status !== "finished" || incomingForMe;
  rematchBtn.disabled = alreadyWaitingMyReq;
  if (leftMatch) {
    rematchBtn.textContent = "Yeni oda oluştur ↗";
  } else if (alreadyWaitingMyReq) {
    rematchBtn.textContent = "Onay bekleniyor…";
  } else if (game.bot) {
    rematchBtn.textContent = `Tekrar oyna (${nextStarter.id === "bot" ? "Bot başlar" : "Sen başlarsın"}) ↻`;
  } else {
    rematchBtn.textContent = `Tekrar oyna isteği gönder (${nextStarter.name} başlar) ↻`;
  }
}
