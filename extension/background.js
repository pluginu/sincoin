import {approvedProfile} from './profile-links.js';
import { defaults } from './matcher.js';
import { createNameLoader } from './names.js';
import {createAutopilot, AUTOPILOT_ALARM} from './autopilot.js';
const platforms = fetch(chrome.runtime.getURL('social-platforms.json')).then(response => response.json());
let creating;
const readNames = createNameLoader({storage: chrome.storage.local, fetch, platforms, bundledURL: chrome.runtime.getURL('entertainers.txt')});
const autopilot = createAutopilot({chrome, readNames});
chrome.tabs.onRemoved.addListener(tabId => autopilot('removed', tabId).catch(console.error));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.enabled?.newValue === false || changes.includeNames?.newValue === false)) autopilot('stop').catch(console.error);
});
const refreshAlarm = 'refresh-entertainers';
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === refreshAlarm) readNames().catch(console.error);
  if (alarm.name === AUTOPILOT_ALARM) autopilot('next').catch(console.error);
});
async function initializeNames() {
  // Reuse the persisted alarm when Chrome restarts the service worker.
  if (!await chrome.alarms.get(refreshAlarm)) {
    await chrome.alarms.create(refreshAlarm, {periodInMinutes: 15});
  }
  await readNames();
}
chrome.runtime.onStartup.addListener(() => initializeNames().catch(console.error));
chrome.runtime.onInstalled.addListener(() => initializeNames().catch(console.error));
initializeNames().catch(console.error);
async function offscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!creating) creating = chrome.offscreen.createDocument({url: 'extension/offscreen.html', reasons: ['WORKERS'], justification: 'Run text matching in a worker that can be stopped if a regex takes too long.'}).finally(() => { creating = null; });
  await creating;
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.target === 'offscreen') return;
  if (message.type === 'autopilot-page') {
    autopilot('page', sender).then(reply).catch(() => reply({active: false}));
    return true;
  }
  if (message.type === 'autopilot' && sender.url === chrome.runtime.getURL('extension/popup.html')) {
    const action = ['start', 'stop'].includes(message.action) ? message.action : 'status';
    autopilot(action).then(reply).catch(e => reply({error: e.message}));
    return true;
  }
  if (message.type === 'config') {
    Promise.all([chrome.storage.local.get(defaults), readNames()]).then(([settings, names]) => reply({settings, names})).catch(e => reply({error: e.message}));
    return true;
  }
  if (message.type === 'match') {
    (async () => {
      const settings = await chrome.storage.local.get(defaults);
      if (!settings.enabled) return {ranges: []};
      const rules = [...(settings.includeNames ? (await readNames()).map(value => ({value, mode: 'exact'})) : []), ...settings.rules];
      const {entertainerCache} = await chrome.storage.local.get('entertainerCache');
      const profiles = settings.includeNames ? (entertainerCache?.profiles || []).map(p => ({name: p.name, links: p.links.map(link => approvedProfile(link.url)).filter(Boolean)})).filter(p => p.links.length) : [];
      await offscreen();
      return chrome.runtime.sendMessage({target: 'offscreen', texts: message.texts, rules, profiles});
    })().then(reply).catch(e => reply({error: e.message}));
    return true;
  }
});
