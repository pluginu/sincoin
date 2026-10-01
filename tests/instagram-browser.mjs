import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const temp = await mkdtemp(path.join(tmpdir(), 'sin-instagram-'));
const extension = path.join(temp, 'extension');
await cp('extension', path.join(extension, 'extension'), {recursive: true});
for (const file of ['entertainer-links.js', 'social-platforms.json', 'manifest.json', 'entertainers.txt']) {
  await cp(file, path.join(extension, file));
}
// Shorten only the copied extension's waits, keeping all clicks and navigation real.
const contentPath = path.join(extension, 'extension/autopilot-content.js');
await writeFile(contentPath, (await readFile(contentPath, 'utf8'))
  .replace('INSTAGRAM_POST_DWELL = 6000', 'INSTAGRAM_POST_DWELL = 300')
  .replace('INSTAGRAM_LOAD_WAIT = 12000', 'INSTAGRAM_LOAD_WAIT = 1500')
  .replace('INSTAGRAM_RESULTS_WAIT = 3000', 'INSTAGRAM_RESULTS_WAIT = 200')
  .replaceAll('setTimeout(step, 2000)', 'setTimeout(step, 100)'));
const autopilotPath = path.join(extension, 'extension/autopilot.js');
await writeFile(autopilotPath, (await readFile(autopilotPath, 'utf8'))
  .replace('chrome.tabs.create({url, active: true})', "chrome.tabs.create({url: 'about:blank', active: true})"));

