import {parseProfiles} from './profile-links.js';

export const NAMES_URL = 'https://pluginu.github.io/sincoin/entertainers.txt';
export const REFRESH_MS = 15 * 60 * 1000;
export const CACHE_KEY = 'entertainerCache';

// Share one request across all tabs; persisted timestamps survive worker restarts.
export function createNameLoader({storage, fetch: request, bundledURL, now = Date.now, platforms = []}) {
  let pending;
  async function load() {
    let {[CACHE_KEY]: cache} = await storage.get(CACHE_KEY);
    if ((cache?.profiles || cache?.profileRetry) && now() - cache.checkedAt < REFRESH_MS) return cache.names;
    const checkedAt = now();
    const headers = {};
    if (cache?.profiles && cache?.etag) headers['If-None-Match'] = cache.etag;
    if (cache?.profiles && cache?.lastModified) headers['If-Modified-Since'] = cache.lastModified;
    try {
      const response = await request(NAMES_URL, {headers, cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(15000)});
      if (response.status === 304 && cache) {
        cache = {...cache, checkedAt};
      } else {
        if (!response.ok) throw new Error(`Unable to fetch entertainer list (${response.status}).`);
        const profiles = parseProfiles(await response.text(), await platforms);
        cache = {profiles, names: profiles.map(p => p.name), checkedAt,
          etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified')};
      }
    } catch (error) {
      // Keep the last usable list offline; only fresh installs need the bundled copy.
      if (!cache) {
        const response = await request(bundledURL);
        if (!response.ok) throw new Error('Unable to load entertainer list.');
        const profiles = parseProfiles(await response.text(), await platforms);
        cache = {profiles, names: profiles.map(p => p.name)};
      }
      cache = {...cache, checkedAt, profileRetry: !cache.profiles};
    }
    await storage.set({[CACHE_KEY]: cache});
    return cache.names;
  }
  return () => {
    if (!pending) pending = load().finally(() => { pending = null; });
    return pending;
  };
}
