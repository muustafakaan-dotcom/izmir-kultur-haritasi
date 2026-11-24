// Takvimim: kaydedilen seanslar, geri sayım, hatırlatma (tarayıcı bildirimi + takvim dosyası)

const KEY = 'ikh.takvimim.v1'
export const ALERT_OPTIONS = [
  { min: 10080, label: '1 hafta önce' },
  { min: 1440, label: '1 gün önce' },
  { min: 180, label: '3 saat önce' },
  { min: 60, label: '1 saat önce' },
]
export const DEFAULT_ALERTS = [1440, 180]

let items = load()
const listeners = new Set()

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] }
}
function save() {
  localStorage.setItem(KEY, JSON.stringify(items))
  listeners.forEach(fn => fn(items))
}

export const onChange = fn => listeners.add(fn)
export const all = () => items.slice().sort((a, b) => a.start.localeCompare(b.start))
export const keyOf = (eventId, start) => `${eventId}|${start}`
export const get = key => items.find(i => i.key === key)
export const has = key => items.some(i => i.key === key)
export const countUpcoming = () => items.filter(i => new Date(i.end || i.start) > new Date()).length

export function upsert(entry) {
  const i = items.findIndex(x => x.key === entry.key)
  const fired = i >= 0 ? items[i].fired || [] : []
  // zamanı zaten geçmiş uyarıları "çalmış" say: kaydeder kaydetmez bildirim çıkmasın
  const passed = entry.alerts.filter(m => Date.now() >= new Date(entry.start).getTime() - m * 6e4)
  const next = { ...entry, fired: [...new Set([...fired.filter(m => entry.alerts.includes(m)), ...passed])] }
  if (i >= 0) items[i] = next; else items.push(next)
  save()
}
export function remove(key) { items = items.filter(i => i.key !== key); save() }

// ── geri sayım metni
export function countdown(startIso, now = Date.now()) {
  const ms = new Date(startIso).getTime() - now
  if (ms <= 0) return null
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60
  return { d, h, m, s, ms }
}
export function countdownText(startIso) {
  const c = countdown(startIso)
  if (!c) return 'başladı'
  if (c.d >= 2) return `${c.d} gün sonra`
  if (c.d === 1) return `${24 + c.h} saat sonra`
  if (c.h >= 1) return `${c.h} sa ${c.m} dk sonra`
  return `${c.m} dk sonra`
}

// ── tarayıcı bildirimi (sekme açıkken çalışır)
export async function askPermission() {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'default') return Notification.requestPermission()
  return Notification.permission
}

let toastFn = () => {}
export const setToast = fn => { toastFn = fn }

function tick() {
  const now = Date.now()
  let dirty = false
  for (const it of items) {
    for (const min of it.alerts || []) {
      if ((it.fired || []).includes(min)) continue
      const at = new Date(it.start).getTime() - min * 6e4
      if (now < at) continue
      it.fired = [...(it.fired || []), min]; dirty = true
      if (now - at > 6 * 36e5) continue // çok eskiyse sessizce geç
      const body = `${countdownText(it.start)} · ${it.venue || ''}`
      toastFn(`⏰ ${it.title} — ${body}`)
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification(it.title, { body, icon: it.image || undefined, tag: it.key }) } catch { /* mobil Safari vb. */ }
      }
    }
  }
  if (dirty) save()
}
export function startTicker() { tick(); setInterval(tick, 30e3) }

// ── takvim dosyası (.ics) — hatırlatmalar telefonun kendi takviminde çalışır
const icsDate = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')

export function icsFor(list) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Izmir Kultur Haritasi//TR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  for (const it of list) {
    const end = it.end && it.end > it.start ? it.end : new Date(new Date(it.start).getTime() + 2 * 36e5).toISOString()
    lines.push('BEGIN:VEVENT', `UID:${icsEsc(it.key)}@izmir-kultur`, `DTSTAMP:${icsDate(new Date().toISOString())}`,
      `DTSTART:${icsDate(it.start)}`, `DTEND:${icsDate(end)}`, `SUMMARY:${icsEsc(it.title)}`,
      `LOCATION:${icsEsc([it.venue, it.address].filter(Boolean).join(', '))}`,
      `DESCRIPTION:${icsEsc(it.url ? 'Bilet / detay: ' + it.url : '')}`)
    if (it.url) lines.push(`URL:${it.url}`)
    for (const min of it.alerts || []) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(it.title)}`, `TRIGGER:-PT${min}M`, 'END:VALARM')
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadIcs(list, name = 'etkinlik') {
  const blob = new Blob([icsFor(list)], { type: 'text/calendar;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${name.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40) || 'etkinlik'}.ics`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

export function googleCalUrl(it) {
  const end = it.end && it.end > it.start ? it.end : new Date(new Date(it.start).getTime() + 2 * 36e5).toISOString()
  const p = new URLSearchParams({
    action: 'TEMPLATE', text: it.title, dates: `${icsDate(it.start)}/${icsDate(end)}`,
    location: [it.venue, it.address].filter(Boolean).join(', '), details: it.url ? `Bilet / detay: ${it.url}` : '',
  })
  return `https://calendar.google.com/calendar/render?${p}`
}
