// Etkinlik toplayıcı — hem Node'da (scripts/collect.mjs) hem Cloudflare Worker'da çalışacak şekilde
// yalnızca fetch + düz JS kullanır.
//
// Kaynaklar:
//  • İzBB Kültürsanat API (Şehir Tiyatroları, AASSM, İzBB konser/sergi)  kultursanatapi.izmir.bel.tr
//  • Biletinial İzmir (Devlet Tiyatroları, özel tiyatrolar, stand-up, konser)  sayfalardaki schema.org Event verisi

const UA = 'Mozilla/5.0 (compatible; IzmirKulturHaritasi/0.2)'
const IZBB = 'https://kultursanatapi.izmir.bel.tr/api'
const BI = 'https://biletinial.com/tr-tr'

// ─────────────────────────────── yardımcılar
const sleep = ms => new Promise(r => setTimeout(r, ms))
const clean = s => (s ?? '').toString().replace(/\s+/g, ' ').trim()
const stripHtml = s => clean((s ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<\/p>/gi, ' ').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"))
export const norm = s => clean(s).toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, ' ').trim()
const slugIzbb = e => (e ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
const titleFix = s => {
  s = clean(s).replace(/^["'“”]+|["'“”]+$/g, '')
  // TAMAMI BÜYÜK HARF başlıkları düzelt
  if (s.length > 3 && s === s.toLocaleUpperCase('tr-TR')) {
    s = s.toLocaleLowerCase('tr-TR').replace(/(^|[\s(“"'/-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('tr-TR'))
  }
  return s
}
// "2026-11-25T20:00:00" (saat dilimsiz, İzmir saati) → ISO +03:00
const trIso = s => (!s ? null : /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? new Date(s).toISOString() : new Date(s + '+03:00').toISOString())

async function get(fetchImpl, url, as = 'text', tries = 2) {
  for (let i = 0; i <= tries; i++) {
    try {
      const r = await fetchImpl(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9' } })
      if (!r.ok) throw new Error(`${r.status} ${url}`)
      return as === 'json' ? await r.json() : await r.text()
    } catch (err) {
      if (i === tries) throw err
      await sleep(800 * (i + 1))
    }
  }
}

async function pool(items, n, fn) {
  const out = []; let i = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) }
  }))
  return out
}

// ─────────────────────────────── kategoriler
export const CATEGORY = {
  tiyatro: 'Tiyatro', konser: 'Konser', standup: 'Stand-up', cocuk: 'Çocuk', sergi: 'Sergi',
  sinema: 'Sinema', festival: 'Festival', atolye: 'Atölye', soylesi: 'Söyleşi', diger: 'Diğer',
}
const IZBB_CAT = { tiyatro: 'tiyatro', konser: 'konser', sinema: 'sinema', sergi: 'sergi', atolye: 'atolye', festival: 'festival', 'toplanti panel': 'soylesi' }

function guessCategory(base, title, slug = '') {
  const t = norm(title + ' ' + slug)
  if (/stand ?up|talk show|tek kisilik gosteri/.test(t)) return 'standup'
  if (/cocuk|masal|kukla|minik|bebek|muzikali etkinligi|surpriz gosteri/.test(t)) return 'cocuk'
  return base
}

// ─────────────────────────────── mekanlar
// Bilinen sahnelerin koordinatları. (Yoksa adres → geocode → ilçe merkezi.)
const KNOWN_VENUES = [
  { m: /konak sahnesi/, name: 'İzmir DT Konak Sahnesi', lat: 38.4176, lng: 27.1301 },
  { m: /ragip haykir/, name: 'Karşıyaka Ragıp Haykır Sahnesi', lat: 38.4588, lng: 27.1124 },
  { m: /bozkurt kuruc/, name: 'Bornova Bozkurt Kuruç Sahnesi', lat: 38.4625, lng: 27.2205 },
  { m: /^(ahmed?|a) adnan saygun sanat merkezi/, lat: 38.397312, lng: 27.078044 },
  { m: /piristina|apikam/, lat: 38.4282, lng: 27.1403 },
  { m: /gol gazinosu/, lat: 38.4302, lng: 27.1420 },
  { m: /tarihi asansor/, lat: 38.4078, lng: 27.1245 },
  { m: /aziz vukolos/, lat: 38.4215, lng: 27.1476 },
  { m: /istinye ?(park|art)/, lat: 38.3925, lng: 27.0540, approx: true }, // İstinyePark İzmir, Balçova (yaklaşık)
]
const DISTRICTS = {
  konak: [38.4189, 27.1287], karsiyaka: [38.4561, 27.1094], bornova: [38.4697, 27.2211], buca: [38.3883, 27.1750],
  bayrakli: [38.4622, 27.1636], cigli: [38.4936, 27.0694], balcova: [38.3897, 27.0503], narlidere: [38.3953, 26.9989],
  guzelbahce: [38.3708, 26.8903], gaziemir: [38.3203, 27.1311], karabaglar: [38.3814, 27.1294], urla: [38.3226, 26.7647],
  cesme: [38.3236, 26.3031], seferihisar: [38.1969, 26.8386], torbali: [38.1550, 27.3639], menemen: [38.6078, 27.0697],
  selcuk: [37.9506, 27.3689], bergama: [39.1214, 27.1797], odemis: [38.2280, 27.9690], tire: [38.0894, 27.7347],
  foca: [38.6700, 26.7569], dikili: [39.0717, 26.8886], aliaga: [38.7997, 26.9722], kemalpasa: [38.4270, 27.4170],
  menderes: [38.2525, 27.1339], karaburun: [38.6375, 26.5122],
}
const DISTRICT_NAMES = {
  konak: 'Konak', karsiyaka: 'Karşıyaka', bornova: 'Bornova', buca: 'Buca', bayrakli: 'Bayraklı', cigli: 'Çiğli', balcova: 'Balçova',
  narlidere: 'Narlıdere', guzelbahce: 'Güzelbahçe', gaziemir: 'Gaziemir', karabaglar: 'Karabağlar', urla: 'Urla', cesme: 'Çeşme',
  seferihisar: 'Seferihisar', torbali: 'Torbalı', menemen: 'Menemen', selcuk: 'Selçuk', bergama: 'Bergama', odemis: 'Ödemiş',
  tire: 'Tire', foca: 'Foça', dikili: 'Dikili', aliaga: 'Aliağa', kemalpasa: 'Kemalpaşa', menderes: 'Menderes', karaburun: 'Karaburun',
}
const districtOf = addr => {
  const a = norm(addr)
  return Object.keys(DISTRICTS).find(d => new RegExp(`\\b${d}\\b`).test(a)) || null
}
const inIzmir = (lat, lng) => lat > 37.8 && lat < 39.4 && lng > 26.2 && lng < 28.6
const venueId = name => 'v-' + norm(name).replace(/ /g, '-').slice(0, 60)

// ─────────────────────────────── İzBB Kültürsanat
async function collectIzbb(fetchImpl, venues) {
  const [ev, se, ve] = await Promise.all(['event', 'session', 'venue'].map(k => get(fetchImpl, `${IZBB}/${k}/list`, 'json')))
  const vById = {}
  for (const v of ve.data || []) {
    let lat = parseFloat(v.lat), lng = parseFloat(v.long)
    if (!inIzmir(lat, lng)) { lat = NaN; lng = NaN }
    const id = venueId(v.name)
    vById[v.id] = id
    venues[id] = {
      id, name: clean(v.name), address: clean(v.address), district: districtOf(v.address || v.name),
      lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null, image: v.imageUrl || null,
    }
  }
  const events = {}
  for (const e of ev.data || []) {
    const comp = e.company?.name || ''
    const catName = norm(e.categories?.[0]?.name || '')
    events[e.id] = {
      id: 'izbb-' + e.id,
      title: titleFix(e.name),
      category: guessCategory(IZBB_CAT[catName] || 'diger', e.name),
      organizer: /sehir tiyatro/.test(norm(comp)) ? 'İzmir Şehir Tiyatroları' : /aassm/.test(norm(comp)) ? 'AASSM' : 'İzmir Büyükşehir',
      source: 'izbb',
      image: e.imageUrl || null,
      desc: stripHtml(e.shortDescription || e.longDescription).slice(0, 600),
      url: `https://kultursanat.izmir.bel.tr/event/${slugIzbb(e.name)}/${e.id}`,
      ageLimit: e.ageLimit || 0,
      sessions: [],
    }
  }
  for (const s of se.data || []) {
    const e = events[s.event?.id]; if (!e) continue
    let vid = vById[s.venue?.id]
    if (!vid && s.venue?.name) { vid = venueId(s.venue.name); venues[vid] ||= { id: vid, name: clean(s.venue.name), lat: null, lng: null } }
    e.sessions.push({
      start: trIso(s.eventDate), end: trIso(s.eventEndDate), venue: vid || null,
      url: `https://kultursanat.izmir.bel.tr/event/session/${slugIzbb(e.title)}/${s.id}`,
    })
    if (!e.image && s.eventImageUrl) e.image = s.eventImageUrl
  }
  return Object.values(events)
}

// ─────────────────────────────── Biletinial
function ldEvents(html) {
  const out = []
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const j = JSON.parse(m[1])
      for (const x of [].concat(j)) if (x && x['@type'] === 'Event') out.push(x)
    } catch { /* bozuk blok */ }
  }
  return out
}
const listUrls = html => [...new Set([...html.matchAll(/"@type":"ListItem","position":\d+,"url":"([^"]+)"/g)].map(m => m[1]))]

async function collectBiletinial(fetchImpl, venues, log) {
  const lists = [['tiyatro', 'tiyatro'], ['muzik', 'konser'], ['etkinlik', 'diger']]
  const targets = []
  for (const [path, cat] of lists) {
    try {
      const html = await get(fetchImpl, `${BI}/${path}/izmir`)
      for (const u of listUrls(html)) targets.push({ url: u, cat })
    } catch (err) { log('biletinial liste hatası', path, err.message) }
  }
  log(`biletinial: ${targets.length} sayfa taranacak`)

  const results = await pool(targets, 4, async ({ url, cat }) => {
    try {
      const html = await get(fetchImpl, url)
      const all = ldEvents(html).filter(x => {
        const a = x.location?.address || {}
        const reg = norm(`${a.addressLocality || ''} ${a.addressRegion || ''}`)
        if (reg) return /izmir/.test(reg)
        const st = norm(a.streetAddress).replace(/canakkale izmir asfalti/g, '')
        return /izmir/.test(st) && !/canakkale merkez|manisa merkez|aydin merkez/.test(st)
      })
      if (!all.length) return null
      const slug = url.split('/').pop()
      const first = all[0]
      const isDT = /-dt$/.test(slug) || all.some(x => /devlet tiyatro/.test(norm(x.location?.name)))
      const ev = {
        id: 'bi-' + slug,
        title: titleFix(first.name),
        category: guessCategory(cat, first.name, slug),
        organizer: isDT ? 'Devlet Tiyatroları' : null,
        source: 'biletinial',
        image: first.image || null,
        desc: stripHtml(first.description).slice(0, 600),
        url,
        priceFrom: null,
        sessions: [],
      }
      const addVenue = (vname, street) => {
        const id = venueId(vname)
        if (!venues[id]) venues[id] = { id, name: vname, address: clean(street), district: districtOf(street || vname), lat: null, lng: null }
        return id
      }
      const ldBySeance = {}
      for (const x of all) { const sid = (x.offers?.url || '').match(/\/(\d+)$/)?.[1]; if (sid) ldBySeance[sid] = x }

      // Saat için sayfadaki görünür seans satırları esas alınır: JSON-LD'deki startDate bazen +3 saat kaymış geliyor.
      const rows = [...html.matchAll(/<div class="row sv2-row"([^>]*)>/g)]
      for (const m of rows) {
        const attr = k => m[1].match(new RegExp(`data-${k}="([^"]*)"`))?.[1] || ''
        if (attr('city-url') !== 'izmir') continue
        const sid = attr('seance-id'), ld = ldBySeance[sid]
        let vid
        if (ld) vid = addVenue(clean(ld.location?.name), ld.location?.address?.streetAddress)
        else {
          const vname = stripHtml(html.slice(m.index, m.index + 4000).match(/class="vl">([\s\S]*?)<\/div>/)?.[1] || '')
          if (!vname) continue
          vid = addVenue(vname, '')
        }
        if (/devlet-tiyatro/.test(html.slice(m.index, m.index + 4000).match(/href="\/tr-tr\/mekan\/([^"]+)"/)?.[1] || '')) ev.organizer = 'Devlet Tiyatroları'
        const price = parseFloat(attr('min-price'))
        if (price > 0 && (ev.priceFrom == null || price < ev.priceFrom)) ev.priceFrom = Math.round(price)
        const status = attr('status')
        ev.sessions.push({ start: trIso(attr('start')), end: null, venue: vid, url: `${url}/${sid}`,
          soldOut: /sold|tuken/.test(status), soon: status === 'soon' })
      }
      // Seans satırı bulunamazsa (farklı sayfa düzeni) JSON-LD'ye dön
      if (!ev.sessions.length) {
        for (const x of all) {
          const vid = addVenue(clean(x.location?.name), x.location?.address?.streetAddress)
          const price = x.offers?.price
          if (price > 0 && (ev.priceFrom == null || price < ev.priceFrom)) ev.priceFrom = Math.round(price)
          ev.sessions.push({ start: trIso(x.startDate), end: trIso(x.endDate), venue: vid, url: x.offers?.url || url,
            soldOut: /SoldOut/.test(x.offers?.availability || '') })
        }
        ev.timeUnsure = true
      }
      return ev.sessions.length ? ev : null
    } catch (err) { log('biletinial hata', url, err.message); return null }
  })
  return results.filter(Boolean)
}

// ─────────────────────────────── koordinat tamamlama
async function photon(fetchImpl, q) {
  const url = `https://photon.komoot.io/api/?limit=1&lat=38.42&lon=27.14&q=${encodeURIComponent(q)}`
  const r = await fetchImpl(url, { headers: { 'User-Agent': 'IzmirKulturHaritasi/0.2 (hobby project)' } })
  if (!r.ok) return null
  const f = (await r.json()).features?.[0]
  if (!f) return null
  const p = f.properties || {}
  return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], admin: [p.name, p.district, p.locality, p.city, p.county, p.state].join(' ') }
}

async function nominatim(fetchImpl, q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=tr&q=${encodeURIComponent(q)}`
  const r = await fetchImpl(url, { headers: { 'User-Agent': 'IzmirKulturHaritasi/0.2 (hobby project)' } })
  if (!r.ok) return null
  const j = await r.json()
  return j[0] ? { lat: +j[0].lat, lng: +j[0].lon, admin: j[0].display_name } : null
}

async function fillCoords(fetchImpl, venues, cache, log) {
  for (const v of Object.values(venues)) {
    const n = norm(v.name)
    const known = KNOWN_VENUES.find(k => k.m.test(n))
    if (known) { Object.assign(v, { lat: known.lat, lng: known.lng, approx: !!known.approx }); continue }
    if (v.lat != null) continue
    const c = cache[v.id]
    if (c && (!c.approx || Date.now() - (c.t || 0) < 7 * 864e5)) { Object.assign(v, { lat: c.lat, lng: c.lng, approx: !!c.approx }); continue }
    let hit = null
    const dname = v.district ? DISTRICT_NAMES[v.district] : ''
    const tries = []
    if (v.address) tries.push([photon, v.address], [nominatim, v.address])
    tries.push([photon, `${v.name} ${dname} İzmir`], [nominatim, `${v.name}, ${dname ? dname + ', ' : ''}İzmir`])
    for (const [fn, q] of tries) {
      try { hit = await fn(fetchImpl, q) } catch { hit = null }
      await sleep(1100) // servislerin kullanım kuralı: saniyede ~1 istek
      // Sonuç gerçekten mekanın ilçesinde mi? (geocoder'lar benzer isimli başka yerleri döndürebiliyor)
      const ok = hit && inIzmir(hit.lat, hit.lng) &&
        (v.district ? norm(hit.admin).includes(v.district) : /izmir/.test(norm(hit.admin)))
      if (ok) break
      hit = null
    }
    if (hit) { cache[v.id] = { lat: hit.lat, lng: hit.lng, approx: !v.district }; Object.assign(v, cache[v.id]); continue }
    const d = DISTRICTS[v.district]
    if (d) { cache[v.id] = { lat: d[0], lng: d[1], approx: true, t: Date.now() }; Object.assign(v, { lat: d[0], lng: d[1], approx: true }) }
    else log('konum bulunamadı:', v.name, '|', v.address)
  }
}

// ─────────────────────────────── ana akış
export async function collectAll({ fetchImpl = fetch, geoCache = {}, log = () => {} } = {}) {
  const venues = {}
  const parts = await Promise.allSettled([collectIzbb(fetchImpl, venues), collectBiletinial(fetchImpl, venues, log)])
  const events = []
  parts.forEach((p, i) => {
    if (p.status === 'fulfilled') { events.push(...p.value); log(['izbb', 'biletinial'][i], p.value.length, 'etkinlik') }
    else log(['izbb', 'biletinial'][i], 'BAŞARISIZ', p.reason?.message)
  })
  await fillCoords(fetchImpl, venues, geoCache, log)

  // geçmiş seansları at, seansı kalmayanı çıkar
  const now = Date.now()
  const live = events.map(e => ({
    ...e,
    sessions: e.sessions
      .filter(s => s.start && new Date(s.end || s.start).getTime() > now)
      .sort((a, b) => a.start.localeCompare(b.start)),
  })).filter(e => e.sessions.length)

  const used = new Set(live.flatMap(e => e.sessions.map(s => s.venue)))
  const usedVenues = Object.fromEntries(Object.entries(venues).filter(([id]) => used.has(id)))
  return { generatedAt: new Date().toISOString(), venues: usedVenues, events: live, geoCache }
}
