import type { NextConfig } from "next";

// Локальный сервер Es (FastAPI). Браузер ходит на /api/*, Next проксирует запросы,
// поэтому CORS не нужен и адрес бэкенда меняется в одном месте.
const API_ORIGIN = process.env.ES_API_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: false,
  experimental: {
    // Распознавание речи на первом запуске может занять больше 30 секунд.
    proxyTimeout: 120_000,
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/:path*` }];
  },
};

export default nextConfig;
