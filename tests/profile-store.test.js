import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfileStore, profileURL, PROFILE_KEY, PROFILE_FORMAT} from '../extension/profile-store.js';
const record = (changes = {}) => ({platform: 'instagram', url: 'https://instagram.com/Example/?ref=test', name: 'Example', bio: 'Hello', followers: 1234, following: 0, followersText: '1,234', followingText: '0', contact: {emails: ['hello@example.com'], phones: [], links: []}, visitedAt: '2026-10-01T10:00:00.000Z', ...changes});
const backup = profiles => ({format: PROFILE_FORMAT, version: 1, profiles});
function fixture() {
  const data = {};
  const storage = {get: async key => ({[key]: data[key]}), set: async values => Object.assign(data, values)};
  return {store: createProfileStore(storage), storage, data};
}
test('backup round trip restores profiles and skip lookup after fresh install', async () => {
  const first = fixture(), fresh = fixture();
  await first.store.capture(record());
  await fresh.store.import(JSON.parse(JSON.stringify(await first.store.export())));
  assert.deepEqual(await fresh.store.known(['https://www.instagram.com/EXAMPLE/']), ['https://www.instagram.com/EXAMPLE/']);
  assert.deepEqual(await createProfileStore(fresh.storage).read(), await first.store.read());
  assert.equal((await fresh.store.read())[0].contact.emails[0], 'hello@example.com');
});
test('incomplete visits are recorded but retried, and do not replace complete records', async () => {
  const {store} = fixture();
  await store.capture(record({bio: null, followers: null}));
  assert.equal((await store.read()).length, 1);
  assert.deepEqual(await store.known([record().url]), []);
  await store.capture(record());
  await store.capture(record({bio: null, visitedAt: '2026-10-02T10:00:00Z'}));
  assert.equal((await store.read())[0].bio, 'Hello');
});
test('imports validate atomically, merge duplicates, preserve newer records and serialize saves', async () => {
  const {store, data} = fixture();
  await Promise.all([store.capture(record()), store.import(backup([record({url: 'https://instagram.com/second/'}), record({bio: 'Older', visitedAt: '2025-01-01'})]))]);
  assert.equal(data[PROFILE_KEY].length, 2);
  assert.equal(data[PROFILE_KEY][0].bio, 'Hello');
  assert.throws(() => store.import(backup([record({url: 'https://instagram.com/third/'}), record({followers: -1})])), /Invalid/);
  assert.equal(data[PROFILE_KEY].length, 2);
  assert.throws(() => store.import({version: 2, profiles: []}), /Unsupported/);
});
test('canonical URLs exclude login, posts, lookalike hosts and non-HTTPS addresses', () => {
  for (const url of ['https://instagram.com/accounts/', 'https://instagram.com/p/test/', 'https://instagram.com.evil.test/user/', 'http://instagram.com/user/', 'https://user:pass@instagram.com/user/']) assert.equal(profileURL(url), null);
});

test('count parser retains zero, expands abbreviated counts, and rejects unavailable labels', async () => {
  const {readFile} = await import('node:fs/promises');
  const {runInNewContext} = await import('node:vm');
  const context = {};
  runInNewContext(await readFile(new URL('../extension/profile-capture.js', import.meta.url), 'utf8'), context);
  const {count} = context.sinProfileCapture;
  assert.equal(count('0 following'), 0);
  assert.equal(count('1,234'), 1234);
  assert.equal(count('1.2M followers'), 1200000);
  assert.equal(count('1,2M followers'), null);
  assert.equal(count('Followers'), null);
  assert.equal(count(''), null);
});
