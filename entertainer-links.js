// Keep the token and URL rules aligned with scripts/entertainer_links.py.
// The extension omits the registry: link-like tokens are still excluded from names.
export function linkKey(link) {
  const url = new URL(link);
  let host = url.hostname.replace(/^www\./, '');
  host = ({'twitter.com': 'x.com', 'fb.com': 'facebook.com', 'threads.net': 'threads.com', 'telegram.me': 't.me'})[host] || host;
  let path = url.pathname.replace(/\/+$/, '');
  if (['x.com', 'instagram.com', 'facebook.com', 'onlyfans.com'].includes(host)) path = path.toLowerCase();
  const pairs = [...url.searchParams].filter(([k]) => !k.toLowerCase().startsWith('utm_') && !['fbclid', 'gclid'].includes(k.toLowerCase()));
  pairs.sort(([a, av], [b, bv]) => a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0);
  const query = new URLSearchParams(pairs).toString();
  const port = url.port && !['80', '443'].includes(url.port) ? `:${url.port}` : '';
  return host + port + path + (query ? `?${query}` : '');
}

export function parseLine(line, platforms = []) {
  const prefix = line.match(/^\s*(straight|gay|transgender|uncategorized)\s*,/i);
  const category = prefix ? prefix[1].toLowerCase() : 'uncategorized';
  if (prefix) line = line.slice(prefix[0].length);
  const name = [], links = [], issues = [];
  const aliases = new Map(platforms.flatMap(p => p.aliases.map(a => [a, p])));
  for (const token of line.match(/[^\s,]+:\s+@?[^\s,]+|[^\s,]+/g) || []) {
    let value = token;
    const labeled = token.match(/^([\w-]+):\s*@?([^\s]+)$/);
    if (labeled && aliases.has(labeled[1].toLowerCase())) {
      const platform = aliases.get(labeled[1].toLowerCase());
      const handle = labeled[2].replace(/^@/, '');
      if (!platform.profile || !/^[\p{L}\p{N}_.-]+$/u.test(handle)) {
        issues.push(`Use a full ${platform.name} profile URL for ${token}.`);
        continue;
      }
      value = `https://${platform.domains[0]}${platform.profile.replace('{handle}', encodeURIComponent(handle))}`;
    } else if (token.startsWith('@')) {
      issues.push(`Add a platform label to ${token}.`);
      continue;
    } else if (!/^https?:\/\//i.test(token)) {
      if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(token)) value = `https://${token}`;
      else if (/[:/]/.test(token)) { issues.push(`Unrecognized link: ${token}`); continue; }
      else { name.push(token); continue; }
    }
    // Only public web links are rendered; credentials and executable schemes are rejected.
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || /[\s<>\\]/.test(value)) throw new Error('Invalid URL');
      if (['twitter.com', 'www.twitter.com', 'www.x.com'].includes(url.hostname)) url.hostname = 'x.com';
      if (!links.some(link => linkKey(link) === linkKey(url.href))) links.push(url.href);
    } catch { issues.push(`Invalid URL: ${token}`); }
  }
  return {name: name.join(' '), category, links, issues};
}

export function platformFor(url, platforms) {
  const host = new URL(url).hostname;
  // Match domain boundaries so lookalike hosts do not receive a platform badge.
  return platforms.find(p => p.domains.some(domain => host === domain || host.endsWith(`.${domain}`)))
    || {name: host, icon: '🌐'};
}

export function parseDirectory(text, platforms = []) {
  const records = new Map();
  for (const line of text.split(/\r?\n/)) {
    const record = parseLine(line, platforms);
    if (!record.name) continue;
    const key = record.name.toLowerCase();
    const existing = records.get(key);
    if (existing) {
      existing.links = [...new Set([...existing.links, ...record.links])];
      existing.issues.push(...record.issues);
    } else records.set(key, record);
  }
  return [...records.values()].sort((a, b) => a.name.localeCompare(b.name));
}
