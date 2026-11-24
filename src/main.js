import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import './style.css'
import { PLACES, placeById } from './data/places.js'
import * as R from './reminders.js'

maplibregl.setWorkerUrl(workerUrl)

// ─────────────────────────── sabitler
const HOME = { center: [27.1385, 38.4255], zoom: 13.6, pitch: 55, bearing: -24 }
const P = d => `<path d="${d}"/>`
const ICONS = {
  muze: P('M3 9.5L12 4l9 5.5M5 11v7M9.7 11v7M14.3 11v7M19 11v7M3 20.5h18'),
  oren: P('M4 20.5V11a8 8 0 0116 0v9.5M8.5 20.5V12a3.5 3.5 0 017 0v8.5M2 20.5h20'),
  tiyatro: P('M4 4.5h9v5.5a4.5 4.5 0 01-9 0z') + P('M13 8.5h7V14a4.5 4.5 0 01-8.4 2.2') + P('M6.6 8h.8M9.6 8h.8M15.6 12h.8'),
  konser: P('M9 18V5.5l11-2V16') + '<circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  standup: '<rect x="9" y="3" width="6" height="11" rx="3"/>' + P('M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M8.5 21h7'),
  sergi: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/>' + P('M3.5 16l5-5 4 4 3-3 5 5') + '<circle cx="15.5" cy="9" r="1.5"/>',
  cocuk: P('M12 3a5.5 5.5 0 00-5.5 5.5c0 3.5 3 6.5 5.5 7.5 2.5-1 5.5-4 5.5-7.5A5.5 5.5 0 0012 3zM12 16v2.5c0 1.2-1.2 1.6-1.2 2.5'),
  sinema: '<rect x="3.5" y="5" width="17" height="14" rx="2"/>' + P('M3.5 9.5h17M3.5 14.5h17M8 5v14M16 5v14'),
  yildiz: P('M12 3.5l2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.4l-5.1 2.8L8 13.5l-4.3-4 5.8-.7z'),
  bell: P('M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15zM10 20.5a2 2 0 004 0'),
  pin: P('M12 21s-6.5-6-6.5-11a6.5 6.5 0 0113 0c0 5-6.5 11-6.5 11z') + '<circle cx="12" cy="10" r="2.3"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/>' + P('M3.5 10h17M8 3v4M16 3v4'),
}
const icon = (k, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24">${ICONS[k] || ICONS.yildiz}</svg>`

const CAT = {
  tiyatro: 'Tiyatro', konser: 'Konser', standup: 'Stand-up', sergi: 'Sergi', cocuk: 'Çocuk',
  sinema: 'Sinema', festival: 'Festival', atolye: 'Atölye', soylesi: 'Söyleşi', diger: 'Diğer',
}
const CHIPS = [
  ['all', 'Tümü'], ['tiyatro', 'Tiyatro'], ['konser', 'Konser'], ['standup', 'Stand-up'], ['sergi', 'Sergi'],
  ['cocuk', 'Çocuk'], ['diger', 'Diğer'], ['muze', 'Müze'], ['oren', 'Ören yeri'],
]
const DATES = [['all', 'Tümü'], ['bugun', 'Bugün'], ['yarin', 'Yarın'], ['haftasonu', 'Hafta sonu'], ['hafta', '7 gün'], ['ay', '30 gün']]
const TYPE_LABEL = { muze: 'Müze', oren: 'Ören yeri' }
const groupOf = c => (['festival', 'atolye', 'soylesi', 'sinema', 'diger'].includes(c) ? 'diger' : c)

const tf = o => new Intl.DateTimeFormat('tr-TR', o)
const fDay = tf({ day: 'numeric' }), fMon = tf({ month: 'short' }), fTime = tf({ hour: '2-digit', minute: '2-digit' })
const fFull = tf({ weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
const fDate = tf({ day: 'numeric', month: 'long' }), fWd = tf({ weekday: 'short' })
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const isMobile = () => matchMedia('(max-width: 720px)').matches
const normTr = s => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i')
const $ = id => document.getElementById(id)

// ─────────────────────────── harita
const map = new maplibregl.Map({
  container: 'map',
  style: await buildStyle(),
  center: [27.05, 38.43], zoom: 10.3, pitch: 30, bearing: 0,
  maxPitch: 70,
  pixelRatio: Math.min(devicePixelRatio || 1, 2),
  fadeDuration: 150,
  attributionControl: { compact: true },
})
if (import.meta.env.DEV) window.__map = map
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: !isMobile() }), 'bottom-right')

