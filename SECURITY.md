# Güvenlik bildirimi

Güncel ana dal desteklenir. Güvenlik açığı bulursanız parolaları, kullanıcı verilerini veya sömürü adımlarını herkese açık issue içinde paylaşmayın.

Depoda **Security → Report a vulnerability** seçeneği açıksa özel bir bildirim oluşturun. Açık değilse depo sahibinin GitHub profilindeki özel iletişim kanalını kullanın. Bildirime etkilenen sürümü, etkiyi ve hassas verilerden arındırılmış tekrar üretme adımlarını ekleyin.

Kurucu ve moderatör girişleri backend'de doğrulanır. Bu sürümde önceki girişler korunur; backend `config/staff.json` dosyasında tuzlanmış scrypt doğrulama özetleri bulunur. Gerçek parolaları frontend'e, hata kayıtlarına veya issue'lara eklemeyin. İsteğe bağlı ortam değişkenleri, `.env` dosyaları ve Render erişim bilgileri Git dışında tutulmalıdır.
