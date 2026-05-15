import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Sprint S-CLEAN (13.05.2026) — Next.js 16 Turbopack root inference fix.
// Без explicit turbopack.root Turbopack guessed workspace root = app/
// (subdirectory) і failed: "We couldn't find the Next.js package
// (next/package.json) from the project directory: C:\…\sztab\app".
// Pin root to repo directory де next/package.json present.
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: __dirname,
  },
  async redirects() {
    // Polskie aliasy dla sidebar items — UI labele są po polsku
    // ("Zadania", "Cele", "Nawyki") ale routes po angielsku, więc
    // bezpośredni link /zadania zwracał 404. 308 (permanent) bo
    // mapping nigdy się nie zmieni — bookmarki działają.
    return [
      { source: '/zadania', destination: '/tasks', permanent: true },
      { source: '/cele', destination: '/goals', permanent: true },
      { source: '/nawyki', destination: '/habits', permanent: true },
    ]
  },
}

export default nextConfig