async function buildStyle() {
  const style = await (await fetch('https://tiles.openfreemap.org/styles/positron')).json()
  const paint = {
    background: { 'background-color': '#efeae2' },
    park: { 'fill-color': '#e2e6d8' },
    water: { 'fill-color': '#b7cfd6' },
  }
  style.layers = style.layers
    .filter(l => !/^poi|^building|shield/.test(l.id))
    .map(l => (paint[l.id] ? { ...l, paint: { ...l.paint, ...paint[l.id] } } : l))
    .map(l => {
      const t = l.layout?.['text-field']
      if (!t || !JSON.stringify(t).includes('name')) return l
      return { ...l, layout: { ...l.layout, 'text-field': ['coalesce', ['get', 'name:tr'], ['get', 'name']] } }
    })
  style.sources.dem = {
    type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 12,
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    attribution: 'Yükselti: Mapzen/AWS Terrain Tiles',
  }
  const waterIdx = style.layers.findIndex(l => l.id === 'water')
  style.layers.splice(waterIdx, 0, {
    id: 'hills', type: 'hillshade', source: 'dem',
    paint: { 'hillshade-shadow-color': '#b9ad9c', 'hillshade-highlight-color': '#fbf8f2', 'hillshade-accent-color': '#cfc4b3', 'hillshade-exaggeration': 0.35 },
  })
  const firstLabel = style.layers.findIndex(l => l.type === 'symbol')
  style.layers.splice(firstLabel, 0, {
    id: 'buildings-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
    paint: {
      'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, '#e8e1d6', 40, '#ddd3c4'],
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, ['coalesce', ['get', 'render_height'], 6]],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.9,
    },
  })
  style.terrain = { source: 'dem', exaggeration: 1.2 }
  style.sky = {
    'sky-color': '#cfe0e5', 'horizon-color': '#f4eee4', 'fog-color': '#efeae2',
    'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.35,
  }
  style.light = { anchor: 'viewport', color: '#ffffff', intensity: 0.32, position: [1.4, 200, 35] }
  return style
}

// ─────────────────────────── veri
const state = { tab: 'kesfet', cat: 'all', date: 'all', q: '', sel: null }
let DATA = { events: [], venues: {}, generatedAt: null }
let EV = {}          // id → event
let LOCS = []        // pin konumları (mekan kümeleri + müze/ören yerleri)
let LOC_OF_VENUE = {}

function distM(a, b) {
  const x = (b.lng - a.lng) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180), y = b.lat - a.lat
  return Math.sqrt(x * x + y * y) * 111320
}

function buildLocations() {
  LOCS = PLACES.map(p => ({ id: 'p-' + p.id, lat: p.lat, lng: p.lng, name: p.short || p.name, place: p, venues: [] }))
  for (const v of Object.values(DATA.venues)) {
    if (v.lat == null || v.approx) continue // yaklaşık konumlar haritaya pin olarak konmaz
    let loc = LOCS.find(l => distM(l, v) < 90)
    if (!loc) { loc = { id: 'l-' + v.id, lat: v.lat, lng: v.lng, name: v.name, venues: [] }; LOCS.push(loc) }
    else if (!loc.place && v.name.length < loc.name.length) loc.name = v.name
    loc.venues.push(v.id)
    LOC_OF_VENUE[v.id] = loc.id
  }
}

async function loadData() {
  const r = await fetch(`${import.meta.env.BASE_URL}data/events.json`, { cache: 'no-cache' })
  DATA = await r.json()
  for (const e of DATA.events) {
    e.group = groupOf(e.category)
    e.sessions.forEach(s => { s.v = DATA.venues[s.venue] || null; s.loc = LOC_OF_VENUE[s.venue] || null })
    e.hay = normTr([e.title, CAT[e.category], e.organizer, ...e.sessions.map(s => s.v?.name), ...e.sessions.map(s => s.v?.district)].join(' '))
    EV[e.id] = e
  }
}

