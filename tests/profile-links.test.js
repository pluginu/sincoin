import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedProfile, parseProfiles} from '../extension/profile-links.js';
import {readFileSync} from 'node:fs';
const platforms = JSON.parse(readFileSync(new URL('../social-platforms.json', import.meta.url)));
test('extension allows direct profiles on exact approved HTTPS hosts', () => {
  for (const url of ['https://onlyfans.com/example', 'https://www.instagram.com/example', 'https://youtube.com/@example', 'https://pornhub.com/model/example']) assert.ok(approvedProfile(url), url);
  for (const url of ['https://example.org/person', 'http://onlyfans.com/example', 'https://onlyfans.com.evil.test/example', 'https://evil.onlyfans.com/example', 'https://onlyfans.com@evil.test/example', 'https://user:pass@onlyfans.com/example', 'javascript:alert(1)', 'https://onlyfans.com:8443/example', 'https://x.com/redirect?url=https://evil.test', 'https://youtube.com/redirect', 'https://instagram.com/accounts', 'https://x.com/%72edirect', 'https://x.com/example#redirect', 'https://x.com/example?next=evil', 'https://linktr.ee/example']) assert.equal(approvedProfile(url), null, url);
});
test('profiles preserve names, parse labeled handles, and discard unsupported links', () => {
  const [profile] = parseProfiles('Example, Person, ig: @example, onlyfans.com/example, https://evil.test', platforms);
  assert.equal(profile.name, 'Example Person');
  assert.deepEqual(profile.links.map(l => l.platform), ['Instagram', 'OnlyFans']);
});
