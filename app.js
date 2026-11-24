"use strict";
import { isSfxMuted, playMention, toggleSfxMute } from "./games/sfx.mjs";
import { renderXoxView, resetXoxSoundState } from "./games/xox.mjs";
import { VoiceClient } from "./voice.mjs";

(() => {
  const $ = (id) => document.getElementById(id);
  const DEFAULT_TITLE = document.title;
  const channels = {
    general: ["genel-sohbet", "Günün nasıl geçiyor? Sohbete bir yerden katıl."],
    code: [
      "kod-paylaşımı",
      "Küçük bir fonksiyon, büyük bir çözüm. Kodunu toplulukla paylaş.",
    ],
  };
  const roles = { user: "Topluluk üyesi", mod: "Moderatör", admin: "Kurucu" };
  const rank = { user: 0, mod: 1, admin: 2 };
  const quickReactions = ["👍", "❤️", "🔥", "😂", "🎉", "😮", "💯", "👏"];
  let bjModulePromise = null;
  let bjArena = null;
  let diceModulePromise = null;
  let diceArena = null;
  let chessModulePromise = null;
  let chessArena = null;
  let okeyModulePromise = null;
  let okeyArena = null;
  let tavlaModulePromise = null;
  let tavlaArena = null;
  let rouletteModulePromise = null;
  let rouletteArena = null;
  let slotModulePromise = null;
  let slotArena = null;
  let papazModulePromise = null;
  let papazArena = null;
  let pistiModulePromise = null;
  let pistiArena = null;
  let batakModulePromise = null;
  let batakArena = null;
  let blofModulePromise = null;
  let blofArena = null;
  let emojiModulePromise = null;
  const PLAYER_ID_KEY = "haking.playerId";
  const ACTIVE_CHESS_KEY = "haking.chess.active";
  const ACTIVE_TAVLA_KEY = "haking.tavla.active";
  const SESSION_TOKEN_KEY = "haking.sessionToken";
  function getSavedSessionToken() {
    try {
      const tok = localStorage.getItem(SESSION_TOKEN_KEY);
      return tok && /^[a-zA-Z0-9_-]{16,96}$/.test(tok) ? tok : "";
    } catch {
      return "";
    }
  }
  function saveSessionToken(token) {
    if (!token || typeof token !== "string") return;
    try {
      localStorage.setItem(SESSION_TOKEN_KEY, token);
    } catch { }
  }
  function clearSavedSessionToken() {
    try {
      localStorage.removeItem(SESSION_TOKEN_KEY);
    } catch { }
  }
  function createPlayerUuid() {
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
      if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      }
    } catch { }
    return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
  function getOrCreatePlayerId() {
    try {
      const existing = localStorage.getItem(PLAYER_ID_KEY);
      if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) return existing;
      const fresh = createPlayerUuid();
      localStorage.setItem(PLAYER_ID_KEY, fresh);
      return fresh;
    } catch {
      return createPlayerUuid();
    }
  }
  function getActiveChessSession() {
    try {
      const raw = localStorage.getItem(ACTIVE_CHESS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !parsed.roomId) return null;
      if (parsed.playerId && parsed.playerId !== state.playerId) return null;
      if (parsed.savedAt && Date.now() - parsed.savedAt > 30 * 60 * 1000) {
        localStorage.removeItem(ACTIVE_CHESS_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
  function clearActiveChessSession() {
    if (typeof state !== "undefined") state.lastChessTableId = "";
    try {
      localStorage.removeItem(ACTIVE_CHESS_KEY);
    } catch { }
  }
  function syncActiveChessSession(table) {
    if (!table) return;
    if (table.status === "finished") {
      clearActiveChessSession();
      return;
    }
    const mySeat = table.seats?.find(
      (s) => s && !s.isBot && s.userId === state.socket?.id,
    );
    if (mySeat && (table.status === "playing" || table.status === "waiting")) {
      state.lastChessTableId = table.id;
      try {
        localStorage.setItem(
          ACTIVE_CHESS_KEY,
          JSON.stringify({
            roomId: table.id,
            gameId: table.id,
            playerId: state.playerId,
            name: state.user?.name || mySeat.name,
            role: state.user?.role || "user",
            color: mySeat.color,
            savedAt: Date.now(),
          }),
        );
      } catch { }
    }
  }
  function getActiveTavlaSession() {
    try {
      const raw = localStorage.getItem(ACTIVE_TAVLA_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !parsed.roomId) return null;
      if (parsed.playerId && parsed.playerId !== state.playerId) return null;
      if (parsed.savedAt && Date.now() - parsed.savedAt > 30 * 60 * 1000) {
        localStorage.removeItem(ACTIVE_TAVLA_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
  function clearActiveTavlaSession() {
    if (typeof state !== "undefined") state.lastTavlaTableId = "";
    try {
      localStorage.removeItem(ACTIVE_TAVLA_KEY);
    } catch { }
  }
  function syncActiveTavlaSession(table) {
    if (!table) return;
    if (table.status === "finished") {
      clearActiveTavlaSession();
      return;
    }
    const mySeat = table.seats?.find(
      (s) => s && !s.isBot && s.userId === state.socket?.id,
    );
    if (mySeat && ["playing", "hand_finished", "waiting"].includes(table.status)) {
      state.lastTavlaTableId = table.id;
      try {
        localStorage.setItem(
          ACTIVE_TAVLA_KEY,
          JSON.stringify({
            roomId: table.id,
            gameId: table.id,
            playerId: state.playerId,
            name: state.user?.name || mySeat.name,
            role: state.user?.role || "user",
            color: mySeat.color,
            savedAt: Date.now(),
          }),
        );
      } catch { }
    }
  }
  const state = {
    socket: null,
    playerId: getOrCreatePlayerId(),
    user: null,
    credentials: null,
    reconnectingChess: false,
    lastChessTableId: "",
    reconnectingTavla: false,
    lastTavlaTableId: "",
    loggingOut: false,
    hasJoinedOnce: false,
    channel: "general",
    view: "chat",
    messages: new Map(),
    users: [],
    games: [],
    game: null,
    table: null,
    diceTable: null,
    chessTable: null,
    okeyTable: null,
    tavlaTable: null,
    rouletteTable: null,
    slotHall: null,
    papazTable: null,
    pistiTable: null,
    batakTable: null,
    blofTable: null,
    voiceRooms: [],
    tournaments: [],
    lobbyFilter: "all",
    lobbySearch: "",
    miniChatOpen: false,
    miniChatChannel: "general",
    unreadMini: 0,
    unreadMentions: 0,
    unreadTitles: 0,
    unreadByChannel: { general: 0, code: 0 },
    channelState: {
      general: { locked: false, slowmodeSec: 0 },
      code: { locked: false, slowmodeSec: 0 },
    },
    announcement: null,
    reply: null,
    editing: null,
    codeOnly: false,
    pins: false,
    showAll: false,
    typing: new Map(),
    joining: false,
    authAttempt: 0,
    stopped: false,
    pendingGame: false,
  };
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, cls, handler, label) {
    const node = el("button", cls, text);
    node.type = "button";
    if (label) node.setAttribute("aria-label", label);
    node.addEventListener("click", handler);
    return node;
  }
  function toast(message, error = false) {
    const node = el("div", "toast" + (error ? " error" : ""), message);
    $("toast-stack").append(node);
    setTimeout(() => node.remove(), 5500);
    while ($("toast-stack").children.length > 4)
      $("toast-stack").firstChild.remove();
  }
  function showDialog(id) {
    const d = $(id);
    if (!d.open) d.showModal();
  }
  function openLogin() {
    $("login-error").textContent = "";
    showDialog("login-dialog");
  }
  function requireUser() {
    if (state.user && state.socket?.connected) return true;
    openLogin();
    return false;
  }
  function emit(event, data = {}) {
    return new Promise((resolve) => {
      if (!state.socket?.connected)
        return resolve({
          success: false,
          message: "Bağlantı yok. Yeniden bağlanmayı bekle.",
        });
      state.socket.timeout(12000).emit(event, data, (err, result) =>
        resolve(
          err
            ? {
              success: false,
              message: "Sunucu yanıt vermedi. Tekrar dene.",
            }
            : result || {
              success: false,
              message: "Geçersiz sunucu yanıtı.",
            },
        ),
      );
    });
  }
  async function act(event, data) {
    const result = await emit(event, data);
    if (!result.success) toast(result.message, true);
    return result;
  }
  function connection(status) {
    const box = $("connection-status");
    box.className = "connection " + status;
    box.lastElementChild.textContent =
      status === "online"
        ? "Bağlı"
        : status === "connecting"
          ? "Bağlanıyor"
          : "Çevrimdışı";
  }
  function avatar(name) {
    let hash = 0;
    for (const c of name) hash = (hash + c.codePointAt(0)) % 5;
    return el(
      "div",
      "avatar color-" + hash,
      name
        .trim()
        .split(/\s+/)
        .map((w) => Array.from(w)[0])
        .slice(0, 2)
        .join("")
        .toLocaleUpperCase("tr"),
    );
  }
  function renderChannelNotices() {
    const annBox = $("announcement-banner");
    const noticeBox = $("channel-notice");
    const ann = state.announcement;
    if (annBox) {
      const showAnn =
        !!ann && (ann.channel === "all" || ann.channel === state.channel);
      annBox.hidden = !showAnn;
      annBox.replaceChildren();
      if (showAnn) {
        annBox.append(
          el("span", "role-badge", "KURUCU DUYURUSU"),
          el("span", "announcement-text", ann.text),
        );
      }
    }
    const ch = state.channelState?.[state.channel] || {
      locked: false,
      slowmodeSec: 0,
    };
    if (noticeBox) {
      const parts = [];
      if (ch.locked)
        parts.push("🔒 Kanal kilitli · Yalnızca yetkililer mesaj gönderebilir.");
      if (ch.slowmodeSec > 0)
        parts.push(`⏱ Yavaş mod aktif (${ch.slowmodeSec} sn aralık)`);
      noticeBox.hidden = parts.length === 0;
      noticeBox.classList.toggle("is-locked", !!ch.locked);
      noticeBox.textContent = parts.join("   ·   ");
    }
  }
  function disposeArenas() {
    if (bjArena) {
      bjArena.dispose();
      bjArena = null;
    }
    if (diceArena) {
      diceArena.dispose();
      diceArena = null;
    }
    if (chessArena) {
      chessArena.dispose();
      chessArena = null;
    }
    if (okeyArena) {
      okeyArena.dispose();
      okeyArena = null;
    }
    if (tavlaArena) {
      tavlaArena.dispose();
      tavlaArena = null;
    }
    if (rouletteArena) {
      rouletteArena.dispose();
      rouletteArena = null;
    }
    if (slotArena) {
      slotArena.dispose();
      slotArena = null;
    }
    if (papazArena) {
      papazArena.dispose();
      papazArena = null;
    }
    if (pistiArena) {
      pistiArena.dispose();
      pistiArena = null;
    }
    if (batakArena) {
      batakArena.dispose();
      batakArena = null;
    }
    if (blofArena) {
      blofArena.dispose();
      blofArena = null;
    }
  }
  function clearAllOtherGames(except = null) {
    if (except !== "xox") state.game = null;
    if (except !== "blackjack") {
      state.table = null;
      if (bjArena) { bjArena.dispose(); bjArena = null; }
    }
    if (except !== "dice") {
      state.diceTable = null;
      if (diceArena) { diceArena.dispose(); diceArena = null; }
    }
    if (except !== "chess") {
      state.chessTable = null;
      if (chessArena) { chessArena.dispose(); chessArena = null; }
    }
    if (except !== "okey") {
      state.okeyTable = null;
      if (okeyArena) { okeyArena.dispose(); okeyArena = null; }
    }
    if (except !== "tavla") {
      state.tavlaTable = null;
      if (tavlaArena) { tavlaArena.dispose(); tavlaArena = null; }
    }
    if (except !== "roulette") {
      state.rouletteTable = null;
      if (rouletteArena) { rouletteArena.dispose(); rouletteArena = null; }
    }
    if (except !== "slot") {
      state.slotHall = null;
      if (slotArena) { slotArena.dispose(); slotArena = null; }
    }
    if (except !== "papaz") {
      state.papazTable = null;
      if (papazArena) { papazArena.dispose(); papazArena = null; }
    }
    if (except !== "pisti") {
      state.pistiTable = null;
      if (pistiArena) { pistiArena.dispose(); pistiArena = null; }
    }
    if (except !== "batak") {
      state.batakTable = null;
      if (batakArena) { batakArena.dispose(); batakArena = null; }
    }
    if (except !== "blof") {
      state.blofTable = null;
      if (blofArena) { blofArena.dispose(); blofArena = null; }
    }
  }
  let activeEmojiPopover = null;
  let activeQuickReaction = null;
  let emojiPopoverToken = 0;

  function closeQuickReactionPicker() {
    if (!activeQuickReaction) return;
    activeQuickReaction.cleanup?.();
    activeQuickReaction.el?.remove();
    activeQuickReaction = null;
  }

  function closeEmojiPopover() {
    emojiPopoverToken += 1;
    if (!activeEmojiPopover) return;
    activeEmojiPopover.cleanup?.();
    activeEmojiPopover.el.remove();
    activeEmojiPopover = null;
  }

  function closeAllEmojiPickers() {
    closeQuickReactionPicker();
    closeEmojiPopover();
  }

  async function loadEmojiModules() {
    emojiModulePromise ||= Promise.all([
      import("./vendor/emoji/index.js"),
      import("./vendor/emoji/tr.js"),
    ]).then(([pkg, trMod]) => ({
      pkg,
      tr: trMod.default || trMod,
    }));
    return emojiModulePromise;
  }

  async function openEmojiPopover(anchorEl, onSelect, titleText = "Emoji seç") {
    closeQuickReactionPicker();
    if (activeEmojiPopover && activeEmojiPopover.anchor === anchorEl) {
      closeEmojiPopover();
      return;
    }
    closeEmojiPopover();
    const openToken = ++emojiPopoverToken;
    try {
      const { tr } = await loadEmojiModules();
      if (openToken !== emojiPopoverToken || !anchorEl?.isConnected) return;

      const wrap = document.createElement("div");
      wrap.className = "emoji-popover";
      wrap.setAttribute("role", "dialog");
      wrap.setAttribute("aria-label", titleText);

      const head = document.createElement("div");
      head.className = "emoji-popover-head";
      const titleSpan = el("span", "emoji-popover-title", titleText);
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "icon-button emoji-popover-close";
      closeBtn.textContent = "×";
      closeBtn.setAttribute("aria-label", "Emoji seçiciyi kapat");
      closeBtn.addEventListener("click", () => closeEmojiPopover());
      head.append(titleSpan, closeBtn);

      const picker = document.createElement("emoji-picker");
      picker.i18n = tr;
      picker.locale = "tr";
      picker.dataSource = new URL("./vendor/emoji/data.json", import.meta.url).href;
      picker.classList.toggle("light", document.documentElement.dataset.theme === "light");
      picker.addEventListener("emoji-click", (ev) => {
        const unicode = ev.detail?.unicode;
        if (unicode) onSelect?.(unicode);
        closeEmojiPopover();
      });
      wrap.append(picker);
      wrap.append(head, picker);
      document.body.append(wrap);

      const positionPopover = () => {
        if (!anchorEl.isConnected) {
          closeEmojiPopover();
          return;
        }
        const rect = anchorEl.getBoundingClientRect();
        const pw = Math.min(352, window.innerWidth - 16);
        const ph = Math.min(376, window.innerHeight - 80);
        let left = rect.left;
        if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
        if (left < 8) left = 8;
        let top = rect.top - ph - 8;
        if (top < 8) top = Math.min(window.innerHeight - ph - 8, rect.bottom + 8);
        if (top < 8) top = 8;
        wrap.style.left = `${Math.round(left)}px`;
        wrap.style.top = `${Math.round(top)}px`;
      };
      positionPopover();

      const onOutside = (e) => {
        if (!wrap.contains(e.target) && !anchorEl.contains(e.target)) {
          closeEmojiPopover();
        }
        const path = typeof e.composedPath === "function" ? e.composedPath() : [];
        const inWrap = path.includes(wrap) || wrap.contains(e.target);
        const inAnchor = path.includes(anchorEl) || anchorEl.contains(e.target);
        if (!inWrap && !inAnchor) closeEmojiPopover();
      };
      const onEsc = (e) => {
        if (e.key === "Escape") closeEmojiPopover();
      };
      setTimeout(() => {
        document.addEventListener("pointerdown", onOutside, true);
        document.addEventListener("keydown", onEsc);
        window.addEventListener("resize", positionPopover);
      }, 0);
      const msgsEl = $("messages");
      document.addEventListener("pointerdown", onOutside, true);
      document.addEventListener("keydown", onEsc, true);
      window.addEventListener("resize", positionPopover);
      msgsEl?.addEventListener("scroll", positionPopover, { passive: true });

      activeEmojiPopover = {
        anchor: anchorEl,
        el: wrap,
        picker,
        cleanup: () => {
          document.removeEventListener("pointerdown", onOutside, true);
          document.removeEventListener("keydown", onEsc);
          document.removeEventListener("keydown", onEsc, true);
          window.removeEventListener("resize", positionPopover);
          msgsEl?.removeEventListener("scroll", positionPopover);
        },
      };
    } catch {
      toast("Emoji seçici yüklenemedi.", true);
    }
  }
  function bindMentionAutocomplete(inputEl, popupEl) {
    if (!inputEl || !popupEl) return;
    let items = [];
    let selectedIndex = 0;
    let activeTokenStart = -1;

    const close = () => {
      popupEl.hidden = true;
      popupEl.replaceChildren();
      items = [];
      activeTokenStart = -1;
    };

    const applyCandidate = (name) => {
      if (activeTokenStart < 0) return;
      const val = inputEl.value;
      const caret = inputEl.selectionStart ?? val.length;
      const nextText = `${val.slice(0, activeTokenStart)}@${name} ${val.slice(caret)}`;
      if (nextText.length <= (inputEl.maxLength || 4000)) {
        inputEl.value = nextText;
        const pos = activeTokenStart + name.length + 2;
        inputEl.setSelectionRange(pos, pos);
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      }
      close();
      inputEl.focus();
    };

    const renderList = () => {
      popupEl.replaceChildren();
      if (!items.length) {
        close();
        return;
      }
      popupEl.hidden = false;
      items.forEach((u, idx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `mention-item${idx === selectedIndex ? " active" : ""}`;
        const nameSpan = document.createElement("strong");
        nameSpan.textContent = `@${u.name}`;
        const roleSpan = document.createElement("span");
        roleSpan.className = "mention-role";
        roleSpan.textContent = roles[u.role] || "Üye";
        btn.append(nameSpan, roleSpan);
        btn.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          applyCandidate(u.name);
        });
        popupEl.append(btn);
      });
    };

    inputEl.addEventListener("input", () => {
      const val = inputEl.value;
      const caret = inputEl.selectionStart ?? val.length;
      const before = val.slice(0, caret);
      const match = before.match(/(?:^|\s)@([^\s@]{0,20})$/);
      if (!match) {
        close();
        return;
      }
      const query = match[1].toLocaleLowerCase("tr");
      activeTokenStart = before.length - match[1].length - 1;
      items = (state.users || [])
        .filter((u) => u.id !== state.user?.id && u.name.toLocaleLowerCase("tr").includes(query))
        .slice(0, 6);
      selectedIndex = 0;
      renderList();
    });

    inputEl.addEventListener("keydown", (e) => {
      if (popupEl.hidden || !items.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % items.length;
        renderList();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        renderList();
      } else if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        applyCandidate(items[selectedIndex].name);
      } else if (e.key === "Escape") {
        close();
      }
    });

    inputEl.addEventListener("blur", () => {
      setTimeout(close, 120);
    });
  }
  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function isMentionedIn(text, userName) {
    if (!text || !userName) return false;
    const escaped = escapeRegExp(userName);
    try {
      const re = new RegExp(`(?:^|[^\\p{L}\\p{N}_])@${escaped}(?=$|[^\\p{L}\\p{N}_])`, "ui");
      return re.test(text);
    } catch {
      return text.toLocaleLowerCase("tr").includes(`@${userName.toLocaleLowerCase("tr")}`);
    }
  }
  function syncChannelBadges() {
    document.querySelectorAll("[data-unread-channel]").forEach((badge) => {
      const ch = badge.dataset.unreadChannel;
      const cnt = state.unreadByChannel?.[ch] || 0;
      badge.hidden = cnt <= 0;
      badge.textContent = cnt > 99 ? "99+" : String(cnt);
    });
  }
  function syncTabTitle() {
    if (state.unreadMentions > 0) {
      document.title = `(${state.unreadMentions} @) ${DEFAULT_TITLE}`;
    } else if (state.unreadTitles > 0) {
      document.title = `(${state.unreadTitles}) ${DEFAULT_TITLE}`;
    } else {
      document.title = DEFAULT_TITLE;
    }
  }
  function clearNotifications({ clearMini = false } = {}) {
    state.unreadTitles = 0;
    if (clearMini) {
      state.unreadMini = 0;
      state.unreadMentions = 0;
    }
    syncChannelBadges();
    syncTabTitle();
    syncMiniChatUI();
  }
  function syncMiniChatUI() {
    const shell = $("mini-chat-shell");
    if (!shell) return;
    const inArena = !!(state.game || state.table || state.diceTable || state.chessTable || state.okeyTable || state.tavlaTable || state.rouletteTable || state.slotHall || state.papazTable || state.pistiTable || state.batakTable || state.blofTable);
    shell.hidden = !(state.user && state.view === "games" && inArena);
    const drawer = $("mini-chat-drawer");
    const toggle = $("mini-chat-toggle");
    if (drawer) drawer.hidden = !state.miniChatOpen;
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(state.miniChatOpen));
      toggle.classList.toggle("has-mention", state.unreadMentions > 0);
      toggle.classList.toggle("is-open", state.miniChatOpen);
    }
    const badge = $("mini-chat-badge");
    if (badge) {
      const count = state.unreadMentions > 0 ? state.unreadMentions : state.unreadMini;
      badge.hidden = state.miniChatOpen || count <= 0;
      badge.classList.toggle("is-mention", state.unreadMentions > 0);
      badge.textContent =
        state.unreadMentions > 0 ? `@ ${state.unreadMentions}` : String(count);
    }
    const mTag = $("mini-chat-mention-tag");
    if (mTag) {
      mTag.hidden = state.unreadMentions <= 0;
      mTag.textContent = `@ ${state.unreadMentions} bahsedilme`;
    }
    document.querySelectorAll("[data-mini-ch]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.miniCh === state.miniChatChannel);
    });
    const miniInput = $("mini-chat-input");
    if (miniInput) {
      const chState = state.channelState?.[state.miniChatChannel] || { locked: false };
      const isStaff = !!state.user && rank[state.user.role] >= 1;
      const blocked = !state.user || state.user.isMuted || (!!chState.locked && !isStaff);
      miniInput.disabled = blocked;
      miniInput.placeholder = state.user?.isMuted
        ? "Susturuldun — mesaj yazamazsın."
        : chState.locked && !isStaff
          ? "Bu kanal şu an kilitli."
          : "Masadan yaz (@ad ile etiketle)…";
    }
  }
  function renderMiniChat() {
    const box = $("mini-chat-messages");
    if (!box) return;
    const ch = state.miniChatChannel;
    const msgs = [...state.messages.values()]
      .filter((m) => m.channel === ch)
      .slice(-40);
    box.replaceChildren();
    if (!msgs.length) {
      box.append(el("div", "mini-chat-empty", "Henüz mesaj yok — ilk selamı buradan gönder."));
      return;
    }
    const myName = state.user?.name || "";
    for (const m of msgs) {
      const row = el(
        "div",
        "mini-msg" +
        (m.senderId === state.user?.id ? " is-self" : "") +
        (isMentionedIn(m.message, myName) ? " is-mentioned" : ""),
      );
      const head = el("div", "mini-msg-head");
      const nameBtn = el("button", "mini-msg-author", m.name);
      nameBtn.type = "button";
      nameBtn.title = `@${m.name} etiketle`;
      nameBtn.addEventListener("click", () => {
        const inp = $("mini-chat-input");
        if (!inp || inp.disabled) return;
        const prefix = inp.value && !inp.value.endsWith(" ") ? " " : "";
        inp.value = `${inp.value}${prefix}@${m.name} `.slice(0, inp.maxLength);
        inp.focus();
      });
      const tm = el(
        "span",
        "mini-msg-time",
        m.time ||
        new Date(m.createdAt).toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      head.append(nameBtn, tm);
      const body = el(
        "div",
        "mini-msg-body",
        m.type === "code" ? `</> [${m.language || "kod"}] ${m.title || "Kod parçası"}` : m.message,
      );
      row.append(head, body);
      box.append(row);
    }
    box.scrollTop = box.scrollHeight;
  }
  function setMemberUI() {
    document.body.classList.toggle("is-member", !!state.user);
    $("profile-name").textContent = state.user?.name || "Henüz tanışmadık";
    $("profile-role").textContent = state.user
      ? roles[state.user.role] + (state.user.isMuted ? " · Susturuldu" : "")
      : "Bir merhaba de.";
    $("profile-avatar").textContent = state.user
      ? Array.from(state.user.name)[0].toLocaleUpperCase("tr")
      : "?";
    $("profile-button").textContent = state.user ? "⏻" : "↗";
    $("profile-button").setAttribute(
      "aria-label",
      state.user ? "Oturumu kapat" : "Giriş yap",
    );
    $("join-top").textContent = state.user
      ? state.user.role === "admin"
        ? "Yönetim ⌘"
        : state.user.role === "mod"
          ? "Moderasyon 🛡"
          : "Çıkış yap ↗"
      : "Sohbete katıl ↗";
    $("join-top").classList.toggle(
      "admin-open",
      state.user?.role === "admin" || state.user?.role === "mod",
    );
    $("moderators-button").hidden = state.user?.role !== "admin";
    $("open-games")?.classList.toggle("active", state.view === "games");
    const codeButton = $("code-button");
    if (codeButton) {
      codeButton.hidden = state.channel !== "code";
      codeButton.textContent =
        state.channel === "code" ? "</> Kod paylaş" : "</>";
    }
    const chState = state.channelState?.[state.channel] || {
      locked: false,
      slowmodeSec: 0,
    };
    const isStaff = !!state.user && rank[state.user.role] >= 1;
    const lockedForMe = !!chState.locked && !isStaff;
    const enabled =
      !!state.user &&
      !!state.socket?.connected &&
      !state.user.isMuted &&
      !lockedForMe;
    $("message-input").disabled = !enabled;
    $("send-button").disabled = !enabled;
    $("message-input").placeholder = state.user?.isMuted
      ? "Mesaj gönderme iznin şu an kapalı."
      : lockedForMe
        ? "Bu kanal şu an yalnızca yetkililerin yazımına açık (kilitli)."
        : state.user
          ? "#" + channels[state.channel][0] + " kanalına bir şeyler yaz…"
          : "Sohbete katılmak için giriş yap…";
    renderChannelNotices();
    syncMiniChatUI();
  }
  async function tryRestoreChessSession({ silent = false } = {}) {
    if (!state.socket?.connected || !state.user || state.reconnectingChess) return;
    const saved = getActiveChessSession();
    const tableId = saved?.roomId || state.chessTable?.id || state.lastChessTableId || "";
    if (!saved && !state.chessTable && !state.lastChessTableId) return;
    state.reconnectingChess = true;
    try {
      const res = await emit("chessReconnect", {
        playerId: state.playerId,
        tableId: tableId || undefined,
      });
      if (!res.success) return;
      if (res.restored && res.table) {
        state.game = null;
        state.table = null;
        state.diceTable = null;
        state.okeyTable = null;
        if (bjArena) {
          bjArena.dispose();
          bjArena = null;
        }
        if (diceArena) {
          diceArena.dispose();
          diceArena = null;
        }
        if (okeyArena) {
          okeyArena.dispose();
          okeyArena = null;
        }
        state.chessTable = res.table;
        state.tavlaTable = null;
        if (tavlaArena) {
          tavlaArena.dispose();
          tavlaArena = null;
        }
        syncActiveChessSession(res.table);
        if (state.view !== "games") navigate("games");
        renderGame();
        if (!silent) {
          toast("Satranç oyununa kaldığın yerden yeniden bağlandın ♟");
        }
      } else {
        clearActiveChessSession();
        if (res.reason === "finished" && res.table) {
          state.chessTable = res.table;
          if (state.view !== "games") navigate("games");
          renderGame();
        }
      }
    } finally {
      state.reconnectingChess = false;
    }
  }
  async function tryRestoreTavlaSession({ silent = false } = {}) {
    if (!state.socket?.connected || !state.user || state.reconnectingTavla) return;
    const saved = getActiveTavlaSession();
    const tableId = saved?.roomId || state.tavlaTable?.id || state.lastTavlaTableId || "";
    if (!saved && !state.tavlaTable && !state.lastTavlaTableId) return;
    state.reconnectingTavla = true;
    try {
      const res = await emit("tavlaReconnect", {
        playerId: state.playerId,
        tableId: tableId || undefined,
      });
      if (!res.success) return;
      if (res.restored && res.table) {
        state.game = null;
        state.table = null;
        state.diceTable = null;
        state.chessTable = null;
        state.okeyTable = null;
        disposeArenas();
        resetXoxSoundState();
        state.tavlaTable = res.table;
        syncActiveTavlaSession(res.table);
        if (state.view !== "games") navigate("games");
        renderGame();
        if (!silent) {
          toast("Tavla oyununa kaldığın yerden yeniden bağlandın ⛀");
        }
      } else {
        clearActiveTavlaSession();
        if (res.reason === "finished" && res.table) {
          state.tavlaTable = res.table;
          if (state.view !== "games") navigate("games");
          renderGame();
        }
      }
    } finally {
      state.reconnectingTavla = false;
    }
  }
  let lastLocalInteractionAt = Date.now();
  let lastActivityPingAt = 0;
  function maybeSendActivityPing(force = false) {
    if (!state.user || !state.socket?.connected || state.stopped) return;
    const now = Date.now();
    if (!force && now - lastActivityPingAt < 45000) return;
    lastActivityPingAt = now;
    state.socket.emit("activityPing", {});
  }
  function recordUserActivity() {
    lastLocalInteractionAt = Date.now();
    if (Date.now() - lastActivityPingAt >= 45000) {
      maybeSendActivityPing(true);
    }
  }
  async function authenticate() {
    if (state.joining) return;
    const savedToken = state.credentials?.explicitLogin ? "" : getSavedSessionToken();
    if (!savedToken && !state.credentials) return;
    state.joining = true;
    const attempt = ++state.authAttempt;
    const result = savedToken
      ? await emit("resumeSession", {
        sessionToken: savedToken,
        playerId: state.playerId,
      })
      : await emit("joinRoom", {
        name: state.credentials.name,
        role: state.credentials.role,
        password: state.credentials.password,
        playerId: state.playerId,
      });
    if (attempt !== state.authAttempt) return;
    state.joining = false;
    $("login-submit").disabled = false;
    $("login-submit").textContent = "Sohbete katıl ↗";
    if (savedToken) {
      if (!result.success || !result.resumed) {
        clearSavedSessionToken();
        if (result.reason === "session_expired") {
          clearActiveChessSession();
          clearActiveTavlaSession();
          state.stopped = true;
          state.credentials = null;
          state.user = null;
          setMemberUI();
          const msg = "Uzun süre işlem yapılmadığı için oturumunuz sonlandırıldı.";
          $("login-error").textContent = msg;
          if (!$("login-dialog").open) showDialog("login-dialog");
          toast(msg, true);
          return;
        }
        if (state.credentials?.name && (!state.credentials.role || state.credentials.role === "user") && result.reason !== "name_taken") {
          // Soft fallback for active gameplay drop if saved token was invalidated cleanly
          await authenticate();
          return;
        }
        state.credentials = null;
        state.user = null;
        setMemberUI();
        if (result.reason === "name_taken") {
          $("login-error").textContent = "Bu takma ad şu an kullanılıyor; tekrar giriş yapabilirsin.";
        }
        if (!$("login-dialog").open) showDialog("login-dialog");
        return;
      }
      if (result.sessionToken) saveSessionToken(result.sessionToken);
      state.stopped = false;
      state.user = result.user;
      state.credentials = {
        name: result.user.name,
        role: result.user.role || "user",
        password: "",
      };
      state.messages = new Map((result.history || []).map((m) => [m.id, m]));
      state.users = result.users || [];
      state.games = result.games || [];
      if (Array.isArray(result.voiceRooms)) state.voiceRooms = result.voiceRooms;
      if (Array.isArray(result.tournaments)) state.tournaments = result.tournaments;
      if (result.channelState) state.channelState = result.channelState;
      state.announcement = result.announcement || null;
      lastLocalInteractionAt = Date.now();
      lastActivityPingAt = Date.now();
      $("staff-password").value = "";
      if ($("login-dialog").open) $("login-dialog").close();
      setMemberUI();
      renderUsers();
      renderMessages(true);
      renderMiniChat();
      renderLobby();
      renderVoiceChannels();
      renderTournaments();
      const hasSavedChess = Boolean(getActiveChessSession() || state.lastChessTableId);
      const hasSavedTavla = Boolean(getActiveTavlaSession() || state.lastTavlaTableId);
      if (!hasSavedChess && !hasSavedTavla && !state.hasJoinedOnce) {
        toast("Tekrar hoş geldin, " + state.user.name + " (oturum korundu).");
      }
      state.hasJoinedOnce = true;
      try {
        localStorage.setItem("haking.nickname", state.user.name);
      } catch { }
      if (hasSavedTavla) {
        tryRestoreTavlaSession();
      } else if (hasSavedChess) {
        tryRestoreChessSession();
      }
      return;
    }
    if (!result.success) {
      clearSavedSessionToken();
      $("login-error").textContent = result.message;
      state.credentials = null;
      state.user = null;
      setMemberUI();
      if (!$("login-dialog").open) showDialog("login-dialog");
      return;
    }
    if (result.sessionToken) saveSessionToken(result.sessionToken);
    state.stopped = false;
    state.user = result.user;
    state.credentials = {
      name: result.user.name,
      role: result.user.role || "user",
      password: "",
    };
    state.messages = new Map((result.history || []).map((m) => [m.id, m]));
    state.users = result.users || [];
    state.games = result.games || [];
    if (Array.isArray(result.voiceRooms)) state.voiceRooms = result.voiceRooms;
    if (Array.isArray(result.tournaments)) state.tournaments = result.tournaments;
    if (result.channelState) state.channelState = result.channelState;
    state.announcement = result.announcement || null;
    lastLocalInteractionAt = Date.now();
    lastActivityPingAt = Date.now();
    $("staff-password").value = "";
    $("login-dialog").close();
    setMemberUI();
    renderUsers();
    renderMessages(true);
    renderMiniChat();
    renderLobby();
    renderVoiceChannels();
    renderTournaments();
    const hasSavedChess = Boolean(getActiveChessSession() || state.lastChessTableId);
    const hasSavedTavla = Boolean(getActiveTavlaSession() || state.lastTavlaTableId);
    if (!hasSavedChess && !hasSavedTavla) {
      toast("Hoş geldin, " + state.user.name + ". İyi ki geldin!");
    }
    state.hasJoinedOnce = true;
    try {
      localStorage.setItem("haking.nickname", state.user.name);
    } catch { }
    if (hasSavedTavla) {
      tryRestoreTavlaSession();
    } else if (hasSavedChess) {
      tryRestoreChessSession();
    }
  }
  function setupSocket() {
    if (state.socket) {
      state.socket.removeAllListeners();
      state.socket.disconnect();
      state.joining = false;
      state.authAttempt++;
    }
    if (typeof window.io !== "function") {
      $("login-error").textContent =
        "Sohbet bileşeni yüklenemedi. Sayfayı yenile.";
      return;
    }
    connection("connecting");
    state.socket = window.io(window.HAKING_CONFIG.backendUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 10000,
      timeout: 60000,
    });
    const socket = state.socket;
    socket.on("connect", () => {
      connection("online");
      if (state.credentials) authenticate();
      if (state.stopped) return;
      if (getSavedSessionToken() || state.credentials) authenticate();
    });
    socket.on("connect_error", () => {
      connection("offline");
      $("login-error").textContent =
        "Sunucuya ulaşılamadı. Ücretsiz sunucunun uyanması biraz sürebilir; bağlantı tekrar deneniyor.";
      $("login-submit").disabled = false;
      $("login-submit").textContent = "Tekrar dene ↗";
    });
    socket.on("disconnect", (reason) => {
      const hadActiveChess = Boolean(
        state.chessTable &&
        (state.chessTable.status === "playing" ||
          state.chessTable.status === "waiting") &&
        state.chessTable.seats?.some(
          (s) => s && !s.isBot && s.userId === socket.id,
        ),
      );
      const hadActiveTavla = Boolean(
        state.tavlaTable &&
        ["playing", "hand_finished", "waiting"].includes(state.tavlaTable.status) &&
        state.tavlaTable.seats?.some(
          (s) => s && !s.isBot && s.userId === socket.id,
        ),
      );
      state.authAttempt++;
      state.joining = false;
      state.reconnectingChess = false;
      state.reconnectingTavla = false;
      connection("offline");
      state.user = null;
      voiceClient.disconnectLocal();
      state.voiceRooms = [];
      state.tournaments = [];
      clearAllOtherGames();
      resetXoxSoundState();
      clearNotifications({ clearMini: true });
      state.users = [];
      state.games = [];
      state.typing.clear();
      for (const id of ["moderators-dialog", "admin-dialog"])
        if ($(id).open) $(id).close();
      setMemberUI();
      renderUsers();
      renderGame();
      renderLobby();
      renderVoiceChannels();
      renderTournaments();
      renderTyping();
      if (!state.stopped) {
        toast(
          reason === "io server disconnect"
            ? "Oturum sona erdi. Yeniden giriş yapabilirsin."
            : hadActiveTavla
              ? "Bağlantı kesildi. Tavla oyunun 5 dk korunuyor; yeniden bağlanılıyor…"
              : hadActiveChess
                ? "Bağlantı kesildi. Satranç oyunun 5 dk korunuyor; yeniden bağlanılıyor…"
                : "Bağlantı kesildi. Otomatik yeniden bağlanılıyor.",
          true,
        );
        if (reason === "io server disconnect") state.credentials = null;
      }
    });
    socket.on("updateUserList", (users) => {
      state.users = users;
      if (state.user) {
        const current = users.find((u) => u.id === state.user.id);
        if (current) state.user = current;
      }
      setMemberUI();
      renderUsers();
      if ($("moderators-dialog").open) loadModerators();
      if ($("admin-dialog").open) renderMutedUsers();
    });
    socket.on("channelStateUpdated", (nextState) => {
      if (nextState) state.channelState = nextState;
      setMemberUI();
      if ($("admin-dialog").open) syncAdminChannelControls();
    });
    socket.on("announcement", (ann) => {
      state.announcement = ann || null;
      renderChannelNotices();
      if (ann?.text && state.user) toast("📢 " + ann.text);
    });
    socket.on("receiveMessage", (m) => {
      const nearBottom =
        $("messages").scrollHeight -
        $("messages").scrollTop -
        $("messages").clientHeight <
        100;
      state.messages.set(m.id, m);
      while (state.messages.size > 300)
        state.messages.delete(state.messages.keys().next().value);
      renderMessages(nearBottom || m.senderId === state.user?.id);
      renderMiniChat();

      if (state.user && m.senderId !== state.user.id) {
        const mentioned = isMentionedIn(m.message, state.user.name);
        const viewingChatNow =
          !document.hidden &&
          ((state.view === "chat" && state.channel === m.channel) ||
            (state.view === "games" &&
              state.miniChatOpen &&
              state.miniChatChannel === m.channel));
        if (!viewingChatNow) {
          state.unreadMini += 1;
          if (state.channel !== m.channel || state.view !== "chat") {
            state.unreadByChannel[m.channel] = (state.unreadByChannel[m.channel] || 0) + 1;
          }
          if (document.hidden || state.view !== "chat") {
            state.unreadTitles += 1;
          }
          if (mentioned) {
            state.unreadMentions += 1;
            playMention();
            toast(`🔔 @${m.name} senden bahsetti: "${String(m.message || "").slice(0, 72)}"`);
            sendDesktopNotification(
              `@${m.name} senden bahsetti`,
              String(m.message || "").slice(0, 110),
              `mention-${m.id}`,
            );
          }
          syncChannelBadges();
          syncTabTitle();
          syncMiniChatUI();
        }
      }
    });
    socket.on("messageUpdated", (m) => {
      state.messages.set(m.id, m);
      renderMessages();
      renderMiniChat();
    });
    socket.on("messageDeleted", (id) => {
      state.messages.delete(id);
      if (state.reply === id) cancelReply();
      if (state.editing === id) cancelEdit();
      renderMessages();
      renderMiniChat();
    });
    socket.on("channelCleared", (data) => {
      for (const [id, m] of state.messages)
        if (m.channel === data.channel) state.messages.delete(id);
      renderMessages();
      renderMiniChat();
    });
    socket.on("systemMessage", (message) => {
      if (state.user) toast(message);
    });
    socket.on("displayTyping", (data) => {
      if (data.isTyping)
        state.typing.set(data.id, { ...data, until: Date.now() + 4000 });
      else state.typing.delete(data.id);
      renderTyping();
    });
    socket.on("forceNameChange", (name) => {
      if (state.user) {
        state.user.name = name;
        if (state.credentials) state.credentials.name = name;
        try {
          localStorage.setItem("haking.nickname", name);
        } catch { }
        setMemberUI();
        toast("Takma adın kurucu tarafından " + name + " olarak değiştirildi.");
      }
    });
    socket.on("kicked", () => {
      state.stopped = true;
      state.credentials = null;
      state.user = null;
      clearSavedSessionToken();
      clearActiveChessSession();
      clearActiveTavlaSession();
      toast("Bir yetkili seni odadan çıkardı.", true);
      socket.disconnect();
      setMemberUI();
    });
    socket.on("session_expired", (payload) => {
      const msg =
        payload?.message ||
        "Uzun süre işlem yapılmadığı için oturumunuz sonlandırıldı.";
      state.stopped = true;
      state.authAttempt++;
      state.joining = false;
      state.reconnectingChess = false;
      state.reconnectingTavla = false;
      state.credentials = null;
      state.user = null;
      voiceClient.disconnectLocal();
      state.voiceRooms = [];
      state.tournaments = [];
      clearAllOtherGames();
      clearSavedSessionToken();
      clearActiveChessSession();
      clearActiveTavlaSession();
      resetXoxSoundState();
      clearNotifications({ clearMini: true });
      state.users = [];
      state.games = [];
      state.typing.clear();
      for (const id of ["moderators-dialog", "admin-dialog"])
        if ($(id).open) $(id).close();
      socket.disconnect();
      setMemberUI();
      renderUsers();
      renderGame();
      renderLobby();
      renderMessages();
      renderTyping();
      $("login-error").textContent = msg;
      if (!$("login-dialog").open) showDialog("login-dialog");
      toast(msg, true);
    });
    socket.on("gamesUpdated", (games) => {
      state.games = games;
      renderLobby();
    });
    socket.on("moderatorsChanged", () => {
      if ($("moderators-dialog").open) loadModerators();
    });
    socket.on("gameUpdated", (game) => {
      if (game.players.some((p) => p.id === socket.id)) {
        clearAllOtherGames("xox");
        state.game = game;
        renderGame();
      }
    });
    socket.on("gameLeft", () => {
      state.game = null;
      resetXoxSoundState();
      renderGame();
    });
    socket.on("blackjackUpdated", (table) => {
      if (table.seats?.some((s) => s && s.userId === socket.id)) {
        clearAllOtherGames("blackjack");
        state.table = table;
        renderGame();
      }
    });
    socket.on("blackjackLeft", () => {
      state.table = null;
      if (bjArena) {
        bjArena.dispose();
        bjArena = null;
      }
      renderGame();
    });
    socket.on("diceUpdated", (table) => {
      if (table.seats?.some((s) => s && !s.isBot && s.userId === socket.id)) {
        clearAllOtherGames("dice");
        state.diceTable = table;
        renderGame();
      }
    });
    socket.on("diceLeft", () => {
      state.diceTable = null;
      if (diceArena) {
        diceArena.dispose();
        diceArena = null;
      }
      renderGame();
    });
    socket.on("chessUpdated", (table) => {
      clearAllOtherGames("chess");
      state.chessTable = table;
      syncActiveChessSession(table);
      renderGame();
    });
    socket.on("chessLeft", () => {
      state.chessTable = null;
      clearActiveChessSession();
      if (chessArena) {
        chessArena.dispose();
        chessArena = null;
      }
      renderGame();
    });
    socket.on("okeyUpdated", (table) => {
      clearAllOtherGames("okey");
      state.okeyTable = table;
      renderGame();
    });
    socket.on("okeyLeft", () => {
      state.okeyTable = null;
      if (okeyArena) {
        okeyArena.dispose();
        okeyArena = null;
      }
      renderGame();
    });
    socket.on("tavlaUpdated", (table) => {
      clearAllOtherGames("tavla");
      state.tavlaTable = table;
      syncActiveTavlaSession(table);
      renderGame();
    });
    socket.on("tavlaLeft", () => {
      state.tavlaTable = null;
      clearActiveTavlaSession();
      if (tavlaArena) {
        tavlaArena.dispose();
        tavlaArena = null;
      }
      renderGame();
    });
    socket.on("rouletteUpdated", (table) => {
      clearAllOtherGames("roulette");
      state.rouletteTable = table;
      renderGame();
    });
    socket.on("rouletteLeft", () => {
      state.rouletteTable = null;
      if (rouletteArena) {
        rouletteArena.dispose();
        rouletteArena = null;
      }
      renderGame();
    });
    socket.on("slotUpdated", (hall) => {
      clearAllOtherGames("slot");
      state.slotHall = hall;
      renderGame();
    });
    socket.on("slotLeft", () => {
      state.slotHall = null;
      if (slotArena) {
        slotArena.dispose();
        slotArena = null;
      }
      renderGame();
    });
    socket.on("papazUpdated", (table) => {
      clearAllOtherGames("papaz");
      state.papazTable = table;
      renderGame();
    });
    socket.on("papazLeft", () => {
      state.papazTable = null;
      if (papazArena) {
        papazArena.dispose();
        papazArena = null;
      }
      renderGame();
    });
    socket.on("pistiUpdated", (table) => {
      clearAllOtherGames("pisti");
      state.pistiTable = table;
      renderGame();
    });
    socket.on("pistiLeft", () => {
      state.pistiTable = null;
      if (pistiArena) {
        pistiArena.dispose();
        pistiArena = null;
      }
      renderGame();
    });
    socket.on("batakUpdated", (table) => {
      clearAllOtherGames("batak");
      state.batakTable = table;
      renderGame();
    });
    socket.on("batakLeft", () => {
      state.batakTable = null;
      if (batakArena) {
        batakArena.dispose();
        batakArena = null;
      }
      renderGame();
    });
    socket.on("blofUpdated", (payload) => {
      const tbl = payload?.table || payload;
      if (!tbl) return;
      const prevTurn = state.blofTable?.turnSeatIndex;
      const prevStatus = state.blofTable?.status;
      clearAllOtherGames("blof");
      state.blofTable = tbl;
      renderGame();
      const mySeatIdx = (tbl.seats || []).findIndex((s) => s && s.id === socket.id);
      if (
        mySeatIdx >= 0 &&
        tbl.status === "playing" &&
        tbl.turnSeatIndex === mySeatIdx &&
        (prevTurn !== mySeatIdx || prevStatus !== "playing")
      ) {
        sendDesktopNotification("🔫 Blöf — Sıra Sende!", `Masa kartı: ${tbl.tableTypeLabel}`, "blof-turn");
      }
    });
    socket.on("blofLeft", () => {
      state.blofTable = null;
      if (blofArena) {
        blofArena.dispose();
        blofArena = null;
      }
      renderGame();
    });
    // Voice channels, WebRTC signaling, game invites & mini tournaments
    socket.on("voiceRoomsUpdated", (rooms) => {
      state.voiceRooms = Array.isArray(rooms) ? rooms : [];
      if (voiceClient.isConnected && !state.voiceRooms.some((r) => r.id === voiceClient.roomId)) {
        voiceClient.disconnectLocal();
      }
      renderVoiceChannels();
      renderVoiceDock();
      syncArenaSocialBar();
    });
    socket.on("voiceMemberUpdated", ({ roomId, member }) => {
      const room = state.voiceRooms.find((r) => r.id === roomId);
      if (room && member) {
        const existing = (room.members || []).find((m) => m.id === member.id);
        if (existing) Object.assign(existing, member);
        renderVoiceChannels();
        renderVoiceDock();
      }
    });
    socket.on("voicePeerJoined", ({ roomId, peer }) => {
      voiceClient.handlePeerJoined(roomId, peer);
    });
    socket.on("voicePeerLeft", ({ roomId, userId }) => {
      voiceClient.handlePeerLeft(roomId, userId);
    });
    socket.on("voiceSignal", (msg) => {
      voiceClient.handleSignal(msg);
    });
    socket.on("voiceJoinRequested", (req) => {
      showVoiceKnockPrompt(req);
      sendDesktopNotification(
        "🔊 Sesli Kanal Giriş İsteği",
        `${req.name}, "${req.roomName}" kanalına girmek istiyor.`,
        `vreq-${req.userId}`,
      );
    });
    socket.on("voiceJoinApproved", async ({ room, existingPeers, byName }) => {
      toast(`✅ ${byName} izin verdi — "${room.name}" sesli kanalına bağlandın!`);
      await voiceClient.joinRoom({
        roomId: room.id,
        roomName: room.name,
        myId: state.socket?.id,
        existingPeers: existingPeers || [],
        pttDefault: Boolean(room.isTable),
      });
      renderVoiceChannels();
      renderVoiceDock();
    });
    socket.on("voiceJoinRejected", ({ roomName, byName }) => {
      toast(`❌ ${byName}, "${roomName}" sesli kanalına giriş isteğini reddetti.`, true);
      renderVoiceChannels();
    });
    socket.on("voiceKicked", ({ byName }) => {
      voiceClient.disconnectLocal();
      toast(`Sesli kanaldan çıkarıldın (${byName}).`, true);
      renderVoiceChannels();
      renderVoiceDock();
    });
    socket.on("gameInviteReceived", (inv) => {
      showGameInvitePrompt(inv);
      playMention();
      sendDesktopNotification(
        `📩 ${inv.fromName} Oyuna Davet Ediyor!`,
        `${inv.label} (${inv.seatsText}) masasına katıl.`,
        `inv-${inv.inviteId}`,
      );
    });
    socket.on("tournamentsUpdated", (list) => {
      state.tournaments = Array.isArray(list) ? list : [];
      renderTournaments();
    });
    socket.on("tourneyMatchReady", (info) => {
      showTourneyMatchPrompt(info);
      playMention();
      sendDesktopNotification(
        `🏆 ${info.tournamentName}`,
        "Turnuva maçın hazır! Hemen masaya geç.",
        `trn-${info.matchId}`,
      );
    });
    socket.connect();
  }
  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.joining) return;
    state.stopped = false;
    clearSavedSessionToken();
    state.credentials = {
      name: $("nickname").value.trim(),
      role: $("login-role").value,
      password: $("staff-password").value,
      explicitLogin: true,
    };
    $("login-error").textContent = "";
    $("login-submit").disabled = true;
    $("login-submit").textContent = "Bağlanıyor…";
    if (state.socket?.connected) await authenticate();
    else setupSocket();
  });
  $("login-role").addEventListener("change", () => {
    $("nickname").required = $("login-role").value === "user";
    $("nickname").disabled = $("login-role").value !== "user";
    $("staff-password").required = $("login-role").value !== "user";
  });
  async function logout() {
    if (!state.user || state.loggingOut) return;
    const inActiveBj = state.table?.seats?.some(
      (s) => s && s.userId === state.socket?.id && s.activeInRound,
    );
    const inActiveDice = state.diceTable?.status === "playing";
    const inActiveChess =
      state.chessTable?.status === "playing" &&
      state.chessTable?.seats?.some(
        (s) => s && !s.isBot && s.userId === state.socket?.id,
      );
    const inActiveTavla =
      (state.tavlaTable?.status === "playing" || state.tavlaTable?.status === "hand_finished") &&
      state.tavlaTable?.seats?.some(
        (s) => s && !s.isBot && s.userId === state.socket?.id,
      );
    if (
      (state.game?.status === "playing" ||
        inActiveBj ||
        inActiveDice ||
        inActiveChess ||
        inActiveTavla) &&
      !confirm(
        "Çıkış yaparsan oyun sona erecek. Oturumu kapatmak istiyor musun?",
      )
    )
      return;
    state.loggingOut = true;
    try {
      clearSavedSessionToken();
      clearActiveChessSession();
      clearActiveTavlaSession();
      state.stopped = true;
      if (state.socket?.connected) {
        if (voiceClient.isConnected) {
          state.socket.emit("voiceLeave", {});
        }
        voiceClient.disconnectLocal();
        if (state.chessTable) {
          state.socket.emit("chessLeave", { tableId: state.chessTable.id });
        }
        if (state.tavlaTable) {
          state.socket.emit("tavlaLeave", { tableId: state.tavlaTable.id });
        }
        if (state.rouletteTable) {
          state.socket.emit("rouletteLeave", { tableId: state.rouletteTable.id });
        }
        if (state.slotHall) {
          state.socket.emit("slotLeave", { hallId: state.slotHall.id });
        }
        if (state.papazTable) {
          state.socket.emit("papazLeave", { tableId: state.papazTable.id });
        }
        if (state.pistiTable) {
          state.socket.emit("pistiLeave", { tableId: state.pistiTable.id });
        }
        if (state.batakTable) {
          state.socket.emit("batakLeave", { tableId: state.batakTable.id });
        }
        if (state.blofTable) {
          state.socket.emit("blofLeave", { tableId: state.blofTable.id });
        }
        await Promise.race([
          emit("logoutSession"),
          new Promise((resolve) => setTimeout(resolve, 350)),
        ]);
      }
      state.credentials = null;
      state.user = null;
      voiceClient.disconnectLocal();
      state.voiceRooms = [];
      state.tournaments = [];
      clearAllOtherGames();
      state.hasJoinedOnce = false;
      clearNotifications({ clearMini: true });
      state.socket?.disconnect();
      state.messages.clear();
      cancelReply();
      cancelEdit();
      $("message-input").value = "";
      setMemberUI();
      renderMessages();
      toast("Görüşmek üzere. Her zaman yerin var.");
    } finally {
      state.loggingOut = false;
    }
  }
  function syncAdminChannelControls() {
    const ch = state.channelState?.[state.channel] || {
      locked: false,
      slowmodeSec: 0,
    };
    const chTitle = "#" + channels[state.channel][0];
    if ($("admin-channel-badge")) $("admin-channel-badge").textContent = chTitle;
    if ($("admin-slowmode")) $("admin-slowmode").value = String(ch.slowmodeSec || 0);
    if ($("toggle-channel-lock"))
      $("toggle-channel-lock").textContent = ch.locked
        ? "Kanal kilidini aç 🔓"
        : "Kanalı kilitle 🔒";
  }
  function renderMutedUsers() {
    const box = $("muted-users-list");
    if (!box) return;
    box.replaceChildren();
    const muted = state.users.filter((u) => u.isMuted);
    if (!muted.length) {
      box.append(el("div", "staff-empty", "Şu an susturulan üye yok."));
      return;
    }
    for (const u of muted) {
      const row = el("div", "staff-entry");
      const info = el("div", "staff-entry-info");
      const rem = u.muteUntil
        ? `${Math.max(1, Math.ceil((u.muteUntil - Date.now()) / 60000))} dk kaldı`
        : "Süresiz";
      info.append(
        el("strong", "", u.name),
        el("small", "", rem + (u.muteReason ? ` · ${u.muteReason}` : "")),
      );
      row.append(info);
      if (state.user && rank[state.user.role] > rank[u.role]) {
        row.append(
          button("Sesi aç", "button small secondary", async () => {
            const res = await act("moderate", { action: "mute", targetId: u.id });
            if (res.success) toast(u.name + " susturulması kaldırıldı.");
          }),
        );
      }
      box.append(row);
    }
  }
  async function openAdmin() {
    if (!state.user || rank[state.user.role] < 1) return;
    const isAdmin = state.user.role === "admin";
    const dlg = $("admin-dialog");
    dlg.classList.toggle("is-mod-scope", !isAdmin);
    if ($("admin-dialog-title"))
      $("admin-dialog-title").textContent = isAdmin
        ? "Kurucu · Topluluk yönetimi"
        : "Moderatör · Kanal moderasyonu";
    syncAdminChannelControls();
    renderMutedUsers();
    showDialog("admin-dialog");
    if (!isAdmin) return;
    $("audit-list").textContent = "Yükleniyor…";
    const result = await emit("getAuditLog");
    $("audit-list").replaceChildren();
    if (!result.success) {
      $("audit-list").textContent = result.message;
      return;
    }
    if (!result.entries.length)
      $("audit-list").textContent = "Henüz bir yönetim işlemi yok.";
    for (const entry of result.entries) {
      const labels = {
        mute: "susturuldu",
        unmute: "sesi açıldı",
        kick: "odadan çıkarıldı",
        rename: "ad değiştirildi",
        clear: "kanal temizlendi",
        clearGames: "oyun lobisi sıfırlandı",
        slowmode: "yavaş mod güncellendi",
        lock: "kanal kilitlendi",
        unlock: "kanal kilidi açıldı",
        announce: "duyuru yayınlandı",
        "announce-clear": "duyuru kaldırıldı",
        delete: "mesaj silindi",
        pin: "sabitleme değiştirildi",
        "moderator-add": "moderatör eklendi",
        "moderator-remove": "moderatör silindi",
      };
      const node = el("div", "audit-entry");
      node.textContent =
        new Date(entry.createdAt).toLocaleString("tr-TR") +
        " · " +
        entry.actor +
        " · " +
        (labels[entry.action] || entry.action) +
        " · " +
        entry.target;
      $("audit-list").append(node);
    }
  }
  async function loadModerators() {
    if (state.user?.role !== "admin") return;
    const result = await emit("getModerators");
    if (!result.success) {
      $("moderators-list").replaceChildren(
        el("p", "staff-empty", result.message),
      );
      return;
    }
    renderModerators(result);
  }
  function renderModerators(result) {
    $("staff-owner-name").textContent = state.user?.name || "Halit";
    $("staff-count").textContent = result.moderators.length + " MODERATÖR";
    $("moderators-list").replaceChildren();
    if (!result.moderators.length)
      $("moderators-list").append(
        el("div", "staff-empty", "Henüz bir moderatör eklenmemiş."),
      );
    for (const moderator of result.moderators) {
      const row = el("div", "staff-entry");
      row.append(avatar(moderator.name));
      const info = el("div", "staff-entry-info");
      info.append(el("strong", "", moderator.name));
      const status = el("small");
      status.append(
        el("span", "status-dot" + (moderator.online ? "" : " offline-dot")),
        document.createTextNode(
          moderator.online ? "Şu an çevrimiçi" : "Çevrimdışı",
        ),
      );
      info.append(status);
      row.append(info);
      if (result.canManage)
        row.append(
          button("Yetkisini kaldır", "button danger staff-remove", async () => {
            if (
              !confirm(
                moderator.name +
                " moderatörlükten çıkarılsın mı? Açık yetkili oturumu kapatılacak.",
              )
            )
              return;
            const response = await act("removeModerator", {
              name: moderator.name,
            });
            if (response.success) {
              renderModerators(response);
              toast("Moderatör yetkisi kaldırıldı.");
            }
          }),
        );
      else row.append(el("span", "role-badge mod", "MOD"));
      $("moderators-list").append(row);
    }
    $("staff-storage-badge").hidden = true;
    $("staff-storage-note").textContent = result.canManage
      ? "Moderatör ekleyebilir veya yetkisini kaldırabilirsin."
      : "Canlı düzenleme için kalıcı kayıt alanı gerekli.";
    $("moderator-form").hidden = !result.canManage;
    $("staff-repository-help").hidden = true;
  }
  $("moderators-button").addEventListener("click", () => {
    if (state.user?.role !== "admin") return;
    $("moderator-error").textContent = "";
    showDialog("moderators-dialog");
    loadModerators();
  });
  $("moderators-dialog").addEventListener("close", () => {
    $("moderator-password").value = "";
  });
  $("moderator-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("moderator-submit").disabled = true;
    $("moderator-error").textContent = "";
    const result = await emit("addModerator", {
      name: $("moderator-name").value,
      password: $("moderator-password").value,
    });
    $("moderator-submit").disabled = false;
    if (!result.success) {
      $("moderator-error").textContent = result.message;
      return;
    }
    $("moderator-form").reset();
    renderModerators(result);
    toast("Yeni moderatör eklendi. Kendi parolasıyla giriş yapabilir.");
  });
  $("admin-slowmode")?.addEventListener("change", async () => {
    const res = await act("setChannelState", {
      channel: state.channel,
      slowmodeSec: Number($("admin-slowmode").value) || 0,
    });
    if (res.success) {
      if (res.channelState) state.channelState = res.channelState;
      setMemberUI();
      toast("Yavaş mod ayarı güncellendi.");
    }
  });
  $("toggle-channel-lock")?.addEventListener("click", async () => {
    const locked = !!state.channelState?.[state.channel]?.locked;
    const res = await act("setChannelState", {
      channel: state.channel,
      locked: !locked,
    });
    if (res.success) {
      if (res.channelState) state.channelState = res.channelState;
      setMemberUI();
      syncAdminChannelControls();
      toast(!locked ? "Kanal kilitlendi." : "Kanal kilidi açıldı.");
    }
  });
  $("clear-games-btn")?.addEventListener("click", async () => {
    if (confirm("Açık tüm XOX, Blackjack ve Zar masaları kapatılsın mı?")) {
      const res = await act("moderate", { action: "clearGames" });
      if (res.success) {
        toast("Oyun lobisi sıfırlandı.");
        openAdmin();
      }
    }
  });
  $("announce-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = $("announce-text")?.value.trim();
    if (!text) return;
    const res = await act("announce", { text, channel: "all" });
    if (res.success) {
      $("announce-text").value = "";
      toast("Resmi duyuru yayınlandı.");
      openAdmin();
    }
  });
  $("clear-announce")?.addEventListener("click", async () => {
    const res = await act("announce", { text: "", channel: "all" });
    if (res.success) {
      toast("Aktif duyuru kaldırıldı.");
      openAdmin();
    }
  });
  $("clear-channel").addEventListener("click", async () => {
    if (
      confirm(
        "#" +
        channels[state.channel][0] +
        " kanalındaki tüm mesajlar silinsin mi?",
      )
    ) {
      const result = await act("moderate", {
        action: "clear",
        channel: state.channel,
      });
      if (result.success) {
        toast("Kanal temizlendi.");
        openAdmin();
      }
    }
  });
  $("join-top").addEventListener("click", () =>
    state.user
      ? rank[state.user.role] >= 1
        ? openAdmin()
        : logout()
      : openLogin(),
  );
  $("profile-button").addEventListener("click", () =>
    state.user ? logout() : openLogin(),
  );
  document
    .querySelectorAll("[data-close]")
    .forEach((b) =>
      b.addEventListener("click", () => $(b.dataset.close).close()),
    );
  for (const id of ["guide-button", "rules-footer"])
    $(id).addEventListener("click", () => showDialog("guide-dialog"));
  $("menu-button").addEventListener("click", () =>
    setMenu(!$("sidebar").classList.contains("open")),
  );
  $("sidebar-scrim").addEventListener("click", () => setMenu(false));
  function setMenu(open) {
    $("sidebar").classList.toggle("open", open);
    $("sidebar").inert = matchMedia("(max-width: 768px)").matches && !open;
    $("sidebar-scrim").hidden = !open;
    $("menu-button").setAttribute("aria-expanded", String(open));
    if (open) $("sidebar").querySelector(".nav-item.active")?.focus();
  }
  const menuMedia = matchMedia("(max-width: 768px)");
  menuMedia.addEventListener("change", () => setMenu(false));
  setMenu(false);
  const onlinePanel = document.querySelector(".online-panel");
  const peopleButton = button(
    "♙",
    "icon-button people-button",
    () => {
      $("people-content").append(onlinePanel);
      showDialog("people-dialog");
    },
    "Çevrimiçi kişileri göster",
  );
  peopleButton.innerHTML =
    '<svg class="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3"/></svg>';
  $("moderators-button").firstElementChild.innerHTML =
    '<svg class="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6L12 3Z"/><path d="m9 12 2 2 4-4"/></svg>';
  peopleButton.id = "people-button";
  $("theme-button").before(peopleButton);
  $("people-dialog").addEventListener("close", () =>
    document.querySelector(".right-rail").prepend(onlinePanel),
  );
  document.querySelectorAll("dialog").forEach((dialog) => {
    const heading = dialog.querySelector("h2");
    if (heading) {
      if (!heading.id) heading.id = dialog.id + "-title";
      dialog.setAttribute("aria-labelledby", heading.id);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setMenu(false);
    if (
      e.key === "/" &&
      !document.querySelector("dialog[open]") &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
    ) {
      e.preventDefault();
      $("message-search").focus();
    }
  });
  function syncUrlRoute(view, channel) {
    try {
      const url = new URL(location.href);
      url.searchParams.delete("sayfa");
      url.searchParams.delete("kanal");
      url.hash = "";
      if (view === "games") url.searchParams.set("sayfa", "oyunlar");
      else if (channel === "code") url.searchParams.set("kanal", "kod");
      const next = url.pathname + url.search;
      if (next !== location.pathname + location.search) {
        history.replaceState(null, "", next);
      }
    } catch { }
  }
  function navigate(view, channel = state.channel) {
    closeAllEmojiPickers();
    const safeChannel = channels[channel] ? channel : "general";
    if (state.user)
      state.socket.emit("typing", { channel: state.channel, isTyping: false });
    state.view = view;
    state.channel = safeChannel;
    state.pins = false;
    state.codeOnly = false;
    $("message-search").value = "";
    cancelReply();
    cancelEdit();
    $("chat-view").hidden = view !== "chat";
    $("games-view").hidden = view !== "games";
    document.body.classList.toggle("in-games", view === "games");
    document.body.classList.toggle(
      "in-blackjack",
      view === "games" && !!(state.table || state.diceTable || state.chessTable || state.okeyTable || state.tavlaTable || state.rouletteTable || state.slotHall || state.papazTable || state.pistiTable || state.batakTable || state.blofTable),
    );
    document.body.classList.toggle("in-okey", view === "games" && !!state.okeyTable);
    document.body.classList.toggle("in-tavla", view === "games" && !!state.tavlaTable);
    document.body.classList.toggle("in-roulette", view === "games" && !!state.rouletteTable);
    document.body.classList.toggle("in-slot", view === "games" && !!state.slotHall);
    document.body.classList.toggle("in-card-game", view === "games" && !!(state.papazTable || state.pistiTable || state.batakTable || state.blofTable));
    $("header-title").textContent =
      view === "games" ? "oyun-alanı" : channels[safeChannel][0];
    $("channel-title").textContent = channels[safeChannel][0];
    $("channel-description").textContent = channels[safeChannel][1];
    document.querySelectorAll(".nav-item").forEach((node) => {
      const active =
        view === "games"
          ? node.dataset.view === "games"
          : node.dataset.channel === safeChannel;
      node.classList.toggle("active", active);
      if (active) node.setAttribute("aria-current", "page");
      else node.removeAttribute("aria-current");
    });
    syncUrlRoute(view, safeChannel);
    if (view === "chat") {
      state.unreadByChannel[safeChannel] = 0;
      clearNotifications({ clearMini: true });
    } else {
      syncChannelBadges();
    }
    setMenu(false);
    setMemberUI();
    renderMessages(true);
    renderMiniChat();
    renderGame();
    renderLobby();
    renderTyping();
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  document
    .querySelectorAll("[data-channel]")
    .forEach((node) =>
      node.addEventListener("click", () =>
        navigate("chat", node.dataset.channel),
      ),
    );
  document
    .querySelector('[data-view="games"]')
    .addEventListener("click", () => navigate("games"));
  $("open-games")?.addEventListener("click", () =>
    navigate(state.view === "games" ? "chat" : "games"),
  );
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $("theme-button").textContent = theme === "dark" ? "☼" : "☾";
    $("theme-button").setAttribute(
      "aria-label",
      theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç",
    );
    document.querySelector('meta[name="theme-color"]').content =
      theme === "dark" ? "#101311" : "#f4f5ef";
    if (activeEmojiPopover?.picker) {
      activeEmojiPopover.picker.classList.toggle("light", theme === "light");
    }
  }
  try {
    applyTheme(
      localStorage.getItem("haking.theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    );
    $("nickname").value = localStorage.getItem("haking.nickname") || "";
  } catch {
    applyTheme("dark");
  }
  $("theme-button").addEventListener("click", () => {
    const theme =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(theme);
    try {
      localStorage.setItem("haking.theme", theme);
    } catch { }
  });
  function renderUsers() {
    const expanded = new Set(
      [...$("online-users").querySelectorAll("details[open]")].map(
        (d) => d.dataset.userId,
      ),
    );
    $("online-count").textContent = state.users.length;
    $("online-users").replaceChildren();
    if (!state.users.length) {
      $("online-users").append(
        el(
          "p",
          "rail-empty",
          state.user
            ? "Burası seninle canlanıyor."
            : "Katıldığında topluluk burada görünecek.",
        ),
      );
    }
    const sorted = [...state.users].sort(
      (a, b) =>
        rank[b.role] - rank[a.role] || a.name.localeCompare(b.name, "tr"),
    );
    for (const user of state.showAll ? sorted : sorted.slice(0, 7)) {
      const row = el("div", "user-row");
      row.append(avatar(user.name));
      const info = el("div", "user-info");
      info.append(
        el(
          "strong",
          "",
          user.name + (user.id === state.user?.id ? " · sen" : ""),
        ),
        el(
          "small",
          "",
          roles[user.role] + (user.isMuted ? " · Susturuldu" : ""),
        ),
      );
      row.append(info);
      if (state.user && user.id !== state.user.id && getCurrentActiveTableInfo()) {
        row.append(
          button(
            "📩 Davet",
            "user-invite-btn",
            async () => {
              const res = await act("gameInvite", { targetUserId: user.id });
              if (res.success) toast(`📩 ${user.name} oyuncusuna masa daveti gönderildi!`);
            },
            user.name + " oyuncusunu masaya davet et",
          ),
        );
      }
      if (state.user && rank[state.user.role] > rank[user.role]) {
        row.append(
          button(
            "⋯",
            "user-actions-trigger",
            () => openUserActions(user),
            user.name + " için işlemler",
          ),
        );
      }
      $("online-users").append(row);
    }
    $("people-toggle").hidden = sorted.length <= 7;
    $("people-toggle").textContent = state.showAll
      ? "Daha az göster ↑"
      : "Tümünü göster (" + sorted.length + ") ↓";
  }
  function openUserActions(user) {
    if (!state.user || rank[state.user.role] <= rank[user.role]) return;
    const dialog = $("user-actions-dialog");
    $("user-actions-name").textContent = user.name;
    const meta = $("user-actions-meta");
    if (meta) {
      if (user.isMuted) {
        const rem = user.muteUntil
          ? `${Math.max(1, Math.ceil((user.muteUntil - Date.now()) / 60000))} dk kaldı`
          : "Süresiz";
        meta.textContent =
          `Durum: Susturuldu (${rem})` +
          (user.muteReason ? ` · ${user.muteReason}` : "");
      } else {
        meta.textContent = `Rol: ${roles[user.role]}`;
      }
    }
    const muteBox = $("mute-options-box");
    if (muteBox) muteBox.hidden = !!user.isMuted;
    if ($("mute-reason")) $("mute-reason").value = "";
    const actions = $("user-actions-list");
    actions.replaceChildren();
    actions.append(
      button(user.isMuted ? "Sesi hemen aç" : "Sustur", "user-menu-action", () => {
        const durationMinutes = user.isMuted
          ? 0
          : Number($("mute-duration")?.value || 0);
        const reason = user.isMuted ? "" : ($("mute-reason")?.value || "").trim();
        dialog.close();
        act("moderate", {
          action: "mute",
          targetId: user.id,
          durationMinutes,
          reason,
        });
      }),
    );
    if (state.user.role === "admin")
      actions.append(
        button("Ad değiştir", "user-menu-action", () => {
          dialog.close();
          const name = prompt("Yeni takma ad:", user.name);
          if (name)
            act("moderate", {
              action: "rename",
              targetId: user.id,
              newName: name,
            });
        }),
      );
    actions.append(
      button("Odadan çıkar", "user-menu-action user-menu-danger", () => {
        dialog.close();
        if (confirm(user.name + " odadan çıkarılsın mı?"))
          act("moderate", { action: "kick", targetId: user.id });
      }),
    );
    showDialog("user-actions-dialog");
  }
  $("people-toggle").addEventListener("click", () => {
    state.showAll = !state.showAll;
    renderUsers();
  });
  function appendText(parent, text) {
    const pattern = /(https?:\/\/[^\s<>]+)/g;
    let offset = 0;
    for (const match of text.matchAll(pattern)) {
      parent.append(document.createTextNode(text.slice(offset, match.index)));
      let url;
      try {
        url = new URL(match[0]);
      } catch { }
      if (url && ["http:", "https:"].includes(url.protocol)) {
        const link = el("a", "", match[0]);
        link.href = url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer nofollow ugc";
        parent.append(link);
      } else parent.append(document.createTextNode(match[0]));
      offset = match.index + match[0].length;
    }
    parent.append(document.createTextNode(text.slice(offset)));
  }
  function renderMessages(scroll = false) {
    const list = $("messages"),
      previous = list.scrollTop;
    list.replaceChildren();
    const isCodeChannel = state.channel === "code";
    if (!isCodeChannel) state.codeOnly = false;
    $("code-tab").hidden = !isCodeChannel;
    $("code-count").textContent = [...state.messages.values()].filter(
      (m) => m.channel === state.channel && m.type === "code",
    ).length;
    $("all-tab").classList.toggle("active", !state.codeOnly && !state.pins);
    $("pins-tab").classList.toggle("active", state.pins);
    $("code-tab").classList.toggle("active", state.codeOnly && isCodeChannel);
    $("pin-filter").setAttribute("aria-pressed", String(state.pins));
    $("pin-filter").classList.toggle("admin-open", state.pins);
    const query = $("message-search").value.trim().toLocaleLowerCase("tr");
    const messages = [...state.messages.values()].filter(
      (m) =>
        m.channel === state.channel &&
        (!state.codeOnly || m.type === "code") &&
        (!state.pins || m.pinned) &&
        (!query ||
          [m.message, m.name, m.title || ""]
            .join(" ")
            .toLocaleLowerCase("tr")
            .includes(query)),
    );
    if (!messages.length) {
      const empty = el("div", "empty-state");
      empty.append(
        el(
          "span",
          "empty-mark",
          state.codeOnly ? "</>" : state.pins ? "⌖" : "#",
        ),
        el(
          "h3",
          "",
          query || state.pins
            ? "Burada henüz bir mesaj yok."
            : state.user
              ? "İlk sözü sen söyle."
              : "Güzel sohbetlerin başlangıcı.",
        ),
        el(
          "p",
          "",
          query
            ? "Farklı bir kelimeyle aramayı dene."
            : state.pins
              ? "Yetkililerin sabitlediği mesajlar burada görünür."
              : state.codeOnly
                ? "Bir çözüm paylaş. Bir sonraki fikre ilham ol."
                : "Yeni fikirler bir “merhaba” ile başlar.",
        ),
      );
      if (!query && !state.pins)
        empty.append(
          button(
            state.user
              ? state.codeOnly
                ? "Kodunu paylaş ↗"
                : "Bir merhaba yaz ↗"
              : "Sohbete katıl ↗",
            "button secondary",
            () =>
              state.user
                ? state.codeOnly
                  ? openCode()
                  : $("message-input").focus()
                : openLogin(),
          ),
        );
      list.append(empty);
    }
    for (const message of messages) list.append(renderMessage(message));
    if (scroll) list.scrollTop = list.scrollHeight;
    else list.scrollTop = previous;
  }
  function renderMessage(m) {
    const mentioned = state.user && isMentionedIn(m.message, state.user.name);
    const node = el(
      "article",
      "message" + (m.pinned ? " pinned" : "") + (mentioned ? " is-mentioned" : ""),
    );
    node.dataset.messageId = m.id;
    node.append(avatar(m.name));
    const main = el("div", "message-main");
    if (m.pinned) main.append(el("div", "pin-label", "⌖ SABİTLENMİŞ MESAJ"));
    const meta = el("div", "message-meta");
    meta.append(el("strong", "", m.name));
    if (m.role !== "user")
      meta.append(el("span", "role-badge " + m.role, roles[m.role]));
    const time = el(
      "time",
      "",
      m.time ||
      new Date(m.createdAt).toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
    time.dateTime = m.createdAt;
    meta.append(time);
    if (m.editedAt) meta.append(el("span", "edited-label", "düzenlendi"));
    main.append(meta);
    if (m.replyTo)
      main.append(
        el(
          "div",
          "message-reply",
          "↳ " + m.replyTo.name + ": " + m.replyTo.message,
        ),
      );
    if (m.type === "code") main.append(renderSnippet(m));
    else if (m.type === "invite" && m.invite) {
      const card = el("div", "chat-invite-card");
      const info = el("div", "chat-invite-info");
      info.append(
        el("strong", "", `🎮 ${m.invite.label} · ${m.invite.seatsText || ""}`),
        el("small", "", m.message),
      );
      const joinBtn = button(
        "Masaya Katıl →",
        "button small primary",
        () => joinTableByInvite(m.invite),
        "Davet edilen oyun masasına katıl",
      );
      card.append(info, joinBtn);
      main.append(card);
    } else {
      const body = el("div", "message-body");
      appendText(body, m.message);
      main.append(body);
    }
      const actions = el("div", "message-actions");
      for (const emoji of Object.keys(m.reactions || {})) {
        const ids = m.reactions?.[emoji] || [];
        if (ids.length)
          actions.append(
            button(
              emoji + " " + ids.length,
              "message-action" + (ids.includes(state.user?.id) ? " reacted" : ""),
              () => {
                if (requireUser()) act("reactMessage", { msgId: m.id, emoji });
              },
              emoji + " tepkisi",
            ),
          );
      }
      if (state.user) {
        actions.append(
          button("↳ Yanıtla", "message-action", () => {
            state.reply = m.id;
            state.editing = null;
            showReply(m);
            $("message-input").focus();
          }),
          button("☺ Tepki", "message-action", (ev) =>
            toggleReactions(actions, m, ev.currentTarget),
          ),
        );
        if (m.senderId === state.user.id)
          actions.append(
            button("Düzenle", "message-action", () => editMessage(m)),
          );
        if (m.senderId === state.user.id || rank[state.user.role] > rank[m.role])
          actions.append(
            button("Sil", "message-action", () => {
              if (confirm("Bu mesaj silinsin mi?"))
                act("deleteMessage", { msgId: m.id });
            }),
          );
        if (rank[state.user.role] >= 1)
          actions.append(
            button(
              m.pinned ? "Sabitlemeyi kaldır" : "Sabitle",
              "message-action",
              () => act("pinMessage", { msgId: m.id }),
            ),
          );
      }
      if (actions.children.length) main.append(actions);
      node.append(main);
      return node;
    }
    function toggleReactions(parent, m, anchorBtn = null) {
      const previous = parent.querySelector(".emoji-picker");
      if (previous) {
        closeQuickReactionPicker();
        return;
      }
      if (anchorBtn && activeEmojiPopover?.anchor === anchorBtn) {
        closeAllEmojiPickers();
        return;
      }
      closeAllEmojiPickers();
      const picker = el("div", "emoji-picker");
      for (const emoji of quickReactions)
        picker.append(
          button(
            emoji,
            "",
            () => {
              closeQuickReactionPicker();
              act("reactMessage", { msgId: m.id, emoji });
            },
            emoji + " ekle",
          ),
        );
      const moreBtn = button(
        "＋",
        "reaction-add-more",
        () => {
          const anchor = anchorBtn || parent;
          closeQuickReactionPicker();
          openEmojiPopover(
            anchor,
            (emoji) => act("reactMessage", { msgId: m.id, emoji }),
            "Tepki seç",
          );
        },
        "Tüm emojilerden seç",
      );
      const closeQuickBtn = button(
        "×",
        "reaction-close-btn",
        () => closeQuickReactionPicker(),
        "Tepki menüsünü kapat",
      );
      picker.append(moreBtn, closeQuickBtn);
      parent.append(picker);

      const onOutside = (e) => {
        const path = typeof e.composedPath === "function" ? e.composedPath() : [];
        const inPicker = path.includes(picker) || picker.contains(e.target);
        const inAnchor = anchorBtn && (path.includes(anchorBtn) || anchorBtn.contains(e.target));
        if (!inPicker && !inAnchor) closeQuickReactionPicker();
      };
      const onEsc = (e) => {
        if (e.key === "Escape") closeQuickReactionPicker();
      };
      document.addEventListener("pointerdown", onOutside, true);
      document.addEventListener("keydown", onEsc, true);
      activeQuickReaction = {
        el: picker,
        anchor: anchorBtn,
        cleanup: () => {
          document.removeEventListener("pointerdown", onOutside, true);
          document.removeEventListener("keydown", onEsc, true);
        },
      };
    }
    async function copy(text) {
      try {
        await navigator.clipboard.writeText(text);
        toast("Kod panoya kopyalandı.");
      } catch {
        toast("Panoya erişilemedi. Kodu seçerek kopyalayabilirsin.", true);
      }
    }
    function renderSnippet(m) {
      const snippet = el("div", "snippet"),
        header = el("div", "snippet-header"),
        title = el("div");
      title.append(
        el("strong", "snippet-title", m.title || "Kod parçası"),
        el("span", "snippet-language", m.language || "plaintext"),
      );
      const tools = el("div", "snippet-tools");
      tools.append(
        button("Kopyala", "", () => copy(m.message)),
        button("İndir", "", () => downloadSnippet(m)),
      );
      header.append(title, tools);
      const pre = el("pre"),
        code = el("code", "", m.message);
      if (window.hljs) {
        const language = window.hljs.getLanguage(m.language)
          ? m.language
          : "plaintext";
        code.className = "hljs language-" + language;
        code.innerHTML = window.hljs.highlight(m.message, {
          language,
          ignoreIllegals: true,
        }).value;
      }
      pre.append(code);
      snippet.append(header, pre);
      return snippet;
    }
    function downloadSnippet(m) {
      const extensions = {
        javascript: "js",
        typescript: "ts",
        python: "py",
        html: "html",
        css: "css",
        json: "json",
        sql: "sql",
        bash: "sh",
        java: "java",
        cpp: "cpp",
        plaintext: "txt",
      };
      const blob = new Blob([m.message], { type: "text/plain;charset=utf-8" }),
        url = URL.createObjectURL(blob),
        a = el("a");
      a.href = url;
      a.download =
        (m.title || "haking-kod").replace(/[^\p{L}\p{N}_-]/gu, "-").slice(0, 60) +
        "." +
        (extensions[m.language] || "txt");
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    $("message-search").addEventListener("input", () => renderMessages());
    $("all-tab").addEventListener("click", () => {
      state.codeOnly = false;
      state.pins = false;
      renderMessages();
    });
    $("pins-tab").addEventListener("click", () => {
      state.pins = !state.pins;
      if (state.pins) state.codeOnly = false;
      renderMessages();
    });
    $("code-tab").addEventListener("click", () => {
      if (state.channel !== "code") return;
      state.codeOnly = true;
      state.pins = false;
      renderMessages();
    });
    $("pin-filter").addEventListener("click", () => {
      state.pins = !state.pins;
      if (state.pins) state.codeOnly = false;
      renderMessages();
    });
    function showReply(m) {
      $("reply-preview").hidden = false;
      $("reply-preview").firstElementChild.textContent =
        (state.editing ? "Düzenleniyor: " : "Yanıt: " + m.name + " · ") +
        m.message.slice(0, 100);
    }
    function cancelReply() {
      state.reply = null;
      $("reply-preview").hidden = true;
    }
    function cancelEdit() {
      if (state.editing) {
        state.editing = null;
        $("message-input").value = "";
        $("message-input").maxLength = 4000;
        $("reply-preview").hidden = true;
        $("send-button").textContent = "Gönder ↑";
        updateCount();
      }
    }
    $("cancel-reply").addEventListener("click", () => {
      cancelReply();
      cancelEdit();
    });
    function editMessage(m) {
      cancelEdit();
      cancelReply();
      if (m.type === "code") {
        state.editing = m.id;
        $("snippet-title").value = m.title || "Kod parçası";
        $("snippet-language").value = m.language;
        $("snippet-title").disabled = true;
        $("snippet-language").disabled = true;
        $("snippet-code").value = m.message;
        $("code-error").textContent = "";
        $("code-submit").textContent = "Değişiklikleri kaydet";
        showDialog("code-dialog");
        return;
      }
      state.reply = null;
      state.editing = m.id;
      $("message-input").value = m.message;
      $("message-input").maxLength = 12000;
      showReply(m);
      $("send-button").textContent = "Kaydet ↑";
      updateCount();
      $("message-input").focus();
    }
    $("code-dialog").addEventListener("close", () => {
      if (state.editing && state.messages.get(state.editing)?.type === "code")
        state.editing = null;
    });
    function openCode() {
      if (!requireUser()) return;
      cancelEdit();
      state.editing = null;
      $("snippet-title").value = "";
      $("snippet-title").disabled = false;
      $("snippet-language").disabled = false;
      $("snippet-code").value = "";
      $("code-error").textContent = "";
      $("code-submit").textContent = "Kodu paylaş ↗";
      showDialog("code-dialog");
    }
    for (const id of ["code-button", "share-code-rail"])
      $(id)?.addEventListener("click", openCode);
    $("code-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!requireUser()) return;
      const editId = state.editing;
      $("code-submit").disabled = true;
      const data = {
        message: $("snippet-code").value,
        type: "code",
        language: $("snippet-language").value,
        title: $("snippet-title").value,
        channel: "code",
      };
      const result = await emit(
        editId ? "editMessage" : "sendMessage",
        editId ? { msgId: editId, message: data.message } : data,
      );
      $("code-submit").disabled = false;
      if (!result.success) {
        $("code-error").textContent = result.message;
        return;
      }
      state.editing = null;
      $("code-dialog").close();
      navigate("chat", "code");
      toast(editId ? "Kod güncellendi." : "Kodun toplulukla paylaşıldı.");
    });
    function updateCount() {
      $("character-count").textContent =
        $("message-input").value.length + " / " + $("message-input").maxLength;
    }
    bindMentionAutocomplete($("message-input"), $("mention-suggest"));
    let typingTimer,
      lastTyping = 0;
    $("message-input").addEventListener("input", () => {
      updateCount();
      if (!state.user) return;
      if (Date.now() - lastTyping > 2000) {
        state.socket.emit("typing", { channel: state.channel, isTyping: true });
        lastTyping = Date.now();
      }
      clearTimeout(typingTimer);
      typingTimer = setTimeout(
        () =>
          state.socket?.emit("typing", {
            channel: state.channel,
            isTyping: false,
          }),
        2000,
      );
    });
    $("message-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        $("message-form").requestSubmit();
      }
    });
    let sending = false;
    $("message-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      closeAllEmojiPickers();
      if (!requireUser() || sending) return;
      const value = $("message-input").value;
      if (!value.trim()) return;
      sending = true;
      $("send-button").disabled = true;
      const result = await act(
        state.editing ? "editMessage" : "sendMessage",
        state.editing
          ? { msgId: state.editing, message: value }
          : {
            message: value,
            channel: state.channel,
            replyTo: state.reply,
            type: "text",
          },
      );
      sending = false;
      if (result.success) {
        cancelReply();
        cancelEdit();
        $("message-input").value = "";
        $("message-input").maxLength = 4000;
        updateCount();
        state.socket.emit("typing", { channel: state.channel, isTyping: false });
        $("message-input").focus();
      }
      setMemberUI();
    });
    function insertEmojiIntoInput(input, emoji, onDone) {
      if (!input || input.disabled) return;
      const start = typeof input.selectionStart === "number" ? input.selectionStart : input.value.length;
      const end = typeof input.selectionEnd === "number" ? input.selectionEnd : input.value.length;
      const nextLen = input.value.length - (end - start) + emoji.length;
      if (nextLen <= (input.maxLength || 4000)) {
        input.setRangeText(emoji, start, end, "end");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        onDone?.();
        input.focus();
      }
    }
    $("emoji-button").addEventListener("click", (ev) => {
      if (!requireUser()) return;
      openEmojiPopover(ev.currentTarget, (emoji) => {
        insertEmojiIntoInput($("message-input"), emoji, updateCount);
      });
    });
    function renderTyping() {
      for (const [id, t] of state.typing)
        if (t.until < Date.now()) state.typing.delete(id);
      const names = [...state.typing.values()]
        .filter((t) => t.channel === state.channel)
        .map((t) => t.name);
      $("typing-status").textContent = names.length
        ? names.slice(0, 2).join(", ") +
        (names.length > 2 ? " ve diğerleri" : "") +
        " yazıyor…"
        : "";
    }
    setInterval(renderTyping, 1000);
    function updateSfxButton() {
      const btn = $("sfx-toggle");
      if (!btn) return;
      const muted = isSfxMuted();
      btn.textContent = muted ? "🔇 Ses kapalı" : "🔊 Ses açık";
      btn.setAttribute("aria-pressed", String(!muted));
    }
    updateSfxButton();
    $("sfx-toggle")?.addEventListener("click", () => {
      toggleSfxMute();
      updateSfxButton();
    });

    async function gameAction(event, data = {}) {
      if (!requireUser() || state.pendingGame) return;
      state.pendingGame = true;
      try {
        const result = await act(event, data);
        if (result.success && result.game) {
          clearAllOtherGames("xox");
          state.game = result.game;
          renderGame();
        }
      } finally {
        state.pendingGame = false;
      }
    }

    async function bjCommand(event, data = {}) {
      if (!requireUser() || state.pendingGame) return;
      state.pendingGame = true;
      try {
        const result = await act(event, data);
        if (result.success && result.table) {
          clearAllOtherGames("blackjack");
          resetXoxSoundState();
          state.table = result.table;
          renderGame();
        }
      } finally {
        state.pendingGame = false;
      }
    }

    async function diceCommand(event, data = {}) {
      if (!requireUser() || state.pendingGame) return;
      state.pendingGame = true;
      try {
        const result = await act(event, data);
        const nextTable = result.table || result.diceTable;
        if (result.success && nextTable) {
          clearAllOtherGames("dice");
          resetXoxSoundState();
          state.diceTable = nextTable;
          renderGame();
        }
      } finally {
        state.pendingGame = false;
      }
    }

    async function chessCommand(event, data = {}) {
      if (!requireUser() || state.pendingGame) return;
      state.pendingGame = true;
      try {
        const result = await act(event, data);
        if (result.success && result.table) {
          clearAllOtherGames("chess");
          resetXoxSoundState();
          state.chessTable = result.table;
          syncActiveChessSession(result.table);
          renderGame();
        }
      } finally {
        state.pendingGame = false;
      }
    }

    async function okeyCommand(event, data = {}) {
      if (!requireUser() || state.pendingGame) return;
      state.pendingGame = true;
      try {
        const result = await act(event, data);
        if (result.success && result.table) {
          clearAllOtherGames("okey");
          resetXoxSoundState();
          state.okeyTable = result.table;
          renderGame();
        }
      } finally {
        state.pendingGame = false;
      }
    }

    async function tavlaCommand(event, data = {}) {
      if (!requireUser() || state.pendingGame) return;
      state.pendingGame = true;
      try {
        const result = await act(event, data);
        if (result.success && result.table) {
          clearAllOtherGames("tavla");
          resetXoxSoundState();
          state.tavlaTable = result.table;
          syncActiveTavlaSession(result.table);
          renderGame();
        }
      } finally {
        state.pendingGame = false;
      }
    }

    async function rouletteCommand(event, data = {}) {
      if (!requireUser() || state.pendingGame) return;
      state.pendingGame = true;
      try {
        const result = await act(event, data);
        if (result.success && result.table) {
          clearAllOtherGames("roulette");
          resetXoxSoundState();
          state.rouletteTable = result.table;
          renderGame();
        }
      } finally {
        state.pendingGame = false;
      }
    }

    async function slotCommand(event, data = {}) {
      if (!requireUser() || state.pendingGame) return;
      state.pendingGame = true;
      try {
        const result = await act(event, data);
        if (result.success && result.hall) {
          clearAllOtherGames("slot");
          resetXoxSoundState();
          state.slotHall = result.hall;
          renderGame();
        }
      } finally {
        state.pendingGame = false;
      }
    }

    async function cardCommand(kind, event, data = {}) {
      if (!requireUser() || state.pendingGame) return;
      state.pendingGame = true;
      try {
        const result = await act(event, data);
        if (result.success && result.table) {
          clearAllOtherGames(kind);
          resetXoxSoundState();
          if (kind === "papaz") state.papazTable = result.table;
          else if (kind === "pisti") state.pistiTable = result.table;
          else if (kind === "batak") state.batakTable = result.table;
          else if (kind === "blof") state.blofTable = result.table;
          renderGame();
        }
      } finally {
        state.pendingGame = false;
      }
    }

    async function leaveBlackjack() {
      if (!state.table) return;
      const inHand = state.table.seats?.some(
        (s) => s && s.userId === state.socket?.id && s.activeInRound,
      );
      if (
        state.table.status === "playing" &&
        inHand &&
        !confirm("Aktif el bitmeden kalkarsan elin otomatik durdurulacak. Kalkmak istiyor musun?")
      )
        return;
      const result = await act("bjLeave", { tableId: state.table.id });
      if (result.success) {
        state.table = null;
        if (bjArena) {
          bjArena.dispose();
          bjArena = null;
        }
        renderGame();
      }
    }

    async function leaveDice() {
      if (!state.diceTable) return;
      if (
        state.diceTable.status === "playing" &&
        !confirm("Aktif zar düellosu bitmeden ayrılmak istiyor musun?")
      )
        return;
      const result = await act("diceLeave", { tableId: state.diceTable.id });
      if (result.success) {
        state.diceTable = null;
        if (diceArena) {
          diceArena.dispose();
          diceArena = null;
        }
        renderGame();
      }
    }

    async function leaveChess() {
      if (!state.chessTable) return;
      const isPlayer = state.chessTable.seats?.some(
        (s) => s && !s.isBot && s.userId === state.socket?.id,
      );
      if (
        isPlayer &&
        state.chessTable.status === "playing" &&
        !confirm("Devam eden satranç oyunundan ayrılırsan mağlup sayılırsın. Kalkmak istiyor musun?")
      )
        return;
      const result = await act("chessLeave", { tableId: state.chessTable.id });
      if (result.success) {
        state.chessTable = null;
        clearActiveChessSession();
        if (chessArena) {
          chessArena.dispose();
          chessArena = null;
        }
        renderGame();
      }
    }

    async function leaveOkey() {
      if (!state.okeyTable) return;
      const isPlayer = state.okeyTable.mySeat !== -1;
      if (
        isPlayer &&
        state.okeyTable.status === "playing" &&
        !confirm(
          "Masadan kalkarsan yerine 🤖 Akıllı Bot devralır ve oyun devam eder. İstersen başka bir izleyici de botun koltuğuna oturabilir. Kalkmak istiyor musun?",
        )
      )
        return;
      const result = await act("okeyLeave", { tableId: state.okeyTable.id });
      if (result.success) {
        state.okeyTable = null;
        if (okeyArena) {
          okeyArena.dispose();
          okeyArena = null;
        }
        renderGame();
      }
    }

    async function leaveTavla() {
      if (!state.tavlaTable) return;
      const isPlayer = state.tavlaTable.seats?.some(
        (s) => s && !s.isBot && s.userId === state.socket?.id,
      );
      if (
        isPlayer &&
        (state.tavlaTable.status === "playing" || state.tavlaTable.status === "hand_finished") &&
        !confirm("Devam eden tavla maçından kalkarsan mağlup sayılırsın. Ayrılmak istiyor musun?")
      )
        return;
      const result = await act("tavlaLeave", { tableId: state.tavlaTable.id });
      if (result.success) {
        state.tavlaTable = null;
        clearActiveTavlaSession();
        if (tavlaArena) {
          tavlaArena.dispose();
          tavlaArena = null;
        }
        renderGame();
      }
    }

    async function leaveRoulette() {
      if (!state.rouletteTable) return;
      const result = await act("rouletteLeave", { tableId: state.rouletteTable.id });
      if (result.success) {
        state.rouletteTable = null;
        if (rouletteArena) {
          rouletteArena.dispose();
          rouletteArena = null;
        }
        renderGame();
      }
    }

    async function leaveSlot() {
      if (!state.slotHall) return;
      const result = await act("slotLeave", { hallId: state.slotHall.id });
      if (result.success) {
        state.slotHall = null;
        if (slotArena) {
          slotArena.dispose();
          slotArena = null;
        }
        renderGame();
      }
    }

    async function leaveCardGame(kind) {
      const meta = {
        papaz: { key: "papazTable", event: "papazLeave", confirmMsg: "Devam eden Papaz Kimde masasından çıkmak istiyor musun? (Kalan oyuncular için yerine Bot devralır)" },
        pisti: { key: "pistiTable", event: "pistiLeave", confirmMsg: "Devam eden Pişti masasından çıkmak istiyor musun?" },
        batak: { key: "batakTable", event: "batakLeave", confirmMsg: "Devam eden Batak masasından çıkmak istiyor musun?" },
        blof: { key: "blofTable", event: "blofLeave", confirmMsg: "Devam eden Blöf masasından kalkmak istiyor musun? (Kalan oyuncular için yerine Bot geçer)" },
      }[kind];
      if (!meta) return;
      const tbl = state[meta.key];
      if (!tbl) return;
      const isPlayer = tbl.mySeatIndex >= 0 || (kind === "blof" && (tbl.seats || []).some((s) => s && s.id === state.socket?.id));
      const humanCount = (tbl.seats || []).filter((s) => s && !s.isBot && !s.disconnected).length;
      if (isPlayer && humanCount > 1 && !["waiting", "finished"].includes(tbl.status) && !confirm(meta.confirmMsg)) {
        return;
      }
      const result = await act(meta.event, { tableId: tbl.id });
      if (result.success) {
        state[meta.key] = null;
        if (kind === "papaz" && papazArena) { papazArena.dispose(); papazArena = null; }
        if (kind === "pisti" && pistiArena) { pistiArena.dispose(); pistiArena = null; }
        if (kind === "batak" && batakArena) { batakArena.dispose(); batakArena = null; }
        if (kind === "blof" && blofArena) { blofArena.dispose(); blofArena = null; }
        renderGame();
      }
    }

    function ensureBjArena() {
      if (!state.table) return;
      if (bjArena) {
        bjArena.update(state.table, state.socket?.id);
        return;
      }
      bjModulePromise ||= import("./games/blackjack3d.mjs");
      bjModulePromise
        .then(({ BlackjackArena }) => {
          if (!state.table || bjArena) return;
          bjArena = new BlackjackArena($("active-blackjack"), {
            onLeave: leaveBlackjack,
            onSwitchSeat: (seatIndex) =>
              bjCommand("bjJoin", { tableId: state.table?.id, seatIndex }),
            onBet: (amount) =>
              emit("bjBet", { tableId: state.table?.id, amount }).then((r) => {
                if (!r.success) toast(r.message, true);
                else if (r.table) {
                  state.table = r.table;
                  renderGame();
                }
              }),
            onRebuy: () => bjCommand("bjRebuy", { tableId: state.table?.id }),
            onStart: () => bjCommand("bjStart", { tableId: state.table?.id }),
            onAction: (action) =>
              bjCommand("bjAction", { tableId: state.table?.id, action }),
            onReact: (emoji) =>
              emit("bjReact", { tableId: state.table?.id, emoji }).then((r) => {
                if (!r.success) toast(r.message, true);
              }),
          });
          bjArena.update(state.table, state.socket?.id);
          window.scrollTo({ top: 0, behavior: "instant" });
        })
        .catch(() => {
          toast("3D Blackjack sahnesi yüklenemedi.", true);
        });
    }

    function ensureDiceArena() {
      if (!state.diceTable) return;
      if (diceArena) {
        diceArena.update(state.diceTable, state.socket?.id);
        return;
      }
      diceModulePromise ||= import("./games/dice3d.mjs");
      diceModulePromise
        .then(({ DiceArena }) => {
          if (!state.diceTable || diceArena) return;
          diceArena = new DiceArena($("active-dice"), {
            onLeave: leaveDice,
            onHelp: () => showDialog("dice-help-dialog"),
            onSwitchSeat: (seatIndex) =>
              diceCommand("diceJoin", { tableId: state.diceTable?.id, seatIndex }),
            onConfig: (cfg) =>
              diceCommand("diceConfig", { tableId: state.diceTable?.id, ...cfg }),
            onStart: (opts = {}) =>
              diceCommand("diceStart", { tableId: state.diceTable?.id, ...opts }),
            onRoll: () => diceCommand("diceRoll", { tableId: state.diceTable?.id }),
            onCommit: ({ indices, mode }) =>
              diceCommand("diceCommit", {
                tableId: state.diceTable?.id,
                indices,
                mode,
              }),
            onReact: (emoji) =>
              emit("diceReact", { tableId: state.diceTable?.id, emoji }).then((r) => {
                if (!r.success) toast(r.message, true);
              }),
          });
          diceArena.update(state.diceTable, state.socket?.id);
          window.scrollTo({ top: 0, behavior: "instant" });
        })
        .catch(() => {
          toast("3D Zar Düellosu sahnesi yüklenemedi.", true);
        });
    }

    function ensureChessArena() {
      if (!state.chessTable) return;
      if (chessArena) {
        chessArena.user = { id: state.socket?.id, name: state.user?.name };
        chessArena.update(state.chessTable);
        return;
      }
      chessModulePromise ||= import("./games/chess3d.mjs");
      chessModulePromise
        .then(({ ChessArena }) => {
          if (!state.chessTable || chessArena) return;
          chessArena = new ChessArena(
            $("active-chess"),
            { id: state.socket?.id, name: state.user?.name },
            {
              onLeave: leaveChess,
              onSit: () =>
                chessCommand("chessJoin", { tableId: state.chessTable?.id }),
              onConfig: (cfg) =>
                chessCommand("chessConfig", { tableId: state.chessTable?.id, ...cfg }),
              onMove: ({ from, to, promotion }) =>
                chessCommand("chessMove", {
                  tableId: state.chessTable?.id,
                  from,
                  to,
                  promotion,
                }),
              onAction: (action) =>
                chessCommand("chessAction", { tableId: state.chessTable?.id, action }),
              onReact: (emoji) =>
                emit("chessReact", { tableId: state.chessTable?.id, emoji }).then((r) => {
                  if (!r.success) toast(r.message, true);
                }),
            },
          );
          chessArena.update(state.chessTable);
          window.scrollTo({ top: 0, behavior: "instant" });
        })
        .catch(() => {
          toast("3D Satranç sahnesi yüklenemedi.", true);
        });
    }

    function ensureOkeyArena() {
      if (!state.okeyTable) return;
      if (okeyArena) {
        okeyArena.user = { id: state.socket?.id, name: state.user?.name };
        okeyArena.update(state.okeyTable, state.socket?.id);
        return;
      }
      okeyModulePromise ||= import("./games/okey3d.mjs");
      okeyModulePromise
        .then(({ OkeyArena }) => {
          if (!state.okeyTable || okeyArena) return;
          okeyArena = new OkeyArena(
            $("active-okey"),
            { id: state.socket?.id, name: state.user?.name },
            {
              onLeave: leaveOkey,
              onHelp: (variant) =>
                showDialog(variant === "101" ? "okey101-help-dialog" : "okey-help-dialog"),
              onJoinSeat: (seatIndex) =>
                okeyCommand("okeyJoin", { tableId: state.okeyTable?.id, seatIndex }),
              onTakeBotSeat: (seatIndex) =>
                okeyCommand("okeyTakeBotSeat", { tableId: state.okeyTable?.id, seatIndex }),
              onFillBots: (count) =>
                okeyCommand("okeyFillBots", { tableId: state.okeyTable?.id, count }),
              onRemoveBots: () =>
                okeyCommand("okeyRemoveBots", { tableId: state.okeyTable?.id }),
              onInvite: () => sendChannelGameInvite(),
              onAction: (payload) =>
                okeyCommand("okeyAction", { tableId: state.okeyTable?.id, ...payload }),
              onArrange: (payload) =>
                emit("okeyArrange", { tableId: state.okeyTable?.id, ...payload }).then((r) => {
                  if (!r.success) toast(r.message, true);
                  else if (r.table) {
                    state.okeyTable = r.table;
                    renderGame();
                  }
                }),
              onReact: (emoji) =>
                emit("okeyReact", { tableId: state.okeyTable?.id, emoji }).then((r) => {
                  if (!r.success) toast(r.message, true);
                }),
            },
          );
          okeyArena.update(state.okeyTable, state.socket?.id);
          window.scrollTo({ top: 0, behavior: "instant" });
        })
        .catch(() => {
          toast("3D Okey sahnesi yüklenemedi.", true);
        });
    }

    function ensureTavlaArena() {
      if (!state.tavlaTable) return;
      const isSpec = !state.tavlaTable.seats?.some(
        (s) => s && !s.isBot && s.userId === state.socket?.id,
      );
      const me = { id: state.socket?.id, name: state.user?.name };
      if (tavlaArena) {
        tavlaArena.update(state.tavlaTable, me, { spectator: isSpec });
        return;
      }
      tavlaModulePromise ||= import("./games/tavla3d.mjs");
      tavlaModulePromise
        .then(({ TavlaArena }) => {
          if (!state.tavlaTable || tavlaArena) return;
          tavlaArena = new TavlaArena($("active-tavla"), {
            onLeave: leaveTavla,
            onHelp: () => showDialog("tavla-help-dialog"),
            onConfig: (cfg) =>
              tavlaCommand("tavlaConfig", { tableId: state.tavlaTable?.id, ...cfg }),
            onRoll: () =>
              tavlaCommand("tavlaRoll", { tableId: state.tavlaTable?.id }),
            onMove: ({ from, to, die }) =>
              tavlaCommand("tavlaMove", {
                tableId: state.tavlaTable?.id,
                from,
                to,
                die,
              }),
            onAction: (action) =>
              tavlaCommand("tavlaAction", { tableId: state.tavlaTable?.id, action }),
            onReact: (emoji) =>
              emit("tavlaReact", { tableId: state.tavlaTable?.id, emoji }).then((r) => {
                if (!r.success) toast(r.message, true);
              }),
          });
          const specNow = !state.tavlaTable.seats?.some(
            (s) => s && !s.isBot && s.userId === state.socket?.id,
          );
          tavlaArena.update(
            state.tavlaTable,
            { id: state.socket?.id, name: state.user?.name },
            { spectator: specNow },
          );
          window.scrollTo({ top: 0, behavior: "instant" });
        })
        .catch(() => {
          toast("3D Tavla sahnesi yüklenemedi.", true);
        });
    }

    function ensureRouletteArena() {
      if (!state.rouletteTable) return;
      const isSpec = !state.rouletteTable.seats?.some(
        (s) => s && s.userId === state.socket?.id,
      );
      if (rouletteArena) {
        rouletteArena.update(state.rouletteTable, state.socket?.id, { spectator: isSpec });
        return;
      }
      rouletteModulePromise ||= import("./games/roulette3d.mjs");
      rouletteModulePromise
        .then(({ RouletteArena }) => {
          if (!state.rouletteTable || rouletteArena) return;
          const sendBetAction = (event, payload) => {
            if (!requireUser()) return;
            emit(event, { tableId: state.rouletteTable?.id, ...payload }).then((r) => {
              if (!r.success) toast(r.message, true);
              else if (r.table) {
                state.rouletteTable = r.table;
                renderGame();
              }
            });
          };
          rouletteArena = new RouletteArena($("active-roulette"), {
            onLeave: leaveRoulette,
            onHelp: () => showDialog("roulette-help-dialog"),
            onBet: (bets) => sendBetAction("rouletteBet", { bets }),
            onRemoveSpot: (key, amount = null) =>
              sendBetAction("rouletteRemoveBet", { key, amount }),
            onCallBet: ({ callName, unitAmount }) =>
              sendBetAction("rouletteBet", { callName, unitAmount }),
            onNeighborsBet: ({ neighborsCenter, unitAmount, radius }) =>
              sendBetAction("rouletteBet", { neighborsCenter, unitAmount, radius }),
            onUndo: () => sendBetAction("rouletteUndo", {}),
            onClear: () => sendBetAction("rouletteClear", {}),
            onRebet: () => sendBetAction("rouletteRebet", {}),
            onDouble: () => sendBetAction("rouletteDouble", {}),
            onHalve: () => sendBetAction("rouletteHalve", {}),
            onRebuy: () => sendBetAction("rouletteRebuy", {}),
            onReact: (emoji) =>
              emit("rouletteReact", { tableId: state.rouletteTable?.id, emoji }).then((r) => {
                if (!r.success) toast(r.message, true);
              }),
            onSpectateToggle: (toSpec) =>
              rouletteCommand(toSpec ? "rouletteSpectate" : "rouletteJoin", {
                tableId: state.rouletteTable?.id,
              }),
          });
          const specNow = !state.rouletteTable.seats?.some(
            (s) => s && s.userId === state.socket?.id,
          );
          rouletteArena.update(state.rouletteTable, state.socket?.id, { spectator: specNow });
          window.scrollTo({ top: 0, behavior: "instant" });
        })
        .catch(() => {
          toast("3D Rulet sahnesi yüklenemedi.", true);
        });
    }

    function ensureSlotArena() {
      if (!state.slotHall || !$("active-slot")) return;
      (slotModulePromise ||= import("./games/slot3d.mjs"))
        .then(({ SlotArena }) => {
          if (
            !state.slotHall ||
            state.rouletteTable ||
            state.tavlaTable ||
            state.okeyTable ||
            state.chessTable ||
            state.table ||
            state.diceTable ||
            state.game
          )
            return;
          if (!slotArena) {
            slotArena = new SlotArena($("active-slot"), {
              onLeave: leaveSlot,
              onHelp: () => showDialog("slot-help-dialog"),
              onSpin: (stake) =>
                emit("slotSpin", { hallId: state.slotHall?.id, stake })
                  .then((r) => {
                    if (!r?.success) {
                      slotArena?.abortSpin?.();
                      toast(r?.message || "Çevirme başarısız.", true);
                    } else if (r.hall) {
                      state.slotHall = r.hall;
                      renderGame();
                    }
                  })
                  .catch((err) => {
                    slotArena?.abortSpin?.();
                    toast(err?.message || "Çevirme başarısız.", true);
                  }),
              onGamble: (color) =>
                emit("slotGamble", { hallId: state.slotHall?.id, color }).then((r) => {
                  if (!r?.success) toast(r?.message || "Katlama başarısız.", true);
                  else if (r.hall) {
                    state.slotHall = r.hall;
                    renderGame();
                  }
                }),
              onCollectGamble: () =>
                emit("slotCollect", { hallId: state.slotHall?.id }).then((r) => {
                  if (r?.success && r.hall) {
                    state.slotHall = r.hall;
                    renderGame();
                  }
                }),
              onRebuy: () => slotCommand("slotRebuy", { hallId: state.slotHall?.id }),
              onReact: (emoji) =>
                emit("slotReact", { hallId: state.slotHall?.id, emoji }).then((r) => {
                  if (!r?.success) toast(r?.message || "Tepki gönderilemedi.", true);
                }),
              onSpectateToggle: (toSpec) =>
                slotCommand(toSpec ? "slotSpectate" : "slotJoin", { hallId: state.slotHall?.id }),
            });
          }
          const specNow = !state.slotHall.myCabinet;
          slotArena.update(state.slotHall, state.socket?.id, { spectator: specNow });
          window.scrollTo({ top: 0, behavior: "instant" });
        })
        .catch(() => {
          toast("3D Slot sahnesi yüklenemedi.", true);
        });
    }

    function ensurePapazArena() {
      if (!state.papazTable || !$("active-papaz")) return;
      (papazModulePromise ||= import("./games/papaz3d.mjs"))
        .then(({ PapazArena }) => {
          if (!state.papazTable || state.pistiTable || state.batakTable || state.slotHall || state.rouletteTable || state.tavlaTable || state.okeyTable || state.chessTable || state.table || state.diceTable || state.game) return;
          if (!papazArena) {
            papazArena = new PapazArena($("active-papaz"), {
              onLeave: () => leaveCardGame("papaz"),
              onHelp: () => showDialog("papaz-help-dialog"),
              onStart: () => cardCommand("papaz", "papazStart", { tableId: state.papazTable?.id }),
              onConfig: (action) => cardCommand("papaz", "papazConfig", { tableId: state.papazTable?.id, action }),
              onDraw: (cardIndex) => cardCommand("papaz", "papazDraw", { tableId: state.papazTable?.id, cardIndex }),
              onShuffle: () => cardCommand("papaz", "papazShuffle", { tableId: state.papazTable?.id }),
              onRematch: () => cardCommand("papaz", "papazRematch", { tableId: state.papazTable?.id }),
              onReact: (emoji) => emit("papazReact", { tableId: state.papazTable?.id, emoji }).then((r) => { if (!r?.success) toast(r?.message || "Tepki gönderilemedi.", true); }),
            });
          }
          papazArena.update(state.papazTable, state.socket?.id, { spectator: state.papazTable.mySeatIndex < 0 });
          window.scrollTo({ top: 0, behavior: "instant" });
        })
        .catch(() => { toast("3D Papaz Kimde sahnesi yüklenemedi.", true); });
    }

    function ensurePistiArena() {
      if (!state.pistiTable || !$("active-pisti")) return;
      (pistiModulePromise ||= import("./games/pisti3d.mjs"))
        .then(({ PistiArena }) => {
          if (!state.pistiTable || state.papazTable || state.batakTable || state.slotHall || state.rouletteTable || state.tavlaTable || state.okeyTable || state.chessTable || state.table || state.diceTable || state.game) return;
          if (!pistiArena) {
            pistiArena = new PistiArena($("active-pisti"), {
              onLeave: () => leaveCardGame("pisti"),
              onHelp: () => showDialog("pisti-help-dialog"),
              onStart: () => cardCommand("pisti", "pistiStart", { tableId: state.pistiTable?.id }),
              onConfig: (action) => cardCommand("pisti", "pistiConfig", { tableId: state.pistiTable?.id, action }),
              onPlay: (cardId) => cardCommand("pisti", "pistiPlay", { tableId: state.pistiTable?.id, cardId }),
              onNextRound: () => cardCommand("pisti", "pistiNextRound", { tableId: state.pistiTable?.id }),
              onRematch: () => cardCommand("pisti", "pistiRematch", { tableId: state.pistiTable?.id }),
              onReact: (emoji) => emit("pistiReact", { tableId: state.pistiTable?.id, emoji }).then((r) => { if (!r?.success) toast(r?.message || "Tepki gönderilemedi.", true); }),
            });
          }
          pistiArena.update(state.pistiTable, state.socket?.id, { spectator: state.pistiTable.mySeatIndex < 0 });
          window.scrollTo({ top: 0, behavior: "instant" });
        })
        .catch(() => { toast("3D Pişti sahnesi yüklenemedi.", true); });
    }

    function ensureBatakArena() {
      if (!state.batakTable || !$("active-batak")) return;
      (batakModulePromise ||= import("./games/batak3d.mjs"))
        .then(({ BatakArena }) => {
          if (!state.batakTable || state.papazTable || state.pistiTable || state.slotHall || state.rouletteTable || state.tavlaTable || state.okeyTable || state.chessTable || state.table || state.diceTable || state.game) return;
          if (!batakArena) {
            batakArena = new BatakArena($("active-batak"), {
              onLeave: () => leaveCardGame("batak"),
              onHelp: () => showDialog("batak-help-dialog"),
              onStart: () => cardCommand("batak", "batakStart", { tableId: state.batakTable?.id }),
              onConfig: (action) => cardCommand("batak", "batakConfig", { tableId: state.batakTable?.id, action }),
              onBid: (amount) => cardCommand("batak", "batakBid", { tableId: state.batakTable?.id, amount }),
              onChooseTrump: (suit) => cardCommand("batak", "batakChooseTrump", { tableId: state.batakTable?.id, suit }),
              onPlay: (cardId) => cardCommand("batak", "batakPlay", { tableId: state.batakTable?.id, cardId }),
              onNextHand: () => cardCommand("batak", "batakNextHand", { tableId: state.batakTable?.id }),
              onRematch: () => cardCommand("batak", "batakRematch", { tableId: state.batakTable?.id }),
              onReact: (emoji) => emit("batakReact", { tableId: state.batakTable?.id, emoji }).then((r) => { if (!r?.success) toast(r?.message || "Tepki gönderilemedi.", true); }),
            });
          }
          batakArena.update(state.batakTable, state.socket?.id, { spectator: state.batakTable.mySeatIndex < 0 });
          window.scrollTo({ top: 0, behavior: "instant" });
        })
        .catch(() => { toast("3D Batak sahnesi yüklenemedi.", true); });
    }

    $("roulette-join")?.addEventListener("click", () =>
      rouletteCommand("rouletteCreate", { forceNew: false }),
    );
    $("roulette-create-new")?.addEventListener("click", () =>
      rouletteCommand("rouletteCreate", { forceNew: true }),
    );
    $("slot-join")?.addEventListener("click", () => slotCommand("slotJoin", {}));
    $("slot-help-btn")?.addEventListener("click", () => showDialog("slot-help-dialog"));
    $("papaz-create")?.addEventListener("click", () => cardCommand("papaz", "papazCreate", { withBots: false }));
    $("papaz-create-bot")?.addEventListener("click", () => cardCommand("papaz", "papazCreate", { withBots: true }));
    $("papaz-help-btn")?.addEventListener("click", () => showDialog("papaz-help-dialog"));
    $("pisti-create")?.addEventListener("click", () =>
      cardCommand("pisti", "pistiCreate", {
        mode: $("pisti-mode")?.value || "1v1",
        targetScore: Number($("pisti-target")?.value || 101),
        withBot: false,
      }),
    );
    $("pisti-create-bot")?.addEventListener("click", () =>
      cardCommand("pisti", "pistiCreate", {
        mode: $("pisti-mode")?.value || "1v1",
        targetScore: Number($("pisti-target")?.value || 101),
        withBot: true,
      }),
    );
    $("pisti-help-btn")?.addEventListener("click", () => showDialog("pisti-help-dialog"));
    $("batak-create")?.addEventListener("click", () =>
      cardCommand("batak", "batakCreate", {
        variant: $("batak-variant")?.value || "ihale",
        targetHands: Number($("batak-hands")?.value || 5),
        withBots: false,
      }),
    );
    $("batak-create-bot")?.addEventListener("click", () =>
      cardCommand("batak", "batakCreate", {
        variant: $("batak-variant")?.value || "ihale",
        targetHands: Number($("batak-hands")?.value || 5),
        withBots: true,
      }),
    );
    $("batak-help-btn")?.addEventListener("click", () => showDialog("batak-help-dialog"));
    function ensureBlofArena() {
      if (!state.blofTable || !$("active-blof")) return;
      (blofModulePromise ||= import("./games/blof3d.mjs"))
        .then(({ BlofArena }) => {
          if (!state.blofTable) return;
          if (!blofArena) {
            blofArena = new BlofArena($("active-blof"), {
              onLeave: () => leaveCardGame("blof"),
              onHelp: () => showDialog("blof-help-dialog"),
              onSelectCharacter: (characterId) =>
                cardCommand("blof", "blofSelectCharacter", {
                  tableId: state.blofTable?.id,
                  characterId,
                }),
              onReady: (ready) =>
                cardCommand("blof", "blofReady", {
                  tableId: state.blofTable?.id,
                  ready,
                }),
              onConfig: (action, mode) =>
                cardCommand("blof", "blofConfig", {
                  tableId: state.blofTable?.id,
                  action,
                  mode,
                }),
              onPlay: (cardIds) =>
                cardCommand("blof", "blofPlay", {
                  tableId: state.blofTable?.id,
                  cardIds,
                }),
              onCallLiar: () =>
                cardCommand("blof", "blofCallLiar", {
                  tableId: state.blofTable?.id,
                }),
              onPullTrigger: () =>
                cardCommand("blof", "blofPullTrigger", {
                  tableId: state.blofTable?.id,
                }),
              onRematch: () =>
                cardCommand("blof", "blofRematch", {
                  tableId: state.blofTable?.id,
                }),
            });
          }
          const isSeated = (state.blofTable.seats || []).some((s) => s && s.id === state.socket?.id);
          blofArena.update(state.blofTable, state.socket?.id, { spectator: !isSeated });
          window.scrollTo({ top: 0, behavior: "instant" });
        })
        .catch((err) => {
          console.error("BLOF INIT ERR:", err);
          toast("3D Blöf sahnesi yüklenemedi.", true);
        });
    }
    $("blof-create")?.addEventListener("click", () =>
      cardCommand("blof", "blofCreate", {
        mode: $("blof-mode")?.value || "classic",
        withBots: false,
      }),
    );
    $("blof-create-bot")?.addEventListener("click", () =>
      cardCommand("blof", "blofCreate", {
        mode: $("blof-mode")?.value || "classic",
        withBots: true,
      }),
    );
    $("blof-help-btn")?.addEventListener("click", () => showDialog("blof-help-dialog"));
    $("roulette-help-btn")?.addEventListener("click", () =>
      showDialog("roulette-help-dialog"),
    );

    $("tavla-create")?.addEventListener("click", () =>
      tavlaCommand("tavlaCreate", {
        withBot: false,
        botDifficulty: $("tavla-difficulty")?.value || "hard",
        targetScore: Number($("tavla-target")?.value || 3),
      }),
    );
    $("tavla-create-bot")?.addEventListener("click", () =>
      tavlaCommand("tavlaCreate", {
        withBot: true,
        botDifficulty: $("tavla-difficulty")?.value || "hard",
        targetScore: Number($("tavla-target")?.value || 3),
      }),
    );
    $("tavla-help-btn")?.addEventListener("click", () =>
      showDialog("tavla-help-dialog"),
    );
    $("okey-create")?.addEventListener("click", () =>
      okeyCommand("okeyCreate", { variant: "classic" }),
    );
    $("okey101-create")?.addEventListener("click", () =>
      okeyCommand("okeyCreate", { variant: "101" }),
    );
    $("okey-help-btn")?.addEventListener("click", () =>
      showDialog("okey-help-dialog"),
    );
    $("okey101-help-btn")?.addEventListener("click", () =>
      showDialog("okey101-help-dialog"),
    );
    $("chess-create")?.addEventListener("click", () =>
      chessCommand("chessCreate", {
        withBot: false,
        botDifficulty: $("chess-difficulty")?.value || "hard",
      }),
    );
    $("chess-create-bot")?.addEventListener("click", () =>
      chessCommand("chessCreate", {
        withBot: true,
        botDifficulty: $("chess-difficulty")?.value || "hard",
      }),
    );
    $("bj-create")?.addEventListener("click", () =>
      bjCommand("bjCreate", { seatIndex: 0 }),
    );
    $("dice-help-btn")?.addEventListener("click", () =>
      showDialog("dice-help-dialog"),
    );
    $("dice-create")?.addEventListener("click", () =>
      diceCommand("diceCreate", {
        targetScore: Number($("dice-target")?.value || 3000),
        seatIndex: 0,
        withBot: false,
      }),
    );
    $("dice-create-bot")?.addEventListener("click", () =>
      diceCommand("diceCreate", {
        targetScore: Number($("dice-target")?.value || 3000),
        seatIndex: 0,
        withBot: true,
      }),
    );
    $("create-game").addEventListener("click", () =>
      gameAction("gameCreate", {
        bot: false,
        mode: $("xox-mode")?.value || "classic",
      }),
    );
    $("play-bot").addEventListener("click", () =>
      gameAction("gameBot", {
        difficulty: $("xox-difficulty")?.value || "hard",
        mode: $("xox-mode")?.value || "classic",
      }),
    );
    $("game-add-bot").addEventListener("click", () =>
      gameAction("gameBot", {
        gameId: state.game?.id,
        difficulty: $("xox-difficulty")?.value || "hard",
        mode: state.game?.mode || $("xox-mode")?.value || "classic",
      }),
    );
    $("game-leave").addEventListener("click", async () => {
      if (!state.game) return;
      if (
        state.game.status === "playing" &&
        !confirm("Ayrılırsan oyun sona erecek. Çıkmak istiyor musun?")
      )
        return;
      const result = await act("gameLeave", { gameId: state.game.id });
      if (result.success) {
        state.game = null;
        resetXoxSoundState();
        renderGame();
      }
    });
    $("game-rematch").addEventListener("click", () => {
      if (!state.game) return;
      if (state.game.winner === "left") {
        gameAction("gameCreate", {
          bot: false,
          mode: state.game.mode || "classic",
        });
      } else {
        gameAction("gameRematch", {
          gameId: state.game.id,
          difficulty: state.game.difficulty || "hard",
        });
      }
    });

    function renderGame() {
      const game = state.game;
      const table = state.table;
      const diceTable = state.diceTable;
      const chessTable = state.chessTable;
      const okeyTable = state.okeyTable;
      const tavlaTable = state.tavlaTable;
      const rouletteTable = state.rouletteTable;
      const slotHall = state.slotHall;
      const papazTable = state.papazTable;
      const pistiTable = state.pistiTable;
      const batakTable = state.batakTable;
      const blofTable = state.blofTable;
      const anyCard = !!(papazTable || pistiTable || batakTable || blofTable);
      const higher = !!(table || diceTable || chessTable || okeyTable || tavlaTable || rouletteTable || slotHall || anyCard);
      const inAnyArena = !!(game || higher);
      $("active-game").hidden = !game || higher;
      $("active-blackjack").hidden = !table || !!(diceTable || chessTable || okeyTable || tavlaTable || rouletteTable || slotHall || anyCard);
      $("active-dice").hidden = !diceTable || !!(chessTable || okeyTable || tavlaTable || rouletteTable || slotHall || anyCard);
      $("active-chess").hidden = !chessTable || !!(okeyTable || tavlaTable || rouletteTable || slotHall || anyCard);
      $("active-okey").hidden = !okeyTable || !!(tavlaTable || rouletteTable || slotHall || anyCard);
      if ($("active-tavla")) $("active-tavla").hidden = !tavlaTable || !!(rouletteTable || slotHall || anyCard);
      if ($("active-roulette")) $("active-roulette").hidden = !rouletteTable || !!(slotHall || anyCard);
      if ($("active-slot")) $("active-slot").hidden = !slotHall || anyCard;
      if ($("active-papaz")) $("active-papaz").hidden = !papazTable || !!(pistiTable || batakTable || blofTable);
      if ($("active-pisti")) $("active-pisti").hidden = !pistiTable || !!(batakTable || blofTable);
      if ($("active-batak")) $("active-batak").hidden = !batakTable || !!blofTable;
      if ($("active-blof")) $("active-blof").hidden = !blofTable;
      $("game-intro").hidden = inAnyArena;
      if ($("lobby-dock")) $("lobby-dock").hidden = inAnyArena;
      if ($("tourney-dock")) $("tourney-dock").hidden = inAnyArena;
      syncArenaSocialBar();
      checkGameTurnNotification();
      renderUsers();
      document.body.classList.toggle("in-blackjack", state.view === "games" && higher);
      document.body.classList.toggle("in-okey", state.view === "games" && !!okeyTable && !rouletteTable && !slotHall && !anyCard);
      document.body.classList.toggle("in-tavla", state.view === "games" && !!tavlaTable && !rouletteTable && !slotHall && !anyCard);
      document.body.classList.toggle("in-roulette", state.view === "games" && !!rouletteTable && !slotHall && !anyCard);
      document.body.classList.toggle("in-slot", state.view === "games" && !!slotHall && !anyCard);
      document.body.classList.toggle("in-card-game", state.view === "games" && anyCard);
      syncMiniChatUI();

      if (blofTable) {
        clearAllOtherGames("blof");
        ensureBlofArena();
        return;
      }
      if (blofArena) { blofArena.dispose(); blofArena = null; }
      if (batakTable) {
        clearAllOtherGames("batak");
        ensureBatakArena();
        return;
      }
      if (batakArena) { batakArena.dispose(); batakArena = null; }
      if (pistiTable) {
        clearAllOtherGames("pisti");
        ensurePistiArena();
        return;
      }
      if (pistiArena) { pistiArena.dispose(); pistiArena = null; }
      if (papazTable) {
        clearAllOtherGames("papaz");
        ensurePapazArena();
        return;
      }
      if (papazArena) { papazArena.dispose(); papazArena = null; }
      if (slotHall) {
        clearAllOtherGames("slot");
        ensureSlotArena();
        return;
      }
      if (slotArena) {
        slotArena.dispose();
        slotArena = null;
      }
      if (rouletteTable) {
        if (bjArena) {
          bjArena.dispose();
          bjArena = null;
        }
        if (diceArena) {
          diceArena.dispose();
          diceArena = null;
        }
        if (chessArena) {
          chessArena.dispose();
          chessArena = null;
        }
        if (okeyArena) {
          okeyArena.dispose();
          okeyArena = null;
        }
        if (tavlaArena) {
          tavlaArena.dispose();
          tavlaArena = null;
        }
        ensureRouletteArena();
        return;
      }
      if (rouletteArena) {
        rouletteArena.dispose();
        rouletteArena = null;
      }
      if (tavlaTable) {
        if (bjArena) {
          bjArena.dispose();
          bjArena = null;
        }
        if (diceArena) {
          diceArena.dispose();
          diceArena = null;
        }
        if (chessArena) {
          chessArena.dispose();
          chessArena = null;
        }
        if (okeyArena) {
          okeyArena.dispose();
          okeyArena = null;
        }
        ensureTavlaArena();
        return;
      }
      if (tavlaArena) {
        tavlaArena.dispose();
        tavlaArena = null;
      }
      if (okeyTable) {
        if (bjArena) {
          bjArena.dispose();
          bjArena = null;
        }
        if (diceArena) {
          diceArena.dispose();
          diceArena = null;
        }
        if (chessArena) {
          chessArena.dispose();
          chessArena = null;
        }
        ensureOkeyArena();
        return;
      }
      if (okeyArena) {
        okeyArena.dispose();
        okeyArena = null;
      }
      if (chessTable) {
        if (bjArena) {
          bjArena.dispose();
          bjArena = null;
        }
        if (diceArena) {
          diceArena.dispose();
          diceArena = null;
        }
        ensureChessArena();
        return;
      }
      if (chessArena) {
        chessArena.dispose();
        chessArena = null;
      }
      if (diceTable) {
        if (bjArena) {
          bjArena.dispose();
          bjArena = null;
        }
        ensureDiceArena();
        return;
      }
      if (diceArena) {
        diceArena.dispose();
        diceArena = null;
      }
      if (table) {
        ensureBjArena();
        return;
      }
      if (bjArena) {
        bjArena.dispose();
        bjArena = null;
      }
      if (!game) {
        resetXoxSoundState();
        return;
      }

      renderXoxView({
        game,
        mySocketId: state.socket?.id,
        containers: {
          playersRow: $("game-players"),
          metaRow: $("xox-meta"),
          statusEl: $("game-status"),
          rematchBox: $("xox-rematch-prompt"),
          boardWrap: $("game-board"),
          addBotBtn: $("game-add-bot"),
          rematchBtn: $("game-rematch"),
        },
        handlers: {
          onMove: (index) =>
            gameAction("gameMove", { gameId: game.id, index }),
          onRematchRespond: (accept) =>
            gameAction("gameRematchRespond", { gameId: game.id, accept }),
        },
      });
    }

    function matchesLobby(room) {
      const f = state.lobbyFilter || "all";
      const rType = room.type || "xox";
      if (f === "watchable") {
        if (
          rType !== "chess" &&
          rType !== "okey" &&
          rType !== "okey101" &&
          rType !== "tavla" &&
          rType !== "roulette" &&
          rType !== "slot" &&
          rType !== "papaz" &&
          rType !== "pisti" &&
          rType !== "batak" &&
          rType !== "blof"
        )
          return false;
      } else if (f === "waiting") {
        const isOpenCasino =
          (rType === "roulette" && (room.seatsUsed || 0) < (room.maxSeats || 8)) ||
          rType === "slot";
        if (room.status !== "waiting" && room.status !== "countdown" && !isOpenCasino) return false;
      } else if (f !== "all" && rType !== f) {
        return false;
      }
      const q = (state.lobbySearch || "").trim().toLocaleLowerCase("tr");
      if (!q) return true;
      const parts = [
        room.name || "",
        rType === "slot"
          ? "slot jackpot vegas 777 makara izle"
          : rType === "blof"
            ? "blof liars bar rulet kart izle"
            : rType === "papaz"
              ? "papaz kimde kacti kara kart izle"
              : rType === "pisti"
                ? "pisti vale kart esli tekli izle"
                : rType === "batak"
                  ? "batak ihale koz maca kart izle"
                  : rType === "roulette"
                    ? "rulet roulette casino çark izle"
                    : rType === "tavla"
                      ? "tavla backgammon mars zar izle"
                      : rType === "okey"
                        ? "klasik okey taş"
                        : rType === "okey101"
                          ? "101 okey yüzbir"
                          : rType === "chess"
                            ? "satranç chess izle"
                            : rType === "blackjack"
                              ? "blackjack bj"
                              : rType === "dice"
                                ? "zar"
                                : room.mode === "infinite"
                                  ? "sonsuz xox"
                                  : "klasik xox",
        ...(room.seats || []).map((s) => s?.name || ""),
        ...(room.players || []).map((p) => p?.name || ""),
      ];
      return parts.join(" ").toLocaleLowerCase("tr").includes(q);
    }

    function renderLobby() {
      const list = $("game-lobby");
      list.replaceChildren();
      const isWaitingRoom = (g) =>
        g.status === "waiting" ||
        g.status === "countdown" ||
        (g.type === "roulette" && (g.seatsUsed || 0) < (g.maxSeats || 8)) ||
        g.type === "slot";
      const filtered = state.games.filter(matchesLobby).sort((a, b) => {
        const aw = isWaitingRoom(a) ? 0 : 1;
        const bw = isWaitingRoom(b) ? 0 : 1;
        return aw - bw;
      });
      const waitingCount = state.games.filter(isWaitingRoom).length;
      $("lobby-count").textContent =
        state.lobbyFilter === "all" && !state.lobbySearch.trim()
          ? waitingCount > 0
            ? `${state.games.length} ODA · ${waitingCount} BEKLİYOR`
            : `${state.games.length} ODA`
          : `${filtered.length} / ${state.games.length} ODA`;
      if (!state.games.length) {
        list.append(
          el(
            "div",
            "lobby-empty",
            state.user
              ? "Şu an açık masa yok. Aşağıdan bir masa açtığında burada anında üstte listelenir!"
              : "Açık masaları görmek, 4 kişilik Okey/101 veya diğer oyunlara oturmak için giriş yap.",
          ),
        );
        return;
      }
      if (!filtered.length) {
        list.append(
          el(
            "div",
            "lobby-empty",
            "Aradığın filtre veya ada uygun aktif oyun bulunamadı.",
          ),
        );
        return;
      }
      for (const room of filtered) {
        const row = el("div", "lobby-room");
        if (isWaitingRoom(room)) {
          row.classList.add("is-waiting");
        }
        if (room.type === "papaz" || room.type === "pisti" || room.type === "batak" || room.type === "blof") {
          const cfg = {
            papaz: { av: "🃏", cls: "papaz-lobby-avatar", tbl: state.papazTable, cmdJoin: "papazJoin", cmdSpec: "papazSpectate", sub: `${room.round || 0}. El` },
            pisti: { av: "🂡", cls: "pisti-lobby-avatar", tbl: state.pistiTable, cmdJoin: "pistiJoin", cmdSpec: "pistiSpectate", sub: `${room.handNumber || 0}. El · Hedef ${room.targetScore || 101}` },
            batak: { av: "♠", cls: "batak-lobby-avatar", tbl: state.batakTable, cmdJoin: "batakJoin", cmdSpec: "batakSpectate", sub: `${room.handNumber || 0}/${room.targetHands || 5} El` },
            blof: { av: "🔫", cls: "blof-lobby-avatar", tbl: state.blofTable, cmdJoin: "blofJoin", cmdSpec: "blofSpectate", sub: room.mode === "devil" ? "😈 Şeytan Modu" : `Klasik · ${room.round || 0}. Tur` },
          }[room.type];
          row.append(el("div", `avatar ${cfg.cls}`, cfg.av));
          const meta = el("div", "room-meta");
          const specText = room.spectatorCount > 0 ? ` · 👁 ${room.spectatorCount} izleyici` : "";
          const statusStr = room.status === "waiting" || room.status === "countdown"
            ? `⏳ ${room.seatedCount}/${room.maxSeats} koltuk · ${cfg.sub}${specText}`
            : room.status === "finished"
              ? `Tamamlandı · ${cfg.sub}${specText}`
              : `Oynanıyor · ${cfg.sub}${specText}`;
          meta.append(el("strong", "", room.name), el("small", "", statusStr));
          row.append(meta);
          const iAmSeated = cfg.tbl?.id === room.id && (room.type === "blof" ? (cfg.tbl.seats || []).some((s) => s && s.id === state.socket?.id) : cfg.tbl.mySeatIndex >= 0);
          const iAmSpec = cfg.tbl?.id === room.id && !iAmSeated;
          if (iAmSeated) {
            row.append(el("span", "tag", "MASADASIN"));
          } else if (iAmSpec) {
            row.append(el("span", "tag chess-spec-tag", "İZLİYORSUN 👁"));
          } else {
            const actGroup = el("div", "lobby-room-actions");
            if ((room.status === "waiting" || room.status === "countdown") && (room.seatedCount || 0) < (room.maxSeats || 4)) {
              actGroup.append(button(`Katıl ${cfg.av}`, "button primary", () => cardCommand(room.type, cfg.cmdJoin, { tableId: room.id })));
            }
            actGroup.append(button("İzle 👁", "button secondary", () => cardCommand(room.type, cfg.cmdSpec, { tableId: room.id })));
            row.append(actGroup);
          }
        } else if (room.type === "slot") {
          row.append(el("div", "avatar slot-lobby-avatar", "🎰"));
          const meta = el("div", "room-meta");
          const specText =
            room.spectatorCount > 0 ? ` · 👁 ${room.spectatorCount} izleyici` : "";
          meta.append(
            el("strong", "", `${room.name} (${room.playerCount || 0} Oyuncu)`),
            el(
              "small",
              "",
              `💎 Jackpot: ${Math.round(room.jackpotPool || 25000).toLocaleString("tr-TR")} Fiş · ${room.totalSpins || 0} Spin${specText}`,
            ),
          );
          row.append(meta);
          const iAmSeated = state.slotHall?.id === room.id && !!state.slotHall.myCabinet;
          const iAmSpec = state.slotHall?.id === room.id && !state.slotHall.myCabinet;
          if (iAmSeated) {
            row.append(el("span", "tag", "SALONDASIN"));
          } else if (iAmSpec) {
            row.append(el("span", "tag chess-spec-tag", "İZLİYORSUN 👁"));
          } else {
            const actGroup = el("div", "lobby-room-actions");
            actGroup.append(
              button("Katıl 🎰", "button primary", () => {
                slotCommand("slotJoin", { hallId: room.id });
              }),
              button("İzle 👁", "button secondary", () => {
                slotCommand("slotSpectate", { hallId: room.id });
              }),
            );
            row.append(actGroup);
          }
        } else if (room.type === "roulette") {
          row.append(el("div", "avatar roulette-lobby-avatar", "🎡"));
          const meta = el("div", "room-meta");
          const phaseText =
            room.phase === "spinning"
              ? "Çark Dönüyor"
              : room.phase === "settled"
                ? "Sonuç Açıklandı"
                : "Bahisler Açık";
          const specText =
            room.spectatorCount > 0 ? ` · 👁 ${room.spectatorCount} izleyici` : "";
          const recentText =
            room.recentNumbers?.length
              ? ` · Son: ${room.recentNumbers.map((x) => x.number).join(", ")}`
              : "";
          meta.append(
            el("strong", "", `${room.name} (${room.seatsUsed || 0}/${room.maxSeats || 8} Oyuncu)`),
            el("small", "", `${room.round || 1}. Tur · ${phaseText}${recentText}${specText}`),
          );
          row.append(meta);
          const iAmSeated =
            state.rouletteTable?.id === room.id &&
            state.rouletteTable.seats?.some((s) => s && s.userId === state.socket?.id);
          const iAmSpec = state.rouletteTable?.id === room.id && !iAmSeated;
          if (iAmSeated) {
            row.append(el("span", "tag", "MASADASIN"));
          } else if (iAmSpec) {
            row.append(el("span", "tag chess-spec-tag", "İZLİYORSUN 👁"));
          } else {
            const actGroup = el("div", "lobby-room-actions");
            if ((room.seatsUsed || 0) < (room.maxSeats || 8)) {
              actGroup.append(
                button("Katıl 🎡", "button primary", () => {
                  rouletteCommand("rouletteJoin", { tableId: room.id });
                }),
              );
            }
            actGroup.append(
              button("İzle 👁", "button secondary", () => {
                rouletteCommand("rouletteSpectate", { tableId: room.id });
              }),
            );
            row.append(actGroup);
          }
        } else if (room.type === "tavla") {
          row.append(el("div", "avatar tavla-lobby-avatar", "⛀"));
          const meta = el("div", "room-meta");
          const wSeat = room.seats?.[0];
          const bSeat = room.seats?.[1];
          const wName = wSeat ? `${wSeat.name} (${wSeat.score || 0})` : "Boş";
          const bName = bSeat ? `${bSeat.name} (${bSeat.score || 0})` : "Bekleniyor";
          const specText =
            room.spectatorCount > 0 ? ` · 👁 ${room.spectatorCount} izleyici` : "";
          const statusText =
            room.status === "waiting"
              ? `⏳ ${room.seatedCount}/2 koltuk · ${room.targetScore || 3} El${specText}`
              : room.status === "finished"
                ? `Maç Bitti (${room.round || 1}. Maç)${specText}`
                : `${room.round || 1}. Maç · ${room.handNumber || 1}. El (${room.targetScore || 3} El)${specText}`;
          meta.append(
            el("strong", "", `${room.name} (${wName} × ${bName})`),
            el("small", "", statusText),
          );
          row.append(meta);
          const iAmSeated =
            state.tavlaTable?.id === room.id &&
            state.tavlaTable.seats?.some((s) => s && !s.isBot && s.userId === state.socket?.id);
          const iAmSpec = state.tavlaTable?.id === room.id && !iAmSeated;
          if (iAmSeated) {
            row.append(el("span", "tag", "MASADASIN"));
          } else if (iAmSpec) {
            row.append(el("span", "tag chess-spec-tag", "İZLİYORSUN 👁"));
          } else {
            const actGroup = el("div", "lobby-room-actions");
            if (room.seatedCount < 2) {
              actGroup.append(
                button("Katıl ⛀", "button primary", () => {
                  tavlaCommand("tavlaJoin", { tableId: room.id });
                }),
              );
            }
            actGroup.append(
              button(
                "İzle 👁",
                room.seatedCount >= 2 ? "button primary" : "button secondary",
                () => {
                  tavlaCommand("tavlaSpectate", { tableId: room.id });
                },
              ),
            );
            row.append(actGroup);
          }
        } else if (room.type === "okey" || room.type === "okey101") {
          const is101 = room.type === "okey101";
          row.append(
            el("div", `avatar ${is101 ? "okey101-lobby-avatar" : "okey-lobby-avatar"}`, is101 ? "101" : "🁣"),
          );
          const meta = el("div", "room-meta");
          const names = (room.seats || []).filter(Boolean).map((s) => s.name).join(", ");
          const specText = room.spectatorCount > 0 ? ` · 👁 ${room.spectatorCount} izleyici` : "";
          const botText = room.botCount > 0 ? ` · 🤖 ${room.botCount} bot koltuğu açık` : "";
          const statusText =
            room.status === "waiting"
              ? `⏳ ${room.seatedCount}/4 kişi · 4/4 dolunca başlar (${names})`
              : room.status === "finished"
                ? `El Bitti · ${names}${botText}${specText}`
                : `${room.round || 1}. El · Oynanıyor (${names})${botText}${specText}`;
          meta.append(el("strong", "", room.name), el("small", "", statusText));
          row.append(meta);
          const iAmSeated =
            state.okeyTable?.id === room.id && state.okeyTable.mySeat !== -1;
          const iAmSpec = state.okeyTable?.id === room.id && !iAmSeated;
          if (iAmSeated) {
            row.append(el("span", "tag", "MASADASIN"));
          } else if (iAmSpec) {
            row.append(el("span", "tag chess-spec-tag", "İZLİYORSUN 👁"));
          } else {
            const actGroup = el("div", "lobby-room-actions");
            if (room.botCount > 0 && room.status !== "waiting") {
              actGroup.append(
                button(`Bot Yerine Katıl (🤖)`, "button primary", () => {
                  okeyCommand("okeyTakeBotSeat", { tableId: room.id });
                }),
              );
            } else if (room.seatedCount < 4 && room.status !== "playing") {
              actGroup.append(
                button(`Katıl (${room.seatedCount}/4)`, "button primary", () => {
                  okeyCommand("okeyJoin", { tableId: room.id });
                }),
              );
            }
            actGroup.append(
              button(
                "İzle 👁",
                room.botCount > 0 && room.status !== "waiting"
                  ? "button secondary"
                  : room.seatedCount >= 4 || room.status === "playing"
                    ? "button primary"
                    : "button secondary",
                () => {
                  okeyCommand("okeySpectate", { tableId: room.id });
                },
              ),
            );
            row.append(actGroup);
          }
        } else if (room.type === "chess") {
          const badge = el("div", "avatar chess-lobby-avatar", "♔");
          row.append(badge);
          const meta = el("div", "room-meta");
          const wName = room.seats?.[0]?.name || "Boş";
          const bName = room.seats?.[1]?.name || "Bekleniyor";
          const specText =
            room.spectatorCount > 0 ? ` · 👁 ${room.spectatorCount} izleyici` : "";
          const statusText =
            room.status === "waiting"
              ? `${room.seatedCount}/2 koltuk · Katıl veya İzle${specText}`
              : room.status === "finished"
                ? `Bitti · ${room.moveCount || 0} hamle${specText}`
                : `${room.round || 1}. Oyun · ${room.moveCount || 0} hamle${specText}`;
          meta.append(
            el("strong", "", `${room.name} (${wName} × ${bName})`),
            el("small", "", statusText),
          );
          row.append(meta);
          const iAmSeated = state.chessTable?.id === room.id &&
            state.chessTable.seats?.some((s) => s && !s.isBot && s.userId === state.socket?.id);
          const iAmSpec = state.chessTable?.id === room.id && !iAmSeated;
          if (iAmSeated) {
            row.append(el("span", "tag", "MASADASIN"));
          } else if (iAmSpec) {
            row.append(el("span", "tag chess-spec-tag", "İZLİYORSUN 👁"));
          } else {
            const actGroup = el("div", "lobby-room-actions");
            if (room.seatedCount < 2) {
              actGroup.append(
                button("Katıl ♔", "button primary", () => {
                  chessCommand("chessJoin", { tableId: room.id });
                }),
              );
            }
            actGroup.append(
              button(
                "İzle 👁",
                room.seatedCount >= 2 ? "button primary" : "button secondary",
                () => {
                  chessCommand("chessSpectate", { tableId: room.id });
                },
              ),
            );
            row.append(actGroup);
          }
        } else if (room.type === "blackjack") {
          const badge = el("div", "avatar bj-lobby-avatar", "♠");
          row.append(badge);
          const meta = el("div", "room-meta");
          const statusText =
            room.status === "waiting"
              ? `${room.seatedCount}/6 koltuk · Katılıma açık`
              : room.status === "countdown"
                ? `${room.seatedCount}/6 koltuk · Başlamak üzere!`
                : `${room.seatedCount}/6 koltuk · ${room.round}. El oynanıyor`;
          meta.append(
            el("strong", "", room.name),
            el("small", "", statusText),
          );
          row.append(meta);
          const iAmSeated = room.seats?.some(
            (s) => s && s.userId === state.socket?.id,
          );
          if (iAmSeated) {
            row.append(el("span", "tag", "MASADASIN"));
          } else if (room.seatedCount < room.maxSeats) {
            row.append(
              button("Masaya otur ♠", "button primary", () => {
                if (
                  state.game?.status === "playing" &&
                  !confirm("Mevcut XOX oyunun sona erecek. Blackjack masasına geçilsin mi?")
                )
                  return;
                bjCommand("bjJoin", { tableId: room.id });
              }),
            );
          } else {
            row.append(el("span", "tag", "DOLU (6/6)"));
          }
        } else if (room.type === "dice") {
          const badge = el("div", "avatar dice-lobby-avatar", "🎲");
          row.append(badge);
          const meta = el("div", "room-meta");
          const target = room.targetScore || 3000;
          const botLabel = room.hasBot ? " · Zar Botu aktif" : "";
          const statusText =
            room.status === "waiting"
              ? `${room.seatedCount}/6 koltuk · Hedef ${target}${botLabel}`
              : `${room.seatedCount}/6 koltuk · ${room.round || 1}. Tur · Hedef ${target}${botLabel}`;
          meta.append(
            el("strong", "", room.name),
            el("small", "", statusText),
          );
          row.append(meta);
          const iAmSeated = room.seats?.some(
            (s) => s && s.userId === state.socket?.id,
          );
          if (iAmSeated) {
            row.append(el("span", "tag", "MASADASIN"));
          } else if (room.seatedCount < room.maxSeats) {
            row.append(
              button("Masaya otur 🎲", "button primary", () => {
                if (
                  state.game?.status === "playing" &&
                  !confirm("Mevcut XOX oyunun sona erecek. Zar Düellosu masasına geçilsin mi?")
                )
                  return;
                diceCommand("diceJoin", { tableId: room.id });
              }),
            );
          } else {
            row.append(el("span", "tag", "DOLU (6/6)"));
          }
        } else {
          row.append(avatar(room.players[0].name));
          const meta = el("div", "room-meta");
          const modeLabel = room.mode === "infinite" ? "Sonsuz XOX" : "Klasik XOX";
          meta.append(
            el(
              "strong",
              "",
              room.players[0].name +
              (room.players[1]
                ? " × " + room.players[1].name
                : " · Oyuncu bekliyor"),
            ),
            el(
              "small",
              "",
              room.status === "waiting"
                ? `${modeLabel} · Bir koltuk boş. Sıra arkadaşında.`
                : room.bot
                  ? `${modeLabel} · Bot karşılaşması (${room.round || 1}. el)`
                  : `${modeLabel} · 1v1 karşılaşma (${room.round || 1}. el)`,
            ),
          );
          row.append(meta);
          if (room.players.some((p) => p.id === state.socket?.id))
            row.append(el("span", "tag", "SENİN ODAN"));
          else if (room.status === "waiting")
            row.append(
              button("Katıl ↗", "button primary", () => {
                if (
                  state.game?.status === "playing" &&
                  !confirm("Mevcut oyunun sona erecek. Bu odaya geçilsin mi?")
                )
                  return;
                gameAction("gameJoin", { gameId: room.id });
              }),
            );
          else row.append(el("span", "tag", "OYUNDA"));
        }
        list.append(row);
      }
    }

    $("lobby-filters")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-filter]");
      if (!btn) return;
      state.lobbyFilter = btn.dataset.filter || "all";
      document.querySelectorAll("#lobby-filters [data-filter]").forEach((chip) => {
        chip.classList.toggle("active", chip === btn);
      });
      renderLobby();
    });
    $("lobby-search")?.addEventListener("input", (e) => {
      state.lobbySearch = e.target.value || "";
      renderLobby();
    });

    function setMiniChatOpen(open) {
      state.miniChatOpen = Boolean(open);
      if (state.miniChatOpen) {
        clearNotifications({ clearMini: true });
        renderMiniChat();
        setTimeout(() => $("mini-chat-input")?.focus(), 40);
      } else {
        syncMiniChatUI();
      }
    }
    $("mini-chat-toggle")?.addEventListener("click", () =>
      setMiniChatOpen(!state.miniChatOpen),
    );
    $("mini-chat-close")?.addEventListener("click", () => setMiniChatOpen(false));
    $("mini-chat-close")?.addEventListener("click", () => {
      closeAllEmojiPickers();
      setMiniChatOpen(false);
    });
    document.querySelectorAll("[data-mini-ch]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.miniChatChannel = btn.dataset.miniCh || "general";
        clearNotifications({ clearMini: state.miniChatOpen });
        syncMiniChatUI();
        renderMiniChat();
      });
    });
    bindMentionAutocomplete($("mini-chat-input"), $("mini-mention-suggest"));
    $("mini-emoji-button")?.addEventListener("click", (ev) => {
      if (!requireUser()) return;
      openEmojiPopover(ev.currentTarget, (emoji) => {
        insertEmojiIntoInput($("mini-chat-input"), emoji);
      });
    });
    let sendingMini = false;
    $("mini-chat-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      closeAllEmojiPickers();
      if (!requireUser() || sendingMini) return;
      const inp = $("mini-chat-input");
      const msg = inp?.value || "";
      if (!msg.trim()) return;
      sendingMini = true;
      const res = await act("sendMessage", {
        message: msg,
        channel: state.miniChatChannel,
        type: "text",
      });
      sendingMini = false;
      if (res.success && inp) {
        inp.value = "";
        inp.focus();
      }
    });

    for (const ev of ["pointerdown", "keydown", "input", "touchstart"]) {
      window.addEventListener(ev, recordUserActivity, { passive: true });
    }
    setInterval(() => {
      if (Date.now() - lastLocalInteractionAt <= 60000) {
        maybeSendActivityPing(false);
      }
    }, 30000);

    function handleResumeConnection() {
      if (state.stopped) return;
      const savedToken = getSavedSessionToken();
      const savedChess = getActiveChessSession();
      const savedTavla = getActiveTavlaSession();
      if (!state.credentials) {
        const fallbackGame = savedTavla || savedChess;
        if (fallbackGame?.name && (!fallbackGame.role || fallbackGame.role === "user")) {
          state.credentials = {
            name: fallbackGame.name,
            role: "user",
            password: "",
          };
        }
      }
      if (!savedToken && !state.credentials) return;
      if (!state.socket) {
        setupSocket();
        return;
      }
      if (!state.socket.connected) {
        connection("connecting");
        state.socket.connect();
        return;
      }
      if (!state.user) {
        authenticate();
        return;
      }
      if (savedTavla || state.tavlaTable || state.lastTavlaTableId) {
        tryRestoreTavlaSession({ silent: true });
      } else if (savedChess || state.chessTable || state.lastChessTableId) {
        tryRestoreChessSession({ silent: true });
      }
    }
    window.addEventListener("focus", () => {
      if (state.view === "chat" || state.miniChatOpen) {
        clearNotifications({ clearMini: true });
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && (state.view === "chat" || state.miniChatOpen)) {
        clearNotifications({ clearMini: true });
      }
      if (document.visibilityState === "visible") {
        handleResumeConnection();
      }
    });
    window.addEventListener("pageshow", () => {
      handleResumeConnection();
    });
    window.addEventListener("online", () => {
      handleResumeConnection();
    });
    // ===== PWA, SMART PLATFORM INSTALL, NOTIFICATIONS, WEBRTC VOICE, INVITES & TOURNAMENTS =====
    let deferredInstallPrompt = null;
    let lastNotifiedTurnKey = "";

    function detectPlatform() {
      const ua = navigator.userAgent || "";
      const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const isAndroid = /Android/i.test(ua);
      const isMobile = isIOS || isAndroid || matchMedia("(pointer: coarse)").matches;
      const isStandalone =
        matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
      return { isIOS, isAndroid, isMobile, isStandalone };
    }

    function updateInstallUI() {
      const { isIOS, isMobile, isStandalone } = detectPlatform();
      const sideBtn = $("install-app-btn");
      const topBtn = $("topbar-install-btn");
      if (isStandalone) {
        if (sideBtn) {
          sideBtn.classList.add("installed");
          sideBtn.innerHTML = `<span class="install-btn-ico">✓</span><span class="install-btn-text">Uygulama Kurulu</span>`;
        }
        if (topBtn) topBtn.hidden = true;
        return;
      }
      const sideLabel = isIOS
        ? "📱 iPhone'a Ekle"
        : isMobile
          ? "📱 Telefona İndir"
          : "💻 Bilgisayara İndir";
      const topLabel = isIOS ? "📱 Ekle" : isMobile ? "📱 İndir" : "💻 İndir";
      if (sideBtn) {
        sideBtn.classList.remove("installed");
        sideBtn.innerHTML = `<span class="install-btn-text">${sideLabel}</span>`;
      }
      if (topBtn) {
        topBtn.hidden = false;
        topBtn.textContent = topLabel;
        topBtn.title = sideLabel;
      }
    }

    function openInstallGuide() {
      const { isIOS, isAndroid, isMobile } = detectPlatform();
      const titleEl = $("install-guide-title");
      const bodyEl = $("install-guide-body");
      if (!bodyEl) return;
      bodyEl.replaceChildren();

      const steps = [];
      if (isIOS) {
        if (titleEl) titleEl.textContent = "iPhone / iPad'e Uygulama Olarak Ekle";
        steps.push(
          "Safari alt çubuğundaki Paylaş (⬆) simgesine dokun.",
          'Açılan listeden "Ana Ekrana Ekle" (＋) seçeneğine bas.',
          'Sağ üstten "Ekle" dediğinde Haking Chat ana ekranına tam ekran uygulama olarak yerleşir.',
        );
      } else if (isAndroid || isMobile) {
        if (titleEl) titleEl.textContent = "Android Telefonuna Uygulama Olarak Kur";
        steps.push(
          "Tarayıcının sağ üst köşesindeki Menü (⋮) simgesine dokun.",
          '"Uygulamayı yükle" veya "Ana ekrana ekle" seçeneğine dokun.',
          "Onayladığında Haking Chat yeni logosuyla telefonuna uygulama olarak kurulur.",
        );
      } else {
        if (titleEl) titleEl.textContent = "Bilgisayarına Uygulama Olarak Kur";
        steps.push(
          "Chrome veya Edge adres çubuğunun sağındaki Kurulum (⊕ / bilgisayar) simgesine tıkla.",
          'Alternatif olarak tarayıcı menüsünden (⋮) "Yayınla, kaydet ve paylaş → Sayfayı uygulama olarak yükle" seçeneğini seç.',
          "Haking Chat masaüstüne kısayol ve bağımsız pencere olarak kurulur.",
        );
      }
      steps.forEach((txt, idx) => {
        const row = el("div", "install-step");
        row.append(el("span", "install-step-num", String(idx + 1)), el("span", "", txt));
        bodyEl.append(row);
      });
      showDialog("install-guide-dialog");
    }

    async function handleInstallClick() {
      const { isStandalone } = detectPlatform();
      if (isStandalone) {
        toast("Haking Chat zaten uygulama olarak kurulu ✓");
        return;
      }
      if (deferredInstallPrompt) {
        try {
          deferredInstallPrompt.prompt();
          const choice = await deferredInstallPrompt.userChoice;
          deferredInstallPrompt = null;
          if (choice?.outcome === "accepted") {
            toast("🎉 Haking Chat cihazına kuruluyor!");
            updateInstallUI();
          }
          return;
        } catch {
          deferredInstallPrompt = null;
        }
      }
      openInstallGuide();
    }

    function updateNotifButton() {
      const btn = $("notif-toggle-btn");
      if (!btn) return;
      if (typeof Notification === "undefined") {
        btn.hidden = true;
        return;
      }
      const perm = Notification.permission;
      btn.classList.toggle("active", perm === "granted");
      btn.textContent =
        perm === "granted"
          ? "🔔 Bildirimler Açık"
          : perm === "denied"
            ? "🔕 Bildirim Engelli"
            : "🔔 Bildirimleri Aç";
    }

    function sendDesktopNotification(title, body, tag = "haking-chat") {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      if (!document.hidden) return;
      try {
        const n = new Notification(title, {
          body: String(body || ""),
          icon: "/assets/icon-192.png",
          badge: "/favicon-32.png",
          tag,
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch { }
    }

    function checkGameTurnNotification() {
      if (!state.user) return;
      const myId = state.socket?.id;
      let key = "";
      let title = "";
      let body = "";
      if (state.okeyTable?.status === "playing" && state.okeyTable.turn === state.okeyTable.mySeat) {
        key = `okey:${state.okeyTable.id}:${state.okeyTable.round}:${state.okeyTable.turn}:${state.okeyTable.turnPhase}`;
        title = state.okeyTable.variant === "101" ? "💯 101 Okey — Sıra Sende!" : "🁣 Okey — Sıra Sende!";
        body = state.okeyTable.turnPhase === "draw" ? "Taş çekme sırası sende." : "Taş atma sırası sende.";
      } else if (state.tavlaTable?.status === "playing") {
        const mySeat = (state.tavlaTable.seats || []).find((s) => s && s.userId === myId);
        if (mySeat && state.tavlaTable.turn === mySeat.color) {
          key = `tavla:${state.tavlaTable.id}:${state.tavlaTable.handNumber}:${state.tavlaTable.turn}:${state.tavlaTable.turnPhase}`;
          title = "⛀ Tavla 3D — Sıra Sende!";
          body = state.tavlaTable.turnPhase === "roll" ? "Zar atma sırası sende." : "Hamle sırası sende.";
        }
      } else if (state.chessTable?.status === "playing") {
        const mySeat = (state.chessTable.seats || []).find((s) => s && s.userId === myId);
        if (mySeat && state.chessTable.turn === mySeat.color) {
          key = `chess:${state.chessTable.id}:${state.chessTable.fen}`;
          title = "♔ Satranç 3D — Hamle Sende!";
          body = "Rakibin hamlesini yaptı, sıra sende.";
        }
      } else if (state.batakTable?.status === "playing" && state.batakTable.turnSeatIndex === state.batakTable.mySeatIndex) {
        key = `batak:${state.batakTable.id}:${state.batakTable.turnSeatIndex}:${state.batakTable.trick?.length || 0}`;
        title = "♠ Batak 3D — Sıra Sende!";
        body = "Kart oynama sırası sende.";
      } else if (state.pistiTable?.status === "playing" && state.pistiTable.turnSeatIndex === state.pistiTable.mySeatIndex) {
        key = `pisti:${state.pistiTable.id}:${state.pistiTable.turnSeatIndex}:${state.pistiTable.centerCount || 0}`;
        title = "🂡 Pişti 3D — Sıra Sende!";
        body = "Kart atma sırası sende.";
      } else if (state.papazTable?.status === "playing" && state.papazTable.turnSeatIndex === state.papazTable.mySeatIndex) {
        key = `papaz:${state.papazTable.id}:${state.papazTable.turnSeatIndex}`;
        title = "🃏 Papaz Kimde — Sıra Sende!";
        body = "Rakipten kart çekme sırası sende.";
      }
      if (key && key !== lastNotifiedTurnKey) {
        lastNotifiedTurnKey = key;
        sendDesktopNotification(title, body, key.split(":")[0]);
      }
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => { });
    }
    window.addEventListener("beforeinstallprompt", (ev) => {
      ev.preventDefault();
      deferredInstallPrompt = ev;
      updateInstallUI();
    });
    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      updateInstallUI();
    });
    $("install-app-btn")?.addEventListener("click", handleInstallClick);
    $("topbar-install-btn")?.addEventListener("click", handleInstallClick);
    $("notif-toggle-btn")?.addEventListener("click", async () => {
      if (typeof Notification === "undefined") {
        toast("Tarayıcın masaüstü bildirimlerini desteklemiyor.", true);
        return;
      }
      if (Notification.permission === "granted") {
        toast("🔔 Sıra ve @bahsetme bildirimleri zaten açık!");
        return;
      }
      if (Notification.permission === "denied") {
        toast("Bildirim izni tarayıcı ayarlarından engellenmiş. Adres çubuğundan izin verebilirsin.", true);
        return;
      }
      const perm = await Notification.requestPermission();
      updateNotifButton();
      if (perm === "granted") {
        toast("🔔 Bildirimler açıldı! Sıran geldiğinde veya @etiketlendiğinde haber vereceğiz.");
      }
    });
    updateInstallUI();
    updateNotifButton();

    // ----- WebRTC P2P Voice Client -----
    const voiceClient = new VoiceClient({
      sendSignal: (roomId, toUserId, payload) => {
        state.socket?.emit("voiceSignal", { roomId, toUserId, payload });
      },
      sendMediaState: (media) => {
        if (state.socket?.connected && voiceClient.isConnected) {
          state.socket.emit("voiceMediaState", media);
        }
      },
      onStateChange: () => {
        renderVoiceDock();
        renderVoiceChannels();
        syncArenaSocialBar();
      },
      onError: (msg) => toast(msg, true),
    });

    function getCurrentActiveTableInfo() {
      if (state.blofTable) return { kind: "blof", tableId: state.blofTable.id, label: "Blöf 3D" };
      if (state.okeyTable) return { kind: "okey", tableId: state.okeyTable.id, label: state.okeyTable.variant === "101" ? "101 Okey 3D" : "Klasik Okey 3D" };
      if (state.tavlaTable) return { kind: "tavla", tableId: state.tavlaTable.id, label: "Tavla 3D" };
      if (state.chessTable) return { kind: "chess", tableId: state.chessTable.id, label: "Satranç 3D" };
      if (state.table) return { kind: "blackjack", tableId: state.table.id, label: "Blackjack 21" };
      if (state.diceTable) return { kind: "dice", tableId: state.diceTable.id, label: "Zar Düellosu" };
      if (state.rouletteTable) return { kind: "roulette", tableId: state.rouletteTable.id, label: "Rulet 3D" };
      if (state.papazTable) return { kind: "papaz", tableId: state.papazTable.id, label: "Papaz Kimde" };
      if (state.pistiTable) return { kind: "pisti", tableId: state.pistiTable.id, label: "Pişti 3D" };
      if (state.batakTable) return { kind: "batak", tableId: state.batakTable.id, label: "Batak 3D" };
      if (state.game && state.game.status !== "finished") return { kind: "xox", tableId: state.game.id, label: "XOX Arena" };
      return null;
    }

    function syncArenaSocialBar() {
      const bar = $("arena-social-bar");
      if (!bar) return;
      const info = getCurrentActiveTableInfo();
      const show = Boolean(state.user && state.view === "games" && info);
      bar.hidden = !show;
      if (!show) return;
      const lbl = $("arena-social-label");
      if (lbl) lbl.textContent = `🎮 ${info.label} · Masa Araçları`;
      const vBtn = $("arena-voice-btn");
      if (vBtn) {
        const targetRoomId = `table:${info.kind}:${info.tableId}`;
        const inThisTableVoice = voiceClient.isConnected && voiceClient.roomId === targetRoomId;
        vBtn.textContent = inThisTableVoice ? "🔊 Masa Sesindesin (Ayrıl)" : "🎙 Masa Sesine Katıl";
        vBtn.classList.toggle("primary", inThisTableVoice);
        vBtn.classList.toggle("secondary", !inThisTableVoice);
      }
    }

    async function sendChannelGameInvite() {
      if (!requireUser()) return;
      const res = await act("gameInvite", {});
      if (res.success) toast("📩 #genel-sohbet kanalına tek tıkla masa daveti gönderildi!");
    }

    async function joinTableByInvite(inv) {
      if (!requireUser() || !inv?.kind || !inv?.tableId) return;
      navigate("games");
      const kind = inv.kind;
      if (kind === "blof") return cardCommand("blof", "blofJoin", { tableId: inv.tableId });
      if (kind === "okey") return okeyCommand("okeyJoin", { tableId: inv.tableId });
      if (kind === "tavla") return tavlaCommand("tavlaJoin", { tableId: inv.tableId });
      if (kind === "chess") return chessCommand("chessJoin", { tableId: inv.tableId });
      if (kind === "blackjack") return bjCommand("bjJoin", { tableId: inv.tableId });
      if (kind === "dice") return diceCommand("diceJoin", { tableId: inv.tableId });
      if (kind === "roulette") return rouletteCommand("rouletteJoin", { tableId: inv.tableId });
      if (kind === "papaz") return cardCommand("papaz", "papazJoin", { tableId: inv.tableId });
      if (kind === "pisti") return cardCommand("pisti", "pistiJoin", { tableId: inv.tableId });
      if (kind === "batak") return cardCommand("batak", "batakJoin", { tableId: inv.tableId });
      if (kind === "xox") return gameAction("gameJoin", { gameId: inv.tableId });
    }

    async function joinVoiceRoomById(roomId) {
      if (!requireUser()) return;
      if (voiceClient.isConnected && voiceClient.roomId === roomId) {
        await leaveVoiceRoom();
        return;
      }
      const res = await act("voiceJoinRoom", { roomId });
      if (!res.success) return;
      if (res.status === "pending") {
        toast(`🔒 "${res.roomName}" için kanal sahibinden giriş izni istendi…`);
        return;
      }
      if (res.room) {
        await voiceClient.joinRoom({
          roomId: res.room.id,
          roomName: res.room.name,
          myId: state.socket?.id,
          existingPeers: res.existingPeers || [],
          pttDefault: false,
        });
        toast(`🔊 "${res.room.name}" sesli kanalına bağlandın!`);
      }
    }

    async function leaveVoiceRoom() {
      if (!voiceClient.isConnected) return;
      voiceClient.disconnectLocal();
      if (state.socket?.connected) {
        await emit("voiceLeave", {});
      }
      renderVoiceChannels();
      renderVoiceDock();
      syncArenaSocialBar();
    }

    function renderVoiceChannels() {
      const box = $("voice-channels-list");
      if (!box) return;
      box.replaceChildren();
      const rooms = state.voiceRooms || [];
      if (!rooms.length) {
        box.append(
          el(
            "p",
            "rail-empty",
            state.user ? "Sesli kanallar yükleniyor…" : "Sesli kanallar için giriş yap.",
          ),
        );
        return;
      }
      const myId = state.socket?.id;
      const myRank = state.user ? rank[state.user.role] || 0 : 0;

      for (const room of rooms) {
        const isConnected = voiceClient.isConnected && voiceClient.roomId === room.id;
        const card = el("div", "voice-ch-card" + (isConnected ? " connected" : ""));

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "voice-ch-btn";
        const left = el("span", "voice-ch-left");
        left.append(
          el("span", "", room.approvalRequired ? "🔒" : "🔊"),
          el("span", "voice-ch-name", room.name),
        );
        const metaText = room.myPending
          ? "⏳ İzin…"
          : `${room.memberCount}/${room.maxUsers}`;
        const meta = el("span", "voice-ch-meta", metaText);
        btn.append(left, meta);
        btn.addEventListener("click", () => joinVoiceRoomById(room.id));
        card.append(btn);

        if (room.members?.length) {
          const memWrap = el("div", "voice-ch-members");
          for (const m of room.members) {
            const row = el("div", "voice-ch-member" + (m.speaking ? " speaking" : ""));
            const nameSpan = el("span", "");
            const dot = el("span", "voice-ch-member-dot");
            nameSpan.append(dot, document.createTextNode(m.name));
            const icon = el("span", "", m.deafened ? "🔇" : m.muted ? "🎙✕" : m.speaking ? "🟢" : "");
            row.append(nameSpan, icon);
            memWrap.append(row);
          }
          card.append(memWrap);
        }

        // Inline pending join requests for room owner or staff
        if ((room.ownerId === myId || myRank >= 1) && room.pendingRequests?.length) {
          for (const req of room.pendingRequests) {
            const pr = el("div", "voice-ch-pending");
            pr.append(el("span", "", `🙋 ${req.name}`));
            const btns = el("div", "voice-ch-pending-btns");
            const allowBtn = button("✓", "ok", () =>
              act("voiceRespondRequest", { roomId: room.id, targetUserId: req.userId, allow: true }),
            );
            const denyBtn = button("✕", "no", () =>
              act("voiceRespondRequest", { roomId: room.id, targetUserId: req.userId, allow: false }),
            );
            btns.append(allowBtn, denyBtn);
            pr.append(btns);
            card.append(pr);
          }
        }
        box.append(card);
      }
    }

    function renderVoiceDock() {
      const dock = $("voice-dock");
      if (!dock) return;
      const snap = voiceClient.getSnapshot();
      dock.hidden = !snap.connected;
      if (!snap.connected) return;

      const room = state.voiceRooms.find((r) => r.id === snap.roomId);
      const members = room?.members || [];
      if ($("voice-dock-name")) $("voice-dock-name").textContent = room?.name || snap.roomName;
      if ($("voice-dock-sub")) {
        $("voice-dock-sub").textContent = `P2P · ${Math.max(1, members.length)} kişi${snap.pttMode ? " · Bas-Konuş (V)" : ""}`;
      }

      const pttToggle = $("voice-ptt-toggle");
      const pttHold = $("voice-ptt-hold");
      const muteBtn = $("voice-mute-btn");
      const deafBtn = $("voice-deafen-btn");
      const lockBtn = $("voice-lock-btn");

      if (pttToggle) pttToggle.classList.toggle("active", snap.pttMode);
      if (pttHold) {
        pttHold.hidden = !snap.pttMode;
        pttHold.classList.toggle("talking", snap.pttActive);
        pttHold.textContent = snap.pttActive ? "🟢 Konuşuyorsun…" : "🎙 Konuş (Basılı Tut)";
      }
      if (muteBtn) {
        muteBtn.classList.toggle("muted", snap.effectiveMuted);
        muteBtn.textContent = snap.effectiveMuted ? "🎙✕" : "🎤";
      }
      if (deafBtn) {
        deafBtn.classList.toggle("muted", snap.deafened);
        deafBtn.textContent = snap.deafened ? "🔇" : "🎧";
      }
      const myId = state.socket?.id;
      const myRank = state.user ? rank[state.user.role] || 0 : 0;
      const canManage = Boolean(room && !room.isSystem && !room.isTable && (room.ownerId === myId || myRank >= 1));
      if (lockBtn) {
        lockBtn.hidden = !canManage;
        lockBtn.textContent = room?.approvalRequired ? "🔒 İzinli" : "🔓 Açık";
      }

      const membersBox = $("voice-dock-members");
      if (membersBox) {
        membersBox.replaceChildren();
        for (const m of members) {
          const pill = el("span", "voice-peer-pill" + (m.speaking ? " speaking" : ""));
          pill.append(
            document.createTextNode(
              `${m.deafened ? "🔇" : m.muted ? "🎙✕" : "🎤"} ${m.name}`,
            ),
          );
          if (canManage && m.id !== myId) {
            pill.append(
              button(
                "✕",
                "voice-peer-kick",
                () => act("voiceKick", { roomId: room.id, targetUserId: m.id }),
                m.name + " kullanıcısını sesli kanaldan çıkar",
              ),
            );
          }
          membersBox.append(pill);
        }
      }
    }

    function pushSocialPrompt({ id, title, subtitle, buttons = [], ttlMs = 25000 }) {
      const stack = $("social-prompts");
      if (!stack) return;
      if (id) stack.querySelector(`[data-prompt-id="${id}"]`)?.remove();
      const card = el("div", "social-prompt-card");
      if (id) card.dataset.promptId = id;
      card.append(el("strong", "", title), el("small", "", subtitle));
      const row = el("div", "social-prompt-btns");
      for (const b of buttons) {
        row.append(
          button(b.label, b.cls || "button small secondary", async () => {
            card.remove();
            await b.onClick?.();
          }),
        );
      }
      card.append(row);
      stack.append(card);
      if (ttlMs > 0) setTimeout(() => card.remove(), ttlMs);
    }

    function showVoiceKnockPrompt(req) {
      pushSocialPrompt({
        id: `vreq-${req.roomId}-${req.userId}`,
        title: `🔒 Sesli Kanal İsteği (${req.roomName})`,
        subtitle: `${req.name} sesli kanalına katılmak için izin istiyor.`,
        buttons: [
          {
            label: "✓ İzin Ver",
            cls: "button small primary",
            onClick: () => act("voiceRespondRequest", { roomId: req.roomId, targetUserId: req.userId, allow: true }),
          },
          {
            label: "✕ Reddet",
            cls: "button small secondary",
            onClick: () => act("voiceRespondRequest", { roomId: req.roomId, targetUserId: req.userId, allow: false }),
          },
        ],
      });
    }

    function showGameInvitePrompt(inv) {
      pushSocialPrompt({
        id: `inv-${inv.inviteId}`,
        title: `📩 ${inv.fromName} Seni Oyuna Çağırıyor!`,
        subtitle: `${inv.label} (${inv.seatsText}) · ${inv.modeLabel || ""}`,
        buttons: [
          {
            label: "✅ Masaya Katıl",
            cls: "button small primary",
            onClick: () => joinTableByInvite(inv),
          },
          { label: "✕ Reddet", cls: "button small secondary" },
        ],
      });
    }

    function showTourneyMatchPrompt(info) {
      pushSocialPrompt({
        id: `trn-${info.matchId}`,
        title: `🏆 ${info.tournamentName}`,
        subtitle: "Turnuva eleme maçın başladı!",
        buttons: [
          {
            label: "🎮 Maçıma Geç",
            cls: "button small primary",
            onClick: () => {
              navigate("games");
              if (info.gameType === "tavla") tavlaCommand("tavlaJoin", { tableId: info.tableId });
              else chessCommand("chessJoin", { tableId: info.tableId });
            },
          },
          { label: "Kapat", cls: "button small secondary" },
        ],
      });
    }

    $("voice-create-open")?.addEventListener("click", () => {
      if (!requireUser()) return;
      if ($("voice-room-name")) $("voice-room-name").value = "";
      showDialog("voice-create-dialog");
    });

    $("voice-create-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!requireUser()) return;
      const name = $("voice-room-name")?.value?.trim() || "";
      const approvalRequired = Boolean($("voice-room-approval")?.checked);
      const maxUsers = Number($("voice-room-max")?.value || 8);
      const res = await act("voiceCreateRoom", { name, approvalRequired, maxUsers });
      if (res.success && res.room) {
        $("voice-create-dialog")?.close();
        await voiceClient.joinRoom({
          roomId: res.room.id,
          roomName: res.room.name,
          myId: state.socket?.id,
          existingPeers: res.existingPeers || [],
          pttDefault: false,
        });
        toast(`🔊 "${res.room.name}" sesli kanalı açıldı!`);
      }
    });

    $("voice-ptt-toggle")?.addEventListener("click", () => {
      voiceClient.setPttMode(!voiceClient.pttMode);
      toast(voiceClient.pttMode ? "🎙 Bas-Konuş aktif (V tuşunu veya butonu basılı tut)." : "🎤 Serbest mikrofon modu aktif.");
    });
    const pttHoldEl = $("voice-ptt-hold");
    if (pttHoldEl) {
      pttHoldEl.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        voiceClient.setPttActive(true);
      });
      for (const evName of ["pointerup", "pointercancel", "pointerleave"]) {
        pttHoldEl.addEventListener(evName, () => voiceClient.setPttActive(false));
      }
    }
    window.addEventListener("keydown", (e) => {
      if (e.code !== "KeyV" || e.repeat || !voiceClient.isConnected || !voiceClient.pttMode) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;
      voiceClient.setPttActive(true);
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "KeyV" && voiceClient.pttMode) voiceClient.setPttActive(false);
    });
    $("voice-mute-btn")?.addEventListener("click", () => {
      if (voiceClient.pttMode) voiceClient.setPttMode(false);
      voiceClient.setMuted(!voiceClient.muted);
    });
    $("voice-deafen-btn")?.addEventListener("click", () => {
      voiceClient.setDeafened(!voiceClient.deafened);
    });
    $("voice-lock-btn")?.addEventListener("click", async () => {
      const room = state.voiceRooms.find((r) => r.id === voiceClient.roomId);
      if (!room) return;
      const res = await act("voiceSetApproval", {
        roomId: room.id,
        approvalRequired: !room.approvalRequired,
      });
      if (res.success) {
        toast(res.room?.approvalRequired ? "🔒 Kanal izinli girişe alındı." : "🔓 Kanal herkese açıldı.");
      }
    });
    $("voice-leave-btn")?.addEventListener("click", () => leaveVoiceRoom());

    $("arena-voice-btn")?.addEventListener("click", async () => {
      if (!requireUser()) return;
      const info = getCurrentActiveTableInfo();
      if (!info) return;
      const targetId = `table:${info.kind}:${info.tableId}`;
      if (voiceClient.isConnected && voiceClient.roomId === targetId) {
        await leaveVoiceRoom();
        return;
      }
      const res = await act("voiceJoinTable", {
        tableKind: info.kind,
        tableId: info.tableId,
        label: info.label,
      });
      if (res.success && res.room) {
        const usePtt = ["blof", "okey", "batak"].includes(info.kind);
        await voiceClient.joinRoom({
          roomId: res.room.id,
          roomName: res.room.name,
          myId: state.socket?.id,
          existingPeers: res.existingPeers || [],
          pttDefault: usePtt,
        });
        toast(
          usePtt
            ? `🎙 ${info.label} sesli masasına bağlandın! (Bas-Konuş: V tuşu veya buton)`
            : `🔊 ${info.label} sesli masasına bağlandın!`,
        );
      }
    });
    $("arena-invite-btn")?.addEventListener("click", () => sendChannelGameInvite());

    // ----- Mini Tournaments (4-8 Players · Tavla & Satranç) -----
    function renderTournaments() {
      const listEl = $("tourney-list");
      if (!listEl) return;
      listEl.replaceChildren();
      const items = state.tournaments || [];
      if (!items.length) {
        listEl.append(
          el("p", "rail-empty", "Şu an açık turnuva yok. Yukarıdan 4 veya 8 kişilik Tavla / Satranç turnuvası açabilirsin!"),
        );
        return;
      }
      const myId = state.socket?.id;
      for (const trn of items) {
        const card = el("div", "tourney-card");
        const top = el("div", "tourney-card-top");
        const title = el(
          "strong",
          "",
          `${trn.gameType === "chess" ? "♔" : "⛀"} ${trn.name} (${trn.participants.length}/${trn.size})`,
        );
        const statusTag = el(
          "span",
          "tag",
          trn.status === "waiting"
            ? "KAYIT AÇIK"
            : trn.status === "finished"
              ? `🏆 ${trn.winner?.name || "BİTTİ"}`
              : "CANLI ELEME",
        );
        top.append(title, statusTag);
        card.append(top);

        if (trn.status === "waiting") {
          const chips = el("div", "tourney-chips");
          for (const p of trn.participants) {
            chips.append(el("span", "tourney-chip", p.name));
          }
          card.append(chips);
          const acts = el("div", "arena-social-actions");
          const isIn = trn.participants.some((p) => p.id === myId);
          const isHost = trn.hostId === myId;
          if (!isIn) {
            acts.append(
              button("Turnuvaya Katıl", "button small primary", () =>
                act("tourneyJoin", { tournamentId: trn.id }),
              ),
            );
          } else {
            if (trn.participants.length < trn.size) {
              acts.append(
                button("🤖 Eksikleri Botla Doldur", "button small secondary", () =>
                  act("tourneyFillBots", { tournamentId: trn.id }),
                ),
              );
            }
            if (isHost && trn.participants.length === trn.size) {
              acts.append(
                button("🏆 Turnuvayı Başlat", "button small primary", () =>
                  act("tourneyStart", { tournamentId: trn.id }),
                ),
              );
            }
            acts.append(
              button("Ayrıl", "button small secondary", () =>
                act("tourneyLeave", { tournamentId: trn.id }),
              ),
            );
          }
          card.append(acts);
        } else {
          const bracket = el("div", "tourney-bracket");
          for (const rnd of trn.rounds || []) {
            const col = el("div", "tourney-round-col");
            col.append(el("div", "tourney-round-title", rnd.title));
            for (const m of rnd.matches || []) {
              const box = el("div", "tourney-match" + (m.status === "playing" ? " playing" : ""));
              const s1 = el("div", "tourney-slot" + (m.winner && m.p1 && m.winner.id === m.p1.id ? " win" : ""));
              s1.textContent = m.p1 ? m.p1.name : "Bekleniyor…";
              const s2 = el("div", "tourney-slot" + (m.winner && m.p2 && m.winner.id === m.p2.id ? " win" : ""));
              s2.textContent = m.p2 ? m.p2.name : "Bekleniyor…";
              box.append(s1, s2);
              if (m.status === "playing" && m.tableId) {
                const isMine = m.p1?.id === myId || m.p2?.id === myId;
                box.append(
                  button(
                    isMine ? "🎮 Maçıma Git" : "👁 İzle",
                    isMine ? "button small primary" : "button small secondary",
                    () => {
                      if (trn.gameType === "tavla") {
                        tavlaCommand(isMine ? "tavlaJoin" : "tavlaSpectate", { tableId: m.tableId });
                      } else {
                        chessCommand(isMine ? "chessJoin" : "chessSpectate", { tableId: m.tableId });
                      }
                    },
                  ),
                );
              }
              col.append(box);
            }
            bracket.append(col);
          }
          card.append(bracket);
        }
        listEl.append(card);
      }
    }

    $("tourney-create-btn")?.addEventListener("click", async () => {
      if (!requireUser()) return;
      const gameType = $("tourney-game")?.value || "tavla";
      const size = Number($("tourney-size")?.value || 4);
      const res = await act("tourneyCreate", { gameType, size });
      if (res.success) toast(`🏆 ${res.tournament?.name || "Turnuva"} açıldı!`);
    });

    renderVoiceChannels();
    renderTournaments();

    try {
      const params = new URLSearchParams(location.search);
      const page = params.get("sayfa") || location.hash.replace(/^#/, "");
      const ch = params.get("kanal");
      const savedToken = getSavedSessionToken();
      const savedChess = getActiveChessSession();
      const savedTavla = getActiveTavlaSession();
      if (savedToken) {
        if (savedTavla || savedChess || page === "oyunlar") navigate("games");
        else if (ch === "kod" || ch === "code") navigate("chat", "code");
        setupSocket();
      } else if (
        (savedTavla || savedChess)?.name &&
        (!(savedTavla || savedChess).role || (savedTavla || savedChess).role === "user")
      ) {
        const fallbackGame = savedTavla || savedChess;
        state.credentials = {
          name: fallbackGame.name,
          role: "user",
          password: "",
        };
        navigate("games");
        setupSocket();
      } else if (page === "oyunlar") navigate("games");
      else if (ch === "kod" || ch === "code") navigate("chat", "code");
      else {
        renderMessages();
        renderUsers();
        renderLobby();
        setMemberUI();
      }
    } catch {
      renderMessages();
      renderUsers();
      renderLobby();
      setMemberUI();
    }
    if (!state.socket) connection("offline");
  }) ();
