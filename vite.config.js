import { defineConfig } from 'vite'

// GitHub Pages alt yolda yayınlar (kullanici.github.io/izmir-kultur-haritasi/); BASE ortam değişkeniyle verilir.
export default defineConfig({
  base: process.env.BASE || '/',
  build: { target: 'es2022' },
})
