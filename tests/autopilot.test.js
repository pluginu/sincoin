import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutopilot, AUTOPILOT_ALARM} from '../extension/autopilot.js';

function fixture(names = ['Angela White', 'Riley Reid']) {
  const session = {}, local = {}, tabs = new Map(), alarms = new Map();
  let nextId = 1;
  const chrome = {
    storage: {
      session: {get: async key => ({[key]: session[key]}), set: async data => Object.assign(session, data)},
      local: {set: async data => Object.assign(local, data)},
    },
    tabs: {
      create: async data => { const tab = {...data, id: nextId++}; tabs.set(tab.id, tab); return tab; },
      update: async (id, data) => { if (!tabs.has(id)) throw new Error('Tab closed'); Object.assign(tabs.get(id), data); return tabs.get(id); },
    },
    alarms: {create: async (key, data) => alarms.set(key, data), clear: async key => alarms.delete(key)},
  };
  const options = {chrome, readNames: async () => names};
  return {run: createAutopilot(options), options, local, tabs, alarms};
}

test('starts once, enables highlights, reuses its tab and loops the list', async () => {
  const f = fixture();
  const [first] = await Promise.all([f.run('start'), f.run('start')]);
  assert.equal(f.tabs.size, 1);
  assert.deepEqual(f.local, {enabled: true, includeNames: true});
  assert.equal(new URL(f.tabs.get(first.tabId).url).searchParams.get('q'), 'Angela White');
  assert.equal((await f.run('next')).name, 'Riley Reid');
  assert.equal((await f.run('next')).name, 'Angela White');
  assert.equal(f.tabs.size, 1);
  assert.deepEqual(f.alarms.get(AUTOPILOT_ALARM), {delayInMinutes: 0.5});
});

test('worker restart retains progress; stop cancels alarms and late ticks', async () => {
  const f = fixture();
  await f.run('start');
  const resumed = createAutopilot(f.options);
  assert.equal((await resumed('next')).name, 'Riley Reid');
  await resumed('stop');
  assert.equal((await resumed('next')).running, false);
  assert.equal(f.alarms.size, 0);
  assert.equal(f.tabs.size, 1);
});

test('closing only the demo tab stops the loop', async () => {
  const f = fixture();
  const first = await f.run('start');
  assert.equal((await f.run('removed', 999)).running, true);
  assert.equal((await f.run('removed', first.tabId)).running, false);
  assert.equal(f.alarms.size, 0);
});

test('missing tabs and empty lists stop with a useful error', async () => {
  const f = fixture();
  await f.run('start');
  f.tabs.clear();
  assert.match((await f.run('next')).error, /Tab closed/);
  assert.equal(f.alarms.size, 0);
  const empty = fixture([]);
  assert.match((await empty.run('start')).error, /list is empty/);
  assert.equal(empty.tabs.size, 0);
});

test('a stop queued during startup wins over startup and subsequent ticks', async () => {
  const f = fixture();
  await Promise.all([f.run('start'), f.run('stop'), f.run('next')]);
  assert.equal((await f.run('status')).running, false);
  assert.equal(f.alarms.size, 0);
});

test('browses three result pages before changing names, including after worker suspension', async () => {
  const f = fixture();
  const first = await f.run('start');
  f.options.chrome.tabs.sendMessage = async id => {
    const url = new URL(f.tabs.get(id).url);
    url.searchParams.set('start', Number(url.searchParams.get('start') || 0) + 10);
    return {url: url.href};
  };
  assert.equal((await f.run('next')).page, 2);
  const resumed = createAutopilot(f.options);
  assert.equal((await resumed('next')).page, 3);
  const next = await resumed('next');
  assert.equal(next.name, 'Riley Reid');
  assert.equal(next.page, 1);
  assert.equal(next.tabId, first.tabId);
});

test('rejects unrelated or backwards pagination links', async () => {
  for (const target of ['https://evil.test/search?q=Angela+White&start=10',
    'https://www.google.com/search?q=Other&start=10',
    'https://www.google.com/search?q=Angela+White&start=0']) {
    const f = fixture();
    await f.run('start');
    f.options.chrome.tabs.sendMessage = async () => ({url: target});
    assert.equal((await f.run('next')).name, 'Riley Reid');
  }
});

test('scroll authorization requires the active tab, main frame, and current URL', async () => {
  const f = fixture();
  const first = await f.run('start');
  const sender = {tab: {id: first.tabId}, frameId: 0, url: first.url};
  assert.equal((await f.run('page', {sender})).active, true);
  for (const other of [{...sender, tab: {id: 999}}, {...sender, frameId: 1}, {...sender, url: 'https://example.com/'}]) {
    assert.equal((await f.run('page', {sender: other})).active, false);
  }
  await f.run('stop');
  assert.equal((await f.run('page', {sender})).active, false);
});

test('X searches advance names without Google pagination and retain platform after suspension', async () => {
  const f = fixture();
  f.options.chrome.tabs.sendMessage = async () => { throw new Error('Should not request pagination'); };
  const first = await f.run('start', 'x');
  assert.equal(first.platform, 'x');
  assert.equal(new URL(first.url).origin, 'https://x.com');
  assert.equal(new URL(first.url).searchParams.get('q'), 'Angela White');
  const next = await createAutopilot(f.options)('next');
  assert.equal(next.name, 'Riley Reid');
  assert.equal(next.platform, 'x');
  assert.equal(next.tabId, first.tabId);
});

