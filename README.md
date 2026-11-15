# Haking Chat

[![Canlı Site](https://img.shields.io/badge/Canl%C4%B1-chat.haking.tr-c5f273?style=flat-square&labelColor=101311)](https://chat.haking.tr/)
[![Teknoloji](https://img.shields.io/badge/Frontend-HTML%20%7C%20CSS%20%7C%20Three.js-168a51?style=flat-square&labelColor=101311)](https://chat.haking.tr/)
[![Lisans](https://img.shields.io/badge/Lisans-MIT-253028?style=flat-square&labelColor=101311)](LICENSE)

Türkçe geliştirici topluluğu için gerçek zamanlı sohbet, kod paylaşımı ve çok oyunculu oyun alanı.  
Canlı adres: **[https://chat.haking.tr/](https://chat.haking.tr/)**

![Haking Chat Afiş](assets/banner.svg)

---

## Öne çıkan özellikler

### Sohbet ve kod paylaşımı
- **Kanallara uyumlu arayüz**: `#genel-sohbet` yalnızca `Sohbet akışı` ve `Sabitlenenler` sekmelerini sunar; kod araçları sadece `#kod-paylaşımı` kanalında aktiftir.
- **Canlı kod paylaşımı**: Sözdizimi renklendirme (`Highlight.js`), dil seçimi, başlık, indirme, yanıt ve düzenleme.
- **Güvenli rol yönetimi**: Kurucu ve moderatör yetkileri tamamen backend tarafından doğrulanır; sohbet metinlerinde gereksiz sansür yoktur, yalnızca takma adlarda kimliğe bürünme kontrolü uygulanır.
- **Açık / Koyu tema & Mobil kısayollar**: Mobilden yalnızca oyun için giren kullanıcılar için üst çubukta tek dokunuş **♠ Oyunlar** geçişi ve taşmasız responsive yerleşim.

### Oyun Alanı (`oyun-alanı`)
İleride yeni oyunların kolayca eklenebileceği modüler oyun merkezi şu anda 2 ana oyunla gelir:

1. **Blackjack 21 (3D · Canlı Kurpiyer · Max 6 Kişi)**
   - **Three.js 3D sahne + Kurpiyer avatarı**: Yerel `vendor/three/` ve MIT lisanslı 3D kadın kurpiyer modeli (`assets/models/dealer.glb`) ile maun/zümrüt kumarhane masası, 3D kart dağıtım ve çevirme animasyonları, 3D fiş yığınları ve `Masa` / `Elim` / `Üstten` kamera açıları (WebGL desteklemeyen cihazlarda otomatik 2D masa yedeği).
   - **Anında masa menüsü**: İlk oyuncu koltuğa oturduğu anda tüm masa kontrol paneli açılır.
   - **Başlat & Oto Başlat kuralı**: Masada oturanlardan **herhangi biri** `Başlat (10 sn)` tuşuna bastığında 10 saniyelik geri sayım başlar; **6 koltuğun tamamı dolduğunda** oyun otomatik olarak başlar.
   - **Profesyonel kurallar**: 6 deste karışım, **1.000 başlangıç fişi** (+ bakiye bitince +500 yenileme), `10–500` bahis, **Kart Çek / Dur / 2× Katla / Böl (Split)**, doğal Blackjack **3:2** ödeme, **Kasa tüm 17'lerde durur**, gizli kasa kartı koruması, 25 saniyelik AFK koruması ve masa içi hızlı tepkiler (`🔥 👏 😎 😱 🍀 💎`).

2. **XOX · Strateji Arenası (1v1 & Akıllı Bot)**
   - **Kusursuz 1v1 Tekrar Oyna**: Maç sonunda `Tekrar oyna`ya basıldığında yeni oda olarak lobiye düşmez; doğrudan rakibin ekranına **Kabul et / Reddet** penceresi gider.
   - **Sıra sıra ilk hamle**: Kabul edilen her yeni elde başlayan taraf otomatik değişir (`1. el × → 2. el ○ → 3. el × ...`), skor ve el sayacı korunur.
   - **Bot zorlukları**: `Kolay`, `Orta` ve yenilmez Minimax `Zor` seviyesi; animasyonlu SVG taşlar, kazanan çizgi efekti ve Web Audio ses efektleri (kapatılabilir).

---

## Mimarî ve yerel kurulum

Frontend derleme adımı gerektirmez; tarayıcı bağımlılıkları CDN olmadan `vendor/` klasöründen sunulur. Gerçek zamanlı sohbet ve oyun mantığı ayrı **`chat-backend`** sunucusunda çalışır.

```powershell
npm ci
npm run vendor
npm run dev
```

Tarayıcıda `http://localhost:5173` adresini açın. `config.js` içindeki `window.HAKING_CONFIG.backendUrl` yerelde `http://localhost:3000`, canlıda `https://chat-backend-qmzo.onrender.com` adresine bağlanır.

Doğrulama ve üçüncü taraf kontrolleri:

```powershell
npm run check
npm audit --audit-level=high
```

---

## Yayınlama (Cloudflare Pages + Render)

Ayrıntılı yayın sırası ve kontrol listesi: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)  
Üçüncü taraf lisans ve 3D varlık bildirimleri: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

| Cloudflare Pages Ayarı | Değer |
| --- | --- |
| Framework preset | `None` |
| Build command | Boş |
| Build output directory | `/` (depo kökü) |
| Custom domain | `chat.haking.tr` |

> **Önemli:** `npm run vendor` çıktısı olan `vendor/` dosyaları ve `assets/models/dealer.glb` Git deposunda tutulur. Güvenlik başlıkları (`'wasm-unsafe-eval'` ve `blob:` dahil) [`_headers`](_headers) içindedir.

---

## Katkı ve lisans

[Katkı rehberi](CONTRIBUTING.md) · [Güvenlik bildirimi](SECURITY.md) · [MIT lisansı](LICENSE)
