# Haking Chat

[![Canlı Site](https://img.shields.io/badge/Canl%C4%B1-chat.haking.tr-c5f273?style=flat-square&labelColor=101311)](https://chat.haking.tr/)
[![Teknoloji](https://img.shields.io/badge/Frontend-HTML%20%7C%20CSS%20%7C%20Three.js-168a51?style=flat-square&labelColor=101311)](https://chat.haking.tr/)
[![Lisans](https://img.shields.io/badge/Lisans-MIT-253028?style=flat-square&labelColor=101311)](LICENSE)

Türkçe geliştirici topluluğu için gerçek zamanlı sohbet, kod paylaşımı ve çok oyunculu oyun alanı.  
Canlı adres: **[https://chat.haking.tr/](https://chat.haking.tr/)**

![Haking Chat Afiş](assets/banner.svg)

---

## Öne çıkan özellikler

### Sohbet, URL Rotaları ve Yetki Düzeni
- **Kanallara uyumlu arayüz**: `#genel-sohbet` yalnızca `Sohbet akışı` ve `Sabitlenenler` sekmelerini sunar; kod araçları sadece `#kod-paylaşımı` kanalında aktiftir.
- **Tam Çevrimdışı Türkçe Emoji Seçici & Tepkiler (`emoji-picker-element`)**: CDN bağımlılığı olmadan yerel `vendor/emoji/` veri setiyle sohbet yazma alanı, masa içi mini sohbet ve tüm mesaj tepkilerinde tam Unicode emoji desteği (arama, kategoriler, sık kullanılanlar ve açık/koyu tema uyumu).
- **Masa İçi Mini Sohbet Çekmecesi, `@kullanıcı` Otomatik Tamamlama & Bildirimler**: Yazarken `@` tuşuyla çevrimiçi üye seçimi, kenar çubuğunda okunmamış kanal mesaj sayacı ve oyun oynarken sağ altta şeffaf mini sohbet penceresi (`#genel` / `#kod`, sesli/başlık `@` uyarısı).
- **Paylaşılabilir akıllı URL rotaları**:
  - `https://chat.haking.tr/` → `#genel-sohbet`
  - `https://chat.haking.tr/?kanal=kod` → doğrudan `#kod-paylaşımı`
  - `https://chat.haking.tr/?sayfa=oyunlar` → doğrudan `Oyun Alanı`
- **Ayrıştırılmış Kurucu & Moderatör yetkileri** *(tamamı backend doğrulamalı)*:
  - **Moderatör (`Moderasyon`)**: Süreli (`5 dk / 15 dk / 1 saat / süresiz`) ve sebepli susturma, ses açma, kanal yavaş modu (`5–60 sn`), odadan çıkarma, mesaj silme ve kanal başına 3 mesaj sabitleme.
  - **Kurucu (`Yönetim`)**: Tüm moderasyon yetkilerine ek olarak moderatör ekleme/çıkarma, ad değiştirme, kanalı kilitleme/temizleme, resmi duyuru yayınlama, oyun lobisini sıfırlama ve tam denetim günlüğü.
- **Kalıcı Oturum (`sessionToken` + `localStorage`) & 20 dk Hareketsizlik Zaman Aşımı**:
  - Sohbete katılan tüm kullanıcılar (üye, moderatör, kurucu) tarayıcı `localStorage` (`haking.sessionToken`) ve sunucu RAM'inde eşlenen UUID oturum jetonu ile sayfayı yenilediğinde veya sekmeden döndüğünde şifre girmeden/atılmadan otomatik geri bağlanır.
  - 20 dakika hareketsiz kalan oturumlar sunucu temizleyicisi tarafından `session_expired` olayı ile sonlandırılıp RAM'den silinir; **Çıkış yap** butonunda hem `localStorage` hem sunucu RAM oturumu anında temizlenir.
- **Açık / Koyu tema & Mobil kısayollar**: Mobilden yalnızca oyun için giren kullanıcılar için üst çubukta tek dokunuş **♠ Oyunlar** geçişi ve taşmasız responsive yerleşim.

### Oyun Alanı (`oyun-alanı`)
Modern oyun merkezi düzeniyle **Canlı Masalar & Bekleyenler** çubuğu sayfanın **en üstünde** kaydırmadan anında görünür (bekleyen masalar öncelikli sıralanır); `Tümü`, `Bekleyen`, `Rulet`, `Tavla`, `Okey`, `101`, `Satranç`, `Blackjack`, `Zar`, `XOX`, `İzle` filtreleri + anlık arama ve masaüstü/mobil dikey + yatay (*landscape*) tam uyumlu 8 oyun içerir:

- **Rulet 3D (Avrupa · Canlı Kurpiyer · Her 60 sn Oto Çark & RaceTrack)**
  - **Three.js 3D sahne + Monte-Carlo Rulet Çarkı (`assets/models/roulette.glb`) & Canlı Kurpiyer (`assets/models/dealer.glb`)**: VIP ahşap salon fonu, 37 bölmeli tek sıfırlı (`0–36`) çark, ters yönlü fildişi top ve elmas deflektör fiziği, fırlatılan 3D fiş animasyonu, yığın üstü anlık toplam etiketleri, etkileşimli 3D çuha + dokunmatik 2D ayna masa ve `2D` yedeği.
  - **Her 60 Saniyede Bir Otomatik Çok Oyunculu Masa (`1–8 Kişi` + `İzle 👁`)**: Başlat tuşuna basılmadan tüm oturumdaki oyuncular aynı masada **60 sn tam tur döngüsüyle** oynar (`48 sn` bahis + `6.8 sn` çark dönüşü + `5.2 sn` sonuç/ödeme).
  - **Sol Tık Ekle · Sağ Tık Kaldır & Sınırsız Bahis**: Aynı turda kısıtlama olmadan **Tek Sayı (35:1)**, **Split (17:1)**, **Sıra/Üçlü (11:1)**, **Köşe/İlk Dörtlü (8:1)**, **Altılı (5:1)**, **Düzine/Sütun (2:1)**, **Kırmızı/Siyah/Tek/Çift/1–18/19–36 (1:1)** ile *RaceTrack* (`Voisins du Zéro`, `Tiers du Cylindre`, `Orphelins`, `Jeu Zéro`, `±1/±2/±3 Komşular`) serbestçe birleştirilir; **sağ tık** (veya mobilde **🧹 Kaldır** silgi modu) ile seçilen yerdeki kendi bahsin anında kaldırılır, `↩ Geri Al`, `✕ Temizle`, `↻ Tekrarla`, `½`, `×2` ve `<100` fiş altında `+500 Fiş Al` aktiftir.
  - **Tam Canlı Şeffaflık, 🔥 Sıcak / ❄️ Soğuk & Son 18 Tur**: Her oyuncunun çipleri kendine özel renkte 3D çuha üzerinde ve yığın etiketlerinde görünür; sağ/alt canlı akışta kimin nereye kaç fiş bastığı anlık listelenir, **Sıcak / Soğuk** sayılar ve **Son 18 Tur** geçmişi + masa içi hızlı tepkiler (`🔥 👏 😎 🍀 💎 😱`) sunulur.

0. **Tavla 3D (Resmî Türk Tavlası · Yapay Zekâ Bot & Aynı Masada Rövanş)**
   - **Three.js 3D sahne + Ceviz Kasalı Tavla & Zarlar (`assets/models/tavla.glb` + `dice.glb`)**: Sedef/maun kakma oyun zemini, tornalanmış içbükey Beyaz & Siyah pullar, fiziksel 3D zar atışı animasyonu, `[Boşluk] Zar At` / `[Z] Geri Al` / `[R] Üstten Kamera` / `[F] Yön Çevir` kısayolları ve WebGL yoksa otomatik 2D tahta.
   - **%100 Resmî Tavla Kuralları**: Açılış zarı (eşitte tekrar atış, kazanan doğrudan oynar), çift zarda **×4** hamle, tek pul kırma ve mecburi kırık girişi, **en fazla zar + büyük zar zorunluluğu**, ev içinde taş toplama kuralları, _Gele_ oto-geçiş, **Normal (1) / Mars (2) / Üçlü Mars (3)** skorlama ve `1 / 3 / 5` el hedefi.
   - **Bot Modu & Aynı Masada Rövanş**: `Kolay / Orta / Usta` yapay zekâ botuna karşı veya 1v1 canlı oyunda maç bitiminde lobiye dönmeden **aynı masada rövanş** teklif/kabulü (Beyaz ↔ Siyah değişimi), **İzle** modu ve mobil ekran kilidi `playerId` **5 dk** geri bağlanma koruması.

1. **Klasik Okey 3D & 101 Okey 3D (4 Kişi Zorunlu · Gizli Eller · Manuel & Otomatik Dizme)**
   - **Three.js 3D sahne + Özel Taş/Istaka Modeli (`assets/models/okey.glb`)**: Pürüzsüz pahlı taşlar, ahşap 2 katlı ıstaka, `Kuş Bakışı` / `Masa Açısı` kamera ön ayarları, ortadan deste & soldan atık çekme, canlı **İzle** modu ve her iki oyun için görselli **? Nasıl Oynanır** rehberi.
   - **Gerçek kurallar & Gizli El Koruması**: 4 koltuk dolmadan el başlamaz; rakiplerin ıstaka taşları ve kapalı deste asla sunucu dışına sızdırılmaz.
   - **Klasik Okey**: `12-13-1` sarmal seri (13-1-2 hariç), 3–4 farklı renk aynı sayı set, **Gösterge / Okey / Sahte Okey**, **7 Çift**, gösterge gösterme, normal / çift / Okey atarak bitme puanlaması.
   - **101 Okey**: 21/22 taş dağıtımı, seri toplamı **≥ 101** veya **≥ 5 Çift** açma, anlık per puanı sayacı, soldan al-aç kuralı (taşı geri bırakma hakkıyla), açılmış seri perlere doğrudan **taş işleme**, **işlek / Okey atma `+101` cezası** ve el sonu (`-101` / `+202`) puan tablosu.
   - **Manuel & Otomatik Taş Dizme**: Bilgisayarda sürükle-bırak ve mobilde (dikey & yatay) tek dokunuş taşı-yerleştir ile manuel düzenleme yanında `12-13-1`, 6–13'lü perler, Okey jokerleri ve 101+ açılış hedefini önceliklendiren gelişmiş **Seri Diz** / **Çift Diz** çözücüsü.
   - **60 sn Tur Süresi, Akıllı Bot Devralma & İzleyiciden Koltuğa Oturma**: Oyuncuya taş çekme ve olasılık hesaplama için rahat `60 sn` süre tanınır (süre dolarsa güvenli otomatik hamle oynanır; 2 ardışık AFK veya masadan ayrılmada masa dağılmadan **🤖 Akıllı Bot** devam eder). İzleyiciler ya da lobideki oyuncular **Bot Yerine Otur** ile doğrudan botun yerine geçebilir.

2. **Satranç 3D (Kuş Bakışı · Serbest Gezinme · İzle Modu & Bot)**
   - **Aşırı kuş bakışı varsayılan kamera**: Üstten tam hâkimiyet sunan dik açıyla açılır; `OrbitControls` ile serbest 3D gezinme, `Kuş Bakışı` / `3D Açı` ön ayarları ve `Tahtayı Çevir` desteği (WebGL yoksa otomatik 2D tahta).
   - **Tam FIDE kuralları (`chess.js`)**: Rok, geçerken alma (en passant), terfi taşı seçici (`Vezir/Kale/Fil/At`), şah mat/pat/üçlü tekrar, SAN hamle geçmişi, alınan taşlar ve rövanşta Beyaz ↔ Siyah dönüşümü.
   - **Canlı İzle Modu (`İzle 👁`)**: Uzun süren 1v1 veya bot maçlarına lobiden tek tıkla izleyici olarak katıl; hamleleri gerçek zamanlı izlerken sağ alttan mini sohbete katıl.
   - **Mobil Ekran Kilidi / Kopma Koruması (`localStorage` + 5 dk Grace Period)**: Kalıcı `playerId` ve aktif masa kaydı ile telefon ekranı kilitlenip açılsa ya da sayfa yenilense bile oyun sıfırlanmaz; 5 dakika içinde otomatik olarak kaldığın tahta durumundan devam edersin.
   - **3 seviyeli Yapay Zeka Bot**: Alpha-Beta budamalı `Kolay`, `Orta` ve `Usta Bot`.

3. **Blackjack 21 (3D · Canlı Kurpiyer · Max 6 Kişi)**
   - **Three.js 3D sahne + Kurpiyer avatarı**: Yerel `vendor/three/` ve MIT lisanslı 3D kadın kurpiyer modeli (`assets/models/dealer.glb`) ile maun/zümrüt kumarhane masası, 3D kart dağıtım ve çevirme animasyonları, 3D fiş yığınları ve `Masa` / `Elim` / `Üstten` kamera açıları (WebGL desteklemeyen cihazlarda otomatik 2D masa yedeği).
   - **Anında masa menüsü**: İlk oyuncu koltuğa oturduğu anda tüm masa kontrol paneli açılır.
   - **Başlat & Oto Başlat kuralı**: Masada oturanlardan **herhangi biri** `Başlat (10 sn)` tuşuna bastığında 10 saniyelik geri sayım başlar; **6 koltuğun tamamı dolduğunda** oyun otomatik olarak başlar.
   - **Profesyonel kurallar**: 6 deste karışım, **1.000 başlangıç fişi** (+ bakiye bitince +500 yenileme), `10–500` bahis, **Kart Çek / Dur / 2× Katla / Böl (Split)**, doğal Blackjack **3:2** ödeme, **Kasa tüm 17'lerde durur**, gizli kasa kartı koruması, 25 saniyelik AFK koruması ve masa içi hızlı tepkiler (`🔥 👏 😎 😱 🍀 💎`).

4. **Zar Düellosu (3D · 1–6 Kişi & Bot)**
   - **Three.js 3D zar masası**: MIT lisanslı pahlı 3D zar modeli (`assets/models/dice.glb`), sekizgen keçe zar tepsisi, zar fırlatma fiziği, 3D dokunma (raycasting) + mobilde başparmakla hızlı seçim çubuğu ve WebGL yoksa otomatik 2D mod.
   - **Görsel Kurallar Rehberi (`? Nasıl Oynanır`)**: Kart ve masa üstü çubuğundan açılan görselli puan tablosu penceresi.
   - **Esnek masa yapısı**: Tek kişi **Zar Botu ile 1v1**, arkadaşlarla **1v1** ya da **6 kişiye kadar çok oyunculu**; **Hızlı `2.000` / Standart `3.000` (varsayılan) / Uzun Tur `5.000`** hedef puan seçenekleri.
   - **Farkle kuralları**: `1=100`, `5=50`, üçlü ve katları (`4×/5×/6×`), `1-6 Sıralı (1.500)`, `Üç Çift (1.500)`, `İki Üçlü (2.500)`, tüm zarlar puan verirse **Sıcak Zar** hakkı ve risk alıp kasaya yazma stratejisi.

5. **XOX · Strateji Arenası (Klasik 3×3 Varsayılan & Sonsuz 3 Taş)**
   - **Klasik 3×3 (varsayılan) & Sonsuz 3 Taş (`Beraberesiz`)**: Varsayılan olarak Klasik 3×3 açılır; berabere istemeyenler menüden **Sonsuz 3 Taş** seçerek 4. taşta en eski taşın kalktığı modu oynayabilir.
   - **Kusursuz 1v1 Tekrar Oyna**: Maç sonunda `Tekrar oyna`ya basıldığında yeni oda olarak lobiye düşmez; doğrudan rakibin ekranına **Kabul et / Reddet** penceresi gider ve her elde **ilk başlayan taraf sıra sıra değişir** (`starterIndex`).
   - **Geliştirilmiş Yenilmez Bot**: Tuzak olasılığı en yüksek ve en hızlı bitiren hamleleri seçen çeşitlendirilmiş Minimax zekası.

---

## Mimarî ve yerel kurulum

Frontend derleme adımı gerektirmez; tarayıcı bağımlılıkları CDN olmadan `vendor/` klasöründen sunulur. Gerçek zamanlı sohbet ve oyun mantığı ayrı **`chat-backend`** sunucusunda çalışır.

```powershell
npm ci
npm run vendor
npm run dev
```

Tarayıcıda `http://localhost:5173` adresini açın. `config.js` içindeki `window.HAKING_CONFIG.backendUrl` yerelde `http://localhost:3000`, canlıda `https://chat-api.haking.tr` adresine bağlanır.

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

> **Önemli:** `npm run vendor` çıktısı olan `vendor/` dosyaları ile `assets/models/dealer.glb`, `assets/models/dice.glb`, `assets/models/chess.glb` ve `assets/models/okey.glb` Git deposunda tutulur. Güvenlik başlıkları (`'wasm-unsafe-eval'` ve `blob:` dahil) [`_headers`](_headers) içindedir.

---

## Katkı ve lisans

[Katkı rehberi](CONTRIBUTING.md) · [Güvenlik bildirimi](SECURITY.md) · [MIT lisansı](LICENSE)
