# Üçüncü taraf yazılımlar

Tarayıcı kütüphaneleri CDN bağlantısı olmadan `vendor/` içinden sunulur.

| Yazılım | Lisans | Yerel lisans |
| --- | --- | --- |
| Socket.IO Client | MIT | `vendor/socket.io.LICENSE` |
| Highlight.js | BSD 3-Clause | `vendor/highlight.LICENSE` |

Sürüm ve bütünlük bilgileri `package-lock.json` içindedir. Güncellemek için bağımlılıkları güncelledikten sonra `npm run vendor` çalıştırıp üretilen dosyaları da commit edin. Uygulamanın MIT lisansı üçüncü tarafların lisanslarının yerine geçmez.
