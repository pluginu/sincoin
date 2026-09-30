import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {parseLine, parseDirectory, platformFor} from '../entertainer-links.js';
import {parseNames} from '../extension/matcher.js';
const platforms = JSON.parse(readFileSync('social-platforms.json'));

test('Python and browser agree on every supported handle template and URL', () => {
  const lines = platforms.map(p => `Example, Creator, ${p.domains[0]}/some/profile?x=1&y=2${p.profile ? `, ${p.aliases[0]}: @example` : ''}`);
  lines.push('Example Creator, twitter.com/Example, https://example.org/path?q=yes#part');
  const python = JSON.parse(execFileSync('python3', ['-c', 'import json,sys; from entertainer_links import parse_line; print(json.dumps([parse_line(s) for s in json.load(sys.stdin)]))'], {input:JSON.stringify(lines)}));
  lines.forEach((line, i) => {
    const record = parseLine(line, platforms);
    assert.deepEqual([record.name, record.links], python[i]);
    assert.deepEqual(record.issues, []);
  });
});
test('merge by name, keep distinct links, and exclude links from extension names', () => {
  const input = 'Example, Creator, x.com/example\nexample creator, instagram: @example';
  const records = parseDirectory(input, platforms);
  assert.equal(records.length, 1);
  assert.equal(records[0].links.length, 2);
  assert.deepEqual(parseNames(input), ['Example Creator']);
  const dir = mkdtempSync(join(tmpdir(), 'sin-merge-'));
  try {
    const main = join(dir,'main.txt'), incoming = join(dir,'new.txt');
    writeFileSync(main, 'Example, Creator, twitter.com/example\n');
    writeFileSync(incoming, '1. example creator, x.com/example, instagram: @example\n2) New Name, example.org\n');
    execFileSync('python3',['merge_entertainers.py', incoming, '--main', main]);
    const saved = readFileSync(main,'utf8');
    assert.equal(saved, 'Example, Creator, https://x.com/example, https://instagram.com/example\nNew, Name, https://example.org/\n');
    execFileSync('python3',['merge_entertainers.py', incoming, '--main', main]);
    assert.equal(readFileSync(main,'utf8'), saved);
    writeFileSync(incoming, 'Bad Name, @ambiguous\n');
    assert.equal(spawnSync('python3',['merge_entertainers.py', incoming, '--main', main]).status, 1);
    assert.equal(readFileSync(main,'utf8'), saved);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
test('unsafe URLs are excluded; ambiguous handles are reported; exact domains identify platforms', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html', 'https://user:pass@example.com', '@unknown', 'pornhub: @example']) {
    const result = parseLine(`Example, ${value}`, platforms);
    assert.equal(result.links.length, 0);
    assert.equal(result.name, 'Example');
    assert.equal(result.issues.length, 1);
  }
  assert.equal(platformFor('https://www.pornhub.com/model/example', platforms).name, 'Pornhub');
  assert.equal(platformFor('https://onlyfans.com.evil.example/user', platforms).name, 'onlyfans.com.evil.example');
});
