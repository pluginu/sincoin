import { parseNames } from './matcher.js';

export const NAMES_URL = 'https://pluginu.github.io/sincoin/entertainers.txt';
export const REFRESH_MS = 15 * 60 * 1000;
export const CACHE_KEY = 'entertainerCache';

// Share one request across all tabs; persisted timestamps survive worker restarts.
export function createNameLoader({storage, fetch: request, bundledURL, now = Date.now}) {
  let pending;
  async function load() {
    let {[CACHE_KEY]: cache} = await storage.get(CACHE_KEY);
    if (cache && now() - cache.checkedAt < REFRESH_MS) return cache.names;
    const checkedAt = now();
    const headers = {};
    if (cache?.etag) headers['If-None-Match'] = cache.etag;
    if (cache?.lastModified) headers['If-Modified-Since'] = cache.lastModified;
    try {
      const response = await request(NAMES_URL, {headers, cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(15000)});
      if (response.status === 304 && cache) {
        cache = {...cache, checkedAt};
      } else {
        if (!response.ok) throw new Error(`Unable to fetch entertainer list (${response.status}).`);
        cache = {names: parseNames(await response.text()), checkedAt,
          etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified')};
      }
    } catch (error) {
      // Keep the last usable list offline; only fresh installs need the bundled copy.
      if (!cache) {
        const response = await request(bundledURL);
        if (!response.ok) throw new Error('Unable to load entertainer list.');
        cache = {names: parseNames(await response.text())};
      }
      cache = {...cache, checkedAt};
    }
    await storage.set({[CACHE_KEY]: cache});
    return cache.names;
  }
  return () => {
    if (!pending) pending = load().finally(() => { pending = null; });
    return pending;
  };
}
