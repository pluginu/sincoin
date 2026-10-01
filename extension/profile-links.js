import {parseDirectory} from '../entertainer-links.js';

// Deliberately narrower than the website registry: direct profiles only, no
// arbitrary subdomains, shorteners, link aggregators or redirect/query URLs.
const profiles = [
  ['X', '𝕏', ['x.com', 'twitter.com'], /^\/[\w]{1,15}\/?$/],
  ['Instagram', '◎', ['instagram.com'], /^\/[\w.]+\/?$/],
  ['Facebook', 'f', ['facebook.com'], /^\/[\w.]+\/?$/],
  ['TikTok', '♪', ['tiktok.com'], /^\/@[\w.]+\/?$/],
  ['YouTube', '▶', ['youtube.com'], /^\/(?:@[\w.-]+|channel\/[\w-]+|c\/[\w.-]+)\/?$/],
  ['Threads', '@', ['threads.com', 'threads.net'], /^\/@[\w.]+\/?$/],
  ['Bluesky', 'B', ['bsky.app'], /^\/profile\/[\w.-]+\/?$/],
  ['Reddit', 'r', ['reddit.com'], /^\/(?:user|u)\/[\w-]+\/?$/],
  ['Twitch', 'Tw', ['twitch.tv'], /^\/[\w]+\/?$/],
  ...[['OnlyFans','OF','onlyfans.com'], ['Fansly','FL','fansly.com'], ['Fanvue','FV','fanvue.com'], ['LoyalFans','LF','loyalfans.com'], ['JustForFans','JFF','justfor.fans'], ['Patreon','Pa','patreon.com'], ['Ko-fi','☕','ko-fi.com'], ['Chaturbate','CB','chaturbate.com'], ['Stripchat','SC','stripchat.com'], ['CamSoda','CS','camsoda.com']].map(([name, icon, host]) => [name, icon, [host], /^\/[\w.-]+\/?$/]),
  ['Pornhub', 'PH', ['pornhub.com'], /^\/(?:model|pornstar|users)\/[\w-]+\/?$/],
];
const reserved = new Set(['redirect', 'redirect.php', 'url', 'out', 'away', 'intent', 'share', 'login', 'logout', 'signup', 'register', 'home', 'explore', 'search', 'settings', 'accounts', 'help', 'support', 'about', 'privacy', 'terms', 'watch', 'reel', 'reels', 'p', 'stories']);
export function approvedProfile(value) {
  try {
    if (typeof value !== 'string' || /[\s\\<>%]/.test(value)) return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return null;
    const host = url.hostname.replace(/^www\./, '');
    const platform = profiles.find(([, , hosts, path]) => hosts.includes(host) && path.test(url.pathname));
    if (!platform || url.pathname.split('/').some(part => reserved.has(part.toLowerCase()))) return null;
    return {url: url.href, platform: platform[0], icon: platform[1], host: url.hostname};
  } catch { return null; }
}
export function parseProfiles(text, platforms = []) {
  return parseDirectory(text, platforms).map(record => ({name: record.name,
    links: record.links.map(approvedProfile).filter(Boolean)}));
}
