import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const server = createServer(async (req,res) => {
  const file = new URL(req.url,'http://localhost').pathname.slice(1) || 'index.html';
  try {
    const body = file === 'entertainers.txt' ? 'Example, Creator, x.com/example, instagram: @example, https://www.pornhub.com/model/example, https://example.org\nNo, Links\n' : await readFile(file);
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : file.endsWith('.html') ? 'text/html' : 'text/plain');
    res.end(body);
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror',error => errors.push(error.message));
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url);
  await page.locator('#names a').first().waitFor();
  assert.equal(await page.locator('#names a').count(),2);
  await page.getByRole('link',{name:'Example Creator',exact:true}).click();
  await page.locator('#detail-links a').first().waitFor();
  assert.equal(await page.locator('#detail-name').textContent(),'Example Creator');
  assert.equal(await page.locator('#detail-links a').count(),4);
  assert.equal(await page.locator('#detail-links .social-icon').count(),4);
  assert.equal(await page.locator('#detail-links a').first().getAttribute('href'),'https://x.com/example');
  await page.reload();
  await page.locator('#detail-links a').first().waitFor();
  assert.equal(await page.locator('#detail-links a').count(),4);
  await page.getByRole('link',{name:'← Back to directory'}).click();
  await page.getByRole('link',{name:'No Links',exact:true}).click();
  await page.locator('#detail-message').filter({hasText:'No links have been listed'}).waitFor();
  await page.goto(url+'#entertainer=Missing');
  await page.getByRole('heading',{name:'Entertainer not found'}).waitFor();
  await page.setViewportSize({width:375,height:812});
  await page.goto(url+'#entertainer=Example%20Creator');
  await page.locator('#detail-links a').first().waitFor();
  await page.locator('summary').click();
  assert.equal(await page.locator('#supported-platforms li').count(),60);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('Directory browser checks passed: icons, URLs, empty profiles, deep links, missing names, supported platforms, mobile overflow.');
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