test('Instagram searches every name in the same tab and waits for search before timing', async () => {
  const f = fixture();
  const first = await f.run('start', 'instagram');
  assert.equal(first.url, 'https://www.instagram.com/');
  assert.equal(first.awaitingSearch, true);
  assert.equal(f.alarms.size, 0);
  const sender = {frameId: 0, tab: {id: first.tabId}, url: first.url};
  for (const url of ['https://instagram.com/accounts/login/', 'https://instagram.com.evil.test/', 'http://instagram.com/']) {
    assert.equal((await f.run('page', {sender: {...sender, url}, token: first.token, searchedName: first.name})).active, false);
  }
  assert.equal(f.alarms.size, 0);
  assert.equal((await f.run('page', {sender})).name, first.name);
  await f.run('page', {sender, token: first.token, searchedName: 'wrong name'});
  assert.equal(f.alarms.size, 0);
  await f.run('page', {sender, token: first.token, searchedName: first.name});
  assert.equal((await f.run('status')).awaitingSearch, false);
  assert.equal(f.alarms.size, 1);
  f.options.chrome.tabs.update = async (id, data) => {
    assert.deepEqual(data, {}); // Changing names must not navigate or reload Instagram.
    return f.tabs.get(id);
  };
  const next = await createAutopilot(f.options)('next');
  assert.equal(next.name, 'Riley Reid');
  assert.equal(next.tabId, first.tabId);
  assert.equal(next.awaitingSearch, true);
  assert.equal((await f.run('next')).name, 'Angela White');
  await f.run('stop');
  assert.equal((await f.run('page', {sender, token: first.token, searchedName: first.name})).active, false);
  assert.equal(f.alarms.size, 0);
});

test('unknown platforms fail without opening tabs', async () => {
  const f = fixture();
  assert.match((await f.run('start', 'unknown')).error, /Choose Google, X, or Instagram/);
  assert.equal(f.tabs.size, 0);
});

test('Instagram progress survives worker restart and rejects stale or unauthorized updates', async () => {
  const f = fixture();
  const first = await f.run('start', 'instagram');
  const sender = {frameId: 0, tab: {id: first.tabId}, url: 'https://www.instagram.com/example/'};
  const progress = {phase: 'viewing', profiles: ['/example'], profileIndex: 0, posts: ['/p/test'], postIndex: 0, since: 123};
  await f.run('page', {sender, token: first.token, instagramProgress: progress});
  const resumed = createAutopilot(f.options);
  assert.deepEqual((await resumed('page', {sender})).instagramProgress, progress);
  for (const invalidSender of [{...sender, frameId: 1}, {...sender, tab: {id: 999}}]) {
    await resumed('page', {sender: invalidSender, token: first.token, instagramProgress: {phase: 'done'}});
    assert.equal((await resumed('status')).name, first.name);
  }
  await resumed('page', {sender, token: 'stale', instagramProgress: {phase: 'done'}});
  assert.equal((await resumed('status')).name, first.name);
  await resumed('page', {sender, token: first.token, instagramProgress: {phase: 'done'}});
  const next = await resumed('status');
  assert.equal(next.name, 'Riley Reid');
  assert.notEqual(next.token, first.token);
  assert.equal(next.instagramProgress, undefined);
  await resumed('page', {sender, token: first.token, instagramProgress: progress});
  assert.equal((await resumed('status')).instagramProgress, undefined);
  await resumed('stop');
  assert.equal((await resumed('page', {sender, token: next.token, instagramProgress: progress})).active, false);
});

test('profile capture and skip lookup require active tab, token and expected profile', async () => {
  const f = fixture();
  const captured = [];
  const run = createAutopilot({...f.options, profiles: {capture: async value => captured.push(value), known: async urls => urls}});
  const first = await run('start', 'instagram');
  const sender = {frameId: 0, tab: {id: first.tabId}, url: 'https://www.instagram.com/example/'};
  await run('page', {sender, token: first.token, instagramProgress: {phase: 'profile', profiles: ['/example'], profileIndex: 0}});
  const payload = {sender, token: first.token, profile: {url: sender.url}, profileURLs: [sender.url]};
  for (const invalid of [{...payload, token: 'old'}, {...payload, sender: {...sender, frameId: 1}}, {...payload, profile: {url: 'https://instagram.com/other/'}}]) await run('page', invalid);
  assert.equal(captured.length, 0);
  assert.deepEqual((await run('page', payload)).knownProfiles, [sender.url]);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].name, first.name);
  await run('stop');
  await run('page', payload);
  assert.equal(captured.length, 1);
});

test('storage failures stop autopilot with a visible error instead of silently losing records', async () => {
  const f = fixture();
  const run = createAutopilot({...f.options, profiles: {capture: async () => { throw new Error('Quota exceeded'); }}});
  const state = await run('start', 'instagram');
  const sender = {frameId: 0, tab: {id: state.tabId}, url: 'https://www.instagram.com/example/'};
  await run('page', {sender, token: state.token, instagramProgress: {phase: 'profile', profiles: ['/example'], profileIndex: 0}});
  assert.equal((await run('page', {sender, token: state.token, profile: {url: sender.url}})).active, false);
  assert.equal((await run('status')).running, false);
  assert.match((await run('status')).error, /Quota exceeded/);
});
