# Yayına geçiş

Bu sürüm mevcut `chat.haking.tr` ve `chat-backend-qmzo.onrender.com` adresleri için hazırdır. Kurucu Halit ve moderatörler Panda, Nurullah, Sosyal Enik önceki parolalarıyla giriş yapabilir. Parola doğrulama özetleri yalnızca backend `config/staff.json` dosyasındadır. Yeni bir SQL hizmeti veya parola ayarı gerekmez. Önce backend deposunu, ardından frontend deposunu push edin.

## 1. Backend / Render

1. `chat-backend` deposundaki README ve `.env.example` dosyasını okuyun.
2. Render servisinde kurulum komutunu `npm ci`, başlatma komutunu `npm start` olarak ayarlayın. Node.js sürümünü backend'in belirttiği sürümle eşleştirin.
3. Mevcut girişler `config/staff.json` ile otomatik çalışır. İsterseniz `ADMIN_PASSWORD`, `ADMIN_NAME` ve `MODERATORS_JSON` ile backend README'sinde açıklanan şekilde üzerine yazabilirsiniz; bu sürümü kullanmak için zorunlu değiller. Gerçek `.env` ve Render erişim bilgilerini GitHub'a göndermeyin.
4. `https://chat.haking.tr` zaten izin verilen origin listesindedir. Render üzerinde proxy ayarı otomatik `1`, yerelde `0` seçilir. Özel bir proxy zinciri kullanıyorsanız `TRUST_PROXY` ile açıkça ayarlayabilirsiniz. Geçici Pages önizlemelerine erişim gerekiyorsa ilgili tam adresi ayrıca ekleyin.
5. Backend'i yayınlayın; sağlık kontrolünü ve Render loglarını doğrulayın. Ücretsiz servis uykuya geçerse ilk bağlantı gecikebilir.

## 2. Frontend / Cloudflare Pages

1. `chat` deposunu Pages projesine bağlayın. Framework: **None**, build komutu: **boş**, çıktı dizini: **`/`**.
2. `config.js` içindeki `window.HAKING_CONFIG.backendUrl` değerinin `https://chat-backend-qmzo.onrender.com` veya kullandığınız gerçek servis adresi olduğundan emin olun. Adres değişirse `_headers` dosyasında HTTPS ve WSS adreslerini de değiştirin. Yerelde `npm install` ve `npm run vendor` çalıştırıp üretilen yerel kütüphaneleri depoya ekleyin.
3. GitHub'a push ederek Pages dağıtımını başlatın. Özel alan adı `chat.haking.tr` için Cloudflare'ın DNS ve sertifika kontrolünün tamamlanmasını bekleyin.
4. Yeni sürüm görünmüyorsa Pages dağıtım commit'ini kontrol edip tarayıcıda zorla yenileyin. Eski HTML'yi süresiz önbelleğe alan özel Cache Rules kullanmayın.

`_headers` Pages statik dağıtımlarında uygulanır. Bu frontend'i farklı bir sunucuda yayınlarsanız eşdeğer güvenlik başlıklarını o sunucuda yapılandırın. Cloudflare Pages, Node.js Socket.IO backend'ini bu statik depodan çalıştırmaz.

## 3. Yayın kontrolü

- İki ayrı tarayıcı oturumuyla sohbet mesajı, kod paylaşımı, yanıt ve çevrimiçi listeyi deneyin.
- Kullanıcı → moderatör → kurucu sıralamasına göre izinleri doğrulayın. Normal kullanıcı yönetim işlemi yapamamalıdır.
- Bir kullanıcıyla oyun oluşturun, diğeriyle katılın. Sıra dışı hamle, oyundan ayrılma ve botla oynama akışlarını kontrol edin.
- Mobil görünümde yatay taşma, gönder butonu, tema değişimi ve klavye erişimini kontrol edin.
- Sunucu yeniden başlatıldığında hangi verilerin saklandığını backend README'sinden kontrol edin; bellek tabanlı geçmişi kalıcı arşiv olarak kabul etmeyin.

Bu sürüm son 300 mesajı ve 100 yönetim işlemini bellekte tutar. Sunucu yeniden başladığında geçmiş ve oyunlar sıfırlanır. Tek backend süreci kullanın; kalıcı arşiv veya birden fazla sunucu için paylaşımlı veritabanı ve Socket.IO adapter eklenmelidir.

## Moderatörler

Kurucu girişinden sonra üst çubukta **Moderatörler** düğmesi görünür. Kayıtlı ekip ve çevrimiçi durumları burada listelenir. Mevcut disk gerektirmeyen kurulumda liste kaynak dosyasından gelir; canlı ekle/sil kontrolleri kapalıdır.

İleride yeni moderatör eklemek için backend klasöründe `npm run staff:add`, silmek için `npm run staff:remove` kullanın. Parola gizli olarak alınır ve yalnızca doğrulama özeti yazılır. Değişen `config/staff.json` dosyasını push edin. Bu işlemi bir sonraki isteğinizde Codex de yapabilir.

SQL olmadan canlı yönetim altyapısı da hazırdır: zaten kalıcı diski olan tek bir backend sürecinde `MODERATOR_STORAGE_FILE` o diskteki dosyaya ayarlanırsa ekle/sil kontrolleri açılır. Bu sürüm ek ücretli disk oluşturmaz. Geçici Render dosya sistemine bu ayarı yapmayın; değişiklikler yeniden başlatmada kaybolur. Kalıcı dosya oluşturulduğunda moderatörler için kaynak odur; depo listesindeki sonraki değişiklikler otomatik içe aktarılmaz.

## 4. Bulunabilirlik ve depo

Google Search Console ve Bing Webmaster Tools üzerinden alan adını doğrulayın, `/sitemap.xml` gönderin. GitHub deposunun **About** bölümüne canlı adresi, kısa açıklamayı ve `chat`, `socket-io`, `javascript`, `community`, `tic-tac-toe` etiketlerini ekleyebilirsiniz. GitHub **Settings → Security → Private vulnerability reporting** özelliğini açın.

README, MIT lisansı, katkı rehberi ve hata/özellik şablonları depoda hazırdır. Arama motorlarının taraması zaman alır; sohbet mesajlarının herkese açık olması onları otomatik olarak arama sonuçlarına taşımaz.
