# Üçüncü taraf yazılımlar ve 3D varlıklar

Tarayıcı kütüphaneleri CDN bağlantısı olmadan `vendor/` içinden, 3D varlıklar ise `assets/models/` içinden yerel olarak sunulur.

| Bileşen | Lisans | Yerel lisans / kaynak |
| --- | --- | --- |
| Socket.IO Client | MIT | `vendor/socket.io.LICENSE` |
| Highlight.js | BSD 3-Clause | `vendor/highlight.LICENSE` |
| Three.js (WebGL, GLTFLoader, OrbitControls, MeshoptDecoder) | MIT | `vendor/three/LICENSE` |
| VALID Avatars (`MENA_F_2_Busi.glb` → `assets/models/dealer.glb`) | MIT | `https://github.com/c-frame/valid-avatars-glb` |
| 3D Dice Smooth Pip (`smooth-pip.json`, `pips-normal.png`, `pips-light.png` → `assets/models/dice.glb`) | MIT | `https://github.com/3d-dice/dice-themes` (Copyright (c) 2022 3D Dice / Frank Ali) |

Sürüm ve bütünlük bilgileri `package-lock.json` içindedir. Güncellemek için bağımlılıkları güncelledikten sonra `npm run vendor` çalıştırıp üretilen dosyaları da commit edin. Uygulamanın MIT lisansı üçüncü tarafların lisanslarının yerine geçmez.
