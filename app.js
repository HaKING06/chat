"use strict";
import { isSfxMuted, playMention, toggleSfxMute } from "./games/sfx.mjs";
import { renderXoxView, resetXoxSoundState } from "./games/xox.mjs";

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
  const emojis = ["👍", "❤️", "🔥", "😂", "🎉", "👀"];
  let bjModulePromise = null;
  let bjArena = null;
  let diceModulePromise = null;
  let diceArena = null;
  let chessModulePromise = null;
  let chessArena = null;
  let okeyModulePromise = null;
  let okeyArena = null;
  const PLAYER_ID_KEY = "haking.playerId";
  const ACTIVE_CHESS_KEY = "haking.chess.active";
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
  const state = {
    socket: null,
    playerId: getOrCreatePlayerId(),
    user: null,
    credentials: null,
    reconnectingChess: false,
    lastChessTableId: "",
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
    lobbyFilter: "all",
    lobbySearch: "",
    miniChatOpen: false,
    miniChatChannel: "general",
    unreadMini: 0,
    unreadMentions: 0,
    unreadTitles: 0,
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
    syncTabTitle();
    syncMiniChatUI();
  }
  function syncMiniChatUI() {
    const shell = $("mini-chat-shell");
    if (!shell) return;
    const inArena = !!(state.game || state.table || state.diceTable || state.chessTable || state.okeyTable);
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
  async function authenticate() {
    if (!state.credentials || state.joining) return;
    state.joining = true;
    const attempt = ++state.authAttempt;
    const result = await emit("joinRoom", {
      ...state.credentials,
      playerId: state.playerId,
    });
    if (attempt !== state.authAttempt) return;
    state.joining = false;
    $("login-submit").disabled = false;
    $("login-submit").textContent = "Sohbete katıl ↗";
    if (!result.success) {
      $("login-error").textContent = result.message;
      state.credentials = null;
      state.user = null;
      setMemberUI();
      if (!$("login-dialog").open) showDialog("login-dialog");
      return;
    }
    state.user = result.user;
    state.messages = new Map((result.history || []).map((m) => [m.id, m]));
    state.users = result.users || [];
    state.games = result.games || [];
    if (result.channelState) state.channelState = result.channelState;
    state.announcement = result.announcement || null;
    $("staff-password").value = "";
    $("login-dialog").close();
    setMemberUI();
    renderUsers();
    renderMessages(true);
    renderMiniChat();
    renderLobby();
    const hasSavedChess = Boolean(getActiveChessSession() || state.lastChessTableId);
    if (!hasSavedChess) {
      toast("Hoş geldin, " + state.user.name + ". İyi ki geldin!");
    }
    try {
      localStorage.setItem("haking.nickname", state.user.name);
    } catch { }
    if (hasSavedChess) {
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
      state.authAttempt++;
      state.joining = false;
      state.reconnectingChess = false;
      connection("offline");
      state.user = null;
      state.game = null;
      state.table = null;
      state.diceTable = null;
      state.chessTable = null;
      state.okeyTable = null;
      disposeArenas();
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
      renderTyping();
      if (!state.stopped) {
        toast(
          reason === "io server disconnect"
            ? "Oturum sona erdi. Yeniden giriş yapabilirsin."
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
          if (document.hidden || state.view !== "chat") {
            state.unreadTitles += 1;
          }
          if (mentioned) {
            state.unreadMentions += 1;
            playMention();
            toast(`🔔 @${m.name} senden bahsetti: "${String(m.message || "").slice(0, 72)}"`);
          }
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
        setMemberUI();
        toast("Takma adın kurucu tarafından " + name + " olarak değiştirildi.");
      }
    });
    socket.on("kicked", () => {
      state.stopped = true;
      state.credentials = null;
      state.user = null;
      clearActiveChessSession();
      toast("Bir yetkili seni odadan çıkardı.", true);
      socket.disconnect();
      setMemberUI();
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
        state.table = table;
        state.game = null;
        state.diceTable = null;
        state.chessTable = null;
        state.okeyTable = null;
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
        state.diceTable = table;
        state.table = null;
        state.game = null;
        state.chessTable = null;
        state.okeyTable = null;
        if (bjArena) {
          bjArena.dispose();
          bjArena = null;
        }
        if (chessArena) {
          chessArena.dispose();
          chessArena = null;
        }
        if (okeyArena) {
          okeyArena.dispose();
          okeyArena = null;
        }
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
      state.chessTable = table;
      state.table = null;
      state.diceTable = null;
      state.okeyTable = null;
      state.game = null;
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
      state.okeyTable = table;
      state.chessTable = null;
      state.table = null;
      state.diceTable = null;
      state.game = null;
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
    socket.connect();
  }
  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.joining) return;
    state.stopped = false;
    state.credentials = {
      name: $("nickname").value.trim(),
      role: $("login-role").value,
      password: $("staff-password").value,
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
  function logout() {
    if (!state.user) return;
    const inActiveBj = state.table?.seats?.some(
      (s) => s && s.userId === state.socket?.id && s.activeInRound,
    );
    const inActiveDice = state.diceTable?.status === "playing";
    const inActiveChess =
      state.chessTable?.status === "playing" &&
      state.chessTable?.seats?.some(
        (s) => s && !s.isBot && s.userId === state.socket?.id,
      );
    if (
      (state.game?.status === "playing" ||
        inActiveBj ||
        inActiveDice ||
        inActiveChess) &&
      !confirm(
        "Çıkış yaparsan oyun sona erecek. Oturumu kapatmak istiyor musun?",
      )
    )
      return;
    if (state.chessTable && state.socket?.connected) {
      state.socket.emit("chessLeave", { tableId: state.chessTable.id });
    }
    clearActiveChessSession();
    state.stopped = true;
    state.credentials = null;
    state.user = null;
    state.game = null;
    state.table = null;
    state.diceTable = null;
    state.chessTable = null;
    state.okeyTable = null;
    disposeArenas();
    clearNotifications({ clearMini: true });
    state.socket?.disconnect();
    state.messages.clear();
    cancelReply();
    cancelEdit();
    $("message-input").value = "";
    setMemberUI();
    renderMessages();
    toast("Görüşmek üzere. Her zaman yerin var.");
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
      view === "games" && !!(state.table || state.diceTable || state.chessTable || state.okeyTable),
    );
    document.body.classList.toggle("in-okey", view === "games" && !!state.okeyTable);
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
      clearNotifications({ clearMini: true });
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
    else {
      const body = el("div", "message-body");
      appendText(body, m.message);
      main.append(body);
    }
    const actions = el("div", "message-actions");
    for (const emoji of emojis) {
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
        button("☺ Tepki", "message-action", () => toggleReactions(actions, m)),
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
  function toggleReactions(parent, m) {
    const previous = parent.querySelector(".emoji-picker");
    if (previous) {
      previous.remove();
      return;
    }
    const picker = el("div", "emoji-picker");
    for (const emoji of emojis)
      picker.append(
        button(
          emoji,
          "",
          () => {
            act("reactMessage", { msgId: m.id, emoji });
            picker.remove();
          },
          emoji + " ekle",
        ),
      );
    parent.append(picker);
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
  $("emoji-button").addEventListener("click", () => {
    if (!requireUser()) return;
    const old = $("composer-emoji");
    if (old) {
      old.remove();
      return;
    }
    const picker = el("div", "emoji-picker");
    picker.id = "composer-emoji";
    for (const emoji of ["👋", "😊", "🎉", "💻", "🚀", "❤️", "👍", "🔥"])
      picker.append(
        button(emoji, "", () => {
          const input = $("message-input");
          if (input.value.length + emoji.length <= input.maxLength) {
            input.setRangeText(
              emoji,
              input.selectionStart,
              input.selectionEnd,
              "end",
            );
            updateCount();
            input.focus();
          }
          picker.remove();
        }),
      );
    $("message-form").after(picker);
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
        disposeArenas();
        state.table = null;
        state.diceTable = null;
        state.chessTable = null;
        state.okeyTable = null;
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
        state.game = null;
        state.diceTable = null;
        state.chessTable = null;
        state.okeyTable = null;
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
        state.game = null;
        state.table = null;
        state.chessTable = null;
        state.okeyTable = null;
        if (bjArena) {
          bjArena.dispose();
          bjArena = null;
        }
        if (chessArena) {
          chessArena.dispose();
          chessArena = null;
        }
        if (okeyArena) {
          okeyArena.dispose();
          okeyArena = null;
        }
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
        state.game = null;
        state.table = null;
        state.diceTable = null;
        state.chessTable = null;
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
        resetXoxSoundState();
        state.okeyTable = result.table;
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
    const inAnyArena = !!(game || table || diceTable || chessTable || okeyTable);
    $("active-game").hidden = !game || !!(table || diceTable || chessTable || okeyTable);
    $("active-blackjack").hidden = !table || !!(diceTable || chessTable || okeyTable);
    $("active-dice").hidden = !diceTable || !!(chessTable || okeyTable);
    $("active-chess").hidden = !chessTable || !!okeyTable;
    $("active-okey").hidden = !okeyTable;
    $("game-intro").hidden = inAnyArena;
    if ($("lobby-dock")) $("lobby-dock").hidden = inAnyArena;
    document.body.classList.toggle(
      "in-blackjack",
      state.view === "games" && !!(table || diceTable || chessTable || okeyTable),
    );
    document.body.classList.toggle("in-okey", state.view === "games" && !!okeyTable);
    syncMiniChatUI();

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
      if (rType !== "chess" && rType !== "okey" && rType !== "okey101") return false;
    } else if (f === "waiting") {
      if (room.status !== "waiting" && room.status !== "countdown") return false;
    } else if (f !== "all" && rType !== f) {
      return false;
    }
    const q = (state.lobbySearch || "").trim().toLocaleLowerCase("tr");
    if (!q) return true;
    const parts = [
      room.name || "",
      rType === "okey"
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
    const filtered = state.games.filter(matchesLobby).sort((a, b) => {
      const aw = a.status === "waiting" || a.status === "countdown" ? 0 : 1;
      const bw = b.status === "waiting" || b.status === "countdown" ? 0 : 1;
      return aw - bw;
    });
    const waitingCount = state.games.filter(
      (g) => g.status === "waiting" || g.status === "countdown",
    ).length;
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
      if (room.status === "waiting" || room.status === "countdown") {
        row.classList.add("is-waiting");
      }
      if (room.type === "okey" || room.type === "okey101") {
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
                      ?`El Bitti · ${names}${botText}${specText}`
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
    document.querySelectorAll("[data-mini-ch]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.miniChatChannel = btn.dataset.miniCh || "general";
        clearNotifications({ clearMini: state.miniChatOpen });
        syncMiniChatUI();
        renderMiniChat();
      });
    });
    let sendingMini = false;
    $("mini-chat-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
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

    function handleResumeConnection() {
      if (state.stopped) return;
      const savedChess = getActiveChessSession();
      if (!state.credentials && savedChess?.name && (!savedChess.role || savedChess.role === "user")) {
        state.credentials = {
          name: savedChess.name,
          role: "user",
          password: "",
        };
      }
      if (!state.credentials) return;
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
      if (savedChess || state.chessTable || state.lastChessTableId) {
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
    try {
      const params = new URLSearchParams(location.search);
      const page = params.get("sayfa") || location.hash.replace(/^#/, "");
      const ch = params.get("kanal");
      const savedChess = getActiveChessSession();
      if (savedChess?.name && (!savedChess.role || savedChess.role === "user")) {
        state.credentials = {
          name: savedChess.name,
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
