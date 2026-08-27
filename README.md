# Personal X & Instagram Video Downloader

> **Personal project / kişisel kullanım projesi.**  
> Bu depo benim Brave tarayıcımda kullanmak ve tarayıcı eklentisi geliştirmeyi öğrenmek için hazırladığım küçük bir kişisel projedir. Ticari bir ürün, resmi istemci veya X / Instagram hizmeti değildir.

Brave üzerinde X (Twitter) ve Instagram videolarının üzerine küçük bir **İndir** düğmesi ekleyen, mümkün olduğunda mevcut video kalite seçeneklerini gösteren Manifest V3 tarayıcı eklentisi.

## Neden yaptım?

X ve Instagram'da kendi tarayıcı kullanımım sırasında, indirme hakkına sahip olduğum videoları ayrı bir siteye veya üçüncü taraf indirme servisine göndermeden daha pratik şekilde kaydetmek istedim.

Projenin temel hedefleri:

- kişisel kullanım,
- basit ve temiz arayüz,
- üçüncü taraf indirme sitesi kullanmamak,
- mümkün olduğunca işlemleri tarayıcı içinde yapmak,
- Brave / Chromium Manifest V3 yapısını öğrenmek.

## Özellikler

### X / Twitter

- Video bulunan tweetlerde videonun sağ üst tarafında modern indirme düğmesi.
- İndir düğmesine basınca küçük kalite menüsü.
- Yakalanabilen MP4/WebM seçenekleri arasından çözünürlük seçimi.
- En yüksek kaliteyi menüde **EN İYİ** etiketiyle gösterme.
- X'in `video.twimg.com` medya isteklerini ve sayfa içi video varyantlarını yerel olarak yakalama.
- Dosyaları `Downloads/X-Videos/` altında saklama.

### Instagram

- Video gönderileri ve Reels üzerinde indirme düğmesi.
- İndir düğmesine basınca mevcut kalite seçeneklerini gösterme.
- Instagram'ın doğrudan video URL'lerini DOM'daki `blob:` adresine güvenmeden, sayfa/API yanıtlarındaki video verilerinden yakalamaya çalışma.
- `video_versions` / `video_url` gibi mevcut medya verilerinden progressive MP4 kaynaklarını kullanma.
- Dosyaları `Downloads/Instagram-Videos/` altında saklama.

## Gizlilik yaklaşımı

Bu proje için özellikle basit bir yaklaşım tercih ettim:

- Kendi indirme sunucum yok.
- Üçüncü taraf video indirme API'si kullanılmıyor.
- Analitik veya takip kodu yok.
- Yakalanan medya URL'leri uzantının belleğinde geçici olarak tutuluyor.
- İndirme Brave/Chromium'un kendi `downloads` API'si ile başlatılıyor.

Eklenti yalnızca gerekli platform ve medya alan adları için izin ister.

## Kurulum — Brave

Bu proje mağaza üzerinden dağıtılan bir eklenti değil. Kişisel olarak **unpacked extension** şeklinde kullanıyorum.

1. Repoyu indir veya klonla.
2. Brave'de şu adresi aç:
   `brave://extensions`
3. Sağ üstten **Developer mode / Geliştirici modu** seçeneğini aç.
4. **Load unpacked / Paketlenmemiş öğe yükle** seçeneğine bas.
5. Bu deponun kök klasörünü seç.
6. Açık X ve Instagram sekmelerini yenile.

## Kullanım

### X

1. Video içeren bir tweet aç.
2. Videonun sağ üstündeki **İndir** düğmesine bas.
3. Açılan kalite menüsünden istediğin çözünürlüğü seç.
4. Video `Downloads/X-Videos/` klasörüne kaydedilir.

### Instagram

1. Bir video gönderisi veya Reel aç.
2. Videonun üzerindeki **İndir** düğmesine bas.
3. Yakalanabilen kalite seçeneklerinden birini seç.
4. Video `Downloads/Instagram-Videos/` klasörüne kaydedilir.

Instagram veya X medya kaynağını henüz yüklememişse videoyu birkaç saniye oynatıp tekrar denemek gerekebilir.

## Proje yapısı

```text
personal-social-video-downloader/
├── manifest.json
├── background.js
├── page-hook.js
├── content.js
├── content.css
├── README.md
└── .gitignore
```

### `manifest.json`

Manifest V3 ayarları, platform izinleri ve content script tanımları.

### `page-hook.js`

Sayfanın kendi JavaScript ortamında çalışır. X ve Instagram'ın video bilgilerini taşıyan fetch/XHR yanıtlarını ve medya kaynaklarını gözlemlemeye çalışır.

### `content.js`

Sayfadaki video alanlarını bulur, indirme düğmesini ve kalite menüsünü ekler.

### `background.js`

Yakalanan video varyantlarını sekme bazında geçici olarak tutar, kalite listesini hazırlar ve indirmeyi başlatır.

### `content.css`

Floating indirme butonu, kalite menüsü ve bildirimlerin görünümü.

## Teknik notlar

Bu proje platformların resmi bir indirme API'sini kullanmıyor. X ve Instagram'ın web arayüzünde zaten tarayıcıya gönderilen medya verilerini yerel olarak gözlemlemeye dayanıyor.

Bu nedenle platformların web arayüzleri değiştiğinde belirli özellikler zaman zaman bozulabilir. Özellikle Instagram ön yüzü ve medya sunumu sık değişebildiği için proje **best-effort** mantığıyla çalışır.

Manifest V3 content script yapısında sayfanın kendi `fetch` / XHR akışını gözlemleyebilmek için `page-hook.js` `MAIN` world'de çalışır. UI ve extension mesajlaşma tarafı ayrı content script içinde tutulur.

## Kapsam

Şu anki kişisel kullanım odağı:

- X videoları
- Instagram video postları
- Instagram Reels

Şu anda özellikle hedeflenmeyenler:

- toplu profil indirme,
- Instagram Story arşivleme,
- resim/carousel toplu indirme,
- DRM veya korumalı medya aşma,
- platform erişim kontrollerini atlatma.

## Sorumlu kullanım

Bu eklentiyi yalnızca indirme, saklama veya kullanma hakkına sahip olduğun içeriklerde kullan.

İçeriğin platformda görüntülenebiliyor olması, onu yeniden dağıtma veya başka amaçlarla kullanma hakkı verdiği anlamına gelmez. İçerik sahibinin hakları ve ilgili platform kuralları kullanıcı tarafından dikkate alınmalıdır.

## Bağlılık / marka açıklaması

Bu proje:

- X Corp. ile bağlantılı değildir,
- Meta Platforms, Inc. veya Instagram ile bağlantılı değildir,
- bu şirketler tarafından onaylanmış veya desteklenmiş değildir.

X, Twitter, Instagram ve ilgili marka adları kendi hak sahiplerine aittir.

## Durum

Bu depo benim **kişisel deneysel projemdir**. Üretim garantisi, resmi destek veya kesintisiz çalışma taahhüdü yoktur. Platform tarafındaki değişikliklere göre zaman zaman güncelleme gerekebilir.

---

Built for my own browser workflow and learning.
