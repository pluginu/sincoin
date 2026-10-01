export const AUTOPILOT_ALARM = 'autopilot-next';
const KEY = 'autopilot';
const idle = {running: false, tabId: null, name: '', index: -1};

// Session storage survives service-worker suspension without restarting a demo
// when the user opens a new browser session. Serialize timer and popup actions.
export function createAutopilot({chrome, readNames}) {
  let pending = Promise.resolve();
  const state = async () => (await chrome.storage.session.get(KEY))[KEY] || {...idle};
  const save = async value => { await chrome.storage.session.set({[KEY]: value}); return value; };
  async function stop(error = '') {
    await chrome.alarms.clear(AUTOPILOT_ALARM);
    return save({...idle, error});
  }
  async function pageState(sender) {
    const current = await state();
    return {active: !!(current.running && sender?.frameId === 0 &&
      sender.tab?.id === current.tabId && sender.url === current.url)};
  }
  async function advance(start = false) {
    const previous = await state();
    if (!start && !previous.running) return previous;
    if (start && previous.running) return previous;
    try {
      if (!start && previous.page < 3) {
        let result;
        try { result = await chrome.tabs.sendMessage(previous.tabId, {type: 'autopilot-next-page', url: previous.url}, {frameId: 0}); } catch {}
        if (result?.url) {
          const next = new URL(result.url), currentURL = new URL(previous.url);
          if (next.origin === currentURL.origin && next.pathname === '/search' &&
              next.searchParams.get('q') === previous.name &&
              Number(next.searchParams.get('start')) > Number(currentURL.searchParams.get('start') || 0)) {
            await chrome.tabs.update(previous.tabId, {url: next.href});
            const current = await save({...previous, url: next.href, page: previous.page + 1});
            await chrome.alarms.create(AUTOPILOT_ALARM, {delayInMinutes: 0.5});
            return current;
          }
        }
      }
      const names = await readNames();
      if (!names.length) throw new Error('The entertainer list is empty.');
      const index = start ? 0 : (previous.index + 1) % names.length;
      const name = names[index];
      const url = `https://www.google.com/search?${new URLSearchParams({q: name})}`;
      if (start) await chrome.storage.local.set({enabled: true, includeNames: true});
      const tab = start ? await chrome.tabs.create({url, active: true}) : await chrome.tabs.update(previous.tabId, {url});
      const current = await save({running: true, tabId: tab.id, name, index, url, page: 1, error: ''});
      await chrome.alarms.create(AUTOPILOT_ALARM, {delayInMinutes: 0.5});
      return current;
    } catch (error) {
      return stop(`Autopilot stopped: ${error.message}`);
    }
  }
  return function dispatch(action, tabId) {
    const run = async () => {
      if (action === 'page') return pageState(tabId);
      if (action === 'start') return advance(true);
      if (action === 'next') return advance();
      if (action === 'stop') return stop();
      if (action === 'removed' && (await state()).tabId === tabId) return stop();
      return state();
    };
    const result = pending.then(run);
    pending = result.catch(() => {});
    return result;
  };
}
