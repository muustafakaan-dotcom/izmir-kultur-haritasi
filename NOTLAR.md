# İzmir Kültür Haritası (etkinlik-takip)

İzmir'deki tiyatro, konser, stand-up, sergi vb. etkinlikleri + müzeler ve ören yerleri, 3B havalı harita üzerinde.
Geri sayım ve hatırlatma (Takvimim).

## Çalıştırma
- `npm run collect` → kaynaklardan güncel etkinlikleri çeker, `public/data/events.json` yazar (~15 sn; ilk seferde koordinat aramaları yüzünden ~4 dk).
- `npm run dev` → site. Veri dosyası elle güncellenir; yayında Cloudflare Worker cron'u ile otomatik olacak (yapılmadı).

## Veri kaynakları (collector/collect.js)
- **İzBB Kültürsanat API** `kultursanatapi.izmir.bel.tr/api/{event,session,venue}/list` — Şehir Tiyatroları, AASSM, İzBB konser/sergi/sinema. Mekan koordinatları API'de var. CORS kapalı → sunucudan çekilmeli.
- **Biletinial** `biletinial.com/tr-tr/{tiyatro,muzik,etkinlik}/izmir` → her etkinlik sayfası.
  Devlet Tiyatroları, özel tiyatrolar, stand-up, konserler. DT tespiti: slug `-dt` veya mekan linki `/mekan/izmir-devlet-tiyatrosu`.
  **Dikkat:** sayfadaki JSON-LD `startDate` bazen +3 saat kaymış geliyor (Biletinial hatası). Saat, görünür seans satırlarındaki
  `data-start` özniteliğinden okunuyor; JSON-LD sadece mekan/adres için.
- DT'nin kendi sitesi (Next.js) açık veri vermiyor; DT biletleri zaten Biletinial'de.
- Bakılmadı / sonraki adım: Biletix, Passo (konserler), Bubilet (403 veriyor).

## Konumlar
- Bilinen sahneler `KNOWN_VENUES` (elle). Gerisi Photon → Nominatim (saniyede 1 istek). Sonuç, mekanın adresindeki ilçede değilse reddedilir.
- Bulunamayan → ilçe merkezi, `approx: true` → **haritada pin olmaz**, sadece listede görünür. Önbellek `collector/geo-cache.json`.
- `src/data/places.js`: müzeler + ören yerleri, koordinatlar yaklaşık (doğrulanacak).

## Hatırlatma (src/reminders.js)
- Takvimim localStorage'da. Tarayıcı bildirimi yalnızca site açıkken çalışır.
- Kesin hatırlatma: "Takvime ekle" → .ics (VALARM'lı) ya da Google Takvim linki.
- Sonraki adım: Web Push (PWA + Worker cron) — iPhone'da ana ekrana eklenmiş PWA gerekir.

## Teknik notlar
- MapLibre 6 + Vite: worker `?url` ile import edilip `setWorkerUrl` ile veriliyor.
- `.pin`'e `position` verme (MapLibre'nin absolute'unu bozar); gizlemek için `visibility` (opacity'yi MapLibre ezer).
- Akıcılık: panelde/pinlerde `backdrop-filter` YOK (WebGL üstünde her karede yeniden hesaplanıyordu); pixelRatio ≤ 2; DEM maxzoom 12; binalar z14+;
  zoom sınıfı sadece eşik geçişinde değişiyor; liste 60'arlı parça parça çiziliyor.