// ─────────────────────────── filtreler
function dateRange(key) {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0)
  const day = 864e5, t = d0.getTime(), now = Date.now()
  switch (key) {
    case 'bugun': return [now, t + day]
    case 'yarin': return [t + day, t + 2 * day]
    case 'haftasonu': {
      const wd = d0.getDay() // 0 pazar, 6 cumartesi
      const sat = wd === 0 ? t - day : t + ((6 - wd) * day)
      return [Math.max(now, sat), sat + 2 * day]
    }
    case 'hafta': return [now, t + 8 * day]
    case 'ay': return [now, t + 31 * day]
    default: return [now, Infinity]
  }
}
const sEnd = s => new Date(s.end || s.start).getTime()
const inRange = (s, [a, b]) => new Date(s.start).getTime() < b && sEnd(s) > a

function matchingSessions(e) {
  const r = dateRange(state.date)
  return e.sessions.filter(s => inRange(s, r))
}
function eventVisible(e) {
  if (state.cat === 'muze' || state.cat === 'oren') return false
  if (state.cat !== 'all' && e.group !== state.cat) return false
  if (state.q && !e.hay.includes(normTr(state.q))) return false
  return matchingSessions(e).length > 0
}
function placeVisible(p) {
  if (!['all', p.type].includes(state.cat)) return false
  if (state.cat === 'all' && state.date !== 'all') return false
  return !state.q || normTr(`${p.name} ${p.district} ${TYPE_LABEL[p.type]}`).includes(normTr(state.q))
}
const visibleEvents = () => DATA.events.filter(eventVisible)
  .map(e => ({ e, s: matchingSessions(e) }))
  .sort((a, b) => a.s[0].start.localeCompare(b.s[0].start))

// ─────────────────────────── pinler
const markers = new Map()

function buildMarkers() {
  for (const loc of LOCS) {
    const el = document.createElement('button')
    el.className = 'pin'
    el.setAttribute('aria-label', loc.name)
    el.innerHTML = `<span class="pin__shadow"></span><span class="pin__stem"></span>
      <span class="pin__head"></span><span class="pin__label">${esc(loc.name)}</span>`
    el.addEventListener('click', ev => { ev.stopPropagation(); openLoc(loc.id) })
    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([loc.lng, loc.lat]).addTo(map)
    markers.set(loc.id, { marker, el, loc })
  }
}

function syncMarkers() {
  const counts = {}, cats = {}
  for (const { e } of visibleEvents()) {
    const locs = new Set(matchingSessions(e).map(s => s.loc).filter(Boolean))
    for (const l of locs) { counts[l] = (counts[l] || 0) + 1; cats[l] ||= e.group }
  }
  const active = state.sel?.loc
  for (const [id, m] of markers) {
    const place = m.loc.place
    const showPlace = place && placeVisible(place)
    const n = counts[id] || 0
    const visible = n > 0 || showPlace
    m.el.classList.toggle('is-hidden', !visible)
    m.el.classList.toggle('is-active', active === id)
    if (!visible) continue
    const kind = showPlace || (place && !n) ? place.type : 'etkinlik'
    const ico = kind === 'etkinlik' ? cats[id] : place?.type
    const sig = `${kind}|${ico}|${n}`
    if (m.sig === sig) continue
    m.sig = sig
    m.el.dataset.kind = kind
    m.el.querySelector('.pin__head').innerHTML = icon(ico) + (n ? `<b class="pin__badge">${n}</b>` : '')
  }
}

let zoomBand = ''
map.on('zoom', () => {
  const z = map.getZoom()
  const band = z < 11.5 ? 'far' : z >= 15.2 ? 'near' : 'mid'
  if (band === zoomBand) return
  zoomBand = band
  document.body.classList.toggle('z-far', band === 'far')
  document.body.classList.toggle('z-near', band === 'near')
})

// ─────────────────────────── panel: üst kısım
const listEl = $('list'), countEl = $('count'), cardEl = $('cardView'), listView = $('listView'), panel = $('panel')

$('cats').innerHTML = CHIPS.map(([k, l]) => `<button class="chip${k === 'all' ? ' is-on' : ''}" data-cat="${k}">${k === 'muze' || k === 'oren' ? `<i class="dot dot--${k}"></i>` : ''}${l}</button>`).join('')
$('dates').innerHTML = DATES.map(([k, l]) => `<button class="seg${k === 'all' ? ' is-on' : ''}" data-date="${k}">${l}</button>`).join('')

