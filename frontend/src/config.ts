/**
 * Central API configuration.
 * In development: uses Vite proxy (localhost:8000 via vite.config.ts)
 * In production: uses VITE_API_URL / VITE_WS_URL environment variables
 *                set in Netlify / Vercel dashboard.
 */

const isProd = import.meta.env.PROD;

// In dev, Vite proxies /api → localhost:8000, so we use relative URLs.
// In prod, we need the full Render backend URL from env vars.
export const API_BASE = isProd
  ? (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
  : '';

export const WS_BASE = isProd
  ? (import.meta.env.VITE_WS_URL ?? `wss://${window.location.hostname}`).replace(/\/$/, '')
  : `ws://${window.location.hostname}:8000`;
