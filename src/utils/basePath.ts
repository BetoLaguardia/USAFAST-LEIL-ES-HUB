import type { AppPage } from '../components/Header';

const RAW_BASE = (
  (typeof import.meta !== 'undefined' && (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL) ||
  '/hub/'
).trim();

export const APP_BASE_PATH = RAW_BASE.endsWith('/') ? RAW_BASE : `${RAW_BASE}/`;
export const APP_BASE_PREFIX = APP_BASE_PATH === '/' ? '' : APP_BASE_PATH.slice(0, -1);

const PAGE_TO_SLUG: Record<AppPage, string> = {
  home: '',
  leiloes: 'leiloes',
  live: 'live',
  gradeamento: 'gradeamento',
  'quem-somos': 'quem-somos',
  cliente: 'cliente',
  admin: 'admin',
};

const SLUG_TO_PAGE: Record<string, AppPage> = {
  '': 'home',
  home: 'home',
  leiloes: 'leiloes',
  live: 'live',
  gradeamento: 'gradeamento',
  'quem-somos': 'quem-somos',
  cliente: 'cliente',
  admin: 'admin',
};

/**
 * Prefixes root-relative static/asset/image paths with Vite's BASE_URL (/hub/),
 * while leaving external URLs (http/https/data/blob) and already-prefixed paths intact.
 */
export function withBasePath(pathOrUrl: string | undefined | null): string {
  if (!pathOrUrl) return '';
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return '';

  if (/^(https?:)?\/\/|^data:|^blob:/i.test(trimmed)) {
    return trimmed;
  }

  if (
    APP_BASE_PREFIX &&
    (trimmed === APP_BASE_PREFIX || trimmed.startsWith(`${APP_BASE_PREFIX}/`))
  ) {
    return trimmed;
  }

  const normalized = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  return `${APP_BASE_PATH}${normalized}`;
}

/**
 * Builds an API endpoint URL under the configured base path (e.g. /hub/api/auctions).
 */
export function apiUrl(path: string): string {
  return withBasePath(path);
}

/**
 * Builds a WebSocket URL under the configured base path (e.g. wss://domain/hub/ws/live).
 */
export function wsUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${withBasePath(path)}`;
}

/**
 * Normalizes stored lot imageUrl and galleryImages (including legacy /images/... entries)
 * so all lot media resolves correctly under /hub/.
 */
export function normalizeLotMedia<
  T extends { imageUrl?: string; galleryImages?: string[] }
>(lot: T): T {
  const imageUrl = lot.imageUrl ? withBasePath(lot.imageUrl) : lot.imageUrl;
  const galleryImages = Array.isArray(lot.galleryImages)
    ? lot.galleryImages.map((img) => withBasePath(img))
    : lot.galleryImages;

  if (imageUrl === lot.imageUrl && galleryImages === lot.galleryImages) {
    return lot;
  }
  return {
    ...lot,
    imageUrl,
    galleryImages,
  };
}

/**
 * Resolves an internal AppPage from window.location.pathname (supports /hub/... and /...).
 */
export function parsePageFromPathname(pathname: string): AppPage {
  let clean = pathname || '/';
  if (APP_BASE_PREFIX && (clean === APP_BASE_PREFIX || clean.startsWith(`${APP_BASE_PREFIX}/`))) {
    clean = clean.slice(APP_BASE_PREFIX.length) || '/';
  }
  const segment = clean.replace(/^\/+|\/+$/g, '').split('/')[0]?.toLowerCase() || '';
  return SLUG_TO_PAGE[segment] || 'home';
}

/**
 * Determines the router base path at runtime:
 * - Always uses /hub/ when accessed under /hub or from the external domain (usafastleilao.com/hub/).
 * - Allows root / navigation when accessed directly at the root of *.vercel.app.
 */
export function getRouterBasePath(): string {
  if (typeof window === 'undefined' || !APP_BASE_PREFIX) {
    return APP_BASE_PATH;
  }
  const pathname = window.location.pathname || '/';
  if (pathname === APP_BASE_PREFIX || pathname.startsWith(`${APP_BASE_PREFIX}/`)) {
    return APP_BASE_PATH;
  }
  if (window.location.hostname.endsWith('.vercel.app')) {
    return '/';
  }
  return APP_BASE_PATH;
}

/**
 * Returns the browser pathname for a given AppPage under the active router base path.
 */
export function getPageUrl(page: AppPage): string {
  const base = getRouterBasePath();
  const slug = PAGE_TO_SLUG[page];
  return slug ? `${base}${slug}` : base;
}