$('cats').addEventListener('click', ev => {
  const c = ev.target.closest('[data-cat]'); if (!c) return
  state.cat = c.dataset.cat
  $('cats').querySelectorAll('.chip').forEach(x => x.classList.toggle('is-on', x === c))
  refresh()
})
$('dates').addEventListener('click', ev => {
  const c = ev.target.closest('[data-date]'); if (!c) return
  state.date = c.dataset.date
  $('dates').querySelectorAll('.seg').forEach(x => x.classList.toggle('is-on', x === c))
  refresh()
})
let qTimer
$('q').addEventListener('input', ev => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = ev.target.value.trim(); refresh() }, 120) })

$('tabs').addEventListener('click', ev => {
  const t = ev.target.closest('[data-tab]'); if (!t) return
  state.tab = t.dataset.tab
  $('tabs').querySelectorAll('.tab').forEach(x => x.classList.toggle('is-on', x === t))
  closeCard(); refresh()
  panel.classList.add('is-open')
})

function refresh() {
  document.body.dataset.tab = state.tab
  if (state.tab === 'takvim') renderTakvim(); else renderList()
  syncMarkers()
  updateTabBadge()
}
function updateTabBadge() {
  const n = R.countUpcoming()
  $('takvimCount').textContent = n || ''
  $('takvimCount').hidden = !n
}

// ─────────────────────────── liste
function dateTile(s) {
  const st = new Date(s.start)
  if (st < new Date()) return `<span class="row__date is-live"><i class="live"></i><small>açık</small></span>`
  return `<span class="row__date"><small>${fWd.format(st)}</small><b>${fDay.format(st)}</b><small>${fMon.format(st)}</small></span>`
}

function eventRow(e, sessions) {
  const s = sessions[0]
  const saved = sessions.some(x => R.has(R.keyOf(e.id, x.start)))
  const more = sessions.length > 1 ? ` · +${sessions.length - 1} seans` : ''
  const time = new Date(s.start) > new Date() ? fTime.format(new Date(s.start)) + ' · ' : ''
  return `<li><button class="row" data-ev="${e.id}">
    ${dateTile(s)}
    <span class="row__txt"><strong>${esc(e.title)}</strong>
      <em>${time}${esc(s.v?.name || 'Mekan belirsiz')}${more}</em>
      <span class="row__tags"><span class="ctag ctag--${e.group}">${icon(e.category)}${CAT[e.category]}</span>${e.organizer && e.organizer !== 'İzmir Büyükşehir' ? `<span class="otag">${esc(e.organizer)}</span>` : ''}</span>
    </span>
    ${saved ? `<span class="row__bell" title="Hatırlatma kurulu">${icon('bell')}</span>` : ''}
  </button></li>`
}

function placeRow(p) {
  return `<li><button class="row" data-loc="p-${p.id}">
    <span class="row__ico row__ico--${p.type}">${icon(p.type)}</span>
    <span class="row__txt"><strong>${esc(p.name)}</strong><em>${TYPE_LABEL[p.type]} · ${esc(p.district)}</em></span>
  </button></li>`
}

let listCache = []
function renderList() {
  const evs = visibleEvents()
  const places = PLACES.filter(placeVisible)
  // önce tarihi belli olanlar, sonra şu an açık olan (sergi vb.) uzun süreli etkinlikler
  const now = new Date().toISOString()
  const soon = evs.filter(x => x.s[0].start > now), open = evs.filter(x => x.s[0].start <= now)
  listCache = [
    ...soon.map(x => eventRow(x.e, x.s)),
    ...(open.length ? [`<li class="sep">Şu an açık · ${open.length}</li>`, ...open.map(x => eventRow(x.e, x.s))] : []),
    ...(places.length && evs.length ? [`<li class="sep">Müzeler ve ören yerleri</li>`] : []),
    ...places.map(placeRow),
  ]
  countEl.textContent = [evs.length && `${evs.length} etkinlik`, places.length && `${places.length} yer`].filter(Boolean).join(' · ') || 'Sonuç yok'
  listEl.innerHTML = listCache.slice(0, 60).join('') || '<li class="empty">Bu filtrelere uyan bir şey yok.<br>Tarihi ya da kategoriyi genişletmeyi dene.</li>'
  listEl.scrollTop = 0
  rendered = 60
}
// uzun listeyi parça parça çiz (akıcılık için)
let rendered = 0
listEl.addEventListener('scroll', () => {
  if (rendered >= listCache.length) return
  if (listEl.scrollTop + listEl.clientHeight > listEl.scrollHeight - 400) {
    listEl.insertAdjacentHTML('beforeend', listCache.slice(rendered, rendered + 60).join(''))
    rendered += 60
  }
}, { passive: true })

