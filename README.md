# X Video Downloader - Personal (Brave)

Kişisel kullanım için hazırlanmış Manifest V3 Brave/Chromium eklentisi.

## Ne yapar?

- x.com ve twitter.com üzerindeki video içeren gönderilere indirme düğmesi ekler.
- X'in sayfa içi GraphQL cevaplarındaki `video.twimg.com` video varyantlarını yerel olarak yakalar.
- Bulunan doğrudan MP4/WebM seçenekleri arasında en yüksek çözünürlüklüyü tercih eder.
- Brave'in `chrome.downloads` API'si ile dosyayı otomatik olarak `İndirilenler/X-Videos/` klasörüne kaydeder.
- Herhangi bir harici sunucuya veri göndermez.

## Brave'e kurulum

1. ZIP'i bir klasöre çıkart.
2. Brave adres çubuğuna `brave://extensions` yaz.
3. Sağ üstten **Geliştirici modu**nu aç.
4. **Paketlenmemiş öğe yükle / Load unpacked** seçeneğine bas.
5. Bu klasörü seç: `x-video-downloader-brave`
6. x.com sayfasını yenile.

## Kullanım

1. X'te video bulunan bir gönderi aç.
2. Tweet aksiyonlarının yanında indirme ikonunu göreceksin.
3. Bir kez tıkla.
4. Eklenti yakalanan MP4 varyantları içinden en yüksek çözünürlüklü olanı indirir.

## Eğer "video kaynağı henüz yakalanmadı" mesajı çıkarsa

Videoyu 1-2 saniye oynat ve indirme düğmesine tekrar bas. X bazı gönderilerde video kaynaklarını ancak oynatma başlayınca yüklüyor.

## Teknik not

X bazı videolarda HLS (`.m3u8`) ve bazı videolarda doğrudan MP4 kaynakları sunabiliyor. Bu sürüm tarayıcı içinde ek dönüştürücü/FFmpeg taşımamak için doğrudan MP4/WebM varyantını tercih eder. Yalnızca HLS yakalanan özel durumlarda kullanıcıdan videoyu oynatıp tekrar denemesini ister.

## Dosyalar

- `manifest.json` — Manifest V3 tanımı
- `background.js` — video URL önbelleği ve indirme işlemi
- `page-hook.js` — X'in ağ/GraphQL cevaplarından video varyantlarını yakalar
- `content.js` — tweetlere indirme düğmesi ekler
- `content.css` — düğme ve bildirim görünümü

## Gizlilik

Eklenti X/Twitter ve `video.twimg.com` alan adlarında çalışır. Yakalanan medya URL'leri yalnızca tarayıcı belleğinde geçici olarak tutulur; harici bir API veya sunucu kullanılmaz.

Yalnızca indirme hakkına/iznine sahip olduğun içeriklerde kullan.

## v1.1.0 görünüm güncellemesi

Bu sürümde indirme düğmesi tweet altındaki aksiyon barından alınarak doğrudan video alanının sağ üst köşesine taşındı. Böylece:
- daha görünür oldu,
- tıklaması kolaylaştı,
- daha estetik "floating pill" görünümüne kavuştu.
