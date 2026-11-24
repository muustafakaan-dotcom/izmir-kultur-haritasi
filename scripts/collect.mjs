// Kullanım: npm run collect  → public/data/events.json üretir
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { collectAll } from '../collector/collect.js'

const CACHE = new URL('../collector/geo-cache.json', import.meta.url)
const OUT = new URL('../public/data/events.json', import.meta.url)

const geoCache = JSON.parse(await readFile(CACHE, 'utf8').catch(() => '{}'))
const t0 = Date.now()
const data = await collectAll({ geoCache, log: (...a) => console.log('·', ...a) })
await writeFile(CACHE, JSON.stringify(data.geoCache, null, 1))
if (data.events.length < 10) {
  console.error(`✗ Sadece ${data.events.length} etkinlik geldi — kaynaklarda sorun var, events.json değiştirilmedi.`)
  process.exit(1)
}
delete data.geoCache
await mkdir(new URL('../public/data/', import.meta.url), { recursive: true })
await writeFile(OUT, JSON.stringify(data))
const sessions = data.events.reduce((n, e) => n + e.sessions.length, 0)
console.log(`✓ ${data.events.length} etkinlik, ${sessions} seans, ${Object.keys(data.venues).length} mekan — ${((Date.now() - t0) / 1000).toFixed(1)} sn`)
