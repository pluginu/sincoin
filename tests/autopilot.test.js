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
  assert.equal((await f.run('page', sender)).active, true);
  for (const other of [{...sender, tab: {id: 999}}, {...sender, frameId: 1}, {...sender, url: 'https://example.com/'}]) {
    assert.equal((await f.run('page', other)).active, false);
  }
  await f.run('stop');
  assert.equal((await f.run('page', sender)).active, false);
});
