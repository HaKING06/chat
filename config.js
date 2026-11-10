// Cloudflare Pages: üretim adresini kendi Node.js / Socket.IO sunucunla değiştir.
window.HAKING_CONFIG = Object.freeze({
  backendUrl: ["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://localhost:3000"
    : "https://chat-backend-qmzo.onrender.com",
});
