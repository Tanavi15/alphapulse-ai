/**
 * Central API/WebSocket configuration.
 *
 * Dev:  Vite proxy forwards /api → localhost:8000 (see vite.config.ts)
 *       WS connects directly to ws://localhost:8000
 *
 * Prod: VITE_API_URL and VITE_WS_URL must be set in your hosting dashboard
 *       (Netlify → Site config → Environment variables)
 *       (Vercel  → Project settings → Environment variables)
 *       (Railway → Service variables)
 */

const VITE_API_URL = import.meta.env.VITE_API_URL as string | undefined;
const VITE_WS_URL  = import.meta.env.VITE_WS_URL  as string | undefined;
const isProd       = import.meta.env.PROD === true;

// Strip trailing slash
const clean = (s: string) => s.replace(/\/$/, '');

export const API_BASE: string = isProd && VITE_API_URL
  ? clean(VITE_API_URL)
  : '';   // empty string = relative URL, works via Vite proxy in dev

export const WS_BASE: string = isProd && VITE_WS_URL
  ? clean(VITE_WS_URL)
  : `ws://${window.location.hostname}:8000`;
