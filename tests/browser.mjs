import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, cp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const temp = await mkdtemp(path.join(tmpdir(), 'sin-test-'));
const extension = path.join(temp, 'extension');
await cp('extension', path.join(extension, 'extension'), {recursive: true});
await cp('manifest.json', path.join(extension, 'manifest.json'));
await cp('entertainers.txt', path.join(extension, 'entertainers.txt'));
const server = createServer((req,res) => {res.setHeader('Content-Type','text/html'); res.end('<!doctype html><p>Angela <b>White</b>, Riley Reid, Joanna and Anna.</p><textarea>Angela White</textarea><div contenteditable="true">Riley Reid</div><div hidden>Stoya</div>');});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let context;
try {
  context = await chromium.launchPersistentContext(path.join(temp,'profile'), {channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
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
  await popup.locator('#nameCount').filter({hasText:'50 names'}).waitFor();
  await popup.locator('#enabled').uncheck();
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
  const refreshNames = async text => worker.evaluate(async text => {
    const {entertainerCache} = await chrome.storage.local.get('entertainerCache');
    const names = text.split(/\r?\n/).map(line => line.split(',').map(part => part.trim()).filter(Boolean).join(' ')).filter(Boolean);
    await chrome.storage.local.set({entertainerCache: {...entertainerCache, names, checkedAt: Date.now()}});
  }, text);
  await refreshNames((await readFile('entertainers.txt','utf8')) + '\nRuntime, Person\n');
  await page.evaluate(() => { const p = document.createElement('p'); p.textContent = 'Runtime Person'; document.body.append(p); });
  await page.waitForFunction(() => [...(CSS.highlights.get('sin-names') || [])].some(r => r.toString() === 'Runtime Person'));
  // Removal must propagate from the cache notification with no DOM or settings change.
  await refreshNames(await readFile('entertainers.txt','utf8'));
  await page.waitForFunction(() => CSS.highlights.get('sin-names')?.size === 3, { }, {timeout: 35000});
  // A pathological expression must be terminated without freezing the browsing page.
  await popup.locator('#value').fill('(a+)+$');
  await popup.locator('#save').click();
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
  console.log('Browser checks passed: full names, inline text, excluded fields, dynamic content, toggle, rule CRUD/persistence, validation, hosted list updates, regex timeout and recovery.');
} finally {
  await context?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(temp, {recursive:true,force:true});
}
