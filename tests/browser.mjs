import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {parseNames} from '../extension/matcher.js';
const temp = await mkdtemp(path.join(tmpdir(), 'sin-test-'));
const extension = path.join(temp, 'extension');
await cp('extension', path.join(extension, 'extension'), {recursive: true});
await cp('entertainer-links.js', path.join(extension, 'entertainer-links.js'));
await cp('social-platforms.json', path.join(extension, 'social-platforms.json'));
await cp('manifest.json', path.join(extension, 'manifest.json'));
await cp('entertainers.txt', path.join(extension, 'entertainers.txt'));
const server = createServer((req,res) => {res.setHeader('Content-Type','text/html'); const query = new URL(req.url, 'http://localhost').searchParams.get('q'); if (query) { res.end(`<!doctype html><p>${query.replace(/[<>&]/g, '')}</p>`); return; } res.end('<!doctype html><p>Angela <b>White</b>, Riley Reid, Joanna and Anna.</p><textarea>Angela White</textarea><div contenteditable="true">Riley Reid</div><div hidden>Stoya</div>');});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
// Point the copied extension at the local search fixture so newly created tabs
// cannot reach Google before Playwright attaches network interception.
const searchOrigin = `http://127.0.0.1:${server.address().port}`;
const autopilotPath = path.join(extension, 'extension/autopilot.js');
await writeFile(autopilotPath, (await readFile(autopilotPath, 'utf8')).replace('https://www.google.com/search?', `${searchOrigin}/search?`));
let context;
try {
  context = await chromium.launchPersistentContext(path.join(temp,'profile'), {channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  context.setDefaultTimeout(15000);
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const highlighted = () => page.evaluate(() => [...(CSS.highlights.get('sin-names') || [])].map(r => r.toString()));
  await page.waitForFunction(() => CSS.highlights.get('sin-names')?.size === 2);
  assert.deepEqual(await highlighted(), ['Angela White','Riley Reid']);
  await page.evaluate(() => { const p = document.createElement('p'); p.textContent = 'Stoya'; document.body.append(p); });
  await page.waitForFunction(() => CSS.highlights.get('sin-names')?.size === 3);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/extension/popup.html`);
  await popup.locator('#nameCount').filter({hasText: `${(await readFile('entertainers.txt', 'utf8')).trim().split(/\r?\n/).length} names`}).waitFor();
  // Seed a local fixture; no profile requests or navigation to external sites.
  await worker.evaluate(async () => {
    const {entertainerCache} = await chrome.storage.local.get('entertainerCache');
    await chrome.storage.local.set({entertainerCache: {...entertainerCache, profiles: [{name: 'Angela White', links: [
      {url: 'https://onlyfans.com/example'}, {url: 'https://instagram.com/example'},
      {url: 'https://onlyfans.com.evil.test/example'}, {url: 'https://x.com/redirect?url=https://evil.test'}
    ]}]}});
  });
  await page.waitForTimeout(600);
  await page.locator('b').hover();
  const card = page.locator('#sin-profile-popup');
  await card.getByRole('heading', {name: /Angela White/}).waitFor();
  assert.equal(await card.getByRole('link').count(), 2);
  const onlyfans = card.getByRole('link').filter({hasText: 'OnlyFans'});
  await onlyfans.hover();
  await page.waitForTimeout(350);
  assert.equal(await onlyfans.isVisible(), true);
  assert.equal(await onlyfans.getAttribute('href'), 'https://onlyfans.com/example');
  assert.equal(await onlyfans.getAttribute('rel'), 'noopener noreferrer');
  await page.keyboard.press('Escape');
  assert.equal(await card.isVisible(), false);
  await page.locator('b').hover();
  await card.waitFor({state: 'visible'});
  await popup.locator('#enabled').uncheck();
  await card.waitFor({state: 'hidden'});
  await page.waitForFunction(() => !CSS.highlights.has('sin-names'));
  await popup.locator('#enabled').check();
  await page.waitForFunction(() => CSS.highlights.get('sin-names')?.size === 3);
  await popup.locator('#value').fill('Joanna');
  await popup.locator('#save').click();
  await page.waitForFunction(() => CSS.highlights.get('sin-names')?.size === 4);
  assert.equal(await popup.locator('.rule').count(), 1);
  await popup.locator('.rule button').filter({hasText:'Edit'}).click();
  await popup.locator('#value').fill('Anna');
  await popup.locator('#save').click();
  await page.waitForFunction(() => [...(CSS.highlights.get('sin-names') || [])].some(r => r.toString() === 'Anna'));
  await popup.reload();
  await popup.locator('.rule strong').filter({hasText:'Anna'}).waitFor();
  await popup.locator('.rule button').filter({hasText:'Delete'}).click();
  await page.waitForFunction(() => CSS.highlights.get('sin-names')?.size === 3);
  await popup.locator('#mode').selectOption('regex');
  await popup.locator('#value').fill('[');
  await popup.locator('#save').click();
  await popup.locator('#error').filter({hasText:'Invalid regular expression'}).waitFor();
  // Apply downloaded names to verify cache notifications update open pages.
  const refreshNames = async text => worker.evaluate(async names => {
    const {entertainerCache} = await chrome.storage.local.get('entertainerCache');
    await chrome.storage.local.set({entertainerCache: {...entertainerCache, names, checkedAt: Date.now()}});
  }, parseNames(text));
  await refreshNames((await readFile('entertainers.txt','utf8')) + '\nRuntime, Person\n');
  await page.evaluate(() => { const p = document.createElement('p'); p.textContent = 'Runtime Person'; document.body.append(p); });
  await page.waitForFunction(() => [...(CSS.highlights.get('sin-names') || [])].some(r => r.toString() === 'Runtime Person'));
  // Removal must propagate from the cache notification with no DOM or settings change.
  await refreshNames(await readFile('entertainers.txt','utf8'));
  await page.waitForFunction(() => CSS.highlights.get('sin-names')?.size === 3, { }, {timeout: 35000});
  // Exercise the demo against local search fixtures.
  const demoOpened = context.waitForEvent('page');
  await popup.locator('#autopilot').check();
  const demo = await demoOpened;
  await demo.waitForFunction(() => CSS.highlights.get('sin-names')?.size > 0);
  const firstSearch = new URL(demo.url()).searchParams.get('q');
  await popup.locator('#autopilotStatus').filter({hasText: firstSearch}).waitFor();
  // Accelerate the real alarm to verify background wiring without a 30-second wait.
  await worker.evaluate(() => chrome.alarms.create('autopilot-next', {when: Date.now() + 100}));
  await demo.waitForURL(url => url.searchParams.get('q') !== firstSearch);
  await demo.waitForFunction(() => CSS.highlights.get('sin-names')?.size > 0);
  await popup.reload();
  await popup.locator('#autopilot:checked').waitFor();
  await popup.locator('#autopilot').uncheck();
  await popup.locator('#autopilotStatus').filter({hasText: 'Autopilot is off'}).waitFor();
  assert.equal(await worker.evaluate(() => chrome.alarms.get('autopilot-next')), undefined);
  await demo.close();
  const secondOpened = context.waitForEvent('page');
  await popup.locator('#autopilot').check();
  const secondDemo = await secondOpened;
  await secondDemo.waitForURL(`${searchOrigin}/search?**`);
  await secondDemo.waitForFunction(() => CSS.highlights.get('sin-names')?.size > 0);
  await secondDemo.close();
  await popup.locator('#autopilotStatus').filter({hasText: 'Autopilot is off'}).waitFor();
  // A pathological expression must be terminated without freezing the browsing page.
  await popup.locator('#mode').selectOption('regex');
  await popup.locator('#value').fill('(a+)+$');
  await popup.locator('#save').click();
  await page.bringToFront();
  await page.evaluate(() => {const p = document.createElement('p'); p.textContent = 'a'.repeat(100) + '!'; document.body.append(p);});
  await page.waitForTimeout(2200);
  const status = await popup.evaluate(async () => {
    for (const tab of await chrome.tabs.query({})) {
      try { return await chrome.tabs.sendMessage(tab.id, {type:'status'}); } catch {}
    }
  });
  assert.match(status.message, /timed out/);
  assert.equal(await page.evaluate(() => 2 + 2), 4);
  await popup.locator('.rule button').filter({hasText:'Delete'}).click();
  await page.waitForFunction(() => CSS.highlights.get('sin-names')?.size === 3);
  console.log('Browser checks passed: autopilot start/advance/stop/restart/tab closure, safe hover profile links, dismissal, full names, inline text, excluded fields, dynamic content, toggle, rule CRUD/persistence, validation, hosted list updates, regex timeout and recovery.');
} finally {
  await context?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(temp, {recursive:true,force:true});
}