const search = `<button id="open-search" onclick="document.querySelector('#search-panel').hidden=false">Search</button>
<section id="search-panel" role="dialog" hidden><input placeholder="Search" oninput="showResults(this.value)"><div id="results"></div></section>
<script>
function showResults(name) {
  document.body.dataset.query = name;
  document.querySelector('#results').innerHTML = '<a href="/explore/tags/test/">Tag</a><a href="https://instagram.com.evil.test/fake/">External</a>' +
    Array.from({length: 7}, (_, i) => '<a href="/user' + (i + 1) + '/">User ' + (i + 1) + '</a>').join('') + '<a href="/user1/">Duplicate</a>';
}
</script>`;
function fixture(url) {
  const pathname = new URL(url).pathname;
  const user = pathname.match(/^\/user(\d+)\/$/)?.[1];
  const post = /^\/(p|reel)\//.test(pathname);
  return `<!doctype html><html><body>${search}<nav><a href="/myself/">My profile</a></nav>
    ${post ? '<article>Opened post content</article>' : user ? `<main><header><h2>user${user}</h2><ul><li>10 posts</li><li><a href="/user${user}/followers/"><span title="1,234">1.2K</span> followers</a></li><li><a href="/user${user}/following/">56 following</a></li></ul><div class="biography">Bio for user ${user}. Contact user${user}@example.com</div><a href="mailto:user${user}@example.com">Email</a><a href="tel:+15551234567">Call</a><a href="https://example.com/user${user}">Website</a></header>${user === '2' ? 'This account is private' :
      `<a href="/p/user${user}a/">First post</a><a href="/reel/user${user}b/">Second post</a><a href="/p/user${user}c/">Third post</a>`}</main>` : '<main>Home</main>'}
    <button onclick="sessionStorage.setItem('engagement', 'clicked')">Like</button>
    <button onclick="sessionStorage.setItem('engagement', 'clicked')">Follow</button>
    <script>
    // One profile uses SPA post modals; the others use full document navigation.
    if (${user === '4'}) {
      document.querySelector('main').addEventListener('click', event => {
        const link = event.target.closest('a');
        if (!link) return;
        event.preventDefault(); history.pushState({}, '', link.href);
        const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog');
        dialog.innerHTML = '<article>Modal post content</article><button aria-label="Close" onclick="history.back()">Close</button>';
        document.body.append(dialog);
      });
      addEventListener('popstate', () => document.querySelector('[role=dialog]:not(#search-panel)')?.remove());
    }
    </script></body></html>`;
}
let context;
try {
  context = await chromium.launchPersistentContext(path.join(temp, 'profile'), {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  context.setDefaultTimeout(30000);
  await context.route(/^https:\/\/www\.instagram\.com\//, route => route.fulfill({contentType: 'text/html', body: fixture(route.request().url())}));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/extension/popup.html`);
  await popup.locator('#autopilot:not(:disabled)').waitFor();
  await popup.locator('#autopilotPlatform').selectOption('instagram');
  const getState = () => worker.evaluate(async () => (await chrome.storage.session.get('autopilot')).autopilot);
  async function start() {
    const opened = context.waitForEvent('page');
    await popup.locator('#autopilot').check();
    const page = await opened;
    await popup.locator('#autopilot:not(:disabled)').waitFor();
    const state = await getState();
    await page.goto(state.url);
    return {page, state};
  }
  const first = await start();
  await first.page.waitForURL('**/p/user1a/');
  await popup.locator('#autopilot').uncheck();
  const stoppedURL = first.page.url();
  await first.page.waitForTimeout(1000);
  assert.equal(first.page.url(), stoppedURL, 'stopping must cancel post navigation');
  assert.equal((await getState()).running, false);
  await first.page.close();

  // Clear the first stopped run's saved profile to verify a full new collection.
  await worker.evaluate(() => chrome.storage.local.remove('autopilotProfiles'));
  const {page, state} = await start();
  const visited = [];
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname); });
  // Survive an actual document reload midway through the saved profile sequence.
  await page.waitForURL('**/p/user1a/');
  await page.reload();
  await expect.poll(async () => (await getState()).name, {timeout: 30000}).not.toBe(state.name);
  await popup.locator('#autopilot').uncheck();
  assert.deepEqual([...new Set(visited.filter(value => /^\/user\d+\/$/.test(value)))],
    ['/user1/', '/user2/', '/user3/', '/user4/', '/user5/']);
  for (const user of [1, 3, 4, 5]) {
    assert.ok(visited.includes(`/p/user${user}a/`), `first post on profile ${user}`);
    assert.ok(visited.includes(`/reel/user${user}b/`), `second post on profile ${user}`);
  }
  assert.ok(!visited.some(value => /user[67]|user\dc|explore|myself/.test(value)), 'only five users and two posts per public profile');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('engagement')), null);
  assert.ok(await page.locator('input[placeholder="Search"]').isVisible(), 'return to search after browsing');
  const saved = await worker.evaluate(async () => (await chrome.storage.local.get('autopilotProfiles')).autopilotProfiles);
  assert.equal(saved.length, 5);
  assert.equal(saved[0].bio, 'Bio for user 1. Contact user1@example.com');
  assert.equal(saved[0].followers, 1234);
  assert.equal(saved[0].following, 56);
  assert.deepEqual(saved[0].contact.emails, ['user1@example.com']);
  assert.deepEqual(saved[0].contact.phones, ['+15551234567']);
  assert.deepEqual(saved[0].contact.links, ['https://example.com/user1']);
  assert.equal(saved[1].followers, 1234, 'private profile still captured');
  await expect(popup.locator('#profileCount')).toHaveText('5 saved · 5 ready to skip');
  const downloadPromise = popup.waitForEvent('download');
  await popup.locator('#exportProfiles').click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(backup.profiles.length, 5);
  await worker.evaluate(() => chrome.storage.local.remove('autopilotProfiles'));
  await popup.locator('#profileFile').setInputFiles({name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup))});
  await expect(popup.locator('#profileDataStatus')).toContainText('Upload complete: 5');
  await popup.locator('#profileFile').setInputFiles({name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"bad"}')});
  await expect(popup.locator('#profileDataStatus')).toContainText('Upload failed');
  const restored = await start();
  const reopened = [];
  restored.page.on('framenavigated', frame => { if (frame === restored.page.mainFrame()) reopened.push(new URL(frame.url()).pathname); });
  await expect.poll(async () => (await getState()).name, {timeout: 30000}).not.toBe(restored.state.name);
  await popup.locator('#autopilot').uncheck();
  assert.ok(!reopened.some(value => /^\/user\d+\/$/.test(value)), 'restored complete profiles skipped before visiting');
  console.log('Capture, backup download, restore, invalid import, and restored-profile skipping passed.');
  console.log('Instagram browser checks passed: five users, two posts, private profile skipping, full navigation, SPA modals, reload recovery, stop, and next name.');
} finally {
  await context?.close();
  await rm(temp, {recursive: true, force: true});
}