listEl.addEventListener('click', ev => {
  const b = ev.target.closest('.row'); if (!b) return
  if (b.dataset.ev) openEvent(b.dataset.ev)
  else if (b.dataset.loc) openLoc(b.dataset.loc)
  else if (b.dataset.key) openSaved(b.dataset.key)
})

// ─────────────────────────── Takvimim
function renderTakvim() {
  const items = R.all()
  const up = items.filter(i => new Date(i.end || i.start) > new Date())
  const past = items.filter(i => new Date(i.end || i.start) <= new Date())
  countEl.innerHTML = up.length
    ? `${up.length} yaklaşan · <button class="linkbtn" id="icsAll">Hepsini takvime ekle</button>`
    : ''
  listEl.innerHTML = up.length
    ? up.map(savedRow).join('') + (past.length ? `<li class="sep">Geçmiş</li>${past.map(savedRow).join('')}` : '')
    : `<li class="empty">${icon('bell', 'empty__ico')}<b>Henüz hatırlatma yok</b><br>Bir etkinliğin seansındaki zil simgesine dokun; geri sayım burada görünür.</li>`
  $('icsAll')?.addEventListener('click', () => R.downloadIcs(up, 'izmir-takvimim'))
  tickCountdowns()
}
function savedRow(it) {
  const st = new Date(it.start)
  return `<li><button class="row" data-key="${esc(it.key)}">
    <span class="row__date"><small>${fWd.format(st)}</small><b>${fDay.format(st)}</b><small>${fMon.format(st)}</small></span>
    <span class="row__txt"><strong>${esc(it.title)}</strong><em>${fTime.format(st)} · ${esc(it.venue || '')}</em>
      <span class="cd-chip" data-cd="${it.start}"></span></span>
  </button></li>`
}
function openSaved(key) {
  const it = R.get(key); if (!it) return
  if (EV[it.eventId]) openEvent(it.eventId)
  else openReminder(it.eventId, it.start, it)
}

