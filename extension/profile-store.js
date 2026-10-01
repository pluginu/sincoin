export const PROFILE_KEY = 'autopilotProfiles';
export const PROFILE_FORMAT = 'sin-autopilot-profiles';
export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
const reserved = /^(accounts|about|developer|legal|privacy|terms|explore|direct|reels|reel|p|stories|search|challenge|notifications|web)$/i;
export function profileURL(value) {
  try {
    const url = new URL(value);
    const username = url.pathname.replace(/^\//, '').replace(/\/$/, '');
    if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.port || url.username || url.password || !/^[a-z0-9._]+$/i.test(username) || reserved.test(username)) return null;
    return `https://www.instagram.com/${username.toLowerCase()}/`;
  } catch { return null; }
}
const string = (value, max) => typeof value === 'string' && value.length <= max;
export function normalizeProfile(value) {
  const url = profileURL(value?.url);
  if (!url || value.platform !== 'instagram' || !string(value.name, 500) ||
      !(value.bio === null || string(value.bio, 10000)) ||
      !['followers', 'following'].every(key => value[key] === null || (Number.isSafeInteger(value[key]) && value[key] >= 0)) ||
      !['followersText', 'followingText'].every(key => string(value[key], 100)) ||
      !string(value.visitedAt, 40) || !Number.isFinite(Date.parse(value.visitedAt)) ||
      !value.contact || !['emails', 'phones', 'links'].every(key => Array.isArray(value.contact[key]) && value.contact[key].length <= 100 && value.contact[key].every(item => string(item, 2000)))) {
    throw new Error('Invalid profile record. Import a SIN profile backup.');
  }
  return {platform: 'instagram', url, username: new URL(url).pathname.split('/')[1], name: value.name,
    bio: value.bio, followers: value.followers, following: value.following,
    followersText: value.followersText, followingText: value.followingText,
    contact: Object.fromEntries(['emails', 'phones', 'links'].map(key => [key, [...new Set(value.contact[key])]])),
    visitedAt: new Date(value.visitedAt).toISOString()};
}
export const hasProfileInfo = profile => profile.bio !== null && profile.followers !== null && profile.following !== null;
export function parseBackup(data) {
  if (data?.format !== PROFILE_FORMAT || data.version !== 1 || !Array.isArray(data.profiles) || data.profiles.length > 20000) {
    throw new Error('Unsupported file. Choose a SIN profile backup (version 1).');
  }
  return data.profiles.map(normalizeProfile);
}
export function createProfileStore(storage) {
  let pending = Promise.resolve();
  const read = async () => (await storage.get(PROFILE_KEY))[PROFILE_KEY] || [];
  function merge(records) {
    const operation = pending.then(async () => {
      const saved = new Map((await read()).map(profile => [profile.url, profile]));
      for (const record of records) {
        const old = saved.get(record.url);
        // Never replace a useful complete record with a failed/partial visit.
        if (!old || (hasProfileInfo(record) && !hasProfileInfo(old)) ||
          (hasProfileInfo(record) === hasProfileInfo(old) && record.visitedAt >= old.visitedAt)) saved.set(record.url, record);
      }
      const profiles = [...saved.values()];
      const backup = {format: PROFILE_FORMAT, version: 1, exportedAt: new Date().toISOString(), profiles};
      if (profiles.length > 20000 || new TextEncoder().encode(JSON.stringify(backup, null, 2)).length > MAX_IMPORT_BYTES) {
        throw new Error('Profile storage is full (8 MB backup limit).');
      }
      await storage.set({[PROFILE_KEY]: profiles});
      return {count: saved.size};
    });
    pending = operation.catch(() => {});
    return operation;
  }
  return {
    read,
    known: async urls => {
      const saved = new Set((await read()).filter(hasProfileInfo).map(profile => profile.url));
      return urls.filter(url => saved.has(profileURL(url)));
    },
    capture: record => merge([normalizeProfile(record)]),
    import: data => merge(parseBackup(data)),
    export: async () => ({format: PROFILE_FORMAT, version: 1, exportedAt: new Date().toISOString(), profiles: await read()})
  };
}
