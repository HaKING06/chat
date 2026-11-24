const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

export class VoiceClient {
  constructor({ sendSignal, sendMediaState, onStateChange, onError } = {}) {
    this.sendSignal = sendSignal;
    this.sendMediaState = sendMediaState;
    this.onStateChange = onStateChange;
    this.onError = onError;

    this.roomId = null;
    this.roomName = "";
    this.myId = null;
    this.localStream = null;
    this.micAvailable = false;
    this.micState = "idle"; // idle | prompting | granted | denied | unavailable
    this.lastMicError = "";
    this.muted = false;
    this.deafened = false;
    this.pttMode = false;
    this.pttActive = false;
    this.speaking = false;

    this.peers = new Map(); // peerId -> { pc, audioEl, pendingIce: [], remoteMuted: false, volume: 1 }
    this._micPromise = null;
    this._audioCtx = null;
    this._analyser = null;
    this._vadTimer = null;
    this._audioBin = document.createElement("div");
    this._audioBin.hidden = true;
    document.body.append(this._audioBin);
  }

  get isConnected() {
    return Boolean(this.roomId);
  }

    _hasLiveMic() {
      return Boolean(
        this.localStream &&
        this.localStream.getAudioTracks().some((t) => t.readyState === "live"),
      );
    }

    _describeMicError(err) {
      const name = String(err?.name || "");
      const msg = String(err?.message || "");
      if (!window.isSecureContext) {
        return "Mikrofon izni için sitenin HTTPS (veya localhost) üzerinden açılması gerekiyor.";
      }
      if (/permissions policy|feature policy/i.test(msg)) {
        return "Tarayıcı izin politikası mikrofonu engelliyor. Sayfayı yenileyip tekrar dene.";
      }
      if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
        return "Mikrofon izni verilmedi veya tarayıcı ayarlarından engelli. Adres çubuğundaki kilit/mikrofon simgesinden izin verip '🎤 İzin Ver' butonuna bas.";
      }
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        return "Cihazında aktif bir mikrofon bulunamadı — dinleme modunda bağlandın.";
      }
      if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
        return "Mikrofon başka bir uygulama tarafından kullanılıyor olabilir. Kontrol edip tekrar dene.";
      }
      return "Mikrofon erişimi alınamadı — dinleme modundasın. Tekrar denemek için '🎤 İzin Ver' butonuna bas.";
    }

  async requestMicAccess({ silent = false, attachToPeers = true } = {}) {
      if (this._hasLiveMic()) {
        this.micAvailable = true;
        this.micState = "granted";
        this.lastMicError = "";
        if (this._audioCtx?.state === "suspended") {
          this._audioCtx.resume().catch(() => { });
        }
        if (attachToPeers && this.roomId) {
          await this._attachMicToAllPeers();
        }
        return this.localStream;
      }

      // Clear stale/ended tracks before retrying
      if (this.localStream) {
        for (const t of this.localStream.getTracks()) {
          try {
            t.stop();
          } catch { }
        }
        this.localStream = null;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        this.micAvailable = false;
        this.micState = "unavailable";
        this.muted = true;
        this.lastMicError = this._describeMicError(null);
        if (!silent) this.onError?.(this.lastMicError);
        this.onStateChange?.(this.getSnapshot());
        return null;
      }

      if (this._micPromise) {
        const existing = await this._micPromise;
        if (existing && attachToPeers && this.roomId) {
          await this._attachMicToAllPeers();
        }
        return existing;
      }

      this.micState = "prompting";
      this.onStateChange?.(this.getSnapshot());

      this._micPromise = (async () => {
        try {
          let stream = null;
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
              video: false,
            });
          } catch (firstErr) {
            const n = String(firstErr?.name || "");
            if (n === "OverconstrainedError" || n === "TypeError" || n === "ConstraintNotSatisfiedError") {
              stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            } else {
              throw firstErr;
            }
          }
          this.localStream = stream;
          this.micAvailable = true;
          this.micState = "granted";
          this.lastMicError = "";
          for (const track of stream.getAudioTracks()) {
            track.onended = () => {
              if (!this._hasLiveMic()) {
                this.micAvailable = false;
                this.micState = "idle";
                this.muted = true;
                this._syncTracks();
              }
            };
          }
          this._setupVad(stream);
          return stream;
        } catch (err) {
          this.micAvailable = false;
          const name = String(err?.name || "");
          this.micState =
            name === "NotFoundError" || name === "DevicesNotFoundError"
              ? "unavailable"
              : "denied";
          this.muted = true;
          this.lastMicError = this._describeMicError(err);
          if (!silent) this.onError?.(this.lastMicError);
          return null;
        } finally {
          this._micPromise = null;
        }
      })();

      const stream = await this._micPromise;
      if (stream && attachToPeers && this.roomId) {
        await this._attachMicToAllPeers();
      }
      this._syncTracks();
      return stream;
    }

    releaseUnusedMic() {
      if (this.roomId) return;
      this._teardownVad();
      if (this.localStream) {
        for (const t of this.localStream.getTracks()) {
          try {
            t.stop();
          } catch { }
        }
        this.localStream = null;
      }
      this.micAvailable = false;
      this.micState = "idle";
      this.onStateChange?.(this.getSnapshot());
    }

  async _attachMicToAllPeers() {
      if (!this._hasLiveMic() || !this.roomId) return;
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (!audioTrack) return;
      audioTrack.enabled = this._effectiveTransmit();

      for (const [peerId, entry] of this.peers.entries()) {
        const pc = entry.pc;
        if (!pc || pc.signalingState === "closed") continue;
        try {
          const audioTransceiver = pc
            .getTransceivers?.()
            .find((tr) => tr.receiver?.track?.kind === "audio" || tr.sender?.track?.kind === "audio");
          if (audioTransceiver && audioTransceiver.sender) {
            const alreadySame = audioTransceiver.sender.track === audioTrack;
            if (!alreadySame) {
              await audioTransceiver.sender.replaceTrack(audioTrack);
            }
            if (audioTransceiver.direction === "recvonly" || audioTransceiver.direction === "inactive") {
              audioTransceiver.direction = "sendrecv";
              await this._renegotiatePeer(peerId, entry);
            }
          } else {
            const existingSender = pc.getSenders?.().find((s) => s.track?.kind === "audio");
            if (existingSender) {
              if (existingSender.track !== audioTrack) {
                await existingSender.replaceTrack(audioTrack);
              }
            } else {
              pc.addTrack(audioTrack, this.localStream);
              await this._renegotiatePeer(peerId, entry);
            }
          }
        } catch {
          // Ignore transient renegotiation failure
        }
      }
    }

  async _renegotiatePeer(peerId, entry) {
      if (!this.roomId || !entry?.pc || entry.pc.signalingState !== "stable") return;
      try {
          const offer = await entry.pc.createOffer({ offerToReceiveAudio: true });
          await entry.pc.setLocalDescription(offer);
          this.sendSignal?.(this.roomId, peerId, {
            type: "offer",
            sdp: entry.pc.localDescription,
          });
        } catch {
          // Ignore transient WebRTC negotiation error
        }
      }

  _setupVad(stream) {
        this._teardownVad();
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (!AudioCtx) return;
          this._audioCtx = new AudioCtx();
          if (this._audioCtx.state === "suspended") {
            this._audioCtx.resume().catch(() => { });
          }
          const src = this._audioCtx.createMediaStreamSource(stream);
          this._analyser = this._audioCtx.createAnalyser();
          this._analyser.fftSize = 256;
          src.connect(this._analyser);
          const buf = new Uint8Array(this._analyser.frequencyBinCount);
          let silentTicks = 0;
          this._vadTimer = setInterval(() => {
            if (!this.roomId || !this._analyser) return;
            const canTransmit = this._effectiveTransmit();
            if (!canTransmit) {
              if (this.speaking) {
                this.speaking = false;
                this._emitMedia();
              }
              return;
            }
            this._analyser.getByteTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i += 1) {
              const v = (buf[i] - 128) / 128;
              sum += v * v;
            }
            const rms = Math.sqrt(sum / buf.length);
            if (rms > 0.028) {
              silentTicks = 0;
              if (!this.speaking) {
                this.speaking = true;
                this._emitMedia();
              }
            } else if (this.speaking) {
              silentTicks += 1;
              if (silentTicks >= 4) {
                this.speaking = false;
                this._emitMedia();
              }
            }
          }, 110);
        } catch {
          // Ignore VAD errors on restricted browsers
        }
      }

      _teardownVad() {
        if (this._vadTimer) {
          clearInterval(this._vadTimer);
          this._vadTimer = null;
        }
        this._analyser = null;
        if (this._audioCtx) {
          this._audioCtx.close().catch(() => { });
          this._audioCtx = null;
        }
      }

      _effectiveTransmit() {
        if (!this.micAvailable || !this._hasLiveMic() || this.deafened) return false;
        if (this.pttMode) return this.pttActive;
        return !this.muted;
      }

      _syncTracks() {
        const enabled = this._effectiveTransmit();
        if (this.localStream) {
          for (const track of this.localStream.getAudioTracks()) {
            track.enabled = enabled;
          }
        }
        if (!enabled && this.speaking) this.speaking = false;
        for (const p of this.peers.values()) {
          if (p.audioEl) {
            p.audioEl.muted = this.deafened || p.remoteMuted;
            p.audioEl.volume = p.volume;
          }
        }
        this._emitMedia();
        this.onStateChange?.(this.getSnapshot());
      }

      _emitMedia() {
        if (!this.roomId) return;
        const effMuted = !this._effectiveTransmit();
        this.sendMediaState?.({
          muted: effMuted,
          deafened: this.deafened,
          speaking: effMuted ? false : this.speaking,
        });
      }

      getSnapshot() {
        return {
          connected: Boolean(this.roomId),
          roomId: this.roomId,
          roomName: this.roomName,
          micAvailable: this.micAvailable && this._hasLiveMic(),
          micState: this.micState,
          lastMicError: this.lastMicError,
          muted: this.muted,
          effectiveMuted: !this._effectiveTransmit(),
          deafened: this.deafened,
          pttMode: this.pttMode,
          pttActive: this.pttActive,
          speaking: this.speaking,
        };
      }

  async joinRoom({
        roomId,
        roomName,
        myId,
        existingPeers =[],
        pttDefault = false,
        skipMicPrompt = false,
      }) {
          this.disconnectLocal({ keepMic: true });
          this.roomId = roomId;
          this.roomName = roomName || "Sesli Kanal";
          this.myId = myId;
          this.pttMode = Boolean(pttDefault);
          this.pttActive = false;

          const stream = skipMicPrompt
            ? this._hasLiveMic()
              ? this.localStream
              : null
            : await this.requestMicAccess({ attachToPeers: false });
          if (stream) {
            this.muted = false;
          } else {
            this.muted = true;
          }
          this._syncTracks();

          for (const peer of existingPeers) {
            if (!peer?.id || peer.id === myId) continue;
            const shouldOffer = String(myId) < String(peer.id);
            await this._ensurePeerConnection(peer.id, shouldOffer);
          }
          this.onStateChange?.(this.getSnapshot());
        }

  async handlePeerJoined(roomId, peer) {
          if (!this.roomId || this.roomId !== roomId || !peer?.id || peer.id === this.myId) return;
          const shouldOffer = String(this.myId) < String(peer.id);
          await this._ensurePeerConnection(peer.id, shouldOffer);
        }

        handlePeerLeft(roomId, peerId) {
          if (!this.roomId || this.roomId !== roomId) return;
          this._closePeer(peerId);
        }

  async _ensurePeerConnection(peerId, createOffer = false) {
          let entry = this.peers.get(peerId);
          if (!entry) {
            const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            const audioEl = document.createElement("audio");
            audioEl.autoplay = true;
            audioEl.playsInline = true;
            audioEl.muted = this.deafened;
            this._audioBin.append(audioEl);

            entry = { pc, audioEl, pendingIce: [], remoteMuted: false, volume: 1 };
            this.peers.set(peerId, entry);

              if (this._hasLiveMic()) {
                for (const track of this.localStream.getTracks()) {
                  pc.addTrack(track, this.localStream);
                }
              } else {
                try {
                  pc.addTransceiver("audio", { direction: "recvonly" });
                } catch {
                  // Fallback if addTransceiver unsupported
                }
              }

              pc.onicecandidate = (ev) => {
                if (ev.candidate && this.roomId) {
                  this.sendSignal?.(this.roomId, peerId, {
                    type: "candidate",
                    candidate: ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate,
                  });
                }
              };

              pc.ontrack = (ev) => {
                const [stream] = ev.streams || [];
                if (stream && entry.audioEl) {
                  entry.audioEl.srcObject = stream;
                  entry.audioEl.muted = this.deafened || entry.remoteMuted;
                  entry.audioEl.play?.().catch(() => { });
                }
              };

              pc.onconnectionstatechange = () => {
                if (pc.connectionState === "failed" || pc.connectionState === "closed") {
                  if (this.peers.get(peerId) === entry) {
                    this._closePeer(peerId);
                  }
                }
              };
            }

            if (createOffer) {
              await this._renegotiatePeer(peerId, entry);
            }
            return entry;
          }

  async handleSignal({ roomId, fromUserId, payload }) {
            if (!this.roomId || this.roomId !== roomId || !fromUserId || !payload) return;
            const entry = await this._ensurePeerConnection(fromUserId, false);
            const pc = entry.pc;
            try {
              if (payload.type === "offer" && payload.sdp) {
                if (pc.signalingState !== "stable") {
                  const polite = String(this.myId) > String(fromUserId);
                  if (!polite) return;
                  await pc.setLocalDescription({ type: "rollback" }).catch(() => { });
                }
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                while (entry.pendingIce.length) {
                  const cand = entry.pendingIce.shift();
                  await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => { });
                }
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                this.sendSignal?.(this.roomId, fromUserId, {
                  type: "answer",
                  sdp: pc.localDescription,
                });
              } else if (payload.type === "answer" && payload.sdp) {
                if (pc.signalingState === "have-local-offer") {
                  await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                  while (entry.pendingIce.length) {
                    const cand = entry.pendingIce.shift();
                    await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => { });
                  }
                }
              } else if (payload.type === "candidate" && payload.candidate) {
                if (pc.remoteDescription && pc.remoteDescription.type) {
                  await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => { });
                } else {
                  entry.pendingIce.push(payload.candidate);
                }
              }
            } catch {
              // Ignore stale signaling packets cleanly
            }
          }

          _closePeer(peerId) {
            const entry = this.peers.get(peerId);
            if (!entry) return;
            this.peers.delete(peerId);
            try {
              entry.pc.onicecandidate = null;
              entry.pc.ontrack = null;
              entry.pc.close();
            } catch { }
            try {
              entry.audioEl.srcObject = null;
              entry.audioEl.remove();
            } catch { }
          }

  async setMuted(muted) {
              const wantUnmute = !muted;
              if (wantUnmute && !this._hasLiveMic()) {
                const stream = await this.requestMicAccess({ attachToPeers: true });
                if (!stream) {
                  this.muted = true;
                  this._syncTracks();
                  return false;
                }
              }
              this.muted = Boolean(muted);
              if (!this.muted) {
                this.deafened = false;
                if (this._audioCtx?.state === "suspended") {
                  this._audioCtx.resume().catch(() => { });
                }
              }
              this._syncTracks();
              return true;
            }

            setDeafened(deafened) {
              this.deafened = Boolean(deafened);
              if (this.deafened) this.muted = true;
              this._syncTracks();
            }

  async setPttMode(enabled) {
                this.pttMode = Boolean(enabled);
                this.pttActive = false;
                if (this.pttMode && !this._hasLiveMic()) {
                  await this.requestMicAccess({ attachToPeers: true });
                }
                this._syncTracks();
              }

              setPttActive(active) {
                if (!this.pttMode || !this.roomId) return;
                const next = Boolean(active);
                if (next && !this._hasLiveMic()) {
                  this.requestMicAccess({ attachToPeers: true }).then((stream) => {
                    if (stream && this.pttMode && this.roomId) {
                      this.pttActive = true;
                      this._syncTracks();
                    }
                  });
                  return;
                }
                if (this.pttActive === next) return;
                this.pttActive = next;
                if (next && this._audioCtx?.state === "suspended") {
                  this._audioCtx.resume().catch(() => { });
                }
                this._syncTracks();
              }

              setPeerMuted(peerId, muted) {
                const entry = this.peers.get(peerId);
                if (!entry) return;
                entry.remoteMuted = Boolean(muted);
                if (entry.audioEl) entry.audioEl.muted = this.deafened || entry.remoteMuted;
              }

              disconnectLocal({ keepMic = false } = {}) {
                for (const peerId of Array.from(this.peers.keys())) {
                  this._closePeer(peerId);
                }
                this.roomId = null;
                this.roomName = "";
                this.speaking = false;
                this.pttActive = false;
                if (!keepMic) {
                  this._teardownVad();
                  if (this.localStream) {
                    for (const t of this.localStream.getTracks()) t.stop();
                    this.localStream = null;
                  }
                  this.micAvailable = false;
                  this.micState = "idle";
                }
                this.onStateChange?.(this.getSnapshot());
              }
            }
