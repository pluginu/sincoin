import { defaults, parseNames } from './matcher.js';
let creating;
async function readNames() {
  const response = await fetch(chrome.runtime.getURL('entertainers.txt'), {cache: 'no-store'});
  if (!response.ok) throw new Error('Unable to read entertainers.txt.');
  return parseNames(await response.text());
}
async function offscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!creating) creating = chrome.offscreen.createDocument({url: 'extension/offscreen.html', reasons: ['WORKERS'], justification: 'Run text matching in a worker that can be stopped if a regex takes too long.'}).finally(() => { creating = null; });
  await creating;
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.target === 'offscreen') return;
  if (message.type === 'config') {
    Promise.all([chrome.storage.local.get(defaults), readNames()]).then(([settings, names]) => reply({settings, names})).catch(e => reply({error: e.message}));
    return true;
  }
  if (message.type === 'match') {
    (async () => {
      const settings = await chrome.storage.local.get(defaults);
      if (!settings.enabled) return {ranges: []};
      const rules = [...(settings.includeNames ? (await readNames()).map(value => ({value, mode: 'exact'})) : []), ...settings.rules];
      await offscreen();
      return chrome.runtime.sendMessage({target: 'offscreen', texts: message.texts, rules});
    })().then(reply).catch(e => reply({error: e.message}));
    return true;
  }
});
