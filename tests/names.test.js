import test from 'node:test';
import assert from 'node:assert/strict';
import {createNameLoader, CACHE_KEY, REFRESH_MS, NAMES_URL} from '../extension/names.js';

test('shared persistent cache, conditional refresh, changes, and offline recovery', async () => {
  let time = 1000000, calls = [], response = new Response('Angela, White', {headers: {etag: 'v1', 'last-modified': 'Wed, 30 Sep 2026 09:16:45 GMT'}});
  const data = {};
  const options = {storage: {get: async () => structuredClone(data), set: async value => Object.assign(data, value)},
    fetch: async (url, init) => { calls.push({url, init}); if (response instanceof Error) throw response; return response; },
    now: () => time, bundledURL: 'bundled'};
  let load = createNameLoader(options);
  assert.deepEqual(await Promise.all([load(), load()]), [['Angela White'], ['Angela White']]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, NAMES_URL);
  load = createNameLoader(options);
  time += REFRESH_MS - 1;
  await load();
  assert.equal(calls.length, 1);
  time++;
  response = new Response(null, {status: 304});
  assert.deepEqual(await load(), ['Angela White']);
  assert.equal(calls[1].init.headers['If-None-Match'], 'v1');
  assert.ok(calls[1].init.headers['If-Modified-Since']);
  time += REFRESH_MS;
  response = new Response('Riley, Reid', {headers: {etag: 'v2'}});
  assert.deepEqual(await load(), ['Riley Reid']);
  assert.equal(data[CACHE_KEY].etag, 'v2');
  time += REFRESH_MS;
  response = new Error('offline');
  assert.deepEqual(await load(), ['Riley Reid']);
  await load();
  assert.equal(calls.length, 4);
});

test('first offline load uses bundled list and later retries hosted file', async () => {
  let time = 1000000, online = false;
  const data = {}, calls = [];
  const load = createNameLoader({storage: {get: async () => data, set: async value => Object.assign(data, value)},
    now: () => time, bundledURL: 'bundled', fetch: async url => {
      calls.push(url);
      if (url === 'bundled') return new Response('Fallback, Person');
      if (!online) throw new Error('offline');
      return new Response('Remote, Person');
    }});
  assert.deepEqual(await load(), ['Fallback Person']);
  assert.deepEqual(calls, [NAMES_URL, 'bundled']);
  online = true;
  time += REFRESH_MS;
  assert.deepEqual(await load(), ['Remote Person']);
});
