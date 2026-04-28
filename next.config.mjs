/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
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
