import {parseDirectory} from '../entertainer-links.js';
export const defaults = { enabled: true, includeNames: true, rules: [] };
export const modes = ['exact', 'contains', 'starts', 'ends', 'regex'];
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = '[\\p{L}\\p{N}_]';
export function parseNames(text) {
  return parseDirectory(text).map(record => record.name);
}
export function compileRule(rule) {
  if (!modes.includes(rule.mode)) throw new Error('Choose a valid matching mode.');
  if (typeof rule.value !== 'string' || !rule.value.trim()) throw new Error('Enter a keyword or expression.');
  if (rule.value.length > 500) throw new Error('Rules must be 500 characters or fewer.');
  let source = rule.mode === 'regex' ? rule.value : escape(rule.value.trim()).replace(/\s+/g, '\\s+');
  if (['exact', 'starts'].includes(rule.mode)) source = `(?<!${word})${source}`;
  if (['exact', 'ends'].includes(rule.mode)) source += `(?!${word})`;
  return new RegExp(source, rule.caseSensitive ? 'gu' : 'giu');
}
export function matchTexts(texts, rules, limit = 5000) {
  const compiled = rules.filter(rule => rule.enabled !== false).map(compileRule);
  let count = 0;
  return texts.map(text => {
    const ranges = [];
    for (const regex of compiled) {
      regex.lastIndex = 0;
      let match;
      while (count < limit && (match = regex.exec(text))) {
        if (!match[0].length) {
          regex.lastIndex += text.codePointAt(regex.lastIndex) > 0xffff ? 2 : 1;
          continue;
        }
        ranges.push([match.index, match.index + match[0].length]);
        count++;
      }
    }
    ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const merged = [];
    for (const range of ranges) {
      const last = merged.at(-1);
      if (last && range[0] < last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push(range);
    }
    return merged;
  });
}