// ─────────────────────────── kartlar
const dirUrl = (lat, lng, q) => lat != null
  ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`

function showCard(html) {
  cardEl.innerHTML = html
  listView.hidden = true; cardEl.hidden = false; cardEl.scrollTop = 0
  panel.classList.add('is-open')
  tickCountdowns()
}
function closeCard() {
  state.sel = null
  cardEl.hidden = true; listView.hidden = false
  if (location.hash) history.replaceState(null, '', location.pathname)
  syncMarkers()
}

function openEvent(id) {
  const e = EV[id]; if (!e) return
  const now = Date.now()
  const upcoming = e.sessions.filter(s => sEnd(s) > now)
  const next = upcoming[0]
  const locId = next?.loc
  state.sel = { ev: id, loc: locId }
  history.replaceState(null, '', '#e=' + encodeURIComponent(id))
  const ongoing = next && new Date(next.start) < new Date()
  const multiVenue = new Set(upcoming.map(s => s.venue)).size > 1

  showCard(`
    <button class="back" data-back>← Geri</button>
    <div class="card__hero ${e.image ? '' : 'card__hero--' + e.group}">
      ${e.image ? `<img src="${esc(e.image)}" alt="" />` : icon(e.category, 'card__glyph')}
    </div>
    <div class="card__body">
      <p class="eyebrow">${icon(e.category)}${CAT[e.category]}${e.organizer ? ` · ${esc(e.organizer)}` : ''}</p>
      <h2>${esc(e.title)}</h2>
      ${next ? (ongoing
        ? `<div class="cd cd--live"><i class="live"></i> Şu an açık · ${esc(fDate.format(new Date(next.end || next.start)))} tarihine kadar</div>`
        : `<div class="cd" data-cd-big="${next.start}"></div>`) : ''}
      ${!multiVenue && next?.v ? venueBlock(next.v) : ''}
      <h3>${upcoming.length > 1 ? `Seanslar (${upcoming.length})` : 'Seans'}</h3>
      <ul class="sessions">${upcoming.slice(0, 12).map(s => sessionRow(e, s, multiVenue)).join('')}</ul>
      ${upcoming.length > 12 ? `<p class="muted">+${upcoming.length - 12} seans daha — tümü bilet sayfasında.</p>` : ''}
      ${e.desc ? `<p class="desc">${esc(e.desc)}</p>` : ''}
      <div class="actions">
        <a class="btn btn--main" href="${esc(e.url)}" target="_blank" rel="noopener">Bilet / detay</a>
        ${next?.v ? `<a class="btn" href="${dirUrl(next.v.approx ? null : next.v.lat, next.v.lng, `${next.v.name} ${next.v.address || ''}`)}" target="_blank" rel="noopener">Yol tarifi</a>` : ''}
      </div>
      <p class="source">${e.priceFrom ? `${e.priceFrom} ₺’den başlayan fiyatlarla · ` : ''}Kaynak: ${e.source === 'izbb' ? 'İzBB Kültürsanat' : 'Biletinial'}</p>
    </div>`)
  syncMarkers()
  const loc = LOCS.find(l => l.id === locId)
  if (loc) fly(loc)
}

function venueBlock(v) {
  return `<button class="venue" ${LOC_OF_VENUE[v.id] ? `data-loc="${LOC_OF_VENUE[v.id]}"` : ''}>
    ${icon('pin')}<span>${esc(v.name)}<small>${esc(v.address || '')}${v.approx ? ' · haritada konumu yaklaşık' : ''}</small></span></button>`
}

function sessionRow(e, s, showVenue) {
  const st = new Date(s.start)
  const key = R.keyOf(e.id, s.start)
  const on = R.has(key)
  const live = st < new Date()
  return `<li class="session">
    <span class="session__when"><b>${live ? 'Şu an açık' : fFull.format(st)}</b>${showVenue && s.v ? `<small>${esc(s.v.name)}</small>` : ''}${s.soldOut ? '<small class="sold">Tükendi</small>' : ''}${s.soon ? '<small>Satış yakında açılacak</small>' : ''}</span>
    ${s.url ? `<a class="mini-btn" href="${esc(s.url)}" target="_blank" rel="noopener">Bilet</a>` : ''}
    ${live ? '' : `<button class="bell${on ? ' is-on' : ''}" data-remind="${esc(e.id)}" data-start="${s.start}" title="Hatırlat">${icon('bell')}</button>`}
  </li>`
}

function openLoc(locId) {
  const loc = LOCS.find(l => l.id === locId); if (!loc) return
  state.sel = { loc: locId }
  const p = loc.place
  const now = Date.now()
  const evs = DATA.events.map(e => ({ e, s: e.sessions.filter(s => s.loc === locId && sEnd(s) > now) }))
    .filter(x => x.s.length).sort((a, b) => a.s[0].start.localeCompare(b.s[0].start))
  const v = loc.venues.map(id => DATA.venues[id]).find(Boolean)
  showCard(`
    <button class="back" data-back>← Geri</button>
    <div class="card__hero card__hero--${p ? p.type : 'mekan'}">${v?.image ? `<img src="${esc(v.image)}" alt="" />` : icon(p ? p.type : 'pin', 'card__glyph')}</div>
    <div class="card__body">
      <p class="eyebrow">${p ? `${TYPE_LABEL[p.type]} · ${esc(p.district)}` : 'Sahne · Mekan'}</p>
      <h2>${esc(p ? p.name : loc.name)}</h2>
      ${p?.desc ? `<p class="desc">${esc(p.desc)}</p>` : ''}
      ${!p && v?.address ? `<p class="muted">${esc(v.address)}</p>` : ''}
      ${evs.length ? `<h3>Burada yakında (${evs.length})</h3><ul class="list list--inner">${evs.map(x => eventRow(x.e, x.s)).join('')}</ul>` : (p ? '' : '<p class="muted">Yaklaşan etkinlik yok.</p>')}
      <div class="actions"><a class="btn btn--main" href="${dirUrl(loc.lat, loc.lng)}" target="_blank" rel="noopener">Yol tarifi</a></div>
    </div>`)
  syncMarkers()
  fly(loc)
}

cardEl.addEventListener('click', ev => {
  if (ev.target.closest('[data-back]')) return closeCard()
  const bell = ev.target.closest('[data-remind]')
  if (bell) return openReminder(bell.dataset.remind, bell.dataset.start)
  const r = ev.target.closest('[data-ev]'); if (r) return openEvent(r.dataset.ev)
  const l = ev.target.closest('[data-loc]'); if (l) return openLoc(l.dataset.loc)
})

// ─────────────────────────── hatırlatma penceresi
const sheet = $('sheet')
function openReminder(eventId, start, snapshot) {
  const e = EV[eventId]
  const s = e?.sessions.find(x => x.start === start)
  const key = R.keyOf(eventId, start)
  const existing = R.get(key)
  const entry = snapshot || existing || {
    key, eventId, title: e.title, start, end: s?.end || null,
    venue: s?.v?.name || '', address: s?.v?.address || '', url: s?.url || e.url, image: e.image, alerts: R.DEFAULT_ALERTS,
  }
  const untilMin = (new Date(start) - Date.now()) / 6e4
  let alerts = [...(existing?.alerts || entry.alerts || R.DEFAULT_ALERTS)]
  if (!existing) {
    alerts = alerts.filter(m => m < untilMin)
    if (!alerts.length) alerts = [R.ALERT_OPTIONS.map(o => o.min).find(m => m < untilMin)].filter(Boolean)
  }
  sheet.innerHTML = `
    <div class="sheet__box" role="dialog" aria-label="Hatırlatma">
      <p class="eyebrow">${icon('bell')}Hatırlatma</p>
      <h2>${esc(entry.title)}</h2>
      <p class="muted">${esc(fFull.format(new Date(start)))}${entry.venue ? ' · ' + esc(entry.venue) : ''}</p>
      <div class="cd" data-cd-big="${start}"></div>
      <p class="label">Ne zaman hatırlatalım?</p>
      <div class="opts">${R.ALERT_OPTIONS.map(o => `<button class="opt${alerts.includes(o.min) ? ' is-on' : ''}" data-min="${o.min}" ${o.min > untilMin ? 'disabled' : ''}>${o.label}</button>`).join('')}</div>
      <button class="btn btn--main btn--wide" data-act="save">${existing ? 'Güncelle' : 'Hatırlatmayı kur'}</button>
      <div class="sheet__row">
        <button class="btn" data-act="ics">${icon('cal')} Takvime ekle</button>
        <a class="btn" data-act="gcal" target="_blank" rel="noopener">Google Takvim</a>
      </div>
      <p class="hint">Bildirimler bu site açıkken gelir. Telefonda kesin hatırlatma için <b>Takvime ekle</b>: seçtiğin uyarılar takviminde kurulur.</p>
      ${existing ? '<button class="linkbtn danger" data-act="del">Hatırlatmayı kaldır</button>' : ''}
      <button class="sheet__x" data-act="close" aria-label="Kapat">×</button>
    </div>`
  const gcal = sheet.querySelector('[data-act="gcal"]')
  const cur = () => ({ ...entry, alerts: alerts.slice().sort((a, b) => b - a) })
  gcal.href = R.googleCalUrl(cur())
  sheet.hidden = false
  requestAnimationFrame(() => sheet.classList.add('is-open'))
  tickCountdowns()

  sheet.onclick = async ev => {
    if (ev.target === sheet) return closeSheet()
    const o = ev.target.closest('[data-min]')
    if (o) {
      const m = +o.dataset.min
      alerts = alerts.includes(m) ? alerts.filter(x => x !== m) : [...alerts, m]
      o.classList.toggle('is-on')
      return
    }
    const act = ev.target.closest('[data-act]')?.dataset.act
    if (act === 'close') closeSheet()
    if (act === 'save') {
      R.upsert(cur())
      const perm = await R.askPermission()
      toast(perm === 'granted' ? 'Hatırlatma kuruldu · Takvimim’e eklendi' : 'Takvimim’e eklendi · bildirim izni verilmedi, takvime eklemeyi unutma')
      closeSheet(); afterReminderChange()
    }
    if (act === 'ics') { R.upsert(cur()); R.downloadIcs([cur()], entry.title); afterReminderChange() }
    if (act === 'del') { R.remove(key); toast('Hatırlatma kaldırıldı'); closeSheet(); afterReminderChange() }
  }
}
function closeSheet() {
  sheet.classList.remove('is-open')
  setTimeout(() => { sheet.hidden = true; sheet.innerHTML = '' }, 220)
}
function afterReminderChange() {
  if (state.sel?.ev && !cardEl.hidden) {
    // sadece zil durumlarını güncelle, kartı yeniden çizme (kaydırma konumu korunur)
    cardEl.querySelectorAll('[data-remind]').forEach(b => b.classList.toggle('is-on', R.has(R.keyOf(b.dataset.remind, b.dataset.start))))
  }
  refresh()
}

// ─────────────────────────── geri sayımlar (saniyede bir, yalnız ekrandakiler)
function tickCountdowns() {
  document.querySelectorAll('[data-cd-big]').forEach(el => {
    const c = R.countdown(el.dataset.cdBig)
    el.innerHTML = c
      ? `<span><b>${c.d}</b>gün</span><span><b>${String(c.h).padStart(2, '0')}</b>saat</span><span><b>${String(c.m).padStart(2, '0')}</b>dk</span><span><b>${String(c.s).padStart(2, '0')}</b>sn</span>`
      : '<span class="cd__done">Başladı</span>'
  })
  document.querySelectorAll('[data-cd]').forEach(el => { el.textContent = R.countdownText(el.dataset.cd) })
}
setInterval(tickCountdowns, 1000)

// ─────────────────────────── toast
const toastEl = $('toast')
let toastT
function toast(msg) {
  toastEl.textContent = msg
  toastEl.classList.add('is-on')
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('is-on'), 3200)
}
R.setToast(toast)

// ─────────────────────────── kamera
let is3D = true
function fly(loc) {
  const far = Math.abs(loc.lat - 38.42) > 0.12 || Math.abs(loc.lng - 27.14) > 0.15
  const travel = distM({ lat: loc.lat, lng: loc.lng }, (({ lat, lng }) => ({ lat, lng }))(map.getCenter()))
  map.flyTo({
    center: [loc.lng, loc.lat],
    zoom: far ? 15 : 15.8,
    pitch: is3D ? 58 : 0,
    bearing: is3D ? map.getBearing() + (travel > 3000 ? 20 : 8) : 0,
    offset: isMobile() ? [0, -innerHeight * 0.25] : [195, 30],
    duration: Math.min(2600, 900 + travel / 12), curve: 1.4, essential: true,
  })
}
$('tilt').addEventListener('click', () => {
  is3D = !is3D
  $('tilt').textContent = is3D ? '3B' : '2B'
  map.easeTo({ pitch: is3D ? 55 : 0, bearing: is3D ? -24 : 0, duration: 800 })
  map.setTerrain(is3D ? { source: 'dem', exaggeration: 1.2 } : null)
})
$('home').addEventListener('click', () => {
  closeCard()
  map.flyTo({ ...HOME, pitch: is3D ? 55 : 0, bearing: is3D ? -24 : 0, offset: isMobile() ? [0, -80] : [190, 0], duration: 1800 })
})
$('handle').addEventListener('click', () => panel.classList.toggle('is-open'))
map.on('click', () => { if (isMobile()) panel.classList.remove('is-open') })
addEventListener('keydown', ev => { if (ev.key === 'Escape') sheet.hidden ? closeCard() : closeSheet() })

// ─────────────────────────── başlat
R.onChange(updateTabBadge)
;(async () => {
  try { await loadData() } catch (err) { console.error(err); toast('Etkinlik verisi yüklenemedi') }
  buildLocations()
  for (const e of DATA.events) e.sessions.forEach(s => { s.loc = LOC_OF_VENUE[s.venue] || null })
  buildMarkers(); refresh()
  if (DATA.generatedAt) $('updated').textContent = `Güncellendi: ${tf({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(DATA.generatedAt))}`
  R.startTicker()
  const m = location.hash.match(/^#e=(.+)$/)
  if (m && EV[decodeURIComponent(m[1])]) openEvent(decodeURIComponent(m[1]))
  else map.flyTo({ ...HOME, offset: isMobile() ? [0, -80] : [190, 0], duration: 3600, curve: 1.2, essential: true })
})()
